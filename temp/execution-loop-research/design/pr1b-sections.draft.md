> **DRAFT — 적용 금지. MVP-C 안착 후 사람이 검토/적용한다.** 이 문서는 temp/ 안의 설계 초안이며, frontend-workflow-kit/ 의 실제 파일을 수정하지 않는다.

# PR1b 섹션 초안 — Ambiguity/Review/Report (적용 금지, 텍스트만)

이 문서는 **PR1b** 가 기존 3개 템플릿에 추가/교체할 **섹션 텍스트**를 코드펜스로 정확히 제시한다. 적용·구현이 아니라 "어디에 / 무엇을" 의 명세다. 실제 kit 파일은 한 줄도 수정하지 않는다.

## PR1a 의존 (머리말 — 반드시 먼저 읽기)

- **PR1b 는 PR1a 에 의존한다.** PR1a(green≠done + 봉투 안전선)가 work-packet 의 **헤더 디스클레이머 · Validity · Expected Output · Must Read** 와 README·`implement-screen/SKILL` 를 이미 넣은 상태를 전제한다(SYNTHESIS §9.5). PR1b 는 그 위에 **Ambiguity / Review / Report** 3표면만 얹는다.
- **소유권 경계(중복 금지)**:
  - work-packet 의 헤더 디스클레이머·Validity·Expected Output·Must Read = **PR1a 소유** → PR1b 는 건드리지 않는다.
  - 아래 §A 의 `## Ambiguity Review Required` 섹션 + Review Checklist 의 **"Pre-Implementation Review" 한 행** = **PR1b 소유**. PR1a 가 같은 행을 넣지 않도록 분담한다(이 행은 여기서만 추가).
  - **재배치 근거(SYNTHESIS 대조 시 혼선 제거)**: SYNTHESIS §5/§9.5 는 "Pre-Implementation Review" 행을 06/PR1a 그룹에 암묵 묶었으나, 중복 회피를 위해 **PR1b 단독으로 재배치**한다(pr1a-docs.draft.md line 20·pr-plan.draft.md lines 48·163 과 합의 — 세 초안 동일 분담).
- **warning-only 불변**: 이 PR 이 넣는 것은 전부 **문서 텍스트**다. 어떤 섹션도 `validate.mjs`/`readiness.mjs` exit code·required check·merge gate 에 배선하지 않는다(SYNTHESIS §9.2/§9.3/§9.6). `'verdict'`/`'blocked'` 는 active 용어로 쓰지 않는다(마이그레이션 주석 "구 verdict→review_summary" 만 허용).
- **템플릿 과적재 금지**(SYNTHESIS §9.5): triage 결정트리·신호표·Blocking Mode 매핑 같은 **전체 rubric 은 템플릿에 넣지 않는다.** 템플릿엔 최소 표 + 별도 doc 링크만. 의미 리뷰 S1~S8 루브릭(03)도 이 PR 범위 밖 — "후속/별도 doc" 로만 짧게 명시한다.
- **대상 3파일**(전부 markdown, 읽기만 했고 수정은 PR 시 사람이):
  - `frontend-workflow-kit/templates/work-packet/work-packet.template.md`
  - `frontend-workflow-kit/templates/work-packet/review-artifact.template.md`
  - `frontend-workflow-kit/templates/work-packet/run-report.template.md`

---

## A. work-packet `## Ambiguity Review Required` (최소 표만)

### A-0. 삽입 위치 (결정 필요 — 닫지 않음)

현재 `work-packet.template.md` 의 섹션 순서는 다음과 같다(읽은 기준):

```
# Work Packet: {SCREEN_ID} {mode}
## Goal
## Validity
## Must Read
## Readiness Snapshot
## Allowed Paths
## Forbidden Paths
## Blocking Items        ← (A) 이 직후에 삽입 = PR1b 기본안
## Expected Output
## Out of Scope
## Commands
## Acceptance Criteria
## Review Checklist       ← (B) 여기에 "Pre-Implementation Review" 한 행 추가
```

