# Core CLI argument-contract audit 001

- run_id: core-cli-argument-contract-audit-001
- date: 2026-07-12
- scope: `frontend-workflow-kit/package.json` `workflow:*` scripts + `package-scripts.template.json` 에 노출된 consumer CLI 전수(25개). `example:*`/`kit:pack`/`test-fixtures.mjs` 는 kit-dev 전용이라 표 밖(비고 참조).
- method: 각 CLI 소스를 직접 읽고 분류(문서 주장 복사 아님). 공통 `parseArgs`(scripts/lib/util.mjs:23) 는 allowlist 가 없고 아무것도 거부하지 않는다 — bare `--flag` 는 boolean `true`, boolean flag 뒤 non-`--` 토큰은 값으로 흡수, positional 은 별도 배열(대부분 CLI 가 버림), 중복 flag 는 last-wins. 거부는 전적으로 CLI 별 몫이다.
- classification: `active` (이 PR 의 구현 근거 evidence)
- **baseline: main HEAD `481b00a` — 이 PR 적용 전 코드의 스냅샷.** 아래 표의 `workflow-state.mjs`/`readiness.mjs` 행은 이 PR 이 해소한 pre-hardening 상태를 기록한 것이며, 해소 후 계약(두 CLI 모두 `--help` + unknown/bare·빈 값/boolean=value/positional → exit 2, 파일 IO·로드 전 검증)은 kit-dev/CHANGELOG.md Unreleased 항목이 정본이다.

## 표기

- `--help`: 실제 도움말 분기 존재 여부 (✗ = flag 가 조용히 무시되거나 오동작).
- unknown/valueless/boolean=value/positional rejected: usage 오류가 exit 2 로 표면화되는지.
- "crash 1" = `path.resolve(true)` 류 TypeError 로 stack trace + exit 1 (거부는 되지만 계약 위반).
- duplicate semantics: 공통 parseArgs 사용 시 last-wins. repeat = 배열 누적 flag 존재.

## Audit table

