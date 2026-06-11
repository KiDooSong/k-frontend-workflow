# Frontend Workflow Skill Pack 설계

> 목적: [Core 워크플로우](frontend-llm-workflow.md)와 [산출물 카탈로그](frontend-llm-workflow-expanded.md)를
> 재사용 가능한 스킬팩(스타터킷)으로 패키징하는 설계.
> 버전: v2 (2026-06-12) — v1은 `archive/frontend-workflow-skillpack-concept.md` 참고.
>
> v1 대비 변경점:
> - 상태의 단일 출처를 frontmatter로 확정. workflow-state.yaml은 스크립트가 생성하는 읽기 전용 대시보드
> - readiness gate 평가를 LLM 판단에서 스크립트 계산으로 이동
> - 린트 팩 + 검증 스크립트(CLI)를 킷의 1급 구성요소로 추가
> - Claude Code 플러그인 패키징 (SKILL.md, hooks, subagents)
> - 화면별 문서 7종 → 1파일 (생성 구조 단순화)
> - 케이스 파일을 규범에서 예제로 강등
> - 자기 강화 루프(위반 → 린트 룰 승격) 운영 정책 추가

---

## 1. 컨셉

```txt
LLM이 프론트 프로젝트를 환각 없이 이해하고,
기획/Figma/API/디자인시스템의 준비 상태에 따라
문서와 구현을 단계적으로 진행하게 만드는
Frontend Workflow Skill Pack
```

핵심 설계 결정 3가지:

```txt
1. 문서를 생성하는 스킬과 코드를 구현하는 스킬을 분리한다.
2. 구현 가능 여부를 LLM의 감이 아니라 스크립트가 계산하는 readiness gate로 판단한다.
3. 규칙 준수를 LLM의 순응이 아니라 결정적 도구(린트/스키마/훅/CI)에 위임한다.
```

구성요소 8가지:

```txt
1. Lint Pack          — ESLint 규칙 + tailwind 제한 + CI 게이트 (가장 먼저 설치)
2. Artifact Catalog   — 어떤 문서들이 있는지 정의 (기본 ~15 + 선택)
3. Templates          — 각 문서의 작성 양식 (frontmatter 포함)
4. Scripts (CLI)      — 상태 집계, readiness 계산, 카탈로그 생성, 스키마 검증
5. Tag Matrix         — 자료 준비 상태를 태그로 분류
6. Screen Patterns    — list/form/detail 등 패턴별 규칙 + auth 등 도메인 규칙
7. Skills             — init, scan, classify, generate, update-from-*, implement, review
8. Policies           — update/conflict/status 정책 (가능한 부분은 훅으로 강제)
```

---

## 2. 배포용 디렉토리: `frontend-workflow-kit`

