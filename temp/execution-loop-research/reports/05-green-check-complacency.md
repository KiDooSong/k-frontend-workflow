---
track: 05
title: "통과 = 완료" 착각 방지 (문구·UX)
date: 2026-06-14
status: draft
inputs: [notes/01-loop-engineering.md, notes/02-llm-only-scriptization-risk.md]
---

# Track 05 — "통과 = 완료" 착각 방지 (문구·UX)

> 범위: 이 트랙은 **문구·문서·affordance 만** 바꾼다. `readiness.mjs` 판정 로직, 게이트, 새 검사는 **건드리지 않는다**.
> 핵심 가설: "스크립트 통과 = 설계적으로 충분" 착각은 **인지 편향(automation complacency)** 이고, 잘 설계된 문구·배치로 **줄일 수는 있지만 0 으로 만들 수는 없다**. 그래서 목표는 "경고를 더 많이"가 아니라 "착각이 생기는 바로 그 지점에, 습관화되지 않게" 다.

## 1. Executive summary

- **"green check = 완료" 착각은 신조어가 아니라 30년 된 인간요인(human-factors) 현상이다.** Parasuraman & Manzey 의 *automation complacency / automation bias* [1], Breznitz 의 *cry-wolf* [3], Goodhart's law [6], 그리고 2025–26 의 *comprehension debt* [10][11] 가 모두 같은 한 가지를 말한다 — 사람은 "보통 맞는" 자동 신호를 만나면 **감시를 멈추고 신호를 결과로 착각한다**. 이건 초보뿐 아니라 전문가에게도, 단순 연습으로도 안 사라진다 [1].
- **그래서 "경고를 늘리는 것"은 해법이 아니라 오히려 새 위험이다.** 동일·빈번한 경고는 banner blindness / alarm fatigue 로 무력화된다 [4][16][17]. 보안툴 false-positive 70–90% 가 alert fatigue 를 낳는 것과 같다 [19][20]. **경고 설계 자체가 이 트랙의 가장 큰 함정**이다.
- **효과 있는 문구의 3 조건**(C-HIP 모델 [12][13] + 디스클레이머 실증 [16][18]): ① **행동 지점(point-of-action)** 에 둔다(파묻힌 문서 ✕), ② **무엇을 보장 안 하는지 + 다음에 뭘 해야 하는지**를 같이 말한다(막연한 "주의" ✕), ③ **위험에 비례(proportional friction)** 해서 안전한 경우엔 침묵한다 [14].
- **이 repo 에 맞는 형태**: (a) README/Skill 에 **"하는 것 vs 안 하는 것" 프레이밍 블록 1 개**(멘탈모델을 처음에 한 번 심는다), (b) readiness/validate **PASS 메시지에 1줄 컨텍스트 디스클레이머**(모드·화면명을 끼워 넣어 습관화 저항), (c) **anti-pattern → 표면화 위치 맵**(run 당 1회, 위험할 때만 격상).
- **불변식 긴장점 1 개**: PASS 메시지 디스클레이머는 `.mjs` 의 출력 문자열을 건드린다 — 판정 로직은 아니지만 스크립트 파일이긴 하다. §5 에서 **스크립트 0-수정** 대안(Skill 프롬프트가 게이트 출력을 사람에게 전달할 때 디스클레이머를 붙이는 방식)을 권고한다.
- **반증 발견(균형)**: 디스클레이머가 항상 듣는 건 아니다. Metzger 등 2024 는 일부 디스클레이머가 신뢰 인식을 못 바꿨다고 보고했다 [16]. → 문구는 "양심 알리바이"가 아니라 **행동을 바꿀 때만** 가치가 있다. 측정 못 하면 boilerplate 다.

## 2. Prior art & findings

### 2.1 왜 사람은 "통과/초록불"을 과신하는가 (RQ1)

