> **Status: DESIGN / SPEC ONLY — 2026-06-15.** 이 문서는 Tier-2 어댑터 모델을 **router 에서 codegen(API client/hook 생성) 까지 확장**하는 설계 제안이다. **런타임 변경을 지시하지 않는다.** 코드/스크립트/매니페스트/CI/정책/생성물/골든 픽스처를 **지금 바꾸지 않으며**, 모든 변경은 *PROPOSED (future PR)* 로만 기술한다. 본 PR 의 산출물은 이 문서(설계)와 짝 run report 하나뿐이다. 이 문서는 기존 Tier-2 router 설계([customizable-architecture/tier2-router-adapter.md](../../docs/design/drafts/customizable-architecture/tier2-router-adapter.md))를 **재유도하지 않고 baseline 으로 인용**하며, 그것이 아직 다루지 않는 차원만 추가한다.
> **Update — 2026-06-19:** 사람 결정으로 OD-5/OD-6/OD-7 을 닫았다. 새 `api_generated` role 은 만들지 않고 기존 `roles.api_client` / `roles.hook` 을 사용한다. codegen generated artifact 는 endpoint/file 별 artifact 로 쪼개지 않고 **하나의 artifact 가 `outputs[]` 로 다중 산출물을 표현**한다. hook 출력은 domain-scoped `src/features/{domain}/hooks/**` 로 유지한다. generated ownership 은 "manifest-listed outputs + GENERATED marker/header" 의 교집합이며, validate/readiness/nav-graph 는 codegen adapter 를 직접 소비하지 않는다. CI/required check/hard gate/`--enforce` 승격은 하지 않는다.

# Tier 2 — Router / Codegen Adapter 확장 — design

하우스 스타일은 `temp/proposals/component-catalog-generation-source-contract.md` 와 `temp/proposals/generated-file-guard-design.md` 의 register-first / Options→Recommendation 형식을 따른다 (번호 매긴 섹션, 각 결정마다 Options a/b/c… + Recommendation + file:line). 모든 결정 섹션은 **Options considered** 와 **Recommendation (근거 + file:line)** 를 포함한다.

> **인용 경로 주의:** 본 문서가 참조하는 지원 문서/소스는 여러 위치에 흩어져 있다 — Tier-1/2 baseline 설계는 `frontend-workflow-kit/docs/design/drafts/customizable-architecture/{README,tier1-layout-profile,tier2-router-adapter}.md` 에, 가드 설계는 `frontend-workflow-kit/temp/proposals/generated-file-guard-design.md` 에, run reports 는 `frontend-workflow-kit/temp/runs/` 에 있다. 소스 코드는 `frontend-workflow-kit/scripts/**`. 아래 인용은 파일명 + 라인만으로 참조하며, 직접 열어 검증한 line 만 인용한다. 검증 못 한 주장은 **Unknown** 으로 표시한다.

---

## 0. Title / Purpose / Scope / Non-goals

### 0.1 Purpose

기존 Tier-2 router 설계(tier2-router-adapter.md)는 **router 의미의 펼러그인화**를 결정했다: discover-vs-core 솔기(§5·§6), 정규화 `RouteNode` + `meta` 탈출구(§4), 파일↔코드 화해(§7), 등록 매니페스트(§8), "어댑터=발견, 코어=결정성"(§6). 그 문서는 **티어 차원에서 "router/codegen"을 함께 명명하지만, 구체 계약은 router 에만 집중**한다 — codegen-구체 계약(아래 차원들)은 비어 있다. 본 문서는 task 가 요구하는 그 **새 차원**을 baseline 위에 얹는다:

1. **codegen 절반** — router 가 아니라 *API client/hook* 을 생성하는 어댑터 (baseline 미커버, §3·§7·§8·§9).
2. **server/client 경계** — RSC/`'use client'` 같은 의미를 RouteNode 가 어떻게 담는가 (baseline 미커버, §4).
3. **link/navigation API** — 어댑터가 navigation primitive 를 어떻게 노출/검증하는가 (§5).
4. **ScreenSpec `route` frontmatter ↔ 어댑터 정규화 rawPath/urlPath** 의 화해 (§6 — 중요).
5. **validate 검사 ↔ 어댑터** 관계, **nav-graph 가 어댑터를 직접 소비하는가** (§10·§11).
6. **default expo-feature 어댑터 BYTE-동치 유지** + 최소 custom-adapter 픽스처 (§12·§13).
7. **fail-closed 조건** — 어댑터/codegen 이 추측 대신 거부해야 하는 지점 (§14).

핵심 원칙(baseline 계승): **어댑터는 *발견(discovery)* 만 한다. 정규화·정렬·렌더·쓰기·결정성은 코어가 독점한다** (tier2-router-adapter.md:161-163). codegen 으로 확장해도 이 경계는 약화되지 않는다 — codegen 어댑터도 *무엇을 생성할지 모델만 산출*하고, 결정적 직렬화/쓰기는 코어가 한다.

### 0.2 Scope (이 PR 이 다루는 것)

- 이 설계 문서 **하나** + 짝 run report 하나. (의도 경로: `temp/proposals/tier2-router-codegen-adapter.md`, `temp/runs/tier2-router-codegen-adapter-001.md`.)
- baseline router 설계를 **인용**하고, codegen·server/client·link API·ScreenSpec 화해·validate/nav-graph 관계를 *기술*한다.
- Tier-1 layout-profile 경계(role→glob, single `resolvedLayout`)와 **일관성**을 명시한다 (README.md:61-74, tier1-layout-profile.md:33-53).

### 0.3 Non-goals (HARD CONSTRAINTS — 명시적 비목표)

아래는 **지금 수행하지 않으며**, 최대한 *PROPOSED future-PR step* 으로만 기술된다:

- **NG-1** `scripts/route-tree.mjs` / `scripts/lib/route-tree.mjs` / `scripts/lib/nav-graph.mjs` / `scripts/validate.mjs` 를 바꾸지 않는다. 현재 `route-tree.mjs:22` `scanAppDir(appDir)` 직접 호출 구조는 그대로 둔다.
- **NG-2** `scripts/lib/route-core.mjs` / `scripts/adapters/**` / `scripts/codegen-gen.mjs` 등 어떤 어댑터·코어·codegen 코드도 만들지 않는다 (스켈레톤·스텁 일체 금지).
- **NG-3** `catalog/artifact-manifest.yaml` 을 바꾸지 않는다. route-tree `source:`/`command:` 의 어댑터-인식 변경은 **future PR**.
- **NG-4** `policies/project-layout.yaml` 에 `adapters.router`/`adapters.codegen` 키를 추가하지 않는다. preset(`presets/expo-feature.yaml`)도 바꾸지 않는다 — 현재 `roles:` 만 있고 `adapters:` 없음 (expo-feature.yaml:5-14).
- **NG-5** `package.json` / `package-scripts.template.json` 에 어떤 alias 도 추가하지 않는다.
- **NG-6** CI(`.github/workflows`)를 바꾸지 않는다. warning-first → hard gate 승격 없음.
- **NG-7** `examples/route-tree/{basic-app,edge-cases}` 의 golden(`expected/route-tree.txt`)을 바꾸지 않는다. custom-adapter 픽스처는 **별도 dogfood PR** (§13).
- **NG-8** 생성물 가드(`check-generated-files.mjs`)를 구현/재설계하지 않는다. `V1_REPRODUCE` 의 codegen 계약 등록은 **future PR**.
- **NG-9** ScreenSpec `route` frontmatter 의미론(`templates/screen/screen-spec.template.md:6` "라우트의 단일 출처")을 바꾸지 않는다. nav-graph/validate 의 EXACT route 매칭(nav-graph.mjs:122,138; validate.mjs:231,245)도 불변.
- **NG-10** Open Decision/Unknown/Conflict 을 resolve 하지 않는다. 본 설계가 표면화하는 미결 질문은 전부 OD-n/Unknown 으로 남긴다.

---

## 1. Baseline 인용 — 무엇을 재사용하고 무엇을 추가하는가

baseline router 설계(tier2-router-adapter.md)에서 **그대로 계승**(재유도 금지):

