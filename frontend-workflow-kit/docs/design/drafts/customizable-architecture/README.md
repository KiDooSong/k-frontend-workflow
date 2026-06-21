# Customizable Architecture — 프로젝트 간 이식성 (proposal index)

> Status: DESIGN / SPEC ONLY. 2026-06-14. 이 디렉토리는 킷을 *다른 프로젝트에서 재사용*할 때
> 디렉토리 구조·디자인 패턴이 프로젝트마다 다른 문제(같은 스택이라도)를 **하드코딩 없이** 커스텀화하는
> 설계를 다룬다. **구현이 아니다** — 코드·`package.json` script·CI·기존 정책/매니페스트 파일 변경을
> 지시하지 않는다. 세 개의 티어 문서로 나뉜다 (tier1/2 = 같은 계층을 *어디에·어떻게*, **tier3 = 계층이 *몇 개로*(depth)**; 2026-06-21 추가).

---

# 0. 문제

킷은 현재 단 하나의 컨벤션을 가정한다: **Expo Router(`src/app/**`) + feature-folder(`src/features/{domain}/...`)**.
소비 프로젝트는 같은 React/RN 스택이라도 디렉토리 구조와 디자인 패턴이 다르다 — Next.js App Router,
React Router(코드정의 라우트), Feature-Sliced Design, atomic design, **도메인마다 다른 패턴**(예: 레거시
도메인만 atomic) 등. 이 가정이 박힌 곳은 **두 부류**다 (Codex 리뷰 2026-06-14 로 정정 — 초안의 "4지점"은
과소집계였다).

**(A) 경로 리터럴·글롭 소스 — 경로가 *데이터/기본값*으로 박힘 (1·2 는 글롭 치환으로 해결):**

| # | 위치 | 무엇 |
|---|---|---|
| 1 | `policies/implementation-mode-policy.yaml` | 모드별 `allowed_paths`/`forbidden_paths` (정책 글롭 — 데이터로 소비) |
| 2 | `catalog/artifact-manifest.yaml` (L184, L201) | 생성뷰 `source:` (`src/components/ui/**`, `src/app/**`) |
| 3 | `scripts/route-tree.mjs` (L12) + `scripts/lib/route-tree.mjs` | `--app src/app` *기본값*은 티어1 role(`route_entry`)로, 파일트리 **의미**는 티어2 어댑터로 (정책 소비 코드 아님) |

**(B) 게이트 사실(fact) 파생 — 하드코딩 경로에서 *직접* 계산 (글롭 치환만으론 부족 → resolved-layout 소비 필요):**

| # | 위치 | 무엇 |
|---|---|---|
| 4 | `scripts/lib/spec.mjs:301-305` | `fake_hook_exists` = `<srcDir>/features/<domain>/hooks` 존재검사 (**라이브 게이트 fact**) |
| 5 | `scripts/validate.mjs:269` | 검사 8 = `<srcDir>/api/schemas` 존재검사 |
| 6 | `scripts/readiness.mjs:62` | fake hook 힌트 문자열 |
| 7 | `scripts/lib/workflow-packet.mjs:16-44` | `MODE_HINTS` 사람-대상 안내 카피의 하드코딩 경로 |

**좋은 소식 (그리고 한계):** (A)는 이미 설정주도다 — `path-backstop.mjs`의
`globToRegex`/`covers`/`thresholdOf`(L35–104)는 특정 경로를 모르고, `readiness.mjs:152`
`substituteDomain`은 `{domain}`을 화면별로 치환한다. **하지만 (B)는 경로를 *fact 로* 직접 파생하므로
글롭 치환만으론 안 되고 공유 resolved-layout 객체를 소비해야 한다**(§1.1). 그래도 메커니즘 자체는
이식 가능 — 재작성이 아니라 **설정 추출 + fact 파생 일원화** 문제다.

---

# 1. 두 티어 모델

커스터마이즈는 두 종류로 갈린다. 이 구분이 이 디렉토리 전체의 뼈대다.

| 티어 | 무엇 | 메커니즘 | 커버리지 | 문서 |
|---|---|---|---|---|
| **티어 1** | 디렉토리 구조 / 디자인 패턴 | **순수 설정** (role → glob 바인딩) | 변형의 ~90% | [tier1-layout-profile.md](tier1-layout-profile.md) |
| **티어 2** | router/codegen **의미** | **펼러그인 어댑터** (전략 패턴) | 파일트리 vs 코드정의 등 패러다임 차이 | [tier2-router-adapter.md](tier2-router-adapter.md) |
| **티어 3** | 아키텍처 **계층 깊이** (repository/use-case/VM 등) | **데이터 선언** (순서 있는 `layers:` + mode×layer `access` 행렬) | screen→hook→api 3계층을 넘는 N계층 (depth 일반화 ※) | [tier3-layer-model.md](tier3-layer-model.md) |

> 두 티어는 **메커니즘** 구분(config vs plugin)이지 *파일* 구분이 아니다. 소비자 커스터마이즈 파일은
> `project-layout.yaml` **하나**이고, 거기서 `roles`/`domains`(티어1, 순수 config)와 `adapters`(티어2,
> plugin 선택)를 **모두** 담는다. (tier2 §3 의 `adapters.router` 가 이 파일에 사는 이유.)

