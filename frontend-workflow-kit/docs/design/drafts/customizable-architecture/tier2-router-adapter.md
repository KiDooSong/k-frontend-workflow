# Tier 2 — Router / Codegen Adapter — design

> Status: DESIGN / SPEC ONLY. 2026-06-14. router/codegen 처럼 프레임워크 *의미*를 펼러그인화하는 설계.
> 딥리서치(2026-06-14, 23 소스 → 112 주장 → 25 검증 → **22 confirmed / 3 refuted**)에 근거하며,
> 인용은 §Appendix. **구현이 아니다** — `route-tree.mjs`/`nav-graph.mjs`/`scripts/lib/*`/골든 픽스처
> 변경을 지시하지 않는다. 상위: [README.md](README.md). 짝: [tier1-layout-profile.md](tier1-layout-profile.md).

---

# 0. Scope / Non-goals

- **설계만** 산출. `route-tree.mjs`·`nav-graph.mjs`·`scripts/lib/route-tree.mjs`·`examples/route-tree/**`
  골든 픽스처를 **수정하지 않는다**. 아래 모든 변경은 **PROPOSED (future PR)**.
- 티어2는 **의미(semantics)만** 다룬다. 경로 바인딩은 [티어1](tier1-layout-profile.md).
- 결정성 계약(byte-identical 멱등)은 **약화하지 않는다** — 오히려 어댑터 도입의 1순위 제약이다(§6).

---

# 1. 문제 — 경로 설정으로 안 풀리는 것

`scripts/route-tree.mjs`(+`scripts/lib/route-tree.mjs`)는 단순 경로가 아니라 **파일트리를 라우트로
투영하는 규칙**을 인코딩한다(route-tree.mjs:2-3 "정본은 src/app 파일 트리"). **정확히는(Codex 정정):**
현재 `computeRoute`(lib/route-tree.mjs:24-32)는 라우트 그룹 `(tabs)` 과 동적 세그먼트 `[id]` 를
**정규화하지 않고 raw 로 보존**하는 *결정적 raw 투영*이다 — 완전한 URL 정규화가 아니다. 이 구분은
§4·§6 에서 중요해진다(정규화하면 골든 출력이 바뀐다). 같은 문제를 다른 프레임워크는 다르게 푼다:

| 라우터 | 라우트의 출처 | 발견 방식 |
|---|---|---|
| Expo Router (현재) | `src/app/**` 파일트리 | 파일 워크 |
| Next.js App Router | `app/**` 파일트리 | 파일 워크 (다른 규칙: `page.tsx`/`layout.tsx`/route groups) |
| React Router | **코드** (`createBrowserRouter([...])`) | 코드 파싱 (파일트리 없음) |
| TanStack Router | 파일트리 **또는** 코드 (혼합) | 둘 다 |

→ 글롭만 바꿔선 "파일트리에서 *발견*" vs "코드로 *정의*" 패러다임을 못 건넌다. 어댑터 솔기가 필요하다.

---

# 2. 리서치 근거 — 성숙한 도구의 두 솔기

딥리서치 결론: 성숙한 멀티프레임워크 도구는 경로 설정이 아니라 **두 솔기 중 하나**로 의미를 펼러그인화한다.

1. **리졸버/어댑터 인터페이스** — 새 프레임워크가 인터페이스를 구현.
   vite-plugin-pages `PageResolver` (`resolveModuleIds`/`resolveExtensions`/`resolveRoutes`/`getComputedRoutes`
   + `stringify`/`hmr` 훅). [§Appendix S1]
2. **변경 가능한 단일 route 트리 노드** — 훅/플러그인이 트리를 명령형으로 재작성.
   unplugin-vue-router `EditableTreeNode` (`insert`/`delete`/`children`/`components`/`addToMeta`),
   `beforeWriteFiles(root)` 솔기로 노출. [§Appendix S4]

보강 발견:
- **generouted** = 프레임워크 무관 코어 + 얇은 라우터별 통합 패키지. 단방향(파일트리=단일출처).
  **하지만 정식 플러그인 API 가 없어** 채택자가 코어를 리버스엔지니어링해야 함 → **반면교사**. [S3]