| baseline 개념 | 위치 | 본 문서의 처리 |
|---|---|---|
| config-선택-OR-플러그인-객체 유니온 (`router: 'expo-router' \| {module}`) | tier2-router-adapter.md:61-77 | codegen 으로 **동형 확장** (§3) |
| 정규화 `RouteNode` (`segment/kind/rawPath/urlPath/file/children/meta`) | tier2-router-adapter.md:91-102 | 재사용. server/client 는 `meta` 로 흡수 (§4) |
| "어댑터=발견, 코어=결정성" + rawPath 가 렌더 단일기준 | tier2-router-adapter.md:104-109,151-163 | codegen 코어에도 **동일 경계 적용** (§7) |
| 파일↔코드 화해 (단일 수렴점 / physical 마운트) | tier2-router-adapter.md:172-185 | router 한정 — 인용만, 재설계 X |
| 등록 매니페스트 (Nx executors.json 패턴) | tier2-router-adapter.md:189-204 | codegen 매니페스트로 **병렬 확장** (§8) |
| 어댑터 버저닝 `version: 1` + 코어 호환 체크 | tier2-router-adapter.md:117,249-251 | codegen 어댑터에도 적용 (§8) |
| route-tree 가 어댑터 직접 소비 (CLI: 선택→discover→core) | tier2-router-adapter.md:140-147 | 재사용. nav-graph 소비 여부는 **본 문서 §11 이 결정** |

**본 문서가 추가하는 새 차원** (baseline 이 티어 차원에서 명명만 하고 구체 계약을 비워둔 부분): codegen client/hook 생성(§3·§7·§8·§9), server/client 경계(§4), link/navigation API(§5), ScreenSpec route 화해(§6), validate↔어댑터(§10), nav-graph 직접소비 여부(§11), codegen 출력경로/hook 네이밍(§9), fail-closed(§14).

---

## 2. 용어 정리 — preset(expo-feature) vs router-adapter(expo-router)

> task 가 명시 요구한 화해점. baseline 은 내장 router 어댑터를 `expo-router` 로 부르고(tier2-router-adapter.md:116-127), 킷 preset 은 `expo-feature` 다(expo-feature.yaml:1). 둘은 **다른 층위**다.

### Options considered
- **(2a) preset = adapter 묶음의 별칭** — preset 이 곧 어댑터. → 틀림. preset 은 Tier-1 *role→glob* 만 담는다 (expo-feature.yaml:7-14 에 `roles:` 만 있고 `adapters:` 없음). 어댑터는 Tier-2 의미.
- **(2b) preset = role 묶음 + 어댑터 선택의 *이름붙은 번들*** — Nx "preset = preset 이름 generator" 패턴 (tier2-router-adapter.md:202-204). preset 이 `roles` (Tier-1) 와 `adapters` (Tier-2) 를 함께 묶는 curated bundle.
- **(2c) 둘을 합쳐 단일 `expo` 이름으로 통일** — 혼란 감소하나, README 가 "두 티어는 *메커니즘* 구분(config vs plugin)이지 파일 구분이 아니다"(README.md:52-54)라고 못박은 것과 충돌. 층위를 지우면 안 됨.

### Recommendation — **(2b): `expo-feature` = preset(번들 이름), `expo-router` = 그 번들이 고르는 router 어댑터.**

정확한 관계 (PROPOSED 최종형, 지금 적용 안 함):
- **preset `expo-feature`** = Tier-1 `roles` (현 expo-feature.yaml:7-14) **+** (PROPOSED 추가) `adapters.router: expo-router` **+** (PROPOSED 추가) `adapters.codegen: <기본 codegen 어댑터>`. 즉 "Expo Router + feature-folder + 그에 맞는 router/codegen 어댑터"의 curated 번들.
- **router 어댑터 `expo-router`** = `src/app/**` 파일트리를 RouteNode[] 로 발견하는 모듈. 현재 그 로직은 `scanAppDir`/`computeRoute` 에 산다 (lib/route-tree.mjs:26-70).

따라서 task 의 "default expo-feature 어댑터 byte-identical 유지"는 두 문장으로 분해된다:
1. **preset `expo-feature`** 를 기본으로 쓰면 → router 어댑터 `expo-router` 선택 → 현 `scanAppDir` 와 동치인 discovery → `examples/route-tree/{basic-app,edge-cases}/expected/route-tree.txt` **byte-identical 재현** (회귀 기준; baseline tier2-router-adapter.md:232-234, golden 실측 basic-app/expected/route-tree.txt:1-12).
2. codegen 어댑터는 아직 **출력 산출물이 없으므로**(catalog/route-tree 처럼 커밋된 golden 부재) byte-동치 회귀 대상이 아직 없다 — codegen golden 은 첫 codegen 생성기와 함께 들어온다 (§9·§13, "no diff gate before the first real generator" 선례 generated-file-guard-design.md:92).

근거: preset 파일이 현재 `roles:` 만 담고 `adapters:` 가 없다는 사실(expo-feature.yaml:5-14)이 (2a)를 반증한다. baseline 이 `adapters.router` 를 `project-layout.yaml` 에 둔다고 했고(tier2-router-adapter.md:67-77), preset 은 그 파일의 *기본값 번들*이므로 (2b)가 baseline 과 정합한다.

---

## 3. config 유니온의 codegen 확장 — `adapters.codegen`

**Decision:** router 와 같은 config-선택-OR-플러그인 유니온을 codegen 에 적용한다.

### Options considered
- **(3a) codegen 을 router 어댑터 안에 합침** (한 어댑터가 route + client 둘 다) — 응집 높으나, 한 프로젝트가 Expo Router 를 쓰면서 API client 는 OpenAPI codegen, orval, custom 으로 제각각일 수 있어 **router 패러다임과 codegen 패러다임이 독립 축**이다. 합치면 N×M 어댑터 폭발.
- **(3b) 별도 `adapters.codegen` 축** — router 와 직교. `adapters.router: expo-router` + `adapters.codegen: openapi-client` 처럼 독립 선택. vite-plugin-pages 의 `resolver` 유니온(tier2-router-adapter.md:63-65)을 codegen 에 동형 적용.
- **(3c) codegen 을 Tier-1 config 로** (role→glob 만으로) — 불가. codegen 은 "스키마/엔드포인트에서 *무엇을* 어떻게 생성하느냐"는 **패러다임 의미**라 role 글롭 치환의 천장을 넘는다 (README.md:56-59 "토큰/프리픽스 파라미터화가 순수 설정의 천장").

### Recommendation — **(3b): `adapters.codegen` 을 router 와 독립한 별도 어댑터 축으로.**

```yaml
# project-layout.yaml 의 일부 (PROPOSED — 지금 추가 안 함, NG-4)
adapters:
  router:  expo-router          # 문자열 = 내장 router 어댑터 (baseline §3)
  codegen: openapi-client       # 문자열 = 내장 codegen 어댑터  ← 본 문서 추가 축
  # 또는 커스텀:
  # codegen: { module: ./tools/my-codegen.mjs }   # CodegenAdapter 구현 객체
```

근거: baseline 이 `adapters.router` 를 정확히 이 모양으로 뒀고(tier2-router-adapter.md:71-77), 같은 파일이 `roles`(Tier-1)+`adapters`(Tier-2)를 함께 담는다고 명시(README.md:52-54). codegen 을 같은 `adapters` 맵의 형제 키로 추가하면 로더 구조 변경이 최소다. 문자열=내장/객체=커스텀 정규화는 router 와 동일 규칙 (tier2-router-adapter.md:141-144).

**미결:** codegen 어댑터의 내장 기본 이름(`openapi-client`? `none`?)과 expo-feature preset 이 그것을 default 로 묶을지 → **OD-1**. 현재 킷에 codegen 생성기 자체가 없으므로(grep: `codegen` 스크립트 부재) v1 default 는 `none`(codegen 비활성) 일 수도 있다 — 이는 사람이 결정.

---

## 4. RouteNode 확장 — server/client 경계 (NEW)

**Decision:** RSC / `'use client'` / `'use server'` 같은 server/client 경계 의미를 어디에 담는가. baseline RouteNode 는 이 필드가 없다 (tier2-router-adapter.md:91-102).

### 관측된 baseline RouteNode (재인용, 재유도 아님)
```js
RouteNode = { segment, kind, rawPath, urlPath, file, children, meta }   // tier2-router-adapter.md:93-101
```
`kind` 유니온은 `'static'|'param'|'splat'|'optional'|'group'|'index'|'layout'` (tier2-router-adapter.md:95) — **server/client 구분 없음**. 현 Expo Router 스캐너는 server/client 를 전혀 모른다 (lib/route-tree.mjs:26-70 은 파일명/디렉토리만 본다; `_layout` 만 특별취급 lib/route-tree.mjs:14-19).

