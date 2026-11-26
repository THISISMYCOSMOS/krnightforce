# 따라 하기: 차 동호회 회원 카드

사용자는 한 줄만 말합니다. 그 한 줄로 `/proof:spec`이 상황을 기획하고, 사용자와 주고받으며 회로까지 설계하는 과정을 보여 줍니다. 기준 번호는 `plugins/proof-kit/skills/proof-spec/references/criteria.md`의 12개 기준입니다.

- 만든 계약: `bench/scenarios/car-club/`
- 5단계 결과: 엔진을 실제로 돌린 출력

> **표시 규칙**: "(제안 — 확인 필요)"는 스킬이 제안했고 사용자가 아직 확정하지 않은 답입니다. 이 문서는 시나리오를 만들려고 제안을 그대로 채택했습니다. 실제 사용에서는 사용자가 정합니다(스킬 함정 1).

## 0. 사용자 입력

> **사용자**: 차 동호회 앱. 차 정보만 알리고 차번호·구매일·실소유주는 숨기고 싶어.

## 1단계. 상황 기획과 회로

한 줄에서 빠진 부분을 스킬이 채워 상황으로 만듭니다.

- **누가 보증하나**: 회원이 스스로 입력한 차 정보는 믿을 수 없습니다(기준 10). 그래서 운영자가 등록증을 장부 밖에서 확인한 뒤 등록합니다.
  - 정비소 같은 외부 기관도 가능합니다. 다만 그러면 키 관리 주체가 하나 늘어납니다. 동호회 규모에서는 운영자로 충분합니다.
- **"차 정보"의 범위**: 모델(제조사·차종 코드)만 공개합니다.
  - 연식과 색상까지 더하면 같은 동호회 안에서 그 차가 한 대로 좁혀지기 쉽습니다(조합 누출, A6).
- **동호회에서 실제로 쓰는 사실**: "1년 이상 보유"는 장기 회원 배지로 흔히 씁니다. 구매일 자체 대신 이 사실만 증명합니다.
- **중복 등록 방지**: 같은 차가 두 번 등록되면 안 됩니다. 차번호를 숨긴 채로 중복을 막아야 합니다.

| 회로 | 누가 부르나 | 장부에 생기는 일 |
| --- | --- | --- |
| `registerCar(id)` | 운영자 | 카드 id에 차량 기록 커밋을 저장하고, 중복 방지 태그를 추가 |
| `setMonth(m)` | 운영자 | 동호회 달력(2000-01부터 센 달 수)을 갱신 |
| `showCar(id)` | 회원 | 이 카드의 차 모델을 공개 |
| `proveHeldYear(id)` | 회원 | 이 카드를 장기 보유 배지 명단에 추가 |

> 이렇게 이해했습니다. 맞나요?

## 1b단계. 정보 목록

| 정보 | 사용자 말 | 제안 | Midnight 장치 |
| --- | --- | --- | --- |
| 차 모델 | 공개 | 공개 (`showCar`에서만) | `disclose(car_model())` |
| 차번호 | 숨김 | 숨김. 중복 방지 태그는 운영자 비밀과 섞음 | 커밋 + `persistentHash([도메인, 운영자 비밀, 번호])` |
| 구매일 | 숨김 | 숨김. "1년 이상"이라는 사실만 공개 | 커밋 + `disclose(구매월 + 12 <= 동호회 달)` |
| 실소유주 | 숨김 | 이름은 장부에 올리지 않음. 운영자가 장부 밖에서 확인. 카드 주인 증명은 회원 키로 | 커밋 안에 회원 키 `hash(회원 비밀)` |
| 회원 카드 id | 말 안 함 | 공개 (조회 키) | `disclose(id)` |
| 연식·색상 | 말 안 함 | 올리지 않음 (모델과 합치면 차가 특정됨) | 없음 |
| 지갑 주소 | 말 안 함 | 쓰지 않음 | `ownPublicKey()` 미사용 (기준 11) |

