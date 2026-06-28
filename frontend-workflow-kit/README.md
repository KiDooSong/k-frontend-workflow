# frontend-workflow-kit

프론트엔드 작업을 LLM에게 맡길 때 문서, 결정, 경로 경계를 결정적 스크립트로 고정하는 워크플로우 킷이다. 기본 루프는 `workflow:state -> workflow:readiness -> workflow:validate`이며, 입력 생성과 reconciliation, route/screen/API 계약, Tier3 layer 선언, policy draft를 같은 문서 표면에서 다룬다.

## 보장 / 비보장

| 킷이 보장하는 것 | 사람이 결정하는 것 |
|---|---|
| `docs/frontend-workflow/`를 읽어 반복 가능한 state/readiness/validate 신호를 만든다. | 제품 의도, UX, copy, 엣지 케이스, Open Decision resolve, confirmed 승격. |
| 화면별 구현 가능 모드와 허용/금지 경로를 계산한다. | 계산 결과를 구현 승인이나 출시 승인으로 해석할지 여부. |
| 입력 artifact, Reconciliation Register, API manifest, route/screen separation 같은 구조 계약을 검사한다. | 충돌을 어떤 방향으로 해결할지, hard gate/CI 승격을 언제 할지. |

`readiness` 통과는 구현 가능 상한이고, `validate` 통과는 구조 무결성이다. 둘 다 설계 리뷰나 제품 승인을 대신하지 않는다.

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

`examples/`는 kit 테스트 fixture로 킷 repo에는 남지만 payload에서는 제외된다. 디자인 드래프트·워크플로우 진화 노트·roadmap/history·open decision·investigation·dogfood run-report 같은 개발 전용 문서는 더 이상 킷 트리 안에 두지 않는다 — kit repo의 repo-root `kit-dev/`로 옮겼고 payload에는 절대 포함되지 않는다. manifest는 `docs/design/`·`docs/workflows/`·`temp/`를 exclude guard로 유지해, 그런 디렉터리가 다시 킷 안에 생겨도 payload로 새지 않게 한다.

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

역할 구분:

- root `AGENTS.md` / `CLAUDE.md`: LLM session starting point.
- [docs/reference/workflow-spine.md](docs/reference/workflow-spine.md): numbered workflow stage index. Agents start here; [docs/reference/workflow-stages/00-start-here.md](docs/reference/workflow-stages/00-start-here.md) routes a task to its current stage. Read only the matching stage doc.
- `docs/frontend-workflow/global/llm-rules.md`: project policy and priority rules.
- [docs/reference/task-artifact-matrix.md](docs/reference/task-artifact-matrix.md): task-to-artifact operational checklist.
- [docs/reference/generated-files.md](docs/reference/generated-files.md): `generated/do_not_edit` regeneration map.
- [docs/reference/screen-identity.md](docs/reference/screen-identity.md): source screen code ↔ canonical Screen ID mapping (Screen Source Map).

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

- `--apply`는 safe-update와 new-file만 자동 적용하고 `.kit-install-manifest.json`을 갱신한다.
- 로컬 수정 파일은 기본적으로 절대 덮어쓰지 않는다. conflict는 `.upgrade-conflicts/<path>.incoming`으로 남겨 수동/LLM 병합한다.
- upstream에서 삭제된 파일은 기본 보존(orphan 보고)하며 `--prune`을 줄 때만 삭제한다.
- `tools/frontend-workflow/` 밖(소비 `docs/frontend-workflow/**`, 앱 소스, 루트 `AGENTS.md`/`package.json`)은 절대 건드리지 않는다.
- `.kit-install-manifest.json`이 없는 기존(비관리) 설치는 보수적 plan(차이 파일=conflict)을 만들고, 첫 apply 이후부터 manifest 기반으로 동작한다.

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

Monorepo/custom root:

```bash
npm run workflow:state -- --root apps/mobile --src apps/mobile/src
npm run workflow:doctor -- --root apps/mobile --src apps/mobile/src
```

