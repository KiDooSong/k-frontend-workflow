---
packet_id: "WP-COUPON-001-screen-skeleton-001"
packet_type: "work-packet"
status: "draft"
target_screen: "COUPON-001"
domain: "coupons"
requested_mode: "screen-skeleton"
readiness_mode: "screen-skeleton"
readiness_source: "frontend-workflow-kit/examples/multi-screen-dry-run/reports/expected-readiness.md"
created_at: "2026-06-14"
owner: "implement-screen-agent"
---

<!--
  Work Packet 은 새로운 source of truth 도, 새로운 gate 도 아니다.
  기존 readiness gate 를 "한 세션 단위"로 포장하는 실행 봉투(execution envelope)일 뿐이다.
  작성 규칙:
  - ScreenSpec 을 복사하지 않는다 — Must Read 에서 링크만 건다. 정본은 ScreenSpec/decision-log.
  - readiness 를 재계산하지 않는다 — readiness output(또는 run-report)을 그대로 소비한다.
  - allowed_paths / forbidden_paths 는 readiness output 에서 그대로 복사한다 (재유도 금지).
  - 이 packet 은 Open Decision / Conflict / Unknown 을 닫지 않는다. 나열만 하고 "닫지 말 것"으로 둔다.
  - requested_mode 가 readiness_mode 보다 높으면 이 packet 은 무효 — 천장은 readiness_mode 다.
  - 판정 단일 출처: readiness.mjs. 이 packet 은 그 출력을 옮기는 인덱스/핸드오프 보드다.
-->

# Work Packet: COUPON-001 screen-skeleton

## Goal
이 세션은 `screen-skeleton` 안에서 COUPON-001(쿠폰 목록) 화면의 **shell 하나**만 세운다 — `src/features/coupons/screens/CouponListScreen.tsx` 1개. fixture UI · fake hook · API client · 별도 hooks/components · route 파일은 목표가 아니다 (전부 상위 모드 산출물).

## Validity
- 기준 스냅샷: `frontend-workflow-kit/examples/multi-screen-dry-run/reports/expected-readiness.md` (§1 실측 — COUPON-001 행, 확인 시점: 2026-06-13).
- 전제: `readiness_mode` = `screen-skeleton`, ScreenSpec `status` = `draft`. 이 값이 바뀌면 packet 무효 → 재발급.
- Open Decision 스냅샷: 아래 Blocking Items 의 항목/상태는 2026-06-13 기준. 새 결정이 열리거나 닫히면 readiness 부터 다시 돌린다.

## Must Read
<!-- 복사하지 말고 링크만. 구현자는 정본을 직접 읽는다. -->
- ScreenSpec (정본): `examples/multi-screen-dry-run/docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md`
- readiness output / run-report: `frontend-workflow-kit/examples/multi-screen-dry-run/reports/expected-readiness.md`
- 관련 정책: `frontend-workflow-kit/policies/implementation-mode-policy.yaml`
- (해당 시) Open Decisions / Conflicts: ScreenSpec `## Open Decisions` 표 (정본) · `global/conflicts.md` (현재 해당 없음)

## Readiness Snapshot
<!-- readiness output 을 그대로 옮긴다. 재계산 금지 — 숫자/모드는 readiness_source 에서 복사한다. -->
| 항목 | 값 |
|---|---|
| readiness_mode | `screen-skeleton` |
| next_mode | `rough-fixture-ui` |
| 천장 근거 | D-001(final)·D-003(api-integrated) cap 은 더 높음 → fact 천장 screen-skeleton 이 결정. |

출처: `frontend-workflow-kit/examples/multi-screen-dry-run/reports/expected-readiness.md` — `readiness.mjs` 출력. 이 표는 소비물이며, 이 packet 에서 다시 유도하지 않는다.

## Allowed Paths
<!-- readiness output 의 allowed_paths 를 glob 그대로 복사한다. 손으로 넓히거나 줄이지 않는다. -->
```txt
src/features/coupons/screens/**        # readiness output 의 allowed_paths[0]
```

