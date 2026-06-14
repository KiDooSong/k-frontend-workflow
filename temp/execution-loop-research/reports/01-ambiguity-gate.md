---
track: 01
title: Ambiguity Gate & Unknown→Open Decision triage
date: 2026-06-14
status: draft
inputs: [notes/01-loop-engineering.md, notes/02-llm-only-scriptization-risk.md]
method_note: >
  deep-research 워크플로우(5각도 fan-out → 14소스 → 67주장 → 상위 25 검증)로 실행했으나,
  1차 적대적 검증 단계가 API rate-limit 으로 전멸(25/25 abstain → fail-closed kill, "0 confirmed")했다.
  그 "refuted" 는 진짜 반박이 아니라 검증 미실행 위양성이었다. 이후 사용자 요청으로 검증을 재실행 —
  메인 세션이 11개 소스 원문을 WebFetch 로 직접 재대조했다. 결과: 확인 19 · 부분확인 3 · 교정 1 · 접근불가 2
  (§2.0 검증 원장). 자동 "전부 반박"이 위양성이었음이 입증됐고, 그 과정에서 arxiv 2605.06717 의 추출 주장
  (cost-benefit 의사결정이론 프레이밍)이 과장임을 잡아 교정했다.
confidence_labels:
  - "[✅확인]: 원문 직접 대조로 직접 지지됨(인용 확보)"
  - "[◐부분]: 핵심은 확인되나 일부 강한 단정은 원문에 미명시 → 보수적으로 표기"
  - "[✖교정]: 자동추출이 과장/오인 → 원문 대조로 교정"
  - "[⚠접근불가]: 소스 페치 실패(403) → 다른 확인된 소스로 substance 교차확인"
---

# Track 01 — Ambiguity Gate & Unknown→Open Decision triage

## 1. Executive summary

- **핵심 발견**: 구현 전 모호성을 게이트로 거는 흐름은 학술(coding-agent clarification)과 실무(DoR/RAID) 양쪽에 선행 사례가 충분하다. 단, 효과가 검증된 패턴은 **"멈추고 무조건 질문"이 아니라 "탐지된 모호성 신호에만 질문하고, 복잡도에 맞춰 calibrate"** 하는 쪽이다 (ClarifyGPT 의 code-consistency 게이트, *Ask or Assume?* 의 well-calibrated information-seeking). 무차별 질문은 clarification fatigue 로 역효과.
- **이 repo 와의 정합**: 설계안 2 의 "첫 질문은 *애매한 거 놓친 거 없나?*" 주장은 선행 연구와 정확히 일치한다. `ClarifyGPT` 의 핵심은 "코드 생성 전에 ambiguity classifier 를 둔다"인데, 이 repo 의 `workflow:packet` → `Ambiguity Review Required` 가 바로 그 classifier 자리다. 단 **이 repo 는 그 게이트를 코드가 아니라 LLM 대화로** 둬야 한다(불변식).
- **Unknown vs Decision triage 는 PM 의 RAID/decision-log 패턴이 곧장 매핑된다**: "단일 사실로 닫히는가(Issue/Assumption)" vs "권한 있는 owner 의 선택이 필요한가(Decision)". 이 repo 의 Unknown(passive, 게이트 아님) vs Open Decision(owner·blocking) 구분은 이 PM 프레임워크와 1:1 대응한다.
- **DoR 의 핵심 실패 모드는 "게이트가 무엇을 거느냐"** 에 있다: 임의·100%-완료 기준을 걸면 체크리스트가 stage-gate(=waterfall)·"burly bouncer"·checklist-worship·PO-팀 계약분쟁으로 퇴화한다 (Mike Cohn·Scrum Alliance·Serious Scrum, 전부 원문 확인). 단 rgalen 은 재검증 결과 **"게이트 메커니즘 자체가 악이 아니라, 무엇을 gate 하는지가 문제"** 라고 정교화한다 — 정당한 blocking 결정에만 걸면 유효. → **권고: Ambiguity Gate 를 하드 스크립트 게이트로 만들지 말고 warning-first 대화 프롬프트로 두되, 강(strong) 신호의 blocking 결정에만 승격**. 이 repo 의 "게이트는 Open Decision + 정책 fact 뿐" 불변식과 정확히 같은 방향.
- **권고 산출물 3종**(§4): ① `Ambiguity Review Required` 섹션 스키마(4블록), ② Unknown→Open Decision 승격 rubric(결정트리 + 신호표 + 7단 Blocking Mode 매핑), ③ 모드별 Safe-To-Proceed 결정표(auto-stop 판단). 세 산출물 모두 **후보 제안까지만** 하고 닫는 건 사람.
- **방법론 경고(실증됨)**: 자동 적대적 검증이 rate-limit 으로 전멸해 "25/25 refuted"를 냈으나, 재검증 결과는 **확인 19·부분 3·교정 1·접근불가 2** 로 정반대였다. 자동 verdict 의 red 가 위양성, 그리고 그 와중에 한 소스(2605.06717)는 green 쪽에서 과장 추출됐다(교정). 즉 자동 파이프라인은 **red 도 green 도 그대로 믿으면 안 된다** — 본 repo 의 "통과 = 충분 아님" 테제(green-check complacency, Track 05)의 살아있는 실사례.

