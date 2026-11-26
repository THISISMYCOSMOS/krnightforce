# Verdicts

Every verdict comes from executing the contract. The engine varies one hidden input at a time (witness values and circuit arguments; struct fields and vector elements separately), holding everything else fixed, and compares what lands on chain: the public transcript of the call, or the ledger state after the constructor.

## Kinds

| Kind | How the engine decides it |
| --- | --- |
| `EXPOSED` | The varied value appears verbatim in the observation in at least two samples. |
| `RECOVERABLE` | The observation is one-to-one in the value, and trying candidates (the whole domain for small types, otherwise a dictionary up to the budget, default 12000) reproduced the base observation with the true value first. |
| `PARTIAL` | Two different values gave the same observation (a property leaks, e.g. `x > 100`), or a different candidate matched before the true one. |
| `MASKED` | The observation changes with the value, but also changes when only another secret input (a salt, nonce or key) changes. No enumeration is attempted. |
| `UNBOUND` | Attack T2 (split witness). The circuit read this witness more than once in one call, and the call still succeeded when the first read, or the later reads, got a different value. Each read is a separate private input, so the value checked (against a commitment, an owner key) and the value used (in a fact, a nullifier) can differ. Always a failure, criterion 10; `mayReveal` does not cover it. Reads are counted per witness and arguments: a witness that takes an argument and is called with different ones is several inputs and is not flagged; the same arguments twice are. A no-argument witness meant to return fresh randomness on each call is flagged too, on purpose: each call is an unbound input, so read it once. `location` is the read count (with the arguments, if any). If A1 could not vary the input (one read is bound by a check), T2 still tests it: the input counts as tested and keeps A1's note. |
| `TAG` | The observation is one-to-one in the value but was not recovered: either the value is high-entropy (a key, salt, id), or a guessable value was not found within the budget (the detail says which). Same value, same tag, so it matters for linking (A3). |

`where` says where the difference appeared: `value` (a value in the transcript), `path` (which ledger cell was touched, or a different sequence of operations; attack A5), `ledger` (constructor state), `result` (the circuit's return value).

Return values go to the caller (the DApp or calling contract), not on chain: the transaction carries only a commitment to inputs and outputs. Findings at `result` have `onChain: false` and never fail.

`status: "untestable"` is not a kind. A unit is untestable when its base run fails (the reason is the error); an input is untestable when every varied run fails or its type cannot be built (opaque types, contract references). Untestable is never a pass; it is gray in the map.

Verdicts rest only on runs that happened:

- **Run cap.** Each unit has a hard cap on runs (budget + 2000 by default, setup calls, probes and retries included). A run the cap refuses never happened. If the cap cut an input's samples or its recovery short and no failure was found from the runs that did happen, the input is untestable with the reason "run cap reached". If a failure was found, it stays, with `evidence.capped`.
- **Recovery position.** A2 reports `RECOVERABLE` only when the true value was reached among the candidates that actually ran. A base value past them (a threshold from the source, a large number with no spec range) is "not recovered within N candidates (the value lies beyond them)", never recovered.
- **Follow mode.** Setup calls normally stay fixed while an input varies. Only an input that cannot vary with them fixed (probed with spread samples, values next to the base, the source constants and their offsets, the spec range bounds) is attacked with the setup calls following it. Such an input carries the note "tested with setup calls following this input; leaks through the setup-written value cannot be seen". A difference that equals a value the following setup call wrote may be that write read back, or a real leak of the same value; the engine cannot tell which cell wrote it, so the verdict stands and the finding carries `evidence.setupWrote` and "check by hand". T2 split runs refused by the run cap make the input untestable rather than clean.

## Failure rule

A failure is leakage outside the leakage description (`docs/design-guide.md`, chapter 5). Each finding also carries:

- `derived`: `"hash"` when every differing value was an output of the runtime's hash or commitment functions in that run (the engine logs `persistentHash`, `persistentCommit`, `transientHash`, `transientCommit` while it runs), otherwise `"direct"`.
- `disclosure`: why a failure kind is not a failure — `"declared"` (no spec; the code disclosed it directly) or `"spec"` (`mayReveal` allows it) — or `null`.

| Situation | With `privacy-spec.json` | Without it |
| --- | --- | --- |
| Value, fact or path revealed directly (`derived: "direct"`) | Fails unless `mayReveal` covers it | `disclosure: "declared"`, not a failure |
| Value recovered through a hash or commitment (`derived: "hash"`) | Fails unless `mayReveal` covers it | Fails (the compiler trusted it to hide) |
| Masked by a secret, or a tag | Pass | Pass |
| Linked actions listed in `unlinkable` | Fails (A3, planned) | — |

`mayReveal` coverage is by circuit + input: `kind: "value"` covers `EXPOSED` and `RECOVERABLE`, `"fact"` covers `PARTIAL`, `"path"` covers any failure at `where: "path"`. The `fact` text is for people; the engine does not evaluate it.

The CLI takes `--spec <file>`; without it, `privacy-spec.json` next to the contract source is used if present (`--no-spec` turns this off).

## Verifier checks

For each `hidden` entry with `shareWith` in the leakage description, the report has a `verifierChecks` entry: `ok` with the circuits where a finding on that input has `onChain: true` and kind `MASKED` or `TAG` (a nonce-masked or hashed value of it lands on chain, so the named party can check the opening it gets off chain), or `missing` when there is none. Struct fields count for their parent input. These come from findings only, never from the source.

A `missing` check is not a privacy failure: it does not change `failure`, `summary.failures` or the exit code. It is counted in `summary.verifierMissing` and printed as `verifier check: <input> → <party>: MISSING`. On the map, the input node shows `검증자: <party>`.

## Map colors

| Color | Kinds |
| --- | --- |
| 숨김 (hidden) | no difference in any sample |
| 증명만 (proof only) | `MASKED`, `TAG` |
| 공개 (public) | `disclosure` is `"spec"` or `"declared"` |
| 위험 (at risk) | failures |
| 시험 못 함 (gray) | untestable |

## Scope

T2 covers only witnesses read more than once in a call. Other false-witness, impersonation and caller-time attacks (T1–T3) are out of scope (midnight-expert covers them). A pass means "not reproduced by this attack list", not "safe". Fee addresses, unshielded tokens, network metadata, wallets and proving servers are out of scope.
