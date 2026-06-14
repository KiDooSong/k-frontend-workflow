---
artifact_id: navigation-map
artifact_type: navigation-map
status: draft
last_reviewed: 2026-06-14
---

# Navigation Map (Skeleton)

## Structure
- Tabs: /(tabs)/coupons
- Stack/Modals: /coupons/[id]

## Route Guard
- 로그인 사용자가 /(tabs)/coupons 진입 시 쿠폰 목록을 보여준다.

## Deep Links
| Pattern | Route | Auth 필요 | 비고 |
|---|---|---|---|
| myapp://coupons/:id | /coupons/[id] | yes | 푸시 알림 진입점 |