- **PR1b 기본안(보수적)**: `## Ambiguity Review Required` 를 **`## Blocking Items` 직후**에 삽입한다. 이유: Ambiguity Review 의 입력원이 Blocking Items(Open Decision/Unknown/missing-fact)이므로 물리적으로 인접시키면 "Blocking Items → Ambiguity Review" 흐름이 자연스럽다. 봉투 구조 변경(상단 이동)을 최소화한다.
- **⚠ 결정 필요(SYNTHESIS §8 — 닫지 말 것)**: report/01 §4-1 은 같은 섹션을 **`## Goal` 앞**(packet 의 첫 실질 섹션 — "구현 가능?"보다 "놓친 애매함?"을 먼저)에 두기를 권고한다. 어느 위치가 정본인지는 **사람이 PR 시 결정**한다. 두 후보를 여기 병기만 하고 닫지 않는다.
  - before-Goal 안의 장점: "첫 질문 = 애매함" 철학을 구조로 박음.
  - after-Blocking-Items 안의 장점: 입력원 인접 + 기존 봉투 순서 보존 + PR1a/PR1b 변경 충돌 최소.

### A-1. 삽입할 섹션 텍스트 (work-packet 본문 — `## Blocking Items` 직후)

````md
## Ambiguity Review Required
<!--
  workflow:packet 의 산출물 — 코딩 전에 먼저 채운다. (PR2 workflow:packet 이 작성)
  나쁜 첫 질문: "구현 가능?"  /  좋은 첫 질문: "애매한 거 놓친 거 없나?"
  이 섹션은 warning-only 텍스트다 — 코드 게이트가 아니다. 게이트는 readiness(Open Decision)+validate 뿐.
  여기서 readiness 를 재계산하지 않는다. 표의 입력원은 위 ## Blocking Items 다.
  불변식: 이 단계(workflow:packet/run/review)의 LLM 은 후보를 "제안"만 한다. Unknown/Decision/Conflict 를 닫거나 candidate→confirmed 로
          올리거나 ScreenSpec 결정을 resolve 하지 않는다 — 승격·resolve·close 는 전부 사람.
          (단, ScreenSpec authoring/reconcile 단계의 LLM 은 기존 계약대로 open 행 추가·resolved→open 재오픈 가능 — global/llm-rules.md. "직접 안 쓴다"는 이 packet/run/review 단계 한정.)
  auto-stop: 아래 Safe To Proceed? 가 어떤 모드에서 'no' 면, 그 모드 이상으로 코딩하지 않고
          멈춰서 그 후보를 사람에게 올린다(=runner 의 HALT_AMBIGUITY 입력). 사람이 ScreenSpec 반영
          → readiness 재실행 후 packet 재발급.
  빈 표는 "없음 — <사유>" 한 줄로 명시(형식주의 회피: 억지로 채우지 않는다).
  ⚠ 이 표는 "최소 표"다. 전체 triage(결정트리·신호표·Blocking Mode 매핑)는 템플릿에 넣지 않는다 → 아래 링크.
-->

| 모드 | Safe To Proceed? (yes/no) | 사유 | Blocking 후보 (D-cand / U-cand) |
|---|---|---|---|
| docs-only | yes | 문서만 — 모든 애매함은 여기서 Unknown/Decision 으로 표면화하면 됨 | — |
| route-skeleton | yes | 라우트 엔트리뿐 — 화면 내부 결정과 무관 (nav-map 충돌 시에만 no) | — |
| screen-skeleton | yes | 화면 shell — 화면 존재·이동이 결정에 안 묶임 | — |
| rough-fixture-ui | no | (예) D-cand-001 미승격 — fixture UI 형태가 갈리므로 여기서 멈춤 | D-cand-001 |
| {readiness_mode 까지 행 추가} | {yes/no} | {근거 한 줄} | {D-cand / U-cand / —} |

> **Safe To Proceed?** 는 readiness 재계산이 아니다 — 천장은 항상 `{readiness_mode}` 이고, 이 표는 그 아래에서 **더 보수적으로만** 멈출 수 있다(게이트를 *올리지* 못함). 모드를 아래에서 위로 훑어 'no' 가 처음 나오는 모드 **직전**에서 멈춘다. `readiness_mode` 보다 위 모드는 readiness 가 이미 cap 했으므로 평가하지 않는다.
> **Blocking 후보**(D-cand/U-cand)는 *제안*일 뿐 — 닫거나 ScreenSpec 에 확정하는 것은 사람. (별도 개념 아님: `Safe To Proceed?=no` 를 유발하는 미해결 후보일 뿐.)

> 전체 triage 결정트리·신호표·Blocking Mode 매핑은 → `docs/workflows/ambiguity-triage.md` (초안: `temp/execution-loop-research/design/ambiguity-triage.draft.md`)
> New Unknowns / New Open Decision Candidates / Possibly Blocking 의 **상세 4블록 스키마**도 위 doc 으로 분리한다(템플릿엔 위 최소 표만).
````

