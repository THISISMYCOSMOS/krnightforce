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

	it("catches the vote choice through which counter moves (A5)", () => {
		const f = findings(r, "vote", "witness:vote_choice");
		expect(f).toHaveLength(1);
		expect(f[0]).toMatchObject({ kind: "RECOVERABLE", where: "path", attack: "A5", failure: true });
	});

	it("counts exactly two failures", () => {
		expect(r.summary.failures).toBe(2);
	});
});

describe("red (holed)", () => {
	let r: Report;
	beforeAll(async () => {
		r = await run("red");
	}, 60_000);

	it("catches a one-bit leak (secret > 100) with boundary values", () => {
		const f = findings(r, "threshold", "witness:secret_num");
		expect(f[0]).toMatchObject({ kind: "PARTIAL", failure: true });
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
		expect(findings(r, "c1", "arg:a")[0]).toMatchObject({ kind: "EXPOSED", failure: true });
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

	it("catches the age stored in the clear", () => {
		const f = findings(r, "issue", "witness:holder_age");
		expect(f[0]).toMatchObject({ kind: "EXPOSED", failure: true });
	});
});