## 2. Prior art & findings

> 신뢰도 라벨: **[✅확인]** = 원문 직접 대조 / **[◐부분]** = 핵심 확인·일부 단정 미명시 / **[✖교정]** = 과장·오인 교정 / **[⚠접근불가]** = 페치 실패, 타 소스로 교차확인.

### 2.0 검증 원장 (재실행 결과)

1차 자동 검증은 rate-limit 으로 25/25 abstain→kill 되어 "0 confirmed"를 냈다. 사용자 요청으로 메인 세션이 11개 소스 원문을 직접 재대조한 결과는 **정반대**다 — **확인 19 · 부분확인 3 · 교정 1 · 접근불가 2**.

| # | 주장(요지) | 소스 | verdict |
|---|---|---|---|
| 1 | LLM 은 코드 전 clarifying Q 를 물어야(top SWE 모방) | 2308.13507 | ✅ 확인 (제목 정정: *LLMs Should Ask Clarifying Questions to Increase Confidence in Generated Code*, Jie JW Wu) |
| 2 | communicator 가 high-ambiguity/low-conf "만" 질문(임계 escalation) | 2308.13507 | ◐ 부분 (communicator 는 확인; "그것만 트리거/임계"는 abstract 미명시) |
| 3 | underspec 탐지를 코드 실행에서 분리(멀티에이전트 scaffold) | 2603.26233 | ✅ 확인 |
| 4 | 단순 작업엔 침묵·복잡 작업엔 질문(well-calibrated) | 2603.26233 | ✅ 확인 |
| 5 | ClarifyGPT 2단 게이트 — code consistency check 후 모호 시에만 질문 | 2310.10996 | ✅ 확인 |
| 6 | 신호 = 생성물 불일치(자기-확신 점수 아님) | 2310.10996 | ✅ 확인 |
| 7 | 모델들이 under/well-spec 구분 못함; Claude Sonnet 3.5 만 84% | 2502.13069 | ✅ 확인 (Table 3: 0.84, 타모델 0.47–0.69) |
| 8 | interactive clarification 최대 +74% | 2502.13069 | ✅ 확인 |
| 9 | 3단 프롬프트(neutral/moderate/strong); 회복률 80/59/54% | 2502.13069 | ✅ 확인 (§4.2·§3.2) |
| 10 | ask-vs-assume = expected benefit>interruption cost 의사결정이론 정책 | 2605.06717 | ✖ 교정 (그렇게 프레이밍 안 함 — insight policy/mixed-initiative/taxonomy) |
| 11 | DoR 은 옵션, Scrum 필수 아님 | scrumalliance | ✅ 확인 |
| 12 | DoR → sequential/waterfall 게이트(스프린트 진입 차단) | scrumalliance | ✅ 확인 |
| 13 | DoR 이 체크리스트 충족 자체로 초점 이동(checklist-worship) | scrumalliance | ✅ 확인 |
| 14 | RAID = R/A/I/D; A→Actions, D→Decisions remap | smartsheet | ✅ 확인 |
| 15 | Issues(현재)·Risks(미래)·Assumptions(미검증 전제) 3분할 | smartsheet | ✅ 확인 |
| 16 | D=Decisions → stakeholder 선택, audit-trail 별도 decision log | smartsheet | ◐ 부분 (stakeholder 선택 확인; 별도 로그/audit 권고는 미명시) |
| 17 | Mike Cohn: 대부분 팀에 DoR 비권장, 불필요 overhead | mountaingoat | ✅ 확인 (직접 인용) |
| 18 | 100% 완료 후 진입 → stage-gate, agile 저해 | mountaingoat | ✅ 확인 (직접 인용) |
| 19 | "X 끝나야 다음 시작" → waterfall | mountaingoat | ✅ 확인 (직접 인용) |
| 20 | 과엄격 DoR → gated handoff 재도입이 핵심 실패 | rgalen | ✅ 확인 |
| 21 | 게이트 "메커니즘 자체"가 안티패턴 | rgalen | ◐ 부분 (Galen: "무엇을 gate 하나"가 문제 — 메커니즘 자체 아님; 단순화 교정) |
| 22 | DoR 이 pull→push 전환, 작업 차단 | teamworx | ⚠ 접근불가(403) — Cohn·scrumalliance 로 substance 교차확인 |
| 23 | DoR 이 팀 사고 전 솔루션 과명세 | teamworx | ⚠ 접근불가(403) — DoR 비판 consensus 와 일치 |
| 24 | DoR 오해 시 contract 화 → 팀-PO 대립 | medium | ✅ 확인 (직접 인용) |
| 25 | DoR = "burly bouncer" 병목 | medium | ✅ 확인 (Cohn 인용) |

### 2.1 코딩 에이전트의 ambiguity 탐지 & clarification (RQ1·RQ2)

