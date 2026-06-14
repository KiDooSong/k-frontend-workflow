---
track: 03
title: 작성자–비평자(Author/Critic) 의미 리뷰 프로토콜
date: 2026-06-14
status: draft
inputs: [notes/01-loop-engineering.md, notes/02-llm-only-scriptization-risk.md]
method_note: >
  2단계로 실행했다. (1) deep-research 워크플로우(fan-out → 소스 수집 → 3표 적대적
  검증 → 합성): 적대적 검증을 통과한 20개 주장은 거의 전부 RQ3(외부 리뷰를 게이트
  아닌 evidence 로 기록·소비 = GitHub PR review / branch-protection / SARIF
  code-scanning)에 집중되었고 GitHub 공식 docs 다중 출처로 3-0 만장일치 검증되어
  신뢰도가 높다. 단 이 배치에서 RQ1·RQ2·RQ4 검색 앵글 4개가 rate-limit 으로 실패해
  해당 영역 1차 소스가 0건이었다. (2) 후속 타깃 웹 보강(본 세션, WebSearch + 1차
  출처 WebFetch): RQ1(Self-Refine/Reflexion/CriticGPT/self-correction 한계),
  RQ2(LLM-as-judge 루브릭 설계), RQ4(self-preference bias)를 학술 1차 출처(arXiv,
  OpenAI)로 확인해 §2.2~§2.4 를 정량 근거로 채웠다. 이 보강분은 3표 적대적 검증
  파이프라인을 거치지 않았으므로 [웹확인] 라벨로 구분한다. §3·§4 의 repo 매핑은
  기존 산출물(review-artifact·run-report·work-packet.template.md, notes/01·02)
  정합을 1차 근거로 삼는다.
confidence_labels:
  - "[검증됨-high]: 3표 적대적 검증 만장일치(3-0) + GitHub 공식 docs 다중 1차 출처 (RQ3)"
  - "[검증됨-medium]: 검증 통과했으나 split vote(2-1) 또는 blog 1차/primary 보강 (RQ3)"
  - "[웹확인]: 본 세션 후속 WebSearch + 1차 출처(arXiv/OpenAI) WebFetch 로 확인 — 3표 적대적 검증은 아님 (RQ1/RQ2/RQ4)"
  - "[repo-합의]: 웹 미확인 — 기존 repo 산출물·설계안 내부 정합이 근거"
  - "[일반-prior-art]: 널리 알려진 패턴이나 1차 재대조 안 함 — 강도 보수적"
---

# Track 03 — 작성자–비평자(Author/Critic) 의미 리뷰 프로토콜

## 1. Executive summary

- **핵심 발견 1 (RQ3, 가장 강한 근거)**: "리뷰를 게이트가 아니라 evidence 로" 다루는 것은 GitHub 자체 메커니즘에 직역 가능하다. GitHub 에서 **review verdict·status check·SARIF 알림은 기본적으로 advisory(비차단)**이고, 머지를 막는 것은 **관리자가 명시적으로 켜는 branch protection / ruleset / required check** 뿐이다 (3-0 만장일치, GitHub 공식 docs). 즉 Track 03 안전선 (a) "Review 는 독립 게이트 아님"은 발명이 아니라 **GitHub 의 기본 동작과 일치하는 설계**다 — verdict 를 required review 로 배선하지만 않으면 자동 머지차단이 되지 않는다.
- **핵심 발견 2 (evidence 표면화)**: 비차단이라고 무시되는 것이 아니다. GitHub 은 리뷰를 **conversation timeline + merge box 에 가시화**하고, SARIF 결과를 **정확한 라인에 인라인 주석(annotation)**으로 붙이며, **fingerprint 로 new/fixed/persistent 를 커밋 간 추적**한다. "막지는 않지만 보이고, 처리되면 처리됐다고 표시되는" 채널이 이미 존재한다 — 이것이 repo 의 Review Artifact verdict 가 지향해야 할 소비 형태다.
- **핵심 발견 3 (심각도 = 정책 손잡이)**: 같은 evidence 채널이 정책에 따라 차단/비차단을 **심각도 임계로 조절**한다 (error→차단 가능, warning/note→비차단 유지; None~All 선택지). 이는 repo 에 "verdict 자체는 절대 자동 게이트가 아니되, **사람이 명시적으로 켜는 정책 한 줄**로만 게이트화될 수 있다"는 분리축을 그대로 빌려준다.
- **핵심 발견 4 (RQ1·RQ4 — generator–critic / cross-model, 후속 웹 보강으로 정량 확인)**: 별도 비평자를 두는 repo 설계는 학술 근거로 뒷받침된다. **(i) 자기수정의 한계**: Self-Refine 는 생성·피드백·교정에 **단일 모델**을 쓰고(7개 태스크 평균 ~20% 향상), Huang et al.(ICLR'24)은 **외부 피드백 없는 intrinsic self-correction 이 추론에서 성능을 오히려 떨어뜨린다**고 보고 — self-bias 실패모드의 직접 근거. **(ii) 별도 비평의 효과**: CriticGPT(OpenAI)는 별도 비평자가 ChatGPT 자기비평보다 **62.7%**(사람 비평 대비 62.8%) 선호되고 inserted bug 를 사람보다 많이 잡았다. **(iii) 서로 다른 모델의 근거**: Panickssery et al.(NeurIPS'24)은 LLM 평가자가 자기 출력을 더 후하게 주는 **self-preference bias** 를 측정(self-recognition↔self-preference 선형상관) → 작성자≠비평자(Claude≠Codex)면 일부 완화. **단 핵심 단서 2개**: 비평의 가치는 **외부 신호 grounding**에서 오고(Reflexion=test 실행출력, CriticGPT=삽입버그 학습; 순수 자기성찰은 실패), 비평자도 **환각 지적이 잔존**하며 human+critic 팀이 critic 단독보다 환각이 적다 → repo 의 "리뷰어는 evidence 로만, 지적은 후보, 사람이 닫음" 규칙과 정확히 일치.
- **권고 산출물 3종(§4, 복붙 가능)**: ① Author/Reviewer/Fixer 리뷰 프로토콜(입력·출력·핸드오프·순서, `review-artifact.template.md` 와 정합) ② "의미 리뷰" 루브릭(7카테고리 × 점검항목 + 각 항목 관측가능 **Failure Signal**) ③ verdict 가 **사람-전용 결정을 닫지 않도록** 하는 evidence 표기 규칙(Run Report / Review Artifact). **세 산출물 모두 기존 Work Packet & Review Artifact 템플릿을 확장·정합하며 새 산출물 축을 만들지 않는다.**
- **불변식 정합(§5)**: 세 산출물 전부 (a) verdict ≠ 자동 머지차단 (b) LLM 리뷰어는 Open Decision/Conflict/Unknown 을 닫지 못하고 후보·지적까지만 (c) readiness 단일 출처 유지(리뷰어가 덮어쓰지 않음)를 만족하도록 설계했다. 긴장 지점은 "changes-requested verdict 가 사실상 머지를 막는 사회적 게이트가 되는 것"인데, GitHub 근거(advisory-by-default)와 표기 규칙으로 명시 차단한다.