### Options considered
- **(4a) `kind` 유니온에 `'server'|'client'` 추가** — RouteNode 1급 필드로. 그러나 baseline 이 "`kind` 는 메타데이터로 *분류*만 하고 렌더링을 바꾸지 않는다"(tier2-router-adapter.md:104)고 못박았고, server/client 는 *segment 종류*가 아니라 *직교 속성*(static route 도 server 일 수 있음)이라 유니온에 섞으면 의미 혼선.
- **(4b) `meta` 탈출구로 흡수** — baseline 의 "닫힌 유니온 누수 회피" 설계(tier2-router-adapter.md:83-89)가 정확히 이 용도. `meta.boundary: 'server'|'client'|undefined`. expo-router 어댑터는 이 필드를 안 채우면 그만(현 동작과 byte-동치).
- **(4c) 별도 산출물(server-client-map)** — RouteNode 와 분리된 새 생성뷰. 범위 폭발, v1 과대.

### Recommendation — **(4b): server/client 경계는 `meta.boundary` 로 흡수. `kind` 유니온은 건드리지 않는다.**

```js
// PROPOSED — RouteNode.meta 안에서만. 코어 필드/렌더 불변.
meta: {
  boundary: 'server' | 'client' | undefined,   // Next.js: 'use client' 디렉티브 / RSC 기본 server
  // expo-router 어댑터는 이 키를 채우지 않는다 → 현 route-tree.txt 와 byte-동치
}
```

근거:
- baseline 이 "프레임워크 고유 정보 보존(닫힌 유니온 누수 회피)"을 `meta` 의 명시 목적으로 둠 (tier2-router-adapter.md:100-101, 87-89). server/client 는 Next.js/RSC 고유 의미라 정확히 `meta` 대상.
- **byte-동치 보장:** 코어 렌더러는 `rawPath` 만 출력한다 (tier2-router-adapter.md:104-107; 실측 렌더러 lib/route-tree.mjs:94-107 은 `route:` 만 찍고 meta 미참조). `meta.boundary` 는 *현 route-tree.txt 출력에 등장하지 않으므로* expo-router 어댑터가 채우든 말든 golden 이 안 바뀐다 (basic-app/expected/route-tree.txt:5-12 에 boundary 표기 없음).
- `kind` 에 섞지 않음으로써 baseline 의 "kind 는 렌더 안 바꿈" 불변(tier2-router-adapter.md:104)을 유지.

**미결:** server/client 경계를 *어떤 산출물*이 소비할지(별도 codegen? validate 검사?)는 **OD-2**. RSC 가 아닌 Expo/RN 에선 boundary 가 항상 undefined 라 현 샘플로 **검증 불가**(Unknown) — golden 에 server/client 케이스가 없다.

---

## 5. link / navigation API (NEW)

**Decision:** 어댑터가 navigation primitive(`<Link href>`, `router.push`, `useRouter`)를 어떻게 노출/검증하는가.

### 현 상태 (관측)
킷의 navigation 단일 출처는 **ScreenSpec `## Interaction Matrix` 의 Result 컬럼**이다 (nav-graph.mjs:85-103, 119 "이동/outbound 엣지는 SOURCE 화면 자신의 Interaction Matrix Result 컬럼에서만"). nav-graph 는 *문서*에서 라우트를 추출하지 코드의 `<Link>` 를 보지 않는다. route-tree 도 *파일트리*만 본다 (route-tree.mjs:2-3). 즉 **킷은 현재 코드의 navigation API 를 전혀 파싱하지 않는다.**

### Options considered
- **(5a) 어댑터가 코드의 `<Link href>`/`router.push` 를 파싱해 엣지 보강** — 정적 라우트 발견을 코드까지 확장. 그러나 (i) nav-graph 의 "이동 엣지는 Interaction Matrix 단일 출처" 불변(nav-graph.mjs:119)을 깨고, (ii) 코드 AST 파싱은 결정성 위험(baseline OD: "코드 파싱은 AST 순회 순서 의존" tier2-router-adapter.md:252-253), (iii) 문서-우선(readiness=single source) 철학 위반.
- **(5b) 어댑터가 navigation primitive 의 *이름/형태만 선언* (파싱 없음)** — `conventions.linkComponent: 'Link'`, `conventions.navigateFn: 'router.push'` 같은 메타. 코어/validate 가 이걸 *어떻게* 쓸지는 옵트인. 발견(엣지 생성)은 여전히 Interaction Matrix.
- **(5c) link API 를 codegen 출력으로** — 어댑터가 typed navigation helper(예: `linkTo('/coupons/:id', {id})`)를 *생성*. router+codegen 교차. 강력하나 v1 과대.

### Recommendation — **(5b): 어댑터는 navigation primitive 의 *컨벤션*만 선언한다. 엣지 발견은 Interaction Matrix 단일 출처를 유지한다 (코드 파싱 금지).**

```js
// router 어댑터 ctx.conventions (PROPOSED 확장 — baseline 의 conventions 솔기 재사용)
conventions: {
  routeToken, indexToken, ignore,           // baseline §5 (tier2-router-adapter.md:124)
  linkComponent: 'Link',                    // ← NEW: navigation primitive 이름 (선언만)
  navigateFns:   ['router.push', 'router.replace'],
}
```

근거:
- nav-graph 의 단일 출처 불변(nav-graph.mjs:119 "movement edges only from source Interaction Matrix")을 깨지 않는 유일한 안이 (5b). 코드 파싱(5a)은 이 불변과 정면 충돌하며 결정성도 미보장(tier2-router-adapter.md:252).
- baseline 이 이미 `conventions` 를 "순수 config 천장"으로 어댑터 ctx 에 둠 (tier2-router-adapter.md:122-124). link primitive 이름을 거기 추가하는 건 자연스러운 확장.
- **fail-closed (§14 와 연결):** 어댑터가 link primitive 를 선언했는데 코드가 다른 걸 쓰면 — v1 은 *검증하지 않는다*(선언만). 강제 검증은 OD.

**미결:** link API 를 *typed codegen 으로 생성*(5c)할지 → **OD-3**. 현 킷에 link codegen 산출물이 없어 **검증 불가**(Unknown).

---

## 6. ScreenSpec `route` frontmatter ↔ 어댑터 정규화 rawPath/urlPath (NEW — 중요)

**Decision:** 저작된 ScreenSpec frontmatter 의 `route:` 가 어댑터의 정규화 `rawPath`/`urlPath` 와 어떻게 화해하는가. task 가 "important" 로 표시한 지점.

### 관측된 긴장
- ScreenSpec `route` 는 **라우트의 단일 출처**이고 본문 중복 금지 (screen-spec.template.md:6). 사람이 손으로 적는다.
- nav-graph 는 `frontmatter.route` 를 **EXACT 문자열**로 매칭한다 — "param 정규화 없음" (nav-graph.mjs:122, 138 `routeToScreen.set(route, id)`; validate 검사 4 도 `routeSet.has(t)` EXACT, validate.mjs:231,245).
- route-tree 의 `computeRoute` 는 `[id]`/`(tabs)` 를 **raw 로 보존**한다 (lib/route-tree.mjs:24-31). 즉 현 킷의 라우트 표기 정본은 **rawPath 스타일**(`/coupons/[id]`, `/(tabs)/home`) 이다 (golden basic-app/expected/route-tree.txt:10,12).
- baseline RouteNode 는 `rawPath`(raw 투영, 골든 재현 기준) + `urlPath`(정규화 `:id`, 옵션, 기본 null)를 **둘 다** 가진다 (tier2-router-adapter.md:96-97).

→ 핵심 질문: ScreenSpec 의 손-저작 `route` 는 `rawPath` 와 비교해야 하나 `urlPath` 와 비교해야 하나? 그리고 그 비교는 *누가* 하나?

### Options considered
- **(6a) ScreenSpec route == rawPath (EXACT) — 현 동작 유지, 정규화 비교 없음** — nav-graph/validate 가 이미 EXACT 매칭이고(nav-graph.mjs:122), 현 ScreenSpec 들이 `[id]`/`(tabs)` raw 표기를 쓴다고 가정. 어댑터의 `urlPath` 는 ScreenSpec 화해에 **쓰지 않는다**. 가장 보수적·byte-동치.
- **(6b) ScreenSpec route 를 urlPath 로 정규화해 비교** — 어댑터가 `/coupons/[id]` → `/coupons/:id` 정규화 후 ScreenSpec 과 매칭. 더 "옳은" URL 의미. 그러나 (i) 현 EXACT 매칭 로직(nav-graph.mjs:122 "param 정규화 없음")을 바꿔야 하고(NG-9 위반), (ii) 현 ScreenSpec 표기와 불일치하면 대량 false-mismatch.
- **(6c) 새 cross-check 검사 추가** — 어댑터의 RouteNode rawPath 집합 ↔ ScreenSpec route 집합을 대조하는 validate 검사 신설(현재 route-tree 는 "ScreenSpec 은 입력이 아니다, 교차검증은 후속 PR" route-tree.mjs:3 으로 *미구현*). 가치 있으나 신규 게이트.

