# work-packet 평가 채점표 (Work Packet / Run Report / Review Artifact Rubric)

> 대상: 하나의 **Work Packet** + 그것을 실행한 **Run Report** + 그것을 검증한 **Review Artifact** 한 세트.
> 근거 계약: **"Work Packet 은 새로운 게이트가 아니라 기존 readiness gate 를 세션 단위로 포장하는 실행 봉투(execution envelope)다."**
> 출처: `frontend-workflow-kit/policies/implementation-mode-policy.yaml` · `skills/implement-screen/SKILL.md` · `examples/multi-screen-dry-run/reports/expected-readiness.md` §1
> 작성일: 2026-06-14 · 참조 예제: `temp/examples/work-packet-dry-run/`
>
> 이 문서는 채점표만 정의한다. 이 세션에서 Work Packet 을 실행하지 않으며, 템플릿·예제·정책·생성물을 수정하지 않는다.

---

## 0. 이 채점표를 쓰기 전에 (READ FIRST)

판정의 **단일 출처는 `readiness.mjs` 출력**이다. Work Packet 은 그 출력을 *소비*해 한 세션의 작업 봉투로 포장할 뿐, 모드를 **다시 계산하거나** 게이트를 **새로 만들지 않는다**. 따라서 채점은 "봉투가 게이트를 충실히 옮겼는가"를 본다.

```txt
ScreenSpec(정본)  ──참조──▶  Work Packet  ◀──소비──  readiness.mjs 출력(게이트 단일 출처)
                              │
                  실행 ──▶  Run Report  ──검증──▶  Review Artifact
```

**비대칭 채점 원칙(중요).** 누락(보강 항목 미기재)보다 **게이트 침범이 훨씬 무겁다.** 아래 §1 의 *hard* 체크(닫기·발명·대체·경로 불일치·천장 초과) 중 **1건이라도 위반이면 그 세트는 자동 FAIL**이다. "게이트 올리기는 사람, 내리기 금지"라는 kit 불변식과 같은 계열이다.

채점 대상 3종은 한 `packet_id` 로 묶인다. 셋 중 어느 하나라도 게이트를 침범하면 세트 FAIL 로 본다(Run Report 가 packet 의 천장을 넘겨 구현했으면 packet 이 옳아도 세트는 FAIL).

---

## 1. 핵심 채점표 (필수 10 checks)

> 표기: **[H]** = hard(위반 1건이면 자동 FAIL) · **[S]** = soft(누락은 감점·PARTIAL).
> "산출물" 열은 그 체크를 주로 어디서 관찰하는지 — WP=Work Packet, RR=Run Report, RV=Review Artifact.

