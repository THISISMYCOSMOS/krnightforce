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

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** The leakage description (docs/design-guide.md chapter 2): what a contract may reveal. */
export interface PrivacySpec {
	contract?: string;
	hidden?: { input: string; range?: string; why?: string }[];
	mayReveal?: {
		circuit: string;
		input: string;
		kind: "value" | "fact" | "path";
		fact?: string;
		why?: string;
	}[];
	acceptedLeakage?: string[];
	unlinkable?: { actions: string[]; why?: string }[];
	vouchedBy?: { input: string; by: string; how?: string }[];
}

export interface LoadedSpec {
	path: string;
	spec: PrivacySpec;
	/** Inclusive numeric ranges from `hidden[].range`, by input id. */
	ranges: Map<string, [bigint, bigint]>;
}

export function loadSpec(path: string): LoadedSpec {
	const abs = resolve(path);
	const spec = JSON.parse(readFileSync(abs, "utf8")) as PrivacySpec;
	for (const m of spec.mayReveal ?? []) {
		if (!["value", "fact", "path"].includes(m.kind)) {
			throw new Error(`${abs}: mayReveal kind must be value, fact or path (got ${m.kind})`);
		}
	}
	const ranges = new Map<string, [bigint, bigint]>();
	for (const h of spec.hidden ?? []) {
		const m = /^\s*(\d+)\s*\.\.\s*(\d+)\s*$/.exec(h.range ?? "");
		if (m) ranges.set(h.input, [BigInt(m[1]), BigInt(m[2])]);
	}
	return { path: abs, spec, ranges };
}

/** `privacy-spec.json` next to the contract source, if there is one. */
export function findSpec(sourceFile: string | null): string | null {
	if (!sourceFile) return null;
	const p = join(dirname(sourceFile), "privacy-spec.json");
	return existsSync(p) ? p : null;
}

/** Whether `mayReveal` allows this finding. A struct field is covered by its parent input. */
export function covers(
	spec: PrivacySpec,
	circuit: string,
	input: string,
	f: { kind: string; where: string },
): boolean {
	return (spec.mayReveal ?? []).some((m) => {
		if (m.circuit !== circuit) return false;
		if (m.input !== input && !input.startsWith(`${m.input}.`)) return false;
		if (m.kind === "value") return f.kind === "EXPOSED" || f.kind === "RECOVERABLE";
		if (m.kind === "fact") return f.kind === "PARTIAL";
		return f.where === "path";
	});
}
