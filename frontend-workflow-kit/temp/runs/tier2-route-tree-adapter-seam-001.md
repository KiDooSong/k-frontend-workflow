# Run report — Tier2 route-tree adapter seam 구현 (PR-2)

> **Status: IMPLEMENTATION — 2026-06-15.** 설계 `temp/proposals/tier2-router-codegen-adapter.md` §17 PR-2(route-tree 어댑터 솔기)를 구현한다. route-tree 로직을 **core(결정성 렌더) vs adapter(발견)** 경계로 분리하고, 기본 `expo-router` 어댑터가 현 `scanAppDir` 와 동치임을 **route-tree 골든 byte-identical** 로 고정한다. codegen 어댑터는 구현하지 않으며(설계 §17 PR-3 으로 유지), nav-graph/validate/readiness 는 어댑터를 소비하지 않는다.

## 무엇을 구현했나 (어댑터=발견, 코어=결정성)

| 구성 | 파일 | 역할 |
|---|---|---|
| router 어댑터(내장) | `scripts/adapters/routers/expo-router.mjs` (신규) | Expo Router `src/app` 파일트리 *발견* 만 — `discover(ctx)` = 이전 `scanAppDir` 동치. 파일 쓰기/정렬/렌더 안 함. `scanAppDir`/`computeRoute` 도 export. |
| 어댑터 매니페스트 | `scripts/adapters/routers/manifest.json` (신규) | `{ "expo-router": { "module": "./expo-router.mjs" } }` — 새 어댑터=매니페스트 1줄+모듈 1개(코어 변경 0). |
| 결정성 코어 | `scripts/lib/route-core.mjs` (신규) | `renderRouteTree`/`ROUTE_COL`(이전 lib/route-tree 에서 이관) + `loadRouterAdapter`(이름/`{module}`/객체 해소 + version 검사 + fail-closed `RouterAdapterError`). |
| 하위호환 shim | `scripts/lib/route-tree.mjs` (재작성) | core/adapter 를 그대로 재노출 — 기존 `import { scanAppDir, renderRouteTree } from './lib/route-tree.mjs'` 경로를 안 깬다(vendored copy 보호). |
| CLI 솔기 | `scripts/route-tree.mjs` (재작성) | `--router <name\|module-path>`(기본 `expo-router`) 선택 → `loadRouterAdapter` → `adapter.discover({appDir})` → `renderRouteTree`. 어댑터 로드 실패는 exit 2(fail-closed). |
| 최소 custom 픽스처 | `examples/router-adapter/minimal-custom/` (신규) | 코드 정의 라우트를 발견만 하는 커스텀 어댑터 + 코어 렌더 골든(설계 §13). 단위 테스트 입력(실제 트리 미동반). |
| 솔기 회귀 테스트 | `scripts/lib/route-core.test.mjs` (신규, `package.json` test 에 배선) | S1 discover==scanAppDir · S2 expo 렌더 골든 byte-identical · S3 커스텀 어댑터 해소·렌더 · S4 fail-closed(미지 이름/version 불일치/discover 부재). |

## 핵심 불변식 보존

- **default expo-feature/expo-router byte-identical:** 기본 어댑터 discover() 가 `scanAppDir` 와 동치 → `examples/route-tree/{basic-app,edge-cases}` 골든을 byte-identical 재현(harness GV:content `일치` + 수동 `diff` 동일). golden 재생성 안 함(§12).
- **경계 유지:** 어댑터는 발견만, 코어가 정렬/렌더/쓰기 독점. 어댑터는 파일을 쓰지 않는다.
- **fail-closed(FC-1/FC-2/FC-3):** 미지 어댑터 이름·부재/로드실패 모듈·version 불일치는 `RouterAdapterError` → CLI exit 2(조용한 폴백·빈 트리 추측 금지).
- **codegen 미구현:** codegen-core/openapi-client 으로 확장하지 않음(설계 §17 PR-3 으로 유지).
- **nav-graph/validate/readiness 불변:** 어댑터를 직접 소비하지 않는다(설계 §10·§11). manifest/policy/CI/preset/project-layout 무수정. hard gate 승격 없음.

## 실행한 검증과 결과 (worktree: feat/tier2-route-tree-adapter-seam, base main@4e6977e)

```
npm test               → 33 unit pass / 0 fail · test-fixtures 26 fixtures(25 pass, 1 xfail)
npm run example:validate → workflow:validate — OK (검사 12종 통과)
npm run example:test    → test-fixtures — PASS (26 fixtures: 25 pass, 1 xfail) · route-tree 골든 일치
```

추가 수동 검증:
- 기본 경로: `route-tree.mjs --app examples/route-tree/{basic-app,edge-cases}/src/app` → 커밋 골든과 `diff` **byte-identical**.
- fail-closed: `--router no-such` → `router 어댑터 로드 실패: 알 수 없는 router 어댑터 'no-such'`, **exit 2**.
- custom 어댑터: `--router examples/router-adapter/minimal-custom/my-router.mjs` → **exit 0**, 트리 본문이 custom 골든과 동일(헤더 `# Source/# Command` 만 CLI 고정값으로 다름 — 의도된 동작; 단위 테스트 S3 가 custom 헤더까지 정확 재현).

## 변경 파일

- `scripts/adapters/routers/expo-router.mjs` (신규) · `scripts/adapters/routers/manifest.json` (신규)
- `scripts/lib/route-core.mjs` (신규) · `scripts/lib/route-core.test.mjs` (신규)
- `scripts/lib/route-tree.mjs` (재작성 — 재노출 shim) · `scripts/route-tree.mjs` (재작성 — CLI 솔기)
- `examples/router-adapter/minimal-custom/**` (신규 — my-router.mjs · expected/route-tree.txt · README)
- `package.json` (test/test:spec 에 route-core.test.mjs 배선)
- `temp/runs/tier2-route-tree-adapter-seam-001.md` (본 run report)

## 후속 (이 PR 범위 밖 — 설계 §16/§17 잔여)

- **PR-3:** codegen-core + `openapi-client` 어댑터 + codegen 매니페스트/출력경로/hook 네이밍(§7·§8·§9). 본 PR 미구현.
- **OD-4/§6:** ScreenSpec `route` ↔ 어댑터 rawPath cross-check(현재 미구현 — route-tree.mjs:3 의 "후속 PR" 유지).
- **OD-10:** `adapters` config 의 최종 물리 위치(project-layout.yaml vs 소비 프로젝트 루트). preset(expo-feature) 의 `adapters` 기본값 묶기는 소비 솔기가 정해진 뒤.
- **생성물 가드 정합:** route-tree `source:`/`command:` 어댑터-인식, `V1_REPRODUCE` codegen 계약 등록(§17 PR — 데이터-드리븐, hard gate 승격 없음).
