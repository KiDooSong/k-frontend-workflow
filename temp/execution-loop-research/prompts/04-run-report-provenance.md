# 딥리서치 프롬프트 — Track 04: Run Report 증거 · 프로버넌스 · 멱등

> **사용법**: 이 repo(`k-frontend-workflow`)에서 **새 세션**을 열고, 이 파일 내용을 deep-research 스킬로 실행한다.
> 다른 트랙과 독립 실행 가능. 완료되면 보고서를 `temp/execution-loop-research/reports/04-run-report-provenance.md` 로 저장한다.

## 먼저 읽기 (이 repo에서 실행 시)
- `frontend-workflow-kit/templates/work-packet/run-report.template.md` (현재 Gate Compliance / Diff Summary / Idempotency / Blockers Reported 섹션 보유)
- `temp/execution-loop-research/notes/01-loop-engineering.md` (§ run-report 역할) · `notes/02-llm-only-scriptization-risk.md` (§11 workflow:report)
- `temp/execution-loop-research/README.md` 의 "공통 불변식" · "공통 보고서 구조"
- `frontend-workflow-kit/scripts/test-fixtures.mjs` (멱등/회귀 하니스)

## 맥락 (요약)
`run-report.template.md` 는 이미 한 Work Packet 의 실행 결과를 봉투에 맞춰 기록한다. 원칙: 게이트/경로 판정은
`readiness_source` 를 **그대로 소비**(재계산 금지), 경계 준수는 validate 가 아니라 **diff(또는 해시 스냅샷)** 로 보고,
blocker 는 readiness 의 `blocking/next_actions` 를 그대로 전달, 2차 실행 **멱등**(빈 diff / byte 동일)을 표기.
이 트랙은 이 증거 모델을 외부 선행 사례로 단단히 하고, "이번 실행이 어떤 readiness 를 보고 무엇을 왜 했는지"를
**재현 가능**하게 남기는 최소 충분 스키마를 정한다.

## 리서치 질문
1. **빌드/AI 행위 provenance** 표준·패턴(SLSA, in-toto attestation, build provenance, reproducible builds)과, 자율 에이전트 행위에 적용한 사례는?
2. **멱등성 검증**(re-run = empty diff) 방법과 **diff/hash 기반 증거** 설계 사례는? "무엇이 바뀌었고 왜" 를 남기는 run manifest / audit log 패턴은?
3. 소규모 repo 기준 **최소 충분 증거** 는 무엇이고, 무엇이 과(過)설계인가? (증거 수집이 그 자체로 마찰/비용이 되는 지점)

## 산출물 (이 repo에 바로 쓸 수 있게)
1. **run-report 증거 스키마 정제** — 기존 템플릿 필드에 맞춰: `readiness_source` 소비, files-changed ⊆ allowed_paths 교차검증, Gate Compliance(4행), Diff Summary(ADDED/MODIFIED/REMOVED), Idempotency(2차 byte 동일·빈 diff), Blockers(readiness 그대로 전달).
2. **멱등성 자동 체크 설계** — runner 가 `state/readiness/validate` 재실행 → full-tree diff 가 비었는지 확인하는 절차(허용 재생성 범위 포함).
3. **증거 충분/과잉 경계 가이드** — 이 repo 규모에서 무엇을 빼도 안전한지.

## 불변식 안전선
- Run Report 는 **사람 승인이 아니다**. readiness 재계산 금지.
- **거절(빈 diff)이 정답인 케이스**(requested_mode > readiness_mode 등)를 실패로 보고하지 않게 설계.
- 증거는 diff/해시로 — validate 통과를 "경계 준수 증거"로 둔갑시키지 않는다.

## 출력
- README 의 "공통 보고서 구조"로 작성 → `temp/execution-loop-research/reports/04-run-report-provenance.md` 저장(없으면 생성).
- 파일을 못 쓰는 환경이면 전체 보고서 출력.
