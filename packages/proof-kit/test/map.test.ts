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
import { beforeAll, describe, expect, it } from "vitest";
import {
	type Report,
	attack,
	inputClasses,
	loadCompiled,
	loadSpec,
	renderMapMarkdown,
	renderMermaid,
} from "../src/index.js";

/**
 * The privacy map copies colors from report fields only. Done criterion (docs/plan.md
 * section 11, item 2): in the health-credential pair, age and condition are 위험 (risk)
 * in the holed version and 증명만 (proof only) in the fixed one.
 */
const scenarios = fileURLToPath(new URL("../../../bench/scenarios/", import.meta.url));
const managed = fileURLToPath(new URL("./fixtures/managed/scenarios/", import.meta.url));

async function report(
	name: string,
	variant: "holed" | "fixed",
	withSpec: boolean,
): Promise<Report> {
	const spec = withSpec ? loadSpec(join(scenarios, name, "privacy-spec.json")) : null;
	return attack(await loadCompiled(join(managed, `${name}__${variant}`)), { spec });
}

/** The class a Mermaid node with this label is drawn in. */
function nodeClass(mermaid: string, labelText: string): string | undefined {
	const line = mermaid.split("\n").find((l) => l.includes(`["${labelText}"]:::`));
	return line?.split(":::")[1];
}

describe("privacy map: health-credential holed vs fixed", () => {
	let holed: Report;
	let fixed: Report;
	beforeAll(async () => {
		holed = await report("health-credential", "holed", true);
		fixed = await report("health-credential", "fixed", true);
	}, 120_000);

	it("marks age and condition as risk in the holed version", () => {
		const m = renderMermaid(holed);
		expect(nodeClass(m, "witness:patient_age")).toBe("risk");
		expect(nodeClass(m, "witness:patient_condition")).toBe("risk");
	});

	it("marks them proof only in the fixed version", () => {
		const m = renderMermaid(fixed);
		expect(nodeClass(m, "witness:patient_age")).toBe("proof");
		expect(nodeClass(m, "witness:patient_condition")).toBe("proof");
	});

	it("colors the public credential id as public (allowed by the spec)", () => {
		expect(inputClasses(fixed).get("arg:id")).toBe("public");
	});

	it("puts both maps on one page with a legend and distinct node ids", () => {
		const md = renderMapMarkdown([
			{ title: "구멍 판", report: holed },
			{ title: "고친 판", report: fixed },
		]);
		expect(md.match(/```mermaid/g)).toHaveLength(2);
		expect(md).toContain("## 범례");
		expect(md).toContain("m0_i");
		expect(md).toContain("m1_i");
	});
});

describe("privacy map: split witness", () => {
	it("marks the witness read twice as risk (T2, UNBOUND)", async () => {
		const r = await report("split-witness", "holed", false);
		expect(nodeClass(renderMermaid(r), "witness:birth_year")).toBe("risk");
	}, 120_000);
});
