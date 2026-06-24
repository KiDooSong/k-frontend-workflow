---
title: Implementation Test Plan
status: draft
kind: test-plan
date: 2026-06-24
---

# Implementation Test Plan

`multi-screen-dry-run` fixture 를 입력으로 나중 세션이 따라 할 테스트 플랜.
목표는 `implement-screen` 이 readiness 를 직접 판단하지 않고, script output 의 mode/path/blocker 를 소비해 구현 범위를 제한하는지 확인하는 것이다.
이 문서는 리포트(prose)이므로 `artifact_type` 을 갖지 않는다.

전제: 이 fixture 는 md-only 다. 사실 기준 readiness 천장은 모든 화면 `screen-skeleton` 이고, 일부 화면은 Open Decision 이 더 낮게 cap 한다.
기대 게이트값의 단일 출처는 `reports/expected-readiness.md` 와 최신 `workflow:readiness -- --json` 출력이다.
원본 fixture 기준 재현 명령은 kit root에서 fixture-specific 인자를 명시한다.

- docs: `examples/multi-screen-dry-run/docs/frontend-workflow`
- src: `examples/multi-screen-dry-run/__no_src__`
- date: `2026-06-13`
- temp workspace 복사본을 평가할 때는 같은 옵션의 경로만 복사본 위치로 바꾼다.

## Test 1 — readiness output consumption

- **목적**: state/readiness 스크립트가 화면별 `readiness_mode`, `allowed_paths`, `forbidden_paths`, `blocking`, `next_actions` 를 내고 implement-screen 이 그 값을 그대로 소비하는지 확인한다.
- **절차**
  1. `npm run workflow:state -- --docs examples/multi-screen-dry-run/docs/frontend-workflow --src examples/multi-screen-dry-run/__no_src__ --date 2026-06-13` 실행.
  2. `npm run workflow:readiness -- --docs examples/multi-screen-dry-run/docs/frontend-workflow --screen <ID> --json` 실행.
  3. 출력의 `result["<ID>"]` 를 `reports/expected-readiness.md` §실측과 대조.
- **기대**
  - AUTH-001 / HOME-001 / COUPON-001 / COUPON-002 → `screen-skeleton`
  - PROFILE-001 → `docs-only`
  - NOTICE-001 → `route-skeleton`
- **합격**: README target readiness 나 agent 자체 추론이 아니라 readiness JSON 으로 mode/path/blocker 를 설명한다.

## Test 2 — implement COUPON-001 inside current gate

- **목적**: COUPON-001 구현이 readiness 의 current `allowed_paths` 안에만 머무르는지 확인한다.
- **선행**: Test 1 로 COUPON-001 의 `readiness_mode`, `allowed_paths`, `forbidden_paths` 를 확인한다.
- **기대**
  - 변경은 COUPON-001 readiness 가 출력한 concrete `allowed_paths` 안에만 존재한다.
  - `forbidden_paths` 는 변경하지 않는다.
  - 현 md-only fixture 의 `screen-skeleton` 에서는 fixture/full UI, fake hook, API/client/data layer 를 만들지 않는다.
  - U-001, D-001, D-003, tbd copy 를 추측으로 해소하지 않는다.
- **합격**: diff 가 allowed path 안에 있고, forbidden/generated/policy/test path 에 직접 변경이 없다.

## Test 3 — blocked screens stop with next actions

- **목적**: readiness 가 막은 화면에서 implement-screen 이 구현을 거절하고 blocker 를 보고하는지 확인한다.
- **입력 예시**: PROFILE-001.
- **기대**
  - D-301 이 open 이라 readiness 가 `docs-only` 로 cap 하면 UI code 를 만들지 않는다.
  - `blocking` 과 `next_actions` 를 보고한다.
  - Open Decision / Unknown 을 agent 가 resolve/close 하지 않는다.
- **합격**: code diff 없음, D-301 status 유지, report 에 거절 사유와 사람 결정 필요성이 명시된다.

## Test 4 — modern context surfaces

- **목적**: 최신 implement-screen 계약이 visual/testID/reconcile/Tier3/policy artifact 를 올바른 증거로 취급하는지 확인한다.
- **기대**
  - Reconciliation Register 에 관련 input 이 `not-started`/`in-progress` 이면 구현 전 멈춘다.
  - reconciled visual/Figma artifact 는 visual evidence 로만 쓰고 ScreenSpec behavior 와 분리한다.
  - reconciled testID guidance 만 local scope 에 적용하고 global naming convention 을 발명하지 않는다.
  - custom Tier3 layer 는 readiness `allowed_paths` 의 concrete path 로만 수정한다.
  - `implementation-mode-policy.draft.yaml` / `.migration.md` 는 review artifact 로만 읽고 live policy 를 교체하지 않는다.
- **합격**: run report 가 각 artifact 를 source/evidence/out-of-scope 로 구분하고, 관련 diff 가 readiness path 를 넘지 않는다.

## Test 5 — validation and idempotency

- **목적**: 구현 후 검증 순서와 재실행 안정성을 확인한다.
- **절차**
  1. 가능한 가장 작은 관련 lint/test 를 실행한다.
  2. `npm run workflow:state -- --docs examples/multi-screen-dry-run/docs/frontend-workflow --src examples/multi-screen-dry-run/__no_src__ --date 2026-06-13` 실행.
  3. `npm run workflow:readiness -- --docs examples/multi-screen-dry-run/docs/frontend-workflow --screen <ID> --json` 실행.
  4. `npm run workflow:validate -- --docs examples/multi-screen-dry-run/docs/frontend-workflow --src examples/multi-screen-dry-run/__no_src__` 실행.
  5. 같은 입력/readiness 로 implement-screen 을 재실행한다.
- **기대**
  - readiness before/after 와 validation 결과를 보고한다.
  - policy/layout/Tier3 boundary 를 건드렸다면 가능한 `workflow:policy-draft` 도 실행하고 review-only 로 보고한다.
  - 재실행 diff 는 비거나 의미 있는 최소 변경만 남는다.
- **합격**: command 결과와 남은 Open Decision/Unknown/Gap, 의도적으로 하지 않은 작업이 함께 보고된다.
