---
title: Reconciliation Register (reconciliation-validation / v2-pass)
status: draft
kind: meta-register
reconciliation_contract: 2
review_profile: reconcile-stage04-v1
structured_since: "2026-07-20T00:00:00+09:00"
---

# Reconciliation Register — v2-pass fixture (Check 12 / Contract v2)

> Contract v2 opt-in PASS 픽스처. summary Classification multiset ↔ item 개수, typed Touched/Created ref,
> resolved-decision-conflict 의 `conflict create-open + decision reopen` 페어, evidence section pointer,
> `inherit` provenance 가 전부 해소되어 에러·경고 0 (exit 0) 이어야 한다.
> HEADLINE GUARD 는 v1 과 동일: 자식 C-001/D-204 가 open 이어도 `reconciled` 는 통과한다.

| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
| IN-20260720-figma-001 | figma | simple-update + component-gap | reconciled | accepted | artifact:COUPON-001-figma-component-mapping; artifact:component-gap-register | artifact:COUPON-001-figma-component-mapping#component-mapping/M-001; gap:G-001@component-gap-register | - |
| IN-20260720-meeting-001 | meeting | conflict | reconciled | pending-user-decision | artifact:conflicts; artifact:open-decision-register | conflict:C-001@conflicts; decision:D-204@open-decision-register | - |

## Reconciliation Items

| Input ID | Item | Basis | Classification | Effect | Target | Evidence | Source Ref | Source Unit | Captured At |
|---|---|---|---|---|---|---|---|---|---|
| IN-20260720-figma-001 | 01 | visual-evidence | simple-update | create | artifact:COUPON-001-figma-component-mapping#component-mapping/M-001 | input:IN-20260720-figma-001#extracted-facts/01 | figma://file/abc/node/1:234 | instance | inherit |
| IN-20260720-figma-001 | 02 | component-missing | component-gap | create-open | gap:G-001@component-gap-register | input:IN-20260720-figma-001#extracted-facts/02 | figma://file/abc/node/1:235 | instance | inherit |
| IN-20260720-meeting-001 | 01 | resolved-decision-conflict | conflict | create-open | conflict:C-001@conflicts | input:IN-20260720-meeting-001#extracted-facts/01 | inherit | statement | inherit |
| IN-20260720-meeting-001 | 01 | resolved-decision-conflict | conflict | reopen | decision:D-204@open-decision-register | input:IN-20260720-meeting-001#extracted-facts/01 | inherit | statement | inherit |
