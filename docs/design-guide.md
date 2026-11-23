# Compact 개인정보 설계 가이드

> 이 가이드가 왜 필요한지, 프로젝트 전체 기획과 진행 상황은 [plan.md](plan.md)에 있습니다.

Compact 계약을 쓰기 전에 "무엇을 숨기고, 무엇을 드러내고, 누구를 믿는지"를 정하고, 그 결정이 코드에서 지켜지는지 공격 시험으로 확인하기 위한 가이드입니다. `/proof:spec`이 이 가이드를 따라 질문하고, `/proof:attack`이 결과를 확인하고, `/proof:map`이 확인된 결과를 그립니다.

## 0. 이 가이드의 뼈대

뼈대는 Midnight의 이론적 기반인 Kachina 논문에서 가져왔습니다.

- Kachina는 계약을 두 가지로 정의합니다. 계약이 하는 일(전이 함수 ∆)과 **무엇이 드러나는가(누출 함수 Λ)**입니다.
- 상태는 모두가 보는 **공개 상태 σ**(장부)와 사람마다 자기 기기에만 있는 **비공개 상태 ρ**로 나뉩니다.
- 거래가 드러내는 것은 공개 상태의 변화 자체입니다. 원문: "The transition σ ↦ σ′ is precisely the information which is revealed!"
- 사용자는 거래 전에 **누출 설명(leakage descriptor)**을 보고 승인합니다. 이 설명은 "정확하고 읽을 수 있어야" 하며, 원문은 이렇게 경고합니다. "nothing prevents a malicious contract from finding clever ways to leak information without being observable … the importance of the leakage descriptor being accurate."
- 비공개 상태는 악의적인 사용자가 마음대로 정할 수 있다고 봅니다. 계약은 이를 전제해야 합니다.

숨기는 부품은 Zexe의 구조를 따릅니다. 값은 커밋으로 숨기고, 한 번만 쓰게 하는 데는 일련번호(nullifier)를 쓰고, 누가 만들고 쓸 수 있는지는 규칙으로 정합니다. 신뢰를 나눠 적는 방식은 Hawk에서 가져왔습니다. Hawk는 블록체인은 진위를, 관리자는 비밀 유지만 믿는 식으로 신뢰를 나눕니다.

그래서 가이드는 다섯 장입니다. 1~4장은 누출 설명을 쓰는 단계이고, 5장은 그 설명이 정확한지 실행으로 확인하는 단계입니다.

| 장 | 정하는 것 | 근거 |
| --- | --- | --- |
| 1 | 이 계약은 무엇을 하나 | Kachina ∆, 공개·비공개 상태 |
| 2 | 무엇이 드러나도 되나 | Kachina Λ, 누출 설명 |
| 3 | 누구를 믿나 | Kachina "비공개 상태는 조작될 수 있다", Hawk 신뢰 구분 |
| 4 | 어떤 부품으로 만드나 | Zexe 커밋·nullifier·규칙 |
| 5 | 맞게 됐는지 확인 | Kachina "누출 설명은 정확해야 한다" |

## 1장. 이 계약은 무엇을 하나

행동(회로)마다 한 줄로 적습니다.

| 행동 | 바꾸는 공개 상태 | 쓰는 비공개 값 | 누가 부르나 |
| --- | --- | --- | --- |
| 예: `register(id)` | `claims[id]` | 나이, 질병 코드 | 환자 |

- 공개 상태는 `export ledger`에 있는 것입니다. 모두가 봅니다.
- 비공개 값은 witness와 회로 인자입니다. 컴파일러는 회로 인자도 witness처럼 다룹니다.
- 회로의 반환값은 체인에 남지 않습니다. 공식 문서(Security and best practices): "the transaction carries only a randomized commitment to the call's inputs and outputs". 반환값은 호출한 DApp이나 계약에만 갑니다.

## 2장. 무엇이 드러나도 되나 (누출 설명)

행동마다 드러나는 것을 다섯 종류로 나눠 적습니다. 이 표가 Kachina의 누출 설명이고, 그대로 공격 시험의 기준이 됩니다.

| 종류 | 예 | 적는 법 |
| --- | --- | --- |
| 값 | 공개 조회 키 `id` | 드러나도 되는 값과 이유 |
| 사실 | "18세 이상" | 드러나도 되는 사실(조건식)과 이유 |
| 행동 | `vote`를 불렀다는 것 | 어떤 행동이 있었는지가 드러나도 되는지 |
| 연결 | 같은 사람의 두 투표 | 이어지면 안 되는 행동 쌍 |
| 피할 수 없는 것 | 거래가 있었다는 사실, 시점, 집단 크기 | 받아들이는 것과 줄이는 방법 |

