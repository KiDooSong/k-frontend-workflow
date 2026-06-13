# Run Report — build-input-validation (검사 11·12)

- **Date**: 2026-06-14
- **Branch**: `feat/build-input-validation`
- **Work packet**: `build-input-validation`
- **Scope**: MVP-B validation candidates 4(입력 frontmatter) + 6(reconciliation-register)

---

## 1. 무엇을 만들었나

`validate.mjs` 에 두 개의 검사를 추가했다.

- **검사 11 — 입력 결과물(inputs/\*.md) frontmatter 검증** (candidate 4)
  정본 입력 스키마(`input-reconciliation.md` Input Result Contract + `templates/input/input-artifact.template.md`)에 따라 required 9필드·`input_id` 형식/전역중복·`supersedes` 해소·enum 을 검사한다. `inputs/` 디렉토리가 없으면 NO-OP.
- **검사 12 — Reconciliation Register(\_meta/reconciliation-register.md) 검증** (candidate 6)
  `Reconcile Status` enum·`in-progress`/`failed` 차단·register 내 중복 행·`inputs/`↔register 미처리 교차검사. register 파일이 없으면 NO-OP(초기/선택적 도입).

### 번호 정합 노트 (중요)

제안서(`temp/proposals/mvp-b-validation-candidates.md`)는 검사가 9종이던 시점에 작성되어 **"Check 10"=입력 / "Check 11"=register** 라고 적었다. 그 사이 **Copy Keys Status 검사가 10번으로 먼저 안착**했으므로(`validate.mjs` 현재 1..10 보유), 이번 추가분은 한 칸씩 밀어:

- **입력 결과물 검증 = 검사 11**
- **reconciliation-register 검증 = 검사 12**

기존 어떤 검사도 재번호하지 않았다(특히 Copy Keys=10 그대로).

---

## 2. 추가/변경 파일

| 파일 | 구분 | 내용 |
|---|---|---|
| `scripts/validate.mjs` | 변경 | 검사 11·12 wiring(import, collect-once, add/warn 매핑), 헤더 주석에 11·12 문서화, 성공 메시지 `검사 12종 통과` 로 변경 |
| `scripts/lib/input-artifact.mjs` | 신규 | 검사 11 순수 로직(`collectInputArtifacts`/`validateInputArtifacts`/`loadInputArtifact`) |
| `scripts/lib/reconciliation-register.mjs` | 신규 | 검사 12 순수 로직(`parseReconciliationRegister`/`validateReconciliationRegister`) + HARD RULES 주석 |
| `examples/input-validation/**` | 신규 | 검사 11 픽스처(pass / warn / fail) |
| `examples/reconciliation-validation/**` | 신규 | 검사 12 픽스처(pass / fail) |
| `temp/runs/input-validation-001.md` | 신규 | 본 리포트 |

> lib 모듈은 순수다 — `{ errors:[{file,message}], warnings:[{file,message}] }`(file 은 절대경로)를 반환하고 `validate.mjs` 가 기존 `add()`/`warn()` 으로 상대화한다. `splitFrontmatter`/`walkFiles`/`isDir`/`exists`(util.mjs)와 `parseTable`(spec.mjs)을 재사용했다(중복 구현 없음). yaml 단일 의존성 외 신규 의존성 없음.

---

## 3. 설계 결정

