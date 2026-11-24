# Midnight terms

Use these terms in the design, each with a one-line explanation the first time. Names are as in Compact compiler 0.36.0 (checked by compiling).

## Where data lives

| Term | What it is | Design meaning |
| --- | --- | --- |
| public state (`export ledger`) | Contract state every node stores and anyone can read. Types: `Cell` (plain field), `Counter`, `Map`, `Set`, `List`, `MerkleTree`, `HistoricMerkleTree`. | Only what the leakage description allows goes here. |
| private state | Data the DApp keeps on the user's device for this contract. Never on chain. | Where hidden values live. |
| `witness` | A function the DApp implements to hand private data to a circuit. The user controls what it returns. | Hidden inputs. Anyone can lie through a witness, so someone must vouch (criterion 10). |

## What runs and what is published

| Term | What it is | Design meaning |
| --- | --- | --- |
| circuit (`export circuit`) | A contract entry point. Calling it creates a transaction with a zero-knowledge proof. | One user action. Which circuit was called is visible in the transaction. |
| `pure circuit` | A circuit without ledger access; also callable off-chain by the DApp. | Helpers such as computing a commitment before deployment. |
| zero-knowledge proof | Proof that the circuit ran correctly on some private inputs, without revealing them. Built by the proof server. | Lets the chain check rules on hidden data. |
| public transcript | The list of ledger operations the call performs (which cells it reads and writes, and the values). Goes on chain with the proof. | Exactly what proof-kit compares between runs. |
| proof server | Generates the proof; receives the witness values. Local by default. | A remote proof server sees hidden values (out of scope for attack tests). |
| `disclose()` | Explicit declaration that a value derived from private input becomes public. The compiler rejects undeclared flows ("Witness Protection Program"). | Every `disclose()` must match a line of the leakage description. |

## Hiding building blocks

| Term | What it is | Design meaning |
| --- | --- | --- |
| `persistentHash` | Deterministic hash: same input, same output. | Guessable inputs (plates, ages, dates) can be recovered by hashing candidates. Not a hiding tool for them. |
| `persistentCommit(value, rand)` | Commitment: hides `value` while `rand` is random and secret; can be checked later by someone who knows both. | Store hidden values this way (criterion 4, 5). `transientCommit`/`transientHash` are not for ledger storage. |
| nullifier | A tag derived from a secret, published to mark "this one-time action happened" without saying whose. | Mix a domain tag and a scope (event id, round) so tags from different scopes do not link (criterion 8). |
| `HistoricMerkleTree` + `MerkleTreePath` + `merkleTreePathRoot` + `checkRoot` | A set of commitments on the ledger; a member proves "my commitment is in the set" with a path supplied as a witness, without revealing which one. | Anonymous membership. The anonymity set is the tree size (criterion 9). |
| selective disclosure | An issuer commits to a whole record; the holder later discloses only chosen fields, proving they come from that record. | Show some attributes, prove they are genuine, hide the rest. |

## Identity and time

| Term | What it is | Design meaning |
| --- | --- | --- |
| `ownPublicKey()` → `ZswapCoinPublicKey` | The caller's coin public key, supplied by the caller's wallet. | Not authentication (criterion 11). Storing it links all of a user's actions (probe p21). |
| `blockTimeGte` / `Gt` / `Lt` / `Lte` | Compare the block time with a bound. | The bound becomes public: checking "bought over a year ago" with the purchase date reveals the date (probe p28). Have an issuer attest a coarse fact instead. |

## Transaction level (outside the attack tests)

| Term | What it is | Design meaning |
| --- | --- | --- |
| Zswap, shielded / unshielded tokens | Midnight's token layer; shielded transfers hide amounts and parties, unshielded ones do not. | Paying or receiving tokens can reveal more than the contract does. |
| NIGHT, DUST | NIGHT is the native token; DUST is the resource used to pay transaction fees. | Fee payment can link transactions to a wallet. Out of scope for proof-kit; mention it. |

Theory: the model behind all of this is Kachina (a contract = what it does + what it reveals; see `docs/design-guide.md`).