## 2. Prior art & findings

> 신뢰도 라벨: **[검증됨-high]** = 3-0 만장일치 + 공식 docs 다중 1차 / **[검증됨-medium]** = split(2-1) 또는 blog 1차+primary 보강 / **[repo-합의]** = 웹검증 미통과, repo 산출물 정합 근거 / **[일반-prior-art]** = 알려진 패턴, 재대조 안 함.

### 2.1 외부 리뷰를 "게이트 아닌 evidence"로 — GitHub 메커니즘 (RQ3, 본 트랙 핵심·최강 근거)

이번 적대적 검증을 통과한 20개 주장의 대부분이 여기 모인다. 패턴 이름과 트레이드오프로 정리한다.

**(A) Review verdict 는 기본 advisory, 게이트는 명시적 opt-in.** [검증됨-high]
- `Request changes` 리뷰는 **기본적으로 머지를 자동 차단하지 않는다**. 차단은 관리자가 **required approvals(branch protection)**를 명시적으로 켤 때만 발생한다 (3-0; GitHub Docs *about-pull-request-reviews*, *about-protected-branches*, *approving-a-pull-request-with-required-reviews*). 인용: "Repository administrators can require approvals before pull requests are merged."
- **required reviews 를 켜면** 그때는 하드 게이트가 된다 — "approved by the required number of reviewers with write permissions" 가 푸시/머지의 전제조건이 되고, pending/rejected 리뷰로 머지 시도 시 에러 (3-0; *about-protected-branches*). **시사점**: 따라서 "verdict 를 evidence 로 유지"하려면 **그 verdict 를 required-reviews 메커니즘으로 배선하지 않는 것**이 정확히 필요충분조건이다.
- 트레이드오프: 기본 advisory 라서 **무시될 수 있음** → 아래 (C) 가시화로 보완.

**(B) Required status check 는 하드 게이트의 baseline — "review-as-evidence"는 이걸 피해야 한다.** [검증됨-high]
- protected branch 에서 required status check 를 켜면 **모든 required check 가 success/skipped/neutral 에 도달해야만 머지 가능** (3-0; *about-protected-branches*, *troubleshooting-required-status-checks*). 인용: "Required status checks must have a `successful`, `skipped`, or `neutral` status before collaborators can make changes to a protected branch."
- 반대로 **required 로 등록하지 않은 check 는 실패·진행중이어도 머지를 막지 않는다** — "If required status checks aren't enabled, collaborators can merge the branch at any time, regardless of whether it is up to date" (3-0). **시사점**: 외부 LLM 리뷰 결과를 **non-required(advisory) check 로 보고**하면 자동 차단 없이 evidence 로 남는다. 이것이 repo 가 원하는 정확한 메커니즘.

