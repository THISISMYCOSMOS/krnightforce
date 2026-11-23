# Scenario pairs

Each scenario is a pair of self-written contracts: one with a deliberate privacy hole and one fixed.

```
scenarios/<name>/
  holed/<contract>.compact
  fixed/<contract>.compact
  answer.json          # follows ../schema/answer-key.schema.json
  README.md            # one paragraph: the hole, the fix, which attack should catch it
```

Rules:

- Write the contracts yourself. Do not copy third-party code here, including from hackathon repos.
- `answer.json` lists, for the holed version, every finding the engine must report; for the fixed version, `expectFailures` is `false` (no failures allowed).
- Intended disclosures (values the design reveals on purpose) are listed so they are not counted as holes.
- Pin the compiler version used to write the answer key.