- **TanStack virtual file routes** = 코드가 *실 on-disk 파일*을 참조해 트리를 구성.
  `physical(urlPrefix, dir)` 로 파일스캔을 코드정의 트리의 한 노드로 마운트. 파일+코드를
  **서브트리 단위로 혼합**. → 파일↔코드 화해의 레퍼런스. [S5, S6]
- **Nx** = generator `(tree, options) => void`(가상 FS 직접 변경, RxJS·부분적용 버림),
  "preset"은 별도 개념이 아니라 *`preset` 이름의 generator*, 등록은 선언적 JSON 매니페스트
  (`executors.json`: name→impl+schema). [S9, S10, S12]

---

# 3. config-선택-OR-플러그인-객체 유니온

가장 베껴쓸 만한 경계. vite-plugin-pages: `resolver: 'vue' | 'react' | 'solid' | PageResolver`.
문자열은 내장 리졸버를 고르고, 객체는 *동일한 인터페이스*를 구현하는 커스텀 플러그인 — 그리고 내장
이름은 로드시 같은 인터페이스로 정규화된다(`ResolvedOptions` 가 `resolver` 를 `PageResolver` 로 좁힘). [S1]

→ 킷의 커스터마이즈 파일 `project-layout.yaml` 의 `adapters.router` 를 정확히 이 모양으로. (이 파일은
티어1 `roles`/`domains`(config)와 티어2 `adapters`(plugin 선택)를 **함께** 담는다 — 두 티어는 *메커니즘*
구분이지 파일 구분이 아니다. README §1 의 노트 참고.)

```yaml
# project-layout.yaml 의 일부 (roles = 티어1, adapters = 티어2 — 같은 파일)
adapters:
  router: expo-router                  # 문자열 = 내장 어댑터 (manifest.json 경유)
  # 또는:
  # router: { module: ./tools/my-router.mjs }   # 커스텀 = RouterAdapter 구현 객체
```

---

# 4. 정규화 RouteNode (+ meta 탈출구)

**누수 교훈 (리서치 Q5 답):** vite-plugin-pages `getComputedRoutes` 는 **닫힌 유니온**
(`VueRoute | ReactRoute | SolidRoute`)을 반환한다 — 파일워크·코드젠은 펼러그인화됐지만 *in-memory
route 모델은 프레임워크 무관이 아니다*. 새 라우터는 기존 셰이프로 강제 변환해야 한다. 그리고
"보편 평탄 노드(`{path, component, name, children, meta}`)" 주장은 **0-3 으로 반박**됐다 — 어떤
도구도 단일 공유 cross-framework 노드 스키마를 갖지 않는다. [S1, §Caveats]

→ 권장: **정규화 코어 필드 + `meta` 탈출구.** LCD(최소공통분모) 손실을 `meta` 로 흡수한다.

```js
// 정규화 RouteNode (PROPOSED) — 코어가 소유하는 프레임워크 무관 모델
RouteNode = {
  segment:  string,          // 원시 세그먼트 토큰 (raw — 예: '[id]', '(tabs)')
  kind:     'static' | 'param' | 'splat' | 'optional' | 'group' | 'index' | 'layout',
  rawPath:  string,          // 현 computeRoute 와 동일한 raw 투영 (예: /coupons/[id]) ← 골든 재현 기준
  urlPath:  string | null,   // (옵션) 정규화 URL (예: /coupons/:id) — 어댑터가 채우면 사용, 기본 null
  file:     string | null,   // 실 on-disk 파일 참조 (순수 layout/group 은 null)
  children: RouteNode[],
  meta:     {},              // 프레임워크 고유 정보 보존 (닫힌 유니온 누수 회피)
}
```

`kind` 는 메타데이터로 *분류*만 하고 렌더링을 바꾸지 않는다. **결정성 정정(Codex):** 현재
`route-tree.txt` 는 `[id]`/`(tabs)` 를 raw 로 출력하므로, expo-router 어댑터가 **byte-identical
골든을 재현하려면 코어 렌더러가 `rawPath` 를 출력**해야 한다. `urlPath`(`:id` 정규화)는 *다른 출력*이라
별도 산출물/옵트인이지 기존 `route-tree.txt` 를 대체하지 않는다 — **렌더 경로의 단일 기준은 raw 투영**
이다(§6 와 정합). Next.js route group `(...)`, Expo `[...slug]` 등은 `segment`+`kind`+`meta` 로
손실 없이 표현된다. (리서치 openQuestion "최소 손실 노드"의 권장 셰이프.)

