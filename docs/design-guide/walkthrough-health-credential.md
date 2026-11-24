# 따라 하기: 건강 정보 자격 증명

`/proof:spec`이 사용자와 주고받는 1~5단계를 예제 하나로 끝까지 보여 줍니다. 기준 번호는 `plugins/proof-kit/skills/proof-spec/references/criteria.md`의 12개 기준을 가리킵니다. 만든 계약은 `bench/scenarios/health-credential/`에 있고, 5단계의 결과는 엔진을 실제로 돌린 출력입니다.

## 1단계. 앱이 하는 일

> **사용자**: 환자가 18세 이상이라는 것만 증명하는 건강 자격 증명 앱을 만들고 싶어. 병원이 발급하고, 약국 같은 곳에서 확인해.
>
> **스킬**: 이렇게 이해했습니다. 회로는 둘입니다.
> - `issue(id)`: 병원(발급자)이 자격 증명을 등록합니다. 장부에 자격 증명 하나가 추가됩니다.
> - `verifyAdult(id)`: 환자가 18세 이상임을 증명합니다. 장부에 "이 자격 증명은 확인됨"이 남습니다.
>
> 맞나요?

## 2단계. 네 가지 질문

> **스킬**: ① 숨겨야 할 값은 무엇인가요? 예를 들면 나이, 질병 코드입니다.
> **사용자**: 나이랑 질병 코드.
>
> **스킬**: ② 드러나도 되는 것은요? 값 자체일 수도 있고 사실일 수도 있습니다. 예: 자격 증명 id, "18세 이상"이라는 사실.
> **사용자**: id는 공개돼도 되고, 확인할 때 18세 이상이라는 것만.
>
> **스킬**: ③ 이어지면 안 되는 행동이 있나요? 예: 같은 환자의 두 번의 확인.
> **사용자**: 이번에는 없어.
>
> **스킬**: ④ 나이와 질병 코드는 누가 보증하나요?
> **사용자**: 병원.

## 3단계. 설계안

**1. 어디에 두나**

| 데이터 | 공개 장부 | 사용자 기기 | 이유 |
| --- | --- | --- | --- |
| 나이, 질병 코드 | 커밋만 | 값 + nonce | 숨김 (기준 1, 4) |
| 자격 증명 id | 그대로 | — | 드러나도 됨: 공개 조회 키 |
| 발급자 | 발급자 비밀의 해시 | 발급자 비밀 (병원 기기) | 보증 (기준 10, 11) |

**2. 회로마다 드러나는 것 (누출 설명)**

| 회로 | 누가 부르나 | 누구나 볼 수 있는 것 |
| --- | --- | --- |
| `issue(id)` | 병원 | 이 id로 자격 증명이 발급됐다는 것, 그리고 내용의 커밋 |
| `verifyAdult(id)` | 환자 | 이 id의 자격 증명 주인이 18세 이상이라는 것 |

피할 수 없는 것: 발급·확인이 있었다는 사실과 그 시점.

**3. 값마다 쓸 부품**
- **나이, 질병 코드** → `persistentCommit([나이, 질병 코드], nonce)`. nonce는 자격 증명마다 새로 만들어 환자가 보관합니다(기준 4, 5).
  - 함정: `persistentHash`로 숨겨도 컴파일됩니다. 하지만 나이 0~120을 차례로 해시해 보면 풀립니다. 실제 해커톤 프로젝트에서 나온 실수입니다.
- **확인** → `disclose(나이 >= 18)`만 공개합니다(기준 6).
  - 함정: 나이를 통째로 공개해도 컴파일됩니다.
- **발급** → 발급자 비밀을 아는지로 확인합니다(기준 10, 11).
  - 함정: `ownPublicKey()`로 확인하면 누구나 발급자 행세를 할 수 있습니다.

**4. 되는 것 / 안 되는 것**

| 컴파일러가 막아 줌 | 컴파일되지만 샘 |
| --- | --- |
| 나이를 `disclose()` 없이 장부에 쓰기 | `disclose(persistentHash(나이))` |
| 나이 비교 결과를 `disclose()` 없이 쓰기 | 상수 nonce 커밋 |

**5. 확인 방법**

| 기준 | 확인 |
| --- | --- |
| 1, 4, 5 | `/proof:attack`: `issue`, `verifyAdult`에서 A1, A2 |
| 6 | `/proof:attack`: `verifyAdult`에서 A1을 누출 설명과 대조 |
| 10, 11 | 공격 시험으로 확인하지 않음 (안내) |

> **스킬**: 2번(누출 설명)에 동의하시면 `privacy-spec.json`으로 저장하겠습니다.

## 4단계. 동의와 저장

사용자가 동의하면 [privacy-spec.json](../../bench/scenarios/health-credential/privacy-spec.json)을 저장합니다. 이 파일에 숨길 값, 드러나도 되는 값과 사실, 받아들이는 누출, 보증 주체가 들어갑니다.

