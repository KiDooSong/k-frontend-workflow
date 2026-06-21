---
artifact_id: llm-rules
artifact_type: llm-rules
status: draft
last_reviewed: 2026-06-21
---

# Frontend AI Rules

## 판단 금지 (문서 기반으로만)
- API endpoint, request, response 는 추측하지 않는다.
- 화면 구현 전 해당 화면의 ScreenSpec 을 먼저 읽는다.
- 게이트를 푸는 전이는 사람만 한다.

## 참조 경로
- 화면 계약: docs/frontend-workflow/domains/{domain}/screens/{screen}/screen-spec.md
- 네비게이션: docs/frontend-workflow/app/navigation-map.md

## 구현 범위
- 구현 전 `npm run workflow:state` → `npm run workflow:readiness` 로 readiness_mode 를 확인한다.
- readiness 출력의 allowed_paths 안에서만 수정한다.
