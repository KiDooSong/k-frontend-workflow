---
artifact_id: llm-rules
artifact_type: llm-rules
status: draft
last_reviewed: {YYYY-MM-DD}
---

<!--
  레포 루트 CLAUDE.md(또는 AGENTS.md)가 이 파일을 참조한다.
  여기에는 "린트로 강제할 수 없는 규칙만" 남긴다. 규칙 파일이 길수록 LLM 준수율은 떨어진다.
  fetch 직접 금지 / 임의 색상 금지 / Pressable 금지 같은 항목은 0단계 린트가 강제하므로 여기 두지 않는다.
-->

# Frontend AI Rules

## 판단 금지 (문서 기반으로만)
- API endpoint, request, response 는 추측하지 않는다. 확정 정보가 없으면 candidate/unknown 으로 표시하고 구현하지 않는다.
- 화면 구현 전 해당 화면의 ScreenSpec 을 먼저 읽는다.
- 디자인 값을 추측하지 않는다. 모르면 TODO 주석으로 남긴다.
- 새 공통 컴포넌트가 필요하면 구현하지 말고 Component Gap Register(global/component-gap-register.md)에 제안만 남긴다.
- 모르는 내용(사실 확인)은 해당 ScreenSpec 의 Unknowns 섹션에 남긴다.
- 입력만으로 정해지지 않고 산출물 형태를 바꾸는 선택(정책/UX/API 방향)은 임의로 고르지 않는다. 해당 ScreenSpec 의 Open Decisions 섹션에 `open` 행으로 남기고(Blocking Mode 는 보수적으로 — 애매하면 한 단계 낮게), 그 모드 미만까지만 구현하고 멈춘다.
- 게이트를 푸는 전이는 사람만 한다. Open Decision 을 `resolved` 로 닫거나 status 를 confirmed 로 승격하는 것은 사람 몫이다. LLM 은 blocker 를 올리기만(open 행 추가) 하고, 어떤 게이트도 스스로 내리지 않는다.

## 충돌 시 우선순위
- 비즈니스 동작: ScreenSpec(기획) 우선
- 시각 디자인: 최종 Figma 우선
- 데이터 계약: OpenAPI / API Manifest 우선
- 라우팅 구조: Navigation Map 우선
- 컴포넌트 사용: Component Catalog 우선
- 문구: Copy Keys confirmed 우선
- 충돌을 발견하면 임의 판단하지 말고 conflicts(global/conflicts.md)에 기록한다.

## 참조 경로
- 화면 계약: docs/frontend-workflow/domains/{domain}/screens/{screen}/screen-spec.md
- 컴포넌트 카탈로그: docs/frontend-workflow/design/component-catalog.md (자동 생성)
- API: openapi.yaml (확정분) / docs/frontend-workflow/api/api-manifest.md (미확정분)
- 네비게이션: docs/frontend-workflow/app/navigation-map.md (뼈대)
- 컴포넌트 갭(새 공통 컴포넌트 제안): docs/frontend-workflow/global/component-gap-register.md
- 충돌 기록: docs/frontend-workflow/global/conflicts.md

## 구현 범위
- 구현 전 `npm run workflow:state` → `npm run workflow:readiness` 로 화면의 readiness_mode 를 확인한다.
- readiness 출력의 allowed_paths 안에서만 수정한다. forbidden_paths 는 건드리지 않는다.
- 작업 후 `npm run workflow:validate` 를 실행한다.
