---
artifact_id: COUPON-001-screen-spec
artifact_type: screen-spec
domain: coupons
screen_id: COUPON-001
route: /(tabs)/coupons
status: draft
sources:
  - { type: planning, ref: figma-planning/coupon-list-1 }
depends_on: [navigation-map]
last_reviewed: 2026-06-15
---

# ScreenSpec: 쿠폰 목록 (Interaction Matrix v2)

## Purpose
사용자가 보유 쿠폰을 확인하고 상세로 이동할 수 있다. (이 화면은 v2 구조화 Interaction Matrix 를 사용한다.)

## Entry Points
<!-- GENERATED:START nav-graph -->
<!-- DO NOT EDIT MANUALLY. Generated from Navigation Map and inbound Interaction Matrix route edges. -->
<!-- GENERATED:END nav-graph -->

## UI Sections
1. Header
2. Coupon List

## State Matrix
| State | Condition | UI |
|---|---|---|
| loading | query.isLoading | SkeletonList |
| empty | data.length === 0 | EmptyState |
| error | query.isError | ErrorState + Retry |
| success | data.length > 0 | CouponList |
| disabled | 주요 액션 사용 조건 미충족 또는 요청 처리 중 | disabled control/state |
| refreshing | query.isRefreshing | RefreshControl |

## Interaction Matrix
<!-- v2 구조화: 라우트는 Target 에서, 자연어 요약은 Result 에서. state 행은 이동 엣지를 만들지 않는다. -->
| User Action | Trigger | Result | Result Type | Target | Params | Analytics Event |
|---|---|---|---|---|---|---|
| 쿠폰 클릭 | CouponCard press | 쿠폰 상세로 이동 | route | /coupons/[id] | id | coupon_card_click |
| 상태 탭 변경 | Tab press | status filter 변경 | state | status filter 변경 |  | coupon_tab_change |

## Mutation Matrix
없음

## Data Requirements
- 보유 쿠폰 목록 (상태: 사용 가능 / 사용 완료 / 만료)

## API Candidates
- GET /coupons (confidence: candidate)

## Copy Keys
| Key | 문구 | Status |
|---|---|---|
| coupon.list.title | 쿠폰 | confirmed |

## Accessibility
- CouponCard: accessibilityRole="button", accessibilityLabel="{title}, {만료일}"

## Acceptance Criteria
- [ ] 쿠폰 클릭 시 상세 이동

## Unknowns
| ID | Question | Status |
|---|---|---|
| U-001 | 쿠폰 상세 API 응답 예시는 어디에 있는가? | open |

## Open Decisions
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-001 | 만료 쿠폰을 목록에 노출할 것인가? | show / hide / separate tab | final-fixture-ui | PM | open |