```txt
frontend-workflow-kit/
  README.md
  CHANGELOG.md                      # 킷 자체의 버전 관리 (템플릿 버전 추적용)

  lint-pack/                        # ★ v2 신규 — 킷의 가장 가치 있는 부분
    eslint/
      boundaries.config.mjs         # screens → api 직접 import 차단 등 레이어 규칙
      restricted-syntax.config.mjs  # Pressable 직접 사용 차단 등
      tailwind.config.mjs           # arbitrary value 금지
    ci/
      workflow-checks.yml           # typecheck → lint → 스키마 검증 → 테스트
    README.md                       # 규칙별 의도와 끄는 방법

  scripts/                          # ★ v2 신규 — 상태/게이트의 결정적 계산
    workflow-state.mjs              # frontmatter 수집 → workflow-state.yaml 생성
    readiness.mjs                   # 화면별 구현 가능 모드 계산
    catalog-gen.mjs                 # components/ui → component-catalog.md 생성
    validate.mjs                    # frontmatter ↔ schema 검증, 끊어진 참조 검출
    staleness.mjs                   # 문서 last_reviewed vs 관련 코드 git mtime 비교

  templates/
    global/        llm-rules, source-map, glossary, architecture
    app/           feature-inventory, screen-inventory, user-flow-map,
                   navigation-map(guard+deeplink 포함), route-tree
    screen/        screen-spec.template.md      # 통합형 1파일 (state/interaction/
                                                #  mutation/copy/a11y/acceptance 섹션 포함)
    design/        design-token-map, component-guidelines,
                   component-gap-register, figma-frame-index, figma-component-mapping
    api/           api-manifest(zod 스키마 포함), auth-session-policy, api-error-policy
    review/        llm-semantic-review.template.md   # 기계가 못 잡는 항목 전용

  catalog/
    artifact-manifest.yaml          # 산출물 정의: id, scope, 생성방식(manual|generated|hybrid),
                                    # 필수 frontmatter, 의존 관계
    README.md

  tags/
    tag-matrix.yaml                 # case_tags 정의 + priority_rules
    examples/                       # 태그 조합 워크드 예제 (v1 케이스 A~J의 후신)
      wireframe-first.md
      api-first.md
      all-ready.md
      design-system-first.md
      navigation-unclear.md

  screen-patterns/                  # v1 "domain-presets"에서 분리·개명
    list.md  detail.md  form.md  search.md  settings.md
  domain-rules/
    auth.md  payment.md

  skills/                           # Claude Code 스킬 (4장 참고)
    init-workflow/SKILL.md
    scan-context/SKILL.md
    classify-tags/SKILL.md
    generate-artifacts/SKILL.md
    update-from-figma/SKILL.md
    update-from-api/SKILL.md
    update-from-planning/SKILL.md
    check-readiness/SKILL.md
    implement-screen/SKILL.md
    review-screen/SKILL.md

  hooks/                            # ★ v2 신규 — 정책의 기계적 강제
    pre-edit-confirmed-doc.mjs      # status: confirmed 문서 수정 시 차단/경고
    pre-edit-mode-guard.mjs         # fixture-ui 모드 작업 중 src/api 수정 차단
    post-implement-validate.mjs     # 구현 후 validate.mjs 자동 실행

  agents/                           # ★ v2 신규 — 리뷰용 서브에이전트 정의
    semantic-reviewer.md            # 구현과 분리된 컨텍스트에서 의미 리뷰

  policies/
    document-lifecycle.md           # status 전환 규칙 (confirmed 승격은 사람만)
    update-policy.md
    conflict-policy.md              # 영역별 우선 출처
    promotion-policy.md             # ★ 위반 → 린트 룰 승격 루프

  schemas/
    frontmatter.schema.json         # 모든 산출물 frontmatter 공통 스키마
    screen-spec.schema.json
    tag-matrix.schema.json

  examples/
    coupon-feature/                 # golden example — 전체 사이클 완주 1건
```

> v1과 가장 다른 점: **lint-pack, scripts, hooks가 templates보다 앞에 있다.**
> 템플릿은 베끼면 되지만, 이 셋은 시스템의 신뢰도를 만드는 부분이다.

---

## 3. 프로젝트에 생성되는 구조

```txt
docs/frontend-workflow/
  README.md

  _meta/
    workflow-state.yaml         # ★ 스크립트 생성물. 손으로 수정 금지 (읽기 전용 대시보드)
    tags.yaml                   # case_tags — 사람/LLM이 수정하는 유일한 메타 파일
    decision-log.md
    conflicts.md

  global/
    llm-rules.md                # CLAUDE.md에서 참조
    domain-glossary.md
    frontend-architecture.md
    source-map.md

  app/
    feature-inventory.md
    screen-inventory.md
    user-flow-map.md
    navigation-map.md           # Route Guard + Deep Link 포함
    route-tree.md

  design/
    component-catalog.md        # ★ catalog-gen 생성물. 손으로 수정 금지
    component-guidelines.md     # 수동: Do/Don't, a11y
    component-gap-register.md
    design-token-map.md
    figma-frame-index.md

  api/
    api-manifest.md             # 미확정분 전용 (확정분은 openapi.yaml/zod가 출처)
    auth-session-policy.md
    api-error-policy.md

  domains/
    coupons/
      domain-rules.md
      screens/
        coupon-list/
          screen-spec.md        # ★ 통합형 1파일 (v1의 7파일이 여기로)
          figma-component-mapping.md   # 최종 Figma 도착 후에만 생성
        coupon-detail/
          screen-spec.md
    auth/
      domain-rules.md
      screens/
        login/
          screen-spec.md
```

