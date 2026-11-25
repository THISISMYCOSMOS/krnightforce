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

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	type Answer,
	attack,
	checkAgainstAnswer,
	corpusMarkdown,
	loadCompiled,
	loadSpec,
	runCorpus,
	runScenarios,
	scenarioMarkdown,
} from "../src/index.js";

/**
 * Every scenario pair in bench/scenarios must match its answer key:
 * holed versions report each expected failure, fixed versions report none,
 * and intended disclosures are never failures. The rules live in
 * checkAgainstAnswer (src/bench.ts), shared with `proofkit bench`.
 */
const scenarios = fileURLToPath(new URL("../../../bench/scenarios/", import.meta.url));
const managed = fileURLToPath(new URL("./fixtures/managed/scenarios/", import.meta.url));
const fixtures = fileURLToPath(new URL("./fixtures/managed/", import.meta.url));

const names = readdirSync(scenarios, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name);

describe("bench scenarios match their answer keys", () => {
	for (const name of names) {
		const answer = JSON.parse(readFileSync(join(scenarios, name, "answer.json"), "utf8")) as Answer;
		const spec = answer.spec ? loadSpec(join(scenarios, name, answer.spec)) : null;
		for (const c of answer.contracts) {
			it(`${name} ${c.variant}`, async () => {
				const r = await attack(await loadCompiled(join(managed, `${name}__${c.variant}`)), {
					spec,
				});
				const check = checkAgainstAnswer(r, c);
				expect(check.missing, "expected findings not reported").toEqual([]);
				expect(check.falseFailures, "failures in a version expected to have none").toBe(0);
				expect(check.wrongDisclosures, "intended disclosures reported as failures").toBe(0);
				expect(check.untestableUnits, "untestable circuits").toBe(0);
				expect(check.met).toBe(true);
			}, 120_000);
		}
	}
});

describe("proofkit bench", () => {
	it("scenario mode meets every answer key on the real bench", async () => {
		const b = await runScenarios({ scenarios, compiled: managed, noCompile: true });
		expect(b.totals.scenarios).toBe(names.length);
		expect(b.totals.keysMet).toBe(names.length);
		expect(b.totals.holedFound).toBe(b.totals.holedExpected);
		expect(b.totals.fixedFalseFailures).toBe(0);
		const md = scenarioMarkdown(b);
		expect(md).toContain(`정답표 충족 ${names.length}/${names.length}`);
	}, 600_000);

	it("corpus mode aggregates without throwing and keeps names out of the summary", async () => {
		const b = await runCorpus(fixtures);
		expect(b.totals.contracts).toBe(b.rows.length);
		expect(b.totals.contracts).toBeGreaterThan(5);
		expect(b.totals.failures).toBeGreaterThan(0);
		expect(b.totals.timeouts).toBe(0);
		expect(b.totals.loadErrors).toBe(0);
		const md = corpusMarkdown(b);
		for (const row of b.rows) {
			const last = row.path.split("/").at(-1) as string;
			expect(md).not.toContain(last);
		}
	}, 600_000);

	it("a contract that exceeds the timeout is reported as a timeout, not a load error", async () => {
		const one = join(managed, `${names[0]}__holed`);
		const b = await runCorpus(one, { timeoutSeconds: 0.05 });
		expect(b.totals.contracts).toBe(1);
		expect(b.totals.timeouts).toBe(1);
		expect(b.totals.loadErrors).toBe(0);
		expect(b.rows[0].status).toBe("timeout");
		expect(corpusMarkdown(b)).toContain("시간 초과 1");
	}, 60_000);
});
