# work-packet-dry-run — md-only 예제 세트

Work Packet · Run Report · Review Artifact 세 산출물을 **한 세션 단위**로 묶어 보여 주는 md-only 예제 모음이다. 코드도 스크립트도 실행하지 않는다 — 모든 `.md` 는 손으로 작성한 산출물 형태(shape) 예시이며, `npm run workflow:*` 명령은 본문에 **인용만** 되어 있다(실제 실행 결과 아님). 두 시나리오로 정상 진행(`screen-skeleton`)과 게이트 거절(`docs-only`)을 대비시킨다.

- 기준 스냅샷(게이트 단일 출처): `frontend-workflow-kit/examples/multi-screen-dry-run/reports/expected-readiness.md` (§1 실측, 확인 시점 2026-06-13).
- 입력 fixture: `frontend-workflow-kit/examples/multi-screen-dry-run`.

> **이것은 무엇이 아닌가.** 이 세트는 실행 로그가 아니라 **문서 형태 예시**다. Run Report 의 diff/exit code, 채점 `✅` 는 "이런 모양으로 쓴다"를 보여 주는 작성 모델이지, 이 디렉토리에서 명령을 돌려 얻은 산출물이 아니다.

---

## 1. 핵심 불변식 — Work Packet 은 새 게이트가 아니다

이 세트 전체를 관통하는 한 줄: **Work Packet 은 새로운 source of truth 도, 새로운 gate 도 아니다.** 기존 readiness gate 를 한 세션 단위로 포장하는 **실행 봉투(execution envelope)**이자 인덱스/핸드오프 보드일 뿐이다.

1. **판정 단일 출처는 `readiness.mjs`.** 세 산출물 모두 readiness output(= `expected-readiness.md` §1)을 **소비만** 한다 — `readiness_mode` / `next_mode` / `allowed_paths` / `forbidden_paths` 를 글자 그대로 복사할 뿐, 재계산·재유도하지 않는다.
2. **ScreenSpec 을 복사하지 않는다.** 정본(ScreenSpec · decision-log)은 `Must Read` / `Reviewed Inputs` 에서 **링크만** 건다. Open Decision 표도 복사하지 않고 참조한다.
3. **게이트 해제는 사람-전용.** Work Packet · Run Report · Review 어느 것도 Open Decision resolve / Conflict close / Unknown close / candidate→confirmed 승격을 하지 않는다. 나열하고 "닫지 말 것"으로 둔다. LLM 은 open/재오픈만 가능하다.
4. **천장은 `readiness_mode`.** `requested_mode` 가 `readiness_mode` 보다 높아도 그 packet 은 유효하다 — 실행은 항상 `readiness_mode` 로 scope 하고, 초과분은 거절+blocker 보고로 처리한다(`requested_mode` 는 권한이 아니라 추적 정보일 뿐, 예: PROFILE-001). 무효화는 readiness_source 의 mode/facts 가 바뀔 때만.
5. **경계 검증은 validate 가 아니라 diff 로 본다**(`validate.mjs:12`). `npm run workflow:validate` 는 스키마/구조 9종만 보고, allowed/forbidden 경로 준수는 `git diff` 로 확인한다.

이 위치(roadmap 상)는 **Tier 3 → Future Candidate** 다. Work Packet 은 흡수형 산출물이지 독립 축이 아니며, Review Gates 도 별도 축이 아니라 Work Packet 의 `required` 행으로 시작한다. 이 예제 세트는 그 설계 계약을 md 형태로 고정한 것이다.

---

## 2. 디렉토리 레이아웃

산출물 타입별로 디렉토리를 나누고, 파일명은 `{타입}-{화면}-{모드}-{seq}.md` 규약을 따른다. 한 시나리오의 세 산출물은 `packet_id` 로 묶인다.

```txt
work-packet-dry-run/
├─ README.md                                    # 이 파일
├─ packets/                                      # Work Packet — 실행 봉투(게이트 포장)
│  ├─ WP-COUPON-001-screen-skeleton-001.md       # 정상 진행 시나리오
│  └─ WP-PROFILE-001-docs-only-001.md            # 게이트 거절 시나리오
├─ run-reports/                                  # Run Report — packet 실행 결과 기록
│  ├─ RR-COUPON-001-screen-skeleton-001.md
│  └─ RR-PROFILE-001-docs-only-001.md
└─ reviews/                                       # Review Artifact — 게이트·천장·불변식 채점
   ├─ RV-COUPON-001-screen-skeleton-001.md
   └─ RV-PROFILE-001-docs-only-001.md
```