여기 적지 않은 값은 모두 숨겨야 하는 값입니다.

기획의 질문 네 개 중 셋이 이 장에 해당합니다. 숨길 값, 드러나도 되는 사실, 연결되면 안 되는 행동입니다.

## 3장. 누구를 믿나

사용자가 넣는 값(witness, 인자)은 사용자가 마음대로 정할 수 있습니다. 그래서 값마다 누가 보증하는지 정합니다. 기획의 네 번째 질문(보증 주체)이 이 장입니다.

| 보증 방식 | 쓰는 곳 | 예제 |
| --- | --- | --- |
| 비밀을 아는 사람만 (소유 증명) | 관리자 기능 | [owner-fixed](design-guide/examples/owner-fixed.compact) |
| 정해진 발급자만 | 자격 증명 발급 | [issuer-fixed](design-guide/examples/issuer-fixed.compact) |
| 계약이 이미 가진 상태 | 이전에 커밋한 값 다시 쓰기 | 4장 커밋 |
| 아무도 보증하지 않음 | 사용자 자신에 대한 것뿐일 때만 | — |

함정:

- **`ownPublicKey()`로 권한을 확인함.** 호출자가 넣는 값이라 누구인지 증명하지 못합니다. 장부에 쓰면 같은 소유자의 모든 행동이 이어집니다. `disclose()` 없이 컴파일됩니다(컴파일러 실험 p21). 예: [owner-holed](design-guide/examples/owner-holed.compact). 실제 계약에는 OpenZeppelin `ZOwnablePK`를 쓰는 것이 좋습니다.
- **발급자 없는 자격 증명.** 누구나 자기 값을 등록할 수 있으면, 그 값에 대한 증명은 아무것도 증명하지 않습니다. 예: [issuer-holed](design-guide/examples/issuer-holed.compact).
- 서명으로 발급자를 확인하는 방식은 컴파일러 0.36.0 표준 라이브러리에서 사용법을 확인하지 못했습니다. 그래서 여기서는 비밀 키 확인 방식만 다룹니다.

## 4장. 어떤 부품으로 만드나

부품마다 **함정을 먼저** 적고, 고친 형태를 그다음에 적습니다. 구멍 판 / 고친 판 예제는 `bench/scenarios/`에 있고, 공격 시험으로 확인한 결과를 함께 적었습니다.

### 4.1 값 숨기기: 커밋

- 함정 1. **해시는 커밋이 아닙니다.** `persistentHash`로 감싼 값은 범위가 작으면 후보를 해시해 맞춰 보는 것으로 풀립니다. `disclose(persistentHash(...))`는 컴파일됩니다(p04b). 해커톤 프로젝트에서 실제로 나온 실수입니다(나이·질병 코드 해시, GPS 좌표 해시). 예: [health-claim-hash](../bench/scenarios/health-claim-hash).
- 함정 2. **상수 소금 커밋.** 컴파일러는 커밋의 무작위 값이 "충분히 무작위"라고 가정하고 통과시킵니다. 상수나 0, 비밀 자체에서 뽑은 소금도 컴파일됩니다(p05b, p05c, p19). 결과는 해시만큼 풀립니다. 예: [constant-salt](../bench/scenarios/constant-salt).
- 함정 3. **소금 재사용.** 같은 소금을 두 커밋에 쓰면 두 값이 이어집니다.
- 고친 형태: 값마다 새 무작위 nonce를 witness로 받아 `persistentCommit(값, nonce)`를 씁니다. nonce는 사용자가 보관합니다. `transientCommit`은 장부에 저장하지 않습니다(p07).

### 4.2 사실만 드러내기

- 함정. **값 전체를 공개함.** 설계는 "18세 이상"만 필요한데 나이를 통째로 `disclose()`합니다. struct 전체를 일찍 공개하는 것도 컴파일됩니다(p26). 예: [predicate-disclosure](../bench/scenarios/predicate-disclosure).
- 고친 형태: 필요한 조건식만 `disclose(나이 >= 18)`합니다. 이 사실은 2장 누출 설명에 적습니다.

### 4.3 고른 칸으로 드러남 (경로)

- 함정. **숨긴 값에 따라 다른 장부 칸을 건드림.** 예: 찬성이면 `yes_count`, 반대면 `no_count`를 올립니다. 컴파일러는 분기 조건에 `disclose()`를 요구하지만(p02), 개발자가 붙이면 통과하고 어느 칸이 움직였는지가 그대로 드러납니다. 예: [vote-branch](../bench/scenarios/vote-branch).
- 고친 형태: 선택을 커밋으로 저장하고, 집계는 따로 합니다.

