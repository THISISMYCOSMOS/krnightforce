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
import { attack, loadCompiled, loadSpec } from "../src/index.js";

/**
 * Every scenario pair in bench/scenarios must match its answer key:
 * holed versions report each expected failure, fixed versions report none,
 * and intended disclosures are never failures.
 */
const scenarios = fileURLToPath(new URL("../../../bench/scenarios/", import.meta.url));
const managed = fileURLToPath(new URL("./fixtures/managed/scenarios/", import.meta.url));

interface Answer {
	id: string;
	spec?: string;
	contracts: {
		path: string;
		variant: "holed" | "fixed";
		expectFailures: boolean;
		findings: { circuit: string; input: string; attack: string; kind: string; where: string }[];
		intendedDisclosures: { circuit: string; input: string }[];
	}[];
}

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
				const failures = r.units.flatMap((u) =>
					u.inputs.flatMap((i) =>
						i.findings
							.filter((f) => f.failure)
							.map((f) => ({ circuit: u.circuit, input: i.input, ...f })),
					),
				);
				if (!c.expectFailures) expect(failures).toEqual([]);
				for (const e of c.findings) {
					expect(
						failures.some(
							(f) =>
								f.circuit === e.circuit &&
								f.input === e.input &&
								f.attack === e.attack &&
								f.kind === e.kind &&
								f.where === e.where,
						),
						`missing ${JSON.stringify(e)}`,
					).toBe(true);
				}
				for (const d of c.intendedDisclosures) {
					expect(failures.filter((f) => f.circuit === d.circuit && f.input === d.input)).toEqual(
						[],
					);
				}
				expect(r.units.filter((u) => u.status === "untestable")).toEqual([]);
			}, 120_000);
		}
	}
});
