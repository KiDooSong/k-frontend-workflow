# Execution Loop / Work Packet Runner — 리서치 묶음

작성: 2026-06-14 · 대상 repo: KiDooSong/k-frontend-workflow (`frontend-workflow-kit/`)

이 디렉토리는 두 개의 임시 설계 메모를 한데 묶고, 그 위에서 **Execution Loop / Work Packet Runner** 축을
구체화·확장·개선·보완하기 위한 딥리서치를 **여러 세션에서 병렬로** 돌리기 위한 작업 공간이다.

## 구성

```
execution-loop-research/
  README.md                                 ← (이 파일) 인덱스 · 불변식 · 보고서 구조
  notes/
    01-loop-engineering.md                  설계안 1: 루프 엔지니어링 + Work Packet Runner 확장 방향
    02-llm-only-scriptization-risk.md       설계안 2: 스크립트화가 리뷰/티키타카를 스킵할 위험 + 안전 운영안
  prompts/
    01-ambiguity-gate.md                     세션별 딥리서치 프롬프트 (각각 독립 실행)
    02-auto-stop-loop.md
    03-author-critic-review.md
    04-run-report-provenance.md
    05-green-check-complacency.md
    06-execution-envelope-prior-art.md
  reports/
    NN-*.md                                  각 세션이 작성해 돌려놓는 보고서 (여기로 모인다)
```

## 워크플로우

1. `prompts/NN-*.md` 를 각각 **새 세션**에서 연다 (이 repo에서 Claude Code 새 세션 권장 — `notes/` 와 코드를 직접 읽을 수 있어 근거가 강해진다).
2. 그 세션에서 **deep-research 스킬**로 실행한다 (프롬프트 본문을 그대로 입력하거나 `/deep-research` 로 호출).
3. 세션은 보고서를 `reports/NN-<slug>.md` 로 저장한다 (아래 "공통 보고서 구조" 사용).
4. 보고서가 (전부 또는 일부) `reports/` 에 모이면 **이 작업의 메인 세션**으로 돌아와
   "`reports/` 보고서들 모아서 논의하자" 라고 하면 종합·교차검토·다음 설계로 이어간다.

세션끼리는 서로의 작업을 모른다. 각 프롬프트는 self-contained 이며, 트랙 간 의존이 없으므로 **순서·개수 자유**로 돌려도 된다.

## 트랙 인덱스

| # | 프롬프트 | 초점 | 보고서 |
|---|---|---|---|
| 01 | `prompts/01-ambiguity-gate.md` | 구현 전 애매함 표면화 + Unknown→Open Decision triage | `reports/01-ambiguity-gate.md` |
| 02 | `prompts/02-auto-stop-loop.md` | auto-fix 가 아니라 auto-stop 루프 / 중단·에스컬레이션 조건 | `reports/02-auto-stop-loop.md` |
| 03 | `prompts/03-author-critic-review.md` | 작성자–비평자(Claude/Codex) 의미 리뷰 프로토콜 | `reports/03-author-critic-review.md` |
| 04 | `prompts/04-run-report-provenance.md` | Run Report 증거·프로버넌스·멱등 | `reports/04-run-report-provenance.md` |
| 05 | `prompts/05-green-check-complacency.md` | "통과 = 완료" 착각 방지 문구·UX | `reports/05-green-check-complacency.md` |
| 06 | `prompts/06-execution-envelope-prior-art.md` | 실행 봉투 / 플랜파일 / spec-driven 선행사례 비교 | `reports/06-execution-envelope-prior-art.md` |

## 공통 불변식 (모든 트랙이 지켜야 함 — 제안이 이걸 깨면 실패다)

1. `readiness.mjs` = **판정 단일 출처**. 어떤 제안도 이를 재계산/대체하지 않는다.
2. Work Packet = **실행 봉투**. 새 source of truth 도, 새 게이트도 아니다. readiness 출력을 "복사"만 한다.
3. `validate` / `forbidden-paths` / `test-fixtures` = **구조·회귀 검증**. 실행 후 "증거"로만 쓴다 (제품/의미 리뷰 아님).
4. LLM 은 Open Decision resolve / Unknown close / Conflict close / candidate→confirmed 승격을 **하지 않는다** (사람 전용).
5. Unknown 은 기본적으로 **게이트가 아니다**. 구현을 막아야 하는 애매함은 Open Decision 으로 승격해야 한다.
6. 첫 구현은 auto-fix 루프가 아니라 **auto-stop 루프**다 (애매함을 표면화하고 멈춘다).
7. 스크립트는 리뷰 대체가 아니라 **가드레일**이다. "통과 = 설계/제품적으로 충분"은 금지된 착각이다.
8. 새 산출물 축을 늘리지 않는다. 기존 **Work Packet & Review Artifacts**(Future Candidate) 안에서 다룬다.
9. Review 는 독립 게이트가 아니다. Work Packet 안의 evidence/checklist 다 (verdict ≠ 머지 차단).
10. generated file / confirmed artifact 는 hand-edit 하지 않는다. `allowed/forbidden_paths` 는 readiness 출력에서 복사.

근거 파일(이 repo): `frontend-workflow-kit/roadmap-current.md` ·
`scripts/{workflow-state,readiness,validate,forbidden-paths,test-fixtures}.mjs` ·
`templates/work-packet/{work-packet,run-report,review-artifact}.template.md` ·
`policies/implementation-mode-policy.yaml` · `input-reconciliation.md` ·
`templates/screen/screen-spec.template.md`

## 공통 보고서 구조 (`reports/NN-*.md`)

각 보고서는 아래 프론트매터 + 8 섹션을 따른다. 종합 세션이 기계적으로 모으기 쉽게, **이 구조를 그대로** 쓴다.

```md
---
track: NN
title: <트랙 제목>
date: 2026-06-14
status: draft
inputs: [notes/01-loop-engineering.md, notes/02-llm-only-scriptization-risk.md]
---

# Track NN — <제목>

## 1. Executive summary
3~6 bullet: 핵심 발견 + 권고.

## 2. Prior art & findings
인용 포함. 다른 시스템/논문/도구가 하는 법, 패턴 이름, 트레이드오프.

## 3. Recommendation for k-frontend-workflow
repo 맥락으로 매핑 — 추상론 말고 이 repo에 어떻게 적용되는지.

## 4. Concrete deliverable
실제 산출물(스키마 / 섹션 spec / 루브릭 / 문구 / 상태기계). 복붙 가능하게.

## 5. Invariant safety check
위 "공통 불변식" 위반이 없는지 자가검증. 긴장 지점이 있으면 명시.

## 6. Risks / trade-offs / what NOT to do

## 7. Open questions for synthesis
종합 세션이 결정해야 할 열린 질문.

## 8. Sources
번호 + URL.
```
