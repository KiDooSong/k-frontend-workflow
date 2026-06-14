# 딥리서치 프롬프트 — Track 03: 작성자–비평자(Author/Critic) 의미 리뷰 프로토콜

> **사용법**: 이 repo(`k-frontend-workflow`)에서 **새 세션**을 열고, 이 파일 내용을 deep-research 스킬로 실행한다.
> 다른 트랙과 독립 실행 가능. 완료되면 보고서를 `temp/execution-loop-research/reports/03-author-critic-review.md` 로 저장한다.

## 먼저 읽기 (이 repo에서 실행 시)
- `temp/execution-loop-research/notes/02-llm-only-scriptization-risk.md` (특히 §4 "스크립트는 의미/제품 판단 못 함", §9.1 역할 분리)
- `temp/execution-loop-research/README.md` 의 "공통 불변식" · "공통 보고서 구조"
- `frontend-workflow-kit/templates/work-packet/review-artifact.template.md` · `scripts/validate.mjs`

## 맥락 (요약)
`validate.mjs` 는 **구조** 검사(frontmatter, manifest, route, Open Decisions 형식, API↔schema 연결 등 12종)는 하지만
**의미/제품 판단**(이 UX 가 맞나, 상태 정의가 충분한가, Unknown 인데 사실은 Open Decision 이어야 하나, readiness 가 과도하게
높게 나온 건 아닌가)은 못 한다. 설계안 2 §9.1 은 역할을 고정하자고 한다 — **Claude = Author**(입력→ScreenSpec/Decisions/
Unknowns 정리, 구현 초안), **Codex = Reviewer**(빠진 상태·엣지케이스·잘못된 confirmed 승격·과한 readiness 비판),
**Claude = Fixer**(리뷰 반영). 단, 외부 리뷰는 루프에 **evidence** 로 들어가야 하고 하드 게이트가 되면 안 된다(Review 는
독립 게이트가 아니라 Work Packet 안의 checklist/evidence).

## 리서치 질문
1. **generator–critic 패턴**(Reflexion, Self-Refine, Constitutional AI critique, LLM-as-judge, multi-agent debate)의 효과 근거와 한계는? **별도 비평 모델**이 자기수정보다 실제로 더 잡아내는가? (가능하면 정량 근거)
2. 구조 린터가 못 잡는 **의미/제품 갭**(빠진 state, 누락 엣지케이스, 오승격된 confirmed, 과도한 readiness)을 잡는 **설계 리뷰 루브릭** 사례는?
3. 외부 리뷰 결과를 **게이트가 아니라 evidence 로** 기록·소비하는 방법은? (verdict 가 머지를 자동으로 막지 않게 하면서도 무시되지 않게)
4. 작성자/비평자에 **서로 다른 모델**(예: Claude vs Codex/GPT)을 쓰는 것의 실효와 함정(편향 공유, 비용, 핸드오프 손실)은?

## 산출물 (이 repo에 바로 쓸 수 있게)
1. **Author / Reviewer / Fixer 리뷰 프로토콜** — 각 역할의 입력·출력·핸드오프 아티팩트·순서. `review-artifact.template.md` 와 정합.
2. **"의미 리뷰" 루브릭** — 빠진 state / 엣지케이스 / Unknown↔Open Decision 오분류 / readiness 과대 / confirmed 오승격 / copy·API 추측 등 점검 항목 + 각 항목 Failure Signal.
3. 리뷰 결과를 **Run Report / Review Artifact 에 evidence 로 적는 형식** — verdict(approve / changes-requested / blocked)가 **사람 전용 결정을 닫지 않도록** 하는 표기 규칙.

## 불변식 안전선
- Review 는 **독립 게이트 아님** (Work Packet 안 evidence). verdict 가 자동 머지 차단 게이트가 되면 안 됨.
- LLM 리뷰어도 Open Decision / Conflict / Unknown 을 **닫지 못한다**. 지적·후보 제안까지만.
- readiness 단일 출처 유지 — 리뷰어가 readiness 를 덮어쓰지 않는다.

## 출력
- README 의 "공통 보고서 구조"로 작성 → `temp/execution-loop-research/reports/03-author-critic-review.md` 저장(없으면 생성).
- 파일을 못 쓰는 환경이면 전체 보고서 출력.
