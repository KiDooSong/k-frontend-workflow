---
title: "WP-COUPON-001-screen-skeleton-001 리뷰"
status: "done"
kind: "review-artifact"
packet_id: "WP-COUPON-001-screen-skeleton-001"
run_id: "work-packet-coupon-001-001"
verdict: "approve"
readiness_source: "frontend-workflow-kit/examples/multi-screen-dry-run/reports/expected-readiness.md"
reviewer: "review-agent"
date: "2026-06-14"
---

<!--
  Review Artifact 는 한 Work Packet + Run Report 가 게이트·천장·불변식을 지켰는지 채점한다.
  Work Packet 과 같은 원칙: 리뷰어도 새로운 source of truth/gate 가 아니다.
  작성 규칙:
  - 게이트/경로는 readiness_source 를 그대로 소비한다 (재계산 금지).
  - 리뷰어는 Open Decision / Conflict / Unknown 을 닫지 못한다 — 사람-전용 불변식.
  - 위반은 근거(파일·라인·diff)와 함께 기록한다. 추측으로 메우지 않는다.
  - Checklist 는 work-packet-rubric / Work Packet 의 Review Checklist 와 1:1 정합.
-->

# Review Artifact: WP-COUPON-001-screen-skeleton-001

## Verdict
<!-- 셋 중 하나. changes-requested/blocked 면 Violations 또는 Human-only Decisions 에 근거가 있어야 한다. -->
**approve** — 변경 파일이 readiness output 의 allowed_paths(`src/features/coupons/screens/**`) 안에만 있고, forbidden 무접촉·천장(screen-skeleton) 미초과·D-001/D-003/U-001 미닫힘이 모두 확인됨. 게이트·천장·불변식 통과.

## Reviewed Inputs
<!-- 복사 금지 — 링크만. 무엇을 보고 판정했는가. -->
- Work Packet: `temp/examples/work-packet-dry-run/packets/WP-COUPON-001-screen-skeleton-001.md`
- Run Report: `temp/examples/work-packet-dry-run/run-reports/RR-COUPON-001-screen-skeleton-001.md`
- readiness output / run-report 게이트 출처: `frontend-workflow-kit/examples/multi-screen-dry-run/reports/expected-readiness.md` (§1 — COUPON-001 행)
- ScreenSpec (정본): `examples/multi-screen-dry-run/docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md`

## Checklist
<!-- rubric 매핑. 한 행이라도 Failure Signal 관측 시 불합격으로 기록하고 Violations 에 근거를 남긴다.
     advisory 휴리스틱(useState/useEffect grep 등)은 자동 불합격이 아니다 — 후보일 뿐, 파일 열어 교차 확인. -->
| Check | 기준 | 결과 | 근거 (파일·라인·diff) |
|---|---|---|---|
| A — 게이트 판독 | readiness_mode/allowed/forbidden 이 `expected-readiness.md` 와 글자 일치 | ✅ | packet Readiness Snapshot = `screen-skeleton`/`rough-fixture-ui`, 천장 근거 문구가 §1 COUPON-001 행과 일치. allowed/forbidden glob 도 readiness output 그대로 복사 (재계산 흔적 없음) |
| B1 — allowed 안에서만 | diff ⊆ allowed_paths | ✅ | Diff Summary ADDED = `src/features/coupons/screens/CouponListScreen.tsx` 단일, `screens/**` 안 |
| B2 — forbidden 무접촉 | `src/api/**`·`openapi.yaml` 무접촉 | ✅ | MODIFIED/REMOVED (none), `src/api/**`·`openapi.yaml`·hooks/components/app 0 접촉 |
| B3 — 천장 미초과 | `screen-skeleton` 산출물만 (과구현 없음 — advisory grep 은 후보) | ✅ | useState/useEffect/useXxx/fetch/axios/isLoading/FlatList grep 0건 (advisory) + 파일 열람 교차 확인: shell only, fixture/상태로직 없음 |
| B4 — 미확정 미발명 | API/copy/design value 추측 없음 | ✅ | `coupon.list.title`("쿠폰") confirmed 카피만, `coupon.list.empty` 는 주석만 (문구 미발명), API/DTO/색·간격 수치 없음 |
| E — 불변식 | Open Decision/Conflict/Unknown 미닫힘 | ✅ | D-001·D-003·U-001 상태 open 보존 (run report Gate Compliance 3행), candidate→confirmed 승격 없음 |
| F — 보고·멱등 | blocker 그대로 보고 + 재실행 최소 diff | ✅ | Blockers Reported 가 readiness 의 blocking/next_actions 그대로 인용, Idempotency = 2차 완전 빈 diff·byte 동일·validate exit 0 |

## Violations
<!-- 구현이 고칠 수 있는 위반만. 각 항목에 위반 Check ID + 근거(파일·라인·diff).
     위반 없으면 "없음" 한 줄. -->
없음.

## Human-only Decisions Needed
<!-- 리뷰어/구현자가 못 닫는 사람-전용 항목. Open Decision / Conflict / candidate→confirmed 승격.
     blocked verdict 의 근거가 여기 있어야 한다. -->
| ID | 유형 | 내용 | Owner | 왜 사람만 |
|---|---|---|---|---|
| D-001 | decision | 만료 쿠폰 노출/필터 정책 (blocking_mode = final-fixture-ui) | PM | 게이트 해제는 사람-전용 (LLM 은 open/재오픈만) |
| D-003 | decision | 쿠폰 목록 API 계약 확정 (blocking_mode = api-integrated-ui) | BE | 게이트 해제는 사람-전용 (LLM 은 open/재오픈만) |
| U-001 | unknown | 미해결 사실 확인 (ScreenSpec Unknowns) | BE | unknown close 는 사람/입력 대기 — 구현자·리뷰어가 닫지 못함 |

<!-- 주: 이들은 screen-skeleton 진행을 막지 않았으므로 verdict=approve 의 장애물이 아니다.
     그러나 상위 모드(rough/final/api-integrated) 진행 전 사람이 닫아야 하며, 이 리뷰는 닫지 않는다. -->

## Recommended Fixes
<!-- changes-requested 일 때 구현이 자동 수행 가능한 교정. 게이트를 건드리지 않는 범위만. -->
- 해당 없음 (verdict = approve, 위반 없음).

## Do Not Auto-Fix
<!-- 자동수정 금지 영역. 추측으로 메우면 환각이 된다 — 사람/입력 대기. -->
- 미확정 copy `coupon.list.empty`(tbd 행) — 문구 발명 금지. 사람이 confirmed 로 승격할 때까지 TBD 유지.
- 미확정 API endpoint / DTO — `src/api/**`·`openapi.yaml` 추측 작성 금지 (D-003). confidence 는 candidate 유지.
- 만료 쿠폰 노출·필터 동작 (D-001) — design/정책 결정이라 발명 금지, 사람 resolve 대기.
- design value(색/간격/레이아웃 수치) — figma mapping 없이는 발명 금지.
- Open Decision resolve / Conflict close / Unknown close / candidate→confirmed 승격 — 전부 사람-전용.
