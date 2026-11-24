# 따라 하기: 소득 기준 장학금

사용자는 한 줄만 말합니다. 그 한 줄로 `/proof:spec`이 상황을 기획하고, 사용자와 주고받으며 회로까지 설계하는 두 번째 예제입니다. 기준 번호는 `plugins/proof-kit/skills/proof-spec/references/criteria.md`의 12개 기준입니다.

- 만든 계약: `bench/scenarios/scholarship/`
- 5단계 결과: 엔진을 실제로 돌린 출력

> **표시 규칙**: "(제안 — 확인 필요)"는 스킬이 제안했고 사용자가 아직 확정하지 않은 답입니다. 이 문서는 시나리오를 만들려고 제안을 그대로 채택했습니다.

## 0. 사용자 입력

> **사용자**: 소득이 낮은 학생만 장학금을 신청하게 하고 싶어. 소득은 숨기고.

## 1단계. 상황 기획과 회로

한 줄에서 빠진 부분을 스킬이 채웁니다.

- **"소득이 낮다"의 기준**: 국내 장학 제도에서 흔히 쓰는 기준 중위소득 대비 비율(%)로 정합니다. 자격 기준은 "100% 이하"로 둡니다(제안 — 확인 필요).
- **누가 보증하나**: 학생이 스스로 입력한 소득은 믿을 수 없습니다(기준 10). 장학팀이 소득 서류를 장부 밖에서 확인하고 자격 증명을 발급합니다.
- **사용자가 말하지 않은 핵심**: 이 장학금은 저소득 학생만 신청할 수 있습니다. 그래서 **신청했다는 사실 자체가 "저소득"이라는 정보**입니다.
  - 따라서 소득만 숨기면 부족하고, **누가 신청했는지**도 숨겨야 합니다.
  - 이 점 때문에 신청자 명단에 학번이나 카드 id를 쓰지 않습니다.
- **발급과 소득의 분리**: 발급 대상을 자격 있는 학생으로 한정하면, 발급 기록만 봐도 저소득임이 드러납니다.
  - 그래서 자격과 상관없이 요청한 모든 학생에게 발급합니다(제안 — 확인 필요).
- **1회 신청**: 회차마다 한 번만 신청할 수 있습니다. 회차가 바뀌면 같은 학생의 신청끼리 이어지면 안 됩니다.

| 회로 | 누가 부르나 | 장부에 생기는 일 |
| --- | --- | --- |
| `issue()` | 장학팀 | 자격 증명 커밋 하나를 추가 |
| `openRound(r)` | 장학팀 | 신청 회차를 r로 설정 |
| `apply()` | 학생 | 신청 태그 하나를 추가하고, 신청자 수를 1 증가 |

> 이렇게 이해했습니다. 맞나요?

## 1b단계. 정보 목록

| 정보 | 사용자 말 | 제안 | Midnight 장치 |
| --- | --- | --- | --- |
| 소득 비율 | 숨김 | 숨김. "100% 이하"라는 사실만 | 커밋 + `disclose(income_pct() <= 100)` |
| 학번 | 말 안 함 | 숨김 (신청 = 저소득) | 커밋 안에만 |
| 신청 여부 | 말 안 함 | "누군가 자격 있는 학생이 신청했다"까지만 | 범위별 nullifier |
| 이름·가구원 수·실소득액 | 말 안 함 | 장부에 올리지 않음 (장학팀이 장부 밖에서 확인) | 없음 |
| 지갑 주소 | 말 안 함 | 쓰지 않음 | `ownPublicKey()` 미사용 (기준 11) |
| 심사 기록 | 말 안 함 | 장부 밖 (장학팀 내부) | 없음 |

**nullifier**는 "같은 자격 증명으로 두 번 하지 못하게" 막는 일회용 태그입니다.
- 비밀과 범위(이 경우 회차)를 섞어 만듭니다.
- 그래서 회차가 다르면 같은 학생의 태그끼리 무관해 보입니다(기준 8).

## 2단계. 네 가지 질문 (제안 — 확인 필요)

1. **숨길 값**: 소득 비율, 학번, 누가 신청했는지
2. **드러나도 되는 것**:
   - 회차 번호(값)
   - 신청 시 "소득 ≤ 중위소득 100%"(사실)
3. **이어지면 안 되는 행동**: 한 학생의 서로 다른 회차 신청끼리
4. **보증 주체**: 장학팀. 배포 때 장학팀 비밀의 해시를 고정합니다.

## 3단계. 설계안

**1. 어디에 두나**

| 데이터 | 공개 장부 | 사용자 기기 | 이유 |
| --- | --- | --- | --- |
| 학번, 소득 비율 | 커밋만 | 값 + nonce (학생) | 숨김 (기준 1, 4, 5) |
| 신청 태그 | `hash([도메인, 회차, 자격 증명 비밀])` | 자격 증명 비밀 | 1회 신청, 회차 간 연결 차단 (기준 8) |
| 신청자 수 | 카운터 | — | 받아들이는 누출 |
| 심사 기록 | 없음 | 장학팀 내부 | 장부에 올릴 이유 없음 (기준 6) |

