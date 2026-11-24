# privacy-spec.json

The leakage description of one contract: what it may reveal. The attack engine reads it to know which inputs are hidden and their value ranges. Without it, the engine guesses from names and types, and counts every direct `disclose()` as a declared disclosure.

```json
{
  "contract": "src/claims.compact",
  "hidden": [
    { "input": "witness:holder_age", "range": "0..120", "why": "personal data", "shareWith": "pharmacy" }
  ],
  "mayReveal": [
    { "circuit": "check", "input": "arg:id", "kind": "value", "why": "public lookup key" },
    { "circuit": "check", "input": "witness:holder_age", "kind": "fact", "fact": "holder_age >= 18", "why": "only adults are allowed" }
  ],
  "acceptedLeakage": [
    "that check was called, and when"
  ],
  "unlinkable": [
    { "actions": ["vote", "vote"], "why": "same member in two polls" }
  ],
  "vouchedBy": [
    { "input": "witness:holder_age", "by": "issuer", "how": "issuer-only issueCredential" }
  ]
}
```

- `input`: `witness:<name>` or `arg:<name>`; struct fields as `witness:<name>.<field>`.
- `range`: `lo..hi` for numbers, or `Boolean`. Used by the recovery attack.
- `mayReveal.kind`: `value` (the value itself), `fact` (only the condition in `fact`), or `path` (which ledger cell or branch the input selects, A5).
- `acceptedLeakage`: unavoidable leakage the user accepts, in words (that an action happened, its time, group size). Not checked by the engine; it is part of the description the user agrees to.
- `unlinkable`: pairs of actions that must not be linkable (checked by A3, planned).
- `vouchedBy`: who vouches for each input (guide chapter 3). Not checked by the engine.
- `hidden[].shareWith`: the one party that may see the value ("verifier only"). On the public ledger the value stays hidden and every failure rule applies unchanged; that party gets the opening (value + nonce) off chain and checks it against an on-chain commitment. The engine checks, from its findings, that some circuit puts a nonce-masked or hashed value of the input on chain (`verifierChecks`: `ok` or `missing`). `missing` means the verifier has nothing to check the opening against. It is not a privacy failure and does not change the exit code; it is counted in `summary.verifierMissing`.
- A finding on a hidden input fails unless `mayReveal` covers it for that circuit.
- Pass it with `proofkit attack <dir> --spec <file>`, or put it next to the contract source.
- `range` is inclusive.
