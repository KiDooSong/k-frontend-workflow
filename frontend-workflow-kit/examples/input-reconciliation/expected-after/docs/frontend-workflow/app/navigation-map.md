---
artifact_id: navigation-map
artifact_type: navigation-map
status: draft
last_reviewed: 2026-06-13
---

# Navigation Map (Skeleton) — expected-after

> IN-20260613-meeting-001 반영: Route Guard 의 "로그인 성공 후 이동"에 returnTo 우선 규칙이 추가됐다 (D-204 재오픈 → 사람이 재-resolve 한 결과).
> baseline 대비 바뀐 곳은 **Route Guard** 뿐이다 (Structure/Deep Links/Cross-Domain Edges 는 동일).

## Structure
- Tabs: /(tabs)/home, /(tabs)/coupons, /(tabs)/my
- Auth Stack: /(auth)/login
- Stack/Modals: /coupons/[id], /notices

## Route Guard
- 미로그인 사용자가 Private Route 접근 시 /(auth)/login 으로 보낸다 (원래 목적지를 returnTo 로 보존).
- 로그인 사용자가 /(auth)/login 접근 시 /(tabs)/home 으로 보낸다.
- 로그인 성공 시: returnTo 가 있으면 returnTo 로, 없으면 /(tabs)/home 으로 이동한다. (D-204 재-resolve: 기본 홈 + returnTo 우선)

## Deep Links
| Pattern | Route | Auth 필요 | 비고 |
|---|---|---|---|
| myapp://coupons/:id | /coupons/[id] | yes | 푸시 알림 진입점 |
| myapp://notices | /notices | no | |
| myapp://login | /(auth)/login | no | |

## Cross-Domain Edges
| From | To | Trigger |
|---|---|---|
| AUTH-001 | HOME-001 | 로그인 성공 |
| HOME-001 | COUPON-001 | 보유 쿠폰 카드 |
| HOME-001 | NOTICE-001 | 공지 더보기 |
