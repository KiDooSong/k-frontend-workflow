# Frontend Workflow Kit — 구현 명세

> ⚠ **현행 정본 주의 (2026-06-14 추가)**: 게이트·검사·티어·모드 사다리의 **현재 정본**은
> [roadmap-current.md](kit-dev/roadmap-current.md) · [open-decisions.md](kit-dev/open-decisions.md) · [README 문서지도](frontend-workflow-kit/README.md#문서-지도)다.
> 이 문서(§5~§8 검사 목록 등)는 **설계 배경·사상**으로 읽되, `decision_cap`·검사 9~12·`screen-skeleton`/`docs-only` 등
> 현행 게이트 세부는 위 정본을 따른다 (이 문서엔 미반영 — 역방향 드리프트, 분석 보고서 P3/P4·P12).

> 목적: [스킬팩 설계(개념)](frontend-workflow-skillpack-concept.md)를 실제로 구현할 때 필요한
> 기계가독 계약을 정의한다 — 스크립트 입출력, 레지스트리, 모드 정책, 명령 고정, 생성물 규약.
> 버전: v1 (2026-06-12)
>
> 독자: 킷을 만드는 구현자. 워크플로우 사용자는 개념 문서만 읽어도 된다.
> 원칙: 이 문서의 모든 계약은 "LLM이 추론하던 것을 파일로 고정한다"는 한 문장으로 요약된다.

---

## 1. 방어선 구조

```txt
1차 방어: Claude hooks        — 편집 시점 즉시 차단/경고. Claude Code 환경에서만 동작
2차 방어: npm run workflow:*  — 도구 무관. Cursor/Codex/CLI/사람 누구나 실행 가능
3차 방어: CI                  — 머지 전 최종 게이트. 회피 불가
```

- 검사 로직은 **scripts/에만** 존재한다. 훅은 npm scripts를 부르는 얇은 wrapper다.
- CI는 `workflow:validate` + `workflow:check-generated` + lint를 실행한다.
- 따라서 Claude Code가 없는 환경에서도 강제 수준은 2차·3차에서 동일하다.

---

## 2. package-scripts.template.json

스킬·훅·CI가 부르는 명령을 고정한다(이름은 단계 무관하게 고정). 스킬 프롬프트는 항상 이 이름으로 호출한다.
단, **MVP-A 에 실제로 배포하는 템플릿에는 동작하는 3개(state/readiness/validate)만 `scripts` 에 둔다.**
나머지는 대상 .mjs 가 아직 없어, 통째로 병합 후 실행하면 'Cannot find module' 로 깨진다 — `//roadmap` 키로 분리해 두고
해당 스크립트가 구현되는 단계(B~D)에 `scripts` 로 옮긴다. 아래는 최종(전 단계 합본) 명령 표면이다.

```json
{
  "scripts": {
    "workflow:state": "node tools/frontend-workflow/scripts/workflow-state.mjs",
    "workflow:readiness": "node tools/frontend-workflow/scripts/readiness.mjs",
    "workflow:validate": "node tools/frontend-workflow/scripts/validate.mjs",
    "workflow:lint-gen": "node tools/frontend-workflow/scripts/lint-gen.mjs",
    "workflow:lint-baseline": "node tools/frontend-workflow/scripts/lint-baseline.mjs",
    "workflow:catalog": "node tools/frontend-workflow/scripts/catalog-gen.mjs",
    "workflow:nav": "node tools/frontend-workflow/scripts/nav-graph.mjs",
    "workflow:route-tree": "node tools/frontend-workflow/scripts/route-tree.mjs",
    "workflow:check-generated": "node tools/frontend-workflow/scripts/check-generated-files.mjs"
  }
}
```

---

## 3. Generated Block Convention

생성물 또는 생성 섹션에는 반드시 마커를 넣는다. 마커가 없으면 사람과 LLM이 생성물을 편집한다.

### 문서 내 생성 섹션 (예: ScreenSpec의 Entry Points)

```md
## Entry Points
<!-- GENERATED:START nav-graph -->
<!-- DO NOT EDIT MANUALLY. `npm run workflow:nav` 가 채웁니다. -->
<!-- GENERATED:END nav-graph -->
```

- 템플릿에는 **빈 블록만** 둔다 (예시 bullet 금지 — LLM이 따라 쓴다).
- 생성기는 START/END 사이만 교체한다. 블록 밖 내용은 건드리지 않는다.

### 생성 파일 헤더 — Markdown

```md
<!--
GENERATED FILE — DO NOT EDIT

Source:  src/components/ui/**
Command: npm run workflow:catalog
업데이트하려면: 원본 컴포넌트를 수정하고 위 명령을 실행
-->
```

### 생성 파일 헤더 — YAML / JS

```yaml
# GENERATED FILE — DO NOT EDIT
# Source:  docs/frontend-workflow/domains/**/screen-spec.md (frontmatter)
# Command: npm run workflow:state
```

### 적용 대상

```txt
ScreenSpec의 Entry Points 섹션
_meta/workflow-state.yaml
_meta/screen-inventory.yaml
_meta/route-tree.txt
_meta/nav-graph.yaml
design/component-catalog.md
eslint.workflow.config.mjs
```

`check-generated-files.mjs`는 마커/헤더 없는 생성물, 수동 편집 흔적(헤더 훼손)을 검출한다.

---

## 4. artifact-manifest.yaml — 산출물 레지스트리

스킬팩의 핵심 레지스트리. **스킬이 "어떤 문서를 어디에 만들지"를 추론하지 않고 여기서 읽는다.**
경로 표기는 `{domain}`, `{screen}` 플레이스홀더를 사용한다.

```yaml
# catalog/artifact-manifest.yaml
artifacts:
  screen-spec:
    kind: authoring                 # authoring | generated
    scope: screen                   # global | app | design | api | domain | screen
    path: docs/frontend-workflow/domains/{domain}/screens/{screen}/screen-spec.md
    template: templates/screen/screen-spec.template.md
    required_frontmatter:
      - artifact_id
      - artifact_type
      - domain
      - screen_id
      - route
      - status
    generated_sections:
      - { name: entry-points, generator: nav-graph }
    required_for:                   # readiness gate 연결
      - screen-skeleton
      - rough-fixture-ui

  navigation-map:
    kind: authoring
    scope: app
    path: docs/frontend-workflow/app/navigation-map.md
    template: templates/app/navigation-map.template.md
    required_frontmatter: [artifact_id, artifact_type, status]

  component-catalog:
    kind: generated
    scope: design
    path: docs/frontend-workflow/design/component-catalog.md
    command: npm run workflow:catalog
    source: [src/components/ui/**]
    do_not_edit: true

  screen-inventory:
    kind: generated
    scope: global
    path: docs/frontend-workflow/_meta/screen-inventory.yaml
    command: npm run workflow:state
    source: [docs/frontend-workflow/domains/**/screen-spec.md]
    do_not_edit: true

  api-manifest:
    kind: authoring
    scope: api
    path: docs/frontend-workflow/api/api-manifest.md
    template: templates/api/api-manifest.template.md
    rules:
      - "zod 코드를 넣지 않는다. src/api/schemas/*.ts 를 링크한다"
      - "confirmed 항목은 OpenAPI 존재 시 OpenAPI로 이관한다"
```

`validate.mjs`는 이 레지스트리를 기준으로 누락 frontmatter, 잘못된 경로, do_not_edit 위반을 검사한다.

---

## 5. workflow-state.mjs — 상태 집계기

frontmatter와 본문을 파싱해 대시보드를 생성한다. **파생 카운트는 여기서만 계산한다**
(frontmatter에 tbd_count를 수동 기재하지 않는 이유).

### 입력과 파싱 규칙

| 산출 값 | 출처 | 규칙 |
|---|---|---|
| 문서 status/route/domain 등 | frontmatter | 그대로 수집 |
| state_matrix_complete | 본문 State Matrix 표 | 필수 상태(loading/empty/error/success/disabled/refreshing) 행이 모두 있으면 true |
| interaction_matrix_complete | 본문 Interaction Matrix 표 | 표 존재 + Result 컬럼 비어있지 않음 |
| copy_keys_has_tbd | 본문 Copy Keys 표 | Status 컬럼에 tbd 존재 여부 |
| tbd_count / unknown_count | 본문 Unknowns 표 | open 상태 행 수 |
| api_confidence_min | 본문 API Candidates | 항목 중 가장 낮은 confidence |
| fake_hook_exists | 파일시스템 | ScreenSpec의 hook 경로 규약(src/features/{domain}/hooks/) 실재 여부 |
| figma_mapping_status | 파일시스템 + frontmatter | figma-component-mapping.md 존재 및 status |

### 출력

```yaml
# _meta/workflow-state.yaml  (GENERATED)
generated_at: 2026-06-12
screens:
  COUPON-001:
    status: draft
    derived:
      state_matrix_complete: true
      copy_keys_has_tbd: true
      tbd_count: 3
      api_confidence_min: candidate
      fake_hook_exists: true
      figma_mapping_status: missing
```

```yaml
# _meta/screen-inventory.yaml  (GENERATED)
screens:
  - { id: COUPON-001, domain: coupons, route: "/(tabs)/coupons", status: draft }
  - { id: COUPON-002, domain: coupons, route: "/coupons/[id]", status: draft }
checks:
  duplicate_ids: []
  duplicate_routes: []
```

---

## 6. readiness.mjs — 입출력 계약

### 입력

```txt
- _meta/workflow-state.yaml (derived 값 포함 — 직접 파싱하지 않고 state 산출물을 읽는다)
- catalog/artifact-manifest.yaml (required_for 매핑)
- policies/implementation-mode-policy.yaml (모드별 requires/경로)
- CI 결과 (있으면: lint pass 여부, ratchet baseline 비교)
```

### 출력 (화면별)

```yaml
# npm run workflow:readiness 출력 예
COUPON-001:
  readiness_mode: rough-fixture-ui
  allowed_paths:
    - src/features/coupons/screens/**
    - src/features/coupons/components/**
  forbidden_paths:
    - src/api/**
    - openapi.yaml
  blocking:
    - figma_mapping: missing
    - api_confidence: candidate
  next_actions:
    - create figma-component-mapping
    - confirm coupon API (U-003 해소 필요)
```

`implement-screen` 스킬은 이 출력의 allowed/forbidden_paths를 그대로 따른다.
`pre-edit-mode-guard` 훅도 같은 출력을 읽는다 — 판정 로직의 중복 구현 금지.

---

## 7. implementation-mode-policy.yaml — 모드별 허용/금지 경로

```yaml
# policies/implementation-mode-policy.yaml
modes:
  route-skeleton:
    requires:
      - stub_screen_specs_count > 0
      - navigation-map.status >= draft
    allowed_paths:
      - src/app/**
    forbidden_paths:
      - src/features/**
      - src/api/**

  rough-fixture-ui:
    requires:
      - screen-spec.status >= draft
      - component-catalog.generated == true
      - fake_hook_exists == true
    allowed_paths:
      - src/features/{domain}/screens/**
      - src/features/{domain}/components/**
      - src/features/{domain}/hooks/**
    forbidden_paths:
      - src/api/**
      - openapi.yaml

  final-fixture-ui:
    requires:
      - screen-spec.status >= confirmed
      - figma_mapping_status >= draft
    allowed_paths:
      - src/features/{domain}/screens/**
      - src/features/{domain}/components/**
    forbidden_paths:
      - src/api/**

  api-integrated-ui:
    requires:
      - api_confidence_min == confirmed
      - state_matrix_complete == true
    allowed_paths:
      - src/features/{domain}/hooks/**     # hook 내부 교체
      - src/api/**
    forbidden_paths:
      - src/features/{domain}/screens/**   # 화면은 건드리지 않는다 (fake hook 계약)

  production-ready:
    requires:
      - ci.lint == pass
      - ci.schema_validation == pass
      - state_coverage_complete == true
      - llm_semantic_review == pass
```

---

## 8. validate.mjs — 검사 목록

```txt
1. frontmatter ↔ frontmatter.schema.json 검증
2. artifact-manifest 기준 필수 frontmatter 누락 검출
3. 끊어진 참조: depends_on 대상 부재, sources 링크 파일 부재
4. 이동 대상 부재: Interaction Matrix의 Result route가 screen-inventory에 없음
5. screen_id 중복, route 중복
6. do_not_edit 산출물의 GENERATED 헤더/마커 훼손
7. confirmed 문서의 승인 메타데이터(approved_by/approved_at) 누락
8. API Candidates에 confirmed 표기됐는데 zod 스키마 파일/OpenAPI 항목이 없는 경우
```

exit code 0/1로 CI 게이트가 된다.

---

## 9. 생성기 명세 (요약)

| 스크립트 | 입력 | 출력 | 비고 |
|---|---|---|---|
| catalog-gen.mjs | src/components/ui/** (TS props) | design/component-catalog.md | react-docgen-typescript 또는 TS compiler API |
| nav-graph.mjs | 모든 screen-spec의 Interaction Matrix + navigation-map의 Cross-Domain Edges | _meta/nav-graph.yaml + 각 ScreenSpec의 Entry Points GENERATED 블록 | 블록 밖은 수정 금지 |
| route-tree.mjs | src/app 파일 트리 | _meta/route-tree.txt | Expo Router 규칙(그룹/동적 세그먼트) 해석 |
| lint-gen.mjs | docs/frontend-workflow/_meta/lint-policy.yaml + frontend-architecture.md(경로) | eslint.workflow.config.mjs | 기존 설정 뒤 합성. enabled:false는 생략 |
| lint-baseline.mjs | lint-policy의 ratchet 정책 | 정책별 baseline 기록/비교 | 증가 시 exit 1 |

---

## 10. hooks — npm scripts의 얇은 wrapper

| 훅 | 호출 | 동작 |
|---|---|---|
| pre-edit-confirmed-doc | (frontmatter 직접 읽기 — 빠른 경로) | 대상 status==confirmed면 차단, 사유 출력 |
| pre-edit-generated-file | workflow:check-generated 의 대상 목록 | 생성물 편집 차단, 원본+명령 안내 |
| pre-edit-mode-guard | workflow:readiness 출력 캐시 | forbidden_paths 편집 차단 |
| post-edit-lint-policy | workflow:lint-gen | docs/frontend-workflow/_meta/lint-policy.yaml 변경 시 재생성 |
| post-implement-validate | workflow:validate | 구현 작업 종료 시 검증 실행 |

훅이 없는 환경에서는 같은 검사가 2차(npm)·3차(CI)에서 잡힌다 — 강제 수준의 차이는 "언제 알게 되는가"뿐이다.

---

## 11. MVP 구현 계획 (상세)

각 단계는 이전 단계만으로 운영 가능하다. **A를 끝내면 바로 실프로젝트 한 화면으로 운영 테스트한다.**

### MVP-A: 문서 생성과 readiness만

```txt
구현물:
  templates: screen-spec(통합형+stub), navigation-map(뼈대), llm-rules, domain-rules
  scripts:   workflow-state.mjs, readiness.mjs, validate.mjs   ← 스크립트는 이 3개뿐
  skills:    implement-screen
  schemas:   frontmatter.schema.json
  registry:  artifact-manifest.yaml (위 산출물 등록분만)
  examples:  coupon-feature golden example
임시 허용:
  Entry Points 수동 작성 (nav-graph는 C에서)
  Component Catalog 수동 작성 (catalog-gen은 C에서)
완료 기준:
  실프로젝트 화면 1개를 stub→spec→구현→validate 사이클로 완주
```

### MVP-B: lint-policy 적응

```txt
lint-policy.template.yaml + lint-policy.schema.json (canonical path: docs/frontend-workflow/_meta/lint-policy.yaml)
lint-gen.mjs + lint-baseline.mjs
policies 4종(no-fetch-in-screens, layer-boundaries, no-adhoc-buttons, no-arbitrary-style-values)
presets/eslint-flat + adoption/rollout-ratchet.md
adapt-lint-pack 스킬
완료 기준: 기존 린트가 있는 브라운필드 1곳에 충돌 없이 합성
```

### MVP-C: generated views

```txt
catalog-gen.mjs / nav-graph.mjs / route-tree.mjs / check-generated-files.mjs
generated block convention 적용 (Entry Points 수동 허용 종료)
update-from-figma / update-from-api / scan-context / classify-tags 스킬
screen-patterns: list, form, detail
완료 기준: 수동 작성하던 전역 뷰 3종이 전부 생성물로 전환
```

### MVP-D: Claude Code 통합 + 완성

```txt
hooks 5종 (10장)
semantic-reviewer 에이전트 + review-screen 스킬
staleness.mjs, presets/eslint-legacy·biome
나머지 카탈로그/템플릿, tag-matrix 정교화, domain-rules 확충
Claude Code 플러그인 배포 (marketplace)
```

---

## 12. 구현 시 주의

```txt
- 판정 로직을 두 곳에 만들지 않는다. readiness 판정은 readiness.mjs 한 곳,
  훅과 스킬은 그 출력을 소비만 한다.
- 생성기는 멱등(idempotent)해야 한다. 같은 입력 → 같은 출력, diff 노이즈 금지
  (정렬 고정, 타임스탬프는 generated_at 한 줄만).
- 스크립트는 의존성 최소화 (Node 내장 + gray-matter/yaml 정도). 킷 설치가 무거우면 안 쓴다.
- 모든 스크립트는 --json 출력 모드를 지원한다 (스킬이 파싱하기 위해).
```
