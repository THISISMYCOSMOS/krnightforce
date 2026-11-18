# Spike: A1 differential test

Checks the one assumption the whole plan rests on: a compiled Compact contract can be run
locally, its `publicTranscript` (what lands on chain) can be read, and two runs that differ
only in a hidden value can be compared.

## Run (macOS / Linux, Node 22+)

```bash
# 1. Compact CLI + compiler 0.36.0 (official installer)
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
compact update 0.36.0

# 2. Compile and run
cd spike/a1-differential
npm install
npm run compile
npm run spike
```

## What a pass looks like

| # | Check | Expected |
| --- | --- | --- |
| 0 | Transcript is readable | `register() transcript ops` > 0 |
| 1 | Deterministic | `true` |
| 2 | A1: vary only the PIN | differs (pin_hash and pin_commit both depend on it) |
| 3 | Salt check | salt changes `pin_commit`, not `pin_hash` |
| 4 | A2: recover PIN | found from `pin_hash` (`4821`), `null` from `pin_commit` |
| 5 | A1/A5: vary only the vote | differs (different counter moves) |
| 6 | Speed | ms per differential pair (gate target: whole contract under 30 s) |

Paste the final `JSON {...}` line back into the session.