> 위 표는 report/01 §4-1 의 4블록(New Unknowns · New Open Decision Candidates · Possibly Blocking · Safe To Proceed?) 중 **Safe To Proceed? 한 표만** 템플릿에 남긴 것이다(과적재 금지). 나머지 3블록 + 결정트리·신호표·매핑은 `ambiguity-triage` doc 으로 빠진다(별도 초안 산출물 `ambiguity-triage.draft.md`).

### A-2. Review Checklist 에 추가할 "Pre-Implementation Review" 한 행 (PR1b 소유)

현재 `## Review Checklist` 는 6행이다(게이트 판독 / 경로 준수 / 천장 미초과 / 미확정 미발명 / 결정 미닫힘 / 보고·멱등). 그 목록 **맨 위 또는 첫 행 위치**에 다음 한 행을 추가한다(SYNTHESIS §3 어휘 `Pre-Implementation Review` = 집행 직전 체크 항목):

```md
- [ ] **Pre-Implementation Review** — Ambiguity Review Required 의 `Safe To Proceed?` 가 `{readiness_mode}` 까지 모두 검토됐고(빈 표면은 "없음—사유"로 명시), Validity 전제(readiness_source mode/facts)가 무변경이며, Blocking 후보(D-cand/U-cand)가 모드별로 분류돼 있음 — 미해결 후보는 그대로 열림(이 세션이 닫지 않음).
```

> 이 행은 **PR1b 만** 추가한다(PR1a 와 중복 금지). 의미: "Validity 무변경 + Blocking 분류 완료"를 집행 직전에 한 번 확인. warning-only — 체크 미완이 exit 1 을 만들지 않는다.

### A-3. Blocking Items ↔ Ambiguity 입력원 연결 주석 (1줄)

`## Blocking Items` 섹션의 기존 안내 주석 끝에 다음 1줄을 덧댄다(연결 명시 — 새 표 추가 아님):

```md
<!-- 이 표(Open Decision/Unknown/missing-fact)는 아래 ## Ambiguity Review Required 의 입력원이다 — Safe To Proceed? 의 Blocking 후보(D-cand/U-cand)는 여기 항목에서 끌어온다. -->
```

> **⚠ 결정 필요(SYNTHESIS §8-1, 닫지 않음)**: Ambiguity 입력 계약 포맷(별도 파일 vs packet 섹션)은 사람 결정이다(01↔02, Phase 2 선결). PR1b 는 보수적으로 **packet 섹션**(위 §A-1 표) 형태만 둔다 — 파일 계약을 확정하지 않는다.

---

## B. review-artifact advisory 스키마 (§9.3)

> 대상: `frontend-workflow-kit/templates/work-packet/review-artifact.template.md`. 이 파일의 **frontmatter `verdict:`** 와 **`## Verdict` 섹션**을 advisory 어휘로 교체한다. 핵심 불변식(SYNTHESIS §9.3): **이 repo 는 review 결과를 required approval / merge check 에 배선하지 않는다** — 사내 GitLab 의 **MR approval rules · merge checks · protected branches** (GitHub 의 branch protection·required checks 대응) 어디에도 review 산출물을 연결하지 않는다. 그래야 review 가 evidence 로만 남는다.

### B-1. frontmatter 교체

**현재 (인용):**

```yaml
---
title: "{packet_id} 리뷰"
status: "done"
kind: "review-artifact"
packet_id: "WP-{SCREEN_ID}-{mode}-{NNN}"
run_id: "{run_id}"
verdict: "{approve|changes-requested|blocked}"
readiness_source: "{path-to-readiness-output-or-run-report}"
reviewer: "{agent-or-person}"
date: "{YYYY-MM-DD}"
---
```

**교체안 (PR1b):**

```yaml
---
title: "{packet_id} 리뷰"
status: "done"
kind: "review-artifact"
packet_id: "WP-{SCREEN_ID}-{mode}-{NNN}"
run_id: "{run_id}"
# 구 verdict→review_summary (판정 어감 제거 — advisory). 'verdict'/'blocked' 는 active 용어로 쓰지 않는다.
review_status: advisory          # 항상 advisory. 이 리뷰는 머지를 자동 차단하지 않는다.
review_summary: "{ok | changes-suggested | needs-human-decision}"   # 전체 1줄(중립)
human_action_required: "{true|false}"
readiness_source: "{path-to-readiness-output-or-run-report}"
reviewer: "{agent-or-person}"
date: "{YYYY-MM-DD}"
---
```