**Automation complacency & automation bias (Parasuraman & Manzey 2010).** 사람은 자동화를 *오용(over-trust)*, *불용(거부)*, 혹은 *complacency(출력 감시를 멈춤)* 한다. complacency 는 특히 **멀티태스크 부하**가 있고 자동 보조도구가 **"보통 맞을" 때** 발생한다 [1]. "보통 맞음"이 가장 위험한데, *"기계가 나보다 잘 안다"* 는 휴리스틱을 학습시키고, 경험이 쌓일수록 교정이 더 어려워지기 때문이다 [1]. 결정적으로 **초보·전문가 모두에게서 나타나고 단순 연습으로 극복되지 않는다** [1]. automation bias 는 두 가지 오류로 나뉜다 — *누락 오류*(자동화가 못 잡은 문제를 사람도 놓침), *수행 오류*(자동화의 틀린 권고를 그대로 따름) [2].
→ repo 매핑: LLM-only 사용자에게 readiness/validate 는 "보통 맞는" 자동 보조도구다. 통과가 반복될수록 "스크립트가 OK 했으니 됐다"는 휴리스틱이 굳는다. 정확히 complacency 의 교과서적 조건이다.

**Cry-wolf / alarm fatigue (Breznitz 1984).** *Cry Wolf: The Psychology of False Alarms* — false alarm 뒤의 신뢰 상실은 "사실상 불가피"하다. 뇌가 경험에서 학습하는 걸 멈출 수 없기 때문 [3]. 경보가 많거나 false alarm 이 잦으면 **desensitization/habituation** 이 생기고, 노출될수록 경고는 *용인→정상화→무시* 된다 [4]. 의료에서 FDA 는 2005–2008 무시된 알람으로 인한 **566 건 사망**을 집계했다 [4][5]. → 이 트랙이 "경고를 늘리자"로 가면 **스스로 cry-wolf 를 만든다**. 경고 빈도 설계가 경고 문구보다 중요하다.

**Goodhart's law / surrogation / green-build fallacy.** *"측정값이 목표가 되면, 그것은 더 이상 좋은 측정값이 아니다"* (Goodhart; Strathern 정식화) [6]. *surrogation* = 진짜 목표 대신 대리지표를 추구하게 되는 것 — "숫자에 서사가 없으면 surrogation 을 부른다" [6]. AI/시스템에서도 동일: 복잡도 지표에 압력을 주면 에이전트가 함수를 과하게 쪼개 **지표는 좋아지고 가독성은 나빠진다** [7]. 테스트로 좁히면 *green-build fallacy* 다 — 90% 라인 커버리지여도 통째로 안 거친 분기가 있고, 리포트는 초록인데 버그는 그대로다 [8]. **assertion-free 테스트**는 "코드를 *실행*했을 뿐 *검증*하지 않은" 것이고("Passing is not a useful correctness criterion"), mutation testing 을 돌리면 죽는 mutant 가 0 이다 [8][9]. 핵심 문장: *"테스트를 지웠을 때 무엇이 깨지는지 답 못 하면, 그 안전망은 연극(theater)이다"* [9].
→ repo 매핑: `validate` 12 검사·`test-fixtures` 회귀는 **구조/회귀의 대리지표**다. 이걸 "제품적으로 맞음"의 목표로 삼는 순간 surrogation 이다. note 02 §5.3 의 "구조적으로 통과하지만 정렬기준·만료노출·권한분기가 빠진 ScreenSpec"이 바로 green-build fallacy 의 프론트엔드 버전.

