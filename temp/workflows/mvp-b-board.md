# MVP-B 병렬 작업 보드 (3 lane)

> 스냅샷: 2026-06-14 (rev9) · **path-backstop 회귀 MERGED**(PR#12 rebase → main, CI green) — forbidden-paths fixture 회귀를 test-fixtures(kind:path-backstop)에 흡수, `example:test` 가 CI 에서 커버(새 CI/npm 배선 0). rev8: PR-WIRE MERGED(PR#8 → `16bf472`) — MVP-B 검증 스위트 + CI·npm 배선 완료. rev7: A·B·C 전부 MERGED(+PR#7 Lane B → `b066ca2`). rev6: A·C MERGED(PR#4·#5) + 워크트리 정리. rev5: #1 (b) 확정(PR#5 `b1879c9`). rev4: Lane A PR#4 반영 — 딜리버러블 `test-fixtures.mjs`+`lib/test-fixture.mjs`(초안 example-compare.mjs superseded), 매니페스트 CLI·xfail 의미로 §2/§4/§6/부록 동기화. [rev3: Lane C 4a32b59 — 검사 12 stale-conflict 스코프아웃 + lib 2파일 등록. rev2: 워크트리 착수 + 검사번호 9→10종.] 작성: plan-mvp-b (보드만 수정 — 코드/스크립트/README 무변경).
> 목적: MVP-B 검증 작업을 충돌 없이 병렬화할 수 있도록 **파일 소유권·의존성·PR 순서·수용 기준**을 한 파일로 고정한다.
> 근거 문서: [mvp-b-validation-candidates.md](../proposals/mvp-b-validation-candidates.md) · [diff-based-forbidden-paths-backstop.md](../proposals/diff-based-forbidden-paths-backstop.md) · [example-compare-harness-proposal.md](../example-compare-harness-proposal.md) · [reconcile-input-rubric.md](../evaluations/reconcile-input-rubric.md) · [implement-screen-dry-run-checklist.md](../evaluations/implement-screen-dry-run-checklist.md) · [roadmap-current.md](../../frontend-workflow-kit/roadmap-current.md)

## 실행 현황 (워크트리) — 2026-06-14

3 lane 모두 워크트리에서 착수됨. 각 lane 은 자기 브랜치에서 격리 작업하고, 이 보드(main/primary)가 조정 단일 출처다.

| Lane | 브랜치 | 상태 |
|---|---|---|
| A (후보 5) | `feat/test-fixtures-harness` | ✅ **MERGED** (PR#4, rebase) · 워크트리·브랜치 정리됨 |
| B (후보 3) | `feat/path-backstop` | ✅ **MERGED** (PR#7, rebase) · 워크트리 정리 대상 |
| C (후보 4·6) | `feat/build-input-validation` | ✅ **MERGED** (PR#5, rebase) · 워크트리·브랜치 정리됨(물리 폴더만 수동 삭제 잔여) |

**A·B·C 세 lane 전부 머지 완료** (origin/main `b066ca2`, 전부 rebase — CI `validate-example` green). 파일 disjoint 라 순서 무관 머지됨. **MVP-B 검증 스위트 + CI·npm 배선 = 완료.** **PR-WIRE ✅ PR #8 MERGED**(main `16bf472` · `example:test`+`workflow:forbidden-paths` alias + CI test-fixtures warning step). **forbidden-paths CI 회귀 ✅ PR #12 MERGED** — test-fixtures 에 `kind:path-backstop` 13케이스 흡수(`example:test` 가 CI 에서 커버). 남은 follow-up: deferred `--enforce` 승격(검사 12 미처리·backstop, FP 관찰 후)뿐.

## 0. 범례 & 스코프 경계

```txt
접근 표기 (파일 소유권 표에서 사용)
  CREATE   이 lane 이 새로 만든다
  MODIFY   이 lane 이 기존 파일을 고친다 (단독 소유 — 다른 lane 은 못 건드림)
  CONSUME  read-only import/실행만. 절대 수정 금지
  RO       read-only 참조(스펙/정답지/정책). 절대 수정 금지
  COORD    공유 편집 지점 — 여러 lane 이 줄을 더할 수 있어 머지 시 직렬화 필요
```

**이 보드가 다루는 것 = 후보 5 / 3 / (4→6) 뿐이다.** mvp-b-validation-candidates 의 6후보 중:

```txt
Lane A = 후보 5  expected-llm-after 비교 하니스      (Phase 0 인프라)
Lane B = 후보 3  diff 기반 forbidden_paths backstop  (첫 게이트)
Lane C = 후보 4 → 후보 6  입력 frontmatter + register 검증 (게이트, 4 가 6 의 전제)

스코프 밖 (이 3 lane 에 없음 — 추천순서 5→3→4→6→1→2 의 꼬리):
  후보 1  API ↔ zod/OpenAPI 1:1 매칭  — `linked_schema` 규약(=schema 추가) 선결 필요 → 별도 세션
  후보 2  Interaction Matrix Result 구조화 — 전 screen-spec 마이그레이션(blast radius L) → 별도 세션
```

하드룰(전 lane 공통, roadmap "지금 하지 말 것" 계열):
- 판정 단일 출처(`readiness.mjs`)를 **두 번째로 만들지 않는다** — 소비만.
- 파싱 단일 출처(`lib/spec.mjs`)를 우회한 자체 md 파서 금지.
- 새 readiness **게이트 신설 금지** (게이트는 Open Decision + 정책 fact 뿐). 이 검사들은 전부 *기존 게이트 강화* 또는 *테스트 인프라*다.
- LLM 이 게이트를 **내리게** 만드는 자동화 금지 (resolve/confirm/accept 는 사람-전용).
- 전 게이트는 **warning-first** 로 출시 → FP 관찰 후 `--enforce`/fail 승격.

---

## 1. Lane 요약

### Lane A — Golden Test Harness (후보 5)
- **무엇**: dry-run 산출물(`actual-llm-after`)을 정답지(`expected-llm-after`)와 자동 대조하는 회귀 하니스. 지금까지 손으로(hash+grep) 하던 대조를 코드화한다.
- **왜**: 나머지 게이트(B·C)가 **각자의 회귀 테스트와 함께 출시**되게 만드는 인프라. *"만들기 전에 테스트 가능하게."* 제품 위험이 거의 0 이라 가장 먼저(또는 B 와 병행) 깐다.
- **씨앗 → 결과물(PR#4)**: untracked 초안 `example-compare.mjs`(stage=llm-after, E/R/F, FIXTURE 상수)를 **제자리 채택하는 대신 매니페스트 기반으로 일반화**해 `scripts/test-fixtures.mjs` + `scripts/lib/test-fixture.mjs` 로 신규 작성(PR#4 `feat/test-fixtures-harness`, 기존 파일 무수정). 초안 `example-compare.mjs` 는 **superseded — 삭제 대상**.
- **2층 구조**:
  - **L1 (PR#4 완료)**: `test-fixtures.mjs`(+`lib/test-fixture.mjs`) — 매니페스트 기반 러너. reconcile fixture(`llm-after`): E(파일 존재)·R(register N행 reconciled)·F(사람-전용 전이 부재) + integrity fixture(screen-spec 파싱 무결성·리포트 존재). 001=xfail(strict witness)·002=pass.
  - **L2 (확장)**: `buildState`/`computeReadiness` 를 예제 트리에 돌려 **커밋된 기계가독 기대값**과 대조하는 state/readiness/validate 회귀 + `npm test` 배선.
- **규모**: S–M. **사는 곳**: 별도 스크립트(킷-내부 전용). validate/readiness 와 섞지 않는다.
- **롤아웃 주의**: roadmap "다음 구현 후보"에 명시된 항목이 **아니다**(후보 ③의 선행 도구). 채택은 명시적으로.

### Lane B — Path Boundary Backstop (후보 3)
- **무엇**: hook 이 없는 환경(CI)에서 화면이 자기 `readiness_mode` 의 `forbidden_paths` 경계를 **넘은 변경**을 diff 로 사후에 잡는 그물. forward 게이트(readiness 다운그레이드 + pre-edit hook)의 2차 방어선.
- **왜**: `validate.mjs:12` 와 open-decisions "Validate 통합"이 명시적 후속으로 남긴 구멍. implement-screen-001 run 이 확인했듯 **validate 는 경로 경계를 강제하지 않는다** — 지금은 diff 로만 본다(수동). roadmap "다음 구현 후보 #2".
- **핵심 설계**(backstop 제안 v2 에서 동결):
  - 별도 스크립트 `forbidden-paths.mjs`. `computeReadiness({state,policy,ci:{},manifest})` (readiness.mjs:201) **import 소비** — 판정 로직 0.
  - guarded surface = **`src/api/**`, `openapi.yaml`, `openapi.yml`** (정책 파생 + .yml parity).
  - **diff-only**(트리 스캔 금지 — 오탐), **writes-only**(A/M + rename 새 경로), **project-level clearance**(화면 하나라도 `api-integrated-ui` 도달 → `src/api` 쓰기 통과; 의도된 false-negative).
- **규모**: M. **사는 곳**: 별도 스크립트, CI 호출. **롤아웃**: `--enforce` 없으면 경고만 exit 0; base ref 해석 실패는 fail-open 금지 → exit 2.

### Lane C — Input Pipeline Validation (후보 4 → 후보 6)
- **무엇**: reconcile 파이프라인 입구를 지키는 두 검사. **둘 다 `validate.mjs` 에 새 검사로 들어간다** — `_meta`/`artifact_type` walk 를 타지 않고 **명시 경로**로 읽는 별도 분기.
  - **후보 4 (검사 11)**: `inputs/*.md` frontmatter 검증. `input_id` 누락·중복·`supersedes` dangling·정본 required 필드 누락·deprecated alias 경고. (현재 `validate.mjs:104` `if (!hasFrontmatter || !data.artifact_type) continue` 때문에 입력 결과물은 통째로 스킵됨.)
  - **후보 6 (검사 12)**: `_meta/reconciliation-register.md` 검증. 미처리(`input_id` 있는데 register 행 없음)·`Reconcile Status=in-progress/failed`·register 중복 행 감지. (stale-conflict 등 conflict→decision 교차검사는 '오직 Reconcile Status' HARD RULE 과 충돌 → **검사 12 비대상, Conflicts 축 후속**. Lane C 구현도 동일하게 제외.)
- **왜**: `input_id` 한 키에 멱등성·역추적·supersede·미처리 감지가 전부 걸려 있는데 지금 아무도 안 본다. 후보 6 은 후보 4(입력 검증) **위에 쌓인다**.
- **정본 확정**: 후보 4 의 입력 스키마는 2026-06-13 commit 69e6baf 에서 fixture/template 기준 flat frontmatter 로 **확정**됨(`templates/input/input-artifact.template.md`). 설계 선행조건 없음 → 즉시 착수 가능.
- **규모**: 후보 4 = S, 후보 6 = M. **사는 곳**: `validate.mjs` (검사 11·12). **롤아웃 [#1=(b) 확정·PR#5]**: 미처리(register 행 없음)·`not-started` = **기본 경고, `--enforce` 로 에러 승격**. in-progress/failed/enum/중복/8컬럼누락·검사 11 은 항상 에러.
- **검사 번호 정합 (2026-06-14 · 필독)**: 근거 proposal 은 'validate 9종' 기준이나 현 코드는 이미 **10종** — 검사 10 = Copy Keys Status enum(validate.mjs:13, commit 6c374eb·6a7929f). **따라서 Lane C 의 새 검사는 검사 11(입력)·12(register) 다** — proposal 의 '검사 10/11' 표기를 그대로 쓰지 말 것. Lane C 워크트리(`feat/build-input-validation`)가 이미 10/11 로 번호를 매겼다면 11/12 로 교정 필요.
- **오탐 1순위 함정 (후보 6)**: `reconciled` 인데 자식 decision/conflict 가 open 인 입력을 "미처리"로 잡으면 안 됨. **오직 `Reconcile Status` 만 보고, 자식 open/closed 는 절대 미처리 신호로 쓰지 않는다.**

---

## 2. 파일 소유권 표

| 경로 | Lane A | Lane B | Lane C | 비고 |
|---|---|---|---|---|
| `frontend-workflow-kit/scripts/test-fixtures.mjs` | **CREATE** | — | — | PR#4. 매니페스트 기반 러너 (`node scripts/test-fixtures.mjs [--json]`, exit 0/1/2) |
| `frontend-workflow-kit/scripts/lib/test-fixture.mjs` | **CREATE** | — | — | PR#4. 공유 검사 lib(E/R/F + integrity; `lib/spec.mjs`·`lib/util.mjs` 재사용) |
| `frontend-workflow-kit/scripts/example-compare.mjs` | ~~CREATE/ADOPT~~ **superseded** | — | — | untracked 초안 → test-fixtures.mjs 로 일반화됨. **삭제 대상**(채택 안 함) |
| `temp/runs/reconcile-input-00{1,2}/run-metadata.json` | **CREATE** | — | — | PR#4. xfail/pass 선언 sidecar(001=xfail+expected_failures, 002=pass). 증거 dir 에 additive |
| `frontend-workflow-kit/scripts/forbidden-paths.mjs` | — | ✅MERGED(PR#7) | — | CLI. computeReadiness 소비·warning-first·fail-closed(exit 2) |
| `frontend-workflow-kit/scripts/lib/path-backstop.mjs` | — | ✅MERGED(PR#7) | — | 순수 helper: `globToRegex`·guarded surface/threshold 파생·clearance·diff 파싱. (보드 예상 `lib/glob.mjs` → 실제 `path-backstop.mjs` 로 통합) |
| `frontend-workflow-kit/scripts/lib/input-artifact.mjs` | — | — | **CREATE** | 신규(커밋됨, 4a32b59). 검사 11 순수 로직 `collectInputArtifacts`/`validateInputArtifacts` — validate.mjs 에서 분리 |
| `frontend-workflow-kit/scripts/lib/reconciliation-register.mjs` | — | — | **CREATE** | 신규(커밋됨, 4a32b59). 검사 12 순수 로직 + HARD RULE 주석(오직 Reconcile Status) |
| `frontend-workflow-kit/scripts/validate.mjs` | — | — | **MODIFY** | 검사 11·12 추가. **C 단독 소유** — A·B 는 안 건드림 |
| `frontend-workflow-kit/scripts/readiness.mjs` (`computeReadiness`) | — | CONSUME | — | import 소비. 판정 단일 출처 — 수정 금지(불변식 #1) |
| `frontend-workflow-kit/scripts/workflow-state.mjs` (`buildState`) | CONSUME | CONSUME | — | A=예제 트리 재현, B=state 선행 실행 |
| `frontend-workflow-kit/scripts/lib/spec.mjs` (`parseTable`/`loadScreenSpec`/`splitFrontmatter`) | CONSUME | — | CONSUME | 파싱 단일 출처. 어떤 lane 도 수정 안 함(후보 2 가 건드릴 자리지만 스코프 밖) |
| `frontend-workflow-kit/scripts/lib/util.mjs` | CONSUME | CONSUME | CONSUME | 공유 유틸. read-only |
| `frontend-workflow-kit/policies/implementation-mode-policy.yaml` | — | RO | RO | B=guarded surface 파생(정책 변경 아님). 정책 수정은 스코프 밖 |
| `frontend-workflow-kit/catalog/artifact-manifest.yaml` | RO | RO | RO/COORD | 검사 11·12 은 명시 경로 read 라 manifest 등록 불필요(머지 전 확인) |
| `frontend-workflow-kit/schemas/frontmatter.schema.json` | RO | — | **RO (수정 금지)** | 후보 4 는 입력 타입을 schema 에 **추가하지 않는다**(명시적 스코프 밖) |
| `frontend-workflow-kit/templates/input/input-artifact.template.md` | — | — | RO | 정본 스키마 출처. C 는 읽기만(재정의 금지) |
| `frontend-workflow-kit/examples/input-reconciliation/expected-llm-after/**` | **RO (정답지)** | — | RO | A 의 1:1 정답지. **절대 수정 금지**(FX-1 summary↔register 불일치도 손대지 않음) |
| `frontend-workflow-kit/examples/input-reconciliation/{project-before,expected-after}/**` | RO | — | RO | baseline / human-final 상한선 |
| `frontend-workflow-kit/examples/*/reports/expected-*.json` (기계가독 기대값) | **CREATE (L2)** | — | — | A-L2 가 예제별 커밋. 신규 파일 |
| `frontend-workflow-kit/examples/path-backstop/**` | — | **CREATE** | — | B 의 fixture (`--diff` 입력 케이스 a–d) |
| `frontend-workflow-kit/examples/input-validation/inputs/**` | — | — | **CREATE** | 후보 4 fixture (케이스 a–e) |
| `frontend-workflow-kit/examples/reconciliation-validation/**` | — | — | **CREATE** | 후보 6 fixture (케이스 a–e, 특히 d=reconciled+자식 open=pass) |
| `frontend-workflow-kit/examples/coupon-feature/**`, `examples/multi-screen-dry-run/**` | RO (L2 코퍼스) | RO | RO | 기존 골든 — A-L2 가 회귀 코퍼스로 재사용(읽기) |
| `temp/runs/reconcile-input-00{1,2}/**` | RO (증거) | — | RO | A 의 데모 입력(001→FAIL, 002→PASS) |
| `temp/runs/implement-screen-001/**` | — | RO (증거) | — | B 의 경로-경계 근거 |
| `temp/evaluations/**`, `temp/proposals/**` | RO | RO | RO | 스펙/채점표 |
| `package.json` / `package-scripts.template.json` | **COORD** | **COORD** | (검사 추가만, 명령 불변) | ✅PR-WIRE(PR#8 MERGED): A=`example:test`(킷-내부 — 미러 **제외**), B=`workflow:forbidden-paths`(소비자-대면 — 미러 **포함**) |
| `.github/workflows/frontend-workflow-kit.yml` | **COORD** | **COORD** | — | ✅PR-WIRE(PR#8 MERGED): test-fixtures warning step(`continue-on-error`). forbidden-paths 회귀는 test-fixtures(`kind:path-backstop`)로 흡수 — ✅PR#12, `example:test` 가 커버 |

> **충돌 핵심 요약**: `validate.mjs` 는 **Lane C 단독**, A·B 는 각자 *별도 스크립트*라 코드 충돌이 구조적으로 없다. 실질 머지 위험은 **`package.json`/`package-scripts.template.json` 과 CI yml** 두 COORD 지점뿐(A·B 가 npm alias·CI step 을 더함) → §7 머지 체크리스트에서 직렬화.

---

## 3. 의존성 그래프

```txt
                ┌─────────────────────────────────────────────┐
                │  Lane A  (후보 5, Phase 0 인프라)            │
                │  test-fixtures.mjs + lib/test-fixture.mjs    │
                │  L1: reconcile fixture 대조  →  L2: state/   │
                │      readiness/validate 회귀 + npm test      │
                └───────────────┬─────────────────────────────┘
                                │ (soft) 회귀 가드 제공
                                │  "각 게이트를 자기 테스트와 함께 출시"
            ┌───────────────────┴───────────────────┐
            ▼                                         ▼
┌───────────────────────────┐         ┌───────────────────────────────────┐
│  Lane B  (후보 3)          │         │  Lane C  (후보 4 → 후보 6)         │
│  forbidden-paths.mjs       │         │                                   │
│  + lib/glob.mjs            │         │   후보 4 (검사 11)                 │
│  CONSUME computeReadiness  │         │   inputs/ frontmatter 검증         │
│  (독립 — 신규 dep 0)       │         │        │ (hard) input_id 검증이    │
└───────────────────────────┘         │        ▼       register 교차의 전제 │
   B 는 A·C 와 완전 독립               │   후보 6 (검사 12)                 │
   (computeReadiness 는 이미 존재)     │   register 검증 (자식 open 무시)   │
                                       │   둘 다 validate.mjs MODIFY (직렬) │
                                       └───────────────────────────────────┘

의존성 종류
  A → B,C   SOFT  : A 가 없어도 B·C 착수 가능. 단 A 가 먼저면 B·C 가 회귀 테스트와 함께 머지된다(권장).
  후보4 → 후보6 HARD : input_id 가 검증된 뒤라야 `input_id ↔ register` 교차참조가 의미. Lane C 내부 직렬.
  B ⟂ A, B ⟂ C  : 코드 충돌 없음(별도 스크립트). 완전 병렬 가능.
  COORD 머지순서 : package.json / CI yml 편집은 lane 무관하게 직렬 머지(§7).
```

핵심:
- **Lane A·B 는 동시 착수 가능.** Lane C 는 내부적으로 후보 4 → 후보 6 직렬.
- **Lane C 의 두 작업은 같은 `validate.mjs` 를 MODIFY** → 같은 lane 안에서 순차(검사 11 머지 후 검사 12). 다른 PR 이 동시에 validate.mjs 를 건드리지 않으므로 cross-lane rebase 없음.
- Lane B 가 `computeReadiness` 시그니처에 의존 → readiness.mjs 가 그 사이 바뀌지 않는다(어떤 lane 도 수정 안 함)는 게 전제.

---

## 4. PR 순서

추천 도입 순서 **5 → 3 → 4 → 6** 을 PR 로 편다. A·B 는 병렬 가능하되, A 를 먼저(또는 병행) 두어 회귀 가드를 깐다.

| 순서 | PR | Lane | 내용 | 선행 의존 | 병렬 가능? |
|---|---|---|---|---|---|
| 1 | **PR-A1** ✅MERGED(PR#4) | A | `test-fixtures.mjs` + `lib/test-fixture.mjs` 매니페스트 러너 — L1 reconcile E/R/F + integrity, 002=pass·001=xfail(strict). 초안 `example-compare.mjs` superseded | 없음 | B1 과 병렬 |
| 2 | **PR-B1** ✅MERGED(PR#7) | B | `forbidden-paths.mjs` + `lib/path-backstop.mjs` + `examples/path-backstop/` fixture(10종), warning-first·fail-closed | 없음(`computeReadiness` 기존) | — |
| 3+4 | **PR-C1+C2** ✅MERGED(PR#5) | C | `validate.mjs` 검사 11(입력)+12(register) + `examples/input-validation/`·`reconciliation-validation/` fixture. **실제로는 PR#5 에서 11·12 함께 출시**(C1/C2 분리 안 함) + #1=(b) 미처리 warning-first·`--enforce` | 없음(정본 확정) | — |
| 5 | **PR-A2** | A | L2 — 기계가독 기대값 커밋 + state/readiness/validate 회귀 + `npm test` 배선 | PR-A1 | — |
| 6 | **PR-WIRE** ✅ **MERGED (PR#8)** | A·B | `example:test`(test-fixtures)+`workflow:forbidden-paths` npm alias + CI test-fixtures warning step(`continue-on-error`). **forbidden-paths 회귀는 test-fixtures 흡수 ✅PR#12**(`kind:path-backstop` 13케이스 — `example:test` 커버) | A1·B1 | main `16bf472` · 검증 green · ✅머지됨 |

> **COORD 머지 규칙**: PR-A1·PR-B1 이 각자 `package.json`/CI yml 에 줄을 더하면 머지 충돌이 난다. 권장: 각 lane PR 은 **스크립트+fixture 만** 담고, npm alias·CI step 은 **PR-WIRE 하나로 모아** 마지막에 직렬 머지(또는 먼저 머지된 쪽 기준으로 rebase). `--enforce`/fail 승격은 그 다음 별도 PR.

대안 분기: 사용자-대면 게이트를 먼저 보고 싶으면 **PR-B1 을 1번으로** 올리고 PR-A1 을 병행. reconcile 파이프라인이 최우선이면 **PR-C1→C2 를 B1 보다 앞으로**(단 A1 은 여전히 먼저 깔기를 권장).

---

## 5. Do-not-edit 리스트 (lane 별)

### Lane A 가 건드리면 안 되는 것
- `validate.mjs`, `readiness.mjs`, `forbidden-paths.mjs`(B), `lib/spec.mjs`, `lib/util.mjs` — **소비만**. 자체 md 파서 작성 금지(파싱은 `lib/spec.mjs`).
- `examples/input-reconciliation/expected-llm-after/**` — **정답지. 1바이트도 수정 금지.** 하니스를 정답지에 맞추는 게 아니라 정답지로 actual 을 채점한다.
- 알려진 fixture 결함(rubric **FX-1**: summary↔register Acceptance 귀속 불일치)을 **여기서 고치지 않는다** — register 가 canonical, 수정은 별도 사람 작업.
- 새 readiness 게이트화 금지(Unknown/Conflict/gap 을 게이트로 승격 X). 이건 fixture 출력 대조기일 뿐.
- `package.json`/CI yml 단독 편집 자제 → PR-WIRE 로 모음.

### Lane B 가 건드리면 안 되는 것
- `validate.mjs` — **Lane C 영역.** backstop 은 별도 스크립트(validate 는 트리 전용·git 없음 유지).
- `readiness.mjs` / `computeReadiness` — **import 소비만**(불변식 #1: 판정 단일 출처). 시그니처 `{state,policy,ci,manifest}` 그대로 사용.
- `implementation-mode-policy.yaml` — **정책 수정 금지.** guarded surface 는 정책에서 *파생*하는 것이지 새 경계를 *추가*하는 게 아니다.
- `lib/util.mjs` 에 `globToRegex` 넣지 말 것 → 신규 `lib/path-backstop.mjs`(공유 파일 충돌 회피 — globToRegex 가 거기 들어감).
- 스코프 밖 금지: **화면별 attribution**(project-level clearance 만), **삭제(D)/rename 옛 경로**, **rough→final 같은-경로 품질 승격**(forward 게이트 담당), **기본 `--enforce`**(warning-first 로 시작).

### Lane C 가 건드리면 안 되는 것
- `forbidden-paths.mjs`(B), `test-fixtures.mjs`/`lib/test-fixture.mjs`(A), `readiness.mjs` — 타 lane/소비 영역.
- `schemas/frontmatter.schema.json` — **입력 타입 추가 금지**(명시적 스코프 밖). 검사 11 은 코드 내 최소 규칙 또는 명시 경로 분기로 시작.
- `templates/input/input-artifact.template.md` — **정본. 읽기만**(재정의·수정 금지).
- `expected-llm-after/**` 의 `reconciliation-register.md` 등 정답지 — 수정 금지(FX-1 포함).
- 새 readiness 게이트화 금지: **register·inputs 를 readiness 게이트로 만들지 않는다**(게이트는 Open Decision + 정책 fact 뿐).
- **후보 6 절대 규칙**: 미처리 판정에 **자식 decision/conflict 의 open/closed 를 쓰지 않는다.** 오직 `Reconcile Status`(in-progress/failed/누락)만 본다. `status`(입력 상태)와 `Reconcile Status`(register)를 교차검사하지 않는다(별개 라이프사이클).

---

## 6. 수용 기준 (lane 별)

### Lane A — Golden Test Harness
- [ ] `node scripts/test-fixtures.mjs [--json]` (매니페스트 기반, 플래그 없이 전 fixture 실행) → 모두 기대대로면 **exit 0**.
- [ ] **002=pass**(reconcile-input-002, expect=pass·실패 시 치명). **001=xfail**(reconcile-input-001 — `expected_failures` 로 U-001 닫음+U-002 신설을 고정; **올바른 이유로 실패할 때만** 비치명). xpass(001 통과)·xdrift(다른 이유 실패)·pass-fixture 실패 = **exit 1**, 깨진 run-metadata = exit 2.
- [ ] reconcile 검사: **E**(expected 산출물 전부 actual 에 존재; 내용 비교는 **비게이트**) · **R**(register 5입력 전부 `Reconcile Status=reconciled`) · **F**(D-001/D-003/D-204·C-001·U-001 = **open 유지**, G-001≠accepted, U-002 미존재, COUPON-001 status≠confirmed). integrity 검사: screen-spec 파싱 무결성 + 선언 리포트 존재.
- [ ] md 파싱은 전부 `lib/spec.mjs`(`parseTable`/`loadScreenSpec`/`splitFrontmatter`) 경유 — 자체 파서 0.
- [ ] `readiness.mjs` 미변경(판정 로직 0), 새 readiness 게이트 0. `--json` 출력 지원.
- [ ] (L2, PR-A2 — **PR#4 범위 밖**) 최소 1개 예제에 기계가독 기대값(`expected-readiness.json` 또는 `_meta` 스냅샷) 커밋 + state/readiness/validate **출력 재현** 대조(`generated_at`·CRLF 정규화). PR#4 의 integrity 는 파싱 무결성+리포트 존재까지의 보수적 슬라이스.

### Lane B — Path Boundary Backstop
- [ ] `forbidden-paths.mjs` 가 `computeReadiness({state,policy,ci:{},manifest})` 를 import 소비 — 판정 로직 신규 0.
- [ ] guarded surface = `src/api/**`, `openapi.yaml`, `openapi.yml` (정책 파생). `src/lib`·`src/components/ui` 등 공유코드는 침묵.
- [ ] **writes-only**: A/M + rename 새 경로만. 삭제(D)·rename 옛 경로는 비대상. `git diff --name-status -M -z` 파싱.
- [ ] **project-level clearance**: 화면 하나라도 `api-integrated-ui` 이상 → `src/api/**` 쓰기 전부 통과(§1 의도된 FN). 전 화면 미달 + `src/api` 쓰기 → 위반. `openapi.yaml/yml` 은 허용 모드 없어 변경 시 항상 플래그.
- [ ] `--diff <file>` 로 **git 없이** 테스트 가능. fixture `examples/path-backstop/` 케이스: (a) 전 화면 < api-integrated-ui 인데 src/api 변경=위반, (b) 모드 내 편집=pass, (c) 한 도메인만 위반=부분 fail, **(d) rough→final 같은-경로 편집=pass(회귀 가드)**.
- [ ] **warning-first**: 기본 exit 0(경고만), `--enforce` 시 위반 exit 1, base ref 해석/ git 실패 시 **exit 2**(조용한 통과 금지).
- [ ] 신규 `globToRegex` 가 `**`(/포함)·`*`(/제외) 처리 + posix 정규화. `manifestPathRegex` 재사용 아님.

### Lane C — Input Pipeline Validation
**후보 4 (검사 11)**
- [ ] `inputs/*.md` 를 **명시 경로**로 읽음 — `artifact_type` walk(`validate.mjs:104`)를 타지 않는 별도 분기.
- [ ] 정본 required 9필드(`input_id`·`input_type`·`source_type`·`source_ref`·`captured_at`·`captured_by`·`status`·`affected_domains`·`affected_screens`) 존재 검사.
- [ ] `input_id` 패턴 + **전역 중복** + `supersedes` **dangling** 검사. `confidence` 는 optional(enum 검사만, 누락=warning/pass). deprecated alias(`suggested_scope`, frontmatter `summary`)=**경고**(error 아님).
- [ ] fixture `examples/input-validation/inputs/` 케이스: (a) 9필드 충족=pass, (b) input_id 누락=fail, (c) 두 파일 중복=fail, (d) supersedes dangling=fail, (e) required+optional 생략=pass / required 누락=fail.
- [ ] `status`(입력 상태)를 register `Reconcile Status` 와 교차검사하지 않음. `frontmatter.schema.json` 미변경.

**후보 6 (검사 12)** — *PR-C1(검사 11) 머지 후*
- [ ] `_meta/reconciliation-register.md` 를 **명시 경로**로 읽음(8컬럼 표, `parseTable` 재사용). 미처리(`input_id` 있는데 register 행 없음)·`Reconcile Status=in-progress/failed` 검출.
- [ ] **자식 open/closed 를 미처리 신호로 쓰지 않는다** — 오직 `Reconcile Status`. fixture `examples/reconciliation-validation/` **케이스 (d) reconciled + 자식 decision open = 반드시 pass**(오탐 가드).
- [ ] 케이스: (a) 전부 reconciled=pass, (b) input_id 인데 register 행 없음=fail, (c) in-progress=fail, (d) reconciled+자식 open=**반드시 pass**, (e) enum 위반·failed·register 중복행=fail. *(stale-conflict[open C-001 → resolved D] 는 conflict→decision 교차라 '오직 Reconcile Status' HARD RULE 밖 → 검사 12 비대상, Conflicts 축 후속.)*
- [ ] register·inputs 를 readiness 게이트로 승격하지 않음. validate 는 exit 0/1 CI 게이트 유지.

---

## 7. 머지 체크리스트

**모든 PR 공통 (머지 전)**
- [ ] `npm run example:state && example:readiness && example:validate` (coupon-feature) **녹색**.
- [ ] `multi-screen-dry-run` readiness 출력이 `reports/expected-readiness.md §1` 과 글자 일치(게이트 회귀 없음).
- [ ] 기존 **validate 검사 10종**(검사 10 = Copy Keys Status enum)이 골든 예제에서 통과(특히 Lane C 의 validate.mjs MODIFY 후).
- [ ] 자기 lane fixture 가 의도대로 pass/fail (수용 기준 §6 의 케이스 표).
- [ ] `git diff --name-only` 가 **자기 lane 소유 파일만** 포함(§2 표) — 타 lane/CONSUME/RO 파일 무변경.

**Lane 교차 (충돌 방지)**
- [ ] `validate.mjs` 는 **PR-C1 → PR-C2 순서로만** 수정됨(다른 PR 이 동시에 안 건드림).
- [ ] Lane B 의 `computeReadiness` 호출이 `readiness.mjs:201` 시그니처(`{state,policy,ci,manifest}`)와 일치. `ci:{}` 로 호출(경로 게이트는 CI fact 불필요).
- [ ] `lib/spec.mjs`·`lib/util.mjs`·`readiness.mjs`·`policy yaml`·`schema.json`·`expected-llm-after/**` 가 **어느 PR 에서도 미변경**(CONSUME/RO 불변식).
- [ ] **COORD 직렬화**: `package.json`/`package-scripts.template.json` 과 CI yml 편집은 PR-WIRE 하나로 모으거나, 먼저 머지된 쪽 기준 rebase 후 재머지. npm alias 이름 충돌 없음(`example:compare` / `forbidden-paths`(또는 `path-backstop`) / `validate` 불변) 확인.
- [ ] `artifact-manifest.yaml` 등록이 검사 11·12 에 필요한지 확인(명시-경로 read 면 불필요 — 불필요로 확정되면 manifest 무변경).

**불변식 게이트 (전 PR 통과 필수)**
- [ ] 판정 단일 출처: `readiness.mjs` 외에 모드 판정 로직 없음.
- [ ] 파싱 단일 출처: 자체 md 파서 없음(전부 `lib/spec.mjs`).
- [ ] 새 readiness 게이트 0 (Unknown/Conflict/register/inputs/interaction-matrix 를 게이트로 승격 안 함).
- [ ] 사람-전용 닫기/승격(resolve/confirm/accept) 자동화 없음.
- [ ] 전 게이트 **warning-first** (기본 비차단). `--enforce`/fail 승격은 별도 PR.

**결정 완료**
- [x] **검사 12 롤아웃 강도 → (b) 확정 (PR#5 `b1879c9`)**: 미처리(register 행 없음)·`not-started` = **기본 경고**, `validate.mjs --enforce` 로 에러 승격. in-progress/failed/enum/중복/8컬럼누락·검사 11 은 항상 에러. `unreconciled` fixture 로 실측 검증(기본 exit0·경고2 / `--enforce` exit1·에러2), `fail`=exit1·`pass`=exit0 회귀 무. Lane B backstop warning-first 와 정합.

**전 lane 머지 후 (통합 회귀)**
- [ ] Lane A 하니스 재실행: `reconcile-input-001`=FAIL / `reconcile-input-002`=PASS 가 그대로 재현(회귀 가드 무결).
- [ ] `temp/` 는 **repo-root** 에만(runs 는 증거물). PR#4 준수(`KIT_ROOT/../temp/runs`) — 단 **Lane C 가 `frontend-workflow-kit/temp/` 에 둔 run report 는 repo-root 로 이동** 필요. superseded `example-compare.mjs` 초안 삭제.
- [ ] CI 는 warning-only 로 먼저 관찰 → FP 율 확인 후 `--enforce` 승격 PR.

---

## 부록 — Lane↔근거 매핑 (추적성)

```txt
Lane A  후보 5  : mvp-b-validation-candidates §후보5 + example-compare-harness-proposal.md
                  결과물(PR#4) scripts/test-fixtures.mjs + scripts/lib/test-fixture.mjs (초안 example-compare.mjs 일반화·superseded)
                  데모 입력 temp/runs/reconcile-input-001(xfail)·002(pass) + run-metadata.json
                  정답지 examples/input-reconciliation/expected-llm-after, 채점표 reconcile-input-rubric.md
Lane B  후보 3  : mvp-b-validation-candidates §후보3 + diff-based-forbidden-paths-backstop.md (v2)
                  근거 run temp/runs/implement-screen-001 (validate 가 경로 경계 안 잡음 확인)
                  소비 readiness.mjs:201 computeReadiness, 정책 implementation-mode-policy.yaml
Lane C  후보4→6 : mvp-b-validation-candidates §후보4·§후보6
                  정본 templates/input/input-artifact.template.md (commit 69e6baf)
                  현 구멍 validate.mjs:104 (artifact_type 없는 inputs 스킵)
                  register 계약 input-reconciliation.md MVP Placement, 채점표 reconcile-input-rubric.md §4.1
```
