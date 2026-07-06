---
name: implement-screen
description: 지정된 Screen ID를 readiness gate가 허용하는 모드와 경로 안에서만 구현한다. 사용자가 "화면 구현", "implement screen", "이 화면 만들어줘" 등을 요청할 때 사용. workflow 스크립트 출력만 단일 출처로 소비하고, Open Decision/Unknown/정책 승격을 사람이 닫기 전에는 추측 구현하지 않는다.
---

# implement-screen

지정된 Screen ID 를 readiness gate 가 허용하는 모드·경로 안에서만 구현한다. 이 스킬은 **구현 가능 여부를 직접 판단하지 않는다** —
`workflow:state` / `workflow:readiness` / `workflow:validate` 출력만 단일 출처로 소비한다.

이 스킬은 [workflow spine](../../docs/reference/workflow-spine.md) 의 **Stage 06** 다. 운영 절차 정본:
[Stage 06 doc](../../docs/reference/workflow-stages/06-implement-screen-or-code.md). 어떤 사실이 어느 문서에 사는지:
[doc-ownership.md](../../docs/reference/doc-ownership.md).

> **통과는 승인이 아니다.** readiness pass 는 기계적 상한, validate pass 는 구조 검증이다. 제품 의도·디자인 확정·`confirmed`
> 승격·Open Decision resolve·Unknown close·Component Gap accept 는 사람이 한다. 애매함이 남으면 구현보다 먼저 표면화한다.

## 입력
- 대상 Screen ID (예: `COUPON-001`). 없으면 사용자에게 묻는다.
- (선택) project root/docs/src/layout/policy 옵션. 사용자나 repo 가 `--docs`, `--src`, `--root`, `--layout`, policy path 를 제공하면
  **모든** state/readiness/validate 명령에 같은 기준으로 전달한다. monorepo 에서 `src` 가 repo root 에 있다고 가정하지 않는다.
  route/screen/API 관례는 [CONVENTIONS.md](../../CONVENTIONS.md).

## 핵심 불변식
- readiness 판정을 **스스로 재구현하지 않는다** — 항상 스크립트를 실행하고 그 출력을 소비한다.
- **`allowed_paths` 안만 수정**, **`forbidden_paths` 는 절대 수정하지 않는다.** ScreenSpec `screen_entry` 는 구현 파일 **힌트일 뿐
  권한이 아니다** — readiness 를 넓히지 않는다.
- 화면 identity 가 없거나 raw source 코드면 먼저 **[Stage 02](../../docs/reference/workflow-stages/02-screen-identity-source-mapping.md)** 로 푼다.
- 관련 입력이 `not-started`/`in-progress`/`failed` 면 **멈추고** 같은 row 로 reconcile 을 끝낸다([Stage 04](../../docs/reference/workflow-stages/04-reconcile-input.md)).
- generated 파일은 직접 수정하지 않고 스크립트로 재생성한다([generated-files.md](../../docs/reference/generated-files.md)).
- readiness/validate pass 를 design/product approval 로 보고하지 않는다.
- Open Decision resolve, Unknown close, Component Gap accept, `confirmed` 승격, live policy 교체, CI/pre-edit hard gate 승격을 하지 않는다.

## 1. Preflight (readiness 우선)
1. 대상 화면 관련 Reconciliation Register 를 확인한다. 관련 input 이 `not-started`/`in-progress`/`failed` 면 멈추고, 같은 `input_id`
   row 로 reconcile 을 시작/재개하라고 보고한다([Stage 04](../../docs/reference/workflow-stages/04-reconcile-input.md)).
   `reconciled` 가 만든 Open Decision/Conflict/Unknown 은 직접 닫지 않는다 — readiness 가 판단하게 둔다.
2. 상태와 readiness 를 실행한다(필요한 repo 는 같은 project/docs/src/layout/policy 옵션을 붙인다):
   ```bash
   npm run workflow:state
   npm run workflow:readiness -- --screen <ID> --json
   ```
3. readiness JSON 을 screen id 아래에서 읽는다: `readiness_mode`, `allowed_paths`, `forbidden_paths`, `blocking`,
   `next_actions` (+ mode/policy/layer metadata).
4. readiness 가 막으면 `blocking`·`next_actions` 를 보고하고 멈춘다.
5. 구현 가능하면 짧은 plan 을 먼저 만든다: mode, 허용/금지 surface, source-of-truth 문서, 범위 밖으로 남기는 Unknown/Decision/Conflict/Gap.

## 2. 컨텍스트 로드 (대상 화면/도메인만)
필요한 산출물만 읽는다(다른 도메인 문서를 넓게 로드하지 않는다): ScreenSpec, domain rules/flows, navigation map,
component catalog + component-gap-register, Open Decisions/Conflicts/Unknowns, API manifest(해당 시), state/readiness 출력.
- 시각/Figma·testID·Tier3 항목이 있으면 해당 reconcile 산출물(`figma-component-mapping.md`, testID intake note,
  `implementation-mode-policy.draft.yaml`·`implementation-mode-policy.migration.md`)을 **읽기 context** 로 본다.
  live `policies/implementation-mode-policy.yaml` 도 읽기 전용 context 다.
