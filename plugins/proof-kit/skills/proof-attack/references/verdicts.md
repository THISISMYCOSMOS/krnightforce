# Verdicts

Every verdict comes from executing the contract. The engine varies one hidden input at a time (witness values and circuit arguments; struct fields and vector elements separately), holding everything else fixed, and compares what lands on chain: the public transcript of the call, or the ledger state after the constructor.

## Kinds

| Kind | How the engine decides it |
| --- | --- |
| `EXPOSED` | The varied value appears verbatim in the observation in at least two samples. |
| `RECOVERABLE` | The observation is one-to-one in the value, and trying candidates (the whole domain for small types, otherwise a dictionary up to the budget, default 12000) reproduced the base observation with the true value first. |
| `PARTIAL` | Two different values gave the same observation (a property leaks, e.g. `x > 100`), or a different candidate matched before the true one. |
| `MASKED` | The observation changes with the value, but also changes when only another secret input (a salt, nonce or key) changes. No enumeration is attempted. |
| `TAG` | The observation is one-to-one in the value but was not recovered: either the value is high-entropy (a key, salt, id), or a guessable value was not found within the budget (the detail says which). Same value, same tag, so it matters for linking (A3). |

`where` says where the difference appeared: `value` (a value in the transcript), `path` (which ledger cell was touched, or a different sequence of operations; attack A5), `ledger` (constructor state), `result` (the circuit's return value).

Return values go to the caller (the DApp or calling contract), not on chain: the transaction carries only a commitment to inputs and outputs. Findings at `result` have `onChain: false` and never fail.

`status: "untestable"` is not a kind. A unit is untestable when its base run fails (the reason is the error); an input is untestable when every varied run fails or its type cannot be built (opaque types, contract references). Untestable is never a pass; it is gray in the map.

## Failure rule

### Today (engine 0.0.1)

A finding fails when `onChain` is true and `kind` is `EXPOSED`, `RECOVERABLE` or `PARTIAL`. The engine does not yet read `privacy-spec.json` and does not tell a direct `disclose()` from a hash or commitment. So intended disclosures (public ids, a disclosed fact such as `age >= 18`) currently show as failures.

### Decided rule (to implement next)

A failure is leakage outside the leakage description (`docs/design-guide.md`, chapter 5):

| Situation | With `privacy-spec.json` | Without it |
| --- | --- | --- |
| Value, fact or path revealed by a direct `disclose()` | Fails unless `mayReveal` covers it | Declared disclosure: "public", not a failure |
| Value recovered from a hash or commitment | Fails | Fails (the compiler trusted it to hide) |
| Masked by a secret | Pass | Pass |
| Linked actions listed in `unlinkable` | Fails (A3, planned) | — |

To tell a direct `disclose()` from a hash or commitment from execution alone, the engine will record the outputs of the runtime's hash and commitment functions during each run and check whether the differing value is one of them.

## Map colors

| Color | Kinds |
| --- | --- |
| 숨김 (hidden) | no difference in any sample |
| 증명만 (proof only) | `MASKED`, `TAG` |
| 공개 (public) | covered by the leakage description, or a declared disclosure without a spec |
| 위험 (at risk) | failures |
| 회색 (gray) | untestable |

## Scope

A pass means "not reproduced by this attack list", not "safe". Fee addresses, unshielded tokens, network metadata, wallets and proving servers are out of scope.
