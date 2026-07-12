# frontend-workflow-kit

프론트엔드 작업을 LLM에게 맡길 때 문서, 결정, 경로 경계를 결정적 스크립트로 고정하는 워크플로우 킷이다. 기본 루프는 `workflow:state -> workflow:readiness -> workflow:validate`이며, 입력 생성과 reconciliation, route/screen/API 계약, Tier3 layer 선언, policy draft를 같은 문서 표면에서 다룬다.

## 보장 / 비보장

| 킷이 보장하는 것 | 사람이 결정하는 것 |
|---|---|
| `docs/frontend-workflow/`를 읽어 반복 가능한 state/readiness/validate 신호를 만든다. | 제품 의도, UX, copy, 엣지 케이스, Open Decision resolve, confirmed 승격. |
| 화면별 구현 가능 모드와 허용/금지 경로를 계산한다. | 계산 결과를 구현 승인이나 출시 승인으로 해석할지 여부. |
| 입력 artifact, Reconciliation Register, API manifest, route/screen separation 같은 구조 계약을 검사한다. | 충돌을 어떤 방향으로 해결할지, hard gate/CI 승격을 언제 할지. |

`readiness` 통과는 구현 가능 상한이고, `validate` 통과는 구조 무결성이다. 둘 다 설계 리뷰나 제품 승인을 대신하지 않는다.

## 지원 환경

