---
name: reconcile-input
description: 외부 입력 스킬이 저장한 새 입력 결과물(input_id 보유)을 기존 frontend-workflow 문서와 대조해 simple-update/decision/conflict 등으로 분류하고, Reconciliation Register에 register-first로 처리 이력을 남긴다. 사용자가 "입력 반영", "reconcile input", "이 입력 맞춰줘"를 요청하거나 새 Figma/기획/API/회의록/QA 입력을 가져왔을 때 사용. 충돌을 직접 해결하지 않고, 게이트는 Open Decision(readiness)이 건다.
---

# reconcile-input

새 입력 결과물(`input_id` 보유)을 기존 산출물과 대조해 분류하고, 처리 이력을 Reconciliation Register에 남긴다.
**충돌을 조용히 해결하지 않는다** — LLM은 게이트를 올리기만 하고, 게이트는 Open Decision(readiness)이 건다.

이 스킬은 [workflow spine](../../docs/reference/workflow-spine.md) 의 **Stage 04** 다. 운영 절차 정본은
[Stage 04 doc](../../docs/reference/workflow-stages/04-reconcile-input.md), 전체 계약은
[input-reconciliation.md](../../docs/reference/input-reconciliation.md). 어떤 사실이 어느 문서에 사는지는
[doc-ownership.md](../../docs/reference/doc-ownership.md) 를 본다.

## 언제 쓰나
- 사용자가 "입력 반영", "reconcile input", "이 입력 맞춰줘"를 요청할 때.
- 새 Figma/기획/API/회의록/QA 입력 결과물(`IN-*.md`)을 기존 문서에 반영해야 할 때.

## 입력
- 입력 결과물 경로 (`docs/frontend-workflow/inputs/{input_id}.md`, 또는 그룹 하위 `inputs/{domain}/{input_id}.md`).
  없으면 사용자에게 묻는다. 매칭 키는 경로가 아니라 **`input_id`** 이고, inputs/ 는 재귀 스캔한다.
  `inputs/README.md`·`index.md` 는 입력 결과물이 아니다.
- (선택) 대상 screen/domain.

## 핵심 불변식
- **register-first**: 어떤 문서 수정보다 **먼저** register에 행을 쓴다(없으면 생성).
- **gate raising only**: open 추가 / `resolved→open` 재오픈, Conflict·Unknown·Gap·INV-/VER- 생성까지만.
  resolve / close / accept / `confirmed` 승격은 **사람** 전용.
