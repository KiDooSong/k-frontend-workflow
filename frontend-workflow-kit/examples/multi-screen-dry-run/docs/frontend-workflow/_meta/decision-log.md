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
| D-001 | 만료 쿠폰을 목록에 노출할 것인가? | COUPON-001 | final-fixture-ui | PM | open | show / hide / separate tab |
| D-003 | 쿠폰 목록 페이지네이션 방식 | COUPON-001 | api-integrated-ui | BE | open | cursor / offset / none |
| D-101 | 홈 대시보드 위젯 구성/우선순위 | HOME-001 | rough-fixture-ui | PM | open | |
| D-204 | 로그인 성공 후 이동 위치 | AUTH-001 | final-fixture-ui | PM | resolved | → 항상 홈(/(tabs)/home) |
| D-301 | 프로필 편집 범위/필드 확정 | PROFILE-001 | route-skeleton | PM | open | |
| D-401 | 공지 독립 화면 vs 홈 섹션 | NOTICE-001 | screen-skeleton | PM | open | |
