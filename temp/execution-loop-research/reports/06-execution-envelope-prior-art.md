---
track: 06
title: 실행 봉투 / 플랜파일 / spec-driven 선행사례 비교
date: 2026-06-14
status: draft
inputs: [notes/01-loop-engineering.md, notes/02-llm-only-scriptization-risk.md]
---

# Track 06 — 실행 봉투 / 플랜파일 / spec-driven 선행사례 비교

> **증거 신뢰도 (전용 검증 패스 완료, 2026-06-14)**: 초기 deep-research 하니스는 레이트리밋으로 Kiro 2건만 검증했으나, 이후 **전용 적대적 검증 패스**(도구별 fact-checker 8개, 공식 문서 우선 반박-mandate)를 돌려 비교표 주장 대부분을 1차 출처로 재확인했다. 표기: 〔검증〕=적대적 검증 통과(공식 문서) · 〔검증·정정〕=검증 중 사실 정정됨 · 〔웹〕=교차했으나 일부 단일출처/프레이밍 주의.
>
> **검증으로 정정된 것(4건)**: (1) Claude plan mode 는 plan 을 디스크(`~/.claude/plans/`, `plansDirectory`)에 **기록**한다 — "ephemeral/비영속" 표현은 틀림(같은 세션 집행용 내부 산출물이지 자동 cross-agent cold-핸드오프는 아님). (2) OpenHands 의 1차 에이전트는 **CodeActAgent**, 사람 개입은 *반응형*(실행 중 인터럽트) — "Planning Agent plan→리뷰→구현" 사전승인 게이트는 1차 출처 미확인. (3) SWE-agent ACI 는 인간 IDE 모사가 **아니라** LM 에이전트 전용 설계(인간용 인터페이스는 에이전트에 suboptimal 이라는 게 논지). (4) 핸드오프 stale 은 "최빈"이 아니라 "흔한" 실패모드 — summary 손실(Factory.ai 실측)이 더 강한 근거.
>
> **Kiro 주의**: 내부 파일 레이아웃(3-파일 분리·per-task 게이팅 메타데이터·6 steering 파일)은 적대적 검증에서 **반박**됨 — 확인된 두 행위(EARS식 AC, `.kiro/hooks/` 파일와처 훅)만 인용한다.

## 1. Executive summary

- **게이트는 문서가 아니라 별도 실행 레이어에 있어야 한다** 〔검증〕. Kiro는 표준 강제를 스펙 문서가 아니라 버전관리되는 파일와처 훅(`.kiro/hooks/`)으로 분리한다. 이는 Work Packet 불변식("봉투는 인덱스, 판정은 `readiness.mjs`")을 **선행사례가 입증**하는 형태다. → Work Packet은 지금 구조(Commands가 `workflow:readiness/validate` 호출, 경계는 diff로 검사)를 유지하면 된다.
- **falsifiable(반증가능) 수락기준이 cold-실행의 핵심** 〔검증〕. Kiro는 EARS식("WHEN [event] THE SYSTEM SHALL [behavior]") AC로 요구사항을 prose가 아닌 테스트가능 형태로 만든다. Work Packet의 Acceptance Criteria는 이미 이진검사(`git diff`, `exit 0`)라 이 원칙을 구현 중 — **새 섹션이 아니라 Expected Output 문구를 더 반증가능하게** 다듬는 것이 개선점이다.
- **선행사례 대부분은 "spec/plan = 정본" 모델인데, Work Packet은 정반대다** 〔검증〕. Spec Kit은 "specification becomes the primary artifact, code is its expression"라고 못박는다(1차 출처 직접 인용 확인). Work Packet은 명시적으로 **정본이 아니다** — readiness 출력만 스냅샷 복사하고 ScreenSpec/decision-log는 링크만 한다. 이 "정본 아님 + 게이트 아님 + 결정 안 닫음"이 고유 포지셔닝이다.
- **가장 위험한 안티패턴은 "준비 기준의 stage-gate화"** 〔검증, 직접 관련〕. Mike Cohn(Mountain Goat): DoR이 "X가 100% 끝나야 Y 시작" 규칙이 되면 곧 waterfall이다(원문 직접 인용 확인). 이는 "Work Packet/Unknown을 readiness 게이트로 만들지 말라"는 repo 불변식과 **정확히 같은 교훈**이다.
- **핸드오프의 흔한 실패모드는 stale snapshot + summary 손실** 〔검증·정정〕. stale 컨텍스트는 널리 인정된 실패모드("최빈"이라 단정은 과함), 그리고 요약 핸드오프는 "요약이 이미 참이라 암시한 것"을 잃어 받는 쪽이 납작한 현실 위에서 결정한다(Factory.ai 36k 메시지 실측). → Work Packet의 link-not-copy(정본은 링크) + Validity(스냅샷 날짜·무효조건)가 바로 이 방어책. **개선 1순위는 Validity 무효조건을 더 날카롭게.**
- **과명세를 경계하라** 〔검증〕. Spec Kit으로 "현재 날짜 표시" 한 기능에 8파일·~1,300줄(text/spec 출력)이 생성된 사례(Marmelab). Work Packet은 얇은 인덱스로 남아야 한다 — 복사 대신 링크, 새 축 추가 금지.

