---
title: Reconciliation Register
status: draft
kind: meta-register
---

# Reconciliation Register

> 입력 결과물(`input_id` 보유)의 처리 이력·결과를 남기는 살아있는 레지스터.
> `Reconcile Status` 는 **reconcile 행위**의 라이프사이클이며 자식 항목(C/D/U/G)의 open/closed rollup 이 아니다.
> 자식 항목의 open/closed 는 각 레지스터(Open Decisions·Conflicts·Unknowns·Component Gap)가 단일 출처다.
> register-first: 어떤 문서 수정보다 먼저 `in-progress` 행을 쓰고, 처리 후 `reconciled` 로 갱신한다.

## Reconciliation Register
| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
| IN-20260613-planning-001 | planning-doc | resolves-decision + simple-update | reconciled | pending user decision (D-001 separate-tab 후보 — 사람 확정 대기) | COUPON-001 screen-spec, decision-log | D-001 (open · separate-tab 후보) | - |
| IN-20260613-figma-001 | figma | simple-update + component-gap | reconciled | accepted (figma-component-mapping 생성); G-001 open 제안 (accept 대기) | COUPON-001 figma-component-mapping (신규), COUPON-001 screen-spec, component-gap-register | G-001 (open) | - |
| IN-20260613-api-001 | api-doc | simple-update + resolves-unknown + resolves-decision | reconciled | pending user decision (U-001 답 제공·open 유지, D-003 offset/page 후보) | api-manifest, COUPON-001 screen-spec, decision-log | U-001 (open · IN-api-001 답 제공), D-003 (open · offset/page 후보) | - |
| IN-20260613-meeting-001 | meeting | conflict (decision reopen) | reconciled | pending user decision (D-204 재오픈, C-001 open) | AUTH-001 screen-spec, conflicts, decision-log | C-001 (open), D-204 (reopened → open) | - |
| IN-20260613-qa-001 | qa | simple-update + policy-update | reconciled | accepted (State Matrix offline 행, Acceptance, api-error-policy) | COUPON-001 screen-spec, api-error-policy | - | - |
| IN-20260613-testid-001 | qa-automation | simple-update + investigation-needed | reconciled | delegated | COUPON-001 screen-spec (Accessibility testID anchors draft/recommended; VER-001 materialized as note) | VER-001 (open · selector structure depends on D-001) | - |
| IN-20260613-policy-migration-001 | architecture | simple-update + conflict + new-decision | reconciled | pending user decision | project-layout `layers:`, layer-inventory, readiness output, implementation-mode-policy.draft.yaml, implementation-mode-policy.migration.md | C-002 (open), D-501 (open · live policy adoption decision) | - |

<!-- Reconcile Status: not-started → in-progress → reconciled / failed -->
<!-- Result 어휘: accepted / rejected / delegated / pending user decision / conflict-created -->
<!-- Created Items 는 링크만. 자식 open/closed 는 각 레지스터가 단일 출처. -->