- **ClarifyGPT** — *"ClarifyGPT: Empowering LLM-based Code Generation with Intention Clarification"* (arxiv 2310.10996). **[✅확인]** 두 단계 게이트: ① **code consistency check** 로 요구사항이 모호한지 먼저 판정(여러 코드 솔루션을 샘플링해 불일치가 크면 모호로 플래그), ② 모호할 때만 targeted clarifying question 생성, 아니면 바로 코드 생성. 신호가 **LLM 의 자기-확신 점수가 아니라 "생성물들의 불일치"** 라는 점이 핵심 — 모호성을 간접 측정한다. 효과: GPT-4 MBPP-sanitized 70.96% → 80.80%. *한계*: 함수 단위 태스크 중심, N회 샘플링 비용, "제품적으로 맞는가"는 못 봄.
- **Ask or Assume?** — *"Ask or Assume? Uncertainty-Aware Clarification-Seeking in Coding Agents"* (arxiv 2603.26233, Edwards & Schuster). **[✅확인]** **underspecification 탐지를 코드 실행에서 분리한 멀티에이전트 scaffold**. "well-calibrated information-seeking behavior, conserving queries on simple tasks while proactively seeking information on more complex issues" — 즉 **모든 불확실성에 묻지 않고 복잡도에 calibrate**. underspecified SWE-bench Verified 변형에서 69.40% 해결률(단일 에이전트 대비 향상). *시사점*: "탐지기(detector)"를 "빌더(builder)"에서 구조적으로 떼어 놓는 설계 = 이 repo 의 `Ambiguity Review` 를 코딩 단계에서 분리하는 근거.
- **Interactive agents for underspecificity in SE** — (arxiv 2502.13069). **[✅확인]** interactive clarification 이 non-interactive 대비 **최대 +74%** 향상. 모델들이 well-specified vs underspecified 를 잘 구분하지 못하며 **Claude Sonnet 3.5 만 84% 구분 정확도**(Table 3; 타 모델 0.47–0.69). **3단 프롬프트**(neutral = 불명확하면 물어도 됨 / moderate = 모든 필요정보 확인 후 진행 / strong = 질문이 critical)를 실험하나 **프롬프트만으로는 일관 개선 안 됨**(§4.2). 상호작용 회복률은 Claude ~80%, Deepseek-v2 59%, Llama 3.1 54%(§3.2) — **모델 편차가 크다는 게 핵심**. *시사점*: "물어라" 프롬프트만으로 부족 → 탐지 신호(불일치/복잡도)에 게이트해야.
- **LLMs Should Ask Clarifying Questions…** — (arxiv 2308.13507, Jie JW Wu). **[✅확인/◐부분]** 핵심 주장(코드 생성 전 clarifying question 으로 ambiguity 감소, "top-level SWE 가 묻는다"는 관찰 기반)은 원문 확인. LLM "communicator" 가 high-ambiguity/low-confidence 요소를 식별하는 것도 확인. 단 **"그 요소만 트리거하는 임계 escalation"** 이라는 강한 단정은 abstract 에 미명시(◐) — confidence-gating 의 구체 조건 로직은 본문 확인 필요.
- **Proactivity, not autonomy** — *"Agentic Coding Needs Proactivity, Not Just Autonomy"* (arxiv 2605.06717, Bui & Evangelopoulos). **[✖교정]** 자동추출은 "expected benefit > interruption cost 의 decision-theoretic insight policy"로 단정했으나, 원문 대조 결과 **그런 정식 cost-benefit 모델로 프레이밍하지 않는다**. 실제 내용: proactivity taxonomy(Reactive / Scheduled / Situation-Aware)와 평가지표(Insight Decision Quality, Context Grounding Score, Learning Lift), mixed-initiative interaction 기반. → 인용은 "proactive collaborator / mixed-initiative" 근거로만 쓰고, "정량 임계" 근거로는 쓰지 않는다.

요약 패턴(검증 가능한 합의): **(a)** ambiguity 는 별도 탐지기로 판정하고 **(b)** 탐지 신호가 켜질 때만 질문하며 **(c)** 신호는 "생성물 불일치"나 "복잡도" 같은 간접 지표가 실전적이고 **(d)** 효과는 크지만(+74%) 모델 편차가 크다.

### 2.2 Definition of Ready / pre-implementation 게이트의 실패 모드 (RQ3)

