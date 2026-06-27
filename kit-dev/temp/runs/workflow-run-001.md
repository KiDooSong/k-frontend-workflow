---
title: "RUN-COUPON-001-rough-fixture-ui-001 run status (HALT_AMBIGUITY)"
kind: "run-status"
state: "HALT_AMBIGUITY"
run_id: "RUN-COUPON-001-rough-fixture-ui-001"
screen: "COUPON-001"
requested_mode: "rough-fixture-ui"
readiness_mode: "rough-fixture-ui"
date: "2026-06-14"
generated_by: "workflow:run (PR4 auto-stop orchestrator)"
---

<!--
  이 파일은 `workflow:run` 이 workflow:packet(+report)를 엮어 낸 auto-stop 상태 요약이다 (PR4 orchestrator).
  구현/auto-fix/auto-retry 0 · 새 게이트 0 · readiness 재계산 0 (봉투 소비만).
  HALT 은 종료 상태이지 게이트가 아니다 — 어떤 HALT 도 머지를 차단하지 않는다(차단은 Open Decision readiness cap + 사람).
  Open Decision/Unknown/Conflict 는 닫거나 candidate→confirmed 로 올리지 않는다 (사람-전용). 다음 행동은 사람/지정 구현자가 정한다.
-->

# Run Status: COUPON-001 → HALT_AMBIGUITY

**HALT_AMBIGUITY** — 애매함 미해결 — runner 가 구현 전 스스로 멈춤 (auto-stop · 기본 경로) (exit 0 — auto-stop, 게이트 아님).
- 대상: screen `COUPON-001` · requested_mode `rough-fixture-ui` · readiness_mode `rough-fixture-ui`
- 게이트 단일 출처: `readiness.mjs --docs examples/coupon-feature/docs/frontend-workflow --screen COUPON-001 --json (computed 2026-06-14)` (readiness 출력 — 재계산 0)
- ⚠ 이 상태는 auto-stop 결과다 — exit code·HALT 어느 것도 merge gate 가 아니다 (차단 권한은 Open Decision readiness cap + 사람).

## State (이 PR: 4-state auto-stop — IMPLEMENT/auto-fix 전이 없음)
| 상태 | 의미 | exit |
|---|---|---|
| ▶ `HALT_AMBIGUITY` | 애매함 미해결 — runner 가 구현 전 스스로 멈춤 (auto-stop · 기본 경로) | 0 |
| `HALT_READY_FOR_WORK` | 게이트 깨끗 · packet 발급 — 사람/지정 구현자 판단 대기 (구현 허가 아님) | 0 |
| `DONE_PENDING_REVIEW` | Run Report 생성 완료 — 사람 리뷰 대기 (green ≠ 승인) | 0 |
| `HALT_TOOL_ERROR` | 도구/입력 오류 — packet/report 생성 자체 실패 (fail-closed) | 2 |

## Why
runner 가 구현 전 스스로 멈췄다 (게이트가 막은 게 아니라 **runner 가 안 나아간 것**). 아래 후보를 사람이 검토/resolve 후 `npm run workflow:readiness` 재실행 → packet 재발급 → 재진입:
- 미해결 Open Decision 후보(D-cand): D-001, D-002, D-003 — 사람-전용 resolve
- 미해결 Unknown 후보(U-cand): figma_mapping, api_confidence — 사람-전용

## Readiness Signals (packet 봉투 — verbatim, 재계산 0)
| 항목 | 값 |
|---|---|
| readiness_mode | `rough-fixture-ui` |
| next_mode | `final-fixture-ui` |
| requested_mode | `rough-fixture-ui` |
| mode_known | true |
| blocking_count | 5 |
| D-cand (Open Decision) | `D-001`, `D-002`, `D-003` |
| U-cand (Unknown) | `figma_mapping`, `api_confidence` |

> D-cand/U-cand 는 readiness 출력에서 그대로 옮긴 **후보**다 — runner 는 닫거나 confirmed 로 올리지 않는다 (사람-전용). 상세는 Work Packet 의 `## Blocking Items` 참조.

## Artifacts
- Work Packet: `temp/runs/workflow-run-001/work-packet.md`
- Run Report: — (미생성 — 클린 게이트 + --diff 일 때만)

## Next action (사람/지정 구현자)
- 위 D-cand/U-cand 를 사람이 resolve/triage (LLM/runner 는 닫지 못함) → `npm run workflow:readiness` 재실행 → packet 재발급 → `workflow:run` 재진입.

---
> **HALT 은 종료 상태이지 게이트가 아니다.** auto-stop = "runner 가 스스로 안 나아간 것"이지 "게이트가 막은 것"이 아니다. 어떤 HALT 도
> 머지를 차단하지 않는다 — 차단 권한은 Open Decision(readiness cap) + 사람뿐. `HALT_READY_FOR_WORK` 는 **구현 허가가 아니다**.
> runner 는 구현/auto-fix/auto-retry 를 하지 않으며, Open Decision/Unknown/Conflict 를 닫거나 올리지 않는다 (사람-전용).