- **alias-resolves-with-warning**: `affected_domains`/`affected_screens` 는 canonical 또는 deprecated `suggested_scope.domains`/`.screens` 중 하나라도 비어있지 않으면 충족. alias 로만 충족되면 required-누락 **에러를 내지 않고** deprecated **경고**만 낸다. 둘 다 없을 때만 누락 에러.
- **not-started 는 게이트가 아님**: `Reconcile Status=not-started` 는 **경고**(아직 시작 전). 반면 `in-progress`(이전 실행 중단)·`failed`(실패)는 **에러**. enum 위반도 에러이며 그 행의 후속 status 검사는 생략.
- **register 없으면 검사 12 = NO-OP**: register 파일이 없으면 `inputs/` 에 파일이 있어도 검사하지 않는다(초기/선택적 도입 — `input-reconciliation.md` "초기에는 hard fail 이 아니라").
- **Created Items 는 링크만 (HARD RULE)**: register 의 `(open)`/`(reopened → open)` 주석을 **절대 파싱하지 않는다**. 자식 open/closed 의 단일 출처는 Open Decisions/Conflicts/Unknowns 이지 register 가 아니다.
- **reconciled + 자식 open = 정상 PASS (HARD RULE)**: `reconciled` 행은 Created Items/자식 상태와 무관하게 통과한다. 세 축(입력 status / Reconcile Status / 자식 open|closed)은 독립이며 검사 12 를 움직이는 것은 **Reconcile Status 뿐**.
- **수집은 한 번**: `validate.mjs` 가 `inputs/` 를 한 번만 `collectInputArtifacts` 하고, 그 결과를 검사 11(frontmatter)과 검사 12(미처리 교차검사) 양쪽에 넘긴다.
- **메시지/주석은 한국어** 로 기존 `validate.mjs` 보이스(및 `→ 해소:` 힌트 규약)에 맞췄다.
- **금지 영역 무변경**: `package.json`(npm 스크립트 추가 안 함)·`readiness.mjs`·`workflow-state.mjs`·`forbidden-paths.mjs`·`frontmatter.schema.json`·expected-after/expected-llm-after 트리 일절 건드리지 않음.

---

## 4. 증거 (실측 검증)

`depsOk=true` (node_modules/yaml 이미 존재 — 설치 불필요).

| # | tree | exit | expected | pass |
|---|---|---|---|---|
| 1 | `input-validation/pass` | 0 | 0 | ✅ |
| 2 | `input-validation/warn` | 0 | 0 | ✅ |
| 3 | `input-validation/fail` | 1 | 1 | ✅ |
| 4 | `reconciliation-validation/pass` | 0 | 0 | ✅ |
| 5 | `reconciliation-validation/fail` | 1 | 1 | ✅ |
| 6 | `coupon-feature` baseline (정규 호출, `--root` 없음) | 0 | 0 | ✅ (검사 12종 통과, 회귀 없음) |
| 6b | `coupon-feature` baseline (**`--root` 부가 시**) | 1 | 0 | ⚠️ 검사 11/12 무관 사전결함(검사 3 × `--root`) — §5 |

**판정**: 검사 11/12 구현 검증 완료 — 의도한 모든 에러/경고가 발화하고, reconciled+자식-open 케이스가 통과하며, 어디에서도 Created Items/자식 open 을 참조하지 않는다. 정규 베이스라인(RUN 6, `--root` 없음)은 exit 0 으로 **회귀 없음**. `--root` 를 부가한 변형(6b)만 exit 1 인데, 이는 검사 11/12 와 무관한 **사전결함**(검사 3 source-link 경로해석 × `--root` 상호작용)이다 — §5.

### 4.1 RUN 1 — input-validation/pass (exit 0)

```
workflow:validate — OK (검사 12종 통과)
```

### 4.2 RUN 2 — input-validation/warn (exit 0, 검사 11 경고 2건)

```
workflow:validate — OK (검사 12종 통과)
  [경고 11] examples\input-validation\warn\docs\frontend-workflow\inputs\IN-20260614-planning-002.md: deprecated 'suggested_scope' 사용 → affected_domains/affected_screens 로 이전
  [경고 11] examples\input-validation\warn\docs\frontend-workflow\inputs\IN-20260614-planning-002.md: deprecated frontmatter 'summary' 사용 → body 의 ## Summary 가 정본
```

> alias-resolves 규칙 확인: `suggested_scope` 로만 scope 가 충족된 입력이 **required-누락 에러 없이** 통과하고 deprecated 경고만 발화 → exit 0.

### 4.3 RUN 3 — input-validation/fail (exit 1, 검사 11 에러 7건 + 경고 1건)

