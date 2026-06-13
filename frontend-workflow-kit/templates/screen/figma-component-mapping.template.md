---
artifact_id: "{SCREEN_ID}-figma-component-mapping"
artifact_type: figma-component-mapping
domain: "{domain}"
screen_id: "{SCREEN_ID}"
status: draft             # 문서 라이프사이클: missing|draft|review|confirmed|implemented|verified|deprecated (confirmed 승격은 사람만)
sources:
  - { type: figma, ref: "{figma frame ref}" }   # 프레임 ref 의 단일 출처(메타). 비표준 figma_frame_ref 필드 금지 — ref 는 여기와 본문 Frame 절에만.
last_reviewed: "{YYYY-MM-DD}"
# status: confirmed 로 승격할 때만 사람이 추가 (LLM 승격 금지):
#   approved_by: {담당자}
#   approved_at: {YYYY-MM-DD}
#   decision_id: {D-000}      # decision-log.md 와 연결
#
# 이 status 는 readiness 의 figma_mapping_status fact 가 된다 —
# final-fixture-ui 게이트가 `figma_mapping_status >= draft` 로 읽는다 (policies/implementation-mode-policy.yaml).
---

<!--
  이 문서는 Figma 프레임/노드 → UI 요소 → 카탈로그 컴포넌트의 **시각 매핑**만 담는다.
  경계 (반드시 지킨다):
  - 비즈니스 동작(어떤 항목이 어느 탭/상태에 속하는지, 분류·정렬·노출 규칙 등)은 ScreenSpec 이 단일 출처다.
    여기엔 적지 않는다 — figma-component-mapping 은 "어떻게 보이는가"(시각)만, ScreenSpec 은 "무엇을 하는가"(동작).
  - 카탈로그에 없는 공통 컴포넌트가 필요하면 직접 만들지 말고 global/component-gap-register.md 에
    G-xxx 를 open 으로 **제안만** 한다 (accept·구현은 사람). 매핑 표 비고에 "(G-xxx, 카탈로그 미보유)" 로 표시.
  - 어떤 요소의 **존재 여부**가 open decision 에 달려 있으면 (예: 탭 분리가 D-xxx 에 달림) 비고/Notes 에 명시한다 —
    그 decision 이 닫히기 전엔 이 매핑은 후보 시각안이다.
  - 비표준 frontmatter 필드(예: figma_frame_ref)를 추가하지 않는다. 프레임 ref 는 frontmatter `sources` 와 아래 Frame 절에 둔다.
  - 표 헤더는 바꾸지 않는다.
-->

# Figma Component Mapping: {화면 이름}

> {input_id} 로 생성/갱신. 시각은 Figma, 비즈니스 동작은 ScreenSpec(단일 출처).

## Frame
- {figma frame ref}   <!-- frontmatter sources 의 ref 와 동일. 화면 대표 프레임. 여러 프레임이면 줄을 추가. -->

## Component Mapping
| Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고 |
|---|---|---|---|
| {frame} / {Node} | {UI 요소} | {features/{domain}/components/Xxx 또는 components/ui/Xxx} | {예: 카탈로그 미보유면 (G-xxx)} |

## Notes
- {시각 매핑 보충 메모. 비즈니스 분류·동작은 적지 않는다 — ScreenSpec 의 State/Interaction Matrix 가 단일 출처.}
- {카탈로그에 없는 컴포넌트는 G-xxx(component-gap-register, open)로 제안됨을 명시. accept 전까지 구현 금지.}
- {어떤 요소의 존재가 open decision(D-xxx)에 달려 있으면 여기 명시 — 닫히기 전엔 후보 시각안.}
