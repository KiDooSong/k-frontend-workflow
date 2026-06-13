---
title: Reconciliation Register (reconciliation-validation / pass)
status: draft
kind: meta-register
---

# Reconciliation Register — pass fixture (Check 12)

> Check 12 검증용 PASS 픽스처. 모든 입력이 `reconciled` 이므로 register 검사는 통과(exit 0)한다.
> HEADLINE GUARD: meeting 행은 Created Items 에 open/reopened 자식을 달고도 `reconciled` 이다 — Check 12 는 이를 통과시켜야 한다.
> Created Items 는 **링크만** 남긴다. "(open)" 주석은 표시일 뿐 register 가 파싱하지 않는다 (자식 open/closed 는 Open Decisions/Conflicts/Unknowns 가 단일 출처).
> 입력당 canonical 행 1개. (계약: input-reconciliation.md)

| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
| IN-20260614-planning-001 | planning | simple-update | reconciled | accepted | COUPON-002 screen-spec (UI Sections, Copy Keys) | COUPON-002 Copy Keys `coupon.detail.share` | - |
| IN-20260614-figma-001 | figma | simple-update | reconciled | accepted | figma-component-mapping (신규), COUPON-002 screen-spec (UI Sections) | - | - |
| IN-20260614-meeting-001 | meeting | conflict (decision reopen) | reconciled | pending user decision | AUTH-002 screen-spec (D-204 재오픈) | C-001 (open), D-204 (reopened → open) | - |

## 메모
- **`reconciled` ≠ 자식 닫힘.** meeting 행의 C-001 / D-204 가 `open` 이어도 reconcile 행위는 끝났다. 그 차단은 readiness 다운그레이드가 담당한다 (register 가 중복 차단하지 않는다).
- **Created Items 는 링크만.** Check 12 는 Created Items 의 "(open)" / "(reopened → open)" 를 절대 파싱하지 않는다 — 오직 Reconcile Status 만 본다.
- 모든 행이 `reconciled` 이므로 Check 12 는 에러·경고 없이 통과한다 (exit 0).