## 2. Prior art & findings

### 2.1 리서치 질문 1 — 도구별 작업 단위 스코프·게이트·핸드오프

**Claude Code plan mode** 〔검증·정정, 1차 출처 도큐〕. `plan`은 권한 모드로 "**Reads only**"다 — Claude가 파일을 읽고 탐색용 셸을 돌려 plan을 작성하지만 소스는 편집하지 않는다. plan 완성 시 "presents it and asks how to proceed": 승인+auto / 승인+accept edits / 승인+수동 리뷰 / 계속 planning / Ultraplan 정제. **승인이 곧 게이트**이며 승인하면 plan 모드를 빠져나가 편집을 시작한다(`Shift+Tab` 순환 또는 `/plan`, `Ctrl+G`로 plan 편집). **정정**: plan은 디스크에 파일로 **기록된다**(`~/.claude/plans/`, `plansDirectory` 설정) — 단 이는 *같은 세션* 집행용 내부 산출물이지, 다른 cold 에이전트가 재집행하는 공유 핸드오프로 설계된 것은 아니다. [8][9][27]

**GitHub Spec Kit (spec-driven development)** 〔검증, 1차 출처 repo〕. `/speckit.constitution → /speckit.specify → (clarify) → /speckit.plan → /speckit.tasks → /speckit.implement` 흐름으로 feature 디렉토리에 `spec.md`(user story+acceptance criteria)·`plan.md`·`research.md`·`data-model.md`·`contracts/`·`quickstart.md`·`tasks.md`를 생성한다. feature 자동 번호(001/002…)+브랜치. **정본은 spec**(직접 인용 확인): "The specification becomes the primary artifact. Code becomes its expression in a particular language and framework." 게이트: constitutional gates(Simplicity/Anti-Abstraction/Integration-First, **에이전트가 통과 또는 정당화** 강제) + Test-First(Article III) "Tests are validated and **approved by the user**" 후에야 구현. 사람의 명시 승인 지점은 TDD 테스트 승인 단계. [4][5][6]

**AWS Kiro (spec/steering + hooks)** 〔검증〕. 두 가지가 적대적 검증을 통과했다:
1. **EARS식 falsifiable AC** (3-0): 공식 문서가 AC를 EARS 표기로 명시 — "Unambiguous and testable. Easy to translate into test cases. Traceable through implementation." [1][2]
2. **표준 강제 = 별도 실행 레이어** (2-0): agent hooks는 "automated triggers that execute predefined agent prompts or shell commands when specific events occur"로 `.kiro/hooks/`에 버전관리 JSON으로 존재하며 파일와처 이벤트 + spec-task 전후에 발화한다 — **스펙 문서와 구별되는 메커니즘**. [1][3]
   - ⚠️ **반박된 주장(사실 기술 금지)**: requirements.md/design.md/tasks.md 3-파일 분리, tasks.md의 per-task 게이팅 메타데이터(status/dependencies/effort/AC), `.kiro/steering/`의 6개 표준 파일 — 모두 검증 실패. Kiro의 정확한 내부 레이아웃은 **단언하지 않는다**.

**Aider** 〔검증〕. **architect 모드** = 2-모델 워크플로(architect가 설계, editor가 적용; 2파일 이상/구조변경 시 권장). **tree-sitter repo map**으로 전체 파일을 컨텍스트에 안 올리고도 관련 심볼/정의 제공(=복사 대신 참조). **자동 git commit**(기본; `--no-auto-commits`로 끔): 성공한 AI 편집마다 모델이 쓴 설명 메시지로 독립 커밋 → 변경 단위 provenance가 git에 박힌다(선행 dirty 변경은 먼저 별도 커밋). edit format(diff/whole/editor-diff/editor-whole)으로 적용. 게이트는 약함(승인보다 사후 diff 리뷰 모델). [10][11]

**Cursor** 〔검증〕. `.cursor/rules`(MDC) — glob으로 스코프되는 규칙 파일, 4개 활성화 모드(현 UI 명: Always Apply / Apply Intelligently[description] / Apply to Specific Files[glob] / Apply Manually[@rule] — 구명 Auto Attached·Agent Requested). 규칙은 "팀 단위 시스템 프롬프트"로 **지속 컨텍스트 주입**이지 경계 강제(path allow/deny)가 아니다. Cursor는 별도 **Plan Mode**(Shift+Tab 토글)도 보유 — 편집 전 리뷰가능 plan(.md)을 만들어 승인 후 빌드. 레거시 단일 `.cursorrules`는 스코프/활성화 로직 없음(deprecated 예정). [12][13][29]