화면당 기본 1~2개 파일이다. 30개 화면이어도 ~40개 파일로 끝난다 (v1 설계로는 210개).

---

## 4. 상태 관리: frontmatter가 단일 출처

v1은 중앙 `workflow-state.yaml`과 문서별 frontmatter가 같은 상태를 이중으로 들고 있었다.
LLM에게 둘의 동기화를 맡기면 반드시 어긋난다. v2의 규칙:

```txt
단일 출처:  각 문서의 YAML frontmatter
대시보드:   workflow-state.yaml — scripts/workflow-state.mjs 가 frontmatter를 긁어 생성
검증:       scripts/validate.mjs — frontmatter 스키마 검증 + 끊어진 참조 검출
신선도:     scripts/staleness.mjs — last_reviewed 와 관련 코드의 git mtime 비교
```

### 공통 frontmatter

```yaml
---
artifact_id: COUPON-001-screen-spec
artifact_type: screen-spec
domain: coupons
screen_id: COUPON-001
status: draft              # 문서 라이프사이클 (missing|draft|review|confirmed|implemented|verified|deprecated)
sources:
  - { type: planning, ref: figma-planning/coupon-slide-12 }
  - { type: wireframe, ref: docs/raw/wireframes/coupon-list.png }
depends_on: [screen-inventory, navigation-map]
last_reviewed: 2026-06-12
tbd_count: 3
---
```

> 내용 확신도(unknown/candidate/confirmed)는 문서 본문의 개별 항목에 붙는다.
> status와 confidence를 한 enum에 섞지 않는다. (확장판 1장 참고)

### 생성되는 대시보드 (`workflow-state.yaml` — 발췌)

```yaml
# GENERATED by scripts/workflow-state.mjs — DO NOT EDIT
generated_at: 2026-06-12
screens:
  COUPON-001:
    screen_spec: { status: draft, tbd_count: 3, last_reviewed: 2026-06-12 }
    figma_mapping: missing
    readiness_mode: rough-fixture-ui      # readiness.mjs 계산 결과
    blocking: [api_confidence: candidate, figma_mapping: missing]
```

LLM에게 시키는 일이 단순해진다:

```md
npm run workflow:state 를 실행하고, 생성된 workflow-state.yaml을 읽은 뒤
readiness_mode가 허용하는 범위에서만 작업해줘.
```

---

## 5. Readiness Gate: 스크립트가 계산한다

구현 가능 모드는 v1과 동일한 단계를 유지하되, 평가를 `scripts/readiness.mjs`가 한다.

```txt
docs-only → route-skeleton → screen-skeleton → rough-fixture-ui
→ final-fixture-ui → api-integrated-ui → production-ready
```

게이트 정의 (`tag-matrix.yaml`과 함께 킷에 포함):

```yaml
readiness_gates:
  route-skeleton:
    requires:
      - screen-inventory.status >= draft
      - navigation-map.status >= draft
      - route-tree.status >= draft
    forbids: [ui-implementation, api-integration]

  rough-fixture-ui:
    requires:
      - screen-spec.status >= draft
      - component-catalog.generated == true
      - fake-hook.exists == true
    forbids: [hook-internal-swap, final-visual-polish]

  final-fixture-ui:
    requires:
      - screen-spec.status >= confirmed
      - figma-component-mapping.status >= draft
    forbids: [hook-internal-swap-with-candidate-api]

  api-integrated-ui:
    requires:
      - api.confidence == confirmed        # OpenAPI 존재 또는 manifest confirmed
      - screen-spec.state-matrix.complete == true
    forbids: [endpoint-guessing]

  production-ready:
    requires:
      - ci.lint == pass
      - ci.schema-validation == pass
      - state-coverage.stories == complete
      - llm-semantic-review.status == pass
```

조건이 전부 frontmatter/파일 존재/CI 결과여서 **스크립트로 결정적으로 계산 가능**하다.
LLM은 결과를 읽기만 한다.

---

## 6. 정책: 가능한 부분은 훅으로 강제

