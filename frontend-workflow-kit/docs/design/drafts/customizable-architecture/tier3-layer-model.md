# Tier 3 — Layer Model (data-driven layer depth) — design

> Status: **DESIGN / SPEC ONLY**. 2026-06-21. 소비 프로젝트의 **아키텍처 계층 깊이**(repository/use-case/service/
> view-model 등)를 하드코딩 대신 설정으로 표현하는 설계. **구현이 아니다** — 코드·package script·CI·기존
> 정책/매니페스트 파일 변경을 지시하지 않는다. 모든 변경은 **PROPOSED (future PR)** 표기.
> 상위 맥락: [README.md](README.md). 짝 문서: [tier1-layout-profile.md](tier1-layout-profile.md)(경로 바인딩) ·
> [tier2-router-adapter.md](tier2-router-adapter.md)(router/codegen 의미).
> 결정 근거: `../../../temp/runs/axis2-pivot-decision-prep-001.md`(OD-12) · `../../../temp/reports/kit-multilayer-adoption-assessment-20260621.md`.

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

# 2. 핵심 아이디어 — 순서 있는 `layers:` (depth 를 데이터로)

핵심: 모드 사다리가 **maturity 축**(skeleton→fixture→api-integrated→production)을 담당하고, **데이터 흐름의 계층 깊이**는
별도의 순서 있는 `layers:` 선언으로 데이터화한다. 두 축이 **합성**된다.

```txt
maturity 축 (모드, 고정 7단계)   ─┐
                                  ├─ readiness 가 둘을 합성 (판정 로직은 여전히 한 곳)
depth 축 (layers, 데이터 선언)   ─┘
```

- 한 **layer** = (기존/신규 role glob) + (완성도 fact) + (어느 모드에서 편집이 열리는가) [+ 선택적: 어느 모드를 *게이트*하는가].
- expo-feature 프리셋은 현 3계층을 **기본 `layers:` 선언**으로 동봉 → 현 동작과 **byte-동치**(§7, tier1 의 회귀 기준 계열).
- 소비자는 `layers:` 에 repository/use-case/view-model 등을 추가 선언 → 그 계층이 **경로 허용 + 완성도 게이트 + 린트 경계**를 모두 얻는다.

---

# 3. 스키마 제안 (`project-layout.yaml` 확장, PROPOSED)

```yaml
# policies/project-layout.yaml  (PROPOSED 확장 — roles 위에 layers 추가)
version: 1
preset: expo-feature        # 프리셋이 roles + layers 둘 다 동봉

# (tier1) role → glob 은 그대로
roles:
  view_model: src/features/{domain}/viewmodels/**   # 예: MVVM 소비자가 추가

# (tier3) 순서 있는 depth 선언. 위→아래 = 화면에 가까움→데이터에 가까움
layers:
  - role: screen
    fact: dir_has_files          # 완성도 측정 방식 (v1 은 dir_has_files 하나; 후속 확장)
    edits_at: screen-skeleton    # 이 계층 편집이 열리는 최소 모드 (allowed_paths 파생)
  - role: view_model             # ← 소비자 추가 계층
    fact: dir_has_files
    edits_at: rough-fixture-ui
    gates: rough-fixture-ui      # 이 계층 존재가 해당 모드 진입 requires-fact (선택)
  - role: hook
    fact: dir_has_files
    edits_at: rough-fixture-ui
  - role: api_client
    fact: dir_has_files
    edits_at: api-integrated-ui
```

- `edits_at` → 로더가 해당 모드의 `allowed_paths` 에 그 role glob 을 spread (tier1 토큰 펼침의 연장).
- `gates: <mode>` → 로더가 `<role>_present == true` 를 그 모드의 `requires` 에 합성. **없으면** 그 계층은 "경로 허용만"(게이트 아님) — 점진 도입 안전.
- `fact` 는 v1 에서 `dir_has_files` 만(현 `fake_hook_exists` 와 동형). props/export/테스트 존재 등은 후속.