### Recommendation — **(6a) 를 v1 화해로: ScreenSpec `route` 는 어댑터의 `rawPath` 와 동일 표기 규약을 공유하며, 비교는 EXACT(현 동작) 그대로. 정규화 `urlPath` 는 ScreenSpec 화해에 관여하지 않는다.** (6c) cross-check 는 **PROPOSED future PR** 로 분리.

명시 규약 (PROPOSED 문서화, 코드 변경 없음):
1. **rawPath 가 ScreenSpec route 의 정본 표기.** 어댑터의 RouteNode.rawPath 가 사용하는 raw 세그먼트 규약(`[id]`, `(tabs)`)이 ScreenSpec frontmatter `route` 가 적어야 하는 표기와 **같다**. 이로써 nav-graph 의 EXACT 매칭(nav-graph.mjs:122)이 어댑터 도입 후에도 그대로 성립.
2. **urlPath 는 별도 산출물 정체성.** baseline OD(tier2-router-adapter.md:245-248)대로, `urlPath`(`:id`)를 1차 출력으로 원하는 어댑터(Next/React-Router)는 `route-tree.txt` 와 **다른 산출물**로 분리한다 — ScreenSpec route 와 직접 비교되지 않는다.
3. **cross-check 는 미래.** route-tree.mjs:3 이 명시한 "ScreenSpec route ↔ 파일트리 교차검증은 후속 PR" 을 어댑터 시대에 일반화하면, "어댑터 RouteNode.rawPath 집합" ↔ "ScreenSpec route 집합" 대조 검사가 된다 (→ OD-4, future PR).

근거:
- nav-graph.mjs:122 가 명시적으로 "param 정규화 없음, 검사 4 routeSet.has 와 동일" 이라 적었다 — EXACT 매칭이 의도된 계약이며 (6b)는 NG-9 위반.
- 현 golden 이 raw 표기(`/coupons/[id]` basic-app/expected/route-tree.txt:12)를 쓰므로 rawPath=ScreenSpec route 규약이 byte-동치를 보존.
- baseline 이 rawPath 를 "렌더 단일 기준", urlPath 를 "별도 산출물/옵트인"으로 이미 분리(tier2-router-adapter.md:106-108)했으므로 ScreenSpec 도 rawPath 쪽에 붙이는 게 정합.

**미결:** ScreenSpec route ↔ 어댑터 rawPath cross-check 검사의 위치/엄격도 → **OD-4**. urlPath 를 쓰는 어댑터의 ScreenSpec 화해(Next 프로젝트가 `[id]` 대신 `:id` 를 적을 때) → **Unknown** (현 샘플은 expo raw 표기뿐, 검증 불가).

---

## 7. codegen 의 "어댑터=발견, 코어=결정성" 경계 (NEW)

**Decision:** router 의 discover-vs-core 경계(tier2-router-adapter.md:151-163)를 codegen 에 어떻게 적용하는가.

### Options considered
- **(7a) codegen 어댑터가 직접 파일을 생성·포맷·쓰기** — orval/openapi-generator 처럼 어댑터가 전권. 그러나 baseline 핵심 caveat: "연구된 어떤 라우팅 도구도 byte-identical 멱등을 보장하지 못한다"(tier2-router-adapter.md:153), 킷의 우위는 *코어가 결정성 독점*(tier2-router-adapter.md:161-163). codegen 도 어댑터에 쓰기 위임하면 그 우위를 잃는다.
- **(7b) codegen 어댑터는 *생성 모델* 만 산출, 코어가 직렬화·정렬·쓰기** — router 의 `discover()`→`normalize/render/write` 분리(tier2-router-adapter.md:131-136)와 동형. 어댑터는 "이 스키마/엔드포인트에서 이런 client/hook 이 나온다"는 IR(중간표현)만 반환.

### Recommendation — **(7b): codegen 어댑터도 *발견/모델산출* 만. 결정적 직렬화·정렬·쓰기는 codegen-core 가 독점.**

```js
// CodegenAdapter (PROPOSED) — 어댑터: 발견만. 쓰기·정렬·포맷 안 함.
export default {
  name: 'openapi-client',
  version: 1,                              // 코어 호환 체크 (baseline §11)
  // ctx = { layout, listFiles, readFile, conventions }
  //   layout : Tier-1 resolved roles — api_schema/api_client 글롭 (expo-feature.yaml:13-14)
  discover(ctx) {
    // role 'api_schema' 글롭 아래 스키마/엔드포인트 → CodegenModel 반환 (IR)
    // 절대: 파일 쓰지 않고, 정렬/포맷하지 않는다 (코어 책임)
  },
}

// scripts/lib/codegen-core.mjs (PROPOSED) — 프레임워크 무관. 결정성 독점.
//   normalize(model)  : 정렬(UTF-16)·dedup·검증
//   render(model, opts): byte-identical 텍스트 (무타임스탬프, route-tree 식 lib/route-tree.mjs:93)
//   writeArtifact / checkArtifact : 쓰기 / no-write diff (baseline §6, tier2-router-adapter.md:134-135)
```

근거:
- baseline 이 router 코어에 `normalize/render/writeArtifact/checkArtifact` 를 두고 "어댑터는 절대 안 호출"(tier2-router-adapter.md:131-136)이라 못박았다. codegen-core 를 동형으로 두면 같은 결정성 계약을 codegen 출력에도 적용.
- 킷의 무의존·무타임스탬프·plain-sort 결정성(lib/route-tree.mjs:52,93,106; nav-graph 의 localeCompare lib/nav-graph.mjs:192)을 codegen 도 코어에서 상속.
- baseline 의 check-mode(no-write diff, tier2-router-adapter.md:135,167)는 킷 CI 게이트 철학에 필수 — codegen 도 동일.

---

## 8. codegen 등록 매니페스트 + adapters config 위치 (NEW)

**Decision:** codegen 어댑터를 어디에 등록하고, config 를 어디에 두는가. baseline 은 router 매니페스트(`scripts/adapters/routers/manifest.json`, tier2-router-adapter.md:194-199)와 `project-layout.yaml.adapters.router`(tier2-router-adapter.md:67-77)를 정했다 — codegen 으로 확장.

### Options considered
- **(8a) router 매니페스트에 codegen 항목 혼재** — 한 manifest.json 에 router+codegen 섞기. 어댑터 종류 충돌·schema 혼선.
- **(8b) codegen 전용 매니페스트 디렉토리** — `scripts/adapters/codegens/manifest.json` (router 의 `scripts/adapters/routers/manifest.json` 와 병렬). 종류별 격리.
- **(8c) 매니페스트 없이 config 에 module 경로 직접** — 내장 어댑터도 경로 하드코딩. baseline 이 Nx executors.json 패턴으로 "코어 변경 없이 추가"를 명시(tier2-router-adapter.md:189-191)한 것과 충돌.

### Recommendation — **(8b): codegen 전용 등록 매니페스트 + `adapters.codegen` config *논리 키*.** (그 config 파일의 물리적 최종 위치는 OD-10 — 본 문서가 정하지 않는다.)

```json
// scripts/adapters/codegens/manifest.json  (PROPOSED — router 매니페스트와 병렬)
{
  "openapi-client": { "module": "./openapi-client.mjs", "schema": "./openapi-client.schema.json" },
  "none":           { "module": "./none.mjs",           "schema": "./none.schema.json" }
}
```
- **config 논리 키:** Tier-1/2 가 한 파일을 쓴다는 README 결정(README.md:52-54)대로 **논리 키는** `adapters.codegen` (router 의 `adapters.router` 와 같은 resolved-layout config 아래). **단 그 config 파일의 물리적 최종 위치(킷 내부 `project-layout.yaml` vs 소비 프로젝트 루트)는 OD-10 로 열려 있고, 본 문서는 그것을 닫지 않는다 — 사람 결정 사안.** preset(expo-feature)이 default 를 묶는 것도 그 위치/소비 솔기가 정해진 뒤다 (§2, §3).
- **등록:** 새 codegen = 매니페스트 1줄 + 모듈 1개, `codegen-gen.mjs` 변경 0 (baseline router 패턴 tier2-router-adapter.md:202 동형).
- **버저닝:** `CodegenAdapter.version` + 코어 호환 체크 (baseline §11, tier2-router-adapter.md:117,249-251).