> ※ **"depth 축"은 포지셔닝 라벨일 뿐 새 *artifact 축*이 아니다.** 티어3 은 roadmap 의 닫힌 산출물 축 목록
> (`roadmap-current.md:30-40`)에 축을 더하지 않고, **기존 readiness/mode 정책의 access 표현력(+gate semantics)을
> 일반화**한다(tier3 §9·§10③, OD-12 §4). canonical 스키마는 단일 `edits_at` 임계값이 아니라 mode×layer
> `access:{allow[],forbid[]}` 행렬이다(2026-06-21 정정, PR #71 스파이크 독립 재현: v1 10/14 → v2 0/14 byte-동치).

**경계선** (딥리서치 2026-06-14 로 검증): **토큰/프리픽스 파라미터화가 순수 설정의 천장**이고,
"파일트리에서 라우트를 *발견*" vs "코드로 라우트를 *정의*" 같은 **패러다임 전환은 어댑터 솔기가 필요**하다.
이는 TanStack Router 가 라우트 네이밍 컨벤션은 config(`routeToken`/`indexToken`)로, 패러다임 혼합은
plugin(virtual file routes)으로 가르는 방식에서 1차 소스로 확인됐다. 자세한 근거는 티어2 §2.

## 1.1 핵심 설계 원칙 — 단일 resolved-layout 객체 (Codex 리뷰 정정)

§0 의 (A)+(B) 7개 소비처가 경로를 *제각기* 해석하면, "판정 로직은 한 곳"(불변식 #1)이 형식적으론
지켜져도 **경로 fact 가 표류**한다. 그래서 핵심 요건은: **로더가 프로파일을 1회 해소해 `resolvedLayout`
객체 하나를 만들고, 그걸 `readiness`·`spec`(workflow-state)·`validate`·`path-backstop`·`route-tree`·
`workflow-packet` 가 공통 입력으로 받는다.** 각 소비처가 경로를 재유도하지 않는다.

- **정책/생성뷰 글롭** → resolved 글롭을 받음 (티어1 §5).
- **게이트 fact**(`fake_hook_exists` @ spec.mjs, 검사 8 @ validate.mjs) → resolved role 에서 *같은*
  경로를 파생 (티어1 §6·§10). ← 이게 빠지면 `{roles.hook}` 을 바꿔도 `rough-fixture-ui` 게이트가
  옛 경로를 보고 실패한다 (Codex CRITICAL).
- **사람-대상 카피**(`MODE_HINTS`) → resolved role 에서 문구 생성 (티어1 §6).

이 일원화가 충족돼야 "도메인마다 다른 구조"가 게이트·검사·힌트 전반에서 일관되게 동작한다.

---

# 2. 깨면 안 되는 불변식 (킷 README §"불변식" 와 정합)

- **#1 판정 로직은 한 곳.** 프로파일/어댑터는 *경로·의미 데이터*만 갖는다. 모드 판정은 여전히
  `readiness.mjs`(`computeReadiness`) 단일 출처다. 책임을 **"의미 vs 물리 바인딩"** 솔기에서 가를 뿐,
  판정을 복제하지 않는다.
- **#7 생성기는 멱등.** 어댑터는 *발견(discovery)*만 한다. 정규화·정렬·렌더·쓰기는 **코어가 독점**한다.
  현재 `route-tree.mjs` 의 멱등성은 **결정적 내용**(UTF-16 정렬·고정 컬럼 `ROUTE_COL=37`·타임스탬프 없음)에서
  나온다 — 단, `scripts/lib/util.mjs:142` `writeFile` 은 평범한 `writeFileSync` 라 **원자적 쓰기
  (temp→rename)는 아직 없다**(Codex 정정; 딥리서치의 "atomic write" 주장은 로컬 코드에 대해 거짓이었다).
  원자적 쓰기는 코어가 *추가하면 좋은* 항목이지 현재 속성이 아니다. 이 결정성 우위를 어댑터에 위임해
  잃지 말 것. (티어2 §6)

---

# 3. 관련 문서

- [tier1-layout-profile.md](tier1-layout-profile.md) — role→glob 프로파일, 다중경로 role,
  도메인별 오버라이드, 해소 순서(seam), guarded-surface 긴장점, 프리셋·머지, doctor 검사.
- [tier2-router-adapter.md](tier2-router-adapter.md) — router/codegen 어댑터 인터페이스,
  정규화 RouteNode(+meta 탈출구), 파일↔코드 화해, 등록 매니페스트, 결정성 경계.
- [tier3-layer-model.md](tier3-layer-model.md) — 순서 있는 `layers:` 선언(role glob + 완성도 fact +
  mode×layer `access` 행렬), `fact`/`access`/`gates` 3필드 분리, spec.mjs fact 일반화, layer-boundaries N계층
  (access 와 별도 투영), expo-feature byte-동치(forward-gate + backstop 2면) 회귀.

# 4. 인접 설계 (이미 킷에 존재)

- `temp/proposals/generated-file-guard-design.md` — 생성물 가드. 티어2의 어댑터별
  `source:`/`command:` 헤더가 이 가드와 정합해야 한다(티어2 §10).
- `temp/proposals/component-catalog-generation-source-contract.md` — `src/components/ui/**` 를
  source 로 읽는 생성기. 티어1 role `ui_primitive` 로 일반화 대상.
- `catalog/artifact-manifest.yaml` — 산출물 단일 레지스트리. 티어1·2 가 둘 다 참조.
