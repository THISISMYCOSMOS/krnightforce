# Data inventory

Users describe what they want to show or hide, but their situation usually involves more information than they mention. Before the four questions, list it.

## How to build it

1. Go through these categories for the user's situation:
   - **The thing itself**: attributes the app is about (e.g. a car's model, year, color).
   - **Identifiers**: values that point to one thing or one person (plate number, serial or VIN, document numbers, account ids).
   - **Owner and personal data**: name, birth date or national id, address, contact.
   - **Transactions**: dates, prices, payment or loan terms, counterparties.
   - **History**: past events (repairs, accidents, prior owners).
   - **Activity in the app**: wallet address or public key, nickname, which actions they take and when.
   - **Attachments and metadata**: photos (what is visible in them, location data), documents.
   - **Processing metadata** (first-time builders rarely think of it): how many records, steps or transactions an action takes, progress counters, version or revision numbers, and the deployment unit. One transaction per record publishes the record count; a contract deployed per user ties every action of that user to one contract address.
2. For each item, record what the user said: show, hide, or not mentioned. "Show" has two audiences; ask which:
   - **everyone**: it goes on the public ledger.
   - **one verifier only** (the insurer, the scholarship office, the pharmacy): the ledger holds a commitment, and the user hands the verifier the opening (value + nonce) off chain. The verifier checks it against the commitment. Users often want exact numbers for the verifier ("the insurer should see the exact score") and nothing for the public; these are different rows.
3. Propose a default with a reason:
   - Needed by the app and the user wants it shown → reveal (as a value, or only a fact such as "over 18", "bought over a year ago").
   - Not needed by the app → do not put it on chain at all; if it must be checked, keep a commitment.
   - Identifiers and personal data → hidden unless the user insists, and say why.
4. Flag **combinations**: several harmless public items together can single out one person (a rare model + color + region + year). The engine does not test this yet (A6 is planned); say so.
5. Mark items that never reach the contract (photos, chat, off-chain storage) as **outside the contract**: the attack tests cannot check them, but the user should know.
5b. Write down **what the proof does not guarantee**, before designing circuits. A proof shows that the circuit ran correctly on the inputs it was given. It does not show that the inputs happened in the real world (a trip, a purchase), that the user submitted all of them, that the same input was not submitted twice (unless the contract records it), or that off-chain copies were deleted. Storing a hash or commitment is not a proof of anything by itself.

6. For each item, name **the Midnight mechanism** that carries out the proposal (public ledger field with `disclose()`, private state via a `witness`, `persistentCommit`, a nullifier, `HistoricMerkleTree` membership, issuer-attested selective disclosure, or "not in the contract"), using the terms in `midnight-terms.md`. Explain each term the first time, precisely; do not water it down.

## Output

| Item | Category | User said | Who may see it (everyone / verifier only / user only) | Proposal | Midnight mechanism | Why |
| --- | --- | --- | --- | --- | --- | --- |

Then a short list: "What the proof will not guarantee".

End with: "Is this right? Change anything you want; your answers go into the design."

The user decides. A proposal is a suggestion with a reason, never a silent choice.
