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

import type { Finding, InputReport, Report, UnitReport } from "./attack.js";

/**
 * The privacy map: hidden value → circuit → what lands on chain, as Mermaid.
 * Every color is copied from fields of the engine report (failure, disclosure,
 * kind, onChain, status); nothing is recomputed from the contract or judged here.
 * Colors follow plugins/proof-kit/skills/proof-attack/references/verdicts.md.
 */
export type MapClass = "risk" | "untested" | "public" | "proof" | "hidden";

/** Korean names of the map colors, in the order of the legend. */
export const CLASS_LABEL: Record<MapClass, string> = {
	hidden: "숨김",
	proof: "증명만",
	public: "공개",
	risk: "위험",
	untested: "시험 못 함",
};

const CLASS_STYLE: Record<MapClass, string> = {
	hidden: "fill:#d9f2e0,stroke:#2e7d4f,color:#123",
	proof: "fill:#dce8fa,stroke:#2f5fa7,color:#123",
	public: "fill:#fff1c2,stroke:#a07800,color:#321",
	risk: "fill:#fbd5d5,stroke:#b42318,color:#300,stroke-width:2px",
	untested: "fill:#e6e6e6,stroke:#777,color:#333,stroke-dasharray:4 3",
};

/** Higher wins when one input has several outcomes (risk first, then not tested). */
const RANK: Record<MapClass, number> = { risk: 4, untested: 3, public: 2, proof: 1, hidden: 0 };

export interface MapRow {
	circuit: string;
	input: string;
	cls: MapClass;
	/** Short reason taken from the deciding findings, e.g. "A2 recoverable". */
	why: string;
}

const kindText = (f: Finding) => `${f.attack} ${f.kind.toLowerCase()}`;

/** The color of one input in one circuit, from its report fields only. */
export function classify(input: InputReport): { cls: MapClass; why: string } {
	const pick = (fs: Finding[]) => [...new Set(fs.map(kindText))].join(", ");
	// A failure outranks "not tested": T2 can fail an input whose whole-value runs all failed.
	const failures = input.findings.filter((f) => f.failure);
	if (failures.length > 0) return { cls: "risk", why: pick(failures) };
	if (input.status === "untestable") return { cls: "untested", why: input.reason ?? "" };
	const disclosed = input.findings.filter((f) => f.disclosure !== null);
	if (disclosed.length > 0) {
		const how = disclosed.some((f) => f.disclosure === "spec")
			? "누출 설명이 허용"
			: "disclose 선언";
		return { cls: "public", why: `${how}: ${pick(disclosed)}` };
	}
	const masked = input.findings.filter(
		(f) => f.onChain && (f.kind === "MASKED" || f.kind === "TAG"),
	);
	if (masked.length > 0) return { cls: "proof", why: pick(masked) };
	return { cls: "hidden", why: "체인에서 차이 없음" };
}

/** One row per (circuit, input) the report covers; untestable circuits get one row. */
export function mapRows(report: Report): MapRow[] {
	const rows: MapRow[] = [];
	for (const u of report.units) {
		if (u.status === "untestable") {
			rows.push({ circuit: u.circuit, input: "", cls: "untested", why: u.reason ?? "" });
			continue;
		}
		for (const i of u.inputs) rows.push({ circuit: u.circuit, input: i.input, ...classify(i) });
	}
	return rows;
}

/** The color of each input across all circuits: the highest-ranked outcome. */
export function inputClasses(report: Report): Map<string, MapClass> {
	const out = new Map<string, MapClass>();
	for (const r of mapRows(report)) {
		if (!r.input) continue;
		const prev = out.get(r.input);
		if (!prev || RANK[r.cls] > RANK[prev]) out.set(r.input, r.cls);
	}
	return out;
}