**(C) 비차단이어도 가시화된다 — timeline·merge box·인라인 주석.** [검증됨-high / 일부 medium]
- 리뷰는 **conversation timeline 과 merge box 에 표시**된다 (2-1, primary; *about-pull-request-reviews*: "Reviews appear in the conversation timeline and merge box"). → "막지 않지만 보인다".
- **conversation thread resolve 로 처리된 피드백을 머지 결정과 독립적으로 추적** 가능 (3-0; "Mark conversation threads as resolved to track addressed feedback"). 기본적으로 unresolved 대화는 머지를 막지 않으며(community #7827), opt-in "Require conversation resolution before merging" 을 켤 때만 게이트가 된다. **시사점**: "리뷰 항목 처리됨"을 게이트로 만들지 않고 표시하는 1급 메커니즘이 이미 있다 → Review Artifact 의 Recommended Fixes 처리 상태에 매핑.

**(D) SARIF/Code Scanning = 구조화된 외부 감사 결과를 evidence 로 주입하는 표준 경로.** [검증됨-high; 일부 blog 1차]
- **SARIF**(Static Analysis Results Interchange Format)는 정적분석 결과의 JSON 표준(OASIS 2.1.0)이고 GitHub Code Scanning 이 **네이티브로 ingest** 한다 (3-0; *sarif-files*, OASIS). 업로드 경로는 **GitHub Actions / code scanning REST API / CodeQL CLI** 등 **비대화형 채널 다수** (3-0) → 자동 리뷰어가 구조화 findings 를 올리기에 적합.
- GitHub 은 SARIF 의 `location` 으로 **정확한 라인에 인라인 주석**을 붙이고 `shortDescription`/`fullDescription` 으로 알림 본문을 구성한다 (3-0; *sarif-files*). 각 result 의 `message.text` 가 **맥락 있는 evidence**로 표면화 — 단순 pass/fail 이 아님.
- **심각도 매핑으로 비차단 유지**: critical/high→`error`, medium→`warning`(보이지만 비차단), low/informational→`note`(노이즈 없는 맥락) (2-1, blog+primary 보강). GitHub 기본 동작: error/critical/high 면 check fail, 그 이하면 warning/note 로 처리되고 check 성공 → **같은 채널이 심각도 정책에 따라 차단/비차단** (3-0; *triaging-code-scanning-alerts-in-pull-requests*).
- findings 는 **fingerprint(partialFingerprints)로 커밋 간 매칭**되어 new/fixed/persistent 추적 + diff 에 존재하는 라인만 표시(diff-aware) (3-0). → 리뷰 evidence 가 파일 고정·diff 인지·지속성을 가짐.
- 제약(반박 아님, 운영 전제): GitHub 은 SARIF 2.1.0 의 **subset** 만 사용(나머지 필드 무시) (3-0); private repo 는 Advanced Security 필요, 10MB 한도, `security_events: write` 권한. 또한 SARIF evidence 는 **code-scanning alert** 이지 GitHub "review state"가 아님 — advisory/주석 성격(검증자 명시).

**(E) 차단을 켤 때조차 "정책 손잡이"다 — 자동 결과가 아님.** [검증됨-high]
- Code scanning merge protection 은 **ruleset 으로 구현**되며 **status check 와 무관한 별도 메커니즘** (3-0; *merge-protection*: "Merge protection with rulesets is not related to status checks"). opt-in 으로 **dedicated rule 을 생성**해야 차단 (3-0; changelog 2024-04-30).
- 차단은 **ruleset 에 정의된 심각도 임계**에서만 발화 — security: None/Critical/High or higher/Medium or higher/All; general: None/Errors/Errors and Warnings/All (3-0). **None 선택지 = 절대 차단 안 함도 명시적 선택** → 차단은 튜너블 정책이지 임의 finding 의 자동 결과가 아님. 추가로 alert 의 라인이 **PR diff 안에 존재**해야 차단 (2-1; "all the lines of code identified by an alert must exist in the pull request diff").

**RQ3 요약 패턴(검증된 합의)**: GitHub 에서 **(1)** review/check/SARIF 는 기본 advisory(비차단) **(2)** 차단은 항상 관리자가 켜는 명시적 게이트(required review / required check / ruleset) **(3)** 비차단이어도 timeline·merge box·인라인 주석·fingerprint 추적으로 **가시·지속·diff인지** evidence 가 되며 **(4)** 차단/비차단은 심각도 정책으로 분리 조절된다. → **repo 의 "verdict ≠ 자동 머지차단, 그러나 무시되지 않는 evidence"는 GitHub 기본 동작의 직역이다.**

### 2.2 generator–critic 패턴의 효과·한계 (RQ1) — 후속 웹 보강

> 아래는 본 세션 후속 WebSearch + 1차 출처(arXiv/OpenAI) WebFetch 로 확인했다(**[웹확인]**). 3표 적대적 검증 파이프라인은 거치지 않았으나 다수가 arXiv 원문·OpenAI 1차다. 수치는 모두 **일반 벤치마크** 값이지 이 repo 의 ScreenSpec 의미 리뷰에서 측정한 값이 아님(→ §7-1).

**(A) 자기수정(self-refine/intrinsic)은 단일 모델의 맹점을 공유한다 — repo 가 별도 비평자를 둔 이유.** [웹확인]
- **Self-Refine**(Madaan et al. 2023, arXiv 2303.17651)은 "생성자·교정자·피드백 제공자로 **단일 LLM**을 쓴다(uses a single LLM as the generator, refiner, and feedback provider)"고 명시하며 7개 태스크에서 "평균 **~20% 절대 향상**(improving by ~20% absolute on average)"을 보고한다. 그러나 **단일 모델 구조 자체가 self-bias 의 원천**이다.
- **Huang et al. "LLMs Cannot Self-Correct Reasoning Yet"**(ICLR'24, arXiv 2310.01798): 외부 피드백 없는 **intrinsic self-correction**(스스로의 능력만으로 교정)에서 "LLM 은 외부 피드백 없이 자기수정에 어려움을 겪고 **때로는 자기수정 후 성능이 오히려 저하된다**(performance even degrades after self-correction)"; GSM8K 등에서 자기수정이 정답을 오답으로 바꾸는 경우가 더 많았다(검색 요약). → notes/01 §"품질 착시"·notes/02 §4 "스스로 완료라고 말하는 것을 완료로 믿는 위험"의 **학술적 근거**.

**(B) 별도 비평 모델은 실제로 더 잡지만, 가치는 "외부 신호 grounding"에서 온다.** [웹확인]
- **CriticGPT**(McAleese et al., OpenAI 2024, arXiv 2407.00215, "LLM Critics Help Catch LLM Bugs"): 별도 비평자(RL only)가 자연발생 버그(Human Detected Bugs)에서 ChatGPT 자기비평보다 **62.7%**, 사람 작성 비평보다 **62.8%** 선호됨. LLM 비평자는 "삽입 버그를 사람 계약자보다 **상당히 많이** 잡는다(catch substantially more inserted bugs than human contractors)."
- **단, grounding 이 관건**: Reflexion(Shinn et al. 2023, arXiv 2303.11366)은 HumanEval **91% pass@1**(GPT-4 baseline 80% → +11pt)을 냈는데 코딩 셋업은 **생성 코드를 테스트에 실행한 출력**을 피드백으로 썼다(외부 신호; 검색 요약). Huang 의 "외부 피드백 없으면 저하"와 합치면 — **비평의 효과는 "다른 모델"이라는 사실보다 "외부 evidence 에 grounding"에서 온다**. → repo 매핑: Reviewer(Codex)는 순수 의견이 아니라 **validate 출력·diff·readiness·ScreenSpec·입력에 grounding 한 지적**을 해야 효과적(§4.2 루브릭이 각 항목에 Failure Signal+근거를 의무화한 이유, §3-6).

**(C) 비평자도 환각한다 — human-in-the-loop 가 환각을 줄인다.** [웹확인]
- CriticGPT 한계(저자 명시): "nitpick·환각 버그 비율을 줄였지만 **절대 비율은 여전히 높다**(absolute rate is still quite high)"; 복잡한 버그는 여러 라인에 분산돼 단일 비평으로 잡기 어렵다; "단일 비평은 multi-step 절차보다 약할 수 있다." 그러나 **Human+CriticGPT 팀은 CriticGPT 단독보다 환각·nitpick 이 적다**(hallucinate and nitpick less than both CriticGPT and ChatGPT). → repo 의 "리뷰어 지적은 **후보**, 사람이 닫음"(Semantic Review 신호 = 자동 불합격 아님, §4.2)이 **환각 차단의 정확한 안전판**임을 실증.

**(D) Constitutional AI critique / 명시 원칙** — [일반-prior-art] 명시 원칙(헌법) 집합으로 비평을 구조화. repo 매핑: §4.2 "의미 리뷰 루브릭(S1~S8)"이 곧 비평자의 **명시 원칙 집합** 역할.

### 2.3 구조 린터가 못 잡는 "의미/제품 갭"과 리뷰 루브릭 (RQ2) — 후속 웹 보강

- **repo 내부에 이미 prior art 가 있다** — [repo-합의] notes/02 §4·§5.3 가 "validate 가 보는 것(구조: frontmatter/manifest/route/marker) vs 못 보는 것(의미: UX 타당성, 빠진 state, 기획 의도, Interaction Matrix 의 실제흐름성, copy 톤, API 제품 합리성)"을 이미 열거했고, §5.3 의 쿠폰 예시(구조 통과하지만 정렬기준·만료노출·탭분리·오프라인·권한·회비원분기 누락)가 **그대로 의미 리뷰 루브릭의 출처**다.
- **기존 Review Artifact 체크리스트(A~F)는 "경계 준수"용** — [repo-합의] `review-artifact.template.md` 의 7행(A 게이트판독, B1 allowed내, B2 forbidden무접촉, B3 천장미초과, B4 미확정미발명, E 불변식, F 보고·멱등)은 **work-packet-rubric 10 checks 의 그룹 롤업**이며 주로 **구조·경계·불변식**을 본다. **빠진 축 = 의미/제품 갭**. → §4.2 의 "의미 리뷰" 루브릭은 이 7행을 대체하지 않고 **Reviewer 가 추가로 채우는 별도 카테고리**로 확장(새 축 아님 — 같은 Review Artifact 안의 섹션).
- **LLM-as-judge 루브릭 설계 원칙(외부 prior art)** — [웹확인] **G-Eval**(Liu et al. 2023, arXiv 2303.16634)은 CoT 로 평가 단계를 생성하고 **form-filling** 으로 점수화해 LLM 판정을 안정화(요약 태스크 Spearman 0.514, 기존 지표 대비 향상). 루브릭 best-practice(검색 다수 합치): (i) 기준은 **명확·단순·간결**해야 verbosity·기타 편향이 줄고, (ii) "helpful/safe/faithful" 같은 추상 목표를 **점수 앵커가 있는 검토 가능 차원**으로 바꾸며, (iii) **모호한 형용사 대신 구체적 evidence**(citations, numerical checks, logical order)를 요구해야 신뢰도가 오른다. 좋은 루브릭은 **알려진 편향(verbosity·self-enhancement·surface-fluency)을 겨냥한 bias control**을 내장한다. → repo 정합: §4.2 루브릭이 각 항목에 **관측 가능한 Failure Signal + 근거(파일·라인) 의무화**를 적용한 것은 위 (i)(iii) 원칙의 직접 구현이며, repo 의 기존 규칙("위반은 근거와 함께 기록, 추측으로 메우지 않는다")과 일치.

### 2.4 작성자/비평자에 서로 다른 모델 — 실효와 함정 (RQ4) — 후속 웹 보강

- **self-preference bias 는 측정된 현상이다** — [웹확인] **Panickssery, Bowman, Feng "LLM Evaluators Recognize and Favor Their Own Generations"**(NeurIPS'24, arXiv 2404.13076): self-preference = "LLM 평가자가 자기 출력을 (사람은 동급으로 보는데) **더 높게 채점**한다(scores its own outputs higher than others' while human annotators consider them of equal quality)." 핵심 결과 — **self-recognition 능력과 self-preference bias 강도 사이 선형 상관**(모델이 자기 출력을 알아볼수록 더 후하게 줌). → 작성자=비평자면 편향, **작성자≠비평자(Claude≠Codex)면 일부 완화**의 정량 근거.
- **함정** — [웹확인/일반-prior-art] (i) self-preference 가 self-recognition 에서 오므로 **두 모델이 학습분포·흔한 오해를 공유할수록 편향이 잔존**(완전 소거 아님) (ii) **핸드오프 손실**: 작성자 컨텍스트가 비평자에 온전히 안 가면 엉뚱한 지적 (iii) 비용·지연 증가 (iv) CriticGPT 가 보였듯 **비평자 환각 잔존**(§2.2-C) → "후보·지적까지만, 사람이 닫음"이 안전판.
- **repo 의 현재 채택** — [repo-합의] 설계안 2 §9.1 의 **Claude=Author/Fixer, Codex=Reviewer** 역할분리는 위 self-preference 근거가 **정량적으로 지지**한다. 본 보고서는 유지·형식화하되 "서로 다른 모델이 편향을 **완전히** 없앤다"고는 단정하지 않음(공유 분포 한계 → §7-2).

## 3. Recommendation for k-frontend-workflow

추상론 대신 이 repo 의 파일·메커니즘에 직접 매핑한다.

1. **Review 는 GitHub 의 advisory 채널 모델을 그대로 차용한다(코드 게이트화 금지).** §2.1 이 증명하듯 GitHub 에서 verdict 가 머지를 막는 것은 required-review/required-check/ruleset 를 **사람이 켤 때뿐**이다. 따라서 repo 의 Review Artifact verdict 는:
   - **`validate.mjs` 의 exit code 에 절대 연결하지 않는다**(검사 12종에 review verdict 추가 금지 — review 는 구조검증이 아님, notes/01 불변식 3).
   - CI 에 올린다면 **non-required(advisory) check** 또는 **PR comment / annotation** 으로만 보고 → 자동 머지차단 없음(§2.1-B,C).
   - 차단이 정말 필요하면 그것은 **사람이 켜는 별도 정책**이지 verdict 의 자동 효과가 아님(§2.1-E).
2. **"의미 리뷰"는 기존 Review Artifact 안의 추가 섹션으로 둔다(새 축 금지).** notes/01 §"하지 않는 게 좋은 방향"·로드맵의 "Review Gates 를 독립 축으로 만들지 말라"에 정합. §4.2 루브릭은 `review-artifact.template.md` 에 **Semantic Review 섹션**을 추가하는 형태(기존 A~F Checklist·Violations·Human-only Decisions·Recommended Fixes·Do Not Auto-Fix 구조 유지).
3. **Author/Reviewer/Fixer 순서를 auto-stop 루프로 고정한다.** notes/02 §9.5 의 "auto-fix 보다 auto-stop 먼저"에 정합. Reviewer 가 BLOCKER/MAJOR 를 내면 **자동 수정으로 넘어가지 않고** Run Report 에 evidence 로 적고 멈춘다(사람/Fixer 분기).
4. **readiness 단일 출처를 리뷰가 침범하지 않는다.** Reviewer 는 "readiness 가 과대하다"고 **지적(Failure Signal)**할 수 있으나 readiness 값을 **재계산·덮어쓰지 않는다**(notes/01 불변식 1·9). 과대 의심은 Human-only Decisions / Open Decision 후보로만 표기.
5. **서로 다른 모델 역할분리(Claude=Author/Fixer, Codex=Reviewer)를 유지 — 이제 정량 근거 있음.** self-preference bias(Panickssery, NeurIPS'24)와 intrinsic self-correction 저하(Huang, ICLR'24)는 "작성자가 자기 글을 자기검토하면 안 된다"를 정량적으로 지지하므로 별도 비평자는 합리적 기본값이다(§2.2-A, §2.4). 단 self-preference 는 모델 간 분포 유사성이 크면 잔존하므로 "별도 모델이 편향을 **완전히** 없앤다"고는 과신하지 않는다(§7-2, notes/02 "통과=충분 착각 금지" 테제와 일관).
6. **Reviewer 를 "외부 evidence 에 grounding" 시킨다(순수 의견 금지).** CriticGPT·Reflexion 의 효과는 외부 신호(삽입버그 학습·테스트 실행출력)에서 왔고 순수 intrinsic 비평은 실패했다(§2.2-B). 따라서 repo 의 Reviewer 지적은 반드시 **validate 출력·diff·readiness·ScreenSpec·입력에 근거(파일·라인)**를 달아야 하며, 근거 없는 지적은 §4.2 루브릭에서 후보로도 채택하지 않는다. 이는 비평자 환각(§2.2-C)을 줄이는 1차 방어선이다.

## 4. Concrete deliverable

> 아래 3종은 **복붙 가능**하며 모두 기존 `review-artifact.template.md` / `run-report.template.md` 를 **확장·정합**한다(새 산출물 축 없음).

### 4.1 산출물 1 — Author / Reviewer / Fixer 리뷰 프로토콜

각 역할의 입력·출력·핸드오프 아티팩트·순서. 모든 핸드오프 아티팩트는 **기존 템플릿 안**에서 산다.

```txt
[순서 — auto-stop 루프, notes/02 §9.5 정합]

0) (사전) workflow:state → workflow:readiness 로 readiness output 확정
   = 게이트 단일 출처. 이후 누구도 재계산하지 않음.

1) AUTHOR (Claude)
   입력:  외부 입력(Figma/기획/API/회의록/QA) + readiness output
   출력:  ScreenSpec(초안) · Open Decisions(open) · Unknowns(open)
          + (모드 허용 시) 구현 초안 + Work Packet(work-packet.template.md)
   핸드오프 아티팩트: Work Packet(readiness output 복사만) → Reviewer 에게 링크 전달
   금지:  confirmed 승격 / Open Decision resolve / Unknown·Conflict close
          / API·copy·design value 발명 (전부 사람-전용 또는 입력대기)

2) REVIEWER (Codex)
   입력:  Work Packet + ScreenSpec + Run Report(있으면) + readiness output (전부 링크, 복사 금지)
   출력:  Review Artifact (review-artifact.template.md) — verdict + Checklist(A~F)
          + [추가] Semantic Review 섹션(§4.2 루브릭) + Violations
          + Human-only Decisions Needed + Recommended Fixes + Do Not Auto-Fix
   핸드오프 아티팩트: Review Artifact → Fixer 에게 링크 전달
   역할:  빠진 state·엣지케이스 찾기 / confirmed 오승격 지적 / Unknown→Open Decision
          승격 "검토(후보 제안)" / readiness 과대 "비판(지적)"
   금지:  Open Decision·Conflict·Unknown 닫기(후보·지적까지만) / readiness 덮어쓰기
          / verdict 를 자동 머지차단 게이트로 선언

3) FIXER (Claude)
   입력:  Review Artifact + 원래 Work Packet + readiness output
   출력:  문서/코드 수정(allowed_paths 안에서만) + 갱신된 Run Report(run-report.template.md)
   핸드오프 아티팩트: Run Report(diff/validate/forbidden-paths/test-fixtures 증거) 
   역할:  Recommended Fixes 반영 / validate·forbidden-paths·test-fixtures 통과 확인
   금지:  Do Not Auto-Fix 영역 손대기 / forbidden_paths 수정 / 사람-전용 항목 닫기
   분기:  Review Artifact verdict 가 blocked 이거나 Human-only Decisions 가 있으면
          → 자동수정 멈춤(auto-stop), Run Report 에 blocker 보고 후 사람에게 이관

[반복] Fixer 수정 후 필요 시 2)로 되돌아가 재리뷰. 단 verdict 는 매 회차 evidence 일 뿐
       머지를 자동으로 막지 않음(§4.3 표기 규칙 준수).
```

핸드오프 아티팩트 정합표(전부 기존 템플릿):

| 단계 | 산출 아티팩트 | 템플릿 | 새 축? |
|---|---|---|---|
| Author | Work Packet | `work-packet.template.md` | 아니오 |
| Reviewer | Review Artifact (+ Semantic Review 섹션) | `review-artifact.template.md` 확장 | 아니오 |
| Fixer | Run Report | `run-report.template.md` | 아니오 |

### 4.2 산출물 2 — "의미 리뷰" 루브릭 (Review Artifact 에 Semantic Review 섹션으로 추가)

기존 A~F Checklist(경계·불변식)를 **대체하지 않고** 그 아래 추가하는 섹션. 각 항목은 **Failure Signal(관측 가능한 신호)**을 동반하며, 신호 관측 시 자동 불합격이 아니라 **Reviewer 가 파일을 열어 교차확인 후** Violations 또는 Human-only Decisions 또는 Recommended Fixes 로 라우팅한다(advisory 휴리스틱 원칙, 기존 템플릿 주석 정합).

```md
## Semantic Review (의미/제품 갭 — A~F 경계검사 이후 추가 점검)
<!-- 구조 린터(validate)가 못 보는 의미/제품 판단. 신호 관측은 "후보"이지 자동 불합격 아님 —
     파일 열어 교차확인 후 Violations/Human-only/Recommended Fixes 로 라우팅.
     리뷰어는 어떤 항목도 스스로 닫지 못한다(Open Decision/Unknown/Conflict/confirmed 승격 전부 사람-전용). -->
| # | 점검 항목 | Failure Signal (관측 가능한 신호) | 라우팅 |
|---|---|---|---|
| S1 | 빠진 화면 state | State Matrix 에 loading/empty/error/permission-denied/offline/회원·비회원 분기 중 누락. 기획·입력에 등장하는 흐름이 State Matrix 행에 없음 | Recommended Fixes(상태 추가 제안) 또는 Human-only(제품 결정이면 Open Decision 후보) |
| S2 | 누락 엣지케이스 | Interaction Matrix 가 happy-path 만; 만료/0건/권한없음/네트워크실패/중복요청/페이지네이션 끝 등 분기 행 부재 | Recommended Fixes 또는 Open Decision 후보 |
| S3 | Unknown↔Open Decision 오분류 | 구현 모드를 실제로 막아야 하는 선택(예: 만료쿠폰 노출방식 before final-fixture-ui)이 Unknowns 에만 있고 Open Decisions 에 없음 (notes/02 §5.1) | **Human-only Decisions Needed** 에 "Open Decision 승격 후보" 로 기재(리뷰어가 승격하지 않음 — 후보 제안) |
| S4 | readiness 과대 | readiness_mode 가 ScreenSpec 실질 성숙도보다 높아 보임(예: state_matrix 빈약한데 api-integrated 근접). 단 readiness 값 자체는 재계산 금지 | **Human-only Decisions** 에 "readiness 과대 의심" 지적 + (필요시) 막을 Open Decision 후보. readiness 덮어쓰기 금지 |
| S5 | confirmed 오승격 | status:confirmed 인데 approved_by/approved_at/decision_id 부재이거나, 사람 승인 흔적 없이 candidate→confirmed 로 바뀜 | Violations(B2/E 와 교차) + Human-only(사람이 되돌리거나 정식 승격) |
| S6 | copy 추측 | tbd/draft 여야 할 copy 가 brand-tone 근거 없이 confirmed 문구로 발명됨; Copy Keys 3-state 와 본문 불일치 | Do Not Auto-Fix(문구 발명 금지, TBD 유지) + Violations(발명 시) |
| S7 | API 후보 추측 | candidate 여야 할 endpoint 가 제품 근거 없이 확정 서술되거나 src/api/** 에 실제 호출로 발명됨 | Do Not Auto-Fix(추측 작성 금지, candidate 유지) + Violations(B4/forbidden 침범 시) |
| S8 | Interaction Matrix 비현실성 | 매트릭스 행이 존재하지만 실제 사용자 흐름과 어긋남(도달 불가 상태, 빠진 전이) | Recommended Fixes 또는 Human-only(기획 의도 확인 필요) |
```

**루브릭 사용 규칙(불변식 정합)**:
- 모든 항목은 **근거(파일·라인·diff)**를 적는다 — 추측으로 메우지 않는다(기존 템플릿 규칙).
- S3·S4 처럼 "게이트/결정"에 닿는 항목은 **반드시 Human-only Decisions Needed 로만** 흘러간다 — 리뷰어는 승격·resolve·close 를 하지 않는다(Track 03 안전선 b).
- S4 는 readiness 를 **지적만** 하고 **재계산/덮어쓰지 않는다**(Track 03 안전선 c).

### 4.3 산출물 3 — verdict 를 "사람-전용 결정을 닫지 않는" evidence 로 적는 표기 규칙

Review Artifact 의 `verdict` 와 Run Report 가 **사람-전용 결정을 자동으로 닫지 않도록** 하는 표기 규칙. GitHub 의 "advisory check + annotation" 모델(§2.1)을 문서 표기로 옮긴 것.

**(1) verdict 의미를 "evidence 라벨"로 고정(머지 판정 아님).** `review-artifact.template.md` 의 Verdict 주석을 다음으로 강화:

```md
## Verdict
<!-- verdict 는 리뷰 evidence 라벨이다. 머지를 자동으로 막거나 허가하지 않는다.
     게이트는 readiness(Open Decision) + validate(구조) 뿐. verdict 는 그 위의 advisory 신호.
       approve            = 경계·천장·불변식 + Semantic Review 에서 막을 사유 못 찾음(=advisory 통과).
       changes-requested  = 고칠 수 있는 위반/의미갭 존재 → Recommended Fixes. (자동 머지차단 아님; 사람이 머지 결정)
       blocked            = 사람-전용 결정/Conflict 때문에 "리뷰어가 더 진행 못 함" → Human-only Decisions Needed.
                            ⚠ blocked 는 "리뷰어가 닫지 못함"을 뜻하지, 그 결정을 "닫았다"는 뜻이 아니다.
                            ⚠ blocked verdict 자체가 머지를 자동 차단하지 않는다 — 차단은 사람이 켜는 별도 정책. -->
**{approve | changes-requested | blocked}** — {한 줄 근거.} (advisory evidence — 머지 게이트 아님)
```

**(2) "사람-전용 결정을 닫지 않음"을 verdict 옆에 항상 명시.** blocked/changes-requested 일 때 Human-only Decisions Needed 표에 다음 컬럼 규칙을 강제:

```md
## Human-only Decisions Needed
<!-- verdict 가 blocked/changes-requested 라도 아래 항목은 "리뷰가 닫은 것"이 아니라 "사람이 닫아야 할 것"이다.
     리뷰어/Fixer/runner 누구도 이 표의 항목을 resolve/close/승격하지 못한다. -->
| ID | 유형 | 내용 | Owner | 상태(리뷰가 바꾸지 않음) | 왜 사람만 |
|---|---|---|---|---|---|
| {D-301} | decision | {결정 질문} | {PM} | open (리뷰어 변경 금지) | 게이트 해제·resolve 는 사람-전용 |
| {C-001} | conflict | {충돌} | {PM} | open (리뷰어 변경 금지) | conflict close 는 사람-전용 |
| {U-001→D?} | unknown→decision 후보 | {Open Decision 승격 제안} | {PM} | unknown 유지 (승격은 사람) | Unknown→Open Decision 승격은 사람-전용 |
```

**(3) Run Report 에 review 결과를 evidence 로만 합류(게이트화 금지).** `run-report.template.md` 의 Summary/Gate Compliance 와 **별도**로 review 를 advisory 로 적는다:

```md
## Review Evidence (advisory — 게이트 아님)
<!-- Review Artifact 의 verdict 를 evidence 로 옮긴다. readiness/validate 게이트 판정과 섞지 않는다.
     verdict 는 머지를 자동 차단/허가하지 않는다(§Track03 안전선 a). -->
- Review Artifact: `{path}` / verdict: **{approve|changes-requested|blocked}** (advisory)
- Reviewer Semantic Review 지적 수: {n} (S1..S8 중 관측 항목 ID 나열)
- Human-only Decisions(리뷰가 닫지 않음): {D-301(open), C-001(open), ...} 또는 "없음"
- 처리 상태: Recommended Fixes 중 반영 {k}/{m} (나머지는 Do Not Auto-Fix 또는 사람 대기)
- ⚠ verdict 가 blocked 여도 이 Run Report 는 머지를 자동 차단하지 않는다 — 머지 결정은 사람.
```

**(4) (선택) GitHub 표면화 매핑** — repo 가 PR 흐름과 연동한다면(§2.1 근거):
- verdict 를 **PR review comment** 또는 **non-required status check** 로 보고 → 가시화하되 자동 차단 없음.
- Semantic Review 지적을 **SARIF 로 변환해 인라인 주석**(error→차단가능/warning·note→비차단)으로 올릴 수 있으나, **차단 임계(ruleset)는 사람이 명시적으로 켤 때만** — 기본은 None/note(비차단).
- conversation thread resolve 로 Recommended Fixes 처리 추적(머지와 독립).

## 5. Invariant safety check

공통 불변식 10개 + Track 03 안전선 (a)(b)(c) 에 대해 산출물 1·2·3 을 자가검증한다. **긴장 지점**을 숨기지 않고 명시한다.

| 불변식 | 본 보고서 산출물에서의 처리 | 위반? |
|---|---|---|
| readiness.mjs = 판정 단일출처(재계산/덮어쓰기 금지) | 프로토콜 0)에서 readiness 확정 후 누구도 재계산 안 함. 루브릭 S4 는 과대 "지적"만, **readiness 값 변경 금지** 명시 | 없음 |
| Work Packet = 실행봉투(새 게이트/source 아님, readiness 복사만) | Author 핸드오프가 Work Packet(readiness 복사만). 새 권한 부여 안 함 | 없음 |
| validate/forbidden-paths/test-fixtures = 구조검증(증거로만) | Fixer 가 통과 "확인"용으로만 소비. review verdict 를 validate 에 연결 금지 명시(§3.1) | 없음 |
| LLM 은 Open Decision resolve/Unknown close/Conflict close/candidate→confirmed 승격 안 함 | 프로토콜 1)2)3) 전부 "금지" 명시. 루브릭 S3·S5 는 후보·지적 → Human-only 표로만 | 없음 |
| Unknown 은 기본 게이트 아님(막으려면 Open Decision 승격) | S3 가 "Open Decision 승격 후보"를 Human-only 로 — 승격은 사람 | 없음 |
| 첫 구현은 auto-stop 루프 | 프로토콜 3) Fixer 분기 = blocked/Human-only 시 자동수정 멈춤(auto-stop). §4.1 명시 | 없음 |
| 스크립트는 가드레일이지 리뷰 대체 아님 | 본 보고서는 리뷰를 **추가**(validate 대체 아님). §2.3 가 "validate≠의미리뷰" 전제 | 없음 |
| 새 산출물 축 안 늘림 | 산출물 1·2·3 전부 기존 Work Packet/Review Artifact/Run Report **안의 섹션 확장**. §4 정합표로 증명 | 없음 |
| **Review 는 독립 게이트 아님(verdict ≠ 자동 머지차단)** | §4.3 (1)(2)(3) 전부 "advisory evidence, 머지 게이트 아님" 표기. GitHub advisory 근거(§2.1) | 없음 |
| generated/confirmed artifact hand-edit 금지 | S5(confirmed 오승격)·S6·S7 이 발명·hand-edit 을 Violations/Do Not Auto-Fix 로 차단 | 없음 |
| **Track03 (a) verdict ≠ 자동 머지차단** | §4.3 verdict 주석에 "blocked 도 자동 차단 안 함, 차단은 사람이 켜는 별도 정책" 명시. §2.1-A,B 근거 | 없음 |
| **Track03 (b) LLM 리뷰어도 Open Decision/Conflict/Unknown 못 닫음** | 루브릭 규칙 + Human-only 표 "상태(리뷰가 바꾸지 않음)" 컬럼 강제 | 없음 |
| **Track03 (c) readiness 단일출처(리뷰어가 덮어쓰지 않음)** | S4 가 "지적만, 재계산/덮어쓰기 금지" 명시 | 없음 |