## 5단계. 공격 시험과 수정

설계대로 만든 계약이 [fixed/credential.compact](../../bench/scenarios/health-credential/fixed/credential.compact)입니다. 비교를 위해 같은 설계에서 해시로 숨기는 실수를 넣은 [holed/credential.compact](../../bench/scenarios/health-credential/holed/credential.compact)도 만들었습니다.

엔진은 설정 없이 시작 상태를 찾았습니다. 생성자에 `issuer_commitment(issuer_secret())`을 넣고, `verifyAdult`는 `issue` 다음에 돌렸습니다.

**해시로 숨긴 판 (실수)**: 엔진 출력 중 실패

```
[issue]
  witness:patient_age (Uint<0..256>): FAIL recoverable [A2] at value op 5 — recovered the hidden value 37 after 38 candidates (criteria 4, 5)
  witness:patient_condition (Uint<0..65536>): FAIL recoverable [A2] at value op 5 — recovered the hidden value 37 after 38 candidates (criteria 4, 5)
[verifyAdult]
  witness:patient_age (Uint<0..256>): FAIL recoverable [A2] at value op 8 — recovered the hidden value 37 after 38 candidates (criteria 4, 5)
  witness:patient_condition (Uint<0..65536>): FAIL recoverable [A2] at value op 8 — recovered the hidden value 37 after 38 candidates (criteria 4, 5)
```

> **스킬**: 기준 4(숨긴 값은 해시가 아니라 nonce 커밋으로)를 어겼습니다. 공개된 해시에서 나이 37과 질병 코드 37을 되찾았습니다. `persistentHash`를 nonce 넣은 `persistentCommit`으로 바꾸세요(설계안 3번).

**설계대로 만든 판**: 나이와 질병 코드는 모두 가려짐입니다.

```
[issue]
  witness:patient_age (Uint<0..256>): masked [A1] at value op 5 — changes with this input but is masked by witness:claim_nonce
  witness:patient_condition (Uint<0..65536>): masked [A1] at value op 5 — changes with this input but is masked by witness:claim_nonce
[verifyAdult]
  witness:patient_age (Uint<0..256>): masked [A1] at value op 8 — changes with this input but is masked by witness:claim_nonce
  witness:patient_condition (Uint<0..65536>): masked [A1] at value op 8 — changes with this input but is masked by witness:claim_nonce
```

**자격 증명 id.** id는 누출 설명에서 "드러나도 됨"으로 적은 값이라, 엔진이 실패가 아니라 공개로 표시합니다. 설계대로 만든 판의 결과(누출 설명 사용):

```
[issue]
  arg:id (Bytes<32>): public (allowed by spec) exposed [A1] at value op 4 — the input appears verbatim
  witness:patient_age (Uint<0..256>): masked [A1] at value op 5 — changes with this input but is masked by witness:claim_nonce
[verifyAdult]
  arg:id (Bytes<32>): public (allowed by spec) exposed [A1] at value op 2 — the input appears verbatim
  witness:patient_age (Uint<0..256>): masked [A1] at value op 8 — changes with this input but is masked by witness:claim_nonce
0 failure(s); 9 input(s) tested, 0 untestable
```

해시로 숨긴 판은 누출 설명이 없어도 실패가 납니다. 값이 해시를 거쳐 나온 것이라, 컴파일러가 숨겨진다고 믿고 통과시킨 경우이기 때문입니다.

**그다음**: `/proof:map`으로 두 판의 결과를 그림으로 나란히 그립니다. 결과: [map-health-credential.md](map-health-credential.md). 구멍 판은 나이·질병 코드가 위험 색, 고친 판은 증명만 색입니다.

## 수정 기록 (2026-11-24)

`verifyAdult`가 `patient_age()`를 두 번 불렀습니다. 한 번은 커밋 확인에, 한 번은 `>= 18` 비교에 썼습니다. 그래서 커밋 확인에는 10을, 비교에는 30을 주면 10살이 "18세 이상" 확인을 통과했습니다. 실행으로 확인한 결과입니다.

- **원인**: 회로 안에서 같은 witness를 두 번 부르면 서로 다른 두 비공개 입력이 됩니다(실험 p29). 그래서 커밋 확인에 쓴 값과 공개한 사실에 쓴 값이 달라도 됐습니다.
- **고친 방법**: 이제 각 witness를 회로 맨 앞에서 한 번 읽고, 보조 회로에는 값으로 넘깁니다.
- **확인**:
  - 숨김 시험(엔진 결과)은 바뀌지 않았습니다.
  - `packages/proof-kit/scripts/count-witness-reads.mts`로 모든 회로가 witness를 한 번씩만 읽는 것을 확인했습니다.
- **출처**: 실제 구축 기록에서 찾은 교훈입니다(`lessons-first-build.md` 6번).

