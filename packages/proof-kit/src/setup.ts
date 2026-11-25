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
	ArgRef,
	type Assignment,
	type CircuitSpec,
	type Compiled,
	type Observation,
	PK,
	Runner,
	type SetupCall,
	type WitnessRelation,
} from "./harness.js";
import { type CType, typeToString } from "./types.js";
import { type Value, baseLeafValue, leaves, prng, same, setLeaf, show } from "./values.js";

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
	/** Witness relations the setup assumed, e.g. "owner_key = ownerKeyOf(owner_secret())". */
	witnesses: string[];
	/** Base argument values the search chose for a circuit whose defaults did not run. */
	args: Map<string, Value[]>;
	/** Base witness values chosen instead of the defaults, e.g. "points = 5000 (base value)". */
	overrides: string[];
}

/** Hints for the search: numeric literals in the source (boundary values). */
export interface SetupOptions {
	constants?: bigint[];
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

/** Ways one witness can be a function of another: a pure circuit, or persistentHash. */
export function witnessRelations(c: Compiled): WitnessRelation[] {
	const out: WitnessRelation[] = [];
	for (const b of c.witnesses) {
		for (const a of c.witnesses) {
			if (a === b) continue;
			for (const p of c.pureFns) {
				if (key(p.arg) === key(a.type) && key(p.result) === key(b.type))
					out.push({ target: b.name, source: a.name, label: `${p.name}(${a.name}())`, fn: p.fn });
			}
			const isB32 = (t: CType) => t.kind === "bytes" && t.length === 32;
			if (isB32(a.type) && isB32(b.type)) {
				const B32 = new c.rt.CompactTypeBytes(32);
				out.push({
					target: b.name,
					source: a.name,
					label: `persistentHash(${a.name}())`,
					fn: (x) => c.rt.persistentHash(B32, x),
				});
			}
		}
	}
	return out;
}

interface Attempt {
	runner: Runner;
	label: string;
	ok: Set<string>;
	prefixes: Map<string, SetupCall[]>;
	/** Base arguments chosen for circuits whose default arguments did not run. */
	args: Map<string, Value[]>;
	/** Circuits that still cannot run, with or without setup calls. */
	missing: number;
	/** Witnesses those circuits read before failing. */
	reads: Set<string>;
	/** The lone base run (error, hash outputs) of each circuit that still cannot run. */
	lone: Map<string, Observation>;
	/** For each circuit that still cannot run, the partial setups that got it furthest. */
	hints: Map<string, Hint[]>;
}

/** A partial setup: setup calls and the circuit's arguments, with what the run did. */
interface Hint {
	prefix: SetupCall[];
	args: Value[];
	obs: Observation;
}

/** Whether a runner lets the circuit of a hint run, or fail differently. */
async function moves(
	runner: Runner,
	circuit: CircuitSpec,
	h: Hint,
): Promise<"ok" | "moved" | "same"> {
	const o = await runner.observeCall(circuit, { witnesses: {}, args: h.args }, h.prefix);
	if (o.ok) return "ok";
	return o.error !== h.obs.error ? "moved" : "same";
}

/**
 * Whether relations (and overrides) let a still-missing circuit run after the setup
 * calls that got it furthest before: a cheap screen before a full attempt.
 */
async function screen(
	S: Search,
	best: Attempt,
	plan: CtorPlan[],
	relations: WitnessRelation[],
	overrides: Record<string, Value>,
): Promise<boolean> {
	const runner = new Runner(S.c, plan[0]?.plan, relations, overrides);
	for (const [name, hs] of best.hints) {
		for (const h of hs) if ((await moves(runner, byName(S, name), h)) === "ok") return true;
	}
	return false;
}

interface Search {
	c: Compiled;
	seed: number;
	constants: bigint[];
	/** Runs allowed per missing circuit in the setup-call search. */
	budget: number;
	/** Most setup calls before the attacked one. */
	depth: number;
}

/**
 * Pick the constructor plan under which the most units run, then setup calls for the
 * rest. When circuits still cannot run, widen in steps, keeping a step only if fewer
 * circuits are missing:
 * 1. a constructor argument taken from a hash or commitment a failing circuit computes
 *    (a commitment fixed at deployment and revealed later);
 * 2. a base value for a numeric witness from the source's constants (a threshold);
 * 3. one witness made a function of another (greedily, up to three relations): a
 *    contract that stores `ownerKeyOf(secret)` and recomputes it later needs both to agree.
 * Setup calls themselves are searched up to three deep (see `solve`).
 */
export async function chooseSetup(
	c: Compiled,
	seed: number,
	options: SetupOptions = {},
): Promise<Setup> {
	const S: Search = { c, seed, constants: options.constants ?? [], budget: 200, depth: 3 };
	let best = await attempt(S, ctorPlans(c), [], {});
	let plan = ctorPlans(c).filter((p) => p.label === best.label);
	const relations: WitnessRelation[] = [];
	const overrides: Record<string, Value> = {};

	// 1. Constructor arguments from values a failing circuit computes.
	if (best.missing > 0 && plan.length > 0) {
		const step = await ctorFromLogs(S, best, plan[0]);
		if (step) {
			best = step.a;
			plan = [step.plan];
		}
	}
	// 2. Base witness values that pass a check, greedily, at most two.
	for (let i = 0; i < 2 && best.missing > 0; i++) {
		const step = await witnessOverride(S, best, plan, relations, overrides);
		if (!step) break;
		overrides[step.name] = step.value;
		best = step.a;
	}
	// 3. Witness relations.
	while (best.missing > 0 && relations.length < 3) {
		// Try sources the failing circuits read first: a member circuit that recomputes
		// ownerKeyOf(owner_secret()) reads owner_secret, not the operator's secret.
		const reads = best.reads;
		const all = witnessRelations(c).sort(
			(x, y) => Number(reads.has(y.source)) - Number(reads.has(x.source)),
		);
		// Two sources can both unblock the base runs when their default values happen to
		// be equal (every secret Bytes<32> starts from the same value). So a relation must
		// also show that the target follows the source: with the source changed, the newly
		// runnable circuits still run. Verified relations win; one that cannot be checked
		// (no other value to try) is a fallback; one that fails the check is dropped.
		let step: { a: Attempt; r: WitnessRelation } | null = null;
		let fallback: { a: Attempt; r: WitnessRelation } | null = null;
		// Screening each relation with one setup call and a small budget is enough to see
		// whether it unblocks anything; the chosen one is redone with the full search.
		const quick: Search = { ...S, budget: 16, depth: 1 };
		for (const r of all) {
			// One relation per target, and no cycles through earlier relations.
			if (relations.some((x) => x.target === r.target || x.source === r.target)) continue;
			if (relations.some((x) => x.target === r.source)) continue;
			if (r.target in overrides) continue;
			if (!(await screen(S, best, plan, [...relations, r], overrides))) continue;
			const a = await attempt(quick, plan, [...relations, r], overrides);
			if (a.missing >= best.missing) continue;
			const verdict = await follows(S, a, best, r);
			if (verdict === false) continue;
			if (verdict === null) {
				if (a.missing < (fallback?.a.missing ?? best.missing)) fallback = { a, r };
				continue;
			}
			if (a.missing < (step?.a.missing ?? best.missing)) step = { a, r };
			if (step?.a.missing === 0) break;
		}
		step ??= fallback;
		if (!step) break;
		relations.push(step.r);
		// Redo the chosen relation with the full search budget.
		const full = await attempt(S, plan, relations, overrides);
		best = full.missing <= step.a.missing ? full : step.a;
	}
	best.runner.runs = 0;
	return {
		runner: best.runner,
		constructor: best.label,
		prefixes: best.prefixes,
		witnesses: relations.map((r) => `${r.target} = ${r.label}`),
		args: best.args,
		overrides: Object.entries(overrides).map(([k, v]) => `${k} = ${show(v)} (base value)`),
	};
}

function runnable(x: Attempt, name: string): boolean {
	return x.ok.has(name) || x.prefixes.has(name) || x.args.has(name);
}

/** Another value of the same type as `base`, or undefined when there is none to try. */
function otherValue(t: CType, base: Value, rnd: () => number): Value | undefined {
	if (t.kind === "bytes") {
		const out = new Uint8Array(t.length);
		do for (let i = 0; i < t.length; i++) out[i] = Math.floor(rnd() * 256);
		while (same(out, base));
		return out;
	}
	if (t.kind === "uint") {
		const b = base as bigint;
		if (b > 0n) return b - 1n;
		return t.max > 0n ? 1n : undefined;
	}
	if (t.kind === "field") return (base as bigint) + 1n;
	if (t.kind === "boolean") return !(base as boolean);
	return undefined;
}

const baseOf = (S: Search, circuit: CircuitSpec): Value[] =>
	baseArgs(circuit, prng(unitSeed(S.seed, circuit.name)));

/**
 * Whether the target of relation `r` really follows its source: run every circuit that
 * `r` made runnable with the source set to another value. True if all still run, false
 * if one fails, null if no other source value can be built.
 */
async function follows(
	S: Search,
	a: Attempt,
	before: Attempt,
	r: WitnessRelation,
): Promise<boolean | null> {
	const w = S.c.witnesses.find((x) => x.name === r.source);
	if (!w) return null;
	const alt = otherValue(w.type, a.runner.defaultWitness(r.source), prng(S.seed * 31 + 7));
	if (alt === undefined) return null;
	const newly = S.c.circuits.filter((x) => runnable(a, x.name) && !runnable(before, x.name));
	if (newly.length === 0) return null;
	for (const circuit of newly) {
		const o = await a.runner.observeCall(
			circuit,
			{ witnesses: { [r.source]: alt }, args: a.args.get(circuit.name) ?? baseOf(S, circuit) },
			a.prefixes.get(circuit.name) ?? [],
		);
		if (!o.ok) return false;
	}
	return true;
}

async function attempt(
	S: Search,
	plans: CtorPlan[],
	relations: WitnessRelation[],
	overrides: Record<string, Value>,
): Promise<Attempt> {
	const { c } = S;
	let best: { runner: Runner; label: string; ok: Set<string> } | null = null;
	for (const p of plans) {
		const runner = new Runner(c, p.plan, relations, overrides);
		const ok = new Set<string>();
		if ((await runner.observeConstructor({ witnesses: {}, args: [] })).ok) ok.add("<constructor>");
		for (const circuit of c.circuits) {
			if ((await runner.observeCall(circuit, { witnesses: {}, args: baseOf(S, circuit) })).ok)
				ok.add(circuit.name);
		}
		if (!best || ok.size > best.ok.size) best = { runner, label: p.label, ok };
		if (ok.size === c.circuits.length + 1) break;
	}
	const chosen = best as { runner: Runner; label: string; ok: Set<string> };
	const prefixes = new Map<string, SetupCall[]>();
	const args = new Map<string, Value[]>();
	const lone = new Map<string, Observation>();
	const hints = new Map<string, Hint[]>();
	let missing = 0;
	const reads = new Set<string>();
	for (const circuit of c.circuits) {
		if (chosen.ok.has(circuit.name)) continue;
		const r = await solve(S, chosen.runner, circuit, reads);
		if (r.found) {
			if (r.prefix.length > 0) prefixes.set(circuit.name, r.prefix);
			if (r.args) args.set(circuit.name, r.args);
		} else {
			missing++;
			lone.set(circuit.name, r.lone);
			hints.set(circuit.name, r.hints);
		}
	}
	if (!chosen.ok.has("<constructor>")) missing++;
	return { ...chosen, prefixes, args, missing, reads, lone, hints };
}

const isB32 = (t: CType) => t.kind === "bytes" && t.length === 32;
const isNum = (t: CType) => t.kind === "uint" || t.kind === "field";

/** Whether a raw hash/commitment output can stand in for a value of type `t`. */
function fitsType(t: CType, v: unknown): boolean {
	if (isB32(t)) return v instanceof Uint8Array && v.length === 32;
	if (t.kind === "field") return typeof v === "bigint";
	return false;
}

/** Candidate numeric values: 0, 1, the source's constants and their neighbours, the max. */
function numericCandidates(S: Search, t: CType, base: Value): bigint[] {
	const max = t.kind === "uint" ? t.max : null;
	const out: bigint[] = [];
	const add = (n: bigint) => {
		if (n < 0n || (max !== null && n > max) || n === base || out.includes(n)) return;
		out.push(n);
	};
	add(0n);
	add(1n);
	for (const k of S.constants) {
		add(k);
		add(k + 1n);
		add(k - 1n);
	}
	if (max !== null) add(max);
	return out.slice(0, 40);
}

/**
 * Variants of a setup call's arguments: the base values, numbers at their maximum, and
 * for each 32-byte or field argument, a value the attacked circuit computes (its n-th
 * hash or commitment output) or a function of a witness. The last two are ArgRefs,
 * resolved per run so they follow the attacked assignment.
 */
function setupArgVariants(S: Search, s: CircuitSpec, targetLog: unknown[]): Value[][] {
	const base = baseOf(S, s);
	const out: Value[][] = [base];
	const atMax = base.map((v, i) =>
		s.args[i].type.kind === "uint" ? (s.args[i].type as { max: bigint }).max : v,
	);
	if (!atMax.every((v, i) => same(v, base[i]))) out.push(atMax);
	s.args.forEach((spec, i) => {
		const t = spec.type;
		const put = (ref: ArgRef) => out.push(base.map((v, j) => (j === i ? ref : v)));
		targetLog.slice(0, 8).forEach((v, k) => {
			if (fitsType(t, v)) put(new ArgRef(`output #${k} of the attacked circuit`, { log: k }));
		});
		for (const w of S.c.witnesses) {
			if (key(w.type) === key(t)) put(new ArgRef(`${w.name}()`, { witness: w.name, fn: (x) => x }));
			for (const p of S.c.pureFns) {
				if (key(p.arg) === key(w.type) && key(p.result) === key(t))
					put(new ArgRef(`${p.name}(${w.name}())`, { witness: w.name, fn: p.fn }));
			}
		}
	});
	return out.slice(0, 24);
}

type Solved =
	| { found: true; prefix: SetupCall[]; args?: Value[] }
	| { found: false; lone: Observation; hints: Hint[] };

/**
 * Find a way to run one circuit: alone with other numeric arguments, then after up to
 * three setup calls. A setup call is kept for extension when it ran and the attacked
 * circuit then failed differently or computed more (progress), or at least the call
 * changed state; failing setup calls are dropped. Bounded by `S.budget` runs.
 */
async function solve(
	S: Search,
	runner: Runner,
	circuit: CircuitSpec,
	reads: Set<string>,
): Promise<Solved> {
	const base = baseOf(S, circuit);
	const lone = await runner.observeCall(circuit, { witnesses: {}, args: base });
	for (const w of lone.calledInCircuit) reads.add(w);
	let budget = S.budget;
	// Other numeric values of the attacked circuit's own top-level arguments.
	const argVariants: Value[][] = [];
	circuit.args.forEach((spec, i) => {
		if (!isNum(spec.type)) return;
		for (const n of numericCandidates(S, spec.type, base[i]))
			argVariants.push(base.map((v, j) => (j === i ? n : v)));
	});
	type Node = { prefix: SetupCall[]; obs: Observation; progress: boolean };
	let frontier: Node[] = [{ prefix: [], obs: lone, progress: true }];
	// Partial setups that got the circuit further, deepest last: hints for the later
	// steps (constructor values, base witness values, relations).
	const progressed: Hint[] = [{ prefix: [], args: base, obs: lone }];
	const fail = (): Solved => ({ found: false, lone, hints: progressed.slice(-6) });
	for (let depth = 0; depth <= S.depth; depth++) {
		for (const node of frontier.slice(0, 3)) {
			for (const args of argVariants.slice(0, 16)) {
				if (budget-- <= 0) return fail();
				const o = await runner.observeCall(circuit, { witnesses: {}, args }, node.prefix);
				for (const w of o.calledInCircuit) reads.add(w);
				if (!o.ok && o.error !== node.obs.error)
					progressed.push({ prefix: node.prefix, args, obs: o });
				if (o.ok)
					return {
						found: true,
						prefix: await bindToWitnesses(S, runner, circuit, node.prefix, args),
						args,
					};
			}
		}
		if (depth === S.depth) break;
		const next: Node[] = [];
		for (const node of frontier) {
			for (const s of S.c.circuits) {
				if (s === circuit) continue;
				for (const sargs of setupArgVariants(S, s, node.obs.targetLog)) {
					if (budget-- <= 0) return fail();
					const prefix = [...node.prefix, { circuit: s.name, args: sargs }];
					const o = await runner.observeCall(circuit, { witnesses: {}, args: base }, prefix);
					for (const w of o.calledInCircuit) reads.add(w);
					if (o.ok)
						return { found: true, prefix: await bindToWitnesses(S, runner, circuit, prefix, base) };
					if ((o.error ?? "").startsWith("setup ")) continue;
					const progress =
						o.error !== node.obs.error || o.targetLog.length > node.obs.targetLog.length;
					next.push({ prefix, obs: o, progress });
				}
			}
		}
		// Keep the calls that made progress first; drop repeats of the same outcome.
		const seen = new Set<string>();
		frontier = next
			.sort((x, y) => Number(y.progress) - Number(x.progress))
			.filter((n) => {
				const k = `${n.progress}|${n.obs.error}|${n.prefix.map((p) => p.circuit).join(",")}`;
				if (seen.has(k)) return false;
				seen.add(k);
				return true;
			})
			.slice(0, 4);
		for (const n of frontier)
			if (n.progress) progressed.push({ prefix: n.prefix, args: base, obs: n.obs });
		if (frontier.length === 0) break;
	}
	return fail();
}

/**
 * A numeric setup argument that equals a witness's base value is often that witness in
 * the real flow (an issuer records the salary the employee later proves). Make it follow
 * the witness, so the attack can vary the witness without breaking the setup; keep the
 * change only if the base run still passes.
 */
async function bindToWitnesses(
	S: Search,
	runner: Runner,
	circuit: CircuitSpec,
	prefix: SetupCall[],
	base: Value[],
): Promise<SetupCall[]> {
	let cur = prefix;
	for (let i = 0; i < cur.length; i++) {
		const spec = byName(S, cur[i].circuit);
		for (let j = 0; j < cur[i].args.length; j++) {
			const v = cur[i].args[j];
			const t = spec.args[j]?.type;
			if (!t || !isNum(t) || v instanceof ArgRef) continue;
			for (const w of S.c.witnesses) {
				if (key(w.type) !== key(t) || !same(runner.defaultWitness(w.name), v)) continue;
				const ref = new ArgRef(`${w.name}()`, { witness: w.name, fn: (x) => x });
				const cand = cur.map((p, k) =>
					k === i ? { circuit: p.circuit, args: p.args.map((x, m) => (m === j ? ref : x)) } : p,
				);
				if ((await runner.observeCall(circuit, { witnesses: {}, args: base }, cand)).ok) {
					cur = cand;
					break;
				}
			}
		}
	}
	return cur;
}

const byName = (S: Search, name: string) =>
	S.c.circuits.find((x) => x.name === name) as CircuitSpec;

/**
 * Constructor arguments from values a failing circuit computes: a contract that commits
 * to a secret at deployment and checks the reveal later needs the constructor to receive
 * exactly the commitment the reveal computes. Kept only if fewer circuits miss.
 */
async function ctorFromLogs(
	S: Search,
	best: Attempt,
	plan: CtorPlan,
): Promise<{ a: Attempt; plan: CtorPlan } | null> {
	const types = S.c.constructorArgs.map((x) => x.type);
	let found: { a: Attempt; plan: CtorPlan } | null = null;
	const tried = new Set<string>();
	for (const [name, hs] of best.hints) {
		const circuit = byName(S, name);
		for (const h of hs) {
			for (const [k, v] of h.obs.targetLog.slice(0, 6).entries()) {
				for (let i = 0; i < types.length; i++) {
					if (!fitsType(types[i], v) || tried.has(`${i}|${show(v)}`)) continue;
					tried.add(`${i}|${show(v)}`);
					const label = `arg${i + 1}=output #${k} of ${name}()`;
					const p: CtorPlan = {
						label: plan.label === "defaults" ? label : `${plan.label}, ${label}`,
						plan: (a) => plan.plan(a).map((x, j) => (j === i ? v : x)),
					};
					// Cheap check first: does the circuit now get further from this hint?
					if ((await moves(new Runner(S.c, p.plan, [], {}), circuit, h)) === "same") continue;
					const a = await attempt(S, [p], [], {});
					if (a.missing < (found?.a.missing ?? best.missing)) found = { a, plan: p };
				}
			}
		}
	}
	return found;
}

/**
 * A base value for one numeric witness that lets more circuits run (points above a
 * threshold). Cheap check on the missing circuits' lone runs first, then the full
 * search. Kept only if fewer circuits miss.
 */
async function witnessOverride(
	S: Search,
	best: Attempt,
	plan: CtorPlan[],
	relations: WitnessRelation[],
	overrides: Record<string, Value>,
): Promise<{ name: string; value: Value; a: Attempt } | null> {
	let found: { name: string; value: Value; a: Attempt } | null = null;
	for (const w of S.c.witnesses) {
		if (!best.reads.has(w.name) || !isNum(w.type) || w.name in overrides) continue;
		for (const n of numericCandidates(S, w.type, best.runner.defaultWitness(w.name))) {
			const trial = { ...overrides, [w.name]: n };
			const r = new Runner(S.c, plan[0]?.plan, relations, trial);
			let moved = false;
			for (const [name, hs] of best.hints) {
				for (const h of hs) {
					if ((await moves(r, byName(S, name), h)) !== "same") {
						moved = true;
						break;
					}
				}
				if (moved) break;
			}
			if (!moved) continue;
			const a = await attempt(S, plan, relations, trial);
			if (a.missing < (found?.a.missing ?? best.missing)) found = { name: w.name, value: n, a };
		}
	}
	return found;
}
