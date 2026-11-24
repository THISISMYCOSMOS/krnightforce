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

import { readFileSync } from "node:fs";
import type {
	Assignment,
	CircuitSpec,
	Compiled,
	InputSpec,
	Observation,
	Runner,
	SetupCall,
} from "./harness.js";
import { chooseSetup, unitSeed } from "./setup.js";
import { type LoadedSpec, covers } from "./spec.js";
import { typeToString } from "./types.js";
import {
	type Entropy,
	type Leaf,
	type Value,
	altSecret,
	baseLeafValue,
	candidates,
	entropyOf,
	getLeaf,
	leaves,
	prng,
	same,
	samples,
	setLeaf,
	show,
	transcriptEncoding,
} from "./values.js";

/**
 * Verdict for one place where a hidden input changes what an observer sees.
 * - EXPOSED: the value is copied there verbatim.
 * - RECOVERABLE: trying candidate values reproduces the observation, so the value can be recovered.
 * - PARTIAL: different values collide, so a property of the value leaks (e.g. `x > 100`).
 * - TAG: a deterministic, non-recoverable function of a high-entropy value. Not a failure here,
 *   but it is the same every time the value is reused, so it can link actions (A3).
 * - MASKED: the difference also depends on another secret input (a salt or key), so it hides the value.
 */
export type Kind = "EXPOSED" | "RECOVERABLE" | "PARTIAL" | "TAG" | "MASKED";
/** ledger: constructor state. value/path: circuit transcript. result: return value (not on chain). */
export type Where = "ledger" | "value" | "path" | "result";

export const FAILURE_KINDS: Kind[] = ["EXPOSED", "RECOVERABLE", "PARTIAL"];

export interface Finding {
	kind: Kind;
	where: Where;
	/** "op 3" (transcript op index), "cell 1" (ledger field index), "shape" or "result". */
	location: string;
	attack: "A1" | "A2" | "A5";
	/** Only on-chain findings can fail. Return values go to the caller, not the chain. */
	onChain: boolean;
	failure: boolean;
	detail: string;
	evidence: Record<string, unknown>;
	/**
	 * How the differing value was produced: "hash" when every differing value was an
	 * output of the runtime's hash or commitment functions in that run, "direct" otherwise.
	 */
	derived: "hash" | "direct" | null;
	/**
	 * Why a finding of a failure kind is not a failure: "declared" (no spec, and the code
	 * disclosed it directly), "spec" (the leakage description allows it). Null otherwise.
	 */
	disclosure: "declared" | "spec" | null;
	/** Design criteria (plugins/proof-kit/skills/proof-spec/references/criteria.md) a failure breaks. Empty when not a failure. */
	criteria: number[];
}

/** Map a failing finding to the design criteria it breaks. */
export function criteriaFor(f: Pick<Finding, "kind" | "where" | "failure">): number[] {
	if (!f.failure) return [];
	if (f.where === "path") return [7, 2];
	if (f.kind === "RECOVERABLE") return [4, 5];
	if (f.kind === "EXPOSED") return [1, 2];
	if (f.kind === "PARTIAL") return [6, 2];
	return [];
}

export interface InputReport {
	input: string;
	type: string;
	entropy: Entropy;
	status: "tested" | "untestable";
	reason?: string;
	samples: number;
	findings: Finding[];
}

export interface UnitReport {
	/** Circuit name, or "<constructor>". */
	circuit: string;
	status: "tested" | "untestable";
	reason?: string;
	inputs: InputReport[];
	runs: number;
	ms: number;
}

export interface Report {
	tool: "proof-kit";
	version: string;
	contract: string;
	source: string | null;
	compilerVersion: string;
	runtimeVersion: string;
	options: { budget: number; seed: number; circuits: string[] };
	/** The leakage description used, or null (zero-config rule). */
	spec: string | null;
	/** How the engine reached a state where calls run (zero-config setup search). */
	setup: { constructor: string; prefixes: Record<string, string[]>; witnesses: string[] };
	units: UnitReport[];
	pureCircuits: string[];
	summary: { failures: number; tested: number; untestable: number; runs: number; ms: number };
}