- 작업이 visual/Figma/design 정렬이거나 **여러 화면**에 걸치면
  [visual-reconciliation.md](../../docs/reference/visual-reconciliation.md) 와 visual consistency contract
  (`design/visual-consistency-contract.md`, 있으면)를 읽는다.
- 2차 산출물 판단은 [task-artifact-matrix.md](../../docs/reference/task-artifact-matrix.md).

## 3. 모드 인지 구현
- 항상 readiness 의 `allowed_paths`/`forbidden_paths` 를 따른다. concrete path 가 allowed 안이고 forbidden 밖일 때만 수정한다
  (`screen_entry`·`route_entry`·custom Tier3 layer 모두 동일). `src/api/**` 를 항상 금지라고 가정하지 않는다 — 현재 readiness policy 출력이 결정한다.
- 모드 상한을 지킨다(`route-skeleton` → … → `api-integrated-ui`): readiness 가 구체 path 를 허용하지 않으면 early mode 에서 API/client/data layer 를 건드리지 않는다.
- 시각 값·selector·endpoint·DTO·copy 를 **발명하지 않는다.** raw/inferred visual 값은 final 처럼 하드코딩하지 말고 허용 파일 내 TODO 또는
  Unknown/VER-/Open Decision 으로 보고한다. (시각 vs 행동 정본 규칙: [input-reconciliation.md](../../docs/reference/input-reconciliation.md) §Visual/Figma; testID: [task-artifact-matrix.md](../../docs/reference/task-artifact-matrix.md).)
- 카탈로그에 없는 공통 컴포넌트가 필요하면 직접 만들지 말고 Gap 을 제안하거나 기존 컴포넌트를 쓴다. **승인돼 `roles.ui_primitive` 아래로 코드가
  들어가면** catalog 를 재생성한다(`workflow:catalog`, [Stage 07](../../docs/reference/workflow-stages/07-regenerate-derived-views.md)).
- per-screen code patch 전에 그 변경이 **shared shell/layout/component 소속인지** 먼저 본다 — visual contract 가
  shell-owned 로 선언한 logo/header/CTA 를 화면 파일에 ad-hoc 으로 넣지 않는다(계약: [visual-reconciliation.md](../../docs/reference/visual-reconciliation.md)).
  shared 표면 수정도 readiness `allowed_paths` 안일 때만 한다.
- Figma 가 ScreenSpec 또는 resolved decision 과 충돌하면 멈추고 reconcile/conflict/Open Decision 으로 올린다.

## 4. 검증 / 핸드오프
구현 뒤 가장 작은 관련 lint/test 를 먼저 돌리고, 그리고 항상:
```bash
npm run workflow:state
npm run workflow:readiness -- --screen <ID> --json
npm run workflow:validate
```
visual/Figma 정렬 구현이었다면 추가로 `npm run workflow:visual-consistency -- --docs <docsDir> --src <srcDir> --json`
을 돌린다 — state/readiness/validate 에 준 **동일한 `--docs`/`--src` 기준**을 그대로 전달한다
(`--src` 를 빼면 직접 import/ad-hoc positioning/copy 소스 검사가 skip 된다).
**warning-first 진단이지 gate/approval 이 아니다**. warning 은 후속 후보로 보고만 한다.
2차 산출물·재생성 트리거는 [task-artifact-matrix.md](../../docs/reference/task-artifact-matrix.md) /
[generated-files.md](../../docs/reference/generated-files.md) 로 확인한다(예: `roles.ui_primitive` 변경→`workflow:catalog`,
route/nav 변경→`workflow:route-tree`·`workflow:nav-graph`·route cross-check, policy/Tier3 변경→`workflow:policy-draft`).
generated 파일이 stale 해 보이면 직접 고치지 말고 advisory `workflow:check-generated` 또는 generated-files 의 명령으로 재생성한다.

최종 보고에 포함한다:
- 변경 파일
- readiness mode before/after (의미 있을 때)
- validation 결과
- 남은 Open Decision / Unknown / Conflict / Component Gap
- 의도적으로 하지 않은 일(API 통합, live policy 교체, generated 직접 편집, CI/pre-edit hard gate 승격 등)

## 금지
- readiness 가 허용하지 않는 모드·경로 작업, `forbidden_paths` 수정.
- API endpoint / DTO / 디자인 값 / copy / selector convention 추측.
- generated 파일 직접 편집.
- Open Decision resolve, Unknown close, Component Gap accept, `confirmed` 승격.
- live policy 교체, CI / pre-edit hard gate 승격.
- readiness pass 또는 validate pass 를 제품 승인으로 보고.