- **DoR 은 Scrum 필수가 아니라 옵션 체크리스트** (Scrum Alliance, *Pros/Cons of DoR*). **[출처-귀속]** → 하드 게이트로 강제하는 것 자체가 본래 용법 이탈.
- **Mike Cohn, *The Dangers of a Definition of Ready*** (mountaingoatsoftware.com). **[출처-귀속]** 대부분 팀에 rigid DoR 비권장. "100% 완료돼야 진입" 규칙은 **sequential stage-gate = waterfall** 로 퇴화하여 동시적 analysis/design/coding/testing 을 죽인다.
- **Bob Galen, *DoR as an Anti-Pattern*** (rgalen.com) & **teamworx**. **[출처-귀속]** "X 가 끝나야 다음이 시작" 형태의 규칙 = stage-gate 로 위험하게 근접. **게이트 "내용"이 아니라 게이트 "메커니즘"이 안티패턴**. pull 워크플로우를 push 로 바꾸고 iteration 경계에 병목 생성.
- **Serious Scrum** (medium). **[출처-귀속]** 오해되면 guideline 이 **binding contract** 가 되어 팀-PO 가 adversaries 로. DoR 이 "iteration 문 앞의 burly bouncer"가 되는 rigidity 실패.
- **checklist-worship / 형식주의** (Scrum Alliance). **[출처-귀속]** 목표가 아니라 체크리스트 충족 자체로 초점이 이동.

요약: DoR 실패 4종 = ① stage-gate/waterfall 퇴화 ② checklist-worship ③ contract 화(분쟁) ④ push/병목. **공통 처방: 가벼운 guideline·대화 프롬프트로 두고 하드 binary gate 로 만들지 말 것.**

### 2.3 Unknown vs Decision triage 프레임워크 (RQ4)

- **RAID log** (Smartsheet). **[출처-귀속]** Risks / Assumptions / Issues / Dependencies. 'A'는 흔히 Actions, **'D'는 흔히 Decisions 로 remap** 되어 "결정"이 이슈와 나란히 추적되는 인정된 변형 축이 된다. 운영상 **Issues(지금 해결해야 할 현재 문제) vs Risks(잠재 미래) vs Assumptions(참이라 전제하나 미검증)** 의 3분할 — 이 분할이 곧 "blocking issue vs passive unknown/assumption" 구분에 매핑된다.
- **Decision log** (projectmanager.com, Smartsheet 의 D축). **[출처-귀속]** Decision 항목은 **방향/스코프/일정/예산을 바꾸는 stakeholder 선택**으로 한정되고 audit-trail 문서로 권장됨 — 즉 **결정 로그는 사실/의존성 추적과 분리된 별개 아티팩트**. owner(선택 권한자)가 명시된다.

요약: PM 실무는 이미 **"사실/가정(passive, 추적만)" vs "결정(owner·방향·audit)"** 을 분리한다. 이 repo 의 Unknown(fact-finding 큐, 게이트 아님) vs Open Decision(owner·Blocking Mode) 구분은 이 표준 분할의 직역이다 — 새로 발명할 필요 없이 RAID/decision-log 의 분류 기준을 차용하면 된다.

## 3. Recommendation for k-frontend-workflow

1. **`workflow:packet` 의 첫 산출물 = `Ambiguity Review Required` 섹션** (코드 아님, Work Packet 본문). 이것이 ClarifyGPT 의 "코드 생성 전 ambiguity classifier" 자리에 해당한다. 단 신호 판정은 스크립트가 아니라 LLM 이 대화로 제안하고, 게이트 변경은 사람이 한다.
2. **탐지기를 빌더에서 분리** (*Ask or Assume?* 의 decouple 교훈): packet 생성 단계는 "구현 가능?"을 묻지 않는다. 오직 "이 입력/ScreenSpec 에서 놓친 애매함은?"만 출력하고 멈춘다(auto-stop, Track 02 와 접점).
3. **calibrate, 무차별 질문 금지** (clarification fatigue + DoR checklist-worship 회피): 승격 rubric 의 "강(strong) 신호"가 켜질 때만 Open Decision 후보로 올린다. 약한 불확실성은 Unknown 으로 남긴다 — 이 repo 가 이미 "Unknown 은 게이트 아님"으로 설계한 것과 정합.
4. **triage 기준은 RAID/decision-log 차용**: "단일 사실로 닫히나(Unknown) vs 권한 owner 의 선택이 산출물 형태를 바꾸나(Open Decision)". §4-2 rubric 이 이를 결정트리로 고정.
5. **하드 게이트화 금지** (DoR 안티패턴): `Ambiguity Review`·`Safe To Proceed?` 를 `validate.mjs` 검사나 readiness fact 로 승격하지 않는다. warning-first 텍스트로만. 실제 게이트는 변함없이 Open Decision(readiness cap) + 정책 fact.
6. **green ≠ done**: "Ambiguity Review 비었음"은 "이번 패스가 새 애매함을 못 찾음"일 뿐 "설계 충분"이 아니다. 문구에 이 경고를 박는다(Track 05 와 접점).

## 4. Concrete deliverable

### 4-1. `work-packet.template.md` 에 추가할 `Ambiguity Review Required` 섹션 스키마

> 삽입 위치: `## Goal` **앞** (packet 의 첫 실질 섹션 — "구현 가능?"보다 먼저 "놓친 애매함?"). 표 헤더는 바꾸지 않는다(파서 정합 관례 유지). 모든 행은 **후보/제안**이며 닫지 않는다.

