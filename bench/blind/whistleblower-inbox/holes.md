# whistleblower-inbox — planted holes (holed/whistleblower.compact)

Assumed attack codes (guessed, tool docs were off limits): A1 = EXPOSED, A2 = RECOVERABLE, A3 = LINKABLE, A5 = PARTIAL, T2 = UNBOUND.

## H1 — reporter's key published by the membership check (mapped: A1 / EXPOSED / ledger)
- Circuit: `submitReport`, input `witness:staffSecret` (through `staffKey(sk)`).
- `staff.member(disclose(staffKey(sk)))` puts the reporter's public key into the transaction. The roster is public (`enrol` inserted the same key), so every observer — including the employer — reads off exactly who blew the whistle. This also links all of one person's reports.
- Why a first-timer writes it: a `Set` of members plus `member()` is the most natural "is this person allowed?" check; the compiler asks for `disclose`, and it feels harmless because "it's only a hash of my secret". The anonymity requirement needs a Merkle path, which beginners do not reach for.

## H2 — department stored on chain next to the report (mapped: A1 / EXPOSED / ledger)
- Circuit: `submitReport`, input `arg:dept`.
- `reports.insert(reportHash, disclose(dept))` publishes the department. With small departments plus timing of the report, the reporter's anonymity set collapses to a few people even after H1 is fixed — a classic metadata leak.
- Why: the author wants compliance to route the report and does not think of the department as personal data.

## H3 — the "month" is chosen by the caller (NOT MAPPED)
- Circuit: `submitReport`, input `arg:month`.
- The once-per-month nullifier is `hash(month, sk)` with `month` an unchecked argument. A malicious reporter passes 202611, 202612, 999999, ... and files unlimited reports, spamming the inbox or flooding out other reports. This is an unbound public input (a missing binding to ledger/time), not a privacy leak and not a split witness, so none of EXPOSED/RECOVERABLE/PARTIAL/LINKABLE/UNBOUND(T2 = split witness) fits.
- Why: the beginner passes "the current month" from the frontend and forgets that the prover controls every argument.

## Fix summary (fixed/whistleblower.compact)
Merkle tree roster with path witness (only root disclosed); month comes from a ledger `Counter` advanced by the admin; department removed from the chain (it goes inside the encrypted body); reports stored as a `Set` of hashes.
