---
artifact_id: navigation-map
artifact_type: navigation-map
status: draft
last_reviewed: 2026-06-15
---

# Navigation Map (Skeleton)

## Structure
- Tabs: /(tabs)/home, /(tabs)/coupons
- Stack/Modals: /coupons/[id]

## Route Guard
- 로그인 사용자가 /(tabs)/home 진입 시 대시보드를 보여준다.

## Deep Links
| Pattern | Route | Auth 필요 | 비고 |
|---|---|---|---|
| myapp://coupons/:id | /coupons/[id] | yes | 푸시 알림 진입점 |

## Cross-Domain Edges
<!-- 서로 다른 도메인을 잇는 이동만. 도메인 내부 이동은 각 ScreenSpec 에 선언 -->
| From | To | Trigger |
|---|---|---|
| HOME-001 | COUPON-001 | 보유 쿠폰 카드 |
