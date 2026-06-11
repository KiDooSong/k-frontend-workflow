# Frontend Workflow Skill Pack 구상

좋은 그림이에요.  
이건 단순히 “문서 템플릿 묶음”이라기보다 **프론트 개발용 워크플로우 스킬팩 / 스타터킷**으로 보는 게 맞아 보여요.

다만 한 가지는 조정하는 게 좋습니다.

**44개 문서를 프로젝트마다 전부 실제 파일로 생성하는 방식은 노이즈가 커질 수 있어요.**  
대신 이렇게 나누는 게 좋아 보입니다.

```txt
1. 스킬팩 안에는 44종 전체 카탈로그와 템플릿을 제공한다.
2. 실제 프로젝트에는 케이스에 따라 필요한 문서만 생성한다.
3. 생성된 문서는 workflow-state / manifest로 상태를 추적한다.
4. 나중에 피그마, API, 기획이 업데이트되면 기존 문서를 덮어쓰지 않고 갱신한다.
```

즉, 네가 말한 방향은 맞고, 여기에 **카탈로그 / 템플릿 / 케이스 / 생성된 프로젝트 문서 / 상태 추적 manifest**를 분리하면 훨씬 탄탄해집니다.

---

# 추천 구조

## 1. 배포용 디렉토리: `frontend-workflow-kit`

프로젝트에 복사하거나 서브모듈처럼 넣을 수 있는 원본 스킬팩입니다.

```txt
frontend-workflow-kit/
  README.md

  install/
    README.md
    install-guide.md
    agent-setup-guide.md
    project-adaptation-guide.md

  docs/
    expanded-workflow.md
    operating-model.md
    artifact-priority.md
    implementation-readiness.md

  catalog/
    README.md
    artifact-manifest.yaml
    artifacts/
      01-llm-rules.md
      02-project-source-map.md
      03-domain-glossary.md
      04-frontend-architecture.md
      ...
      44-pr-review-prompt.md

  templates/
    README.md
    global/
      llm-rules.template.md
      project-source-map.template.md
      domain-glossary.template.md
      frontend-architecture.template.md

    app/
      feature-inventory.template.md
      screen-inventory.template.md
      user-flow-map.template.md
      navigation-map.template.md
      route-tree.template.md
      route-guard-policy.template.md

    screen/
      screen-spec.template.md
      state-matrix.template.md
      interaction-matrix.template.md
      acceptance-criteria.template.md
      visual-qa-checklist.template.md

    design/
      design-token-map.template.md
      component-catalog.template.md
      component-gap-register.template.md
      figma-frame-index.template.md
      figma-component-mapping.template.md

    api/
      api-manifest.template.md
      domain-model-map.template.md
      api-to-screen-mapping.template.md
      auth-session-policy.template.md
      api-error-policy.template.md
      fixture-contract.template.md

    implementation/
      feature-implementation-plan.template.md
      route-skeleton-plan.template.md
      screen-skeleton-plan.template.md
      integration-plan.template.md

    review/
      screen-qa-checklist.template.md
      design-diff-review.template.md
      api-contract-review.template.md
      state-coverage-review.template.md
      navigation-review.template.md
      component-usage-review.template.md
      pr-review-prompt.template.md

  cases/
    README.md
    case-matrix.yaml
    case-a-wireframe-first.md
    case-b-api-first.md
    case-c-planning-and-figma-ready.md
    case-d-all-materials-ready.md
    case-e-design-system-first.md
    case-f-planning-first-design-unstable.md
    case-g-figma-ready-api-unclear.md
    case-h-api-ready-figma-missing.md
    case-i-navigation-unclear.md
    case-j-component-gap-heavy.md

  skills/
    README.md
    01-init-project.md
    02-scan-project-context.md
    03-classify-case.md
    04-generate-artifacts.md
    05-update-from-planning.md
    06-update-from-figma.md
    07-update-from-api.md
    08-check-implementation-readiness.md
    09-implement-route-skeleton.md
    10-implement-fixture-ui.md
    11-integrate-api-hooks.md
    12-review-screen.md

  schemas/
    workflow-state.schema.json
    artifact.schema.json
    screen-spec.schema.json
    api-manifest.schema.json

  examples/
    coupon-feature/
    auth-feature/
```