기본 layer model과 다르면 `templates/adoption/project-layout.template.yaml`에서 시작해 `project-layout.yaml`을 만들고 `--layout project-layout.yaml`을 넘긴다. 자세한 route/screen/API/Tier3 관례는 [CONVENTIONS.md](CONVENTIONS.md)를 본다.

## Route, Screen, API Contracts

Route file과 screen implementation은 다른 경계다. ScreenSpec의 `route_entry`는 router/framework shell, `screen_entry`는 제품 화면 구현을 가리킨다. thin route가 screen을 import하는 구조를 선호하되, readiness의 `allowed_paths`와 `forbidden_paths`가 실제 편집 경계다.

API manifest confirmed 행은 `zod`, `ts-type`, `openapi`, `manual` contract kind를 링크할 수 있다. `ts-type`은 exported TypeScript type/interface 근거이고 런타임 검증을 뜻하지 않는다. `unknown`은 추적용이며 confirmed API evidence를 만족하지 않는다.

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

check 12는 mixed severity다.

- `_meta/reconciliation-register.md`가 없으면 NO-OP.
- register가 있으면 row 없음과 `Reconcile Status=not-started`는 기본 경고이며 `--enforce`에서 에러가 된다.
- `in-progress`, `failed`, enum 위반, duplicate Input ID, required column 누락은 항상 에러다.
- `reconciled`는 Created Items에 open decision/gap/unknown이 있어도 통과한다. 자식 상태는 register rollup이 아니다.

## Screen Identity And New Screens

기획/디자인 입력이 들고 오는 source 화면 코드(planning `A-001`·design `J010`·Figma node id·slug)는 **alias** 이고 canonical Screen ID 가 아니다. canonical identity(`screen_id`/`route`/`domain`/ScreenSpec 경로)는 워크플로우가 소유한다. source 코드 ↔ canonical 매핑은 **Screen Source Map**(`docs/frontend-workflow/_meta/screen-source-map.md`) 한 곳에 둔다. 계약·예시는 [docs/reference/screen-identity.md](docs/reference/screen-identity.md).

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

## Tier3 And Policy Drafts

Tier3/custom layer는 readiness 코드를 바꾸지 않고 `project-layout.yaml`로 선언한다. `workflow:doctor`로 layout을 확인하고, policy 변경은 live policy 교체가 아니라 draft/review artifact로 다룬다.

```bash
npm run workflow:policy-draft -- --out docs/frontend-workflow/_meta/policy-drafts
```

policy draft나 migration guide가 만들어져도 hard gate, CI required check, pre-edit hook 승격은 별도 사람 결정이다.

## Troubleshooting

- `validate`가 navigation-map 의존성으로 실패하면 `app/navigation-map.md`를 먼저 만든다.
- `rough-fixture-ui` 이상으로 올라가지 않으면 screen hook/source path와 `--src`/`--layout`을 확인한다.
- monorepo에서 파일을 못 찾으면 모든 workflow 명령에 같은 `--root`, `--src`, `--docs`, `--layout` 값을 넘긴다.
- check 12가 row 없음이나 `not-started`를 보고하면 reconcile을 실행하거나 `--enforce` 없이 도입 중 경고로 남긴다.
- check 12가 `in-progress`/`failed`를 보고하면 새 row를 만들지 말고 기존 row를 `in-progress`로 재개해 완료/실패 결과를 갱신한다.
- 생성 파일이 stale 해 보이면 직접 수정하지 말고 [docs/reference/generated-files.md](docs/reference/generated-files.md)의 명령으로 재생성한다. `workflow:check-generated`는 advisory guard이며 hard CI gate가 아니다.
- 기존에 전체 kit 디렉토리를 복사했다면 디렉터리를 덮어쓰지 말고 `scripts/upgrade-vendored-kit.mjs`로 보수적 plan을 만든 뒤 안전한 파일만 적용하고(위 "Upgrade A Vendored Kit"), `examples/`, `temp/`, design/history/roadmap/run-report 문서를 소비 repo에서 제거한다.
