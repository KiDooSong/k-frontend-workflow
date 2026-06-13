---
title: Reconciliation Register (reconciliation-validation / fail)
status: draft
kind: meta-register
---

# Reconciliation Register — fail fixture (Check 12)

> Check 12 검증용 FAIL 픽스처. 여러 위반(enum / in-progress / failed / 중복 / 미처리)을 한 번에 담아 exit 1 을 유도한다.
> 단 reconciled 행은 — Created Items 에 open 자식이 있어도 — 절대 에러가 아니다 (HEADLINE GUARD; fail 트리에서도 동일).
> Created Items 는 **링크만** 남긴다. "(open)" 주석은 표시일 뿐 register 가 파싱하지 않는다.

| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
| IN-20260614-planning-001 | planning | simple-update | reconciled | accepted | COUPON-002 screen-spec (UI Sections, Copy Keys) | D-010 (open) | - |
| IN-20260614-figma-001 | figma | simple-update | in-progress | pending user decision | figma-component-mapping (작성 중) | - | - |
| IN-20260614-qa-001 | qa | simple-update | reconciled | accepted | COUPON-002 screen-spec (State Matrix offline) | COUPON-002 State Matrix `offline` 행 | - |
| IN-20260614-qa-001 | qa | simple-update | reconciled | accepted | COUPON-002 screen-spec (Acceptance) | - | - |
| IN-20260614-meeting-001 | meeting | conflict (decision reopen) | in-review | pending user decision | AUTH-002 screen-spec | C-001 (open) | - |
| IN-20260614-user-note-001 | user-note | simple-update | failed | rejected | - | - | - |
| IN-20260614-planning-002 | planning | simple-update | not-started | - | - | - | - |

## 메모 — 행별 기대 결과 (Check 12)

| Input ID | Reconcile Status | 기대 결과 |
|---|---|---|
| IN-20260614-planning-001 | reconciled | OK — Created Items `D-010 (open)` 가 있어도 reconciled 는 통과 (가드 증명) |
| IN-20260614-figma-001 | in-progress | ERROR — "이전 실행 중단" |
| IN-20260614-qa-001 (1행) | reconciled | OK (단, 아래 중복으로 인해 두 행 모두 중복 에러 대상) |
| IN-20260614-qa-001 (2행) | reconciled | ERROR — register Input ID 중복 (2행) |
| IN-20260614-meeting-001 | in-review | ERROR — Reconcile Status enum 위반 |
| IN-20260614-user-note-001 | failed | ERROR — reconcile 실패 |
| IN-20260614-planning-002 | not-started | WARNING only — 에러 아님 |
| IN-20260614-api-001 | (행 없음) | ERROR — inputs 에 있으나 register 행 없음 (input 파일에 보고) |

- **`reconciled` ≠ 자식 닫힘.** planning-001 의 D-010 이 `open` 이어도 reconcile 행위는 끝났다 — register 는 막지 않는다.
- **Created Items 는 링크만.** Check 12 는 "(open)" 을 파싱하지 않으며 오직 Reconcile Status 만으로 판정한다.
