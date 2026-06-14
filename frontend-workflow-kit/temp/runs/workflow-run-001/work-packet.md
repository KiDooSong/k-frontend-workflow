---
packet_id: "WP-COUPON-001-rough-fixture-ui-001"
packet_type: "work-packet"
status: "draft"
target_screen: "COUPON-001"
domain: "coupons"
requested_mode: "rough-fixture-ui"
readiness_mode: "rough-fixture-ui"
readiness_source: "readiness.mjs --docs examples/coupon-feature/docs/frontend-workflow --screen COUPON-001 --json (computed 2026-06-14)"
created_at: "2026-06-14"
owner: "workflow:packet"
generated_by: "workflow:packet (PR2 draft generator)"
---

<!--
  이 파일은 `workflow:packet` 이 readiness 출력을 복사해 생성한 Work Packet 초안이다 (PR2 generator).
  새 source of truth/gate 아님 · readiness 재계산 0 · 구현 실행 0 · auto-fix/auto-run 0.
  allowed/forbidden/mode 는 readiness 출력에서 글자 그대로 복사. Open Decision/Unknown/Conflict 는 닫지 않는다(사람-전용).
  통과 ≠ 완료: 봉투 발급은 게이트가 깨끗하다는 뜻일 뿐, 설계 적합성은 사람이 따로 확인한다.
-->

# Work Packet: COUPON-001 rough-fixture-ui

## Goal
이 세션은 `rough-fixture-ui` 안에서 한 가지만 달성한다: fixture 데이터로 화면을 구동한다 (실제 API 연동·src/api 변경 없음). (상위 모드 산출물은 목표가 아니다.)

## Validity
- 기준 스냅샷: `readiness.mjs --docs examples/coupon-feature/docs/frontend-workflow --screen COUPON-001 --json (computed 2026-06-14)` (실행/확인 시점: 2026-06-14).
- **무효조건 (하나라도 바뀌면 무효 → readiness 재실행 후 재발급):**
  - [ ] readiness 재실행 결과의 `readiness_mode` 가 `rough-fixture-ui` 와 달라짐.
  - [ ] `readiness_source` 의 mode/facts(천장 근거 fact · allowed/forbidden)가 달라짐.
  - [ ] ScreenSpec `status` 가 readiness 스냅샷 시점과 달라짐.
  - [ ] Blocking Items 의 Open Decision 이 새로 열리거나 닫힘.
  - [ ] `readiness_source` 파일 자체가 갱신됨(날짜/내용 변경).
- 이 packet 은 스냅샷이다. 의심되면 집행 **전** `npm run workflow:readiness` 로 대조한다 (사람 확인 — 자동 차단 아님).

## Must Read
- ▶ **여기부터**: `readiness.mjs --docs examples/coupon-feature/docs/frontend-workflow --screen COUPON-001 --json (computed 2026-06-14)` — 이 세션의 게이트 사실(allowed/forbidden/mode)의 출처. readiness 출력.
- ScreenSpec (정본): `docs/frontend-workflow/domains/coupons/screens/<screen-slug>/screen-spec.md` — 정확 경로는 screen-inventory 확인 (초안: 링크만).
- 관련 정책: `frontend-workflow-kit/policies/implementation-mode-policy.yaml`
- (해당 시) Open Decisions / Conflicts: `_meta/decision-log.md` · `_meta/conflicts.md`

## Readiness Snapshot
| 항목 | 값 |
|---|---|
| readiness_mode | `rough-fixture-ui` |
| next_mode | `final-fixture-ui` |
| requested_mode | `rough-fixture-ui` |
| 천장 근거 | readiness 출력 기준 천장 = `rough-fixture-ui`, next_mode = `final-fixture-ui`. 상위 진행은 아래 Blocking Items 가 cap (Open Decision 3건 · 미충족 fact 2건). 이 표는 소비물이며 재유도하지 않는다. |

