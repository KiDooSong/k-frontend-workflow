---
artifact_id: navigation-map
artifact_type: navigation-map
status: draft             # missing|draft|review|confirmed|implemented|verified|deprecated
last_reviewed: "{YYYY-MM-DD}"
---

<!--
  전역에는 "도메인이 소유할 수 없는 것"만 둔다: 탭/스택/모달 뼈대, Route Guard,
  Deep Link, 크로스 도메인 엣지. 도메인 내부 이동(목록→상세)은 각 화면 ScreenSpec 의
  Interaction Matrix 가 선언한다 — 여기 적지 않는다.
  Route Tree(src/app 기준)와 Entry Points 는 생성물이므로 손으로 쓰지 않는다.
-->

# Navigation Map (Skeleton)

## Structure
- Tabs: {/(tabs)/... 목록}
- Stack: {/(stack)/... 또는 Auth Stack 등}
- Modals: {/modal/... 목록}

## Route Guard
- {미로그인 사용자가 Private Route 접근 시 → 어디로}
- {로그인 사용자가 Auth Route 접근 시 → 어디로}

## Deep Links
| Pattern | Route | Auth 필요 | 비고 |
|---|---|---|---|
| {myapp://...} | {/route} | yes/no | {비고} |

## Cross-Domain Edges
<!-- 서로 다른 도메인을 잇는 이동만. 도메인 내부 이동은 각 ScreenSpec 에 선언. -->
| From | To | Trigger |
|---|---|---|
| {SCREEN-A} | {SCREEN-B} | {트리거} |
