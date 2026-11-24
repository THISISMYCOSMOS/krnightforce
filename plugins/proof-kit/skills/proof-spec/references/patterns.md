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

## Read a secret witness once

- Pitfall: a circuit that calls the same witness twice (once in an ownership check, once in a nullifier) gets two independent private inputs. The prover can return the real secret to the check and anything to the nullifier, so "one per owner" stops holding. It compiles. Probe p29 runs it: three repeat submissions with a split witness are all accepted; tests with an honest witness never notice.
- Fix: read it once into a local and pass that local to every use (`const s = secret(); assert(key(s) == owner); ... hash([tag, scope, s])`). Probe p29b: the same split witness is rejected.
- Checked by: execution probe `packages/proof-kit/scripts/probe-witness-reads.mts`; diagnostic `packages/proof-kit/scripts/count-witness-reads.mts` lists witnesses read more than once per circuit call. Not yet an engine attack. Three of the seven bench scenarios had this mistake until 2026-11-24 (`docs/design-guide/lessons-first-build.md`).

## Recompute in the circuit; do not accept a result

- Pitfall: the circuit takes a score, total or eligibility computed elsewhere and only commits to it. The commitment fixes the value but proves nothing about how it was computed (criterion 10: nobody vouches for it).
- Fix: take the raw inputs (or the previous state's opening) as witnesses and recompute the result in the circuit; assert it equals the candidate. Use checked integer arithmetic (`Uint` with a range-checked cast), not `Field`, so totals cannot wrap around.

## All records, not just one

- Pitfall: a Merkle membership proof shows one record is in the set. It does not show every record was processed, in order, once.
- Fix: put the record count inside each leaf, and assert `record.index == pathIndex(path) == cursor` per step; finish only when `cursor == count`. Use different domain tags for leaves and inner nodes (and for each kind of hash: rule, state, record) so one kind cannot pass as another.

## Decide the unit of "once"

- Pitfall: a nullifier built from the current state is new whenever the state changes, so "one application per period" is not enforced on chain; a nullifier built from the secret alone links every action (see scoped nullifier above).
- Fix: put exactly the unit you mean into the nullifier: `hash([tag, period or round, secret])` for "once per period". Write the unit in the design; if it is enforced off chain, say so.

## Keep what a verifier will re-check

- Pitfall: a single ledger slot (`resultCommitment`) overwritten by each new submission. A verifier who stored an older opening can no longer check it against the chain.
- Fix: key it by the submission's nullifier (`Map<nullifier, commitment>`), so each result stays checkable.

## Show the verifier only

- Pitfall: putting exact values on the public ledger because one party (an insurer, an office) needs them.
- Fix: store `persistentCommit(values, nonce)` on chain and give that party the opening off chain; the party recomputes the commitment and compares. Everyone else sees only the commitment.

## Plan for change at deployment

- Pitfall: a value fixed in the constructor (a rule hash, an issuer key) cannot change. When the rule gets a new version, the stored state is bound to the old one and nothing can move it.
- Fix: decide before deploying whether the value can change. If it can, add an authorized circuit that rebinds the state to the new value, and test the move.

## Membership in a group

- Use a Merkle tree to prove "one of the registered members".
- Pitfall: a tiny group hides almost nothing (official docs: "a tree with three leaves gives almost no privacy").
- Pitfall: branching on the result of `checkRoot` leaves the result bit in the transcript (midnight-expert compact-privacy-disclosure).
- No example or attack yet.