> `verdict:` 필드는 **제거**한다(대체이지 병기 아님). 마이그레이션 흔적은 위 주석 한 줄("구 verdict→review_summary")로만 남긴다.

### B-2. `## Verdict` → `## Review Summary` (advisory) 로 개명·재작성

> SYNTHESIS §9.3 은 frontmatter 의 `verdict:` 필드 대체만 명시하나, 여기서는 섹션 헤딩의 active term "Verdict" 제거(어휘 §3 정합) 차원에서 **헤딩도 개명**한다 — 보고서 03 §4.3-(1)의 헤딩-유지(주석만 재작성)안보다 보수적이다. 추적성은 아래 §B-4 매핑표(`## Verdict` → `## Review Summary`)가 확보한다.

**현재 (인용):**

```md
## Verdict
<!-- 셋 중 하나. changes-requested/blocked 면 Violations 또는 Human-only Decisions 에 근거가 있어야 한다.
       approve            = 게이트·천장·불변식 모두 통과.
       changes-requested  = 구현이 고칠 수 있는 위반(경로/과구현/발명) 존재 → Recommended Fixes 로.
       blocked            = 사람-전용 결정/Conflict 때문에 진행 불가 → Human-only Decisions Needed 로. -->
**{approve | changes-requested | blocked}** — {한 줄 근거.}
```

**교체안 (PR1b):**

```md
## Review Summary (advisory)
<!-- review_summary 는 리뷰 evidence 라벨이다 — 머지를 자동으로 막거나 허가하지 않는다.
     게이트는 readiness(Open Decision) + validate(구조) 뿐. 이 요약은 그 위의 advisory 신호다.
     이 repo 는 review 결과를 required approval / merge check 에 배선하지 않는다
       (GitLab: MR approval rules · merge checks · protected branches 에 연결 금지).
       ok                  = 경계·천장·불변식 + 아래 findings 에서 막을 사유를 못 찾음(=advisory 통과).
       changes-suggested   = 고칠 수 있는 위반/의미 갭 존재 → findings 의 route=recommended-fix.
                             (자동 머지차단 아님 — 머지 결정은 사람.)
       needs-human-decision = 사람-전용 결정/Conflict 때문에 "리뷰어가 더 진행 못 함" → Human-only Decisions Needed.
                             ⚠ needs-human-decision(구 'blocked') = "리뷰어가 더 못 나아감"이지 "결정을 닫았다"가 아니다.
                             ⚠ 이 값 자체가 머지를 자동 차단하지 않는다 — 차단 권한은 Open Decision(readiness cap)+사람뿐. -->
**{ok | changes-suggested | needs-human-decision}** — {한 줄 근거.} (advisory evidence — 머지 게이트 아님)
```

### B-3. findings 블록 (advisory 스키마 §9.3) — 새 표

`## Review Summary` 바로 아래에 findings 블록을 둔다(SYNTHESIS §9.3 verbatim 스키마). 기존 `Violations` / `Human-only Decisions Needed` / `Recommended Fixes` / `Do Not Auto-Fix` 섹션을 이 advisory 어휘로 **매핑**한다(아래 §B-4 매핑표).

````md
## Findings (advisory — 근거 필수)
<!-- 각 finding 은 severity + ref(file/line/diff 근거 필수, 추측 금지) + route 를 갖는다.
     severity 의 blocker-candidate 는 '후보'일 뿐 — 진짜 blocker 가 아니다.
     진짜 blocker 는 Open Decision(readiness cap) + 사람 승인으로만 성립한다.
     route 가 human-only-decision 이면 아래 Human-only Decisions Needed 표로도 옮긴다(리뷰어는 닫지 않음). -->
```yaml
findings:
  - severity: "{info | warning | major | blocker-candidate}"   # 'blocker' 아님 — 후보일 뿐
    ref: { file: "{path}", line: "{n}", diff: "{인용/요지}" }   # 근거 필수
    route: "{recommended-fix | human-only-decision | do-not-auto-fix}"
    note: "{한 줄 설명}"
  # findings 없으면: 빈 목록 [] 로 두고 review_summary: ok.
```
````

