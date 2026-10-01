# Work CLI flow consolidation — implementation verification

HISTORICAL — 2026-10-01 구현 slice의 합성 검증 기록이다. 현황 정본은 [roadmap](../../roadmap-current.md)이다.

- 설계: [work-cli-flow-consolidation](../../docs/design/drafts/work-cli-flow-consolidation.md), 설계 PR #261.
- 기준 main: `5210781f0b337702ec5cc2c6934022dd7224bc8d`.
- 구현 브랜치: `codex/work-cli-flow-implementation`.
- 범위: 공통 work-run에 optional packet 대조, 동일 prepare/backstop 재사용, HALT 증거·출력 보존, 대표 문서 정렬.
- 실행 환경: macOS, Node `v24.11.0`. Node 20/Ubuntu는 PR CI 결과로 별도 확인한다.

## 검증

| 검사 | 결과 |
|---|---|
| `npm ci` | PASS, lockfile 변경 없음 |
| `npm test` (Node 24.11.0) | PASS. golden/skill-contract 34 fixture: 33 pass, 1 expected failure, 0 drift/fail. node:test 2,025건: 2,023 pass, 2 기존 skip, 0 fail/cancel/todo |
| Node 20.19.5 `node --test scripts/lib/scoped-work-run.test.mjs scripts/lib/current-work-packed.test.mjs scripts/lib/scoped-work-cli.test.mjs` | PASS, 43/43, skip/fail 0 |
| `example:state` → `example:readiness` → `example:validate` | PASS; validate 검사 12종 OK |
| 예제 `_meta` `git diff --exit-code` | PASS, 생성물 byte-identical |
| `workflow:lint-gen -- --check`, `workflow:lint-baseline -- --json` | PASS, 기존 warning-first smoke |
| `kit:pack` | PASS, 293 payload 파일. 기존 distribution·current/scoped packed 회귀도 전체 suite에 포함 |
| `doc-drift --root .. --json` | exit 0. main의 추적 tree archive와 비교해 같은 15 warning/1 info, findings 배열 동일, 새 finding 0 |
| `git diff --check` | PASS |

새 `scoped-work-run.test.mjs`의 38개 수용 검사는 current/scoped 정상 사전/사후 각 prepare·backstop 1회, ready/deny/absorbed × diff 유무, standalone report와 모든 공통 증거 필드·report Markdown·status Machine Envelope의 동등성을 확인한다. `--out` 없는 JSON/human status, request 원문·digest·HEAD/tree·authority/origin/resource/단위 target read set 대조 실패, actual resource 옵션·monorepo prefix, 실행 중 request/authority 변화, 실제 unmerged index 수집 실패, packet 혼용·오류·미지원 flags, 기존 bundle·symlink ancestor/leaf·hardlink 충돌과 I/O race, mode/type·index/worktree 차이 및 no-packet 출력 조건을 포함한다.

기존 scoped 실행/packed 회귀도 packet-bound run의 Git-ignored API evidence directory 변화와 HALT 보고를 확인하도록 확장했다. 기존 AND·generated·claim·coverage/decision 검사는 그대로 전체 suite에서 실행했다. 실측 시간·토큰 절감으로 해석하지 않는다.

PR 원격 CI 결과는 PR의 checks가 정본이다. 이 기록은 위 로컬 검증 실행을 기록한다.

## 수용 사례와 증거 한계

`scoped-work-run.test.mjs`는 실제 current/scoped CLI와 Git repository fixture를 사용한다. 임시 ESM loader는 실제 prepare/backstop entry를 계수하고 실행 중 request/authority/output 변화를 주입한다. 권한 판정이나 Git 수집을 mock 결과로 대체하지 않는다.
정상 대표 절차의 prepare 6→2, backstop 4→2는 호출 수 근거다. consumer E3 수행·실제 시간·토큰 개선은 측정하지 않았다.
기존 packet 없는 run/no-work/visual·standalone CLI와 generated/API/owner/host/shared 권한 검사, 사람 소유 gate·승격·release/version은 유지한다. #260 ID 형식 작업과 consumer 저장소 변경은 포함하지 않는다.
