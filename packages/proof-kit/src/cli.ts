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

import { writeFileSync } from "node:fs";
import { attack } from "./attack.js";
import { formatText } from "./format.js";
import { loadCompiled } from "./harness.js";

const USAGE = `usage: proofkit attack <compiled-dir> [--source <file.compact>] [--json] [--out <file>]
                         [--budget <n>] [--seed <n>] [--circuit <name>]...

<compiled-dir> is the output directory given to \`compact compile\` (it holds contract/ and compiler/).
Exit code: 0 no failures, 1 failures found, 2 usage or load error.`;

async function main(argv: string[]): Promise<number> {
	const [cmd, dir, ...rest] = argv;
	if (cmd !== "attack" || !dir) {
		process.stderr.write(`${USAGE}\n`);
		return 2;
	}
	let source: string | undefined;
	let json = false;
	let out: string | undefined;
	let budget: number | undefined;
	let seed: number | undefined;
	const circuits: string[] = [];
	for (let i = 0; i < rest.length; i++) {
		const a = rest[i];
		if (a === "--json") json = true;
		else if (a === "--source") source = rest[++i];
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
	const report = await attack(compiled, {
		budget,
		seed,
		circuits: circuits.length ? circuits : undefined,
	});
	const text = json ? JSON.stringify(report, null, 2) : formatText(report);
	if (out) writeFileSync(out, `${text}\n`);
	else process.stdout.write(`${text}\n`);
	return report.summary.failures > 0 ? 1 : 0;
}

main(process.argv.slice(2)).then(
	(code) => process.exit(code),
	(e) => {
		process.stderr.write(`${(e as Error).stack ?? e}\n`);
		process.exit(2);
	},
);
