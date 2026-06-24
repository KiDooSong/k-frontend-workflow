# frontend-workflow-kit

프론트엔드 작업을 LLM에게 맡길 때 추론을 문서와 결정적 스크립트로 고정하는 워크플로우 킷이다. 핵심 루프는 `state -> readiness -> validate`이며, generated view와 path backstop은 보조 안전망이다.

## 보장 / 비보장

| 킷이 하는 일 | 사람이 해야 하는 일 |
|---|---|
| screen-spec, navigation-map, policy, manifest를 읽어 반복 가능한 상태를 만든다. | 제품 의도, UX, 누락 상태, 엣지 케이스를 리뷰한다. |
| 화면별 구현 가능 모드의 기계적 상한을 계산한다. | Open Decision, Unknown, candidate fact를 닫거나 confirmed로 승격한다. |
| 구조, 경로, 생성물 drift를 검사한다. | 초록불을 완료나 승인으로 해석하지 않는다. |

`readiness` 통과는 구현 가능 상한이고, `validate` 통과는 구조 무결성이다. 둘 다 제품 승인이나 설계 리뷰를 대신하지 않는다.

## 소비자 Payload

소비 프로젝트에는 `distribution-manifest.yaml` allowlist로 만든 payload만 vendoring한다. 전체 kit 개발 디렉토리를 그대로 가져오지 않는다.

포함되는 기본 파일:

- `scripts/`, `catalog/`, `policies/`, `presets/`, `schemas/`, `templates/`, `skills/`
- `package.json`, `package-lock.json`, `package-scripts.template.json`
- `README.md`, `COMMANDS.md`, `CONVENTIONS.md`, `distribution-manifest.yaml`, `LICENSE`

제외되는 기본 파일:

- `examples/`, `temp/`
- `docs/design/`, historical workflow notes, roadmap/history docs
- run reports, probes, draft proposals, generated diagnostics

## 설치

kit repo에서 payload를 만든다.

```bash
cd frontend-workflow-kit
npm install
npm run kit:pack
```

생성된 `dist/frontend-workflow-kit/`를 소비 프로젝트의 `tools/frontend-workflow/`로 vendoring한다.

소비 프로젝트에서 한 번 설정한다.

```bash
cd tools/frontend-workflow
npm install
```

그 다음 소비 프로젝트 root `package.json`에 `tools/frontend-workflow/package-scripts.template.json`의 `scripts`를 병합한다.

## 최소 문서 부트스트랩

소비 프로젝트 root 기준으로 `docs/frontend-workflow/`를 만든다.

```txt
docs/frontend-workflow/
  app/navigation-map.md
  domains/{domain}/screens/{screen}/screen-spec.md
```

템플릿 출처:

- `tools/frontend-workflow/templates/app/navigation-map.template.md`
- `tools/frontend-workflow/templates/screen/screen-spec.template.md`
- 필요 시 `templates/global/`, `templates/domain/`, `templates/api/`, `templates/meta/`

`screen-spec.md`의 `depends_on: [navigation-map]` 때문에 navigation-map이 없으면 `workflow:validate`가 실패한다.

## 기본 명령

```bash
npm run workflow:state
npm run workflow:readiness
npm run workflow:validate
```

정규화된 외부 입력 payload가 있으면 generic producer로 canonical input artifact를 만들 수 있다.

```bash
npm run workflow:create-input -- --docs docs/frontend-workflow --from-json input.json
```

`workflow:create-input`은 `inputs/{input_id}.md`만 만든다. Reconciliation Register 수정, acceptance, confirmed 승격, 구현 허가는 별도 단계다.

자세한 명령은 [COMMANDS.md](COMMANDS.md), layout/API/Tier3 관례는 [CONVENTIONS.md](CONVENTIONS.md)를 본다.

## 흔한 도입 프로필

Default Expo-like `src/` root:

```bash
npm run workflow:state -- --docs docs/frontend-workflow --src src
npm run workflow:validate -- --docs docs/frontend-workflow --src src
```

Monorepo/custom root:

```bash
npm run workflow:state -- --root apps/mobile --src apps/mobile/src
npm run workflow:doctor -- --root apps/mobile --src apps/mobile/src
```

Thin route + separate screen:

- route file은 얇게 두고 화면 구현은 screen/component layer에 둔다.
- ScreenSpec frontmatter의 optional `route_entry`는 router/framework 경계이고, `screen_entry`는 제품 화면 구현 경계다.
- 두 경로는 서로 다른 root에 있을 수 있으므로 tooling과 리뷰에서 하나를 다른 하나로 추론하지 않는다.
- readiness의 `allowed_paths`와 `forbidden_paths`를 구현 범위의 기준으로 삼는다.

TS API contract vs Zod API contract:

- API manifest confirmed 행은 `zod`, `ts-type`, `openapi`, `manual` evidence kind를 링크할 수 있다.
- 기존 Linked Schema 행은 zod-compatible legacy 행으로 계속 유효하다.
- `ts-type`은 exported TypeScript type/interface를 정적 근거로 확인하며 런타임 검증을 뜻하지 않는다.
- `unknown`은 추적/호환 kind이고 confirmed evidence를 만족하지 않는다.
- 어떤 스타일이든 `api/api-manifest.md`에 후보 endpoint와 근거를 기록한다.

Tier3 layers:

- custom layer는 readiness 코드를 고치지 말고 `project-layout.yaml`로 선언한다.
- `templates/adoption/project-layout.template.yaml`에서 시작하고 `workflow:doctor`로 확인한다.

## Readiness Mode

화면별 구현 가능 모드는 `policies/implementation-mode-policy.yaml`이 단일 출처다.

```txt
docs-only -> route-skeleton -> screen-skeleton -> rough-fixture-ui
-> final-fixture-ui -> api-integrated-ui -> production-ready
```

`readiness.mjs`는 policy fact와 사람이 확정한 Open Decision cap만으로 상한을 계산한다. Unknown, conflict, investigation 메모는 그 자체로 자동 차단하지 않는다.

## Troubleshooting

- `validate`가 navigation-map 의존성으로 실패하면 `app/navigation-map.md`를 먼저 만든다.
- `rough-fixture-ui`로 올라가지 않으면 hook 파일 존재 조건과 `src` 경로를 확인한다.
- monorepo에서 파일을 못 찾으면 `--root`, `--src`, `--layout` 값을 명시한다.
- `lint-gen --check`가 실패하면 generated config를 재생성하거나 lint policy drift를 리뷰한다.
- 기존에 전체 kit 디렉토리를 복사했다면 `examples/`, `temp/`, design/history/roadmap 문서를 소비 repo에서 제거하고 pack output을 기준으로 갱신한다.