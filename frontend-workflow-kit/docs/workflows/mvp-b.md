# MVP-B Phase 0 통합 노트

> lanes A/B/C 머지 결과를 한 파일로 고정한다 — 무엇이 코드로 강제되고, 무엇이 경고-전용이며, 무엇이 여전히 제안인지.

> 스냅샷: 2026-06-14
> 기준: `origin/main` (commit `16bf472` — lanes A/B/C + CI 배선 포함)
> 브랜치: `docs/mvp-b-integration-notes`

## 요약

MVP-B Phase 0 = lanes **A/B/C** 통합. 회귀 하니스(A) · 경로 backstop(B) · 입력/register 검증(C) 세 갈래가 `main` 에 들어왔다.

핵심은 **대부분 warning-first** 라는 점이다 — 기본 CI exit code 는 바뀌지 않는다. 새로 들어온 강제 중 빌드를 깨는 것은 validate 구조 검사(검사 11·12)뿐이고, 나머지(경로 backstop · Reconciliation Register 미처리 감지)는 기본 exit 0 으로 경고만 내고 `--enforce` 로 opt-in 해야 하드가 된다. 회귀 하니스(A)는 자체 실행 시 하드-exit 의미를 갖고, CI 에는 **warning-only**(`continue-on-error: true`)로 배선됐다 — 결과는 로그에 보이되 job 은 안 깬다(하드 gating 승격은 후속).

## Lane 별 상세

### Lane A — golden fixture 회귀 하니스

- **무엇:** 기존 예제/드라이런 출력물을 반복 가능한 회귀 검사로 굳히는 하니스(MVP-B Phase 0). 손으로 하던 hash+grep 대조를 코드화한다. manifest 기반으로 두 갈래를 돈다 — `reconcile`(올리기만(raise-only) 불변식 대조)과 `integrity`(문서 생성 예제/run 의 파싱 무결성 + 선언 산출물 존재).
- **추가 파일:** `scripts/test-fixtures.mjs` (+ `scripts/lib/test-fixture.mjs`)
- **강제 의미:** 자체 실행 시 **하드-exit**.
  - `0` = 모든 fixture 가 기대대로(pass 통과 + xfail 가 선언된 이유로 실패).
  - `1` = 치명(pass 실패 / xfail 이 통과=`xpass` / xfail 이 다른 이유로 실패=`xdrift`).
  - `2` = 설정/IO 오류(깨진 `run-metadata.json` 등).
  - **xfail witness:** pre-fix 증거 run 은 "올바른 이유로 실패"할 때만 증거로 인정한다 — 통과하면(`xpass`) 치명, 선언된 `expected_failures` 와 정확히 일치하게 실패하면 비치명(`xfail`), 다른 이유로 실패하면(`xdrift`) 치명. 기대 판정은 `run-metadata.json` 의 `expect` 필드로 데이터화한다.
- **실행:**
  ```bash
  node scripts/test-fixtures.mjs
  ```
- **CI 상태:** **배선됨(`main`).** kit `example:test` alias(`node scripts/test-fixtures.mjs`) + CI 의 golden fixture step. CI step 은 `continue-on-error: true` 라 **warning-only**(결과는 로그에 보이되 job 비차단) — FP율 확인 후 별도 PR 로 하드 gating 승격(`continue-on-error` 제거).

### Lane B — diff 기반 forbidden_paths backstop