이렇게 하면 스킬팩 자체는 꽤 커도 괜찮습니다.  
실제 프로젝트에는 필요한 것만 생성되게 하면 됩니다.

---

# 2. 실제 프로젝트에 생성되는 디렉토리

스킬팩을 프로젝트에 넣고 LLM에게 초기 셋업을 시키면, 실제 앱 레포에는 이런 식으로 생성되면 좋습니다.

```txt
docs/
  frontend-workflow/
    README.md

    _meta/
      workflow-state.yaml
      source-map.md
      decision-log.md
      unknowns.md
      case-classification.md
      implementation-readiness.md

    global/
      llm-rules.md
      domain-glossary.md
      frontend-architecture.md

    app/
      feature-inventory.md
      screen-inventory.md
      user-flow-map.md
      navigation-map.md
      route-tree.md
      route-guard-policy.md

    design/
      design-token-map.md
      component-catalog.md
      component-gap-register.md
      figma-frame-index.md

    api/
      api-manifest.md
      domain-model-map.md
      api-to-screen-mapping.md
      auth-session-policy.md
      api-error-policy.md

    domains/
      auth/
        README.md
        domain-rules.md
        screens/
          login/
            screen-spec.md
            state-matrix.md
            interaction-matrix.md
            acceptance-criteria.md
            figma-component-mapping.md
            fixture-contract.md
            qa-checklist.md

      coupons/
        README.md
        domain-rules.md
        screens/
          coupon-list/
            screen-spec.md
            state-matrix.md
            interaction-matrix.md
            acceptance-criteria.md
            figma-component-mapping.md
            fixture-contract.md
            qa-checklist.md

          coupon-detail/
            screen-spec.md
            state-matrix.md
            interaction-matrix.md
            acceptance-criteria.md
            figma-component-mapping.md
            fixture-contract.md
            qa-checklist.md
```

여기서 중요한 점은, **배포용 스킬팩과 프로젝트별 생성 문서를 분리**하는 겁니다.

```txt
frontend-workflow-kit/
  → 원본 템플릿, 케이스, 스킬 설명

docs/frontend-workflow/
  → 이 프로젝트에 맞게 생성된 실제 산출물
```

---

# 3. 제일 중요한 파일: `workflow-state.yaml`

이게 없으면 LLM이 매번 현재 상태를 새로 추측해야 합니다.  
그래서 프로젝트마다 상태 파일을 하나 두는 게 좋아요.

예시:

```yaml
project:
  name: company-app
  app_type: expo
  styling: nativewind
  router: expo-router
  api_layer: tanstack-query
  design_source: figma
  planning_source: figma-slides
  backend_source:
    - confluence
    - backend-repo

case_tags:
  - wireframe_available
  - design_system_in_progress
  - api_partially_known
  - navigation_unclear
  - final_figma_missing

global_status:
  llm_rules: confirmed
  project_source_map: draft
  domain_glossary: draft
  frontend_architecture: draft
  feature_inventory: draft
  screen_inventory: draft
  navigation_map: candidate
  component_catalog: draft
  api_manifest: candidate

domains:
  auth:
    status: draft
    priority: p0
    route_guard_required: true
    api_status: candidate
    figma_status: missing
    planning_status: available

  coupons:
    status: draft
    priority: p1
    api_status: candidate
    figma_status: missing
    planning_status: available

screens:
  AUTH-001:
    name: 로그인
    domain: auth
    route: "/(auth)/login"
    planning_status: available
    figma_status: missing
    api_status: candidate
    screen_spec: draft
    state_matrix: draft
    component_mapping: missing
    fixture_contract: draft
    implementation_mode: skeleton
    implementation_ready: false

  COUPON-001:
    name: 쿠폰 목록
    domain: coupons
    route: "/(tabs)/coupons"
    planning_status: available
    figma_status: missing
    api_status: candidate
    screen_spec: draft
    state_matrix: draft
    component_mapping: missing
    fixture_contract: draft
    implementation_mode: fixture-ui
    implementation_ready: false
```

