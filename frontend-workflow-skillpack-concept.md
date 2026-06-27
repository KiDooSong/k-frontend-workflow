# Frontend Workflow Skill Pack 설계

> ⚠ **현행 정본 주의 (2026-06-14 추가)**: 게이트·검사·티어·모드 사다리의 **현재 정본**은
> [roadmap-current.md](kit-dev/roadmap-current.md) · [open-decisions.md](kit-dev/open-decisions.md) · [README 문서지도](frontend-workflow-kit/README.md#문서-지도)다.
> 이 문서는 **설계 배경·사상**으로 읽되, `decision_cap`·검사 9~12·`screen-skeleton`/`docs-only` 등
> 현행 게이트 세부는 위 정본을 따른다 (이 문서엔 미반영 — 역방향 드리프트, 분석 보고서 P3/P4).

> 목적: [Core 워크플로우](frontend-llm-workflow.md)와 [산출물 카탈로그](frontend-llm-workflow-expanded.md)를
> 재사용 가능한 스킬팩(스타터킷)으로 패키징하는 설계.
> 버전: v5 (2026-06-12) — 이전 버전: `archive/` (v1 원본명, `*-v2`~`*-v4`)
> 이 문서는 **개념/운영 모델**을 다룬다. 스크립트·훅·스키마의 입출력 계약과 MVP 구현 계획은
> [킷 구현 명세](frontend-workflow-kit-implementation.md)로 분리했다.
>
> v5 변경점 (v4 대비, 외부 리뷰 반영):
> - 구현 명세(frontend-workflow-kit-implementation.md) 분리 — readiness 입출력 계약,
>   artifact-manifest.yaml, implementation-mode-policy.yaml, package scripts, generated block convention
> - 방어선 3층 정의: Claude hooks(1차) → npm scripts(2차) → CI(3차). 훅은 npm scripts의 얇은 wrapper
> - frontmatter에서 tbd_count 제거 (스크립트가 본문 파싱으로 계산), 승인 메타데이터 추가
> - MVP를 A~D로 재분할 (중간에 멈춰도 사용 가능하게)
>
> v4 변경점 (v3 대비):
> - 프로젝트 생성 구조를 도메인 우선 배치로 재편 (작성은 domains/, 전역은 navigation-map 뼈대만)
> - screen-inventory / route-tree / nav-graph(Entry Points 역색인)를 스크립트 생성물로 전환
> - 이동 엣지 단일 선언: 출발 화면 Interaction Matrix에서만 선언, 도착 화면 Entry Points는 생성
> - 화면 발굴을 stub screen-spec 방식으로 변경 (인벤토리 문서 작성 제거)
>
> v3 변경점 (v2 대비):
> - lint-pack을 "드롭인 설정"에서 **정책 카탈로그 + lint-policy.yaml + 생성 설정** 모델로 재설계
>   (프로젝트 상황에 맞게 정책별 on/off, 적용 경로, 심각도, 구현 수단을 LLM 판단으로 조정 가능)
> - `adapt-lint-pack` 스킬 추가 — 기존 린트가 있는 브라운필드 도입 절차 (scan → map → diff → rollout)
> - 정책 등급(safety / architecture / style)과 래칫(ratchet) 도입 전략 추가
> - 레이어 경로 기본값을 frontend-architecture.md에서 파생 (폴더 구조 하드코딩 제거)
>
> v2 변경점 (v1 대비):
> - 상태의 단일 출처를 frontmatter로 확정. workflow-state.yaml은 스크립트가 생성하는 읽기 전용 대시보드
> - readiness gate 평가를 LLM 판단에서 스크립트 계산으로 이동
> - 린트 팩 + 검증 스크립트(CLI)를 킷의 1급 구성요소로 추가
> - Claude Code 플러그인 패키징 (SKILL.md, hooks, subagents)
> - 화면별 문서 7종 → 1파일, 케이스 파일을 예제로 강등, 자기 강화 루프 추가

---

## 1. 컨셉

```txt
LLM이 프론트 프로젝트를 환각 없이 이해하고,
기획/Figma/API/디자인시스템의 준비 상태에 따라
문서와 구현을 단계적으로 진행하게 만드는
Frontend Workflow Skill Pack
```

핵심 설계 결정 4가지:

```txt
1. 문서를 생성하는 스킬과 코드를 구현하는 스킬을 분리한다.
2. 구현 가능 여부를 LLM의 감이 아니라 스크립트가 계산하는 readiness gate로 판단한다.
3. 규칙 준수를 LLM의 순응이 아니라 결정적 도구(린트/스키마/훅/CI)에 위임한다.
4. 킷은 "정책"을 제공하고, 적용은 프로젝트 상황에 맞게 LLM이 조정한다.
   - 정책별 on/off, 적용 경로, 심각도, 구현 수단은 프로젝트마다 다를 수 있다.
   - 단, 조정 결과는 lint-policy.yaml 등 파일에 기록되고 사람이 승인한다.
     (LLM의 판단은 "제안과 기록"까지. 무기록 즉흥 조정은 금지)
```

구성요소 8가지:

```txt
1. Lint Policy Pack   — 정책 카탈로그 + 프로젝트별 lint-policy.yaml + 생성되는 린트 설정
2. Artifact Catalog   — 어떤 문서들이 있는지 정의 (기본 ~15 + 선택)
3. Templates          — 각 문서의 작성 양식 (frontmatter 포함)
4. Scripts (CLI)      — 상태 집계, readiness 계산, 린트 설정 생성, 카탈로그 생성, 스키마 검증
5. Tag Matrix         — 자료 준비 상태를 태그로 분류
6. Screen Patterns    — list/form/detail 등 패턴별 규칙 + auth 등 도메인 규칙
7. Skills             — init, adapt-lint-pack, scan, classify, generate, update-from-*, implement, review
8. Policies           — update/conflict/status 정책 (가능한 부분은 훅으로 강제)
```

---

## 2. 배포용 디렉토리: `frontend-workflow-kit`

```txt
frontend-workflow-kit/
  README.md
  CHANGELOG.md                      # 킷 자체의 버전 관리 (템플릿 버전 추적용)

  lint-pack/                        # ★ v3에서 재설계 — 설정이 아니라 정책 카탈로그
    policies/                       # 단일 출처: 의도 + 위반 예 + 구현 옵션 + 등급
      no-fetch-in-screens.md
      layer-boundaries.md
      no-adhoc-buttons.md
      no-arbitrary-style-values.md
    presets/                        # 참조 구현 — 그린필드에서만 드롭인 가능
      eslint-flat/
      eslint-legacy/
      biome/                        # 커버 불가 항목 명시 (boundaries는 dep-cruiser 보완 등)
    adoption/
      rollout-ratchet.md            # 브라운필드 도입 전략 (warn / 신규 한정 / 카운트 래칫)
      conflict-report.template.md
    lint-policy.template.yaml       # 프로젝트별 정책 토글 파일의 템플릿

  scripts/                          # 상태/게이트/설정의 결정적 계산
    workflow-state.mjs              # frontmatter 수집 → workflow-state.yaml + screen-inventory.yaml 생성
    nav-graph.mjs                   # ★ Interaction Matrix 엣지 집계 → nav-graph.yaml (Entry Points 역색인)
    route-tree.mjs                  # ★ src/app 파일 트리 → route-tree.txt 생성
    readiness.mjs                   # 화면별 구현 가능 모드 계산
    lint-gen.mjs                    # lint-policy.yaml → eslint.workflow.config.mjs 생성
    lint-baseline.mjs               # 정책별 현재 위반 수 측정/기록 (래칫용)
    catalog-gen.mjs                 # components/ui → component-catalog.md 생성
    validate.mjs                    # frontmatter ↔ schema 검증, 끊어진 참조/이동 대상 부재 검출
    staleness.mjs                   # 문서 last_reviewed vs 관련 코드 git mtime 비교

  templates/
    global/        llm-rules, source-map, glossary, architecture
    app/           navigation-map(뼈대: 탭/스택/모달+guard+deeplink+크로스 도메인 엣지),
                   cross-domain-flow
    domain/        domain-rules, flows
    screen/        screen-spec.template.md      # 통합형 1파일 (stub 모드: frontmatter만)
    design/        design-token-map, component-guidelines,
                   component-gap-register, figma-frame-index, figma-component-mapping
    api/           api-manifest(zod 스키마 포함), auth-session-policy, api-error-policy
    review/        llm-semantic-review.template.md

  catalog/
    artifact-manifest.yaml          # 산출물 레지스트리: 경로/템플릿/생성 여부/필수 frontmatter
    README.md                       # (스킬이 디렉토리 구조를 추론하지 않게 하는 핵심 파일)

  tags/
    tag-matrix.yaml
    examples/
      wireframe-first.md  api-first.md  all-ready.md
      design-system-first.md  navigation-unclear.md

  screen-patterns/
    list.md  detail.md  form.md  search.md  settings.md
  domain-rules/
    auth.md  payment.md

  skills/
    init-workflow/SKILL.md
    adapt-lint-pack/SKILL.md        # ★ v3 신규
    scan-context/SKILL.md
    classify-tags/SKILL.md
    generate-artifacts/SKILL.md
    update-from-figma/SKILL.md
    update-from-api/SKILL.md
    update-from-planning/SKILL.md
    check-readiness/SKILL.md
    implement-screen/SKILL.md
    review-screen/SKILL.md

  hooks/
    pre-edit-confirmed-doc.mjs      # status: confirmed 문서 수정 시 차단/경고
    pre-edit-generated-file.mjs     # ★ 생성물 직접 수정 차단 → 원본(yaml/코드) 수정 유도
    pre-edit-mode-guard.mjs         # fixture-ui 모드 작업 중 src/api 수정 차단
    post-edit-lint-policy.mjs       # ★ lint-policy.yaml 수정 시 lint-gen 자동 재실행
    post-implement-validate.mjs

  agents/
    semantic-reviewer.md

  policies/
    document-lifecycle.md
    update-policy.md
    conflict-policy.md
    promotion-policy.md
    implementation-mode-policy.yaml # ★ v5 신규 — 모드별 허용/금지 경로 (기계가독)

  package-scripts.template.json     # ★ v5 신규 — 스킬/훅/CI가 부르는 npm 명령 고정

  schemas/
    frontmatter.schema.json
    screen-spec.schema.json
    tag-matrix.schema.json
    lint-policy.schema.json

  examples/
    coupon-feature/                 # golden example — 전체 사이클 완주 1건
```

---

## 3. 린트 도입 모델: 정책은 토글, 설정은 생성물

> v3의 핵심 변경. 킷의 린트 규칙은 "그대로 까는 설정 파일"이 아니다.
> 기존 프로젝트에는 이미 린터(ESLint 8/9, Biome), 팀 컨벤션, 다른 폴더 구조,
> 그리고 위반 백로그가 존재하기 때문이다.

### 3-1. 단일 출처: `lint-policy.yaml`

사람과 LLM이 편집하는 **유일한 린트 파일**이다. 정책별로 켜고 끄고,
경로를 바꾸고, 심각도와 도입 방식을 정한다. 실제 ESLint 설정은 여기서 생성된다.

```yaml
# docs/frontend-workflow/_meta/lint-policy.yaml
defaults:
  paths:                            # 미지정 시 frontend-architecture.md에서 파생
    screens: src/features/*/screens
    api: src/api
    ui: src/components/ui

policies:
  layer-boundaries:
    enabled: true
    severity: error                 # off | warn | error
    rollout: all                    # all | new-code-only | ratchet
    implementation: auto            # auto | eslint-boundaries | dep-cruiser

  no-fetch-in-screens:
    enabled: true
    severity: error
    rollout: ratchet
    baseline: 17                    # lint-baseline.mjs가 기록. 증가 시에만 CI 실패

  no-adhoc-buttons:
    enabled: true
    severity: warn                  # error 승격 예정 (decision-log D-004)
    rollout: new-code-only
    include: [src/features/coupons/**]

  no-arbitrary-style-values:
    enabled: false
    reason: "이 프로젝트는 NativeWind 미사용(StyleSheet). 대체 구현 검토 중 — U-012"
```

```txt
lint-policy.yaml  ──lint-gen.mjs──▶  eslint.workflow.config.mjs (생성물, 수정 금지)
                                      └─ 기존 eslint 설정 "뒤에" 합성(append)
                                         기존 설정 파일은 건드리지 않는다
```

- 끄거나 낮출 때는 `reason` 필수 — 조정의 근거가 파일에 남는다 (LLM 판단의 기록화)
- 생성물 직접 수정은 `pre-edit-generated-file` 훅이 차단하고 yaml 수정을 유도한다
- yaml 수정 시 `post-edit-lint-policy` 훅이 lint-gen을 자동 재실행한다

### 3-2. 정책 등급: LLM의 협상 범위를 정의

| 등급 | 예 | 조정 가능 범위 |
|---|---|---|
| safety | 토큰/비밀번호 로깅 금지 | **off 불가.** severity 하향도 사람 승인 필요 |
| architecture | 레이어 경계, fetch 금지 | rollout/경로 조정 가능, off는 reason + 사람 승인 |
| style | 임의 색상 금지, 토큰 강제 | LLM이 프로젝트 컨벤션 보고 on/off 제안 가능 |

기존 프로젝트 컨벤션과 충돌하면: safety는 양보 불가, style은 기존 컨벤션 우선이 기본값.

### 3-3. 정책 문서 형식 (`lint-pack/policies/*.md`)

정책의 단일 출처는 ESLint 설정이 아니라 이 문서다. 구현은 스택에 따라 달라진다.

```md
---
policy_id: no-fetch-in-screens
tier: architecture
---
# 화면 파일에서 API 직접 호출 금지

## Intent
화면은 hook의 반환값만 소비한다. 데이터 출처 변경이 화면 코드에 영향을 주지 않게 한다.

## Violation Example
screens/CouponListScreen.tsx 안의 fetch(), axios.get(), apiClient.get()

## Implementations
- eslint: no-restricted-imports + eslint-plugin-boundaries  (기본)
- biome: 미지원 → dependency-cruiser로 보완
- 스택 무관: dependency-cruiser 단독

## Path Variables
screens, api  (lint-policy.yaml defaults.paths에서 주입)
```

### 3-4. 브라운필드 도입: `adapt-lint-pack` 스킬

기존 린트가 있는 프로젝트에서 LLM이 수행하는 절차다.
**기존 설정을 덮어쓰는 일은 절대 없다.**

```txt
1. Scan     린터 종류/버전, 설정 형식(flat/eslintrc), 플러그인, prettier,
            CI 구성, 모노레포 여부, 스타일링 스택(NativeWind/StyleSheet/...) 탐지

2. Map      frontend-architecture.md에서 레이어 경로를 읽어 defaults.paths 작성.
            아키텍처 문서가 없으면 코드 구조에서 추정하되 confidence: candidate로 표시

3. Diff     킷 정책별로 기존 설정과 대조:
            - 이미 커버됨   → 킷 쪽은 enabled: false + reason("기존 규칙 X가 커버")
            - 모순됨       → conflict report 출력, 사람이 결정 (자동 override 금지)
            - 누락됨       → 도입 후보

4. Rollout  도입 후보를 report-only로 실행해 정책별 현재 위반 수 측정 →
            위반 수에 따라 rollout 방식 제안:

            | 위반 수 | 제안 |
            |---|---|
            | 0~소수 | severity: error, rollout: all |
            | 중간   | severity: warn 선행 → 기한 두고 error 승격 |
            | 다수   | rollout: new-code-only 또는 ratchet (baseline 기록) |

5. Propose  lint-policy.yaml 초안 + conflict report + 도입 계획을 출력.
            사람 승인 후 lint-gen 실행. 기존 설정 뒤에 합성.
```

그린필드는 단순하다: `presets/eslint-flat`을 드롭인하고 lint-policy.yaml은
전부 enabled: true, rollout: all로 시작한다.

---

## 4. 프로젝트에 생성되는 구조: 도메인 우선 배치

배치 원칙:

```txt
- 작성(authoring)은 도메인 경로에서: 화면 관련 문서는 domains/{domain}/ 아래에만 쓴다.
- 전역에는 도메인이 소유할 수 없는 것만: 탭/스택/모달 뼈대, 가드, 딥링크, 크로스 도메인 플로우.
- 전역 "뷰"(인벤토리, 루트 트리, 내비 그래프)는 작성하지 않는다 — 스크립트가 생성한다.
- 이동 엣지는 출발 화면의 Interaction Matrix에서 한 번만 선언한다.
  도착 화면의 Entry Points는 nav-graph.mjs 가 인바운드 엣지를 역색인해 생성한다.
- 화면 발굴(초기 인벤토리 작업)은 frontmatter만 채운 stub screen-spec 생성으로 한다.
```

```txt
docs/frontend-workflow/
  README.md

  _meta/
    workflow-state.yaml         # ★ 생성물 — 읽기 전용 대시보드
    screen-inventory.yaml       # ★ 생성물 — screen-spec frontmatter 집계 (ID 중복/route 충돌 검사 포함)
    route-tree.txt              # ★ 생성물 — src/app 파일 트리에서
    nav-graph.yaml              # ★ 생성물 — Interaction Matrix 엣지 집계 (Entry Points 역색인)
    lint-policy.yaml            # 린트 정책 단일 출처 — 사람/LLM이 편집하는 유일한 린트 파일
    tags.yaml                   # case_tags — 사람/LLM이 수정하는 메타 파일
    decision-log.md
    conflicts.md                # 린트 conflict report도 여기 통합

  global/
    llm-rules.md                # CLAUDE.md에서 참조
    domain-glossary.md
    frontend-architecture.md    # 레이어 경로의 단일 출처 (lint defaults.paths가 여기서 파생)
    source-map.md

  app/
    navigation-map.md           # 뼈대만: 탭/스택/모달, Route Guard, Deep Link, 크로스 도메인 엣지
    flows/
      onboarding.md             # 2개 도메인 이상 걸치는 플로우만

  design/
    component-catalog.md        # ★ catalog-gen 생성물. 손으로 수정 금지
    component-guidelines.md
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
      flows.md                  # 도메인 내부 플로우
      screens/
        coupon-list/
          screen-spec.md        # 통합형 1파일. 이동 엣지 선언의 단일 출처
          figma-component-mapping.md
        coupon-detail/
          screen-spec.md        # 화면 발굴 단계에는 frontmatter만 있는 stub
    auth/
      domain-rules.md
      flows.md
      screens/
        login/
          screen-spec.md

(레포 루트)
  eslint.workflow.config.mjs    # ★ lint-gen 생성물 — 기존 설정 뒤에 합성, 직접 수정 금지
```

화면당 기본 1~2개 파일이다. 30개 화면이어도 ~40개 파일로 끝난다 (v1 설계로는 210개).

구현 시 컨텍스트 경제: implement-screen이 읽는 것은
`domains/{domain}/**` + `app/navigation-map.md`(작음) + 디자인 카탈로그가 전부다.
다른 도메인의 문서는 로드하지 않는다.

---

## 5. 상태 관리: frontmatter가 단일 출처

중앙 yaml과 문서별 frontmatter가 같은 상태를 이중으로 들면 반드시 어긋난다. 규칙:

```txt
단일 출처:  각 문서의 YAML frontmatter   (린트는 lint-policy.yaml)
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
depends_on: [navigation-map]
last_reviewed: 2026-06-12
# status: confirmed 승격 시 추가 (사람만):
# approved_by, approved_at, decision_id
---
```

> 내용 확신도(unknown/candidate/confirmed)는 문서 본문의 개별 항목에 붙는다.
> status와 confidence를 한 enum에 섞지 않는다. (확장판 1장 참고)
>
> tbd/unknown/candidate **개수는 frontmatter에 두지 않는다** — 수동 카운트는 반드시
> 드리프트한다. workflow-state.mjs가 본문(Unknowns 표, Copy Keys의 TBD, API Candidates의
> confidence)을 파싱해 계산하고 대시보드에 기록한다.

### 생성되는 대시보드 (`workflow-state.yaml` — 발췌)

```yaml
# GENERATED by scripts/workflow-state.mjs — DO NOT EDIT
generated_at: 2026-06-12
lint:
  policies_enabled: 3/4
  ratchet: { no-fetch-in-screens: { baseline: 17, current: 15 } }
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

## 6. Readiness Gate: 스크립트가 계산한다

구현 가능 모드는 다음 단계를 유지하되, 평가를 `scripts/readiness.mjs`가 한다.

```txt
docs-only → route-skeleton → screen-skeleton → rough-fixture-ui
→ final-fixture-ui → api-integrated-ui → production-ready
```

게이트 정의:

```yaml
readiness_gates:
  route-skeleton:
    requires:
      - stub-screen-specs.count > 0          # 화면 발굴 완료 (frontmatter 집계 기준)
      - navigation-map.status >= draft
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
      - ci.lint == pass                    # ratchet 정책은 "증가 없음"이 pass
      - ci.schema-validation == pass
      - state-coverage.stories == complete
      - llm-semantic-review.status == pass
```

조건이 전부 frontmatter/파일 존재/CI 결과여서 **스크립트로 결정적으로 계산 가능**하다.
LLM은 결과를 읽기만 한다.

단, `state-matrix.complete` 같은 조건값은 frontmatter에 중복 기재하지 않는다 —
workflow-state.mjs가 본문을 파싱해 산출한다 (State Matrix 표에 필수 상태 5종이 있으면
complete, fake hook 파일이 실재하면 exists). 파싱 규칙과 readiness의 입출력 계약
(allowed_paths / forbidden_paths / blocking / next_actions)은
[킷 구현 명세](frontend-workflow-kit-implementation.md)에 정의한다.

---

## 7. 정책: 가능한 부분은 훅으로 강제

### Update Policy (요약)

```md
- 문서가 없을 때: 템플릿 기반 생성. 모르는 내용은 TBD, 추측은 candidate.
- draft일 때: 새 자료 반영해 업데이트. TBD 해소 시 resolved 표시 + 출처 추가.
- confirmed일 때: 덮어쓰기 금지. 충돌은 conflicts.md에 기록.
  사람의 승인이 있을 때만 변경.                     ← hooks/pre-edit-confirmed-doc 이 차단
- implemented/verified일 때: 변경 제안만. 코드 영향 분석 첨부.
- 생성물(workflow-state.yaml, screen-inventory.yaml, route-tree.txt, nav-graph.yaml,
  component-catalog.md, eslint.workflow.config.mjs):
  직접 수정 금지.                                   ← hooks/pre-edit-generated-file 이 차단
```

### Conflict Policy

영역별 우선 출처 ([확장판 7장](frontend-llm-workflow-expanded.md)과 동일):

```txt
비즈니스 동작: ScreenSpec | 시각 디자인: 최종 Figma | 데이터: OpenAPI/Manifest
라우팅: Navigation Map | 컴포넌트: Component Catalog | 문구: Copy Keys
린트 정책 충돌(기존 컨벤션 vs 킷): tier 기준 — safety는 킷, style은 기존 컨벤션 우선
```

충돌 발견 시 LLM은 판단하지 않고 conflicts.md에 기록한다.

### Promotion Policy (자기 강화 루프)

```md
# Promotion Policy

- review-screen 또는 PR 리뷰에서 같은 유형의 위반이 2회 이상 발견되면,
  해당 규칙을 프롬프트 룰에서 린트 정책으로 승격할 수 있는지 검토한다.
- 승격 가능하면: lint-pack/policies에 정책 문서 추가
  + 프로젝트 lint-policy.yaml에서 enable (rollout은 위반 수 기준으로 선택)
  + llm-rules.md에서 해당 항목 제거.
- 승격 불가능하면(의미적 규칙): llm-rules.md의 해당 규칙에 위반 사례를 1줄 추가.
- 목표: llm-rules.md는 시간이 지날수록 짧아지고, lint-policy.yaml은 두꺼워진다.
```

---

## 8. Claude Code 플러그인 패키징

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
3. domains/{domain}/ 의 screen-spec.md·domain-rules.md·flows.md 와
   app/navigation-map.md, component-catalog.md, component-guidelines.md 를 읽는다.
   (이 화면 작업에 필요한 컨텍스트는 이게 전부다 — 다른 도메인 문서를 로드하지 않는다)
4. 허용된 파일만 수정한다: src/features/{domain}/screens/*, components/*
5. State Matrix 전 상태 + Copy Keys confirmed 문구만 사용.
6. 완료 후 `npm run workflow:validate` 를 실행하고 결과를 보고한다.
```

`adapt-lint-pack` 스킬은 3-4장의 절차를 수행한다 (scan → map → diff → rollout → propose).
출력은 lint-policy.yaml 초안 + conflict report이며, **사람 승인 전에는 lint-gen을 실행하지 않는다.**

### 방어선 3층: 훅은 1차일 뿐이다

Claude Code 훅에만 의존하면 Cursor, Codex, 일반 CLI, 사람 개발자 환경에서 강제가 사라진다.
**최종 방어선은 npm scripts와 CI다.** 훅은 같은 검사를 더 일찍 보여주는 UX 계층이다.

```txt
1차 방어: Claude hooks        — 편집 시점에 즉시 차단/경고 (Claude Code에서만)
2차 방어: npm run workflow:*  — 도구 무관, 로컬에서 누구나/어떤 LLM이나 실행
3차 방어: CI                  — 머지 전 최종 게이트 (회피 불가)
```

훅은 검사 로직을 직접 들고 있지 않고, npm scripts를 부르는 **얇은 wrapper**로 만든다.
(스크립트 명세: [킷 구현 명세](frontend-workflow-kit-implementation.md))

### 훅 (hooks)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "node hooks/pre-edit-confirmed-doc.mjs" },
          { "type": "command", "command": "node hooks/pre-edit-generated-file.mjs" }
        ]
      }
    ]
  }
}
```

- `pre-edit-confirmed-doc.mjs`: 편집 대상이 `status: confirmed` 문서면 차단하고 사유 출력
- `pre-edit-generated-file.mjs`: 생성물 직접 편집 차단 → 원본(lint-policy.yaml, frontmatter, 코드) 수정 유도
- `pre-edit-mode-guard.mjs`: 현재 작업 모드에서 금지된 경로(`src/api` 등) 수정 차단
- `post-edit-lint-policy.mjs`: lint-policy.yaml 변경 시 lint-gen 자동 재실행

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
- 화면별 문서는 경로 참조로 필요 시 로드 — 문서를 컨텍스트에 전부 올리지 않는다
- 각 문서는 200줄 이내 권장 (스킬이 읽을 때의 컨텍스트 비용 관리)
```

