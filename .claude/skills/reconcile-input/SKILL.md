---
name: reconcile-input
description: 외부 입력 스킬이 저장한 새 입력 결과물(input_id 보유)을 기존 frontend-workflow 문서와 대조해 simple-update/decision/conflict 등으로 분류하고, Reconciliation Register에 register-first로 처리 이력을 남긴다. 사용자가 "입력 반영", "reconcile input", "이 입력 맞춰줘"를 요청하거나 새 Figma/기획/API/회의록/QA 입력을 가져왔을 때 사용. 충돌을 직접 해결하지 않고, 게이트는 Open Decision(readiness)이 건다.
---

# reconcile-input

새 입력 또는 기존 partial 입력의 남은 범위를 기존 산출물과 대조해 분류하고, 처리 이력을 Reconciliation Register에 남긴다.
**충돌을 조용히 해결하지 않는다** — LLM은 게이트를 올리기만 하고, 게이트는 Open Decision(readiness)이 건다.
전체 계약: [input-reconciliation.md](../../../frontend-workflow-kit/docs/reference/input-reconciliation.md).
운영 절차: [Stage 04](../../../frontend-workflow-kit/docs/reference/workflow-stages/04-reconcile-input.md).

## 입력
- 입력 결과물 경로 (예: `docs/frontend-workflow/inputs/IN-20260613-figma-001.md` — 파일명 = `{input_id}.md`). 없으면 사용자에게 묻는다. 기존 partial 입력도 같은 경로/ID로 재개한다.
- (선택) 대상 screen/domain.

## 핵심 불변식
- **register-first**: 어떤 문서 수정보다 **먼저** register에 같은 Summary 행을 `in-progress`로 생성/재개한다.
- LLM은 게이트를 **올리기만** 한다 (open 추가, `resolved→open` 재오픈). **내리는** 전이(resolve/close)는 사람-전용.
- `input_id`는 불변. 실제 내용/새 snapshot 변화면 같은 id를 덮어쓰지 말고 **새 id + supersedes**. 변경되지 않은 snapshot의 회차 분할에는 input_id/입력 bytes/supersedes를 유지한다.
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
   - `reconciled` → **멈춘다**. 전체 입력 처리가 끝났다. 실제 내용/새 snapshot 변화만 새 `input_id` + `supersedes`를 만든다.
   - `partially-reconciled` → immutable input·기존 누적 Items·현재 문서·해당 입력의 `Partial Reconciliation Notes`를 읽고 미처리 범위를 확인한 뒤 **같은 Summary 행을 `in-progress`로 이동**한다. 완료 effect는 반복하지 않는다.
   - `in-progress` → 새 행을 추가하지 말고 **그 행을 이어서** 처리한다.
   - `failed` → 새 행을 만들지 않는다. 같은 행을 `in-progress` 로 재개하고, 이전 실패 사유를 `Result` 에 보존하거나 retry note 를 이어 붙인다. 잔여 범위 메모도 보존한다.
   - `not-started` → 같은 행을 `in-progress` 로 이동한다.
   - invalid enum / duplicate row / missing required columns → 먼저 register 구조를 수리한다.
   - 없음 → 다음 단계.
3. 행이 없을 때만 Register에 행을 먼저 쓴다 (`Reconcile Status: in-progress`). ← 문서 수정보다 먼저. 파일이 없으면 아래 스키마로 생성.
4. `affected_domains`/`affected_screens`(구 `suggested_scope` — deprecated read-compat) 기준으로 관련 산출물을 연다. 위 라우팅 표에 따라 visual/testID/Tier3 산출물도 포함한다.
   사실별 canonical screen/domain과 적용 조건을 먼저 확인한다. raw source 코드는 canonical ID가 아니며, 화면 식별이 미해결이면 [screen-identity.md](../../../frontend-workflow-kit/docs/reference/screen-identity.md)의 Stage 02 경계를 따른다.