```md
## Ambiguity Review Required
<!--
  workflow:packet 의 첫 산출물 — 코딩 전에 먼저 채운다.
  나쁜 첫 질문: "구현 가능?"  /  좋은 첫 질문: "애매한 거 놓친 거 없나?"
  이 섹션은 LLM 대화 게이트다 (코드 게이트는 readiness 만 — 여기서 readiness 를 재계산하지 않는다).
  불변식: LLM 은 후보를 "제안"만 한다. Unknown/Decision/Conflict 를 닫거나, candidate→confirmed 로 올리거나,
          ScreenSpec 의 결정을 resolve 하지 않는다. 게이트 변경(승격/resolve/close)은 모두 사람.
  멈춤 규칙(auto-stop): 아래 Safe To Proceed? 가 어떤 모드에서 'no' 면, 그 모드 이상으로 코딩하지 않고
          멈춰서 해당 후보를 사람에게 올린다. 사람이 ScreenSpec 에 반영 → readiness 재실행 후 재발급.
  빈 블록은 "없음 — <사유>" 한 줄로 명시한다(형식주의 회피: 억지로 채우지 않는다).
-->

### New Unknowns  (사실 확인 후보 — 게이트 아님)
<!-- 답이 "사실 1개"로 닫히고 산출물 형태를 안 바꾸는 것. ScreenSpec `## Unknowns` 에 open 행으로 "제안"만. -->
| 후보 ID | Question | 왜 Unknown(결정 아님)인가 | 제안 owner | ScreenSpec 반영 제안 |
|---|---|---|---|---|
| U-cand-001 | 쿠폰 발급 API 의 timezone 은 UTC 인가 KST 인가 | 답이 사실 1개로 닫힘, UI 형태 안 바뀜 | BE | `## Unknowns` 에 open 추가 |

### New Open Decision Candidates  (결정 후보 — 사람이 승격하면 readiness cap)
<!-- 입력만으로 안 정해지고 "선택"이 산출물 형태를 바꾸는 것. Blocking Mode 도 "제안값" — 확정·승격은 사람.
     승격 = 사람이 ScreenSpec `## Open Decisions` 에 open 행 확정 → readiness 재실행. LLM 은 여기까지 제안만. -->
| 후보 ID | Decision Needed | Options(초안) | 제안 Blocking Mode | 제안 owner | 승격 근거(rubric 신호) |
|---|---|---|---|---|---|
| D-cand-001 | 만료 쿠폰을 목록에서 숨길지/disabled 카드로 보일지/별 탭 분리 | hide / disabled / separate-tab / TBD | rough-fixture-ui | PM | 산출물 형태가 갈림 + UX 방향 선택 |

### Possibly Blocking Ambiguities  (승격 경계선 — 사람 판단 요청)
<!-- Unknown 으로 둘지 Open Decision 으로 올릴지 애매한 것. rubric 신호와 함께 "사람이 판단해 달라"로 남긴다.
     판단 전까지는 보수적으로(fail-safe) 해당 모드를 막는 쪽으로 Safe To Proceed? 에 반영한다. -->
| 항목 | 켜진 신호(rubric) | Unknown 으로 충분? | Decision 으로 올려야? | 막힐 수 있는 모드 |
|---|---|---|---|---|
| 응답 pagination 방식(cursor/offset/none) | 산출물영향:큼 · 가역성:낮음 | 사실 질문처럼 보이나 | UI 형태(무한스크롤 vs 페이지) 갈림 → 올림 권고 | api-integrated-ui |

### Safe To Proceed?  (모드별 auto-stop 판단 — readiness 재계산 아님)
<!-- readiness_mode 까지의 각 모드에 대해 "지금 코딩해도 미해결 애매함이 이 모드 산출물을 위태롭게 하나?"만 본다.
     'no' 가 처음 나오는 모드 직전에서 멈춘다. 이 표는 readiness 를 다시 유도하지 않으며, 천장은 항상 readiness_mode.
     (Safe To Proceed? 는 readiness_mode 보다 더 보수적으로만 멈출 수 있고, 더 높게 열 수 없다.) -->
| 모드 | Safe? | 근거(문구 템플릿) |
|---|---|---|
| docs-only | yes | 문서만 — 모든 애매함은 여기서 Unknown/Decision 으로 표면화하면 됨 |
| route-skeleton | yes | 라우트 엔트리뿐 — 화면 내부 결정과 무관(nav-map 충돌 시에만 no) |
| screen-skeleton | yes | 화면 shell — 화면 존재·이동이 결정에 안 묶임 |
| rough-fixture-ui | **no** | D-cand-001(만료 노출 방식) 미승격 — fixture UI 형태가 갈리므로 여기서 멈춤 |
| final-fixture-ui | — | (상위 모드 — readiness_mode 가 이미 cap. 평가 생략) |
| api-integrated-ui | — | (상위 모드 — readiness_mode 가 이미 cap. 평가 생략) |
```

### 4-2. Unknown → Open Decision 승격 rubric (결정트리 + 신호표 + Blocking Mode 매핑)

> 출력은 **후보 제안**까지만. 승격(ScreenSpec `## Open Decisions` 에 open 행 확정)과 resolve 는 사람. 승격 후 **readiness 재실행**.