**2. 회로마다 드러나는 것 (누출 설명)**

| 회로 | 누가 부르나 | 누구나 볼 수 있는 것 |
| --- | --- | --- |
| `issue()` | 장학팀 | 자격 증명 하나가 발급됐다는 것과 그 커밋 (소득과 무관하게 발급) |
| `openRound(r)` | 장학팀 | 회차 r |
| `apply()` | 학생 | 자격 있는 누군가가 이번 회차에 신청했다는 것 |

받아들이는 누출:
- 발급·신청의 시점
- 회차별 신청자 수
- `apply`가 발급된 커밋 하나를 가리킨다는 것
  - 장학팀은 어느 커밋이 누구 것인지 알므로, 누가 신청했는지 압니다.
  - 장학금을 주는 쪽이라 받아들입니다.
  - 공개 장부를 보는 사람도 "몇 번째로 발급된 증명이 신청했는지"는 압니다.
  - 이것까지 끊으려면 Merkle 트리 멤버십이 필요합니다. 이 부분은 A3(예정)에서 확인합니다.

**3. 값마다 쓸 부품**

- **자격 증명**: `persistentCommit([학번, 소득 비율], nonce)`(기준 4, 5). nonce는 학생의 자격 증명 비밀을 겸합니다.
- **신청 태그**: `persistentHash([도메인, 회차, 자격 증명 비밀])`(기준 8)
  - 함정: `persistentHash([도메인, 학번])`도 컴파일되고 중복을 잘 막습니다.
  - 하지만 입학 연도는 공개 명부 수준이라 뒤 네 자리만 전수 대입하면 학번이 풀립니다. 게다가 회차마다 같은 태그라 신청 이력이 이어집니다.
- **자격 확인**: `disclose(income_pct() <= 100)`만 공개합니다(기준 6).
  - 함정: "나중에 심사하려고" 신청 기록에 소득 비율을 함께 저장하는 것. `disclose()`로 감싸면 컴파일되지만 그대로 공개됩니다.

**4. 되는 것 / 안 되는 것**

| 컴파일러가 막아 줌 | 컴파일되지만 샘 |
| --- | --- |
| 소득 비율을 `disclose()` 없이 장부에 쓰기 | `review_log.insert(태그, disclose(income_pct()))` |
| 학번을 `disclose()` 없이 장부에 쓰기 | `disclose(persistentHash([도메인, 학번]))` |

**5. 확인 방법**

| 기준 | 확인 |
| --- | --- |
| 1, 4, 5 | `/proof:attack`: `issue`, `apply`에서 A1, A2 |
| 6 | `/proof:attack`: `apply`에서 A1을 누출 설명과 대조 |
| 8 (회차 간 연결) | A3 (예정). 지금은 학번이 태그에서 풀리는지만 A2로 확인 |
| 10, 11 | 공격 시험으로 확인하지 않음 (안내) |

## 4단계. 누출 설명

[privacy-spec.json](../../bench/scenarios/scholarship/privacy-spec.json)

- 학번 범위는 뒤 네 자리(0..9999)입니다.
- 소득 비율 범위는 0..400%입니다.

## 5단계. 공격 시험

쉬운 실수 두 개를 넣은 판이 [holed/scholarship.compact](../../bench/scenarios/scholarship/holed/scholarship.compact)입니다. 엔진 출력 중 실패는 다음과 같습니다.

```
setup: apply runs after issue
[apply]
  witness:student_no: FAIL recoverable [A2] at value op 7 — recovered the hidden value 37 after 38 candidates (criteria 4, 5)
  witness:student_no: FAIL recoverable [A2] at value op 11 — recovered the hidden value 37 after 38 candidates (criteria 4, 5)
  witness:student_no: FAIL recoverable [A2] at value op 19 — recovered the hidden value 37 after 38 candidates (criteria 4, 5)
  witness:income_pct: FAIL exposed [A1] at value op 20 — the input appears verbatim (criteria 1, 2)
4 failure(s); 9 input(s) tested, 0 untestable
```

> **스킬**: 실패 두 가지를 기준에 맞춰 설명하면 이렇습니다.
>
> **① 학번 (기준 4, 8).** 신청 태그에서 학번을 되찾았습니다. 태그를 자격 증명 비밀과 회차로 만드세요.
>
> **② 소득 비율 (기준 2, 6).** 누출 설명은 "100% 이하"라는 사실만 허락합니다. 그런데 심사 기록이 값 자체를 공개했습니다. 심사 기록은 장부 밖에 두세요.

설계대로 만든 판 [fixed/scholarship.compact](../../bench/scenarios/scholarship/fixed/scholarship.compact)의 결과입니다.

```
setup: apply runs after issue
[apply]
  witness:student_no: masked [A1] at value op 2 — changes with this input but is masked by witness:cred_nonce
  witness:income_pct: masked [A1] at value op 2 — changes with this input but is masked by witness:cred_nonce
0 failure(s); 9 input(s) tested, 0 untestable
```

고친 판에서 `cred_nonce`는 "tag (linkable)"로 표시됩니다. 이것은 받아들인 누출, 즉 `apply`가 발급된 커밋을 가리키는 것과 같은 내용입니다.
