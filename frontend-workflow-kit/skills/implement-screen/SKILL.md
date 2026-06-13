---
name: implement-screen
description: 지정된 Screen ID를 readiness gate가 허용하는 모드 범위에서 구현한다. 사용자가 "화면 구현", "implement screen", "이 화면 만들어줘" 등을 요청할 때 사용. readiness 출력의 allowed_paths 안에서만 수정하고, 판정은 직접 하지 않고 스크립트 출력을 소비한다.
---

# implement-screen

화면 하나를 readiness gate가 허용하는 모드 범위에서만 구현한다.
**구현 가능 여부를 직접 판단하지 않는다** — `readiness.mjs` 출력을 그대로 따른다 (판정 로직 단일 출처).

## 입력
- 대상 Screen ID (예: `COUPON-001`). 없으면 사용자에게 묻는다.

## 절차

1. **상태 집계**: `npm run workflow:state` 를 실행한다.
   (`_meta/workflow-state.yaml` / `screen-inventory.yaml` 갱신)

2. **readiness 확인**: `npm run workflow:readiness -- --screen <ID> --json` 을 실행해 다음을 읽는다.
   - `readiness_mode` — 현재 허용되는 최고 모드
   - `allowed_paths` / `forbidden_paths` — 수정 가능/금지 경로
   - `blocking` / `next_actions` — 진행을 막는 조건과 해소 액션

3. **게이트 판정**:
   - `readiness_mode` 가 UI 구현을 허용하지 않으면(`docs-only` / `route-skeleton` 등) **구현하지 말고**
     `blocking` 과 `next_actions` 를 사용자에게 보고하고 멈춘다.
   - 막힌 항목(미확정 API, figma mapping 부재 등)은 추측해서 메우지 않는다. Unknowns/Conflicts로 남긴다.

4. **컨텍스트 로드** (이 화면 작업에 필요한 것만 — 다른 도메인 문서는 로드하지 않는다):
   - `docs/frontend-workflow/domains/{domain}/screens/{screen}/screen-spec.md`
   - `docs/frontend-workflow/domains/{domain}/domain-rules.md`, `flows.md` (있으면)
   - `docs/frontend-workflow/app/navigation-map.md`
   - `docs/frontend-workflow/design/component-catalog.md`, `component-guidelines.md`

5. **구현**: `allowed_paths` 에 매칭되는 파일만 수정한다.
   - `useXxx` fake hook 만 사용한다 (`AsyncState` 계약). `src/api` 등 forbidden 경로는 건드리지 않는다.
   - State Matrix 의 전 상태(loading/success/empty/error/refreshing)를 구현한다.
   - 문구는 Copy Keys 의 `confirmed` 값만 사용한다. `tbd` 는 키 이름 그대로 둔다.
   - Component Catalog 의 컴포넌트만 사용한다. 새 공통 컴포넌트는 만들지 말고 Gap Register에 제안만.
   - 모르는 디자인 값은 추측하지 말고 `TODO` 주석으로 남긴다.

6. **검증 보고**: `npm run workflow:validate` 를 실행하고 결과를 보고한다.
   실패 항목이 있으면 수정하거나, 사람 결정이 필요한 항목은 그대로 보고한다.

## 금지
- readiness가 허용하지 않는 모드의 작업.
- `forbidden_paths` 수정 (특히 fixture-ui 모드에서 `src/api/**`).
- API endpoint / 디자인 값 / 문구의 추측.
- 생성물(`_meta/*.yaml`, `component-catalog.md`) 직접 편집.