**Devin** 〔검증〕. **interactive planning**이 파일을 건드리기 전 written multi-step plan 생성(코드 인용 포함). **confidence 신호 🟢🟡🔴** — 작업 성공과 상관(🟢는 🔴 대비 머지 PR 2배, Devin 2.1 직접 인용). **불확실하면 사용자 승인 대기, 확신하면 자동 진행 + async 피드백**(기본 30초 대기, 설정가능). 학습 내용을 context-rich 프롬프트로 만들어 Agent 세션에 **핸드오프**. **Knowledge**(세션 간 자동 회상 컨텍스트)와 **Playbooks**(반복 작업용 재사용 프롬프트)는 **별개** 기능. [14][15][16][30]

**OpenHands(구 OpenDevin) / SWE-agent** 〔검증·정정〕. OpenHands: 1차 에이전트는 **CodeActAgent**(통합 code-action 공간)이고, 사람 개입은 *반응형*(실행 중 인터럽트/피드백)이다 — 논문/공식에 "Planning Agent가 plan→사용자 리뷰→구현"하는 사전승인 게이트는 **확인되지 않음**(literal "Planning Agent"는 내부 TODO 트래킹, 사용자 리뷰 없음). SWE-agent: **ACI**가 파일 생성/수정·코드베이스 탐색·테스트 실행을 보강해 GPT-4 성능을 3.8%→~12.5%로 끌어올린다. **정정**: ACI는 "인간 IDE 모사"가 **아니다** — 논문 논지는 *인간용 인터페이스(셸 등)는 LM 에이전트에 suboptimal*, ACI는 **에이전트 전용**(단순/간결 액션·간결 피드백·가드레일)으로 설계해야 한다는 것. [17][18][19][28]

### 2.2 리서치 질문 2 — spec-driven / DoR·DoD / plan-file / 핸드오프 베스트 프랙티스 & 실패모드

**DoR/DoD 베스트 프랙티스** 〔검증〕. DoR은 clarity·completeness·testability·feasibility를 본다 — 명확한 AC, 추정 공수, 식별된 의존성, 가용한 디자인/목업. "무엇이 빠졌는지 대화를 강제"한다. DoD는 "아무리 엉성해도 명시적으로 articulate되어야" 한다. [20][21]

**핵심 실패모드 — DoR의 stage-gate화** 〔검증, 본 트랙에 직접 관련〕. Mike Cohn(원문 직접 인용): "If these rules include saying that something must be 100 percent finished before a story can be brought into an iteration, the definition of ready becomes a huge step towards a sequential, **stage-gate approach**" = waterfall. 권고: 하드 규칙 대신 유연한 가이드라인("detailed mockup 필수" → "sufficiently far along"). **DoR을 가벼운 도구로 유지, 게이트로 굳히지 말 것.** [20]

**spec-driven 실패모드** 〔검증, Marmelab 1차 분석〕. "현재 날짜 표시" 기능 하나에 Spec Kit이 **8파일·~1,300줄(text/spec 출력, 실행 코드 아님)** 생성. 7대 실패모드: ① context blindness(기존 함수 놓침) ② 과도한 문서(전략 사고 대신 MD 읽기에 시간) ③ 불필요한 복잡성(가상 코너케이스·overkill) ④ 용어 오용(DB 저장을 "user story"로) ⑤ **doubled review**(스펙의 코드 + 최종 구현 둘 다 리뷰) ⑥ **spec drift**(한 에이전트가 단위테스트 안 쓰고 "검증 완료" 표시 — 결정/검증을 멋대로 닫음) ⑦ diminishing returns(큰 기존 코드베이스엔 "mostly unusable"). Thoughtworks Tech Radar(Vol.34, Assess): "elaborate and opinionated," "bitter lesson — handcrafting detailed rules for AI ultimately doesn't scale." **언제 쓰지 말까**: 사소한 변경(버튼 색)·대형 기존 코드베이스. [22][23][34]

### 2.3 리서치 질문 3 — cold-실행 가능 핸드오프의 구성요소

〔검증·정정〕 **컨텍스트 과적재 안티패턴**: "뭔가 하기 전에 모든 컨텍스트를 로드"하면 reasoning이 저하된다(Milvus "context overload", Factory.ai). 받는 쪽에 *우선순위 있는 신호*를 줘야 한다. (주의: "정보 우선순위 없으면 noise" / "hot vs cold start" 슬로건은 한 실무자 블로그 프레이밍 — 개념은 타당하나 확립 용어 아님.) 실무: 세션 끝에 decisions/handoff 파일을 갱신(한 것·결정·다음 시작점)은 폭넓게 corroborate됨(단 "사람이 읽을 수 있게" vs "결정적 replay 우선"은 프레임워크별로 갈림).