**Comprehension debt (2025–26).** Addy Osmani(이 repo 의 loop-engineering note 가 이미 인용하는 저자)는 *comprehension debt* 를 **"존재하는 코드량과, 사람이 실제로 이해하는 양 사이의 벌어지는 간극"** 으로 정의한다 [10][11]. 결정적 메커니즘: AI 코드는 *"문법적으로 깔끔하고, 포맷 잘 되어 있고, 표면적으로 맞다 — 바로 그게 역사적으로 머지 확신(merge confidence)을 촉발하던 신호들"* 인데, *"표면 정합성은 시스템 정합성이 아니다"* [10]. 인용된 Anthropic 2026 RCT(엔지니어 52명, 새 라이브러리 학습): AI 보조 그룹은 완료 시간은 비슷했지만 **후속 이해도 퀴즈에서 17%p 낮았다(50% vs 67%)**, 디버깅에서 낙폭 최대 [10]. *"수동적 위임('그냥 되게 해줘')이 능동적·질문 주도형 사용보다 역량 형성을 훨씬 더 해친다"* [10]. 처방: 생성 전 **명시적 명세**, **검증을 사후가 아닌 구조적 제약으로**, 그리고 *"통과한 테스트와 진짜 이해를 정직하게 구분하라 … 코드를 싸게 만든다고 이해까지 싸게 건너뛰어지는 건 아니다. 이해 작업이 곧 일이다"* [10]. (보조 지표: GitClear 분석 — AI 다용 프로젝트에서 code churn +39% [10]; 2026 개발자 설문 보고치 — 76% 가 "완전히 이해 못 한 코드를 생성한 적 있다" [11]. 두 수치는 2차 출처 인용이라 §6 에서 신뢰도 하향.)
→ repo 매핑: 이 repo 철학("LLM 이 추론하던 걸 파일로 고정")의 그림자가 정확히 이것. 파일이 깔끔히 통과 → 사람이 설계를 이해했다고 착각. note 02 §10 의 6 금지 착각이 comprehension debt 의 repo-specific 표현.

### 2.2 문구·friction 이 false confidence 를 줄인 사례 / 무시당하는 경고의 특징 (RQ2)

**C-HIP 모델(Wogalter).** 경고는 *source → 채널 → 주의 전환 → 주의 유지 → 이해(comprehension) → 신념·태도 → 동기 → 행동(compliance)* 단계를 거치고, **어느 단계든 병목이면 거기서 처리가 멈춰 효과가 사라진다** [12][13]. 두 가지 직접 시사점: (a) *habituation* — "습관화된 경고와 비슷하게 생긴 경고는 부적절한 주의를 유발"(즉 똑같이 생기면 안 본다) [12]; (b) *comprehension 은 위험·결과·지시의 명료성에 달려 있다* — "주의해"만으론 부족, **무슨 결과 + 뭘 하라**까지 [12].

**Friction-as-feature / forcing functions.** GitLab Pajamas 디자인 시스템: *"UI 의 friction 은 보통 없애야 할 것으로 여겨지지만, 결과를 모를 수 있는 파괴적 행동을 막는 데는 유용하다"* [14]. 핵심 원칙은 **friction 강도를 행동의 심각도·되돌림 가능성에 비례**시키는 것 [14]:
- 고위험(영구/복구 어려움): 모달 + danger 버튼 + **삭제 대상 이름 타이핑 확인**(GitHub repo 삭제 패턴 — 이름이 정확히 일치할 때까지 확인 버튼 비활성).
- 중위험: 중간 단계 1개(드롭다운 등), 최소 2클릭.
- **저위험(쉽게 되돌림): friction 을 아예 넣지 말 것 — 특히 대량 작업 동선에서** [14].
이 "비례" 원칙이 곧 **alarm fatigue 의 해독제**다: 안전한 경우에도 확인을 남발하면 비례 원칙을 스스로 위반하고 desensitization 을 만든다 [14]. (Norman 의 forcing function/affordance 계보; 확인 흐름·강제 순서·안전 인터록이 설계된 forcing function [15].)

**무시당하는 경고의 특징.** banner blindness — 흔한 라벨은 학습되어 걸러진다 [17]. 보안툴: false-positive 70–90% → alert fatigue → desensitization [19][20]. JIT 보안 경고 연구: 경고가 **집중을 끊고 명확한 가치 없이 작업량만 늘리면** 개발자는 그걸 생산성 장애물로 인식해 방치한다 [19][20]. 반대로 효과적 경고는 **개발자가 사는 곳(IDE/동선)** 에 있고 **구조화된 가이드 + 실행 가능한 다음 조치**를 함께 준다 [19].