export interface AttackOptions {
	/** Max candidates tried per input in the recovery attack (A2). */
	budget?: number;
	/** Seed for sampled values. Same seed, same report. */
	seed?: number;
	/** Only these circuits (and the constructor if "<constructor>" is listed). */
	circuits?: string[];
	/** Leakage description. Without it, direct disclosures count as declared. */
	spec?: LoadedSpec | null;
}

type Opts = { budget: number; seed: number; circuits: string[]; spec: LoadedSpec | null };

export const VERSION = "0.0.1";
const CTOR = "<constructor>";

interface HiddenLeaf {
	id: string;
	spec: InputSpec;
	/** Index in the circuit's argument list for args. */
	argIndex: number;
	leaf: Leaf;
	label: string;
	entropy: Entropy;
}

/** Numeric literals in the source, used as boundary values (e.g. 100 in `x > 100`). */
function sourceConstants(file: string | null): bigint[] {
	if (!file) return [];
	try {
		const text = readFileSync(file, "utf8").replace(/\/\/.*$/gm, "");
		const nums = new Set<bigint>();
		for (const m of text.matchAll(/(?<![\w.<])(\d{1,20})(?![\w.])/g)) {
			const n = BigInt(m[1]);
			if (n > 3n) nums.add(n);
		}
		return [...nums].slice(0, 32);
	} catch {
		return [];
	}
}

function withLeaf(a: Assignment, h: HiddenLeaf, v: Value): Assignment {
	if (h.spec.source === "witness") {
		return {
			witnesses: {
				...a.witnesses,
				[h.spec.name]: setLeaf(a.witnesses[h.spec.name], h.leaf.path, v),
			},
			args: a.args,
		};
	}
	const args = [...a.args];
	args[h.argIndex] = setLeaf(args[h.argIndex], h.leaf.path, v);
	return { witnesses: a.witnesses, args };
}

function leafValue(a: Assignment, h: HiddenLeaf): Value {
	const root = h.spec.source === "witness" ? a.witnesses[h.spec.name] : a.args[h.argIndex];
	return getLeaf(root, h.leaf.path);
}

/** One observable place: an op/cell index, the op-kind sequence, or the return value. */
function keysOf(base: Observation): string[] {
	return ["shape", ...base.ops.map((_, i) => `op ${i}`), "result"];
}

function valueAt(o: Observation, base: Observation, key: string): string {
	if (key === "shape") return o.shape;
	if (key === "result") return JSON.stringify(o.result);
	if (o.shape !== base.shape) return `shape:${o.shape}`;
	return JSON.stringify(o.ops[Number(key.slice(3))]);
}

function leafStrings(x: unknown, out: string[] = []): string[] {
	if (typeof x === "string") out.push(x);
	else if (Array.isArray(x)) for (const v of x) leafStrings(v, out);
	else if (x && typeof x === "object") for (const v of Object.values(x)) leafStrings(v, out);
	return out;
}

/** Hex strings inside an observed value, for the "copied verbatim" check. */
function containsEncoding(o: Observation, key: string, enc: string): boolean {
	const target = key === "result" ? o.result : key === "shape" ? null : o.ops[Number(key.slice(3))];
	return leafStrings(target).some((s) => s === enc || s === `${enc}n`);
}

