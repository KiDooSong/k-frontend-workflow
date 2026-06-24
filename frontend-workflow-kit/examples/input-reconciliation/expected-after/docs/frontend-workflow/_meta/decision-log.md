---
title: Decision Log (expected-after)
status: draft
kind: meta-register
---

# Decision Log — expected-after

> 7개 입력을 reconcile 한 뒤의 이상적 결정 상태. resolved 로 닫는 행위는 사람만 한다(LLM 은 open/재오픈만).
> 아래 resolved 항목은 reconcile-input 이 올린 선택지를 사람이 닫은 결과다.

| ID | Decision | Screen | Blocking Mode | Owner | Status | 비고 |
|---|---|---|---|---|---|---|
| D-001 | 만료 쿠폰을 목록에 노출할 것인가? | COUPON-001 | final-fixture-ui | PM | resolved | → separate tab (IN-20260613-planning-001 → 김PM 2026-06-13) |
| D-003 | 쿠폰 목록 페이지네이션 방식 | COUPON-001 | api-integrated-ui | BE | resolved | → offset/page (IN-20260613-api-001) |
| D-101 | 홈 대시보드 위젯 구성/우선순위 | HOME-001 | rough-fixture-ui | PM | open | 관련 입력 없음 — 그대로 |
| D-204 | 로그인 성공 후 이동 위치 | AUTH-001 | final-fixture-ui | PM | resolved | IN-20260613-meeting-001 로 재오픈됨 → 재심 후 재-resolve: "기본 홈 + returnTo 우선". 이전 값 '항상 홈' 은 C-001 에 보존 |
| D-301 | 프로필 편집 범위/필드 확정 | PROFILE-001 | route-skeleton | PM | open | 관련 입력 없음 — 그대로 |
| D-401 | 공지 독립 화면 vs 홈 섹션 | NOTICE-001 | screen-skeleton | PM | open | 관련 입력 없음 — 그대로 |
| D-501 | Tier3 policy draft 를 live implementation policy 로 채택할 것인가? | global | api-integrated-ui | Tech Lead | open | IN-20260613-policy-migration-001 은 draft/migration review artifact 만 생성. 이 fixture 에서는 live policy replacement·CI/hard gate promotion 을 닫지 않는다. |

## Supersede 메모 (ADR 식, 후속)
- D-204: `항상 홈` → `기본 홈 + returnTo 우선` 으로 supersede. 트리거 입력 IN-20260613-meeting-001. 충돌 기록 C-001.
- D-501: live policy adoption 은 별도 promotion decision 으로 유지. readiness access wired / policy draft generated 는 live replacement 가 아니다.
