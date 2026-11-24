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

import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { type Report, attack, loadCompiled } from "../src/index.js";

const fixture = (name: string) =>
	fileURLToPath(new URL(`./fixtures/managed/${name}`, import.meta.url));

async function run(name: string): Promise<Report> {
	return attack(await loadCompiled(fixture(name)));
}

function findings(r: Report, circuit: string, input: string) {
	const u = r.units.find((x) => x.circuit === circuit);
	const i = u?.inputs.find((x) => x.input === input);
	if (!i) throw new Error(`no input ${input} in ${circuit}`);
	return i.findings;
}

/** Drop timings so two reports can be compared. */
function stable(r: Report): unknown {
	return JSON.parse(JSON.stringify(r, (k, v) => (k === "ms" ? undefined : v)));
}

describe("vault (holed)", () => {
	let r: Report;
	beforeAll(async () => {
		r = await run("vault");
	}, 120_000);

	it("recovers the PIN from the unsalted hash (A2)", () => {
		const f = findings(r, "register", "witness:secret_pin");
		const rec = f.find((x) => x.kind === "RECOVERABLE");
		expect(rec?.evidence.recovered).toBe('"4821"');
		expect(rec?.attack).toBe("A2");
		expect(rec?.failure).toBe(true);
	});

	it("treats the salted commitment of the same PIN as masked", () => {
		const f = findings(r, "register", "witness:secret_pin");
		expect(
			f.some(
				(x) =>
					x.kind === "MASKED" && (x.evidence.maskedBy as string[]).includes("witness:pin_salt"),
			),
		).toBe(true);
	});

	it("finds the vote choice through which counter moves (A5); without a spec it is a declared disclosure", () => {
		const f = findings(r, "vote", "witness:vote_choice");
		expect(f).toHaveLength(1);
		expect(f[0]).toMatchObject({
			kind: "RECOVERABLE",
			where: "path",
			attack: "A5",
			derived: "direct",
			failure: false,
			disclosure: "declared",
		});
	});

	it("fails the PIN hash even without a spec: it came through a hash", () => {
		const f = findings(r, "register", "witness:secret_pin").find((x) => x.kind === "RECOVERABLE");
		expect(f).toMatchObject({ derived: "hash", failure: true, disclosure: null });
		expect(r.summary.failures).toBe(1);
	});

	it("with a spec that hides everything, the vote path fails too", async () => {
		const spec = { path: "inline", spec: { mayReveal: [] }, ranges: new Map() };
		const s = await attack(await loadCompiled(fixture("vault")), { spec });
		const f = findings(s, "vote", "witness:vote_choice")[0];
		expect(f).toMatchObject({ failure: true, disclosure: null, criteria: [7, 2] });
		expect(s.summary.failures).toBe(2);
	}, 120_000);
});

describe("red (holed)", () => {
	let r: Report;
	beforeAll(async () => {
		r = await run("red");
	}, 60_000);

	it("catches a one-bit leak (secret > 100) with boundary values", () => {
		const f = findings(r, "threshold", "witness:secret_num");
		expect(f[0]).toMatchObject({
			kind: "PARTIAL",
			derived: "direct",
			failure: false,
			disclosure: "declared",
		});
	});

	it("does not fail a return value: it goes to the caller, not the chain", () => {
		const f = findings(r, "getBack", "witness:secret_num");
		expect(f.length).toBeGreaterThan(0);
		expect(f.every((x) => !x.onChain && !x.failure && x.where === "result")).toBe(true);
	});

	it("runs an ownership-checked circuit by varying the key from the constructor on", () => {
		const act = r.units.find((u) => u.circuit === "act");
		expect(act?.status).toBe("tested");
		const f = findings(r, "act", "witness:owner_sk");
		expect(f.every((x) => x.kind === "TAG" && !x.failure)).toBe(true);
	});

	it("is deterministic", async () => {
		const again = await run("red");
		expect(stable(again)).toEqual(stable(r));
	});
});

describe("fixed versions: no false positives", () => {
	for (const name of ["vault_fixed", "red_fixed"]) {
		it(`${name} has zero failures and nothing untestable`, async () => {
			const r = await run(name);
			expect(r.summary.failures).toBe(0);
			expect(r.summary.untestable).toBe(0);
		}, 60_000);
	}
});

describe("zero-config value building", () => {
	it("handles structs, vectors, Maybe, enums, ranges and constructor arguments", async () => {
		const c = await loadCompiled(fixture("types"));
		expect(c.constructorArgs).toHaveLength(1);
		expect(c.pureCircuits).toEqual(["helper"]);
		const r = await attack(c);
		const u = r.units.find((x) => x.circuit === "c1");
		expect(u?.status).toBe("tested");
		expect(u?.inputs.every((i) => i.status === "tested")).toBe(true);
		expect(findings(r, "c1", "arg:a")[0]).toMatchObject({
			kind: "EXPOSED",
			disclosure: "declared",
		});
	}, 60_000);
});

describe("zero-config setup search", () => {
	let r: Report;
	beforeAll(async () => {
		r = await run("setup");
	}, 60_000);

	it("derives the owner commitment for the constructor from a pure circuit", () => {
		expect(r.setup.constructor).toBe("arg1=owner_commitment(owner_secret())");
	});

	it("runs a lookup circuit after the call that creates its entry", () => {
		expect(r.setup.prefixes).toEqual({ isAdult: ["issue"] });
		expect(r.units.find((u) => u.circuit === "isAdult")?.inputs[0].status).toBe("tested");
	});

	it("finds the age stored in the clear (declared by disclose, so public without a spec)", () => {
		const f = findings(r, "issue", "witness:holder_age");
		expect(f[0]).toMatchObject({ kind: "EXPOSED", derived: "direct", disclosure: "declared" });
	});
});

describe("setup search: witness relations and two setup calls", () => {
	let r: Report;
	beforeAll(async () => {
		r = await attack(await loadCompiled(fixture("scenarios/car-club__fixed")));
	}, 120_000);

	it("makes the stored owner key a function of the member secret the proof circuits read", () => {
		expect(r.setup.witnesses).toEqual(["owner_key = owner_key_of(owner_secret())"]);
	});

	it("runs a circuit that needs registration and a calendar update first", () => {
		expect(r.setup.prefixes.proveHeldYear).toEqual(["registerCar", "setMonth"]);
	});

	it("tests every input, including the member secret", () => {
		const untested = r.units.flatMap((u) =>
			u.inputs.filter((i) => i.status !== "tested").map((i) => `${u.circuit} ${i.input}`),
		);
		expect(untested).toEqual([]);
	});
});

describe("design criteria on failures", () => {
	it("maps each failing finding to the criteria it breaks", async () => {
		const r = await run("vault");
		const pin = findings(r, "register", "witness:secret_pin").find((x) => x.kind === "RECOVERABLE");
		expect(pin?.criteria).toEqual([4, 5]);
		const vote = findings(r, "vote", "witness:vote_choice")[0];
		expect(vote.criteria).toEqual([]);
		const masked = findings(r, "register", "witness:secret_pin").find((x) => x.kind === "MASKED");
		expect(masked?.criteria).toEqual([]);
	}, 120_000);
});
