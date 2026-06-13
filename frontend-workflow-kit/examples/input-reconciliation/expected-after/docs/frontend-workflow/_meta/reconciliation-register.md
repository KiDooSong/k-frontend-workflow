---
title: Reconciliation Register (expected-after)
status: draft
kind: meta-register
---

# Reconciliation Register — expected-after

> 입력별 처리 이력. `Reconcile Status` 는 reconcile 행위의 라이프사이클이고(자식 항목 rollup 아님),
> `Result` 는 처리 결과 어휘다. register-first 원칙: 문서 수정보다 먼저 행을 쓴다.
> 입력당 canonical 행 1개. (계약: input-reconciliation.md)

| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
| IN-20260613-planning-001 | planning | resolves-decision + simple-update | reconciled | accepted | COUPON-001 screen-spec | D-001 (resolved by human) | - |
| IN-20260613-figma-001 | figma | simple-update + component-gap | reconciled | accepted | COUPON-001 screen-spec, figma-component-mapping | G-001 (open) | - |
| IN-20260613-api-001 | api | simple-update + resolves-unknown + resolves-decision | reconciled | accepted | api-manifest, COUPON-001 screen-spec | U-001 (resolved), D-003 (resolved by human) | - |
| IN-20260613-meeting-001 | meeting | conflict (decision reopen) | reconciled | accepted | navigation-map, AUTH-001 screen-spec | C-001, D-204 (reopened → re-resolved by human) | - |
| IN-20260613-qa-001 | qa | simple-update | reconciled | accepted | COUPON-001 screen-spec, api-error-policy | COUPON-001 State Matrix `offline` 행 | - |

## 미처리 감지 메모
- 모든 input_id 가 register 에 `reconciled` 행으로 존재 → 미처리 입력 없음.
- 자식 decision(D-101/D-301/D-401)이 open 이어도 그 입력들과는 무관하다. 해당 차단은 readiness 다운그레이드가 담당한다.
