# 딥리서치 프롬프트 — Track 01: Ambiguity Gate & Unknown→Open Decision triage

> **사용법**: 이 repo(`k-frontend-workflow`)에서 **새 세션**을 열고, 이 파일 내용을 deep-research 스킬로 실행한다.
> (본문을 그대로 입력 → deep-research 트리거, 또는 `/deep-research` 호출.) 다른 트랙과 독립 실행 가능.
> 완료되면 보고서를 `temp/execution-loop-research/reports/01-ambiguity-gate.md` 로 저장한다.

## 먼저 읽기 (이 repo에서 실행 시)
- `temp/execution-loop-research/notes/01-loop-engineering.md`
- `temp/execution-loop-research/notes/02-llm-only-scriptization-risk.md` (특히 §5, §8, §9.2, §9.3, §13)
- `temp/execution-loop-research/README.md` 의 "공통 불변식" · "공통 보고서 구조"
- `frontend-workflow-kit/templates/screen/screen-spec.template.md` · `policies/implementation-mode-policy.yaml` · `roadmap-current.md`

## 맥락 (파일을 못 읽는 환경에서도 동작하도록 요약)
`k-frontend-workflow` 는 LLM 이 프론트 작업을 환각 없이 진행하게 만드는 워크플로우 킷이다. 판정은 `readiness.mjs`(단일 출처),
구조 검증은 `validate.mjs` 가 한다. 여기서 **Unknown 은 기본적으로 게이트가 아니다**(tbd_count 는 next-action 메시지에만 쓰임).
구현을 막아야 하는 애매함은 반드시 **Open Decision** 으로 승격해야 readiness 가 모드를 cap 한다. 모드 사다리는
`docs-only → route-skeleton → screen-skeleton → rough-fixture-ui → final-fixture-ui → api-integrated-ui`.
설계안 2 의 핵심 주장: Work Packet Runner 의 첫 질문은 "구현 가능?" 이 아니라 **"애매한 거 놓친 거 없나?"** 여야 하고,
`workflow:packet` 은 코딩 전에 `Ambiguity Review Required` 섹션(New Unknowns / New Open Decision Candidates / Possibly
Blocking Ambiguities / Safe To Proceed?)을 먼저 생성해야 한다.

## 리서치 질문
1. 스펙→코드 파이프라인에서 under-specification / 요구사항 모호성을 자동·반자동으로 탐지하는 선행 연구·도구는? (requirements ambiguity detection, clarifying-question generation, "ask vs assume" 정책) 각 접근의 효과와 한계.
2. 코딩 에이전트가 "가정하고 진행" vs "멈추고 질문"을 가르는 기준(휴리스틱·룰·신뢰도 임계)은 실제로 어떻게 설계되나?
3. "Definition of Ready" / pre-implementation review 게이트의 실무 패턴과 흔한 실패 모드(과한 마찰, 형식주의, 무시되는 체크리스트)는?
4. 애매함을 "단순 fact-finding(Unknown)" vs "결정 필요(blocking)"로 가르는 triage 프레임워크 사례는? (분류 기준, 누가 owner 가 되나)

## 산출물 (이 repo에 바로 쓸 수 있게)
1. `work-packet.template.md` 에 들어갈 **`Ambiguity Review Required` 섹션 스키마** — 필드·표 컬럼·예시 행. 하위 블록: New Unknowns / New Open Decision Candidates / Possibly Blocking Ambiguities / Safe To Proceed?
2. **Unknown → Open Decision 승격 rubric** — 어떤 신호면 승격하고 `Blocking Mode` 를 어느 모드로 두는지 결정 트리(위 모드 사다리 기준). 승격은 "후보 제안"까지만(닫는 건 사람).
3. **모드별 Safe-To-Proceed 결정표** — 6개 모드 각각에 대해 yes/no + 근거 문구 템플릿.

## 불변식 안전선 (어기면 실패)
- 이 게이트는 **LLM 대화 게이트**이지 새 코드 게이트가 아니다 (코드 게이트는 readiness 만).
- LLM 은 Unknown/Decision 을 **닫지 않는다** — 후보를 "제안"만 하고 사람이 승격/resolve.
- readiness 를 **재계산하지 않는다**. Open Decision 승격 후 readiness 를 다시 돌리는 흐름으로 설계.

## 출력
- deep-research 보고서를 README 의 "공통 보고서 구조"(프론트매터 + 8섹션)로 작성.
- 저장: `temp/execution-loop-research/reports/01-ambiguity-gate.md` (없으면 생성).
- 파일을 못 쓰는 환경이면 전체 보고서를 그대로 출력 → 사용자가 위 경로에 저장.