Midnight 장치 설명:
- **커밋**(`persistentCommit(값, nonce)`): nonce를 모르면 값을 대입해 맞혀 볼 수 없는 봉인입니다.
- **해시**(`persistentHash`): nonce가 없습니다. 값의 경우의 수가 적으면 전수 대입으로 풀립니다.

## 2단계. 네 가지 질문 (제안 — 확인 필요)

1. **숨길 값**: 차번호, 구매월, 실소유주
2. **드러나도 되는 것**:
   - 카드 id(값)
   - 차 모델(값, 회원이 고를 때만)
   - "구매월 + 12 ≤ 동호회 달"(사실)
3. **이어지면 안 되는 행동**: 이번 설계에서는 없음.
   - 같은 카드 id로 모델 공개와 배지 증명이 이어지는 것은 받아들입니다(회원 카드라서).
   - 카드끼리도 이어지지 않게 하려면 Merkle 트리 멤버십이 필요합니다. 이것은 A3(예정)에서 확인합니다.
4. **보증 주체**: 운영자. 배포 때 운영자 비밀의 해시를 고정합니다.

## 3단계. 설계안

**1. 어디에 두나**

| 데이터 | 공개 장부 | 사용자 기기 | 이유 |
| --- | --- | --- | --- |
| 모델, 구매월, 차번호, 회원 키 | 커밋만 | 값 + nonce + 회원 비밀 (회원) | 숨김 (기준 1, 4, 5) |
| 차번호 중복 방지 | 운영자 비밀을 섞은 태그 | 운영자 비밀 (운영자) | 전수 대입 차단 (기준 4) |
| 동호회 달 | 그대로 | — | 공개 달력. 블록 시각과 구매 시각을 비교하지 않으려는 것 |
| 카드 id | 그대로 | — | 공개 조회 키 |

회원은 등록 때 회원 키 `owner_key_of(회원 비밀)`만 운영자에게 건넵니다. 운영자는 이 키를 차량 기록 커밋에 넣습니다.
- `showCar`와 `proveHeldYear`는 회원 비밀로 키를 다시 계산해 기록과 맞춥니다.
- 그래서 운영자도 회원 대신 증명할 수 없습니다(기준 11). `ownPublicKey()`는 쓰지 않습니다.

**2. 회로마다 드러나는 것 (누출 설명)**

| 회로 | 누가 부르나 | 누구나 볼 수 있는 것 |
| --- | --- | --- |
| `registerCar(id)` | 운영자 | 이 id로 차가 등록됐다는 것, 기록 커밋, 중복 방지 태그 |
| `setMonth(m)` | 운영자 | 동호회 달 m |
| `showCar(id)` | 회원 | 이 카드의 차 모델 |
| `proveHeldYear(id)` | 회원 | 이 카드의 차가 동호회 달 기준 12개월 이상 보유됐다는 것 |

피할 수 없는 것:
- 등록·공개·증명이 있었다는 사실과 그 시점
- 등록된 차의 수

**3. 값마다 쓸 부품**

- **차량 기록**: `persistentCommit([모델, 구매월, 차번호, 회원 키], nonce)`(기준 4, 5)
- **중복 방지 태그**: `persistentHash([도메인, 운영자 비밀, 차번호])`
  - 함정: `persistentHash([도메인, 차번호])`도 컴파일됩니다. 하지만 번호판 경우의 수(약 3.6억)는 오프라인에서 전부 대입할 수 있습니다.
- **1년 보유**: `disclose(구매월 + 12 <= current_month)`. `current_month`는 운영자가 올리는 공개 장부 값입니다.
  - 함정: `blockTimeGte(구매 시각 + 1년)`이 자연스러워 보입니다. 이때 컴파일러가 `disclose()`를 요구하는데, 감싸서 통과시키면 비교 시각, 즉 구매일이 공개됩니다(실험 p28).

**4. 되는 것 / 안 되는 것**