상태값은 이런 식으로 통일하면 좋아요.

```txt
missing
draft
candidate
tbd
blocked
confirmed
implemented
verified
deprecated
```

이 구조가 있으면 LLM에게 이렇게 시킬 수 있습니다.

```md
docs/frontend-workflow/_meta/workflow-state.yaml을 기준으로
현재 생성 가능한 문서만 생성해줘.

규칙:
- missing이지만 필요한 문서는 템플릿으로 생성한다.
- 확정 정보가 없으면 TBD로 남긴다.
- candidate를 confirmed로 승격하지 않는다.
- 기존 confirmed 문서는 근거 없이 덮어쓰지 않는다.
- 변경한 문서는 decision-log에 기록한다.
```

이게 핵심입니다.

---

# 4. 케이스는 하나로 고정하지 말고 “태그 조합”으로 보는 게 좋음

앞에서는 케이스 A~J로 설명했지만, 실제 프로젝트는 보통 하나의 케이스에 딱 맞지 않습니다.

예를 들어 지금 상황은 대략 이렇죠.

```txt
wireframe_available
planning_available
design_system_in_progress
final_figma_missing
api_partially_known
backend_repo_available
navigation_unclear
```

개발 일정이 늦어진 경우는 이렇게 될 수 있고요.

```txt
planning_available
wireframe_available
final_figma_available
design_system_available
api_confirmed
navigation_partially_clear
```

그래서 케이스 파일은 `case-a`, `case-b`처럼 있어도 되지만, 실제 분류는 이렇게 하는 게 더 좋아요.

```yaml
case_tags:
  planning_available: true
  wireframe_available: true
  final_figma_available: false
  design_system_available: false
  design_system_in_progress: true
  api_confirmed: false
  api_partially_known: true
  backend_repo_available: true
  navigation_clear: false
  auth_policy_clear: false
```

그리고 태그에 따라 우선순위를 계산합니다.

```yaml
priority_rules:
  - when:
      navigation_clear: false
    prioritize:
      - screen-inventory
      - user-flow-map
      - navigation-map
      - route-tree

  - when:
      final_figma_available: true
    prioritize:
      - figma-frame-index
      - figma-component-mapping
      - visual-qa-checklist

  - when:
      api_confirmed: true
    prioritize:
      - api-manifest
      - domain-model-map
      - api-client
      - query-hooks

  - when:
      design_system_in_progress: true
    prioritize:
      - component-catalog
      - component-gap-register
    restrict:
      - final-visual-implementation
```

이렇게 하면 “케이스 선택”이 아니라 **현재 자료 상태에 따른 동적 워크플로우**가 됩니다.

---

# 5. 각 문서에는 메타데이터를 넣는 게 좋음

모든 문서 상단에 YAML frontmatter를 넣으면 LLM이 상태를 훨씬 잘 관리합니다.

예:

```md
---
artifact_id: COUPON-001-screen-spec
artifact_type: screen-spec
scope: screen
domain: coupons
screen_id: COUPON-001
status: draft
confidence: medium
sources:
  - type: planning
    ref: figma-planning/coupon-slide-12
  - type: wireframe
    ref: docs/raw/wireframes/coupon-list.png
depends_on:
  - screen-inventory
  - navigation-map
last_reviewed: 2026-06-11
tbd_count: 3
implementation_ready: false
---

# ScreenSpec: 쿠폰 목록

...
```

이게 있으면 나중에 LLM에게 이렇게 시킬 수 있습니다.

```md
status가 draft이고 tbd_count가 1 이상인 문서만 찾아서
새로 제공된 피그마/기획/API 정보로 업데이트해줘.
confirmed 문서는 충돌이 있을 때만 변경 제안하고 바로 수정하지 마.
```

---

# 6. 문서 생성 정책도 필요함

