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

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type CType, fromInfo, fromRuntimeString } from "./types.js";
import { type Value, defaultValue, prng, same, show } from "./values.js";

// biome-ignore lint/suspicious/noExplicitAny: the runtime and compiled contracts are untyped JS here.
type Any = any;

export interface InputSpec {
	/** "witness" values come from witness functions; "arg" values are circuit arguments. */
	source: "witness" | "arg";
	name: string;
	type: CType;
}

export interface CircuitSpec {
	name: string;
	args: InputSpec[];
}

export interface Compiled {
	dir: string;
	sourceFile: string | null;
	compilerVersion: string;
	runtimeVersion: string;
	witnesses: InputSpec[];
	circuits: CircuitSpec[];
	pureCircuits: string[];
	/** Pure circuits with one argument, callable off-chain (used to build a consistent setup). */
	pureFns: { name: string; arg: CType; result: CType; fn: (x: Value) => Value }[];
	constructorArgs: { type: CType; value: Value }[];
	rt: Any;
	Contract: Any;
}

/** What one run leaves where an outside observer can see it. */
export interface Observation {
	ok: boolean;
	error?: string;
	/** Normalized public transcript ops (circuit call) or top-level ledger cells (constructor). */
	ops: unknown[];
	/** Op kinds in order; a different sequence means a different path through the circuit. */
	shape: string;
	/** Circuit return value, normalized. */
	result: unknown;
	/** Witnesses called during the constructor and during the circuit call. */
	calledInConstructor: Set<string>;
	calledInCircuit: Set<string>;
	/** How many times each witness was read during the attacked call (not setup calls). */
	witnessReads: Record<string, number>;
	/**
	 * Outputs of the runtime's hash and commitment functions during this run
	 * (deployment and call), normalized like transcript values. Used to tell a
	 * value derived through a hash or commitment from a direct disclose().
	 */
	hashes: Set<string>;
}

/** A circuit call made before the attacked one, to reach a state where it can run. */
export interface SetupCall {
	circuit: string;
	args: Value[];
}

/**
 * A witness whose value is a function of another witness in a real deployment,
 * e.g. the owner key stored at registration is `ownerKeyOf(owner_secret)`.
 */
export interface WitnessRelation {
	target: string;
	source: string;
	label: string;
	fn: (x: Value) => Value;
}

/** Per-run input assignment: witness name → value, and circuit argument values in order. */
export interface Assignment {
	witnesses: Record<string, Value>;
	args: Value[];
	/**
	 * Give one witness a different value on some of its reads in the attacked call
	 * (not in setup calls): "first" replaces the first read, "rest" every later read.
	 * Used by the split-witness attack (T2).
	 */
	split?: { name: string; value: Value; at: "first" | "rest" };
}

export const PK = "0".repeat(64);

export function normalize(v: unknown): unknown {
	if (v instanceof Uint8Array) return Buffer.from(v).toString("hex");
	if (typeof v === "bigint") return `${v}n`;
	if (Array.isArray(v)) return v.map(normalize);
	if (v && typeof v === "object")
		return Object.fromEntries(
			Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, normalize(x)]),
		);
	return v;
}

function findSource(dir: string): string | null {
	const map = join(dir, "contract", "index.js.map");
	if (!existsSync(map)) return null;
	try {
		const m = JSON.parse(readFileSync(map, "utf8")) as { sources?: string[]; sourceRoot?: string };
		const src = m.sources?.[0];
		if (!src) return null;
		const p = resolve(join(dir, "contract"), m.sourceRoot ?? "", src);
		return existsSync(p) ? p : null;
	} catch {
		return null;
	}
}

const HASH_FUNCTIONS = ["persistentHash", "persistentCommit", "transientHash", "transientCommit"];

function runtimeUrl(indexJs: string): string {
	try {
		return pathToFileURL(createRequire(indexJs).resolve("@midnight-ntwrk/compact-runtime")).href;
	} catch {
		return pathToFileURL(createRequire(import.meta.url).resolve("@midnight-ntwrk/compact-runtime"))
			.href;
	}
}

/**
 * Write a copy of the compiled contract whose runtime import goes through a
 * wrapper that logs hash and commitment outputs. The copy lives in a temp
 * directory; the user's files are not touched.
 */