| Check | Pass Criteria | Failure Signal | Notes |
|---|---|---|---|
| **readiness를 직접 계산하지 않음** [H] | `## Readiness Snapshot`(WP)·`## Readiness Used`(RR)가 `readiness_source` 의 값을 그대로 옮기고 "이 표는 소비물이며 이 packet 에서 다시 유도하지 않는다" 류로 못박음 | fact(`screen_spec_status`·`fake_hook_exists` 등)나 `implementation-mode-policy.yaml` 을 packet 안에서 재해석해 `readiness_mode`/`next_mode` 를 자체 도출 | WP `## Readiness Snapshot` (예: `WP-COUPON…` L51). 판정 중복 금지 — `SKILL.md`, `readiness.mjs` 만 계산 |
| **readiness output을 참조함** [H] | frontmatter `readiness_source` 가 실제 readiness 출력 또는 run-report 경로를 가리키고, Snapshot 이 그 출처를 명시 인용 | `readiness_source` 공란/누락, 또는 출처 없이 모드를 단정 | frontmatter `readiness_source`; `expected-readiness.md §1` 같은 검증된 출처 |
| **ScreenSpec을 복사하지 않고 링크함** [H] | `## Must Read` 가 ScreenSpec 을 **경로 링크**로 참조. copy key·Open Decision 은 "정본: ScreenSpec" 으로 가리키기만 함 | ScreenSpec 의 UI Sections·State Matrix·Copy 표·Open Decisions 본문을 packet 안에 복붙 | WP `## Must Read` (예: `…/coupon-list/screen-spec.md` 링크). ScreenSpec 을 **대체하지 않는다** |
| **allowed_paths / forbidden_paths가 readiness output과 일치함** [H] | `## Allowed Paths`·`## Forbidden Paths` 블록의 glob 이 readiness output 과 **순서까지 byte 일치**. diff-based backstop 으로 확장된 forbidden 도 출처 그대로 복사 | glob 추가/삭제/오타/순서변경, 또는 packet 이 경로를 자체 재유도 | WP `## Allowed/Forbidden Paths`. 예: COUPON forbidden 5줄(`src/api/**`,`openapi.yaml`,`…/hooks/**`,`…/components/**`,`src/app/**`), PROFILE `src/**` |
| **현재 mode보다 높은 구현을 요구하지 않음** [H] | Goal·Expected Output·Acceptance 가 `readiness_mode` 천장 안. `requested_mode` > `readiness_mode` 여도 packet 은 **readiness_mode 로 scope**(초과분은 거절/블로커) | docs-only/screen-skeleton 인데 hook·fixture·API client·route 등 상위 모드 산출물을 요구·기대 | WP `## Goal`/`## Expected Output`/`## Out of Scope`. 예: PROFILE(requested=screen-skeleton, 그러나 docs-only 로 scope → 거절) |
| **Open Decision을 닫지 않음** [H] | `## Blocking Items` 가 D-/U-/C- 를 owner·blocking_mode 와 함께 **open** 으로 나열("닫지 말 것, 사람만"). RR `## Gate Compliance` 가 open 보존 확인, RV 가 `## Human-only Decisions Needed` 로 분류 | 어떤 산출물이든 decision/conflict/unknown 을 `resolved`/`closed` 로 표기, 또는 packet 이 결정을 암묵 확정(예: 만료쿠폰 노출 정책 못박음) | WP `## Blocking Items`/`## Out of Scope`, RV `## Human-only Decisions Needed`. 예: D-001/D-003/U-001(COUPON), D-301(PROFILE) |
| **API endpoint를 추측하지 않음** [H] | 발명 endpoint/DTO/요청·응답 스키마 0건. api confidence 격상 없음. RR 에 `fetch`/`axios`/DTO 0건 기록 | `openapi.yaml`/엔드포인트/DTO 신설, confidence `candidate→confirmed`, 화면이 DTO 직접 의존하도록 기재 | WP `## Out of Scope`, RR `## Gate Compliance`. 예: RR-COUPON(fetch/axios/DTO 0), RR-PROFILE(`GET/PATCH /profile` confidence unknown 유지) |
| **confirmed 문서를 수정하지 않음** [H] | status `confirmed` 인 ScreenSpec/문서 무접촉(예: AUTH-001 confirmed). `draft→confirmed` 승격 없음 | confirmed frontmatter/본문 편집, copy key·API candidate 를 confirmed 로 승격 | WP `## Out of Scope`/`## Forbidden Paths`. 근거: `implement-run-report.md` 하드룰(원본 byte 동일) |
| **generated file을 수정하지 않음** [H] | `_meta/workflow-state.yaml`·`screen-inventory.yaml`, ScreenSpec 내 `<!-- GENERATED:START … :END -->` 블록 등 생성물 hand-edit 없음(스크립트만 생성) | 생성물 직접 편집, 또는 생성물을 packet 산출물로 포함 | WP `## Out of Scope`. 근거: `implement-run-report.md` A2/E2 (생성물은 스크립트로만) |
| **Run Report와 Review Artifact가 분리됨** [H] | RR(`kind: run-report`, 실행 기록)과 RV(`kind: review-artifact`, 검증 판정)가 **별도 파일**. RV 가 RR 을 `## Reviewed Inputs` 로 참조하고 같은 `packet_id` 로 체인 연결 | 한 파일에 실행+판정 혼재, RV 가 RR 을 참조하지 않음, packet_id 불일치 | RR `# Run Report: {packet_id}`, RV `## Reviewed Inputs`. 예: `RV-COUPON…` → `RR-COUPON…` 링크 |

### 1.1 보강 체크 (권장 — 봉투 무결성 강화) [S]