스킬팩에 `operating-model.md` 같은 문서가 꼭 있어야 합니다.

여기에는 이런 규칙을 넣는 게 좋아요.

```md
# Operating Model

## 문서 생성 원칙

- 모든 프로젝트에 44개 문서를 무조건 생성하지 않는다.
- 전역 문서는 초기 셋업 때 생성한다.
- 화면별 문서는 Screen Inventory에 등록된 화면에 대해서만 생성한다.
- Figma 관련 문서는 최종 피그마 또는 디자인시스템 정보가 있을 때 생성한다.
- API 관련 문서는 API Manifest 후보라도 만들 수 있지만, unknown은 구현하지 않는다.

## 문서 갱신 원칙

- confirmed 정보를 근거 없이 덮어쓰지 않는다.
- 새 정보가 기존 정보와 충돌하면 conflicts 섹션에 기록한다.
- TBD는 삭제하지 않고 resolved 상태로 변경한다.
- 변경 내역은 decision-log.md에 기록한다.

## 구현 원칙

- 문서 생성과 코드 구현을 같은 작업에서 섞지 않는다.
- 구현 가능 여부는 implementation-readiness 기준으로 판단한다.
- API가 불확실하면 fixture UI까지만 구현한다.
- 피그마가 불확실하면 skeleton 또는 rough UI까지만 구현한다.
```

이 문서가 있으면 스킬 호출이 안정적입니다.

---

# 7. 구현 가능 단계도 모드로 분리하면 좋음

특히 네가 말한 “조건이 되면 구현 판단해서 하고” 이 부분은 매우 중요해요.  
그냥 `implementation_ready: true/false`만 두기보다는, 구현 모드를 나누는 게 좋습니다.

```txt
docs-only
route-skeleton
screen-skeleton
rough-fixture-ui
final-fixture-ui
api-client-only
hook-only
api-integrated-ui
production-ready
```

예:

```yaml
implementation_modes:
  docs-only:
    allowed_when:
      - llm_rules exists
    description: 문서만 생성/갱신한다.

  route-skeleton:
    allowed_when:
      - screen_inventory exists
      - navigation_map exists
      - route_tree exists
    forbidden:
      - final UI implementation
      - API integration

  rough-fixture-ui:
    allowed_when:
      - screen_spec exists
      - component_catalog exists
      - fixture_contract exists
    forbidden:
      - real API integration
      - final visual polish

  final-fixture-ui:
    allowed_when:
      - screen_spec exists
      - figma_component_mapping exists
      - component_catalog exists
      - fixture_contract exists
    forbidden:
      - unconfirmed API integration

  api-integrated-ui:
    allowed_when:
      - api_manifest confirmed
      - query_hook exists
      - state_matrix exists
      - screen UI exists
    forbidden:
      - endpoint guessing
      - response field guessing

  production-ready:
    allowed_when:
      - screen_qa_checklist verified
      - api_contract_review passed
      - design_diff_review passed
      - state_coverage_review passed
```

이러면 LLM이 무작정 구현하는 게 아니라, 현재 문서 상태에 따라 가능한 구현 범위가 정해집니다.

---

# 8. 도메인별 규칙은 아주 좋은 생각

네가 말한 `auth` 같은 도메인별 디렉토리는 꼭 두는 게 좋아요.

예:

```txt
docs/frontend-workflow/domains/auth/
  README.md
  domain-rules.md
  auth-flow.md
  route-guard-policy.md
  session-policy.md
  screens/
    login/
      screen-spec.md
      state-matrix.md
      interaction-matrix.md
      acceptance-criteria.md
```

`auth/domain-rules.md`는 이런 식이 될 수 있습니다.

```md
# Auth Domain Rules

## Rules

- Auth 화면에서는 로그인 상태에 따라 redirect 정책을 반드시 따른다.
- token storage 정책은 docs/frontend-workflow/api/auth-session-policy.md를 따른다.
- 401 처리 방식은 화면별로 구현하지 않고 API client 또는 session layer에서 처리한다.
- 로그인 성공 후 이동 경로는 Navigation Map을 따른다.
- 비밀번호, 토큰, 인증코드는 로그에 남기지 않는다.

## Required Artifacts

- auth-flow.md
- route-guard-policy.md
- auth-session-policy.md
- login/screen-spec.md
- login/state-matrix.md
- login/interaction-matrix.md
```

