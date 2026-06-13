# Work Packet & Review Artifacts — 설계안

> 상태: **제안(설계만)**. 코드·`package.json`·`scripts/` 변경 없음. 산출물은 이 문서 + 이미 작성된 템플릿/예제 셋(아래)뿐이다.
> 위치: Tier 3 **Future Candidate — 새 축 아님, 흡수형**. `roadmap-current.md` "Future Candidate: Work Packet & Review Artifacts"(L86-87) + "다음 구현 후보 #1"(L91). 이 문서가 기존 초안 `temp/work-packet-review-artifacts-proposal.md` 을 **대체·정밀화**한다(12-섹션 계약으로 재구성).
> 참조 코드/문서: `scripts/readiness.mjs`(`computeReadiness` 단일 판정), `scripts/validate.mjs`(검사 9종, 트리 스캔), `policies/implementation-mode-policy.yaml`(7 모드), `skills/implement-screen/SKILL.md`(L9·L19-28·L36·L47-49).
> 참조 템플릿(이미 작성됨): `frontend-workflow-kit/templates/work-packet/{work-packet,run-report,review-artifact}.template.md`.
> 참조 예제(이미 작성됨): `temp/examples/work-packet-dry-run/{packets,run-reports,reviews}/**` — COUPON-001(진행)·PROFILE-001(거절) 2 시나리오.
>
> 이 문서의 목적은 후속 세션이 단독으로 착수할 수 있을 만큼 경계·규칙·예시를 고정하는 것이다.
> 핵심 불변식을 새로 만들지 않는다 — Work Packet 은 readiness 출력을 **소비**한다 (불변식 #1: 모드 판정 단일 출처).

---

## 1. Why Work Packet is needed — 왜 필요한가

MVP-A 의 코드 게이트는 이미 동결돼 있다 — `readiness_mode = min(fact_mode, decision_cap)` 다운그레이드 + validate 검사 9종 (`roadmap-current.md` 게이트 인벤토리 L29-54). 이 게이트는 **화면 하나의 한 시점**을 정확히 판정한다. 빠져 있는 건 게이트 자체가 아니라 **그 게이트를 한 세션이 실제로 집행하는 단위**다.

```txt
지금 있는 것      readiness.mjs 가 "COUPON-001 은 지금 screen-skeleton 까지" 라고 계산해 출력한다.
빠진 것           그 출력을 한 LLM 세션이 "이번에 무엇을 하고 / 무엇을 하면 안 되고 /
                  무엇이 막고 있고 / 어떻게 검증하고 / 누가 채점하나" 로 포장하는 봉투.
```

이 봉투가 없으면 워크플로우는 조각조각 옳아도 **세션 경계에서 무너진다**. `implement-screen` 스킬은 매번 readiness 를 다시 돌리고(SKILL.md L19-24), 그 출력을 읽어 게이트를 판독하지만(L26-28), 그 판독 결과를 **다음 세션·리뷰어·사람**이 다시 추적할 안정된 자리가 없다. blocker(열린 Open Decision·Unknown·미충족 fact)도 readiness 출력에는 있지만, "이 작업 단위에서 누가 무엇을 닫아야 하나"로 모이지 않는다.

해결하려는 운영상의 질문은 단 하나다:

> "이번 세션에서 이 화면을 readiness 천장 안에서 무엇까지 만들 수 있고, 무엇이 막고 있고, 다 됐다는 증거는 무엇이며, 누가 그걸 채점했나?"

이건 **새 게이트를 추가해서 푸는 문제가 아니다**(게이트는 이미 충분하다 — 오히려 `roadmap-current.md` L99-102 가 새 게이트 추가를 금한다). LLM 세션 간 **실행·기록·검증을 한 단위로 묶는 봉투**가 없을 뿐이다. Work Packet 이 그 봉투다.

> **함정 — Work Packet 은 "계획 문서"가 아니라 "게이트 포장지"다.** PRD/스펙이 아니다(그건 ScreenSpec). 어떻게 만들지 설계하는 문서도 아니다. 이미 계산된 readiness 게이트를 세션 단위로 **옮겨 담아** 한 세션이 그 안에서만 일하도록 가두는 봉투다.

---

## 2. What Work Packet is — Work Packet 이란

**Work Packet = 기존 readiness gate 를 "한 세션 단위"로 포장하는 실행 봉투(execution envelope)다.** 새로운 source of truth 가 아니고, 새로운 게이트도 아니다. `readiness.mjs` 가 계산한 화면별 `readiness_mode`/`allowed_paths`/`forbidden_paths`/`blocking` 을 **한 세션이 집행할 봉투에 옮겨 담은 인덱스/핸드오프 보드**일 뿐이다.

세 가지 정체성으로 못박는다:

```txt
인덱스        ScreenSpec·readiness output·Open Decisions 를 복사하지 않고 링크한다.
봉투          한 세션의 작업 범위를 readiness_mode 천장 안으로 가둔다 (그 이상은 목표가 아님).
핸드오프 보드  blocker·다음 행동·검증 명령·리뷰 체크리스트를 다음 세션/사람이 이어받게 남긴다.
```

### Work Packet MUST (반드시)

(원칙 그대로 — 템플릿 `work-packet.template.md` 머리말 주석 L14-24 와 정합):

- **ScreenSpec 을 (복사하지 않고) 참조한다** — `## Must Read` 에서 링크만. 정본은 ScreenSpec/decision-log.
- **readiness output 을 (재계산하지 않고) 소비한다** — `## Readiness Snapshot` 은 `readiness.mjs` 출력을 옮기는 표일 뿐, 다시 유도하지 않는다.
- **`allowed_paths`·`forbidden_paths` 를 readiness output 에서 그대로 복사한다** — glob 을 손으로 넓히거나 줄이지 않는다.
- **blocking Open Decision · Unknown · missing fact 를 나열한다** — `## Blocking Items` 에 ID·유형·blocking_mode·owner.
- **이 세션이 할 수 있는 일을 정의한다** — `## Goal` + `## Expected Output`(모드 천장 안의 정답 산출물 형태).
- **하면 안 되는 일을 정의한다** — `## Out of Scope`(MUST NOT 목록과 정합).
- **validation 명령을 포함한다** — `## Commands`(`workflow:state`/`readiness`/`validate`) + `## Acceptance Criteria`.
- **review checklist 를 포함한다** — `## Review Checklist`(review-artifact 의 Checklist 가 이를 미러).

---

## 3. What Work Packet is not — Work Packet 이 아닌 것

봉투는 **게이트를 옮겨 담을 뿐 건드리지 않는다.** 다음은 전부 금지이며, 어기면 Work Packet 이 "두 번째 source of truth/게이트"가 되어 불변식 #1 을 깨뜨린다.

### Work Packet MUST NOT (절대 금지)

```txt
게이트 해제 계열 (사람-전용 불변식 — SKILL.md L47, roadmap L101)
  Open Decision resolve          금지. 나열만 하고 "닫지 말 것" 으로 둔다.
  Conflict close                 금지. conflict close 는 사람-전용.
  Unknown close                  금지. 사실 확인은 사람/입력 대기.
  candidate → confirmed 승격      금지. 승인 메타는 사람만 (검사 7).

발명 계열 (막히면 추측 금지 — SKILL.md L28·L47-49)
  API endpoint 발명               금지. confidence 는 candidate 유지, src/api/** 추측 작성 금지.
  copy 문구 발명                  금지. tbd 행은 "TBD" 그대로, 키 이름 주석만.
  design value 발명               금지. figma mapping 없이는 색/간격/레이아웃 수치 작성 금지.

대체 계열 (인덱스가 정본을 흡수하면 안 됨)
  generated file 편집             금지. _meta/*.yaml · component-catalog.md 는 GENERATED, hand-edit 금지.
  ScreenSpec 대체                 금지. 화면 의도의 정본은 ScreenSpec, packet 은 링크만.
  readiness.mjs 대체              금지. 모드 판정의 정본은 readiness, packet 은 소비만.
```

추가로 **무효화 조건의 구분**: `requested_mode` 가 `readiness_mode` 보다 높은 것은 무효 사유가 **아니다** — 천장은 항상 `readiness_mode` 이고 초과분은 거절+blocker 로 처리한다(template L22, 예: PROFILE-001). 봉투가 **무효 → 재발급**되는 경우는 오직 readiness_source 의 mode/facts 가 바뀔 때뿐이다(template L34, §6 lifecycle).

> **함정 — "나열"과 "처리"는 다르다.** Work Packet 은 blocker 를 *나열*한다. 그걸 *닫는* 것은 사람이다. blocking 항목이 진행을 막지 않더라도(예: COUPON-001 의 D-001 은 천장보다 상위 모드를 막음) "닫아도 된다"는 뜻이 절대 아니다 — 전부 open 유지(예제 packet L84-85).

---

## 4. Work Packet vs ScreenSpec vs readiness — 역할 분리

세 산출물은 **레이어가 다르다.** ScreenSpec = 화면이 *무엇인가*(의도의 정본). readiness output = 지금 *어디까지 만들 수 있나*(모드 판정의 정본). Work Packet = 이번 세션이 *그 안에서 무엇을 하나*(실행 봉투, 정본 아님).

| 항목 | **ScreenSpec** | **readiness output** | **Work Packet** |
|---|---|---|---|
| 역할 | 화면 의도·계약의 정본 (purpose/state/API/copy/decisions) | 화면별 모드 판정(`readiness_mode`/`allowed`/`forbidden`/`blocking`) | 그 판정을 한 세션 봉투로 포장 (인덱스/핸드오프) |
| 소유(정본) | **예 — source of truth** (화면 의도) | **예 — source of truth** (모드 판정, 불변식 #1) | **아니오 — 인덱스/캐시.** 충돌 시 ScreenSpec·readiness 가 이긴다 |
| 누가 만드나 | 사람 + LLM 저작 (confirmed 승격은 사람) | `readiness.mjs` 가 계산 (사람·LLM 손 안 댐) | LLM/사람이 readiness output 을 옮겨 작성 (재계산 금지) |
| 생성 주기 | 화면 단위, 장기 (라이프사이클 draft→…→verified) | 매 실행 (`workflow:readiness` 호출마다 재계산) | **세션 단위, 단기** (한 모드 집행 후 닫음 → 다음 모드 재발급) |
| 변경 트리거 | 새 입력·결정·스펙 보강 (reconcile-input) | docs/facts/Open Decision 변화 → 다음 호출에 자동 반영 | readiness_source 의 mode/facts 변화 → **무효 → 재발급** (스스로 갱신 안 함) |
| 게이트인가 | 일부 (status·authored·copy tbd 가 fact 로 readiness 에 입력) | **예 — 실제 게이트** | **아니오.** status 는 사람-facing 라벨일 뿐, 코드 강제 0 |

핵심 비대칭: ScreenSpec·readiness 는 **정본**이고 Work Packet 은 **그 둘의 파생 인덱스**다. Work Packet 표가 정본과 어긋나면 **언제나 정본·readiness 출력이 이긴다**(기존 초안 "Source Of Truth Rule" L120-133 계승). 그래서 packet 은 숫자/모드/glob 을 **옮길 뿐 유도하지 않는다**.

---

## 5. Work Packet / Run Report / Review Artifact separation — 왜 3개로 나누나

세 산출물은 **시제(tense)가 다르다.** 하나로 합치면 "계획·기록·판정"이 한 파일에서 서로를 덮어쓰며 정본성이 흐려진다.

```txt
Work Packet      미래/명령형   "이 세션은 무엇을 해야 하고 무엇을 하면 안 되나" (봉투·계획)
Run Report       과거/서술형   "실제로 무엇을 했고 diff·exit code 가 무엇이었나" (실행 기록)
Review Artifact  판정/평가형   "그게 게이트·천장·불변식을 지켰나 — approve/changes/blocked" (검증 판정)
```

**왜 합치지 않는가:**

1. **정본 오염 방지.** Packet 은 readiness output 의 *읽기 전용 봉투*다. 여기에 실행 결과(diff·exit code)나 채점 결과(verdict)를 적으면, 봉투가 "사후에 갱신되는 문서"가 되어 *기준 스냅샷* 역할을 잃는다. Packet 은 발급 시점에 동결돼야 무효 판정(§6)이 성립한다.

2. **누적 분리.** 한 packet 에 대해 실행은 여러 번(1차·재실행 멱등 확인) 일어나고, 리뷰도 여러 번(changes-requested → 재실행 → re-review) 일어날 수 있다. Run Report·Review Artifact 는 **타임스탬프된 이벤트**라 누적되지만, Packet 은 **한 봉투**다. 이벤트를 봉투에 욱여넣으면 봉투가 비대해진다(기존 초안 L63 "accumulate without bloating").

3. **작성 주체·voice 분리.** Packet 은 게이트를 판독하는 측, Run Report 는 실행하는 측, Review Artifact 는 채점하는 측이 쓴다. 특히 Review 는 **위반을 근거(파일·라인·diff)와 함께 기록**하고 verdict 를 내는 평가 voice 라(체크리스트 rubric voice), 봉투/기록과 섞이면 "self-grading" 이 되어 독립성이 깨진다.

세 파일은 `packet_id` 로 묶인다 — Run Report·Review Artifact 의 frontmatter 가 `packet_id` + `readiness_source` 를 공유하고, 본문은 서로를 **링크만** 한다(복사 금지). 예: Run Report `## Work Packet Reference` 가 packet 경로를, Review `## Reviewed Inputs` 가 packet+run-report+readiness_source 경로를 링크.

> **함정 — Review Gates 는 독립 축이 아니다.** `roadmap-current.md` L27·L86-87 가 못박듯, 리뷰는 새 축이 아니라 **Work Packet 안에서** 다룬다. 처음엔 Packet 의 `## Review Checklist` *행*으로 시작하고, Review Artifact 가 그 체크리스트를 그룹 롤업으로 미러해 채점한다. 전역 review-register 를 처음부터 만들지 않는다(리뷰 양이 커지면 그때 인덱스화 — §10·§12).

---

## 6. Lifecycle — 라이프사이클

Work Packet 의 status 는 **사람-facing 라벨일 뿐 readiness 게이트가 아니다**(template frontmatter `status`, 코드 강제 0). 전이는 다음과 같다:

```txt
draft ──(게이트 판독 완료·봉투 동결)──▶ active ──(implement-screen 실행)──▶ executed
   ▲                                                                          │
   │                                                                          ▼
 (readiness 무효 → 재발급)                                              reviewed ──(verdict)──▶ closed
                                                                              │
                                                            changes-requested │ (구현 교정 후 재실행)
                                                                              ▼
                                                                          active (재실행)
```

| 전이 | 주체 | 무엇이 일어나나 |
|---|---|---|
| → **draft** | 발급자(LLM/사람) | readiness output 을 옮겨 봉투 작성. allowed/forbidden/blocking 복사, Goal/Out-of-Scope 확정 |
| draft → **active** | 발급자 | 봉투 동결(기준 스냅샷 날짜·readiness_mode·ScreenSpec status 기록). 이 시점부터 packet 은 읽기전용 기준 |
| active → **executed** | 구현 세션(implement-screen) | Run Report 작성 — diff·exit code·blocker 기록. 게이트 천장 안에서 실행하거나, 막히면 거절+보고 |
| executed → **reviewed** | 리뷰어 | Review Artifact 작성 — 체크리스트 채점, verdict(approve/changes-requested/blocked) |
| reviewed → **closed** | 사람(또는 approve verdict) | 봉투 종료. 더 진행하려면 다음 모드 packet 재발급 |
| reviewed → **active** | 구현 세션 | changes-requested 의 Recommended Fixes(게이트 미접촉 범위)만 교정 후 재실행 |
| (any) → **무효/재발급** | 발급자 | **readiness_source 의 mode/facts 변화 감지 시** — 사람이 Open Decision resolve, 또는 fact 충족(catalog 생성·fake hook 추가) → readiness 재실행 → 새 천장으로 새 packet |

**readiness 무효화와의 연결 (핵심):** Work Packet 은 **불변 입력+게이트에 대한 한 시점 스냅샷**이다(template `## Validity` L33-38). 봉투를 스스로 갱신하지 않는다 — readiness 가 바뀌면 옛 봉투는 *무효*가 되고, 새 readiness output 으로 **새 봉투를 발급**한다. 이는 게이트 해제가 사람-전용이라는 불변식과 직결된다: PROFILE-001 의 D-301 을 사람이 resolve → readiness 천장이 `docs-only` 에서 오름 → 옛 `WP-PROFILE-001-docs-only` 무효 → `route-skeleton` packet 재발급(예제 run-report Follow-up L107). 봉투는 절대 자기 천장을 올리지 못한다.

> **함정 — `executed` ≠ `구현 성공`.** 거절도 정상 종료다. PROFILE-001 은 docs-only cap 이라 "구현하지 않고 blocker 보고"가 정답이고, 그 상태로 executed → reviewed(verdict=blocked)로 간다. blocked 는 *구현 결함*이 아니라 *사람-전용 결정 대기*다(예제 review L30·L55).

---

## 7. Directory options — 디렉토리 옵션

Work Packet/Run Report/Review Artifact 를 어디에 둘지 3안. **현재 예제는 옵션 A(`temp/examples/work-packet-dry-run/`)를 쓴다** — 킷 외부 dry-run 이라 어느 옵션도 아직 동결하지 않았다.

```txt
temp/examples/work-packet-dry-run/
  packets/      WP-COUPON-001-screen-skeleton-001.md · WP-PROFILE-001-docs-only-001.md
  run-reports/  RR-COUPON-001-screen-skeleton-001.md · RR-PROFILE-001-docs-only-001.md
  reviews/      RV-COUPON-001-screen-skeleton-001.md · RV-PROFILE-001-docs-only-001.md
```

| 옵션 | 위치 | 장점 | 단점 |
|---|---|---|---|
| **A. temp/examples (현재)** | `temp/examples/work-packet-dry-run/{packets,run-reports,reviews}/` | 킷 외부 dry-run — 코드/예제 트리 무영향, 자유 실험. 산출물-타입별 평면 폴더라 누적 단순 | 도메인·화면 attribution 없음(파일명 슬러그로만). 실제 프로젝트에 안 들어감 |
| **B. 킷 내부 work-packets/** | `frontend-workflow-kit/work-packets/{packets,…}/` 또는 `docs/frontend-workflow/work-packets/` | 킷의 일급 산출물로 승격. 다른 산출물(`_meta/`·도메인)과 한 트리 | **새 축처럼 보일 위험** — roadmap 이 "흡수형, 새 축 아님"이라 명시(L86). 동결 전엔 부적절 |
| **C. 도메인 스코프** | `docs/frontend-workflow/domains/{domain}/work-packets/` + `reviews/{packet_id}/` | 화면→도메인 attribution 자연스러움. 기존 초안 L67-82 의 모양 | 멀티-화면 packet 이 도메인 경계를 못 넘음(§12). 디렉토리 분산 |

**트레이드오프 요약:** 지금은 **A 유지**(dry-run 단계, 킷 미포함). 그래야 `roadmap-current.md` 의 "킷 외부 설계 제안" 위치(L87)와 맞고, 동결을 강요하지 않는다. 킷에 graduate 할 때 B vs C 를 **명시적으로 결정**한다(§12 open question). 산출물-타입별(packets/run-reports/reviews) vs 화면별 폴더링도 그때 함께 고정한다.

---

## 8. Template summary — 템플릿 요약

세 템플릿은 이미 `frontend-workflow-kit/templates/work-packet/` 에 작성돼 있다(이 제안의 부속물). 각 한 단락 + 섹션 목록:

**`work-packet.template.md` — 실행 봉투.** readiness output 을 세션 봉투로 옮긴다. frontmatter: `packet_id`·`packet_type`·`status`·`target_screen`·`domain`·`requested_mode`·`readiness_mode`·`readiness_source`·`created_at`·`owner`. 머리말 주석이 "새 SoT/게이트 아님 + 복사 금지 + 재계산 금지 + requested>readiness 면 readiness_mode 로 scope(거절)"를 못박는다.
섹션: `## Goal` · `## Validity` · `## Must Read` · `## Readiness Snapshot` · `## Allowed Paths` · `## Forbidden Paths` · `## Blocking Items` · `## Expected Output` · `## Out of Scope` · `## Commands` · `## Acceptance Criteria` · `## Review Checklist`.

**`run-report.template.md` — 실행 기록.** 한 packet 을 fixture 복사본에서 실행한 결과를 기록한다. frontmatter: `title`·`status`·`kind`(=run-report)·`run_id`·`packet_id`·`fixture`(+`(복사본)`)·`readiness_source`·`date`. 표 헤더·`✅` 표기·빈 diff 관례는 `temp/runs/implement-screen-001/implement-run-report.md` 를 따른다.
섹션: 리드+메타 → `## Summary`(종합 판정 표) → `## Work Packet Reference` → `## Readiness Used`(실행 명령 verbatim) → `## Files Changed` → `## Commands Run` → `## Result` → `## Gate Compliance`(하드룰 4행) → `## Diff Summary`(ADDED/MODIFIED/REMOVED) → `## Blockers Reported`(인용블록) → `## Idempotency` → `## Follow-up`.

**`review-artifact.template.md` — 검증 판정.** 한 packet+run-report 가 게이트·천장·불변식을 지켰는지 채점한다. frontmatter: `title`·`status`·`kind`(=review-artifact)·`packet_id`·`run_id`·`verdict`(approve/changes-requested/blocked)·`readiness_source`·`reviewer`·`date`. Checklist 는 Work Packet 의 `## Review Checklist` 를 그룹 롤업으로 미러 (10 checks → 7행).
섹션: `## Verdict` → `## Reviewed Inputs` → `## Checklist`(A/B1/B2/B3/B4/E/F 행) → `## Violations` → `## Human-only Decisions Needed` → `## Recommended Fixes` → `## Do Not Auto-Fix`.

> **주 — rubric.** 독립 rubric 은 `temp/evaluations/work-packet-rubric.md` 에 작성돼 있다 — `| Check | Pass Criteria | Failure Signal | Notes |` 표 + 필수 10 checks, hard`[H]`/soft`[S]` 2층 채점(`implement-screen-dry-run-checklist.md` 의 advisory-vs-hard 구분 계열). Work Packet 의 `## Review Checklist` 와 review-artifact 의 `## Checklist` 는 이 rubric 에 매핑된다. 예제 run-report·review 는 이 rubric 을 채점 기준으로 참조하고, Review Checklist 의 A~F 행은 rubric 의 10 checks 를 그룹 롤업한 것이다(review-artifact.template.md 주석에 행→check 매핑). rubric 을 어느 디렉토리에 둘지·skill 채점 하니스로 승격할지는 §12 open question.

---

## 9. Example scenarios — 예제 시나리오

두 시나리오 모두 `multi-screen-dry-run` 골든 예제의 readiness 실측(`expected-readiness.md` §1, 2026-06-13 검증)을 readiness_source 로 쓴다. **진행(COUPON-001)** 과 **거절(PROFILE-001)** 을 대비한다.

### 9.1 진행 — COUPON-001 (screen-skeleton)

파일: `packets/WP-COUPON-001-screen-skeleton-001.md` · `run-reports/RR-COUPON-001-screen-skeleton-001.md` · `reviews/RV-COUPON-001-screen-skeleton-001.md`.

`requested_mode == readiness_mode == screen-skeleton` 이라 정상 진행이다. 봉투는 readiness output 을 그대로 옮긴다:
- **Readiness Snapshot** = `screen-skeleton` / next `rough-fixture-ui` / 천장 근거 "D-001(final)·D-003(api-integrated) cap 은 더 높음 → fact 천장 screen-skeleton 이 결정"(packet L49 — `expected-readiness.md` COUPON-001 행 문구 그대로).
- **Allowed** = `src/features/coupons/screens/**` 단 하나. **Forbidden** = 명시 forbidden(`src/api/**`·`openapi.yaml` — 전 모드 공유 인프라) + allowed 밖(`hooks/**`·`components/**`·`src/app/**` — 상위 모드에서만 열림)(packet L55-70). 이 forbidden 확장 논리는 `diff-based-forbidden-paths-backstop.md` 와 정합(단일 모드 allowed 의 여집합).
- **Blocking Items** = D-001(final-fixture-ui, PM)·D-003(api-integrated-ui, BE)·U-001(BE) + missing-fact 2종(`component_catalog_generated`·`fake_hook_exists` = false → rough-fixture-ui 막음). 전부 "닫지 말 것"(packet L76-85).

Run Report: shell 1개(`CouponListScreen.tsx`)만 ADDED, `coupon.list.title`("쿠폰") confirmed 카피만, `coupon.list.empty`(tbd)는 주석만 — 문구 미발명(RR L58·L86-92). 천장 초과 신호 grep(useState/useEffect/fetch/axios/FlatList) 전부 0건. Blockers Reported 가 readiness 의 blocking/next_actions 를 인용블록으로 그대로 전달(RR L96-98). 2차 실행 완전 빈 diff·byte 동일(RR L101-103).

Review: **verdict=approve** — 7개 체크(A/B1/B2/B3/B4/E/F) 전부 ✅, Violations 없음(RV L27·L41-52). D-001/D-003/U-001 은 "Human-only Decisions Needed" 에 나열하되 닫지 않음 — approve 의 장애물이 아니지만 상위 모드 전 사람이 닫아야 함(RV L57-64). B3 는 advisory grep(0건) + 파일 열람 교차 확인(RV L44).

### 9.2 거절 — PROFILE-001 (docs-only)

파일: `packets/WP-PROFILE-001-docs-only-001.md` · `run-reports/RR-PROFILE-001-docs-only-001.md` · `reviews/RV-PROFILE-001-docs-only-001.md`.

`requested_mode = screen-skeleton` 이지만 `readiness_mode = docs-only` 다 — **천장이 요청보다 낮은** 케이스. 정답 동작은 "구현하지 않고 D-301 blocker 를 보고하고 멈춤"(packet Goal L29, SKILL.md L26 거절).
- **Readiness Snapshot** = `docs-only` / next `route-skeleton` / 천장 근거 "D-301(blocking route-skeleton) → decision_cap = docs-only"(packet L49). **Allowed** = `docs/frontend-workflow/**`. **Forbidden** = `src/**` 전체(docs-only 천장 — src 전부가 상위 모드에서만 열림)(packet L55-66).
- **Blocking Items** = D-301(route-skeleton, PM — 편집 범위/필드 미확정)·U-301(비밀번호 변경 위치)(packet L72-75).

Run Report: **변경 파일 없음 — 빈 diff 가 정답**(RR L58·L84-92). requested_mode(screen-skeleton)는 추적 정보일 뿐, 실행은 항상 readiness_mode(docs-only)로 scope(RR L70). Blockers Reported = "D-301 이 열려 readiness 가 docs-only 로 cap, route-skeleton 미만이라 UI 코드 불가, next_action: 사람이 D-301 resolve"(RR L97-98). 거절은 불변 입력+게이트에 대한 올바른 산출물이라 재유도해도 동일(RR L102).

Review: **verdict=blocked** — 7개 체크 전부 ✅(거절이 정답이라 위반 0), 그러나 진행 불가의 원인이 **사람-전용 결정 D-301**이라 approve 가 아닌 blocked(RV L30·L55). "changes-requested 아님 — 구현이 고칠 위반이 없다"를 명시(RV L30·L67). Do Not Auto-Fix: 편집 필드/범위는 D-301 미확정이라 발명 금지(RV L71).

**두 시나리오의 대비:** 같은 게이트(readiness)·같은 봉투 구조인데, 천장이 요청과 같으면(COUPON-001) approve, 천장이 사람-전용 결정에 막혀 낮으면(PROFILE-001) blocked. 봉투는 어느 쪽에서도 **게이트를 옮길 뿐 건드리지 않고**, 거절을 "정상 종료"로 기록한다.

---

## 10. Future skill candidates — 향후 스킬 후보

다음 스킬들은 **제안일 뿐, 이 작업에서 구현하지 않는다.** Work Packet 라이프사이클(§6)의 각 전이를 자동화하는 후보로만 나열한다. 전부 readiness 를 **소비**만 하고 판정을 재생성하지 않는다(불변식 #1).

```txt
create-work-packet      readiness output 을 읽어 draft Work Packet 발급 (allowed/forbidden/blocking 복사).
                        — 제안일 뿐, 이 작업에서 구현 안 함.
implement-from-packet   active packet 을 받아 천장 안에서 실행 + Run Report 작성.
                        기존 implement-screen 스킬의 packet-aware 변형. — 제안일 뿐, 구현 안 함.
review-work-packet      packet+run-report 를 채점해 Review Artifact 발급 (verdict).
                        — 제안일 뿐, 구현 안 함.
close-work-packet       approve verdict 확인 후 packet 종료 / readiness 변화 감지 시 무효·재발급 안내.
                        — 제안일 뿐, 구현 안 함.
```

이번 작업의 산출물은 **템플릿 3종 + 예제 셋 + 이 설계 문서**뿐이다. 스킬은 `write-a-skill` 방법론으로 별도 세션에서, 그것도 **명시적으로 하나를 고를 때만** 착수한다(`roadmap-current.md` L89 "하나를 명시적으로 고를 때만").

---

## 11. What not to implement yet — 지금 구현하지 않는 것

scope 자기제한을 명시한다(`mvp-b-validation-candidates.md`·`diff-based-forbidden-paths-backstop.md` 와 동일 voice):

```txt
코드 없음          scripts/ 에 work-packet 관련 .mjs 추가 안 함.
scripts 없음       create/implement/review/close 자동화 스크립트 안 만듦.
package.json 없음  npm run workflow:work-packet 같은 스크립트 항목 안 추가.
CI 없음            .github/workflows 에 packet 검사 step 안 추가. validate 9종 그대로.
새 skill 없음      §10 의 4개 스킬은 제안일 뿐 — SKILL.md 작성 안 함.
policy 변경 없음   implementation-mode-policy.yaml 7 모드·requires 그대로. packet 은 게이트 아님.
새 게이트 없음     Work Packet/Review status 를 readiness 게이트로 만들지 않음 (roadmap L102 금지).
rubric 자동화 없음 work-packet-rubric.md 는 작성됨(md 채점표) — 이를 소비하는 스크립트·CI step 은 안 만듦.
reconcile 배선 없음 reconcile-input 의 frozen Created Items(C-/D-/U-/G-/INV-/VER-)에
                   WP-/RV- 추가 안 함 — frozen 계약 변경이라 별도 결정 (§12, 기존 초안 L340·L443).
```

지금 하는 것은 **문서-first**다: 봉투의 경계·규칙·예시를 고정해 후속 세션이 단독 착수할 수 있게 한다. parser/CI 강제는 명시적으로 선택될 때까지 미룬다(기존 초안 "Design Rules To Preserve" L419-426 계승).

---

## 12. Open Questions — 미해소 질문

graduate 전에 명시적으로 결정해야 할 항목들:

```txt
1. ID 스킴
   현재 예제: packet = WP-{SCREEN_ID}-{mode}-{NNN}, run-report = RR-..., review = RV-....
   기존 초안(temp/work-packet-review-artifacts-proposal.md L229-232)은 packet=WP-{domain}-{slug},
   review=REV-{YYYYMMDD}-... 를 제안 — 둘이 충돌(screen-id+mode vs domain+slug, RV vs REV).
   화면-단위(현재 예제) vs 작업-단위(기존 초안) 중 무엇을 봉투 단위로 할지, 그리고 RV/REV 를
   INV-/VER- event-ID 패밀리와 정합시킬지 결정 필요.

2. packet 위치 (§7)
   temp/examples(현재, dry-run) → 킷 graduate 시 B(킷 내부 work-packets/) vs
   C(도메인 스코프 domains/{domain}/work-packets/) 중 택1. + 산출물-타입별 vs 화면별 폴더링.

3. readiness 무효화 감지
   "readiness_source 의 mode/facts 가 바뀌면 packet 무효"(§6)를 어떻게 감지하나?
   (a) 수동(발급자가 readiness 재실행 후 육안 비교) — 현재 가정.
   (b) packet 에 readiness output 해시를 박아 자동 stale 감지 — close-work-packet 후보의 일.
   stale packet 을 validate 가 잡을지, 별도 스크립트가 잡을지도 미결.

4. diff-based forbidden backstop 과의 관계
   diff-based-forbidden-paths-backstop.md 는 src/api/**·openapi.yaml 만 guarded surface 로 잡고
   hooks/**·components/**·src/app/** 경계는 forward gate+diff 검사에 맡긴다(MVP 한계).
   Work Packet 의 Forbidden Paths 는 그보다 넓은 "allowed 여집합 전부"를 나열한다(예제 packet L65-69).
   → packet 의 Acceptance Criteria(diff ⊆ allowed)가 backstop 의 좁은 guarded surface 와
     어떻게 역할 분담하나? (packet = 세션 내 자기검증, backstop = CI 사후 그물 — 중복 아닌 보완으로 보임)
   둘 다 "경계는 diff 로 본다"는 같은 원칙(validate.mjs:12)이라 정합하지만, 명시적 경계 선언 필요.

5. multi-screen packet
   현재 예제는 1 packet = 1 화면. 한 작업이 여러 화면을 건드리면?
   기존 초안 L316 "screen-by-screen rollup, 새 결합 readiness 계산 금지" 가 방향.
   → multi-screen packet 은 화면별 readiness 를 링크/롤업만 하고, 결합 천장을 새로 계산하지 않는다.
   단일-화면 packet N개 vs 멀티-화면 packet 1개 중 무엇을 기본으로 할지, 도메인 경계(§7 옵션 C)와
   어떻게 맞물리는지 미결.

6. rubric 위치·승격 (§8 주)
   work-packet-rubric.md 는 독립 파일로 작성됨(필수 10 checks, [H]/[S] 2층 채점); 예제의 A~F 행은
   그 10 checks 의 그룹 롤업으로 매핑돼 있다. 남은 질문: rubric 을 어느 디렉토리에 둘지(temp/evaluations
   vs 킷 내부) + graduate 시 implement-screen-dry-run-checklist 식 입력별 PASS/PARTIAL/FAIL 집계 하니스로 승격할지.

7. 어떤 review status 가 readiness 를 내릴까 (장기)
   기존 초안 L433 의 질문 계승. 현재 답: 아무것도 안 내린다(게이트는 Open Decision+fact 뿐, roadmap L102).
   장기에 verdict=blocked 를 readiness 신호로 승격할지는 별도 Open Decision — 지금은 명시적 비-목표.
```

---

> **요약:** Work Packet 은 `readiness.mjs` 가 이미 계산한 게이트를 **세션 단위 봉투**로 옮겨 담는 인덱스/핸드오프 보드다. 새 source of truth 도 새 게이트도 아니다(불변식 #1 보존). Run Report(실행 기록)·Review Artifact(검증 판정)와 시제로 분리하되 `packet_id` 로 묶고, 전부 ScreenSpec·readiness output 을 **복사 없이 링크·소비**만 한다. 이 세션의 산출물은 템플릿 3종 + dry-run 예제 셋 + 이 문서뿐 — 코드·스크립트·CI·새 스킬·policy 변경은 없다.
