---
name: proof:proof-spec
description: Use when designing a Compact (Midnight) contract's privacy before or while writing it — deciding which values stay hidden, which facts may be revealed, which actions must not be linkable and who vouches for each input — or when a proof-kit attack test failed and the user needs to know which design criterion was broken and how to fix it. Produces a design proposal and the leakage description (privacy-spec.json) that attack tests check.
version: 0.0.2
---

# Proof Kit: privacy design

A contract is two things (Kachina): what it does, and what it reveals. You help the user design both, against the twelve criteria in `references/criteria.md`, and write down what it reveals as a leakage description the user agrees to. `/proof:attack` then checks the contract against it. The human guide is `docs/design-guide.md`.

## When NOT to use

- Running or reading attack tests: use `proof:proof-attack`.
- Full access-control audits: use `compact-core:audit-compact`.
- Compile errors about `disclose()`: fix the compile first.
- Wallets, proving servers, fees, unshielded tokens, network metadata: out of scope. Say so.

## Pitfalls (read first)

1. **The user decides what may be revealed.** Offer examples and proposals; never fill in answers for them silently.
2. **Do not stop at what the user mentioned.** Information they did not mention (identifiers, photos, wallet addresses, metadata) still exists in their situation; put it in the inventory.
3. **Never present a guidance criterion (3, 9, 10, 11) as checked.** Only attack tests decide pass or fail.
4. **A hash is not a commitment.** Never propose `persistentHash` to hide a value with a small range.
5. **A commitment needs a fresh nonce per value**, kept by the user.
6. **Never call a design safe.** Say which criteria the attack tests will check, and which they cannot.
7. **Read each secret witness once** per circuit and reuse the local; two calls are two independent inputs (probe p29).
8. **Recompute results in the circuit.** Committing to a value computed elsewhere fixes it but proves nothing.
9. **Say what the proof does not guarantee** (real-world truth of inputs, completeness of submission, deletion) before designing circuits. First-time builders often assume a proof covers these.

Lessons from a real build (Korean): `docs/design-guide/lessons-first-build.md`.

## Flow

Start from an idea, or from an existing contract (then draft step 1 from its exported circuits, witnesses and ledger fields, and ask the user to confirm).

**Step 1. What it does.** Restate the app in one sentence and list the circuits: who calls each, what it changes on the ledger. Ask "Is this right?"

**Step 1b. Data inventory.** Before asking what to hide, list the information that usually exists in this situation — not only what the user mentioned — following `references/data-inventory.md`. For each item give what the user said (show / hide / not mentioned) and a proposal with a reason; anything the app does not need is proposed hidden or left off chain. Flag combinations of public items that can identify a person. Map every item to the Midnight mechanism that will carry it (`references/midnight-terms.md`), explaining each term precisely the first time. Ask the user to confirm or change the table; their answer is the start of step 2.

**Step 2. Four questions, one at a time, each with an example from their app:**
1. Which values must stay hidden?
2. What may be revealed — values or facts — and why?
3. Which actions must not be linkable?
4. Who vouches for each value the user supplies?

**Step 3. Design proposal** in the five parts of `references/design-output.md`: what goes where; what each circuit reveals; building block per value with its pitfall; works / does not work; how it will be checked.

**Step 4. Agreement.** Ask the user to agree to part 2. Then write `privacy-spec.json` next to the contract in the format of `references/privacy-spec.md`.

**Step 5. Check and fix.** After the contract is written, run `/proof:attack`. For each failure, name the criterion from its `criteria` field, give the matching pattern from `references/patterns.md` (pitfall first, then the fix), and rerun until the tests pass. Then run `/proof:map` to draw the result.

Worked examples of all five steps: `docs/design-guide/walkthrough-health-credential.md`; from a one-line request, with step 1 planning the situation: `docs/design-guide/walkthrough-car-club.md`, `docs/design-guide/walkthrough-scholarship.md`.