export async function attack(c: Compiled, options: AttackOptions = {}): Promise<Report> {
	const opts: Opts = {
		budget: options.budget ?? 12000,
		seed: options.seed ?? 1,
		circuits: options.circuits ?? [],
		spec: options.spec ?? null,
	};
	const started = performance.now();
	const setup = await chooseSetup(c, opts.seed);
	const runner = setup.runner;
	const constants = sourceConstants(c.sourceFile);
	const units: UnitReport[] = [];

	const wanted = (name: string) => opts.circuits.length === 0 || opts.circuits.includes(name);
	if (wanted(CTOR)) units.push(await attackUnit(c, runner, null, constants, opts, []));
	for (const circuit of c.circuits) {
		if (wanted(circuit.name))
			units.push(
				await attackUnit(
					c,
					runner,
					circuit,
					constants,
					opts,
					setup.prefixes.get(circuit.name) ?? [],
				),
			);
	}

	let failures = 0;
	let tested = 0;
	let untestable = 0;
	for (const u of units) {
		if (u.status === "untestable") untestable++;
		for (const i of u.inputs) {
			if (i.status === "tested") tested++;
			else untestable++;
			failures += i.findings.filter((f) => f.failure).length;
		}
	}
	return {
		tool: "proof-kit",
		version: VERSION,
		contract: c.dir,
		source: c.sourceFile,
		compilerVersion: c.compilerVersion,
		runtimeVersion: c.runtimeVersion,
		options: { budget: opts.budget, seed: opts.seed, circuits: opts.circuits },
		spec: opts.spec?.path ?? null,
		setup: {
			constructor: setup.constructor,
			witnesses: setup.witnesses,
			prefixes: Object.fromEntries(
				[...setup.prefixes].map(([k, v]) => [k, v.map((x) => x.circuit)]),
			),
		},
		units,
		pureCircuits: c.pureCircuits,
		summary: {
			failures,
			tested,
			untestable,
			runs: runner.runs,
			ms: Math.round(performance.now() - started),
		},
	};
}

async function attackUnit(
	c: Compiled,
	runner: Runner,
	circuit: CircuitSpec | null,
	constants: bigint[],
	opts: Opts,
	prefix: SetupCall[],
): Promise<UnitReport> {
	const t0 = performance.now();
	const runs0 = runner.runs;
	const name = circuit?.name ?? CTOR;
	const rnd = prng(unitSeed(opts.seed, name));

	// Base assignment: realistic values for every witness and argument.
	const base: Assignment = { witnesses: {}, args: [] };
	for (const w of c.witnesses) base.witnesses[w.name] = runner.defaultWitness(w.name);
	const hidden: HiddenLeaf[] = [];
	if (circuit) {
		circuit.args.forEach((spec, argIndex) => {
			let v: Value = null;
			const ls = leaves(spec.type);
			for (const leaf of ls) {
				const label = [spec.name, ...leaf.path].join(".");
				const lv = baseLeafValue(leaf, spec.name, rnd);
				v = leaf.path.length === 0 ? lv : setLeaf(v ?? skeleton(spec), leaf.path, lv);
				hidden.push({
					id: `arg:${label}`,
					spec,
					argIndex,
					leaf,
					label,
					entropy: entropyOf(leaf, spec.name),
				});
			}
			base.args.push(v);
		});
	}

	const observe = (a: Assignment) =>
		circuit
			? runner.observeCall(circuit, a, linkPrefix(prefix, base.args, a.args))
			: runner.observeConstructor(a);
	const baseObs = await observe(base);
	if (!baseObs.ok) {
		return {
			circuit: name,
			status: "untestable",
			reason: `base run failed: ${baseObs.error}`,
			inputs: [],
			runs: runner.runs - runs0,
			ms: Math.round(performance.now() - t0),
		};
	}

	// Witnesses this unit reads. A circuit is attacked on what it reads during the call;
	// the constructor on what it reads while deploying.
	const used = circuit ? baseObs.calledInCircuit : baseObs.calledInConstructor;
	for (const w of c.witnesses) {
		if (!used.has(w.name)) continue;
		for (const leaf of leaves(w.type)) {
			const label = [w.name, ...leaf.path].join(".");
			hidden.push({
				id: `witness:${label}`,
				spec: w,
				argIndex: -1,
				leaf,
				label,
				entropy: entropyOf(leaf, w.name),
			});
		}
	}

	// Secrets that can mask a difference: one alternative run per secret leaf.
	const maskRuns = new Map<string, Observation>();
	for (const h of hidden) {
		if (h.entropy !== "secret") continue;
		const alt = altSecret(h.leaf, leafValue(base, h), rnd);
		maskRuns.set(h.id, await observe(withLeaf(base, h, alt)));
	}

	const inputs: InputReport[] = [];
	for (const h of hidden) {
		inputs.push(
			await attackLeaf(
				h,
				base,
				baseObs,
				observe,
				maskRuns,
				hidden,
				constants,
				opts,
				rnd,
				circuit === null,
				name,
			),
		);
	}
	return {
		circuit: name,
		status: "tested",
		inputs,
		runs: runner.runs - runs0,
		ms: Math.round(performance.now() - t0),
	};
}