---

## 9. 스킬 호출 흐름

```txt
프로젝트 시작     → /init-workflow      킷 설치, _meta 생성, CLAUDE.md 연결
린트 적응        → /adapt-lint-pack    scan→map→diff→rollout → lint-policy.yaml 초안
                                       (그린필드면 preset 드롭인으로 단축)
자료 파악        → /scan-context       기획/Figma/API/코드 스캔 → 발견/부족 자료 보고
상태 분류        → /classify-tags      tags.yaml 갱신 (사람 확인 후 커밋)
문서 생성        → /generate-artifacts  태그 기준 필요 문서만 생성, TBD/candidate 표시
                                       (화면 발굴은 도메인 경로에 stub screen-spec 생성으로)
─────────────────────────────────────────────────────
Figma 업데이트됨  → /update-from-figma   frame-index, mapping, gap-register 갱신
API 확정됨       → /update-from-api     openapi 이관 또는 manifest confirmed 승격(승인 후)
기획 변경됨      → /update-from-planning screen-spec 갱신, conflicts 기록
─────────────────────────────────────────────────────
구현 가능 확인    → /check-readiness    readiness.mjs 실행 → 화면별 모드 표 출력
화면 구현        → /implement-screen   게이트 허용 범위에서만
구현 후 검증      → /review-screen      CI 게이트 + semantic-reviewer 에이전트
```

