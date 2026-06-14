# consumer-dogfood-001 — 실측 증거 (evidence)

[run-report.md](../run-report.md) 의 주장(게이트 신호·검증·diff·멱등)을 **독립 확인**할 수 있도록, 소비 프로젝트(`dogfood-expo-001`, 킷 레포 밖)에서 **실제로 생성/출력된** 산출물 스냅샷이다. Codex 리뷰의 한계 지적 **P1(소비 실행값이 리포트 주장)·P2(생성 `_meta` 범위 밖)** 를 닫는다.

| 파일 | 무엇 | 핵심 |
|---|---|---|
| `workflow-state.yaml` | `npm run workflow:state` 생성물(복사) | `navigation_map_status: draft`, `stub_screen_specs_count: 2`, HOME/PROFILE 화면별 derived facts(`fake_hook_exists:false` 등) |
| `screen-inventory.yaml` | `workflow:state` 생성물(복사) | screen_id/route 인벤토리(중복 0) |
| `readiness.json` | `readiness.mjs --json` 실제 출력 | **HOME-001=screen-skeleton** / **PROFILE-001=docs-only**(D-301) + allowed/forbidden/blocking |
| `validate.txt` | `validate.mjs` 실제 출력 | `OK (검사 12종 통과)` exit 0 |
| `git-diff-baseline-to-impl.txt` | 소비 repo `git diff --name-status 2ed60d8..878fd33` | 변경 경로 = vendored 킷 + docs + `src/features/home/screens/HomeScreen.tsx`(impl) |
| `forbidden-paths-clean.txt` | `forbidden-paths --base 107aa39(SETUP)` | `OK (guarded surface 위반 없음)` exit 0 (커밋된 screens-only diff) |
| `forbidden-paths-subcheck.txt` | 의도적 `src/api/dummy.ts` **커밋 후** 동일 검사 | `1 건 위반(경고)` + warning-first **exit 0** (이후 폐기) |
| `environment.txt` | 실행 환경 | node/npm/Expo sdk-56/킷 커밋/consumer SHA(BASELINE·SETUP·IMPL) |

> 주의: 소비 프로젝트 자체는 ephemeral(보관 안 함)이라 이 스냅샷이 그 실행의 정본 증거다. 생성물의 `generated_at` 는 `--date 2026-06-14` 고정값. 경로 경계 검증은 validate 가 아니라 **diff**(forbidden-paths) 로 본다.
