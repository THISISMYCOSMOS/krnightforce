// This file is part of krnightforce.
// Copyright (C) krnightforce contributors
// SPDX-License-Identifier: Apache-2.0
// Compiles test/fixtures/*.compact into test/fixtures/managed/<name>, and the bench
// scenario pairs into test/fixtures/managed/scenarios/<name>__<variant>, with --skip-zk.
// Uses the compiler at $COMPACTC, else `compactc` on PATH, else `compact compile`.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const dir = new URL("../test/fixtures/", import.meta.url).pathname;
function onPath(cmd) {
	try {
		execFileSync(cmd, ["--version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}
const compactc = process.env.COMPACTC ?? (onPath("compactc") ? "compactc" : undefined);
function compile(src, out) {
	const info = join(out, "compiler", "contract-info.json");
	if (existsSync(info) && statSync(info).mtimeMs > statSync(src).mtimeMs) return;
	const [cmd, args] = compactc
		? [compactc, ["--skip-zk", src, out]]
		: ["compact", ["compile", "--skip-zk", src, out]];
	process.stdout.write(`compile ${src}\n`);
	execFileSync(cmd, args, { stdio: "inherit" });
}

for (const f of readdirSync(dir).filter((f) => f.endsWith(".compact"))) {
	compile(join(dir, f), join(dir, "managed", basename(f, ".compact")));
}

// Scenario pairs from bench/scenarios: managed/scenarios/<name>__<variant>.
const scenarios = new URL("../../../bench/scenarios/", import.meta.url).pathname;
for (const name of readdirSync(scenarios)) {
	for (const variant of ["holed", "fixed"]) {
		const vdir = join(scenarios, name, variant);
		if (!existsSync(vdir)) continue;
		for (const f of readdirSync(vdir).filter((f) => f.endsWith(".compact"))) {
			compile(join(vdir, f), join(dir, "managed", "scenarios", `${name}__${variant}`));
		}
	}
}
