---
name: proof:proof-spec
description: Use when designing a Compact (Midnight) contract's privacy before or while writing it. Judges what to hide, show or share with one verifier and waits for the user's OK (gate) before circuit design; then designs, writes a compilable skeleton, compares two designs at a fork by running them (proofkit compare), and runs attack tests. Also use when an attack test failed and the user needs the broken criterion and fix. Produces a design proposal and privacy-spec.json.
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
3. **Never present a guidance criterion (3, 9, 10, 11) as checked.** Only attack tests decide pass or fail. The one exception: T2 checks the part of 10 where a witness is read more than once in a call.
4. **A hash is not a commitment.** Never propose `persistentHash` to hide a value with a small range.
5. **A commitment needs a fresh nonce per value**, kept by the user.
6. **Never call a design safe.** Say which criteria the attack tests will check, and which they cannot.
7. **Read each secret witness once** per circuit and reuse the local; two calls are two independent inputs (probe p29).
8. **Recompute results in the circuit.** Committing to a value computed elsewhere fixes it but proves nothing.
9. **Say what the proof does not guarantee** (real-world truth of inputs, completeness of submission, deletion) before designing circuits. First-time builders often assume a proof covers these.
10. **Bind every witness.** An input nothing constrains is the most common real circuit bug (`docs/evidence.md`). For each witness, name what binds it before writing the skeleton.

Lessons from a real build (Korean): `docs/design-guide/lessons-first-build.md`.

## Flow

Start from an idea, or from an existing contract (then draft step 1 from its exported circuits, witnesses and ledger fields, and ask the user to confirm).

**Step 1. Plan.** Take the user's plan or one-line idea. Restate the app in one sentence and list the circuits: who calls each, what it changes on the ledger. If the idea is short, fill the gaps as a situation (who the people are, what they hold, who checks what), as the walkthroughs do. Ask "Is this right?"

**Step 2. Hide judgement.** Before asking what to hide, give the data inventory: list the information that usually exists in this situation, not only what the user mentioned, following `references/data-inventory.md`. Give a proposal for every item, with a reason: **hide**, **show to everyone**, **show to one verifier only** (`shareWith`), or **leave off chain**. Anything the app does not need is proposed hidden or left off chain. Flag combinations of public items that can identify a person. Map each item to the Midnight mechanism that carries it (`references/midnight-terms.md`), explaining each term precisely the first time. Say what the proof will not guarantee (pitfall 9).
- **GATE.** Ask "Is this right?" and do NOT start circuit design until the user agrees. If the user changes an item, update the table and ask again.

**Step 3. Design.**
- Ask the four questions that are still open, one at a time, each with an example from their app: which values must stay hidden; what may be revealed, values or facts, and why; which actions must not be linkable; who vouches for each value the user supplies. Answers already settled in step 2 are not asked again.
- Give the design proposal in the five parts of `references/design-output.md`: what goes where; what each circuit reveals; building block per value with its pitfall; works / does not work; how it will be checked.
- Ask the user to agree to part 2. Then write `privacy-spec.json` next to the contract in the format of `references/privacy-spec.md`.
- At a design fork, use the fork comparison below.

**Step 4. Skeleton.** Write a compilable Compact skeleton from the agreed design: ledger fields, witnesses, circuits and the hiding building blocks, following the rules in `references/skeleton.md`. Compile it with `compact compile --skip-zk`. A compile error is fixed before going on.

**Step 5. Attack and map.** Run `/proof:attack` (engine: `proofkit attack <dir> --spec privacy-spec.json`), then `/proof:map`. For each failure, name the criterion from its `criteria` field and the matching pattern from `references/patterns.md` (pitfall first, then the fix), fix it, and rerun until the tests pass.

## Fork comparison

Used during steps 3 and 4. A fork is a point where two reasonable designs reveal different things or change who vouches. Examples: `blockTimeGte` on a purchase date versus comparing with a public calendar; hashing a plate number versus mixing in an operator secret.

1. Write both options as small compilable variants (`A.compact`, `B.compact`).
2. Run:
   ```
   proofkit compare A.compact B.compact --spec privacy-spec.json --title "<option A>" --title "<option B>"
   ```
3. Show the user the "what differs" table and the two maps.
4. Let the user choose. Recommend one, with a reason.

Only ask about forks that change what is revealed or who vouches. Do not ask about choices that change neither. The verdicts come from the engine run, never from your reading of the code.

Worked examples of the flow: `docs/design-guide/walkthrough-health-credential.md`; from a one-line request, with step 1 planning the situation: `docs/design-guide/walkthrough-car-club.md`, `docs/design-guide/walkthrough-scholarship.md`.