### 2.3 "보장 vs 미보장"을 각인시키는 카피·배치 (RQ3)

**디스클레이머는 "background noise" 가 될 수 있다.** AI 라벨이 도처에 붙으면 사용자는 반복 노출로 습관화되고, "신호가 상시화되면 주의가 붕괴"해 라벨이 환경에 묻힌다 [16]. 명명된 4 실패모드 [16]: ① **banner blindness**(습관적 무시), ② **inconsistency**(문구·위치·강도가 플랫폼마다 달라 매번 재학습), ③ **false reassurance**(라벨 없는 콘텐츠를 진짜로 오인 — 디스클레이머가 의도치 않은 *인증서*가 됨), ④ accessibility 배제. 쿠키 배너가 "always accept" 습관(click fatigue·의례)으로 굳은 게 대표 사례 [16].
**반증(중요).** Metzger 등 2024 는 디스클레이머 유형 비교에서 **사전 정보가 신뢰 인식에 유의한 효과를 못 냈다**고 보고 [16]. 다른 메타분석은 "어떻게 작동하는지까지 알리면" AI 콘텐츠 신뢰가 낮아졌다고 [16][18] — 즉 **"AI 임"만 알리는 것 ≠ 행동 변화**, *작동 방식·한계까지* 알려야 듣는다.
**효과 처방** [16]: 표준화된 UX 패턴(위치·동작 일관), 배포 전 **실제 이해율 측정**, 그리고 형식적 존재가 아니라 "측정 가능한 인간 이해"를 목표로. 현존 예: OpenAI 의 *"ChatGPT can make mistakes. Always check important information."* [16].
→ 종합: behavior-changing 디스클레이머 = (행동 지점) × (무엇을 보장 안 하나 + 다음 행동) × (일관된 구조이되 컨텍스트로 신선도 유지) × (위험할 때만 등장). banner-blind boilerplate = (파묻힘) × (막연함) × (모든 곳에 동일·상시).

## 3. Recommendation for k-frontend-workflow

이 repo 에 적용할 때의 설계 원칙(위 근거의 repo-매핑):

1. **멘탈모델은 "처음 한 번" 강하게 심는다 (C-HIP 신념·태도 단계).** README 와 implement-screen Skill 상단에 **"하는 것 vs 안 하는 것" 프레이밍 블록**을 두되, 같은 문구를 모든 명령에 반복하지 않는다(banner blindness 회피). 이 블록은 "보장/미보장"을 명시해 false reassurance 를 직접 차단한다.
2. **PASS 가 위험 지점이다 — 거기에만, 컨텍스트로.** automation complacency 는 *통과가 반복될 때* 굳는다. 그러므로 디스클레이머는 **PASS 출력에만** 붙인다(FAIL 은 이미 주의를 받는다). 모드명·화면 ID 를 끼워 넣어(예: `readiness=rough-fixture-ui / COUPON-001`) 문구가 매번 미세하게 달라지게 → habituation 저항(C-HIP). 구조는 고정(일관성), 내용은 컨텍스트(신선도).
3. **proportional friction: 위험할 때만 격상, 안전하면 침묵.** readiness 가 이미 docs-only 로 정확히 막은 경우엔 추가 경고 불필요(스크립트가 이미 일함). 경고를 띄울 자리는 *스크립트가 막지 못하는 의미적 위험* — Unknown 존재, status==draft 인데 fixture-ui 요청, requested_mode > readiness_mode, candidate API 로 fixture 진행 같은 **"통과했지만 사람 판단이 비어있는"** 순간뿐.
4. **행동 지점 우선.** 가장 효과적인 표면은 사용자가 "구현하자"고 결심하는 순간 — 즉 **implement-screen Skill 프롬프트**와 **Work Packet 헤더**다. 파묻힌 roadmap 보다 여기가 JIT 다(보안 IDE 경고 연구).
5. **다음 행동을 항상 동봉.** "validate 통과 = 제품 OK 아님"으로 끝내지 말고 "→ Codex 의미 리뷰 / Open Decision 승격 검토 / 사람 confirmed 승인" 같은 *다음 한 걸음*을 붙인다(C-HIP comprehension: 결과 + 지시).
6. **스크립트 0-수정 우선.** 불변식("스크립트 로직 안 건드림")의 가장 안전한 해석은 `.mjs` 를 아예 안 여는 것. 그래서 디스클레이머의 1차 보금자리는 **Skill 프롬프트(게이트 출력을 사람에게 전달하는 LLM 의 말)** 와 **템플릿·README**다. 스크립트 stdout 수정은 §5 의 긴장점이라 *대안*으로만 제시.

