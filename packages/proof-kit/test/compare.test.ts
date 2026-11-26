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

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { type CompareResult, compareMarkdown, runCompare } from "../src/index.js";

/**
 * Design fork comparison on the car-club pair: option A (holed) hashes the plate alone
 * and compares the purchase time with the block time; option B (fixed) does neither.
 */
const scenario = fileURLToPath(new URL("../../../bench/scenarios/car-club/", import.meta.url));
const managed = fileURLToPath(new URL("./fixtures/managed/scenarios/", import.meta.url));
const spec = join(scenario, "privacy-spec.json");

function hasCompiler(): boolean {
	if (process.env.COMPACTC) return true;
	try {
		execFileSync("compactc", ["--version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function expectCarClubDiff(c: CompareResult): void {
	const row = (circuit: string, input: string) =>
		c.differs.find((d) => d.circuit === circuit && d.input === input);
	for (const [circuit, input] of [
		["proveHeldYear", "witness:purchase_month"],
		["registerCar", "witness:plate_number"],
	]) {
		const d = row(circuit, input);
		expect(d, `${circuit} ${input} listed`).toBeDefined();
		expect(d?.a.cls).toBe("risk");
		expect(d?.b.cls).not.toBe("risk");
	}
	const md = compareMarkdown(c);
	expect(md).toContain("## 무엇이 다른가");
	expect(md).toContain("| proveHeldYear | witness:purchase_month | 위험");
	expect(md.match(/```mermaid/g)?.length).toBe(2);
}

describe("proofkit compare", () => {
	const cache = mkdtempSync(join(tmpdir(), "proofkit-compare-test-"));
	afterAll(() => rmSync(cache, { recursive: true, force: true }));

	it("lists the inputs whose color differs between two compiled options", async () => {
		const c = await runCompare(
			[join(managed, "car-club__holed"), join(managed, "car-club__fixed")],
			{ spec, titles: ["구멍 판", "고친 판"] },
		);
		expect(c.titles).toEqual(["구멍 판", "고친 판"]);
		expectCarClubDiff(c);
	}, 240_000);

	it.skipIf(!hasCompiler())(
		"compiles .compact sources first, into the cache",
		async () => {
			const c = await runCompare(
				[join(scenario, "holed", "club.compact"), join(scenario, "fixed", "club.compact")],
				{ spec, cacheDir: cache },
			);
			expect(c.titles).toEqual(["A안", "B안"]);
			expectCarClubDiff(c);
		},
		240_000,
	);
});
