---
title: Reconciliation Register (reconciliation-validation / unreconciled)
status: draft
kind: meta-register
---

# Reconciliation Register — unreconciled (Check 12, warning-first)

> "미처리(reconcile 미완)" warning-first 시연 픽스처.
> - `IN-20260614-figma-001`: inputs/ 에 있으나 register 행 **없음** → 미처리.
> - `IN-20260614-api-001`: 행은 있으나 `Reconcile Status=not-started` → 미시작.
> 기본 실행: 둘 다 `[경고 12]` (exit 0). `--enforce`: 둘 다 `[검사 12]` 에러 (exit 1).
> `IN-20260614-planning-001` 은 `reconciled` 라 어느 모드에서도 통과.

| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
| IN-20260614-planning-001 | planning | simple-update | reconciled | accepted | COUPON-002 screen-spec | - | - |
| IN-20260614-api-001 | api | simple-update | not-started | - | - | - | - |

## 메모
- `figma-001` 행은 일부러 누락 → "inputs/ 에 있으나 register 에 행 없음" 미처리 경로.
- 기본은 warning-first(막지 않음). CI 강제 시점엔 `node scripts/validate.mjs --docs … --enforce` 로 에러 승격.
- in-progress/failed/enum/중복/8컬럼누락 같은 망가짐·중단 상태는 `--enforce` 와 무관하게 항상 에러(이 트리엔 없음).
