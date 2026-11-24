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

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type LoadedSpec, attack, formatText, loadCompiled, loadSpec } from "../src/index.js";

/**
 * Verifier checks: a hidden input with `shareWith` must reach the chain as a commitment
 * or hash (a MASKED or TAG finding), so the named party can check the opening it gets
 * off chain. Not a privacy failure; counted in summary.verifierMissing.
 */
const scenarios = fileURLToPath(new URL("../../../bench/scenarios/", import.meta.url));
const managed = fileURLToPath(new URL("./fixtures/managed/scenarios/", import.meta.url));

describe("verifier checks (shareWith)", () => {
	it("scholarship fixed: the office can check income and student number against the credential commitment", async () => {
		const spec = loadSpec(join(scenarios, "scholarship", "privacy-spec.json"));
		const r = await attack(await loadCompiled(join(managed, "scholarship__fixed")), { spec });
		const byInput = Object.fromEntries(r.verifierChecks.map((v) => [v.input, v]));
		expect(byInput["witness:income_pct"]).toMatchObject({
			shareWith: "scholarship office",
			status: "ok",
		});
		expect(byInput["witness:student_no"]).toMatchObject({ status: "ok" });
		expect(byInput["witness:income_pct"].circuits).toContain("apply");
		expect(r.summary).toMatchObject({ failures: 0, verifierMissing: 0 });
		// The report JSON carries the checks.
		const json = JSON.parse(JSON.stringify(r));
		expect(Array.isArray(json.verifierChecks)).toBe(true);
		expect(json.verifierChecks).toHaveLength(2);
		expect(formatText(r)).toContain("verifier check: witness:income_pct → scholarship office: ok");
	}, 120_000);

	it("reports missing when the value only leaves as a fact, without failing", async () => {
		const spec: LoadedSpec = {
			path: "inline",
			spec: {
				hidden: [{ input: "witness:holder_age", range: "0..120", shareWith: "pharmacy" }],
				mayReveal: [
					{ circuit: "check", input: "arg:id", kind: "value" },
					{ circuit: "check", input: "witness:holder_age", kind: "fact", fact: "holder_age >= 18" },
				],
			},
			ranges: new Map([["witness:holder_age", [0n, 120n]]]),
		};
		const r = await attack(await loadCompiled(join(managed, "predicate-disclosure__fixed")), {
			spec,
		});
		expect(r.verifierChecks).toEqual([
			{ input: "witness:holder_age", shareWith: "pharmacy", status: "missing", circuits: [] },
		]);
		expect(r.summary).toMatchObject({ failures: 0, verifierMissing: 1 });
		expect(formatText(r)).toContain(
			"verifier check: witness:holder_age → pharmacy: MISSING: no commitment of this value on chain",
		);
	}, 120_000);
});
