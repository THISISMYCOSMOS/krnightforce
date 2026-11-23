---
name: proof-kit:spec
description: Before (or after) writing a Compact contract, decide which values must stay hidden, which facts may be revealed, which actions must not be linkable and who vouches for each input; write them as the leakage description (privacy-spec.json) that attack tests check, and give fix patterns when a test fails.
allowed-tools: Read, Write, AskUserQuestion
argument-hint: "[path/to/contract.compact]"
---

Write a privacy spec for a Compact contract. Load the `proof-kit:proof-spec` skill first and follow it.

> Status: planned.

## Steps

1. Describe what the contract does (skill step 1).
2. Ask what may be revealed and what must not be linkable (skill step 2).
3. Ask who vouches for each input (skill step 3).
4. Write `privacy-spec.json` next to the contract and get the user's agreement (skill step 4).
5. Run `/proof:attack`. For each failure, apply the matching fix pattern from the skill's `references/patterns.md` (pitfall first), then rerun (skill step 5).
