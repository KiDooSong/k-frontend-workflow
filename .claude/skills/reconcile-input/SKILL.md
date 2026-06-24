---
name: reconcile-input
description: 외부 입력 스킬이 저장한 새 입력 결과물(input_id 보유)을 기존 frontend-workflow 문서와 대조해 simple-update/decision/conflict 등으로 분류하고, Reconciliation Register에 register-first로 처리 이력을 남긴다. 사용자가 "입력 반영", "reconcile input", "이 입력 맞춰줘"를 요청하거나 새 Figma/기획/API/회의록/QA 입력을 가져왔을 때 사용. 충돌을 직접 해결하지 않고, 게이트는 Open Decision(readiness)이 건다.
---

# reconcile-input

외부 입력 스킬이 저장한 입력 결과물을 기존 산출물과 대조해 분류하고, 처리 이력을 Reconciliation Register에 남긴다.
**충돌을 조용히 해결하지 않는다** — LLM은 게이트를 올리기만 하고, 게이트는 Open Decision(readiness)이 건다.
전체 계약: [input-reconciliation.md](../../../frontend-workflow-kit/input-reconciliation.md).

## 입력
- 입력 결과물 경로 (예: `docs/frontend-workflow/inputs/IN-20260613-figma-001.md` — 파일명 = `{input_id}.md`). 없으면 사용자에게 묻는다.
- (선택) 대상 screen/domain.

## 핵심 불변식
- **register-first**: 어떤 문서 수정보다 **먼저** register에 `in-progress` 행을 쓴다.
- LLM은 게이트를 **올리기만** 한다 (open 추가, `resolved→open` 재오픈). **내리는** 전이(resolve/close)는 사람-전용.
- `input_id`는 불변. 내용이 바뀌면 같은 id를 덮어쓰지 말고 **새 id + supersedes**.
- 세 status 축은 **별개 라이프사이클**: 입력 frontmatter `status`(입력 수집 상태, 예: `captured`) ≠ register `Reconcile Status`(reconcile 행위) ≠ 자식 항목(D-/C-/U-/G-/INV-/VER-) open/closed. 섞으면 결정 대기 입력이 "미처리"로 오탐된다.
- reconciliation 중 **코드·테스트·생성 파일을 직접 수정하지 않는다**. 입력은 문서/레지스터/리뷰용 draft 산출물로만 반영한다.

## 산출물 라우팅
입력 종류를 먼저 판별하고, 아래 산출물을 필요한 만큼만 연다.

| 입력 종류 | 우선 확인/수정 산출물 | 경계 |
|---|---|---|
| planning / meeting / user-note | ScreenSpec, Navigation Map, Domain Rules, Open Decisions, Conflicts, Unknowns | 행동·라우팅·정책 선택은 ScreenSpec/Decision 축. resolved 결정과 충돌하면 Conflict + decision 재오픈 |
| api | API manifest / OpenAPI references, ScreenSpec Data/API, Domain Rules, Unknowns, Open Decisions | 화면이 DTO에 직접 종속되게 쓰지 않는다. API 후보 confirmed 승격은 사람 |
| figma / visual-spec | `figma-component-mapping.md`, visual spec sections, Component Catalog, Component Gap Register, Open Decisions/Conflicts | 시각 매핑은 Figma mapping에, 행동은 ScreenSpec에. mapping artifact lifecycle gate 와 visual fidelity evidence 를 구분 |
| qa / testid / qa-automation | testID/QA intake note(있으면), ScreenSpec Accessibility/Acceptance, Investigation/Verification, Open Decisions | selector/testID는 구현 지원 evidence. 코드·테스트를 만들지 않고, naming confirmed 승격 금지 |
| architecture / policy-migration / Tier3 | `project-layout.yaml`, `layers:` 선언, layer-inventory, readiness output, `implementation-mode-policy.draft.yaml`, `implementation-mode-policy.migration.md`, Open Decisions/Conflicts | readiness access wired / policy draft generated / live policy not replaced / hard gate·CI not promoted 를 구분 |

필요 시 함께 대조하는 공통 산출물: ScreenSpec, Navigation Map, Domain Rules, Component Catalog, Component Gap Register, Open Decisions, Conflicts, Unknowns, Investigation/Verification items, API manifest/OpenAPI references, figma-component-mapping.

