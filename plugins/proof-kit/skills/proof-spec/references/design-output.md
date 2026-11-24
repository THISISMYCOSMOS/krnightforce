# Design proposal format

Give the design proposal in exactly these five parts, in the user's language. Fill every table from the user's answers; mark anything you assumed as "(assumed — please confirm)".

## 1. What goes where

| Data | Public ledger | User's device | Why |
| --- | --- | --- | --- |
| e.g. age, condition code | commitment only | value + nonce | hidden (criterion 1, 4) |
| e.g. credential id | yes | — | may be revealed: public lookup key |
| e.g. issuer | commitment of issuer secret | issuer secret (issuer's device) | vouches for the claim (criterion 10, 11) |

## 2. What each circuit reveals (the leakage description)

One line per circuit, plain words. This is what the user will agree to.

| Circuit | Who calls it | What anyone can see |
| --- | --- | --- |
| e.g. `issue(id)` | issuer | that a credential with this id was issued, and a commitment to the claim |
| e.g. `verify(id)` | patient | that the credential with this id belongs to someone aged 18 or over |

Also list the unavoidable leakage the user accepts (that a call happened, when, group size).

## 3. Building block per value

For each hidden value: the building block, why, and the pitfall it avoids.

- e.g. age, condition code → `persistentCommit([age, condition], nonce)` with a fresh nonce per credential (criterion 4, 5). Pitfall: `persistentHash` compiles but anyone can hash ages 0–120 until one matches; this exact mistake appeared in a hackathon project.

Use `patterns.md` for the wording of each pitfall and fix.

## 4. Works / does not work

Copy only the rows of the "Works / does not work" table in `criteria.md` that apply to this design.

## 5. How it will be checked

| Criterion | Check |
| --- | --- |
| e.g. 1, 4 | `/proof:attack`: A1 and A2 on `issue` |
| e.g. 6 | `/proof:attack`: A1 on `verify` against `privacy-spec.json` |
| e.g. 10, 11 | not checked by attack tests (guidance) |

End with: "If you agree with part 2, I will save it as `privacy-spec.json`."
