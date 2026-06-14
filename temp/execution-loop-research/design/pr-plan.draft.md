> **DRAFT — 적용 금지. MVP-C 안착 후 사람이 검토/적용한다.** 이 문서는 temp/ 안의 설계 초안이며, frontend-workflow-kit/ 의 실제 파일을 수정하지 않는다.

# PR 계획 초안 — Execution Loop (PR1a→1b→PR2→PR3→PR4)

이 문서는 Execution Loop / Work Packet Runner 축의 **PR 분할 계획**을 **계약 수준**으로 고정한다. PR1a/PR1b 는 앞 3종 초안(`pr1a-docs.draft.md`·`pr1b-sections.draft.md`·`ambiguity-triage.draft.md`)을 가리키는 인덱스이고, **PR2~PR4 는 계약/인터페이스만** 적는다 — 코드·의사코드·실행 구현을 적지 않는다(SYNTHESIS §9.5/§9.6). 진짜 산출물은 각 PR 시점에 사람이 작성하며, 이 문서는 "무엇을·어떤 입출력으로·무엇을 절대 하지 말지"의 경계만 못박는다.

> **모든 PR 의 공통 불변**: 새 실행경로가 생겨도(PR2~4) **새 게이트는 0개**다. 유일한 코드 게이트는 변함없이 `readiness.mjs`(Open Decision cap + 정책 fact) + `validate.mjs`(구조)뿐이다(공통 불변식 1·9, roadmap "게이트는 Open Decision + 정책 fact 뿐"). Work Packet·Run Report·Review Artifact·runner 상태기계는 **전부 readiness 출력의 소비자/봉투**이지 판정자가 아니다.

> **현황 사실(읽어서 확인)**: 현재 `package.json` 의 `scripts` 에는 `workflow:state`·`workflow:readiness`·`workflow:validate`·`workflow:forbidden-paths` **만** 있다. **`workflow:packet`·`workflow:report`·`workflow:run` 은 아직 없다** — PR2~4 가 신설하는 표면이다. `templates/work-packet/` 에는 `work-packet.template.md`·`run-report.template.md`·`review-artifact.template.md` 3종이 이미 있다(코드 강제 0, Future Candidate — roadmap). PR2~4 가 소비할 결정성 스크립트는 `scripts/` 의 `workflow-state.mjs`·`readiness.mjs`·`validate.mjs`·`forbidden-paths.mjs`(+ 회귀용 `test-fixtures.mjs`)다.

---

## 1. 개요 표 (5 PR 한눈에)

| PR | 스코프 (한 줄) | 건드리는 파일 | 게이트 영향 | 의존 | 산출물 초안 |
|---|---|---|---|---|---|
| **PR1a** | green≠done + 봉투 안전선 (문구·affordance) | `README.md` · `skills/implement-screen/SKILL.md` · `templates/work-packet/work-packet.template.md`(헤더·Validity·Expected Output·Must Read) | **0 신설** (전부 markdown, warning-only) | 없음 | `design/pr1a-docs.draft.md` |
| **PR1b** | Ambiguity / Review / Report 섹션 (advisory) | `templates/work-packet/work-packet.template.md`(Ambiguity Review Required·Blocking Items 주석·Review Checklist 1행) · `review-artifact.template.md`(advisory 스키마) · `run-report.template.md`(증거 6개·Review Evidence) · 신규 `docs/workflows/ambiguity-triage.md` | **0 신설** (전부 markdown, advisory/warning-only) | PR1a | `design/pr1b-sections.draft.md` + `design/ambiguity-triage.draft.md` |
| **PR2** | `workflow:packet` 초안 — readiness 출력 → Work Packet 초안 | (신규) `skills/`(packet 작성 스킬) + `package.json` `scripts` 1줄. **저작 문서·정본 0 수정** | **0 신설** (생성기일 뿐, 판정 재구현 0) | PR1a·PR1b (템플릿이 출력 형태) | (이 문서 §5 계약) |
| **PR3** | `workflow:report` 초안 — diff/validate/forbidden/test 수집 → Run Report(증거 6개) | (신규) `skills/`(report 작성 스킬) + `package.json` `scripts` 1줄 | **0 신설** (수집·인덱싱일 뿐, 승인/머지 판단 0) | PR1b (run-report 템플릿) | (이 문서 §6 계약) |
| **PR4** | `workflow:run` 초안 — PR2/PR3 를 auto-stop 상태기계로 엮음 | (신규) `skills/`(run 오케스트레이션) + `package.json` `scripts` 1줄 | **0 신설** (auto-stop·HALT 만, auto-fix/auto-retry 0) | PR2·PR3 | (이 문서 §7 계약) |

