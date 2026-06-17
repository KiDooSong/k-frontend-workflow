---
name: adapt-lint-pack
description: 기존 ESLint/Biome/Prettier/CI 설정이 있는 brownfield 프로젝트에 lint-pack을 자동 마이그레이션하지 않고 scan -> map -> diff -> rollout -> propose 순서로 제안한다. 기존 설정을 덮어쓰지 않으며, 사람 승인 전 lint-gen을 실행하지 않는다.
---

# adapt-lint-pack

brownfield 프로젝트에 workflow lint-pack을 도입하기 위한 **제안 워크플로우**다.
기존 린트 설정을 교체하거나 재정렬하지 않는다. 이 스킬의 산출물은 사람 승인용
보고서와 `docs/frontend-workflow/_meta/lint-policy.yaml` 초안이며, 생성기 실행은
승인 이후 별도 단계다.

> `adapt-lint-pack`은 자동 마이그레이션이 아니다. scan, map, diff, rollout,
> propose 순서로 관찰과 제안을 기록하고 멈춘다.

## 입력

- 대상 프로젝트 루트. 지정이 없으면 현재 작업 디렉터리를 사용한다.
- 문서 루트. 기본값은 `docs/frontend-workflow`.
- 정책 정본:
  - `tools/frontend-workflow/docs/workflows/lint-policy-catalog.md`
  - `tools/frontend-workflow/docs/workflows/lint-policy-rollout-ratchet.md`
  - `tools/frontend-workflow/templates/meta/lint-policy.template.yaml`
  - `tools/frontend-workflow/schemas/lint-policy.schema.json`

## 절차

1. **Scan**
   기존 린트 환경을 읽기 전용으로 조사한다.
   - package manager와 lockfile: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`
   - `package.json` lint/test/format scripts
   - ESLint 설정: `eslint.config.*`, `.eslintrc*`
   - Biome/Prettier 설정: `biome.json*`, `.prettierrc*`, `prettier.config.*`
   - 설치된 preset/plugin: `eslint`, `@eslint/*`, `eslint-config-*`, `eslint-plugin-*`, `@biomejs/biome`
   - CI lint command: `.github/workflows/**`, `.gitlab-ci.yml`, 기타 로컬 CI 파일
   - framework와 styling stack: Expo/Next/Vite, React Native, NativeWind, StyleSheet, UI kit 등

   출력에는 각 판단의 근거 파일을 남긴다. 설정 파일, package script, CI 파일은
   수정하지 않는다.

2. **Map**
   `defaults.paths` 후보를 만든다.
   - `docs/frontend-workflow/global/frontend-architecture.md` 또는 동등한 architecture 문서가 있으면 우선 사용한다.
   - 문서가 없거나 불완전하면 코드 구조에서 추정하되 `confidence: candidate`로 표시한다.
   - 확정 가능한 경로만 `confidence: confirmed`로 둔다.
   - 절대 경로와 `..` parent escape는 제안하지 않는다.
   - `screens`, `api`, `ui` 세 경로가 모두 있어야 schema-ready draft가 될 수 있다.

3. **Diff**
   policy catalog의 각 정책을 기존 설정과 대조한다.
   - `already-covered`: 기존 규칙이 같은 의도를 충분히 커버한다. 초안에서는 중복 workflow rule을 `enabled: false`로 제안하고, `reason`에 기존 규칙 이름과 파일을 적는다.
   - `contradictory`: 기존 설정 또는 명시된 프로젝트 컨벤션과 충돌한다. conflict report에 올리고 자동 override하지 않는다.
   - `missing`: 기존 설정에 없는 도입 후보로 둔다.
   - `unsupported`: 현재 PR-2 `lint-gen.mjs` operational subset(`implementation: auto`)으로 생성할 수 없으면 제안 또는 conflict로 남긴다.
   - `unknown`: 근거가 부족하면 추정하지 말고 조사 필요 항목으로 남긴다.

   Safety policy를 disable/downgrade해야 하는 초안은 `reason`과 사람 소유
   `decision_id`가 필요하다. decision id가 없으면 schema-ready로 표시하지 말고
   approval dependency로 남긴다.

4. **Rollout**
   도입 후보별 현재 위반 수를 report-only로 측정한다.
   - 실행한 명령, 검색식, 파일 범위, 제외 경로를 함께 기록한다.
   - 정확히 셀 수 없으면 숫자를 꾸미지 말고 `not measured`와 이유를 쓴다.
   - 측정치는 `lint-baseline.mjs` 결과가 아니며, 승인 전 baseline을 고정하지 않는다.
   - 위반이 0이면 기본 severity와 `rollout: all`을 우선 제안한다.
   - brownfield backlog가 관리 가능하면 `rollout: all` + `severity: warn|error`를 제안한다.
   - backlog가 커서 증가 방지가 필요하면 `rollout: ratchet`, `baseline: <measured count>`, `reason`을 제안한다.
   - `new-code-only`는 v1 rollout enum이 아니므로 초안에 넣지 않는다. 필요하면 reserved future option으로만 언급한다.

5. **Propose**
   아래 출력 계약을 하나의 보고서로 작성한다. 기존 `lint-policy.yaml`이 이미 있으면
   덮어쓰지 말고 제안 diff 또는 초안 블록으로 제시한다. 파일 작성을 명시적으로
   요청받아도 사람 승인 전에는 `lint-gen.mjs`를 실행하지 않는다.

## 출력 계약

보고서는 다음 섹션을 모두 포함한다.

````md
## Lint Adaptation Report

### Existing Environment
| Item | Finding | Evidence |
|---|---|---|

### Path Map
| Key | Proposed path | Confidence | Evidence |
|---|---|---|---|

### Policy Diff
| Policy | Catalog tier | Finding | Proposed action | Evidence |
|---|---|---|---|---|

### Measured Counts
| Policy | Count | Method | Scope | Confidence |
|---|---:|---|---|---|

### docs/frontend-workflow/_meta/lint-policy.yaml Draft
```yaml
version: 1
defaults:
  paths:
    screens: src/features/*/screens
    api: src/api
    ui: src/components/ui
policies:
  layer-boundaries:
    enabled: true
    severity: error
    rollout: all
    implementation: auto
```

### Conflict Report
| Conflict | Policy | Existing convention | Proposed handling | Owner |
|---|---|---|---|---|

### Rollout Plan
| Step | Owner | Action | Exit criteria |
|---|---|---|---|
````

`docs/frontend-workflow/_meta/lint-policy.yaml Draft`는 schema-ready 여부를 명시한다.
approval placeholder, missing path, unmeasured ratchet baseline, conflict가 있으면
`schema-ready: no`로 보고한다.

## 금지

- 사람 승인 전 `lint-gen.mjs` 실행.
- `lint-baseline.mjs` 구현 또는 실행 흐름 추가.
- 기존 `eslint.config.*`, `.eslintrc*`, Biome/Prettier 설정, package lint script 수정, 덮어쓰기, 재정렬.
- CI hard gate 또는 repo-root generated-file guard 승격.
- `eslint-workflow-config` manifest status를 `active`로 올리기.
- Open Decision resolve/close, human-owned gate 자동 해제.
- Tier2 codegen adapter, Interaction Matrix telemetry, 기타 뒤 순번 작업 착수.

## 완료 보고

- 변경한 파일과 변경하지 않은 설정 파일을 분리해 보고한다.
- 생성기 미실행과 기존 설정 무수정을 명시한다.
- docs/skill만 수정한 경우 최소 `git diff --check`로 검증한다.
