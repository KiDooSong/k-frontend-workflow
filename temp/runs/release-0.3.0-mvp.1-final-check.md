---
title: "0.3.0-mvp.1 릴리스 최종 체크 (MVP 종료 PR B)"
kind: release-check
release: v0.3.0-mvp.1
branch: claude/ci-support-contract-release-5cbfb7
base_commit: 89d6564
issues: ["#160", "#161", "tracker #167"]
date: 2026-07-11
verdict: GO (태그 v0.3.0-mvp.1 = PR B 병합 커밋 fea0501 에 생성됨 — 2026-07-11 pending 해소 표기)
status: current
---

# 0.3.0-mvp.1 릴리스 최종 체크 — MVP 종료 PR B (#160 + #161)

tracker #167 MVP-05(#161)의 최신 HEAD 릴리스 검증 증거. 과거 `release-mvp-b-final-check.md`(v0.2.0-mvp-b-rc1, 2026-06-14)는 historical 이며, 이 문서가 **새 태그 `v0.3.0-mvp.1`** 을 가리키는 현행 증거다.

검증은 2회 실행했다:

1. **§2 사전(pristine) 실행** — main 최신 커밋 `89d6564`(release baseline `0.3.0-mvp.1`, PR #169)와 byte-identical 한 무변경 워크트리에서. #161 이 요구한 "main 최신 커밋" 증거.
2. **§4 사후(post) 실행** — PR B 변경(#160 CI/engines/README/mode 정규화) 적용 후 같은 트리에서 재실행. 태그가 가리킬 최종 상태의 증거.

## 1. 실행 환경

| 항목 | 값 |
|---|---|
| 커밋 | `89d65640daeeb90816552fb84b75e3bad649b08c` (= origin/main HEAD, release baseline 0.3.0-mvp.1) |
| Node / npm | v24.15.0 / 11.12.1 |
| OS | Windows 11 Pro 10.0.26200 (Git Bash MINGW64, Node.js win32) |
| 트리 상태(사전 실행) | `git status --porcelain` 빈 출력 — 무변경 |

> 로컬 실행 환경(Windows + Node 24)은 이 PR 이 정의한 지원 표에서 **best-effort** 축이다. 계약 축(Ubuntu Node 20 hard gate, Ubuntu Node 24 · macOS Node 20 smoke)은 같은 커밋의 GitHub Actions `frontend-workflow-kit` workflow 가 검증한다 — main `89d6564` 의 `validate-example`(hard gate: validate 12종 + 멱등성 + `test:spec`)은 녹색.

## 2. 사전(pristine) 실행 — main HEAD `89d6564`, 변경 전

`frontend-workflow-kit/` 에서 순서대로 실행 (#161 권장 실행 그대로):

| # | 명령 | exit | 결과 |
|---|---|---|---|
| 1 | `npm ci` | 0 | OK |
| 2 | `npm test` | **1** | **702 tests: 694 pass / 1 fail / 7 skipped** — 실패 1건은 §3 (Windows 전용 원인 규명, 제품 회귀 아님). fixtures 하니스는 PASS(31 fixtures: 30 pass, 1 xfail, 0 fail) |
| 3 | `npm run example:validate` | 0 | `workflow:validate — OK (검사 12종 통과)` |
| 4 | `rm -rf ../dist/frontend-workflow-kit && npm run kit:pack` | 0 | `kit:pack wrote 181 files` |
| 5 | `find ../dist/frontend-workflow-kit -maxdepth 3 -type f \| sort` | 0 | 168 파일 (전체 183) — boundary 검사 §5, 누출 없음 |
| 6 | `node ../dist/frontend-workflow-kit/scripts/validate.mjs --help` | 1 | `ERR_MODULE_NOT_FOUND: yaml` — payload 는 node_modules 미동봉(§6) |
| 7 | `node ../dist/frontend-workflow-kit/scripts/telemetry.mjs --list-surfaces --json` | 1 | 상동 |

- 사전 payload manifest hash: `.kit-payload-manifest.json` sha256 = `899f2812c023ca8e6f581ba34e2efa91b6f76977540e0649eab7e0ab5911bc4e`
- 6·7 은 결함이 아니라 실행 방법 문제다 — packed payload 는 의도적으로 `node_modules` 를 동봉하지 않으며(README consumer 계약: vendor 후 `npm install`), payload 안에서 `npm ci` 후 재실행하면 통과한다(§4의 6·7). #161 의 명령 그대로의 1차 실행 결과를 정직하게 기록해 둔다.

## 3. 유일한 테스트 실패 1건 — 원인 규명 (Windows 전용, 제품 회귀 아님)

`upgrade-planner.test.mjs` › "end-to-end: a vendored packed kit upgrades cleanly against itself": identical vendored copy 인데 `plan.counts['local-modified']` 가 0 이 아니라 **2**.

- 대상 2파일: `scripts/create-input-artifact.mjs`(#154 에서 유입), `scripts/redteam.mjs`(red-team PR 에서 유입) — 저장소 전체에서 이 2개만 git index mode `100755`(나머지 CLI 26개는 전부 `100644`, shebang 은 모두 동일하게 있음).
- 메커니즘: pack 의 payload manifest 는 mode 를 **git index** 에서 읽는다(`kit-manifest.mjs` — "Windows fs stat 은 exec bit 를 잃으므로 git 이 cross-platform mode 정본"). 반면 upgrade-planner 는 vendored 트리의 현재 mode 를 **fs `statMode()`** 로 읽는다. Windows 에선 exec bit 가 없어 모든 파일이 `100644` 로 읽히고, sha256 3종(old/current/next)이 전부 동일한데도 manifest mode `100755` ↔ fs `100644` 불일치로 `local-modified` 로 분류된다.
- 판정: **환경(Windows) 특이 + index mode 비일관성이 원인. 제품 회귀 아님.** 같은 커밋의 Ubuntu CI(`test:spec` hard gate 는 이 e2e 를 포함)는 exec bit 가 보존되어 통과.
- 조치(PR B 포함): 두 파일의 index mode 를 `100644` 로 정규화(`git update-index --chmod=-x`, **파일 내용 무변경** — diffstat 0 lines). 나머지 26개 CLI 와 일관되고, 문서화된 호출 방식(`npm run` / `node script.mjs` / npm bin shim)은 exec bit 에 의존하지 않는다. §4 에서 동일 e2e 가 Windows 에서도 통과함을 확인.

## 4. 사후(post) 실행 — PR B 변경 적용 후, 같은 커밋 기반

적용된 변경: CI smoke job 2개(#160) · `engines >=20` + lock 동기화 · kit/루트 README 지원 표 · CHANGELOG 기록 · 위 mode 정규화 2건 · `readiness-eval.mjs` exit 경로 1건(§5.5 — macOS smoke 첫 실행이 검출, 커밋 2). 그 외 런타임 스크립트 내용 변경 없음. 아래 표는 커밋 2까지 적용된 최종 트리에서의 재실행 결과다.

| # | 명령 | exit | 결과 |
|---|---|---|---|
| 1 | `npm ci` | 0 | OK |
| 2 | `npm test` | **0** | **702 tests: 695 pass / 0 fail / 7 skipped** + fixtures PASS(31: 30 pass, 1 xfail) — §3 실패 해소 |
| 3 | `npm run example:validate` | 0 | `workflow:validate — OK (검사 12종 통과)` |
| 4 | `rm -rf ../dist/frontend-workflow-kit && npm run kit:pack` | 0 | `kit:pack wrote 181 files` |
| 5 | `find ../dist/frontend-workflow-kit -maxdepth 3 -type f \| sort` | 0 | 168 파일 (전체 183) — 누출 없음(§5) |
| 6 | `cd ../dist/frontend-workflow-kit && npm ci --omit=dev` | 0 | payload 자신의 lock 으로 deps 설치 (consumer 계약 재현) |
| 7 | `node ../dist/frontend-workflow-kit/scripts/validate.mjs --help` | 0 | 실행됨 — §6 관찰 참고 |
| 8 | `node ../dist/frontend-workflow-kit/scripts/telemetry.mjs --list-surfaces --json` | 0 | surface registry JSON 정상 출력 (`route-cross-check` 등) |

- 사후 payload manifest hash: `.kit-payload-manifest.json` sha256 = `a407ca5861985a28bd0ea686336893f4b86a92b0785952da66f944f5f2b8fcce`
  (사전 `899f2812…` 대비 변경 요인: `package.json` engines, README 지원 표, 2파일 mode `100755`→`100644`, `readiness-eval.mjs` exit 경로 §5.5 — 전부 PR B 의도 변경분)
- `readiness-eval.mjs --json` 무결성 재확인: 8,326B 전체 출력 `JSON.parse` OK, exit 0.
- packed `package.json`: `version 0.3.0-mvp.1`, `engines.node >=20` 확인. manifest 의 두 스크립트 mode `100644` 확인.
- 7 skipped 는 Windows 에서 symlink 권한 부재 시 junction/skip 으로 우아하게 처리되는 테스트들(#154 설계 그대로) — Ubuntu/macOS CI 에서는 실행된다.

## 5. payload boundary 검사

full listing(183 파일, node_modules 제외) 에 대해 개발 전용 패턴 검사 — **매치 0**:

- `kit-dev/` · `examples/`(테스트 fixture) · `temp/` · `docs/design/` · `docs/workflows/` · research/dogfood/investigation 문서: 전부 부재.
- top-level 구성은 allowlist 그대로: `scripts/ catalog/ policies/ presets/ schemas/ templates/ skills/ docs/(reference) package.json package-lock.json package-scripts.template.json README.md COMMANDS.md CONVENTIONS.md distribution-manifest.yaml LICENSE .kit-payload-manifest.json _distribution-summary.json`.
- `scripts/test-fixtures.mjs`·`scripts/lib/test-fixture.mjs` 는 allowlist 된 runtime `scripts/` 디렉터리의 하니스 코드이며 fixture **데이터** 누출이 아니다(fixture 데이터인 `examples/` 는 제외 확인).

## 5.5 macOS smoke 첫 실행이 검출한 실제 갭 (수정 포함)

신설 `macos-smoke` 의 첫 PR 실행에서 `distribution.test.mjs` › "packed eval and telemetry run with bundled default readiness cases" 가 실패했다 — `readiness-eval.mjs --json` 의 stdout 이 8,192B 에서 잘려 `Unterminated string in JSON at position 8192`.

- 원인: `readiness-eval.mjs` 가 8,326B JSON 을 `process.stdout.write()` 직후 `process.exit(0)` — stdout 이 pipe 이고 pipe buffer 가 8KB 인 macOS 에서 초과분 flush 전에 프로세스 종료. Linux(64KB buffer)·로컬 Windows 에서는 미발현이라 Ubuntu hard gate 는 계속 녹색이었다. **#160 이 지적한 "선언 지원 범위 > 실제 검증 범위" 갭의 실측 사례** — macOS job 이 첫 실행에서 잡아냈다.
- 조치(PR B 커밋 2): 마지막 `process.exit(0)` → `process.exitCode = 0`(자연 종료가 pending write 를 flush). usage/input error exit 2 계약 무변경. 수정 후 macos-smoke 녹색 확인.
- 잠재 클래스: 같은 `write(JSON…) + process.exit(0)` 패턴이 8개 CLI(check-generated-files, doc-drift, doctor, route-cross-check, upgrade-vendored-kit, workflow-packet, workflow-report, workflow-run)에 더 있으나 현재 기본 출력이 전부 8KB 미만이라 미발현. 릴리스 동결 원칙에 따라 관측된 1건만 수정하고 나머지는 후속 이슈 후보로 기록한다.

## 6. 관찰 (이번 릴리스 비차단)

- `validate.mjs` 는 `--help` 핸들러가 없어 unknown flag 를 조용히 무시하고 기본 validate 를 실행한다(docs 부재 시 cold-start 경고 + vacuous pass, exit 0). `telemetry.mjs` 는 `--help` 를 지원. packed CLI smoke 계약 확장은 이미 #166(IMP-05, Post-MVP) 범위 — 거기서 다룬다.
- Windows 는 이번 PR 로 지원 표에 **명시적 best-effort(미지원)** 로 기록되었다. 본 문서의 로컬 실행이 Windows 에서 전 항목 통과했으나 이는 계약이 아니다.

## 7. go / no-go

| # | 수용 기준 (#161) | 상태 |
|---|---|---|
| 1 | 최신 release commit 에서 `npm ci`·`npm test`·example validate·kit pack 성공 | ✅ §4 전 항목 exit 0 (사전 실행의 유일 실패는 §3 에서 원인 규명·해소) |
| 2 | payload boundary 검사 성공 | ✅ §5 누출 0 |
| 3 | release-check 가 과거 RC 가 아니라 새 태그를 가리킴 | ✅ 이 문서 = `v0.3.0-mvp.1` (front-matter `release`) |
| 4 | 태그 생성 후 release note 와 source commit 일치 | ⏳ 태그는 PR B 병합 커밋에 생성(§8) — CHANGELOG `0.3.0-mvp.1` 섹션이 release note |

**판정: GO** — 단 태그/push 는 PR B 병합 후 사람 몫(tracker #167: "PR B 가 통과한 commit 에 태그").

## 8. exact tag command (PR B 병합 후, merge commit 에서)

```bash
git checkout main && git pull --ff-only
git tag -a v0.3.0-mvp.1 -m "frontend-workflow-kit 0.3.0-mvp.1 — MVP closure release baseline

Feature scope frozen at release baseline 0.3.0-mvp.1 (tracker #167). Hard gates:
workflow:validate structural checks (12) + readiness decision_cap + CI idempotency
git-diff, all green on this commit (Ubuntu + Node 20). Advisory surfaces
(forbidden-paths, golden fixtures, route-cross-check, doc-drift, eval, telemetry,
redteam, visual, adoption, policy-draft) stay warning-first — promotion requires a
separate Open Decision.

Support contract (#160): engines node >=20 (18 is EOL, never CI-verified);
CI = hard gate Ubuntu+Node20, smoke Ubuntu+Node24 and macOS+Node20 (#154-type
symlink/realpath + packed-kit spawn focused). Windows: explicit best-effort.

Release evidence (#161): temp/runs/release-0.3.0-mvp.1-final-check.md —
npm test 702 (695 pass / 7 platform-skip), example:validate 12/12, kit:pack 181
files, payload boundary clean, packed CLI smoke pass after payload npm ci."
git push origin v0.3.0-mvp.1
```