> "게이트 영향 = 0 신설" 의 의미: 어떤 PR 도 `validate.mjs` 검사 종수를 늘리지 않고, `readiness.mjs` 판정을 바꾸지 않으며, review/ambiguity/report 산출물을 required check·merge gate 에 배선하지 않는다(SYNTHESIS §9.6, roadmap "지금 하지 말 것"). PR2~4 가 만드는 것은 *새 게이트*가 아니라 *기존 게이트 출력의 봉투/리포트/오케스트레이션*이다.

---

## 2. PR1a (문서) — green≠done + 봉투 안전선

**정본 초안: `design/pr1a-docs.draft.md`** (이 계획은 요약·정렬만 한다).

- **스코프**: "통과 = 완료가 아니다" 멘탈모델을 착각이 생기는 3지점(README 첫 만남 · 구현 결심 순간 · 봉투 헤더)에 심는다. 새 실행경로 0, 새 게이트 0, 전부 markdown, **warning-only**(exit 1 / required check 배선 없음).
- **건드리는 파일(3, 전부 markdown)**:
  - `frontend-workflow-kit/README.md` — 인트로(4행)와 `> 현재 단계:`(6행) 사이에 "이 킷이 보장하는 것 / 보장하지 않는 것" 섹션 신설(하는것 vs 안하는것 표 + 6 금지착각). 기존 `## 깨면 안 되는 불변식 (요약)` 코드펜스는 **비변경**.
  - `frontend-workflow-kit/skills/implement-screen/SKILL.md` — 9행 뒤 "통과≠완료" callout · 50행 뒤 "## 금지" 1줄 · 절차 3에 "애매함 먼저" 1줄.
  - `frontend-workflow-kit/templates/work-packet/work-packet.template.md` — **헤더 주석 디스클레이머 1줄**(16↔17행) · **Validity 무효조건 체크리스트**(33–38행 교체) · **Expected Output 이진 판정 문장**(86–92행 교체) · **Must Read "▶ 여기부터" 마커**(40–45행 교체). (work-packet 의 이 4곳은 **PR1a 소유** — PR1b 가 건드리지 않음.)
- **게이트 영향**: 0 신설. README 표가 "통과=충분" 착각을 정면으로 부정하는 *문구*일 뿐.
- **§9.6 가드(PR1a 관련 2건)**: "PASS 디스클레이머를 exit 1 경고-게이트로" · "Validity stale 을 자동 검사 스크립트로" — 둘 다 **문구/주석으로만** 두고 코드화하지 않는다(상세는 §8).
- **MVP-C 종속(PR1a)**: work-packet Validity 무효조건의 "`readiness_source` 파일 자체가 갱신됨" 항목에서, `readiness_source` 가 generated 산출물(`_meta/*.yaml`·run-report)을 가리킬 때 "무엇을 갱신으로 볼지"의 판정 → **⚠ MVP-C 종속**(상세는 §9).

---

## 3. PR1b (섹션) — Ambiguity / Review / Report

**정본 초안: `design/pr1b-sections.draft.md` + `design/ambiguity-triage.draft.md`** (이 계획은 요약·정렬만 한다).

- **스코프**: PR1a 위에 **Ambiguity / Review / Report** 3표면만 얹는다. 전부 **advisory/warning-only 텍스트** — 어떤 섹션도 `validate.mjs`/`readiness.mjs` exit code·required check·merge gate 에 배선하지 않는다.
- **건드리는 파일(3 템플릿 + 신규 doc 1)**:
  - `work-packet.template.md` — `## Ambiguity Review Required`(**최소 표만** = `Safe To Proceed?` 한 표 + `ambiguity-triage` 링크) · `## Blocking Items` 에 "Ambiguity 입력원" 연결 주석 1줄 · `## Review Checklist` 에 **"Pre-Implementation Review" 한 행**(PR1b 단독 소유).
  - `review-artifact.template.md` — frontmatter `verdict:` 제거 → `review_status: advisory`/`review_summary:`/`human_action_required:` · `## Verdict` → `## Review Summary (advisory)` 개명·재작성 · `## Findings`(severity `info|warning|major|blocker-candidate` + ref + route) 블록 · 기존 `## Violations`/`## Human-only Decisions Needed`/`## Recommended Fixes`/`## Do Not Auto-Fix` → advisory route 매핑 · 배선 금지 + S1~S8 후속 명시(별도 doc).
  - `run-report.template.md` — `## Evidence (증거 6개)` verbatim 섹션 + 증거6↔현재 섹션 매핑표 · 새 `## Review Evidence (advisory)` 섹션 · 푸터 디스클레이머(통과≠완료) · ⚠ MVP-C 종속 줄(Diff Summary/Idempotency/forbidden-paths 의 generated 취급).
  - (신규) `docs/workflows/ambiguity-triage.md` — triage 결정트리·신호표·Blocking Mode 매핑·모드별 Safe-To-Proceed **전체**(템플릿 과적재 금지, SYNTHESIS §9.5). 템플릿엔 최소 표 + 이 doc 링크만.