**결정트리**

```txt
Q1. 답이 "사실 1개"로 닫히나(조사하면 끝), 아니면 "선택"이 필요한가(여러 합리적 옵션)?
    ├─ 사실 1개 ───────────────→ Q2
    └─ 선택 필요 ──────────────→ [Open Decision 후보]  → Q4(Blocking Mode)

Q2. 그 사실을 모른 채 만든 산출물이, 사실 판명 시 "형태"가 바뀌나?
    ├─ 안 바뀜(값만 채워넣음) ──→ [Unknown 유지]   (ScreenSpec ## Unknowns, open)
    └─ 바뀜(구조/상태/계약) ───→ 사실상 선택 내포 → [Open Decision 후보] → Q4
        예) "API 가 pagination 을 주나?" 는 사실 질문이나, 답에 따라 무한스크롤 vs 페이지 UI 가 갈림.

Q3. (가드) Unknown 으로 둘 때, 틀렸을 경우 되돌리기 비용이 큰가?
    ├─ 작음 ───────────────────→ [Unknown 유지]
    └─ 큼 ─────────────────────→ [Possibly Blocking] (사람 판단 요청, 판단 전엔 보수적으로 막음)

Q4. Blocking Mode = 이 결정이 없으면 못 넘는 "첫" 모드 (7단 사다리에서 가장 낮은 곳에 둔다)
    ├─ 문서/라우트만 영향 ─────→ cap 없음 (docs-only · route-skeleton 통과)
    ├─ 화면 존재/이동이 갈림 ──→ screen-skeleton
    ├─ fixture UI 형태/상태표현 갈림 → rough-fixture-ui
    ├─ 확정 디자인/confirmed 문구 갈림 → final-fixture-ui
    └─ API 계약/응답스키마/에러/pagination 갈림 → api-integrated-ui
```

**신호표 (하나라도 "강"이면 Open Decision 후보로 제안)**

| 신호 | Unknown 쪽 (약) | Open Decision 쪽 (강) |
|---|---|---|
| 답의 성격 | 단일·발견 가능한 사실 | 여러 합리적 선택지 |
| 산출물 영향 | 값만 채움 | 구조/상태집합/계약이 바뀜 |
| 가역성 | 싸게 되돌림 | 되돌리기 비쌈(재작업·마이그레이션) |
| owner | 조회/문서로 충분 | 권한 있는 결정자(PM/디자인/BE) 필요 |
| 성격 | 구현 디테일 | 제품/UX/정책 방향 |
| audit 필요성 | 낮음 | 높음(나중에 "왜 이렇게?" 추적됨) |

**Blocking Mode 매핑 (7단 사다리 — 정책 모드명 그대로)**

| 결정이 바꾸는 것 | 제안 Blocking Mode |
|---|---|
| 문서/라우트 수준만 | (cap 없음) |
| 어떤 화면이 존재하는가 · 이동 엣지 | `screen-skeleton` |
| 레이아웃/상태 표현/거친 UI 형태 | `rough-fixture-ui` |
| 픽셀 확정 디자인 · confirmed copy · 완전한 state matrix | `final-fixture-ui` |
| API 엔드포인트/응답 스키마/에러/pagination/auth | `api-integrated-ui` |

> 주: Blocking Mode 는 "이 결정이 없으면 도달을 막는 모드"이고 readiness 는 `min(fact_mode, decision_cap)` 으로 그 **바로 아래**까지만 연다. LLM 은 이 매핑으로 **후보값을 제안**하고, 사람이 ScreenSpec 에 확정한다.

### 4-3. 모드별 Safe-To-Proceed 결정표 (auto-stop 기준 + 근거 문구 템플릿)

> 사용법: 모드를 **아래에서 위로** 훑어 "no"가 처음 나오는 모드 **직전**에서 멈춘다. 천장은 항상 `readiness_mode` — Safe-To-Proceed 는 더 보수적으로만 멈출 수 있고 더 높이 열 수 없다(readiness 재계산 아님).

| 모드 | 기본값 | "no" 트리거 (이게 미해결이면 멈춤) | 근거 문구 템플릿 |
|---|---|---|---|
| `docs-only` | 항상 **yes** | (없음 — 애매함을 문서로 표면화하는 게 이 모드의 목적) | "문서만 — 모든 Unknown/Decision 을 여기서 적으면 됨." |
| `route-skeleton` | **yes** | navigation-map 자체가 미정/충돌 | "라우트 엔트리뿐 — 화면 내부 결정과 무관. 단 nav-map 충돌 시 no." |
| `screen-skeleton` | 조건부 | "이 화면이 존재하는가/어디로 이동하는가"가 미승격 Open Decision 후보 | "화면 shell — 화면 존재·이동이 결정에 달렸으면 no(D-cand-XXX)." |
| `rough-fixture-ui` | 조건부 | 상태 집합·핵심 UX 분기·fixture 형태를 바꾸는 Decision 후보 미승격 | "거친 fixture UI — 상태/분기 형태를 바꾸는 미승격 결정(D-cand-XXX) 있으면 no." |
| `final-fixture-ui` | 조건부 | confirmed 문구·확정 디자인·완전한 state matrix 가 결정/Unknown 에 묶임 | "확정 UI — copy/design/state 미확정이면 no(상위 모드는 readiness 가 이미 cap)." |
| `api-integrated-ui` | 조건부 | API 계약·응답 스키마·에러·pagination·auth 미결정 | "API 연동 — 응답/에러/pagination 결정 전이면 no. 추측·발명 금지." |

