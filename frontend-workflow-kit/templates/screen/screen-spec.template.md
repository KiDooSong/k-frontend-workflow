---
artifact_id: "{SCREEN_ID}-screen-spec"
artifact_type: screen-spec
domain: "{domain}"
screen_id: "{SCREEN_ID}"
route: "{route}"          # URL route token. inventory/stub 가 frontmatter 에서 읽는다 (본문에 중복 금지)
# route_entry: "{src/app/.../page.tsx}"          # 선택: router/framework boundary 파일. screen_entry 와 경로 형태가 달라도 된다.
# screen_entry: "{src/features/.../Screen.tsx}" # 선택: 화면 구현 파일. implement-screen 은 readiness allowed_paths 와 함께 이 힌트를 사용한다.
# api_required: false       # 선택: 자체 API 호출이 없는 result/transition 화면. upstream 화면이 받은 데이터를 표시만 할 때만 사용.
status: draft             # 문서 라이프사이클: missing|draft|review|confirmed|implemented|verified|deprecated
# 기본 screen lifecycle은 active이며 필드를 생략한다. 사람이 canonical 통합을 확정한 source에만 아래를 사용:
# screen_lifecycle: absorbed
# absorbed_into: "{ACTIVE_CANONICAL_SCREEN_ID}"
# absorbed_at: "{YYYY-MM-DD}"  # 선택; 실제 absorption 날짜
# 전체 계약: docs/reference/screen-lifecycle.md (status: absorbed 사용·prose 추론 금지)
# 여러 화면이 공유하는 결정만 global/open-decisions.md 의 canonical ID를 참조한다.
# 화면 하나에만 속한 결정은 아래 ## Open Decisions 표에 계속 둔다.
# decision_refs:
#   - D-120
sources:
  - { type: planning, ref: "{기획 출처}" }
  - { type: wireframe, ref: "{와이어프레임 경로}" }
depends_on: [navigation-map]
last_reviewed: "{YYYY-MM-DD}"
# status: confirmed 로 승격할 때만 사람이 추가 (LLM 승격 금지):
#   approved_by: {담당자}
#   approved_at: {YYYY-MM-DD}
#   decision_id: {D-000}      # decision-log.md 와 연결
#
# tbd/unknown/candidate 개수는 frontmatter 에 쓰지 않는다 —
# workflow-state.mjs 가 본문(Unknowns/Copy Keys/API Candidates)을 파싱해 계산한다.
---

<!--
  STUB 모드: 화면 발굴 단계에서는 위 frontmatter 만 채우고 본문은 비워 둔다.
  구현 직전에 아래 섹션들을 작성한다. 작성 규칙:
  - API endpoint 는 확정하지 말고 candidate 로만 적는다.
  - 모르는 내용(사실 확인)은 Unknowns 에, 미확정 문구는 Copy Keys 에 적는다(문구 자체가 미정이면 tbd, 입력이 준 문구지만 미확정이면 draft).
  - 결정이 필요한 선택(정책/UX/API 방향)은 추측하지 말고 Open Decisions 에 open 으로 적는다.
  - 디자인을 추측하지 말고 화면 구조와 사용자 행동만 정리한다.
  - 화면 이동은 Interaction Matrix 에만 선언한다 (Entry Points 는 생성됨).
  - 표 헤더는 바꾸지 않는다 (workflow-state.mjs 가 헤더로 표를 파싱한다).
-->

# ScreenSpec: {화면 이름}

## Purpose
{이 화면이 사용자에게 무엇을 가능하게 하는지 1~3문장으로.}

## Entry Points
<!-- GENERATED:START nav-graph -->
<!-- 직접 작성하지 마세요. 다른 화면 Interaction Matrix 선언을 `npm run workflow:nav` 가 역색인해 채웁니다. -->
<!-- GENERATED:END nav-graph -->

## UI Sections
1. {섹션}
2. {섹션}

## State Matrix
<!-- 필수 상태 6종(loading/empty/error/success/disabled/refreshing)은 모두 채운다. State 컬럼 이름/값을 유지한다. -->
| State | Condition | UI |
|---|---|---|
| loading | {조건} | {컴포넌트} |
| empty | {조건} | {컴포넌트} |
| error | {조건} | {컴포넌트} |
| success | {조건} | {컴포넌트} |
| disabled | {비활성 조건} | {disabled control/state} |
| refreshing | {조건} | {컴포넌트} |