| CLI | writes files | gate/decision role | --help | unknown rejected | valueless rejected | boolean=value rejected | positional rejected | duplicate semantics | current risk | recommended phase |
|---|---|---|---|---|---|---|---|---|---|---|
| workflow-state.mjs (`workflow:state`) | YES — `_meta/workflow-state.yaml`·`screen-inventory.yaml`(+`layer-inventory.yaml`), `--json` 만 read-only | readiness 판정의 **입력 생성기** (state 가 곧 게이트 입력) | ✗ | ✗ 무시 (`--jsno` → JSON 대신 실제 파일 쓰기) | ✗ (`--docs`/`--src`/`--out` bare → crash 1; `--date` bare → 조용히 오늘 날짜 fallback) | ✗ (`--json 2026` → 토큰 흡수 + truthy) | ✗ 무시 | last-wins | **HIGH** — typo 가 파일 쓰기로 직행 (`--outt` 무시 → 기본 경로에 쓰기) | **이번 PR (해소됨)** |
| readiness.mjs (`workflow:readiness`) | `--out` 때만 | **판정의 단일 출처** — readiness_mode / allowed·forbidden_paths | ✗ | ✗ 무시 (`--screeen X` → 전체 화면 출력 fallback, `--polciy f` → 기본 policy 로 판정) | 부분 (`--screen` bare 만 exit 2; `--docs`/`--policy`/`--manifest`/`--ci`/`--out` bare → crash 1) | ✗ | ✗ 무시 | last-wins | **HIGH** — typo 가 잘못된 게이트 판정 출력으로 이어짐 | **이번 PR (해소됨)** |
| validate.mjs (`workflow:validate`) | no | 하드 게이트 (검사 12종, exit 0/1) | ✓ | ✓ exit 2 | ✓ exit 2 | ✓ exit 2 | ✓ exit 2 | last-wins | 해소됨 (PR #175, allowlist) | 완료 |
| create-input-artifact.mjs (`workflow:create-input`) | YES — `inputs/{input_id}.md` | 입력 artifact 생성기 | ✓ | ✓ exit 2 (자체 strict parser) | ✓ exit 2 | ✓ exit 2 | ✓ exit 2 | repeat flags 배열 누적 + 나머지 last-wins | 낮음 (모범 사례) | 완료 |
| create-screen.mjs (`workflow:create-screen`) | YES — stub ScreenSpec | scaffolder | ✓ | ✓ exit 2 (자체 strict parser) | ✓ exit 2 | ✓ exit 2 | ✓ exit 2 | `--source` repeat + last-wins | 낮음 (모범 사례) | 완료 |
| doctor.mjs (`workflow:doctor`) | no | warning-only preflight (항상 exit 0) | ✗ | ✗ 무시 | 부분 (`--policy` bare exit 2; 나머지 조용히 default fallback) | ✗ | ✗ 무시 | last-wins | LOW (read-only·no gate) | 후속 |
| forbidden-paths.mjs (`workflow:forbidden-paths`) | no | 경로 backstop — `--enforce` 때 하드 exit 1 | ✗ | ✗ 무시 (**`--enforc` typo → enforcement 조용히 소실** — validate 에서 고친 것과 동일 클래스) | ✗ (조용히 fallback) | ✗ | ✗ 무시 | last-wins | **MED-HIGH** — enforce 소실 fail-open | 후속 1순위 |
| route-tree.mjs (`workflow:route-tree`) | YES — `_meta/route-tree.txt` | 생성 뷰 | ✗ | ✗ 무시 | ✗ (조용히 default fallback) | ✗ | ✗ 무시 | last-wins | MED (`--outt` 류 typo → 기본 경로 덮어쓰기). runCli 미래핑 — LayoutConfigError 가 exit 1 로 샘 | 후속 |
| nav-graph.mjs (`workflow:nav-graph`) | YES — `_meta/nav-graph.yaml` | 생성 뷰 | ✗ | ✗ 무시 | ✗ (`--docs` bare → crash 1) | ✗ | ✗ 무시 | last-wins | MED. runCli 미래핑 | 후속 |
| catalog-gen.mjs (`workflow:catalog`) | YES — `design/component-catalog.md` | 생성 뷰 (`--src` 비실재 dir 은 exit 2 가드) | ✗ | ✗ 무시 | 부분 (조용히 fallback) | ✗ | ✗ 무시 | last-wins | MED | 후속 |
| lint-gen.mjs (`workflow:lint-gen`) | YES — eslint config fragment (`--check` 는 read-only) | 생성기 + `--check` 드리프트 exit 1 | ✓ | ✓ exit 2 (allowlist) | ✓ exit 2 | ✓ exit 2 | ✓ exit 2 | last-wins | 낮음 | 완료 |
| lint-baseline.mjs (`workflow:lint-baseline`) | no | warning-first ratchet (`--enforce` 승격) | ✓ | ✓ exit 2 (allowlist) | ✓ exit 2 | ✓ exit 2 | ✓ exit 2 | last-wins | 낮음 | 완료 |
| route-cross-check.mjs (`workflow:route-cross-check`) | no | warning-only (항상 exit 0) | ✓ | ✗ 무시 | ✗ (조용히 default) | ✗ | ✗ 무시 | last-wins | LOW | 후속 |
| visual-consistency.mjs (`workflow:visual-consistency`) | `--out` 때만 | warning-first (+opt-in `--enforce` exit 1) | ✓ | ✗ 무시 (`--enforc` → enforce 소실) | ✗ (조용히 default) | ✗ | ✗ 무시 | last-wins | LOW-MED | 후속 |
| visual-contract-bootstrap.mjs (`workflow:visual-contract-bootstrap`) | `--out` 때만 (canonical 덮어쓰기 거부) | review-only draft 생성기 | ✓ | ✓ 거부하지만 **exit 1** (exit 2 계약 불일치; `--apply`/`--overwrite`/`--enforce` 전용 메시지) | ✗ (조용히 default) | ✗ | ✗ 무시 | last-wins | LOW — exit code 정렬만 필요 | 후속 |
| doc-drift.mjs (`workflow:doc-drift`) | no | warning-first 진단 (항상 exit 0) | ✓ | 부분 (`--include` 값·opt-in 의존성은 exit 2, 일반 unknown flag 는 무시) | 부분 (`--include`/`--manifest`/`--now` 등 exit 2, `--root` bare 는 조용히 cwd) | ✗ | ✗ 무시 | last-wins | LOW-MED | 후속 |
| readiness-eval.mjs (`workflow:eval`) | no | warning-first 측정 | ✓ | ✓ exit 2 (allowlist) | ✓ (`--cases` bare exit 2) | ✗ (`--json=yes` truthy 수용) | ✓ exit 2 | last-wins | 낮음 — boolean=value 만 미거부 | 후속 (미세) |
| redteam.mjs (`workflow:redteam`) | no | warning-first 관측 (usage 만 exit 2) | ✓ | ✓ exit 2 (allowlist) | ✓ exit 2 | ✗ | ✗ 무시 | last-wins | 낮음 | 후속 (미세) |
| telemetry.mjs (`workflow:telemetry`) | `--out` 때만 (ledger) | warning-first 집계 (usage 만 exit 2) | ✓ | 부분 (prefix 있는 unknown·`--include`/`--surface` 값은 exit 2, 일반 unknown 은 무시 — `--otu` 무시 → ledger 미기록 silent) | ✓ 대부분 exit 2 | ✗ | ✗ 무시 | last-wins | MED | 후속 |
| workflow-packet.mjs (`workflow:packet`) | `--out` 때만 | 인덱스/envelope 생성기 (게이트 아님, exit 0/2) | ✓ (`-h` 포함) | ✗ 무시 | ✓ exit 2 (`requireStringFlag`/`optStr`) | ✗ | ✗ 무시 | last-wins | LOW-MED | 후속 |
| workflow-report.mjs (`workflow:report`) | `--out` 때만 | evidence 수집기 (exit 0/2) | ✓ | ✗ 무시 | ✓ exit 2 | ✗ | ✗ 무시 | last-wins | LOW-MED. runCli 미래핑 | 후속 |
| workflow-run.mjs (`workflow:run`) | YES — packet+report (+`--out` 상태 md; `--out` 없으면 tmpdir) | auto-stop orchestrator (STATE_EXIT 0/2) | ✓ | ✗ 무시 (`--skip-tets` → 테스트 실행됨) | ✓ exit 2 | ✗ | ✗ 무시 | last-wins | MED | 후속 |
| policy-draft.mjs (`workflow:policy-draft`) | YES — policy draft + migration 문서 (`--out` 필수) | review-only draft 생성기 | ✗ (`--help` 만 주면 `--out requires a value` exit 2) | ✗ 무시 | ✓ exit 2 (STRING_FLAGS) | ✗ | ✗ 무시 | last-wins | LOW-MED | 후속 |
| adoption-probe.mjs (`workflow:adoption-probe`) | YES — probe run 디렉토리 전체 (out 위치는 `temp/runs/adoption-probe-<id>` 로 강제) | 진단 생성기 (draft-only) | ✗ (**`--help` 가 무시되고 probe 가 실제 실행·파일 생성**) | ✗ 무시 | ✓ exit 2 (자체 parser STRING_FLAGS) | ✗ | ✗ **수집조차 안 함** (조용히 drop) | last-wins | **MED-HIGH** — `--help` 시도가 artifact 를 만든다 | 후속 상위 |
| check-generated-files.mjs (`workflow:check-generated`) | no | warning-first 드리프트 리포트 (항상 exit 0) | ✗ | ✗ 무시 | ✗ (조용히 default fallback; unknown `--artifact` 값만 exit 2) | ✗ | ✗ 무시 | last-wins | LOW | 후속 |

## 비고

- **parseArgs 사용 vs 자체 parser** (baseline 기준): 자체 strict parser + allowlist = `create-input-artifact`(REPEAT 지원)·`create-screen`. 공통 `parseArgs` + allowlist 검증 = `validate`(PR #175)·`readiness-eval`·`redteam`·`lint-gen`·`lint-baseline`. 자체 parser 이지만 allowlist 없음 = `adoption-probe`(lib 의 `parseCliArgs` clone). 나머지는 공통 `parseArgs` 무방비. **이 PR 이후**: `workflow-state`·`readiness` 가 공통 `parseArgs` + `scripts/lib/cli-args.mjs` `enforceCliFlagContract`(allowlist 검증, 빈 `--flag=` 값 포함 거부) 그룹에 합류.
- `upgrade-vendored-kit.mjs` 는 package script 에 없는 업그레이드 전용 CLI(COMMANDS §Upgrade) — `--help` 지원·`fail(message, code=2)` 헬퍼 사용. 이번 표 대상 밖.
- `test-fixtures.mjs`(`example:test`)·`pack-frontend-workflow-kit.mjs`(`kit:pack`) 는 kit-dev 전용(consumer payload 제외) — 감사 범위 밖.
- **이번 PR 구현 대상은 `workflow-state.mjs` 와 `readiness.mjs` 로 제한**한다(가장 위험: 게이트 판정·게이트 입력 파일 쓰기). 나머지 행의 후속 후보 우선순위: ① `forbidden-paths`(`--enforc` typo 로 enforcement 소실 — fail-open), ② `adoption-probe`(`--help` 가 파일 생성), ③ 생성 뷰 3종(route-tree/nav-graph/catalog-gen) + `telemetry` 일반 unknown flag, ④ `visual-contract-bootstrap` exit 1→2 정렬, `readiness-eval`/`redteam` boolean=value 거부. 전부 별도 PR — 이번 PR 에서 대량 migration 하지 않는다.
- 이 감사는 warning-first→hard 승격·readiness 판정 로직·policy fact·artifact axis 를 건드리지 않는 사실 분류다.

## Follow-up completion notes

위 Audit table 은 baseline `481b00a` 시점의 과거 사실로 보존한다. 이후 해소분은 여기에만 추기한다.

- **2026-07-12 — `forbidden-paths.mjs` 행 해소** (후속 후보 ① — `--enforc` typo 로 enforcement 소실 fail-open, MED-HIGH): forbidden-paths strict argument contract PR 에서 `enforceCliFlagContract` allowlist 채택 + `--help` 신설로 unknown/bare·빈 `=` value flag/boolean=value/positional → exit 2 (검증은 state/policy/git/diff/readiness 작업보다 먼저). warning-first 기본·`--enforce` exit 1 의미·판정 로직 무변경 — gate promotion 아님. 정본 계약은 kit-dev/CHANGELOG.md Unreleased 의 fix(cli) forbidden-paths 항목. 해소 commit/PR: `fix(cli): forbidden-paths strict argument contract + --enforce typo fail-closed`.
- **2026-07-12 — upgrade-plan migration-note 상대 링크 문제 해소** (후속 PR #179): plan render 시 embedded migration-note 상대 링크를 실제 plan 위치 기준으로 재배치한다. planner classification/apply 의미·JSON shape·warning-first 경계는 무변경. 증거: [upgrade-plan-migration-link-rebase-001.md](upgrade-plan-migration-link-rebase-001.md).
- **2026-07-12 — `adoption-probe.mjs` 행 해소** (후속 후보 ② — `--help` 실제 probe 실행·unknown/boolean/positional fail-open·explicit repo 오타 쓰기): 공통 null-prototype `parseArgs` + `enforceCliFlagContract` allowlist 를 CLI 경계에 채택하고 side-effect-free `--help`, explicit repo existing-directory guard 를 추가했다. syntax → help → repo → semantic → normalize → run 순서를 고정해 usage/help 에서 scan/write/child process 0. 정상 no-visual/visual 결과와 draft-only·warning-first 의미, programmatic `runAdoptionProbe(flags)`, scalar last-wins, `--repo` precedence 는 무변경. 증거: [adoption-probe-cli-contract-001.md](adoption-probe-cli-contract-001.md).
- 남은 다음 우선순위: 생성 뷰 3종(`route-tree`/`nav-graph`/`catalog-gen`)과 `telemetry` 일반 unknown flag, 그 뒤 `visual-contract-bootstrap` exit 1→2 정렬 및 `readiness-eval`/`redteam` boolean=value 거부. 각각 별도 PR 로 유지한다.