규칙 3줄:
- **천장 불변**: `Safe? = yes` 라도 `requested_mode > readiness_mode` 면 코딩하지 않는다(readiness 가 hard ceiling).
- **보수적 단방향**: Safe-To-Proceed 의 "no"는 readiness_mode 아래에서 더 일찍 멈추게만 한다 — 게이트를 *내리는* 신호이지 *올리는* 신호가 아니다.
- **no → 사람 루프**: "no"가 나오면 해당 Decision 후보를 사람에게 올리고, 사람이 ScreenSpec 반영 → `npm run workflow:readiness` 재실행 → packet 재발급.

## 5. Invariant safety check

| 불변식 | 준수 여부 | 긴장 지점 / 가드 |
|---|---|---|
| **LLM 대화 게이트지 코드 게이트 아님** | ✅ | `Ambiguity Review`·`Safe To Proceed?` 는 Work Packet 본문 텍스트일 뿐. `validate.mjs` 검사나 readiness fact 로 **승격 금지**. ⚠️ 긴장: 누군가 "Safe=no"를 스크립트로 파싱해 exit 1 시키면 불변식 위반 → §6 에 명시적 금지. |
| **LLM 은 Unknown/Decision 을 닫지 않음** | ✅ | 4블록 전부 "후보/제안" 라벨. 승격·resolve·close·confirmed 는 사람. rubric 출력도 "제안 Blocking Mode". ⚠️ 긴장: `New Open Decision Candidates` 를 LLM 이 ScreenSpec `## Open Decisions` 에 **직접 써넣으면** 안 됨 — packet 안에 후보로만 두고, 사람이 ScreenSpec 에 확정. |
| **readiness 재계산 안 함** | ✅ | Safe-To-Proceed 는 `readiness_mode` 를 천장으로 읽고 더 보수적으로만 멈춘다. allowed/forbidden path 를 재유도하지 않음. 승격 후 흐름은 "사람 반영 → `workflow:readiness` 재실행". ⚠️ 긴장: Blocking Mode 매핑표가 정책(`implementation-mode-policy.yaml`)과 어긋나면 혼선 → 매핑은 정책 모드명을 그대로 차용(발명 아님). |
| **새 산출물 축 안 늘림** | ✅ | 기존 `work-packet.template.md`(Future Candidate) **안의 한 섹션**으로 추가. 새 파일·새 manifest 엔트리·새 readiness fact 없음. |

자가검증 결론: 4개 불변식 모두 통과. 단일 최대 위험은 **"Safe To Proceed? 의 스크립트 게이트화"** — 이것만 막으면 안전(§6).

## 6. Risks / trade-offs / what NOT to do

- **하지 말 것 ① — Ambiguity Gate 를 하드 스크립트 게이트로 만들기**: DoR 의 1번 실패 모드(stage-gate=waterfall, "burly bouncer")로 직행한다. warning-first 대화 프롬프트로만 유지. 실제 차단은 Open Decision(readiness) 뿐. *정교화(rgalen 재검증)*: 안티패턴은 "게이트가 있다"가 아니라 **"임의·완료기준을 gate 한다"** 다 — 정당한 blocking 결정(강 신호)에만 거는 한 게이트는 유효. 즉 rubric 의 강/약 신호 분리가 곧 이 함정의 회피책.
- **하지 말 것 ② — 무차별 질문(clarification fatigue)**: 모든 불확실성을 Open Decision 후보로 올리면 checklist-worship + 마찰 폭증. rubric 의 "강 신호"에서만 승격, 약한 건 Unknown. (ClarifyGPT·*Ask or Assume?* 의 calibrate 교훈.)
- **하지 말 것 ③ — LLM 이 후보를 자동 승격/resolve**: `D-cand` 를 ScreenSpec 의 `open` 결정으로 LLM 이 직접 확정하거나 닫으면 핵심 불변식 위반. 후보→확정은 사람.
- **하지 말 것 ④ — "Ambiguity Review 비었음 = 설계 완료"로 읽기**: 빈 리뷰는 "이번 패스가 새 애매함을 못 찾음"일 뿐. 의미/제품 리뷰(Codex/사람)는 별도. 문구에 경고를 박는다(green-check 착각 방지, Track 05).
- **하지 말 것 ⑤ — 형식주의로 4블록 억지 채움**: 빈 블록은 "없음 — 사유" 한 줄. 억지 행은 신호를 희석한다.
- **트레이드오프 — 보수성 vs 속도**: `Possibly Blocking` 을 "판단 전 보수적으로 막음(fail-safe)"으로 두면 안전하나 마찰↑. 반대로 두면 빠르나 누락 위험↑. MVP 권고: **fail-safe**(이 repo 의 malformed→docs-only fail-closed 정신과 일치).
- **방법론 리스크(실증됨)**: 자동 적대적 검증이 rate-limit 으로 전멸했고 한 소스(2605.06717)는 과장 추출됐다. → 자동 파이프라인의 verdict 를 그대로 신뢰 금지. 사람/2차 LLM 의 원문 대조가 여전히 필요(이 보고서 자체가 그 사례).