- **게이트 영향**: 0 신설. review_summary 는 **advisory evidence** 일 뿐 — `blocker-candidate` 조차 그 자체로 아무것도 막지 못한다(진짜 차단은 Open Decision readiness cap + 사람).
- **어휘 가드**: `'verdict'`/`'blocked'` 를 active 용어로 쓰지 않는다 — 마이그레이션 주석("구 verdict→review_summary", "구 'blocked'→needs-human-decision")에서만 등장.
- **MVP-C 종속(PR1b)**: run-report `## Diff Summary`·`## Idempotency`·증거 6개의 forbidden-paths(4번)에서 generated 파일 취급 → **⚠ MVP-C 종속**(상세는 §9).

---

## 4. PR2~4 공통 계약 전제 (코드 금지)

PR2~4 는 **실행 계층**이지만, 셋 다 아래 전제를 깬 줄이라도 들어가면 불변식 위반이다. (이 절은 §5~§7 에 공통 적용된다.)

1. **판정 재구현 0.** 세 스킬은 `workflow-state.mjs`·`readiness.mjs`·`validate.mjs`·`forbidden-paths.mjs` 를 **서브프로세스로 소비**만 한다. `computeReadiness` 류 로직을 다시 구현하지 않는다(불변식 1·2). readiness 출력은 **복사**만 한다 — 재계산·대체 금지.
2. **저작 문서·정본 0 수정.** packet/report/run 은 ScreenSpec·navigation-map·decision-log·`_meta/*.yaml` 를 **읽기만** 한다. 산출물(Work Packet 초안·Run Report 초안)은 작업용 파일로만 쓰고, 정본을 hand-edit 하지 않는다(불변식 10).
3. **새 source of truth·새 게이트 0.** 세 산출물은 전부 readiness/validate 출력의 봉투·리포트·오케스트레이션이다(불변식 2·8·9). roadmap 의 닫힌 산출물 축에 새 축을 더하지 않는다.
4. **순수 auto-stop·auto-fix/auto-retry 0(v1).** runner 는 구현으로 자동 전진하지 않고, 자동 수정/자동 재시도도 하지 않는다(불변식 6, SYNTHESIS §5 "순수 auto-stop·auto-retry 없음"). (auto-retry 는 v2 — §10 열린 결정 2.)
5. **warning-first ≠ auto-stop(층위 구분).** Ambiguity·`Safe To Proceed?` 를 공식 게이트로 *승격*하지 않으면서(warning-first), runner 는 구현으로 자동 *전진*하지 않는다(auto-stop). `HALT_AMBIGUITY` 는 "게이트가 막은 것"이 아니라 "runner 가 스스로 안 나아간 것"이다(SYNTHESIS §9.2). 실제 차단 권한은 Open Decision(readiness cap) + 사람뿐.

> **이 문서는 PR2~4 의 코드를 적지 않는다.** 아래 §5~§7 은 입력/출력/금지 **계약**만 명시한다. 함수 시그니처·상태 전이 의사코드·파싱 규칙 등 구현 디테일은 각 PR 시점의 산출물에 속한다.

---

## 5. PR2 — `workflow:packet` (계약만, 코드 금지)

> **한 줄**: readiness 출력을 복사해 Work Packet 초안(`Ambiguity Review Required` 포함)을 채운다. **구현 실행 없음** — 이 스킬은 봉투를 *작성*만 하고 코드를 *실행*하지 않는다.

### 5.1 인터페이스 계약