## Interaction Matrix
<!-- 화면 이동 엣지의 단일 선언 지점. 여기 적은 이동이 대상 화면 Entry Points 로 집계된다.
     Result 컬럼은 비워두지 않는다 (이동이면 명시적 라우트 토큰, 상태변경이면 동작을 적는다).
     v1 free-form Result 에서 라우트는 `/route`처럼 독립 토큰으로, 가능하면 backtick 으로 감싼다.
     자연어의 슬래시 표현(예: 형식/마스킹)은 라우트 근거가 아니다.

     (선택) v2 구조화 컬럼 — 아래 4컬럼 사이에 Result Type | Target | Params 를 더 추가하면 라우트를 명시적으로 분리할 수 있다.
       · Result Type 값: route | state | mutation | external | none (제안값).
       · Result Type=route 행은 nav-graph 와 validate 검사 4가 Target 셀에서 라우트를 읽는다.
         코드 예시/자연어 Result 는 Target 이 있을 때 canonical route source 가 아니다.
         비-route 행(state/mutation/external/none)은 이동 엣지를 만들지 않는다.
       · v2 컬럼이 없으면 기존 v1 Result 파싱으로 그대로 동작한다(완전 하위호환 — 표 단위로 자동 판정).
       · 미확정 이동 대상은 Target 을 추측해 채우지 말고 candidate 표기/Open Decision 으로 남긴다(LLM 승격 금지).
       · validate 는 v2 형식 문제(검사 13)를 경고(warning-first)로만 알린다 — 차단하지 않는다. -->
| User Action | Trigger | Result | Analytics Event |
|---|---|---|---|
| {액션} | {트리거} | {결과/라우트} | {이벤트 또는 -} |

## Mutation Matrix
<!-- 조회 전용 화면이면 아래 표를 지우고 "없음" 한 줄로 명시. 있으면 반드시 작성.
     Invalidate QueryKeys 는 queryKey factory 이름으로 적는다 (couponKeys.all 등). -->
없음

## Data Requirements
- {필요 데이터}

## API Candidates
<!-- "- METHOD /path (confidence: unknown|candidate|confirmed)" 형식. 추측 금지.
     자체 API 호출이 없는 result/transition 화면은 frontmatter 에 api_required:false 를 추가하고,
     이 섹션에는 "없음 — upstream 화면의 API 결과/route params 를 표시" 처럼 prose 로 명시한다.
     일부 candidate 를 deferred 하면서 도착한 계약만 배선해야 하면 불릿을 모두 지우고
     docs/reference/api-candidate-deferral.md 의 v2 표(Method|Path|Confidence|Gate|Tracking|Slice Paths)를 쓴다.
     v2 는 모든 행(active 포함)에 좁은 exact path 또는 terminal /** Slice Paths 가 필요하며,
     임의 글롭(*.ts, foo*, 중간 **)·복수 표·legacy 불릿 혼합은 허용하지 않는다. -->
- {METHOD} {/path} (confidence: candidate)

## Copy Keys
<!-- 문구를 LLM 이 지어내지 않도록 i18n 키로 관리한다. Status 는 3-state — 표 헤더는 바꾸지 않는다:
       confirmed = 승인된 확정 문구. LLM 승격 금지 — 사람만 confirmed 로 올린다.
       draft     = 입력(기획·figma 등)이 제공한 문구지만 미확정/미승인, 또는 그 키의 존재가 open decision 에 달림.
                   값은 채우되 미확정 상태로 둔다. 입력이 라벨을 줬으면 LLM 은 draft 로 두고, confirmed 승격은 사람이 한다.
       tbd       = 문구 자체가 미정. 값은 "TBD". 이 행만 copy_keys_has_tbd 신호를 켠다
                   (tbd_count 는 Copy Keys 가 아니라 Unknowns 의 open 행에서 나온다 — 별개 지표).
     draft 는 값이 있으므로 tbd 가 아니다 → copy_keys_has_tbd 에 집계되지 않는다 (confirmed 도 미집계). -->
| Key | 문구 | Status |
|---|---|---|
| {key.confirmed} | {승인된 확정 문구} | confirmed |
| {key.draft} | {입력이 제공한 문구} | draft |
| {key.tbd} | TBD | tbd |

## Accessibility
- {a11y 요구사항}

## Acceptance Criteria
<!-- State Matrix 와 중복 서술 금지. 테스트로 옮길 수 있는 항목은 테스트 ID 를 적는다. -->
- [ ] {기준} → {테스트 파일/ID}

## Unknowns
<!-- 사실 확인 전용. Status 는 open|resolved. open 행 수가 tbd_count 로 집계된다. -->
| ID | Question | Status |
|---|---|---|
| U-001 | {질문} | open |

## Open Decisions
<!-- 입력만으로 정해지지 않고 산출물 형태를 바꾸는 "선택"은 LLM 이 임의로 정하지 말고 여기 open 행으로 남긴다.
     여러 화면이 공유하는 결정은 여기 복제하지 않고 global/open-decisions.md canonical 행 + frontmatter decision_refs를 사용한다.
     사실 확인은 Unknowns(여긴 결정 전용). Status 는 open|resolved.
     LLM 은 open 행 추가, 그리고 새 입력이 기존 resolved 결정과 충돌하면 resolved → open 재오픈까지만 한다.
     게이트를 내리는 일(재-resolve · status confirmed 승격 · conflict 닫기)은 모두 사람만.
     Blocking Mode 는 implementation-mode-policy.yaml 의 모드명. resolved 면 Options 에 선택값을 표시한다.
     표 헤더는 바꾸지 않는다 (workflow-state.mjs 가 헤더로 표를 파싱한다). -->
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-001 | {결정 질문} | {옵션 또는 TBD} | final-fixture-ui | PM | open |
