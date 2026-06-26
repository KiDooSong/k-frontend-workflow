---
artifact_id: COUPON-001-screen-spec
artifact_type: screen-spec
domain: coupons
screen_id: COUPON-001
route: /(tabs)/coupons
status: draft
sources:
  - { type: planning, ref: figma-planning/coupon-list-12 }
depends_on: [navigation-map]
last_reviewed: 2026-06-12
---

# ScreenSpec: 쿠폰 목록

## Purpose
사용자가 보유 쿠폰을 확인하고, 사용 가능한 쿠폰과 만료된 쿠폰을 구분해서 볼 수 있다.

## Entry Points
<!-- GENERATED:START nav-graph -->
<!-- DO NOT EDIT MANUALLY. Generated from Navigation Map and inbound Interaction Matrix route edges. -->
<!-- GENERATED:END nav-graph -->

## UI Sections
1. Header
2. Coupon List
3. Empty State
4. Error State

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
| User Action | Trigger | Result | Analytics Event |
|---|---|---|---|
| 쿠폰 클릭 | CouponCard press | /coupons/[id] | coupon_card_click |
| 새로고침 | pull to refresh | refetch | - |
| 재시도 | ErrorState button | refetch | - |

## Mutation Matrix
없음

## Data Requirements
- 보유 쿠폰 목록 (상태: 사용 가능 / 사용 완료 / 만료)
- 만료일, 사용 조건

## API Candidates
- GET /coupons (confidence: candidate)
- GET /coupons/{id} (confidence: candidate)

## Copy Keys
| Key | 문구 | Status |
|---|---|---|
| coupon.list.title | 쿠폰 | confirmed |
| coupon.list.empty | TBD | tbd |

## Accessibility
- CouponCard: accessibilityRole="button", accessibilityLabel="{title}, {만료일}"

## Acceptance Criteria
- [ ] State Matrix 의 6개 상태가 모두 구현됨 → CouponListScreen.test.tsx
- [ ] 쿠폰 클릭 시 상세 이동 → maestro/coupon-list.yaml
- [ ] 만료 쿠폰 노출 정책 반영 (D-001 확정 후)

## Unknowns
| ID | Question | Status |
|---|---|---|
| U-001 | 현재 쿠폰 API 응답 예시(목록/상세)는 어디에 있는가? | open |

## Open Decisions
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-001 | 만료 쿠폰을 목록에 노출할 것인가? | show / hide / separate tab | final-fixture-ui | PM | open |
| D-003 | 쿠폰 목록 페이지네이션 방식은? | cursor / offset / none | api-integrated-ui | BE | open |