## 4. Concrete deliverable

### 4.1 산출물 ① — "하는 것 vs 안 하는 것" 프레이밍 블록 (+ 6 금지 착각)

**삽입 위치 A — `frontend-workflow-kit/README.md`**: 최상단 인트로(2행)와 `> 현재 단계:` 블록쿼트 **사이**에 새 섹션으로. (README 가 멘탈모델을 처음 만나는 지점.)

```md
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
```

**삽입 위치 B — `frontend-workflow-kit/skills/implement-screen/SKILL.md`**: 제목 아래 도입 2행 다음에 callout 1개(짧게 — Skill 은 행동 지점이므로 전체 표는 README 로 링크).

```md
> ⚠️ **통과 ≠ 완료.** readiness 가 모드를 열어줘도 그건 *기계적 상한*이지 설계 승인이 아니다.
> validate 통과는 *구조* OK 일 뿐 *제품적으로 맞다*는 뜻이 아니다. 빠진 상태·UX·정책은
> 추측해 메우지 말고 Unknowns / Open Decisions / `global/conflicts.md` 로 남긴다.
> (전체 "하는 것 vs 안 하는 것" → README 참조.)
```

추가로 SKILL.md 기존 **"## 금지"** 목록 끝에 1줄:
```md
- `readiness 통과 = 설계 OK`, `validate 통과 = 제품 OK` 로 보고하는 것. (통과는 *증거*일 뿐 *승인*이 아니다.)
```

### 4.2 산출물 ② — 게이트 PASS 디스클레이머 (게이트별 1줄)

설계: **PASS 경로에만**, **모드/화면 컨텍스트를 끼워** 출력. 1차 권고는 **Skill 프롬프트가 게이트 결과를 사람에게 전달할 때** 이 줄을 덧붙이는 것(스크립트 0-수정). 스크립트 stdout 에 직접 넣고 싶으면 §5 긴장점 확인.

readiness PASS (예: `--screen COUPON-001` 이 `rough-fixture-ui` 로 열림):
```
ℹ readiness=rough-fixture-ui (COUPON-001) 는 기계적 상한이지 설계 승인이 아닙니다.
  설계·제품 리뷰(사람/Codex)와 confirmed 승인(사람)은 별도입니다. → 다음: 의미 리뷰 후 구현.
```

validate PASS:
```
ℹ validate 통과 = 구조·형식 OK. 빠진 상태·UX·정책 의도 등 제품 정합성은 검사하지 않았습니다.
  → 다음: Codex 의미 리뷰 / Open Decision 승격 검토.
```

(forbidden-paths·test-fixtures PASS 는 별도 디스클레이머 **생략** — 회로가 좁고 오해 소지가 작아 추가 줄은 alarm fatigue 만 키운다. proportional friction.)