function skeleton(spec: InputSpec): Value {
	return spec.type.kind === "vector" ? [] : {};
}

async function attackLeaf(
	h: HiddenLeaf,
	base: Assignment,
	baseObs: Observation,
	observe: (a: Assignment) => Promise<Observation>,
	maskRuns: Map<string, Observation>,
	hidden: HiddenLeaf[],
	constants: bigint[],
	opts: Opts,
	rnd: () => number,
	isConstructor: boolean,
	unit: string,
): Promise<InputReport> {
	const report: InputReport = {
		input: h.id,
		type: typeToString(h.leaf.type),
		entropy: h.entropy,
		status: "tested",
		samples: 0,
		findings: [],
	};
	if (h.entropy === "untestable") {
		report.status = "untestable";
		report.reason = `cannot build values of type ${report.type}`;
		return report;
	}

	// A1: vary only this leaf.
	const baseValue = leafValue(base, h);
	const values = samples(h.leaf, h.label, baseValue, constants, rnd);
	const obs: { v: Value; o: Observation }[] = [{ v: baseValue, o: baseObs }];
	for (const v of values.slice(1)) {
		const o = await observe(withLeaf(base, h, v));
		if (o.ok) obs.push({ v, o });
	}
	report.samples = obs.length;
	if (obs.length < 2) {
		report.status = "untestable";
		report.reason = "every varied run failed (the contract rejects other values; needs a scenario)";
		return report;
	}

	const sameShape = obs.filter((x) => x.o.shape === baseObs.shape);
	const differing: string[] = [];
	for (const key of keysOf(baseObs)) {
		const pool = key === "shape" ? obs : sameShape;
		if (pool.some((x) => valueAt(x.o, baseObs, key) !== valueAt(baseObs, baseObs, key)))
			differing.push(key);
	}
	if (differing.length === 0) return report;

	const needRecovery: string[] = [];
	for (const key of differing) {
		const where: Where = isConstructor
			? "ledger"
			: key === "result"
				? "result"
				: key === "shape" || isPathOp(baseObs, key)
					? "path"
					: "value";
		const onChain = where !== "result";
		const location = isConstructor && key.startsWith("op ") ? `cell ${key.slice(3)}` : key;
		const pool = key === "shape" ? obs : sameShape;
		const baseAt = valueAt(baseObs, baseObs, key);

		// Masked by another secret?
		const maskedBy = hidden
			.filter((m) => m.id !== h.id && maskRuns.has(m.id))
			.filter((m) => {
				const mo = maskRuns.get(m.id) as Observation;
				return mo.ok && valueAt(mo, baseObs, key) !== baseAt;
			})
			.map((m) => m.id);
		const derived = derivedVia(baseObs, pool, key);
		const mk = (kind: Kind, detail: string, evidence: Record<string, unknown>): Finding => ({
			kind,
			where,
			location,
			attack: where === "path" ? "A5" : kind === "RECOVERABLE" ? "A2" : "A1",
			onChain,
			failure: onChain && FAILURE_KINDS.includes(kind),
			detail,
			evidence,
			derived,
			disclosure: null,
			criteria: [],
		});
		if (maskedBy.length > 0) {
			report.findings.push(
				mk("MASKED", `changes with this input but is masked by ${maskedBy.join(", ")}`, {
					maskedBy,
				}),
			);
			continue;
		}

		// Copied verbatim?
		const verbatim = pool.filter((x) => {
			const enc =
				key === "result" && typeof x.v === "bigint" && x.v > 0n
					? `${x.v}n`
					: transcriptEncoding(h.leaf, x.v);
			return enc !== null && enc.length >= 2 && containsEncoding(x.o, key, enc);
		});
		if (verbatim.length >= 2) {
			report.findings.push(
				mk("EXPOSED", "the input appears verbatim", {
					examples: verbatim.slice(0, 3).map((x) => show(x.v)),
				}),
			);
			continue;
		}

		// Collisions: different inputs, same observation → a property of the input leaks.
		const groups = new Map<string, Value[]>();
		for (const x of pool) {
			const k = valueAt(x.o, baseObs, key);
			groups.set(k, [...(groups.get(k) ?? []), x.v]);
		}
		if (groups.size < pool.length) {
			const classes = [...groups.values()].map((vs) => vs.slice(0, 4).map(show));
			report.findings.push(
				mk(
					"PARTIAL",
					`${groups.size} distinct observations for ${pool.length} inputs: a property of the input leaks`,
					{
						classes,
					},
				),
			);
			continue;
		}
		needRecovery.push(key);
		report.findings.push(mk("TAG", "pending recovery", {}));
	}

	// A2: try candidates once for all places that still look one-to-one.
	if (needRecovery.length > 0) {
		const recovered = await recover(
			h,
			base,
			baseObs,
			observe,
			needRecovery,
			opts.budget,
			values,
			obs,
			opts.spec?.ranges.get(h.id),
		);
		for (const f of report.findings) {
			const key = f.location.startsWith("cell ") ? `op ${f.location.slice(5)}` : f.location;
			if (f.kind !== "TAG" || !needRecovery.includes(key)) continue;
			const r = recovered.get(key);
			if (r && !r.exact) {
				f.kind = "PARTIAL";
				f.failure = f.onChain;
				f.detail = `another value (${show(r.value)}) gives the same observation: a property of the input leaks`;
				f.evidence = { collision: show(r.value), tried: r.tried };
			} else if (r) {
				f.kind = "RECOVERABLE";
				f.attack = f.where === "path" ? "A5" : "A2";
				f.failure = f.onChain;
				f.detail = `recovered the hidden value ${show(r.value)} after ${r.tried} candidates`;
				f.evidence = { recovered: show(r.value), tried: r.tried };
			} else {
				f.detail =
					h.entropy === "secret"
						? "one-to-one function of a high-entropy value: not recoverable, but identical whenever the value is reused (A3)"
						: `not recovered within ${opts.budget} candidates`;
				f.evidence = { tried: opts.budget };
			}
		}
	}
	for (const f of report.findings) {
		decide(f, h.id, unit, opts.spec);
		f.criteria = criteriaFor(f);
	}
	return report;
}

