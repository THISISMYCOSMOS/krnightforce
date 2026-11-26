# Skeleton rules

Step 4 writes a compilable Compact skeleton from the agreed design: ledger fields, witnesses, circuits, the hiding building blocks. Compile with `compact compile --skip-zk`; fix every error before going on. Each rule below has a one-line snippet using only constructs that appear in the bench fixed scenarios (compile with 0.36.0). Whole files to copy from: `bench/scenarios/car-club/fixed/club.compact`, `bench/scenarios/split-witness/fixed/pass.compact`, `bench/scenarios/constant-salt/fixed/bids.compact`, `bench/scenarios/vote-branch/fixed/poll.compact`.

Header of every file: `pragma language_version >= 0.22;` and `import CompactStandardLibrary;`.

## 1. Read each witness once per circuit

Two calls are two independent inputs (probe p29). Read into a local, then pass the value to helpers.

```
const year = birth_year();   // then use `year`, never call birth_year() again
```
Example: `redeem` in `split-witness/fixed/pass.compact`; helpers in `club.compact` take values, not witness calls.

## 2. Commitments with a fresh nonce

The nonce is a witness the user keeps, one per value. Never a constant, never derived from the secret.

```
sealed_bid = persistentCommit<Uint<16>>(bid_amount(), bid_nonce());
```
Example: `constant-salt/fixed/bids.compact`; several fields: `record` in `club.compact`.

## 3. Domain tag per hash kind

Every hash starts with its own tag, so a hash made for one purpose cannot be replayed as another.

```
persistentHash<Vector<2, Bytes<32>>>([pad(32, "carclub:owner:v1"), secret])
```
Example: `owner_key_of`, `plate_tag`, `operator_commitment` in `club.compact`.

## 4. Nullifier with a scope

Hash the tag, the scope (poll, round, season) and the secret. A secret alone links every action of one member.

```
const tag = persistentHash<Vector<3, Bytes<32>>>([pad(32, "pass:use:v1"), disclose(season), secret]);
```
Check `used.member(disclose(tag))`, then insert. Example: `redeem` in `split-witness/fixed/pass.compact`.

## 5. Recompute results in the circuit

Do not trust a value computed elsewhere: recompute the commitment from the witnesses and compare with the ledger.

```
assert(passes.member(disclose(pass_commitment(year, secret))), "no pass");
```
Example: `owns` in `club.compact`.

## 6. No `ownPublicKey` for authorization

Prove a secret behind a stored key instead. The ledger holds a commitment; the caller shows the secret that opens it.

```
assert(operator_commitment(secret) == operator_commit, "not the operator");
```
Example: `check_operator` in `club.compact`, `issue` in `pass.compact`.

## 7. `disclose()` only where the leakage description allows

Each `disclose()` must match an entry in `privacy-spec.json` (`mayReveal`). Reveal the fact, not the value.

```
assert(disclose(year <= 2006), "too young");   // reveals the fact, not the year
```
Example: `proveHeldYear` in `club.compact`; the wrong way (branching on a disclosed value) is in `vote-branch`, fixed by storing a commitment: `ballots.insert(persistentCommit<Boolean>(choice(), ballot_nonce()));`.

## 8. Bind every witness to something

The most common real circuit mistake is an input nothing constrains (`docs/evidence.md`: 95 of 99 circuit bugs in the SNARK SoK). A witness is whatever the DApp returns. Every witness that changes a fact, a ledger write or an authorization must be checked against one of these: a commitment the issuer or operator wrote, ledger state, or a secret behind a stored key. In the design proposal (part 3), write for each witness what binds it. A witness with nothing to bind it is a design gap: stop and ask who vouches (criterion 10).

```
assert(credentials.lookup(disclose(id)) == claim_commitment(age, condition, nonce), "claim does not match");
```
Example: `verifyAdult` in `health-credential/fixed/credential.compact`.

## 9. Check, then insert, for one-time actions

A nullifier set only prevents replay if the circuit checks membership before inserting. Example: rule 4.

## 10. Totals in `Uint`, bounds and state checked, fixed settings `sealed`

`Field` arithmetic wraps around; `Uint` checks its range. Check amounts and the contract's state before using them, and mark settings that must never change `sealed`. All three compile with 0.36.0 (probe `p30_sealed_uint_range_nullifier`):

```
export sealed ledger fee_cap: Uint<32>;
assert(active, "inactive");
assert(a > 0 && a <= 1000, "amount out of range");
total = disclose((total + a) as Uint<32>);
```

## Out of scope

The skeleton rules cover the contract's own circuits. They do not address proof-system or verifier flaws, trusted setup, or compiler bugs; Compact's compiler generates the constraints, so Circom-specific mistakes (assigned but unconstrained signals, curve-specific templates) do not apply. See `docs/evidence.md`.
