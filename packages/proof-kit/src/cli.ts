#!/usr/bin/env node
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

import { readFileSync, writeFileSync } from "node:fs";
import { type Report, attack } from "./attack.js";
import { corpusMarkdown, runCorpus, runScenarios, scenarioMarkdown } from "./bench.js";
import { formatText } from "./format.js";
import { loadCompiled } from "./harness.js";
import { renderMapMarkdown } from "./map.js";
import { findSpec, loadSpec } from "./spec.js";

const USAGE = `usage: proofkit attack <compiled-dir> [--source <file.compact>] [--json] [--out <file>]
                         [--spec <privacy-spec.json> | --no-spec]
                         [--budget <n>] [--seed <n>] [--circuit <name>]...

       proofkit map <report.json | compiled-dir> [<report.json | compiled-dir>]
                    [--title <a> [--title <b>]] [--heading <h>] [--spec <file> | --no-spec] [--out <file.md>]

       proofkit bench [--scenarios <dir>] [--compiled <dir>] [--no-compile] [--json] [--out <file>]
       proofkit bench --corpus <dir> [--json] [--out <private-file>]

Without --spec, privacy-spec.json next to the contract source is used if present.
\`bench\` checks each scenario pair in bench/scenarios against its answer.json (compiling into
.proofkit-cache/bench with $COMPACTC, compactc or compact); exit 1 if any key is not met.
\`bench --corpus\` attacks every compiled contract under <dir> without a spec and prints aggregates
only; per-contract rows (which may name third-party repos) go to --out, meant for private/.
\`map\` draws the privacy map (Mermaid in Markdown) from attack reports; give two to put a
holed and a fixed version side by side. A compiled-dir is attacked first.
<compiled-dir> is the output directory given to \`compact compile\` (it holds contract/ and compiler/).
Exit code: 0 no failures, 1 failures found, 2 usage or load error.`;

async function main(argv: string[]): Promise<number> {
	const [cmd, dir, ...rest] = argv;
	if (cmd === "map" && dir) return mapMain([dir, ...rest]);
	if (cmd === "bench") return benchMain(argv.slice(1));
	if (cmd !== "attack" || !dir) {
		process.stderr.write(`${USAGE}\n`);
		return 2;
	}
	let source: string | undefined;
	let specPath: string | undefined;
	let noSpec = false;
	let json = false;
	let out: string | undefined;
	let budget: number | undefined;
	let seed: number | undefined;
	const circuits: string[] = [];
	for (let i = 0; i < rest.length; i++) {
		const a = rest[i];
		if (a === "--json") json = true;
		else if (a === "--source") source = rest[++i];
		else if (a === "--spec") specPath = rest[++i];
		else if (a === "--no-spec") noSpec = true;
		else if (a === "--out") out = rest[++i];
		else if (a === "--budget") budget = Number(rest[++i]);
		else if (a === "--seed") seed = Number(rest[++i]);
		else if (a === "--circuit") circuits.push(rest[++i]);
		else {
			process.stderr.write(`unknown option ${a}\n${USAGE}\n`);
			return 2;
		}
	}
	let compiled: Awaited<ReturnType<typeof loadCompiled>>;
	try {
		compiled = await loadCompiled(dir, source);
	} catch (e) {
		process.stderr.write(`cannot load ${dir}: ${(e as Error).message}\n`);
		return 2;
	}
	let spec = null;
	try {
		const p = noSpec ? null : (specPath ?? findSpec(compiled.sourceFile));
		spec = p ? loadSpec(p) : null;
	} catch (e) {
		process.stderr.write(`cannot read spec: ${(e as Error).message}\n`);
		return 2;
	}
	const report = await attack(compiled, {
		spec,
		budget,
		seed,
		circuits: circuits.length ? circuits : undefined,
	});
	const text = json ? JSON.stringify(report, null, 2) : formatText(report);
	if (out) writeFileSync(out, `${text}\n`);
	else process.stdout.write(`${text}\n`);
	return report.summary.failures > 0 ? 1 : 0;
}

