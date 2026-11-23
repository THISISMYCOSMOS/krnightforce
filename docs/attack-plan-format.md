# `attack-plan.md` format

`/proof-kit:attack` writes one `attack-plan.md` per project next to the generated `proof-attack.test.ts`. It records what was attacked and why, so a reviewer can check the test design without reading the engine. Every verdict in it comes from execution.

Template:

```markdown
# Attack plan: <contract name>

- Contract: `<path/to/contract.compact>` (sha256 `<hash>`)
- Compiler: Compact <version>, runtime @midnight-ntwrk/compact-runtime <version>
- Engine: proof-kit <version>
- Generated: <date>
- Settings: zero-config | <path to settings file>

## Hidden inputs

| Input | Kind | Type | Assumed range | Source of range |
| --- | --- | --- | --- | --- |
| `secret_pin` | witness | `Bytes<32>` | high entropy + low-entropy encodings dictionary | type default |
| `vote_choice` | witness | `Boolean` | {true, false} | type (full enumeration) |
| `bid:amount` | circuit argument | `Uint<64>` | boundary + random samples | type default |

## Circuits

| Circuit | Hidden inputs used | Ledger cells written | Runs from |
| --- | --- | --- | --- |
| `register` | `secret_pin`, `pin_salt` | `pin_hash`, `pin_commit` | constructor (scenario) |

## Attacks run

| Circuit | Input | A1 exposure | A2 recovery | A5 path | Samples |
| --- | --- | --- | --- | --- | --- |
| `register` | `secret_pin` | run | run (10,000 guesses) | run | 8 |

## Verdicts

| Circuit | Input | Attack | Verdict | Location | Test |
| --- | --- | --- | --- | --- | --- |
| `register` | `secret_pin` | A2 | RECOVERABLE | value | `register / secret_pin / A2` |
| `register` | `secret_pin` | A1 | MASKED | value | `register / secret_pin / A1 salt` |

## Untestable (시험 못 함)

| Circuit | Reason |
| --- | --- |
| `withdraw` | aborted for every sampled input (assert "not owner"); needs a scenario harness |

## Intended disclosures

| Circuit | Input | Reason (from `proofkit accept`) |
| --- | --- | --- |

## Out of scope

- Fee addresses, unshielded tokens, network metadata.
- Wallets and proving servers. When proofs are generated on an external proving server, hidden values are sent to that server; their protection depends on that server's trusted execution environment.

A pass means "not reproduced by this attack list", not "safe".
```