근거: baseline 이 router 를 정확히 이 패턴(JSON 매니페스트 name→module, tier2-router-adapter.md:189-204)으로 등록했고 "preset = 특정 router+roles 묶음의 이름붙은 번들"(tier2-router-adapter.md:203-204)이라 했다. codegen 을 같은 패턴으로 병렬 추가하면 일관.

---

## 9. codegen 출력 경로 + hook 네이밍 + API client 위치 (NEW — codegen 절반)

**Decision:** codegen 이 생성한 API client/hook 이 *어디에* 가고 *어떻게* 이름붙는가. baseline router 설계가 전혀 다루지 않은 codegen 핵심.

### 관측된 Tier-1 좌표 (재사용)
- `api_client: src/api/**`, `api_schema: src/api/schemas/**`, `hook: src/features/{domain}/hooks/**` (expo-feature.yaml:11,13,14).
- validate 검사 8 의 스키마 디렉토리는 `{roles.api_schema}` 바인딩 (validate.mjs:277-279 `layout.roleToDir('api_schema')`).
- `fake_hook_exists` 게이트 fact 는 `{roles.hook}` 에서 파생 (tier1-layout-profile.md:161, README.md:70).

### Options considered (출력 경로)
- **(9a) codegen 출력 경로를 어댑터가 하드코딩** — `src/api/generated.ts` 리터럴. Tier-1 role 우회 → 커스텀 레이아웃 깨짐.
- **(9b) codegen 출력 경로를 Tier-1 role 에서 파생** — client → `{roles.api_client}`, hook → `{roles.hook}`. 단일 `resolvedLayout` 소비(README.md:64-66). 커스텀 레이아웃 자동 정합.
- **(9c) 새 전용 role `api_generated` 추가** — 생성물 전용 경로 분리. role 추가는 Tier-1 변경(tier1-layout-profile.md:10-13 NG)이라 별도 결정.

### Recommendation — **(9b): codegen 출력 경로는 Tier-1 role(`api_client`/`hook`)에서 파생.** 전용 `api_generated` role 은 만들지 않는다 (**OD-5 resolved — 2026-06-19**).

### Options considered (hook 네이밍)
- **(9d) 어댑터가 hook 이름 규약을 *config* 로 선언** — `conventions.hookPrefix: 'use'`, `conventions.queryHookSuffix: 'Query'` 등. TanStack `routeToken`/`indexToken` 식 컨벤션-as-config (tier2-router-adapter.md:213).
- **(9e) hook 이름을 어댑터 코드가 하드코딩** — 유연성 0, 프로젝트 규약 차이 흡수 불가.

### Recommendation — **(9d): hook 네이밍은 어댑터 `conventions` 의 config 토큰.** 코어가 그 토큰으로 결정적 이름 생성.

```js
// codegen 어댑터 ctx.conventions (PROPOSED)
conventions: {
  hookPrefix:    'use',            // useGetCoupons
  querySuffix:   'Query',          // useCouponsQuery
  mutationSuffix:'Mutation',
  clientOut:     '{roles.api_client}',   // 출력 경로 = Tier-1 role 파생 (§9b)
  hookOut:       '{roles.hook}',
}
```

근거:
- README §1.1 단일 `resolvedLayout` 소비 원칙(README.md:64-74)이 codegen 출력 경로에도 적용돼야 커스텀 레이아웃(Next `lib/api/**`, tier1-layout-profile.md:203)에서 깨지지 않는다. `roleToDir`/`resolvePaths` 가 이미 그 파생을 제공(layout-profile.mjs:144-159,166-195).
- 컨벤션-as-config 는 baseline 이 "라우트 네이밍 컨벤션 = Config 토큰"(tier2-router-adapter.md:213)으로 검증한 패턴. hook 네이밍도 동형.
- **결정성:** 생성 이름은 코어가 토큰+엔드포인트에서 결정적으로 조립(무타임스탬프, route-tree 식 lib/route-tree.mjs:106 명시적 `\n` join). prettier 미사용(드리프트 회피, generated-file-guard-design.md 의 prettier 위험 선례와 정합).

**결정 업데이트 — 2026-06-19:** 출력 입도는 endpoint/file 별 artifact 증식이 아니라 **단일 codegen artifact + `outputs[]` 다중 산출물**로 닫는다 (**OD-6 resolved**). hook 출력은 전역 hook 루트가 아니라 `{roles.hook}` 의 domain-scoped 경로(`src/features/{domain}/hooks/**`)를 유지한다 (**OD-7 resolved**). generated ownership 은 "manifest-listed outputs + GENERATED marker/header" 이므로, 같은 hook 경로의 사람이 쓴 파일(헤더 없음)은 stale output 으로 보지 않는다.

---

## 10. validate 검사 ↔ 어댑터 관계 (NEW)

**Decision:** validate 의 라우트/API 검사가 어댑터를 직접 소비하는가.

### 관측
- 검사 4(Interaction Matrix Result route ∈ inventory)와 검사 5(route 중복)는 **ScreenSpec frontmatter route** 만 본다 — 어댑터/파일트리 무관 (validate.mjs:222-249).
- 검사 8(API confirmed ↔ schema)은 `{roles.api_schema}` 디렉토리 존재/zod export 를 본다 (validate.mjs:277-298) — 이미 Tier-1 role 소비, 어댑터 무관.
- route-tree 는 "ScreenSpec 은 입력이 아니다" (route-tree.mjs:3) — validate 와 route-tree 는 현재 **분리**.

### Options considered
- **(10a) validate 가 어댑터를 직접 로드해 RouteNode 와 ScreenSpec 을 대조** — 검사 4 를 "어댑터 발견 라우트 ↔ ScreenSpec route" 로 강화. 그러나 (i) validate 를 어댑터에 결합 → validate 의 "빠른·무의존 contract 게이트" 성격(generated-file-guard-design.md:323 "validate stays fast, dependency-light")을 해침, (ii) 신규 게이트(NG-1 위반).
- **(10b) validate 는 어댑터를 소비하지 않는다 — 현 분리 유지** — validate 는 ScreenSpec/role 만. 어댑터↔ScreenSpec cross-check 는 *별도 도구*(route-tree/codegen 의 후속 cross-check, §6 OD-4)로.
- **(10c) validate 검사 8 의 schema 디렉토리를 codegen 어댑터가 재정의** — codegen 어댑터가 스키마 위치를 알므로 검사 8 입력을 어댑터에서. 그러나 검사 8 은 이미 `{roles.api_schema}` 로 Tier-1 에서 받는다(validate.mjs:279) — 어댑터 불필요.

### Recommendation — **(10b): validate 는 어댑터를 직접 소비하지 않는다. validate↔어댑터는 Tier-1 role 을 *공유 경유*로만 간접 연결한다.**

명시:
- 검사 8 schema 디렉토리는 `{roles.api_schema}`(validate.mjs:279)에서 오고, codegen 어댑터의 `discover` 입력도 `{roles.api_schema}`(§7)에서 온다 — **둘은 같은 role 을 보지만 서로를 모른다**. 이 간접성이 validate 를 어댑터-독립으로 유지하면서도 정합을 보장.
- 어댑터 RouteNode ↔ ScreenSpec route cross-check 는 validate 안이 아니라 route-tree/codegen 의 후속 cross-check(§6 OD-4)로 분리.

근거: 가드 설계가 "validate 는 빠른·무의존·항상-on contract 게이트로 유지, 무거운 작업은 별도 warning-first 도구로"(generated-file-guard-design.md:323)라고 명시한 split 철학과 정합. validate 에 어댑터를 결합하면 그 철학과 NG-1 둘 다 위반.

---

## 11. nav-graph 가 어댑터를 직접 소비하는가 (NEW)

**Decision:** baseline 은 route-tree 가 어댑터를 소비한다고 결정(tier2-router-adapter.md:140-147)했으나 **nav-graph 는 언급 안 함**. task 가 명시 요구한 미해결점.

### 관측
- nav-graph 의 라우트 출처는 **ScreenSpec Interaction Matrix Result + navigation-map.md** 뿐 (nav-graph.mjs:119,166-167). 파일트리·어댑터를 보지 않는다.
- route→screen 해소는 `frontmatter.route` EXACT 매칭 (nav-graph.mjs:122,138).
- nav-graph 는 route-tree 와 **독립** 생성기 (lib/nav-graph.mjs 는 lib/route-tree.mjs 를 import 안 함).

