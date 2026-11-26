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
import { type Report, attack, formatText, loadCompiled } from "../src/index.js";

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
		// The second failure is T2 below: the hash and the commitment read the PIN separately.
		expect(r.summary.failures).toBe(2);
	});

	it("finds that the hash and the commitment can hold different PINs (T2, split witness)", () => {
		const f = findings(r, "register", "witness:secret_pin").find((x) => x.attack === "T2");
		expect(f).toMatchObject({
			kind: "UNBOUND",
			failure: true,
			criteria: [10],
			location: "2 reads",
		});
	});

	it("with a spec that hides everything, the vote path fails too", async () => {
		const spec = { path: "inline", spec: { mayReveal: [] }, ranges: new Map() };
		const s = await attack(await loadCompiled(fixture("vault")), { spec });
		const f = findings(s, "vote", "witness:vote_choice")[0];
		expect(f).toMatchObject({ failure: true, disclosure: null, criteria: [7, 2] });
		expect(s.summary.failures).toBe(3);
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

describe("review fixes: relation source, parameterized witnesses, T2 on untestable inputs", () => {
	it("picks the relation source the target really follows, not the first declared", async () => {
		// Same as car-club fixed with car_nonce declared before owner_secret: both have the
		// same default, so both unblock the base runs; only owner_secret is the real source.
		const r = await run("relation_order");
		expect(r.setup.witnesses).toEqual(["owner_key = owner_key_of(owner_secret())"]);
		expect(r.summary.failures).toBe(0);
		expect(r.summary.untestable).toBe(0);
	}, 120_000);

	it("counts reads per witness and arguments: different arguments are different inputs", async () => {
		const r = await run("witness_args");
		const t2 = (circuit: string) =>
			(r.units.find((u) => u.circuit === circuit)?.inputs ?? []).flatMap((i) =>
				i.findings.filter((f) => f.attack === "T2"),
			);
		expect(t2("twoNotes")).toEqual([]);
		expect(t2("sameNonceTwice")).toHaveLength(1);
		expect(t2("sameNonceTwice")[0]).toMatchObject({
			kind: "UNBOUND",
			location: "2 reads of note_nonce(0)",
		});
	}, 60_000);

	it("reports and shows T2 on an input A1 could not vary, and counts it as tested", async () => {
		const r = await run("split_untestable");
		const input = r.units
			.find((u) => u.circuit === "check")
			?.inputs.find((i) => i.input === "witness:year");
		expect(input?.status).toBe("tested");
		expect(input?.reason).toContain("tested by T2");
		expect(input?.findings.map((f) => f.kind)).toEqual(["UNBOUND"]);
		expect(r.summary).toMatchObject({ failures: 1, untestable: 0 });
		expect(formatText(r)).toContain("witness:year (Uint<0..65536>): FAIL unbound [T2]");
		// The base value 1990 had to come from the source's constants.
		expect(r.setup.witnesses).toContain("year = 1990 (base value)");
	}, 60_000);
});

describe("setup search: hash outputs as setup arguments, chains, base values", () => {
	it("enrols the key a circuit derives from a secret with a helper that is not exported", async () => {
		const r = await run("setup_hash_arg");
		expect(r.setup.prefixes).toEqual({ act: ["enrol"] });
		// The enrolled key follows the secret, so varying the secret still runs.
		const act = r.units.find((u) => u.circuit === "act");
		const secret = act?.inputs.find((i) => i.input === "witness:member_secret");
		expect(secret?.status).toBe("tested");
		expect(r.summary.untestable).toBe(0);
	}, 120_000);

	it("finds a constructor commitment, a three-call chain, a base argument and a base witness value", async () => {
		const r = await run("setup_chain");
		expect(r.setup.constructor).toBe("arg1=output #0 of reveal()");
		expect(r.setup.prefixes.claim).toEqual(["open", "reveal", "enter"]);
		expect(r.setup.args).toEqual({ claim: "0" });
		expect(r.setup.witnesses).toContain("level = 500 (base value)");
		const claim = r.units.find((u) => u.circuit === "claim");
		expect(claim?.status).toBe("tested");
		const level = claim?.inputs.find((i) => i.input === "witness:level");
		expect(level?.findings.some((f) => f.attack === "T2" && f.failure)).toBe(true);
	}, 120_000);
});

describe("setup calls stay fixed while an input is varied", () => {
	it("still finds threshold leaks when a setup argument equals the witness's base value", async () => {
		const spec = { path: "inline", spec: { mayReveal: [] }, ranges: new Map() };
		const r = await attack(await loadCompiled(fixture("setup_bound_threshold")), { spec });
		for (const circuit of ["check", "checkHigh"]) {
			const fs = findings(r, circuit, "witness:score");
			// The leak (a comparison with the stored threshold, or score > 100) is found...
			expect(fs.some((f) => f.kind === "PARTIAL" && f.failure)).toBe(true);
			// ...and the stored value is never reported as the score appearing verbatim.
			expect(fs.some((f) => f.kind === "EXPOSED")).toBe(false);
			expect(fs.every((f) => f.evidence.setupFollowed === undefined)).toBe(true);
		}
	}, 120_000);

	it("records when the setup calls had to follow the input (a member key)", async () => {
		const r = await run("setup_hash_arg");
		const fs = findings(r, "act", "witness:member_secret");
		expect(fs.length).toBeGreaterThan(0);
		expect(fs.every((f) => typeof f.evidence.setupFollowed === "number")).toBe(true);
	}, 120_000);
});

describe("A2 when the base value lies past the budget", () => {
	it("recovers a threshold base value from the source at its natural position", async () => {
		const r = await attack(await loadCompiled(fixture("a2_threshold")), { budget: 1000 });
		expect(r.setup.witnesses).toContain("points = 5000 (base value)");
		const f = findings(r, "record", "witness:points").find((x) => x.attack === "A2");
		expect(f).toMatchObject({ kind: "RECOVERABLE", failure: true });
		expect(f?.evidence).toMatchObject({ recovered: "5000", tried: 5001, ran: 1000 });
	}, 120_000);
});