```
workflow:validate — 7 건 위반
  [검사 11] ...\inputs\IN-20260614-api-001.md: input_id 중복: 'IN-20260614-api-001' (2건) — input_id 는 전역 유일
  [검사 11] ...\inputs\IN-20260614-meeting-002.md: supersedes 대상 'IN-20260614-meeting-999' 가 존재하지 않음
  [검사 11] ...\inputs\IN-20260614-qa-001.md: 필수 frontmatter 누락: source_type (정본 입력 스키마)
  [검사 11] ...\inputs\IN-20260614-qa-001.md: 필수 frontmatter 누락: captured_by (정본 입력 스키마)
  [검사 11] ...\inputs\api-001-dup.md: input_id 중복: 'IN-20260614-api-001' (2건) — input_id 는 전역 유일
  [검사 11] ...\inputs\draft-coupon.md: input_id 형식 위반: 'draft-coupon' (기대 IN-{YYYYMMDD}-{source}-{NNN})
  [검사 11] ...\inputs\no-input-id.md: 필수 frontmatter 누락: input_id (정본 입력 스키마)
  [경고 11] ...\inputs\api-001-dup.md: 파일명이 input_id 와 다름: 'api-001-dup' ≠ 'IN-20260614-api-001' (규약 {input_id}.md)
```

> 모든 검사 11 에러 경로 커버: `input_id` 중복(중복 **양쪽 파일** 모두에 발화), `supersedes` dangling, required 누락(source_type·captured_by), `input_id` 형식 위반, `input_id` 자체 누락. 추가로 파일명≠input_id 경고.

### 4.4 RUN 4 — reconciliation-validation/pass (exit 0, **비공허**)

```
workflow:validate — OK (검사 12종 통과)
```

> **HEADLINE GUARD**: 이 통과는 공허하지 않다. register 행 `IN-20260614-meeting-001` 은
> `Reconcile Status=reconciled` 이면서 `Created Items = "C-001 (open), D-204 (reopened → open)"`,
> 즉 **자식이 open 인 reconciled 행** 인데 정상 통과했다. HARD RULE(reconciled+자식-open=PASS) 성립.

### 4.5 RUN 5 — reconciliation-validation/fail (exit 1, 검사 12 에러 5건 + 경고 1건)

```
workflow:validate — 5 건 위반
  [검사 12] ...\_meta\reconciliation-register.md: IN-20260614-figma-001: Reconcile Status=in-progress (이전 실행 중단) — 이어서 reconcile 하세요
  [검사 12] ...\_meta\reconciliation-register.md: register Input ID 중복: 'IN-20260614-qa-001' (2행) — 입력당 canonical 행 1개
  [검사 12] ...\_meta\reconciliation-register.md: Reconcile Status enum 위반: 'in-review' (기대 not-started|in-progress|reconciled|failed) — Input IN-20260614-meeting-001
  [검사 12] ...\_meta\reconciliation-register.md: IN-20260614-user-note-001: Reconcile Status=failed (reconcile 실패)
  [검사 12] ...\inputs\IN-20260614-api-001.md: inputs/ 에 있으나 register 에 행 없음: 'IN-20260614-api-001' (미처리) — reconcile-input 먼저 실행
  [경고 12] ...\_meta\reconciliation-register.md: IN-20260614-planning-002: Reconcile Status=not-started (아직 reconcile 시작 전)
```

> 모든 검사 12 에러 경로 커버: `in-progress`·`failed`·enum 위반(`in-review`)·중복 Input ID(`IN-20260614-qa-001` 2행)·미처리(register 에 행 없는 입력 — **에러는 INPUT 파일** `IN-20260614-api-001.md` 에 발화). 추가로 `not-started` 경고.

### 4.6 CRUCIAL GUARD — Created Items/자식 참조 0건

5개 검사 11/12 출력 전체를 `"Created Items"`, `"(open)"`, `"child"`, `"자식"`, `"하위"` 로 grep 한 결과 **매치 0건**. 어떤 에러/경고도 Created Items 나 자식 open/closed 를 참조하지 않는다. 검사 12 를 움직이는 것은 오직 `Reconcile Status` — 명세 그대로.

---

## 5. 참고 — 사전결함: 검사 3 × `--root` 경로해석 (이번 범위 밖)