### Options considered
- **(11a) nav-graph 도 route-tree 처럼 어댑터의 RouteNode 를 소비** — 어댑터가 발견한 라우트를 nav-graph 의 route 레지스트리 시드로. 일관성↑. 그러나 (i) nav-graph 의 "이동 엣지는 Interaction Matrix 단일 출처" 불변(nav-graph.mjs:119)은 *엣지*에 관한 것이고 *route 레지스트리 시드*는 별개(nav-graph.mjs:165-167 navigation-map 시드처럼), (ii) 어댑터 RouteNode.rawPath 를 시드로 넣으면 ScreenSpec route 와 EXACT 매칭 표기가 §6 규약대로 일치해야 함.
- **(11b) nav-graph 는 어댑터를 소비하지 않는다 — 현 ScreenSpec/nav-map 출처 유지** — nav-graph 는 *문서 그래프*라 코드 발견 어댑터와 직교. route-tree(파일트리→라우트)만 어댑터 소비, nav-graph(문서→엣지)는 문서 출처 유지.
- **(11c) nav-graph 가 어댑터 RouteNode 를 *교차검증*에만 사용 (시드/엣지 아님)** — 어댑터 발견 라우트와 ScreenSpec route 불일치를 *경고*로만. 발견은 여전히 문서.

### Recommendation — **(11b) 를 v1 으로: nav-graph 는 어댑터를 직접 소비하지 않는다.** route-tree 만 router 어댑터를 소비한다(baseline tier2-router-adapter.md:140-147). nav-graph↔어댑터 교차검증(11c)은 **OD-8** future PR.

근거:
- nav-graph 의 출처는 의도적으로 *문서*(Interaction Matrix + navigation-map, nav-graph.mjs:119,166)이고, route-tree 의 출처는 *파일트리*(route-tree.mjs:2-3)다. 이 둘은 **다른 정본**을 본다 — router 어댑터(파일트리↔코드 발견)는 route-tree 의 정본 차원에 속하지 nav-graph 의 문서 차원이 아니다.
- nav-graph 를 어댑터에 결합하면 "이동 엣지 단일 출처"(nav-graph.mjs:119) 경계가 흐려질 위험. v1 은 분리 유지가 안전(fail-closed 정신).
- baseline 이 route-tree 만 어댑터 소비를 명시(tier2-router-adapter.md:140-147)하고 nav-graph 는 안 했다는 침묵을, 본 문서가 **명시적 "소비 안 함" 결정**으로 닫는다.

**미결:** nav-graph 가 어댑터 RouteNode 를 cross-check 용으로 읽을지 → **OD-8**. (예: 어댑터가 발견한 라우트가 어떤 ScreenSpec route 와도 안 맞으면 경고.)

---

## 12. default expo-feature 어댑터 BYTE-동치 유지

**Decision:** 어댑터 도입이 현 golden 을 안 깨뜨린다는 보장.

### 회귀 기준 (baseline 계승 + 본 문서 명시)
- **router:** `expo-router` 어댑터의 `discover()` = 현 `scanAppDir`(lib/route-tree.mjs:37-70)와 동치 → 코어 렌더러가 `rawPath` 출력(tier2-router-adapter.md:104-107) → `examples/route-tree/{basic-app,edge-cases}/expected/route-tree.txt` **byte-identical** 재현. basic-app golden 실측: 헤더 3줄(`# GENERATED FILE — DO NOT EDIT` / `# Source: src/app/**` / `# Command: …`) + 빈 줄 + 박스드로잉 트리 (basic-app/expected/route-tree.txt:1-12).
- **server/client meta:** `meta.boundary` 는 expo-router 가 안 채우고 렌더에 안 나타나므로 golden 불변 (§4).
- **codegen:** 현재 codegen 산출물 golden 이 **없으므로** byte-동치 회귀 대상이 아직 없다. codegen golden 은 첫 codegen 생성기와 함께 들어온다 (§9·§13).

### Options considered
- **(12a) 어댑터 도입을 "동작 변경"으로 보고 golden 재생성** — golden 을 새로 찍음. 위험: 동치성 회귀를 놓침. baseline 이 "코어 추출은 동작 변경이 아니라 *구조 분리*"(tier2-router-adapter.md:234)라 명시.
- **(12b) golden 불변 + 어댑터 출력 == 기존 출력 단언** — 어댑터 PR 의 통과 조건을 "기존 golden byte-identical" 로 고정. 동치성 회귀를 즉시 잡음.

### Recommendation — **(12b): golden 은 불변, 어댑터 출력의 통과 조건 = 기존 golden byte-identical.** golden 재생성(12a) 금지.

근거:
- baseline 회귀 기준(tier2-router-adapter.md:232-234)이 이미 byte-identical 을 요구.
- Tier-1 도입도 같은 패턴을 밟았다 — "프로파일 도입은 동작 변경이 아니라 값의 출처 이동, expo BYTE-동치 유지"(tier1-layout-profile.md:247-249; 실측 dogfood: default layout byte-동치 확인 tier1-integration-dogfood-001.md:18,70-71). 어댑터 도입도 동형.
- 골든 하니스의 `normalizeGeneratedViewText` 는 CRLF/backslash 만 정규화(verbatim 유지)하므로(generated-file-guard-design.md:202,423) byte-동치 단언이 그대로 성립.

---

## 13. 최소 custom-adapter 픽스처 (별도 dogfood PR)

**Decision:** 커스텀 어댑터가 실제로 동작함을 보일 최소 픽스처. **이 PR 에서 만들지 않는다 (NG-7) — 별도 dogfood PR.**

### 선례 (Tier-1 custom layout 픽스처)
Tier-1 은 `examples/layout-profile/custom-monorepo/project-layout.yaml` 로 expo-feature preset 위에 role 재바인딩(`route_entry: app/**`)+도메인 오버라이드를 얹어 회귀 고정했다 (실측 custom-monorepo/project-layout.yaml:10-23). 이 픽스처는 "프로파일 로더 *단위 테스트 입력*일 뿐 실제 소스 트리 미동반"(custom-monorepo/project-layout.yaml:9)을 명시 — 픽스처 최소화 선례.

### 최소 custom router-adapter 픽스처 (PROPOSED, future dogfood PR, illustrative)
```
examples/router-adapter/minimal-custom/        # (FUTURE — NG-7: 지금 안 만듦)
├─ project-layout.yaml          # adapters.router: { module: ./my-router.mjs }
├─ my-router.mjs                # 최소 RouterAdapter: discover(ctx) → RouteNode[] (쓰기·정렬 안 함)
├─ src/app/ 또는 routes.ts       # INPUT (어댑터가 발견할 트리/코드)
├─ expected/route-tree.txt      # 코어가 렌더한 byte-identical GOLDEN
└─ run-metadata.json            # { fixture:"router-adapter", expected:"…", expect:"pass" }
```
*(illustrative — 디렉토리/JSON 스케치, 코드 아님. run-metadata 형태는 실측 basic-app/run-metadata.json:1-8 미러.)*

### Options considered
- **(13a) 이 PR 에 픽스처 포함** — 금지(NG-7). 어댑터 코어가 아직 없어(NG-2) 픽스처가 비교할 코어 출력이 없다 — "no diff gate/fixture before the first real generator"(generated-file-guard-design.md:92) 위반.
- **(13b) 별도 dogfood PR (어댑터 코어 랜딩 후)** — Tier-1 이 밟은 정확한 순서(read-only dogfood → custom fixture, tier1-integration-dogfood-001.md:161-164).

### Recommendation — **(13b): custom-adapter 픽스처는 어댑터 코어(route-core/codegen-core) 랜딩 후 별도 dogfood PR.** 이 설계 PR 에서는 *형태만 스케치*.

근거: Tier-1 이 read-only dogfood 후 별도 test PR 로 custom fixture 를 추가한 선례(tier1-integration-dogfood-001.md:161-164,183). 어댑터 코어 없는 시점에 픽스처를 먼저 넣으면 비교 대상이 없다(generated-file-guard-design.md:92).

---

## 14. fail-closed 조건 (NEW)

**Decision:** 어댑터/codegen 이 추측 대신 **거부**해야 하는 지점. 킷의 fail-closed 원칙(layout-profile.mjs:23-32 `LayoutConfigError` → exit 2; route-tree.mjs:17-20 `--app` 부재 → exit 2)을 어댑터로 확장.

### Recommendation — 아래 조건에서 어댑터/코어는 **exit 2(도구/설정 오류)로 fail-closed, 추측·빈 산출 금지:**