async function benchMain(args: string[]): Promise<number> {
	let scenarios = "bench/scenarios";
	let compiled = ".proofkit-cache/bench";
	let corpus: string | undefined;
	let noCompile = false;
	let json = false;
	let out: string | undefined;
	const withValue = ["--scenarios", "--compiled", "--corpus", "--out"];
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (withValue.includes(a) && (args[i + 1] === undefined || args[i + 1].startsWith("--"))) {
			process.stderr.write(`${a} needs a value\n${USAGE}\n`);
			return 2;
		}
		if (a === "--scenarios") scenarios = args[++i];
		else if (a === "--compiled") compiled = args[++i];
		else if (a === "--corpus") corpus = args[++i];
		else if (a === "--no-compile") noCompile = true;
		else if (a === "--json") json = true;
		else if (a === "--out") out = args[++i];
		else {
			process.stderr.write(`unknown option ${a}\n${USAGE}\n`);
			return 2;
		}
	}
	if (corpus) {
		const b = await runCorpus(corpus);
		// Stdout gets aggregates only; rows may name third-party repos.
		process.stdout.write(json ? `${JSON.stringify(b.totals, null, 2)}\n` : corpusMarkdown(b));
		if (out) {
			try {
				writeFileSync(out, `${JSON.stringify(b, null, 2)}\n`);
			} catch {
				// Do not print the error: its message carries only the out path, but keep the log clean.
				process.stderr.write("cannot write the --out file\n");
				return 2;
			}
		}
		// Nothing measured is a broken run, not a clean one.
		const t = b.totals;
		return t.contracts === 0 || t.loadErrors === t.contracts ? 2 : 0;
	}
	const b = await runScenarios({ scenarios, compiled, noCompile });
	const text = json ? `${JSON.stringify(b, null, 2)}\n` : scenarioMarkdown(b);
	if (out) writeFileSync(out, text);
	else process.stdout.write(text);
	return b.totals.keysMet === b.totals.scenarios ? 0 : 1;
}

async function mapMain(args: string[]): Promise<number> {
	const sources: string[] = [];
	const titles: string[] = [];
	let heading: string | undefined;
	let specPath: string | undefined;
	let noSpec = false;
	let out: string | undefined;
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (a === "--title") titles.push(args[++i]);
		else if (a === "--heading") heading = args[++i];
		else if (a === "--spec") specPath = args[++i];
		else if (a === "--no-spec") noSpec = true;
		else if (a === "--out") out = args[++i];
		else if (a.startsWith("--")) {
			process.stderr.write(`unknown option ${a}\n${USAGE}\n`);
			return 2;
		} else sources.push(a);
	}
	if (sources.length < 1 || sources.length > 2) {
		process.stderr.write(`${USAGE}\n`);
		return 2;
	}
	const maps: { title: string; report: Report }[] = [];
	for (const [i, src] of sources.entries()) {
		let report: Report;
		try {
			if (src.endsWith(".json")) report = JSON.parse(readFileSync(src, "utf8")) as Report;
			else {
				const compiled = await loadCompiled(src);
				const p = noSpec ? null : (specPath ?? findSpec(compiled.sourceFile));
				report = await attack(compiled, { spec: p ? loadSpec(p) : null });
			}
		} catch (e) {
			process.stderr.write(`cannot read ${src}: ${(e as Error).message}\n`);
			return 2;
		}
		const fallback = sources.length === 2 ? (i === 0 ? "구멍 판" : "고친 판") : "결과";
		maps.push({ title: titles[i] ?? fallback, report });
	}
	const md = renderMapMarkdown(maps, heading);
	if (out) writeFileSync(out, md);
	else process.stdout.write(md);
	return 0;
}

main(process.argv.slice(2)).then(
	(code) => process.exit(code),
	(e) => {
		process.stderr.write(`${(e as Error).stack ?? e}\n`);
		process.exit(2);
	},
);
