# 의사결정 시각화 스킬 — 설계 초안 (draft)

> 상태: **초안 v0.3**. 딥리서치 2건 모두 반영 + 프로토타입 피드백 반영(조건부 추천·장단점·diff 색감·다크 IDE 톤).
> 이 문서는 작업용 초안이다. 합의되면 `frontend-workflow-kit/decision-visualization.md`(설계 계약, Tier 2)와
> `.claude/skills/visualize-decision/SKILL.md`(스킬)로 승격한다.

## 0. 한 줄 요약

Open Decision(또는 소크라테스식 인터뷰 질문)을 **사람에게 제시할 때**, 질문과 "선택지별 전/후 결과"를
**자기완결형 HTML로 시각화**해 사람이 결정을 더 쉽게 이해하도록 돕는 **읽기 전용 이해 보조 스킬**.

## 1. 왜 — 이 킷에서의 자리

frontend-workflow-kit 의 중심 게이트는 **Open Decision** 이다. 핵심 불변식:

```txt
LLM 은 게이트를 "올리기"만 한다 (open 추가, resolved→open 재오픈).
게이트를 "내리는" 전이(resolve)는 사람-전용.
```

그런데 **사람이 resolve 하려면 먼저 결정을 이해해야 한다.** 결정이 복잡할수록(옵션 간 트레이드오프,
화면·도메인 파급, "show/hide/separate tab" 같은 미묘한 선택) 이 이해 단계가 병목이 된다.
지금은 그 결정이 `screen-spec.md` 의 표 한 줄(`Decision Needed | Options | Blocking Mode | …`)로만 제시된다.

**이 스킬은 그 병목을 푸는 "resolve 직전의 이해 보조 레이어"다.**

- 게이트 로직을 **건드리지 않는다**. readiness/validate/state 스크립트의 판정은 그대로다.
- 어떤 문서도 **수정하지 않는다**. 시각화는 별도 HTML 산출물(또는 인라인 위젯)로만 나간다.
- resolve 는 여전히 **사람이** 한다. 스킬은 사람이 더 잘 결정하도록 *보여줄* 뿐이다.

> 불변식 정합성: 이 스킬은 "읽기 전용 렌더러"이므로 README 불변식(판정 단일 출처·confirmed 승격은 사람·
> 게이트 셀프 개방 금지)을 **위반할 수 없는 구조**다. 시각화가 잘못돼도 게이트는 안전하다(fail-safe).

## 2. 인지/UX 근거 (딥리서치 1 — 검증 완료)

각 항목은 적대적 검증(3표 중 2표 이상)을 통과한 근거만 싣는다. 출처는 §11.

- **이중처리(dual-process) 프레임워크** [Padilla 2018, 검증 3-0] — 시각화 의사결정은 빠른 인식 기반(Type 1)과
  신중한 비교(Type 2) 두 경로로 나뉜다. → 자명한 선택은 Type 1(한눈에 답이 보이게), 진짜 트레이드오프는
  Type 2(나란히 비교하게) 톤으로 설계한다.
- **돌출성(salience) 레버** [Padilla 2018, 3-0] — 시각화는 상향식 주의를 돌출 요소로 비자발적으로 끈다.
  과제 관련 위치를 돌출시키면 도움, 무관한 곳이면 방해. → **답변에 핵심이 되는 차이만** 강조한다.
- **인지 적합도(cognitive fit)** [Padilla 2018, 3-0] — 표현이 과제와 맞으면 더 빠르고 정확. 불일치 시
  "정신적 변환"이 작업기억을 소모. → 사용자가 머릿속에서 해야 할 변환 수를 최소화한다.
- **시각 인코딩 편향** [Padilla 2018, 3-0] — 차트/인코딩 선택 자체가 결정을 체계적으로 형성한다.
  → before/after·옵션 비교는 **중립적 인코딩**을 의식적으로 고른다(특정 옵션을 시각적으로 편들지 않기).