---

# 5. 어댑터 인터페이스 + 코어 분리

```js
// scripts/adapters/routers/expo-router.mjs  (PROPOSED) — 어댑터: 발견만. 쓰기·정렬 안 함.
export default {
  name: 'expo-router',
  version: 1,                          // 코어 호환 체크용 (§11 버저닝)
  // ctx = { layout, listFiles, readFile, conventions }
  //   layout       : 티어1 프로파일의 resolved roles (route_entry 글롭 등)
  //   conventions  : { routeToken, indexToken, ignore[] }  ← 순수 config 천장(§7)
  discover(ctx) {
    // role 'route_entry' 글롭 아래 파일트리 워크 → RouteNode[] 반환
    // 절대: 파일을 쓰지 않고, 정렬하지 않는다 (코어 책임)
  },
}
```

```js
// scripts/lib/route-core.mjs  (PROPOSED) — 프레임워크 무관. 결정성 독점.
export function normalize(nodes)              // 정렬(UTF-16)·dedup·검증 → 정규 트리
export function render(tree, { routeCol })     // 고정 컬럼, byte-identical 텍스트
export function writeArtifact(out, text)       // 쓰기 (PROPOSED: temp→rename 원자적; 현 util.writeFile 은 비원자적). 어댑터는 절대 안 호출
export function checkArtifact(out, text)       // ★ no-write diff: 다르면 exit 1 (CI 게이트). 현재 미존재 — 신규

```

```js
// scripts/route-tree.mjs  (PROPOSED 변형) — CLI: 선택 → 발견 → 방출
const sel = profile.adapters?.router ?? 'expo-router'
const adapter = typeof sel === 'string'
  ? loadBuiltin(sel)                                   // adapters/routers/manifest.json 경유
  : (await import(resolve(sel.module))).default        // 커스텀 플러그인 객체
const nodes = adapter.discover(ctx)                    // 프레임워크별
writeArtifact(out, render(normalize(nodes), { routeCol: 37 }))  // 코어가 결정성 보장
```

---

# 6. "어댑터는 발견, 코어는 결정성" — 가장 중요한 경계

딥리서치의 핵심 caveat: **연구된 어떤 라우팅 도구도 byte-identical 멱등을 보장하지 못한다.**
TanStack 이 "원자적 쓰기(temp→rename)"를 한다는 주장은 **0-3 으로 반박**됐고, Nx executor 의
`{success}` 균일 계약 주장도 **0-3 반박**됐다. 반면 `scripts/route-tree.mjs` 의 멱등성은
**결정적 내용**(UTF-16 정렬·고정 컬럼 `ROUTE_COL`·타임스탬프 없음)에서 나온다. **단(Codex 정정):
킷도 원자적 쓰기는 아직 없다** — 공유 `scripts/lib/util.mjs:142` `writeFile` 은 `mkdirSync`+
`writeFileSync` 직접 호출이다. 즉 **"byte-identical 결정성"(있음)과 "원자적 쓰기"(없음)는 별개**이고,
킷의 현재 우위는 *전자*다. [§Caveats]

→ **결정성을 어댑터에 위임하지 마라.** 펼러그인화하는 건 *discovery* 뿐이다. 정규화·정렬·렌더·쓰기는
코어가 독점한다. 어댑터 계약에 **"파일을 쓰지 않는다 / 정렬하지 않는다"**를 못박는다. 코어가 출력하는 건
§4 의 `rawPath` 투영이라 expo-router 골든이 byte-identical 로 재현된다.

