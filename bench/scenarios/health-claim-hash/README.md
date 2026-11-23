# health-claim-hash

The claim (age, condition code) is hidden with a plain `persistentHash`. The compiler accepts it, but both values have small ranges, so hashing candidates recovers them (A2). Fix: `persistentCommit` with a fresh nonce from the user.

See the design guide: `docs/design-guide.md`.