| # | 조건 | 동작 | 선례 |
|---|---|---|---|
| FC-1 | `adapters.router`/`adapters.codegen` 이 매니페스트에 없는 이름 | exit 2 (조용히 expo-router fallback 금지) | layout-profile.mjs:59-64 정의안된 role → throw |
| FC-2 | 커스텀 `{module}` 경로가 부재/로드 실패 | exit 2 | layout-profile.mjs:94-98 `--layout` 부재 → throw |
| FC-3 | 어댑터 `version` 이 코어 호환 범위 밖 | exit 2 | baseline §11 version 체크 (tier2-router-adapter.md:117,250) |
| FC-4 | 어댑터가 파일을 쓰려 시도 (경계 위반) | exit 2 / 계약 위반 | baseline "어댑터는 파일 안 씀" (tier2-router-adapter.md:162) |
| FC-5 | discovery 입력 디렉토리(`{roles.route_entry}`/`{roles.api_schema}`) 부재 | exit 2 (빈 트리 추측 금지) | route-tree.mjs:17-20 `isDir` 실패 → exit 2 |
| FC-6 | codegen 스키마가 모호/malformed (예: 같은 endpoint 충돌 선언) | exit 2 (행 순서 의존 추측 금지) | validate 검사 8 중복 충돌 → error (validate.mjs:291-296) |
| FC-7 | 어댑터 RouteNode 가 두 번 실행에 다른 결과 (비결정) | 코어 check-mode 가 diff 검출 → fail | baseline checkArtifact (tier2-router-adapter.md:135,167) |

근거:
- 킷 전역이 "fail-closed on malformed/ambiguous input"(core principle 6). layout-profile 이 이미 정의안된 role(layout-profile.mjs:59-64)·부재 `--layout`(layout-profile.mjs:94-98)에서 exit 2 throw 로 fail-closed.
- route-tree 가 `--app` 디렉토리 부재 시 exit 2(route-tree.mjs:17-20)로 이미 fail-closed — 어댑터도 동형(FC-5).
- validate 검사 8 이 endpoint 충돌을 "행 순서 의존(모순) → 에러로 surface"(validate.mjs:289-296)한 패턴이 codegen 스키마 모호성(FC-6)의 직접 선례.
- baseline 이 "어댑터는 파일 안 씀/정렬 안 함"을 계약으로 못박음(tier2-router-adapter.md:162) — 위반은 계약 오류(FC-4).

---

## 15. 결정 요약 (consolidated)

| 차원 | 결정 | 섹션 |
|---|---|---|
| preset vs adapter | `expo-feature`=preset 번들, `expo-router`=router 어댑터 (다른 층위) | §2 |
| codegen config | `adapters.codegen` 을 router 와 독립 축으로 (config 유니온 확장) | §3 |
| server/client | `meta.boundary` 로 흡수, `kind` 유니온/렌더 불변 → byte-동치 | §4 |
| link/nav API | 어댑터는 navigation primitive *컨벤션만* 선언, 엣지 발견은 Interaction Matrix 단일 출처 | §5 |
| ScreenSpec route | rawPath==ScreenSpec route(EXACT, 현 동작), urlPath 는 별도 산출물, cross-check 는 future | §6 |
| codegen 경계 | codegen 어댑터=발견/모델, codegen-core=결정성 독점 (router 동형) | §7 |
| codegen 등록/config | codegen 전용 매니페스트 + `project-layout.yaml.adapters.codegen` + version | §8 |
| codegen 출력/hook | 출력경로=기존 Tier-1 role(`api_client`/`hook`) 파생, 단일 artifact `outputs[]` 다중 산출물, hook 은 domain-scoped 유지 | §9 |
| validate↔어댑터 | validate 는 어댑터 직접 소비 안 함, Tier-1 role 공유로만 간접 연결 | §10 |
| nav-graph↔어댑터 | nav-graph 는 어댑터 직접 소비 안 함 (route-tree 만 소비), cross-check 는 future | §11 |
| byte-동치 | golden 불변, 어댑터 출력==기존 golden 통과조건 (재생성 금지) | §12 |
| custom fixture | 어댑터 코어 랜딩 후 별도 dogfood PR | §13 |
| fail-closed | FC-1…FC-7: 미지 어댑터/부재 모듈/version 불일치/입력부재/스키마 모호/비결정 → exit 2 | §14 |

---

## 16. Open decisions

각 항목은 **왜 열려 있는지 / 무엇을 막는지**. **이 설계 PR 을 막는 것은 없다** (전부 어댑터/codegen 구현·마이그레이션 future-PR 시점에 닫음). 선례: nav-graph 도 스키마를 Open Decision 으로 두고 generator 를 먼저 ship 한 뒤 닫고 등록했다(component-catalog-generation-source-contract.md:263 인용; tier1 도 README §1.1 의 role 위치 OD 를 열어둔 채 ship — tier1-layout-profile.md:255-261).

**Resolved by human decision — 2026-06-19:**
- **OD-5 — 전용 `api_generated` role:** 만들지 않는다. codegen 출력은 기존 `roles.api_client` / `roles.hook` 표면을 사용한다.
- **OD-6 — codegen 출력 입도:** endpoint/file 별 artifact 를 만들지 않는다. 하나의 codegen artifact 가 `outputs[]` 로 client/hook 다중 산출물을 표현한다.
- **OD-7 — hook 출력 스코프:** hook 출력은 domain-scoped `{roles.hook}` (`src/features/{domain}/hooks/**`) 로 유지한다.

- **OD-1 — codegen 기본 어댑터 정체성:** expo-feature preset 이 default 로 묶을 codegen 어댑터가 `openapi-client` 인가 `none`(비활성)인가. 현 킷에 codegen 생성기가 없음. **막는 것:** preset 의 `adapters.codegen` default 한 줄. **설계 PR 은 안 막음.**
- **OD-2 — server/client 경계 소비처:** `meta.boundary` 를 어떤 산출물/검사가 읽는가(별도 생성뷰? validate?). 현 샘플(expo/RN)에 RSC 경계 0건 → **Unknown(검증 불가).** **막는 것:** boundary 를 1급 소비하는 미래 기능.
- **OD-3 — link API typed codegen:** navigation primitive 를 typed helper(`linkTo`)로 *생성*할지(§5c). 현 킷에 link codegen 0건 → **Unknown.** **막는 것:** codegen 어댑터의 link 출력 범위.
- **OD-4 — ScreenSpec route ↔ 어댑터 rawPath cross-check 검사:** route-tree.mjs:3 이 예고한 "ScreenSpec route ↔ 파일트리 교차검증"을 어댑터 시대에 일반화한 신규 검사의 위치(validate? route-tree 후속?)와 엄격도. **막는 것:** 첫 cross-check 게이트.
- **OD-8 — nav-graph 어댑터 cross-check:** nav-graph 가 어댑터 RouteNode 를 *경고용 교차검증*에만 읽을지(§11c). 엣지/시드는 여전히 문서. **막는 것:** nav-graph 의 선택적 어댑터-인식 진단(없어도 v1 동작).
- **OD-9 — 코드정의 라우터의 결정적 발견:** baseline 미해결(tier2-router-adapter.md:252-253) — React Router 트리를 결정적으로 파싱하는 법. codegen 도 동일(스키마 순회 순서). **막는 것:** 코드정의/AST 기반 어댑터의 결정성 보장.
- **OD-10 — adapters config 의 최종 위치:** `project-layout.yaml.adapters` (킷 내부) vs 소비 프로젝트 루트. Tier-1 의 같은 OD(tier1-layout-profile.md:255-257)와 함께 닫혀야 함. **막는 것:** 어댑터 선택 파일의 최종 경로.

---

## 17. Implementation slicing / next-PR candidates

**이 PR = 설계 only.** 이후는 전부 **future PR (마크됨).** 최소 3개 PR 로 분할(task 지침):