**stale context = 흔한 실패모드** 〔검증, "최빈"은 과함〕: stale/outdated 컨텍스트는 여러 출처가 인정하는 실패모드(Milvus "context rot", Anthropic engineering, LogRocket) — 단 drift·overload·poisoning과 나란히 나열될 뿐 "1위"라 단정 못한다. **summary 핸드오프 손실**(가장 강한 근거): Factory.ai가 실제 36,000 메시지로 측정 — 요약은 file path·결정을 조용히 떨어뜨려(artifact trail 2.19–2.45/5) 받는 에이전트가 납작해진 현실 위에서 확신에 차 결정. (널리 인용되는 "37% 보존" 수치는 1차 출처 미확인 — 방향성만 인용.) 권고: 게이트 사실은 스냅샷, 정본은 링크, 스냅샷엔 날짜/무효조건. [24][25][31][32][33]

→ **스냅샷 vs 링크 경계의 답**: 게이트 판정에 직접 쓰이는 사실(allowed/forbidden/mode)은 **스냅샷 복사**(받는 쪽이 정본 파싱 없이 즉시 집행 = hot start)하되, 변하기 쉽고 길고 정본인 narrative(ScreenSpec/decision-log)는 **링크**(복사하면 stale 위험)한다. 스냅샷에는 **날짜와 무효조건**을 박아 stale을 사람이 감지하게 한다. 이게 Work Packet이 이미 하는 일이다.

## 3. Recommendation for k-frontend-workflow

1. **현 분리 구조를 유지하라(차용, 아니 이미 정렬됨)**. Kiro의 "게이트≠문서" 〔검증〕는 Work Packet 불변식을 입증한다. Work Packet의 Commands가 `workflow:readiness/validate`를 호출하고 경계는 diff로 보는 현 설계가 정답 — **Kiro식 hooks를 Work Packet 안의 2차 게이트로 들이지 말 것**(invariant 위반).

2. **Validity의 stale 방어를 1순위로 강화하라**. 핸드오프의 흔한 실패(stale snapshot) 〔검증·정정〕에 대한 repo의 방어선이 바로 Validity다. `readiness_source` 경로 + **확인 날짜** + **무효조건**(readiness_mode/ScreenSpec status/Open Decision 변경 시 재발급)을 더 날카롭게. 단, **자동 stale 검사 스크립트는 만들지 말 것** — 그건 게이트화이고 단일출처 불변식과 충돌(§5 긴장 참조). 사람이 확인하는 assertion으로 둔다.

3. **Expected Output을 더 falsifiable하게(EARS 정신)**. Kiro EARS 〔검증〕는 새 섹션이 아니라 **문구 정렬**이다. Acceptance Criteria는 이미 이진검사라 좋다. Expected Output("정답 산출물 형태")이 prose면 "WHEN/THEN" 또는 "X가 존재하고 Y는 부재"식 체크가능 문장으로.

4. **Ambiguity Review / Pre-Implementation Review는 새 섹션·새 게이트로 만들지 말고 기존 섹션에 접어 넣어라**(open question 답). Review는 독립 축이 아니라 Work Packet 안의 evidence(invariant 9):
   - **Ambiguity Review** → **Blocking Items**의 입력원(사전 점검에서 표면화된 애매함이 Blocking Items 행이 되고 owner=사람, close 금지).
   - **Pre-Implementation Review** → **Review Checklist**의 한 행(증거 체크, verdict ≠ 머지 차단).

5. **과명세 회피 = 얇게 유지**. Marmelab ~1,300줄(text) 교훈 〔검증〕. Work Packet은 인덱스다 — 복사 대신 링크, 새 산출물 축 금지.

## 4. Concrete deliverable

### 4.1 비교표 — 도구 → 스코프 → 게이팅 → 핸드오프 → 차용/회피

