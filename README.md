# k-frontend-workflow

LLM이 프론트엔드 프로젝트를 환각 없이 진행하게 만드는 워크플로우 킷(**frontend-workflow-kit**)을 개발·배포하는 저장소다 — 문서·결정·경로 경계를 결정적 스크립트(state → readiness → validate)로 고정하고, 그 위에 입력 reconciliation, 생성 뷰, warning-first 관측 계층을 얹는다.

## 이 저장소 vs consumer payload

이 저장소는 **킷 개발 저장소**다. 소비(consumer) 프로젝트에는 이 저장소 전체가 아니라, [`frontend-workflow-kit/distribution-manifest.yaml`](frontend-workflow-kit/distribution-manifest.yaml) allowlist로 packed 한 **payload만** `tools/frontend-workflow/` 로 vendoring 한다.

| | 킷 개발 저장소 (여기) | consumer payload |
|---|---|---|
| 위치 | 저장소 전체 | `npm run kit:pack` 산출물 `dist/frontend-workflow-kit/` |
| 포함 | 킷 소스 + 테스트 fixture(`examples/`) + 개발 문서(`kit-dev/`, `docs/`, `temp/`) | runtime `scripts/` · `catalog/` · `policies/` · `schemas/` · `templates/` · `skills/` · reference docs |
| 사용법 정본 | 이 README + [kit-dev/roadmap-current.md](kit-dev/roadmap-current.md) | [frontend-workflow-kit/README.md](frontend-workflow-kit/README.md) |

consumer 설치·업그레이드 절차는 [frontend-workflow-kit/README.md](frontend-workflow-kit/README.md)가 정본이다. 킷 개발 명령(테스트·pack)과 consumer 명령(`workflow:*`)을 혼동하지 않는다.

## 현재 릴리스 / 상태

- **release baseline: `0.3.0-mvp.1`** (2026-07-11) — MVP 기능 범위 동결. 상세는 [kit-dev/CHANGELOG.md](kit-dev/CHANGELOG.md).
- **지원 환경(Node/플랫폼) 계약**: [frontend-workflow-kit/README.md](frontend-workflow-kit/README.md) §지원 환경이 정본 — `engines: node >=20`, CI([frontend-workflow-kit.yml](.github/workflows/frontend-workflow-kit.yml))의 hard gate(Ubuntu + Node 20) + smoke(Ubuntu + Node 24, macOS + Node 20)가 검증한다. Windows 는 명시적 best-effort(미지원).
- 구현 상태·티어 경계·게이트 인벤토리의 **source of truth**: [kit-dev/roadmap-current.md](kit-dev/roadmap-current.md).
- MVP 종료 절차는 tracker 이슈 #167 로 추적한다. 루트의 `IMPLEMENTING.md` 는 **MVP-A historical build note** 이며 진입점이 아니다.

## 빠른 검증

```bash
cd frontend-workflow-kit
npm ci
npm test                     # golden fixture 하니스 + 전체 unit/spec 테스트
npm run example:validate     # golden example 대상 validate (하드 게이트)
npm run kit:pack             # consumer payload 생성 (dist/frontend-workflow-kit/)
```

## Hard gate vs warning-first

킷의 도구는 두 부류로 엄격히 나뉜다 — 경계의 정본은 [kit-dev/CHANGELOG.md](kit-dev/CHANGELOG.md) `0.3.0-mvp.1` release note 와 [kit-dev/roadmap-current.md](kit-dev/roadmap-current.md) 게이트 인벤토리다.

- **Hard gate (exit 0/1 — 빌드를 깬다)**: `workflow:validate` 구조 검사, readiness `decision_cap`(열린 Open Decision), CI 멱등성 게이트. (별도 공통 계약: 모든 CLI 의 usage/input error 는 exit 2 — warning-first 도구 포함.)
- **Warning-first / observation·review-only (기본 exit 0)**: `forbidden-paths` backstop(`--enforce` opt-in), golden fixture CI step, `route-cross-check`, `doc-drift`, `eval`, `telemetry`, `redteam`, `visual-consistency`, `visual-contract-bootstrap`, `adoption-probe`, `policy-draft`. 이들의 hard gate 승격은 자동으로 일어나지 않으며 **별도 Open Decision + 사람 결정**으로만 한다.

Open Decision resolve·`confirmed` 승격·conflict close 는 사람 전용이다 — LLM/도구가 게이트를 내리지 못한다.

## 문서 지도

- [frontend-workflow-kit/README.md](frontend-workflow-kit/README.md) — consumer 설치·명령·업그레이드 (payload 에 포함)
- [kit-dev/roadmap-current.md](kit-dev/roadmap-current.md) — 구현 상태·티어·게이트 인벤토리 정본
- [kit-dev/CHANGELOG.md](kit-dev/CHANGELOG.md) — 릴리스 이력·release note
- [frontend-workflow-kit/docs/reference/doc-ownership.md](frontend-workflow-kit/docs/reference/doc-ownership.md) — "one fact, one home" 문서 소유권 지도
- [frontend-workflow-kit/COMMANDS.md](frontend-workflow-kit/COMMANDS.md) — 명령 문법 정본
- `docs/research/` — 리서치 evidence (게이트 아님) · `archive/` — 과거 설계 버전

## 보안 원칙

- **비밀(secret)·자격증명을 커밋하지 않는다** — API 키, 토큰, `.env` 값 등.
- **사내 Figma 원본·내부 기획 원문을 커밋하지 않는다** — 워크플로우 입력은 정규화된 input artifact(요약·매핑)로만 들어오며, raw export 는 저장소 밖에 둔다.
- packed payload 경계(`distribution-manifest.yaml` allowlist + exclude guard)가 개발 전용 문서·fixture 가 consumer 로 새는 것을 막는다 — 경계 정본은 [frontend-workflow-kit/CONVENTIONS.md](frontend-workflow-kit/CONVENTIONS.md) §Payload Boundary.