## 절차 (register-first)
1. 입력 결과물을 읽고 canonical required frontmatter(input_id / input_type / source_type / source_ref / captured_at / captured_by / status / affected_domains / affected_screens)를 확인한다. `input_id`가 멱등성·역추적의 키.
2. Register에서 같은 `input_id` 행을 확인한다:
   - `reconciled` → **멈춘다** (이미 처리됨, 멱등성).
   - `in-progress` (이전 실행 중단) → 새 행 추가하지 말고 **그 행을 이어서** 처리한다.
   - 없음 → 다음 단계.
3. Register에 행을 먼저 쓴다 (`Reconcile Status: in-progress`). ← 문서 수정보다 먼저. 파일이 없으면 아래 스키마로 생성.
4. `affected_domains`/`affected_screens`(구 `suggested_scope` — deprecated read-compat) 기준으로 관련 산출물을 연다. 위 라우팅 표에 따라 visual/testID/Tier3 산출물도 포함한다.
5. 기존 `confirmed` 문서·`resolved` 결정과 충돌하는지 대조한다.
6. classification을 만든다 (입력 1개 → item 여러 개 가능). 아래 분류표 참조.
7. 자동 반영 가능한 `simple-update`만 문서에 반영한다.
8. decision/conflict는 **멈추고** 사용자에게 선택지를 제시한다.
   - `resolved` 결정과 충돌 → Conflicts에 이전 값을 남기고(A=새 입력, B=기존 결정) 해당 Open Decision을 `open`으로 재오픈한다.
   - 검증 없이는 결정 불가 → Investigation/Verification(`INV-`/`VER-`)을 만들고 막을 화면에 Open Decision을 올린다 (Unknown 단독은 게이트 아님).
   - 카탈로그에 없는 공통 컴포넌트 필요 → Component Gap Register에 `G-xxx`를 `open`으로 제안한다 (제안만 — accept는 사람).
9. 사용자 결정 후 문서를 업데이트한다 (게이트 내림은 사람이).
10. Register 행을 `reconciled`로 바꾸고 `Result`·`Touched Artifacts`·`Created Items`를 채운다.
    자식 decision이 `open`이어도 reconcile 자체는 끝 — 그 차단은 readiness가 담당한다.
11. `npm run workflow:state` → `workflow:readiness` → `workflow:validate`를 실행하고 결과를 보고한다.
    Tier3/layout/policy migration 입력을 건드렸으면 `npm run workflow:policy-draft -- --out <review-output-dir>`처럼
    review-only 출력 디렉터리를 명시해 실행한다(또는 해당 repo의 policy-draft 명령에 동등한 `--out` 전달).
    이 출력은 live policy 교체가 아니다. fixture/dogfood 갱신일 때만 adoption-probe 를 추가로 돌린다.

## Classification (입력은 ≥1개로 분류)
| Type | Action |
|---|---|
| simple-update | 관련 문서 보강 |
| resolves-unknown | 답/근거를 Unknown 행에 연결하고 resolvable로 표시, Status는 `open` 유지. `resolved` 닫기는 사람 |
| resolves-decision | 사용자 확인 후 Open Decision `resolved` (사람) |
| new-decision | Open Decisions에 `open` 행 추가 |
| component-gap | 카탈로그에 없는 공통 컴포넌트 필요 → Gap Register에 `G-xxx` `open` 제안 (accept는 사람) |
| investigation-needed | `INV-`/`VER-` 생성 + 막을 화면에 Open Decision |
| conflict | Conflicts 기록 (`resolved` 결정과 충돌이면 decision 재오픈) |
| scope-unclear | 막아야 하면 Open Decision, 단순 확인이면 Unknown |
| reject-input | Register `Result`에 사유 기록, 문서는 유지 |

