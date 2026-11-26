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

import type { Report } from "./attack.js";

const LABEL: Record<string, string> = {
	EXPOSED: "FAIL exposed",
	RECOVERABLE: "FAIL recoverable",
	PARTIAL: "FAIL partial",
	TAG: "tag (linkable)",
	MASKED: "masked",
	UNBOUND: "FAIL unbound",
};

/** Short human-readable report. Verdicts are copied from the report, never recomputed. */
export function formatText(r: Report): string {
	const lines: string[] = [];
	lines.push(`proof-kit ${r.version} — ${r.source ?? r.contract}`);
	lines.push(
		`compiler ${r.compilerVersion}, runtime ${r.runtimeVersion}, seed ${r.options.seed}, budget ${r.options.budget}`,
	);
	if (r.setup.constructor !== "defaults") lines.push(`setup: constructor ${r.setup.constructor}`);
	for (const w of r.setup.witnesses ?? []) lines.push(`setup: witness ${w}`);
	for (const [k, v] of Object.entries(r.setup.prefixes))
		lines.push(`setup: ${k} runs after ${v.join(", ")}`);
	for (const [k, v] of Object.entries(r.setup.args ?? {}))
		lines.push(`setup: ${k} base arguments ${v}`);
	for (const u of r.units) {
		if (u.status === "untestable") {
			lines.push(`\n[${u.circuit}] UNTESTABLE: ${u.reason}`);
			continue;
		}
		lines.push(`\n[${u.circuit}] ${u.inputs.length} hidden input(s), ${u.runs} runs, ${u.ms} ms`);
		for (const i of u.inputs) {
			if (i.status === "untestable") {
				lines.push(`  ${i.input} (${i.type}): UNTESTABLE — ${i.reason}`);
				continue;
			}
			if (i.reason) lines.push(`  ${i.input} (${i.type}): note — ${i.reason}`);
			if (i.findings.length === 0) {
				lines.push(`  ${i.input} (${i.type}): hidden in ${i.samples} samples`);
				continue;
			}
			for (const f of i.findings) {
				const label = !f.onChain
					? `caller-visible ${f.kind.toLowerCase()}`
					: f.disclosure === "declared"
						? `public (declared by disclose) ${f.kind.toLowerCase()}`
						: f.disclosure === "spec"
							? `public (allowed by spec) ${f.kind.toLowerCase()}`
							: f.evidence.setupWrote
								? `setup-written ${f.kind.toLowerCase()} (not a failure)`
								: LABEL[f.kind];
				const where =
					f.kind === "UNBOUND"
						? f.location
						: f.onChain
							? `${f.where} ${f.location}`
							: "return value (goes to the caller, not on chain)";
				const crit = f.criteria.length > 0 ? ` (criteria ${f.criteria.join(", ")})` : "";
				lines.push(
					`  ${i.input} (${i.type}): ${label} [${f.attack}] at ${where} — ${f.detail}${crit}`,
				);
			}
		}
	}
	if (r.pureCircuits.length > 0)
		lines.push(`\npure circuits (no transaction, not attacked): ${r.pureCircuits.join(", ")}`);
	if ((r.verifierChecks ?? []).length > 0) lines.push("");
	for (const v of r.verifierChecks ?? []) {
		lines.push(
			v.status === "ok"
				? `verifier check: ${v.input} → ${v.shareWith}: ok (${v.circuits.join(", ")})`
				: `verifier check: ${v.input} → ${v.shareWith}: MISSING: no commitment of this value on chain; the verifier cannot check the opening`,
		);
	}
	const s = r.summary;
	lines.push(
		`\n${s.failures} failure(s); ${s.tested} input(s) tested, ${s.untestable} untestable; ${s.runs} runs in ${s.ms} ms`,
	);
	lines.push("Pass means: not reproduced by this attack list. It does not mean safe.");
	return lines.join("\n");
}
