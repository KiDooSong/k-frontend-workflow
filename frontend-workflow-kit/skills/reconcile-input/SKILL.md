---
name: reconcile-input
description: 외부 입력 스킬이 저장한 새 입력 결과물(input_id 보유)을 기존 frontend-workflow 문서와 대조해 simple-update/decision/conflict 등으로 분류하고, Reconciliation Register에 register-first로 처리 이력을 남긴다. 사용자가 "입력 반영", "reconcile input", "이 입력 맞춰줘"를 요청하거나 새 Figma/기획/API/회의록/QA 입력을 가져왔을 때 사용. 충돌을 직접 해결하지 않고, 게이트는 Open Decision(readiness)이 건다.
---

# reconcile-input

새 입력 또는 기존 partial 입력의 남은 범위를 대조하고 처리 이력을 남긴다.
**충돌을 조용히 해결하지 않는다** — LLM은 게이트를 올리기만 하고, 게이트는 Open Decision(readiness)이 건다.
이 스킬은 [workflow spine](../../docs/reference/workflow-spine.md)의 **Stage 04**다. 운영 절차 정본은
[Stage 04 doc](../../docs/reference/workflow-stages/04-reconcile-input.md), 전체 계약은
[input-reconciliation.md](../../docs/reference/input-reconciliation.md), 사실의 소유권은 [doc-ownership.md](../../docs/reference/doc-ownership.md)다.

## 입력
- 새 입력 또는 재개할 입력 결과물 경로(`inputs/{input_id}.md` 또는 그룹 하위 경로). 없으면 사용자에게 묻는다.
  매칭 키는 경로가 아니라 **`input_id`**이며 inputs/는 재귀 스캔한다. `README.md`·`index.md`는 입력이 아니다.
- (선택) 대상 screen/domain. 세션 분할만을 위해 새 입력을 만들지 않는다.

## 핵심 불변식
- **register-first**: 어떤 문서 수정보다 **먼저** 같은 Summary 행을 `in-progress`로 생성/재개한다.
- **gate raising only**: open 추가 / `resolved→open` 재오픈, Conflict·Unknown·Gap·INV-/VER- 생성까지만.
  resolve / close / accept / `confirmed` 승격은 **사람** 전용. 코드·테스트·생성 파일은 직접 수정하지 않는다.
