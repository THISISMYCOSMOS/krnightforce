# Compiler probe

Tiny contracts that check what the Compact compiler (0.36.0, language 0.28.0) rejects without `disclose()`
and what it lets through. `results.txt` has one line per contract: name, exit code, and the first error lines.

Rerun:

```bash
for f in *.compact; do compact compile --skip-zk "$f" "out_${f%.compact}" >/dev/null 2>&1; echo "$f $?"; done
```

The design guide (`../../design-guide.md`) cites these by id (p01, p04b, ...).

## Execution probes

Some questions need a run, not just a compile. `p29` reads the owner secret twice in one circuit: once to authorize, once inside a nullifier. It compiles, and the compiled JavaScript calls the witness twice (`_secret_0` at two sites). Run with a witness that returns the real secret on the first read and a fresh value on the second, the same owner submits the same scope three times and all three are accepted, each with a new nullifier. `p29b` reads the secret once into a local and uses it for both; the same witness is rejected every time (`failed assert: used`). Run on compiled-circuit execution (runtime 0.21.0), not on a proof server. Script: `../../../packages/proof-kit/scripts/probe-witness-reads.mts`.