| 항목 | 계약 |
|---|---|
| **트리거** | (신규) `npm run workflow:packet` 또는 `skills/` 스킬 호출. 대상 화면(SCREEN_ID)과 readiness 출처를 인자/컨텍스트로 받는다. |
| **입력** | `readiness.mjs` 출력(또는 그것을 담은 run-report). `workflow-state.mjs` 출력(스냅샷 사실). 정본 링크(ScreenSpec·open-decisions·conflicts)는 **경로만** 참조. |
| **출력** | `work-packet.template.md` 구조를 채운 **Work Packet 초안 1건**(작업용 파일). 채우는 섹션: Goal·Validity(스냅샷)·Must Read(링크)·Readiness Snapshot·Allowed/Forbidden Paths·Blocking Items·Expected Output·Out of Scope·Commands·Acceptance Criteria·Review Checklist·**Ambiguity Review Required(최소 표)**. |
| **소비 방식** | `readiness.mjs`·`workflow-state.mjs` 를 **서브프로세스로 호출**해 그 출력을 읽는다(판정 재구현 0). Allowed/Forbidden/mode 는 readiness 출력에서 **글자 그대로 복사**. |
| **부작용** | 작업용 Work Packet 파일 생성뿐. 정본·`_meta/*.yaml`·스크립트 **0 수정**. exit code 는 생성 성공/실패 신호일 뿐 게이트 아님. |

### 5.2 Ambiguity Review Required 의 채움 책임 (warning-only)

- packet 스킬은 `Ambiguity Review Required` 의 `Safe To Proceed?` 표를 **후보로 채운다** — `ambiguity-triage.md` rubric 을 *대화 가이드로* 따르되, 분류 결과는 항상 **후보(D-cand/U-cand) 제안**이다.
- **닫지 않는다**: LLM 은 Unknown/Decision/Conflict 를 닫거나, ScreenSpec 에 직접 확정하거나, `candidate→confirmed` 로 올리지 않는다(불변식 4). 빈 표면은 "없음 — <사유>" 로 명시.
  - ⚠ **scope 주의 (PR2 설계 혼선 방지)**: 위 "닫지 않는다 / 직접 확정 안 한다"는 `workflow:packet` / `workflow:run` / review 단계에 **한정**한다. ScreenSpec **authoring / reconcile** 단계의 LLM 은 기존 규칙대로 `open` Unknown / Open Decision 행을 추가하거나 `resolved → open` 재오픈할 수 있다(`global/llm-rules.md` · `input-reconciliation.md`). 항상 사람만: resolve / close / confirmed 승격 / 재-resolve.
- 이 표는 **warning-only 텍스트**다 — packet 스킬이 `Safe To Proceed?` 를 파싱해 exit 1 하지 않는다(§8 가드 1).

### 5.3 §9.6 가드 (PR2 적용)

- ❌ `Ambiguity`·`Safe To Proceed?` 를 파싱해 **exit 1** (warning-only 유지).
- ❌ LLM 이 `D-cand`/`U-cand` 를 ScreenSpec 에 **직접 확정/close** (승격·resolve·close 전부 사람).
- ❌ blocking Unknown 을 **게이트**로 (막는 건 승격된 Open Decision 만 — 불변식 5).
- ❌ readiness 를 **재계산/덮어쓰기** (출력 복사만 — 불변식 1).

---

## 6. PR3 — `workflow:report` (계약만, 코드 금지)

> **한 줄**: diff·validate·forbidden-paths·test-fixtures 결과를 수집해 Run Report(증거 6개)를 채운다. **승인/머지 판단 없음** — 이 스킬은 증거를 *모아 인덱싱*만 하고 합격/불합격을 *선고*하지 않는다.

### 6.1 인터페이스 계약

| 항목 | 계약 |
|---|---|
| **트리거** | (신규) `npm run workflow:report` 또는 `skills/` 스킬 호출. 직전 작업의 Work Packet 과 작업 트리(diff)를 컨텍스트로 받는다. |
| **입력** | `git diff`(변경 수집) · `validate.mjs` 결과(구조) · `forbidden-paths.mjs` 결과(경계) · `test-fixtures.mjs` 결과(회귀) · readiness 출력의 `blocking`/`next_actions`(verbatim). |
| **출력** | `run-report.template.md` 구조를 채운 **Run Report 초안 1건**. 핵심 = **사용자-facing 증거 6개**(SYNTHESIS §9.4): ① readiness_source ② diff summary(ADDED/MODIFIED/REMOVED, 빈 diff 명시) ③ validate result ④ forbidden-paths result ⑤ idempotency result ⑥ blockers(verbatim). + `## Review Evidence (advisory)`. |
| **소비 방식** | `validate.mjs`·`forbidden-paths.mjs`·`test-fixtures.mjs` 를 **서브프로세스로 호출**해 결과를 수집·전사. blockers 는 readiness 출력을 **그대로 인용**(자체 추론 0). |
| **부작용** | 작업용 Run Report 파일 생성뿐. 정본·스크립트 **0 수정**. **승인·머지 판단·합격선고 안 함**. exit code 는 생성 성공/실패 신호일 뿐 게이트 아님. |