- **생성형 UI의 효용(조건부)** [Generative Interfaces arXiv 2508.19227 / GenerativeGUI CHI 2025, 각 3-0] —
  LLM 이 대화에 맞춰 HTML/GUI 를 동적 생성하면 인지 부하가 줄고, 그 이점은 **다중 명료화 질문 시나리오에서
  가장 크다**. 단, **명료화 옵션이 빈약하면 오히려 역효과** → 무조건 그리지 말 것(§3 트리거).
- **점진적 공개(progressive disclosure)** [NN/g, 3-0] — 핵심 소수만 먼저, 전문 옵션은 요청 시.
  학습성·효율·오류율을 개선. → 비기술 독자엔 요약 뷰, 기술 독자엔 "더보기" 상세.
- **선택 과부하** [The Decision Lab, 정의는 3-0이나 효과 견고성은 학계 논쟁] — 옵션이 많으면 결정이 어려워질 수
  있다. "많을수록 항상 나쁘다"는 강한 표현은 피하되, 옵션 수를 줄이고 단계화하는 설계는 정당.

## 3. 트리거 / 입력 / 출력

### 트리거 (언제 시각화하나)

연구의 경계조건을 반영해 **무조건 그리지 않는다.** 아래 중 하나라도 해당할 때만 시각화를 만든다:

```txt
- 옵션이 3개 이상이거나
- 선택지 간 트레이드오프가 실재하거나(어느 쪽도 자명히 우월하지 않음)
- 답변에 따라 산출물(문서/화면/플로우)의 형태가 바뀌거나
- 다중턴 명료화(연속된 질문)가 예상될 때
자명한 yes/no, 옵션 빈약, 단발 확인 → 텍스트 질문이 더 효율적(시각화 생략).
```

### 입력

- 대상 Open Decision ID(들) (예: `D-001`) — `screen-spec.md` 의 `## Open Decisions` 표에서 읽는다.
  또는 인터뷰/소크라테스 질문 1건(자유 텍스트). 없으면 사용자에게 묻는다.
- (선택) 대상 screen/domain — 파급 범위(전/후 diff)를 계산할 컨텍스트.

### 출력

- **자기완결형 단일 HTML 1파일** (의존성 인라인, 오프라인 동작) — 기본 산출 경로 예:
  `docs/frontend-workflow/_viz/decision-{ID}.html` (시각화 산출물, 게이트 무관).
- 또는 **인라인 위젯**: 이 Claude Code 환경의 `mcp__visualize__show_widget`(SVG/HTML 인라인 렌더) 또는
  `AskUserQuestion` 의 option preview(HTML 미리보기)로 바로 보여주기.
- **읽기 전용 범위(명확화)**: 시각화 산출물(`_viz/*.html`)은 **생성/갱신 가능**.
  단 **소스 문서·게이트·레지스터·앱 생성물**(screen-spec, Open Decisions, readiness/validate, `_meta/*`, `src/**` 등)은 **절대 수정하지 않는다**.

## 4. 4가지 뷰 — 결정 유형 → 뷰 매핑 (딥리서치 1 반영)

| 결정의 성격 | 추천 뷰 | 구현 스택 | 근거 |
|---|---|---|---|
| 답변에 따라 **상태가 바뀜** (값/문서/설정) | **전/후 diff** | **jsdiff** + 순수 HTML/CSS (§6) | jsdiff/Myers [3-0] |
| 답변이 **경로를 가름** | **의사결정 트리/분기** | 정적 HTML/SVG/CSS (기본) · 또는 **인라인** Mermaid | Mermaid docs [3-0] |
| **전체 흐름 속 위치** 안내 | **사용자 흐름/여정** | 정적 HTML/SVG/CSS (기본) · 또는 **인라인** Mermaid | Mermaid docs [3-0] |
| **옵션 A/B/C 비교** | **트레이드오프 매트릭스** | HTML `<table>` + 2D prioritization matrix | NN/g [2-1] |

### 구현 메모

- **자기완결(오프라인·의존성 0)이 최우선 제약** — 트리·흐름은 **정적 HTML/SVG/CSS 렌더가 기본**(프로토타입이 채택).
- **Mermaid 는 LLM 생성이 토큰 효율적**이라 매력적이나 [Mermaid README 3-0], **CDN 로드는 오프라인·의존성 0 을 깬다**.
  쓰려면 `mermaid.min.js` 를 **인라인/번들**해야 하고 파일이 커진다 — 트레이드오프를 판단해 선택(기본은 정적 렌더).
