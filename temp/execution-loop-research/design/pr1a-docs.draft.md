> **DRAFT — 적용 금지. MVP-C 안착 후 사람이 검토/적용한다.** 이 문서는 temp/ 안의 설계 초안이며, frontend-workflow-kit/ 의 실제 파일을 수정하지 않는다.

# PR1a 문서 초안 — green≠done + 봉투 안전선 (적용 금지, 텍스트만)

## 머리말

PR1a 는 **문구·문서·affordance 만** 바꾼다. 새 실행경로 0, 새 게이트 0, 전부 markdown, **warning-only**(exit 1 / required check 배선 없음). 핵심 한 줄: *"통과 = 완료가 아니다"* 라는 멘탈모델을, 착각이 생기는 바로 그 지점(README 첫 만남 · 구현 결심 순간 · 봉투 헤더)에 한 번씩 심는다.

**이 PR1a 가 건드리는 파일 (3개, 전부 markdown):**

| 파일 | 변경 요지 | 근거 |
|---|---|---|
| `frontend-workflow-kit/README.md` | "이 킷이 보장하는 것 / 보장하지 않는 것" 섹션 신설(표 + 6 금지착각) | report 05 §4.1 |
| `frontend-workflow-kit/skills/implement-screen/SKILL.md` | "통과≠완료" callout · "## 금지" 1줄 · "애매함 먼저" 지시 1줄 | report 05 §4.1 / 01 |
| `frontend-workflow-kit/templates/work-packet/work-packet.template.md` | 헤더 주석 디스클레이머 1줄 · Validity 무효조건 강화 · Expected Output 반증가능 문구 · Must Read "여기부터" 마커 | report 06 §4.3 |

**PR1a 가 *건드리지 않는* 것 (PR1b 또는 별도 doc 소관 — 여기서 중복 금지):**
- `Ambiguity Review Required` 섹션 본문·`Safe To Proceed?` 표 → **PR1b** (work-packet) + 별도 `docs/workflows/ambiguity-triage.md`(triage rubric 전체).
- work-packet `Blocking Items` 를 "Ambiguity Review 입력원"으로 재서술하는 패치 → **PR1b**.
- work-packet `Review Checklist` 에 `Pre-Implementation Review` 행 추가 → **PR1b**.
- `review-artifact.template.md`(advisory 스키마) · `run-report.template.md`(증거 6개·푸터) → **PR1b**.
- work-packet `Out of Scope` 의 "generated file hand-edit 금지" 문구 → **Phase 0(PR1a/PR1b) 모두 본문 미변경 — 소유 귀속 아님.** 이유: generated 판정 표면이 ⚠ **MVP-C 종속 — Session C generated-file guard 확정 후 정렬**이라 Phase 0 에서는 아무도 이 줄 본문을 건드리지 않는다. 이 섹션의 *채움*은 **PR2(`workflow:packet`)**가 readiness 출력 복사로 수행하되, generated 목록 판정은 guard 확정 후 정렬한다. (pr1b-sections·pr-plan 의 "PR1a 소유" 어감은 이 통일안으로 정정 — 셋 다 같은 진술.)

> 어휘 규칙: 본 초안은 공유 컨텍스트 §3 용어만 쓴다. `verdict`/`blocked` 를 active 용어로 쓰지 않는다(이 두 단어는 PR1b 의 마이그레이션 주석 "구 verdict→review_summary" 에서만 등장).

---

## A. `frontend-workflow-kit/README.md` 패치

### A-0. 현재 구조 (인용)

```md
1  # frontend-workflow-kit
2
3  LLM이 프론트 프로젝트를 **환각 없이** 진행하게 만드는 워크플로우 킷.
4  "LLM이 추론하던 것을 파일로 고정한다" — 상태/판정/검사를 결정적 스크립트로 옮긴다.
5
6  > 현재 단계: **MVP-A** 강제 코어 + **MVP-B Phase 0** 착수분(...)
   ... (이하 블록쿼트 메타 링크들) ...
13 ## MVP-A에 들어있는 것
```

또한 하단에 이미 `## 깨면 안 되는 불변식 (요약)` 섹션(99행~)이 코드펜스 7줄로 존재한다.

### A-1. 삽입 위치 — 인트로(4행)와 `> 현재 단계:`(6행) 사이

