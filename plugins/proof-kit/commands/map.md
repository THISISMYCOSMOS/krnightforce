---
name: proof:map
description: Draw a Mermaid map of hidden values → circuits → what lands on chain, colored from the latest attack results (hidden, proof-only, public, at risk, untestable). Writes the README "Privacy" section. Planned.
allowed-tools: Bash, Read, Write, Edit
argument-hint: "[path/to/contract.compact]"
---

Draw the privacy map from attack results. Load the `proof:proof-attack` skill first.

> Status: planned. The engine command below does not exist yet; if it fails, say so and stop.

## Step 1: Get results

Use the latest engine JSON (`npx --no-install proofkit attack ... --json`). If there are no results, run `/proof:attack` first. The map is drawn only from results; never color a node from reading the code.

## Step 2: Render

```bash
npx --no-install proofkit map <out-dir> --source <contract.compact> --format mermaid
```

Colors: hidden, proof-only, public, at risk, and gray for "시험 못 함" (untestable).

## Step 3: README

Insert or update the `## Privacy` section in the project README with the map, the intended-disclosure list (from `proofkit accept` reasons), and the out-of-scope note. Show the diff to the user before writing.
