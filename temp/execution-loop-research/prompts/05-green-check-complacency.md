# 딥리서치 프롬프트 — Track 05: "통과 = 완료" 착각 방지 (문구 · UX)

> **사용법**: 이 repo(`k-frontend-workflow`)에서 **새 세션**을 열고, 이 파일 내용을 deep-research 스킬로 실행한다.
> 다른 트랙과 독립 실행 가능. 완료되면 보고서를 `temp/execution-loop-research/reports/05-green-check-complacency.md` 로 저장한다.

## 먼저 읽기 (이 repo에서 실행 시)
- `temp/execution-loop-research/notes/02-llm-only-scriptization-risk.md` (특히 §6 위험한 사용법, §10, §13 "금지해야 할 착각")
- `temp/execution-loop-research/notes/01-loop-engineering.md` (§ "이해 부채", "검증 없는 루프")
- `temp/execution-loop-research/README.md` 의 "공통 불변식" · "공통 보고서 구조"
- `frontend-workflow-kit/README.md` · `skills/implement-screen/SKILL.md`

## 맥락 (요약)
LLM-only 사용자가 가장 빠지기 쉬운 함정은 **"스크립트 통과 = 설계적으로 충분"** 이라는 착각이다. 설계안 2 가 못박은
금지된 착각: `readiness 통과 ≠ 설계 리뷰 완료`, `validate 통과 ≠ 제품적으로 올바름`, `Unknown open ≠ 항상 안전`,
`draft ≠ 리뷰 완료`, `Work Packet ≠ 구현 허가서`, `Run Report ≠ 사람 승인`. 이 트랙은 게이트/판정 로직은 **건드리지 않고**,
문구·UX·affordance 만으로 이 착각을 줄이는 방법을 찾는다(이 repo 는 "검증 없는 루프 = 그냥 자동화" 라는 철학을 가짐).

## 리서치 질문
1. **automation bias / automation complacency**, alarm fatigue, **Goodhart's law / metric gaming**, "green build fallacy", AI 생성 코드의 **comprehension debt** 에 관한 근거와 사례는?
2. **문구/UX/affordance** 가 false confidence 를 줄인 사례는? (효과적인 경고·라벨·의도적 마찰(friction)·체크포인트 디자인) 반대로 무시당하는 경고의 특징은?
3. "이 도구가 **보장하는 것 vs 보장하지 않는 것**" 을 사용자에게 각인시키는 좋은 카피·배치 패턴은?

## 산출물 (이 repo에 바로 쓸 수 있게)
1. **README / Skill 카피** — "스크립트가 하는 것 vs 안 하는 것" 프레이밍 블록 + "금지된 착각" 6줄을 in-product 문구(한국어)로.
2. **게이트 출력 디스클레이머** — `readiness`/`validate` 통과 메시지에 덧붙일 1줄 문안(예: "readiness=rough-fixture-ui 는 기계적 상한이지 설계 승인이 아닙니다").
3. **anti-pattern 목록 + 표면화 위치** — 설계안 2 §6 의 위험한 사용 흐름을 어디(Work Packet / Run Report / Skill 프롬프트)에서 경고로 띄울지.

## 불변식 안전선
- **문구·문서만** 바꾼다. 게이트/판정/스크립트 로직은 건드리지 않는다. 새 게이트 아님.
- 경고가 alarm fatigue 가 되지 않도록 빈도/배치 설계까지 포함.

## 출력
- README 의 "공통 보고서 구조"로 작성 → `temp/execution-loop-research/reports/05-green-check-complacency.md` 저장(없으면 생성).
- 파일을 못 쓰는 환경이면 전체 보고서 출력.
