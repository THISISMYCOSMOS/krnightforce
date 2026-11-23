// This file is part of krnightforce.
// Copyright (C) krnightforce contributors
// SPDX-License-Identifier: Apache-2.0
// Compiles test/fixtures/*.compact into test/fixtures/managed/<name> with --skip-zk.
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
for (const f of readdirSync(dir).filter((f) => f.endsWith(".compact"))) {
	const src = join(dir, f);
	const out = join(dir, "managed", basename(f, ".compact"));
	const info = join(out, "compiler", "contract-info.json");
	if (existsSync(info) && statSync(info).mtimeMs > statSync(src).mtimeMs) continue;
	const [cmd, args] = compactc ? [compactc, ["--skip-zk", src, out]] : ["compact", ["compile", "--skip-zk", src, out]];
	process.stdout.write(`compile ${f}\n`);
	execFileSync(cmd, args, { stdio: "inherit" });
}
