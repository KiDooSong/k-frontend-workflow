---
artifact_id: HOME-001-screen-spec
artifact_type: screen-spec
domain: home
screen_id: HOME-001
route: /(tabs)/home
status: draft
sources:
  - { type: planning, ref: figma-planning/home-3 }
depends_on: [navigation-map]
last_reviewed: 2026-06-12
---

# ScreenSpec: 홈

## Purpose
앱 진입 후 첫 화면. 보유 쿠폰 요약·공지·추천을 한눈에 보여주는 대시보드.

## Entry Points
<!-- GENERATED:START nav-graph -->
<!-- DO NOT EDIT MANUALLY. Generated from Navigation Map and inbound Interaction Matrix route edges. -->
<!-- GENERATED:END nav-graph -->

## UI Sections
1. Greeting Header
2. Coupon Summary Card
3. Notice Strip
4. Recommendation List (구성 미정 — D-101)

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
| User Action | Trigger | Result | Analytics Event |
|---|---|---|---|
| 보유 쿠폰 카드 클릭 | Card press | /(tabs)/coupons | home_coupon_card_click |
| 공지 더보기 | Notice strip press | /notices | home_notice_more_click |

## Mutation Matrix
없음

## Data Requirements
- 보유 쿠폰 요약(개수/임박 만료)
- 최신 공지 1~2건
- 추천 항목 (구성 미정 — D-101)

## API Candidates
- GET /home/summary (confidence: unknown)

## Copy Keys
| Key | 문구 | Status |
|---|---|---|
| home.greeting | 안녕하세요 | confirmed |
| home.coupon.summary | 보유 쿠폰 | confirmed |
| home.reco.title | TBD | tbd |

## Accessibility
- 각 카드 accessibilityRole="button", 의미 있는 label
- 섹션 헤더 accessibilityRole="header"

## Acceptance Criteria
- [ ] State Matrix 의 6개 상태가 모두 구현됨 → HomeScreen.test.tsx
- [ ] 쿠폰 요약 카드 클릭 시 쿠폰 목록으로 이동
- [ ] 위젯 구성 확정(D-101) 전에는 추천 영역을 placeholder 로 둔다

## Unknowns
| ID | Question | Status |
|---|---|---|
| U-101 | 홈 요약 API(/home/summary) 스펙·필드는 어디서 확정되나? | open |

## Open Decisions
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-101 | 홈 대시보드 위젯 구성/우선순위(쿠폰 요약·공지·추천) | TBD | rough-fixture-ui | PM | open |