| 도구 | 작업 스코프 방식 | 게이팅(승인/경계) | 핸드오프 형식 | 차용할 점 | 회피할 점 |
|---|---|---|---|---|---|
| **Claude Code plan mode** 〔검증·정정〕 | read-only 탐색 후 단계별 plan | **승인 게이트**: plan 제시→사람 승인해야 편집. read-only 강제 | plan을 디스크 파일로 기록(`~/.claude/plans/`)하나 *같은 세션* 집행용(`Ctrl+G` 편집) | "읽기전용 탐색→계획→승인" 분리; 실행 전 리뷰가 쌈 | plan은 cross-agent 재집행용 핸드오프로 설계된 게 아님 → WP가 메우는 빈칸 |
| **GitHub Spec Kit** 〔검증〕 | `/constitution→/specify→/plan→/tasks→/implement`로 spec/plan/tasks 파일, feature 번호+브랜치 | **spec=정본**; constitutional gates(통과/정당화) + 테스트 사용자 승인 후 구현 | 영속 파일 세트(feature 디렉토리) | falsifiable AC, tasks 분해, 명시적 사람 승인 체크포인트 | spec=정본 모델(WP는 정본 아님); 과명세(~1,300줄 text); 게이트를 문서에 내장 |
| **AWS Kiro** 〔검증〕 | spec + steering(정확한 레이아웃 미검증) | EARS AC; 표준은 **`.kiro/hooks/` 파일와처 훅(스펙과 분리된 실행 레이어)** | spec 문서 + 훅 | **게이트≠문서**(강제는 별도 레이어에); EARS falsifiable AC | 훅을 WP 안 2차 게이트로 복제 금지 |
| **Aider** 〔검증〕 | tree-sitter **repo map**으로 컨텍스트 참조; architect/editor 2-pass | 약한 게이트(사후 diff 리뷰; 자동 commit 기본·비활성가능) | **git commit**(편집마다 1커밋, 모델 설명) | 변경=커밋 단위 provenance; repo-map=복사 대신 참조 | 자동 진행(승인 약함)→ 결정 닫힘 위험 |
| **Cursor** 〔검증〕 | `.cursor/rules`(MDC) **glob 스코프**; 4 활성화 모드 + 별도 Plan Mode | 규칙=지속 컨텍스트 주입(게이트 아님) | rules `.mdc` 파일 + Plan Mode plan(.md) | glob 스코프 규칙 = `allowed_paths`식 경계 표현의 참고 | 규칙은 컨텍스트일 뿐 경계 강제 아님 |
| **Devin** 〔검증〕 | interactive planning: 파일 전 written multi-step plan | **confidence 🟢🟡🔴**; 불확실→승인 대기, 확신→자동 진행 | Agent 세션行 context-rich 프롬프트 + **Knowledge**/Playbooks(별개) | confidence = cold-start 위험 신호; 핸드오프 프롬프트 패턴 | 자동 진행 + 결정 닫기(사람-전용 불변식 위반) |
| **OpenHands / SWE-agent** 〔검증·정정〕 | OpenHands=**CodeActAgent**(통합 code-action); SWE-agent=**ACI**(에이전트 전용 제한 도구) | OpenHands 사람 개입은 *반응형*(중간 인터럽트), 사전 plan-승인 게이트 미확인 | 이벤트 스트림(plan→리뷰→구현은 1차 미확인) | ACI=잘 설계된 *에이전트 전용* 제한 도구가 성능↑(3.8→12.5%) | "인간 IDE 모사"로 오해 금지; 완전 자율=검증 없는 루프 위험 |
| **(관행) DoR/DoD** 〔검증〕 | 시작/완료 기준 체크리스트(AC·의존성·목업) | DoR=시작 점검 | 티켓 + AC | falsifiable 완료기준; "무엇이 빠졌나" 대화 강제 | **DoR을 하드 stage-gate로 = waterfall**(Mountain Goat) |

### 4.2 Work Packet 포지셔닝 (선행사례 대비)

**고유점 (어떤 선행사례도 동시에 만족하지 않음):**

| 축 | 선행사례 다수 | Work Packet |
|---|---|---|
| 정본성 | spec/plan이 **정본**(Spec Kit: "primary artifact") | **정본 아님** — readiness 출력만 스냅샷, ScreenSpec/decision-log는 링크 |
| 게이트 | 문서/플로 안에 게이트 내장(Spec Kit constitutional gates; Kiro hooks; Devin/Claude 승인) | **게이트 아님** — 판정은 외부 `readiness.mjs` 단일출처, 봉투는 그 출력을 옮기는 인덱스 |
| 결정 처리 | 에이전트가 진행/검증완료 표시(Devin 자동 진행; Spec Kit spec drift) | **결정 안 닫음** — Open Decision/Unknown/Conflict는 나열만, close는 사람-전용 |
| 경계 표현 | 컨텍스트 스코프(repo-map/glob) 위주, 하드 경계는 드묾 | **명시적 경계**: `readiness_mode` 천장 + `allowed/forbidden_paths`(diff로 검증) |

→ 한 줄: **"정본도 게이트도 아니고, 외부 단일 게이트의 출력을 cold-실행용으로 포장하면서 결정은 사람에게 남겨두는 봉투."** Kiro의 "게이트≠문서" + DoR의 "stage-gate 회피"가 이 포지셔닝을 **선행사례로 정당화**한다.

**약점/공백:**
- **stale snapshot 위험**(핸드오프 최빈 실패). Validity 섹션이 방어하지만 강제가 아니라 규율에 의존. (자동화하면 게이트화 — 긴장.)
- **confidence 신호 부재**. Devin의 🟢🟡🔴 같은 cold-start 위험 표시가 없음. (게이팅 점수로 추가하면 불변식 위반 — 비게이팅 주석으로만 가능, §7.)
- **cold-start vs link-not-copy 긴장**. 링크는 stale을 막지만 받는 에이전트는 정본을 직접 읽어야 함(완전한 hot start 아님). readiness 출력 스냅샷이 절충점.
- **Expected Output의 falsifiability**가 AC만큼 강하지 않을 수 있음(prose 허용).

### 4.3 `work-packet.template.md` 개선안 (새 축·새 게이트 없음)

**(a) Validity — 무효조건을 명시 리스트로 (stale 방어 강화)**