function instrumented(indexJs: string, rtUrl: string): string {
	const src = readFileSync(indexJs, "utf8");
	const line = /^import \* as __compactRuntime from '@midnight-ntwrk\/compact-runtime';$/m;
	if (!line.test(src)) return pathToFileURL(indexJs).href;
	const id = createHash("sha256")
		.update(indexJs)
		.update(src)
		.update(rtUrl)
		.digest("hex")
		.slice(0, 16);
	const dir = join(tmpdir(), "proofkit", id);
	mkdirSync(dir, { recursive: true });
	const wrapper = join(dir, "runtime.mjs");
	const fns = HASH_FUNCTIONS.map(
		(f) =>
			`export function ${f}(...a) { const v = rt.${f}(...a); const l = globalThis.__proofkitHashLog; if (l) l.push(v); return v; }`,
	).join("\n");
	writeFileSync(
		wrapper,
		`import * as rt from ${JSON.stringify(rtUrl)};\nexport * from ${JSON.stringify(rtUrl)};\n${fns}\n`,
	);
	const out = join(dir, "index.mjs");
	writeFileSync(
		out,
		src.replace(
			line,
			`import * as __compactRuntime from ${JSON.stringify(pathToFileURL(wrapper).href)};`,
		),
	);
	return pathToFileURL(out).href;
}

/** Normalized strings under which a hash output can appear in a transcript. */
function hashForms(v: unknown): string[] {
	if (v instanceof Uint8Array) return [Buffer.from(v).toString("hex")];
	if (typeof v === "bigint") {
		let x = v;
		let hex = "";
		while (x > 0n) {
			hex += (x & 0xffn).toString(16).padStart(2, "0");
			x >>= 8n;
		}
		return [`${v}n`, hex];
	}
	return [];
}

function collectHashes(log: unknown[]): Set<string> {
	return new Set(log.flatMap(hashForms));
}

/** Load a compiled contract directory (the out dir given to `compact compile`). */
export async function loadCompiled(dir: string, sourceFile?: string): Promise<Compiled> {
	const abs = resolve(dir);
	const info = JSON.parse(readFileSync(join(abs, "compiler", "contract-info.json"), "utf8"));
	const indexJs = join(abs, "contract", "index.js");
	// Use the runtime the contract itself resolves, so classes and WASM state are shared.
	const rt: Any = await import(runtimeUrl(indexJs));
	const mod = await import(instrumented(indexJs, runtimeUrl(indexJs)));
	const witnesses: InputSpec[] = (info.witnesses ?? []).map((w: Any) => ({
		source: "witness",
		name: w.name,
		type: fromInfo(w["result type"]),
	}));
	const circuits: CircuitSpec[] = [];
	const pureCircuits: string[] = [];
	const pureFns: Compiled["pureFns"] = [];
	for (const c of info.circuits ?? []) {
		if (c.pure) {
			pureCircuits.push(c.name);
			const fn = mod.pureCircuits?.[c.name];
			if (typeof fn === "function" && (c.arguments ?? []).length === 1) {
				pureFns.push({
					name: c.name,
					arg: fromInfo(c.arguments[0].type),
					result: fromInfo(c["result-type"]),
					fn: (x: Value) => fn(x),
				});
			}
			continue;
		}
		circuits.push({
			name: c.name,
			args: (c.arguments ?? []).map((a: Any) => ({
				source: "arg",
				name: a.name,
				type: fromInfo(a.type),
			})),
		});
	}
	const compiled: Compiled = {
		dir: abs,
		sourceFile: sourceFile ? resolve(sourceFile) : findSource(abs),
		compilerVersion: info["compiler-version"] ?? "unknown",
		runtimeVersion: info["runtime-version"] ?? "unknown",
		witnesses,
		circuits,
		pureCircuits,
		pureFns,
		constructorArgs: [],
		rt,
		Contract: mod.Contract,
	};
	compiled.constructorArgs = await discoverConstructorArgs(compiled);
	return compiled;
}

/**
 * contract-info.json does not describe constructor parameters. Learn them from the
 * runtime's own argument checks: the count from the arity error, each type from the
 * type error it raises for an undefined argument.
 */
async function discoverConstructorArgs(c: Compiled): Promise<{ type: CType; value: Value }[]> {
	const rnd = prng(7);
	const contract = new c.Contract(stubWitnesses(c));
	const ctx = () => c.rt.createConstructorContext({}, PK);
	let count = 0;
	try {
		await contract.initialState(ctx());
		return [];
	} catch (e) {
		const m = /expected (\d+) arguments/.exec(String((e as Error).message));
		if (!m) return [];
		count = Number(m[1]) - 1;
	}
	// Probe with a string: it fails every non-string type check with a readable
	// type error, where undefined can crash a check (e.g. `x.buffer`) first.
	const PROBE = "\u0000proof-kit-probe";
	const types: (CType | null)[] = Array(count).fill(null);
	const values: Value[] = Array(count).fill(PROBE);
	for (let guard = 0; guard <= count; guard++) {
		try {
			await contract.initialState(ctx(), ...values);
			break;
		} catch (e) {
			const msg = String((e as Error).message);
			const m = /constructor argument (\d+) .*expected value of type (.+) but received/.exec(msg);
			if (!m) break; // not a type error: every remaining argument accepted the probe
			const k = Number(m[1]) - 1;
			if (types[k] !== null) break;
			types[k] = fromRuntimeString(m[2]);
			values[k] = defaultValue(types[k] as CType, `ctor${k}`, rnd);
		}
	}
	return types.map((t, i) => ({ type: t ?? { kind: "opaque", name: "Opaque" }, value: values[i] }));
}

