---
title: Reconciliation Register (reconciliation-validation / v2-fail)
status: draft
kind: meta-register
reconciliation_contract: 2
review_profile: reconcile-stage04-v1
structured_since: "2026-07-20T00:00:00+09:00"
---

# Reconciliation Register — v2-fail fixture (Check 12 / Contract v2)

> Contract v2 의 대표 hard failure 들을 한 트리에 모은 픽스처다. v1 lifecycle 검사(Reconcile Status)는
> 전부 정상이므로, 여기서 나는 에러는 **전부 v2 구조·참조·routing·provenance 검사**다.
> 기대 에러 11건: RR-ITEM-005(multiset) · RR-ITEM-006×2(Created 누락/과잉) · RR-ITEM-007(Touched 과잉) ·
> RR-SCHEMA-008×2(상태 주석 금지 + 주석 붙은 토큰은 typed ref 도 아님) · RR-REF-008(G-999 미해소) ·
> RR-ROUTE-003(reopen 페어 없음) · RR-ROUTE-004(visual→비시각 artifact) · RP-001(Source Unit enum) ·
> RP-002(RFC3339 위반).

| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
| IN-20260720-figma-001 | figma | simple-update + component-gap | reconciled | accepted | artifact:COUPON-001-figma-component-mapping; artifact:component-gap-register; artifact:conflicts | artifact:COUPON-001-figma-component-mapping#component-mapping/M-001; gap:G-001@component-gap-register | - |
| IN-20260720-meeting-001 | meeting | conflict | reconciled | pending-user-decision | artifact:conflicts; artifact:open-decision-register | conflict:C-001@conflicts (open); decision:D-204@open-decision-register | - |

## Reconciliation Items

| Input ID | Item | Basis | Classification | Effect | Target | Evidence | Source Ref | Source Unit | Captured At |
|---|---|---|---|---|---|---|---|---|---|
| IN-20260720-figma-001 | 01 | visual-evidence | simple-update | create | artifact:COUPON-001-figma-component-mapping#component-mapping/M-001 | input:IN-20260720-figma-001#extracted-facts/01 | figma://file/abc/node/1:234 | instance | inherit |
| IN-20260720-figma-001 | 02 | component-missing | component-gap | create-open | gap:G-999@component-gap-register | input:IN-20260720-figma-001#extracted-facts/02 | figma://file/abc/node/1:235 | instance | inherit |
| IN-20260720-figma-001 | 03 | visual-evidence | simple-update | update | artifact:conflicts | input:IN-20260720-figma-001#extracted-facts/01 | figma://file/abc/node/1:236 | pixels | 2026-07-20 |
| IN-20260720-meeting-001 | 01 | resolved-decision-conflict | conflict | create-open | conflict:C-001@conflicts | input:IN-20260720-meeting-001#extracted-facts/01 | inherit | statement | inherit |

## 메모
- figma 행: item 이 3개(simple-update×2 + component-gap)인데 summary 는 `simple-update + component-gap` → RR-ITEM-005.
- figma item 02 는 존재하지 않는 `G-999` 를 target → RR-REF-008, summary Created(G-001)와도 어긋남 → RR-ITEM-006.
- figma item 03 은 visual-evidence 로 비시각 artifact(conflicts)를 update → RR-ROUTE-004,
  Source Unit `pixels` → RP-001, Captured At date-only → RP-002.
- meeting 행: `decision:* reopen` effect 가 없음 → RR-ROUTE-003. summary Created 의 `(open)` 주석 → RR-SCHEMA-008,
  D-204 created/touched 는 item 에 근거가 없음 → RR-ITEM-006·RR-ITEM-007.