| 컴파일러가 막아 줌 | 컴파일되지만 샘 |
| --- | --- |
| `blockTimeGte(숨긴 값에서 나온 시각)`을 `disclose()` 없이 | 같은 것을 `disclose()`로 감싼 것 |
| 차번호를 `disclose()` 없이 장부에 쓰기 | `disclose(persistentHash([도메인, 차번호]))` |

**5. 확인 방법**

| 기준 | 확인 |
| --- | --- |
| 1, 4, 5 | `/proof:attack`: `registerCar`에서 A1, A2 |
| 6 | `/proof:attack`: `showCar`, `proveHeldYear`에서 A1·A2를 누출 설명과 대조 |
| 10 | `/proof:attack`: T2(분할 witness)로 witness를 한 번만 읽는지 확인. 나머지 보증은 안내 |
| 11 | 공격 시험으로 확인하지 않음 (안내) |

## 4단계. 누출 설명

[privacy-spec.json](../../bench/scenarios/car-club/privacy-spec.json)

차번호 범위는 엔진 예산(후보 12000개) 안에서 재현하려고 뒤 네 자리(0..9999)로 줄였습니다. 실제 번호판도 오프라인에서는 몇 분이면 전부 대입할 수 있으므로, 결론은 같습니다.

## 5단계. 공격 시험

같은 설계에 쉬운 실수 두 개를 넣은 판이 [holed/club.compact](../../bench/scenarios/car-club/holed/club.compact)입니다. 엔진 출력 중 실패는 다음과 같습니다.

```
setup: witness owner_key = owner_key_of(owner_secret())
setup: showCar runs after registerCar
setup: proveHeldYear runs after registerCar
[registerCar]
  witness:plate_number: FAIL recoverable [A2] at value op 5 — recovered the hidden value 37 after 38 candidates (criteria 4, 5)
  witness:plate_number: FAIL recoverable [A2] at value op 9 — recovered the hidden value 37 after 38 candidates (criteria 4, 5)
[proveHeldYear]
  witness:purchase_month: FAIL recoverable [A2] at value op 11 — recovered the hidden value 37 after 38 candidates (criteria 4, 5)
3 failure(s); 21 input(s) tested, 0 untestable
```

> **스킬**: 실패 두 가지를 기준에 맞춰 설명하면 이렇습니다.
>
> **① 차번호 (기준 4).** 공개된 중복 방지 태그에서 차번호를 되찾았습니다. 태그에 운영자 비밀을 섞으세요.
>
> **② 구매월 (기준 6).** 누출 설명은 "12개월 이상"이라는 사실만 허락합니다. 그런데 블록 시각 비교가 구매월 자체를 공개했습니다. 공개 동호회 달과 비교하는 방식으로 바꾸세요.
>
> 구매월 실패에 붙은 기준 번호 "4, 5"는 엔진이 A2 복원에 기계적으로 붙이는 번호입니다. 실제로 어긴 것은 기준 6입니다. `criteria.md`의 "엔진 결과 → 기준" 표를 보강할 거리입니다.

설계대로 만든 판 [fixed/club.compact](../../bench/scenarios/car-club/fixed/club.compact)의 결과입니다.

```
setup: witness owner_key = owner_key_of(owner_secret())
setup: showCar runs after registerCar
setup: proveHeldYear runs after registerCar, setMonth
0 failure(s); 21 input(s) tested, 0 untestable
```

**엔진 메모** (이 예제로 엔진에 넣은 것):

- **witness 사이의 관계 맞추기.** 등록 때 넣는 `owner_key`와 증명 때 다시 계산하는 `owner_key_of(owner_secret())`가 같아야 회원 회로가 돌아갑니다.
  - 엔진은 실패한 회로가 읽는 witness를 출처 후보로 먼저 두고, `pure` 회로나 `persistentHash`로 이어지는 관계를 하나씩 시도합니다(최대 3개).
  - 찾은 관계는 `setup: witness ...` 줄로 보여 줍니다(`src/setup.ts`).
  - 공격 중 `owner_secret`을 바꾸면 `owner_key`도 따라 바뀝니다. 그래서 회원 비밀도 시험 대상이 됩니다.
