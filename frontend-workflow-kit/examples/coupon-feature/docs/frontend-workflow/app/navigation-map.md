---
artifact_id: navigation-map
artifact_type: navigation-map
status: draft
last_reviewed: 2026-06-12
---

# Navigation Map (Skeleton)

## Structure
- Tabs: /(tabs)/home, /(tabs)/coupons, /(tabs)/my
- Auth Stack: /(auth)/login, /(auth)/signup
- Modals: /modal/terms

## Route Guard
- 미로그인 사용자가 Private Route 접근 시 /(auth)/login 으로 보낸다.
- 로그인 사용자가 /(auth)/login 접근 시 /(tabs)/home 으로 보낸다.

## Deep Links
| Pattern | Route | Auth 필요 | 비고 |
|---|---|---|---|
| myapp://coupons/:id | /coupons/[id] | yes | 푸시 알림 진입점 |
| myapp://login | /(auth)/login | no | |

## Cross-Domain Edges
<!-- 서로 다른 도메인을 잇는 이동만. 도메인 내부 이동은 각 ScreenSpec 에 선언 -->
| From | To | Trigger |
|---|---|---|
| HOME-001 | COUPON-001 | 보유 쿠폰 카드 |
| AUTH-001 | HOME-001 | 로그인 성공 |