출처: `readiness.mjs --docs examples/coupon-feature/docs/frontend-workflow --screen COUPON-001 --json (computed 2026-06-14)` — `readiness.mjs` 출력. 이 표는 소비물이며, 이 packet 에서 다시 유도하지 않는다.

## Allowed Paths
<!-- readiness 출력의 allowed_paths 를 글로브 그대로 복사 (손으로 넓히거나 줄이지 않는다). -->
```txt
src/features/coupons/screens/**
src/features/coupons/components/**
src/features/coupons/hooks/**
```

## Forbidden Paths
<!-- readiness 출력의 forbidden_paths 를 그대로 복사. 경계 검증은 validate 가 아니라 diff 로 본다. -->
```txt
src/api/**
openapi.yaml
```

## Blocking Items
<!-- "푸는" 목록이 아니라 "닫지 말 것" 목록. 게이트 해제(resolve/close/confirm)는 모두 사람. -->
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

## Ambiguity Review Required
<!-- 코딩 전 먼저 채운다. warning-only 텍스트 — 코드 게이트 아님. 게이트는 readiness(Open Decision)+validate 뿐. -->
<!-- 이 generator 는 의미 추론 0 — readiness 출력만 옮기고, 후보는 "제안"으로만 표면화한다(닫지 않음). -->

| 모드 | Safe To Proceed? (yes/no) | 사유 | Blocking 후보 (D-cand / U-cand) |
|---|---|---|---|
| `docs-only` | yes | 문서만 — 애매함을 여기서 표면화 (항상 yes) | — |
| `route-skeleton` | yes | `rough-fixture-ui` 천장 이내 — 이 모드를 cap 하는 미해결 Open Decision 없음 (warning-only) | — |
| `screen-skeleton` | yes | `rough-fixture-ui` 천장 이내 — 이 모드를 cap 하는 미해결 Open Decision 없음 (warning-only) | — |
| `rough-fixture-ui` | yes | `rough-fixture-ui` 천장 이내 — 이 모드를 cap 하는 미해결 Open Decision 없음 (warning-only) | — |
| `final-fixture-ui` | — | 상위 모드 — `rough-fixture-ui` 가 이미 cap (평가 생략) · D-cand D-001, D-002 가 이 모드 cap | D-cand: D-001<br>D-cand: D-002 |
| `api-integrated-ui` | — | 상위 모드 — `rough-fixture-ui` 가 이미 cap (평가 생략) · D-cand D-003 가 이 모드 cap | D-cand: D-003 |
| `production-ready` | — | 상위 모드 — `rough-fixture-ui` 가 이미 cap (평가 생략) | — |

> **Safe To Proceed?** 는 readiness 재계산이 아니다 — 천장은 항상 `rough-fixture-ui` 이고, 이 표는 그 아래에서 **더 보수적으로만** 멈출 수 있다(게이트를 *올리지* 못함). 아래에서 위로 훑어 'no' 직전에서 멈춘다(=HALT_AMBIGUITY). `rough-fixture-ui` 위 모드는 readiness 가 이미 cap 했으므로 평가하지 않는다.
> **Blocking 후보**(D-cand/U-cand)는 *제안*일 뿐 — 닫거나 ScreenSpec 에 확정하는 것은 사람.

**Blocking 후보 (warning-only — 닫지 말 것, 사람-전용):**
- `D-cand: D-001` — cap `final-fixture-ui`, owner PM · 닫지 말 것 (사람만)
- `D-cand: D-002` — cap `final-fixture-ui`, owner PM · 닫지 말 것 (사람만)
- `D-cand: D-003` — cap `api-integrated-ui`, owner BE · 닫지 말 것 (사람만)
- `U-cand: figma_mapping` = missing — Blocking Mode 미지정(next_actions 참조) · 닫지 말 것 (사람만)
- `U-cand: api_confidence` = candidate — Blocking Mode 미지정(next_actions 참조) · 닫지 말 것 (사람만)

