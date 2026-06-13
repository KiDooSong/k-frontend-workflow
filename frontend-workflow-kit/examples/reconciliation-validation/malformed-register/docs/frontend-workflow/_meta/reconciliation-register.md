---
title: Reconciliation Register (reconciliation-validation / malformed-register)
status: draft
kind: meta-register
---

# Reconciliation Register — malformed (Check 12)

> Check 12 의 8컬럼 스키마 검사용 **FAIL** 픽스처. 표가 필수 컬럼 6개(Source / Classification / Result /
> Touched Artifacts / Created Items / Supersedes)를 빠뜨려 "Reconciliation Register 표 필수 컬럼 누락" 에러가 난다.
> Input ID·Reconcile Status 는 있어 행 검사 자체는 통과(planning-001 = reconciled)하므로 다른 검사 12 에러/경고는 없다.

| Input ID | Reconcile Status |
|---|---|
| IN-20260614-planning-001 | reconciled |

## 메모
- 의도: 컬럼 누락만 단일 에러로 발화(exit 1). 8컬럼 스키마는 `input-reconciliation.md` "Reconciliation Register" 가 단일 출처.