문구 규칙(habituation 저항·일관성 양립): **고정 골격** = `ℹ <게이트>=<결과> 는 …가 아닙니다. → 다음: <행동>`. **가변 슬롯** = 모드·화면 ID·다음 행동. 골격을 바꾸지 말 것(inconsistency 실패모드 회피), 슬롯은 항상 컨텍스트로 채울 것(banner blindness 회피).

### 4.3 산출물 ③ — anti-pattern → 표면화 위치 맵 (빈도·배치 규칙 포함)

note 02 §6 의 위험 흐름(`입력→자동 ScreenSpec→state→readiness 열림→구현→validate→끝`)을 분해해, 각 착각을 **막지 못하는 바로 그 지점**에 1회씩 배치. 전역 규칙: **run 당 1회 · 위험할 때만 · 행동 지점 · 다음 행동 동봉 · 안전하면 침묵.**

| # | Anti-pattern (금지 착각) | 표면화 위치 (행동 지점) | 트리거 조건 (격상 규칙) | 빈도 |
|---|---|---|---|---|
| A1 | readiness 열림 = 설계 OK | readiness PASS 줄 + Work Packet 헤더 | 항상(PASS 시). 단 docs-only 처럼 *이미 막힌* 경우엔 생략 | run 당 1회 |
| A2 | validate 통과 = 제품 OK | validate PASS 줄 + Run Report *Gate Compliance* | PASS 시 1회 | run 당 1회 |
| A3 | Unknown 있어도 진행 | implement-screen Skill 프롬프트(구현 직전) | **Unknowns 가 존재할 때만** triage 질문 표면화 | 조건부 |
| A4 | draft = 리뷰 완료 | readiness 출력 + Work Packet *Pre-Implementation Review* | **status==draft 인데 fixture-ui 이상 요청 시만** | 조건부 |
| A5 | Work Packet = 구현 허가 | Work Packet 템플릿 헤더(1줄) | 항상(아티팩트에 내장) | 아티팩트당 1회 |
| A6 | Run Report = 사람 승인 | Run Report 템플릿 푸터(1줄) | 항상(아티팩트에 내장) | 아티팩트당 1회 |

**격상(escalate-on-risk) 세부** — proportional friction 적용. 아래 *위험 조건*에서만 경고를 "강"으로:
- `requested_mode > readiness_mode` → Skill 이 **거절 + 사유**(이미 note 의 auto-stop 철학과 일치).
- Unknown 존재 / status==draft / candidate API 로 fixture 진행 → **약한 1줄 리마인더 + 다음 행동**.
- 그 외(안전한 통과) → **침묵**(스크립트가 이미 한 일을 다시 경고하지 않는다).

**Work Packet 헤더(A1·A5) 카피:**
```md
> 이 Work Packet 은 readiness 출력을 복사한 **실행 봉투**다 — 구현 허가서가 아니다.
> 모드 상한·경로는 기계가 정했지만, **설계가 맞는지는 아직 사람이 확인 안 했다.**
```
**Run Report 푸터(A6) 카피:**
```md
> 이 Run Report 는 무엇을 했는지의 **증거**다 — 사람 승인이 아니다.
> 머지·confirmed 승격은 사람 리뷰를 거친 뒤에만.
```

## 5. Invariant safety check

| 불변식 | 준수? | 비고 |
|---|---|---|
| 문구·문서만, 판정/게이트 로직 불변 | ⚠️ 대체로 O, 1 긴장점 | 산출물 ①③ 은 순수 문서/템플릿. **산출물 ②(PASS 디스클레이머)** 만 `.mjs` 출력 문자열을 건드릴 수 있음 — 아래 참조 |
| readiness.mjs = 판정 단일 출처 | O | 어떤 산출물도 readiness 를 재계산/대체하지 않음. 디스클레이머는 결과를 *재서술*만 함 |
| 새 게이트 아님 | O | 무엇도 exit code·차단을 바꾸지 않음. 전부 stdout/문서 텍스트 |
| 경고가 alarm fatigue 안 되게 빈도·배치 설계 | O | §4.3 전역 규칙(run당 1회·조건부·침묵)·proportional friction·PASS 한정·컨텍스트화로 명시 설계 |
| LLM 이 결정/Unknown/Conflict 닫기·승격 안 함 | O | 산출물은 오히려 "닫지 마라"를 *강화*함 |

