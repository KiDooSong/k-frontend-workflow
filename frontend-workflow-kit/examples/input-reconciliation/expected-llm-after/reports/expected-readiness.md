# Expected Readiness — expected-llm-after (reconcile-input 단독)

> `inputs/` 5건을 reconcile-input **만** 돌린 뒤(사람 결정 전)의 화면별 readiness.
> **핵심**: reconcile-input 단독으로는 readiness 가 **올라가지 않는다.** 게이트를 내리는 닫기·승격(decision resolve,
> status confirmed)은 전부 사람 몫이기 때문이다. 오히려 충돌로 재오픈된 D-204 가 AUTH-001 의 design-intent 를 **낮춘다.**
> reconcile-input 의 성공은 "게이트 숫자"가 아니라 "open/재오픈/conflict/gap/simple-update 델타를 올바르게 만들었는가"로 본다.

## 1) 입력이 건드린 화면 — design intent (LLM 단독 직후)

| Screen ID | Before | After (LLM 단독) | Reason |
|---|---|---|---|
| COUPON-001 | rough-fixture-ui | rough-fixture-ui (천장 유지) | D-001(blocking final-fixture-ui)·D-003(blocking api-integrated-ui)이 **여전히 open** → final/api-integrated 도달 불가. simple-update(offline·page envelope·가로형)는 형태만 보강. `confirmed` 승격(→ final)은 사람. |
| AUTH-001 | final-fixture-ui | **rough-fixture-ui (내려감)** | IN-meeting-001 충돌로 D-204 가 `resolved → open` 재오픈 → `decision_cap` 이 final 을 다시 막는다. 사람이 재-resolve 하면 final 회복(→ expected-after). |

> 나머지 화면(HOME-001, COUPON-002, PROFILE-001, NOTICE-001)에는 대응 입력이 없어 readiness 가 그대로다.

## 2) 전체 화면 — md-only 게이트 (project-before 실측, 2026-06-13 검증)

| Screen ID | readiness_mode (before, 실측) | after (LLM 단독, md-only) |
|---|---|---|
| AUTH-001 | screen-skeleton | screen-skeleton* |
| COUPON-001 | screen-skeleton | screen-skeleton |
| COUPON-002 | screen-skeleton | screen-skeleton |
| HOME-001 | screen-skeleton | screen-skeleton |
| NOTICE-001 | route-skeleton | route-skeleton |
| PROFILE-001 | docs-only | docs-only |

\* D-204 재오픈으로 AUTH-001 의 `decision_cap` 이 final-fixture-ui 를 막지만, fact 천장이 이미 screen-skeleton 이라 md-only 수치는 변하지 않는다. (재-resolve 후에도 screen-skeleton.)

> md-only fact 천장(screen-skeleton)은 `src/` 가 없어 before/after 동일하다 — 입력은 문서/design-intent 를 움직이고,
> 실제 게이트 상승은 implement-screen 이 코드(fake hook)·생성 catalog 를 더할 때 일어난다.

## 3) expected-after 와의 차이 (왜 다른가)

| Screen | expected-llm-after (design intent) | expected-after (design intent) |
|---|---|---|
| COUPON-001 | rough-fixture-ui (D-001·D-003 open) | final-fixture-ui (사람이 D-001/D-003 resolve + status confirmed) |
| AUTH-001 | rough-fixture-ui (D-204 재오픈) | final-fixture-ui (사람이 returnTo 로 재-resolve) |

이 표가 곧 LLM-vs-human 경계다 — **두 줄의 차이는 전부 "사람이 닫는 행위"가 만든다.**

## 4) 검증 방법

1. `project-before` 에서 `workflow:state` → `workflow:readiness` → 위 (2) before 열과 비교.
2. `reconcile-input` 으로 inputs/ 5개를 처리 → 결과 트리를 `expected-llm-after/` 와 1:1 비교 (문서 델타).
3. (사람 결정까지 본다면) `expected-after/` 와 비교 — 둘의 차이가 "사람 단계"임을 확인.
