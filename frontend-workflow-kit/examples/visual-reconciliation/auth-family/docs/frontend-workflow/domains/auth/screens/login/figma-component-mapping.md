---
artifact_id: "AUTH-001-figma-component-mapping"
artifact_type: figma-component-mapping
domain: "auth"
screen_id: "AUTH-001"
status: draft
sources:
  - { type: figma, ref: "figma://file/auth-visual-refresh/login" }
last_reviewed: "2026-07-06"
---

# Figma Component Mapping: 로그인

> IN-20260706-visual-spec-001 로 생성. 시각=Figma(이 문서), 동작=ScreenSpec(단일 출처).

## Frame
- figma://file/auth-visual-refresh/login

## Component Mapping
| Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고 |
|---|---|---|---|
| login / 1:10 | 상단 로고 | components/ui/BrandLogo | shell-owned — AuthShell 이 렌더 |

## Notes
- 로고 배치는 AuthShell 소유 (visual-consistency-contract 참조). 화면별 margin 금지.
