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

import { execFileSync, spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Report } from "./attack.js";
import { loadSpec } from "./spec.js";

/**
 * The bench: scenario pairs checked against their answer keys, and a corpus of
 * already-compiled contracts measured with the zero-config rule. Verdicts are the
 * engine's; this module only compares and counts.
 */

export interface ExpectedFinding {
	circuit: string;
	input: string;
	attack: string;
	kind: string;
	where: string;
}

export interface AnswerContract {
	path: string;
	variant: "holed" | "fixed";
	expectFailures: boolean;
	findings: ExpectedFinding[];
	intendedDisclosures: { circuit: string; input: string; reason?: string }[];
}

/** bench/schema/answer-key.schema.json */
export interface Answer {
	id: string;
	compilerVersion?: string;
	spec?: string;
	contracts: AnswerContract[];
}

export interface ContractCheck {
	variant: "holed" | "fixed";
	path: string;
	/** Expected findings (holed) found / total. */
	expected: number;
	found: number;
	missing: ExpectedFinding[];
	/** Failures reported for a version whose key expects none (fixed). */
	falseFailures: number;
	/** Failures on an input the key lists as an intended disclosure. */
	wrongDisclosures: number;
	untestableUnits: number;
	untestableInputs: number;
	testedInputs: number;
	verifierMissing: number;
	failures: number;
	/** Every rule of the answer key holds. */
	met: boolean;
}

/**
 * Compare one report with one answer-key entry. These are the rules the bench test
 * has always used: a fixed version has no failures; every expected finding appears as
 * a failure with the same circuit, input, attack, kind and where; no intended
 * disclosure fails; no unit is untestable.
 */
export function checkAgainstAnswer(report: Report, c: AnswerContract): ContractCheck {
	const failures = report.units.flatMap((u) =>
		u.inputs.flatMap((i) =>
			i.findings
				.filter((f) => f.failure)
				.map((f) => ({ circuit: u.circuit, input: i.input, ...f })),
		),
	);
	const missing = c.findings.filter(
		(e) =>
			!failures.some(
				(f) =>
					f.circuit === e.circuit &&
					f.input === e.input &&
					f.attack === e.attack &&
					f.kind === e.kind &&
					f.where === e.where,
			),
	);
	const wrongDisclosures = failures.filter((f) =>
		c.intendedDisclosures.some((d) => d.circuit === f.circuit && d.input === f.input),
	).length;
	const falseFailures = c.expectFailures ? 0 : failures.length;
	const untestableUnits = report.units.filter((u) => u.status === "untestable").length;
	return {
		variant: c.variant,
		path: c.path,
		expected: c.findings.length,
		found: c.findings.length - missing.length,
		missing,
		falseFailures,
		wrongDisclosures,
		untestableUnits,
		untestableInputs: report.summary.untestable,
		testedInputs: report.summary.tested,
		verifierMissing: report.summary.verifierMissing,
		failures: failures.length,
		met:
			falseFailures === 0 &&
			missing.length === 0 &&
			wrongDisclosures === 0 &&
			untestableUnits === 0,
	};
}

export interface ScenarioResult {
	id: string;
	contracts: ContractCheck[];
	/** Wall time per version, in milliseconds (child process included), by variant. */
	ms?: Record<string, number>;
	/** Set when a version could not be compiled or loaded. */
	error?: string;
}

export interface ScenarioBench {
	scenarios: ScenarioResult[];
	totals: {
		scenarios: number;
		keysMet: number;
		holedExpected: number;
		holedFound: number;
		/** holedFound / holedExpected, 0..1 (1 when nothing is expected). */
		detectionRate: number;
		fixedFalseFailures: number;
		wrongDisclosures: number;
		untestableInputs: number;
		testedInputs: number;
		/** untestable / (tested + untestable) inputs, 0..1. */
		untestableRate: number;
		untestableUnits: number;
		verifierMissing: number;
	};
}

export interface ScenarioOptions {
	/** Directory of scenario folders (default bench/scenarios). */
	scenarios: string;
	/**
	 * Where compiled versions live, as `<dir>/<id>__<variant>`. Missing ones are compiled
	 * there with $COMPACTC, `compactc` on PATH, or `compact compile`.
	 */
	compiled: string;
	/** Seconds each version may run before it counts as an error (default 180). */
	timeoutSeconds?: number;
	/** Never compile; report a missing compiled version as an error. */
	noCompile?: boolean;
}

