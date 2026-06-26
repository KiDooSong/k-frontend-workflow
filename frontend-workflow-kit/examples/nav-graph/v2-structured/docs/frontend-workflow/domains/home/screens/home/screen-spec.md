---
artifact_id: HOME-001-screen-spec
artifact_type: screen-spec
domain: home
screen_id: HOME-001
route: /(tabs)/home
status: draft
sources:
  - { type: planning, ref: figma-planning/home-1 }
depends_on: [navigation-map]
last_reviewed: 2026-06-15
---

# ScreenSpec: 홈 (Interaction Matrix v2)

## Purpose
앱 진입 후 첫 화면. 보유 쿠폰 요약을 보여주고 쿠폰 목록으로 이동한다. (이 화면은 v2 구조화 Interaction Matrix 를 사용한다.)

## Entry Points
<!-- GENERATED:START nav-graph -->
<!-- DO NOT EDIT MANUALLY. Generated from Navigation Map and inbound Interaction Matrix route edges. -->
<!-- GENERATED:END nav-graph -->

## UI Sections
1. Greeting Header
2. Coupon Summary Card

## State Matrix
| State | Condition | UI |
|---|---|---|
| loading | query.isLoading | SkeletonList |
| empty | 데이터 없음 | EmptyState |
| error | query.isError | ErrorState + Retry |
| success | data 존재 | Dashboard Sections |
| disabled | 주요 액션 사용 조건 미충족 또는 요청 처리 중 | disabled control/state |
| refreshing | query.isRefreshing | RefreshControl |

## Interaction Matrix
<!-- v2 구조화: route 행은 Target 에서 라우트를 읽는다. 비-route 행(mutation 등)은 이동 엣지를 만들지 않는다. -->
| User Action | Trigger | Result | Result Type | Target | Params | Analytics Event |
|---|---|---|---|---|---|---|
| 보유 쿠폰 카드 클릭 | 보유 쿠폰 카드 | 쿠폰 목록으로 이동 | route | /(tabs)/coupons |  | home_coupon_card_click |
| 새로고침 | pull to refresh | 요약 refetch | mutation | refetch |  | - |

## Mutation Matrix
없음

## Data Requirements
- 보유 쿠폰 요약(개수/임박 만료)

## API Candidates
- GET /home/summary (confidence: unknown)

## Copy Keys
| Key | 문구 | Status |
|---|---|---|
| home.greeting | 안녕하세요 | confirmed |

## Accessibility
- 각 카드 accessibilityRole="button", 의미 있는 label

## Acceptance Criteria
- [ ] 쿠폰 요약 카드 클릭 시 쿠폰 목록으로 이동

## Unknowns
| ID | Question | Status |
|---|---|---|
| U-201 | 홈 요약 API 스펙은 어디서 확정되나? | open |

## Open Decisions
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-201 | 홈 대시보드 위젯 구성 | TBD | rough-fixture-ui | PM | open |