## Visual / Figma 규칙
- Figma 노드·프레임·컴포넌트 매핑 사실은 `figma-component-mapping.md` 로 간다. 입력이 행동을 바꾸지 않는 한 ScreenSpec 을 수정하지 않는다.
- ScreenSpec 단일 출처: state, interaction, routing, filtering, sorting, tab semantics, API behavior.
- Figma mapping 단일 출처: Frame, Component Mapping, Visual Spec, Provenance, Data Corrections / Override Log, Assets, Gaps / Open, Cross-links.
- `figma_mapping_status` 는 mapping artifact 의 존재/라이프사이클 fact 이며 `final-fixture-ui` 의 artifact-existence gate 에 쓰인다. pixel fidelity, token completeness, visual regression green 을 의미하지 않으며 그 증명은 별도 Verification evidence 로 다룬다.
- tokenized/source-backed visual 값은 token/provenance 를 적는다. raw/inferred/unresolved 값은 visual gap/open 으로 남기고 필요하면 D-/INV-/VER- 링크를 단다.
- 카탈로그에 없는 공통 컴포넌트가 필요하면 `component-gap` 으로 분류하고 Gap Register 에 `G-xxx open` 을 제안한다. 구현/accept 금지.
- Figma 가 confirmed/resolved 행동과 충돌하면 Conflict + Open Decision 재오픈/생성. 순수 시각 충돌이면 Data Corrections / Override Log 와 필요 시 INV-/VER- 로 처리한다.

## testID / QA automation 규칙
- testID/selector 입력은 구현 지원 evidence 이다. source code, production test, generated file 을 직접 고치지 않는다.
- repo 에 testID intake note/artifact 가 있으면 그 노트를 갱신한다. 없으면 ScreenSpec Accessibility/Acceptance 에 **draft/recommended** 선언 또는 Verification item 으로 남긴다.
- testID 요구가 화면 의미(구조, 상태, 역할, 사용자 동작)를 바꾸면 ScreenSpec simple-update 또는 Open Decision 으로 올린다.
- selector 가 미정 UI 구조에 의존하면 Open Decision 또는 Verification(`VER-`) 을 만든다.
- testID naming 을 confirmed 로 올리거나 CI/E2E hard gate 로 승격하지 않는다.

## Tier3 layout / policy migration 규칙
- 새 layer, role glob, access boundary 입력은 `project-layout.yaml`, layer inventory, readiness output, policy draft, migration guide 를 함께 대조한다.
- layer access 변경 제안은 사용자 명시가 없으면 draft/review artifact 만 갱신한다.
- live policy 또는 resolved architecture decision 과 충돌하면 Conflict 를 기록하고 Open Decision 을 재오픈/생성한다. 필요하면 migration guide/draft notes 에 반영한다.
- `policies/implementation-mode-policy.yaml` 을 replace 하지 않는다.
- hard gate, CI, pre-edit hook enforcement 를 승격하지 않는다.
- 보고서에는 반드시 네 상태를 분리해 적는다: readiness access wired, policy draft generated, live policy not replaced, hard gate/CI not promoted.

## Reconciliation Register 스키마
`docs/frontend-workflow/_meta/reconciliation-register.md` (처리 이력용 meta-register — validate 가 `_meta/` 제외)
```md
## Reconciliation Register
| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
```
- `Reconcile Status`: `not-started` → `in-progress` → `reconciled` / `failed`
- `Result`: `accepted` / `rejected` / `delegated` / `pending user decision` / `conflict-created` …
- `Created Items`: `C-…`/`D-…`/`U-…`/`G-…`/`INV-…`/`VER-…` **링크만**. 자식 open/closed는 각 레지스터가 단일 출처.
- `Supersedes`: **입력↔입력 축만** (결정값 번복 아님 — decision-log의 몫).

## 금지
- `resolved` 결정 재-resolve / 임의 변경 (재오픈=`open`으로 올리기는 가능, 재-resolve는 사람만).
- Unknown을 `resolved`로 닫기 (답/근거 연결은 가능, 닫기는 사람만).
- 이전 결정 값을 조용히 덮어쓰기 / Conflict 기록 없이 decision만 변경.
- `confirmed` 문서 임의 강등·승격.
- Gap을 직접 accept / 새 공통 컴포넌트 직접 생성 (제안=`open`만, accept는 사람).
- `Owner`만 보고 사용자 판단 가능성을 배제하기.
- 같은 `input_id` 덮어쓰기 (새 id + supersedes).
- reconciliation 전 코드 변경.
- production code / tests / generated files 직접 수정.
- live `policies/implementation-mode-policy.yaml` replacement, CI promotion, pre-edit hook enforcement.
