# hidden-raffle — planted holes (holed/raffle.compact)

Assumed attack codes (guessed, tool docs were off limits): A1 = EXPOSED, A2 = RECOVERABLE, A3 = LINKABLE, A5 = PARTIAL, T2 = UNBOUND.

## H1 — weak nonce: ticket number recoverable from the commitment (mapped: A2 / RECOVERABLE / ledger)
- Circuit: `buyTicket`, input `witness:ticketNumber`.
- The ticket is `hash({number, nonce})` with `nonce = ticketsSold.read()` — a value every observer knows. For each new ticket, an observer tries the 1000 possible numbers with the public nonce and learns the number immediately. The organizer (who chose the winning number before sales but can see all tickets) and other buyers learn every ticket; buyers can avoid or copy numbers, and the "hidden" part of the raffle is gone.
- Why a first-timer writes it: they know a commitment needs "something unique" and reach for the counter, confusing uniqueness with unpredictability.

## H2 — winning check and commitment read the witness separately (mapped: T2 / UNBOUND / value)
- Circuit: `claimPrize`, input `witness:ticketNumber`.
- `ticketNumber()` is called twice: once for `== winningNumber`, once inside the commitment. A malicious prover returns the winning number on the first call and their real (losing) number on the second, so every ticket holder can claim the prize.
- Why: calling the witness "where you need it" reads naturally, like calling a getter; the beginner assumes it returns the same value every time.

## H3 — claim reveals which ticket it is (mapped: A3 / LINKABLE / ledger)
- Circuit: `claimPrize`, inputs `witness:ticketNumber` and `arg:myNonce` (both go into the disclosed leaf).
- `tickets.member(disclose(t))` and `claims.insert(disclose(t))` publish the exact leaf inserted by `buyTicket`, so anyone links the winner's claim (and payout address) to the purchase transaction and its fee-paying wallet.
- Why: re-computing the ticket and checking `Set.member` is the obvious approach; disclosing the ticket feels safe because "it's only a hash".

## Fix summary (fixed/raffle.compact)
256-bit random salt per ticket; `HistoricMerkleTree` + path witness; number and salt read once into `const`s; nullifier `hash("raffle:claim", salt)` instead of the leaf for double-claim protection.
