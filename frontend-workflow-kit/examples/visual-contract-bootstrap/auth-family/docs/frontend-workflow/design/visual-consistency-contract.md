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

<!-- 픽스처 의도: auth family 가 AUTH-001 · AUTH-002 만 담고 있어 bootstrap 이
     AUTH-003 을 suggested addition 으로, Button 을 suggested component 로 낸다.
     bootstrap 은 이 파일을 절대 수정하지 않는다 (existing-contract-not-overwritten). -->

## Screen Families

| Family | Member Screens | Layout/Shell Owner | Logo Policy | Header Policy | CTA Policy | Copy Source | Status | Evidence |
|---|---|---|---|---|---|---|---|---|
| auth | AUTH-001, AUTH-002 | AuthShell | shell-owned | shell-owned | shared-bottom-cta | Copy Keys/i18n | draft | IN-20260706-visual-spec-001 |

## Shared Component Rules

| Component | Owned By | Applies To Families | Direct Screen Import | Positioning Owner | Catalog Status | Notes |
|---|---|---|---|---|---|---|
| BrandLogo | AuthShell | auth | forbidden | shell | cataloged | no per-screen margin |

## Visual Exceptions

| Screen ID | Exception | Reason | Decision ID | Status |
|---|---|---|---|---|

## Open Items

| ID | Question | Blocks | Owner | Status |
|---|---|---|---|---|
| VC-001 | reset-password 화면도 auth family 에 넣는가? | - | Design/PM | open |