**명시적 긴장 지점(은폐 금지)**:
1. **changes-requested 의 "사회적 게이트화"**: GitHub 근거상 verdict 는 자동 차단이 아니지만(§2.1-A), 운영에서 "changes-requested 면 머지하지 말자"가 **암묵 규칙**이 되면 사실상 게이트처럼 작동할 수 있다. → §4.3 (1) 의 "(advisory evidence — 머지 게이트 아님)" 꼬리표와 (3) 의 ⚠ 문구로 **표기상 명시 차단**했으나, 이는 **표기 규칙이지 기술적 강제는 아니다**(사람 규율 의존). 기술적으로 막으려면 verdict 를 required check 로 배선하지 않는 것(§3.1)으로 충분.
2. **SARIF error→차단 가능 경로**: §2.1-E 는 심각도 error 가 ruleset 으로 차단될 수 있음을 보인다. 본 보고서는 Semantic Review 지적을 SARIF 로 올릴 때 **기본 note/비차단**을 권고하고 차단 임계는 "사람이 켤 때만"으로 제한했다(§4.3-4). 이 선을 넘어 자동 error-차단을 켜면 안전선 (a) 위반이 되므로 **명시 금지**로 표기.
3. **S4(readiness 과대) vs 단일출처**: 리뷰어가 readiness 를 비판하는 것과 덮어쓰지 않는 것의 경계가 운영상 흐려질 위험. → S4 라우팅을 "Human-only Decisions + (필요시) Open Decision 후보"로 **강제**해, 비판은 사람 결정으로만 게이트화되게 했다.