---

## 3. 세 산출물의 관계 (packet → run report → review)

한 세션은 **packet 발급 → 실행/보고 → 리뷰**로 흐르고, 뒤 단계는 앞 단계를 `packet_id` / `run_id` 로 **링크만** 한다(복사 금지).

```txt
Work Packet            Run Report                Review Artifact
(실행 봉투)      ──▶    (실행 결과)        ──▶    (게이트·불변식 채점)
packet_id              packet_id + run_id        packet_id + run_id + verdict
readiness output 복사   readiness output 소비      readiness output 소비
allowed/forbidden 명시   diff 로 경계 보고          diff·라인 근거로 채점
Acceptance/Review       Gate Compliance(하드룰)    Checklist(A~F) + Violations
Checklist 선언          Blockers Reported          Human-only Decisions Needed
```

- **Work Packet** — 이 세션이 무엇을 하고 무엇을 하지 말아야 하는지 못박는 봉투. `Goal` / `Validity`(기준 스냅샷·전제) / `Must Read`(정본 링크) / `Readiness Snapshot`(readiness output 복사) / `Allowed Paths` · `Forbidden Paths`(glob 그대로) / `Blocking Items`("닫지 말 것" 목록) / `Expected Output` / `Out of Scope` / `Commands` / `Acceptance Criteria` / `Review Checklist`.
- **Run Report** — 그 packet 을 fixture 복사본에서 실행한 결과. `Summary`(종합 판정 표) / `Work Packet Reference` / `Readiness Used`(실행 명령 verbatim) / `Files Changed` / `Result`(success | blocked/refused) / `Gate Compliance`(하드룰 4행) / `Diff Summary`(ADDED/MODIFIED/REMOVED) / `Blockers Reported`(readiness blocking 인용블록) / `Idempotency` / `Follow-up`. 표 헤더·`✅` 표기 관례는 `temp/runs/implement-screen-001/implement-run-report.md` 를 따른다.
- **Review Artifact** — packet + run report 가 게이트·천장·불변식을 지켰는지 채점. `Verdict`(approve | changes-requested | blocked) / `Reviewed Inputs` / `Checklist`(work-packet-rubric(10 checks)을 A~F 로 그룹 롤업, 행별 파일·라인·diff 근거) / `Violations`(구현이 고칠 위반만) / `Human-only Decisions Needed`(blocked 근거) / `Recommended Fixes` / `Do Not Auto-Fix`. advisory 휴리스틱(`useState`/`useEffect` grep)은 **자동 불합격이 아니라 후보** — 파일 열어 교차 확인한다.

---

## 4. 두 시나리오 대비

| | COUPON-001 (정상 진행) | PROFILE-001 (게이트 거절) |
|---|---|---|
| `requested_mode` | `screen-skeleton` | `screen-skeleton` |
| `readiness_mode` (천장) | `screen-skeleton` | `docs-only` |
| `next_mode` | `rough-fixture-ui` | `route-skeleton` |
| 천장 근거 | D-001(final)·D-003(api-integrated) cap 이 더 높음 → **fact 천장**(`fake_hook_exists`·`component_catalog_generated` false)이 결정 | D-301(blocking route-skeleton) → **decision_cap = docs-only** |
| allowed_paths | `src/features/coupons/screens/**` | `docs/frontend-workflow/**` |
| forbidden_paths | `src/api/**` · `openapi.yaml`(절대 금지) + hooks/components/app(상위 모드 경로) | `src/**` 전체 |
| 정답 동작 | 화면 shell **1개** 생성(`CouponListScreen.tsx`) | **구현 거절 + blocker 보고 + src 변경 0** |
| Run Report `Result` | success | blocked / refused |
| Review `verdict` | approve | blocked |
| 열린 채로 둔 항목 | D-001 · D-003 · U-001 | D-301 · U-301 |

