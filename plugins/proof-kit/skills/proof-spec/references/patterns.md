# Fix patterns

Each pattern lists the pitfall first, then the fix, then the attack that checks it. Holed/fixed example pairs live in `bench/scenarios/` and `docs/design-guide/examples/`; all compile with Compact 0.36.0. Probe ids (p04b, ...) refer to `docs/design-guide/compiler-probe/`.

## Hide a value: salted commitment

- Pitfall: `disclose(persistentHash(value))` compiles (p04b). If the value has a small range (age, code, PIN, coordinates in a known box), hashing candidates recovers it.
- Pitfall: `persistentCommit(value, constant)` compiles without `disclose()` (p05b). So do a salt derived from the secret (p05c, p19). The compiler assumes the salt is random; it is not checked.
- Pitfall: reusing one salt for two commitments links them.
- Fix: a fresh random nonce per value, supplied as a witness and kept by the user: `persistentCommit(value, nonce())`.
- Checked by: A2 (recovery). Examples: `bench/scenarios/health-claim-hash`, `bench/scenarios/constant-salt`.

## Reveal only a fact

- Pitfall: disclosing the whole value (or a whole struct, p26) when the design needs one fact.
- Fix: `disclose(age >= 18)`, and list the fact under `mayReveal` in the spec.
- Checked by: A1 against the spec. Example: `bench/scenarios/predicate-disclosure`.

## Do not choose ledger cells by a hidden value

- Pitfall: `if (disclose(choice)) yes.increment(1) else no.increment(1)` shows which cell moved.
- Fix: store a commitment to the choice; tally in a separate step.
- Checked by: A5 against the spec. Example: `bench/scenarios/vote-branch`.

## One action per member, unlinkable: scoped nullifier

- Pitfall: a nullifier that hashes only the secret is the same in every poll and links all of one member's actions.
- Fix: `persistentHash([domainTag, scope, secret])` where scope is the poll or round id.
- Checked by: A3 (planned). Example: `docs/design-guide/examples/nullifier-fixed.compact`.

## Prove ownership

- Pitfall: `assert(ownPublicKey() == owner)` — the caller supplies `ownPublicKey()`, and storing it (p21, compiles) links every action of the owner.
- Fix: store a domain-separated hash of an owner secret; check knowledge of the secret. Prefer OpenZeppelin `ZOwnablePK` in real contracts.
- Examples: `docs/design-guide/examples/owner-holed.compact`, `owner-fixed.compact`.

## Someone must vouch for a credential

- Pitfall: anyone can register a credential for any value, so proofs about it prove nothing.
- Fix: only an issuer fixed at deployment can issue; the issuer proves knowledge of its secret.
- Examples: `docs/design-guide/examples/issuer-holed.compact`, `issuer-fixed.compact`.
- Not covered: signature-based issuance. Its standard-library usage was not confirmed for compiler 0.36.0.

## Membership in a group

- Use a Merkle tree to prove "one of the registered members".
- Pitfall: a tiny group hides almost nothing (official docs: "a tree with three leaves gives almost no privacy").
- Pitfall: branching on the result of `checkRoot` leaves the result bit in the transcript (midnight-expert compact-privacy-disclosure).
- No example or attack yet.
