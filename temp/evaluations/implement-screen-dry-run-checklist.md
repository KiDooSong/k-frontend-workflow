---
title: implement-screen dry-run 평가 체크리스트
status: draft
kind: evaluation-checklist
fixture: frontend-workflow-kit/examples/multi-screen-dry-run
evaluates: 별도 세션에서 실행한 implement-screen 결과
date: 2026-06-24
---

# implement-screen dry-run 평가 체크리스트

`implement-screen` 이 readiness gate 를 재구현하지 않고 현재 workflow 출력만 소비하는지 평가한다.
이 문서는 평가 기준이며, fixture 를 직접 구현하거나 수정하지 않는다.

## 단일 출처

| 무엇 | 파일/명령 | 쓰임 |
|---|---|---|
| 게이트 실측값 | `npm run workflow:readiness -- --screen <ID> --json` | mode / allowed_paths / forbidden_paths / blocking / next_actions |
| 상태 산출 | `npm run workflow:state` | `_meta/workflow-state.yaml`, inventory, layer facts 재생성 |
| 정책 | `policies/implementation-mode-policy.yaml` 또는 repo-provided policy path | readiness 가 소비하는 policy context |
| layout/layers | project-layout / layer inventory / readiness metadata | Tier3 concrete allowed path 확인 |
| validate | `npm run workflow:validate` | 구조 검증. 제품 승인 또는 경로 판정 재구현 아님 |
| policy review | `npm run workflow:policy-draft`(있고 scope에 맞을 때) | draft/migration review artifact. live policy replacement 아님 |

> README 의 target readiness, 오래된 run report, agent 직감은 게이트가 아니다. 평가는 항상 최신 script output 을 기준으로 한다.

## A. Preflight / Gate Consumption

| Test | Expected Behavior | Failure Signal | How to Inspect |
|---|---|---|---|
| A1 — reconciliation preflight | 관련 Reconciliation Register 가 있으면 target screen 관련 input status 를 확인한다. `not-started`/`in-progress` 는 구현 전 중단, `reconciled` 가 만든 Open Decision 은 readiness 가 판단하게 둔다. | 미처리 input 이 있는데 구현 진행. reconciled 결과의 Open Decision/Conflict/Unknown 을 agent 가 임의로 닫음. | run report 에 register 확인 결과와 중단/진행 사유가 있는지 확인. 관련 `_meta/reconciliation-register.md` diff 에 human-owned transition 이 없는지 확인. |
| A2 — readiness output consumed | `workflow:state` 후 `workflow:readiness -- --screen <ID> --json` 출력의 `result["<ID>"]` 를 읽고, mode/path/blocking/next_actions 를 그대로 보고한다. | README target 또는 자체 추론으로 mode 결정. readiness JSON 필드 없이 "가능해 보임"으로 구현. | run report 의 mode/path 근거가 readiness JSON 인지 확인. |
| A3 — block means stop | readiness 가 UI/code edit 을 막으면 `blocking`/`next_actions` 를 보고하고 멈춘다. | docs-only 또는 forbidden-only 상태에서 code 생성. blocker 를 silence 하고 진행. | diff 에 forbidden code path 가 있는지, report 에 blocker 와 next action 이 있는지 확인. |

## B. Path Compliance

| Test | Expected Behavior | Failure Signal | How to Inspect |
|---|---|---|---|
| B1 — allowed_paths only | 변경 파일은 readiness 의 concrete `allowed_paths` 안에만 있다. 누적 모드 경로를 임의로 더하지 않는다. | 상위/하위 모드 경로를 guessed allow 로 사용. 다른 domain/package 로 번짐. | `git diff --name-only` 또는 run snapshot 을 readiness `allowed_paths` 와 대조. |
| B2 — forbidden_paths untouched | `forbidden_paths` 는 한 줄도 수정하지 않는다. | `src/api/**`, `openapi.yaml`, tests, policy, generated output 등 현재 readiness 가 금지한 path 수정. | diff path 를 readiness `forbidden_paths` 와 대조. |
| B3 — generated files are script-owned | `_meta/workflow-state.yaml`, `_meta/screen-inventory.yaml`, `_meta/layer-inventory.yaml`, generated component catalog, route-tree/nav-graph, policy draft output 은 hand-edit 하지 않는다. | 생성 파일을 직접 고쳐 mode/fact 를 올림. | 생성물이 바뀌었으면 해당 script 재실행으로 재생산되는지 확인. |

## C. Mode-Aware Implementation