### 4.4 한 번만, 그러나 이어지지 않게: nullifier

- 함정. **비밀만 해시한 nullifier.** 투표마다 같은 값이 나와서 같은 사람의 모든 행동이 이어집니다.
- 고친 형태: 범위(투표 id, 회차)와 도메인 태그를 섞어 `hash(태그, 범위, 비밀)`로 만듭니다. 예: [nullifier-fixed](design-guide/examples/nullifier-fixed.compact). 이 함정을 잡는 연결 공격(A3)은 아직 구현 전입니다.

### 4.5 집단 안에 있다는 것만: 멤버십

- Merkle 트리 멤버십으로 "등록된 사람 중 하나"만 증명합니다.
- 함정: 집단이 작으면 숨는 의미가 없습니다. 공식 문서(Security and best practices): "a tree with three leaves gives almost no privacy".
- 함정: `checkRoot` 결과를 분기에 쓰면 결과 비트가 기록에 남습니다. 출처는 midnight-expert `plugins/compact-core/skills/compact-privacy-disclosure/SKILL.md`의 "checkRoot Publishes Its Result" 절이고, 직접 확인하지는 않았습니다.
- 이 부품의 예제와 공격은 아직 없습니다.

## 5장. 맞게 됐는지 확인

> **엔진 상태**: 아래 판정 규칙은 정해졌지만 엔진(0.0.1)에는 아직 들어가지 않았습니다. 지금 엔진은 `privacy-spec.json`을 읽지 않고, 직접 `disclose()`한 값도 실패로 냅니다. 그래서 공개 id나 "18세 이상" 같은 의도한 공개가 실패로 나옵니다. 지금 동작과 정한 규칙의 차이는 `plugins/proof-kit/skills/proof-attack/references/verdicts.md`에 있습니다. 엔진 반영은 [plan.md](plan.md)의 다음 작업 1번입니다.

Kachina가 말한 대로 누출 설명은 정확해야 합니다. 그래서 확인 규칙은 하나입니다. **누출 설명(2장)에 적지 않은 것이 실제로 드러나면 실패입니다.** 실제로 무엇이 드러나는지는 계약을 실행해서 확인합니다. 숨긴 값 하나만 바꿔 가며 여러 번 돌리고, 공개 기록이 어떻게 달라지는지 봅니다.

### 판정 규칙

| 상황 | 2장 설명이 있을 때 | 설명 없이 (기본값) |
| --- | --- | --- |
| 값이 그대로 드러남 | 설명에 없으면 **실패** | 코드가 직접 `disclose()`한 것이므로 **공개** |
| 사실(조건식)이 드러남 | 설명에 없으면 **실패** | **공개** |
| 고른 칸으로 드러남 | 설명에 없으면 **실패** | **공개** |
| 해시·커밋인데 값이 풀림 | **실패** | **실패** (컴파일러가 숨겨진다고 믿고 통과시킨 것) |
| 소금이나 키에 가려짐 | 통과 | 통과 |
| 이어지면 안 되는 행동이 이어짐 | **실패** (A3, 구현 전) | — |
| 반환값 | 호출자에게만 감. 실패 아님 | 같음 |
| 실행하지 못함 | 회색 "시험 못 함" | 같음 |

설명 없이도 실패로 잡는 것은, 컴파일러가 개발자를 믿고 통과시키는 곳뿐입니다. 나머지는 개발자가 `disclose()`로 직접 선언한 것이라 공개로 칠합니다. 2장 설명을 쓰면 그 선언이 설계와 맞는지까지 확인합니다.

이 규칙은 측정에서 나왔습니다. 최근 공개 레포 13개에서 엔진이 낸 실패 88건 중 87건이 의도한 공개였습니다. 진짜 구멍은 소금 없는 좌표 해시 1건이었습니다([plan.md](plan.md) "측정 요약").

직접 `disclose()`인지, 해시·커밋을 거친 것인지는 소스를 읽지 않고 실행으로 구분합니다. 실행하는 동안 런타임의 해시·커밋 함수 출력을 기록해 두고, 달라진 공개 값이 그중 하나인지 봅니다.

판정의 근거는 실행 결과뿐입니다. 이름이나 코드를 읽고 "의심"을 내지 않습니다. 통과는 "이 공격 목록에서 재현되지 않음"이지 "안전함"이 아닙니다.

### 색 (시각화)