### 6.2 증거 6개 ↔ 현재 run-report 섹션 (어디에 적나)

PR1b 매핑을 따르되(새 섹션 신설 아님 — 기존 섹션에 라벨링), 실제 `run-report.template.md` 에는 `## Files Changed`·`## Diff Summary` 두 섹션이 모두 있으므로 증거 ②는 양쪽 모두에 라벨링한다(PR3 작성 시 둘의 역할 분담은 사람 확정):

| 증거(§9.4) | 현재 run-report 섹션 |
|---|---|
| ① readiness_source | `## Readiness Used` (+ frontmatter `readiness_source`) |
| ② diff summary | `## Diff Summary`(+ `## Files Changed`); 빈 diff = "완전 빈 diff" 명시(거절도 PASS) |
| ③ validate result | `## Commands Run`(exit 0) + `## Gate Compliance` |
| ④ forbidden-paths result | `## Gate Compliance`(forbidden 무접촉 행) — 경계는 diff 로 본다 |
| ⑤ idempotency result | `## Idempotency`(재실행 빈 diff) |
| ⑥ blockers(verbatim) | `## Blockers Reported`(readiness blocking/next_actions 그대로) |

> provenance jargon(`builder.id`/`predicateType`/SLSA)은 **템플릿/리포트에 넣지 않는다** — 설계 rationale(reports/04)에만(SYNTHESIS §9.4).

### 6.3 멱등성의 위치 (재실행 ≠ 재판정)

- ⑤ idempotency 는 "재실행 시 빈 diff 인가"를 **증거로 기록**할 뿐이다. 그 결과로 readiness 를 덮어쓰거나 머지를 차단하지 않는다(불변식, SYNTHESIS §9.6). re-run(witness) ≠ re-judge(gate).
- ⚠ generated 파일의 재생성 허용 범위(무엇을 "빈 diff" 로 볼지)는 **MVP-C 종속**(§9).

### 6.4 §9.6 가드 (PR3 적용)

- ❌ review verdict 를 **머지 차단 / required-approval(merge check)** 에 배선 (Review Evidence 는 advisory).
- ❌ 멱등 재실행 결과로 **readiness 덮어쓰기 / 머지 차단**.
- ❌ PASS 디스클레이머를 **exit 1 경고-게이트**로 (푸터는 문구로만).
- ❌ Run Report 가 **승인/합격 선고** (다음 행동은 사람/지정 구현자가 결정).

---

## 7. PR4 — `workflow:run` (계약만, 코드 금지)

> **한 줄**: PR2(packet)와 PR3(report)를 **auto-stop 상태기계**로 엮는다. 기본 종료는 `HALT_AMBIGUITY`, 게이트가 깨끗하면 `HALT_READY_FOR_WORK`(= **구현 허가 아님**). **auto-fix/auto-retry 없음.**

### 7.1 인터페이스 계약

| 항목 | 계약 |
|---|---|
| **트리거** | (신규) `npm run workflow:run` 또는 `skills/` 오케스트레이션. 대상 화면을 컨텍스트로 받는다. |
| **입력** | PR2(`workflow:packet`)·PR3(`workflow:report`) 산출물. 그 안에 담긴 readiness 출력·Ambiguity Review·증거 6개. |
| **출력** | 종료 상태 + 그 근거(packet/report 경로). **기본 경로 = `HALT_AMBIGUITY`**(구현 전 멈춤). |
| **종료 상태(이 PR 범위)** | `HALT_AMBIGUITY`(애매함 미해결 = 기본) · `HALT_READY_FOR_WORK`(게이트 깨끗·증거 준비 완료 — **구현 허가 아님**, 사람/지정 구현자가 다음 행동 결정 대기). **이 두 HALT 까지만** — IMPLEMENT/auto-fix 전이는 이 PR 에 없다. |
| **소비 방식** | PR2/PR3 스킬을 **서브프로세스로 호출**해 그 출력으로 분기. 자체 판정·자체 수정 0. |
| **부작용** | 종료 상태·근거 보고뿐. 정본·스크립트 **0 수정**. 어떤 HALT 도 머지를 차단하지 않는다(차단은 readiness cap + 사람). |

