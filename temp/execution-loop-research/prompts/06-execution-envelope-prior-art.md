# 딥리서치 프롬프트 — Track 06: 실행 봉투 / 플랜파일 / spec-driven 선행사례 비교

> **사용법**: 이 repo(`k-frontend-workflow`)에서 **새 세션**을 열고, 이 파일 내용을 deep-research 스킬로 실행한다.
> 다른 트랙과 독립 실행 가능. 완료되면 보고서를 `temp/execution-loop-research/reports/06-execution-envelope-prior-art.md` 로 저장한다.

## 먼저 읽기 (이 repo에서 실행 시)
- `frontend-workflow-kit/templates/work-packet/work-packet.template.md` (현재 Work Packet 정의·규칙)
- `temp/execution-loop-research/notes/01-loop-engineering.md` (§2 Work Packet = 실행 봉투, source of truth/gate 아님)
- `temp/execution-loop-research/README.md` 의 "공통 불변식" · "공통 보고서 구조"
- `frontend-workflow-kit/roadmap-current.md` (Future Candidate: Work Packet & Review Artifacts)

## 맥락 (요약)
Work Packet 은 **실행 봉투**다 — 새 source of truth 도, 새 게이트도 아니고, readiness 출력(`allowed_paths`/`forbidden_paths`/
`blocking`/모드)을 **복사**해 한 세션의 작업을 포장하는 인덱스/핸드오프 보드. 이 트랙은 다른 도구들이 "작업 단위 봉투/플랜"을
어떻게 표현·게이트·핸드오프하는지 비교해서, Work Packet 의 고유 포지셔닝을 분명히 하고 템플릿을 개선한다.

## 리서치 질문
1. 코딩 에이전트/도구가 **작업 단위를 어떻게 스코프·게이트·핸드오프** 하나? 비교 대상 예: Claude Code plan mode, Aider, Devin, OpenHands/OpenDevin, GitHub **Spec Kit**(spec-driven), AWS **Kiro**(spec/steering), Cursor, Sourcegraph/SWE-agent. 각자의 envelope/plan 표현과 게이팅 방식.
2. **spec-driven development**, **"Definition of Ready"**, **plan file**, 티켓-핸드오프 아티팩트의 베스트 프랙티스와 실패 모드는?
3. "**새 세션/에이전트가 cold 하게 집행 가능한**" 핸드오프를 만드는 요소는? 무엇을 봉투에 담고(스냅샷) 무엇을 링크만(정본) 두어야 하나?

## 산출물 (이 repo에 바로 쓸 수 있게)
1. **비교표** — 도구 → 작업 스코프 방식 → 게이팅 → 핸드오프 형식 → (이 repo 가) 차용할 점 / 회피할 점.
2. **Work Packet 포지셔닝** — 선행 사례 대비 고유점(readiness 출력 복사, 게이트 아님, 결정 안 닫음)을 명료화 + 약점/공백.
3. **`work-packet.template.md` 개선 제안** — 추가/삭제할 섹션, 문구 수정(예: Ambiguity Review / Pre-Implementation Review 행을 어디에 둘지) — 단, 새 축·새 게이트 추가는 금지.

## 불변식 안전선
- **새 산출물 축 추가 금지** — 기존 Work Packet & Review Artifacts(Future Candidate) 안에서만.
- readiness **단일 출처** 유지. Work Packet 이 판정/게이트가 되지 않게.
- 봉투는 정본을 **복사하지 말고 링크**(ScreenSpec/decision-log 가 정본). readiness 출력만 스냅샷 복사.

## 출력
- README 의 "공통 보고서 구조"로 작성 → `temp/execution-loop-research/reports/06-execution-envelope-prior-art.md` 저장(없으면 생성).
- 파일을 못 쓰는 환경이면 전체 보고서 출력.
