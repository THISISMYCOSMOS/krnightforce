# Compiler probe

Tiny contracts that check what the Compact compiler (0.36.0, language 0.28.0) rejects without `disclose()`
and what it lets through. `results.txt` has one line per contract: name, exit code, and the first error lines.

Rerun:

```bash
for f in *.compact; do compact compile --skip-zk "$f" "out_${f%.compact}" >/dev/null 2>&1; echo "$f $?"; done
```

The design guide (`../../design-guide.md`) cites these by id (p01, p04b, ...).