### 7.2 상태 의미 (어휘 §3 — 새 이름 금지)

- **`HALT_AMBIGUITY`** = runner 가 구현 전 멈추는 **종료 상태(기본 경로)**. `Safe To Proceed?` 가 어떤 모드에서 'no' 면 그 모드 직전에서 멈춰 후보를 사람에게 올린다. 게이트가 막은 게 아니라 **runner 가 스스로 안 나아간 것**(SYNTHESIS §9.2).
- **`HALT_READY_FOR_WORK`** = 게이트(readiness+validate) 깨끗 · 증거(6개) 준비 완료 — **구현 허가 아님**. readiness/packet 증거가 준비됐으니 *사람 또는 지정 구현자가 다음 행동을 고르는* 대기 상태다(SYNTHESIS §9.1/§9.5).
- (참고) `Pre-Implementation Review` = 집행 직전 체크 항목(Validity 무변경·Blocking 분류 완료) — Review Checklist 한 행(PR1b). runner 가 이를 *강제*하지 않는다 — 사람이 확인하는 assertion.

### 7.3 §9.6 가드 (PR4 적용 — 전체)

- ❌ `Ambiguity`·`Safe To Proceed?` 를 파싱해 **exit 1** (warning-only — HALT 는 종료 상태지 exit-1 게이트가 아니다).
- ❌ blocking Unknown 을 **게이트**로 (막는 건 승격된 Open Decision 만).
- ❌ **auto-retry/auto-fix** — runner 가 테스트/golden/readiness-입력을 수정하거나 자동 재시도하지 않는다(reward hacking 금지).
- ❌ `HALT_READY_FOR_WORK` 를 **구현 허가/자동 전진**으로 취급.
- ❌ HALT 를 **머지 차단**으로 배선 (차단 권한은 Open Decision readiness cap + 사람뿐).

---

## 8. "절대 코드로 구현하지 말 것" 가드 블록 (SYNTHESIS §9.6 — PR2~4 전체 적용) [verbatim]

runner/스크립트가 **절대** 하면 안 되는 것 — 하나라도 코드화하면 불변식 위반:

- Ambiguity·`Safe To Proceed?` 를 파싱해 **exit 1** (warning-only 유지)
- review verdict 를 **머지 차단 / required-approval(merge check)** 에 배선
- blocking Unknown 을 **게이트**로 (막는 건 승격된 Open Decision 만)
- 멱등 재실행 결과로 **readiness 덮어쓰기 / 머지 차단**
- Validity stale 을 **자동 검사 스크립트**로
- PASS 디스클레이머를 **exit 1 경고-게이트**로
- auto-retry 가 **테스트/golden/readiness-입력** 수정 (reward hacking)
- LLM 이 `D-cand`/`U-cand` 를 ScreenSpec 에 **직접 확정/close**

> 위 8항을 PR 별로 어디서 지키는지(§2·§3·§5.3·§6.4·§7.3)는 각 절에 분산 명시했다. 이 블록은 그 정본(verbatim)이다. 사내 GitLab 대응: review 산출물을 **MR approval rules · merge checks · protected branches** 에 연결 금지(SYNTHESIS §9.3).

---

## 9. MVP-C 종속 지점 목록 (통합 — 확정 후 정렬)

generated file/guard 세부는 **확정하지 않는다**. Session C(generated-file guard) 가 그 표면을 바꿀 수 있으므로, 아래 지점은 전부 "⚠ MVP-C 종속 — Session C generated-file guard 확정 후 정렬" 로 표시한다(공유 컨텍스트 규칙 2/§10). 그 표면을 정의 중인 문서: `frontend-workflow-kit/temp/proposals/generated-file-guard-followup.md`.

> generated-file-guard-followup 의 핵심(읽어서 확인): generated 파일 목록의 **단일 출처 = artifact-manifest 의 `kind: generated`**. 본문 직접 편집은 헤더/마커 검사로 못 잡고 **재생성+`git diff --exit-code`(generated_at 정규화)** 또는 pre-edit 훅이 있어야 잡힌다 — 단 **첫 실제 생성기(catalog-gen) 전에는 diff 게이트를 넣지 말 것**(재생성 대상이 없음). 루트 경로(`eslint.workflow.config.mjs`)는 현행 경로 해소 가정 밖이라 건너뛰는 공백 존재.