```md
## Validity
<!-- 이 packet 이 유효한 전제. 아래 무효조건 중 하나라도 바뀌면 packet 무효 → readiness 부터 재실행 후 재발급.
     스냅샷은 readiness 출력만 복사한다(정본 복사 금지). 정본 변화 감지는 사람이 한다(자동 게이트 아님). -->
- 기준 스냅샷: `{readiness_source}` (실행/확인: {YYYY-MM-DD}).
- **무효조건(하나라도 변하면 재발급):**
  - [ ] `readiness_mode` ≠ `{readiness_mode}` (readiness 재실행 결과가 달라짐)
  - [ ] ScreenSpec `status` ≠ `{status}`
  - [ ] Blocking Items의 Open Decision이 새로 열리거나 닫힘
  - [ ] `readiness_source` 파일이 갱신됨(날짜/내용 변경)
- 이 packet 은 스냅샷이다. 위 항목이 의심되면 집행 전 `npm run workflow:readiness`로 대조한다.
```

**(b) Expected Output — 반증가능 문구(EARS 정신, 섹션 유지)**

```md
## Expected Output
<!-- 이 모드에서 "정답"인 산출물을 *체크가능*하게 적는다. prose 대신 검증 문장으로.
     예) "WHEN 라우트 진입 THEN 화면 shell 이 렌더된다 (fixture UI·fake hook 부재)."
     예) "src/api/** 에 변경 0; allowed_paths 밖 파일 0 (git diff 로 확인)." -->
{`{readiness_mode}` 정답 산출물을, 만족/위반을 이진 판정할 수 있는 1~2개 문장으로.}
```

**(c) Blocking Items — Ambiguity Review를 입력원으로 명시 (새 섹션 아님)**

```md
## Blocking Items
<!-- "푸는 목록"이 아니라 "닫지 말 것" 목록. 구현 전 Ambiguity Review(애매함 표면화)의 출력이 여기로 들어온다.
     게이트로 막아야 하는 애매함은 Open Decision 으로 승격(사람), 단순 사실확인은 Unknown 으로. close 는 전부 사람-전용. -->
| ID | 유형 | 내용 | Blocking Mode | Owner | 처리 |
|---|---|---|---|---|---|
| {D-001} | decision | {결정 질문} | {mode} | {PM} | 닫지 말 것 (사람만) |
| {A-001} | ambiguity | {구현 전 발견된 애매함 — 승격 필요 여부 판단} | — | {agent→사람} | Open Decision/Unknown 으로 분류만, close 금지 |
```

**(d) Review Checklist — Pre-Implementation Review 행 추가 (게이트 아님, evidence)**