### 출력 예 (/adapt-lint-pack)

```md
## Lint Adaptation Report

기존 환경: ESLint 9 (flat config), prettier, eslint-config-expo

| Policy | 판정 | 위반 수 | 제안 |
|---|---|---|---|
| layer-boundaries | 누락 | 0 | enable, error, all |
| no-fetch-in-screens | 누락 | 17 | enable, error, **ratchet** (baseline 17) |
| no-adhoc-buttons | 누락 | 41 | enable, warn, new-code-only |
| no-arbitrary-style-values | **모순** | - | 기존 컨벤션이 arbitrary 허용 → conflicts C-007, 사람 결정 필요 |

→ lint-policy.yaml 초안 생성됨. 승인 시 lint-gen을 실행합니다.
```

---

## 10. MVP 로드맵

**중간에 멈춰도 사용 가능**하도록 4단계로 나눈다. 각 단계는 이전 단계만으로도 운영된다.
도구 개발이 워크플로우 설계보다 커지지 않게, 스크립트는 A에서 3개만 만든다.
(상세 범위: [킷 구현 명세](frontend-workflow-kit-implementation.md))

```txt
MVP-A: 문서 생성과 readiness만 — 가장 먼저 운영 테스트 가능한 최소 단위
  templates(screen-spec, navigation-map, llm-rules, domain-rules)
  workflow-state.mjs / readiness.mjs / validate.mjs
  implement-screen 스킬
  coupon-feature golden example
  (이 단계에서 Entry Points는 수동 작성 임시 허용)

MVP-B: lint-policy 적응
  lint-policy.template.yaml + lint-gen.mjs + lint-baseline.mjs
  policies 4종 + presets/eslint-flat + adapt-lint-pack 스킬

MVP-C: generated views
  catalog-gen.mjs / nav-graph.mjs / route-tree.mjs
  update-from-figma / update-from-api / scan-context / classify-tags 스킬
  screen-patterns: list, form, detail

MVP-D: Claude Code 통합 + 완성
  hooks (confirmed 보호, 생성물 보호, 모드 가드, lint-policy 자동 재생성)
  semantic-reviewer 에이전트 + review-screen 스킬
  staleness.mjs, presets/eslint-legacy·biome, 나머지 카탈로그/템플릿
  Claude Code 플러그인 배포 (marketplace)
```

---

## 11. 선행 사례

| 사례 | 차용할 것 | 이 킷의 차별점 |
|---|---|---|
| GitHub Spec Kit | constitution(≈llm-rules), spec/plan/tasks 분리 | 프론트 특화: Figma/디자인시스템/Expo 매핑 |
| AWS Kiro | requirements/design/tasks 파일 사이클 | readiness gate의 스크립트 계산 |
| BMAD Method | 에이전트 역할 분리 | lint policy pack 동봉, 훅 기반 정책 강제 |

---

## 결론

이 킷의 가치는 템플릿 양이 아니라 다음 세 가지에서 나온다.

```txt
1. Lint Policy Pack + scripts + hooks
   — LLM 순응 의존을 결정적 도구로 대체하되,
     적용은 lint-policy.yaml로 프로젝트마다 조정 가능 (LLM이 제안, 사람이 승인, 파일에 기록)
2. frontmatter 단일 출처 + 생성형 대시보드 — 상태 이중화 제거
3. golden example 1건 — 모든 화면 복제의 few-shot 기준
```

템플릿과 케이스 문서는 이 셋이 갖춰진 뒤에 의미를 갖는다.