> 전체 triage 결정트리·신호표·Blocking Mode 매핑 + 채워진 Safe To Proceed? 예시(§6)는 → [../../../docs/workflows/ambiguity-triage.md](../../../docs/workflows/ambiguity-triage.md)
> New Unknowns / New Open Decision Candidates / Possibly Blocking 의 상세 4블록 스키마도 위 doc 으로 분리(여기엔 위 최소 표만).

## Expected Output
fixture 데이터로 화면 구동; src/api/** 변경 0; fake hook(AsyncState) 계약 충족. 변경은 Allowed Paths 안에만, allowed 밖 0 (git diff 로 확인). 상위 모드 산출물(예: API 연동)은 정답이 아니다.

## Out of Scope
- Open Decision resolve / Conflict close / Unknown close — 금지 (사람만).
- candidate → confirmed 승격 — 금지 (사람만).
- API endpoint 발명, copy 문구 발명, design value 발명 — 금지. 막히면 ScreenSpec Unknowns / Open Decisions / `conflicts.md` 에 남긴다.
- generated file(`_meta/*.yaml`, `component-catalog.md` 등) · confirmed 산출물 hand-edit — 금지.
- `final-fixture-ui` 이상 상위 모드 산출물 — 금지 (천장은 `rough-fixture-ui`).
- ScreenSpec 대체 / readiness.mjs 대체 — 금지 (이 packet 은 인덱스일 뿐).

## Commands
```bash
npm run workflow:state       # workflow-state.yaml 재생성 (소스 무수정)
npm run workflow:readiness   # 화면별 readiness_mode 재산출 (판정 단일 출처)
npm run workflow:validate    # 스키마/구조 검사 (exit 0 = 통과)
```
<!-- 경계(allowed/forbidden) 검증은 validate 가 아니라 diff 로 본다 — Acceptance Criteria 참조. -->

## Acceptance Criteria
- [ ] 변경 파일이 Allowed Paths(readiness 출력) 안에만 존재 — `git diff --name-only` 로 확인.
- [ ] Forbidden Paths 무접촉 (특히 `src/api/**` · `openapi.yaml` 에 한 줄도 닿지 않음).
- [ ] 모드 천장(`rough-fixture-ui`) 초과 산출물 없음 (상위 모드 UI/연동 욱여넣기 금지).
- [ ] Blocking Items 의 결정/Unknown/Conflict 가 그대로 열려 있음 (이 세션이 닫지 않음).
- [ ] `npm run workflow:validate` exit 0, 재실행 멱등 (재생성물 외 빈 diff).

## Review Checklist
- [ ] **Pre-Implementation Review** — Ambiguity Review Required 의 `Safe To Proceed?` 가 `rough-fixture-ui` 까지 검토됐고(빈 표면은 "없음—사유"), Validity 전제(readiness_source mode/facts) 무변경, Blocking 후보(D-cand/U-cand)가 분류돼 그대로 열림(이 세션이 닫지 않음).
- [ ] **게이트 판독** — readiness_mode/allowed/forbidden 이 `readiness.mjs --docs examples/coupon-feature/docs/frontend-workflow --screen COUPON-001 --json (computed 2026-06-14)` 와 글자 일치 (재계산·hand-edit 없음).
- [ ] **경로 준수** — diff 가 allowed 안에만, forbidden(특히 `src/api/**`) 무접촉.
- [ ] **천장 미초과** — `rough-fixture-ui` 가 허용하는 산출물만 (과구현 없음).
- [ ] **미확정 미발명** — API/copy/design value 추측 없음, tbd 행 그대로.
- [ ] **결정 미닫힘** — Open Decision/Conflict/Unknown 상태 보존 (사람-전용 불변식).
- [ ] **보고·멱등** — blocker 는 readiness 의 `blocking`/`next_actions` 그대로 보고, 재실행 최소 diff.
