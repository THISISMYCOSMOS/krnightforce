# Midnight Proof Kit

> 상태: 초기 개발 중 (early development). 아래 "계획" 표시가 붙은 기능은 아직 없습니다.

## 한국어

Midnight Proof Kit은 Compact 계약을 로컬 시뮬레이터로 실제로 실행해서, **숨기려던 값이 체인에서 정말 숨겨지는지** 공격 시험으로 확인하는 Claude Code 플러그인과 TypeScript 시험 엔진입니다. 판정은 실행 결과로만 하고, LLM은 판정하지 않습니다.

공격 (첫 범위):

| 공격 | 하는 일 |
| --- | --- |
| A1 노출 | 숨긴 입력 하나만 바꿔 여러 번 실행하고, 체인에 남는 기록과 장부를 비교 (반환값은 호출자에게만 가므로 따로 표시하고 실패로 세지 않음) |
| A2 역산 | 숨긴 입력에 묶인 공개 값이 있으면 값 범위를 전수 대입해 원래 값을 되찾는지 확인 |
| A3 연결 | 같은 사용자의 두 행동이 공개 값으로 이어지는지 확인 (계획) |
| A5 경로 | 숨긴 입력에 따라 건드리는 장부 칸이 달라지는지 확인 |

기능 세 가지:

- `/proof:attack`: 공격 시험. 시험은 일반 vitest 파일로 프로젝트에 남아 플러그인 없이도 `npm test`에서 돕니다. (계획)
- `/proof:map`: 시험 결과를 "숨긴 값 → 회로 → 체인에 남는 것" 그림으로 칠합니다. (계획)
- `/proof:spec`: 코드 전에 무엇을 숨길지 정하고, 시험이 실패하면 고칠 패턴을 안내합니다. (계획)

**통과의 뜻**: 통과는 "이 공격 목록에서 재현되지 않음"이지 "안전함"이 아닙니다.

**범위 밖**: 수수료 주소, 비차폐 토큰, 네트워크 정보, 지갑과 증명 서버. 증명을 외부 증명 서버에서 만들면 숨긴 값이 그 서버로 전달되며, 이때의 보호는 그 서버의 신뢰 실행 환경(TEE)에 달려 있습니다. 이 시험은 체인에 남는 정보만 봅니다.

엔진 단독 실행 (지금 동작):

```bash
compact compile --skip-zk src/my.compact managed/my
npx proof-kit attack managed/my
```

설치 (계획, Claude Code):

```bash
claude plugin marketplace add THISISMYCOSMOS/krnightforce
```

## English

Midnight Proof Kit is a Claude Code plugin and TypeScript test engine that runs Compact contracts in the local simulator to check, by attack tests, **whether values meant to stay hidden really stay hidden on chain**. Verdicts come only from execution results, never from an LLM's judgment.

Attacks (initial scope): A1 exposure (vary one hidden input, diff the public transcript and ledger; return values go only to the caller and are reported separately, never as failures), A2 recovery (brute-force the value range against a public value), A3 linking (planned), A5 path (hidden input changes which ledger cells are touched).

Features: `/proof:attack`, `/proof:map`, `/proof:spec` (all planned).

A pass means "not reproduced by this attack list", not "safe". Out of scope: fee addresses, unshielded tokens, network metadata, wallets and proving servers. When proofs are generated on an external proving server, the hidden values are sent to that server, and their protection depends on that server's trusted execution environment.

## License

Apache-2.0. See [LICENSE](LICENSE).