### Update Policy (요약)

```md
- 문서가 없을 때: 템플릿 기반 생성. 모르는 내용은 TBD, 추측은 candidate.
- draft일 때: 새 자료 반영해 업데이트. TBD 해소 시 resolved 표시 + 출처 추가.
- confirmed일 때: 덮어쓰기 금지. 충돌은 conflicts.md에 기록.
  사람의 승인이 있을 때만 변경.                     ← hooks/pre-edit-confirmed-doc 이 차단
- implemented/verified일 때: 변경 제안만. 코드 영향 분석 첨부.
```

### Conflict Policy

영역별 우선 출처 ([확장판 7장](frontend-llm-workflow-expanded.md)과 동일):

```txt
비즈니스 동작: ScreenSpec | 시각 디자인: 최종 Figma | 데이터: OpenAPI/Manifest
라우팅: Navigation Map | 컴포넌트: Component Catalog | 문구: Copy Keys
```

### Promotion Policy (자기 강화 루프) — v2 신규

```md
# Promotion Policy

- review-screen 또는 PR 리뷰에서 같은 유형의 위반이 2회 이상 발견되면,
  해당 규칙을 프롬프트 룰에서 린트 룰로 승격할 수 있는지 검토한다.
- 승격 가능하면: lint-pack에 규칙 추가 + llm-rules.md에서 해당 항목 제거.
- 승격 불가능하면(의미적 규칙): llm-rules.md의 해당 규칙에 위반 사례를 1줄 추가.
- 이 정책의 목표: llm-rules.md는 시간이 지날수록 짧아지고, lint-pack은 두꺼워진다.
```

---

## 7. Claude Code 플러그인 패키징

v1의 `skills/*.md`는 단순 프롬프트 파일이었다. Claude Code를 쓴다면 실제 형식으로 만든다.

### 스킬 (SKILL.md)

```txt
.claude/skills/implement-screen/SKILL.md
```

```md
---
name: implement-screen
description: 지정된 Screen ID를 readiness gate가 허용하는 모드 범위에서 구현한다.
  사용자가 "화면 구현", "implement screen" 등을 요청할 때 사용.
---

1. `npm run workflow:state` 실행 후 대상 화면의 readiness_mode를 확인한다.
2. readiness_mode가 허용하지 않는 작업이면 구현하지 말고 blocking 항목을 보고한다.
3. screen-spec.md, component-catalog.md, component-guidelines.md 를 읽는다.
4. 허용된 파일만 수정한다: src/features/{domain}/screens/*, components/*
5. State Matrix 전 상태 + Copy Keys confirmed 문구만 사용.
6. 완료 후 `npm run workflow:validate` 를 실행하고 결과를 보고한다.
```

호출: `/implement-screen COUPON-001`

