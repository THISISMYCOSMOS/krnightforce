// This file is part of krnightforce.
// Copyright (C) krnightforce contributors
// SPDX-License-Identifier: Apache-2.0
// Execution probe for docs/design-guide/compiler-probe/p29*: does a circuit that reads
// the same secret witness twice bind both reads? Compile p29 or p29b with --skip-zk,
// then: npx tsx scripts/probe-witness-reads.mts <compiled-dir>
import { loadCompiled } from "../src/index.js";

const dir = process.argv[2];
if (!dir) throw new Error("usage: probe-witness-reads.mts <compiled-dir>");
// biome-ignore lint/suspicious/noExplicitAny: compiled contract module
const c: any = await loadCompiled(dir);
const rt = c.rt;
const PK = "0".repeat(64);
const real = new Uint8Array(32).fill(7);
let calls = 0;
let split = false;
const witnesses = {
	// Honest: always the real secret. Split: the real secret on odd reads, a fresh value on even reads.
	// biome-ignore lint/suspicious/noExplicitAny: runtime context
	secret: (ctx: any) => {
		calls++;
		const v = !split || calls % 2 === 1 ? real : crypto.getRandomValues(new Uint8Array(32));
		return [ctx.privateState, v];
	},
};
const contract = new c.Contract(witnesses);
// biome-ignore lint/suspicious/noExplicitAny: pure circuit entry
const key = c.pureFns.find((p: any) => p.name === "key").fn(real);
let state = (await contract.initialState(rt.createConstructorContext({}, PK), key)).currentContractState
	.data;
const scope = new Uint8Array(32).fill(1);
async function claim(): Promise<string> {
	calls = 0;
	try {
		const r = await contract.circuits.claim(
			rt.createCircuitContext({
				circuitId: "claim",
				contractAddress: rt.DUMMY_ADDRESS,
				coinPublicKeyOrZswapState: PK,
				contractState: state,
				privateState: {},
			}),
			scope,
		);
		state = r.context.callContext.currentQueryContext.state;
		return `accepted (witness read ${calls} times)`;
	} catch (e) {
		return `rejected: ${String((e as Error).message).split("\n")[0]}`;
	}
}
console.log("honest #1:", await claim());
console.log("honest #2:", await claim());
split = true;
for (let i = 1; i <= 3; i++) console.log(`split #${i}:`, await claim());
