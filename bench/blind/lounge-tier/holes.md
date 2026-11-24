# lounge-tier — planted holes (holed/lounge.compact)

Assumed attack codes (guessed, tool docs were off limits): A1 = EXPOSED, A2 = RECOVERABLE, A3 = LINKABLE, A5 = PARTIAL, T2 = UNBOUND.

## H1 — exact tier leaks through which counter is incremented (mapped: A5 / PARTIAL / path)
- Circuit: `enterLounge`, input `witness:memberPoints`.
- `if (disclose(p >= 20000)) goldEntries.increment(1) else silverEntries.increment(1)` — the transaction shows which counter moved, so every entry reveals "Gold (>= 20,000)" vs "Silver (5,000..19,999)". The design only allows "Silver or above" to be learned. Partial information about the balance leaks through the control-flow path.
- Why a first-timer writes it: the operator wants per-tier statistics; the compiler complains about branching on a witness and `disclose(...)` around the condition makes the error go away.

## H2 — visitor's wallet key stored on chain (NOT MAPPED)
- Circuit: `enterLounge`, value `ownPublicKey()`.
- `lastVisitor = disclose(ownPublicKey())` writes the caller's Zswap coin public key to the ledger. That identifies the member's wallet and links all their visits (and everything else that wallet does). This is a real exposure/linkability leak, but the source is the kernel-provided `ownPublicKey()`, not a declared `witness:` or a circuit `arg:`, so the schema's `input` field cannot name it.
- Why: "remember who came in last" feels like an innocent debugging/analytics field; `ownPublicKey()` looks like a public thing (it says *public* key).

## H3 — points balance is not bound to anything (NOT MAPPED)
- Circuit: `enterLounge`, input `witness:memberPoints`.
- The witness is read exactly once (so it is not a split witness), but nothing ties it to an issuer record: a malicious prover returns 999999 and walks into the lounge. A missing binding of a private input to public state is a soundness hole, not one of EXPOSED/RECOVERABLE/PARTIAL/LINKABLE, and T2/UNBOUND is defined as "read several times with different values", which does not apply.
- Why: beginners treat the witness as "the user's data from my app" and forget the prover fully controls it.

## Fix summary (fixed/lounge.compact)
Issuer publishes salted commitments `hash(domain, memberKey, points, salt)` into a `HistoricMerkleTree`; the member proves a Merkle path (root only disclosed) and `points >= 5000`; one aggregate counter; no wallet key stored.
