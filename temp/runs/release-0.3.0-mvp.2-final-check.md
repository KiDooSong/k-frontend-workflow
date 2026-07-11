---
title: "0.3.0-mvp.2 릴리스 최종 체크 (post-MVP 안정화 release cut)"
kind: release-check
release: v0.3.0-mvp.2
branch: claude/v0-3-0-mvp-2-rc-810882
base_commit: 7eb06ec
issues: ["#171", "#172", "#173", "#174", "#175", "#176"]
date: 2026-07-12
verdict: GO (태그는 검증된 Release PR 병합 커밋에 사용자 승인 후 생성 — pending)
status: current
---

# 0.3.0-mvp.2 릴리스 최종 체크 — post-MVP 안정화 release cut

`v0.3.0-mvp.1`(2026-07-11, MVP 종료 baseline) 이후 main 에 랜딩된 post-MVP 안정화 변경
(#170~#176)을 `0.3.0-mvp.2` 로 묶는 release candidate 의 검증 증거. 직전 현행 증거였던
[release-0.3.0-mvp.1-final-check.md](release-0.3.0-mvp.1-final-check.md) 는 이 PR 에서
historical 로 강등되었다. **범위: 새 기능·새 artifact axis·warning-first→hard 승격 0 —
hard gate / warning-first 경계는 `0.3.0-mvp.1` release note 그대로.**

## 1. 실행 환경

| 항목 | 값 |
|---|---|
| base commit | `7eb06ec` (= origin/main HEAD, #176 까지 랜딩) |
| release-cut commit | `bf7705c` (버전/CHANGELOG/roadmap/README 정합 — 이 트리에서 검증 실행) |
| Node / npm | v24.15.0 / 11.12.1 |
| OS | Windows 11 Pro 10.0.26200 (Git Bash MINGW64, Node.js win32) |

> 로컬 실행 환경(Windows + Node 24)은 지원 표의 **best-effort** 축이다. 계약 축(Ubuntu Node 20
> hard gate + Ubuntu Node 24 / macOS Node 20 smoke)은 같은 브랜치의 GitHub Actions
> `frontend-workflow-kit` workflow 가 Release PR 에서 검증한다.

## 2. 킷 검증 실행 (`frontend-workflow-kit/`)

| # | 명령 | exit | 결과 |
|---|---|---|---|
| 1 | `npm ci` | 0 | OK |
| 2 | `npm test` | 0 | **769 tests: 762 pass / 0 fail / 7 skipped** + fixtures PASS(31: 30 pass, 1 xfail, 0 fail). 7 skipped 는 Windows symlink 권한 부재 시 우아한 skip(#154 설계) — Ubuntu/macOS CI 에서 실행됨 |
| 3 | `npm run example:state` | 0 | `_meta` 재생성 — 커밋본과 byte-identical (`git status` 무변경, 멱등성) |
| 4 | `npm run example:readiness` | 0 | next-action 출력 정상 |
| 5 | `npm run example:validate` | 0 | `workflow:validate — OK (검사 12종 통과)` |
| 6 | `rm -rf ../dist/frontend-workflow-kit && npm run kit:pack` | 0 | `kit:pack wrote 186 files` |
| 7 | `node scripts/doc-drift.mjs --include release-consistency --now 2026-07-12` | 0 | release-consistency drift finding **0** (package version ↔ CHANGELOG heading ↔ roadmap snapshot 정합). 기존 INFO 2건(examples README 상대 링크 scan-root 이탈)만 — info-only |

## 3. packed payload 검증 (`dist/frontend-workflow-kit/`)

release-cut commit `bf7705c` 에서 재-pack 한 payload 기준.

| # | 명령 | exit | 결과 |
|---|---|---|---|
| 1 | `npm ci --omit=dev` | 0 | payload 자신의 lockfile 로 deps 설치 (consumer 계약 재현) |
| 2 | `node scripts/workflow-state.mjs --help` | 0 | usage 출력 (#176 신설 help) |
| 3 | `node scripts/readiness.mjs --help` | 0 | usage 출력 (#176 신설 help) |
| 4 | `node scripts/validate.mjs --help` | 0 | usage 출력 (#175 신설 help — mvp.1 §6 관찰 항목 해소 확인) |
| 5 | `node scripts/telemetry.mjs --list-surfaces --json` | 0 | surface registry JSON 1,215B 전체 `JSON.parse` OK |

- payload manifest: `.kit-payload-manifest.json` — `package_version: 0.3.0-mvp.2` ·
  `source_ref: bf7705c…`(release-cut commit) · files 186 확인. sha256 =
  `1fba6b7ce64c884e4e9d1c54faf056338240a084cd45c644e508d57071425920`
- packed `package.json`: `version 0.3.0-mvp.2` · `engines.node >=20` 확인.

## 4. payload boundary 검사 — 매치 0

payload full listing(186 payload 파일 + manifest/summary, node_modules 제외)에 대해:

- 경로 패턴 `kit-dev/` · `examples/` · `temp/` · `docs/design/` · `docs/workflows/` · `docs/research/`
  (개발용 design/research/dogfood 문서): **매치 0**.
- 내용 패턴 absolute local path(`C:\Users`·`/Users/…`·사용자명)·민감 consumer/Figma 원본
  (`figma.com/file`·consumer-ck 계열 식별자): **매치 0**.
- top-level 은 allowlist 그대로: `scripts/ catalog/ policies/ presets/ schemas/ templates/ skills/
  docs/(reference) package.json package-lock.json package-scripts.template.json README.md COMMANDS.md
  CONVENTIONS.md distribution-manifest.yaml LICENSE .kit-payload-manifest.json _distribution-summary.json`.

## 5. 실제 consumer 업그레이드 dogfood — PASS

실제 vendored consumer(`dogfood-expo-001`, 0.1.0-mvp-a unmanaged vendoring)의 별도
branch/worktree 에서 이 payload 로 planner dry-run → 보수적 apply → 사람 리뷰 take-incoming →
`npm ci` → doctor/state/readiness/validate/telemetry 전부 exit 0. local modification 유실 0 ·
잘못된 prune 0 · invalid JSON 0 · exit-code drift 0. 상세·evidence:
[consumer-upgrade-0.3.0-mvp.2-dogfood-001/run-report.md](consumer-upgrade-0.3.0-mvp.2-dogfood-001/run-report.md).

warning-first finding 분류(자동 NO-GO 아님): doctor role-glob 4건(consumer 상태, expected) ·
doc-drift `broken-relative-link` 2건 — planner 의 `_upgrade/upgrade-plan-<ref>.md` 가 embed 한
upgrade-notes 상대 링크가 plan 파일 위치 기준으로 깨지는 kit 후속 이슈 후보(관측 전용, 릴리스 비차단).

## 6. go / no-go

| # | 수용 기준 | 상태 |
|---|---|---|
| 1 | release-cut 트리에서 `npm ci`·`npm test`·example 3종·`kit:pack` 성공 | ✅ §2 전 항목 exit 0 |
| 2 | packed payload `npm ci --omit=dev` + core/telemetry CLI smoke 성공 | ✅ §3 전 항목 exit 0 |
| 3 | payload boundary 검사(경로·내용 패턴) 매치 0 | ✅ §4 |
| 4 | pack manifest `package_version`/`source_ref` 정합 | ✅ §3 (0.3.0-mvp.2 / release-cut commit) |
| 5 | 실제 consumer 업그레이드 dogfood — NO-GO 조건 4종 미발생 | ✅ §5 PASS |
| 6 | release-check `status: current` 정확히 1건 + 직전 current 강등 | ✅ 이 문서 = current, mvp.1 → historical (같은 PR) |
| 7 | 태그는 검증된 Release PR 병합 커밋에만, 사용자 승인 후 | ⏳ pending — PR 병합 후 사람 승인 시 생성 |

**판정: GO** — warning-first finding 은 §5 분류로 기록(자동 NO-GO 아님). 태그/push 는 사용자
명시 승인 후 병합 커밋에 수행한다.

## 7. exact tag command (병합 후, 사용자 승인 시)

```bash
git checkout main && git pull --ff-only
git tag -a v0.3.0-mvp.2 -m "frontend-workflow-kit 0.3.0-mvp.2 — post-MVP stabilization

Scope: #171 warning-first promotion evidence policy, #172 doc-drift
release-consistency opt-in, #173 evidence retention/index policy, #174 packed
payload CLI smoke, #175 CLI stdout flush-safe exit + validate argument contract,
#176 core workflow-state/readiness argument contract. No new features, no new
artifact axes, no warning-first promotions — hard gate / warning-first boundary
unchanged from 0.3.0-mvp.1.

Release evidence: temp/runs/release-0.3.0-mvp.2-final-check.md — npm test 769
(762 pass / 7 platform-skip), example validate 12/12, kit:pack 186 files, payload
boundary clean, packed CLI smoke pass, real consumer vendored-kit upgrade dogfood
PASS (temp/runs/consumer-upgrade-0.3.0-mvp.2-dogfood-001/)."
git push origin v0.3.0-mvp.2
```