결론: **불변식 위반 없음.** 모든 긴장 지점은 표기/라우팅 규칙으로 안전선 안에 묶었고, 남는 잔여 위험은 "기술적 강제 아닌 사람 규율 의존"으로 §6 에 이관한다.

## 6. Risks / trade-offs / what NOT to do

- **[하지 말 것] verdict 를 validate.mjs exit code 나 required check 로 배선하기.** 이 순간 review 가 독립 게이트가 되어 안전선 (a) 위반. review 는 검사 12종에 추가하지 않는다(notes/01 불변식 3).
- **[하지 말 것] 리뷰어가 Open Decision/Unknown/Conflict 를 닫거나 readiness 를 덮어쓰기.** 후보·지적까지만(안전선 b,c). Human-only 표의 "상태(리뷰가 바꾸지 않음)" 컬럼이 이를 가시화.
- **[하지 말 것] Semantic Review 신호를 자동 불합격으로 처리.** S1~S8 은 휴리스틱 후보다 — 파일 열어 교차확인(기존 advisory 휴리스틱 원칙). 자동 불합격은 false-positive 로 Fixer 를 잘못된 수정으로 몰 수 있다.
- **[트레이드오프] cross-model(Claude/Codex) 비용·핸드오프 손실.** 두 모델 + 라운드 = 토큰·지연 증가, 컨텍스트 전달 손실 위험(§2.4). 완화: 핸드오프를 **링크(복사 금지)**로 하고 Review Artifact 를 단일 진실 전달면으로.
- **[리스크] 일반 벤치마크를 이 repo 결과로 과대해석.** RQ1/RQ4 수치(CriticGPT 62.7%, Self-Refine ~20%, self-preference 선형상관)는 **후속 웹으로 확인됐으나** HumanEval·일반 코드비평 등 **외부 벤치마크** 결과지 이 repo 의 ScreenSpec 의미 리뷰에서 측정된 값이 아니다. "Codex 리뷰가 우리 화면에서 X% 더 잡는다"로 옮겨 적으면 안 됨 → §7-1 로 측정 이관. (notes/01 green-check complacency 와 동일 교훈: 자동 파이프라인·외부 수치를 그대로 믿지 말 것.)
- **[리스크] 비평자 환각(hallucinated critique).** CriticGPT 도 nitpick·환각 버그 절대비율이 여전히 높다(§2.2-C). Reviewer 의 Semantic Review 지적을 자동 불합격으로 처리하면 false-positive 가 Fixer 를 오수정으로 몬다 → 반드시 "후보 → 사람/Fixer 가 파일 열어 교차확인 → 라우팅"(§4.2). human+critic 이 critic 단독보다 환각이 적다는 실증과 일관.
- **[리스크] changes-requested 의 암묵적 게이트화(§5 긴장1).** 표기 규칙은 사람 규율 의존이라 문화적으로 우회될 수 있다. 정기적으로 "verdict=advisory" 원칙을 README/Skill 문구로 재확인 권고.
- **[하지 말 것] Review 를 새 산출물 축으로 분리.** 로드맵·notes/01 명시 금지. 항상 Work Packet/Review Artifact/Run Report **안**에서.