| # | 종속 지점 | 닿는 PR/섹션 | "확정 후 정렬" 내용 | 관련 MVP-C 세션 |
|---|---|---|---|---|
| 1 | work-packet `## Out of Scope` "generated file hand-edit 금지"의 "어떤 파일이 generated 인가" 판정 | PR1a/PR1b 본문 미변경(MVP-C 종속 — pr1a-docs §머리말의 "미변경" 선언과 일치) · 채움은 PR2(packet 이 Out of Scope 를 채울 때) | 현재 어느 PR 도 이 줄을 수정하지 않음(Phase 0 본문 미변경). generated 파일 판정 단일 출처(manifest `kind: generated`)가 확정되면 그 목록을 참조하도록 PR2/이후가 정렬. 지금은 "_meta/*.yaml 등" 예시 라벨만. | Session C |
| 2 | work-packet `## Validity` 무효조건의 "`readiness_source` 파일 갱신" 항목 | PR1a(Validity 체크리스트) | `readiness_source` 가 generated 산출물일 때 "무엇을 갱신으로 볼지"(generated 헤더/`generated_at` 한 줄 변화는 무효 아님 등). | Session C |
| 3 | run-report `## Diff Summary` 의 `_meta/*.yaml`(generated) 취급 | PR1b(C-5) / PR3(증거 ② diff summary) | diff 에서 generated 파일을 어떻게 취급/제외하는지. `generated_at` 정규화 규칙. | Session C |
| 4 | run-report `## Idempotency` 의 재생성 허용 범위(generated 화이트리스트) | PR1b(C-5) / PR3(증거 ⑤ idempotency) | 재실행 "빈 diff" 판정 시 generated 화이트리스트(무엇이 재생성 허용 드리프트인가). `git diff --exit-code` 전제는 첫 생성기와 함께. | Session C |
| 5 | run-report 증거 ④ forbidden-paths result 의 generated-file 경로 처리 | PR1b(C-5) / PR3(증거 ④) | forbidden 판정에서 generated 경로(hand-edit 금지 vs 재생성 허용)를 어떻게 다루는지. 루트 경로 해소 공백 포함. | Session C |
| 6 | ambiguity-triage `§5 Blocking Mode 매핑` 의 generated 표면 cap 판정 | PR1b(ambiguity-triage.md) | generated 표면을 건드리는 결정(예: catalog 재생성 트리거)이 어느 모드를 cap 하는지. 지금은 "generated 표면 영향 있음"만, 모드값 보류. | Session C |
| 7 | route-skeleton / `route-tree` 의 route 엣지 표면 | ambiguity-triage `§6`(route-skeleton 행) / PR2(Allowed Paths route 영역) | route-tree 생성물이 route 표면을 바꿀 수 있음. nav-map 충돌 판정 정렬. | Session C (route-tree) |
| 8 | screen-skeleton / `nav-graph` 의 nav 엣지 표면 | ambiguity-triage `§5`·`§6`(screen-skeleton·route-skeleton nav 행) | nav-graph 생성물이 nav 엣지 표면을 바꿀 수 있음. "어떤 화면이 존재/이동" cap 판정 정렬. | Session C (nav-graph) |

> 정렬 원칙: 위 8지점 모두 **확정 전까지 라벨·문구만** 두고 generated 판정 규칙을 박지 않는다. Session C 가 manifest `kind: generated` 단일 출처 + (있다면) diff 게이트 표면을 확정한 뒤, 각 PR 의 해당 줄을 그 표면에 맞춘다.

---

## 10. §8 열린 결정 (PR2+ 선결 — 닫지 말 것, "결정 필요"로)

아래는 사람이 정할 것이다. 이 계획은 임의로 닫지 않고 보수적 기본값만 표시한다(공유 컨텍스트 §6/§9, SYNTHESIS §8).

