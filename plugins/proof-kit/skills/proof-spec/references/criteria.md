# Design criteria

Twelve criteria for a Compact contract's privacy design. Each has a source and a check:

- **verdict**: an attack test checks it. Breaking it shows up as a failure in `/proof:attack`.
- **guidance**: no attack checks it. Show it in the design proposal; never report it as pass or fail.

Sources: Kachina (state split, leakage description), the compiler probe (`docs/design-guide/compiler-probe/`, compiler 0.36.0), official Midnight docs, the midnight-expert threat catalog, and real mistakes seen in hackathon projects (not named).

## A. What goes where

| # | Criterion | Check | Source |
| --- | --- | --- | --- |
| 1 | A hidden value never sits on the public ledger as itself. | verdict: A1 | Kachina: the public state transition is what is revealed |
| 2 | Everything that reaches the ledger or transcript is listed in the leakage description. | verdict: A1, A5 against `privacy-spec.json` | Kachina: the leakage descriptor must be accurate |
| 3 | A circuit returns only values the calling DApp may see. Return values do not go on chain. | guidance | Official docs: the transaction carries only a commitment to inputs and outputs |

## B. How to hide

| # | Criterion | Check | Source |
| --- | --- | --- | --- |
| 4 | A hidden value that must be kept on the ledger is stored as a commitment with a nonce, not as a hash. | verdict: A2 | Probe p04b (`disclose(persistentHash(small))` compiles); real mistakes (health data, coordinates) |
| 5 | The nonce is fresh per value and kept by the user; never constant, zero or derived from the secret. | verdict: A2 (constant), A3 for reuse (planned) | Probe p05b, p05c, p19; official docs "never reuse randomness" |
| 6 | Only the fact the design needs is disclosed (`age >= 18`, not `age`). | verdict: A1 against the spec | Official docs on explicit disclosure; probe p26 |
| 7 | A hidden value never chooses which ledger cell is touched. | verdict: A5 | Probe p02 (needs `disclose()` but then compiles) |
| 8 | A one-time action uses a nullifier that mixes a domain tag, a scope (poll, round) and the secret. | verdict: A3 (planned) | Zexe serial numbers; official docs on round-based unlinkability |
| 9 | When hiding inside a group (Merkle membership), the group is large enough. | guidance | Official docs: "a tree with three leaves gives almost no privacy" |

## C. Who vouches

| # | Criterion | Check | Source |
| --- | --- | --- | --- |
| 10 | Every user-supplied input has someone who vouches for it: an issuer, an owner secret, or state the contract already holds. | guidance | Kachina: a dishonest party may set its private state arbitrarily |
| 11 | Authorization proves knowledge of a secret; it never trusts `ownPublicKey()`. | guidance (assurance attacks T1-T3 are out of scope) | Probe p21; official docs "ownPublicKey() is a witness function"; OpenZeppelin `ZOwnablePK` |

## D. Write down what is revealed

| # | Criterion | Check | Source |
| --- | --- | --- | --- |
| 12 | For each circuit, what it reveals is written in plain words and the user agrees to it. | output: `privacy-spec.json` | Kachina: the user signs off a readable leakage description |

## From an engine finding to a criterion

The engine adds `criteria` to each failing finding:

| Finding | Criteria |
| --- | --- |
| `RECOVERABLE` at `value` or `ledger` | 4, 5 |
| `EXPOSED` at `value` or `ledger` | 1, 2 |
| `PARTIAL` at `value` or `ledger` | 6, 2 |
| any failing kind at `path` | 7, 2 |

When reporting a failure, name the criterion and give the matching pattern from `patterns.md` (pitfall first).

## Works / does not work (compiler 0.36.0)

Show the rows that apply to the design.

| Blocked by the compiler (no action needed) | Compiles but leaks (watch out) |
| --- | --- |
| A witness or argument written to the ledger without `disclose()` (p01, p13, p14) | `disclose(persistentHash(small value))` (p04b) |
| Its hash or comparison written without `disclose()` (p04, p08, p16) | `persistentCommit` with a constant, zero or secret-derived salt (p05b, p05c, p19) |
| A branch with ledger operations on a hidden value without `disclose()` (p02) | `ownPublicKey()` written to the ledger (p21) |
| Returning a hidden value without `disclose()` (p03, p22) | Disclosing a whole struct (p26) |
| Passing it to another contract without `disclose()` (p18) | `transientCommit` stored on the ledger (p07) |
| A hidden value in an assert message (string literals only, p17) | A branch on `disclose(hidden)` choosing ledger cells (p02 + disclose) |
| A hidden time passed to `blockTimeGte` without `disclose()` (p28) | `blockTimeGte(disclose(hiddenDate + period))`: the date becomes public |
