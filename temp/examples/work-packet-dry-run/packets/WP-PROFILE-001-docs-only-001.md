---
packet_id: "WP-PROFILE-001-docs-only-001"
packet_type: "work-packet"
status: "draft"
target_screen: "PROFILE-001"
domain: "profile"
requested_mode: "screen-skeleton"
readiness_mode: "docs-only"
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
  - requested_mode 가 readiness_mode 보다 높아도 packet 은 유효하다 — 천장은 readiness_mode 이고, 초과분은 거절+blocker 보고로 처리한다 (예: docs-only 거절). requested_mode 는 권한이 아니라 요청 기록일 뿐 — 무효화는 readiness_source 의 mode/facts 가 바뀔 때만.
  - 판정 단일 출처: readiness.mjs. 이 packet 은 그 출력을 옮기는 인덱스/핸드오프 보드다.
-->

# Work Packet: PROFILE-001 docs-only

## Goal
이 세션은 `docs-only` 안에서 **PROFILE-001 의 문서 상태만 정합하게 유지**한다 (`docs/frontend-workflow/**` 한정). requested_mode 가 `screen-skeleton` 이지만 readiness 천장이 `docs-only` 이므로 화면 shell·route·UI 산출물은 목표가 아니다 — 게이트가 막으면 구현하지 않고 blocker 를 보고하고 멈추는 것이 이 packet 의 정답 동작이다.

## Validity
- 기준 스냅샷: `frontend-workflow-kit/examples/multi-screen-dry-run/reports/expected-readiness.md` (실행/확인 시점: 2026-06-13).
- 전제: `readiness_mode` = `docs-only`, ScreenSpec `status` = `draft`. 이 값이 바뀌면 packet 무효 → 재발급.
- Open Decision 스냅샷: 아래 Blocking Items 의 항목/상태는 2026-06-13 기준(D-301 open, U-301 open). 새 결정이 열리거나 닫히면 readiness 부터 다시 돌린다.

## Must Read
<!-- 복사하지 말고 링크만. 구현자는 정본을 직접 읽는다. -->
- ScreenSpec (정본): `frontend-workflow-kit/examples/multi-screen-dry-run/docs/frontend-workflow/domains/profile/screens/profile-edit/screen-spec.md`
- readiness output / run-report: `frontend-workflow-kit/examples/multi-screen-dry-run/reports/expected-readiness.md` (§1 실측 — PROFILE-001 행)
- 관련 정책: `frontend-workflow-kit/policies/implementation-mode-policy.yaml`
- (해당 시) Open Decisions / Conflicts: ScreenSpec 의 `## Open Decisions` 표 (D-301 정본) · `## Unknowns` 표 (U-301)

## Readiness Snapshot
<!-- readiness output 을 그대로 옮긴다. 재계산 금지 — 숫자/모드는 readiness_source 에서 복사한다. -->
| 항목 | 값 |
|---|---|
| readiness_mode | `docs-only` |
| next_mode | `route-skeleton` |
| 천장 근거 | D-301(blocking route-skeleton) → decision_cap = docs-only |

출처: `frontend-workflow-kit/examples/multi-screen-dry-run/reports/expected-readiness.md` — `readiness.mjs` 출력. 이 표는 소비물이며, 이 packet 에서 다시 유도하지 않는다.

## Allowed Paths
<!-- readiness output 의 allowed_paths 를 glob 그대로 복사한다. 손으로 넓히거나 줄이지 않는다. -->
```txt
docs/frontend-workflow/**        # readiness output 의 allowed_paths[0]
```