도메인별 preset도 만들 수 있습니다.

```txt
domain-presets/
  auth/
  list/
  detail/
  form/
  search/
  payment/
  notification/
  profile/
  settings/
```

예를 들어 `list` 도메인/패턴이면:

```md
# List Screen Rules

- loading / success / empty / error / refreshing 상태를 반드시 정의한다.
- pagination이 있는 경우 hasNextPage, fetchNextPage 정책을 명시한다.
- 리스트 아이템 클릭 시 destination route를 Interaction Matrix에 기록한다.
- API가 없으면 fixture contract를 먼저 만든다.
```

`form` 패턴이면:

```md
# Form Screen Rules

- validation rule을 명시한다.
- submit loading 상태를 정의한다.
- field-level error와 form-level error를 구분한다.
- keyboard avoiding 정책을 확인한다.
- mutation hook은 화면 내부에 직접 구현하지 않는다.
```

이런 식으로 도메인 / 화면 패턴별 규칙을 추가하면 스킬팩 가치가 커집니다.

---

# 9. 스킬 호출 흐름은 이렇게 잡으면 좋음

네가 말한 “사용자 인풋이 있을 때 스킬을 호출하면 알아서 케이스 구분하고 문서 생성/업데이트”는 이렇게 설계하면 됩니다.

## `init` 스킬

처음 프로젝트에 넣을 때.

```md
역할:
이 프로젝트에 frontend-workflow 문서 체계를 초기화한다.

작업:
1. 기존 AGENTS.md, README, package.json, app 구조를 확인한다.
2. docs/frontend-workflow 디렉토리가 없으면 생성한다.
3. workflow-state.yaml을 생성한다.
4. source-map.md 초안을 생성한다.
5. LLM rules 초안을 생성한다.
6. 기존 프로젝트 규칙과 충돌하는 부분은 conflicts에 남긴다.

금지:
- 앱 코드를 수정하지 않는다.
- API나 디자인 정보를 추측하지 않는다.
```

---

## `scan` 스킬

프로젝트와 제공된 자료를 읽고 현재 상태만 파악합니다.

```md
역할:
프로젝트의 기획, 피그마, API, 디자인시스템, 라우팅 상태를 스캔한다.

출력:
- 발견한 자료
- 부족한 자료
- 가능한 case_tags
- 업데이트가 필요한 문서
- 구현 가능한 수준
```

---

## `classify` 스킬

케이스 태그를 정합니다.

```md
역할:
현재 프로젝트 상태를 기준으로 case_tags를 업데이트한다.

예:
- planning_available
- wireframe_available
- final_figma_available
- api_confirmed
- api_partially_known
- navigation_unclear
- design_system_in_progress
```

---

## `generate-artifacts` 스킬

케이스에 맞게 문서를 생성합니다.

```md
역할:
현재 case_tags와 workflow-state.yaml을 기준으로 필요한 문서를 생성한다.

규칙:
- 필요한 문서만 생성한다.
- 애매한 값은 TBD로 둔다.
- 후보값은 candidate로 표시한다.
- 기존 문서는 덮어쓰기 전에 변경점 요약을 남긴다.
```

---

## `update-from-figma` 스킬

피그마가 새로 들어왔을 때.

```md
역할:
새로운 Figma context를 기준으로 디자인 관련 문서를 업데이트한다.

대상:
- figma-frame-index.md
- design-token-map.md
- component-catalog.md
- component-gap-register.md
- figma-component-mapping.md
- visual-qa-checklist.md

금지:
- API 문서를 임의 수정하지 않는다.
- 화면 동작을 피그마만 보고 확정하지 않는다.
```

---

## `update-from-api` 스킬

API가 확정되었을 때.

