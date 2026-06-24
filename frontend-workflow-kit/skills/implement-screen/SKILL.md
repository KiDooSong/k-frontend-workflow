---
name: implement-screen
description: 지정된 Screen ID를 readiness gate가 허용하는 모드와 경로 안에서만 구현한다. 사용자가 "화면 구현", "implement screen", "이 화면 만들어줘" 등을 요청할 때 사용. workflow 스크립트 출력만 단일 출처로 소비하고, Open Decision/Unknown/정책 승격을 사람이 닫기 전에는 추측 구현하지 않는다.
---

# implement-screen

화면 하나를 현재 workflow surface 기준으로 구현한다. 이 스킬은 **구현 가능 여부를 직접 판단하지 않는다.**
`workflow:state` / `workflow:readiness` / `workflow:validate` 와 관련 스크립트 출력을 단일 출처로 소비한다.

> **통과는 승인이 아니다.** readiness pass 는 기계적 상한이고, validate pass 는 구조 검증이다.
> 제품 의도, 디자인 확정, confirmed 승격, Open Decision resolve, Unknown close, Component Gap accept 는 사람이 한다.
> 애매함이 남아 있으면 구현보다 먼저 표면화한다.

## 입력

- 대상 Screen ID (예: `COUPON-001`). 없으면 사용자에게 묻는다.
- 선택 입력:
  - project root (`--root` 또는 repo/script 기본값)
  - docs dir (`--docs`)
  - src dir (`--src`)
  - layout path (`--layout`)
  - policy/readiness 관련 path (`--policy`, readiness output path 등 repo가 제공하는 옵션)
  - 내부 repo adoption context 또는 monorepo package/root 정보

입력이 없으면 repo의 configured npm scripts/defaults 를 따른다. monorepo에서는 `src` 가 repo root에 있다고 가정하지 않는다.
사용자나 repo가 `--docs`, `--src`, `--root`, `--layout`, policy path 를 제공하면 모든 state/readiness/validate/policy 명령에 같은 기준으로 전달한다.

## 핵심 불변식

- readiness 판정은 스스로 재구현하지 않는다.
- 항상 workflow 스크립트를 실행하고 그 출력을 소비한다.
- `allowed_paths` 안의 파일만 수정한다.
- `forbidden_paths` 는 절대 수정하지 않는다.
- 생성 파일은 직접 수정하지 않고 스크립트로 재생성한다.
- readiness pass 를 design/product approval 로 보고하지 않는다.
- Open Decisions 를 resolve 하지 않는다.
- Unknowns 를 close 하지 않는다.
- Component Gap 을 accept 하지 않는다.
- `status: confirmed` 로 승격하지 않는다.
- live policy 파일을 draft로 교체하지 않는다.
- CI/pre-edit hard gate 승격을 하지 않는다.
- 애매한 요구, 충돌, 소스 간 불일치는 구현 전에 보고한다.

## 절차

### 1. 입력 정합성 preflight

1. 대상 화면과 관련된 Reconciliation Register 가 있으면 확인한다.
   - 관련 input 이 `not-started` 또는 `in-progress` 면 멈추고 먼저 reconcile 하라고 보고한다.
   - `reconciled` 가 Open Decision/Conflict/Unknown 을 만들었으면 직접 닫지 않는다. readiness 가 구현 가능 여부를 결정하게 둔다.
2. repo configured command 를 기준으로 상태와 readiness 를 실행한다.

   ```bash
   npm run workflow:state
   npm run workflow:readiness -- --screen <ID> --json
   ```

   project/docs/src/layout/policy 옵션이 필요한 repo에서는 같은 옵션을 붙인다.
3. readiness JSON 은 screen id 아래에서 읽는다. 필수 필드:
   - `readiness_mode`
   - `allowed_paths`
   - `forbidden_paths`
   - `blocking`
   - `next_actions`
   - mode/policy/layer metadata 가 있으면 함께 읽는다.
4. readiness 가 구현을 막으면 `blocking` 과 `next_actions` 를 보고하고 멈춘다.
5. 구현 가능하면 짧은 implementation plan 을 먼저 만든다.
   - mode
   - allowed edit surfaces
   - forbidden surfaces
   - source-of-truth docs/artifacts
   - 구현 범위 밖으로 남는 Unknown/Open Decision/Conflict/Gap

### 2. 컨텍스트 로드

대상 화면/도메인에 필요한 산출물만 읽는다. 다른 도메인 문서를 넓게 로드하지 않는다.

공통으로 확인할 수 있는 항목:

- ScreenSpec
- Domain rules / flows
- Navigation map
- Component catalog / component guidelines
- Component Gap Register
- Open Decisions
- Conflicts
- Unknowns
- API manifest / OpenAPI references (API 작업이 readiness 로 허용되거나 사용자 scope에 있을 때)
- workflow-state/readiness output

Visual/Figma 관련 항목이 있으면:

- `figma-component-mapping.md`
- Visual Spec section
- Provenance
- Data Corrections / Override Log
- Assets
- Gaps / Open
- Cross-links
- 관련 visual/testID/reconcile input artifacts

QA/testID 관련 항목이 있으면:

- reconciled testID intake note/artifact
- selector/test automation guidance
- reconciliation output 의 QA 입력

Tier3/policy 관련 항목이 있으면:

- project-layout / resolved layout reference
- layer inventory
- `implementation-mode-policy.draft.yaml`
- `implementation-mode-policy.migration.md`
- live `policies/implementation-mode-policy.yaml` 은 읽기 전용 context 로만 사용한다. readiness 와 사용자 scope가 명시적으로 허용하지 않는 한 편집 target 이 아니다.