- **canonical 화면 identity는 워크플로우가 소유**하고 source 코드는 alias다. canonical Screen ID 를 발명하지 않는다.
  raw 코드·`raw:flow/...`는 screen-level write를 멈추고 [Stage 02](../../docs/reference/workflow-stages/02-screen-identity-source-mapping.md)로 보낸다.
  입력 전체를 failed로 취급하지 말고 source-backed domain/app facts는 [flow routing](../../docs/reference/input-reconciliation.md#flow-shaped--domain-level-input)을 따른다.
- `input_id`·입력 bytes·`supersedes`는 회차 간 유지한다. **실제 내용/새 snapshot 변화**만 새 id + supersedes다.
- 세 status 축은 별개: 입력 frontmatter `status` ≠ register `Reconcile Status` ≠ 자식 D-/C-/U-/G-/INV-/VER- 상태.
- **confidence ≠ fidelity**: fidelity는 전사/대조 상태이며 confidence/status/readiness를 바꾸지 않는다. raw 수집은 consumer 소관이다.
- 새/opt-in Figma mapping은 `provenance_contract: 1` + 모든 M-key + 모든 5컬럼 provenance row를 **같은 edit**에서 완성한다.

## 같은 input_id 재시도 (register row 재사용)
Register에서 같은 `input_id`를 먼저 찾는다. **새 행을 늘리지 않는다**:
- `reconciled` → **멈춘다.** 전체 입력 처리 완료다. 실제 내용/새 snapshot 변화만 새 `input_id` + `supersedes`.
- `partially-reconciled` → immutable input·누적 Items·현재 문서·해당 입력의 `Partial Reconciliation Notes`를 읽고 미처리 범위를 확인한 뒤 **같은 Summary 행을 `in-progress`로 이동**한다. 완료 effect는 반복하지 않는다.
- `in-progress` → **그 행을 이어서** 수리/처리한다.
- `failed` → 새 행을 만들지 않는다. 같은 행을 `in-progress`로 재개하고 이전 실패 사유를 Result 또는 retry note에, 잔여 범위를 재개 메모에 보존한다.
- `not-started` → 같은 행을 `in-progress` 로 이동한다.
- 없음 → 새 행을 `in-progress`로 **먼저** 쓴다. invalid enum / duplicate row / missing column → 먼저 구조를 수리한다.
과거 잘못된 완료 표시는 [명시적 유지보수/사람 확인](../../docs/reference/upgrade-notes.md#partial-reconciliation-checkpoints-232)으로만 정정한다. 정상 stop을 해제하지 않는다.

## 절차 (register-first)
1. 입력 결과물의 canonical frontmatter와 `input_id`를 확인하고 위 retry 규칙으로 같은 행을 생성/재개한다.
2. `affected_domains`/`affected_screens`(구 `suggested_scope`)로 관련 산출물만 연다. identity 미해결은 Stage 02로 보낸다.
3. 분류 전 [결정 대조 절차](../../docs/reference/input-reconciliation.md#decision-aware-preclassification)로 관련 Unknowns/Open Decisions·global `decision_refs`·현재 정본·연결 이력을 확인한다.
   실제 결정값·scope·현재 유효성을 대조하며 **읽기 순서는 권위 순서가 아니다**. partial의 미처리 범위와 수동 입력도 동일하다.
4. 이번 처리 사실을 분류한다. 구현 드리프트·본문 밖의 답·의도적 미제공을 새 선택/충돌/컴포넌트 누락과 구분한다. `expected_reconciliation`은 힌트다.
5. 허용되는 `simple-update`만 문서에 반영한다. 실제 근거 note 추가는 해당 artifact의 `update`이며 가짜 update / `simple-update + link-evidence`는 금지다.
   원래 open U-/D- 답은 기존 unknown-answer/decision-answer의 `link-evidence`로 연결하고 Status는 open으로 둔다.
6. decision/conflict의 제품 선택은 멈추고 선택지를 제시한다. 유효한 resolved 결정과 실제 충돌하면 이전 값을 보존하고 Conflict `create-open` + Decision `reopen`을 **같은 회차·같은 Item**으로 완결한다.
   이미 확인한 충돌을 partial 메모로 숨기지 않는다. 검증 필요는 INV-/VER- + 필요한 Open Decision, 카탈로그 누락은 G-xxx open **제안만**이다.
7. 게이트 내림이 필요한 문서 변경은 사람 결정 후에만 한다. 전체 라우팅 완료를 위해 사람 결정 해결까지 기다리지는 않는다.
8. 새/opt-in mapping은 기존 4컬럼과 `` `M-xxx` · `` key↔Mapping Provenance 1:1을 원자적으로 완성한다.
   effective Source Ref는 canonical Figma file + node/frame anchor다. planning/API/file-only나 document/statement/n/a로 대체하지 않는다. instance=Figma instance, record=API/domain record다.
9. v2는 같은 10컬럼 `Reconciliation Items`에 새 **실제 effect만 누적**한다. 기존 Item ID/effect를 보존하고 삭제·재번호화·현재 자식 상태에 맞춘 rewrite·재수행을 하지 않는다.
   Summary Classification·Touched Artifacts·Created Items는 **모든 회차의 누적 projection**이다. 미처리 축에 가짜 record/update/link-evidence나 임의 분류를 만들지 않는다.
10. 아래 종료 분기로 같은 Summary 행의 상태와 Result를 갱신한다. v1/v2·8/10컬럼·structured_since legacy 면제는 그대로다.
11. [task-artifact matrix](../../docs/reference/task-artifact-matrix.md)로 2차 산출물을 확인하고 `workflow:state` → `workflow:readiness` → `workflow:validate` 및 이번 회차 리뷰를 수행한다.
    RR-ROUTE-101·RR-STALE-101/102/103은 TP/FP/Non-evaluable로 판정하고 TP만 같은 review batch에 올린다. warning만으로 생성/close/Effect rewrite/Result 변경을 하지 않으며 `--enforce`도 승격하지 않는다.
12. Tier3/layout/policy migration은 `workflow:policy-draft -- --out <review-output-dir>`로 review-only 산출물만 만든다. live 교체가 아니다([Stage 10](../../docs/reference/workflow-stages/10-policy-layout-tier3-changes.md)).

## 부분 종료 / 전체 종료
상세: [partial checkpoint protocol](../../docs/reference/input-reconciliation.md#partial-reconciliation-checkpoints), [register template](../../templates/meta/reconciliation-register.template.md).
- **부분 종료**: 실제 처리 범위의 문서 작업·gate-raising·effect group을 일관되게 끝낸 뒤 `partially-reconciled`로 둔다. v2 Result는 `pending` 권장, 기존 Result warning/v1 자유서술 유지.
- canonical Summary/Items **뒤** `## Partial Reconciliation Notes`의 입력별 메모에 처리 범위·근거, 미처리 원문 pointer, 중단 이유, 다음 행동, 담당/연결 작업(미정이면 명시)을 남긴다.
  원문·누적 Items와 대조하며 댓글만을 유일한 재개 장소로 쓰지 않는다. 메모 수정 자체에 가짜 product artifact update를 만들지 않는다.
- **전체 종료**: 모든 범위를 분류·라우팅했을 때만 `reconciled`와 적절한 기존 Result로 마무리한다. 자식 decision이 `open`이라는 이유만으로 partial로 바꾸지 않는다.
  현재 잔여 범위 없음 또는 과거 메모임을 명확히 한다. 전체 완료를 위해 D-/U-를 자동 resolve하지 않는다.
- 아무 범위도 처리하지 않았거나 실제 작업이 중단/실패했다면 partial로 꾸미지 않는다. `in-progress`/`failed`/구조 오류는 항상 hard다.
  행 없음/`not-started`는 기본 warning·enforce error이며, partial의 `RR-LIFECYCLE-101`은 기본 및 `--enforce` 모두 warning-only다. 다른 오류를 면제하지 않는다.
- partial warning-only는 미처리 범위의 **구현 허가가 아니다**. 일반 구현은 현재 canonical 계약·기존 readiness/path 권한을 따르고 Notes는 Open Decision 게이트를 대체하지 않는다.
  visual-refresh는 selected input의 정확한 `reconciled + accepted` 및 single-item 조건을 유지한다. partial + accepted도 VR-RR-005 거부이며 무관한 정상 partial로 전역 deny를 만들지 않는다.

## 입력 종류별 라우팅 (상세는 정본)
| 입력 종류 | 1차 산출물 | 상세 |
|---|---|---|
| planning / meeting / user-note | ScreenSpec, Navigation Map, Domain Rules, D/C/U | [input-reconciliation.md](../../docs/reference/input-reconciliation.md) |
| flow-shaped / domain-level | Domain Rules, app-level Navigation Map, API; identity 확인 후 ScreenSpec | [flow routing](../../docs/reference/input-reconciliation.md#flow-shaped--domain-level-input) |
| api | API manifest/OpenAPI, ScreenSpec Data/API, Domain Rules | [CONVENTIONS.md](../../CONVENTIONS.md) |
| figma / visual-spec | figma mapping, Component Catalog/Gap, Open Decisions | [visual contract](../../docs/reference/input-reconciliation.md#visualfigma-입력--visual-spec-과-behavior-분리) |
| qa / testid | intake/Accessibility/Acceptance, INV-/VER- | [input-reconciliation.md](../../docs/reference/input-reconciliation.md) |
| architecture / policy / Tier3 | layout, readiness, policy draft, migration guide | [Stage 10](../../docs/reference/workflow-stages/10-policy-layout-tier3-changes.md) |
시각 증거는 behavior 정본을 바꾸지 않는다. selector/testID는 evidence이며 naming confirmed 승격 금지다.

## Review Contract (Stage 04)
리뷰 정본: [reconcile-review-rubric.md](../../docs/reference/reconcile-review-rubric.md), `review_profile: reconcile-stage04-v1`.
- routing·source backing·raise-only·scope·checkpoint completeness를 검토한다. 잠정 candidate의 최종 fidelity는 요구하지 않는다.
  필수 finding은 **한 라운드에 일괄 제출**하고 Info는 pass blocker로 쓰지 않는다.
- **stop condition**: validate hard errors 0 · Critical/Major 0 · gate-lowering diff 0 · provenance floor 충족 · 이번 범위 불확실성의 open D/U/C/G/INV/VER 표현 · scope 밖 변경 0.
- 메모 부재·미처리 범위 불명·완료 effect 재수행은 reviewer가 정상 checkpoint로 승인하지 않는다(P20). Notes 의미를 새 자연어 parser로 검사하지 않는다.
- 최종 보고: **이번 범위 종료 / 입력 전체 미완료 / 다음 범위**, stop 근거, 202-C warning별 TP/FP/Non-evaluable 및 in-scope Missed를 구분한다. partial을 전체 accepted/완료로 보고하지 않는다.
  정적 fixture/문구 검사를 실제 LLM 범위 분할·재개 또는 consumer dogfood 실행으로 주장하지 않는다.

## 최종 검증
```bash
npm run workflow:state
npm run workflow:readiness
npm run workflow:validate
# Tier3/layout/policy-migration 입력을 다룬 경우에만:
npm run workflow:policy-draft -- --out <review-output-dir>
```

## 금지
- resolved 재-resolve, Unknown close, Gap accept, confirmed 승격, 이전 결정값의 조용한 덮어쓰기(모두 사람-전용 경계).
- 입력 카피를 Copy Keys confirmed로 올리기(draft만), source 코드로 canonical Screen ID 발명, 같은 input_id 덮어쓰기.
- production code/tests/generated 직접 수정, live policy 교체, CI/pre-edit hook enforcement 승격, fidelity로 confidence/상태 승격.