/** Mermaid-safe node id. */
function nodeId(prefix: string, name: string, n: number): string {
	return `${prefix}${n}_${name.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

/** Mermaid-safe label text (quoted string, entity codes for special characters). */
function label(text: string): string {
	const esc = text
		.replace(/&/g, "#amp;")
		.replace(/"/g, "#quot;")
		.replace(/</g, "#lt;")
		.replace(/>/g, "#gt;")
		.replace(/\n/g, "<br/>");
	return `"${esc}"`;
}

const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A Mermaid flowchart for one report. `key` keeps ids unique when two maps share a page. */
export function renderMermaid(report: Report, key = "m"): string {
	const units: UnitReport[] = report.units.filter(
		(u) => u.status === "untestable" || u.inputs.length > 0,
	);
	const inputs = inputClasses(report);
	const inputIds = new Map<string, string>();
	const lines: string[] = ["flowchart LR"];
	lines.push(`  subgraph ${key}_in[${label("숨긴 값")}]`);
	let n = 0;
	const shared = new Map((report.verifierChecks ?? []).map((v) => [v.input, v]));
	for (const [input, cls] of inputs) {
		const id = nodeId(`${key}_i`, input, n++);
		inputIds.set(input, id);
		const v = shared.get(input);
		const text = v
			? `${input}\n검증자: ${v.shareWith}${v.status === "missing" ? " (체인에 커밋 없음)" : ""}`
			: input;
		lines.push(`    ${id}[${label(text)}]:::${cls}`);
	}
	lines.push("  end");
	lines.push(`  subgraph ${key}_c[${label("회로")}]`);
	const circuitIds = new Map<string, string>();
	for (const u of units) {
		const id = nodeId(`${key}_c`, u.circuit, n++);
		circuitIds.set(u.circuit, id);
		const text =
			u.status === "untestable" ? `${u.circuit}\n시험 못 함: ${short(u.reason ?? "")}` : u.circuit;
		lines.push(`    ${id}[${label(text)}]${u.status === "untestable" ? ":::untested" : ""}`);
	}
	lines.push("  end");
	lines.push(`  subgraph ${key}_o[${label("체인에 남는 것")}]`);
	const edges: string[] = [];
	for (const r of mapRows(report)) {
		if (!r.input) continue;
		const id = nodeId(`${key}_o`, `${r.circuit}_${r.input}`, n++);
		const name = r.input.replace(/^(witness|arg):/, "");
		lines.push(`    ${id}[${label(`${name}: ${CLASS_LABEL[r.cls]}\n${short(r.why)}`)}]:::${r.cls}`);
		edges.push(`  ${inputIds.get(r.input)} --> ${circuitIds.get(r.circuit)} --> ${id}`);
	}
	lines.push("  end");
	lines.push(...edges);
	for (const [cls, style] of Object.entries(CLASS_STYLE)) lines.push(`  classDef ${cls} ${style}`);
	return lines.join("\n");
}

function summaryLine(r: Report): string {
	const s = r.summary;
	const missing = s.verifierMissing ? ` · 검증자가 대조할 커밋 없음 ${s.verifierMissing}개` : "";
	return `실패 ${s.failures}건 · 시험한 입력 ${s.tested}개 · 시험 못 함 ${s.untestable}개 · 누출 설명 ${r.spec ? "사용" : "없음"}${missing}`;
}

const LEGEND = [
	"| 색 | 뜻 (엔진 보고서의 어느 칸에서 오는가) |",
	"| --- | --- |",
	"| 숨김 | 값을 바꿔도 체인에 남는 것이 달라지지 않음 |",
	"| 증명만 | 체인에 남지만 nonce·비밀로 가려짐 (`MASKED`, `TAG`) |",
	"| 공개 | 드러나지만 누출 설명이 허용했거나 코드가 `disclose()`로 선언함 (`disclosure`) |",
	"| 위험 | 실패 (`failure: true`: `EXPOSED`, `RECOVERABLE`, `PARTIAL`, `UNBOUND`) |",
	"| 시험 못 함 | 엔진이 돌리지 못함 (`untestable`). 통과가 아님 |",
	"",
	'"검증자: …"가 붙은 값은 누출 설명의 `shareWith`로, 그 상대에게만 opening(값 + nonce)을 장부 밖으로 건넵니다. 색은 공개 장부 기준입니다. "체인에 커밋 없음"이면 상대가 opening을 대조할 커밋이 체인에 없습니다.',
	"",
	'한 값이 여러 회로에 쓰이면, 왼쪽 칸의 색은 가장 나쁜 결과(위험 > 시험 못 함 > 공개 > 증명만 > 숨김)를 따릅니다. 통과는 "이 공격 목록으로 재현되지 않음"이지 안전하다는 뜻이 아닙니다.',
].join("\n");

/** One Markdown page: a map per report, with a legend. */
export function renderMapMarkdown(
	maps: { title: string; report: Report }[],
	heading = "프라이버시 지도",
): string {
	const parts = [
		`# ${heading}`,
		"",
		"숨긴 값 → 회로 → 체인에 남는 것. 색은 `proofkit attack` 보고서에서만 가져옵니다.",
		"",
	];
	maps.forEach((m, i) => {
		parts.push(
			`## ${m.title}`,
			"",
			summaryLine(m.report),
			"",
			"```mermaid",
			renderMermaid(m.report, `m${i}`),
			"```",
			"",
		);
	});
	parts.push("## 범례", "", LEGEND, "");
	return parts.join("\n");
}