- **사전 호출 두 개.** `proveHeldYear`는 차 등록과 달 설정이 둘 다 먼저 있어야 돌아갑니다.
  - 그래서 사전 호출을 두 개까지 찾고, 숫자 인자를 최댓값으로도 시도합니다.
  - 고친 판은 달을 최댓값으로 둔 상태, 즉 "1년 이상"이 참인 쪽만 시험합니다.
- **아직 못 하는 것.** 두 witness를 섞는 관계(예: `hash(a, b)`)는 찾지 않습니다. 이런 관계가 필요한 계약은 "시험 못 함"으로 나옵니다.

## 수정 기록 (2026-11-24)

처음 판에서는 세 회로가 witness를 두 번 읽었습니다.
- `showCar`의 `car_model()`: 등록과 다른 모델을 공개할 수 있었습니다.
- `proveHeldYear`의 `purchase_month()`: 1년 배지를 위조할 수 있었습니다.
- `registerCar`의 `operator_secret()`, `plate_number()`: 중복 방지 태그를 우회할 수 있었습니다.

- **원인**: 회로 안에서 같은 witness를 두 번 부르면 서로 다른 두 비공개 입력이 됩니다(실험 p29). 그래서 커밋 확인에 쓴 값과 공개한 사실에 쓴 값이 달라도 됐습니다.
- **고친 방법**: 이제 각 witness를 한 회로에서 한 번만 읽습니다. 두 곳에 쓰는 값은 한 번 읽어 지역 변수로 넘깁니다.
- **확인**:
  - 숨김 시험(엔진 결과)은 바뀌지 않았습니다.
  - `packages/proof-kit/scripts/count-witness-reads.mts`로 모든 회로가 witness를 한 번씩만 읽는 것을 확인했습니다.
- **출처**: 실제 구축 기록에서 찾은 교훈입니다(`lessons-first-build.md` 6번).

## 갈림길 비교 (새 흐름, 실제 실행 결과)

"1년 이상 보유"를 어떻게 확인할지는 무엇이 새는지를 바꾸는 갈림길입니다. 그래서 스킬은 두 안을 실제로 컴파일하고 공격해 나란히 보여 줍니다. 판정은 엔진 실행 결과에서만 나옵니다.

- A안: 구매 시각을 블록 시각과 비교(`blockTimeGte`) → [`forks/held-year-a-blocktime.compact`](forks/held-year-a-blocktime.compact)
- B안: 운영자가 올리는 공개 동호회 달과 비교 → [`forks/held-year-b-calendar.compact`](forks/held-year-b-calendar.compact)

```
proofkit compare forks/held-year-a-blocktime.compact forks/held-year-b-calendar.compact \
  --spec ../../bench/scenarios/car-club/privacy-spec.json --title "A: 블록 시각과 비교" --title "B: 공개 동호회 달과 비교"
```

| 회로 | 입력 | A: 블록 시각과 비교 | B: 공개 동호회 달과 비교 |
| --- | --- | --- | --- |
| proveHeldYear | witness:purchase_month | 위험 (A2 recoverable) | 증명만 (A1 masked) |

두 안의 차이는 이 한 줄뿐입니다.
- A안: 컴파일러가 `disclose()`를 요구하는 자리를 그대로 감싸면 구매월이 체인에서 복원됩니다.
- B안: 구매월이 커밋에 가려집니다.
- 스킬의 추천: B안. 이유는 "1년 이상"이라는 사실만 드러나기 때문입니다. 공개 달력을 운영자가 갱신한다는 조건은 받아들여야 합니다.

두 안의 그림까지 포함한 전체 출력은 [`forks/held-year.md`](forks/held-year.md)에 있습니다.
