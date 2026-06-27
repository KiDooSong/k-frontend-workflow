# Resolution report — consumer-ck 도입 이슈, Customizable Architecture 착수 후 해소 현황

> Status: complete. Date: 2026-06-16.
> **이 문서는 `temp/runs/2026-06-15/consumer-ck-adoption-001-design-intent-review.md`(설계의도 리뷰)를 대체(supersede)한다.** 그 리뷰의 "R4는 계획 밖 신규 스코프" 서술은 집 작업(Customizable Architecture 착수)으로 outdated가 됐다. 본 문서가 설계의도 분류 + 해소 현황을 통합한 최신본이다.
> 원본 증거: [temp/runs/consumer-ck-ai-mobile-adoption-001.md](../consumer-ck-ai-mobile-adoption-001.md) (probe raw — 보존).
> 킷 리비전: probe 시점 `main @ 3faf72d` → 현재 `main @ 05ce6f4` (PR #45~#49, 41 커밋).

---

## 0. TL;DR

probe(001)가 찾은 5개 이슈 중, **forbidden-paths 레이아웃 결합(R4)은 해소**됐고 **route-tree는 이식성까지 강화**됐다. 핵심 동력은 **`Customizable Architecture`** 이니셔티브(Tier1 레이아웃 프로파일 + Tier2 라우터 어댑터) — 이는 설계의도 리뷰가 "버그가 아니라 의도된 레이아웃 가정, R1/R4는 채택형→이식형 신규 스코프"라고 했던 바로 그 전환을 **실제로 착수**한 것이다. 단 **catalog-gen(R1)은 인프라(`ui_primitive` role)만 깔리고 배선 미완 — ck 하드 블로커 잔존**, **validate cold-start(R2)·nav-graph fail-loud(R3)는 미착수**.

## 1. 그동안의 경위

```
probe-001 (3faf72d)         → 5개 이슈 발견 (route-tree✅ / catalog-gen❌ / nav-graph⚠️ / validate🔴 / forbidden-paths🔴)
design-intent review (06-15)→ 미채택 증상 vs 영구 설계 분류. "R1/R4 = 채택형→이식형 신규 스코프, 계획 밖"
home work  (→ 05ce6f4)      → Customizable Architecture 착수: Tier1 layout profile + Tier2 router adapter  ← 본 문서가 점검
```

## 2. 집 작업의 정체 — Customizable Architecture

proposal 첫 문장: *"킷은 현재 단 하나의 컨벤션을 가정한다: Expo Router(`src/app`) + feature-folder(`src/features/{domain}`)."* — probe·리뷰가 지목한 근본 원인을 정면으로 해소하려는 2-티어 설계·구현.

| 티어 | 메커니즘 | 산출물 |
|---|---|---|
| **Tier1 — 레이아웃 프로파일** | role→glob 순수 설정 (변형의 ~90%) | [layout-profile.mjs](frontend-workflow-kit/scripts/lib/layout-profile.mjs) · [project-layout.yaml](frontend-workflow-kit/policies/project-layout.yaml) · `presets/expo-feature.yaml` · 정책 `{roles.*}` 토큰화 |
| **Tier2 — 라우터 어댑터** | 플러그인 전략 패턴 (파일트리↔코드정의 패러다임) | [route-core.mjs](frontend-workflow-kit/scripts/lib/route-core.mjs) · [adapters/routers/expo-router.mjs](frontend-workflow-kit/scripts/adapters/routers/expo-router.mjs) · custom 어댑터 예제 |

설계 문서: [customizable-architecture/](kit-dev/temp/proposals/customizable-architecture/). 소비자 커스터마이즈 파일은 `project-layout.yaml` 하나에 `roles`(Tier1)·`adapters`(Tier2)를 모두 담는다. 머지 순서: preset < `roles` < `domains.<d>.roles`.

preset `expo-feature` 역할(= 현 하드코딩과 byte-동치):
```yaml
route_entry: src/app/**          screen: src/features/{domain}/screens/**
domain_component: .../components/** hook: .../hooks/**
ui_primitive: src/components/ui/** api_client: src/api/**   api_schema: src/api/schemas/**
```

> 보너스: Codex 리뷰로 게이트-fact 결합점(`fake_hook_exists` @ spec.mjs, 검사8 api/schemas @ validate)까지 단일 `resolvedLayout`로 일원화 — 설계의도 리뷰의 R4(forbidden-paths만)보다 **더 깊이** 들어갔다. Interaction Matrix v2(구조화 Result 컬럼)도 구현(로드맵 항목).

## 3. ★ 이슈별 해소 매트릭스

| probe 이슈 | 이전 | 현재 | 근거 |
|---|---|---|---|
| **forbidden-paths 무력화 (R4)** | 🔴 | ✅ **해소** | 정책 전부 `{roles.*}` 토큰화 ([policy:44-91](frontend-workflow-kit/policies/implementation-mode-policy.yaml#L44)), forbidden-paths가 layout-profile 소비. ck는 `project-layout.yaml`에서 `api_client`·`screen` role을 자기 경로로 오버라이드(다중경로 role 지원) → backstop이 ck 실제 변경 감시 |
| **route-tree** | ✅ | ✅ **+ 이식성 강화** | route-core + expo-router 어댑터 + 커스텀 라우터 예제. 비-Expo 라우터도 지원 |
| **catalog-gen 하드 블로커 (R1)** | ❌ | ⚠️ **미해소 (인프라만)** | preset에 `ui_primitive` role 생성됨. 그러나 **catalog-gen이 프로파일 미소비** — `UI_MARKER='/src/components/ui/'` 하드코딩 유지 ([catalog-gen.mjs:23](frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L23)). proposal이 "ui_primitive role로 **일반화 대상**"이라 명시한 미착수 후속. ck `design-system/components`는 여전히 0 |
| **validate cold-start 공허 green (R2)** | 🔴 | ❌ **미해소** | matrix v2 검사13만 추가(warning-first). adopted/bootstrap 신호 없음 — 빈 docs 여전히 green |
| **nav-graph fail-loud 갭 (R3)** | ⚠️ | ❌ **미해소** | matrix v2 dual-read만, exit/가드 없음 — 빈/없는 docs에 여전히 조용히 통과 |

## 4. 설계의도 분류 — 갱신 (리뷰 흡수)

설계의도 리뷰의 부류 분류는 유효하되, **부류 B(영구 레이아웃 결합)의 운명이 바뀌었다**:

- **부류 A (미채택 증상 — ck 저작 시 해소)**: nav-graph 빈 출력·state/readiness 빈 출력은 여전히 ck가 `docs/frontend-workflow/`를 저작하면 채워진다. (단 R2·R3은 그 *fail-loud/공허green* 성질이 미개선.)
- **부류 B (구 "영구 설계 결합")**: 리뷰는 "버그 아님, 계획 밖 신규 스코프"라 했다. **집 작업이 이를 계획으로 끌어들여 Tier1/Tier2로 착수** → forbidden-paths(R4)는 해소, catalog-gen(R1)은 인프라까지. 즉 "영구 결합"이 아니라 **"이식형으로 전환 중"**으로 상태가 이동했다.

## 5. 남은 작업 (우선순위)

1. **catalog-gen → `ui_primitive` 배선 (R1) — 최우선.** ck의 hard blocker이고 인프라(role)는 이미 존재. `UI_MARKER` 하드코딩을 resolved-layout의 `ui_primitive`로 교체하면 ck `design-system/components` 오버라이드로 잡힌다. catalog `artifact-manifest.yaml`의 `source:` 글롭도 함께 토큰화 필요(proposal §0 #2).
2. **validate cold-start 신호 (R2).** 저작 0(navigation-map 부재) 시 vacuous green 대신 `adopted=false` 진단/비-green. 도입 초기 CI 배선 함정 해소.
3. **nav-graph fail-loud (R3).** 없는/빈 `--docs`에 catalog-gen과 대칭으로 exit 2/명시 경고.

## 6. ck 도입 함의 (현 시점)

- **forbidden-paths**: ✅ 이제 ck가 `project-layout.yaml`로 `api_client`(→`src/lib/**`·`src/features/{domain}/api/**`)·`screen`(→`src/app/**`)을 오버라이드하면 backstop이 ck 실제 경로를 감시. **채택 가능**.
- **route-tree**: ✅ 그대로 + 커스텀 라우터까지.
- **catalog-gen**: ❌ 여전히 0 — `ui_primitive` 배선(작업 1) 전까지 ck 도입 불가.
- **validate/nav-graph**: 동작 자체는 ck 저작 시 채워지나, cold-start green·fail-loud 갭은 미개선.

## 7. 검증 방법 / 한계

- 본 점검은 `05ce6f4` **정적 코드 + 정책 토큰화 + 소비자 import** 대조. layout-profile 소비자 확인: forbidden-paths·validate·readiness·workflow-state·workflow-packet·check-generated (catalog-gen **제외** 확인).
- **미수행(권장 후속)**: ck 워크트리에 `project-layout.yaml` 오버라이드를 얹어 probe 재실행 → forbidden-paths가 실제로 ck 경로를 감시하고 catalog-gen이 여전히 0인지 **실측 검증**. 이게 R4 해소의 gold-standard 확인.
- R1/R2/R3 "미해소"는 부정 단정이므로 grep으로 교차확인함(adopted/bootstrap·exit/existsSync·ui_primitive 소비 전부 0건).
