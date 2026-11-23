# Verdicts

Every verdict comes from executing the contract. The engine varies one hidden input while holding everything else fixed (including salts), then compares what lands on chain.

## Failures

| Verdict | Meaning | Typical cause |
| --- | --- | --- |
| `EXPOSED` | The hidden value itself appears verbatim on chain. | Writing a witness or circuit argument to the ledger, or using it as a map key. |
| `RECOVERABLE` | A public value is deterministic in the hidden value, and enumerating the value range found the original. | Unsalted hash of a low-entropy value (PIN, age, vote, small amount). |
| `PARTIAL` | Different hidden values give the same public output: a fact about the value leaks. | Disclosing a comparison (`secret > 100`) or branching on it. |

## Not failures

| Verdict | Meaning | What to do |
| --- | --- | --- |
| `TAG` | A deterministic public tag of a high-entropy value; enumeration cannot recover it. The same value always gives the same tag. | Not a failure alone. Passed to linking (A3): if two actions by one user share the tag, they are linkable. |
| `MASKED` | The public output changes with the hidden value, but changing only the salt or secret also changes it, and enumeration fails. | Hidden behind a salt or secret. Pass. |
| `UNTESTABLE` | The engine could not run the attack (circuit aborted for every input, unsupported type, missing harness). | Gray "시험 못 함" in the map. Report the reason; never count as a pass. |

Only findings with `failure: true` count. A finding fails when its kind is a failure kind and `onChain` is true.

## Location kinds

| Location | Where the difference appeared |
| --- | --- |
| `value` | A value written to the ledger or pushed in the public transcript (A1). |
| `path` | Which ledger cell or map key was touched (A5). |
| `result` | The circuit's return value. It goes to the caller (the DApp or calling contract), not on chain: the transaction carries only a commitment to inputs and outputs. Findings here have `onChain: false` and never fail. |
| `ledger` | A ledger cell set by the constructor. |

## Scope

A pass means "not reproduced by this attack list", not "safe". Fee addresses, unshielded tokens, network metadata, wallets and proving servers are out of scope.
