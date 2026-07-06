# Visual Reconciliation / Consistency — design note

> 작성일: 2026-07-06 · 상태: implemented-with-this-PR (구현 1차 기록)
> 범위: `frontend-workflow-kit` 자체 업그레이드. consumer app repo 를 직접 고치지 않는다.

## 문제 (사내 dogfood 에서 관측)

킷을 사내 프론트 repo 에 도입한 뒤, 기획/visual spec/Figma/QA 입력이 여러 화면에 걸쳐
자주 갱신된다. LLM 이 Open Decision 을 모아 사람 결정을 받고 여러 화면에 일괄 반영하면,
그 다음 visual update / implement 단계에서 **화면 간 정합성**이 반복적으로 깨졌다.

- 공통 로고 위치가 화면마다 달라진다 (screen file 별 ad-hoc margin/absolute).
- 일부 화면만 새 레이아웃, 일부는 구버전 잔존.
- shell/header/logo/CTA ownership 이 화면별 임시 구현으로 흩어진다.
- figma-component-mapping ↔ ScreenSpec ↔ component catalog ↔ copy ↔ 구현 코드 사이 drift.
- batch update 후 사람이 화면별 눈검수를 다시 해야 한다.

기존 표면의 공백: `figma-component-mapping` 은 **화면 단위** 시각 매핑이고, e2e visual
capture 는 **한 화면** 관찰 증거다. "여러 화면이 공유하는 visual contract" 를 적는 곳과,
그 contract 대비 drift 를 warning-first 로 훑는 도구가 없었다.

## 해법 — 기존 spine 에 흡수 (새 축 아님)

Input Skill → Reconciliation → Documents → State → Readiness → Work → Validate
루프 안에 세 조각을 추가한다. artifact axes 는 닫혀 있으므로(roadmap-current) 새 축을
만들지 않는다 — visual contract 는 **저작 문서 축**(design scope, component-catalog 형제)의
문서 하나이고, 검사는 route-cross-check/doc-drift 와 같은 **standalone warning-first 진단**
계열이다.

1. **`visual-consistency-contract`** (authoring, `docs/frontend-workflow/design/`):
   screen family / shared shell·logo·header·CTA ownership / 예외를 참조 중심으로 문서화.
   route·screen identity·behavior 의 단일 출처가 아니다 — ScreenSpec·figma-component-mapping·
   component catalog·Open Decisions 를 **참조하는 정합성 계약**이다.
2. **`workflow:visual-consistency`** CLI: contract ↔ ScreenSpec ↔ figma mapping ↔
   component catalog ↔ (선택) screen_entry 소스를 대조해 drift 후보를 warning 으로 낸다.
   `--json` 결정적 출력, contract 부재 시 조용히 skip (cold start 를 막지 않음).
3. **`visual-reconcile` skill**: 여러 화면에 걸친 visual/Figma 입력을 Stage 03/04 계약
   (canonical input artifact + register-first) 위에서 분류하고, shared ownership 변경을
   screen file patch 가 아니라 contract/Component Gap/Open Decision 으로 올린 뒤,
   구현은 implement-screen(readiness allowed_paths) 로 넘긴다.

## warning-first 로 시작하는 이유

- 검사 6종(직접 import·ad-hoc positioning·copy hardcode 등)은 repo 별 스타일(Tailwind/
  StyleSheet/inline) 차이로 휴리스틱이다. 오탐이 있는 신호를 hard gate 로 올리면 게이트
  신뢰가 무너진다 — lint-baseline/route-cross-check/doc-drift 와 같은 선례를 따른다.
- hard gate / CI required check / `--enforce` CI 배선 승격은 이번 범위가 아니다.
  dogfood telemetry(warning 빈도·오탐율) 수집 후 **별도 Open Decision** 으로만 검토한다.
  후보 결정: (a) `screen-not-found`/`exception-hygiene` 의 `--enforce` 기본화 여부,
  (b) validate 검사 편입 여부, (c) CI warning-only smoke 배선 여부.

## 경계 (기존 불변식 유지)

- visual/Figma 는 behavior 의 단일 출처가 아니다. behavior 는 ScreenSpec / Navigation Map /
  Open Decision 경로 그대로 (input-reconciliation §Visual/Figma 분리 보존).
- 카탈로그에 없는 shared component 는 Component Gap **제안만** — accept/구현은 사람.
- Open Decision resolve · Unknown close · Gap accept · confirmed 승격은 사람만.
  contract 의 `status: confirmed` 승격도 사람만.
- e2e visual capture 와의 관계: capture candidate 가 contract 를 **참조할 수 있는**
  advisory Stage 08 evidence 로 남는다. screenshot 은 approval/gate/readiness/confirmed
  승격이 아니다 (e2e-visual-capture.md 불변식 그대로).
- readiness `allowed_paths`/`forbidden_paths` 가 구현의 최종 경계다. visual-reconcile 은
  implement-screen 을 우회하지 않는다.
- 의존성 추가 없음 (Node 내장 + 기존 `yaml`). 파서는 `scripts/lib/spec.mjs` 재사용.

## 정본 위치

- 운영 계약: `frontend-workflow-kit/docs/reference/visual-reconciliation.md`
- 템플릿: `frontend-workflow-kit/templates/design/visual-consistency-contract.template.md`
- 검사: `frontend-workflow-kit/scripts/visual-consistency.mjs` (+ lib/test)
- 스킬: `frontend-workflow-kit/skills/visual-reconcile/SKILL.md`
- 픽스처: `frontend-workflow-kit/examples/visual-reconciliation/auth-family/`