> `blocker-candidate ≠ blocker`. severity 가 blocker-candidate 라도 그 자체로는 아무것도 막지 못한다 — 사람이 Open Decision 으로 승격해 readiness cap 이 걸릴 때만 실제 차단이 된다.

### B-4. 기존 섹션 → advisory 어휘 매핑 (어디를 무엇으로)

기존 `## Violations` / `## Human-only Decisions Needed` / `## Recommended Fixes` / `## Do Not Auto-Fix` 4섹션은 **삭제하지 않고** findings 의 `route`/`severity` 와 정합하도록 주석으로 연결한다(또는 findings 로 흡수). 매핑:

| 기존 섹션 (review-artifact 현재) | advisory 매핑 (PR1b) |
|---|---|
| `## Verdict` (approve/changes-requested/blocked) | `## Review Summary (advisory)` (ok / changes-suggested / needs-human-decision) — §B-2 |
| `## Violations` (구현이 고칠 수 있는 위반) | findings `severity: major`(또는 warning) + `route: recommended-fix`. forbidden 침범 등 강한 건 `blocker-candidate` 까지 — §B-3 |
| `## Recommended Fixes` | findings `route: recommended-fix` 의 모음(자동 수행 가능 교정) |
| `## Human-only Decisions Needed` | findings `route: human-only-decision` + **이 표는 유지**(아래 권장 컬럼). 리뷰어는 닫지 않음 |
| `## Do Not Auto-Fix` | findings `route: do-not-auto-fix`(copy/API/design value 발명 금지 영역) |

> `## Human-only Decisions Needed` 표는 그대로 유지하되, "상태(리뷰가 바꾸지 않음)" 컬럼을 명시해 리뷰어가 resolve/close/승격하지 않음을 가시화하는 것을 권장한다(report/03 §4.3-(2)). 단 이 표의 **세부 컬럼 확정·S1~S8 의미 루브릭은 PR1b 범위 밖** — 후속(별도 doc / 후속 PR)으로 둔다(과적재 금지).

### B-5. 명시 (배선 금지 + 후속 범위)

`review-artifact.template.md` 상단 안내 주석(현재 `<!-- Review Artifact 는 ... -->`)에 다음 2줄을 덧댄다:

```md
<!--
  배선 금지: 이 산출물(review_status/review_summary/findings)을 required approval / merge check 에 연결하지 않는다.
            GitLab 의 MR approval rules · merge checks · protected branches (GitHub branch protection·required checks 대응)
            어디에도 묶지 않는다. blocker-candidate 는 후보일 뿐 — 진짜 blocker 는 Open Decision(readiness cap)+사람만.
  후속(이 PR 범위 밖): 의미/제품 갭 점검 루브릭(S1~S8: 빠진 state·엣지케이스·오분류 등)은 별도 doc 으로 분리한다
            (템플릿 과적재 금지). 여기서는 advisory 스키마(review_summary/findings)까지만 둔다.
-->
```

---

## C. run-report 증거 6개 + Review Evidence

> 대상: `frontend-workflow-kit/templates/work-packet/run-report.template.md`. SYNTHESIS §9.4 의 **사용자-facing 증거 6개**를 명시 프레이밍으로 박고, 새 `## Review Evidence (advisory)` 섹션 + 푸터 디스클레이머(통과≠완료)를 추가한다. provenance jargon(builder.id/predicateType/SLSA)은 **템플릿에 넣지 않는다** — rationale(report/04)에만 둔다.

### C-1. 증거 6개 — 명시 섹션 추가 (verbatim 6항)

run-report 의 `## Summary` 직후(또는 `## Result` 직전)에 다음 "증거 6개" 프레이밍 섹션을 추가한다. 6항은 SYNTHESIS §9.4 verbatim:

````md
## Evidence (사용자-facing 증거 6개)
<!-- 이 6개가 "이 실행을 신뢰할 수 있는가?"의 사용자-facing 근거다. provenance jargon
     (builder.id/predicateType/SLSA 등)은 여기 넣지 않는다 — 설계 rationale(reports/04)에만 둔다. -->
```txt
1. readiness_source       — 어떤 readiness 를 봤나        → 아래 ## Readiness Used
2. diff summary           — 무엇을 바꿨나 (ADDED/MODIFIED/REMOVED, 빈 diff 명시) → 아래 ## Diff Summary
3. validate result        — 구조 검사 통과?               → 아래 ## Commands Run / ## Gate Compliance
4. forbidden-paths result — 경계 지켰나                   → 아래 ## Gate Compliance (forbidden 무접촉 행)
5. idempotency result     — 재실행 빈 diff?               → 아래 ## Idempotency
6. blockers (verbatim)    — 왜 멈췄나 (readiness 의 blocking/next_actions 그대로) → 아래 ## Blockers Reported
```
````