/**
 * The failure rule (docs/design-guide.md chapter 5). With a leakage description, a
 * failure kind on chain fails unless mayReveal allows it. Without one, it fails only
 * when it came through a hash or commitment, which the compiler trusts to hide;
 * a direct disclose() is a declared disclosure.
 */
function decide(f: Finding, input: string, unit: string, spec: LoadedSpec | null): void {
	f.disclosure = null;
	if (!f.onChain || !FAILURE_KINDS.includes(f.kind)) {
		f.failure = false;
		return;
	}
	if (spec) {
		if (covers(spec.spec, unit, input, f)) {
			f.failure = false;
			f.disclosure = "spec";
		} else {
			f.failure = true;
		}
		return;
	}
	if (f.derived === "hash") {
		f.failure = true;
		return;
	}
	f.failure = false;
	f.disclosure = "declared";
}

function observedAt(o: Observation, key: string): unknown {
	if (key === "result") return o.result;
	if (key === "shape") return null;
	return o.ops[Number(key.slice(3))];
}

/** Strip the "n" suffix normalize() puts on bigints, matching both forms. */
function inHashes(set: Set<string>, s: string): boolean {
	return set.has(s);
}

/** Whether every value that differs between the base run and the samples is a hash or commitment output. */
function derivedVia(
	baseObs: Observation,
	pool: { o: Observation }[],
	key: string,
): "hash" | "direct" {
	if (key === "shape") return "direct";
	const baseLeaves = leafStrings(observedAt(baseObs, key));
	let differs = false;
	for (const x of pool) {
		const xl = leafStrings(observedAt(x.o, key));
		const fromBase = baseLeaves.filter((s) => !xl.includes(s));
		const fromX = xl.filter((s) => !baseLeaves.includes(s));
		if (fromBase.length + fromX.length === 0) continue;
		differs = true;
		if (
			!fromBase.every((s) => inHashes(baseObs.hashes, s)) ||
			!fromX.every((s) => inHashes(x.o.hashes, s))
		) {
			return "direct";
		}
	}
	return differs ? "hash" : "direct";
}

