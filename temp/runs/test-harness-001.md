# test-harness-001 — MVP-B Phase 0 golden fixture 비교 하니스 빌드 리포트

> ✅ **PASS.** `test-fixtures.mjs` 하니스 신설 + 검증 완료. 브랜치 `feat/test-fixtures-harness`
> (워크트리 `.claude/worktrees/test-fixtures-harness`, base = `docs/reconcile-input-eval-notes` HEAD `6a538a0`).
> 현재 브랜치는 건드리지 않음.

## 무엇을 했나
기존 예제·드라이런 출력물을 **반복 가능한 회귀 검사**로 굳혔다. `scripts/example-compare.mjs`(untracked 초안)와
`temp/example-compare-harness-proposal.md` 의 설계를 일반화해, reconcile-input 의 손-대조(hash+grep)를 코드화한다.

- **reconcile 검사** — `actual-llm-after` 를 정답지 `expected-llm-after` 와 대조하는 **올리기만(raise-only)** 불변식.
- **integrity 검사** — 문서 생성 예제/구현 run 의 파싱 무결성 + 선언 산출물 존재. (readiness/validate 판정은 **재구현 안 함** — 게이트 단일 출처 보존.)

## 산출물 (4개 신규 파일, 그 외 무수정)
| 파일 | 역할 |
|---|---|
| `frontend-workflow-kit/scripts/test-fixtures.mjs` | manifest 기반 러너. `node scripts/test-fixtures.mjs [--json]`, exit 0/1/2. |
| `frontend-workflow-kit/scripts/lib/test-fixture.mjs` | 공유 검사 lib. `lib/spec.mjs`(parseTable·loadScreenSpec)·`lib/util.mjs` 재사용 → 파서 표류 없음. `runReconcileChecks`(E/R/F) + `runIntegrityChecks`, `toPosix`·`normalizeText`. |
| `temp/runs/reconcile-input-001/run-metadata.json` | 기대 판정 데이터화: `expect: xfail` (의도된 실패 증거). |
| `temp/runs/reconcile-input-002/run-metadata.json` | 기대 판정 데이터화: `expect: pass` (통과 필수). |

## 검사 대상 fixture (6)
| fixture | kind | actual ↔ expected | 기대 | 결과 |
|---|---|---|---|---|
| input-reconciliation | reconcile | expected-llm-after ↔ 자기 자신 (golden self-check) | pass | **PASS** |
| reconcile-input-001 | reconcile | actual-llm-after ↔ expected-llm-after | xfail | **XFAIL** (U-001 resolved + U-002 신설) |
| reconcile-input-002 | reconcile | actual-llm-after ↔ expected-llm-after | pass | **PASS** |
| coupon-feature | integrity | docs 파싱 무결성 | pass | **PASS** (screen-spec 2) |
| multi-screen-dry-run | integrity | docs 파싱 무결성 | pass | **PASS** (screen-spec 6) |
| implement-screen-001 | integrity | docs 파싱 + expected 리포트 존재 | pass | **PASS** (screen-spec 6 + 리포트 2) |

검사 종류:
- **E:files** — expected 산출물이 actual 에 모두 존재(존재 패리티만 — 경로 경계 X).
- **E:content** — 정규화(generated_at·date·CRLF) 후 동일/차이 집계. **정보성, 비게이트** (cosmetic 차이 허용).
- **R:register** — reconciliation-register 입력 5행 + 전부 `reconciled`.
- **F:decision/conflict/gap/confirmed/unknown** — 사람-전용 전이 부재: D-001/D-003/D-204·C-001·U-001 = `open` 유지(strict — open 이 아니면 FAIL), G-001 `accepted` 아님, COUPON-001 `status: confirmed` 아님, U-002 미신설. 행 부재·표 깨짐·frontmatter 파싱오류도 fail-closed.

```
test-fixtures — PASS (6 fixtures: 5 pass, 1 xfail, 0 xpass, 0 xdrift, 0 fail)
```
reconcile-input-001 은 **F:unknown 두 건만** 실패(U-001=resolved, U-002 신설) → `xfail`(비치명). 이는 pre-fix 계약 결함을
노출해 PR #1 로 이어진 **증거**다. 002 는 동일 검사를 전부 통과.