**유일한 긴장점 (명시):** 산출물 ②를 `readiness.mjs`/`validate.mjs` 의 `console.log` PASS 문자열에 직접 넣으면, **판정 로직은 100% 불변**이지만 스크립트 *파일*은 수정된다. 불변식 "스크립트 로직은 건드리지 않는다"를 *로직*으로 읽으면 OK(출력 문구 ≠ 로직), *파일*로 읽으면 위반.
**해소(권고):** 디스클레이머를 **implement-screen Skill 프롬프트**에 둔다 — Skill 이 `readiness --json` / `validate` 결과를 사람에게 보고할 때 위 1줄을 덧붙이도록. 이러면 `.mjs` 는 byte 단위로 그대로고, 디스클레이머는 *정확히 착각이 생기는 주체(LLM 의 보고)* 지점에 닿는다. 더 깔끔하고 불변식 충돌도 0. (스크립트 stdout 안은 "원하면 가능한 대안"으로만 남김.)

## 6. Risks / trade-offs / what NOT to do

- **하지 말 것 ①: 모든 명령에 디스클레이머 도배.** 가장 흔한 실패. banner blindness/cry-wolf 를 *스스로* 만든다 [4][16][17]. 안전한 통과엔 침묵.
- **하지 말 것 ②: 막연한 "주의하세요".** C-HIP comprehension 병목 [12]. 항상 *무엇을 보장 안 하나 + 다음 행동* 동봉.
- **하지 말 것 ③: 디스클레이머를 게이트로 격상.** "통과했지만 위험"을 exit 1 로 막고 싶은 유혹 — 불변식 5/6(Unknown 은 게이트 아님, auto-stop≠auto-block) 위반. 문구는 문구로 남긴다.
- **하지 말 것 ④: 문구만으로 충분하다고 믿기.** Metzger 2024 반증 [16] — 디스클레이머가 신뢰/행동을 못 바꾼 사례 존재. 문구는 complacency 를 *줄이는* 도구지 *제거*하는 도구가 아니다. 진짜 방어선은 여전히 Codex 의미 리뷰 + 사람 confirmed(다른 트랙).
- **트레이드오프: 신선도(habituation 저항) vs 일관성(재학습 비용).** 해법 = 골격 고정 + 슬롯 가변(§4.2). 문구를 매번 통째로 바꾸면 inconsistency 실패모드 [16].
- **측정 부재 위험.** 디스클레이머 효과는 측정 안 하면 boilerplate 다 [16]. 이 repo 엔 사용자 텔레메트리가 없으므로, 대리 측정으로 "PASS 후 사람이 Open Decision/Codex 리뷰를 실제로 거쳤는지"를 Run Report 체크리스트로 *간접* 관찰(§7).

## 7. Open questions for synthesis

1. **②의 보금자리 확정**: PASS 디스클레이머를 (a) Skill 프롬프트(스크립트 0-수정, 권고) vs (b) `.mjs` stdout(더 강제적이나 파일 수정). 종합 세션이 불변식 해석을 정해야 함.
2. **다른 트랙과의 경계**: A3(Unknown triage)·A4(draft 경고)는 Track 01(ambiguity-gate)·02(auto-stop)와 겹친다. 문구는 05, *조건/중단 로직*은 01/02 로 — 누가 트리거를 소유하나?
3. **효과 측정 대리지표**: Run Report 에 "PASS 후 의미 리뷰/승인 경유" 체크를 넣을지(Track 04 run-report-provenance 와 연계). 넣으면 디스클레이머가 boilerplate 인지 *관찰* 가능.
4. **i18n/톤**: callout 이모지(⚠/ℹ)·존댓말 톤이 repo 기존 문서 톤과 맞는지(README 는 평서·간결체). 통일 필요.
5. **6 금지 착각의 정본 위치**: README·SKILL·Work Packet·roadmap 에 분산 인용 시 *단일 출처 1곳 + 나머지는 링크*로 둘지(inconsistency 회피).