/**
 * Setup calls that passed the same value as the attacked call (e.g. the ID that
 * `issue` registers and `isAdult` looks up) get the varied value too.
 */
function linkPrefix(prefix: SetupCall[], baseArgs: Value[], args: Value[]): SetupCall[] {
	if (prefix.length === 0) return prefix;
	return prefix.map((p) => ({
		circuit: p.circuit,
		args: p.args.map((v) => {
			const j = baseArgs.findIndex((b) => same(b, v));
			return j >= 0 ? args[j] : v;
		}),
	}));
}

/** Values lo..hi (inclusive) from the leakage description, most of the budget at most. */
function* rangeValues([lo, hi]: [bigint, bigint], budget: number): Generator<Value> {
	let n = 0;
	for (let v = lo; v <= hi && n < budget; v++, n++) yield v;
}

function isPathOp(base: Observation, key: string): boolean {
	if (!key.startsWith("op ")) return false;
	const op = base.ops[Number(key.slice(3))] as Record<string, unknown> | undefined;
	return op !== undefined && "idx" in op;
}

async function recover(
	h: HiddenLeaf,
	base: Assignment,
	baseObs: Observation,
	observe: (a: Assignment) => Promise<Observation>,
	keys: string[],
	budget: number,
	sampled: Value[],
	sampledObs: { v: Value; o: Observation }[],
	range?: [bigint, bigint],
): Promise<Map<string, { value: Value; tried: number; exact: boolean }>> {
	const out = new Map<string, { value: Value; tried: number; exact: boolean }>();
	const target = leafValue(base, h);
	// If the samples already cover the whole domain, the observation pins the value down.
	if (h.entropy === "enumerable") {
		const domain = [...candidates(h.leaf, h.label, budget)];
		if (domain.every((d) => sampled.some((s) => same(s, d)))) {
			for (const k of keys) out.set(k, { value: target, tried: sampledObs.length, exact: true });
			return out;
		}
	}
	let tried = 0;
	const want = new Map(keys.map((k) => [k, valueAt(baseObs, baseObs, k)]));
	const numeric = h.leaf.type.kind === "uint" || h.leaf.type.kind === "field";
	const pool = range && numeric ? rangeValues(range, budget) : candidates(h.leaf, h.label, budget);
	for (const cand of pool) {
		tried++;
		if (same(cand, target)) {
			// Trying the true value always matches; count it only as a try, the match
			// below would be trivially true. Keep searching for an earlier collision.
			for (const k of keys) if (!out.has(k)) out.set(k, { value: cand, tried, exact: true });
			break;
		}
		const o = await observe(withLeaf(base, h, cand));
		if (!o.ok) continue;
		for (const k of keys) {
			if (!out.has(k) && valueAt(o, baseObs, k) === want.get(k))
				out.set(k, { value: cand, tried, exact: false });
		}
		if (out.size === keys.length) break;
	}
	return out;
}
