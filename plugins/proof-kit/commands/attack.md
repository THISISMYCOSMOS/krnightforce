---
name: proof-kit:attack
description: Run privacy attack tests on a Compact contract by executing it in the local simulator (A1 exposure, A2 recovery, A5 path). Writes attack-plan.md, proof-attack.test.ts and privacy-baseline.json. Verdicts come only from the engine output.
allowed-tools: Bash, Read, Glob, Grep, Write
argument-hint: "[path/to/contract.compact]"
---

Run privacy attack tests on a Compact contract. Load the `proof-kit:proof-attack` skill first and follow its rules.

## Step 1: Find the contract

If `$ARGUMENTS` gives a path, use it. Otherwise:

```bash
find . -name "*.compact" -not -path "*/node_modules/*" -not -path "*/managed/*"
```

Pick the top-level contracts (files with `export circuit` or a constructor). Confirm the list with the user when there is more than one.

## Step 2: Compile

```bash
compact compile --skip-zk <contract.compact> <out-dir>
```

If compilation fails, report the compiler error and stop. Do not guess what the contract would do.

## Step 3: Run the engine

```bash
npx --no-install proof-kit attack <out-dir> --source <contract.compact> --json
```

If the engine is not installed, tell the user how to install it and stop. Do not run attacks by hand and do not judge results yourself.

## Step 4: Report

Read the JSON. Report exactly what it says:

- failures (`EXPOSED`, `RECOVERABLE`, `PARTIAL`) with circuit, hidden input and the reproducing test name
- `UNTESTABLE` circuits with the engine's reason
- the list of files written

Never add findings the engine did not report, never call something "suspected", and never upgrade or downgrade a verdict. For fixes, use the `proof-kit:proof-spec` skill (fix patterns, pitfalls first).
