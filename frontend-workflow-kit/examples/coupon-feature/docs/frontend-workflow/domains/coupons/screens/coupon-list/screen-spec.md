---
artifact_id: COUPON-001-screen-spec
artifact_type: screen-spec
domain: coupons
screen_id: COUPON-001
route: /(tabs)/coupons
status: confirmed
approved_by: 김PM
approved_at: 2026-06-12
decision_id: D-014
sources:
  - { type: planning, ref: figma-planning/coupon-slide-12 }
  - { type: wireframe, ref: docs/raw/wireframes/coupon-list.md }
depends_on: [navigation-map]
last_reviewed: 2026-06-12
---

# ScreenSpec: 쿠폰 목록

## Purpose
사용자가 보유 쿠폰을 확인하고, 사용 가능한 쿠폰과 만료된 쿠폰을 구분해서 볼 수 있다.

## Entry Points
<!-- GENERATED:START nav-graph -->
<!-- 직접 작성하지 마세요. 다른 화면 Interaction Matrix 선언을 `npm run workflow:nav` 가 역색인해 채웁니다. -->
<!-- MVP-A 임시: nav-graph 생성기 이전이라 아래는 수동 기재. MVP-C에서 생성으로 전환됩니다. -->
- 하단 탭 > 쿠폰 (navigation-map: Tabs)
- HOME-001 > 보유 쿠폰 카드 클릭
<!-- GENERATED:END nav-graph -->

## UI Sections
1. Header
2. Coupon Status Tabs
3. Coupon List
4. Empty State
5. Error State

## State Matrix
| State | Condition | UI |
|---|---|---|
| loading | query.isLoading | SkeletonList |
| success | data.length > 0 | CouponList |
| empty | data.length === 0 | EmptyState |
| error | query.isError | ErrorState + Retry |
| refreshing | query.isRefreshing | RefreshControl |

## Interaction Matrix
<!-- 화면 이동 엣지의 단일 선언 지점. 여기 적은 이동이 대상 화면 Entry Points 로 집계된다 -->
| User Action | Trigger | Result | Analytics Event |
|---|---|---|---|
| 쿠폰 클릭 | CouponCard press | /coupons/[id] | coupon_card_click |
| 상태 탭 변경 | Tab press | status filter 변경 | coupon_tab_change |
| 새로고침 | pull to refresh | refetch | - |
| 재시도 | ErrorState button | refetch | - |

## Mutation Matrix
<!-- 조회 전용 화면이면 "없음". 있으면 invalidate 대상을 queryKey factory 이름으로 적는다 -->
| Action | API | Optimistic | Invalidate QueryKeys | Success UI | Failure UI |
|---|---|---|---|---|---|
| 쿠폰 사용 | useUseCoupon (candidate) | no | couponKeys.all, couponKeys.detail(id) | 토스트 + 상태 갱신 | 에러 토스트 + 롤백 |

## Data Requirements
- 보유 쿠폰 목록 (상태: 사용 가능 / 사용 완료 / 만료)
- 만료일, 사용 조건, 쿠폰 이미지

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
- 상태 탭: accessibilityState selected 반영

## Acceptance Criteria
<!-- State Matrix 와 중복 서술 금지. 테스트로 옮길 수 있는 항목은 테스트 ID 를 적는다 -->
- [ ] State Matrix 의 5개 상태가 모두 구현됨 → CouponListScreen.test.tsx
- [ ] 쿠폰 클릭 시 상세 이동 → maestro/coupon-list.yaml
- [ ] 만료 쿠폰 노출 정책 반영 (D-001 확정 후)

## Unknowns
<!-- 사실 확인 전용 (어딘가에서 찾아오면 해결되는 것). 선택/결정은 Open Decisions 로. -->
| ID | Question | Status |
|---|---|---|
| U-001 | 현재 쿠폰 API 응답 예시(목록/상세)는 어디에 있는가? | open |

## Open Decisions
<!-- 사실 확인이 아니라 팀이 "선택"해야 하는 것. LLM 은 open 으로만 남기고, resolved 는 사람이 닫는다. -->
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-001 | 만료 쿠폰을 목록에 노출할 것인가? | show / hide / separate tab | final-fixture-ui | PM | open |
| D-002 | 쿠폰 목록 정렬 기준은 무엇인가? | expiry_date / created_at / manual_priority | final-fixture-ui | PM | open |
| D-003 | 쿠폰 목록 페이지네이션 방식은? | cursor / offset / none | api-integrated-ui | BE | open |
