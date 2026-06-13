---
title: Implementation Test Plan
status: draft
kind: test-plan
---

# Implementation Test Plan

`multi-screen-dry-run` fixture 를 입력으로 나중 세션이 따라 할 테스트 플랜.
workflow:state / workflow:readiness 가 화면마다 기대값을 내는지, implement-screen 이 게이트를 지키는지를 확인한다.
이 문서는 리포트(prose)이므로 `artifact_type` 을 갖지 않는다.

전제: 이 fixture 는 md-only 다. 사실 기준 readiness 천장은 모든 화면 `screen-skeleton` 이고,
일부 화면은 Open Decision 이 게이트를 더 아래로 cap 한다. 기대 게이트값의 단일 출처는 `reports/expected-readiness.md` 다.

## Test 1 — readiness only (게이트 출력 확인)

- **목적**: state/readiness 스크립트가 화면 6개에 대해 기대 게이트값을 내는지 확인.
- **절차**
  1. `npm run workflow:state` 실행 — 화면별 파생값(state_matrix_complete, copy_keys_has_tbd, api_confidence_min, fake_hook_exists 등)을 산출.
  2. `npm run workflow:readiness` 실행 — 화면별 readiness_mode 와 blocking 사유 산출.
  3. 출력을 `reports/expected-readiness.md` 표와 대조.
- **기대 (md-only 게이트 출력)**
  - AUTH-001 → `screen-skeleton` (D-204 resolved, 안 막음; fact 천장에 걸림)
  - HOME-001 → `screen-skeleton`
  - COUPON-001 → `screen-skeleton`
  - COUPON-002 → `screen-skeleton` (stub: 본문 없음 → full UI 금지)
  - PROFILE-001 → `docs-only` (D-301 이 route-skeleton 미만으로 cap)
  - NOTICE-001 → `route-skeleton` (D-401 이 screen-skeleton 미만으로 cap)
- **합격**: 6개 값이 expected-readiness 표와 일치. (target readiness 와는 다름 — 그건 design intent 라는 점 확인.)

## Test 2 — implement-screen on COUPON-001 (게이트 안에서 구현)

- **목적**: 게이트가 허용하는 범위 안에서만 implement-screen 이 작업하는지 확인.
- **입력**: COUPON-001 의 screen-spec 을 implement-screen 에 넣는다.
- **선행**: Test 1 로 COUPON-001 의 readiness_mode 와 allowed_paths / forbidden_paths 를 먼저 확인.
- **기대 (allow)**: readiness 출력의 allowed_paths 안에서 **fixture UI 만** 만든다 (해당 화면/features 의 fixture·화면 스캐폴딩).
- **기대 (forbid)**: `src/api/**` 변경 금지. API 확정 정보가 없으면 endpoint/DTO 를 추측·구현하지 않고 candidate/unknown 으로 둔다.
  - U-001(쿠폰 API 응답 예시 위치) 은 open 이므로 화면은 fixture 기반으로만 진행하고 API 의존을 추측하지 않는다.
  - D-001/D-003 이 open 이면 그 cap 미만까지만 구현하고 멈춘다.
- **합격**: 변경 diff 가 allowed_paths 안에만 있고, forbidden_paths(특히 `src/api/**`)에는 한 줄도 닿지 않음.

## Test 3 — implement-screen on PROFILE-001 (게이트가 막으면 거절)

- **목적**: 게이트가 docs-only 로 막힌 화면에서 implement-screen 이 코드 구현을 **거절**하는지 확인.
- **입력**: PROFILE-001 의 screen-spec 을 implement-screen 에 넣는다.
- **기대**: D-301(편집 범위/필드 미정)이 게이트를 docs-only 로 cap 하므로, implement-screen 은
  UI 코드를 만들지 않고 **docs-only blocker 를 보고**한다 — "D-301 이 open 이라 route-skeleton 미만, 구현 불가" 취지.
  결정을 스스로 resolve 하지 않는다(사람 몫).
- **합격**: 코드 변경 없음 + D-301 blocker 를 사유로 명시한 거절/보고. Open Decision 을 임의로 닫지 않음.

## Test 4 — implement-screen 재실행 (idempotency)

- **목적**: 같은 입력으로 implement-screen 을 다시 돌렸을 때 불필요한 diff 가 없는지 확인.
- **절차**
  1. Test 2 의 COUPON-001 구현을 그대로 둔 상태에서 implement-screen 을 한 번 더 실행.
  2. 입력(screen-spec)·게이트값이 그대로면 산출물이 그대로여야 한다.
- **기대**: 의미 없는 재작성/재배치 없이 **no-op(빈 diff)** 또는 idempotent 한 동일 결과.
  게이트가 바뀌지 않았는데 새 blocker 를 만들거나 기존 항목 status 를 바꾸지 않는다.
- **합격**: 2차 실행 diff 가 비어 있거나, 바뀐 입력에 한정된 최소 변경만 존재.
