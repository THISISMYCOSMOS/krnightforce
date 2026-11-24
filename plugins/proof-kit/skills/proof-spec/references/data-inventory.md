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
2. For each item, record what the user said: show, hide, or not mentioned.
3. Propose a default with a reason:
   - Needed by the app and the user wants it shown → reveal (as a value, or only a fact such as "over 18", "bought over a year ago").
   - Not needed by the app → do not put it on chain at all; if it must be checked, keep a commitment.
   - Identifiers and personal data → hidden unless the user insists, and say why.
4. Flag **combinations**: several harmless public items together can single out one person (a rare model + color + region + year). The engine does not test this yet (A6 is planned); say so.
5. Mark items that never reach the contract (photos, chat, off-chain storage) as **outside the contract**: the attack tests cannot check them, but the user should know.

6. For each item, name **the Midnight mechanism** that carries out the proposal (public ledger field with `disclose()`, private state via a `witness`, `persistentCommit`, a nullifier, `HistoricMerkleTree` membership, issuer-attested selective disclosure, or "not in the contract"), using the terms in `midnight-terms.md`. Explain each term the first time, precisely; do not water it down.

## Output

| Item | Category | User said | Proposal | Midnight mechanism | Why |
| --- | --- | --- | --- | --- | --- |

End with: "Is this right? Change anything you want; your answers go into the design."

The user decides. A proposal is a suggestion with a reason, never a silent choice.