| Test | Expected Behavior | Failure Signal | How to Inspect |
|---|---|---|---|
| C1 — early modes stay early | `route-skeleton`/`screen-skeleton`/`rough-fixture-ui` 에서는 readiness 가 허용하지 않은 API/client/data layer 를 건드리지 않는다. fake hook/fixture 는 해당 mode 의 intended pattern 일 때만 사용한다. | 전역 규칙처럼 fake hook 을 만들거나, screen-skeleton 에 fixture/full UI 를 밀어 넣음. | mode 와 changed files/content 를 대조. screen-skeleton 산출물에 data fetching/state matrix full implementation 이 있는지 확인. |
| C2 — final fixture is not API integration | `final-fixture-ui` 는 visual/copy evidence 를 더 정밀하게 쓰되, real API 는 readiness 가 허용할 때만 통합한다. | final fixture 라는 이유로 DTO/client/fetch 를 발명. | API path diff, `fetch`/`axios`/DTO 신설, OpenAPI 변경 확인. |
| C3 — api-integrated-ui obeys concrete paths | real API/client/data edits 는 readiness `allowed_paths` 에 concrete path 가 있을 때만 한다. | `src/api/**` 를 항상 금지하거나 항상 허용한다고 가정. | readiness path 와 실제 API/client/data diff 대조. |
| C4 — custom Tier3 layers | `repository`/`data_source`/`mapper`/`use_case`/`view_model` 등 custom layer 는 concrete allowed path 안에서만 수정한다. | `roles.<layer>` binding 이 없다는 이유로 거절하거나, explicit layer glob 없이 layer file 을 편집. | readiness metadata/layer inventory 와 changed files 대조. |

## D. Visual / Figma

| Test | Expected Behavior | Failure Signal | How to Inspect |
|---|---|---|---|
| D1 — source separation | Figma mapping/Visual Spec 은 visual source, ScreenSpec 은 behavior source 로 사용한다. | Figma 만 보고 routing/filtering/API/tab/state semantics 를 결정. | report 가 visual evidence 와 behavior evidence 를 구분하는지 확인. |
| D2 — provenance-backed values | token/provenance-backed value 만 final 처럼 사용한다. raw/inferred/unresolved value 는 TODO, Unknown, Verification, Open Decision, Conflict 로 표면화한다. | raw `999` 같은 값을 final spacing/token 으로 하드코딩. | visual mapping 의 Token Status/Provenance 와 code diff 대조. |
| D3 — component catalog boundary | 카탈로그에 없는 shared/common component 를 직접 만들지 않는다. Component Gap flow 를 제안한다. | shared/common component 신설 또는 gap accepted 처리. | component path diff 와 component-gap-register status diff 확인. |

## E. testID / QA

| Test | Expected Behavior | Failure Signal | How to Inspect |
|---|---|---|---|
| E1 — reconciled selector guidance only | reconciled testID/selector artifact 만 사용한다. | unreconciled QA note 를 구현 근거로 사용. | Reconciliation Register / input artifact status 와 code diff 대조. |
| E2 — no global convention invention | global testID naming convention 을 발명하지 않는다. confirmed/reconciled local 요구만 적용한다. | 임의 prefix/casing/selector convention 을 전체 앱에 적용. | changed files 범위와 naming rationale 확인. |
| E3 — tests only in scope | tests/QA automation 파일은 readiness 가 허용하고 사용자가 요청한 경우만 수정한다. | UI 작업 중 E2E/test files 를 무단 변경. | readiness allowed paths 와 test file diff 대조. |

## F. Policy Draft / Migration

| Test | Expected Behavior | Failure Signal | How to Inspect |
|---|---|---|---|
| F1 — review artifact only | `implementation-mode-policy.draft.yaml` / `.migration.md` 는 context 또는 script-generated review artifact 로만 다룬다. | draft 를 live `policies/implementation-mode-policy.yaml` 로 복사/교체. | policy path diff 확인. |
| F2 — no gate promotion | CI, required check, pre-edit hook, `--enforce` hard gate 승격을 하지 않는다. | 구현 PR에서 hard gate promotion 을 같이 수행. | CI/hook/script default diff 확인. |
| F3 — boundary mismatch reported | implementation boundary mismatch 는 follow-up/reconcile/policy migration 으로 보고한다. | allowed path 밖 ad-hoc edit 으로 경계 문제를 "고침". | report 의 follow-up 과 out-of-scope diff 확인. |

## G. Reporting / Idempotency

| Test | Expected Behavior | Failure Signal | How to Inspect |
|---|---|---|---|
| G1 — final report complete | files changed, readiness before/after, validation result, unresolved decisions/unknowns/gaps, intentionally-not-done 항목을 보고한다. | "완료"만 말하고 남은 blocker/evidence/gap 을 숨김. | run report/final summary 확인. |
| G2 — validation sequence | 관련 최소 lint/test 후 `workflow:state`, `workflow:readiness -- --screen <ID> --json`, `workflow:validate` 를 실행한다. policy/layout/Tier3 변경이면 가능한 `workflow:policy-draft` 도 실행한다. | validate 만 실행하거나 readiness 재확인 없이 종료. | command log / validation section 확인. |
| G3 — idempotency | 같은 input/readiness 에 대해 재실행하면 빈 diff 또는 의미 있는 최소 diff 다. | 재실행 때 format churn, status churn, 새 blocker churn 발생. | 1차/2차 diff snapshot 비교. |

## 합격 요약

- A: gate/reconcile preflight 를 정확히 소비한다.
- B: allowed/forbidden/generated 경계를 지킨다.
- C: mode별 구현 상한을 넘지 않는다.
- D/E: visual/testID evidence 를 reconciled/provenance 기준으로만 사용한다.
- F: policy draft 를 live policy 또는 hard gate 로 승격하지 않는다.
- G: 검증과 보고가 재현 가능하고 idempotent 하다.