- **코드·테스트·생성 파일을 직접 수정하지 않는다.** 입력은 문서·레지스터·리뷰 draft 로만 반영한다.
- **canonical 화면 identity는 워크플로우가 소유**하고 source 코드(planning/design/node id)는 alias 다.
  reconcile-input 은 source 코드나 `raw:flow/...` 로 canonical Screen ID 를 발명하지 않는다. raw token 이면
  screen-level write 를 멈추고 **[Stage 02](../../docs/reference/workflow-stages/02-screen-identity-source-mapping.md)** 로
  screen identity 를 보낸다. 입력 전체를 failed 로 취급하지 말고, source-backed domain/app-level facts 는
  [flow-shaped/domain-level routing](../../docs/reference/input-reconciliation.md#flow-shaped--domain-level-input)에 따라 reconcile 할 수 있다.
- `input_id` 는 불변. 내용이 바뀌면 같은 id 를 덮어쓰지 말고 **새 id + supersedes**.
- 세 status 축은 별개 라이프사이클: 입력 frontmatter `status` ≠ register `Reconcile Status` ≠ 자식 항목(D-/C-/U-/G-/INV-/VER-).

## 같은 input_id 재시도 (register row 재사용)
Register에서 같은 `input_id` 행을 먼저 찾고 `Reconcile Status` 에 따라 처리한다 — **새 행을 늘리지 않는다**:
- `reconciled` → **멈춘다.** 같은 입력은 이미 처리됐다. 재처리는 새 `input_id` + `supersedes`.
- `in-progress` → **그 행을 이어서** 처리한다.
- `failed` → 새 행을 만들지 않는다. 같은 행을 `in-progress` 로 재개하고 이전 실패 사유를 `Result` 에 보존한다.
- `not-started` → 같은 행을 `in-progress` 로 이동한다.
- 없음 → 새 행을 `in-progress` 로 **먼저** 쓴다(문서 수정 전).
- invalid enum / duplicate row / missing column → 먼저 register 구조를 수리한다.

전체 retry·check 12 severity·8컬럼 스키마: [input-reconciliation.md](../../docs/reference/input-reconciliation.md) /
템플릿 [reconciliation-register.template.md](../../templates/meta/reconciliation-register.template.md).

## 절차 (register-first)
1. 입력 결과물을 읽고 canonical frontmatter 와 `input_id` 를 확인한다(멱등성·역추적 키).
2. 위 "같은 input_id 재시도" 표대로 register 행을 만들거나 재개한다 — **어떤 문서 수정보다 먼저**.
3. `affected_domains`/`affected_screens`(구 `suggested_scope`) 기준으로 관련 산출물만 연다.
   종류별 1차 산출물은 아래 라우팅 표, 2차 산출물은 [task-artifact-matrix.md](../../docs/reference/task-artifact-matrix.md).
4. `affected_screens` 가 canonical id 가 아니라 raw source 코드, `raw:flow/...`, 미존재 화면이면 screen-level write 는 **멈추고 Stage 02** 로 식별을 푼다
   ([screen-identity.md](../../docs/reference/screen-identity.md)). 다만 flow-shaped/domain-level 입력 전체가 failed 인 것은 아니다.
   source-backed domain/app-level facts 는 [input-reconciliation.md](../../docs/reference/input-reconciliation.md#flow-shaped--domain-level-input) 의 라우팅 표에 따라 계속 reconcile 할 수 있다.
5. 기존 `confirmed` 문서·`resolved` 결정과 충돌하는지 대조한다.
6. classification 을 만든다 (입력 1개 → item 여러 개 가능). 분류 정의: [input-reconciliation.md](../../docs/reference/input-reconciliation.md) §Classification.
7. 자동 반영 가능한 `simple-update` 만 문서에 반영한다.
8. decision/conflict 는 **멈추고** 선택지를 제시한다. `resolved` 와 충돌하면 Conflict 에 이전 값을 남기고 그 decision 을
   `open` 으로 재오픈. 검증이 필요하면 INV-/VER- + 막을 화면에 Open Decision. 카탈로그에 없는 공통 컴포넌트는 Gap `G-xxx open` **제안만**.
9. 사용자 결정 후 문서를 업데이트한다 (게이트 내림은 사람이).
10. register 행을 `reconciled` 로 바꾸고 `Result`·`Touched Artifacts`·`Created Items` 를 채운다.
    자식 decision 이 `open` 이어도 reconcile 자체는 끝 — 그 차단은 readiness 가 담당한다.
11. task-artifact matrix 로 2차 산출물을 재확인한 뒤 `workflow:state` → `workflow:readiness` → `workflow:validate` 를 실행해 보고한다.
12. Tier3/layout/policy migration 입력을 건드렸으면 `workflow:policy-draft -- --out <review-output-dir>` 로 review-only 산출물을
    만든다(live policy 교체 아님). 자세히: [Stage 10](../../docs/reference/workflow-stages/10-policy-layout-tier3-changes.md).

## 입력 종류별 라우팅 (요약 — 상세는 링크)
| 입력 종류 | 1차 산출물 | 상세 (정본) |
|---|---|---|
| planning / meeting / user-note | ScreenSpec, Navigation Map, Domain Rules, Open Decisions/Conflicts/Unknowns | [input-reconciliation.md](../../docs/reference/input-reconciliation.md) §Classification |
| flow-shaped / domain-level | Domain Rules, Navigation Map(app-level only), API manifest, ScreenSpec Interaction Matrix(after identity) | [input-reconciliation.md](../../docs/reference/input-reconciliation.md) §Flow-shaped / domain-level input |
| api | API manifest/OpenAPI, ScreenSpec Data/API, Domain Rules | [CONVENTIONS.md](../../CONVENTIONS.md) §API |
| figma / visual-spec | `figma-component-mapping.md`, Component Catalog/Gap, Open Decisions | [input-reconciliation.md](../../docs/reference/input-reconciliation.md) §Visual/Figma |
| qa / testid | testID intake note 또는 ScreenSpec Accessibility/Acceptance, INV-/VER- | [input-reconciliation.md](../../docs/reference/input-reconciliation.md) §testID |
| architecture / policy / Tier3 | `project-layout.yaml`, readiness output, policy draft, migration guide | [Stage 10](../../docs/reference/workflow-stages/10-policy-layout-tier3-changes.md) |

핵심 경계(상세는 위 링크): 시각 매핑은 figma mapping 에·행동은 ScreenSpec 에 — **visual 증거는 behavior 정본을 바꾸지 않는다**;
selector/testID 는 evidence 일 뿐 naming `confirmed` 승격 금지; Tier3 는 draft/review 만, live policy 교체·CI 승격 금지.

## 필요할 때 읽는 문서
- 분류·copy keys·conflict·retry·check 12 전체: [input-reconciliation.md](../../docs/reference/input-reconciliation.md)
- 화면 식별: [screen-identity.md](../../docs/reference/screen-identity.md) / [Stage 02](../../docs/reference/workflow-stages/02-screen-identity-source-mapping.md)
- 시각 vs 행동: [input-reconciliation.md](../../docs/reference/input-reconciliation.md) §Visual/Figma + [figma-component-mapping.template.md](../../templates/screen/figma-component-mapping.template.md)
- 컴포넌트 갭(proposal-only): [component-gap-register.template.md](../../templates/global/component-gap-register.template.md) + [task-artifact-matrix.md](../../docs/reference/task-artifact-matrix.md)
- Unknown vs Open Decision 판단: [ambiguity-triage.md](../../docs/reference/ambiguity-triage.md)

## 최종 검증
```bash
npm run workflow:state
npm run workflow:readiness
npm run workflow:validate
# Tier3/layout/policy-migration 입력을 다룬 경우에만:
npm run workflow:policy-draft -- --out <review-output-dir>
```

## 금지
- `resolved` 결정 재-resolve, Unknown `resolved` 닫기, Gap accept, `confirmed` 승격 (전부 사람-전용).
- 이전 결정 값을 Conflict 기록 없이 조용히 덮어쓰기 / 입력 문구를 Copy Keys 에 `confirmed` 로 올리기(`draft` 까지만).
- source 코드로 canonical Screen ID 발명 (매핑=Screen Source Map, 생성=사람-확인 또는 `workflow:create-screen`).
- 같은 `input_id` 덮어쓰기 (새 id + supersedes).
- reconciliation 전 코드 변경 / production code·tests·generated files 직접 수정.
- live `policies/implementation-mode-policy.yaml` 교체, CI / pre-edit hook enforcement 승격.