function stubWitnesses(c: Compiled): Record<string, Any> {
	const rnd = prng(11);
	const out: Record<string, Any> = {};
	for (const w of c.witnesses) {
		const v = defaultValue(w.type, w.name, rnd);
		out[w.name] = (ctx: Any) => [ctx.privateState, v];
	}
	return out;
}

function errorText(e: unknown): string {
	return String((e as Error)?.message ?? e)
		.split("\n")[0]
		.slice(0, 200);
}

/**
 * Runs a compiled contract under changing witness values. Witness stubs read the
 * current assignment, so one deployment is reused for every circuit run whose
 * constructor-time witness values are the same.
 */
export class Runner {
	private current: Assignment = { witnesses: {}, args: [] };
	private readonly defaults: Record<string, Value> = {};
	private readonly contract: Any;
	private readonly deployments = new Map<
		string,
		{ ok: boolean; error?: string; state?: Any; called: Set<string>; hashes: Set<string> }
	>();
	private phase: "constructor" | "circuit" = "constructor";
	private calledInConstructor = new Set<string>();
	private calledInCircuit = new Set<string>();
	/** True only while the attacked call runs (after setup calls). */
	private target = false;
	private reads: Record<string, number> = {};
	/** Witnesses the constructor reads; only these decide whether a deployment can be reused. */
	private ctorWitnesses: string[] | null = null;
	runs = 0;

	constructor(
		private readonly c: Compiled,
		/** Constructor arguments as a function of the assignment (see setup.ts). */
		private readonly ctorPlan: (a: Assignment) => Value[] = () =>
			c.constructorArgs.map((x) => x.value),
		/** Witnesses derived from other witnesses (see setup.ts). */
		readonly relations: WitnessRelation[] = [],
	) {
		const rnd = prng(11);
		const witnesses: Record<string, Any> = {};
		for (const w of c.witnesses) this.defaults[w.name] = defaultValue(w.type, w.name, rnd);
		for (const r of relations) this.defaults[r.target] = r.fn(this.defaults[r.source]);
		for (const w of c.witnesses) {
			witnesses[w.name] = (ctx: Any) => {
				(this.phase === "constructor" ? this.calledInConstructor : this.calledInCircuit).add(
					w.name,
				);
				const a = this.current;
				let v = this.witnessValue(w.name, a);
				if (this.target) {
					const n = (this.reads[w.name] ?? 0) + 1;
					this.reads[w.name] = n;
					const sp = a.split;
					if (sp && sp.name === w.name && (sp.at === "first" ? n === 1 : n > 1)) v = sp.value;
				}
				return [ctx.privateState, v];
			};
		}
		this.contract = new c.Contract(witnesses);
	}

	/**
	 * A witness value under an assignment. A derived witness follows its source
	 * (an attack that varies the owner secret also changes the owner key), unless
	 * the assignment varies the derived witness itself.
	 */
	private witnessValue(name: string, a: Assignment): Value {
		const own = name in a.witnesses ? a.witnesses[name] : this.defaults[name];
		const r = this.relations.find((x) => x.target === name);
		if (!r || !same(own, this.defaults[name])) return own;
		return r.fn(this.witnessValue(r.source, a));
	}

	defaultWitness(name: string): Value {
		return this.defaults[name];
	}

	private deployKey(a: Assignment): string {
		const names = this.ctorWitnesses ?? this.c.witnesses.map((w) => w.name);
		const w = names.map((n) => show(this.witnessValue(n, a))).join("|");
		return `${w}#${show(this.ctorArgs(a))}`;
	}

	private ctorArgs(a: Assignment): Value[] {
		try {
			return this.ctorPlan(this.complete(a));
		} catch {
			return this.c.constructorArgs.map((x) => x.value);
		}
	}

	/** The assignment with defaults filled in for witnesses it does not mention. */
	complete(a: Assignment): Assignment {
		const witnesses: Record<string, Value> = {};
		for (const w of this.c.witnesses) witnesses[w.name] = this.witnessValue(w.name, a);
		return { witnesses, args: a.args };
	}

