---
title: "consumer-dogfood-001 실행 보고"
kind: run-report
run_id: consumer-dogfood-001
packet_id: WP-HOME-001-screen-skeleton-001
fixture: "C:/Users/thdrl/source/repos/dogfood-expo-001 (create-expo-app sdk-56, baseline 2ed60d8)"
readiness_source: "node tools/frontend-workflow/scripts/readiness.mjs --json (2026-06-14)"
kit_source_commit: "4601347 (origin/main)"
date: 2026-06-14
status: done
---

# Run Report: consumer-dogfood-001

[consumer-dogfood-001-plan.md](../../plans/consumer-dogfood-001-plan.md) 의 dry-run 을 **실제로 실행**한 결과. fresh Expo 프로젝트(킷 레포 밖)에 킷을 vendoring 하고 `state → readiness → Work Packet → implement-screen → validate → forbidden-paths(경고)` 를 게이트 천장 안에서 완주했다. 정상 진행(HOME-001=screen-skeleton)과 게이트 거절(PROFILE-001=docs-only) 두 시나리오를 한 run 에서 확인.

- 소비 프로젝트(ephemeral): `C:/Users/thdrl/source/repos/dogfood-expo-001` (킷 레포 **밖** · 자체 git repo).
- 킷 소스: `origin/main` `4601347` 의 `frontend-workflow-kit/` (vendored copy).
- 판정 단일 출처: `readiness.mjs` 출력 (소비만).

