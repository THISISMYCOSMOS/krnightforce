---
name: proof:proof-attack
description: Use when checking whether values a Compact (Midnight) contract means to hide really stay hidden on chain — running privacy attack tests, reading proof-kit engine results, drawing the privacy map, or answering "does this contract leak X?". Verdicts come only from executing the contract in the local simulator.
version: 0.0.1
---

# Proof Kit: privacy attack tests

The proof-kit engine runs a compiled Compact contract in the local simulator and attacks it. It decides pass or fail. You run it, read its JSON, and explain it. You never judge privacy yourself.

## When NOT to use

- Access-control and witness-trust audits (`ownPublicKey()` gating, unchecked witnesses, missing authorization): use `compact-core:audit-compact`.
- Deciding what to hide or how to fix a leak: use `proof:proof-spec` (design guide and fix patterns).
- Fee addresses, unshielded tokens, network metadata, wallets, proving servers: out of scope. Say so.
- Compile errors about `disclose()`: that is the compiler's job; fix the compile first.

## Pitfalls (read first)

1. **Do not reason about leaks from the source.** "This hash looks unsalted" is not a finding. Only engine verdicts are findings.
2. **Never write "suspected", "possible" or "may leak".** If the engine did not reproduce it, it is not reported.
3. **A pass is not "safe".** Say "not reproduced by this attack list".
4. **`UNTESTABLE` is not a pass.** Report it in its own list with the engine's reason.
5. **`TAG` is not a failure by itself.** It is a deterministic public tag of a high-entropy value; it matters only for linking (A3).
6. **Do not edit the generated test file to make it pass.** Fix the contract, or record an intended disclosure with `proofkit accept <item> --reason "..."`.
7. **Do not change engine settings to hide a failure.** Settings choose which attacks run; they never change a verdict.

## Running

```bash
compact compile --skip-zk <contract.compact> <out-dir>
npx --no-install proofkit attack <out-dir> --source <contract.compact> --json
```

## Reading the JSON

The report has `units` (one per circuit, plus `<constructor>`). Each unit has `status` (`tested` or `untestable` with a `reason`) and `inputs`. Each input has `input` (`witness:<name>` or `arg:<name>`, struct fields as `.field`), `type`, `entropy`, `status`, and `findings`. Each finding has:

- `kind`: `EXPOSED`, `RECOVERABLE`, `PARTIAL`, `TAG`, `MASKED`
- `where`: `value`, `path`, `ledger` (constructor state) or `result` (return value)
- `location`: transcript op index (`op 3`), ledger cell (`cell 1`), `shape` or `result`
- `attack`: `A1`, `A2` or `A5`
- `derived` (`hash` / `direct`), `disclosure` (`declared` / `spec` / null)
- `onChain`, `failure`, `criteria` (design criteria a failure breaks), `detail`, `evidence`

Only `failure: true` counts. See `references/verdicts.md`.

Report in this order:

1. Failures: circuit, input, kind, where/location, detail.
2. Untestable units and inputs, with the engine's reason.
3. Passes: counts only.
4. Files written (planned: `attack-plan.md`, `proof-attack.test.ts`, `privacy-baseline.json`).

> Status: the engine writes the JSON and text report and reads `privacy-spec.json` (`--spec`) today. The test file, attack plan, baseline and `accept` are planned (see `docs/plan.md`).

## Baseline (ratchet)

The first run records `privacy-baseline.json` and does not fail; existing failures stay visible as "at risk". Later runs fail only on NEW failures. An intended disclosure is accepted with a reason, which goes into the README "Privacy" section.

## Tests outlive the plugin

`proof-attack.test.ts` is a plain vitest file. It runs in `npm test`, pre-push and CI without this plugin. Tell the user to commit it.
