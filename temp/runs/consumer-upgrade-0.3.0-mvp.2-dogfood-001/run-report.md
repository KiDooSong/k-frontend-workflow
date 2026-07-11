---
title: "consumer vendored-kit 0.3.0-mvp.2 업그레이드 dogfood"
kind: dogfood-run
release: v0.3.0-mvp.2 (candidate)
consumer: dogfood-expo-001 (로컬 dogfood Expo consumer — consumer-dogfood-001 에서 킷을 vendoring 한 실제 소비 repo)
consumer_branch: kit-upgrade/0.3.0-mvp.2 (별도 worktree, 원본 체크아웃 무접촉)
kit_payload: kit:pack @ release-cut commit bf7705c (package_version 0.3.0-mvp.2)
date: 2026-07-12
verdict: PASS (local modification 유실 0 · 잘못된 prune 0 · invalid JSON 0 · exit-code drift 0)
status: historical
---

# consumer vendored-kit 업그레이드 dogfood — 0.1.0-mvp-a(unmanaged) → 0.3.0-mvp.2

`v0.3.0-mvp.2` release candidate 의 실제 consumer 업그레이드 검증. 대상은 실제 vendored consumer
`dogfood-expo-001`(2026-06-14 consumer-dogfood-001 run 에서 킷을 `tools/frontend-workflow/` 로
vendoring, 이후 HOME-001 화면 작업이 얹힌 Expo 프로젝트)이고, 원본 체크아웃은 건드리지 않고
별도 branch/worktree(`kit-upgrade/0.3.0-mvp.2`)에서 수행했다. 모든 명령 exit code 와 산출물은
[evidence/](evidence/) 에 있다.

## 1. 기존 baseline 확인