- **의사결정 트리**: 다이아몬드 `A{...}` = decision node, `A -->|조건| B` = 라벨 분기. 한 노드에서 2+ 화살표 → 분기점.
- **여정 맵 주의**: Mermaid `journey` 다이어그램은 *단계별 만족도 점수* 포맷이라 일반 user-flow 와 다르다.
  자유 흐름엔 `flowchart` 가 더 맞을 수 있음.
- **트레이드오프 매트릭스**: 보통 *가치 vs 노력* 또는 *임팩트 vs 실현가능성* 축[NN/g]. 개인 편향·HIPPO 효과를
  줄이지만 **가중치/점수의 주관성(garbage-in)은 남으므로 기준을 명시**한다.
- 대안 스택(D3/React Flow/Graphviz/Chart.js)의 토큰효율·자기완결성 정량 비교는 **미검증**(추가 조사 후보).

## 5. 자기완결형 HTML 규약 (딥리서치 1 반영)

모든 시각화 산출물에 공통 적용한다.

- ✅ **점진적 공개** — 요약 뷰가 기본, 상세는 `<details>`/토글. 비기술·기술 독자를 한 파일로 커버.
- ✅ **명도(lightness) 기반 팔레트** — hue 만이 아니라 명도가 변하는 색. 적-녹 색맹에서도, 흑백 인쇄에서도 구별
  유지. 유럽 남성 약 12명 중 1명(8%)이 적/녹 색약 [EU 가이드 3-0].
- ✅ **색만으로 구분 금지** — 기호(+/−)·라벨·패턴을 **중복 인코딩**으로 병행(특히 diff·매트릭스).
- ✅ **다크모드는 순수 CSS** — `@media (prefers-color-scheme: dark)`, JS·의존성 없이 [MDN 3-0].
- ✅ **인쇄 안전** — 명도 대비 유지, 배경색 의존 금지.

## 6. diff 뷰 상세 (딥리서치 2 — 검증 완료)

### 추천 스택: jsdiff (BSD-3-Clause)

- **`dist/diff.min.js` 단일 파일을 인라인** → 전역 `Diff` 객체 노출. 번들러·모듈 시스템·런타임 의존성 **0**.
  자기완결형 단일 HTML 에 최적이고 LLM 생성이 토큰 효율적 [jsdiff README, 3-0].
- **입도(granularity)를 한 라이브러리로 전부 커버** [3-0]:
  - `diffWords` / `diffWordsWithSpace` → **단어 단위 시맨틱 diff** (한 줄 안의 작은 변경도 정확히 표시)
  - `diffJson` / `diffArrays` → **상태(state)·객체·설정 diff의 1차 프리미티브** (요구사항 문서·설정값이 답변에 따라 어떻게 바뀌는지)
  - `diffChars` / `diffSentences` / `diffCss` → 문자·문장·CSS 단위
- **회피**: `@codemirror/merge`(split/unified 양방향 뷰를 주지만 코어 의존 + ESM 전용),
  `monaco-editor`(~72MB, `marked`·`dompurify` 의존, AMD 로더) — 풍부하지만 **자기완결 단일 HTML 엔 부적합** [2-1].

### split(나란히) vs unified(통합)

- 둘 다 jsdiff 출력 위에 **순수 CSS** 로 구현 가능.
- ⚠️ "어느 쪽이 인지적으로 우월한가"의 **정량 통제 실험 근거는 미확보**(§10 미해결).
  잠정 기본값(근거 약함): **좁은 폭·작은 변경 → unified, 넓은 폭·큰 변경 → split**. 확정 규칙 아님 — 토글 제공 권장.

### 알고리즘 — LLM이 직접 텍스트 diff를 만들 때의 멘탈모델

