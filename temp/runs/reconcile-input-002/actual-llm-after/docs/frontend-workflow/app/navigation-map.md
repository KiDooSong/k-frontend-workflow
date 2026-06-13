---
artifact_id: navigation-map
artifact_type: navigation-map
status: draft
last_reviewed: 2026-06-12
---

# Navigation Map (Skeleton)

## Structure
- Tabs: /(tabs)/home, /(tabs)/coupons, /(tabs)/my
- Auth Stack: /(auth)/login
- Stack/Modals: /coupons/[id], /notices

## Route Guard
- 미로그인 사용자가 Private Route 접근 시 /(auth)/login 으로 보낸다.
- 로그인 사용자가 /(auth)/login 접근 시 /(tabs)/home 으로 보낸다.
- 로그인 성공 시 /(tabs)/home 으로 이동한다. (현재는 returnTo 미반영 — D-204 baseline)

## Deep Links
| Pattern | Route | Auth 필요 | 비고 |
|---|---|---|---|
| myapp://coupons/:id | /coupons/[id] | yes | 푸시 알림 진입점 |
| myapp://notices | /notices | no | |
| myapp://login | /(auth)/login | no | |

## Cross-Domain Edges
<!-- 서로 다른 도메인을 잇는 이동만. 도메인 내부 이동은 각 ScreenSpec 에 선언 -->
| From | To | Trigger |
|---|---|---|
| AUTH-001 | HOME-001 | 로그인 성공 |
| HOME-001 | COUPON-001 | 보유 쿠폰 카드 |
| HOME-001 | NOTICE-001 | 공지 더보기 |
