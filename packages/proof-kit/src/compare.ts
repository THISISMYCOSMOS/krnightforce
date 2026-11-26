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

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Report, attack } from "./attack.js";
import { compileContract } from "./bench.js";
import { loadCompiled } from "./harness.js";
import { CLASS_LABEL, type MapClass, mapRows, renderMermaid } from "./map.js";
import { type LoadedSpec, loadSpec } from "./spec.js";

/**
 * Design fork comparison: attack two versions of a contract (option A and option B
 * at one design decision) with the same leakage description and list every input
 * whose map color differs. Colors come from the engine reports only (map.ts
 * `classify`); this module never judges which option is better.
 */

export interface CompareRow {
	circuit: string;
	input: string;
	a: { cls: MapClass | null; why: string };
	b: { cls: MapClass | null; why: string };
}

export interface CompareResult {
	titles: [string, string];
	reports: [Report, Report];
	/** Inputs (per circuit) whose color differs, including ones present on one side only. */
	differs: CompareRow[];
}

export interface CompareOptions {
	spec?: string | null;
	titles?: string[];
	/** Where compiled sources go (default .proofkit-cache/compare). */
	cacheDir?: string;
}

/** A `.compact` source is compiled into the cache; anything else is a compiled dir. */
export function resolveCompiled(src: string, cacheDir: string): string {
	if (!src.endsWith(".compact")) return src;
	const abs = resolve(src);
	const hash = createHash("sha256")
		.update(abs)
		.update("\0")
		.update(readFileSync(abs))
		.digest("hex")
		.slice(0, 16);
	const out = join(cacheDir, hash);
	compileContract(abs, out);
	return out;
}

/** Inputs whose color differs between two reports, keyed by circuit and input. */
export function diffReports(a: Report, b: Report): CompareRow[] {
	const key = (c: string, i: string) => `${c}\u0000${i}`;
	const side = (r: Report) => {
		const m = new Map<string, { cls: MapClass; why: string }>();
		for (const row of mapRows(r)) m.set(key(row.circuit, row.input), row);
		return m;
	};
	const ma = side(a);
	const mb = side(b);
	const keys = [...new Set([...ma.keys(), ...mb.keys()])];
	const rows: CompareRow[] = [];
	for (const k of keys) {
		const ra = ma.get(k);
		const rb = mb.get(k);
		if (ra && rb && ra.cls === rb.cls) continue;
		const [circuit, input] = k.split("\u0000");
		rows.push({
			circuit,
			input,
			a: ra ? { cls: ra.cls, why: ra.why } : { cls: null, why: "" },
			b: rb ? { cls: rb.cls, why: rb.why } : { cls: null, why: "" },
		});
	}
	return rows.sort((x, y) =>
		x.circuit === y.circuit ? x.input.localeCompare(y.input) : x.circuit.localeCompare(y.circuit),
	);
}

/** Compile (when needed) and attack both options with the same spec, then diff. */
export async function runCompare(
	sources: [string, string],
	opts: CompareOptions = {},
): Promise<CompareResult> {
	const cacheDir = opts.cacheDir ?? join(".proofkit-cache", "compare");
	const spec: LoadedSpec | null = opts.spec ? loadSpec(opts.spec) : null;
	const reports: Report[] = [];
	for (const src of sources) {
		const dir = resolveCompiled(src, cacheDir);
		reports.push(await attack(await loadCompiled(dir), { spec }));
	}
	const titles: [string, string] = [opts.titles?.[0] ?? "A안", opts.titles?.[1] ?? "B안"];
	const pair: [Report, Report] = [reports[0], reports[1]];
	return { titles, reports: pair, differs: diffReports(pair[0], pair[1]) };
}

function verdictLine(title: string, r: Report): string {
	const s = r.summary;
	return `- **${title}**: 실패 ${s.failures}건 · 시험한 입력 ${s.tested}개 · 시험 못 함 ${s.untestable}개`;
}

const cell = (s: { cls: MapClass | null; why: string }) =>
	s.cls === null
		? "없음"
		: `${CLASS_LABEL[s.cls]}${s.why ? ` (${s.why.replace(/\|/g, "\\|").replace(/\n/g, " ")})` : ""}`;

/** Markdown: one verdict line per option, the "what differs" table, then both maps. */
export function compareMarkdown(c: CompareResult): string {
	const [ta, tb] = c.titles;
	const [ra, rb] = c.reports;
	const lines = [
		`# 갈림길 비교: ${ta} / ${tb}`,
		"",
		`같은 누출 설명(${ra.spec ? "사용" : "없음"})으로 두 안을 실행해 공격한 결과입니다. 색은 엔진 보고서에서만 가져오며, 어느 안이 낫다는 판단은 하지 않습니다.`,
		"",
		verdictLine(ta, ra),
		verdictLine(tb, rb),
		"",
		"## 무엇이 다른가",
		"",
	];
	if (c.differs.length === 0) {
		lines.push("두 안에서 색이 달라지는 입력이 없습니다.", "");
	} else {
		lines.push(`| 회로 | 입력 | ${ta} | ${tb} |`, "| --- | --- | --- | --- |");
		for (const d of c.differs) {
			lines.push(`| ${d.circuit} | ${d.input || "(회로 전체)"} | ${cell(d.a)} | ${cell(d.b)} |`);
		}
		lines.push("");
	}
	lines.push(
		`## ${ta}`,
		"",
		"```mermaid",
		renderMermaid(ra, "a"),
		"```",
		"",
		`## ${tb}`,
		"",
		"```mermaid",
		renderMermaid(rb, "b"),
		"```",
		"",
		'통과는 "이 공격 목록으로 재현되지 않음"이지 안전하다는 뜻이 아닙니다. 색의 뜻은 `proofkit map`의 범례와 같습니다.',
		"",
	);
	return lines.join("\n");
}

/** JSON-friendly form: the reports are summarized, the rows kept whole. */
export function compareJson(c: CompareResult): unknown {
	return {
		titles: c.titles,
		summaries: c.reports.map((r) => r.summary),
		spec: c.reports[0].spec,
		differs: c.differs,
	};
}