## Summary
| Step | 내용 | 결과 |
|---|---|---|
| 1 setup | `create-expo-app@latest --no-install` (sdk-56) | ✅ **`src/` 레이아웃 확인**(src/app·src/components/ui) — 정책 경로 가정 HOLDS. baseline `2ed60d8` |
| 2 copy | scripts/catalog/policies/schemas/templates/skills/package*.json → `tools/frontend-workflow` | ✅ examples/*.html/설계*.md 제외. `npm install` yaml 1개(617ms) |
| 3 merge | 4 `workflow:*` alias → 소비자 `package.json` | ✅ `npm run workflow:validate` 실측 동작(아래 7) |
| 4 bootstrap | nav-map(draft) + HOME-001 stub + PROFILE-001 stub(D-301) | ✅ 최소 부트스트랩 |
| 5 state/readiness/validate | — | ✅ HOME-001=screen-skeleton·PROFILE-001=docs-only·validate exit 0 |
| 6 Work Packet | `WP-HOME-001-screen-skeleton-001.md` | ✅ readiness 글자-복사·링크-only |
| 7 implement-screen (A) | `HomeScreen.tsx` shell | ✅ 1파일·과구현 0·발명 0·validate exit 0 |
| 7 implement-screen (B) | PROFILE-001 docs-only | ✅ **거절 정답** — src 변경 0 |
| 8 forbidden-paths | warning-only | ✅ A=OK exit 0 · sub-check=경고1 exit 0 |

부가: **모든 게이트 신호가 plan 의 기대와 일치.** 멱등·하드룰 준수 확인.

## Environment
- OS: Windows 11 · Node `v24.15.0` · npm `11.12.1` · git (CRLF 환경)
- Expo: `expo-template-default@sdk-56`, `expo ~56.0.11`, `expo-router ~56.2.10`, `react-native 0.85.3`
- 킷 소스 커밋: `4601347` (origin/main) — "검사 12종" 동기화(#10) 포함

## Copy Manifest (Step 2)
```txt
복사함:   scripts/(+lib) catalog/ policies/ schemas/ templates/ skills/ package.json package-lock.json
복사 안 함: examples/ *.html 설계*.md node_modules/
설치:     npm install --prefix tools/frontend-workflow → "added 1 package"(yaml) in 617ms
```
※ `tools/frontend-workflow/node_modules` 는 소비자 `.gitignore`(node_modules) 가 덮어 **커밋 제외** — 소비자가 로컬 install. 스크립트는 작업트리의 yaml 로 동작.

## Readiness Used (소비만, 재계산 없음)
```jsonc
"HOME-001":    { readiness_mode: "screen-skeleton", next_mode: "rough-fixture-ui",
                 allowed_paths: ["src/features/home/screens/**"],
                 forbidden_paths: ["src/api/**","openapi.yaml"],
                 blocking: [screen_spec_authored:false, component_catalog:false, fake_hook:false, ...] }
"PROFILE-001": { readiness_mode: "docs-only", next_mode: "route-skeleton",
                 allowed_paths: ["docs/frontend-workflow/**"], forbidden_paths: ["src/**"],
                 blocking head: open_decision D-301 (blocking_mode route-skeleton, owner PM) }
```
실행: `node tools/frontend-workflow/scripts/readiness.mjs --docs docs/frontend-workflow --json` (소비자 루트 기준).

## Files Changed
- `src/features/home/screens/HomeScreen.tsx` — screen-skeleton 셸 1개(impl 커밋 `878fd33`). allowed_paths 안.
- (Scenario B) PROFILE-001 — **변경 없음**(docs-only 거절 → `src/features/profile` 미존재 확인).

## Commands Run (exit code)
```bash
npx create-expo-app@latest ../dogfood-expo-001 --no-install      # EXIT 0 (sdk-56)
npm install --prefix tools/frontend-workflow                     # EXIT 0 (yaml 1)
npm run workflow:state -- --date 2026-06-14                      # EXIT 0 → _meta/*.yaml
npm run workflow:readiness -- --json                            # EXIT 0
npm run workflow:validate                                       # EXIT 0 → "OK (검사 12종 통과)"
node .../forbidden-paths.mjs --base <SETUP> --root <consumer>    # EXIT 0 (OK)
```
※ `validate` 출력 라인은 코드 기준 **"검사 12종 통과"**(README 옛 "9종"은 stale — origin/main `4601347` 에서 동기화됨). `npm run workflow:validate` 도 동일 출력·exit 0 으로 실측(alias 매핑 `node tools/frontend-workflow/scripts/validate.mjs` 확인).
※ 에이전트 셸 cwd 가 킷 레포라, 정본 실행은 vendored 스크립트에 `--docs/--src/--root` 를 명시했다(소비자 루트에서의 `npm run workflow:*` 와 결과 동일 — alias 도 실측).

## Result
- **Scenario A**: `screen-skeleton` 천장 안에서 화면 shell 1개 생성, `validate` exit 0. 정답.
- **Scenario B**: `docs-only` cap → **구현 거절이 정답**, src 변경 0(빈 diff). 실패 아님 — 설계된 신호.

## Gate Compliance
| 하드룰 | 확인 | 근거 |
|---|---|---|
| 킷 레포 무수정 | ✅ | 소비 프로젝트는 킷 레포 **밖**(`repos/dogfood-expo-001`). 킷은 vendored copy 만. |
| API endpoint 발명 금지 | ✅ | `src/api/**`·`openapi.yaml`·fetch/axios/DTO 0건. shell 은 `<View/>` 만 |
| Open Decision/Conflict/Unknown 미닫힘 | ✅ | D-301 `open` 유지(닫지 않음). candidate→confirmed 승격 0 |
| readiness gate 무시 금지 | ✅ | 변경 ⊆ `src/features/home/screens/**`. PROFILE-001 docs-only 거절 |

## Diff Summary (BASELINE 2ed60d8 .. IMPL 878fd33)
```txt
ADDED:
  docs/frontend-workflow/app/navigation-map.md
  docs/frontend-workflow/domains/home/screens/home/screen-spec.md
  docs/frontend-workflow/domains/profile/screens/profile-edit/screen-spec.md
  docs/frontend-workflow/_meta/{workflow-state,screen-inventory}.yaml      # 생성물
  tools/frontend-workflow/**                                               # vendored 킷(node_modules 제외)
  work-packets/WP-HOME-001-screen-skeleton-001.md
  src/features/home/screens/HomeScreen.tsx                                 # impl (SETUP..HEAD 단독)
MODIFIED:
  package.json                                                            # workflow:* 4 alias 병합
REMOVED:
  (none)
```
※ 경계 검증은 diff 로(validate 아님). `SETUP(107aa39)..HEAD` = `A src/features/home/screens/HomeScreen.tsx` 단독 — 커밋 후라 backstop 이 실제로 본 diff(헛통과 아님).

## forbidden-paths 출력 (warning-only)
```txt
8a) --base 107aa39(SETUP) --root <consumer>  → "OK (guarded surface 위반 없음)"  EXIT 0
    guarded surface: openapi.yaml, openapi.yml, src/api/**
8b) --base 2ed60d8(BASELINE)                  → "OK (guarded surface 위반 없음)"  EXIT 0
8c) sub-check: src/api/dummy.ts (커밋) --base SETUP → "1 건 위반(경고)"            EXIT 0
    reason: guarded(src/api/**) 인데 어떤 화면도 api-integrated-ui 미도달 (최고 모드: screen-skeleton)
    (warning-first: --enforce 없이는 exit 0) → 이후 커밋 폐기(reset --hard, HEAD=878fd33)
```
**Codex 리뷰 픽스 실증**: 8a/8c 가 의미를 가지려면 구현을 **커밋**해야 한다. 커밋했기에 `--base` diff 가 HomeScreen 을 봤고 sub-check 가 발화했다 — 미커밋/untracked 였다면 둘 다 invisible(헛통과)였을 것. plan §Step8 선행2·§7 함정표대로.

## Blockers Reported (readiness 그대로)
- HOME-001: rough-fixture-ui 진입 막힘 — `screen_spec_authored=false`·`component_catalog=false`·`fake_hook=false`. screen-skeleton 까지만.
- PROFILE-001: `D-301`(프로필 편집 범위 미확정, route-skeleton, PM) open → docs-only cap. next_action: **사람이 D-301 resolve** 후 readiness 재실행.

## Idempotency
- `workflow:state` 2차 실행 후 `workflow-state.yaml` **byte-identical**(sha256 동일). HomeScreen 추가는 `src/features/home/screens/` 라 `fake_hook`(hooks/) 불변 → 모드 불변.
- `readiness`/`validate` 재실행 동일(exit 0). 작업트리 IMPL 에서 clean.

## Follow-up
- HOME-001 → rough-fixture-ui 승격 전제(사람/후속): 본문 작성 + `design/component-catalog.md` + `src/features/home/hooks/*.ts` + `src/lib/asyncState.ts` 계약.
- PROFILE-001: **사람이 D-301 resolve** → readiness 재실행 → route-skeleton+ Work Packet 재발급.
- 소비 프로젝트 `dogfood-expo-001` 는 ephemeral — 보관 불필요(이 보고가 증거). 재현은 이 보고 + plan 으로.

## Kit-applicability Findings (이 dry-run 의 진짜 산출물)
1. ✅ **`src/` 가정 HOLDS** — Expo sdk-56 default 템플릿이 `src/app`·`src/components/ui` 기반. plan Step1 함정 해소(실측).
2. ✅ **소비자 적용이 가볍다** — create-expo-app `--no-install` + 킷 copy + yaml 1개(617ms)면 게이트 루프 동작. 킷 스크립트는 순수 Node+yaml 이라 Expo 런타임/대형 install 불필요.
3. ✅ **`npm run workflow:*` alias 실측 동작** — `validate` 가 소비자 루트에서 `node tools/frontend-workflow/scripts/...` 로 해석·실행, exit 0.
4. ✅ **"검사 12종" 정합** — origin/main `4601347` 에 동기화 반영. plan 의 9-vs-12 주의가 해소된 상태.
5. ✅ **Codex 픽스(커밋 선행) 유효** — 실측으로 헛통과/미발화를 재현 회피. plan 반영분이 실전에서 정확.
6. ⚠️ **forbidden-paths 호출 위치** — 소비자 repo **밖**에서 호출하면 `--root <consumer>` 로 git cwd 를 지정해야 한다(소비자 루트에서 직접 `npm run` 하면 불필요). 문서화됨.
7. ⚠️ **CRLF** — Windows 에서 vendored 킷·docs 에 LF→CRLF 경고(git). 동작 무해(스크립트 정규화). 소비자에 `.gitattributes` 권고 후보.
8. 💡 readiness `blocking`/`next_actions` 가 "rough 도달에 무엇이 필요한지"를 구체적으로 나열 — DX 양호.

> 결론: **plan 의 모든 Must-cover 신호가 실측으로 재현됐다.** 킷은 fresh Expo 소비 프로젝트에 그대로 적용 가능하며, screen-skeleton 정상 진행과 docs-only 거절이 모두 정답대로 동작한다.