| 색 | 뜻 |
| --- | --- |
| 숨김 | 바꿔도 공개 기록이 그대로 |
| 증명만 | 공개 기록에는 풀리지 않는 커밋·해시로만 남음 (엔진 판정 `MASKED`, `TAG`) |
| 공개 | 누출 설명에 있거나 코드가 직접 선언한 공개 |
| 위험 | 실패 |
| 회색 | 시험 못 함 |

### 누출 설명 파일 (`privacy-spec.json`)

`/proof:spec`이 1~3장 답을 이 파일로 씁니다. 공격 엔진은 이 파일을 읽어 무엇을 숨긴 값으로 볼지와 값 범위를 정합니다(엔진 반영 예정). 파일이 없으면 이름과 타입으로 짐작합니다. 형식의 자세한 설명은 `plugins/proof-kit/skills/proof-spec/references/privacy-spec.md`에 있습니다.

```json
{
  "contract": "src/claims.compact",
  "hidden": [
    { "input": "witness:holder_age", "range": "0..120", "why": "personal data" }
  ],
  "mayReveal": [
    { "circuit": "check", "input": "arg:id", "kind": "value", "why": "public lookup key" },
    { "circuit": "check", "input": "witness:holder_age", "kind": "fact", "fact": "holder_age >= 18", "why": "venue needs adults only" }
  ],
  "acceptedLeakage": [
    "that check was called, and when"
  ],
  "unlinkable": [
    { "actions": ["vote", "vote"], "why": "same member in two polls" }
  ],
  "vouchedBy": [
    { "input": "witness:holder_age", "by": "issuer", "how": "issuer-only issueCredential" }
  ]
}
```

## 컴파일러가 막는 것과 통과시키는 것

Compact 컴파일러 0.36.0(`--skip-zk`)으로 `disclose()` 없이 컴파일해 본 결과입니다. 실험 계약은 `docs/design-guide/compiler-probe/`에 있습니다.

**막는 것.** witness, 회로 인자, 생성자 인자, 그리고 그 비교 결과나 해시가 다음으로 갈 때 막힙니다. 오류는 "potential witness-value disclosure must be declared".
- 장부 연산 인자(쓰기와 읽기, Map·Set·Counter·MerkleTree): p01, p04, p06, p08, p10~p16, p24
- 장부 연산이 있는 분기 조건: p02
- 공개 회로 반환값: p03, p22
- 다른 계약 호출 인자: p18

그 밖에 확인한 것:
- assert 메시지는 문자열 리터럴만 허용됩니다. 숨긴 값을 넣으면 공개 오류가 아니라 문법 오류가 납니다(p17, p17b, p17c). 그래서 메시지로 값이 새는 일은 0.36.0에서는 문법상 막혀 있습니다.
- `disclose()`를 붙이면 통과합니다: 다른 계약 호출 인자(p18b).
- assert 조건에 숨긴 값을 쓰는 것(p09), 커밋을 반환하는 것(p23), 커밋한 뒤 분기하는 것(p25)은 `disclose()` 없이 통과합니다.

**통과시키는 것** (이 가이드의 함정):

| 실험 | 내용 |
| --- | --- |
| p04b | `disclose(persistentHash(작은 값))` |
| p05b, p05c, p19 | 상수, 비밀 자체, 비밀에서 유도한 소금 커밋 |
| p07, p27 | `transientCommit` 장부 저장, 상수 rand |
| p21 | `ownPublicKey()`를 장부에 씀 |
| p26 | struct 전체를 일찍 `disclose()` |
| p02b, p20 | 장부 연산이 없는 분기 (실제로 드러나는 것 없음) |

## 참고 자료

- Kerber, Kiayias, Kohlweiss. "Kachina – Foundations of Private Smart Contracts." CSF 2021. https://drwx.org/papers/kachina.pdf
- Bowe, Chiesa, Green, Miers, Mishra, Wu. "Zexe: Enabling Decentralized Private Computation." IEEE S&P 2020. https://eprint.iacr.org/2018/962
- Kosba, Miller, Shi, Wen, Papamanthou. "Hawk: The Blockchain Model of Cryptography and Privacy-Preserving Smart Contracts." IEEE S&P 2016. https://eprint.iacr.org/2015/675
- Midnight 공식 문서
  - Security and best practices: https://docs.midnight.network/guides/security-best-practices
  - Explicit disclosure ("Witness Protection Program"): https://docs.midnight.network/compact/reference/explicit-disclosure
  - Smart contract security: https://docs.midnight.network/compact/smart-contract-security
- midnight-expert (commit 1507772): compact-core `compact-security/references/threat-catalog.md`, `compact-review/references/privacy-review.md`, `compact-privacy-disclosure`
- OpenZeppelin compact-contracts: `ZOwnablePK`
