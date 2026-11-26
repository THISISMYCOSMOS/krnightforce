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
