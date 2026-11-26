# 근거: ZK 회로 실수 연구와 우리 설계 기준 대조 (2026-11-26)

설계 기준 12개와 공격 목록이 실제로 보고된 ZK 회로 실수를 얼마나 다루는지 대조한 문서입니다. 자료는 Sonnet 에이전트가 웹에서 직접 열어 확인했습니다. "확인"은 원문 페이지를 열어 해당 부분을 읽은 것이고, "미확인"은 검색 결과로만 본 것입니다.

## 자료

| # | 자료 | 확인 상태 | 핵심 |
| --- | --- | --- | --- |
| S1 | Chaliasos 외, "SoK: What don't we know? Understanding Security Vulnerabilities in SNARKs", 2024, [arXiv:2402.15293](https://arxiv.org/abs/2402.15293) | 확인(전문 149k자 중 앞 100k자). 학회(USENIX Security 2024)는 미확인 | 실제 취약점 141개. 회로 층 99개(70%), 그중 95개가 제약 부족(under-constrained) |
| S2a | Pailoor 외, "Automated Detection of Underconstrained Circuits for Zero-Knowledge Proofs"(QED2), PLDI 2023, [eprint 2023/512](https://eprint.iacr.org/2023/512) | 확인(초록) | 한 입력에 여러 witness가 맞는 회로 탐지. Circom 회로 163개, 새 취약점 8개 |
| S2b | Wen 외, "Practical Security Analysis of Zero-Knowledge Proof Circuits", USENIX Security 2024, [발표 페이지](https://www.usenix.org/conference/usenixsecurity24/presentation/wen) | 확인(초록). 탐지기 9개의 목록은 미확인 | 회로 의존 그래프 위의 정적 분석 |
| S2c | Trail of Bits, [Circomspect](https://github.com/trailofbits/circomspect) | 확인 | Circom 린터. 제약 없는 대입, 제약 부족 신호, 비교·나눗셈 미검사, 필드 넘침 등 14개 검사 |
| S3 | 0xPARC, [zk-bug-tracker](https://github.com/0xPARC/zk-bug-tracker) | 확인(앞 100k자) | 실제 버그 27개의 태그: 제약 부족 14, 비결정 witness 11, 산술 넘침 6, 비트 길이 불일치 4, 대입만 하고 제약 없음 4, 신뢰 설정 유출 1 |
| S4a | Electric Coin Co., "Zcash Counterfeiting Vulnerability Successfully Remediated", 2019 | 확인 | 신뢰 설정·증명 시스템의 건전성 결함 |
| S4b | Béres 외, "Blockchain is Watching You", 2020, [arXiv:2005.14051](https://arxiv.org/abs/2005.14051) | 확인(초록) | Tornado Cash 입출금 연결, 메타데이터 프로파일링 |
| S5 | Midnight 공식 문서: [Smart contract security](https://docs.midnight.network/compact/smart-contract-security), [Explicit disclosure](https://docs.midnight.network/compact/reference/explicit-disclosure), [Compact reference](https://docs.midnight.network/compact/lang-ref) | 확인 | witness는 검증되지 않은 값이라 회로가 `assert`로 묶어야 함. 반환도 "공개"로 분류. nullifier는 확인한 뒤 넣음. 도메인 분리, `sealed` 등 |

## 대조표

실수 유형은 자료들을 합쳐 15개로 묶었습니다. 출처 표기는 S1~S5입니다.

| # | 실수 유형 (출처) | 우리 기준·공격 | 상태 |
| --- | --- | --- | --- |
| 1 | 제약 부족: 입력이 무엇에도 묶이지 않음 (S1 95/99, S2, S3 14) | 기준 10(안내). T2는 그중 "같은 witness 두 번 읽기"만 확인 | **가장 큰 빈 곳** |
| 2 | 대입만 하고 제약 없음 `<--` (S1 14, S2c, S3 4) | — | Circom 고유 문법. Compact는 코드에서 제약을 만들므로 해당 없음. 1번으로 흡수 |
| 3 | 비결정 witness: 한 입력에 맞는 witness가 여럿 (S2a, S3 11) | T2(부분) | 부분 |
| 4 | 논리를 제약으로 잘못 옮김: 비교·나눗셈 (S1 34, S2c) | A1 경계값 시료(부분 노출) | 숨김 쪽만 봄. 논리 오류 자체는 범위 밖 |
| 5 | 필드 넘침, 범위 검사, 비트 길이 (S1 8, S3 6+4) | 패턴 "결과를 회로 안에서 다시 계산"(Uint 사용) | 안내만 함. 뼈대 규칙에 없음 |
| 6 | 다른 곡선용 회로 재사용 (S1 9, S2c) | — | Compact 표준 라이브러리가 고정이라 대체로 해당 없음 |
| 7 | 컴파일러 버그 (S1 6) | 컴파일러 실험 40개, 버전 고정 0.36.0 | 범위 밖. 실험이 일부 관찰 |
| 8 | 증명 시스템·검증기 결함 (S1 16, S3) | — | 범위 밖(플랫폼 몫) |
| 9 | 신뢰 설정 결함 (S1 1, S3 1, S4a) | — | 범위 밖 |
| 10 | 응용 층 검증 누락: nullifier 사용 여부 미확인 등 (S1 10) | 기준 8, 패턴 "범위 있는 nullifier" | 안내만 함. "확인 후 넣기"가 뼈대 규칙에 명시돼 있지 않음 |
| 11 | nullifier·재사용 설계 (S5, S1) | 기준 8, A3(예정) | A3 미구현 |
| 12 | 약한 해시·커밋: 작은 값의 해시, 소금 재사용, 도메인 분리 없음 (S5) | 기준 4·5, A2, 뼈대의 도메인 태그 | **다룸**(A2 실행). 소금 재사용은 A3 예정 |
| 13 | 공개 출력·오류 메시지·이른 `disclose()`로 샘 (S5, S1 3) | 기준 1·2·6, A1. 오류 메시지는 컴파일러가 막음(p17) | 다룸. 단 **반환값** 판정은 공식 문서와 다름(아래) |
| 14 | 연결·메타데이터: 주소 재사용, 회차 없는 인증 (S4b, S5) | 기준 8, 정보 목록의 메타데이터, A3(예정) | A3 미구현(블라인드 구멍 11개 중 4개가 이 종류) |
| 15 | 검증되지 않은 witness·호출자 신원 (S5) | 기준 10·11(안내) | 안내만 함. T1은 범위 밖 |

## 보완점 (중요한 순서)

1. **입력 묶기(제약 부족)를 설계의 중심 규칙으로.** 문헌에서 회로 실수의 대부분(S1: 99개 중 95개)이 이 종류인데, 우리는 안내(기준 10)와 T2 한 가지 모양만 다룹니다.
   - 스킬: 설계안 3부(값마다 부품)에 witness마다 "무엇으로 묶이나"를 적게 합니다. 예: 발급자 커밋, 장부 상태, 소유자 비밀. 묶을 데가 없는 witness는 설계 단계에서 막습니다.
   - 엔진 후보(기획 결정 필요): "어떤 값을 넣어도 통과하면서 공개 사실이나 장부를 바꾸는 witness"를 실행으로 찾는 검사. 블라인드에서 못 잡은 "포인트가 아무것에도 묶이지 않음"이 이 종류입니다.
2. **반환값 판정을 공식 문서와 맞추기.** 공식 문서는 exported 회로에서 반환하는 것도 "공개"로 분류합니다(S5 Explicit disclosure).
   - 우리 판정(11/23 결정)은 "반환값은 체인에 남지 않으니 실패가 아님"입니다. 블라인드 작성자도 반환을 구멍으로 적었습니다.
   - 호출자가 데이터 주인이 아닌 경우를 생각해야 합니다. 예: 검증자가 부르는 회로가 사용자의 숨긴 값을 반환하는 경우, 그 값은 실제로 남에게 갑니다.
   - 기획 결정이 필요합니다.
3. **뼈대 규칙 보강**(`skeleton.md`, 문서 수정만 필요)
   - nullifier는 "이미 썼는지 확인한 뒤 넣기"(S5, S1 응용 층 10건)
   - 누적·합계는 `Field`가 아니라 범위 검사가 되는 `Uint`(S1 8, S3 10)
   - 바뀌면 안 되는 설정은 `sealed`(S5)
   - 금액 범위·상태(활성 여부) 확인(S5)
4. **A3 연결 공격의 우선순위를 근거로 올리기.** 문헌(S4b, S5)과 블라인드 결과(11개 중 4개)가 같은 방향입니다. 다만 기획 순서는 이미 정해져 있으니, 순서를 바꿀지 결정이 필요합니다.
5. **범위 밖이라고 문서에 명시**: 증명 시스템·검증기, 신뢰 설정, 컴파일러 자체 버그, Circom 고유 실수. 우리 도구가 이것들을 보장하지 않는다는 근거를 남깁니다.

## 한계

- 대부분 Circom 생태계의 자료입니다. Compact는 제약을 컴파일러가 만들고, `disclose()` 규칙으로 일부 실수를 막으므로 비율이 그대로 옮겨지지 않습니다.
- 몇 자료는 초록만 확인했습니다(S2a, S2b, S4b).
- 수치는 웹 페이지 요약을 거친 값이라, 인용하기 전에 원문 대조가 한 번 더 필요합니다.