### C-2. 증거 6개 ↔ 현재 run-report 섹션 매핑 (어디에 있나)

현재 `run-report.template.md` 섹션과 6항의 1:1 매핑(새 섹션을 늘리지 않고 기존 섹션에 라벨링):

| 증거 (§9.4) | 현재 run-report 섹션 | 비고 |
|---|---|---|
| 1. readiness_source | `## Readiness Used` (+ frontmatter `readiness_source`) | "재계산 금지" 그대로 소비 |
| 2. diff summary | `## Diff Summary`(+ `## Files Changed`) (ADDED/MODIFIED/REMOVED) | **빈 diff = "완전 빈 diff" 명시** (거절도 PASS). 실제 템플릿에 두 섹션이 모두 있어 양쪽 라벨링이 정답(pr-plan.draft.md §6.2 와 통일). |
| 3. validate result | `## Commands Run` (exit 0) + `## Gate Compliance` | 구조 검사 통과 |
| 4. forbidden-paths result | `## Gate Compliance` (forbidden 무접촉 행) | 경계 = diff 로 본다(validate 아님) |
| 5. idempotency result | `## Idempotency` (2차 빈 diff) | 재실행 멱등 |
| 6. blockers (verbatim) | `## Blockers Reported` | readiness blocking/next_actions 그대로(자체 추론 0) |

> 매핑만 추가하고 기존 섹션 구조는 보존한다. 증거 6개는 "산재한 섹션을 사용자 관점 6항으로 인덱싱"하는 프레이밍이다(새 축 아님).

### C-3. 새 섹션 `## Review Evidence (advisory)` (판정 아님)

`## Blockers Reported` 직후(또는 `## Follow-up` 직전)에 추가. Review Artifact 요약을 **evidence 로만** 합류시키되 게이트/판정과 섞지 않는다(report/03 §4.3-(3) 정합, advisory 어휘로 갱신):

```md
## Review Evidence (advisory — 게이트 아님)
<!-- Review Artifact 의 review_summary 를 evidence 로 옮긴다. readiness/validate 게이트 판정과 섞지 않는다.
     review_summary 는 머지를 자동 차단/허가하지 않는다(SYNTHESIS §9.3). -->
- Review Artifact: `{path}` / review_summary: **{ok | changes-suggested | needs-human-decision}** (advisory)
- findings 수: {n} (severity 별: info/warning/major/blocker-candidate; blocker-candidate ≠ blocker)
- Human-only Decisions (리뷰가 닫지 않음): {D-301(open), C-001(open), ...} 또는 "없음"
- 처리 상태: route=recommended-fix 중 반영 {k}/{m} (나머지는 do-not-auto-fix 또는 사람 대기)
- ⚠ review_summary 가 needs-human-decision 이어도 이 Run Report 는 머지를 자동 차단하지 않는다 — 머지 결정은 사람.
```

### C-4. 푸터 디스클레이머 (통과 ≠ 완료)

run-report 맨 끝(`## Follow-up` 다음)에 푸터를 추가한다(SYNTHESIS §9.4 / report/05 green≠done 정합):

```md
---
> **통과 ≠ 완료.** 위 증거 6개가 전부 PASS(빈 diff·validate exit 0·멱등)라도 그것은 *결정성·경계 준수*의
> 증거일 뿐 **제품적 정확성·사람 승인**이 아니다. 이 Run Report 는 머지 판단·승인을 하지 않는다 —
> 게이트는 readiness(Open Decision)+validate 뿐이고, 다음 행동은 사람/지정 구현자가 정한다.
```

### C-5. ⚠ MVP-C 종속 줄 (generated-file guard 확정 후 정렬)

run-report 의 아래 지점들은 **generated 파일 취급**에 의존한다. Session C 의 generated-file guard 가 그 표면을 바꿀 수 있으므로 PR1b 는 세부를 **확정하지 않고** 다음 주석을 해당 위치에 단다(SYNTHESIS 규칙 2/§10):

- `## Diff Summary` 의 `_meta/*.yaml`(generated) 취급 줄 — 현재 템플릿에 `# _meta/*.yaml 외 변동 없음` 주석 존재. 여기에:

