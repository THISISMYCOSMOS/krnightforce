# salary-band — planted holes (holed/salary_band.compact)

Assumed meaning of the schema attack codes (I was not allowed to read the tool's docs, so this is a guess from the `kind` descriptions): A1 = EXPOSED, A2 = RECOVERABLE, A3 = LINKABLE, A5 = PARTIAL, T2 = UNBOUND (split witness).

## H1 — unsalted salary record (mapped: A2 / RECOVERABLE / ledger)
- Circuit: `issueSalary`, input `arg:amount` (same value later re-hashed from `witness:salary` in `applyWithBand`).
- The record is `persistentHash({employee, amount})` with no salt. The employee key is known to HR and to every recruiter the employee applies to, and salaries live in a tiny range (~400k integer values). Anyone holding the key hashes every candidate salary and matches the record on chain: the exact salary is recovered in well under a second.
- Why a first-timer writes it: "it's a hash, so it's hidden" — hashing feels like encryption, and the salt seems unnecessary because the employee key already looks random.

## H2 — membership check publishes the record itself (mapped: A3 / LINKABLE / ledger)
- Circuit: `applyWithBand`, input `witness:employeeSecret` (and `witness:salary`, which also goes into the leaf).
- `salaryRecords.member(disclose(leaf))` puts the leaf into the public transcript. It equals the value HR inserted in `issueSalary`, and it is identical for every application. An observer links each application to the HR issuance (which employer, when) and links all applications of one person across postings. Combined with H1, every application also reveals the salary to anyone who knows the employee key.
- Why: `Set.member` is the obvious membership API; the compiler demands `disclose` and the beginner adds it without realising the argument becomes public. Merkle paths look like extra complexity.

## H3 — attested salary returned to the caller (mapped: A1 / EXPOSED / result)
- Circuit: `applyWithBand`, input `witness:salary`.
- `return disclose(s)` — circuit results are part of the public transaction. Everyone on chain sees the exact salary even though only "inside the band" was meant to be proven.
- Why: the author wants the recruiter's UI to show the number and thinks a return value stays in the local DApp; the compiler error is silenced with `disclose`.

## Fix summary (fixed/salary_band.compact)
Salted, domain-separated commitment (256-bit salt); `HistoricMerkleTree` + path witness so only the public root is disclosed; per-posting nullifier `hash("salary:apply", postingId, sk)` for one application per posting; no return value; every witness read exactly once.
