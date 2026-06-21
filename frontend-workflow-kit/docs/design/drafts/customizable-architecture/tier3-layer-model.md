# Tier 3 — Layer Model (mode×layer access matrix) — design

> Status: **DESIGN / SPEC ONLY**. 2026-06-21. 소비 프로젝트의 **아키텍처 계층 깊이**(repository/use-case/service/
> view-model 등)를 하드코딩 대신 설정으로 표현하는 설계. **구현이 아니다** — 코드·package script·CI·기존
> 정책/매니페스트 파일 변경을 지시하지 않는다. 모든 변경은 **PROPOSED (future PR)** 표기.
> 상위 맥락: [README.md](README.md). 짝 문서: [tier1-layout-profile.md](tier1-layout-profile.md)(경로 바인딩) ·
> [tier2-router-adapter.md](tier2-router-adapter.md)(router/codegen 의미).
> 결정 근거: `../../../../temp/runs/axis2-pivot-decision-prep-001.md`(OD-12) · `../../../../temp/reports/kit-multilayer-adoption-assessment-20260621.md`.
> 실측 검증(PR #71, main 동봉): [다층 도입 dry-run](../../../../temp/runs/multilayer-adoption-dryrun/EXPERIMENT-REPORT.md)(§1 의 3계층 천장을 Clean Arch 6계층으로 실증 — F1~F3) · [blocker① 스파이크](../../../../temp/runs/axis2-a-blocker1-spike/SPIKE-REPORT.md)(§10 ① 사전검증).
> 정정 제안서(PR #74): [tier3-access-matrix-revision.md](../../../../temp/proposals/tier3-access-matrix-revision.md).
>
> ---
> **2026-06-21 정정 (canonical schema 교체 — 이 문서에 반영됨).** 초안의 단일 `edits_at: <min mode>` 임계값을
> **canonical 에서 격하**하고, source-of-truth 스키마를 **per-(layer×mode) `access:{allow[],forbid[]}` 행렬**로
> 교체한다. 근거: blocker① 스파이크(PR #71)를 **독립 재현**(`node frontend-workflow-kit/temp/runs/axis2-a-blocker1-spike/synth-policy.mjs`,
> 2026-06-21) — v1(단일 `edits_at`) = 정책 role-derived **10/14 불일치**, v2(per-(layer×mode) 행렬) = **0/14
> byte-동치**. 따라서 §2 "직교 합성"→"얽힌 mode×layer 행렬"(REFRAME), §3 스키마 교체, §4 `fact`/`access`/`gates`
> 3필드 분리, §7/§11 byte-동치 **2면**(forward-gate + backstop) 한정, §10① 강등(구현불가 → 스키마 교체로
> 해결되는 설계 결함). **이 정정은 새 산출물 축이 아니라 기존 readiness/mode 정책의 access 표현력(+gate
> semantics) 일반화**다 (roadmap 닫힌 산출물 축 목록 불변 — §9·OD-12 §4).

---

# 0. Scope / Non-goals

- **설계만** 산출한다. 다음은 명시적 non-goal:
  - `spec.mjs`·`readiness.mjs`·`implementation-mode-policy.yaml`·`lint-policy` 를 **이 작업에서 수정하지 않는다**(전부 PROPOSED).
  - `package.json` / CI 변경 없음.
- tier3 은 **계층 깊이(Axis 2)**만 다룬다. "같은 3계층을 어디에 두나"(Axis 1)는 [tier1], router/codegen 의미는 [tier2].
- 모드 사다리 7단계(maturity 축)는 **그대로 둔다** — tier3 은 모드를 추가하지 않고, *모드 안에서 다루는 계층 집합*을 데이터화한다(§2).

---

# 1. 문제 — 3계층 천장 (Axis 2)

킷의 모든 라이브 게이트가 **`screen → fake hook(AsyncState) → api` 3계층**을 코드 수준에서 가정한다:

| 박힌 곳 | 무엇 | 근거 |
|---|---|---|
| 모드 사다리 `requires`/`allowed_paths` | screen/domain_component/hook/api_client/api_schema role 만 참조 | `policies/implementation-mode-policy.yaml:21-101` |
| 게이트 fact | `fake_hook_exists` 단 하나가 데이터 seam 완성도를 대표 | `scripts/lib/spec.mjs:308-318` |
| layer-boundaries 린트 | 인식 layer = api/screens/ui **3종 고정** | `templates/meta/lint-policy.template.yaml:15-26` |
| role 어휘 | preset 고정 7 role | `presets/expo-feature.yaml:7-14` |

**가장 큰 단일 가정 = fake-hook/AsyncState seam.** 화면은 AsyncState 계약에만 의존하고 hook 이 내부에서 fixture↔useQuery 를
교체한다 — 즉 "화면과 HTTP 사이의 모든 것"이 단일 `hook` role 로 접혀, repository/use-case/service/view-model 이 들어갈
**게이트 단계 자체가 제거**된다. 결과(조사 보고서): Clean Architecture = unsupported, MVVM/FSD/Repository+Service = partial.

> tier1 의 role 추가는 "경로 데이터" 확장이라 새 role 을 선언해도 **게이트 의미가 안 생긴다**(어느 모드에서 열지·완성도 fact 가 없음).
> tier3 이 메우는 건 이 "게이트 의미" 공백이다.

---

# 2. 핵심 아이디어 — 순서 있는 `layers:` + per-layer access 행렬

핵심: 모드 사다리가 **maturity 단계**(skeleton→fixture→api-integrated→production)를 담당하고, **데이터 흐름의 계층 깊이**는
별도의 순서 있는 `layers:` 선언으로 데이터화한다. 둘을 readiness 가 **합성**한다.

```txt
maturity 단계 (모드, 고정 7단계)  ─┐
                                  ├─ readiness 가 둘을 합성 (판정 로직은 여전히 한 곳)
계층 깊이 (layers, 데이터 선언)   ─┘
```

> ⚠ **2026-06-21 정정 (PR #71 스파이크 — 독립 재현):** 위 두 축은 **직교(orthogonal)가 아니다.** fake-hook
> seam 이 `api-integrated-ui` 에서 `screen` 을 **특정해서 forbidden** 으로 막으므로(`implementation-mode-policy.yaml:91`),
> maturity×depth 는 **교차 제약된 mode×layer 행렬**이다. 단조 임계값(`edits_at`)으로 한 축을 다른 축에 투영하면
> 정책 role-derived 14셀 中 10셀이 틀린다(재현). 그러므로 위 "합성"은 **행렬 합성**으로 읽는다(독립 두 축의 *곱*
> 아님). 근거: [SPIKE-REPORT §2·해석](../../../../temp/runs/axis2-a-blocker1-spike/SPIKE-REPORT.md).

- 한 **layer** = (기존/신규 role glob) + (완성도 `fact`) + (모드별 편집권 `access` 행렬: allow/forbid) [+ 선택적
  `gates`: 그 계층 존재를 어느 모드의 진입 `requires` 로 쓰는가]. → `fact`/`access`/`gates` **3필드 분리**(§4).
- expo-feature 프리셋은 현 3계층을 **기본 `layers:` 선언**으로 동봉 → 합성 정책이 현 정책과 **byte-동치**(§7, tier1 의 회귀 기준 계열).
- 소비자는 `layers:` 에 repository/use-case/view-model 등을 추가 선언 → 그 계층이 **경로 허용/금지(access) + 완성도 fact + (opt-in) 게이트 + 린트 경계**를 얻는다.

---

# 3. 스키마 제안 (`project-layout.yaml` 확장, PROPOSED) — canonical = access 행렬

> **canonical 교체(2026-06-21).** source-of-truth 는 layer 당 단일 `edits_at` 스칼라가 **아니라**, layer 당
> **per-mode `access:{allow[],forbid[]}` 행렬**이다. 단조 누적 임계값으로는 정책의 비단조 편집권(열림→재잠금,
> 비연속 allow, 명시 forbidden)을 표현할 수 없다(§10①, SPIKE v1 10/14). `edits_at` 은 §3.1 의 **손실 alias**
> 로만 잔류한다.

```yaml
# policies/project-layout.yaml / presets/expo-feature.yaml  (PROPOSED 확장 — roles 위에 layers 추가)
version: 1
preset: expo-feature        # 프리셋이 roles + layers 둘 다 동봉

# (tier1) role → glob 은 그대로
roles:
  view_model: src/features/{domain}/viewmodels/**   # 예: MVVM 소비자가 추가

# (tier3) 순서 있는 depth 선언. 리스트 순서 = depth order(화면 근처 → 데이터 근처).
# 한 엔트리 = role + fact(존재) + access(모드별 편집권 행렬) + gates(선택). 세 필드는 서로 다른 산출물(§4).
# 아래 expo-feature 값은 현 implementation-mode-policy.yaml 의 role-derived 셀과 byte-동치(SPIKE v2 = 0/14).
layers:
  - role: route_entry
    fact: dir_has_files
    access: { allow: [route-skeleton] }
  - role: screen
    fact: dir_has_files
    access: { allow: [screen-skeleton, rough-fixture-ui, final-fixture-ui],
              forbid: [api-integrated-ui] }              # fake-hook 재-잠금 (비단조)
  - role: domain_component
    fact: dir_has_files
    access: { allow: [rough-fixture-ui, final-fixture-ui] }
  - role: hook
    fact: dir_has_files
    access: { allow: [rough-fixture-ui, api-integrated-ui] }   # final-fixture-ui 에서 GAP(비연속) — 의도
    # gates: <mode> 생략 → "경로 허용만"(게이트 아님). expo back-compat: fake_hook_exists := hook_present
  - role: api_client
    fact: dir_has_files
    access: { allow: [api-integrated-ui],
              forbid: [route-skeleton, screen-skeleton, rough-fixture-ui, final-fixture-ui] }
```

- `access.allow: [<mode>…]` / `access.forbid: [<mode>…]` → 로더가 그 모드의 `allowed_paths` / `forbidden_paths`
  에 role glob 을 합성(tier1 토큰 펼침의 연장; mode-major 로 **전치**). **리터럴/blanket guard 는 layers 밖** —
  `src/**`·`src/features/**`·`openapi.yaml`·`docs/frontend-workflow/**` 는 `implementation-mode-policy.yaml` 에
  손수 유지(§5). production-ready 의 screen 재허용은 이 `src/**` 리터럴 효과이지 layer 셀이 아니다.
- `gates: <mode>` → 로더가 `<role>_present == true` 를 그 모드의 `requires` 에 합성. **없으면** 그 계층은
  "경로 허용만"(게이트 아님) — 점진 도입 안전 기본값(§4).
- `fact` 는 v1 에서 `dir_has_files` 만(현 `fake_hook_exists` 와 동형). props/export/테스트 존재 등은 후속(§10).

**로더가 합성하는 resolved 정책(mode-major, role-token 셀만 — SPIKE 재현 TRUTH):**

| mode | allow (roles) | forbid (roles) |
|---|---|---|
| docs-only | — | — |
| route-skeleton | route_entry | api_client |
| screen-skeleton | screen | api_client |
| rough-fixture-ui | screen, domain_component, hook | api_client |
| final-fixture-ui | screen, domain_component | api_client |
| api-integrated-ui | hook, api_client | **screen** |
| production-ready | — (리터럴 `src/**`) | — |

> 오리엔테이션: **source = layer-major `access:` 행**(ordered `layers:` 와 일치), **resolved = mode-major 정책**
> (= `implementation-mode-policy.yaml` 현 구조). 둘은 **전치(transpose)**다. byte-동치는 resolved(mode-major)
> 에서 검증한다(§7).

> **모드는 안 늘린다.** Clean Arch 의 repository/use-case 는 *새 모드*가 아니라 *기존 fixture/api-integrated 단계에 속한 별도 계층*으로
> 표현된다. depth 가 늘어도 maturity 사다리는 7단계 그대로 → 사다리의 의미 보존.

## 3.1 `edits_at` 격하 (손실 alias)

`edits_at` 은 canonical 에서 제거하되, 편의상 남긴다면 **다음으로만 한정**한다:

- `edits_at: M` ≡ `access: { allow: [M, …, top] }` — **재-잠금·GAP 없는 신규 leaf 계층**(단조 누적) 한정 sugar.
- **byte-동치 비보장.** 현 expo 의 `screen`(재-잠금)·`hook`(GAP)·`api_client`/`route_entry`(명시 forbidden·비누적)는
  `edits_at` 로 표현 불가 → 이 alias 로 expo 프리셋을 적을 수 없다.
- 문서·스키마에 **"v1 draft / 손실 alias"** 로 명시. 신규 단순 계층의 빠른 선언용일 뿐, source-of-truth 아님.

---

# 4. fact ↔ access 분리 (spec.mjs fact 일반화 + 행렬 access) — PROPOSED

한 `layers:` 엔트리는 **서로 다른 두 산출물**을 낸다. 혼동 금지(초안의 `edits_at`+`gates` 혼선이 정확히 이 둘을 뭉갰다):

| | `fact` → `<role>_present` | `access` → allow/forbid 행렬 |
|---|---|---|
| 무엇을 답하나 | "이 계층이 **존재/완성** 됐나" | "모드 M 에서 이 계층 파일을 **편집 가능**한가" |
| 어디로 가나 | readiness **`requires:`** 입력 | mode 정책 **allowed_paths/forbidden_paths** |
| 성격 | **readiness 입력**(판정 전제) | **edit surface**(경로 게이트) |
| 파생 위치 | `spec.mjs:308-318` 일반화 | 로더 합성(§5, mode-major 전치) |
| PR #71 근거 | F3(`repository_present` 부재로 완비/공백 구분 불가) | F1/F2(추가 계층이 allow/forbid 어디에도 없음) |

세 번째 필드 `gates: <mode>` 는 이 둘을 잇는다 — "이 layer 의 `<role>_present` fact 를 어느 모드의 `requires` 로
합성하나". **`access` 만 있고 `gates` 없음**(경로 허용하되 어떤 `requires` 도 그 fact 를 참조 안 함) = 안전한
점진 도입 기본값. → `fact`(존재) / `access`(편집권) / `gates`(requires 합성) **3개 분리 필드**.

> **lint DAG 는 또 다른 관계**다 — import 경계(layer×layer)이지 access(layer×mode)도 fact(존재)도 아니다.
> 같은 `layers:` 선언의 *세 번째 투영*이며 import-경계 subset 만 쓴다(§6). access·fact·lint 셋을 한 표로 합치지 말 것.

## 4.1 fact 파생 일반화 (spec.mjs)

현재 `spec.mjs:308-318` 은 단일 `fake_hook_exists` 를 `layout.roleToDir('hook',{domain})` 에서 파생한다.
이를 **선언된 layer 집합에 대한 일반 파생**으로 바꾼다:

```txt
for each layer L in resolvedLayout.layers (fact: dir_has_files):
    // 가드 보존(spec.mjs:313-318 동형): srcDir·domain·layout 미주입이거나 roleToDir 미해소면 fact 생략.
    // 이 가드를 빠뜨리면 hook_present == fake_hook_exists byte-동치(§7)가 깨진다.
    if (srcDir && domain && layout):
        roleDir = layout.roleToDir(L.role, {domain})
        if (roleDir):
            facts[`${L.role}_present`] = dirHasFiles(resolve(projectRoot, roleDir), ['.ts','.tsx'])
```

- expo-feature 는 `hook` layer 를 선언 → `hook_present` 산출. **back-compat 별칭**: `fake_hook_exists := hook_present`
  (기존 정책 `requires: fake_hook_exists == true` · 골든 픽스처 불변).
- `implementation-mode-policy.yaml` 의 `requires` 는 `<role>_present` 를 일반적으로 참조 가능 → 새 계층이 게이트 진입조건이 됨(opt-in `gates`).
- **판정 로직은 여전히 readiness 한 곳**(불변식 #1). spec 은 fact 를 더 많이 *공급*만 하고, `min(fact_mode, decision_cap)` 계산은 불변.

---

# 5. source of truth — `layers/access` ↔ `implementation-mode-policy.yaml` (단일출처 경계)

초안의 §5("layers 가 정책 합성")와 §11("정책 불변")은 그대로면 모순이다(§10②). **무엇이 authoritative
인지를 셀 종류로 가른다:**

| 셀 종류 | authoritative source | 비고 |
|---|---|---|
| **role-token allowed/forbidden 셀** (`{roles.X}`) | **`layers[].access`** (canonical) | 로더가 mode-major 정책으로 **합성**(전치) — 정책 파일에 손수 쓰지 않음(→ 생성) |
| **리터럴/blanket guard** (`src/**`·`src/features/**`·`openapi.yaml`·`docs/**`) | `implementation-mode-policy.yaml` | layers 밖, 손수 유지 |
| **mode `order` · `requires` fact 조건** | `implementation-mode-policy.yaml` | maturity 사다리 자체 — 손수 유지 |

- **resolved policy = 로더(`layout-profile.mjs` 확장)가 합성** — `access.allow/forbid` → mode-major
  allowed/forbidden. tier1 이 이미 `{roles.X}` 토큰을 펼치는 것과 **같은 계열의 합성**(`resolvePaths` L161-195 연장).
  resolved = `synthesize(layers.access)`(role-token 셀) **∪** 손수 리터럴 셀.
- **머지 규칙:** tier1 의 `mergeRoles`(L70-76) 우선순위 계승 — `preset.layers < project-layout.layers <
  domains.<d>.layers`, **layer 단위 교체**(glob 병합 아님).
- → "정책 불변"은 *사다리·리터럴·requires* 에 한해 참, "정책 합성"은 *role-token 셀* 에 한해 참. §5/§11 을 이
  경계로 분리하면 둘 다 성립한다(§10② 해소).
- **불변식 보존(사람-전용 승격):** "게이트를 *올리는*"(새 계층을 `gates` 로 묶어 더 막는) 건 config 로 가능하되,
  LLM 이 **게이트를 내리는**(allow 자가 확장·forbid/gates 제거)은 금지. `layers/access` 편집은 사람 리뷰 대상
  (open-decisions.md "게이트 해제는 사람만"·README #6 계열). LLM 은 새 계층을 *추가 제안*만.
- tier2 와의 결합: codegen 어댑터가 산출하는 `roles.hook`/`roles.api_client` 출력은 해당 layer 의 fact 에 자연 합류(별도 결합 불필요).
- **drift 방지:** role-token 셀이 *생성물* 이 되면 `_meta` 멱등성 CI 와 **동일 패턴**(재생성→git diff→exit 1)을
  적용. ⚠ 단 현행 멱등성 step 은 `examples/coupon-feature/.../_meta` 만 diff 하므로, resolved 정책(또는 그
  fixture) 재생성·비교는 **새 check target 추가가 필요**(같은 메커니즘, 새 대상; 구현 OD 범위 — §10.3 #10).

---

# 6. lint 일반화 (layer-boundaries N계층 DAG, PROPOSED) — access 와 별도 투영

`access` 행렬(§3)과 layer-boundaries lint DAG 는 **같은 `layers:` 선언에서 파생되지만 서로 다른 관계**다.
한 표로 합치면 안 된다:

| | access matrix (§3) | layer-boundaries lint DAG |
|---|---|---|
| 관계 | (layer × **mode**) → 편집권 | (layer × **layer**) → import 허용 |
| 축 | maturity 사다리(시간/단계) | 정적 의존성 방향 |
| 질문 | "**언제** 편집하나" | "**무엇이 무엇을** import 하나" |
| 멤버십 | 모든 layer(`route_entry` 포함) | **import-경계 계층만**(`route_entry` 제외) |

현재 `lint-policy.template.yaml:15-26` 의 `defaults.paths` 는 screens/api/ui **3종 고정**이고 생성 규칙은
api/ui upward-import 만 본다. tier3 은 이를 **선언된 layer DAG**로 일반화:

```yaml
# lint-policy.yaml  (PROPOSED)
layer_rules:
  # access 의 layers 리스트 순서에서 import-경계 계층만 추린 subset (route_entry 등 비-import 계층 제외)
  order: [screen, view_model, use_case, repository, data_source, api_client]  # 화면→데이터
  forbid_upward: true        # 아래 계층이 위 계층을 import 하면 위반 (의존성 방향 강제)
  allow:
    screen: [view_model]     # 명시 예외 (FSD 6레벨·Clean Arch 의존성 역전 표현)
```

- **access 의 `order`(layers 리스트 전체) ≠ lint 의 `order`(import-경계 subset).** 같은 선언의 *다른 subset/투영*
  이다 — `route_entry` 는 access 행은 갖지만 import-경계 노드가 아니므로 lint `order` 에서 제외. 현행
  `lint-gen-core.mjs` 가 아는 계층은 api/screens/ui 3종뿐이라, 그 일반화 전에 비-import 계층을 lint `order` 에
  넣으면 미지원 계층 오류가 난다 → 두 order 의 분리는 필수.
- FSD 의 `app>pages>widgets>features>entities>shared` 6레벨 단방향 위계, Clean Arch 의 `screen→use_case→repository(interface)`
  의존성 역전이 **선언된 DAG**로 표현된다.
- `lint-gen.mjs` 가 이 DAG 에서 import 경계 규칙을 생성(현 3종 하드코딩 대체). **기본 warning-first**(ratchet) —
  도입 telemetry 후 hard 승격은 별도 사람 OD(OD-12 §3).

---

# 7. 하위호환 — expo-feature byte-동치 (회귀 기준, 2면 검증)

tier1 의 안전 속성(`presets/expo-feature.yaml` = 현 하드코딩과 byte-동치)을 tier3 도 **그대로 계승**한다. 단
byte-동치는 **두 면**에서 검증해야 한다(둘 다 통과해야 회귀 안전):

```txt
expo-feature 프리셋의 layers/access 선언 = 현 3계층(screen/hook/api) →
  (a) forward-gate parity : 로더 합성 allowed/forbidden == 현 implementation-mode-policy.yaml
                            role-derived 셀 (SPIKE v2 = 0/14)
  (b) backstop parity     : materializeGuardedSurface == 현 expo guarded surface (무수정)
  + 같은 fact(hook_present = fake_hook_exists) → 같은 readiness → 같은 golden 픽스처 통과
```

- **(a) forward-gate parity:** 행렬 스키마가 직접 인코딩 — `screen.forbid:[api-integrated-ui]` 등. SPIKE v2 가
  role-derived 14셀 0 불일치로 재현. `edits_at` 로는 forbidden 5/5 가 통째로 사라지고 allowed 가 번진다(§10①).
- **(b) backstop parity:** `layout-profile.mjs:211-215` 의 재-잠금 **비채택 규칙**(`forbiddingIdx(5) ≥ tIdx(2)`
  → screen 재-잠금 표면을 `materializeGuardedSurface` 가 의도적으로 채택 안 함)을 **무수정** 유지해야 expo
  backstop 이 byte-동치. 재-잠금은 **forward 게이트·readiness 의 몫**이지 diff-backstop clearance 대상이 아니다.
  layers 는 **forward gate 만 구동**, 백스톱은 합성 정책에서 기존 함수가 무수정 파생.
- **layers 밖:** production-ready 의 screen 재허용은 `src/**` 리터럴 효과(§5), guarded surface 의 `openapi.yaml`
  은 threshold 무관 상수 — 둘 다 layers 가 소유하지 않는다.
- `examples/coupon-feature` 골든(`expected-readiness.json` 등)과 `fake_hook_exists` 게이트가 **그대로 통과**해야 한다.
- tier3 도입은 **동작 변경이 아니라 값의 출처 이동**(하드코딩/손수 정책 셀 → 선언 access). 이게 회귀 안전망이자 PR 수용 기준.

---

# 8. 선결 과제 (Axis 1 wiring — tier3 전에/함께 랜딩)

조사에서 드러난, 비표준 레이아웃 도입조차 막는 잔여 wiring. tier3 의 계층 일반화가 의미를 가지려면 먼저 닫혀야 한다:

| # | 과제 | 현 상태 | 근거 |
|---|---|---|---|
| P1 | `catalog-gen` 이 `ui_primitive` role(resolvedLayout) 소비 — `UI_MARKER` 하드코딩 제거 | silent-wrong(비표준 ui 경로 → catalog 0건 → rough-fixture-ui 차단) | `scripts/lib/catalog-gen.mjs:23` |
| P2 | `catalog/artifact-manifest.yaml` 생성뷰 `source:` 글롭 토큰화 | 리터럴 잔존 | manifest `src/components/ui/**`·`src/app/**`·`src/api/schemas/**` |
| P3 | `doctor.mjs` — 선언된 layer/role 글롭이 실제 레포에 존재하는지 검사(warning) | 미존재 | tier1 §9 |
| P4 | `check-generated-files` 의 component-catalog/codegen resolveInput role 바인딩 | route_entry 만 바인딩, ui/schema 하드코딩 | `scripts/lib/check-generated-files.mjs` |

> P1·P3 은 cold-start 경고(이번 PR)와 같은 계열의 "도입 fail-open/silent-wrong 닫기" 라 tier3 의 자연 선결.

---

# 9. 보존 불변식 (킷 README §불변식 와 정합)

- **#1 판정 로직 한 곳.** `layers/access` 는 *데이터*다. 모드 판정은 여전히 `readiness.mjs`(`computeReadiness`)
  단일 출처 — fact 와 경로 셀 *공급원*만 늘어난다(`min(fact_mode, decision_cap)` 계산 불변).
- **게이트 해제는 사람만** (open-decisions.md 원칙; README #6 "confirmed 승격은 사람만"과 같은 계열). 새 계층을
  `gates` 로 묶는 건 config 가능하나, LLM 은 게이트를 *올리기만*(§5). `layers/access` 편집은 사람 리뷰.
- **#7 생성기 멱등.** lint/catalog 생성기 + (신규) resolved-정책 합성은 선언에서 결정적으로 산출(정렬 고정).
- **warning-first 기본.** 새 계층 fact 게이트·layer 린트는 도입 telemetry 전까지 warning — 하드 승격은 별도 사람 OD(OD-12 §3).
- **새 산출물 축 아님.** 이 설계는 roadmap 의 닫힌 *artifact axes* 목록(`roadmap-current.md:30-40`)에 축을
  더하지 않는다. **기존 readiness/mode 정책의 access 표현력(+gate semantics) 일반화**다 (OD-12 §4).

---

# 10. Open decisions — 방향(OD-12) / 구현(OD-12-impl) 분리

> ①~③ 은 tier3 초안 코덱스 리뷰(2026-06-21)가 표면화한 핵심 쟁점이며, **PR #71 evidence + blocker① 스파이크
> 독립 재현으로 ① 은 강등·②③ 은 정리/통일**됐다. resolve(구현 착수)는 여전히 **사람만**.

## 10.1 해소된 쟁점 (이 정정으로 닫힘 방향 — 사람 confirm 대상)

- **① 비단조 allow/forbidden 표현력 — 강등(blocker → 해결되는 설계 결함).** 현 정책 편집권은 *비단조*다:
  `{roles.screen}` 은 screen-skeleton~final 에서 allowed → **api-integrated 에서 forbidden**(fake-hook 계약,
  `implementation-mode-policy.yaml:91`) → production 에서 `src/**` 리터럴로 재허용. `{roles.hook}` 은
  rough·api-integrated allowed 지만 그 사이 final 에서 GAP(비연속). **resolution(2026-06-21, 독립 재현):** 단일
  `edits_at` = role-derived **10/14 불일치**(forbidden 5/5 전멸 + allowed 비누적/비연속 미표현), per-(layer×mode)
  `access` 행렬 = **0/14 byte-동치**. → "구현 불가" 아님, **"§3 스키마 교체로 해결되는 설계 결함"**. 단 §3 단일
  `edits_at` 은 폐기/격하(§3.1), "한 줄 depth" 셀링포인트 축소(정직 — byte-동치엔 layer 당 명시 mode 멤버십 필요
  = 정책 role-derived 절반과 동일 정보량). [SPIKE-REPORT](../../../../temp/runs/axis2-a-blocker1-spike/SPIKE-REPORT.md).
- **② `layers` ↔ 정책 단일출처 / 병합 의미 — 정리됨(§5).** §5(layers 합성) vs §11(정책 불변) 충돌은 **셀 종류로
  분리**: role-token 셀은 `layers/access` authoritative(→ 생성), 리터럴·requires·order 는 정책 손수. 머지는 tier1
  `mergeRoles` 우선순위·layer 단위 교체 계승. (구현 시 "정책=생성물" vs "추가만"의 최종 택은 §10.3 #4.)
- **③ "depth 축" 용어 — 통일.** README 표·§1 의 "depth 축" 라벨은 **포지셔닝일 뿐 새 artifact 축이 아니다**
  (roadmap 닫힌 목록 불변). 본 문서·README 는 "**readiness/mode 정책의 access 표현력 일반화**"로 표현을 통일하고,
  "depth 축" 표기에는 그 각주를 단다(§9, OD-12 §4).

## 10.2 OD-12 (방향) — 지금 사람 resolve

1. **선회 방향 택1**(decision-prep §5): A=Axis 2 일반화(추천) / B=현행 유지+도입 강행 / C=하이브리드.
2. **거버넌스 확인:** 이 일반화는 **새 산출물 축 추가가 아님**을 명문화 → roadmap 닫힌 목록(`:30-40`) 불변,
   "새 축 금지"(`:125`)에 "이 일반화는 그 금지 대상 아님" 예외 각주.
3. **§3 재설계 인가**(행렬 스키마) + **신규 계층 게이트는 warning-first 기본**(telemetry 전 hard 승격 없음).

## 10.3 OD-12-impl (구현 OD) — A 일 때만 별도로 열고 지금은 resolve 안 함

4. **source-of-truth & 머지:** role-token 셀을 합성 `layers/access` 에 양도(정책=리터럴+requires+order, 생성+멱등성)
   vs layers 추가만(정책 손수, drift 감수). 보수적 기본=전자.
5. **스키마 잔재:** `edits_at` 손실 alias 잔류(§3.1) vs 완전 삭제.
6. **게이트 강도 기본값:** 신규 계층은 `access`(경로 허용)만, `gates`(requires)는 엄격 opt-in + 사람 승격.
7. **byte-동치 범위:** 회귀는 forward-gate parity(SPIKE) **AND** backstop guarded-surface parity 둘 다(§7).
8. **`layers` 물리 위치:** tier1 **OD-10**(킷 내부 vs 소비 루트)과 같은 파일에서 함께 닫기.
9. **`fact` 종류 로드맵:** v1 `dir_has_files` 만; props/export/test 존재 fact 는 후속.
10. **멱등성 CI 새 target:** role-token 셀이 생성물이 되면 resolved 정책 재생성·비교 check 추가(§5; 현행은 coupon
    `_meta` 만 diff).
11. **maturity × depth 표면화:** readiness 출력이 "어느 계층이 어느 모드를 막는지"를 어떻게 보일지(next_actions 확장).
12. **tier2 결합 경계:** codegen 출력 계층(api_client/hook)을 layers 선언이 어디까지 소유할지.

---

# 11. 영향 파일 / 마이그레이션 (PROPOSED, future PR)

| 종류 | 파일 | 변경 |
|---|---|---|
| edit | `policies/project-layout.yaml` / `presets/expo-feature.yaml` | `layers:`(role+fact+`access`+gates) 선언 추가 (expo = 현 3계층, byte-동치) |
| edit | `scripts/lib/layout-profile.mjs` | `layers:` 파싱 + `access.allow/forbid` → resolved 정책 **합성(mode-major 전치)** + 멱등성 비교 대상 |
| **edit** | **`scripts/lib/spec.mjs`** (L308-318) | `fake_hook_exists` 단일 파생 → `<role>_present` 일반 파생 + back-compat 별칭(가드 L313-318 보존) |
| edit | `policies/implementation-mode-policy.yaml` | **role-token allowed/forbidden 셀은 생성**(손수 제거); 리터럴·`requires`·`order` 만 손수. `requires` 일반 참조 허용 — expo 동작 불변 |
| edit | `scripts/lib/lint-gen-core.mjs` + `templates/meta/lint-policy.template.yaml` | `layer_rules` DAG(import-경계 subset) → import 경계 규칙 생성(3종 하드코딩 대체) |
| edit | `scripts/lib/catalog-gen.mjs` (L23) | P1 — `UI_MARKER` 제거, `ui_primitive` role 소비 |
| edit | `catalog/artifact-manifest.yaml` | P2 — 생성뷰 `source:` 토큰화 |
| new | `scripts/doctor.mjs` | P3 — 선언 글롭 존재 검사(warning) |
| edit | `scripts/lib/check-generated-files.mjs` | P4 — ui/schema resolveInput role 바인딩 |
| **CI** | `.github/workflows/frontend-workflow-kit.yml` | role-token 셀이 생성물이면 resolved 정책 재생성·diff **새 check target**(현행은 coupon `_meta` 만 diff — §5) |

**회귀 기준(2면 + alias + 골든):** ① **forward-gate parity** — 로더 합성 allowed/forbidden == 현 정책
role-derived 셀(SPIKE v2 식 0/14) · ② **backstop parity** — `materializeGuardedSurface` == 현 expo 표면(무수정,
재-잠금 비채택 규칙 L211-215 유지) · ③ `fake_hook_exists == hook_present` alias · ④ `examples/coupon-feature`
골든 readiness 불변. 하나라도 깨지면 설계 결함. production-ready 의 `src/**` 리터럴은 layers 밖(범위 외).