```md
역할:
Confluence, OpenAPI, 백엔드 레포를 기준으로 API 문서를 업데이트한다.

대상:
- api-manifest.md
- domain-model-map.md
- api-to-screen-mapping.md
- api-error-policy.md
- fixture-contract.md

금지:
- 화면 UI를 수정하지 않는다.
- API 문서에 없는 endpoint를 만들지 않는다.
```

---

## `check-implementation-readiness` 스킬

구현 가능한지 판단합니다.

```md
역할:
각 화면별 구현 가능 수준을 판단한다.

출력:
| Screen ID | 구현 가능 모드 | 부족한 문서 | 다음 작업 |
|---|---|---|---|

구현 모드:
- docs-only
- route-skeleton
- screen-skeleton
- rough-fixture-ui
- final-fixture-ui
- api-integrated-ui
- production-ready
```

---

## `implement-screen` 스킬

실제 구현은 이때만 합니다.

```md
역할:
지정된 Screen ID를 현재 허용된 implementation mode 범위 안에서 구현한다.

규칙:
- 허용된 파일만 수정한다.
- ScreenSpec을 따른다.
- Component Catalog를 따른다.
- API Manifest의 confirmed API만 사용한다.
- final_figma가 없으면 final visual polish를 하지 않는다.
```

---

## `review-screen` 스킬

구현 후 리뷰합니다.

```md
역할:
구현된 화면을 기준 문서와 비교한다.

기준:
- ScreenSpec
- State Matrix
- Interaction Matrix
- Component Mapping
- API Manifest
- Component Catalog
- Acceptance Criteria

출력:
- 위반 사항
- 누락 상태
- API 추측 여부
- 디자인시스템 위반
- 수정 제안
```

---

# 10. “기존 문서가 있으면 업데이트” 정책이 중요함

이 부분을 꼭 명시해야 합니다.  
LLM은 기존 문서를 자주 통째로 다시 쓰려고 하기 때문입니다.

업데이트 정책은 이렇게 두면 좋아요.

```md
# Update Policy

## 기존 문서가 없을 때
- 템플릿 기반으로 새 문서를 만든다.
- 모르는 내용은 TBD로 둔다.
- 추측은 candidate로 표시한다.

## 기존 문서가 draft일 때
- 새 자료를 반영해 업데이트한다.
- TBD가 해소되면 resolved로 표시한다.
- 출처를 추가한다.

## 기존 문서가 confirmed일 때
- 바로 덮어쓰지 않는다.
- 새 자료와 충돌하면 conflicts 섹션에 기록한다.
- 사용자의 승인 또는 명확한 근거가 있을 때만 변경한다.

## 기존 문서가 implemented일 때
- 코드와 문서가 일치하는지 먼저 확인한다.
- 문서만 바뀌었는지, 코드도 바꿔야 하는지 분리한다.

## 기존 문서가 verified일 때
- 회귀 위험이 있으므로 변경 제안만 한다.
```

---

# 11. 충돌 관리 문서도 있으면 좋음

기획, 피그마, API는 자주 충돌합니다.  
예를 들어 피그마에는 필터 탭이 있는데 API에는 status query가 없을 수 있어요.

그래서 `conflicts.md` 또는 `decision-log.md`가 필요합니다.

```md
# Conflicts

| ID | Area | Source A | Source B | Conflict | Status | Decision |
|---|---|---|---|---|---|---|
| C-001 | Coupon | Figma | API | 피그마에는 만료 쿠폰 탭이 있으나 API status enum에 EXPIRED가 없음 | open | TBD |
| C-002 | Auth | Planning | Route Policy | 기획은 로그인 후 마이페이지 이동, 네비게이션 정책은 홈 이동 | resolved | 홈 이동으로 확정 |
```

그리고 우선순위도 정해야 합니다.

```txt
전역 LLM Rules / Architecture
→ Decision Log의 confirmed decision
→ API Manifest confirmed
→ ScreenSpec confirmed
→ Final Figma
→ Wireframe
→ LLM inference
```

다만 시각적 요소는 피그마 우선입니다.

