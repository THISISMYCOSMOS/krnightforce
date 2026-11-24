# Midnight Proof Kit

> 상태: 초기 개발 중 (early development). 아래 "계획" 표시가 붙은 기능은 아직 없습니다.

## 한국어

Midnight Proof Kit은 Compact 계약을 로컬 시뮬레이터로 실제로 실행해서, **숨기려던 값이 체인에서 정말 숨겨지는지** 공격 시험으로 확인하는 Claude Code 플러그인과 TypeScript 시험 엔진입니다. 판정은 실행 결과로만 하고, LLM은 판정하지 않습니다.

**왜 만드나.** Midnight를 처음 쓰는 개발자는 회로를 설계한 뒤 숨기려던 값이 정말 숨겨지는지 LLM 검토에 기대게 됩니다. Compact 컴파일러는 `disclose()` 없이 숨긴 값이 공개되는 것은 막아 줍니다. 하지만 해시나 상수 소금 커밋처럼 "숨겨진다고 믿고 통과시키는" 곳은 잡지 못합니다. midnight-expert의 `/audit-compact`도 이런 개인정보 항목은 대부분 리뷰 판단으로 남겨 둡니다. 이 프로젝트는 그 빈 곳을 채웁니다. 설계 단계에서 무엇이 드러나도 되는지 정하게 하고, 실제 계약을 실행해 그 설명이 맞는지 판정하고, 결과를 그림과 프로젝트에 남는 시험으로 보여 줍니다.

**누구를 위한가.** 처음 Midnight를 쓰는 개발자(해커톤 참가자 포함)와, 제출물을 보는 심사위원·멘토.

기획, 결정 기록, 진행 상황, 다음 작업: [docs/plan.md](docs/plan.md)

공격 (첫 범위):

| 공격 | 하는 일 |
| --- | --- |
| A1 노출 | 숨긴 입력 하나만 바꿔 여러 번 실행하고, 체인에 남는 기록과 장부를 비교 (반환값은 호출자에게만 가므로 따로 표시하고 실패로 세지 않음) |
| A2 역산 | 숨긴 입력에 묶인 공개 값이 있으면 값 범위를 전수 대입해 원래 값을 되찾는지 확인 |
| A3 연결 | 같은 사용자의 두 행동이 공개 값으로 이어지는지 확인 (계획) |
| A5 경로 | 숨긴 입력에 따라 건드리는 장부 칸이 달라지는지 확인 |

기능 세 가지:

- `/proof:attack`: 공격 시험. 엔진과 CLI(`proofkit attack`)는 동작합니다. 시험을 일반 vitest 파일로 프로젝트에 남기는 기능은 계획입니다.
- `/proof:map`: 시험 결과를 "숨긴 값 → 회로 → 체인에 남는 것" 그림으로 칠합니다. 구멍 판과 고친 판을 나란히 그릴 수 있습니다.
- `/proof:spec`: 코드 전에 무엇을 숨길지 정하고(누출 설명), 시험이 실패하면 고칠 패턴을 안내합니다. 설계 가이드([docs/design-guide.md](docs/design-guide.md)), 설계 기준 12개, 스킬이 있고, 엔진이 누출 설명 파일을 읽습니다(`--spec`).

**통과의 뜻**: 통과는 "이 공격 목록에서 재현되지 않음"이지 "안전함"이 아닙니다.

**범위 밖**: 수수료 주소, 비차폐 토큰, 네트워크 정보, 지갑과 증명 서버. 증명을 외부 증명 서버에서 만들면 숨긴 값이 그 서버로 전달되며, 이때의 보호는 그 서버의 신뢰 실행 환경(TEE)에 달려 있습니다. 이 시험은 체인에 남는 정보만 봅니다.

엔진 단독 실행 (지금 동작). 엔진은 아직 npm에 올리지 않았으니 이 레포에서 빌드해 씁니다. Node 22와 Compact 컴파일러 0.36.0이 필요합니다.

```bash
cd packages/proof-kit && npm install && npm run build && cd ../..
compact compile --skip-zk src/my.compact managed/my
node packages/proof-kit/dist/cli.js attack managed/my          # 사람이 읽는 보고서
node packages/proof-kit/dist/cli.js attack managed/my --json   # JSON
```

컴파일된 계약이 `@midnight-ntwrk/compact-runtime`을 찾을 수 있어야 합니다. 계약 프로젝트에 이 패키지가 설치돼 있어야 합니다. 종료 코드는 실패가 없으면 0, 있으면 1, 사용법·불러오기 오류면 2입니다.

설치 (계획, Claude Code):

```bash
claude plugin marketplace add THISISMYCOSMOS/krnightforce
```

## English

Midnight Proof Kit is a Claude Code plugin and TypeScript test engine that runs Compact contracts in the local simulator to check, by attack tests, **whether values meant to stay hidden really stay hidden on chain**. Verdicts come only from execution results, never from an LLM's judgment.

Attacks (initial scope): A1 exposure (vary one hidden input, diff the public transcript and ledger; return values go only to the caller and are reported separately, never as failures), A2 recovery (brute-force the value range against a public value), A3 linking (planned), A5 path (hidden input changes which ledger cells are touched).

Why: newcomers to Midnight end up relying on LLM review to check whether their circuits hide what they mean to hide. The Compact compiler rejects undeclared disclosures, but it trusts hashes and commitments to hide their inputs (an unsalted hash of a small value, or a constant-salt commitment, compiles). midnight-expert's `/audit-compact` leaves most privacy items to review judgment. Proof Kit fills that gap: a design guide to write down what may be revealed, attack tests that execute the real contract to check it, and a map plus tests that stay in the project.

Features: `/proof:spec` (design guide, twelve design criteria and skill exist; the engine reads the spec file via `--spec`), `/proof:attack` (engine and `proofkit attack` CLI work; test-file export is planned), `/proof:map` (`proofkit map` works; README section writing is planned). Plan and status: [docs/plan.md](docs/plan.md).

A pass means "not reproduced by this attack list", not "safe". Out of scope: fee addresses, unshielded tokens, network metadata, wallets and proving servers. When proofs are generated on an external proving server, the hidden values are sent to that server, and their protection depends on that server's trusted execution environment.

## License

Apache-2.0. See [LICENSE](LICENSE).
