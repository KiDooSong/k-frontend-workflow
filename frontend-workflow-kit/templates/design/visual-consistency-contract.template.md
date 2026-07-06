---
artifact_id: "visual-consistency-contract"
artifact_type: visual-consistency-contract
status: draft             # 라이프사이클: draft|review|confirmed (confirmed 승격은 사람만)
last_reviewed: "{YYYY-MM-DD}"
sources:
  - { type: figma, ref: "{source}" }
# status: confirmed 로 승격할 때만 사람이 추가 (LLM 승격 금지):
#   approved_by / approved_at / decision_id
---

<!--
  이 문서는 여러 화면의 공통 visual/layout/component ownership 을 정리하는 **정합성 계약**이다.
  운영 계약 정본: docs/reference/visual-reconciliation.md. 검사: npm run workflow:visual-consistency (warning-first).

  경계 (반드시 지킨다):
  - route/screen identity 의 단일 출처가 아니다 — canonical Screen ID 는 ScreenSpec/screen-identity 소관.
    여기 Member Screens 는 기존 screen_id 를 **참조**만 한다 (발명 금지).
  - behavior 를 확정하지 않는다 — 상태/인터랙션/라우팅/카피 semantics 는 ScreenSpec / Navigation Map /
    Open Decision 경로가 정본이다. 이 문서는 "누가 무엇을 시각적으로 소유하나"만 적는다.
  - component 존재/props 는 component catalog 가 정본이다. 카탈로그에 없는 shared component 는
    여기 적기 전에 component-gap-register 에 G-xxx 로 **제안만** 한다 (accept·구현은 사람).
  - 결정 상태 저장소가 아니다 — 결정 내용은 Open Decisions 가 정본이고, 여기는 decision_id/reference 만 남긴다.
  - Visual Exceptions 는 silent pass 가 아니다 — Reason 과 Decision ID 없는 예외 행은 검사가 경고한다.
  - 표 헤더는 바꾸지 않는다 (visual-consistency.mjs 가 헤더로 표를 파싱한다).
-->

# Visual Consistency Contract

## Purpose

이 문서는 route/screen identity 의 단일 출처가 아니다.
ScreenSpec, figma-component-mapping, component catalog, Open Decisions 를 참조해
여러 화면의 공통 visual/layout/component ownership 을 정리한다.

## Screen Families

| Family | Member Screens | Layout/Shell Owner | Logo Policy | Header Policy | CTA Policy | Copy Source | Status | Evidence |
|---|---|---|---|---|---|---|---|---|
| {family} | {SCREEN-001}, {SCREEN-002} | {ShellComponent} | shell-owned | shell-owned | {shared-bottom-cta} | Copy Keys/i18n | draft | {IN-...} |

## Shared Component Rules

| Component | Owned By | Applies To Families | Direct Screen Import | Positioning Owner | Catalog Status | Notes |
|---|---|---|---|---|---|---|
| {BrandLogo} | {ShellComponent} | {family} | forbidden | shell | cataloged | {no per-screen margin} |

<!-- Direct Screen Import: forbidden = screen file 이 직접 import 금지(shell 이 렌더) / allowed = 화면 직접 사용 허용.
     Catalog Status 는 참고 표기일 뿐 — 존재 정본은 design/component-catalog.md 이고 검사가 대조한다. -->

## Visual Exceptions

| Screen ID | Exception | Reason | Decision ID | Status |
|---|---|---|---|---|
| {SCREEN-999} | {custom logo placement} | {marketing landing hero} | {D-123} | draft |

## Open Items

| ID | Question | Blocks | Owner | Status |
|---|---|---|---|---|
| VC-001 | {question} | {final-fixture-ui 또는 -} | {Design/PM} | open |

<!-- Open Items 는 이 계약의 미해결 항목 인덱스다. 구현을 실제로 막아야 하면 대상 ScreenSpec 의
     Open Decisions 에 D-xxx 를 올린다 (게이트는 Open Decision 만 건다 — 여기 행은 게이트가 아니다). -->