1. **(FUTURE) PR-1 — config schema + docs only:** `project-layout.yaml` 에 `adapters.router`/`adapters.codegen` **스키마(+JSON schema)**와 본 문서 확정 규약을 *문서/스키마로만* 추가. **코드·생성기·매니페스트·preset 동작 변경 0** (router/codegen 코어 미존재 상태 유지). preset(expo-feature)에 `adapters` 기본값을 *묶는 것*은 config 동작 변경이므로 **PR-1(docs-only)이 아니라 소비 솔기가 생기는 PR-2 로 미룬다**(아래). OD-1(기본 codegen 어댑터 정체성)은 **후보로 제시만** 하고 **사람 결정으로 닫는다**; **OD-10(config 파일 물리 위치)은 PR-1 이 닫지 않는다 — 별도 사람-결정 사안.**
2. **(FUTURE) PR-2 — route-tree 어댑터 솔기:** `scripts/lib/route-core.mjs` 추출(normalize/render/write/check, baseline §5·§6) + `scripts/adapters/routers/{expo-router}.mjs` + `manifest.json` + **preset(expo-feature)에 `adapters` 기본값 묶기(런타임 소비가 이 솔기부터 시작 → 여기서 도입해야 docs-only/런타임 경계가 안 흐려짐)**. `route-tree.mjs` CLI 가 `adapters.router` 선택→`discover`→core. **회귀: `examples/route-tree/{basic-app,edge-cases}` golden byte-identical** (§12). server/client `meta.boundary` 필드 도입(expo 는 미사용→golden 불변, §4).
3. **(FUTURE) PR-3 — validate / nav-graph / codegen 솔기:** (a) validate↔어댑터 간접 연결 명시(§10, 코드변경 최소), (b) nav-graph "어댑터 미소비" 명시/문서화(§11), (c) `scripts/lib/codegen-core.mjs` + `scripts/adapters/codegens/{openapi-client}.mjs` + codegen 매니페스트 + 출력경로/hook 네이밍(§8·§9). codegen golden fixture 동반. OD-5/OD-6/OD-7 닫기 후보.
4. **(FUTURE, 별도 dogfood PR) — custom-adapter 픽스처:** `examples/router-adapter/minimal-custom/` (+ codegen 변형) 회귀 고정 (§13). **PR-2/PR-3 코어 랜딩 후에만.** Tier-1 custom-monorepo 선례(custom-monorepo/project-layout.yaml) 미러.
5. **(FUTURE) PR — 생성물 가드 정합:** route-tree `source:`/`command:` 의 어댑터-인식(baseline tier2-router-adapter.md:236-239), codegen 산출물의 `V1_REPRODUCE` 계약 등록(check-generated-files.mjs:132-136 의 catalog 패턴 동형). **새 분기 없이** 데이터-드리븐 졸업. (NG-8: 지금 안 함.)

각 PR 은 직전 PR 의 결정성/골든이 통과한 뒤에만 진행 — 코어 부재 시점에 가드/픽스처를 먼저 넣지 않는다 (generated-file-guard-design.md:92). **NO hard gate** — codegen/어댑터 도입은 warning-first 로 시작, hard 게이트 승격은 관측된 false-positive 후 별도 결정 PR (generated-file-guard-design.md:300).

**2026-06-19 current slice:** PR-3 이후 남은 OD-5/OD-6/OD-7 을 위 결정으로 반영하고, `artifact-manifest.yaml` 에 codegen 전용 `outputs[]` 표현을 추가한다. `check-generated-files` focused target 은 codegen-core expected output list 와 manifest-listed outputs 를 사용해 missing/different/stale 를 advisory 로 검사한다. stale 판단은 generated-owned 파일(출력 패턴 + GENERATED header/marker)만 대상으로 하며, validate/readiness/nav-graph 는 codegen adapter 를 직접 소비하지 않는다. custom codegen adapter dogfood, warning-only cross-check, CI promotion decision 은 별도 후속으로 유지한다.

---

## Appendix A — 검증한 ground truth (file:line)

### A.1 baseline Tier-2 router 설계 (재사용, 재유도 안 함)
- config 유니온 `router: 'expo-router' | {module}` (tier2-router-adapter.md:71-77).
- RouteNode `{segment,kind,rawPath,urlPath,file,children,meta}` (tier2-router-adapter.md:91-102); `kind` 는 렌더 안 바꿈(:104); rawPath 가 렌더 단일기준(:106-107); meta=프레임워크 고유정보 보존(:100-101).
- "어댑터=발견, 코어=결정성" (tier2-router-adapter.md:151-163); 코어 normalize/render/writeArtifact/checkArtifact(:131-136); 어댑터는 파일 안 씀(:162).
- 등록 매니페스트 Nx 패턴(tier2-router-adapter.md:189-204); version 체크(:117,249-251); route-tree 어댑터 소비 CLI(:140-147); byte-identical 회귀 기준(:232-234); urlPath 별도 산출물 OD(:245-248); 코드파싱 결정성 OD(:252-253).

### A.2 Tier-1 경계 (일관성)
- 두 티어=메커니즘 구분(config vs plugin), 파일 1개(`project-layout.yaml`)에 roles+adapters (README.md:52-54).
- 단일 resolvedLayout 소비처 일원화 (README.md:64-74).
- preset expo-feature = 현 하드코딩 byte-동치, `roles:` 만(adapters 없음) (expo-feature.yaml:5-14).
- role→glob: `route_entry: src/app/**`, `api_client: src/api/**`, `api_schema: src/api/schemas/**`, `hook: src/features/{domain}/hooks/**` (expo-feature.yaml:8-14).
- `roleToDir`/`resolvePaths`/`{domain}` 보존 (layout-profile.mjs:135-195); fail-closed 정의안된 role/부재 layout → throw exit 2 (layout-profile.mjs:59-64,94-98).
- custom layout 픽스처 선례(role 재바인딩+도메인 오버라이드, 로더 단위입력) (custom-monorepo/project-layout.yaml:9-23).

### A.3 router/codegen 소비자 (현 동작)
- route-tree CLI: `--app`(default src/app)/`--out`(file), `scanAppDir` 직접 호출, `--app` 부재 exit 2 (route-tree.mjs:11-22,17-20). "ScreenSpec 은 입력 아님, 교차검증 후속"(route-tree.mjs:3).
- route-tree lib: `computeRoute` raw 보존(`[id]`/`(tabs)`) (lib/route-tree.mjs:24-31); `_layout` 제외(:14-19); plain `.sort()`(:52-53); 무타임스탬프 렌더, 헤더 3줄 하드코딩(:94-107).
- route-tree golden 실측: 헤더+박스드로잉, raw 라우트 표기 (basic-app/expected/route-tree.txt:1-12); run-metadata 형태 (basic-app/run-metadata.json:1-8).
- nav-graph: 이동 엣지=Interaction Matrix 단일출처(nav-graph.mjs:119); route EXACT 매칭 "param 정규화 없음"(:122,138); navigation-map 시드(:166-167); localeCompare 정렬(lib/nav-graph.mjs:192).
- validate: 검사 4/5 ScreenSpec route(EXACT)만(validate.mjs:222-249); 검사 8 `{roles.api_schema}` 디렉토리(:277-279); endpoint 충돌 error(:291-296).
- ScreenSpec template: `route` = 라우트 단일 출처, 본문 중복 금지(screen-spec.template.md:6); Entry Points GENERATED 블록(:38-41).
- check-generated: route-tree 입력 `{roles.route_entry}` 파생(`literal <srcDir>/app` 금지) (check-generated-files.mjs:108-118); codegen 계약 자리(catalog 패턴) (:132-136).

### A.4 Tier-1 threading 실측 (byte-동치 선례)
- default layout byte-동치, custom 만 split-brain (tier1-layout-threading-001.md:18,107-110; tier1-integration-dogfood-001.md:18,70-71).
- "프로파일 도입=값의 출처 이동, 동작 변경 아님, expo byte-동치" (tier1-layout-profile.md:247-249).

### A.5 정직한 한계 (Unknown — 본 샘플로 검증 불가)
- **server/client 경계:** 현 golden/샘플에 RSC `'use client'`/`meta.boundary` 케이스 0건 → §4 의 boundary 흡수는 *설계 의도*이지 실증 미검(OD-2).
- **codegen 산출물 전반:** 킷에 codegen 생성기/golden 이 **존재하지 않는다**(grep 결과 codegen 스크립트 부재). §7·§8·§9 의 출력경로/hook 네이밍/입도는 전부 *설계*이며 byte-동치 회귀 대상이 아직 없다(OD-6, "no diff gate before first generator" generated-file-guard-design.md:92).
- **link API typed 생성·코드정의 어댑터 결정성:** 현 킷에 0건 → §5c/§OD-9 미실증.
- **urlPath 쓰는 어댑터의 ScreenSpec 화해:** 현 샘플은 expo raw 표기뿐 → Next `:id` 표기 ScreenSpec 의 화해는 미검(§6 Unknown).

---

**End of design document.** No code, adapter/core/codegen modules, package scripts, CI changes, manifest/policy/preset edits, validate/route-tree/nav-graph/lib edits, golden/fixture edits, or ScreenSpec semantics changes are made by this task. All adapter/codegen config, schema, and graduation steps remain **PROPOSED (future PR)** only.