- **무엇:** 경계를 넘은 '변경(diff)' 을 사후에 잡는 **2차 방어선**. 훅 없는 환경(CI/비-Claude/훅 off)용 그물이다. 1차 방어선(readiness 다운그레이드 + 편집 직전 live gate 훅)과 분리돼 있고, `validate.mjs` 의 트리 스캔과도 분리한다 — 트리 스캔은 이미 존재하는 `src/api` 를 오탐하므로 backstop 은 **변경분(diff)만** 보고 이미 존재하는 파일은 무시한다. 모드 판정은 `readiness.mjs` 의 `computeReadiness` 를 import 해 소비한다(별도 판정 로직 0 — 불변식 #1).
- **추가 파일:** `scripts/forbidden-paths.mjs` (+ `scripts/lib/path-backstop.mjs`), `examples/path-backstop/` 픽스처 동반.
- **강제 의미:** **warning-first.**
  - `0` = 위반 없음 — 또는 `--enforce` 없이 위반을 경고로만 출력.
  - `1` = `--enforce` 인데 위반 있음.
  - `2` = 입력 오류(state/policy 부재, git 실행 / base ref 해석 실패).
- **실행:** CI 의 `git diff` 컨텍스트와 결합해 호출하는 도구다.
  ```bash
  node scripts/forbidden-paths.mjs            # warning-first (기본 exit 0)
  node scripts/forbidden-paths.mjs --enforce  # 위반 시 exit 1
  ```
- **CI 상태:** npm alias `workflow:forbidden-paths` 배선됨 — kit `package.json` + 소비 프로젝트 미러(`package-scripts.template.json`) 양쪽. 전용 CI step 은 후속(단일 `--diff` 입력 CLI 라 self-contained step 부재).

### Lane C — 입력 결과물 · Reconciliation Register 검증

- **무엇:** `validate.mjs` 에 검사 두 개를 추가했다 — **검사 11**(입력 결과물 `inputs/*.md` frontmatter)과 **검사 12**(Reconciliation Register). 검사 12 는 `input_id` ↔ register 대조로 미처리(Reconcile Status `in-progress`/`failed`)를 감지한다.
- **추가 파일:** `scripts/lib/input-artifact.mjs`, `scripts/lib/reconciliation-register.mjs`
- **강제 의미:** 혼합형.
  - **구조 검사 = 하드(exit 1).** frontmatter/register 형식이 깨지면 빌드를 깬다.
  - **미처리 감지 = warning-first.** Reconcile Status `in-progress`/`failed` 는 기본 경고만, `--enforce` 로 하드.
- **검사 카운트:** validate 총 검사 수가 **9종 → 12종** 으로 늘었다 (검사 11·12 추가).
- **실행:**
  ```bash
  npm run workflow:validate    # 검사 12종
  ```

## 분류표

위 세 갈래와 함께 들어온 것들을 분류한다. 표기를 그대로 신뢰하고 제안-전용 항목을 구현됨으로 승격하지 말 것.

| 항목 | 분류 | 비고 |
|---|---|---|
| MVP-A 코어 (`state`/`readiness`/`validate`, Open Decisions cap + 검사 9) | 구현·강제(하드) | 기존 그대로 유지 |
| validate 검사 11·12 의 **구조 검사** (Lane C) | 구현·강제(하드) | frontmatter/register 형식 위반 = exit 1 |
| `test-fixtures` 회귀 하니스 (Lane A) | 구현·강제(하드) | 자체 실행 exit 1; CI 는 warning-only(`continue-on-error`) 배선 — 하드 gating 후속 |
| `forbidden-paths` backstop (Lane B) | 경고-전용 | 기본 exit 0, `--enforce` 로 opt-in 하드 |
| Reconciliation Register **미처리 감지** (검사 12 일부, Lane C) | 경고-전용 | Reconcile Status `in-progress`/`failed`, `--enforce` 로 하드 |
| `lint-policy` template/schema/catalog/rollout docs (MVP-B PR-1) | 문서 계약 | canonical path = `docs/frontend-workflow/_meta/lint-policy.yaml` |
| `lint-gen` skeleton (MVP-B PR-2) | 구현·미승격 | deterministic `eslint.workflow.config.mjs` flat-config fragment emission; generated guard/CI/baseline 미승격 |
| `adapt-lint-pack` skill (MVP-B PR-3) | 문서/스킬 계약 | brownfield scan -> map -> diff -> rollout -> propose; drafts/reports only, 승인 전 `lint-gen.mjs` 실행 없음 |
| `lint-baseline` / CI gate promotion (MVP-B PR-4/5) | 제안 | 승격 금지 |
| `catalog` / `nav` / `route-tree` / `check-generated` (MVP-C) | 제안 | 승격 금지 |
| `reconcile-input` 킷 `skills/` vendor | 제안 | 리포-로컬 스킬은 절차 가이드일 뿐 코드 강제 0 |
| API Candidate ↔ zod/OpenAPI **1:1 매칭** | 제안 | 현재 검사 8 은 스키마 소스 존재만 확인 |
| Interaction Matrix **`Result` 컬럼 구조화** | 제안 | 승격 금지 |
| **Work Packet & Review Artifacts** | 제안(템플릿만) | `templates/work-packet/` 에 설계/문서 템플릿만 존재, 코드 강제 0 — Future Candidate |

## 실행 / 검사 방법

```bash
# golden example 루프 (검사 12종)
npm run example:state
npm run example:readiness
npm run example:validate

# 회귀 하니스 (자체 실행 하드-exit 0/1/2; CI 는 warning-only/continue-on-error)
npm run example:test                  # = node scripts/test-fixtures.mjs

# 경로 backstop (warning-first; --enforce 로 하드). --diff/--docs 로 대상 지정.
npm run workflow:forbidden-paths -- --diff examples/path-backstop/diffs/case1-api-write.txt --docs examples/path-backstop/docs/frontend-workflow
node scripts/forbidden-paths.mjs --enforce --diff <file> --docs <dir>
```

소비 프로젝트는 `workflow:state`/`workflow:readiness`/`workflow:validate`(+ warning-first `workflow:forbidden-paths`)로 호출한다. `validate` 는 이제 검사 12종을 돈다.

### 검증 두 갈래 (내부 픽스처 ↔ 외부 소비 dogfood)

- **(a) 내부 픽스처 검증 — 킷 레포 *안*.** Lane A 골든-픽스처 하니스(`scripts/test-fixtures.mjs`, alias `example:test`)를 `examples/` 대상으로 돌려 회귀 불변식(reconcile/integrity)을 고정한다. 범위 = 킷 자체의 예제·드라이런 산출물. CI 에는 warning-only(`continue-on-error`)로 배선.
- **(b) 외부 소비 dogfood — 킷 레포 *밖*.** `consumer-dogfood-001`: 킷을 vendoring 한 fresh Expo 프로젝트(create-expo-app sdk-56)에서 `state → readiness → Work Packet → implement-screen → validate → forbidden-paths(경고)` 전 구간을 게이트 천장 안에서 완주(HOME-001 screen-skeleton 정상 진행 + PROFILE-001 docs-only 거절). 킷 소스 커밋 `4601347`. 실측 보고: [`temp/runs/consumer-dogfood-001/run-report.md`](../../../temp/runs/consumer-dogfood-001/run-report.md) (+ 동봉 `evidence/`).

즉 (a)는 킷 *내부*에서 픽스처 무결성을, (b)는 킷 *외부* 소비 프로젝트에서 실제 적용 가능성을 검증한다 — 둘은 별개 축이다.

## 잔여 (다음)

- `test-fixtures` **하드 gating 승격** — 현재 CI 는 warning-only(`continue-on-error`); FP율 확인 후 gating.
- `forbidden-paths` **전용 CI step** — 현재 npm alias 만 배선(단일 `--diff` CLI), self-contained step 후속.
- `reconcile-input` **킷 `skills/` vendor** (Reconciliation Register 검증은 검사 12 로 완료; pre-edit/commit hook 확장은 후속).
- `lint-baseline` ratchet runner/fixtures (MVP-B PR-4).
- lint CI/gate promotion decision (MVP-B PR-5).
- MVP-C: `catalog` / `nav` / `route-tree` / `check-generated`.
- API Candidate ↔ zod/OpenAPI **스키마 1:1 매칭** 검사.
- Interaction Matrix **`Result` 컬럼 구조화**.
- **Work Packet** 강제 (현재 템플릿만 존재 — Future Candidate).

## 링크

- [README 문서 지도](../../README.md#문서-지도)
- [roadmap-current.md](../../roadmap-current.md)
- [CHANGELOG.md](../../CHANGELOG.md)
