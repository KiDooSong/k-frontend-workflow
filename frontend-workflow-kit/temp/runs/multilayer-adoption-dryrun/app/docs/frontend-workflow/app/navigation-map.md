---
artifact_id: navigation-map
artifact_type: navigation-map
status: draft
last_reviewed: 2026-06-21
---

# Navigation Map (Skeleton)

## Structure
- Tabs: /(tabs)/home, /(tabs)/profile

## Route Guard
- 미로그인 사용자가 Private Route 접근 시 /(auth)/login 으로 보낸다.

## Deep Links
| Pattern | Route | Auth 필요 | 비고 |
|---|---|---|---|
| myapp://profile | /(tabs)/profile | yes | 푸시 진입점 |

## Cross-Domain Edges
<!-- 서로 다른 도메인을 잇는 이동만. 도메인 내부 이동은 각 ScreenSpec 에 선언 -->
| From | To | Trigger |
|---|---|---|
| HOME-001 | PROFILE-001 | 마이 탭 |