## Forbidden Paths
<!-- readiness output 의 forbidden_paths 를 그대로 복사한다.
     명시 forbidden(예: src/api/**, openapi.yaml)은 "전 모드 공유 인프라 — 절대 금지".
     diff-based backstop 으로 allowed 밖 경로가 포함될 수 있다 (이 모드에선 아직 안 열림 — 상위 모드에서 열림).
     어느 쪽이든 출처 그대로 옮기고, 여기서 재유도하지 않는다. -->
```txt
src/api/**                             # 명시 forbidden — 전 모드 공유 인프라 (절대 금지)
openapi.yaml                           # 명시 forbidden — 전 모드 공유 인프라 (절대 금지)
src/features/coupons/hooks/**          # allowed 밖 — rough-fixture-ui 에서만 열림
src/features/coupons/components/**     # allowed 밖 — rough-fixture-ui 에서만 열림
src/app/**                             # allowed 밖 — route-skeleton 경로 (이 모드에선 안 열림)
```

## Blocking Items
<!-- 이 세션이 "푸는" 목록이 아니라 "닫지 말 것" 목록이다.
     Open Decision / Unknown / missing fact 를 나열하고 owner·blocking_mode 를 적는다.
     게이트 해제(resolve/close/confirm)는 모두 사람만 — 여기서는 손대지 않는다. -->
| ID | 유형 | 내용 | Blocking Mode | Owner | 처리 |
|---|---|---|---|---|---|
| D-001 | decision | 만료 쿠폰 노출/필터 정책 (정본: ScreenSpec Open Decisions) | final-fixture-ui | PM | 닫지 말 것 (사람만) |
| D-003 | decision | 쿠폰 목록 API 계약 확정 (정본: ScreenSpec Open Decisions) | api-integrated-ui | BE | 닫지 말 것 (사람만) |
| U-001 | unknown | 사실 확인 미해결 (정본: ScreenSpec Unknowns) | — | BE | 닫지 말 것 (사람만) |
| component_catalog_generated | missing-fact | `component_catalog_generated == false` (catalog 가 `.snapshot.md`, 미생성) | rough-fixture-ui | agent | 전제 충족 전까지 상위 모드 금지 |
| fake_hook_exists | missing-fact | `fake_hook_exists == false` (md-only fixture, `src/` 없음) | rough-fixture-ui | agent | 전제 충족 전까지 상위 모드 금지 |

<!-- 주: D-001(final-fixture-ui cap)·D-003(api-integrated-ui cap) 은 둘 다 천장(screen-skeleton)보다 상위 모드를
     막는 항목이라 이 세션 진행을 막지 않는다. 그러나 진행을 막지 않는다는 것이 "닫아도 된다"는 뜻은 아니다 — 전부 open 유지. -->

## Expected Output
<!-- 이 모드에서 "정답"인 산출물 형태를 못박는다. -->
`screen-skeleton` 정답 = 라우트에 연결될 화면 shell 1개(`src/features/coupons/screens/CouponListScreen.tsx`) 뿐. fake hook / fixture UI / API client / hooks / components / route 파일은 정답이 아니다. 확정 카피만 사용(`coupon.list.title` = "쿠폰"). `coupon.list.empty` 는 tbd → 문구 발명 금지(키 이름 주석만).

## Out of Scope
<!-- 명시적 금지. Work Packet MUST NOT 목록과 정합. -->
- Open Decision resolve / Conflict close / Unknown close — 금지 (사람만). 특히 D-001 · D-003 · U-001 은 그대로 open.
- candidate → confirmed 승격 — 금지 (사람만).
- API endpoint 발명, copy 문구 발명(`coupon.list.empty` 의 "TBD"), design value 발명 — 금지. 막히면 ScreenSpec Unknowns / Open Decisions / `conflicts.md` 에 남긴다.
- generated file(`_meta/*.yaml`, `component-catalog.md` 등) · confirmed 산출물 hand-edit — 금지.
- `rough-fixture-ui` 이상 상위 모드 산출물 — 금지 (천장은 `screen-skeleton`).
- ScreenSpec 대체 / readiness.mjs 대체 — 금지 (이 packet 은 인덱스일 뿐).

## Commands
<!-- 컨텍스트 팩의 실제 npm scripts. 경로는 이 packet 의 fixture/대상에 맞게 치환한다. -->
```bash
npm run workflow:state       # workflow-state.yaml 재생성 (소스 무수정)
npm run workflow:readiness   # 화면별 readiness_mode 재산출 (판정 단일 출처)
npm run workflow:validate    # 스키마/구조 검사 9종 (exit 0 = 통과)
```
<!-- 경계(allowed/forbidden) 검증은 validate 가 아니라 diff 로 본다 (validate.mjs:12) — Acceptance Criteria 참조. -->

## Acceptance Criteria
<!-- done 인정 조건. 하나라도 어기면 미완. -->
- [ ] 변경 파일이 Allowed Paths(`src/features/coupons/screens/**`) 안에만 존재 — `git diff --name-only` 로 확인.
- [ ] Forbidden Paths 무접촉 (특히 `src/api/**` · `openapi.yaml` 에 한 줄도 닿지 않음).
- [ ] 모드 천장(`screen-skeleton`) 초과 산출물 없음 (useState/useEffect/useXxx/fetch/axios/isLoading/FlatList 0건 — fixture UI·fake hook 욱여넣기 금지).
- [ ] Blocking Items 의 D-001 · D-003 · U-001 이 그대로 열려 있음 (이 세션이 닫지 않음).
- [ ] `npm run workflow:validate` exit 0, 재실행 멱등 (재생성물 외 빈 diff).

## Review Checklist
<!-- 리뷰어 확인 항목. work-packet-rubric 과 1:1 정합 (review-artifact.template.md 의 Checklist 가 이를 미러). -->
- [ ] **게이트 판독** — readiness_mode/allowed/forbidden 이 `expected-readiness.md` (COUPON-001 행)과 글자 일치 (재계산·hand-edit 없음).
- [ ] **경로 준수** — diff 가 allowed 안에만, forbidden(특히 `src/api/**`) 무접촉.
- [ ] **천장 미초과** — `screen-skeleton` 가 허용하는 산출물(shell only)만 (과구현 없음).
- [ ] **미확정 미발명** — API/copy(`coupon.list.empty`)/design value 추측 없음, tbd 행 그대로.
- [ ] **결정 미닫힘** — D-001/D-003/U-001 상태 보존 (사람-전용 불변식).
- [ ] **보고·멱등** — blocker 는 readiness 의 `blocking`/`next_actions` 그대로 보고, 재실행 최소 diff.
