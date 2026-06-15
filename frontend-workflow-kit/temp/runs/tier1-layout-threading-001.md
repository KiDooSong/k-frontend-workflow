# Tier1 layout-profile — orchestrator `--layout` 배선 fix (workflow:run / workflow:report)

- run_id: tier1-layout-threading-001
- 단계: **fix** — PR #41(dogfood) F1/F2 후속. orchestrator 계층 `--layout` 전달 추가.
- 기준(stacked): PR #41 head `worktree-tier1-integration-dogfood` `a205da9` 위 br랜치
  `fix/tier1-layout-thread-run-report`. (PR #41 미머지 → main 직접 기준 금지 규약 준수.)
- 실행일: 2026-06-15
- 환경: Windows 11 · node v24.15.0 · npm 11.12.1 · git-bash (`/tmp` → `C:\Users\…\AppData\Local\Temp`)
- 변경 파일: `scripts/workflow-run.mjs`, `scripts/workflow-report.mjs`,
  `scripts/lib/workflow-run.test.mjs`(신규), `scripts/lib/workflow-report.test.mjs`(신규), 이 run 로그.

---

## 0. 결론 (TL;DR)

- **split-brain fix.** custom `--layout` 이 orchestrator 에서 leaf 로 전달되지 않아, leaf(readiness·
  validate·forbidden-paths·check-generated)는 custom 레이아웃, orchestrator 는 기본(expo)로 갈리던
  결함(PR #41 §0 F1·F2)을 닫는다.
  - `workflow:run` → `workflow:packet` **및** `workflow:report` child 에 `--layout <absPath>` 전달.
  - `workflow:report` → `validate` / `forbidden-paths` / `check-generated-files` child 에 `--layout <absPath>` 전달.
- **default layout BYTE-동치.** `--layout` 미지정 시 child arg 가 1바이트도 안 늘어난다(누출 0) → 기존
  packet/report/status 출력과 동일. 정규화 diff 로 확인(§3).
- **test-fixtures 는 의도적으로 제외.** 전체 fixture harness 이므로 `--layout` 을 넘기지 않는다(기존 동작 유지).
- **새 게이트 0 · CI/package/manifest/component-catalog 변경 0.** orchestrator 는 봉투 소비/evidence 수집만.
  readiness/validate/forbidden 판정 로직, generated artifact 포맷, check-generated semantics 불변.
- **회귀 가드 추가.** 신규 witness 2종(서브프로세스 smoke)이 custom-threading + default-동치 + bare-`--layout`
  exit 2 + help 노출을 고정한다. CI 미배선(하드룰), `node --test` 직접 실행(check-generated-files.test.mjs 규약).

---

## 1. 무엇이 문제였나 (PR #41 F1/F2 재현)

leaf scripts 는 이미 `--layout` seam 을 가졌다(`loadLayoutProfile({ kitRoot, flags })` → `flags.layout`):
`readiness.mjs` · `validate.mjs` · `forbidden-paths.mjs` · `check-generated-files.mjs` · `workflow-packet.mjs`.
하지만 orchestrator 2개가 `--layout` 을 **파싱/전달하지 않았다**:

```text
# F1 — workflow:run, custom --layout 을 넘겨도 packet 의 readiness_source 에 보존 안 됨 (fix 전):
$ node scripts/workflow-run.mjs --screen COUPON-001 --requested-mode rough-fixture-ui \
    --docs examples/coupon-feature/docs/frontend-workflow \
    --layout examples/layout-profile/custom-monorepo/project-layout.yaml --out <tmp>
readiness_source: "readiness.mjs --docs … --screen COUPON-001 --json (computed 2026-06-15)"   # --layout 증발

# F2 — workflow:report, custom --layout 을 넘겨도 leaf invocation 에 안 나타남 (fix 전):
node scripts/validate.mjs --json --docs … --src …                 # --layout 없음
node scripts/forbidden-paths.mjs --json --diff … --docs … --root …  # --layout 없음
node scripts/check-generated-files.mjs --json --docs … --src …      # --layout 없음
```

default layout 에선 byte-동치라 무해했지만, custom layout 에선 orchestrator 와 leaf 가 서로 다른
프로파일을 보게 된다(split-brain).

---

## 2. 변경 요약

### `scripts/workflow-run.mjs`
- `--layout <path>` 를 `optStr` 로 파싱(값 없는 bare → exit 2). help text 에 `--layout <path>` 추가.
- `path.resolve(layout)` 로 절대경로화(`layoutResolved`).
- `packetArgs` 에 `--layout <absPath>` 전달(`--manifest` 뒤). `reportArgs` 에도 `--layout <absPath>` 전달.
- status model 에 layout 필드 추가 없음 — `--layout` 은 packet 의 `readiness_source`(evidence)에서 자연히 보인다.

### `scripts/workflow-report.mjs`
- `--layout <path>` 를 `optStr` 로 파싱(bare → exit 2). help text 에 `--layout <path>` 추가.
- `path.resolve(layoutFlag)` → `layoutResolved`.
- `collectValidate` / `collectForbidden` / `collectCheckGenerated` 에 `layout` 인자 추가 → 각 child arg 에
  `--layout <absPath>` push. `collectTests`(test-fixtures)는 시그니처/호출 불변(전달 안 함).
- Run Report 는 evidence bundle — layout 으로 새 gate 만들지 않음.

### tests (신규, `scripts/lib/`)
- `workflow-run.test.mjs` — custom 시 `work-packet.md` `readiness_source` 에 `--layout <absPath>` 보존,
  default 시 누출 0, bare `--layout` exit 2, help 노출.
- `workflow-report.test.mjs` — custom 시 validate/forbidden/check-generated invocation 에 `--layout`,
  default 시 누출 0, **test-fixtures invocation 엔 `--layout` 없음**, bare `--layout` exit 2, help 노출.

---

## 3. 검증 (cwd = `frontend-workflow-kit/`)

| # | 명령 | exit | 판정 |
|---|---|---|---|
| 1 | `node --check scripts/workflow-run.mjs` | 0 | ✅ |
| 2 | `node --check scripts/workflow-report.mjs` | 0 | ✅ |
| 3 | `node --test scripts/lib/workflow-run.test.mjs scripts/lib/workflow-report.test.mjs` | 0 | ✅ 9/9 pass |
| 4 | `npm test` | 0 | ✅ 27/27 pass (test-fixtures + spec/api-manifest/layout-profile) |
| 5 | `npm run example:validate` | 0 | ✅ `OK (검사 12종 통과)` |
| 6 | `npm run example:test` | 0 | ✅ all PASS |

### 수동 smoke — custom layout (fix 후)

```text
# run: readiness_source 에 --layout <absPath(posix)> 보존
readiness_source: "readiness.mjs --docs examples/coupon-feature/docs/frontend-workflow --screen COUPON-001 \
  --layout C:/…/examples/layout-profile/custom-monorepo/project-layout.yaml --json (computed 2026-06-15)"

# report: leaf invocation 에 --layout 전달
node scripts/validate.mjs --json --docs … --src … --layout C:\…\project-layout.yaml             # exit 0 (pass)
node scripts/forbidden-paths.mjs --json --diff … --docs … --root … --layout C:\…\project-layout.yaml  # exit 0 (pass)
node scripts/check-generated-files.mjs --json --docs … --src … --layout C:\…\project-layout.yaml  # exit 0 (advisory)
# test-fixtures: --layout 없음 (전체 fixture harness — 의도)
```

### 수동 smoke — default layout BYTE-동치

```text
# workflow-run work-packet.md: --out 경로 토큰만 다름(의도적으로 다른 디렉터리). 정규화 후 동치.
$ diff <(fix전 default) <(sed 's#default-postfix#default#' fix후 default)   → 차이 0  ✅
# workflow-report markdown: 동일 입력 → byte-identical                       → 차이 0  ✅
# (default 경로는 layoutResolved=null → child arg 무증가 → leaf 출력 불변)
```

---

## 4. 범위 가드 (금지 항목 준수)

- 새 hard gate 0 · CI required check 0 · manifest flip 0 · component-catalog guard 등록 0 · package alias 0.
- generated artifact 포맷 변경 0 · check-generated semantics 변경 0 · readiness/validate/forbidden 판정 로직 변경 0.
- Open Decision/Unknown/Conflict resolve/close/confirmed 승격 0 · Interaction Matrix/props/docgen/NativeWind 미접촉.
- `--layout` 미지정(default) 경로는 모든 child arg 가 불변 → 기존 출력 byte-동치.

## 5. 비포함 / 후속 메모

- PR #41 머지 후 이 브랜치를 main 으로 rebase(stacked → 단독). PR #43 으로 머지됨(`593b0cb`).

### 5.1 후속(Codex 리뷰 반영 — PR #43 머지 후 별도 PR)

Codex 리뷰가 MINOR 2건(테스트 커버리지 갭)을 지적 → 후속 PR 에서 **behavioral 테스트**로 마감:

- **run→report e2e(DONE_PENDING_REVIEW) witness 추가.** 커밋된 예제엔 clean packet 이 없지만(게이트 시연용),
  `path-backstop` `AUTH-001` 은 `api_confidence` unknown 하나만 빼면 clean 이라, tmp 복사본에서 그 한 줄
  (`api_confidence_min: candidate`→`confirmed`)만 올려 clean packet 을 합성한다. 이걸로 `workflow:run` 이
  `DONE_PENDING_REVIEW` 로 진입해 **report child 호출 → leaf invocation 에 `--layout` 전달**까지 e2e witness.
- **상대경로 입력 witness 추가(run/report 양쪽).** 절대경로만 넘기면 `path.resolve` 누락 회귀를 못 잡으므로,
  cwd=KIT_ROOT 기준 **상대** `--layout` 을 넘겨 leaf invocation/`readiness_source` 에 *절대경로*가
  기록되는지 확인한다.
- **mutation 검증:** (a) `reportArgs.push('--layout', …)` 삭제 → e2e witness FAIL,
  (b) report 의 `path.resolve` 제거 → 상대경로 witness FAIL. 둘 다 의도대로 회귀를 잡는다(false-positive 아님).
- prod 코드(`workflow-run.mjs`/`workflow-report.mjs`) 변경 0 — 테스트 2개 파일만 보강.