## 요구사항 정합
| # | 요구사항 | 상태 |
|---|---|---|
| 1 | human-final `expected-after` 를 LLM 출력처럼 비교하지 않음 | ✅ `GOLDEN_IR` = expected-llm-after 만 비교; expected-after 는 주석에만 등장 |
| 2 | reconcile actual 은 expected-llm-after 와만 대조 | ✅ expectedDir = `GOLDEN_IR/docs/frontend-workflow` 고정 |
| 3 | reconcile-input-001 을 의도적 실패 증거로 표시 가능 | ✅ `run-metadata.json` `expect: xfail` → 비치명 |
| 4 | reconcile-input-002 는 LLM-only 불변식 통과 필수 | ✅ `expect: pass` → 실패 시 치명(exit 1). 회귀 주입 시 exit 1 확인(되돌림) |
| 5 | generated_at/date/path 구분자 정규화(필요 시) | ✅ `toPosix`(경로, ~12곳 사용) + `normalizeText`(generated_at·date·CRLF, E:content 에서 사용) |
| 6 | 경로 경계 로직은 여기서 안 함 (Lane B) | ✅ forbidden_paths 검사 없음 — 주석으로 Lane B 위임 명시 |

**Do not**: workflow:reconcile 미추가(package.json main 과 동일) · expected-after 의미 불변(examples diff 없음) ·
결정 미해결(하니스는 fixture 에 **read-only**, write 프리미티브 없음) · examples 소스 fixture 미수정(허용된 run-metadata.json 만 신규).

## 검증
타스크 지정 4종 + 하니스 모두 green:
```
npm run example:state      → exit 0
npm run example:readiness  → exit 0
npm run example:validate   → OK (검사 10종 통과), exit 0
node scripts/test-fixtures.mjs → PASS, exit 0
```
추가로 **멀티에이전트 워크플로우**(5 에이전트, 적대적 검증)로 교차 확인:
- 검증러너 1 + 독립 감사 3(요구사항 / 파일 경계 / 행위 ground-truth) + 종합 판정 1.
- 행위 감사가 세 coupon-list screen-spec 을 직접 읽어 ground truth 를 먼저 세운 뒤 하니스와 대조 — 일치.
- **경험적 회귀 테스트**: run-002 의 U-001 을 `resolved` 로 변형 → 하니스 `exit 1`(치명) 확인 후 `git checkout` 으로 복원.
- 종합 판정: **PASS**, 확정 이슈 **0** (info 만). 워크트리 footprint = 정확히 4파일 allowlist.

## 메모
- **경로 표기**: 타스크의 allowed-files 는 `frontend-workflow-kit/temp/runs/**` 로 적혀 있으나, 실제 runs 는 **레포 루트** `temp/runs/**` 에 있다(킷 밖). 하니스는 `KIT_ROOT/../temp/runs` 로 해석하며, 리포트도 루트 `temp/runs/` 에 둔다.
- **npm 스크립트**: 타스크가 "꼭 필요할 때만" 으로 제한했고 검증은 `node scripts/test-fixtures.mjs` 직접 호출이라 `package.json` 은 **건드리지 않았다**. 후속(후보 ③ hook/CI)에서 `example:test` 같은 스크립트를 붙일 수 있다.
- **xfail/xpass/xdrift (strict witness)**: `expect: xfail` 은 `expected_failures` 로 실패 이유를 고정한다. 선언된 이유(F:unknown U-001·U-002)로 실패 → `xfail`(비치명, 의도된 증거). 통과 → `xpass` = **치명**. 다른 이유로(추가/누락) 실패 → `xdrift` = **치명**. 즉 "올바른 이유로 실패"할 때만 증거로 인정한다. 현재 001 은 정상 xfail. (잘못된 `expect`·깨진 `run-metadata.json`·비정상 `compare_against`/`actual`/`expected_failures` 형식은 설정 오류로 exit 2.)
- **stage**: 이번 하니스는 `stage=llm-after` 만. `after`(human-final) 단언·manifest 외부화(YAML)는 후속.
