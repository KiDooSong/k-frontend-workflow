---
title: Decision Log
status: draft
kind: meta-register
---

# Decision Log

> 경량 결정 로그(샘플). 결정의 단일 출처는 각 ScreenSpec 의 Open Decisions 표다.
> 여기서는 전역 추적용으로 현재 상태를 모아 본다.
> (정식 append-only decision-log 는 후속 — open-decisions.md 의 "도입 순서" 참고)

| ID | Decision | Screen | Blocking Mode | Owner | Status | 비고 |
|---|---|---|---|---|---|---|
| D-001 | 만료 쿠폰을 목록에 노출할 것인가? | COUPON-001 | final-fixture-ui | PM | open | show / hide / separate tab — IN-20260613-planning-001: separate tab 제안(사람 확정 대기) |
| D-003 | 쿠폰 목록 페이지네이션 방식 | COUPON-001 | api-integrated-ui | BE | open | offset/page(IN-20260613-api-001: page envelope) / cursor / none |
| D-101 | 홈 대시보드 위젯 구성/우선순위 | HOME-001 | rough-fixture-ui | PM | open | |
| D-204 | 로그인 성공 후 이동 위치 | AUTH-001 | final-fixture-ui | PM | open | 재오픈(IN-20260613-meeting-001): returnTo 우선 vs 이전 resolved '항상 홈' — C-001 |
| D-301 | 프로필 편집 범위/필드 확정 | PROFILE-001 | route-skeleton | PM | open | |
| D-401 | 공지 독립 화면 vs 홈 섹션 | NOTICE-001 | screen-skeleton | PM | open | |
| D-501 | Tier3 policy draft 를 live implementation policy 로 채택할 것인가? | global | api-integrated-ui | Tech Lead | open | IN-20260613-policy-migration-001 은 draft/migration review artifact 만 생성. live policy replacement·CI/hard gate promotion 은 사람 결정 전 금지. |