5. 분류 전에 [결정 대조 절차](../../../frontend-workflow-kit/docs/reference/input-reconciliation.md#decision-aware-preclassification)를 수행한다. partial의 미처리 범위도 동일하다.
   관련 ScreenSpec의 `## Unknowns`·`## Open Decisions`와 `decision_refs`의 global canonical 행 → 현재 본문·Domain Rules·Copy Keys → 관련 ID/주제의 결정 이력과 연결 근거를 읽는다.
   실제 결정값·적용 scope·현재 유효성을 확인한다. **읽기 순서는 권위 순서가 아니다.** 대체·범위 변경은 후속 기록까지 확인하며 로그 전체 정독이나 필수 로그 신설을 요구하지 않는다.
6. 이번 처리 사실의 classification을 만든다 (입력 1개 → item 여러 개 가능). 아래 분류표 참조. 미처리 축의 계획을 가짜 effect로 기록하지 않는다.
   기존 결정 미준수(구현 드리프트)·본문 밖의 답·의도적 미제공을 새 선택/충돌/컴포넌트 누락과 구분한다. `expected_reconciliation`은 힌트이며 수동 입력에도 같은 대조를 적용한다.
7. 자동 반영 가능한 `simple-update`만 문서에 반영한다. 근거 note를 실제 추가했다면 해당 artifact의 `update`로 기록하고, 가짜 update나 `simple-update + link-evidence`를 만들지 않는다.
8. decision/conflict의 제품 선택은 **멈추고** 사용자에게 선택지를 제시한다.
   - 현재 유효한 `resolved` 결정과 실제 충돌 → **같은 회차·같은 Item**에 Conflict `create-open`(A=새 입력, B=이전 값 보존)과 해당 Decision `reopen`을 함께 기록한다. 이미 확인한 충돌을 partial 메모로 숨기지 않는다.
   - 검증 없이는 결정 불가 → Investigation/Verification(`INV-`/`VER-`)을 만들고 막을 화면에 Open Decision을 올린다 (Unknown 단독은 게이트 아님).
   - 카탈로그에 없는 공통 컴포넌트 필요 → Component Gap Register에 `G-xxx`를 `open`으로 제안한다 (제안만 — accept는 사람).
9. 게이트 내림이 필요한 문서 변경은 사용자 결정 후에만 한다. 전체 라우팅 완료를 위해 사람 결정 해결까지 기다리지는 않는다.
10. 기존 Item ID/effect를 보존하고 새 실제 effect만 같은 Items 표에 누적한다. Summary Classification·Touched Artifacts·Created Items는 **모든 회차의 누적 projection**으로 계산한다.
    미처리 범위가 남으면 아래 프로토콜로 같은 행을 `partially-reconciled / pending`으로 종료한다. 모든 범위 분류·라우팅 완료면 `reconciled`와 적절한 기존 Result로 마무리한다. 자식 decision `open`만으로 partial로 바꾸지 않는다.
11. `npm run workflow:state` → `workflow:readiness` → `workflow:validate`와 이번 회차 리뷰 결과를 보고한다. partial은 **이번 범위 종료 / 입력 전체 미완료 / 다음 범위**를 구분하며 전체 accepted/완료로 보고하지 않는다.
    Tier3/layout/policy migration 입력을 건드렸으면 `npm run workflow:policy-draft -- --out <review-output-dir>`처럼
    review-only 출력 디렉터리를 명시해 실행한다(또는 해당 repo의 policy-draft 명령에 동등한 `--out` 전달).
    이 출력은 live policy 교체가 아니다. fixture/dogfood 갱신일 때만 adoption-probe 를 추가로 돌린다.

## Partial checkpoint와 리뷰

상세 정본: [partial protocol](../../../frontend-workflow-kit/docs/reference/input-reconciliation.md#partial-reconciliation-checkpoints),
[register template](../../../frontend-workflow-kit/templates/meta/reconciliation-register.template.md),
[review rubric](../../../frontend-workflow-kit/docs/reference/reconcile-review-rubric.md).

- 일부 범위를 실제로 처리하고 문서 변경·필요한 gate-raising·effect group을 일관되게 끝내야 정상 partial이다. 아무 작업도 하지 않았거나 반쪽 conflict/reopen만 기록한 상태를 partial로 꾸미지 않는다.
- canonical Summary/Items **뒤** `## Partial Reconciliation Notes`의 입력별 메모에 처리 범위·근거, 미처리 원문 pointer, 중단 이유, 다음 행동, 담당/연결 작업(미정이면 명시)을 남긴다.
- 원문·누적 Items·현재 문서를 대조한다. Notes는 원문 대체 정본이 아니며 이슈 댓글만 유일한 재개 장소로 쓰지 않는다. Notes 의미/pointer를 새 자연어 parser로 검증하지 않는다.
- 기존 effect 삭제·재번호화·현재 자식 상태에 맞춘 rewrite·완료 effect 재수행은 금지다. 미처리 축이나 메모 유지보수에 가짜 product artifact update/record/link-evidence를 만들지 않는다.
- v2 partial Result는 `pending` 권장이다. 기존 Result warning 정책/v1 자유서술, 8/10컬럼, structured_since 이전 legacy 면제는 유지한다.
- 메모 없음·미처리 범위 불명·완료 effect 재수행은 reviewer가 정상 checkpoint로 승인하지 않는다(P20). hard errors 0 · Critical/Major 0 · gate-lowering diff 0 · provenance floor · scope 조건은 완화하지 않는다.
- 이번 검토 범위의 불확실성은 canonical open item으로, 아직 reconcile하지 않은 범위는 재개 메모로 표현한다. 모든 범위를 라우팅했다면 자식 open이어도 reconciled이며, 메모를 잔여 없음/역사 기록으로 갱신한다.
- 정상 reconciled 재실행은 중단한다. 과거 잘못된 완료 표시는 [명시적 유지보수/사람 확인](../../../frontend-workflow-kit/docs/reference/upgrade-notes.md#partial-reconciliation-checkpoints-232)으로만 정정하며 input ID/bytes/supersedes/기존 effect를 유지한다.
- partial warning-only는 **미처리 범위의 구현 허가가 아니다**. 일반 구현은 현재 canonical 계약과 기존 readiness/path 권한으로 판단하며 Notes는 Open Decision을 대체하지 않는다.
- visual-refresh는 selected input의 정확한 `reconciled + accepted` 및 single-item 조건을 보존한다. partial + accepted도 VR-RR-005 거부이며 무관한 정상 partial로 전역 deny를 만들지 않는다.
- 리뷰는 필수 finding을 한 라운드에 일괄 제출한다. 202-C warning을 TP/FP/Non-evaluable로 판단하고 in-scope Missed를 별도로 보고하며 warning만으로 자동 mutate하지 않는다.
- 정적 fixture/문구 검사를 실제 LLM 범위 분할·재개 또는 consumer dogfood 실행으로 주장하지 않는다.

## Classification (처리하는 사실은 ≥1개로 분류)
| Type | Action |
|---|---|
| simple-update | 관련 문서 보강 |
| resolves-unknown | 답/근거를 Unknown 행에 연결하고 resolvable로 표시, Status는 `open` 유지. `resolved` 닫기는 사람 |
| resolves-decision | 원래 open Decision에 link-evidence로 답을 연결하고 open 유지; 사용자 확인 후 resolved는 사람 |
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
- `Reconcile Status`: `not-started` → `in-progress` → `partially-reconciled` / `reconciled` / `failed`. partial은 같은 행에서 in-progress로 재개한다.
- Row 없음과 `not-started`는 기본 경고(`--enforce`에서 에러), `in-progress`/`failed`/enum/중복/컬럼 누락은 항상 에러다. partial의 RR-LIFECYCLE-101은 기본/`--enforce` 모두 warning-only이며 다른 오류를 면제하지 않는다.
- `Result`: 기존 v1 자유서술과 v2 warning 정책 유지. partial v2는 pending 권장. partial + accepted도 lifecycle 경고와 권고 조합 경고를 유지한다.
- `Created Items`: `C-…`/`D-…`/`U-…`/`G-…`/`INV-…`/`VER-…` **링크만**. 자식 open/closed는 각 레지스터가 단일 출처.
- `Supersedes`: **입력↔입력 축만** (결정값 번복 아님 — decision-log의 몫). 회차 분할에는 새 값 발급 금지.
- v2 register는 [Contract v2](../../../frontend-workflow-kit/docs/reference/input-reconciliation.md#reconciliation-contract-v2-opt-in)의 Items·typed ref·누적 Summary projection을 함께 기록한다. 원래 open U-/D- 답은 기존 `link-evidence` 경로로 연결하며 상태를 내리지 않는다.

## 금지
- `resolved` 결정 재-resolve / 임의 변경 (재오픈=`open`으로 올리기는 가능, 재-resolve는 사람만).
- Unknown을 `resolved`로 닫기 (답/근거 연결은 가능, 닫기는 사람만).
- 이전 결정 값을 조용히 덮어쓰기 / Conflict 기록 없이 decision만 변경.
- `confirmed` 문서 임의 강등·승격.
- Gap을 직접 accept / 새 공통 컴포넌트 직접 생성 (제안=`open`만, accept는 사람).
- `Owner`만 보고 사용자 판단 가능성을 배제하기.
- 같은 `input_id` 덮어쓰기 (실제 내용 변경은 새 id + supersedes, 회차 분할은 같은 id).
- reconciliation 전 코드 변경.
- production code / tests / generated files 직접 수정.
- live `policies/implementation-mode-policy.yaml` replacement, CI promotion, pre-edit hook enforcement.