1. **Ambiguity 입력 계약 포맷** — 구현 전 애매함 입력 신호(SYNTHESIS 도식의 AMBIGUITY_GATE 노드 — 단 이 repo 에서 'GATE'로 배선하지 않음, §4.5/§9.2)를 **별도 파일**로 둘지 **packet 섹션**(`Ambiguity Review Required`)으로 둘지. (01↔02, **Phase 2 선결** — PR2/PR4 가 이 포맷에 의존.) **보수적 기본**: packet 섹션(PR1b §A-1 표)만 두고 파일 계약 미확정. **결정 필요.**
2. **v1 = 순수 auto-stop 확정?** — auto-retry 를 v2 로 미루는 것 못박기. (권고: **yes** — v1 은 순수 auto-stop, PR4 는 HALT 두 상태까지만.) **결정 필요.**
3. **digest 병기** — Run Report `## Diff Summary` 에 파일 SHA-256 을 넣을지(nice→must?). **보수적 기본**: Phase 0 는 라벨만, 보류. **결정 필요.**
4. **(참고) PR1a/PR1b 단의 열린 결정** — `Ambiguity Review Required` 삽입 위치(`## Blocking Items` 직후 vs `## Goal` 앞), Human-only Decisions 컬럼·S1~S8 의미 루브릭 세부 위치 등은 각 초안(`pr1b-sections.draft.md` §A-0/§B-4, `ambiguity-triage.draft.md` §8)에서 "결정 필요"로 열려 있다 — 여기서 닫지 않는다.

> 확정된 것(참고, SYNTHESIS §8-5): 첫 PR = Phase 0 문서, 디스클레이머는 Skill/문서만, EARS 문법 미채택, 게이트는 readiness+validate 만. (PR 분할 = PR1a→1b→PR2→PR3→PR4.)

---

## 11. 자가검증 (불변식 / 어휘 / 코드금지 / MVP-C / kit 0수정)

| 점검 | 결과 |
|---|---|
| 게이트 0 신설 (모든 PR) | ✅ §1 표·§각 절에서 "0 신설" 명시. readiness+validate 만 게이트. |
| PR2~4 계약만 (코드·의사코드 0) | ✅ §5~§7 은 입력/출력/금지 계약 표만. 함수·상태전이 의사코드 없음. §4 에 "코드 안 적음" 명시. |
| §9.6 8항 verbatim 포함 + PR별 분산 적용 | ✅ §8 verbatim 블록 + §2·§3·§5.3·§6.4·§7.3 분산. |
| §3 어휘만 (verdict/blocked active 미사용) | ✅ HALT_AMBIGUITY/HALT_READY_FOR_WORK/Safe To Proceed?/Pre-Implementation Review/D-cand·U-cand. verdict/blocked 는 마이그레이션 주석에만(§3 PR1b). |
| §8 열린 결정 안 닫음 | ✅ §10 에 3건(+PR1a/1b 단) "결정 필요"로. |
| MVP-C 종속 표시 | ✅ §9 에 8지점 + "⚠ 확정 후 정렬" + followup 참조. |
| kit 파일 수정 0 (읽기만) | ✅ 본 문서는 design/ 초안. kit 미수정(읽기만으로 현황·앵커 확인). |
| 앞 3종 초안과 정렬 | ✅ §2/§3 이 pr1a-docs·pr1b-sections·ambiguity-triage 를 가리키고 소유권 경계(PR1a vs PR1b)·최소표+링크·증거6 매핑을 그대로 반영. |

### 잔여 불확실성 (self_check)
- run-report 의 변경 목록 섹션은 실제로 `## Files Changed` **와** `## Diff Summary` 두 개가 있다(템플릿 확인). 증거 ② 매핑은 PR1b 초안을 따라 `## Diff Summary`(+`## Files Changed`)로 적었다 — PR3 작성 시 둘의 역할 분담은 사람이 확정(보수적으로 양쪽 모두 라벨링 권고).
- `docs/workflows/ambiguity-triage.md` 의 **최종 위치/형식**은 사람 미확정(ambiguity-triage.draft.md §8-4). 이 계획은 PR1b 가 그 경로로 신설한다고 가정하되, proposal 로 둘 가능성을 열어둔다.
- PR2~4 가 스킬(`skills/`)로 갈지 순수 스크립트(`scripts/*.mjs` + `package.json`)로 갈지의 **형식**은 이 계획에서 확정하지 않았다(계약만). PR2 착수 *전*에 아래 둘 중 하나로 못박는다 — **A. 스킬 중심**: `skills/workflow-packet/SKILL.md` 위주, npm script 는 없거나 얇은 alias. / **B. 스크립트 중심**: `scripts/workflow-packet.mjs` + `package.json` `workflow:packet`. 현재 초안은 "스킬 + npm script 1줄"로 *양쪽이 섞여* 보여(혼선 소지) 비차단으로 두되, 각 PR 시점에 A/B 를 택한다. **결정 필요.**
