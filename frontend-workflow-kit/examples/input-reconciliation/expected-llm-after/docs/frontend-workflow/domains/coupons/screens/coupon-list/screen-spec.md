---
artifact_id: COUPON-001-screen-spec
artifact_type: screen-spec
domain: coupons
screen_id: COUPON-001
route: /(tabs)/coupons
status: draft
sources:
  - { type: planning, ref: figma-planning/coupon-list-12-v2 }
depends_on: [navigation-map]
last_reviewed: 2026-06-13
---

<!--
  expected-llm-after: reconcile-input(LLM) 단독 출력.
  - status 는 draft 그대로 (confirmed 승격은 사람 — 그래서 approved_by/approved_at/decision_id 없음).
  - simple-update(QA offline·api page envelope·figma 가로형/탭 시각)는 반영.
  - D-001/D-003 는 open, U-001 은 open, 탭 Copy Keys 는 draft (탭 존재가 D-001 에 달림).
-->

# ScreenSpec: 쿠폰 목록 (expected-llm-after)

## Purpose
사용자가 보유 쿠폰을 확인한다. 상태(사용 가능/사용 완료/만료) 구분 표시 방식은 D-001(open)에 달려 있다.

## Entry Points
<!-- GENERATED:START nav-graph -->
<!-- DO NOT EDIT MANUALLY. Generated from Navigation Map and inbound Interaction Matrix route edges. -->
<!-- GENERATED:END nav-graph -->

## UI Sections
<!-- #2 상태 탭은 D-001(open)·G-001(open)에 달린 후보 섹션이다 — 닫히기 전까지 확정 아님. -->
1. Header
2. Coupon Status Tabs (SegmentedTabs — G-001 open · D-001 미정)
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
| 상태 탭 변경 | SegmentedTabs press | 상태 필터 변경 (D-001 미정) | coupon_tab_change |
| 새로고침 | pull to refresh | refetch | - |
| 재시도 | ErrorState button | refetch | - |

## Mutation Matrix
없음

## Data Requirements
- 보유 쿠폰 목록 (상태: 사용 가능 / 사용 완료 / 만료)
- 만료일, 사용 조건
- 페이지 상태(page, hasNext) — offset/page **후보** (D-003 open)

## API Candidates
- GET /coupons (confidence: candidate)
- GET /coupons/{id} (confidence: candidate)

## Copy Keys
<!-- 탭 라벨은 IN-planning-001 이 제공한 값. 탭 존재가 D-001(open)에 달려 있어 draft — 사람이 D-001 을 separate-tab 으로 닫으며 confirmed 로 승격한다. empty 문구는 입력이 없어 baseline TBD 유지. -->
| Key | 문구 | Status |
|---|---|---|
| coupon.list.title | 쿠폰 | confirmed |
| coupon.list.empty | TBD | tbd |
| coupon.tab.available | 사용 가능 | draft |
| coupon.tab.used | 사용 완료 | draft |
| coupon.tab.expired | 만료 | draft |

## Accessibility
- CouponCard: accessibilityRole="button", accessibilityLabel="{title}, {만료일}"
- 상태 탭(SegmentedTabs): accessibilityState selected 반영 (탭 확정 시)
- testID anchors (draft/recommended, IN-20260613-testid-001): `coupon-list-title`, `coupon-list-item-{couponId}`, `coupon-list-empty`, `coupon-list-error`, `coupon-list-retry`
- `coupon-list-status-tabs` 는 D-001(open) 이 separate-tab 으로 닫히기 전까지 confirmed 로 올리지 않는다.
- VER-001: 상태 탭 selector 구조는 D-001 이 닫힌 뒤 Verification register 또는 이 note 에서 재확인한다.

## Acceptance Criteria
- [ ] State Matrix 의 상태(loading/empty/error/success/disabled/refreshing/offline)가 모두 구현됨 → CouponListScreen.test.tsx
- [ ] 오프라인 진입 시 네트워크 전용 ErrorState 표시, 복귀 후 Retry 시 정상 로드
- [ ] 만료 쿠폰 노출 정책 반영 (D-001 확정 후)

## Unknowns
<!-- U-001 은 IN-api-001 이 답(응답 예시)을 제공해 resolvable 이지만, resolved 로 닫는 것은 사람. LLM 은 open 유지. -->
| ID | Question | Status |
|---|---|---|
| U-001 | 현재 쿠폰 API 응답 예시(목록/상세)는 어디에 있는가? | open |

## Open Decisions
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-001 | 만료 쿠폰을 목록에 노출할 것인가? | show / hide / separate tab (IN-planning-001 → separate tab 후보) | final-fixture-ui | PM | open |
| D-003 | 쿠폰 목록 페이지네이션 방식은? | cursor / offset / none (IN-api-001 → offset/page 후보) | api-integrated-ui | BE | open |