근거: README 는 사용자가 멘탈모델을 **처음 만나는 지점**이다(report 05 §3-1: "처음 한 번 강하게"). 멀리 있는 `## 깨면 안 되는 불변식`(99행) 대신, 인트로 직후에 "보장/미보장"을 박아 false reassurance 를 첫 화면에서 차단한다. 단, 같은 문구를 모든 명령에 반복하지 않는다(banner blindness 회피 — 정본은 여기 1곳, SKILL 등은 링크).

4행(`...결정적 스크립트로 옮긴다.`) **다음**, 6행(`> 현재 단계:`) **앞**에 빈 줄 뒤 아래 섹션을 그대로 삽입한다.

````md
## 이 킷이 보장하는 것 / 보장하지 않는 것

스크립트는 **가드레일이지 리뷰어가 아니다.** "검증 없는 루프는 그냥 자동화"다.

| 스크립트가 하는 것 (기계적·결정적) | 스크립트가 **안** 하는 것 (사람·리뷰 몫) |
|---|---|
| readiness = 화면별 구현 가능 **모드의 기계적 상한** 계산 | 이 설계가 **제품적으로 맞는지** 판단 |
| validate = frontmatter·manifest·route·승인메타 등 **구조 검사** | 빠진 상태/엣지케이스/UX/정책 의도 **의미 리뷰** |
| forbidden-paths·test-fixtures = **경로·회귀** 검증 | 기획 의도 반영·납득되는 설계인지 **사람 판단** |
| 통과/실패를 **반복 가능하게** 보고 | candidate→confirmed·Open Decision·Unknown **닫기** |

> **통과 = 완료가 아니다.** 아래는 이 킷에서 *금지된 착각*이다:
> - `readiness 통과` ≠ 설계 리뷰 완료
> - `validate 통과` ≠ 제품적으로 올바름
> - `Unknown open` ≠ 구현해도 항상 안전
> - `draft` ≠ 리뷰 완료
> - `Work Packet` ≠ 구현 허가서
> - `Run Report` ≠ 사람 승인
>
> 스크립트가 초록불을 줘도, **의미·제품 리뷰(사람 또는 Codex)와 confirmed 승인(사람)은 따로** 거쳐야 한다.
````

> 6 금지착각의 정본 위치 = 이 섹션 1곳. SKILL callout 은 "전체 표는 README 참조"로 링크만 한다(report 05 §7-5: 단일 출처 + 나머지 링크로 inconsistency 회피).

### A-2. (선택) 기존 `## 깨면 안 되는 불변식 (요약)` 과의 관계 — 변경 없음

이 신설 섹션은 **불변식 요약(99행)을 대체하지 않는다.** 불변식 요약은 "판정 로직·생성물·단일 출처" 같은 *구현 규율*이고, 신설 섹션은 "통과의 의미 한계" *멘탈모델*이다. 둘은 층위가 달라 공존한다. PR1a 에서 불변식 요약 코드펜스는 손대지 않는다.

---

## B. `frontend-workflow-kit/skills/implement-screen/SKILL.md` 패치

### B-0. 현재 구조 (인용)