## 7. Open questions for synthesis

1. **이 repo 에서 별도 비평의 실측 우위(RQ1)**: 일반 벤치마크는 별도 비평 우위(CriticGPT 62.7%)·intrinsic 자기수정 저하(Huang)를 보였으나(§2.2), 이 repo 의 **ScreenSpec 의미 리뷰**에서 Codex Reviewer 가 Claude 자기검토보다 빠진 state·오승격을 실제로 더 잡는지는 **미측정**이다. coupon-feature 예제에 A/B(Claude 자기검토 vs Codex 별도검토)로 precision/recall 을 측정할 수 있는가?
2. **공유 분포에서의 self-preference 잔존(RQ4)**: Panickssery(NeurIPS'24)는 self-recognition↔self-preference 선형상관을 보였다(§2.4). 그러나 Claude↔Codex 처럼 학습분포가 다른 모델 쌍에서 self-preference 가 **얼마나** 남는지의 수치는 미확정 — 두 모델이 같은 흔한 오해(예: 동일 프레임워크 안티패턴)를 공유하는 영역은 어디이고, 거기서 cross-model 이 무력해지는가?
3. **의미 리뷰 루브릭의 효과 측정**: S1~S8 Failure Signal 이 실제 의미 갭(빠진 state 등)을 잡는 precision/recall 은? repo 의 기존 예제(coupon-feature)에 적용해 false-positive 율을 측정할 수 있는가?
4. **표기 규칙의 사회적 게이트화 방지 실효(§5 긴장1)**: "(advisory — 게이트 아님)" 꼬리표가 실제로 changes-requested 의 암묵 게이트화를 막는가? 기술적 강제 없이 표기만으로 충분한지, 아니면 verdict 를 의도적으로 PR 차단 UI 에서 분리하는 추가 장치가 필요한지.

## 8. Sources

> 출처 1~16 (RQ3) 은 deep-research 워크플로우의 3표 적대적 검증을 통과한 주장의 1차/보강 출처다(대부분 GitHub 공식 docs, 3-0 만장일치). 출처 17~23 (RQ1/RQ2/RQ4) 은 **본 세션 후속 WebSearch + 1차 출처 WebFetch 로 확인한 학술 원문**이다(**[웹확인]** — 3표 적대적 검증 파이프라인은 거치지 않음). 24 는 repo 내부 산출물([repo-합의]).

1. GitHub Docs — About pull request reviews: https://docs.github.com/en/enterprise-cloud@latest/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews
2. GitHub Docs — About protected branches: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
3. GitHub Docs — Approving a pull request with required reviews: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews
4. Graphite — Prevent merge without review on GitHub: https://graphite.com/guides/prevent-merge-without-review-github
5. GitHub Docs — SARIF files for code scanning: https://docs.github.com/en/code-security/concepts/code-scanning/sarif-files
6. GitHub Docs — SARIF support for code scanning: https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning
7. GitHub Docs — Triaging code scanning alerts in pull requests: https://docs.github.com/en/code-security/code-scanning/managing-code-scanning-alerts/triaging-code-scanning-alerts-in-pull-requests
8. GitHub Docs — Troubleshooting required status checks: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/troubleshooting-required-status-checks
9. GitHub Changelog — Code scanning rulesets to prevent PR merges (beta, 2024-04-30): https://github.blog/changelog/2024-04-30-code-scanning-now-allows-configuring-rulesets-to-prevent-pull-requests-from-being-merged-beta/
10. GitHub Docs — Code scanning merge protection (concept): https://docs.github.com/en/code-security/concepts/code-scanning/merge-protection
11. GitHub Docs — Set code scanning merge protection: https://docs.github.com/en/code-security/code-scanning/managing-your-code-scanning-configuration/set-code-scanning-merge-protection
12. GitHub Docs — REST API for code scanning (SARIF upload): https://docs.github.com/en/rest/code-scanning/code-scanning
13. GitHub Docs — About protected branches (required reviews / rulesets): https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
14. OASIS — SARIF v2.1.0 Standard: https://www.oasis-open.org/standard/sarif-v2-1-0/
15. dev.to (Pavel Espitia) — SARIF: the format that connects your AI auditor to GitHub Code Scanning: https://dev.to/pavelespitia/sarif-the-format-that-connects-your-ai-auditor-to-github-code-scanning-311n
16. GitHub Docs — About code scanning alerts (diff-overlap rule): https://docs.github.com/en/code-security/code-scanning/managing-code-scanning-alerts/about-code-scanning-alerts
17. Madaan et al. 2023 — Self-Refine: Iterative Refinement with Self-Feedback (단일 LLM 으로 생성·피드백·교정; 7태스크 평균 ~20% 절대 향상): https://arxiv.org/abs/2303.17651
18. Huang et al. 2023 (ICLR'24) — Large Language Models Cannot Self-Correct Reasoning Yet (외부 피드백 없는 intrinsic self-correction 은 추론 성능을 오히려 저하): https://arxiv.org/abs/2310.01798
19. Shinn et al. 2023 — Reflexion: Language Agents with Verbal Reinforcement Learning (HumanEval 91% pass@1 vs GPT-4 80%; 외부 task feedback 신호 사용): https://arxiv.org/abs/2303.11366
20. McAleese et al. 2024 (OpenAI) — LLM Critics Help Catch LLM Bugs / CriticGPT (별도 비평자가 ChatGPT 자기비평 대비 62.7%·사람 비평 대비 62.8% 선호, 삽입버그를 사람보다 많이 잡음, 환각 절대비율은 잔존): https://arxiv.org/abs/2407.00215 · 블로그: https://openai.com/index/finding-gpt4s-mistakes-with-gpt-4/
21. Panickssery, Bowman, Feng 2024 (NeurIPS'24) — LLM Evaluators Recognize and Favor Their Own Generations (self-preference bias; self-recognition↔self-preference 선형상관): https://arxiv.org/abs/2404.13076
22. Liu et al. 2023 — G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment (CoT + form-filling; 요약 태스크 Spearman 0.514): https://arxiv.org/abs/2303.16634
23. (LLM-as-judge 루브릭 best-practice, [웹확인] — 블로그/2차 보강) Confident AI — G-Eval guide: https://www.confident-ai.com/blog/g-eval-the-definitive-guide · Twine — LLM evaluation rubrics: https://www.twine.net/blog/llm-evaluation-rubrics/
24. (repo) 기존 산출물 — `frontend-workflow-kit/templates/work-packet/{review-artifact,run-report,work-packet}.template.md`; `temp/execution-loop-research/notes/01-loop-engineering.md`, `02-llm-only-scriptization-risk.md` (RQ1/RQ2/RQ4 의 [repo-합의] 근거)