```txt
비즈니스 동작: ScreenSpec / 기획 우선
시각 디자인: Final Figma 우선
데이터 계약: API Manifest 우선
라우팅 구조: Navigation Map 우선
컴포넌트 사용: Component Catalog 우선
```

이걸 정해두면 충돌 시 LLM이 자기 마음대로 판단하지 않습니다.

---

# 12. “문서 묶음”은 이렇게 나누면 좋음

네가 말한 구조를 조금 정리하면 이런 느낌이 제일 좋아 보여요.

```txt
프로젝트에 제공할 디렉토리
├─ 00-install/
│  ├─ README.md
│  ├─ install-guide.md
│  ├─ agent-setup-guide.md
│  └─ project-adaptation-guide.md
│
├─ 01-templates/
│  ├─ README.md
│  ├─ global/
│  ├─ app/
│  ├─ screen/
│  ├─ design/
│  ├─ api/
│  ├─ implementation/
│  └─ review/
│
├─ 02-artifact-catalog/
│  ├─ README.md
│  ├─ artifact-manifest.yaml
│  └─ artifacts/
│     ├─ 01-llm-rules.md
│     ├─ 02-project-source-map.md
│     └─ ...
│
├─ 03-cases/
│  ├─ README.md
│  ├─ case-matrix.yaml
│  ├─ case-a-wireframe-first.md
│  ├─ case-b-api-first.md
│  └─ ...
│
├─ 04-skills/
│  ├─ README.md
│  ├─ init-project.md
│  ├─ scan-project-context.md
│  ├─ classify-case.md
│  ├─ generate-artifacts.md
│  ├─ update-from-figma.md
│  ├─ update-from-api.md
│  ├─ check-readiness.md
│  ├─ implement-screen.md
│  └─ review-screen.md
│
├─ 05-operating-model/
│  ├─ README.md
│  ├─ document-lifecycle.md
│  ├─ status-policy.md
│  ├─ conflict-policy.md
│  ├─ implementation-readiness.md
│  └─ update-policy.md
│
└─ 06-examples/
   ├─ auth/
   ├─ coupon/
   └─ home/
```

네가 말한 구성과 거의 비슷하지만, 나는 여기에 아래 3개를 꼭 추가하고 싶어요.

```txt
1. workflow-state.yaml
2. status/update/conflict policy
3. skill prompt files
```

이 세 개가 있어야 진짜 “스킬처럼” 돌아갑니다.

---

# 13. 실제 LLM 호출 흐름 예시

예를 들어 사용자가 이렇게 말합니다.

```md
기획 피그마랑 디자인시스템 피그마는 읽었고,
API는 Confluence 일부만 확인했어.
현재 프로젝트에 프론트 워크플로우 세팅해줘.
```

그러면 스킬은 이렇게 해야 합니다.

```txt
1. 기존 docs/frontend-workflow 존재 여부 확인
2. package.json, src/app, components/ui 구조 확인
3. 기존 AGENTS.md 또는 Cursor rules 확인
4. workflow-state.yaml 생성 또는 업데이트
5. case_tags 분류
6. 필요한 전역 문서 생성
7. 필요한 앱 구조 문서 생성
8. 화면 목록이 있으면 screen docs 생성
9. API가 불확실하면 candidate API Manifest 생성
10. 피그마가 있으면 Figma Frame Index / Component Mapping 생성
11. 애매한 것은 TBD 또는 Unknowns로 남김
12. 구현 가능 모드 산출
```

출력은 이렇게 나오면 좋습니다.

```md
# Frontend Workflow Setup Result

## Case Tags
- planning_available
- design_system_available
- final_figma_available
- api_partially_known
- navigation_unclear

## Generated
- docs/frontend-workflow/_meta/workflow-state.yaml
- docs/frontend-workflow/global/llm-rules.md
- docs/frontend-workflow/app/screen-inventory.md
- docs/frontend-workflow/app/navigation-map.md
- docs/frontend-workflow/design/component-catalog.md
- docs/frontend-workflow/api/api-manifest.md

## TBD
- Auth refresh token policy
- Coupon status enum
- Home screen API mapping
- Empty state copy

## Implementation Readiness
| Screen | Mode | Reason |
|---|---|---|
| Login | final-fixture-ui | Figma 있음, API candidate |
| CouponList | rough-fixture-ui | ScreenSpec 있음, API 불확실 |
| Home | screen-skeleton | 데이터 요구사항 불명확 |
```