- **Myers O(ND)** [Myers 1986, 3-0]: N=두 시퀀스 길이 합, D=최소 편집 크기. **변경이 작을수록 빠름**(git diff 기반).
- **LCS ≡ SES 쌍대** [3-0]: 편집 그래프에서 대각선=비용0, 삽입/삭제=비용1인 최소비용 경로. 모든 diff 도구의 토대.
- **코드 변경엔 Histogram이 Myers보다 적합** [Nugroho 2019 / Yagi 2024, 3-0]: 수학적 최소 편집이 *개발자 의도와
  어긋날 수 있음*(미수정 부분을 우연히 매칭해 진짜 변경을 가림).
  → **스킬 함의**: 라이브러리(jsdiff)에 맡기되 **의미 단위(`diffWords`/`diffJson`)를 우선**해 "최소 편집"의 오해를 줄인다.

### 접근성 (필수 — §5 규약과 동일)

- **핵심 불변식: 색 단독 의존 금지** [GitHub/MDN/Codex#10492, 3-0] — `+`/`−` 기호·라벨·명도 대비로 **중복 인코딩**(WCAG 1.4.1). 적록색맹 남성 약 8%.
- **설계 결정(프로토타입 피드백): 기본 색은 초록(+)/빨강(−)** — JetBrains·IDE 친화로 직관적. 기호 병행으로 WCAG 1.4.1 충족.
- **색맹 안전 토글(옵션)**: 필요 시 GitHub 처럼 **주황/파랑**으로 교체(적록색맹 deuteranopia/protanopia 회피) — 연구 권고. 어느 쪽이든 기호는 유지.

### 흔한 함정

- 줄 단위 diff 만 쓰면 한 줄 안의 작은 변경이 "줄 통째 교체"로 보임 → `diffWords`/`diffJson` 병행.
- monaco/codemirror 를 자기완결 HTML 에 끌어들이기 → 빌드·번들 지옥.
- add/del 을 **색만으로** 구분(색맹·흑백 인쇄에서 소실).

## 7. preview / what-if 뷰 상세 (딥리서치 2 — 검증 완료)

### 근거: 확정 전 확인 = Nielsen 휴리스틱 #5 (오류 예방)

- 확정 전 확인 옵션 제시는 **#5 Error Prevention** 이 직접 정당화한다 [NN/g, 3-0].
  (확정 전 확인=#5, undo/긴급탈출=#3). → "이 옵션을 고르면 이렇게 됩니다 → 확인" 패턴의 표준 근거.
- ⚠️ 주의: 이를 **#1 가시성(Visibility of System Status)으로 근거 삼는 흔한 설명은 틀림**(이번 검증에서 0-3 기각).
  근거를 댈 땐 **#5**를 인용한다.

### 실증: 중간 확인 > 끝-일괄 확인

- CHI 2026 연구(N=48) [arXiv 2510.05307, 3-0]: 다단계 AI 작업에서 **중간 확인 지점**이 종료-시점 일괄 확인보다
  **선호 81%, 완료시간 13.54% 단축(p<0.001)**.
- → **스킬 정합성**: 이 킷은 Open Decision 마다(=자연스러운 *중간* 확인 지점) 시각화+확인을 건다.
  "마지막에 몰아서 한 번"이 아니라 **결정 시점마다** 보여주는 현재 설계가 이 결과와 정확히 맞는다.

### 검증된 프로덕션 패턴: 도구 실행 전 승인 (OpenAI Agents SDK)

- `needsApproval` 규칙을 **도구 실행 직전 평가** → 미결정 시 실행 안 하고 run **일시정지**,
  `RunToolApprovalItem` 인터럽션 노출 → `state.approve()` / `reject()`(거부 사유는 모델에 피드백).
  `needsApproval` 은 **도구 인자(=what-if 파라미터)로 조건화** 가능 [OpenAI Agents SDK, 3-0].
- → "행동 전에 결과를 보여주고 사람이 승인/거부"하는 human-in-the-loop 의 검증된 레퍼런스. 우리 스킬의 멘탈모델과 동형.

### 구조화 미리보기 카드: Adaptive Cards (참조 모델)

- JSON 으로 작성하는 **플랫폼 비종속 UI 스니펫**(입력 컨트롤·캐러셀 등) [adaptivecards.io, 3-0].
- 우리는 JSON 런타임 대신 **정적 자기완결 HTML** 로 같은 "구조화 선택·미리보기 카드" 패턴을 구현한다(참조 모델로만 활용).

### ⚠️ 미리보기의 역효과와 완화 (가장 중요)

- 미리보기·AI 제안은 **과의존(automation/anchoring bias)** 을 유발 — 사용자가 미리보기를 *무비판 수용* 할 수 있다
  [Buçinca 2021, N=199, CSCW, 3-0].
- **인지적 강제 기능(cognitive forcing functions)** 으로 완화 가능. 단 **트레이드오프**: 과의존을 *가장 많이 줄인*
  설계가 주관적 **선호도는 가장 낮았다**(Need for Cognition 가 조절).
- → **스킬 설계 함의** (§2 인코딩 편향과 직결):
  1. **조건부 추천(conditional recommendation)** — 사용자는 추천을 원한다(프로토타입 피드백). 과의존을 피하면서 추천을 주려면:
     ① 추천은 **명시적 제안**으로 라벨(정답 아님 · resolve 는 사람), ② **근거(why)와 장단점**을 항상 동반,
     ③ **셋 다 불확실/애매하면 추천 보류**(억지 추천 금지), ④ 별점은 **상대적 강도**(★ 3개 만점)로 표기.
     → 연구의 핵심 위험은 *숨은·과신 미리보기*다. **명시·근거·보류 가능한** 추천은 위반이 아니라 그 자체로 완화책.
  2. **비교 데이터는 중립** — 장단점 표·트레이드오프 표는 승자를 색으로 칠하지 않는다. 추천은 별점·(추천) 배지로 **분리**해 둔다.
  3. **모르는 파급은 TBD/물음표** — 그럴듯한 **가짜 미리보기·근거 없는 추천이 가장 위험**(앵커링 + 환각 결합).
  4. 사용자가 **능동적으로 비교**하도록 장단점을 양쪽 다 보인다(한쪽만 강조 금지). 단, 선호도 비용을 의식해 과하지 않게.

### 흔한 함정

- **숨은/근거 없는 추천**(라벨·근거 없이 한 옵션만 강조)으로 앵커링 유발 — 추천은 명시·근거·보류 규칙과 함께.
- what-if **실시간 갱신**(연속 입력)의 디바운스·낙관적 롤백 함정 → 근거 약하므로 **이산(discrete) 확인부터** 시작.
- 미리보기를 "**확정**"으로 오인하게 하는 카피("적용됨" 같은 단정 표현 금지).

## 8. 제안 SKILL.md (초안 — 승격 시 `.claude/skills/visualize-decision/SKILL.md`)

```md
---
name: visualize-decision
description: Open Decision(또는 인터뷰/소크라테스 질문)을 사람에게 제시할 때, 질문과 선택지별 전/후 결과를 자기완결형 HTML로 시각화해 이해를 돕는다. 사용자가 "이 결정 시각화", "visualize decision", "선택지 비교 보여줘"를 요청하거나, resolve 직전 복잡한 Open Decision 을 설명해야 할 때 사용. 읽기 전용 — 어떤 문서도 수정하지 않고 게이트도 바꾸지 않는다.
---

# visualize-decision

Open Decision/질문을 사람이 더 쉽게 이해하도록 HTML 로 시각화한다.
**읽기 전용** — 게이트(readiness/validate)·문서를 건드리지 않는다. resolve 는 사람이 한다.
전체 계약: [decision-visualization.md](../../../frontend-workflow-kit/decision-visualization.md).

## 입력
- 대상 Open Decision ID(들) (예: D-001) 또는 인터뷰 질문 1건. 없으면 사용자에게 묻는다.
- (선택) 대상 screen/domain.

## 트리거 게이트 (먼저 판단)
아래 중 하나면 시각화한다. 아니면 텍스트 질문이 낫다고 보고하고 멈춘다:
- 옵션 ≥3 / 실재하는 트레이드오프 / 산출물 형태가 바뀜 / 다중턴 명료화 예상.

## 절차
1. 대상 결정을 읽는다 (screen-spec 의 Open Decisions 표 또는 입력 질문).
2. 트리거 게이트를 판단한다. 미충족이면 멈추고 사유 보고.
3. 결정의 성격 → 뷰 선택 (전후 diff / 의사결정 트리 / 흐름 / 트레이드오프 매트릭스). 복합이면 탭/섹션으로.
4. 선택지별 전/후 · **장단점**을 계산한다 — **추측 금지**. 모르는 파급은 "TBD"·물음표로 명시(메우지 않는다).
5. **조건부 추천**을 정한다 — 근거가 있으면 옵션별 별점(상대 강도)과 (추천) 1개를 **근거(why)와 함께** 단다.
   **셋 다 불확실/애매하면 추천을 보류**한다(별점만, (추천) 없음). 추천은 비교 데이터와 **분리**해 명시 라벨로.
6. 자기완결형 HTML 을 생성한다 (의존성 인라인: 트리·흐름=정적 HTML/SVG/CSS(기본) 또는 인라인 Mermaid, 전후 diff=jsdiff `diffWords`/`diffJson`;
   progressive disclosure, 명도 팔레트, 다크/라이트 대응). **CDN 로드 금지(오프라인·의존성 0 유지).**
   diff 색: 기본 **초록(+)/빨강(−) + `+`/`−` 기호**(IDE 친화). 색맹 안전이 중요하면 주황/파랑 토글 — **어느 쪽이든 기호로 색 비의존**.
7. 산출물 경로(docs/frontend-workflow/_viz/…)로 저장하거나 show_widget 으로 인라인 렌더.
8. "이건 이해 보조일 뿐, resolve 는 사람이 한다"를 함께 안내한다 (미리보기를 확정으로 표현하지 않는다).

## 금지
- 소스 문서·게이트·레지스터·앱 생성물(screen-spec/Open Decisions/`_meta`/`src` 등) 수정 (읽기 전용 — **단 `_viz` 시각화 산출물 자체는 생성/갱신 가능**).
- 게이트(open→resolved) 변경 / readiness·validate 판정 흉내.
- 결정의 파급·옵션 결과를 **추측해서 그리기** (모르면 TBD — 그럴듯한 가짜 미리보기가 가장 위험: 앵커링+환각).
- **근거·라벨·보류 규칙 없이** 한 옵션을 추천/강조하기 (추천은 명시·근거 필수, 셋 다 불확실하면 보류).
- **비교 데이터(장단점·트레이드오프 표)에서 승자를 색으로 칠하기** (추천은 별점·배지로만 분리 표기).
- 미리보기를 "확정/적용됨"으로 오인하게 하는 카피.
- 트리거 미충족인데 억지로 시각화 (옵션 빈약 시 역효과).
- diff add/del 을 **색만으로** 구분 (기호 `+`/`−`·라벨 중복 인코딩 필수).
```

## 9. 불변식 / 금지 (요약)

```txt
1. 읽기 전용. 시각화 산출물(`_viz`)만 생성/갱신하고, 소스 문서·게이트·레지스터·앱 생성물은 절대 수정하지 않는다.
2. resolve 는 사람. 스킬은 보여줄 뿐 결정하지 않는다.
3. 추측 금지. 모르는 파급은 TBD/물음표로 명시 (킷의 "추측 금지"와 동일 원리).
4. 조건부 추천. 추천은 명시 라벨·근거·장단점과 함께, 셋 다 불확실하면 보류. 비교 데이터 자체는 중립.
5. 조건부 트리거. 옵션 빈약·자명한 결정엔 시각화하지 않는다.
6. 접근성 기본값. 색+기호 중복 인코딩(diff 는 +/− 필수), 다크/라이트 대응, progressive disclosure.
```

## 10. 미해결 / 다음 단계

**남은 미해결(추가 조사 후보):**

- **split vs unified diff 의 정량적 인지 우열** — 화면 폭·변경 크기·작업 유형(검토 vs 머지)에 따라 어느 뷰가
  이해/오류율에서 나은지 통제 실험 근거 미확보. 기본값 선택 규칙의 근거가 필요.
- **상태(state)/요구사항 문서 diff 의 검증된 UI 마크업** — jsdiff `diffJson`/`diffWords` 로 데이터는 만들어지나,
  줄 단위 JSON diff vs 필드 경로 기준 의미적 diff 중 사용자 이해를 돕는 표현·인터랙션 1차 근거 부족.
- **what-if 실시간 라이브 프리뷰**(연속 입력)의 디바운스·낙관적 롤백·일관성 함정 — 이산 확인은 강하게 입증됐으나
  연속 갱신 패턴의 인지 부하·오해 위험은 미해명. → 스킬은 **이산 확인부터**.
- **인지적 강제 기능의 구체 적용** — 과의존 완화와 사용자 선호의 트레이드오프를 최소화하는 검증된 마이크로인터랙션은 미확보.
- 대안 시각화 스택(D3/React Flow/Graphviz/Chart.js)의 정량 비교는 미검증.
- Padilla 이중처리·인지적합도를 *실제 결정 시각화*에 적용해 효과를 측정한 실증 연구는 없음(설계 추론 단계).

**다음 단계:**

- 승격 경로: 합의 → `frontend-workflow-kit/decision-visualization.md`(Tier 2 설계 계약) +
  `.claude/skills/visualize-decision/SKILL.md` + HTML 템플릿(`templates/_viz/`).
- 통합 후보: reconcile-input 이 새 입력으로 `resolved→open` 재오픈할 때, 이 스킬으로 "무엇이 왜 바뀌나"를
  자동 시각화하면 충돌 이해가 빨라진다(중간 확인 지점 = CHI 2026 근거와 정합).
- 프로토타입: golden example 의 `D-001`(만료 쿠폰 노출 여부)을 4뷰로 시각화한 단일 HTML 1개로 개념 검증.

## 11. 출처 (검증 통과분)

**딥리서치 1 — 인지 근거 + 4뷰:**

- Padilla et al. 2018, *Decision making with visualizations* — https://link.springer.com/article/10.1186/s41235-018-0120-9
- Mermaid — https://github.com/mermaid-js/mermaid · https://mermaid.js.org/syntax/flowchart.html · https://mermaid.js.org/syntax/userJourney.html
- NN/g Prioritization Matrices — https://www.nngroup.com/articles/prioritization-matrices/
- NN/g Progressive Disclosure — https://www.nngroup.com/articles/progressive-disclosure/
- Generative Interfaces for Language Models — https://arxiv.org/pdf/2508.19227
- GenerativeGUI (CHI 2025) — https://dl.acm.org/doi/10.1145/3706599.3719743
- Choice Overload — https://thedecisionlab.com/biases/choice-overload-bias
- EU Accessible Colour Palettes — https://data.europa.eu/apps/data-visualisation-guide/accessible-colour-palettes
- MDN prefers-color-scheme — https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme

**딥리서치 2 — diff + preview/what-if:**

- jsdiff (kpdecker/jsdiff, BSD-3-Clause) — https://github.com/kpdecker/jsdiff
- Myers 1986, *An O(ND) Difference Algorithm* — https://publications.mpi-cbg.de/Myers_1986_6330.pdf
- Nugroho et al. 2019, *Use --histogram for Code Changes* — https://link.springer.com/article/10.1007/s10664-019-09772-z
- Yagi & Hayashi 2024 (SCAM) — https://arxiv.org/html/2409.13590
- @codemirror/merge — https://github.com/codemirror/merge · monaco-editor — https://www.npmjs.com/package/monaco-editor
- GitHub colorblind themes — https://github.blog/changelog/2022-04-19-protanopia-deuteranopia-colorblind-themes-beta/
- MDN Color contrast (WCAG 1.4.1) — https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Perceivable/Color_contrast
- NN/g Ten Usability Heuristics (#5 Error Prevention) — https://www.nngroup.com/articles/ten-usability-heuristics/
- Zhou et al. CHI 2026, *When Should Users Check?* — https://arxiv.org/abs/2510.05307
- OpenAI Agents SDK — Human-in-the-loop — https://openai.github.io/openai-agents-js/guides/human-in-the-loop/
- Adaptive Cards — https://adaptivecards.io/
- Buçinca et al. 2021, *To Trust or to Think* (CSCW) — https://arxiv.org/abs/2102.09692
