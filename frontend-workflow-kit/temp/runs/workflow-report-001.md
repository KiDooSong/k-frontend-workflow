---
title: "WP-COUPON-001-rough-fixture-ui-001 Run Report (evidence draft)"
status: "draft"
kind: "run-report"
run_id: "RR-COUPON-001-rough-fixture-ui-001"
packet_id: "WP-COUPON-001-rough-fixture-ui-001"
fixture: "temp/runs/workflow-packet-001.md"
readiness_source: "readiness.mjs --docs examples/coupon-feature/docs/frontend-workflow --screen COUPON-001 --json (computed 2026-06-14)"
date: "2026-06-14"
generated_by: "workflow:report (PR3 evidence collector)"
---

<!--
  이 파일은 `workflow:report` 가 수집한 evidence 로 채운 Run Report 초안이다 (PR3 evidence collector).
  승인서/merge gate 아님 · evidence bundle 임 · 재계산 0 · auto-fix/auto-retry 0.
  readiness_source/blocking/next_actions 는 packet(=readiness 출력)에서 글자 그대로 인용. Open Decision 은 닫지 않는다(사람-전용).
  도구 결과가 fail 이어도 evidence 로 기록될 뿐, 이 보고서의 생성 성공/머지 판정으로 바뀌지 않는다.
-->

# Run Report: WP-COUPON-001-rough-fixture-ui-001

이 Run Report 는 `workflow:report` 가 Work Packet `WP-COUPON-001-rough-fixture-ui-001` 기준으로 git diff·validate·forbidden-paths·test-fixtures·check-generated 결과와 readiness blocker 를 수집해 채운 **evidence 초안**이다. 승인·머지·합격 판정 아님 — 다음 행동은 사람/구현자가 정한다.
- 대상 Work Packet: `temp/runs/workflow-packet-001.md` (packet_id = WP-COUPON-001-rough-fixture-ui-001)
- 게이트 단일 출처: `readiness.mjs --docs examples/coupon-feature/docs/frontend-workflow --screen COUPON-001 --json (computed 2026-06-14)` (readiness 출력 — 재계산 0)
- 수집 docs/src: `examples/coupon-feature/docs/frontend-workflow` / `examples/coupon-feature/src`
- ⚠ 이 파일은 evidence bundle 이다 — exit code·아래 어떤 표도 merge gate 가 아니다.

> ⚠ 수집 메모 (한계 표면화 — 경고일 뿐, 게이트 아님):
> - diff 미제공(--diff 없음) — Files Changed/Diff Summary 는 "완전 빈 diff"로, forbidden-paths 는 미수집으로 둔다(경계는 diff 로 판정).

## Summary
<!-- 수집된 evidence 인덱스일 뿐 — 합격/불합격 선고가 아니다. 채점(rubric)·승인은 Review Artifact + 사람 몫. -->
> ✅=collector 불변식상 보장(인용·무재계산), ⓘ=수집된 도구 보고(그 자체로 판정 아님), ⏳=diff/사람 확인 필요.

| Evidence | 내용 | 출처 섹션 | 수집 결과 |
|---|---|---|---|
| ① readiness_source | 어떤 readiness 를 봤나 | ## Readiness Used | ✅ 인용(재계산 0) |
| ② diff summary | 무엇을 바꿨나 | ## Diff Summary | ⏳ 미수집 — no --diff (완전 빈 diff 로 간주) |
| ③ validate | 구조 검사 | ## Commands Run | ⓘ validate 보고: ok=true (errors 0, warnings 0) — evidence |
| ④ forbidden-paths | 경계(diff 기준) | ## Gate Compliance | ⏳ 미수집 — no --diff (경계는 diff 로 판정; diff 미제공) |
| ⑤ idempotency/test | 재실행·픽스처 | ## Idempotency | ⓘ test-fixtures 보고: ok=true — evidence |
| ⑥ blockers | 왜 멈췄나 | ## Blockers Reported | ✅ verbatim 인용 |
| (＋) check-generated | 생성물 표류(advisory) | ## Idempotency | ⓘ check-generated 보고(advisory): ok=false (비-ok 2) — evidence-only |
| (＋) review | 리뷰(advisory) | ## Review Evidence | ⓘ 리뷰 전 (Review Artifact 미생성) |

> 이 표는 **수집 요약**이다 — 합격선고/승인이 아니다. 게이트는 readiness(Open Decision)+validate 뿐.