## 8. Sources

1. Parasuraman R. & Manzey D. (2010), *Complacency and Bias in Human Use of Automation: An Attentional Integration*, Human Factors — https://journals.sagepub.com/doi/10.1177/0018720810376055
2. Automation bias (overview) — https://en.wikipedia.org/wiki/Automation_bias
3. Breznitz S. (1984), *Cry Wolf: The Psychology of False Alarms* — https://www.taylorfrancis.com/books/mono/10.4324/9780203781203/cry-wolf-breznitz
4. Alarm fatigue (overview, FDA 566 deaths 2005–2008) — https://en.wikipedia.org/wiki/Alarm_fatigue
5. Anesthesia Patient Safety Foundation, *Alarm Fatigue and Patient Safety* — https://www.apsf.org/article/alarm-fatigue-and-patient-safety/
6. *"When a Measure Becomes a Target, It Ceases to be a Good Measure"* (Goodhart/Strathern) — PMC — https://pmc.ncbi.nlm.nih.gov/articles/PMC7901608/
7. *Goodhart's Law in AI: When Metrics Become Targets, Models Fail* — Practical DevSecOps — https://www.practical-devsecops.com/glossary/goodharts-law/
8. de Pauw T., *The Fallacy of the 100% Code Coverage* — ThinkingLabs — https://thinkinglabs.io/articles/2022/03/19/the-fallacy-of-the-100-code-coverage.html
9. *Tests as Ceremony: When AI Breaks the Safety Net* — Connsulting — https://www.connsulting.io/blog/tests-as-ceremony
10. Osmani A., *Comprehension Debt — the hidden cost of AI generated code* — https://addyosmani.com/blog/comprehension-debt/
11. *Comprehension Debt: The Hidden Cost of AI-Generated Code* — O'Reilly Radar — https://www.oreilly.com/radar/comprehension-debt-the-hidden-cost-of-ai-generated-code/
12. Wogalter M., *Communication-Human Information Processing (C-HIP) Model* (Springer / forensic reprint) — https://link.springer.com/chapter/10.1007/978-3-319-96080-7_92
13. *A Communication–Human Information Processing (C–HIP) approach to warning effectiveness in the workplace*, Journal of Risk Research — https://www.tandfonline.com/doi/abs/10.1080/13669870110062712
14. GitLab Pajamas Design System, *Destructive actions* (proportional friction; type-to-confirm) — https://design.gitlab.com/usability/destructive-actions
15. *How to Use Forcing Functions to Drive Better UX Outcomes* (Norman 계보) — https://www.parallelhq.com/blog/what-forcing-function
16. *AI Disclosure Labels Risk Becoming Digital Background Noise* (banner blindness·inconsistency·false reassurance·Metzger 2024 null result) — TechPolicy.Press — https://www.techpolicy.press/ai-disclosure-labels-risk-becoming-digital-background-noise/
17. Banner blindness (overview) — https://en.wikipedia.org/wiki/Banner_blindness
18. *"Always check important information!" — The role of disclaimers in the perception of AI-generated content* — ScienceDirect — https://www.sciencedirect.com/science/article/pii/S294988212500026X
19. Checkmarx, *Security Where Devs Live: Why IDE Integration Is the Key to SAST and SCA Adoption* (actionable vs ignored, alert fatigue) — https://checkmarx.com/learn/sast/security-where-devs-live-why-ide-integration-is-the-key-to-sast-and-sca-adoption/
20. *Toward Realistic Evaluations of Just-In-Time Vulnerability Prediction* — arXiv — https://arxiv.org/pdf/2507.10729
