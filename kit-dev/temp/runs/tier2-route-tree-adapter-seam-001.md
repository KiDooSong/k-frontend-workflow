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

## Codex 리뷰 반영 (2026-06-16)

- **MAJOR-1 (코어가 결정성 소유):** 이전엔 정렬이 어댑터(`scanAppDir`)에만 있고 코어는 받은 순서를 그대로 렌더했다 → 미정렬 커스텀 어댑터가 비결정적 출력 가능. **수정:** `route-core.normalizeRouteTree`(파일 먼저·이름 UTF-16 순·재귀)를 추가하고 `renderRouteTree` 가 렌더 전에 항상 호출. 이미 정렬된 expo 입력에는 no-op → route-tree 골든 byte-identical. custom 픽스처는 일부러 미정렬을 반환해 코어 정규화를 골든으로 고정(about→index). 테스트 S5 추가.
- **MAJOR-2 (CLI 입력 게이트):** 이전엔 CLI 가 어댑터 로드 전에 `src/app` 존재를 무조건 강제 → 코드 정의 커스텀 어댑터가 발견 전에 막힘. **수정:** 입력 디렉토리 검증을 `expo-router.discover`(FC-5, 부재 시 throw)로 이관하고, CLI 는 사전 `isDir` 게이트를 제거한 뒤 `discover` 오류를 exit 2 로 잡는다. 디렉토리가 필요 없는 커스텀 어댑터는 더 이상 막히지 않는다(검증: `--router <custom>` 가 src/app 없이 exit 0; expo 부재 `--app` 은 여전히 exit 2). 테스트 S6 추가.
- (mild) custom 픽스처의 `expected/route-tree.txt` 는 코어 정규화 결과(about→index)로 재생성. expo 골든은 불변.

### 2차 리뷰 MINOR 반영

- **MINOR-1 (CLI 헤더 오해 소지):** 커스텀 `--router` 실행도 헤더가 기본 `--app src/app` 명령을 찍어 오해 소지가 있었다. **수정:** 기본 `expo-router` 는 정본(canonical) 헤더 그대로(골든 byte-identical), 커스텀 router 면 헤더가 실제 어댑터를 반영(`Source: router-adapter: <arg>`, `Command: … --router <arg> …`). custom 골든을 CLI 로 재생성해 CLI-재현 가능하게 맞추고 S3 를 정합.
- **MINOR-2 (이름-vs-경로 휴리스틱):** 구분자/확장자 기반 분류가 확장자 없는 경로(`my-router`)나 점 포함 이름(`expo.router`)을 오분류할 수 있었다. **수정:** CLI 휴리스틱 제거. `loadRouterAdapter` 가 문자열을 **매니페스트 이름 우선 → 아니면 파일 경로**로 해소하고, 둘 다 아니면 fail-closed(등록 어댑터+시도 경로 모두 메시지에 표기). 테스트 S7 추가.
- 2차 검증: `npm test` 37 pass(S1~S7) · `example:test` 26 fixtures · `example:validate` OK · expo 골든 byte-identical · 커스텀 `--router <path>` exit 0(정직한 헤더) · `my-router`(이름·파일 모두 아님) exit 2.

## 후속 (이 PR 범위 밖 — 설계 §16/§17 잔여)

- **PR-3:** codegen-core + `openapi-client` 어댑터 + codegen 매니페스트/출력경로/hook 네이밍(§7·§8·§9). 본 PR 미구현.
- **OD-4/§6:** ScreenSpec `route` ↔ 어댑터 rawPath cross-check(현재 미구현 — route-tree.mjs:3 의 "후속 PR" 유지).
- **OD-10:** `adapters` config 의 최종 물리 위치(project-layout.yaml vs 소비 프로젝트 루트). preset(expo-feature) 의 `adapters` 기본값 묶기는 소비 솔기가 정해진 뒤.
- **생성물 가드 정합:** route-tree `source:`/`command:` 어댑터-인식, `V1_REPRODUCE` codegen 계약 등록(§17 PR — 데이터-드리븐, hard gate 승격 없음).