## Evidence (사용자-facing 증거 6개)
```txt
1. readiness_source       — 어떤 readiness 를 봤나        → ## Readiness Used
2. diff summary           — 무엇을 바꿨나 (ADDED/MODIFIED/REMOVED, 빈 diff 명시) → ## Diff Summary / ## Files Changed
3. validate result        — 구조 검사 결과(evidence)       → ## Commands Run
4. forbidden-paths result — 경계(diff 기준, evidence)      → ## Gate Compliance
5. idempotency result     — 재실행 빈 diff?(evidence)      → ## Idempotency
6. blockers (verbatim)    — 왜 멈췄나 (readiness blocking/next_actions 그대로) → ## Blockers Reported
(＋) check-generated      — 생성물 표류(advisory, 있으면)  → ## Idempotency
```

## Work Packet Reference
- Work Packet: `temp/runs/workflow-packet-001.md` (`packet_id` = WP-COUPON-001-rough-fixture-ui-001)
- target_screen: `COUPON-001` / requested_mode: `rough-fixture-ui` / readiness_mode: `rough-fixture-ui`

## Readiness Used
<!-- readiness output 을 그대로 옮긴다. 재계산 금지. -->
- `readiness_mode` = `rough-fixture-ui`, `next_mode` = `final-fixture-ui`.
- 천장 근거(그대로 옮김): readiness 출력 기준 천장 = `rough-fixture-ui`, next_mode = `final-fixture-ui`. 상위 진행은 아래 Blocking Items 가 cap (Open Decision 3건 · 미충족 fact 2건). 이 표는 소비물이며 재유도하지 않는다.
- readiness_source(verbatim): `readiness.mjs --docs examples/coupon-feature/docs/frontend-workflow --screen COUPON-001 --json (computed 2026-06-14)`
- 소비: packet frontmatter `readiness_source` + `## Readiness Snapshot` (이 보고서에서 다시 유도하지 않음).

### Allowed Paths (packet 인용)
```txt
src/features/coupons/screens/**
src/features/coupons/components/**
src/features/coupons/hooks/**
```
### Forbidden Paths (packet 인용)
```txt
src/api/**
openapi.yaml
```

## Files Changed
<!-- 실제 변경 파일(diff 기준). allowed_paths 안에 있는지는 사람/Review 가 교차 검증. -->
- 변경 미수집 — `--diff` 미제공 (완전 빈 diff 로 간주). 변경 집합은 diff 로 본다.

## Commands Run
```bash
node scripts/validate.mjs --json --docs examples/coupon-feature/docs/frontend-workflow --src examples/coupon-feature/src   # exit 0 (pass)
# forbidden-paths: 미수집 (no --diff (경계는 diff 로 판정; diff 미제공))
node scripts/test-fixtures.mjs --json   # exit 0 (pass)
node scripts/check-generated-files.mjs --json --docs examples/coupon-feature/docs/frontend-workflow --src examples/coupon-feature/src   # exit 0 (advisory)
```
<!-- exit code 는 수집 보고일 뿐 — 게이트/판정이 아니다. -->

## Result
수집 완료: validate=pass, forbidden-paths=not-collected, idempotency=pass, check-generated=mismatch; readiness blocker 5건 인용(D 3 · invalid 0 · fact 2). **이 초안은 합격 판정이 아니다** — 도구 fail 도 evidence 로 기록될 뿐이며, 다음 행동은 사람/구현자가 정한다.