`package.json` `engines`는 `node >=20`이다. 선언 범위는 아래 표의 CI 검증 범위와 함께 움직이며, 검증하지 않는 환경을 암묵적으로 약속하지 않는다(#160). 검증 job은 킷 개발 저장소의 `.github/workflows/frontend-workflow-kit.yml`에 있다.

| 환경 | 지원 수준 | CI 검증 |
|---|---|---|
| Linux(Ubuntu) + Node 20 | 지원 — `engines` 하한 | `validate-example` hard gate (validate 12종 + 멱등성 + `test:spec`) |
| Linux(Ubuntu) + Node 24 | 지원 — 대표 최신 LTS | `compat-smoke` (`test:spec` + `example:validate`) |
| macOS + Node 20 | 지원 — 경로/symlink focused | `macos-smoke` (#154 유형 symlink/realpath entry guard + packed-kit spawn + payload manifest e2e + `example:validate`) |
| Windows | **미지원(best-effort)** | 없음 — 개발 로컬에서 동작 확인되나(symlink 는 junction fallback) 계약이 아니다 |
| Node 20 미만 (18 포함) | 미지원 | 없음 — Node 18 은 2025-04 EOL, 이 저장소에 검증 이력 없음 |

smoke job 의 required check(branch protection) 승격은 별도 Open Decision 전까지 하지 않는다.

## Consumer Payload

소비 repo에는 `distribution-manifest.yaml` allowlist로 만든 packed payload만 vendoring한다. kit 개발 repo 전체를 복사하지 않는다.

```bash
cd frontend-workflow-kit
npm install
npm run kit:pack
```

생성된 `dist/frontend-workflow-kit/`를 소비 repo의 `tools/frontend-workflow/`로 vendor한다. 포함되는 기본 surface는 다음뿐이다.

- runtime/reference: `scripts/`, `catalog/`, `policies/`, `presets/`, `schemas/`, `docs/reference/`
- templates/skills: `templates/`, `skills/` (including `templates/repo/AGENTS.template.md`)
- package/docs: `package.json`, `package-lock.json`, `package-scripts.template.json`, `README.md`, `COMMANDS.md`, `CONVENTIONS.md`, `distribution-manifest.yaml`, `LICENSE`

`examples/`는 kit 테스트 fixture로 킷 repo에는 남지만 payload에서는 제외된다. 디자인 드래프트·roadmap/history·open decision·investigation·dogfood run-report 같은 개발 전용 문서는 킷 repo의 repo-root `kit-dev/`로 옮겼고 payload에는 포함되지 않는다. `docs/design/`·`docs/workflows/`·`temp/` exclude guard 등 payload 경계 메커니즘은 [CONVENTIONS.md](CONVENTIONS.md) §Payload Boundary가 정본이다.

## Install In A Consumer Repo

```bash
cd tools/frontend-workflow
npm install
```

소비 repo root `package.json`에 `tools/frontend-workflow/package-scripts.template.json`의 `scripts`를 병합한다. 기본 명령은 소비 repo root에서 실행한다.

```bash
npm run workflow:state
npm run workflow:readiness
npm run workflow:validate
npm run workflow:doctor
```

명령 전체 목록과 옵션은 [COMMANDS.md](COMMANDS.md)를 본다.

소비 repo root에는 짧은 agent guide를 둔다. `templates/repo/AGENTS.template.md`를 복사해 `AGENTS.md` 또는 `CLAUDE.md`로 사용하고, repo 고유 정책은 `docs/frontend-workflow/global/llm-rules.md`에 둔다.

```bash
cp tools/frontend-workflow/templates/repo/AGENTS.template.md AGENTS.md
mkdir -p docs/frontend-workflow/global
cp tools/frontend-workflow/templates/global/llm-rules.template.md docs/frontend-workflow/global/llm-rules.md
```

문서는 레이어로 쌓여 있고, 작업에 필요한 깊이까지만 내려가 읽는다(progressive disclosure). 어떤 사실이 어느 문서에 사는지의 지도는 [docs/reference/doc-ownership.md](docs/reference/doc-ownership.md) 다.

- root `AGENTS.md` / `CLAUDE.md`: LLM session starting point — workflow spine 으로 보낸다.
- [docs/reference/workflow-spine.md](docs/reference/workflow-spine.md): numbered workflow stage index ("지금 어느 stage 인가"). Agents start here; [docs/reference/workflow-stages/00-start-here.md](docs/reference/workflow-stages/00-start-here.md) routes a task to its current stage. Read only the matching stage doc.
- [docs/reference/workflow-stages/](docs/reference/workflow-stages/) `NN-*.md`: 현재 stage 의 운영 절차 (the middle layer).
- [docs/reference/task-artifact-matrix.md](docs/reference/task-artifact-matrix.md): task-to-artifact operational checklist (2차 산출물 lookup).
- [docs/reference/generated-files.md](docs/reference/generated-files.md): `generated/do_not_edit` regeneration authority.
- reference docs ([input-reconciliation.md](docs/reference/input-reconciliation.md), [screen-identity.md](docs/reference/screen-identity.md) 등): 상세 계약. 화면 코드 ↔ canonical Screen ID 매핑은 Screen Source Map.
- `docs/frontend-workflow/global/llm-rules.md`: project policy and priority rules.
- `skills/*/SKILL.md`: 위 문서를 링크하는 **compact task executor** — 규칙을 복제하지 않고 핵심 불변식만 인라인으로 둔다.

## Upgrade A Vendored Kit

새 kit 버전으로 올릴 때는 디렉터리를 통째로 덮어쓰거나 "PR N까지 적용"처럼 PR 번호로 추론하지 않는다. packed payload에 들어 있는 `.kit-payload-manifest.json`(파일별 sha256·classification)을 기준으로, manifest 기반 안전 업그레이드 도구가 로컬 수정·stale 파일·upstream 삭제 파일을 구분해 안전한 파일만 갱신한다.

먼저 업스트림에서 최신 payload를 만든다.

```bash
cd frontend-workflow-kit && npm run kit:pack
```

소비 repo에서 **새 payload의** planner를 dry-run으로 돌린다(기본이 dry-run, 무쓰기). planner는 교체 전 새 payload에서 실행하는 업그레이드 도구이며 `workflow:*` 명령으로 등록하지 않는다.

```bash
node /path/to/new/frontend-workflow-kit/scripts/upgrade-vendored-kit.mjs \
  --current tools/frontend-workflow \
  --next /path/to/new/frontend-workflow-kit \
  --dry-run --plan kit-upgrade-plan.md
```

plan을 검토(필요하면 LLM에게 리뷰)한 뒤 안전한 파일만 적용한다.

```bash
node /path/to/new/frontend-workflow-kit/scripts/upgrade-vendored-kit.mjs \
  --current tools/frontend-workflow \
  --next /path/to/new/frontend-workflow-kit \
  --apply
```

- 로컬 수정 파일은 기본적으로 절대 덮어쓰지 않는다. conflict는 `.upgrade-conflicts/<path>.incoming`으로 남겨 수동/LLM 병합한다.
- upstream에서 삭제된 파일은 기본 보존(orphan 보고)하며 `--prune`을 줄 때만 삭제한다.

옵션·분류 규칙은 [COMMANDS.md](COMMANDS.md)의 Upgrade 항목과 `--help`를 본다. 사람이 봐야 할 마이그레이션 노트는 [docs/reference/upgrade-notes.md](docs/reference/upgrade-notes.md)에 있고 plan에 함께 포함된다.

```bash
node tools/frontend-workflow/scripts/upgrade-vendored-kit.mjs --help
```

## Minimal Docs Bootstrap

소비 repo root 기준으로 최소 문서 트리를 만든다.

```txt
docs/frontend-workflow/
  app/navigation-map.md
  domains/{domain}/screens/{screen}/screen-spec.md
```

템플릿 출처:

- `tools/frontend-workflow/templates/app/navigation-map.template.md`
- `tools/frontend-workflow/templates/screen/screen-spec.template.md`
- 필요 시 `templates/repo/`, `templates/global/`, `templates/domain/`, `templates/api/`, `templates/meta/`, `templates/input/`

입력/reconcile flow를 쓰기 시작하면 `_meta/reconciliation-register.md`도 만든다.

```bash
mkdir -p docs/frontend-workflow/_meta
cp tools/frontend-workflow/templates/meta/reconciliation-register.template.md docs/frontend-workflow/_meta/reconciliation-register.md
```

register가 없으면 validate check 12는 의도적으로 NO-OP다. cold start와 점진 도입을 위한 동작이며, check 11은 `inputs/*.md` frontmatter를 계속 검사한다. register를 도입한 뒤부터 check 12가 8컬럼 구조와 input↔register 상태를 검사한다.

## Project Layout

Default `src/` root:

```bash
npm run workflow:state -- --docs docs/frontend-workflow --src src
npm run workflow:validate -- --docs docs/frontend-workflow --src src
```

기본 layer model과 다르면 `templates/adoption/project-layout.template.yaml`에서 시작해 `project-layout.yaml`을 만들고 `--layout project-layout.yaml`을 넘긴다. monorepo/custom root 변형과 layout profile 상세는 [CONVENTIONS.md](CONVENTIONS.md) §Project Layout Profiles, 플래그 의미는 [COMMANDS.md](COMMANDS.md)를 본다. route/screen/API/Tier3 관례도 CONVENTIONS.md를 본다.

## Input And Reconcile Flow

입력 원천별 parser/adapter는 소비 repo 책임이고, kit는 정규화된 payload를 canonical input artifact로 렌더링한다.

```txt
source-specific producer
-> normalized payload
-> workflow:create-input
-> docs/frontend-workflow/inputs/{input_id}.md
-> reconcile-input
-> workflow:state / workflow:readiness / workflow:validate
```

```bash
npm run workflow:create-input -- --docs docs/frontend-workflow --from-json input.json
```

`workflow:create-input`은 `inputs/{input_id}.md`만 만든다. Reconciliation Register 수정, confirmed 승격, acceptance, 구현 허가는 별도 단계다. register retry, check 12 severity, status 축 구분은 [docs/reference/input-reconciliation.md](docs/reference/input-reconciliation.md)가 정본이다.

빠른 참조 — check 12 severity: register 없음=NO-OP, row 없음·`not-started`=경고(`--enforce`에서 에러), `in-progress`·`failed`·enum 위반·duplicate Input ID·required column 누락=항상 에러, `reconciled`=Created Items에 open decision/gap/unknown이 있어도 통과.

## Screen Identity And New Screens

기획/디자인 입력의 source 화면 코드(planning `A-001`·design `J010`·Figma node id·slug)는 **alias** 이고 canonical Screen ID 가 아니다. canonical identity(`screen_id`/`route`/`domain`/ScreenSpec 경로)는 워크플로우가 소유하고, source ↔ canonical 매핑은 **Screen Source Map**(`docs/frontend-workflow/_meta/screen-source-map.md`) 한 곳에 둔다. 계약·예시는 [screen-identity.md](docs/reference/screen-identity.md).

식별이 확정되면 stub ScreenSpec 을 scaffold 한다(canonical id 발명·navigation-map 자동수정·confirmed 승격 없음).

```bash
npm run workflow:create-screen -- --docs docs/frontend-workflow --domain auth --screen-id AUTH-SIGNUP-EMAIL --route /signup/email --source-input IN-20260625-visual-spec-001
```

라우팅:

```txt
"새 화면이 생겼어"                 -> Screen Source Map 에 매핑 -> 확정되면 workflow:create-screen -> reconcile-input
"Figma 코드가 어느 ScreenSpec 에도 안 붙어" -> screen-source-map 후보 행 / scope-unclear (canonical id 발명 금지)
"같은 design 코드가 두 화면에 보여"   -> ambiguous/split 표기 -> 막으면 Open Decision (자동 선택 금지)
```

doctor 가 Screen Source Map 일관성을 warning-first 로 표면화한다(canonical 에 ScreenSpec 부재, route 불일치, split/ambiguous 없는 중복 alias, input `affected_screens` 의 raw alias). hard gate 가 아니다.

## Implement Screen Flow

화면 구현은 `skills/implement-screen/SKILL.md` 절차를 따른다.

```bash
npm run workflow:state
npm run workflow:readiness -- --screen <SCREEN_ID> --json
npm run workflow:validate
```

관련 입력이 `not-started`, `in-progress`, `failed` 상태면 구현 전에 reconcile을 끝내거나 같은 row로 재개한다. 구현은 readiness가 허용한 파일에만 하며, generated files, Open Decision resolve, Unknown close, Component Gap accept, live policy replacement는 사람이 명시하지 않으면 하지 않는다. 작업 중 어떤 artifact를 함께 갱신해야 할지 애매하면 [docs/reference/task-artifact-matrix.md](docs/reference/task-artifact-matrix.md)를 확인한다.

## Multi-Screen Visual Reconciliation

여러 화면에 걸친 Figma/visual spec/design 업데이트("로고/레이아웃 공통 정리", "Figma 일괄 반영")는 `skills/visual-reconcile/SKILL.md` 절차를 따른다. 공통 shell/logo/header/CTA ownership 은 화면별 ad-hoc patch 가 아니라 visual consistency contract(`docs/frontend-workflow/design/visual-consistency-contract.md`, 템플릿: `templates/design/visual-consistency-contract.template.md`)로 정리하고, 구현 후 warning-first 검사를 돌린다.

contract 가 아직 없는(또는 빈약한) repo 는 **optional first step** 으로 bootstrap 을 먼저 돌려 screen family / shared ownership 후보 초안을 뽑을 수 있다(`skills/visual-contract-bootstrap/SKILL.md`). 출력은 review-only draft 다 — 기존 contract 를 절대 overwrite 하지 않고, 사람이 승인한 rows 만 canonical contract 에 반영한다.

```bash
npm run workflow:visual-contract-bootstrap -- --docs docs/frontend-workflow --src src --json   # optional first step
npm run workflow:visual-consistency -- --docs docs/frontend-workflow --src src --json
```

contract 가 없으면 visual-consistency 는 조용히 skip 한다(cold start 를 막지 않음). warning 은 drift 후보 진단일 뿐 approval, readiness promotion, `confirmed` 승격, gate 가 아니다. behavior 는 여전히 ScreenSpec/Navigation Map/Open Decision 경로만 탄다. 계약 정본: [docs/reference/visual-reconciliation.md](docs/reference/visual-reconciliation.md).

brownfield repo 전체 도입 진단과 함께 보려면 `workflow:adoption-probe -- --visual` 로 위 두 명령의 observation 을 probe scratch copy 에서 한 번에 관측할 수 있다 — bootstrap draft/관측 파일은 probe run dir 에만 남고, adoption report 에 요약 섹션이 추가된다. `--help`·strict flag 문법·existing-directory `--repo` 계약은 [COMMANDS.md](COMMANDS.md) §Adoption Probe 가 정본이다(마찬가지로 draft-only·not a gate).

현재 checkout 의 docs/src 를 기존 core telemetry 와 함께 관측하려면 `npm run workflow:telemetry -- --include visual --json` 으로 두 visual CLI 를 opt-in surface 로 추가할 수 있다 — 기본 telemetry surface set 은 그대로이고, visual warning 은 observation 일 뿐 gate 가 아니다. Telemetry의 strict option 문법(`--out` 오타 fail-closed 포함), exit 2, help/list 무부작용 계약은 [COMMANDS.md](COMMANDS.md) §Generated Views 가 정본이다.

## Optional Web E2E Evidence

웹 E2E 계획/생성/검증/수리가 필요하면 `skills/e2e-agent/SKILL.md`를 사용한다.

```txt
"이 화면 e2e 계획 짜줘"        -> e2e-agent plan (Stage 05 beside)
"Playwright 테스트 생성해줘"   -> e2e-agent generate (Stage 06 boundaries)
"웹 검증 돌려줘"               -> e2e-agent verify (Stage 08 evidence)
"이 실패한 e2e 고쳐줘"         -> e2e-agent heal (failure evidence required)
```

이 흐름은 선택형 evidence다. `tests/web-plans/**`와 `tests/web/**`는 ScreenSpec이나 readiness gate가 아니며, green test가 Open Decision resolve, `confirmed` 승격, 제품 승인, CI hard gate를 뜻하지 않는다. 결과는 Stage 08 handoff, run report, 또는 소비 repo가 정의한 verification note에 링크/요약한다.

소비 repo에 실제 적용할 때의 install·commit·ignore·run 순서와 채택 체크리스트는 [docs/reference/e2e-consumer-adoption.md](docs/reference/e2e-consumer-adoption.md)를 본다. setup/path/session 정본([e2e-playwright-agents.md](docs/reference/e2e-playwright-agents.md))과 behavioral rules([e2e-behavioral-rules.md](docs/reference/e2e-behavioral-rules.md))를 대체하지 않고 consumer 절차로 묶는 문서다.

## Tier3 And Policy Drafts

Tier3/custom layer는 readiness 코드를 바꾸지 않고 `project-layout.yaml`로 선언한다(layer/선언 상세는 [CONVENTIONS.md](CONVENTIONS.md) §Tier3). `workflow:doctor`로 layout을 확인하고, policy 변경은 live policy 교체가 아니라 draft/review artifact로 다룬다.

```bash
npm run workflow:policy-draft -- --out docs/frontend-workflow/_meta/policy-drafts
```

policy draft나 migration guide가 만들어져도 hard gate, CI required check, pre-edit hook 승격은 별도 사람 결정이다.

## Troubleshooting

- `validate`가 navigation-map 의존성으로 실패하면 `app/navigation-map.md`를 먼저 만든다.
- `rough-fixture-ui` 이상으로 올라가지 않으면 screen hook/source path와 `--src`/`--layout`을 확인한다.
- monorepo에서 파일을 못 찾으면 모든 workflow 명령에 같은 `--root`, `--src`, `--docs`, `--layout` 값을 넘긴다.
- check 12가 row 없음으로 경고/에러를 보고하면 Reconciliation Register에 해당 `input_id` row를 먼저 만들고 `in-progress`로 시작한다.
- check 12가 기존 row의 `not-started`/`in-progress`/`failed` 상태를 보고하면 새 row를 만들지 말고 같은 row를 재개하며, severity 규칙은 [input-reconciliation.md](docs/reference/input-reconciliation.md)를 본다.
- 생성 파일이 stale 해 보이면 직접 수정하지 말고 [docs/reference/generated-files.md](docs/reference/generated-files.md)의 명령으로 재생성한다. `workflow:check-generated`는 advisory guard이며 hard CI gate가 아니다.
- 기존에 전체 kit 디렉토리를 복사했다면 디렉터리를 덮어쓰지 말고 `scripts/upgrade-vendored-kit.mjs`로 보수적 plan을 만든 뒤 안전한 파일만 적용하고(위 "Upgrade A Vendored Kit"), `examples/`, `temp/`, design/history/roadmap/run-report 문서를 소비 repo에서 제거한다.
