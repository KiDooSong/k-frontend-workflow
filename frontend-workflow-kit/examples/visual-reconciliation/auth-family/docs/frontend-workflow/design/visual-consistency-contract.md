---
artifact_id: "visual-consistency-contract"
artifact_type: visual-consistency-contract
status: draft
last_reviewed: "2026-07-06"
sources:
  - { type: figma, ref: "figma://file/auth-visual-refresh" }
---

# Visual Consistency Contract

## Purpose

이 문서는 route/screen identity 의 단일 출처가 아니다.
ScreenSpec, figma-component-mapping, component catalog, Open Decisions 를 참조해
여러 화면의 공통 visual/layout/component ownership 을 정리한다.

## Screen Families

| Family | Member Screens | Layout/Shell Owner | Logo Policy | Header Policy | CTA Policy | Copy Source | Status | Evidence |
|---|---|---|---|---|---|---|---|---|
| auth | AUTH-001, AUTH-002, AUTH-404 | AuthShell | shell-owned | shell-owned | shared-bottom-cta | Copy Keys/i18n | draft | IN-20260706-visual-spec-001 |

## Shared Component Rules

| Component | Owned By | Applies To Families | Direct Screen Import | Positioning Owner | Catalog Status | Notes |
|---|---|---|---|---|---|---|
| BrandLogo | AuthShell | auth | forbidden | shell | cataloged | no per-screen margin |
| MarketingBanner | AuthShell | auth | forbidden | shell | missing | G-002 로 제안됨 — accept 전 구현 금지 |

## Visual Exceptions

| Screen ID | Exception | Reason | Decision ID | Status |
|---|---|---|---|---|
| AUTH-001 | custom hero copy alignment | marketing landing hero | D-100 | draft |
| AUTH-002 | custom CTA color | - | - | draft |

## Open Items

| ID | Question | Blocks | Owner | Status |
|---|---|---|---|---|
| VC-001 | onboarding family 도 AuthShell 을 공유하는가? | - | Design/PM | open |