추가로 두 가지를 코어가 *도입*하면 좋다 (**현재 없음 — PROPOSED**):
- **원자적 쓰기** (`writeArtifact` = temp→rename) — 부분 쓰기 방지. 현 `util.writeFile` 대체/확장.
- **check-mode** (`checkArtifact`, no-write diff) — 연구된 어떤 도구도 없는 기능(openQuestion #1).
  킷의 CI 게이트 철학엔 필수.

---

# 7. 파일 ↔ 코드 화해 (당신 문제의 핵심 답)

두 패러다임은 **한 트리에서 수렴**시킨다. 두 가지 검증된 메커니즘:

1. **단일 수렴점 (unplugin-vue-router)** [S4] — 파일기반 발견이 트리를 먼저 채우고, `beforeWriteFiles
   (root)` 안에서 코드정의 라우트를 *같은 트리*에 `insert(path, file)` / 기존을 `delete()` 하는
   **delete-then-reinsert**. 메인테이너 권장 솔기. → 킷의 `route-core` 에 동형의 후처리 훅을 두면
   코드정의 입력을 파일발견 트리에 합칠 수 있다.
2. **physical() 마운트 (TanStack)** [S5] — 코드로 트리를 구성하되 `physical(urlPrefix, directory)`
   로 파일스캔 서브트리를 한 노드로 마운트. 파일+코드를 **서브트리 단위 혼합**(전역 모드가 아니라).
   → **React Router 같은 코드정의 프로젝트도 일부 서브트리는 파일스캔으로** 처리 가능.

코드정의 라우터 어댑터의 `discover()` 는 (a) 라우트 설정을 파싱하거나, (b) physical() 스타일의
hybrid 설정을 받아 일부는 코드·일부는 파일스캔으로 RouteNode 를 산출한다.

---

# 8. 등록 매니페스트 (Nx executors.json 패턴)

새 어댑터를 코어 변경 없이 추가 가능하게: 선언적 JSON 매니페스트로 등록. [S12]

```json
// scripts/adapters/routers/manifest.json  (PROPOSED)
{
  "expo-router":  { "module": "./expo-router.mjs",  "schema": "./expo-router.schema.json" },
  "next-app":     { "module": "./next-app.mjs",     "schema": "./next-app.schema.json" },
  "react-router": { "module": "./react-router.mjs", "schema": "./react-router.schema.json" }
}
```

→ 새 라우터 = 매니페스트 항목 1줄 + 모듈 1개. `route-tree.mjs` 변경 0. Nx 에서 "preset"이 별도
개념이 아니라 *`preset` 이름의 generator*인 것처럼, 킷의 프리셋(티어1 §8)도 "특정 router+roles 묶음"의
**이름붙은 번들**일 뿐이다. (preset = config 가 고르는 curated 묶음, plugin = 인터페이스 구현 모듈.)

---

# 9. config / plugin / preset 경계 표

| 관심사 | 메커니즘 | 선례 |
|---|---|---|
| 디렉토리 레이아웃 (role→glob) | **Config** (티어1) | shadcn aliases |
| 라우트 네이밍 컨벤션 (index/layout 토큰, ignore) | **Config** (토큰) | TanStack `routeToken`/`indexToken` [S7] |
| 라우트 **발견 의미** (파일트리 워크 vs 코드 파싱) | **Plugin/Adapter** | vite-plugin-pages `PageResolver` [S1] |
| 파일↔코드 화해 | **변경가능 트리 노드** (단일 수렴점) | unplugin-vue-router · TanStack `physical()` [S4,S5] |
| 프레임워크별 기본값 묶음 | **Preset** (= 이름붙은 번들) | Nx preset-as-generator [S10] |
| 어댑터 등록/발견 | **JSON 매니페스트** (name→module) | Nx `executors.json` [S12] |
| **결정성** (정렬/포맷·결정적 쓰기; *원자적* 쓰기는 PROPOSED·현재 없음) | **코어 — 펼러그인화 금지** | (도구들은 미보장; 킷은 *결정적 내용*에서 앞섬) |

---

# 10. 영향 파일 / 마이그레이션 (PROPOSED, future PR)

| 종류 | 파일 | 변경 |
|---|---|---|
| new | `scripts/lib/route-core.mjs` | `route-tree.mjs` 에서 정규화·렌더·쓰기·check 추출 |
| new | `scripts/adapters/routers/{expo-router,next-app,react-router}.mjs` | 어댑터 |
| new | `scripts/adapters/routers/manifest.json` | 등록 매니페스트 |
| edit | `scripts/route-tree.mjs` | CLI: 프로파일 `adapters.router` 선택 → `discover` → core |
| edit | `catalog/artifact-manifest.yaml` | route-tree `source:`/`command:` 를 어댑터 인식하게 (생성물 가드 정합) |

**회귀 기준:** `expo-router` 어댑터 = 현 `route-tree.mjs` 스캐너와 동치이므로,
`examples/route-tree/{basic-app,edge-cases}` 의 `expected/route-tree.txt` 가 **byte-identical**
재현돼야 한다. 코어 추출은 동작 변경이 아니라 *구조 분리*다.

**생성물 가드 정합:** `temp/proposals/generated-file-guard-design.md` 의 헤더 검사는 생성물의
`Source:`/`Command:` 를 본다. 어댑터마다 source(`src/app/**` vs `app/**`)·command 가 달라지므로,
헤더가 **선택된 어댑터에 따라** 써져야 한다 — 가드 설계의 `header_command` 필드(거기서 PROPOSED)와
이 어댑터 선택을 연결한다.

---

# 11. Open decisions / 미검증 (정직한 한계)

- **`rawPath` vs `urlPath` 산출물 정체성 (Codex):** §4 는 expo-router 골든 재현을 위해 **렌더 기준을
  `rawPath`** 로 못박았다. 남는 질문: Next.js/React-Router 어댑터가 `urlPath`(정규화 `:id`)를 *1차
  출력*으로 원하면, 그건 expo `route-tree.txt` 와 **다른 산출물**로 분리해야 하는가(아마 예) —
  파일명/매니페스트 엔트리 정체성 결정 필요.
- **어댑터 버저닝:** 리서치 미해결(openQuestion #4). unplugin-vue-router 의 `files`→`components`
  필드 개명이 ad-hoc 였던 정황만. → `RouterAdapter.version` + 코어 호환 체크를 **직접 설계**해야 함(§5 에
  `version: 1` 자리 둠).
- **코드정의 라우터의 결정적 발견:** React Router 라우트 트리를 *결정적으로* 파싱하는 법(소스 순서 보존?
  정렬?)은 후속 과제. 파일트리는 정렬로 결정적이지만 코드 파싱은 AST 순회 순서 의존.
- **미검증 영역 (이번 리서치에서 살아남은 주장 없음):** shadcn `components.json` 의 config/plugin
  경계 구체값, Babel/ESLint/Vite/PostCSS 의 "preset = curated bundle" 패턴 세부, Expo/Next *내부*
  어댑터 인터페이스. → 별도 조사 필요. 현재 Expo-Router 스캐너(`scripts/lib/route-tree.mjs`)가
  로컬 레퍼런스.

---

# Appendix — 리서치 소스 (1차 우선, 2026-06-14 verbatim 검증)

- **S1** vite-plugin-pages `PageResolver` — https://github.com/hannoeru/vite-plugin-pages/blob/main/src/types.ts (primary)
- **S3** generouted (무관 코어 + 통합 패키지, 정식 플러그인 API 없음) — https://github.com/oedotme/generouted (primary)
- **S4** unplugin-vue-router `EditableTreeNode` / `beforeWriteFiles` — https://uvr.esm.is/guide/extending-routes · https://github.com/posva/unplugin-vue-router/discussions/368 (primary)
- **S5** TanStack virtual file routes (`physical()`, 서브트리 혼합) — https://tanstack.com/router/latest/docs/framework/react/routing/virtual-file-routes (primary)
- **S7** TanStack `routeToken`/`indexToken` (컨벤션=config) — https://tanstack.com/router/latest/docs/api/file-based-routing (primary)
- **S9** Nx ↔ Angular devkit 어댑터 shim — https://nx.dev/docs/technologies/angular/guides/nx-devkit-angular-devkit (primary)
- **S10** Nx preset = `preset` 이름 generator — https://nx.dev/docs/extending-nx/create-preset (primary)
- **S12** Nx `executors.json` 매니페스트 등록 — https://nx.dev/docs/extending-nx/local-executors · https://github.com/nrwl/nx/blob/master/packages/js/executors.json (primary)

**반박된 주장 (의존 금지):** TanStack 원자적 쓰기(0-3) · 보편 평탄 노드 스키마(0-3) · Nx executor `{success}` 균일 계약(0-3).
