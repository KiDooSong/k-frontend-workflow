# 딥리서치 프롬프트 — Track 02: Auto-stop loop & 중단/에스컬레이션 조건

> **사용법**: 이 repo(`k-frontend-workflow`)에서 **새 세션**을 열고, 이 파일 내용을 deep-research 스킬로 실행한다.
> 다른 트랙과 독립 실행 가능. 완료되면 보고서를 `temp/execution-loop-research/reports/02-auto-stop-loop.md` 로 저장한다.

## 먼저 읽기 (이 repo에서 실행 시)
- `temp/execution-loop-research/notes/02-llm-only-scriptization-risk.md` (특히 §9.5, §11, §13 "Runner가 자동으로 멈춰야 할 조건 후보")
- `temp/execution-loop-research/notes/01-loop-engineering.md` (§1 "좋은 루프의 구성 요소", "중단 조건")
- `temp/execution-loop-research/README.md` 의 "공통 불변식" · "공통 보고서 구조"
- `frontend-workflow-kit/scripts/{readiness,validate,forbidden-paths,test-fixtures}.mjs`

## 맥락 (요약)
설계안의 핵심: 루프 엔지니어링이라고 바로 **auto-fix(자동 수정 재시도)** 로 가면 위험하다. 이 repo 의 첫 루프는
**auto-stop** 이어야 한다 — `state/readiness` 실행 → blocker 있으면 **멈춤** → Ambiguity Report 생성 → 사람/리뷰 LLM 이
결정 → 다시 `state/readiness` → 구현 → `validate/forbidden-paths/test-fixtures` → 실패하면 **자동 수정 전에 원인 보고**.
설계안 2 §13 에 멈춤 조건 후보 목록이 이미 있다(충돌, 미반영 Open Decision 후보, blocking 가능 Unknown, requested_mode >
readiness_mode, validate 통과했지만 review 가 BLOCKER, forbidden-paths 위반, generated/confirmed hand-edit 시도 등).

## 리서치 질문
1. **HITL 체크포인트 / 에스컬레이션 정책**을 가진 에이전트 루프 아키텍처(언제 멈추고 사람에게 넘기나)의 선행 사례·패턴은?
2. auto-fix 재시도가 **안전한 경우 vs 해로운 경우**는? 루프 종료/예산(budget)/서킷브레이커/backoff 패턴은 어떻게 설계되나?
3. SWE-agent / Devin / OpenHands / Aider 류 auto-fix 루프의 **알려진 실패 모드**(잘못된 자동 수정, 무한 루프, 비용 폭주, 테스트 끼워맞춤)와 완화책은?
4. "진전 없음 / 모호한 목표 / reward hacking" 을 감지해 멈추는 기준은 어떻게 정의·측정되나?

## 산출물 (이 repo에 바로 쓸 수 있게)
1. `workflow:run` 용 **auto-stop 상태기계** — 상태·전이·정지조건. "구현 시작 전에 멈추는 것" 이 기본 경로가 되도록.
2. **"Runner must stop when…" 최종 조건 목록** — 설계안 2 §13 후보를 정제·중복제거·우선순위화. 각 조건마다 신호 출처 명시(readiness / validate / forbidden-paths / diff / review).
3. (있다면) **제한적 auto-retry 가 허용되는 좁은 범위 + 상한**(횟수/비용/시간/대상). 안전하게 허용 불가하면 "없음 — 전부 사람에게 보고"로 명시.

## 불변식 안전선
- runner 는 결정을 닫거나 readiness 를 재계산하지 않는다. **멈춤이 기본**, 진행은 게이트 충족 시에만.
- "실패 시 자동 수정" 보다 "실패 원인 보고 후 정지" 를 우선. auto-fix 는 명시적 옵트인 + 상한이 있을 때만.

## 출력
- README 의 "공통 보고서 구조"로 작성 → `temp/execution-loop-research/reports/02-auto-stop-loop.md` 저장(없으면 생성).
- 파일을 못 쓰는 환경이면 전체 보고서 출력.