## 모드별 구현 규칙

- 항상 readiness 의 `allowed_paths` / `forbidden_paths` 를 따른다.
- `route-skeleton`, `screen-skeleton`, `rough-fixture-ui` 같은 early mode 에서는 API/client/data layer 를 건드리지 않는다. 단 readiness 출력이 구체 path 를 허용한 경우만 예외다.
- fake hooks / fixtures 는 해당 mode의 의도된 패턴일 때만 사용한다. 이 스킬은 더 이상 "`useXxx` fake hook only" 를 전역 규칙으로 두지 않는다.
- `final-fixture-ui` 에서도 readiness 가 허용하지 않으면 real API integration 을 하지 않는다. confirmed/candidate visual mapping 은 evidence 로만 쓰고, 빠진 값을 발명하지 않는다.
- `api-integrated-ui` 에서는 readiness 출력이 해당 concrete path 를 `allowed_paths` 에 포함할 때만 real API/client/data edit 을 한다.
- custom Tier3 layer(`repository`, `data_source`, `mapper`, `use_case`, `view_model` 등)는 concrete path 가 `allowed_paths` 에 있고 `forbidden_paths` 에 없을 때만 수정한다.
- `src/api/**` 를 항상 금지라고 가정하지 않는다. 현재 readiness policy 출력이 결정한다.
- custom layer 가 반드시 `roles.<layer>` binding 을 요구한다고 가정하지 않는다. readiness 가 explicit layer globs 로 materialize 할 수 있다.

## Visual / Figma 규칙

- Figma mapping 은 visual source of truth 이고 behavior source of truth 가 아니다.
- ScreenSpec 이 behavior source of truth 다:
  - state
  - routing
  - filtering
  - sorting
  - API semantics
  - tab semantics
- Visual Spec 은 spacing, layout, assets, token IDs, visual component mapping 을 안내한다.
- token/provenance-backed value 를 우선한다.
- raw/inferred/unresolved visual value 는 final 값처럼 조용히 하드코딩하지 않는다.
  - 허용된 파일 안에서 TODO/comment 로 남기거나,
  - documented process 로 Unknown / Verification / Open Decision / Conflict 를 보고한다.
- Component Catalog 에 없는 shared/common component 를 직접 만들지 않는다. Component Gap flow 를 제안하거나 기존 컴포넌트를 사용한다.
- Figma 가 ScreenSpec 또는 resolved decision 과 충돌하면 멈추고 reconcile/conflict/Open Decision 으로 올린다.

## testID / QA 규칙

- testID/selector guidance 는 reconciled 된 경우에만 사용한다.
- global testID naming convention 을 발명하지 않는다.
- confirmed/reconciled testID 요구가 있고 대상 파일이 readiness 로 허용되면 local scope 에 적용한다.
- selector 가 unresolved UI structure 에 의존하면 멈추고 Open Decision 또는 Verification item 으로 표면화한다.
- tests/QA automation 파일은 readiness 가 해당 path 를 허용하고 사용자가 그 scope 를 요청했을 때만 수정한다.
- 생성 파일은 건드리지 않는다.

## Policy draft / migration 규칙

- `implementation-mode-policy.draft.yaml` 과 `implementation-mode-policy.migration.md` 는 review artifact 다.
- 구현 경계가 애매할 때 context 로 읽을 수 있다.
- live `policies/implementation-mode-policy.yaml` 을 draft 로 교체하지 않는다.
- hard gate, CI, pre-edit hook 을 승격하지 않는다.
- 구현 중 boundary mismatch 를 발견하면 allowed path 밖 ad-hoc edit 으로 고치지 않는다. policy migration/reconcile follow-up 으로 보고한다.

## 생성 파일 / source roots

다음은 직접 편집하지 않는다.

- `_meta/workflow-state.yaml`
- `_meta/screen-inventory.yaml`
- `_meta/layer-inventory.yaml`
- component catalog generated outputs
- route-tree/nav-graph generated outputs
- policy draft outputs (`workflow:policy-draft` 같은 명령이 이번 task 의 명시 scope 로 생성하는 경우만 예외)

필요하면 스크립트로 재생성한다. monorepo에서는 모든 명령이 project root/src/docs/layout 옵션을 존중해야 하며, repo-root `src` 를 가정하지 않는다.

## 검증

구현 뒤에는 가능한 가장 작은 관련 lint/test 를 먼저 실행한다. 그리고 항상 실행한다.

```bash
npm run workflow:state
npm run workflow:readiness -- --screen <ID> --json
npm run workflow:validate
```

policy/layout boundary 또는 Tier3 layer 를 건드렸다면 가능한 경우 `npm run workflow:policy-draft` 도 실행한다.
visual/testID artifact 를 사용했다면 evidence 로 어떻게 소비했는지, 남은 gap/Unknown/Decision 이 있는지 보고한다.

최종 보고에는 다음을 포함한다.

- 변경 파일
- readiness mode before/after (의미 있을 때)
- validation 결과
- 남은 Open Decision / Unknown / Conflict / Component Gap
- 의도적으로 하지 않은 일(API 통합, live policy replacement, generated file direct edit, CI/pre-edit hard gate 승격 등)

## 금지

- readiness 가 허용하지 않는 모드나 경로의 작업
- `forbidden_paths` 수정
- API endpoint / DTO / 디자인 값 / copy / selector convention 추측
- 생성 파일 직접 편집
- Open Decision resolve, Unknown close, Component Gap accept, confirmed 승격
- live policy replacement
- CI/pre-edit hard gate promotion
- readiness pass 또는 validate pass 를 제품 승인으로 보고
