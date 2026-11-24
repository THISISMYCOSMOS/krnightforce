---
name: proof:proof-map
description: Use when drawing or explaining the privacy map of a Compact (Midnight) contract — "hidden value → circuit → what lands on chain" as a Mermaid diagram colored from proof-kit attack results — or when comparing a holed and a fixed version side by side. Colors come only from the engine report.
version: 0.0.1
---

# Proof Kit: privacy map

The map shows each hidden input, the circuits that use it, and what each circuit leaves on chain. Every color is copied from the proof-kit engine report (`proofkit attack --json`). You run the command and explain the picture; you never color anything yourself.

## When NOT to use

- Deciding what should be hidden or how to fix a leak: use `proof:proof-spec`.
- Running attacks or reading individual findings: use `proof:proof-attack`.
- Network, wallet, proving-server or fee privacy: out of scope. Say so.

## Pitfalls (read first)

1. **Never color a node from the source code.** No report, no map: run `/proof:attack` first.
2. **Gray (시험 못 함) is not a pass.** Name the engine's reason.
3. **Green or blue is not "safe".** It means "not reproduced by this attack list".
4. **One input, several circuits**: the left node takes the worst outcome (위험 > 시험 못 함 > 공개 > 증명만 > 숨김). Point to the right-hand node that caused it.

## Colors

| Color | Report fields |
| --- | --- |
| 숨김 (hidden) | no on-chain finding for the input in that circuit |
| 증명만 (proof only) | `MASKED` or `TAG` on chain, no failure |
| 공개 (public) | a finding with `disclosure` `"spec"` or `"declared"`, no failure |
| 위험 (at risk) | any finding with `failure: true` (`EXPOSED`, `RECOVERABLE`, `PARTIAL`, `UNBOUND`) |
| 시험 못 함 (untestable) | unit or input `status: "untestable"` |

## Running

```bash
# one contract
npx --no-install proofkit map <compiled-dir | report.json> --out privacy-map.md
# holed and fixed side by side (same leakage description for both)
npx --no-install proofkit map <holed-dir> <fixed-dir> --spec privacy-spec.json \
  --title "구멍 판" --title "고친 판" --out privacy-map.md
```

A compiled directory is attacked first (with `--spec`, or `privacy-spec.json` next to the source); a `.json` argument is read as an existing report. The output is Markdown with one Mermaid block per report and a Korean legend.

## Explaining the map

Go from left to right: the red inputs first (which circuit, which attack, the criterion from `proof:proof-attack`), then gray, then the rest by count. When comparing two versions, say which nodes changed color and which change in the contract caused it; for the fix itself, use `proof:proof-spec`.

Example: `docs/design-guide/map-health-credential.md`.
