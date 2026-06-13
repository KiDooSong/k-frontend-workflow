---
title: Reconciliation Register (expected-llm-after)
status: draft
kind: meta-register
---

# Reconciliation Register — expected-llm-after

> 입력별 처리 이력 (reconcile-input 단독 실행 직후). `Reconcile Status` 는 reconcile **행위**의 라이프사이클이고
> 자식 항목(D-/C-/U-/G-)의 open/closed 와 별개다. register-first: 문서 수정보다 먼저 행을 쓴다.
> 5개 입력 모두 reconcile 자체는 끝났으므로 `reconciled`. 사람 결정이 남은 입력은 `Result: pending user decision`.
> 입력당 canonical 행 1개. (계약: input-reconciliation.md)

| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
| IN-20260613-planning-001 | planning | resolves-decision + simple-update | reconciled | pending user decision | COUPON-001 screen-spec (UI Sections, Copy Keys) | D-001 (open · separate-tab 후보) | - |
| IN-20260613-figma-001 | figma | simple-update + component-gap | reconciled | accepted | COUPON-001 screen-spec (UI Sections), figma-component-mapping (신규) | G-001 (open) | - |
| IN-20260613-api-001 | api | simple-update + resolves-unknown + resolves-decision | reconciled | pending user decision | api-manifest (page envelope), COUPON-001 screen-spec (Data) | U-001 (open · IN-api-001 가 답 제공), D-003 (open · offset/page 후보) | - |
| IN-20260613-meeting-001 | meeting | conflict (decision reopen) | reconciled | pending user decision | AUTH-001 screen-spec (D-204 재오픈) | C-001 (open), D-204 (reopened → open) | - |
| IN-20260613-qa-001 | qa | simple-update | reconciled | accepted | COUPON-001 screen-spec (State Matrix offline, Acceptance), api-error-policy | COUPON-001 State Matrix `offline` 행 | - |

## 메모 (LLM 단독 단계)
- **`reconciled` ≠ 자식 닫힘.** D-001/D-003/D-204/C-001 이 `open` 이어도 reconcile 행위는 끝났다. 그 차단은 readiness 다운그레이드가 담당한다(register 가 중복 차단하지 않는다).
- **`pending user decision`** 행(planning/api/meeting)은 "처리는 됐고 사람 결정만 남았다"를 뜻한다. `accepted` 로 바뀌는 것은 사람이 닫은 뒤(expected-after).
- **navigation-map 은 Touched 아님.** meeting 입력의 returnTo 반영(Route Guard)은 D-204(재오픈)에 걸려 보류 — 사람이 닫은 뒤 navigation-map 이 Touched 에 들어간다(expected-after).
- **멱등성**: 같은 input_id 를 다시 reconcile 하면 이 `reconciled` 행을 보고 멈춘다(중복 수정 없음).
