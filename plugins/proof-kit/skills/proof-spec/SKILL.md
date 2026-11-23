---
name: proof:proof-spec
description: Use when designing a Compact (Midnight) contract's privacy before or while writing it — deciding which values stay hidden, which facts may be revealed, which actions must not be linkable and who vouches for each input — or when a proof-kit attack test failed and a fix pattern is needed. Writes the leakage description (privacy-spec.json) that the attack tests check.
version: 0.0.1
---

# Proof Kit: privacy design guide

A contract is two things (Kachina): what it does, and what it reveals. This skill helps the user write down what it reveals, as a leakage description the user agrees to. The attack tests (`proof:proof-attack`) then check that the contract reveals nothing outside it. The full guide is `docs/design-guide.md` in the proof-kit repo.

## When NOT to use

- Running or reading attack tests: use `proof:proof-attack`.
- Access-control audits beyond "who vouches for this input": use `compact-core:audit-compact`.
- Compile errors about `disclose()`: fix the compile first; the compiler is right to ask.
- Wallets, proving servers, fees, unshielded tokens, network metadata: out of scope. Say so.

## Pitfalls (read first)

1. **Do not decide for the user what may be revealed.** Ask. The leakage description is theirs to agree to.
2. **A hash is not a commitment.** Never suggest `persistentHash` to hide a value with a small range.
3. **A commitment needs a fresh random nonce per value.** Constant, zero, reused or secret-derived salts compile but do not hide.
4. **`ownPublicKey()` proves nothing about the caller** and links actions if stored.
5. **Every witness can be set by the user.** For each input, ask who vouches for it.
6. **Never present a fix as safe until the attack test passes on it.** Rerun `/proof:attack` after every fix.

## Step 1: What the contract does (guide ch. 1)

List each exported circuit: which ledger fields it changes, which witnesses and arguments it uses, who calls it. Return values go to the caller, not on chain.

## Step 2: What may be revealed (guide ch. 2)

Ask, one short question each:

1. Which values must stay hidden?
2. Which values or facts about them may be revealed, and why? (e.g. a public id; "age >= 18")
3. Which actions must not be linkable to each other?
4. What unavoidable leakage is acceptable? (that an action happened, its time, the size of the group)

Anything not listed as revealable is hidden.

## Step 3: Who vouches for each input (guide ch. 3)

For each hidden input: the user alone, a secret only the owner knows, a fixed issuer, or state the contract already holds. Use the patterns in `references/patterns.md`.

## Step 4: Write the leakage description

Write `privacy-spec.json` next to the contract, in the format in `references/privacy-spec.md`. Show it to the user and get agreement before using it.

## Step 5: Check, and fix on failure

Run `/proof:attack` with the spec. For each failure, find the matching pattern in `references/patterns.md` (pitfall first, then the fix), apply it, and rerun until the attack test passes. Report only what the engine reported.
