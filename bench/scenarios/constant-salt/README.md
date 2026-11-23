# constant-salt

A sealed bid uses `persistentCommit` with a constant salt. The compiler trusts commitments and accepts it without `disclose()`, but the result is as recoverable as a plain hash (A2). Fix: a fresh random nonce per bid.

See the design guide: `docs/design-guide.md`.