```md
<!-- ⚠ MVP-C 종속 — Session C generated-file guard 확정 후 정렬: 어떤 파일이 generated(_meta/*.yaml 등)이고
     diff 에서 어떻게 취급/제외되는지는 generated-file guard 가 그 표면을 정의 중. 확정 전까지 라벨만 두고 세부 미확정.
     참고: frontend-workflow-kit/temp/proposals/generated-file-guard-followup.md -->
```

- `## Idempotency` 의 "재생성 허용 범위: `_meta/*.yaml`" 줄 — 같은 주석을 단다(generated 판정이 guard 에 종속):

```md
<!-- ⚠ MVP-C 종속 — Session C generated-file guard 확정 후 정렬: 재생성 허용 범위(generated 화이트리스트)는
     generated-file guard 확정 후 정렬한다. 현재는 _meta/*.yaml 예시만 라벨로 둔다. -->
```

- 증거 6개의 **4번 forbidden-paths result** — generated-file 경로가 forbidden 판정에 어떻게 들어가는지(generated 는 hand-edit 금지 vs 재생성 허용)도 종속. `## Gate Compliance` 의 forbidden 행 근처에:

```md
<!-- ⚠ MVP-C 종속 — Session C generated-file guard 확정 후 정렬: forbidden-paths 결과에서 generated-file 경로
     (hand-edit 금지 vs 재생성 허용)의 처리는 generated-file guard 확정 후 정렬. -->
```

> 참고(work-packet 쪽 동일 종속): work-packet `## Out of Scope` 의 "generated file hand-edit 금지" 줄 — "어떤 파일이 generated 인가"의 판정도 같은 guard 에 종속이다. 이 줄은 **Phase 0 에서 PR1a/PR1b 모두 본문 미변경**(⚠ MVP-C 종속 — Session C generated-file guard 확정 후 정렬) — **소유 귀속 아님**. PR1b 는 여기서 건드리지 않고 **연결만 기록**한다(중복/충돌 회피). 이 섹션의 *채움*은 PR2(workflow:packet)가 readiness 출력 복사로 수행하되, generated 목록 판정은 guard 확정 후 정렬한다(pr1a-docs.draft.md line 22·pr-plan.draft.md §9 와 합의).

---

## D. PR1b 자가검증 (불변식 / 어휘 / 과적재)

| 점검 | 결과 |
|---|---|
| warning-only (어떤 섹션도 exit 1/required check/merge gate 에 배선 안 함) | ✅ §A-1·§B-5·§C 전부 advisory/문서 텍스트로 명시 |
| `'verdict'`/`'blocked'` active 용어 미사용 (마이그레이션 주석만 허용) | ✅ frontmatter `verdict:` 제거 → `review_summary:`; `blocked`→`needs-human-decision`. "구 verdict→review_summary"·"구 'blocked'" 주석만 |
| §3 어휘만 사용 (Ambiguity Review Required / Safe To Proceed? / Pre-Implementation Review / HALT_AMBIGUITY 입력 / D-cand·U-cand) | ✅ 새 이름 안 만듦 |
| 템플릿 과적재 금지 (전체 rubric·S1~S8 은 별도 doc 링크/후속) | ✅ §A-1 최소 표 + ambiguity-triage 링크; §B-5 S1~S8 후속 명시 |
| §8 열린 결정 안 닫음 ("결정 필요"로 남김) | ✅ 삽입 위치(§A-0), Ambiguity 입력 계약 포맷(§A-3), Human-only 컬럼/S1~S8 세부(§B-4) 를 결정 필요로 둠 |
| MVP-C 종속 표시 | ✅ §C-5 의 Diff Summary/Idempotency/forbidden-paths 3개 코드블록에 리터럴 "⚠ MVP-C 종속" 마커. work-packet Out of Scope 의 generated 종속은 Phase 0 본문 미변경으로 두고 **연결만 기록**(마커 문자열은 pr1a-docs.draft.md line 22·pr-plan.draft.md §9 가 보유) |
| kit 파일 수정 0 (읽기만) | ✅ 본 문서는 design/ 초안 — kit 미수정 |
| PR1a 의존·중복 금지 | ✅ 헤더/Validity/Expected Output/Must Read 는 PR1a 소유로 비워둠; Pre-Implementation Review 행은 PR1b 단독 소유 명시 |