	private async deploy(a: Assignment): Promise<{
		ok: boolean;
		error?: string;
		state?: Any;
		called: Set<string>;
		hashes: Set<string>;
	}> {
		const key = this.deployKey(a);
		const hit = this.deployments.get(key);
		if (hit) return hit;
		this.current = a;
		this.phase = "constructor";
		this.calledInConstructor = new Set();
		const log: unknown[] = [];
		const g = globalThis as { __proofkitHashLog?: unknown[] };
		g.__proofkitHashLog = log;
		let out: { ok: boolean; error?: string; state?: Any; called: Set<string>; hashes: Set<string> };
		try {
			const init = await this.contract.initialState(
				this.c.rt.createConstructorContext({}, PK),
				...this.ctorArgs(a),
			);
			out = {
				ok: true,
				state: init.currentContractState.data,
				called: this.calledInConstructor,
				hashes: collectHashes(log),
			};
		} catch (e) {
			out = {
				ok: false,
				error: errorText(e),
				called: this.calledInConstructor,
				hashes: collectHashes(log),
			};
		} finally {
			g.__proofkitHashLog = undefined;
		}
		if (this.ctorWitnesses === null) {
			this.ctorWitnesses = [...out.called].sort();
			this.deployments.clear();
		}
		this.deployments.set(this.deployKey(a), out);
		return out;
	}

	/** Observe the constructor: the initial public ledger state. */
	async observeConstructor(a: Assignment): Promise<Observation> {
		this.runs++;
		const d = await this.deploy(a);
		if (!d.ok) return failed(`constructor: ${d.error}`, d.called, new Set());
		const ops = opsOfState(d.state);
		return {
			ok: true,
			ops,
			shape: ops.map((o) => (o as { tag?: string }).tag ?? "?").join(","),
			result: null,
			calledInConstructor: d.called,
			calledInCircuit: new Set(),
			witnessReads: {},
			hashes: d.hashes,
		};
	}

	private async call(name: string, state: Any, args: Value[]): Promise<Any> {
		const ctx = this.c.rt.createCircuitContext({
			circuitId: name,
			contractAddress: this.c.rt.DUMMY_ADDRESS,
			coinPublicKeyOrZswapState: PK,
			contractState: state,
			privateState: {},
		});
		return this.contract.circuits[name](ctx, ...args);
	}

	/**
	 * Deploy (or reuse a deployment), run the setup calls in `prefix`, call the circuit,
	 * and return what its call leaves on chain. Setup calls use the same witness values.
	 */
	async observeCall(
		circuit: CircuitSpec,
		a: Assignment,
		prefix: SetupCall[] = [],
	): Promise<Observation> {
		this.runs++;
		const d = await this.deploy(a);
		if (!d.ok) return failed(`constructor: ${d.error}`, d.called, new Set());
		this.current = a;
		this.phase = "circuit";
		// Setup calls are logged too: their hashes can reach this call's transcript as ledger reads.
		const log: unknown[] = [];
		const g = globalThis as { __proofkitHashLog?: unknown[] };
		g.__proofkitHashLog = log;
		let state = d.state;
		for (const p of prefix) {
			try {
				const r = await this.call(p.circuit, state, p.args);
				state = r.context.callContext.currentQueryContext.state;
			} catch (e) {
				g.__proofkitHashLog = undefined;
				return failed(`setup ${p.circuit}: ${errorText(e)}`, d.called, new Set());
			}
		}
		this.calledInCircuit = new Set();
		this.reads = {};
		this.target = true;
		try {
			const res = await this.call(circuit.name, state, a.args);
			const trace = res.context.callProofDataTrace.at(-1);
			const ops = normalize(trace.publicTranscript) as unknown[];
			return {
				ok: true,
				ops,
				shape: ops.map((o) => Object.keys(o as object)[0]).join(","),
				result: normalize(res.result),
				calledInConstructor: d.called,
				calledInCircuit: this.calledInCircuit,
				witnessReads: { ...this.reads },
				hashes: new Set([...d.hashes, ...collectHashes(log)]),
			};
		} catch (e) {
			return {
				...failed(errorText(e), d.called, this.calledInCircuit),
				witnessReads: { ...this.reads },
			};
		} finally {
			this.target = false;
			g.__proofkitHashLog = undefined;
		}
	}
}

function failed(error: string, ctor: Set<string>, circ: Set<string>): Observation {
	return {
		ok: false,
		error,
		ops: [],
		shape: "",
		result: null,
		calledInConstructor: ctor,
		calledInCircuit: circ,
		witnessReads: {},
		hashes: new Set(),
	};
}

function opsOfState(state: Any): unknown[] {
	const enc = normalize(state.state.encode()) as { content?: unknown[] };
	return Array.isArray(enc.content) ? enc.content : [enc];
}
