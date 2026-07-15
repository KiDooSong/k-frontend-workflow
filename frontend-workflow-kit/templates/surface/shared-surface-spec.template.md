---
artifact_id: "{SURFACE_ID}-shared-surface-spec"
artifact_type: shared-surface-spec
domain: "{domain}"
surface_id: "{SURFACE_ID}"
member_screens:
  - "{SCREEN_ID_1}"
  - "{SCREEN_ID_2}"
# 선택: exact project-relative path 또는 하나의 좁은 terminal /** 패턴만 허용한다.
# 이 선언 자체는 구현 권한이 아니다. surface/member readiness와 policy 교집합만 허용된다.
# implementation_paths:
#   - src/features/{domain}/components/{surface}/**
# api_required: false
status: draft
sources:
  - { type: planning, ref: "{기획 출처}" }
# 모든 surface 결정은 global/open-decisions.md canonical 행을 참조한다. local 표는 금지한다.
# decision_refs:
#   - D-220
last_reviewed: "{YYYY-MM-DD}"
# status: confirmed 로 승격할 때만 사람이 추가:
#   approved_by: {담당자}
#   approved_at: {YYYY-MM-DD}
#   decision_id: {D-000}
---

<!--
  shared-surface-spec은 둘 이상의 같은-domain canonical 화면에 합성되는 비라우팅 공통 동작을 소유한다.
  ScreenSpec은 화면 identity/route/Entry Points/route transition을 계속 소유한다.
  surface member는 frontmatter member_screens 한 곳에서만 선언한다(surface_refs 역참조 수동 작성 금지).
  Interaction Matrix는 v2만 사용하며 Result Type=route는 금지한다.
-->

# Shared Surface: {이름}

## Purpose
{모든 member 화면에서 동일하게 제공하는 사용자 가치.}

## UI Sections
1. {공통 섹션}

## Host Contract
| Direction | Name | Meaning | Required |
|---|---|---|---|
| input | {inputName} | {host가 제공하는 값} | no |
| output | {callbackName} | {surface가 내보내는 normalized intent} | yes |

## State Matrix
| State | Condition | UI |
|---|---|---|
| loading | {조건} | {표현} |
| empty | {조건} | {표현} |
| error | {조건} | {표현} |
| success | {조건} | {표현} |
| disabled | {조건} | {표현} |
| refreshing | {조건} | {표현} |

## Interaction Matrix
<!-- Result Type은 state|mutation|external|none만 허용한다. route edge는 member ScreenSpec에 둔다. -->
| User Action | Trigger | Result | Result Type | Target | Params | Analytics Event |
|---|---|---|---|---|---|---|
| {액션} | {트리거} | {공통 결과} | state | {상태 이름 또는 -} | {params 또는 -} | {이벤트 또는 -} |

## Mutation Matrix
없음

## Data Requirements
- {공통 데이터 요구}

## API Candidates
- {METHOD} {/path} (confidence: candidate)

## Copy Keys
| Key | 문구 | Status |
|---|---|---|
| {key.draft} | {입력이 제공한 문구} | draft |

## Accessibility
- {공통 a11y 요구}

## Acceptance Criteria
- [ ] {모든 member host에서 동일하게 성립하는 검증 기준}

## Unknowns
| ID | Question | Status |
|---|---|---|
| U-001 | {사실 확인 질문} | open |
