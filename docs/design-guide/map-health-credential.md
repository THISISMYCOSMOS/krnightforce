# 건강 정보 자격 증명: 프라이버시 지도

숨긴 값 → 회로 → 체인에 남는 것. 색은 `proofkit attack` 보고서에서만 가져옵니다.

## 구멍 판

실패 4건 · 시험한 입력 7개 · 시험 못 함 0개 · 누출 설명 사용

```mermaid
flowchart LR
  subgraph m0_in["숨긴 값"]
    m0_i0_arg_id["arg:id"]:::public
    m0_i1_witness_issuer_secret["witness:issuer_secret"]:::proof
    m0_i2_witness_patient_age["witness:patient_age"]:::risk
    m0_i3_witness_patient_condition["witness:patient_condition"]:::risk
  end
  subgraph m0_c["회로"]
    m0_c4_issue["issue"]
    m0_c5_verifyAdult["verifyAdult"]
  end
  subgraph m0_o["체인에 남는 것"]
    m0_o6_issue_arg_id["id: 공개<br/>누출 설명이 허용: A1 exposed"]:::public
    m0_o7_issue_witness_issuer_secret["issuer_secret: 증명만<br/>A1 tag"]:::proof
    m0_o8_issue_witness_patient_age["patient_age: 위험<br/>A2 recoverable"]:::risk
    m0_o9_issue_witness_patient_condition["patient_condition: 위험<br/>A2 recoverable"]:::risk
    m0_o10_verifyAdult_arg_id["id: 공개<br/>누출 설명이 허용: A1 exposed, A5 exposed"]:::public
    m0_o11_verifyAdult_witness_patient_age["patient_age: 위험<br/>A2 recoverable"]:::risk
    m0_o12_verifyAdult_witness_patient_condition["patient_condition: 위험<br/>A2 recoverable"]:::risk
  end
  m0_i0_arg_id --> m0_c4_issue --> m0_o6_issue_arg_id
  m0_i1_witness_issuer_secret --> m0_c4_issue --> m0_o7_issue_witness_issuer_secret
  m0_i2_witness_patient_age --> m0_c4_issue --> m0_o8_issue_witness_patient_age
  m0_i3_witness_patient_condition --> m0_c4_issue --> m0_o9_issue_witness_patient_condition
  m0_i0_arg_id --> m0_c5_verifyAdult --> m0_o10_verifyAdult_arg_id
  m0_i2_witness_patient_age --> m0_c5_verifyAdult --> m0_o11_verifyAdult_witness_patient_age
  m0_i3_witness_patient_condition --> m0_c5_verifyAdult --> m0_o12_verifyAdult_witness_patient_condition
  classDef hidden fill:#d9f2e0,stroke:#2e7d4f,color:#123
  classDef proof fill:#dce8fa,stroke:#2f5fa7,color:#123
  classDef public fill:#fff1c2,stroke:#a07800,color:#321
  classDef risk fill:#fbd5d5,stroke:#b42318,color:#300,stroke-width:2px
  classDef untested fill:#e6e6e6,stroke:#777,color:#333,stroke-dasharray:4 3
```

## 고친 판

실패 0건 · 시험한 입력 9개 · 시험 못 함 0개 · 누출 설명 사용

```mermaid
flowchart LR
  subgraph m1_in["숨긴 값"]
    m1_i0_arg_id["arg:id"]:::public
    m1_i1_witness_issuer_secret["witness:issuer_secret"]:::proof
    m1_i2_witness_patient_age["witness:patient_age"]:::proof
    m1_i3_witness_patient_condition["witness:patient_condition"]:::proof
    m1_i4_witness_claim_nonce["witness:claim_nonce"]:::proof
  end
  subgraph m1_c["회로"]
    m1_c5_issue["issue"]
    m1_c6_verifyAdult["verifyAdult"]
  end
  subgraph m1_o["체인에 남는 것"]
    m1_o7_issue_arg_id["id: 공개<br/>누출 설명이 허용: A1 exposed"]:::public
    m1_o8_issue_witness_issuer_secret["issuer_secret: 증명만<br/>A1 tag"]:::proof
    m1_o9_issue_witness_patient_age["patient_age: 증명만<br/>A1 masked"]:::proof
    m1_o10_issue_witness_patient_condition["patient_condition: 증명만<br/>A1 masked"]:::proof
    m1_o11_issue_witness_claim_nonce["claim_nonce: 증명만<br/>A1 tag"]:::proof
    m1_o12_verifyAdult_arg_id["id: 공개<br/>누출 설명이 허용: A1 exposed, A5 exposed"]:::public
    m1_o13_verifyAdult_witness_patient_age["patient_age: 증명만<br/>A1 masked"]:::proof
    m1_o14_verifyAdult_witness_patient_condition["patient_condition: 증명만<br/>A1 masked"]:::proof
    m1_o15_verifyAdult_witness_claim_nonce["claim_nonce: 증명만<br/>A1 tag"]:::proof
  end
  m1_i0_arg_id --> m1_c5_issue --> m1_o7_issue_arg_id
  m1_i1_witness_issuer_secret --> m1_c5_issue --> m1_o8_issue_witness_issuer_secret
  m1_i2_witness_patient_age --> m1_c5_issue --> m1_o9_issue_witness_patient_age
  m1_i3_witness_patient_condition --> m1_c5_issue --> m1_o10_issue_witness_patient_condition
  m1_i4_witness_claim_nonce --> m1_c5_issue --> m1_o11_issue_witness_claim_nonce
  m1_i0_arg_id --> m1_c6_verifyAdult --> m1_o12_verifyAdult_arg_id
  m1_i2_witness_patient_age --> m1_c6_verifyAdult --> m1_o13_verifyAdult_witness_patient_age
  m1_i3_witness_patient_condition --> m1_c6_verifyAdult --> m1_o14_verifyAdult_witness_patient_condition
  m1_i4_witness_claim_nonce --> m1_c6_verifyAdult --> m1_o15_verifyAdult_witness_claim_nonce
  classDef hidden fill:#d9f2e0,stroke:#2e7d4f,color:#123
  classDef proof fill:#dce8fa,stroke:#2f5fa7,color:#123
  classDef public fill:#fff1c2,stroke:#a07800,color:#321
  classDef risk fill:#fbd5d5,stroke:#b42318,color:#300,stroke-width:2px
  classDef untested fill:#e6e6e6,stroke:#777,color:#333,stroke-dasharray:4 3
```

## 범례

| 색 | 뜻 (엔진 보고서의 어느 칸에서 오는가) |
| --- | --- |
| 숨김 | 값을 바꿔도 체인에 남는 것이 달라지지 않음 |
| 증명만 | 체인에 남지만 nonce·비밀로 가려짐 (`MASKED`, `TAG`) |
| 공개 | 드러나지만 누출 설명이 허용했거나 코드가 `disclose()`로 선언함 (`disclosure`) |
| 위험 | 실패 (`failure: true`: `EXPOSED`, `RECOVERABLE`, `PARTIAL`, `UNBOUND`) |
| 시험 못 함 | 엔진이 돌리지 못함 (`untestable`). 통과가 아님 |

한 값이 여러 회로에 쓰이면, 왼쪽 칸의 색은 가장 나쁜 결과(위험 > 시험 못 함 > 공개 > 증명만 > 숨김)를 따릅니다. 통과는 "이 공격 목록으로 재현되지 않음"이지 안전하다는 뜻이 아닙니다.
