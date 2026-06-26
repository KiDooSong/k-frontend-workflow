---
artifact_id: COUPON-001-screen-spec
artifact_type: screen-spec
domain: coupons
screen_id: COUPON-001
route: /(tabs)/coupons
status: confirmed
approved_by: 김PM
approved_at: 2026-06-13
decision_id: D-001
sources:
  - { type: planning, ref: figma-planning/coupon-list-12-v2 }
depends_on: [navigation-map]
last_reviewed: 2026-06-13
---

# ScreenSpec: 쿠폰 목록 (expected-after)

## Purpose
사용자가 보유 쿠폰을 상태 탭(사용 가능/사용 완료/만료)으로 구분해 확인한다.

## Entry Points
<!-- GENERATED:START nav-graph -->
<!-- DO NOT EDIT MANUALLY. Generated from Navigation Map and inbound Interaction Matrix route edges. -->
<!-- GENERATED:END nav-graph -->

## UI Sections
1. Header
2. Coupon Status Tabs (SegmentedTabs — G-001)
3. Coupon List (CouponCard 가로형)
4. Empty State
5. Error State

## State Matrix
| State | Condition | UI |
|---|---|---|
| loading | query.isLoading | SkeletonList |
| empty | data.length === 0 | EmptyState |
| error | query.isError (서버) | ErrorState + Retry |
| success | data.length > 0 | CouponList |
| disabled | 주요 액션 사용 조건 미충족 또는 요청 처리 중 | disabled control/state |
| refreshing | query.isRefreshing | RefreshControl |
| offline | 네트워크 없음 | 네트워크 전용 ErrorState + Retry |

## Interaction Matrix
| User Action | Trigger | Result | Analytics Event |
|---|---|---|---|
| 쿠폰 클릭 | CouponCard press | /coupons/[id] | coupon_card_click |
| 상태 탭 변경 | SegmentedTabs press | 상태 필터 변경 | coupon_tab_change |
| 새로고침 | pull to refresh | refetch | - |
| 재시도 | ErrorState button | refetch | - |

## Mutation Matrix
없음

## Data Requirements
- 보유 쿠폰 목록 (상태: 사용 가능 / 사용 완료 / 만료)
- 만료일, 사용 조건
- 페이지 상태(page, hasNext) — offset/page (D-003)

## API Candidates
- GET /coupons (confidence: candidate)
- GET /coupons/{id} (confidence: candidate)

## Copy Keys
| Key | 문구 | Status |
|---|---|---|
| coupon.list.title | 쿠폰 | confirmed |
| coupon.list.empty | 사용 가능한 쿠폰이 없습니다 | confirmed |
| coupon.tab.available | 사용 가능 | confirmed |
| coupon.tab.used | 사용 완료 | confirmed |
| coupon.tab.expired | 만료 | confirmed |

## Accessibility
- CouponCard: accessibilityRole="button", accessibilityLabel="{title}, {만료일}"
- 상태 탭(SegmentedTabs): accessibilityState selected 반영
- testID anchors (recommended, IN-20260613-testid-001): `coupon-list-title`, `coupon-list-status-tabs`, `coupon-list-item-{couponId}`, `coupon-list-empty`, `coupon-list-error`, `coupon-list-retry`
- testID naming 은 별도 승인 전까지 readiness/confirmed 승격 근거가 아니다.
- VER-001: 상태 탭 selector 구조는 별도 Verification evidence 이며 readiness/confirmed 승격 근거가 아니다.

## Acceptance Criteria
- [ ] State Matrix 의 상태(loading/empty/error/success/disabled/refreshing/offline)가 모두 구현됨 → CouponListScreen.test.tsx
- [ ] 상태 탭 전환 시 목록이 해당 상태로 필터링됨
- [ ] 오프라인 진입 시 네트워크 전용 ErrorState 표시, 복귀 후 Retry 시 정상 로드
- [ ] 만료 쿠폰은 '만료' 탭에 노출 (D-001 → separate tab)

## Unknowns
| ID | Question | Status |
|---|---|---|
| U-001 | 현재 쿠폰 API 응답 예시(목록/상세)는 어디에 있는가? | resolved |

## Open Decisions
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-001 | 만료 쿠폰을 목록에 노출할 것인가? | → separate tab | final-fixture-ui | PM | resolved |
| D-003 | 쿠폰 목록 페이지네이션 방식은? | → offset/page | api-integrated-ui | BE | resolved |