## Forbidden Paths
<!-- readiness output 의 forbidden_paths 를 그대로 복사한다.
     명시 forbidden(예: src/api/**, openapi.yaml)은 "전 모드 공유 인프라 — 절대 금지".
     diff-based backstop 으로 allowed 밖 경로가 포함될 수 있다 (이 모드에선 아직 안 열림 — 상위 모드에서 열림).
     어느 쪽이든 출처 그대로 옮기고, 여기서 재유도하지 않는다. -->
```txt
src/**        # docs-only 천장 — src 전체가 상위 모드에서만 열림 (route-skeleton 부터). 한 줄도 닿지 않는다.
```

## Blocking Items
<!-- 이 세션이 "푸는" 목록이 아니라 "닫지 말 것" 목록이다.
     Open Decision / Unknown / missing fact 를 나열하고 owner·blocking_mode 를 적는다.
     게이트 해제(resolve/close/confirm)는 모두 사람만 — 여기서는 손대지 않는다. -->
| ID | 유형 | 내용 | Blocking Mode | Owner | 처리 |
|---|---|---|---|---|---|
| D-301 | decision | 프로필 편집 범위/필드 확정(닉네임·이메일·아바타·비밀번호 변경 포함 여부) | route-skeleton | PM | 닫지 말 것 (사람만) |
| U-301 | unknown | 비밀번호 변경을 이 화면에 포함하나, 별도 화면인가? | — | PM | 닫지 말 것 (사람만) |

> **Blocking Mode** = 이 항목이 cap 하는(도달을 막는) 모드. docs-only cap 의 근거는 **D-301**(readiness blocking 머리). **U-301** 은 같은 화면의 열린 Unknown 으로(정본: ScreenSpec `## Unknowns`) 모드를 직접 cap 하지 않아 `—` 로 두지만, close 는 D-301 범위 확정과 맞물린 사람-전용이라 "닫지 말 것" 목록에 함께 둔다.

## Expected Output
<!-- 이 모드에서 "정답"인 산출물 형태를 못박는다. 모드별 정답 형태 예:
       docs-only        = docs/frontend-workflow/** 문서만.
       route-skeleton   = src/app/** 라우트 엔트리만 (features 무접촉).
       screen-skeleton  = 화면 shell only (fixture UI·fake hook 없음).
       rough-fixture-ui = fixture 데이터로 구동되는 거친 UI (src/api 무접촉, fake hook 계약). -->
`docs-only` 의 정답 산출물은 `docs/frontend-workflow/**` 문서뿐이다. 이 시나리오에서는 D-301 이 `route-skeleton` 도달을 막아 `src/**` 전체가 닫혀 있으므로, **구현 거절 + blocker 보고 + src 변경 0** 이 정답이다 (화면 shell·route 엔트리·fixture UI 는 정답이 아니다).

## Out of Scope
<!-- 명시적 금지. Work Packet MUST NOT 목록과 정합. -->
- Open Decision resolve / Conflict close / Unknown close — 금지 (사람만). 특히 D-301·U-301 은 open 그대로 둔다.
- candidate → confirmed 승격 — 금지 (사람만). API Candidates 의 `GET /profile`·`PATCH /profile` confidence(unknown) 격상 금지.
- API endpoint 발명, copy 문구 발명, design value 발명 — 금지. 편집 필드/범위(닉네임·이메일·아바타·비밀번호)는 D-301 미확정이므로 발명하지 않는다. 막히면 ScreenSpec Unknowns / Open Decisions / `conflicts.md` 에 남긴다.
- generated file(`_meta/*.yaml`, `component-catalog.md` 등) · confirmed 산출물 hand-edit — 금지.
- `route-skeleton` 이상 상위 모드 산출물 — 금지 (천장은 `docs-only`). `src/**` 어떤 파일도 만들지 않는다.
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
- [ ] 변경 파일이 Allowed Paths(`docs/frontend-workflow/**`) 안에만 존재 — `git diff --name-only` 로 확인. (이 시나리오는 거절이 정답이라 빈 diff 가 합당.)
- [ ] Forbidden Paths 무접촉 — `src/**` 에 한 줄도 닿지 않음.
- [ ] 모드 천장(`docs-only`) 초과 산출물 없음 (route/screen shell·fixture UI 욱여넣기 금지).
- [ ] Blocking Items 의 결정/Unknown 이 그대로 열려 있음 — D-301·U-301 상태 open 보존 (이 세션이 닫지 않음).
- [ ] `npm run workflow:validate` exit 0, 재실행 멱등 (재생성물 외 빈 diff).

## Review Checklist
<!-- 리뷰어 확인 항목. work-packet-rubric 의 10개 check 를 그룹으로 롤업한 것 (1:1 아님 — 한 줄이 여러 rubric check 를 묶는다). review-artifact.template.md 의 Checklist 가 이를 미러. -->
- [ ] **게이트 판독** — readiness_mode/allowed/forbidden 이 `expected-readiness.md` (§1 PROFILE-001) 와 글자 일치 (재계산·hand-edit 없음).
- [ ] **경로 준수** — diff 가 allowed 안에만, forbidden(`src/**`) 무접촉.
- [ ] **천장 미초과** — `docs-only` 가 허용하는 산출물만 (과구현 없음 — 거절이 정답).
- [ ] **미확정 미발명** — 편집 필드/범위(D-301)·API/copy/design value 추측 없음.
- [ ] **결정 미닫힘** — D-301·U-301 상태 보존 (사람-전용 불변식).
- [ ] **보고·멱등** — blocker 는 readiness 의 `blocking`/`next_actions` 그대로 보고, 재실행 최소 diff.
