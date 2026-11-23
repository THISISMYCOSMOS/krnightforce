---
name: proof-kit:spec
description: Before (or after) writing a Compact contract, decide which values must stay hidden, which facts may be revealed, which actions must not be linkable and who vouches for each input; turn the answers into attack-test settings. Fix patterns are delegated to compact-core:compact-privacy-disclosure. Planned.
allowed-tools: Read, Write, AskUserQuestion
argument-hint: "[path/to/contract.compact]"
---

Write a privacy spec for a Compact contract. Load the `proof-kit:proof-attack` skill first.

> Status: planned.

## Step 1: Ask

Ask the user, one short question each:

1. Which values must stay hidden?
2. Which facts about them may be revealed (for example "over 18", "bid placed")?
3. Which actions must not be linkable to each other?
4. Who vouches for each input (the user, an issuer's signature, the contract's own state)?

## Step 2: Write settings

Write the answers as engine settings (hidden inputs, value ranges, intended disclosures, unlinkable action pairs) next to the contract. These settings change which attacks run; they never change a verdict.

## Step 3: When a test fails

Do not explain fix patterns here. Point to the matching section of the `compact-core:compact-privacy-disclosure` skill (salted commitments, scoped nullifiers, round-based keys, selective disclosure), then rerun `/proof-kit:attack`.