### 훅 (hooks)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "node hooks/pre-edit-confirmed-doc.mjs" }]
      }
    ]
  }
}
```

- `pre-edit-confirmed-doc.mjs`: 편집 대상이 `status: confirmed` 문서면 차단하고 사유 출력
- `pre-edit-mode-guard.mjs`: 현재 작업 모드(예: fixture-ui)에서 금지된 경로(`src/api`) 수정 차단
- 생성물 파일(`component-catalog.md`, `workflow-state.yaml`) 수동 편집 차단

**Update Policy가 프롬프트 속 부탁이 아니라 훅으로 강제된다.**

### 서브에이전트 (agents)

```txt
.claude/agents/semantic-reviewer.md
```

review-screen 스킬은 이 에이전트를 호출한다. 구현한 세션과 **분리된 깨끗한 컨텍스트**에서
ScreenSpec 대조 리뷰를 수행하므로, 자기 구현을 자기 검증하는 편향이 줄어든다.

### CLAUDE.md 연동

```txt
- 전역 규칙(llm-rules)은 CLAUDE.md에 작고 안정적으로 유지
- 화면별 문서는 경로 참조로 필요 시 로드 — 44개 문서를 컨텍스트에 전부 올리지 않는다
- 각 문서는 200줄 이내 권장 (스킬이 읽을 때의 컨텍스트 비용 관리)
```

---

## 8. 스킬 호출 흐름

```txt
프로젝트 시작     → /init-workflow     킷 설치, lint-pack 적용, _meta 생성, CLAUDE.md 연결
자료 파악        → /scan-context      기획/Figma/API/코드 스캔 → 발견/부족 자료 보고
상태 분류        → /classify-tags     tags.yaml 갱신 (사람 확인 후 커밋)
문서 생성        → /generate-artifacts 태그 기준 필요 문서만 템플릿 생성, TBD/candidate 표시
─────────────────────────────────────────────────────
Figma 업데이트됨  → /update-from-figma   frame-index, mapping, gap-register 갱신
API 확정됨       → /update-from-api     openapi 이관 또는 manifest confirmed 승격(승인 후)
기획 변경됨      → /update-from-planning screen-spec 갱신, conflicts 기록
─────────────────────────────────────────────────────
구현 가능 확인    → /check-readiness   readiness.mjs 실행 → 화면별 모드 표 출력
화면 구현        → /implement-screen  게이트 허용 범위에서만
구현 후 검증      → /review-screen     CI 게이트 + semantic-reviewer 에이전트
```

### 출력 예 (/check-readiness)

```md
| Screen | Mode | Blocking |
|---|---|---|
| LOGIN-001 | final-fixture-ui | api.confidence=candidate |
| COUPON-001 | rough-fixture-ui | figma_mapping=missing, U-001 open |
| HOME-001 | screen-skeleton | screen-spec.status=draft, data requirements 불명확 |
```

---

## 9. MVP 로드맵

### MVP 1차 — 신뢰도의 뼈대

```txt
lint-pack (4개 규칙: fetch 금지, Pressable 금지, arbitrary 색상 금지, 레이어 경계)
scripts: workflow-state.mjs, readiness.mjs, validate.mjs
templates: llm-rules, screen-spec(통합형), screen-inventory, navigation-map,
           api-manifest(zod), component-guidelines
skills: init-workflow, generate-artifacts, check-readiness, implement-screen
schemas: frontmatter.schema.json
examples: coupon-feature (golden example 1건 — 가장 공들일 것)
```

> v1 MVP와의 차이: 템플릿 수를 줄이고 lint-pack과 scripts를 1차에 포함.
> **결정적 도구 없이 템플릿만 있는 킷은 v1의 약점을 그대로 갖는다.**

### MVP 2차 — 운영 자동화

```txt
hooks (confirmed 문서 보호, 모드 가드)
catalog-gen.mjs (Component Catalog 자동 생성)
update-from-figma / update-from-api / scan-context / classify-tags 스킬
screen-patterns: list, form, detail
semantic-reviewer 에이전트 + review-screen 스킬
staleness.mjs
```

### MVP 3차 — 완성

```txt
전체 artifact catalog + 나머지 템플릿
tag-matrix 정교화 + 워크드 예제 확충
domain-rules 확충 (auth, payment)
Claude Code 플러그인으로 배포 (marketplace)
promotion-policy 운영 정착
```

---

## 10. 선행 사례

이 구상은 spec-driven development 도구들과 구조가 유사하다. 차별점을 명확히 하고
이미 검증된 해법을 차용한다.

| 사례 | 차용할 것 | 이 킷의 차별점 |
|---|---|---|
| GitHub Spec Kit | constitution(≈llm-rules), spec/plan/tasks 분리 | 프론트 특화: Figma/디자인시스템/Expo 매핑 |
| AWS Kiro | requirements/design/tasks 파일 사이클 | readiness gate의 스크립트 계산 |
| BMAD Method | 에이전트 역할 분리 | lint-pack 동봉, 훅 기반 정책 강제 |

---

## 결론

이 킷의 가치는 템플릿 양이 아니라 다음 세 가지에서 나온다.

```txt
1. lint-pack + scripts + hooks — LLM 순응 의존을 결정적 도구로 대체
2. frontmatter 단일 출처 + 생성형 대시보드 — 상태 이중화 제거
3. golden example 1건 — 모든 화면 복제의 few-shot 기준
```

템플릿과 케이스 문서는 이 셋이 갖춰진 뒤에 의미를 갖는다.