function onPath(cmd: string): boolean {
	try {
		execFileSync(cmd, ["--version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function compile(src: string, out: string): void {
	const info = join(out, "compiler", "contract-info.json");
	if (existsSync(info) && statSync(info).mtimeMs > statSync(src).mtimeMs) return;
	mkdirSync(out, { recursive: true });
	const compactc = process.env.COMPACTC ?? (onPath("compactc") ? "compactc" : undefined);
	const [cmd, args] = compactc
		? [compactc, ["--skip-zk", src, out]]
		: ["compact", ["compile", "--skip-zk", src, out]];
	execFileSync(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
}

/** Run every scenario pair against its answer key. */
export async function runScenarios(opts: ScenarioOptions): Promise<ScenarioBench> {
	const root = resolve(opts.scenarios);
	const ids = readdirSync(root, { withFileTypes: true })
		.filter((d) => d.isDirectory() && existsSync(join(root, d.name, "answer.json")))
		.map((d) => d.name)
		.sort();
	const limit = opts.timeoutSeconds ?? DEFAULT_CORPUS_TIMEOUT_S;
	const scenarios: ScenarioResult[] = [];
	const tmp = mkdtempSync(join(tmpdir(), "proofkit-scenarios-"));
	try {
		for (const id of ids) {
			const dir = join(root, id);
			const answer = JSON.parse(readFileSync(join(dir, "answer.json"), "utf8")) as Answer;
			const result: ScenarioResult = { id, contracts: [], ms: {} };
			try {
				// Validate the spec here, so a broken one is reported once, not per child.
				const specPath = answer.spec ? join(dir, answer.spec) : null;
				if (specPath) loadSpec(specPath);
				for (const c of answer.contracts) {
					const out = join(resolve(opts.compiled), `${id}__${c.variant}`);
					if (!opts.noCompile) compile(join(dir, c.path), out);
					// Each version runs in its own process (as in corpus mode): a WASM trap
					// or a runaway attack in one cannot poison the next.
					const reportFile = join(tmp, `${id}__${c.variant}.json`);
					const t0 = performance.now();
					const res = await runChild(
						out,
						reportFile,
						limit * 1000,
						specPath ? ["--spec", specPath] : ["--no-spec"],
					);
					(result.ms as Record<string, number>)[c.variant] = Math.round(performance.now() - t0);
					if (res.timedOut) throw new Error(`${c.variant}: timed out after ${limit}s`);
					let report: Report;
					try {
						report = JSON.parse(readFileSync(reportFile, "utf8")) as Report;
					} catch {
						throw new Error(`${c.variant}: ${res.firstError || "no report"}`);
					}
					result.contracts.push(checkAgainstAnswer(report, c));
				}
			} catch (e) {
				result.error = String((e as Error).message ?? e)
					.split("\n")[0]
					.slice(0, 200);
			}
			scenarios.push(result);
		}
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
	const all = scenarios.flatMap((s) => s.contracts);
	const holed = all.filter((c) => c.variant === "holed");
	const holedExpected = holed.reduce((n, c) => n + c.expected, 0);
	const holedFound = holed.reduce((n, c) => n + c.found, 0);
	const testedInputs = all.reduce((n, c) => n + c.testedInputs, 0);
	const untestableInputs = all.reduce((n, c) => n + c.untestableInputs, 0);
	return {
		scenarios,
		totals: {
			scenarios: scenarios.length,
			keysMet: scenarios.filter((s) => !s.error && s.contracts.every((c) => c.met)).length,
			holedExpected,
			holedFound,
			detectionRate: holedExpected === 0 ? 1 : holedFound / holedExpected,
			fixedFalseFailures: all
				.filter((c) => c.variant === "fixed")
				.reduce((n, c) => n + c.falseFailures, 0),
			wrongDisclosures: all.reduce((n, c) => n + c.wrongDisclosures, 0),
			untestableInputs,
			testedInputs,
			untestableRate:
				testedInputs + untestableInputs === 0
					? 0
					: untestableInputs / (testedInputs + untestableInputs),
			untestableUnits: all.reduce((n, c) => n + c.untestableUnits, 0),
			verifierMissing: all.reduce((n, c) => n + c.verifierMissing, 0),
		},
	};
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

export function scenarioMarkdown(b: ScenarioBench): string {
	const t = b.totals;
	const lines = [
		"# proofkit bench: scenarios",
		"",
		`정답표 충족 ${t.keysMet}/${t.scenarios} · 구멍 판 탐지 ${t.holedFound}/${t.holedExpected} (${pct(t.detectionRate)}) · 고친 판 헛 실패 ${t.fixedFalseFailures} · 의도한 공개가 실패한 수 ${t.wrongDisclosures} · 시험 못 한 입력 ${t.untestableInputs}/${t.testedInputs + t.untestableInputs} (${pct(t.untestableRate)}) · 시험 못 한 회로 ${t.untestableUnits} · 검증자 확인 없음 ${t.verifierMissing}`,
		"",
		"| 시나리오 | 판 | 정답표 | 기대 실패 찾음 | 헛 실패 | 의도한 공개 실패 | 시험 못 함 (회로/입력) | 검증자 확인 없음 |",
		"| --- | --- | --- | --- | --- | --- | --- | --- |",
	];
	for (const s of b.scenarios) {
		if (s.error) {
			lines.push(`| ${s.id} | — | 오류 | ${s.error.replaceAll("|", "\\|")} | | | | |`);
			continue;
		}
		for (const c of s.contracts) {
			lines.push(
				`| ${s.id} | ${c.variant} | ${c.met ? "충족" : "**불충족**"} | ${c.found}/${c.expected} | ${c.falseFailures} | ${c.wrongDisclosures} | ${c.untestableUnits}/${c.untestableInputs} | ${c.verifierMissing} |`,
			);
			for (const m of c.missing) {
				lines.push(
					`| | | 놓침 | ${m.circuit} ${m.input} ${m.attack} ${m.kind} ${m.where} | | | | |`,
				);
			}
		}
	}
	lines.push(
		"",
		"직접 만든 시나리오라 회귀 시험 역할입니다. 탐지력의 근거는 처음 보는 레포 측정(`--corpus`)에서 나와야 합니다.",
	);
	return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Corpus mode

export interface CorpusRow {
	/** Path relative to the corpus root. Private: may name a third-party repo. */
	path: string;
	status: "ok" | "load error" | "timeout";
	error?: string;
	circuits: number;
	untestableUnits: number;
	tested: number;
	untestable: number;
	failures: number;
	/** "A2 RECOVERABLE" → count. */
	byKind: Record<string, number>;
}

export interface CorpusBench {
	/** Aggregates only: safe to print. */
	totals: {
		contracts: number;
		loadErrors: number;
		timeouts: number;
		circuits: number;
		untestableUnits: number;
		inputsTested: number;
		inputsUntestable: number;
		failures: number;
		contractsWithFailure: number;
		byKind: Record<string, number>;
	};
	/** Per-contract rows: write them only to a private file. */
	rows: CorpusRow[];
}

/** Compiled contract dirs under `root`: any dir holding compiler/contract-info.json. */
export function findCompiled(root: string): string[] {
	const out: string[] = [];
	const walk = (dir: string) => {
		if (existsSync(join(dir, "compiler", "contract-info.json"))) {
			out.push(dir);
			return;
		}
		let entries: { name: string; isDirectory(): boolean }[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			if (!e.isDirectory() || e.name === "node_modules" || e.name.startsWith(".")) continue;
			walk(join(dir, e.name));
		}
	};
	walk(resolve(root));
	return out.sort();
}

/** Default per-contract limit for corpus mode, in seconds. */
export const DEFAULT_CORPUS_TIMEOUT_S = 180;

export interface CorpusOptions {
	/** Seconds each contract may run before it counts as a timeout (default 180). */
	timeoutSeconds?: number;
}

/**
 * How to start this package's CLI in a child: the built `cli.js` next to this file, or
 * `cli.ts` under the tsx loader when running from source. Parent execArgv is carried over
 * (so `npx tsx` and the built CLI both work).
 */
function cliArgs(): string[] {
	const here = fileURLToPath(import.meta.url);
	const fromSrc = here.endsWith(".ts");
	const cli = join(here, "..", fromSrc ? "cli.ts" : "cli.js");
	const args = [...process.execArgv];
	if (fromSrc && !args.some((a) => a.includes("tsx"))) {
		args.push("--import", pathToFileURL(createRequire(import.meta.url).resolve("tsx/esm")).href);
	}
	return [...args, cli];
}

interface ChildResult {
	timedOut: boolean;
	/** First line of stderr, only used when no report came back. */
	firstError: string;
}

/** Run one attack in its own process; stdout and stderr are captured, never forwarded. */
function runChild(
	dir: string,
	out: string,
	timeoutMs: number,
	specArgs: string[] = ["--no-spec"],
): Promise<ChildResult> {
	const args = cliArgs();
	return new Promise((done) => {
		let stderr = "";
		let timedOut = false;
		const child = spawn(
			process.execPath,
			[...args, "attack", dir, ...specArgs, "--json", "--out", out],
			{ stdio: ["ignore", "ignore", "pipe"] },
		);
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, timeoutMs);
		child.stderr.on("data", (d: Buffer) => {
			if (stderr.length < 4096) stderr += d.toString();
		});
		const finish = (extra = "") => {
			clearTimeout(timer);
			const line = (stderr || extra).split("\n").find((l) => l.trim()) ?? "";
			done({ timedOut, firstError: line.slice(0, 200) });
		};
		child.on("error", (e) => finish(String(e.message)));
		child.on("close", () => finish());
	});
}

/**
 * Attack every compiled contract under `root` without a spec (the zero-config rule).
 * Each contract runs in a child process, so a trapped WASM runtime or a runaway circuit
 * cannot affect the next one; child output is captured and dropped.
 */
export async function runCorpus(root: string, opts: CorpusOptions = {}): Promise<CorpusBench> {
	const limit = opts.timeoutSeconds ?? DEFAULT_CORPUS_TIMEOUT_S;
	const rows: CorpusRow[] = [];
	const tmp = mkdtempSync(join(tmpdir(), "proofkit-corpus-"));
	// The temp dir holds full per-contract reports (private data): remove it on Ctrl-C too.
	const cleanup = () => rmSync(tmp, { recursive: true, force: true });
	const onSignal = (sig: NodeJS.Signals) => {
		cleanup();
		process.kill(process.pid, sig);
	};
	process.once("SIGINT", onSignal);
	process.once("SIGTERM", onSignal);
	try {
		for (const dir of findCompiled(root)) {
			const row: CorpusRow = {
				path: relative(resolve(root), dir) || ".",
				status: "ok",
				circuits: 0,
				untestableUnits: 0,
				tested: 0,
				untestable: 0,
				failures: 0,
				byKind: {},
			};
			const out = join(tmp, `${rows.length}.json`);
			const res = await runChild(dir, out, limit * 1000);
			if (res.timedOut) {
				row.status = "timeout";
				row.error = `timed out after ${limit}s`;
			} else {
				try {
					const r = JSON.parse(readFileSync(out, "utf8")) as Report;
					row.circuits = r.units.filter((u) => u.circuit !== "<constructor>").length;
					row.untestableUnits = r.units.filter((u) => u.status === "untestable").length;
					row.tested = r.summary.tested;
					row.untestable = r.summary.untestable;
					row.failures = r.summary.failures;
					for (const u of r.units)
						for (const i of u.inputs)
							for (const f of i.findings) {
								if (!f.failure) continue;
								const k = `${f.attack} ${f.kind}`;
								row.byKind[k] = (row.byKind[k] ?? 0) + 1;
							}
				} catch {
					row.status = "load error";
					row.error = res.firstError || "no report";
				}
			}
			rows.push(row);
		}
	} finally {
		process.off("SIGINT", onSignal);
		process.off("SIGTERM", onSignal);
		cleanup();
	}
	const ok = rows.filter((r) => r.status === "ok");
	const byKind: Record<string, number> = {};
	for (const r of ok)
		for (const [k, n] of Object.entries(r.byKind)) byKind[k] = (byKind[k] ?? 0) + n;
	return {
		totals: {
			contracts: rows.length,
			loadErrors: rows.filter((r) => r.status === "load error").length,
			timeouts: rows.filter((r) => r.status === "timeout").length,
			circuits: ok.reduce((n, r) => n + r.circuits, 0),
			untestableUnits: ok.reduce((n, r) => n + r.untestableUnits, 0),
			inputsTested: ok.reduce((n, r) => n + r.tested, 0),
			inputsUntestable: ok.reduce((n, r) => n + r.untestable, 0),
			failures: ok.reduce((n, r) => n + r.failures, 0),
			contractsWithFailure: ok.filter((r) => r.failures > 0).length,
			byKind,
		},
		rows,
	};
}

/** Aggregates only, no contract names or paths. */
export function corpusMarkdown(b: CorpusBench): string {
	const t = b.totals;
	const inputs = t.inputsTested + t.inputsUntestable;
	const lines = [
		"# proofkit bench: corpus (zero-config, no spec)",
		"",
		"| 항목 | 값 |",
		"| --- | --- |",
		`| 계약 | ${t.contracts} (불러오기 오류 ${t.loadErrors}, 시간 초과 ${t.timeouts}) |`,
		`| 회로 | ${t.circuits} (시험 못 함 ${t.untestableUnits}) |`,
		`| 입력 | 시험함 ${t.inputsTested}, 시험 못 함 ${t.inputsUntestable}${inputs ? ` (${pct(t.inputsUntestable / inputs)})` : ""} |`,
		`| 실패 | ${t.failures} (실패가 하나라도 있는 계약 ${t.contractsWithFailure}) |`,
	];
	for (const [k, n] of Object.entries(t.byKind).sort()) lines.push(`| 실패: ${k} | ${n} |`);
	lines.push(
		"",
		"계약별 행은 `--out` 파일에만 씁니다(제3자 레포 이름이 공개 기록에 남지 않게, `private/`에 두세요). 검증자 확인은 누출 설명이 없어 해당 없습니다.",
	);
	return `${lines.join("\n")}\n`;
}
