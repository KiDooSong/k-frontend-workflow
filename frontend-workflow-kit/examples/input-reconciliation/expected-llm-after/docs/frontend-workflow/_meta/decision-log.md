---
title: Decision Log (expected-llm-after)
status: draft
kind: meta-register
---

# Decision Log — expected-llm-after

> reconcile-input(LLM) 단독 출력. LLM 은 `open` 추가와 `resolved → open` 재오픈만 한다 —
> **어떤 결정도 `resolved` 로 닫지 않았다.** resolved 로 닫는 행위는 사람(→ expected-after)이다.
> 아래에서 입력이 건드린 결정은 비고에 "후보/재오픈"으로만 표시되고 Status 는 여전히 `open` 이다.

| ID | Decision | Screen | Blocking Mode | Owner | Status | 비고 |
|---|---|---|---|---|---|---|
| D-001 | 만료 쿠폰을 목록에 노출할 것인가? | COUPON-001 | final-fixture-ui | PM | open | IN-20260613-planning-001 이 `separate tab` 을 후보로 올림. 선택(닫기)은 사람. |
| D-003 | 쿠폰 목록 페이지네이션 방식 | COUPON-001 | api-integrated-ui | BE | open | IN-20260613-api-001 이 `offset/page` 로 좁힘(응답=page envelope). 닫기는 사람. |
| D-101 | 홈 대시보드 위젯 구성/우선순위 | HOME-001 | rough-fixture-ui | PM | open | 관련 입력 없음 — 그대로 |
| D-204 | 로그인 성공 후 이동 위치 | AUTH-001 | final-fixture-ui | PM | open | **재오픈됨**: IN-20260613-meeting-001(returnTo 우선)이 기존 resolved `항상 홈` 과 충돌 → `resolved → open`. 이전 값 `항상 홈` 은 C-001 에 보존. 재-resolve 는 사람. |
| D-301 | 프로필 편집 범위/필드 확정 | PROFILE-001 | route-skeleton | PM | open | 관련 입력 없음 — 그대로 |
| D-401 | 공지 독립 화면 vs 홈 섹션 | NOTICE-001 | screen-skeleton | PM | open | 관련 입력 없음 — 그대로 |
| D-501 | Tier3 policy draft 를 live implementation policy 로 채택할 것인가? | global | api-integrated-ui | Tech Lead | open | IN-20260613-policy-migration-001 은 draft/migration review artifact 만 생성. live policy replacement·CI/hard gate promotion 은 사람 결정 전 금지. |

## 메모
- D-204 는 baseline 에서 `resolved`(→ 항상 홈)였다. 재오픈은 게이트를 **올리는** 보수적 전이라 LLM 이 한다.
  `항상 홈` → `기본 홈 + returnTo 우선` 의 supersede 확정과 C-001 닫기는 사람 단계(expected-after) 에서 일어난다.
- D-501 은 Tier3 policy draft adoption 을 live policy replacement 로 승격할지 묻는 결정이다. LLM 은 open 생성만 하고,
  `implementation-mode-policy.yaml` 교체, CI promotion, pre-edit hook enforcement 는 하지 않는다.