## 7. Open questions for synthesis

1. **`Safe To Proceed?` 의 위치**: 순수 텍스트(warning-only)로 둘지, 아니면 어떤 툴이 파싱하긴 하되 절대 exit 1 안 시키는 "보고 전용"으로 둘지? (권고: MVP 는 텍스트만. Track 02 auto-stop 과 합칠 때 재논의.)
2. **후보 ID 수명주기**: `U-cand`/`D-cand` ID 가 사람 승격 시 ScreenSpec 의 `U-00x`/`D-00x` 로 매핑되는 규약이 필요. LLM 이 닫지 않으면서 추적성을 유지하는 최소 규약은? (reconcile-input register 와 접점.)
3. **calibration 임계의 실전값**: "강 신호"를 몇 개·어떤 조합에서 승격할지 — over-asking 회피 튜닝은 경험적. 초기 기본값 제안 필요.
4. **Track 02(auto-stop)와의 경계**: `Safe To Proceed? = no` 가 곧 auto-stop 조건. 두 트랙이 같은 상태기계를 공유 — 종합 시 한 정의로 합칠 것.
5. **Track 03(author-critic)와의 분담**: Ambiguity Review(작성자 Claude 의 self-surfacing) vs Codex 비평(누락 발견)의 책임 분담. 무엇을 packet 이 잡고 무엇을 리뷰가 잡나?
6. **fail-safe 기본값 확정**: `Possibly Blocking` 을 기본 "막음"으로 둘지 repo 차원에서 합의.

## 8. Sources

> 라벨: [✅]=원문 직접 대조 확인 · [◐]=핵심 확인·일부 단정 미명시 · [✖]=과장 교정 · [⚠]=페치 403(교차확인).

1. [✅] ClarifyGPT — *Empowering LLM-based Code Generation with Intention Clarification* — https://arxiv.org/abs/2310.10996
2. [✅] *Ask or Assume? Uncertainty-Aware Clarification-Seeking in Coding Agents* (Edwards & Schuster) — https://arxiv.org/abs/2603.26233
3. [✅] Interactive agents for underspecificity in SE (84%·+74%·3단 프롬프트·회복률 80/59/54% 전부 본문 확인) — https://arxiv.org/abs/2502.13069 (본문: https://arxiv.org/html/2502.13069v1)
4. [✖] *Agentic Coding Needs Proactivity, Not Just Autonomy* (Bui & Evangelopoulos) — cost-benefit 프레이밍 아님(insight policy/mixed-initiative) — https://arxiv.org/abs/2605.06717
5. [✅/◐] *LLMs Should Ask Clarifying Questions to Increase Confidence in Generated Code* (Jie JW Wu) — https://arxiv.org/abs/2308.13507
6. [✅] Mike Cohn — *The Dangers of a Definition of Ready* — https://www.mountaingoatsoftware.com/blog/the-dangers-of-a-definition-of-ready
7. [✅/◐] Bob Galen — *Definition of Ready as an Anti-Pattern* (메커니즘 자체 아닌 "무엇을 gate 하나"가 문제) — https://rgalen.com/agile-training-news/2016/11/8/definition-of-ready-as-an-anti-pattern
8. [⚠403] teamworx — *Definition of Ready: an anti-pattern (and when useful)* — https://teamworx.co.nz/agile-articles/definition-of-ready-an-anti-pattern-and-when-it-might-be-useful/
9. [✅] Serious Scrum — *Are we ditching the Definition of Ready?* — https://medium.com/serious-scrum/are-we-ditching-the-definition-of-ready-c182fb201289
10. [✅] Scrum Alliance — *Pros and Cons of a Definition of Ready* — https://resources.scrumalliance.org/Article/pros-cons-definition-ready
11. [✅/◐] Smartsheet — *RAID Logs* (R/A/I/D; A→Actions, D→Decisions) — https://www.smartsheet.com/content/raid-logs
12. [출처-귀속] ProjectManager — *Project Decision Log* (top-25 외, 배경) — https://www.projectmanager.com/blog/project-decision-log
13. [출처-귀속] Scrum anti-patterns 개관 (top-25 외, 배경) — https://teachingagile.com/scrum/psm-1/scrum-adoption-improvement/scrum-anti-patterns
14. [출처-귀속] Quire — *RACI/DACI/RAPID ownership frameworks* (decision owner, 배경) — https://quire.io/blog/p/raci-daci-rapid-ownership-frameworks.html
```