## Gate Compliance
<!-- 하드룰 evidence 포인터. collector 는 판정하지 않는다 — 확인열은 evidence 보장(✅)/사람 확인 필요(⏳). -->
| 하드룰 | 확인 | 근거 (evidence) |
|---|---|---|
| examples 원본 무수정 | ⏳ | 아래 ## Diff Summary 참조 — diff 기준 사람 확인 (collector 미판정) |
| API endpoint 발명 금지 (src/api/** · openapi.yaml) | ⏳ | 미수집 (no --diff (경계는 diff 로 판정; diff 미제공)) — 경계는 diff 로 판정 |
| Open Decision/Conflict/Unknown 미닫힘 | ✅ | Blockers Reported 를 그대로 인용 — collector 는 닫지/올리지 않음 (사람-전용 불변식) |
| readiness gate 무시 금지 | ✅ | readiness_source 그대로 인용, 재계산 0 (## Readiness Used) |

> ✅=collector 불변식상 보장(인용·무재계산·무수정), ⏳=diff/사람 확인 필요. 이 표는 evidence 포인터일 뿐 — 하드룰 최종 확인은 Review Artifact + 사람.

## Diff Summary
<!-- 경로 경계는 diff 로 본다. ADDED/MODIFIED/REMOVED + (none). 빈 diff 는 완전 빈 diff 로 명시. -->
```txt
(diff 미제공 — --diff 없음. 변경 집합 미수집, 완전 빈 diff 로 간주)
```

## Blockers Reported
> readiness 의 `blocking`/`next_actions` 를 그대로 인용한다 (자체 추론 0 — collector 는 닫지/올리지 않음).

| ID | 유형 | 내용 | Blocking Mode | Owner | 처리 |
|---|---|---|---|---|---|
| D-001 | decision | resolve decision D-001: 만료 쿠폰을 목록에 노출할 것인가? | final-fixture-ui | PM | 닫지 말 것 (사람만) |
| D-002 | decision | resolve decision D-002: 쿠폰 목록 정렬 기준은 무엇인가? | final-fixture-ui | PM | 닫지 말 것 (사람만) |
| D-003 | decision | resolve decision D-003: 쿠폰 목록 페이지네이션 방식은? | api-integrated-ui | BE | 닫지 말 것 (사람만) |
| figma_mapping | missing-fact | figma_mapping = missing | — | — | 전제 충족 전까지 상위 모드 금지 |
| api_confidence | missing-fact | api_confidence = candidate | — | — | 전제 충족 전까지 상위 모드 금지 |

> **Blocking Mode** = 이 항목이 cap 하는 모드. decision·missing-fact 는 cap 모드를 갖고, unknown 은 직접 cap 안 하면 `—`. close 는 사람-전용.

> next_actions (readiness 출력 그대로 — 이 packet 이 푸는 목록 아님):
> - resolve decision D-001: 만료 쿠폰을 목록에 노출할 것인가?
> - resolve decision D-002: 쿠폰 목록 정렬 기준은 무엇인가?
> - resolve decision D-003: 쿠폰 목록 페이지네이션 방식은?
> - create figma-component-mapping (status >= draft)
> - confirm API (resolve 1 open unknown(s))

## Review Evidence (advisory — 게이트 아님)
<!-- Review Artifact 의 review_summary/findings 를 advisory evidence 로만 옮긴다. merge check 에 배선 금지. -->
- Review Artifact: **(리뷰 전 — 미생성)**. 이 Run Report 는 collector 가 최초 생성한 evidence 초안이라 리뷰 evidence 가 아직 없다.
- ⚠ 순서(순환 의존 회피): Review Artifact 가 이 Run Report 를 입력으로 리뷰한다 → 리뷰 후 이 섹션을 advisory 로 덧붙인다(post-review append).

## Idempotency
- 재실행/픽스처 회귀(test-fixtures): `ok=true` — test-fixtures — PASS (25 fixtures: 24 pass, 1 xfail, 0 xpass, 0 xdrift, 0 fail). (재실행=witness, 게이트 아님)
- 생성물 표류(check-generated, advisory — 새 gate 아님): `ok=false` (nav-graph:missing-committed, route-tree:missing-committed). warning-first — evidence 로만 첨부.
<!-- ⚠ MVP-C 종속: 재생성 화이트리스트/빈-diff 정의는 generated-file guard 확정 후 정렬. 지금은 라벨만. -->

## Follow-up
> next_actions (readiness 출력 그대로 — 게이트 해제는 사람-전용):
> - resolve decision D-001: 만료 쿠폰을 목록에 노출할 것인가?
> - resolve decision D-002: 쿠폰 목록 정렬 기준은 무엇인가?
> - resolve decision D-003: 쿠폰 목록 페이지네이션 방식은?
> - create figma-component-mapping (status >= draft)
> - confirm API (resolve 1 open unknown(s))
- Open Decision / Unknown / Conflict 의 resolve·close·candidate→confirmed 승격은 **사람-전용**. collector/리뷰어가 닫지 않는다.

---
> **통과 ≠ 완료. Run Report ≠ 사람 승인.** 위 evidence 가 전부 깨끗(빈 diff·validate ok·멱등)해도
> 그것은 *결정성·경계 준수*의 증거일 뿐 **제품적 정확성·사람 승인**이 아니다. 이 Run Report 는
> 머지 판단·승인을 하지 않는다 — 게이트는 readiness(Open Decision)+validate 뿐이고, 다음 행동은
> 사람/지정 구현자가 정한다. (도구 결과 fail 은 evidence 이지 이 보고서의 실패가 아니다.)