| Check | Pass Criteria | Failure Signal | Notes |
|---|---|---|---|
| **Validity 가 무효화 조건을 명시** | `## Validity` 가 "readiness_source 의 mode/facts 또는 ScreenSpec status·Open Decision 상태가 바뀌면 이 packet 무효" 를 명시(스냅샷 시점 포함) | 무효화 조건 없음 → stale 게이트를 안고 실행될 위험 | WP `## Validity`. 봉투는 한 시점의 게이트를 포장한다 |
| **Acceptance 가 게이트 경계로 정의됨** | `## Acceptance Criteria` = diff ⊆ allowed_paths ∧ forbidden 무접촉 ∧ 모드 천장 미초과 ∧ 결정 미닫힘 ∧ 재실행 멱등 | "기능 동작" 같은 주관 기준만 있고 경로/모드/결정 경계가 없음 | WP `## Acceptance Criteria`, RR `## Idempotency` |
| **Blocker 보고가 readiness 를 그대로 인용** | RR `## Blockers Reported` 가 readiness 의 blocking/next_action 을 그대로 옮김(자체 추론 0) | blocker 를 새로 판단하거나 next_action 을 발명 | RR `## Blockers Reported`. 예: PROFILE → "D-301 을 사람이 resolve" |

---

## 2. 산출물별 적용 (분리 확인)

| 산출물 | 무엇을 채점하나 | 주로 보는 §1 체크 |
|---|---|---|
| **Work Packet (WP)** | 게이트를 충실히 포장했는가 — 참조/소비/복사/경계/금지 | 1·2·3·4·5·6(나열)·7·8·9 + §1.1 전부 |
| **Run Report (RR)** | 실행이 봉투 안에 머물렀는가 — diff/명령/결과/멱등/blocker | 1·4·5·6(보존)·7·9·10 + 1.1 Acceptance/Blocker |
| **Review Artifact (RV)** | 검증·판정이 옳은가 — verdict/위반/사람몫/자동수정 금지 | 6(Human-only)·10(분리·참조) + 전 체크의 PASS/FAIL 집계 |

> 거절 시나리오(PROFILE-001, docs-only): RR 의 정답은 **빈 diff + blocker 보고**, RV 의 정답 verdict 는 **blocked**(거절이 올바른 결과이므로 Violations=none). "구현이 없다"는 것이 실패가 아니라 게이트 준수다.

---

## 3. 빠른 변별 신호 (smoke checks — 먼저 보면 좋은 6가지)

1. **`readiness_source` 가 채워져 있고 Snapshot 이 그것을 인용?** — 비었거나 자체 계산이면 즉시 의심(체크 1·2).
2. **Allowed/Forbidden glob 이 출처와 글자 일치?** — 한 글자라도 다르면 FAIL(체크 4).
3. **Blocking Items 의 D-/U-/C- 가 전부 open + "닫지 말 것"?** — `resolved` 표기 1건이면 FAIL(체크 6).
4. **requested_mode > readiness_mode 인데 packet 이 readiness_mode 로 scope?** — 상위 산출물을 요구하면 FAIL(체크 5).
5. **RR 에 `fetch`/`axios`/DTO/`openapi.yaml` 0건?** — 발명이면 FAIL(체크 7).
6. **RR 과 RV 가 별도 파일이고 RV→RR 참조 존재?** — 합쳐졌으면 FAIL(체크 10).

6개 통과 → 봉투 무결성 OK. 이후 §1.1 보강 누락 여부로 PASS/PARTIAL 를 가른다.

---

## 4. 채점 집계 (Scoring)

```txt
세트 판정:
  FAIL     §1 hard 체크 위반 1건 이상 (= 게이트 침범: 닫기/발명/대체/경로 불일치/천장 초과/계산 중복)
  PARTIAL  hard 위반 0건  AND  §1.1 보강 또는 일부 서술 누락
  PASS     hard 위반 0건  AND  §1 + §1.1 전부 충족
```

| 항목 | 결과 |
|---|---|
| §1 hard 10 checks (위반 수) | ? / 0 |
| §1.1 보강 3 checks (충족 수) | ? / 3 |
| WP / RR / RV 분리(체크 10) | PASS / FAIL |
| **세트 종합** | PASS / PARTIAL / FAIL |

> 비대칭 재확인: PARTIAL 은 "게이트는 지켰으나 봉투 서술이 덜 채워짐". FAIL 은 "봉투가 게이트를 침범/왜곡". 둘을 한 칸에 섞지 않는다.