이 정도면 실제 운영이 꽤 매끄러워집니다.

---

# 14. 초기 MVP는 너무 크게 시작하지 않는 게 좋음

처음부터 44개 전체를 완벽하게 만들려고 하면 스킬팩 자체가 너무 무거워질 수 있어요.  
그래서 MVP는 이렇게 잡는 게 좋아 보입니다.

## MVP 1차

```txt
README.md
AGENTS.setup.md

templates/
  llm-rules.template.md
  project-source-map.template.md
  screen-inventory.template.md
  navigation-map.template.md
  screen-spec.template.md
  state-matrix.template.md
  component-catalog.template.md
  api-manifest.template.md
  figma-component-mapping.template.md
  fixture-contract.template.md
  implementation-readiness.template.md

cases/
  case-matrix.yaml
  wireframe-first.md
  figma-ready.md
  api-first.md
  all-ready.md

skills/
  init-project.md
  classify-case.md
  generate-artifacts.md
  check-readiness.md
  implement-screen.md

_meta/
  workflow-state.template.yaml
```

이 정도만 있어도 바로 쓸 수 있습니다.

## MVP 2차

```txt
도메인 preset 추가
- auth
- list
- detail
- form
- settings
- profile

리뷰 스킬 추가
- design-diff-review
- api-contract-review
- state-coverage-review
- component-usage-review
```

## MVP 3차

```txt
44개 전체 artifact catalog 완성
schema 추가
예제 프로젝트 추가
자동 업데이트 정책 정교화
```

---

# 15. 내가 보기엔 최종 컨셉은 이거예요

이건 “프론트 문서 템플릿”이 아니라:

```txt
LLM이 프론트 프로젝트를 환각 없이 이해하고,
기획/피그마/API/디자인시스템의 준비 상태에 따라
문서와 구현을 단계적으로 진행하게 만드는
Frontend Workflow Skill Pack
```

입니다.

핵심 구성요소는:

```txt
1. Artifact Catalog
   - 어떤 문서들이 있는지 정의

2. Templates
   - 각 문서의 작성 양식

3. Case Matrix
   - 현재 상황을 어떻게 분류할지 정의

4. Workflow State
   - 이 프로젝트의 현재 진행 상태

5. Domain Presets
   - auth, list, form, detail 등 도메인별 규칙

6. Skill Prompts
   - init, scan, classify, generate, update, implement, review

7. Readiness Gates
   - 언제 어디까지 구현 가능한지 판단

8. Update / Conflict Policy
   - 새 자료가 들어왔을 때 어떻게 반영할지 정의
```

특히 중요한 건 이 두 가지입니다.

```txt
문서를 생성하는 스킬과 코드를 구현하는 스킬을 분리한다.
```

그리고:

```txt
구현 가능 여부를 LLM의 감으로 판단하지 말고 readiness gate로 판단한다.
```

이렇게 해두면 네가 말한 것처럼 추후에:

```txt
피그마 업데이트됨 → update-from-figma 호출
API 확정됨 → update-from-api 호출
기획 변경됨 → update-from-planning 호출
구현 가능한 화면 확인 → check-readiness 호출
조건 충족 화면 구현 → implement-screen 호출
구현 후 검증 → review-screen 호출
```

이런 식으로 워크플로우가 자연스럽게 굴러갑니다.

결론적으로 방향은 아주 좋고, 여기에 **workflow-state / case tag / readiness gate / update policy / conflict policy**를 추가하면 단순 템플릿 묶음이 아니라 꽤 실용적인 프론트 LLM 개발 시스템이 될 것 같아요.