정규 베이스라인은 `--root` 없이 도는 게 정상(CI/`package.json` 의 `example:validate` 도 `--root` 미사용)이라 exit 0 이다. 다만 `--root`=kit-root 를 **부가**하면(RUN 6b) exit 1 로 검사 3 에러 1건이 난다:

```
workflow:validate — 1 건 위반
  [검사 3] ...\coupon-list\screen-spec.md: sources 링크 파일 부재: docs/raw/wireframes/coupon-list.md → 해소: ...
```

이는 검사 11/12 이슈도, 실제 파일 부재도 아니다.

1. 파일은 디스크와 git HEAD(`examples/coupon-feature/docs/raw/wireframes/coupon-list.md`)에 **존재**한다.
2. **근본원인**: 검사 3 은 source ref 를 `path.resolve(projectRoot, ref)` 로 푼다(`validate.mjs:160`). `projectRoot = flags.root ? resolve(flags.root) : dirname(srcDir)`(`validate.mjs:94`). 픽스처 ref `docs/raw/wireframes/coupon-list.md` 는 **doc-tree 상대**다. `--root` 없으면 `projectRoot=.../examples/coupon-feature` 라 정상 해석되어 통과(exit 0, `검사 12종 통과`). `--root`=kit-root 면 `.../frontend-workflow-kit/docs/raw/...` 로 풀려 없는 경로 → 거짓 "부재".
3. **사전결함 입증**: HEAD 의 pristine `validate.mjs`(검사 11/12 없음)에 RUN 6 의 정확히 같은 명령을 돌려도 **동일한 exit-1 검사 3 에러** 가 나온다. HEAD 도 이미 `path.resolve(projectRoot, ref)` 를 가지고 있었다.

**RUN 6 을 녹색으로 만들려면**(이번 변경 범위 밖): 베이스라인을 `--root` **없이** 실행하거나, 검사 3 이 doc-relative source 를 docsDir 기준으로 풀게 하거나, 픽스처 ref 를 kit-root 상대(`examples/coupon-feature/docs/raw/wireframes/coupon-list.md`)로 바꾼다. verify-only 지침에 따라 코드/픽스처는 수정하지 않았다.

---

## 6. 실행 방법 (copy-paste)

> Windows / forward-slash 절대경로. `--root` 는 kit 루트.

```bash
# 검사 11 — 입력 결과물 frontmatter
node "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit/scripts/validate.mjs" --docs "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit/examples/input-validation/pass/docs/frontend-workflow" --root "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit"
node "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit/scripts/validate.mjs" --docs "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit/examples/input-validation/warn/docs/frontend-workflow" --root "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit"
node "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit/scripts/validate.mjs" --docs "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit/examples/input-validation/fail/docs/frontend-workflow" --root "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit"

# 검사 12 — Reconciliation Register
node "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit/scripts/validate.mjs" --docs "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit/examples/reconciliation-validation/pass/docs/frontend-workflow" --root "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit"
node "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit/scripts/validate.mjs" --docs "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit/examples/reconciliation-validation/fail/docs/frontend-workflow" --root "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit"

# baseline regression (검사 3 사전결함 확인용 — WITHOUT --root 면 exit 0)
node "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit/scripts/validate.mjs" --docs "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit/examples/coupon-feature/docs/frontend-workflow" --src "C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit/examples/coupon-feature/src"
```

---

## 7. work-packet "Do not" 준수

- **Unknown 을 게이트로 쓰지 않음** — 검사 12 는 Unknown 을 보지 않는다.
- **Conflict 를 게이트로 쓰지 않음** — 검사 12 는 Conflict 를 보지 않는다.
- **자식-open 을 미처리로 취급하지 않음** — reconciled+자식-open 은 정상 PASS(RUN 4 로 입증).
- **어떤 decision 도 닫지 않음** — register 검사는 읽기 전용, 자식 상태를 건드리지 않는다.
- **입력 픽스처 semantics 무수정** — verify-only, 코드/픽스처 비변경.
- **금지 파일 무변경** — package.json / readiness / workflow-state / forbidden-paths / frontmatter.schema.json / expected-after 트리.