**COUPON-001** — `requested_mode == readiness_mode == screen-skeleton` 이라 정상 진행. 정답 산출물은 라우트에 연결될 화면 shell 하나(`src/features/coupons/screens/CouponListScreen.tsx`)뿐이다. fake hook / fixture UI / API client / 별도 hooks·components / route 파일은 **전부 상위 모드 산출물**이라 정답이 아니다. 확정 카피(`coupon.list.title` = "쿠폰")만 쓰고, tbd 카피(`coupon.list.empty` = "TBD")는 문구를 발명하지 않고 키 이름 주석만 남긴다. D-001·D-003 은 천장보다 **상위** 모드를 막는 항목이라 이 세션 진행을 막지 않지만, 막지 않는다고 닫아도 되는 것은 아니다 — 전부 open 유지.

**PROFILE-001** — `requested_mode`(screen-skeleton)와 `readiness_mode`(docs-only)가 어긋나는 시나리오. D-301(편집 범위/필드 미확정, Owner=PM)이 `route-skeleton` 도달을 막아 `src/**` 전체가 닫혀 있다. 따라서 화면 shell·route 엔트리·fixture UI 를 만드는 것이 아니라 **구현하지 않고 D-301 blocker 를 보고하고 멈추는 것**이 정답 동작이다(`SKILL.md:26`). Run Report 는 빈 diff(`ADDED`/`MODIFIED`/`REMOVED` 모두 none)로 이를 기록하고, Review 는 "진행 불가의 원인은 구현 결함이 아니라 사람-전용 결정 D-301" 이므로 `changes-requested` 가 아닌 `blocked` 으로 판정한다.

> **함정 — requested_mode ≠ readiness_mode.** `requested_mode` 는 추적 정보일 뿐 권한이 아니다. 실행은 항상 `readiness_mode` 천장으로 scope 한다. PROFILE-001 처럼 요청이 천장보다 높으면, 정답은 천장에 맞춰 멈추고 보고하는 것이다(요청 모드로 욱여넣지 않는다).

---

## 5. 게이트 출처와 소비 규약

게이트 수치의 **유일한 출처**는 `frontend-workflow-kit/examples/multi-screen-dry-run/reports/expected-readiness.md` §1(실측, 2026-06-13)이다. 이 세트의 어떤 파일도 게이트를 재계산하지 않는다.

- **Work Packet** `Readiness Snapshot` — `readiness_mode` / `next_mode` / 천장 근거를 출처에서 복사. `Allowed/Forbidden Paths` 는 glob 그대로(손으로 넓히거나 줄이지 않음).
- **Run Report** `Readiness Used` — 같은 값을 옮기고, 소비 형태(`result["COUPON-001"].readiness_mode` 등)와 복사본 경로 실행 명령을 verbatim 으로 남긴다.
- **Review** `Checklist` A행 — packet/run report 의 게이트 수치가 출처와 **글자 일치**하는지(재계산·hand-edit 흔적이 없는지)를 첫 채점 항목으로 본다.

> readiness output 의 정확한 `allowed_paths` / `forbidden_paths` 문자열이 더 필요하면 `frontend-workflow-kit/scripts/readiness.mjs`(readiness emitter)와 `frontend-workflow-kit/policies/implementation-mode-policy.yaml` 을 본다. `expected-readiness.md` 는 4컬럼 요약 표라 경로 글롭이 전부 인쇄되어 있지는 않다.

---

## 6. 정본·참조 경로

- 기준 스냅샷(게이트 출처): `frontend-workflow-kit/examples/multi-screen-dry-run/reports/expected-readiness.md`
- ScreenSpec 정본 — COUPON-001: `frontend-workflow-kit/examples/multi-screen-dry-run/docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md`
- ScreenSpec 정본 — PROFILE-001: `frontend-workflow-kit/examples/multi-screen-dry-run/docs/frontend-workflow/domains/profile/screens/profile-edit/screen-spec.md`
- 정책(모드 사다리): `frontend-workflow-kit/policies/implementation-mode-policy.yaml`
- Run Report 작성 모델: `temp/runs/implement-screen-001/implement-run-report.md`
- 채점 rubric 모델: `temp/evaluations/implement-screen-dry-run-checklist.md`