> **모드는 안 늘린다.** Clean Arch 의 repository/use-case 는 *새 모드*가 아니라 *기존 fixture/api-integrated 단계에 속한 별도 계층*으로
> 표현된다. depth 가 늘어도 maturity 사다리는 7단계 그대로 → 사다리의 의미 보존.

---

# 4. fact 일반화 (spec.mjs, PROPOSED)

현재 `spec.mjs:308-318` 은 단일 `fake_hook_exists` 를 `layout.roleToDir('hook',{domain})` 에서 파생한다.
이를 **선언된 layer 집합에 대한 일반 파생**으로 바꾼다:

```txt
for each layer L in resolvedLayout.layers (fact: dir_has_files):
    facts[`${L.role}_present`] = dirHasFiles(layout.roleToDir(L.role, {domain}), ['.ts','.tsx'])
```

- expo-feature 는 `hook` layer 를 선언 → `hook_present` 산출. **back-compat 별칭**: `fake_hook_exists := hook_present`
  (기존 정책 `requires: fake_hook_exists == true` · 골든 픽스처 불변).
- `implementation-mode-policy.yaml` 의 `requires` 는 `<role>_present` 를 일반적으로 참조 가능 → 새 계층이 게이트 진입조건이 됨.
- **판정 로직은 여전히 readiness 한 곳**(불변식 #1). spec 은 fact 를 더 많이 *공급*만 하고, min(fact_mode, decision_cap) 계산은 불변.

---

# 5. mode ↔ layer 결합 (사람-전용 승격 보존)

- 로더(`layout-profile.mjs` 확장)가 `layers[].edits_at`/`gates` 를 읽어 **resolved policy 의 allowed_paths/requires 를 합성**한다.
  정책 YAML 의 손수 토큰 박기(tier1)가 *데이터 선언*으로 승격된다.
- **불변식 보존:** "게이트를 *올리는*"(새 계층을 gates 로 묶어 더 막는) 건 config 로 가능하되, LLM 이 **게이트를 내리는**(allowed_paths
  자가 확장·gates 제거) 건 금지. `layers:` 편집은 사람 리뷰 대상(README 불변식 6 계열). LLM 은 새 계층을 *추가 제안*만.
- tier2 와의 결합: codegen 어댑터가 산출하는 `roles.hook`/`roles.api_client` 출력은 해당 layer 의 fact 에 자연 합류(별도 결합 불필요).

---

# 6. lint 일반화 (layer-boundaries N계층, PROPOSED)

현재 `lint-policy.template.yaml:15-26` 의 `defaults.paths` 는 screens/api/ui 3종이고 생성 규칙은 api/ui upward-import 만 본다.
tier3 은 이를 **선언된 layer DAG**로 일반화:

```yaml
# lint-policy.yaml  (PROPOSED)
layer_rules:
  order: [screen, view_model, use_case, repository, data_source, api_client]  # 화면→데이터
  forbid_upward: true        # 아래 계층이 위 계층을 import 하면 위반 (의존성 방향 강제)
  allow:
    screen: [view_model]     # 명시 예외 (FSD 6레벨·Clean Arch 의존성 역전 표현)
```

- FSD 의 `app>pages>widgets>features>entities>shared` 6레벨 단방향 위계, Clean Arch 의 `screen→use_case→repository(interface)` 의존성
  역전이 **선언된 DAG**로 표현된다.
- `lint-gen.mjs` 가 이 DAG 에서 import 경계 규칙을 생성(현 3종 하드코딩 대체). **기본 warning-first**(ratchet) — 도입 telemetry 후 승격(OD-12 §3).

---

# 7. 하위호환 — expo-feature byte-동치 (회귀 기준)

tier1 의 안전 속성(`presets/expo-feature.yaml` = 현 하드코딩과 byte-동치)을 tier3 도 **그대로 계승**한다:

```txt
expo-feature 프리셋의 layers: 선언 = 현 3계층(screen/hook/api) =
   → 같은 fact(hook_present=fake_hook_exists) → 같은 readiness → 같은 golden 픽스처 통과
```

- `examples/coupon-feature` 골든(`expected-readiness.json` 등)과 `fake_hook_exists` 게이트가 **그대로 통과**해야 한다.
- tier3 도입은 **동작 변경이 아니라 값의 출처 이동**(하드코딩 fact → 선언 fact). 이게 회귀 안전망이자 PR 수용 기준.

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

- **#1 판정 로직 한 곳.** `layers:` 는 *데이터*다. 모드 판정은 여전히 `readiness.mjs`(`computeReadiness`) 단일 출처 — fact 공급원만 늘어난다.
- **#6 게이트 푸는 전이는 사람만.** 새 계층을 gates 로 묶는 건 config 가능하나, LLM 은 게이트를 *올리기만*(§5). `layers:` 편집은 사람 리뷰.
- **#7 생성기 멱등.** lint/catalog 생성기는 선언에서 결정적으로 산출(정렬 고정).
- **warning-first 기본.** 새 계층 fact 게이트·layer 린트는 도입 telemetry 전까지 warning(OD-12 §3) — 하드 승격은 사람 결정.

---

# 10. Open decisions (tier3 구현 OD 에서 닫을 것)

- **계층 게이트의 강도:** 새 계층을 `gates`(진입 requires)로 막을지, `edits_at`(경로 허용만)으로 둘지의 기본값. 보수적이면 경로 허용만 + 명시 opt-in gates.
- **`fact` 종류 확장:** v1 `dir_has_files` 외에 props/export/테스트 존재 등 완성도 측정을 언제 도입할지.
- **`layers` 물리 위치:** tier1 OD-10(킷 내부 vs 소비 루트)과 **함께** 닫는다(같은 파일).
- **maturity × depth 매트릭스 표면화:** readiness 출력이 "어느 계층이 어느 모드를 막는지"를 어떻게 보여줄지(next_actions 확장).
- **tier2 결합 경계:** codegen 출력 계층(api_client/hook)을 layers 선언이 어디까지 소유할지.

---

# 11. 영향 파일 / 마이그레이션 (PROPOSED, future PR)

| 종류 | 파일 | 변경 |
|---|---|---|
| edit | `policies/project-layout.yaml` / `presets/expo-feature.yaml` | `layers:` 선언 추가 (expo = 현 3계층, byte-동치) |
| edit | `scripts/lib/layout-profile.mjs` | `layers:` 파싱 + `edits_at`/`gates` → resolved policy 합성 |
| **edit** | **`scripts/lib/spec.mjs`** (L308-318) | `fake_hook_exists` 단일 파생 → `<role>_present` 일반 파생 + back-compat 별칭 |
| edit | `policies/implementation-mode-policy.yaml` | (선택) `requires` 에 `<role>_present` 일반 참조 허용 — expo 는 불변 |
| edit | `scripts/lib/lint-gen-core.mjs` + `templates/meta/lint-policy.template.yaml` | `layer_rules` DAG → import 경계 규칙 생성(3종 하드코딩 대체) |
| edit | `scripts/lib/catalog-gen.mjs` (L23) | P1 — `UI_MARKER` 제거, `ui_primitive` role 소비 |
| edit | `catalog/artifact-manifest.yaml` | P2 — 생성뷰 `source:` 토큰화 |
| new | `scripts/doctor.mjs` | P3 — 선언 글롭 존재 검사(warning) |
| edit | `scripts/lib/check-generated-files.mjs` | P4 — ui/schema resolveInput role 바인딩 |

**회귀 기준:** `examples/coupon-feature` 골든 + `fake_hook_exists` 게이트가 expo-feature 프리셋으로 **byte-동치 통과**. 통과 못 하면 설계 결함.
