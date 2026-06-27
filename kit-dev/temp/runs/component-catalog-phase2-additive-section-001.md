# Run report — component-catalog phase2 additive section (001)

> Status: IMPLEMENTATION 완료. Date: 2026-06-16.
> Branch: `feat/component-catalog-default-candidates`.
> Worktree: `.claude/worktrees/component-catalog-default-candidates`.
> Scope: phase2 PR-3 첫 additive 출력 섹션. Warning/hard gate/readiness/validate 정책 변경 없음.

## 선택 이유

첫 additive 섹션의 목적은 **generator coverage 확대**로 잡았다. phase2-1 배럴 reconcile 진단은 이미 stderr-only/warning-first 로 랜딩됐으므로, 이번 슬라이스는 출력 자체를 additive 하게 넓히되 기존 v1 정본인 `## Components` 4컬럼 테이블은 유지하는 방향이 가장 작고 검증 가능하다.

선택한 후보는 `Modal.tsx` 같은 default function export 다. 기존 v1 은 default export 를 정식 component 로 승격하지 않았고, 이번 구현도 그 원칙을 유지한다. default export 는 `candidate` 로만 surface 한다.

## 구현 내용

| 항목 | 내용 |
|---|---|
| 모델 필드 | `default_export_candidates` 추가. 기존 `components` 배열에는 default export 후보를 넣지 않음. |
| 이름 기준 | PascalCase 파일 basename 우선. 예: `Modal.tsx` → `Modal`, default function 내부 이름은 표시 이름 결정에 쓰지 않음. |
| 후보 범위 | 정본 `src/components/ui/**` 안의 PascalCase basename 파일에서 `export default function ...` 형태를 candidate 로 수집. |
| 정렬 | 기존 component 정렬과 같은 `(source_path, name)` 비교를 사용. |
| Markdown 출력 | `## Components` 뒤에 `## Default Export Candidates` 섹션을 append. 후보가 없으면 빈 섹션은 출력하지 않음. |
| JSON 출력 | `--json` 은 `buildCatalog` 모델을 그대로 직렬화하므로 `default_export_candidates` 를 포함함. 단위 테스트로 고정. |
| 기존 진단 | phase2-1 배럴 reconcile diagnostic 은 유지. 출력/exit 변경 없음. |

## 기존 Components 테이블 불변성

기존 `## Components` 4컬럼 테이블의 헤더, 구분선, v1 행 순서와 값은 유지했다.

현재 basic-ui golden 의 기존 행은 그대로다:

| Name | Source Path | Export Kind | Status |
| --- | --- | --- | --- |
| Button | src/components/ui/Button.tsx | named | ok |
| Card | src/components/ui/Card.tsx | named | ok |
| Stack | src/components/ui/Stack.tsx | named | ok |

새 출력은 위 블록 뒤에만 append 된다.

## 새 섹션 포맷

```md
## Default Export Candidates

| Name | Source Path | Export Kind | Status |
| --- | --- | --- | --- |
| Modal | src/components/ui/Modal.tsx | default | candidate |
```

`Export Kind` 는 `default`, `Status` 는 `candidate` 로 고정했다. 이는 정식 component 승격이 아니라 generator coverage 관측 표면이다.

## 검증 결과

| 명령 | 결과 |
|---|---|
| `npm run test:spec` | PASS — 63 pass, 0 fail. |
| `npm test` | PASS — test-fixtures 27 fixtures: 26 pass, 1 xfail, 0 fail; node tests 63 pass, 0 fail. |
| `npm run workflow:catalog -- --src examples/component-catalog/basic-ui/src --dry-run` | PASS — `## Default Export Candidates` 섹션과 `Modal` candidate 출력 확인. |
| `git diff --check` | PASS — whitespace errors 없음. |

`npm run workflow:catalog` 기본 입력은 이 kit checkout 에 `src/components/ui` 가 없어 사용하지 않았다. 대신 component-catalog fixture 입력을 명시해 같은 generator 경로를 dry-run 으로 검증했다.

## Scope Discipline

- `## Components` 테이블에 컬럼 추가 없음.
- default export 후보를 `components` 로 승격하지 않음.
- warning/hard gate 승격 없음.
- readiness/validate 정책 변경 없음.
- 새 산출물 축/매니페스트/가드 allowlist 추가 없음.
- 배럴 reconcile diagnostic 유지.

## Discovered Work

새로 발견해 현재 작업에서 격리해야 할 범위 밖 후속은 없다.

기존 phase2 Open Decision backlog 는 그대로 남는다: props/docgen, memo/forwardRef 래퍼 포함, default alias/arrow/class 형태 확장, lifecycle status, NativeWind/style 분석은 별도 future PR/OD 에서 다룬다.
