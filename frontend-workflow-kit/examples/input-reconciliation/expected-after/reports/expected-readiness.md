# Expected Readiness — input-reconciliation (before → after)

> 5개 입력을 reconcile 하기 전(project-before)과 후(expected-after)의 화면별 readiness.
> **핵심**: 입력은 **문서와 design-intent** 를 움직이지만, md-only 게이트 천장(screen-skeleton)은
> implement-screen 이 코드(fake hook)·생성 catalog 를 더하기 전까지 그대로다. reconcile-input 의 성공은
> "게이트 숫자가 올라갔는가"가 아니라 "project-before → expected-after 문서 델타를 올바르게 만들었는가"로 본다.

## 1) 입력이 바꾸는 화면 — design intent

| Screen ID | Before | After | Reason |
|---|---|---|---|
| COUPON-001 | rough-fixture-ui | final-fixture-ui | IN-planning-001(D-001 resolve)·IN-api-001(D-003 resolve, U-001 resolve)·IN-figma-001(figma-mapping 생성)·IN-qa-001(State Matrix offline) + 사람의 status confirmed 승격 → final 도달 가능 |
| AUTH-001 | final-fixture-ui | final-fixture-ui (재확정) | IN-meeting-001 이 resolved D-204 에 도전 → LLM 이 D-204 재오픈(일시 rough-fixture-ui 로 다운그레이드) → 사람이 returnTo 반영해 재-resolve → final 회복 |

> 나머지 화면(HOME-001, COUPON-002, PROFILE-001, NOTICE-001)에는 대응 입력이 없어 readiness 가 그대로다.

## 2) 전체 화면 — md-only 게이트 (project-before 실측, 2026-06-13 검증)

| Screen ID | readiness_mode (before, 실측) | after (md-only) |
|---|---|---|
| AUTH-001 | screen-skeleton | screen-skeleton* |
| COUPON-001 | screen-skeleton | screen-skeleton |
| COUPON-002 | screen-skeleton | screen-skeleton |
| HOME-001 | screen-skeleton | screen-skeleton |
| NOTICE-001 | route-skeleton | route-skeleton |
| PROFILE-001 | docs-only | docs-only |

\* 재오픈 중(사람이 닫기 전)에는 AUTH-001 의 decision_cap 이 final-fixture-ui 를 막지만, fact 천장이 이미 screen-skeleton 이라 md-only 수치는 변하지 않는다. 재-resolve 후에도 screen-skeleton.

> after 트리(expected-after)는 변경분만 담은 부분 트리라 전체 readiness 를 재계산하지 않는다.
> md-only 수치가 before/after 동일한 것은 정상이다 — 입력은 문서/design-intent 를 바꾸고,
> 실제 게이트 상승은 implement-screen 이 코드를 더할 때 일어난다.

## 3) 검증 방법

1. `project-before` 에서 `workflow:state` → `workflow:readiness` → 위 (2) before 열과 비교.
2. `reconcile-input` 으로 inputs/ 5개를 처리 → 결과를 `expected-after/` 와 비교 (문서 델타).
3. (after 의 전체 게이트 재계산이 필요하면) expected-after 의 변경분을 project-before 위에 적용한 트리에서 다시 state/readiness 를 돌린다.
