---
review_status: advisory
review_summary: changes-suggested
human_action_required: false
reviewer: GPT Pro (external)
target: "PR #24 (feat/execution-loop-design) — Execution Loop 설계초안"
date: 2026-06-14
---

> **추적 기록 (advisory).** 이 파일은 PR #24 외부리뷰 결과를 남긴다 — 머지를 자동 차단하지 않으며 GitLab MR approval rules / merge checks / protected branches 에 배선하지 않는다(불변식 9 · SYNTHESIS §9.3). 스키마는 PR1b `review-artifact.template.md` 의 advisory 스키마(§9.3)를 dogfooding.

# Review: PR #24 — Execution Loop 설계초안 (GPT Pro)

## Findings

| # | severity | route | 내용 | 처리 |
|---|---|---|---|---|
| 1 | major | recommended-fix | "LLM 은 ScreenSpec 에 직접 쓰지 않는다" 문구의 scope 가 너무 넓어, 기존 authoring/reconcile 계약(LLM 이 `open` 행 추가·`resolved → open` 재오픈 가능)과 충돌해 보임. `workflow:packet` / `workflow:run` / review 단계로 한정해야. | ✅ 반영 — `ambiguity-triage` §2 원칙1·§7, `pr-plan` §5.2, `pr1b` Ambiguity 주석에 **단계 한정 + authoring 예외(open 행 추가·재오픈 허용)** 명시. resolve/close/confirmed 승격은 항상 사람으로 유지. |
| 2 | info | recommended-fix | "강 신호 1개 → D-cand" 는 초기 보수 기본값임을 적용 문구에서 한 번 더 강조 권장(over-asking 위험). | ✅ 반영 — `ambiguity-triage` §4 에 "초기 *보수* 기본값 — coupon-feature A/B 로 보정" 명시. |
| 3 | info | human-only-decision | PR2~4 구현 표면(A. 스킬 중심 vs B. 스크립트 중심)을 PR2 착수 전에 못박을 것. | ✅ 반영 — `pr-plan` §11 에 A/B 명시 + "결정 필요"(닫지 않음). |
| 4 | info | recommended-fix | merge 전 외부리뷰 결과를 PR 본문/temp 에 기록해 추적성 확보. | ✅ 이 파일 + PR #24 코멘트로 기록. |

## 종합
- finding 1(major)만 고치면 merge OK 라는 리뷰 판단에 따라 **scope 1건 + 비차단 3건 모두 반영**.
- `human_action_required: false` — 이 리뷰가 새로 막는 것은 없다. 남은 §8 결정(ambiguity 입력 계약 포맷 · v1 순수 auto-stop · digest · PR2~4 형식 A/B · calibration 임계 등)은 기존대로 사람 몫으로 **열린 채** 유지.
- 불변식 정합: 수정은 기존 canonical 계약(`global/llm-rules.md` · `input-reconciliation.md`: 게이트 *올리는* 재오픈은 LLM, *내리는* 재-resolve 는 사람)과 일치하도록 scope 를 좁혔을 뿐, 새 권한을 만들지 않았다.
