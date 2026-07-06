# Visual Contract Bootstrap / Adoption — design note

> 작성일: 2026-07-06 · 상태: implemented-with-this-PR (구현 1차 기록)
> 선행: PR #144 `visual-reconciliation-consistency` (contract + `workflow:visual-consistency` + `visual-reconcile`)
> 범위: `frontend-workflow-kit` 자체 업그레이드. consumer app repo 를 직접 고치지 않는다.

## PR144 이후 남은 adoption 문제

PR144 는 visual-consistency-contract 와 warning-first checker 를 제공하지만,
brownfield consumer repo 의 **도입 첫 걸음**이 비어 있다.

- contract 를 처음부터 사람이 수동 작성해야 한다 — 어떤 screen family 부터 만들면
  효과가 큰지 알기 어렵다.
- 기존 ScreenSpec frontmatter · figma-component-mapping · component catalog ·
  screen_entry 소스에 family/shared-ownership 후보의 **증거가 이미 있는데** 그걸
  모아 주는 도구가 없다.
- `workflow:visual-consistency` 는 contract 부재 시 quiet skip 이라 cold start 는
  안전하지만, 도입을 적극적으로 돕지는 못한다 (skip 은 안내가 아니다).
- `visual-reconcile` 스킬은 contract 가 이미 있거나 사람이 쓸 수 있다는 전제에 가깝다.
- 사내 dogfood 흐름은 "후보 draft 를 만들고 → 사람이 확인/수정 → 승인된 행만 반영"이다.

## 해법 — bootstrap 은 draft 를 만들고, 사람이 contract 를 만든다

`workflow:visual-contract-bootstrap` (+ `visual-contract-bootstrap` 스킬):
consumer repo 의 docs/src 를 **읽기만** 하고, screen family 후보 · shared
shell/logo/header/CTA ownership 후보 · figma mapping coverage · component gap
후보 · suggested contract rows 를 **review-only draft** 로 낸다.

- 새 workflow axis/stage 아님 — Stage 05(authoring) 앞의 도입 보조 도구이며,
  adoption-probe/policy-draft 와 같은 draft-only 진단 계열이다.
- 출력은 deterministic JSON/Markdown (정렬 고정, 타임스탬프 없음).
- inference 는 완벽한 자동 추론이 아니라 **안전한 후보 제안**이 목표다 — 반복
  import 는 design intent 의 증거 후보일 뿐 proof 가 아니며, 확신이 낮으면
  `needs-human-review` 로 낸다.

## 왜 draft/review-only 인가

- family/owner 추론은 이름·경로·import 휴리스틱이다. repo 별 구조 차이로 오탐이
  있는 신호를 그대로 contract 에 넣으면 contract 신뢰가 무너진다.
- visual consistency contract 는 여전히 behavior/route/identity 의 단일 출처가
  아니다 (PR144 경계 그대로). bootstrap 이 그 경계를 넘는 순간 — 예: 반복 import 를
  근거로 `Direct Screen Import: forbidden` 을 확정 — 게이트 없는 진단이 사실상
  결정이 된다. 그래서 suggested rows 의 rule 컬럼은 `needs-review` 로만 낸다.
- confirmed 승격 · Open Decision resolve · Component Gap accept 는 사람-전용
  불변식(roadmap-current) 그대로다.

## bootstrap output ↔ canonical contract 관계

- bootstrap output 은 **canonical contract 가 아니다**. `.draft.md` 또는 report 로만
  존재하고, 사람이 리뷰해 accepted rows 만 canonical
  `design/visual-consistency-contract.md` 에 반영한다.
- **기존 contract overwrite 금지**: canonical contract 가 존재하면 읽어서 existing
  rows 와 suggested additions 를 분리해 제안만 한다. `--out` 이 canonical 경로를
  가리키고 파일이 존재하면 error 로 거부하고 draft 경로를 제안한다.
- canonical 경로 scaffold 는 파일이 **없을 때만**, `status: draft` frontmatter +
  review-only 주석이 있는 형태로만 허용한다 (cold start 편의).
- catalog 에 없는 component 는 Component Gap **후보**로만 표시한다 — G-xxx 제안/
  accept 는 기존 component-gap-register 경로 그대로.

## warning-first 유지

- CLI 기본 exit 0. 구조 오류(docs 부재 · 기존 contract malformed · canonical
  overwrite 시도)만 exit 1. `--apply`/`--overwrite`/`--enforce` 는 만들지 않는다.
- CI/required check/hard gate 배선 없음. validate/readiness 미결합.

## dogfood telemetry 이후 hardening 후보 (이번 PR 아님)

- family/owner 휴리스틱 정밀화 (import graph 실해석, shell 사용부 위치 분석).
- copy drift 후보 정밀화 (string prop · i18n 화이트리스트 — PR144 TODO 공유).
- suggested rows 를 반영하는 보조 편집 커맨드(`--apply` 류) 도입 여부 — 별도
  Open Decision 으로만.
- bootstrap 결과의 CI warning-only smoke 배선 여부 — 별도 Open Decision 으로만.

## 이번 PR 에서 하지 않는 것

- consumer app repo 업데이트, Figma raw API adapter.
- 기존 canonical contract 자동 수정/overwrite, inferred rows 자동 적용.
- candidate family/owner 의 confirmed 표기, Open Decision resolve, Unknown close,
  Component Gap accept, Copy Key/contract status confirmed 승격.
- 새 workflow axis/stage, gate 화, CI required check, visual regression baseline.
- component catalog silent edit (catalog 는 `workflow:catalog` 생성물 그대로).

## 정본 위치

- 운영 계약: `frontend-workflow-kit/docs/reference/visual-reconciliation.md` §Bootstrap / adoption
- CLI: `frontend-workflow-kit/scripts/visual-contract-bootstrap.mjs` (+ lib/test)
- 스킬: `frontend-workflow-kit/skills/visual-contract-bootstrap/SKILL.md`
- 픽스처: `frontend-workflow-kit/examples/visual-contract-bootstrap/auth-family/`
