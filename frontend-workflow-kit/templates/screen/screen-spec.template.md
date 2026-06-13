---
artifact_id: {SCREEN_ID}-screen-spec
artifact_type: screen-spec
domain: {domain}
screen_id: {SCREEN_ID}
route: {route}            # 라우트의 단일 출처. inventory/stub 가 frontmatter 에서 읽는다 (본문에 중복 금지)
status: draft             # 문서 라이프사이클: missing|draft|review|confirmed|implemented|verified|deprecated
sources:
  - { type: planning, ref: {기획 출처} }
  - { type: wireframe, ref: {와이어프레임 경로} }
depends_on: [navigation-map]
last_reviewed: {YYYY-MM-DD}
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
  - 모르는 내용은 Unknowns 에, 미확정 문구는 Copy Keys 에 tbd 로 적는다.
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
<!-- 필수 상태 5종(loading/success/empty/error/refreshing)은 모두 채운다. State 컬럼 이름/값을 유지한다. -->
| State | Condition | UI |
|---|---|---|
| loading | {조건} | {컴포넌트} |
| success | {조건} | {컴포넌트} |
| empty | {조건} | {컴포넌트} |
| error | {조건} | {컴포넌트} |
| refreshing | {조건} | {컴포넌트} |

## Interaction Matrix
<!-- 화면 이동 엣지의 단일 선언 지점. 여기 적은 이동이 대상 화면 Entry Points 로 집계된다.
     Result 컬럼은 비워두지 않는다 (이동이면 라우트, 상태변경이면 동작을 적는다). -->
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
<!-- "- METHOD /path (confidence: unknown|candidate|confirmed)" 형식. 추측 금지. -->
- {METHOD} {/path} (confidence: candidate)

## Copy Keys
<!-- 문구를 LLM 이 지어내지 않도록 i18n 키 또는 확정 문구로 관리. 미확정은 Status=tbd. -->
| Key | 문구 | Status |
|---|---|---|
| {key} | {문구 또는 TBD} | confirmed |

## Accessibility
- {a11y 요구사항}

## Acceptance Criteria
<!-- State Matrix 와 중복 서술 금지. 테스트로 옮길 수 있는 항목은 테스트 ID 를 적는다. -->
- [ ] {기준} → {테스트 파일/ID}

## Unknowns
<!-- Status 는 open|resolved. open 행 수가 tbd_count 로 집계된다. -->
| ID | Question | Status |
|---|---|---|
| U-001 | {질문} | open |
