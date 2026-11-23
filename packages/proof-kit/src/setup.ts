// This file is part of krnightforce.
// Copyright (C) krnightforce contributors
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
	type Assignment,
	type CircuitSpec,
	type Compiled,
	PK,
	Runner,
	type SetupCall,
} from "./harness.js";
import { type CType, typeToString } from "./types.js";
import { type Value, baseLeafValue, leaves, prng, setLeaf } from "./values.js";

/**
 * Zero-config setup search. Contracts often reject a call unless the deployment is
 * consistent with the caller's secrets (an owner commitment passed to the constructor)
 * or an earlier call created some state (a registered passport). This module only looks
 * for a starting point where the base run succeeds; it never decides a verdict.
 */

export interface CtorPlan {
	label: string;
	plan: (a: Assignment) => Value[];
}

export interface Setup {
	runner: Runner;
	constructor: string;
	prefixes: Map<string, SetupCall[]>;
}

export function hashName(s: string): number {
	let h = 0;
	for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return h;
}

/** Base argument values of a circuit. Consumes `rnd` the same way every time. */
export function baseArgs(circuit: CircuitSpec, rnd: () => number): Value[] {
	return circuit.args.map((spec) => {
		let v: Value = spec.type.kind === "vector" ? [] : spec.type.kind === "struct" ? {} : null;
		for (const leaf of leaves(spec.type)) {
			const lv = baseLeafValue(leaf, spec.name, rnd);
			v = leaf.path.length === 0 ? lv : setLeaf(v, leaf.path, lv);
		}
		return v;
	});
}

export function unitSeed(seed: number, name: string): number {
	return seed * 7919 + hashName(name);
}

const key = (t: CType) => typeToString(t);

function pkBytes(): Uint8Array {
	return Uint8Array.from(Buffer.from(PK, "hex"));
}

/** Ways to fill one constructor argument from the caller's own values. */
function derivations(c: Compiled, t: CType): { label: string; fn: (a: Assignment) => Value }[] {
	const out: { label: string; fn: (a: Assignment) => Value }[] = [];
	for (const p of c.pureFns) {
		if (key(p.result) !== key(t)) continue;
		for (const w of c.witnesses) {
			if (key(w.type) === key(p.arg))
				out.push({ label: `${p.name}(${w.name}())`, fn: (a) => p.fn(a.witnesses[w.name]) });
		}
	}
	if (t.kind === "bytes" && t.length === 32) {
		const B32 = new c.rt.CompactTypeBytes(32);
		for (const w of c.witnesses) {
			if (w.type.kind === "bytes" && w.type.length === 32) {
				out.push({
					label: `persistentHash(${w.name}())`,
					fn: (a) => c.rt.persistentHash(B32, a.witnesses[w.name]),
				});
			}
		}
		out.push({ label: "ownPublicKey bytes", fn: () => pkBytes() });
	}
	if (t.kind === "struct" && t.fields.length === 1 && t.fields[0].name === "bytes") {
		out.push({ label: "ownPublicKey()", fn: () => ({ bytes: pkBytes() }) });
	}
	for (const w of c.witnesses) {
		if (key(w.type) === key(t)) out.push({ label: `${w.name}()`, fn: (a) => a.witnesses[w.name] });
	}
	// Constructors often bound counts and sizes (e.g. "two to five candidates").
	if (t.kind === "uint") {
		for (const n of [2n, 3n, 1n, 0n, 5n, 10n, 100n])
			if (n <= t.max) out.push({ label: `${n}`, fn: () => n });
	}
	return out;
}

export function ctorPlans(c: Compiled): CtorPlan[] {
	const defaults = c.constructorArgs.map((x) => x.value);
	const plans: CtorPlan[] = [{ label: "defaults", plan: () => defaults }];
	const perArg = c.constructorArgs.map((x) => derivations(c, x.type));
	// Every argument that has a derivation takes its first one.
	if (perArg.some((d) => d.length > 0)) {
		plans.push({
			label: perArg
				.map((d, i) => (d[0] ? `arg${i + 1}=${d[0].label}` : null))
				.filter(Boolean)
				.join(", "),
			plan: (a) => defaults.map((v, i) => (perArg[i][0] ? perArg[i][0].fn(a) : v)),
		});
	}
	// One argument at a time, every derivation.
	perArg.forEach((ds, i) => {
		for (const d of ds) {
			plans.push({
				label: `arg${i + 1}=${d.label}`,
				plan: (a) => defaults.map((v, j) => (j === i ? d.fn(a) : v)),
			});
		}
	});
	return plans.slice(0, 48);
}

/** Pick the constructor plan under which the most units run, then a setup call for the rest. */
export async function chooseSetup(c: Compiled, seed: number): Promise<Setup> {
	const base = (_r: Runner, circuit: CircuitSpec): Assignment => ({
		witnesses: {},
		args: baseArgs(circuit, prng(unitSeed(seed, circuit.name))),
	});
	let best: { runner: Runner; label: string; ok: Set<string> } | null = null;
	for (const p of ctorPlans(c)) {
		const runner = new Runner(c, p.plan);
		const ok = new Set<string>();
		if ((await runner.observeConstructor({ witnesses: {}, args: [] })).ok) ok.add("<constructor>");
		for (const circuit of c.circuits) {
			if ((await runner.observeCall(circuit, base(runner, circuit))).ok) ok.add(circuit.name);
		}
		if (!best || ok.size > best.ok.size) best = { runner, label: p.label, ok };
		if (ok.size === c.circuits.length + 1) break;
	}
	const chosen = best as { runner: Runner; label: string; ok: Set<string> };
	const prefixes = new Map<string, SetupCall[]>();
	const ready = c.circuits.filter((x) => chosen.ok.has(x.name));
	for (const circuit of c.circuits) {
		if (chosen.ok.has(circuit.name)) continue;
		for (const s of ready) {
			const prefix = [{ circuit: s.name, args: base(chosen.runner, s).args }];
			if ((await chosen.runner.observeCall(circuit, base(chosen.runner, circuit), prefix)).ok) {
				prefixes.set(circuit.name, prefix);
				break;
			}
		}
	}
	chosen.runner.runs = 0;
	return { runner: chosen.runner, constructor: chosen.label, prefixes };
}