```md
6  # implement-screen
7
8  화면 하나를 readiness gate가 허용하는 모드 범위에서만 구현한다.
9  **구현 가능 여부를 직접 판단하지 않는다** — `readiness.mjs` 출력을 그대로 따른다 (판정 로직 단일 출처).
10
11 ## 입력
   ...
14 ## 절차
15
16 1. **상태 집계**: `npm run workflow:state` ...
   ...
46 ## 금지
47 - readiness가 허용하지 않는 모드의 작업.
   ... (4줄) ...
50 - 생성물(`_meta/*.yaml`, `component-catalog.md`) 직접 편집.
```

### B-1. "통과 ≠ 완료" callout — 9행 다음(도입부 끝), 11행 `## 입력` 앞

근거: SKILL 프롬프트는 사용자가 "구현하자"고 결심하는 **행동 지점**이다(report 05 §3-4: JIT). 짧게 1개만(전체 표는 README 로 링크 — SKILL 과적재 금지). 9행(`...판정 로직 단일 출처).`) 다음 빈 줄 뒤, 11행(`## 입력`) 앞에 삽입한다.

```md
> **통과 ≠ 완료.** readiness 가 모드를 열어줘도 그건 *기계적 상한*이지 설계 승인이 아니다.
> validate 통과는 *구조* OK 일 뿐 *제품적으로 맞다*는 뜻이 아니다. 빠진 상태·UX·정책은
> 추측해 메우지 말고 Unknowns / Open Decisions / `global/conflicts.md` 로 남긴다.
> (전체 "하는 것 vs 안 하는 것" → kit README "이 킷이 보장하는 것 / 보장하지 않는 것" 참조.)
```

### B-2. "## 금지" 에 추가할 1줄 — 50행(마지막 금지 항목) 다음

근거: report 05 §4.1 "산출물 ①" 의 SKILL 금지 추가. 통과를 *승인*으로 보고하는 것을 명시적 금지로 박는다. 50행(`- 생성물(...) 직접 편집.`) 다음 줄에 추가한다.

```md
- `readiness 통과 = 설계 OK`, `validate 통과 = 제품 OK` 로 보고하는 것. (통과는 *증거*일 뿐 *승인*이 아니다.)
```

### B-3. "애매함 먼저" 지시 — 절차 3 (게이트 판정) 안에 1줄 보강

근거: 공유 컨텍스트의 SYNTHESIS §1 "시스템의 첫 질문 = '구현 가능?'이 아니라 '애매한 거 놓친 거 없나?'" 를 *문구로만* 심는다. **주의(중복 방지):** `Ambiguity Review Required` 섹션 신설·triage rubric·SC5/SC6 배선은 **여기 아님**(PR1b / 별도 doc / Phase 2). PR1a 에서는 기존 절차 3의 "추측해 메우지 않는다" 옆에 **순서 우선순위 한 줄**만 더한다.

현재 28행:
```md
   - 막힌 항목(미확정 API, figma mapping 부재 등)은 추측해서 메우지 않는다. ScreenSpec 의 Unknowns / `global/conflicts.md` 에 남긴다.
```

이 줄 **다음**(절차 3 블록 끝)에 한 줄 추가:
```md
   - **애매함은 구현보다 먼저 표면화한다.** 구현 가능 여부보다 "놓친 애매함이 없는가"를 먼저 확인하고, 애매하면 추측 구현 대신 멈춰서 Unknowns / Open Decisions 로 남기고 보고한다. (게이트화 아님 — warning-only 지시.)
```

> 이 줄은 *지시(텍스트)* 일 뿐 exit 1 / 정지 로직이 아니다(공유 컨텍스트 §4: warning-first). auto-stop 상태기계(HALT_AMBIGUITY)는 PR4 소관이다.

---

## C. `frontend-workflow-kit/templates/work-packet/work-packet.template.md` 패치

> PR1a 의 work-packet 범위는 **헤더 주석 · Validity · Expected Output · Must Read** 4곳뿐이다. Blocking Items / Review Checklist / Ambiguity Review 는 **PR1b**.

### C-1. 헤더 주석 디스클레이머 1줄 — 14~24행 HTML 주석 블록 안

#### 현재 구조 (인용)
```md
14 <!--
15   Work Packet 은 새로운 source of truth 도, 새로운 gate 도 아니다.
16   기존 readiness gate 를 "한 세션 단위"로 포장하는 실행 봉투(execution envelope)일 뿐이다.
17   작성 규칙:
18   - ScreenSpec 을 복사하지 않는다 — Must Read 에서 링크만 건다. 정본은 ScreenSpec/decision-log.
19   - readiness 를 재계산하지 않는다 — readiness output(또는 run-report)을 그대로 소비한다.
20   - allowed_paths / forbidden_paths 는 readiness output 에서 그대로 복사한다 (재유도 금지).
21   - 이 packet 은 Open Decision / Conflict / Unknown 을 닫지 않는다. 나열만 하고 "닫지 말 것"으로 둔다.
22   - requested_mode 가 readiness_mode 보다 높아도 ... (생략) ...
23   - 판정 단일 출처: readiness.mjs. 이 packet 은 그 출력을 옮기는 인덱스/핸드오프 보드다.
24 -->
```

#### 추가 (수정): 17행 `작성 규칙:` 바로 위, 16행과 17행 사이에 디스클레이머 1줄을 끼운다

근거: report 05 §4.3 A1·A5 — "Work Packet = 구현 허가" 착각을 아티팩트에 내장(아티팩트당 1회). 봉투가 "무엇을 보장 안 하는지"를 헤더 주석 최상단(작성 규칙 직전)에서 못박는다.

16행(`...실행 봉투(execution envelope)일 뿐이다.`)와 17행(`작성 규칙:`) 사이에 삽입할 줄:
```md
  통과 ≠ 완료: 이 봉투가 발급됐다는 것은 readiness 게이트가 깨끗하고 경로/모드 상한이 정해졌다는 뜻일 뿐,
  설계가 제품적으로 맞다는 승인도 구현 허가서도 아니다. 모드 상한·경로는 기계가 정했지만 설계 적합성은 사람이 따로 확인한다.
```

> 본문(렌더되는 H1 `# Work Packet:` 아래)에 별도 배너를 넣는 안(report 05 §4.3 "Work Packet 헤더 카피")도 있으나, PR1a 는 **얇은 봉투** 원칙(report 06 §6-③ 과명세 회피)에 따라 *주석 1줄*로 최소화한다. 사용자-facing 배너 추가 여부는 §8 열린 결정으로 남긴다(아래 "열린 결정" 참조).

### C-2. Validity 무효조건 강화 — 33~38행 섹션 교체

#### 현재 구조 (인용)
```md
33 ## Validity
34 <!-- 이 packet 이 유효한 전제. readiness_source 의 mode/facts 가 바뀌면 이 packet 은 무효다 (재발급).
35      스냅샷 시점(날짜)과 그때의 ScreenSpec status·Open Decision 상태를 명시한다. -->
36 - 기준 스냅샷: `{readiness_source}` (실행/확인 시점: {YYYY-MM-DD}).
37 - 전제: `readiness_mode` = `{readiness_mode}`, ScreenSpec `status` = `{status}`. 이 값이 바뀌면 packet 무효 → 재발급.
38 - Open Decision 스냅샷: 아래 Blocking Items 의 항목/상태는 {YYYY-MM-DD} 기준. 새 결정이 열리거나 닫히면 readiness 부터 다시 돌린다.
```

#### 교체안 (수정): 무효조건을 **명시 체크리스트**로 날카롭게

근거: report 06 §2.3·§3-2 — 핸드오프의 흔한 실패가 stale snapshot 이고 repo 방어선이 Validity 다. "mode/facts 가 바뀌면 무효"를 추상 문장에서 **항목별 무효조건 리스트**로 승격해 사람이 stale 을 감지하기 쉽게 한다. **단, 자동 stale 검사 스크립트는 만들지 않는다**(report 06 §6-④, 공유 컨텍스트 §8: "Validity stale 을 자동 검사 스크립트로" = 금지). 무효 판정은 **사람이 확인하는 assertion** 으로 둔다.

33~38행을 아래로 교체한다:
```md
## Validity
<!-- 이 packet 이 유효한 전제. 아래 무효조건 중 하나라도 바뀌면 packet 무효 → readiness 부터 재실행 후 재발급.
     스냅샷은 readiness 출력만 복사한다(정본 복사 금지). 정본 변화 감지는 사람이 한다 — 자동 stale 검사 스크립트로 만들지 않는다(게이트화 금지). -->
- 기준 스냅샷: `{readiness_source}` (실행/확인 시점: {YYYY-MM-DD}).
- **무효조건 (하나라도 바뀌면 무효 → 재발급):**
  - [ ] readiness 재실행 결과의 `readiness_mode` 가 `{readiness_mode}` 와 달라짐.
  - [ ] `readiness_source` 의 mode/facts(천장 근거 fact·allowed/forbidden)가 달라짐.
  - [ ] ScreenSpec `status` 가 `{status}` 와 달라짐.
  - [ ] Blocking Items 의 Open Decision 이 새로 열리거나 닫힘.
  - [ ] `readiness_source` 파일 자체가 갱신됨(날짜/내용 변경).
- 이 packet 은 스냅샷이다. 위 항목이 의심되면 집행 **전** `npm run workflow:readiness` 로 대조한다(사람 확인 — 자동 차단 아님).
```

> 변경 성격: 기존 3개 산문 항목 → 1개 스냅샷 줄 + 5개 무효조건 체크 + 1개 대조 지시. "무효 = 재발급 트리거"이지 "집행 차단 게이트"가 아님을 명시(report 06 §6-①: stage-gate 화 금지).
>
> ⚠ **MVP-C 종속 — Session C generated-file guard 확정 후 정렬:** 위 무효조건의 "`readiness_source` 파일 자체가 갱신됨" 항목에서, `readiness_source` 가 generated 산출물(예: `_meta/*.yaml`·run-report)을 가리킬 때 "무엇을 갱신으로 볼지(generated 헤더/`generated_at` 한 줄 변화는 무효 아님 등)"의 판정은 Session C 의 generated-file guard 표면이 확정된 뒤 맞춘다. PR1a 에서는 문구만 두고 generated 판정 규칙을 박지 않는다.

### C-3. Expected Output 반증가능(falsifiable) 문구 — 86~92행 섹션 보강

#### 현재 구조 (인용)
```md
86 ## Expected Output
87 <!-- 이 모드에서 "정답"인 산출물 형태를 못박는다. 모드별 정답 형태 예:
88        docs-only        = docs/frontend-workflow/** 문서만.
89        route-skeleton   = src/app/** 라우트 엔트리만 (features 무접촉).
90        screen-skeleton  = 화면 shell only (fixture UI·fake hook 없음).
91        rough-fixture-ui = fixture 데이터로 구동되는 거친 UI (src/api 무접촉, fake hook 계약). -->
92 {`{readiness_mode}` 에서 정답인 산출물 형태를 한 줄로. 상위 모드 산출물(예: fixture UI, API 연동)은 정답이 아니다.}
```

#### 교체안 (수정): prose 대신 **이진 판정 가능한 검증 문장**으로

근거: report 06 §3-3 — Kiro EARS 의 falsifiable AC 정신을 차용하되 **EARS 문법은 미채택**(SYNTHESIS §3·§8: 채택 안 함, 정신만). Expected Output 이 산문이면 "만족/위반"을 이진 판정하기 어려우므로, "X 가 존재하고 Y 는 부재" 또는 "WHEN…THEN…(정신)" 형태의 *체크가능 문장*으로 적도록 주석과 플레이스홀더를 보강한다.

86~92행을 아래로 교체한다:
```md
## Expected Output
<!-- 이 모드에서 "정답"인 산출물을 *이진 판정 가능*하게 적는다. 산문 대신 검증 문장으로 (EARS 정신 — 문법은 채택 안 함).
     좋은 형태: "X 가 존재하고 Y 는 부재" / "WHEN <조건> THEN <관측 가능한 결과>" / "<경로>에 변경 N개, allowed 밖 0개".
     모드별 정답 형태 예:
       docs-only        = docs/frontend-workflow/** 문서만 변경; src/** 변경 0 (git diff 로 확인).
       route-skeleton   = src/app/** 라우트 엔트리만 존재; features/** 무접촉.
       screen-skeleton  = WHEN 라우트 진입 THEN 화면 shell 렌더; fixture UI·fake hook 부재.
       rough-fixture-ui = fixture 데이터로 화면 구동; src/api/** 변경 0; fake hook(AsyncState) 계약 충족. -->
{`{readiness_mode}` 의 정답 산출물을, 만족/위반을 이진 판정할 수 있는 1~2개 문장으로. 상위 모드 산출물(예: fixture UI·API 연동)은 정답이 아니다.}
```

> 변경 성격: 모드 예시를 *산문 명사구*에서 *이진 체크 문장*으로 바꾸고, 플레이스홀더에 "이진 판정 가능"을 명시. 새 게이트 아님 — 이 문장들은 Acceptance Criteria(이미 `git diff`/`exit 0` 이진검사)가 검증하는 대상의 *기술 방식*만 또렷이 한다.

### C-4. Must Read "여기부터(start here)" 마커 — 40~45행 섹션 보강

#### 현재 구조 (인용)
```md
40 ## Must Read
41 <!-- 복사하지 말고 링크만. 구현자는 정본을 직접 읽는다. -->
42 - ScreenSpec (정본): `{docs/.../domains/{domain}/screens/{screen}/screen-spec.md}`
43 - readiness output / run-report: `{readiness_source}`
44 - 관련 정책: `frontend-workflow-kit/policies/implementation-mode-policy.yaml`
45 - (해당 시) Open Decisions / Conflicts: `{open-decisions.md}` · `{global/conflicts.md}`
```

#### 교체안 (수정): 첫 줄에 "▶ 여기부터" 우선순위 마커

근거: report 06 §2.3·§4.3-(e) — 우선순위 없는 링크 더미는 noise. cold-실행 에이전트가 "어디부터"를 알게 첫 줄에 게이트 사실의 출처(`readiness_source`)를 "▶ 여기부터"로 올린다(hot-start 힌트). 링크-not-copy 원칙은 유지.

40~45행을 아래로 교체한다:
```md
## Must Read
<!-- 복사하지 말고 링크만. 구현자는 정본을 직접 읽는다. 우선순위 없는 링크 더미는 noise — 첫 줄에 "여기부터"를 둔다. -->
- ▶ **여기부터**: `{readiness_source}` — 이 세션의 게이트 사실(allowed/forbidden/mode)의 출처. readiness output / run-report.
- ScreenSpec (정본): `{docs/.../domains/{domain}/screens/{screen}/screen-spec.md}`
- 관련 정책: `frontend-workflow-kit/policies/implementation-mode-policy.yaml`
- (해당 시) Open Decisions / Conflicts: `{open-decisions.md}` · `{global/conflicts.md}`
```

> 변경 성격: 기존 2행(ScreenSpec 첫째, readiness 둘째)의 순서를 바꿔 `readiness_source` 를 "▶ 여기부터"로 첫 줄에 올리고, ScreenSpec 은 정본 링크로 둘째에 둔다. 항목 수·링크-only 원칙 불변.

---

## D. 적용 범위·안전선 요약 (리뷰어용)

| 파일 | 추가/수정 지점 | 새 실행경로 | 새 게이트 | warning-only |
|---|---|---|---|---|
| README.md | 4행·6행 사이 신설 섹션(표 + 6 금지착각) | 없음 | 없음 | ✅ (문서) |
| SKILL.md | 9행 뒤 callout · 50행 뒤 금지 1줄 · 절차 3에 "애매함 먼저" 1줄 | 없음 | 없음 | ✅ (지시 텍스트) |
| work-packet.template.md | 헤더 주석 1줄 · Validity 무효조건 리스트 · Expected Output 이진문장 · Must Read "여기부터" | 없음 | 없음 | ✅ (템플릿 주석/플레이스홀더) |

**불변식 점검 (공유 컨텍스트 §2):**
- 불변식 1(readiness 단일 출처): 어떤 문구도 readiness 를 재계산/대체하지 않음. Validity 무효조건은 *사람 확인 assertion* 이지 자동 판정 아님.
- 불변식 2(봉투는 복사만): Must Read 는 link-not-copy 유지, Validity 는 readiness 출력만 스냅샷.
- 불변식 6(첫 구현은 auto-stop): "애매함 먼저" 지시는 표면화·멈춤 권고지 exit 1 아님.
- 불변식 7(스크립트는 가드레일): README 표가 "통과=충분 금지"를 정면으로 박음.
- §9.6 "절대 코드화 금지" 중 본 PR 관련 2건 — "PASS 디스클레이머를 exit 1 게이트로"·"Validity stale 을 자동 검사 스크립트로" — 둘 다 **문구/주석으로만** 두고 코드화하지 않음.

---

## E. 열린 결정 (닫지 않음 — 사람 몫, 공유 컨텍스트 §9)

PR1a 텍스트를 적용할 때 사람이 정해야 할 것(임의로 닫지 않음):
1. **C-1 봉투 디스클레이머 위치**: 헤더 *주석 1줄*(본 초안 채택, 얇은 봉투 우선) vs 본문 렌더 배너(report 05 §4.3 카피). → 사용자-facing 가시성 vs 과명세의 트레이드오프, 사람이 결정. (§8-3 digest 병기와 무관 — 별개 결정.)
2. **6 금지착각 정본 위치 확정**: 본 초안은 README 1곳 정본 + SKILL 링크. roadmap 등 다른 문서에도 분산 인용할지(inconsistency 회피 위해 단일 출처 권고 — 사람 확정).
3. **톤/이모지 통일**: callout 의 `▶`·존댓말 vs README 평서·간결체 혼재(report 05 §7-4). repo 문서 톤에 맞춰 사람이 통일.
4. **(§8 그대로 유지)** Ambiguity 입력 계약 포맷 · v1 순수 auto-stop 확정 · digest 병기 — PR1a 범위 밖, 닫지 않음.

---

## F. 참고 — 본 초안의 근거 매핑

| PR1a 항목 | 정본 근거 |
|---|---|
| A "하는 것 vs 안 하는 것" 표 + 6 금지착각 | reports/05 §4.1 산출물 ①, §3-1 |
| B 통과≠완료 callout / 금지 1줄 | reports/05 §4.1 삽입위치 B |
| B "애매함 먼저" 지시 | SYNTHESIS §1(첫 질문), 공유 컨텍스트 §4(warning-first) |
| C-1 헤더 디스클레이머 | reports/05 §4.3 A1·A5 |
| C-2 Validity 무효조건 | reports/06 §3-2·§4.3-(a), §6-④(자동화 금지) |
| C-3 Expected Output 반증가능 | reports/06 §3-3·§4.3-(b), SYNTHESIS §3(EARS 정신만) |
| C-4 Must Read "여기부터" | reports/06 §4.3-(e) |
| PR1a/PR1b 경계 | SYNTHESIS §9.5 |
