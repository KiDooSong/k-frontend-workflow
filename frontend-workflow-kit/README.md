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
- templates/skills: `templates/`, `skills/`
- package/docs: `package.json`, `package-lock.json`, `package-scripts.template.json`, `README.md`, `COMMANDS.md`, `CONVENTIONS.md`, `distribution-manifest.yaml`, `LICENSE`

`examples/`, `temp/`, `docs/design/`, `docs/workflows/`, roadmap/history/run-report/proposal 문서는 기본 payload에서 제외된다.

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
- 필요 시 `templates/global/`, `templates/domain/`, `templates/api/`, `templates/meta/`, `templates/input/`

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

## Implement Screen Flow

화면 구현은 `skills/implement-screen/SKILL.md` 절차를 따른다.

```bash
npm run workflow:state
npm run workflow:readiness -- --screen <SCREEN_ID> --json
npm run workflow:validate
```

관련 입력이 `not-started`, `in-progress`, `failed` 상태면 구현 전에 reconcile을 끝내거나 같은 row로 재개한다. 구현은 readiness가 허용한 파일에만 하며, generated files, Open Decision resolve, Unknown close, Component Gap accept, live policy replacement는 사람이 명시하지 않으면 하지 않는다.

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
- 기존에 전체 kit 디렉토리를 복사했다면 packed payload 기준으로 갱신하고 `examples/`, `temp/`, design/history/roadmap/run-report 문서를 소비 repo에서 제거한다.
