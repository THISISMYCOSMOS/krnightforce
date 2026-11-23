# Bench

`proofkit bench` measures whether the engine is good enough to propose upstream (midnight-expert). It is run locally; the report `bench-report.md` goes into the PR description.

## What lives here

- `scenarios/`: self-written contract pairs (a holed version and a fixed version) with answer keys. Public.
- `schema/answer-key.schema.json`: the answer-key format.

**Answer keys for third-party repositories are NOT stored in this public repository.** Unseen-repo answer keys and any finding about someone else's code are kept privately; authors are told first, and reports never name their repositories.

## Pass criteria (all must hold)

| # | Criterion | Target |
| --- | --- | --- |
| 1 | Finds known holes | 10+ scenario pairs; every expected finding in every holed version is reported |
| 2 | No false failures | 0 failures on every fixed version and on hardened award-winning contracts |
| 3 | Unseen repositories | 10+ public repos pushed on/after 2026-11-17, commits pinned, human-judged: 80%+ of reported failures are real holes |
| 4 | Works without configuration | 80%+ of contracts run with zero config; "시험 못 함" (untestable) counted separately |
| 5 | Fast rerun | rerun after changing one circuit ≤ 30 s |
| 6 | Works without the plugin | generated tests pass/fail identically via `npm test` and pre-push |
| 7 | Deterministic | 3 runs give identical results |

A pass means "not reproduced by this attack list", not "safe".
