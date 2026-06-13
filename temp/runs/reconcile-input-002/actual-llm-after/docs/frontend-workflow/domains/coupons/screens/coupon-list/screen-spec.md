---
artifact_id: COUPON-001-screen-spec
artifact_type: screen-spec
domain: coupons
screen_id: COUPON-001
route: /(tabs)/coupons
status: draft
sources:
  - { type: planning, ref: figma-planning/coupon-list-12 }
  - { type: planning, ref: planning/2026-06-13-coupon-status-tabs }
  - { type: figma, ref: figma-planning/coupon-list-12-v2 }
  - { type: api, ref: api-doc/2026-06-13-coupons-pagination }
  - { type: qa, ref: qa/2026-06-13-coupon-offline-retry }
depends_on: [navigation-map]
last_reviewed: 2026-06-13
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
2. Status Tabs (사용 가능 / 사용 완료 / 만료)
3. Coupon List
4. Empty State
5. Error State

> 시각 매핑(CouponCard 가로형 · SegmentedTabs)은 figma-component-mapping.md 참조 (IN-20260613-figma-001). 어떤 쿠폰이 어느 탭에 속하는지(비즈니스)는 이 ScreenSpec 이 단일 출처.

## State Matrix
| State | Condition | UI |
|---|---|---|
| loading | query.isLoading | SkeletonList |
| success | data.length > 0 | CouponList |
| empty | data.length === 0 | EmptyState |
| error | query.isError (서버) | ErrorState + Retry |
| offline | network-error (오프라인/연결 실패) | 네트워크 전용 ErrorState + Retry |
| refreshing | query.isRefreshing | RefreshControl |

## Interaction Matrix
| User Action | Trigger | Result | Analytics Event |
|---|---|---|---|
| 쿠폰 클릭 | CouponCard press | /coupons/[id] | coupon_card_click |
| 상태 탭 전환 | SegmentedTabs press | 선택 상태 탭으로 목록 필터 | coupon_tab_switch |
| 새로고침 | pull to refresh | refetch | - |
| 재시도 | ErrorState button | refetch | - |

## Mutation Matrix
없음

## Data Requirements
- 보유 쿠폰 목록 (상태: 사용 가능 / 사용 완료 / 만료)
- 상태 탭별 필터 (사용 가능 / 사용 완료 / 만료)
- 만료일, 사용 조건
- 페이지네이션 상태(page / size / hasNext)는 fake hook 의 AsyncState 로 노출 — 화면은 API DTO 에 직접 의존하지 않는다

## API Candidates
- GET /coupons (confidence: candidate)
- GET /coupons/{id} (confidence: candidate)

## Copy Keys
| Key | 문구 | Status |
|---|---|---|
| coupon.list.title | 쿠폰 | confirmed |
| coupon.list.empty | TBD | tbd |
| coupon.tab.available | 사용 가능 | draft |
| coupon.tab.used | 사용 완료 | draft |
| coupon.tab.expired | 만료 | draft |

## Accessibility
- CouponCard: accessibilityRole="button", accessibilityLabel="{title}, {만료일}"
- Status Tabs: accessibilityRole="tab", 선택 탭 accessibilityState selected 반영

## Acceptance Criteria
- [ ] State Matrix 의 상태(loading/success/empty/error/offline/refreshing)가 모두 구현됨 → CouponListScreen.test.tsx
- [ ] 쿠폰 클릭 시 상세 이동 → maestro/coupon-list.yaml
- [ ] 만료 쿠폰 노출 정책 반영 (D-001 확정 후)
- [ ] 상태 탭 전환 시 선택 상태로 목록 필터 (D-001 확정 후) → CouponListScreen.test.tsx
- [ ] 오프라인 진입 시 네트워크 전용 ErrorState + Retry, 온라인 복귀 후 Retry 시 정상 로드 → maestro/coupon-list.yaml

## Unknowns
| ID | Question | Status |
|---|---|---|
| U-001 | 현재 쿠폰 API 응답 예시(목록/상세)는 어디에 있는가? | open |

## Open Decisions
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-001 | 만료 쿠폰을 목록에 노출할 것인가? | show / hide / separate tab | final-fixture-ui | PM | open |
| D-003 | 쿠폰 목록 페이지네이션 방식은? | offset/page (api-001 권고) / cursor / none | api-integrated-ui | BE | open |