```md
## Review Checklist
<!-- 리뷰어 확인 항목 = Work Packet 안의 evidence. verdict ≠ 머지 차단(게이트는 readiness/validate). -->
- [ ] **사전구현 점검(Pre-Implementation Review)** — 집행 시작 전: Validity 무효조건 무변경 + Blocking Items 분류 완료(ambiguity가 미승격 결정으로 남아있지 않음).
- [ ] **게이트 판독** — readiness_mode/allowed/forbidden 이 `{readiness_source}` 와 글자 일치.
- [ ] **경로 준수** — diff 가 allowed 안에만, forbidden(특히 `src/api/**`) 무접촉.
- [ ] **천장 미초과** — `{readiness_mode}` 허용 산출물만.
- [ ] **미확정 미발명** — API/copy/design value 추측 없음.
- [ ] **결정 미닫힘** — Open Decision/Conflict/Unknown 상태 보존.
- [ ] **보고·멱등** — blocker 는 readiness 의 `blocking`/`next_actions` 그대로, 재실행 최소 diff.
```

**(e) Must Read — "여기부터" 우선순위 한 줄 (hot-start 힌트)**

```md
## Must Read
<!-- 복사하지 말고 링크만. 우선순위 없는 링크 더미는 noise — 첫 줄에 "여기부터"를 둔다. -->
- ▶ **여기부터**: `{readiness_source}` (이 세션의 게이트 사실 = allowed/forbidden/mode의 출처)
- ScreenSpec (정본): `{...screen-spec.md}`
- 관련 정책: `frontend-workflow-kit/policies/implementation-mode-policy.yaml`
- (해당 시) Open Decisions / Conflicts: `{open-decisions.md}` · `{global/conflicts.md}`
```

> **삭제 제안 없음.** 현 12개 섹션은 모두 봉투 역할에 부합한다. 추가는 전부 **기존 섹션 내부**의 문구/행 수준이며 새 산출물 축·새 게이트를 만들지 않는다.

## 5. Invariant safety check

| 불변식 안전선 | 본 제안 준수 여부 |
|---|---|
| 새 산출물 축 추가 금지 | ✅ 모든 변경이 기존 12섹션 내부 문구/행. Ambiguity/Pre-Impl Review는 **새 섹션 아님** — Blocking Items·Review Checklist에 흡수. |
| readiness 단일 출처 유지(WP가 게이트 안 됨) | ✅ Validity 무효조건은 **사람이 확인하는 assertion**이지 자동 판정 아님. ⚠️ **긴장**: 이를 스크립트로 강제하면 2차 게이트가 됨 — §3-2·§6에서 "자동화 금지" 명시. |
| 정본은 복사 말고 링크, readiness 출력만 스냅샷 | ✅ Must Read·Validity가 link-not-copy 재확인. ⚠️ **긴장**: link는 cold-start 완전성과 trade-off(받는 에이전트가 정본 읽어야) — 의도된 절충(stale 회피 우선). |
| LLM은 결정/Unknown/Conflict close·candidate→confirmed 안 함 | ✅ Blocking Items에 "분류만, close 금지" 명시. Marmelab spec drift(에이전트가 검증완료 표시)가 정확히 피해야 할 것. |

**명시할 긴장 지점 2개**: (1) stale 방어를 "강제"하고 싶은 유혹 vs 단일출처 — 강제는 게이트화이므로 금지, 규율로 둔다. (2) link-not-copy vs cold-start 속도 — readiness 출력만 스냅샷하는 현 절충이 정답.

## 6. Risks / trade-offs / what NOT to do

- **하지 말 것 ①: Work Packet을 stage-gate로 만들기.** Mountain Goat 교훈 — "100% 끝나야 다음 시작" 규칙은 waterfall. Validity 무효조건은 *재발급 트리거*이지 *집행 차단 게이트*가 아니다.
- **하지 말 것 ②: Kiro식 hooks를 봉투 안에 2차 게이트로 들이기.** 강제는 이미 `readiness/validate/forbidden-paths/diff`에 있다. 봉투는 그 출력을 옮길 뿐.
- **하지 말 것 ③: 과명세.** Spec Kit 1,300줄/8파일 사례. 봉투를 두껍게 만들지 말고 링크로 얇게.
- **하지 말 것 ④: 자동 stale-검사 스크립트 추가.** 편해 보이지만 단일출처 불변식을 깨고 봉투를 판정자로 만든다.
- **하지 말 것 ⑤: confidence 점수를 게이트로.** Devin식 신호는 유용하나 점수가 모드를 막으면 불변식 위반 — 넣더라도 비게이팅 주석으로만(§7 open question).
- **트레이드오프**: link-not-copy는 stale을 막는 대신 cold 에이전트의 hot-start를 일부 희생한다. 본 보고서는 stale 회피를 우선(핸드오프 최빈 실패가 stale이므로).
- **증거 리스크(검증 후 갱신)**: 비교표 주장은 전용 적대적 검증 패스로 1차 출처 재확인됨 — 단 4건이 정정됨(Claude plan 영속성·OpenHands CodeActAgent·SWE-agent ACI 논지·cold-start 프레이밍, 상단 주석 참조). Kiro·Cursor·Devin은 2025–2026 빠르게 진화 중이라 세부 UI/구조가 변할 수 있다. cold-start 슬로건류는 단일 블로그 프레이밍이므로 확립 용어로 인용 금지.

## 7. Open questions for synthesis

1. ~~비교표 〔웹〕 행 적대적 검증~~ **(완료)** — 전용 검증 패스(fact-checker 8개)로 Spec Kit·Claude plan mode·Aider·Cursor·Devin·OpenHands·DoR/DoD·cold-start 재확인, 4건 정정. "spec=정본 vs WP=정본 아님" 대비 논거는 Spec Kit 직접 인용으로 **확정**. 남은 검증 후보: OpenHands의 product-level "planning mode"가 실제 사용자 plan-승인 게이트를 갖는지(1차 미확인).
2. **Expected Output에 EARS식 "WHEN…THEN…" 문법을 실제로 채택?** 아니면 현 diff/exit-0 이진검사 스타일이 이미 falsifiability를 충족하고, EARS(UI 행위 지향)는 path/mode-천장 제약엔 안 맞나? — **문구 결정**(새 게이트 금지 범위 내).
3. **Ambiguity/Pre-Implementation Review의 최종 위치** — 본 보고서는 Blocking Items + Review Checklist 흡수를 권고. Review Artifacts(Future Candidate)로 빼는 대안과 비교 필요. 불변식이 새 축/게이트를 금하므로 **배치/문구 문제**.
4. **비게이팅 confidence 주석을 도입?** Devin 🟢🟡🔴를 본떠 "이 packet의 cold-실행 위험도"를 *정보용*으로 적되 모드를 막지 않게 — 유용 vs 게이트화 드리프트 위험의 경계를 어떻게 날카롭게?
5. **stale 감지를 강제 없이 어떻게 더 도울까?** 자동 스크립트는 금지(게이트화). `readiness_source`에 타임스탬프/해시 한 줄을 *기록*만 하는 것은 게이트가 아니라 evidence인가? — invariant 경계 확인 필요.

## 8. Sources

1. AWS — Kiro project init prompt library (primary, 검증): https://aws.amazon.com/startups/prompt-library/kiro-project-init
2. Kiro Docs — Requirements first (EARS, 검증): https://kiro.dev/docs/specs/feature-specs/requirements-first/
3. Kiro Docs — Hooks (검증): https://kiro.dev/docs/hooks/
4. GitHub — github/spec-kit: https://github.com/github/spec-kit
5. GitHub — spec-kit/spec-driven.md: https://github.com/github/spec-kit/blob/main/spec-driven.md
6. Microsoft for Developers — Spec-Driven Development with Spec Kit: https://developer.microsoft.com/blog/spec-driven-development-spec-kit
7. DevOps.com — GitHub's Spec Kit: https://devops.com/githubs-spec-kit-puts-the-spec-back-in-software-development/
8. Claude Code Docs — Choose a permission mode (plan mode): https://code.claude.com/docs/en/permission-modes
9. Armin Ronacher — What Actually Is Claude Code's Plan Mode?: https://lucumr.pocoo.org/2025/12/17/what-is-plan-mode/
10. Aider — Chat modes (architect/edit formats): https://aider.chat/docs/usage/modes.html
11. DeepWiki — Aider-AI/aider (repo map, auto commit): https://deepwiki.com/Aider-AI/aider
12. The Prompt Shelf — .cursorrules vs .cursor/rules (MDC): https://thepromptshelf.dev/blog/cursorrules-vs-mdc-format-guide-2026/
13. DataCamp — Cursor Rules: https://www.datacamp.com/tutorial/cursor-rules
14. Devin Docs — Ask Devin / planning & handoff: https://docs.devin.ai/work-with-devin/ask-devin
15. Cognition — Devin 2.1 (confidence scores): https://cognition.ai/blog/devin-2-1
16. Medium (Agentic AI) — Devin planning-mode subagent: https://medium.com/agenticais/cognition-devin-planning-mode-subagent-a84ed1c4727a
17. arXiv 2407.16741 — OpenHands: An Open Platform for AI Software Developers: https://arxiv.org/abs/2407.16741
18. Applied Responsible AI — Open-Source Coding Agents: A Survey (SWE-agent ACI): https://airesponsibly.substack.com/p/open-source-ai-coding-agents-a-survey
19. ToolHalla — Devin vs OpenHands vs SWE-agent: https://toolhalla.ai/blog/devin-vs-openhands-vs-swe-agent-2026
20. Mountain Goat Software — The Dangers of a Definition of Ready (stage-gate): https://www.mountaingoatsoftware.com/blog/the-dangers-of-a-definition-of-ready
21. Atlassian — What Is Definition of Ready (DoR): https://www.atlassian.com/agile/project-management/definition-of-ready
22. Marmelab — Spec-Driven Development: The Waterfall Strikes Back (failure modes, 1,300 lines): https://marmelab.com/blog/2025/11/12/spec-driven-development-waterfall-strikes-back.html
23. Augment Code — Spec-Driven Development vs Waterfall: https://www.augmentcode.com/guides/spec-driven-development-vs-waterfall
24. DEV Community — Building Reliable State Handoffs Between AI Agent Sessions (stale context, summary loss): https://dev.to/aureus_c_b3ba7f87cc34d74d49/building-reliable-state-handoffs-between-ai-agent-sessions-1bk3
25. Atlan — Context Bootstrapping: Solving the AI Agent Cold Start Problem: https://atlan.com/know/context-bootsrapping/
26. Wikipedia — EARS (Easy Approach to Requirements Syntax), Rolls-Royce origin (검증 finding에서 인용): https://en.wikipedia.org/wiki/EARS_(requirements)

### 검증 패스 추가 출처 (2026-06-14)
27. Claude Code Docs — Settings (`plansDirectory`) + .claude directory (plan files 디스크 기록): https://code.claude.com/docs/en/settings
28. SWE-agent — Agent-Computer Interfaces Enable Automated Software Engineering (ACI는 에이전트 전용, 인간 IDE 모사 아님), arXiv:2405.15793: https://arxiv.org/abs/2405.15793
29. Cursor Docs — Rules + Plan Mode (공식): https://cursor.com/docs/context/rules · https://cursor.com/docs/agent/plan-mode
30. Devin Docs — Interactive planning + Knowledge vs Playbooks (별개 기능): https://docs.devin.ai/work-with-devin/interactive-planning · https://docs.devin.ai/product-guides/knowledge
31. Factory.ai — Evaluating Compression (36k-message 실측; summary 손실 artifact trail 2.19–2.45/5): https://factory.ai/news/evaluating-compression
32. Milvus — Failure modes in context engineering (drift/overload/rot 분류): https://milvus.io/ai-quick-reference/what-are-failure-modes-in-context-engineering-eg-drift-overload-rot
33. Anthropic Engineering — Harness design for long-running agents (컨텍스트 충전 시 coherence 손실): https://www.anthropic.com/engineering/harness-design-long-running-apps
34. Thoughtworks Technology Radar Vol. 34 — Spec-driven development (Assess; "elaborate and opinionated," "bitter lesson"): https://www.thoughtworks.com/en-us/radar/techniques/spec-driven-development
