// This file is part of krnightforce.
// Copyright (C) krnightforce contributors
// SPDX-License-Identifier: Apache-2.0
// Diagnostic, not a verdict: runs each circuit of a compiled contract once (with the
// engine's zero-config setup) and lists witnesses read more than once in one call.
// Two reads are two independent private inputs (docs/design-guide/compiler-probe p29).
// Usage: npx tsx scripts/count-witness-reads.mts <compiled-dir>...
import { loadCompiled } from "../src/index.js";
import { baseArgs, chooseSetup, unitSeed } from "../src/setup.js";
import { prng } from "../src/values.js";

for (const dir of process.argv.slice(2)) {
	const c = await loadCompiled(dir);
	// Wrap every witness so each call is counted, and every circuit so the count
	// covers one call (setup calls get their own snapshot).
	const counts = new Map<string, number>();
	const last = new Map<string, { counts: Map<string, number>; ok: boolean }>();
	const Original = c.Contract;
	// biome-ignore lint/suspicious/noExplicitAny: compiled contract constructor
	c.Contract = function (witnesses: Record<string, (...a: any[]) => unknown>) {
		// biome-ignore lint/suspicious/noExplicitAny: witness arguments
		const wrapped: Record<string, (...a: any[]) => unknown> = {};
		for (const [k, f] of Object.entries(witnesses))
			wrapped[k] = (...a) => {
				counts.set(k, (counts.get(k) ?? 0) + 1);
				return f(...a);
			};
		const instance = new Original(wrapped);
		for (const [name, f] of Object.entries(instance.circuits as Record<string, Function>)) {
			// biome-ignore lint/suspicious/noExplicitAny: circuit arguments
			instance.circuits[name] = async (...a: any[]) => {
				counts.clear();
				let ok = false;
				try {
					const r = await f(...a);
					ok = true;
					return r;
				} finally {
					last.set(name, { counts: new Map(counts), ok });
				}
			};
		}
		return instance;
	};
	const setup = await chooseSetup(c, 1);
	console.log(dir.split("/").filter(Boolean).at(-1));
	for (const circuit of c.circuits) {
		const args = baseArgs(circuit, prng(unitSeed(1, circuit.name)));
		await setup.runner.observeCall(circuit, { witnesses: {}, args }, setup.prefixes.get(circuit.name) ?? []);
		const r = last.get(circuit.name);
		const twice = [...(r?.counts ?? [])].filter(([, n]) => n > 1).map(([k, n]) => `${k} x${n}`);
		const state = r?.ok ? "" : " (call failed; counted up to the failure)";
		console.log(`  ${circuit.name}: ${twice.length ? `READ MORE THAN ONCE: ${twice.join(", ")}` : "each witness read at most once"}${state}`);
	}
}