- `.kit-install-manifest.json` / `.kit-payload-manifest.json` **둘 다 부재** — manifest 도입(#108)
  이전에 vendoring 된 **unmanaged baseline**.
- vendored `package.json` version: `0.1.0-mvp-a` (tracked 파일 29개 — core scripts/lib + templates +
  catalog/policies/schemas + implement-screen skill).
- source_ref/version 은 manifest 가 없어 기록에 없음 — planner 가 `current ref: unknown` 으로 정직하게 보고.

## 2. planner dry-run (계획 기록)

`upgrade-vendored-kit --current tools/frontend-workflow --next <packed 0.3.0-mvp.2> --dry-run` — exit **0**.
plan: [evidence/upgrade-plan-dry-run.md](evidence/upgrade-plan-dry-run.md) ·
[evidence/upgrade-plan-dry-run.json](evidence/upgrade-plan-dry-run.json)

| count | 값 | 파일 |
|---|---|---|
| safe update | **0** | (unmanaged baseline 에선 설계상 safe-update 불가) |
| mode update | 0 | — |
| local modified | **0** | — |
| conflict | **29** | 기존 tracked 29개 전부 (baseline 을 증명 못 해 보수적으로 conflict 분류) |
| new file | 157 | 0.1.0-mvp-a 이후 추가된 script/lib/docs/skills/templates 전부 |
| orphan (removed upstream) | **0** | — |
| missing current | 0 | — |
| unknown local | **0** | — |
| unchanged | 0 | — |

planner warning(예상대로): "No installed manifest found. … Differing files are reported as
conflicts and require manual review. After a successful apply, future upgrades will be manifest-based."

## 3. 보수적 apply — local modification 무접촉 + conflict incoming 생성 확인

`--apply` (기본 안전 모드 — `--prune`/`--allow-conflicts`/`--force-runtime` 전부 OFF), exit **0**.
[evidence/apply-conservative.stdout.txt](evidence/apply-conservative.stdout.txt)

- new-file 157개 추가, install manifest 신설 (`next ref: bf7705c…`).
- **local 파일 덮어쓰기 0** — apply 직후 `git status` 에서 기존 29개 파일 modified 0건 확인.
- **conflict 29건 전부 `.upgrade-conflicts/<path>.incoming` 으로 생성됨** (자동 병합 없음) — 29/29 확인.
- prune 없음(orphan 0), consumer `docs/frontend-workflow/**`·앱 소스·루트 설정 무접촉.

## 4. 사람 리뷰 → conflict 해소 (take-incoming)

리뷰 근거: consumer 의 vendor commit(`107aa39`) 이후 `tools/frontend-workflow/**` 에 대한
`git diff 107aa39..HEAD` 가 **빈 diff** — 이 consumer 는 vendored kit 을 한 번도 로컬 수정하지
않았다. 따라서 29건 conflict 는 전부 "unmanaged baseline 이라 증명 불가" 분류이지 실제 로컬
변경이 아니며, **전건 take-incoming(upstream 채택)** 으로 해소했다 — 파일별 before/after sha256:
[evidence/conflict-merge-take-incoming.txt](evidence/conflict-merge-take-incoming.txt).

> 참고(안전 모드 관찰): unmanaged baseline 에서 safe-update 는 구조적으로 0 이므로 "safe update 만
> apply" 는 이 시나리오에서 "new-file 추가 + incoming 생성"과 같다. incoming 채택은 위 근거로
> 사람이 결정했다.

해소 후 재-dry-run([evidence/dry-run-after-merge.txt](evidence/dry-run-after-merge.txt)):
baseline `install-manifest`, **unchanged 186 / 나머지 전부 0** — 수렴 확인. 이후 업그레이드는 manifest 기반.

## 5. vendored kit `npm ci`

`tools/frontend-workflow` 에서 `node_modules` 제거 후 `npm ci` — exit **0** (payload 자신의 lockfile).

## 6. consumer root 검증 명령 (before → after)

before(구 킷, 원본 체크아웃에서 read-only 만 실행) / after(업그레이드 worktree). 전부 exit code 기록.

| 명령 | before exit | after exit | 결과 |
|---|---|---|---|
| `workflow:readiness` | 0 | 0 (`-- --json`) | HOME-001 `screen-skeleton`·PROFILE-001 `docs-only` — **판정 drift 없음** ([before](evidence/before-readiness.txt) / [after JSON](evidence/after-readiness.json), 2,506B 전체 `JSON.parse` OK) |
| `workflow:validate` | 0 | 0 | 양쪽 모두 `OK (검사 12종 통과)` ([before](evidence/before-validate.txt) / [after](evidence/after-validate.txt)) |
| `workflow:doctor` (신규 alias) | n/a | 0 | warning-only: role-glob 4건 + policy-draft info ([after](evidence/after-doctor.txt)) — §7 분류 |
| `workflow:state` | (원본 무접촉 위해 미실행) | 0 | `_meta` 재생성 — diff 는 §6.1 |
| `workflow:telemetry -- --json` (신규 alias) | n/a | 0 | default 3 surface 전부 `available:true`, 680B `JSON.parse` OK ([after](evidence/after-telemetry.json)) |

`workflow:doctor`/`workflow:telemetry` alias 는 `package-scripts.template.json` 계약 그대로 consumer
`package.json` 에 추가(수동 도입 행위 — planner 는 루트 설정을 건드리지 않음, upgrade-notes 의 Manual action).

### 6.1 before/after `_meta` diff

[evidence/meta-before-after.diff](evidence/meta-before-after.diff): `workflow-state.yaml` 에
Tier3 layer fact 5종(`api_client_present`/`domain_component_present`/`hook_present`/`route_entry_present`/`screen_present`)
이 화면별로 **추가**되고 `generated_at` 갱신 — additive 만, 기존 fact 값 변화 0. `screen-inventory.yaml` 내용 diff 0.
readiness 판정(§6 표)도 불변 — 구 킷과 새 킷이 같은 문서에 같은 모드를 낸다.

## 7. warning-first finding 분류 (자동 NO-GO 아님)

| finding | 분류 | 근거 |
|---|---|---|
| doctor `role-glob` warning 4건 (`api_client`/`api_schema`/`domain_component`/`hook` glob 매치 0) | **expected** — consumer 상태 관측 | 이 consumer 는 아직 해당 레이어 파일을 만들지 않았다(HOME-001 skeleton 단계). 업그레이드 결함 아님 |
| doctor `policy-draft-ready` info | **expected** | 정보성 안내 |
| telemetry doc-drift surface `warning_count: 2` (`broken-relative-link`) | **kit 후속 후보** | planner 가 쓰는 `_upgrade/upgrade-plan-<ref>.md` 가 `docs/reference/upgrade-notes.md` 본문을 embed 하면서 상대 링크(`input-reconciliation.md` 등)가 plan 파일 위치 기준으로 깨짐. 업그레이드 자체는 무해(관측 전용) — kit repo 후속 이슈 후보로 기록 |

## 8. 경계 준수

- Open Decision resolve / `confirmed` 승격 / conflict register close: **수행 안 함** (PROFILE-001 의
  open D-PROFILE-001 이 before/after 동일하게 cap 유지).
- consumer visual surface: 이 consumer 는 visual-consistency-contract 미채택 — opt-in 관측 대상 없음(skip).
- 원본 체크아웃(`dogfood-expo-001`): before 캡처(read-only)만 실행, `git status` 클린 유지.
- 업그레이드 결과는 consumer 브랜치 `kit-upgrade/0.3.0-mvp.2` 커밋 `1970a68` 로 보존.

## 9. 판정

**PASS** — NO-GO 조건 4종 전부 미발생: local modification 유실 0(§3·§4), 잘못된 prune 0(prune 미사용·orphan 0),
invalid JSON 0(readiness/telemetry/plan JSON 전부 parse OK), exit-code drift 0(§6 표).
warning-first finding 은 §7 로 분류·기록.
