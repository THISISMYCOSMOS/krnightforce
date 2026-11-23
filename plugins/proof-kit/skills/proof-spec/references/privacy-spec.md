# privacy-spec.json

The leakage description of one contract: what it may reveal. The attack engine reads it to know which inputs are hidden and their value ranges. Without it, the engine guesses from names and types, and counts every direct `disclose()` as a declared disclosure.

```json
{
  "contract": "src/claims.compact",
  "hidden": [
    { "input": "witness:holder_age", "range": "0..120", "why": "personal data" }
  ],
  "mayReveal": [
    { "circuit": "check", "input": "arg:id", "kind": "value", "why": "public lookup key" },
    { "circuit": "check", "input": "witness:holder_age", "kind": "fact", "fact": "holder_age >= 18", "why": "only adults are allowed" }
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
- `mayReveal.kind`: `value` (the value itself) or `fact` (only the condition in `fact`).
- A finding on a hidden input fails unless `mayReveal` covers it for that circuit.
- Engine support for reading this file is planned; the format is fixed first so scenarios can use it.
