# 프론트 워크플로우 킷 — 개발 현황 · 잔여 개발 · 다층 추상화(Expo RN) 도입 대응력 조사 보고서

> 작성일: 2026-06-21 · 방법: 멀티에이전트 워크플로우 조사(6개 차원 병렬 + 4개 아키텍처 시나리오 적대적 검증, 10 에이전트) + 정본 코드 교차검증
> 대상: `frontend-workflow-kit/` (스냅샷 2026-06-19 roadmap 기준) · 모든 근거는 `path:line` 으로 코드 실측
> 핵심 원칙: **문서가 "✅ 구현됨"이라 적은 것을 그대로 믿지 않고, 실제 스크립트/CI 설정으로 강제 수준을 재확인했다.**

---

## 0. 한 줄 결론 (세 질문에 대한 답)

| 질문 | 답 |
|---|---|
| **현재 개발 상황은?** | MVP-A 코어는 **코드로 하드 게이트까지 완료**. 실제 머지를 막는 게이트는 CI 5개뿐(validate 12종·멱등성·단위테스트). MVP-B/C 추가분(lint·생성뷰·codegen·route)은 **전부 warning-first/read-only — 하나도 머지를 못 막는다.** Tier1 layout-profile(role→glob)은 설계 문서가 "SPEC ONLY"라 적었지만 **실제로는 라이브 게이트에 이미 wired** (문서가 코드보다 뒤처짐). |
| **잔여 개발은?** | ① 도입(adoption) 경로 — 단일 병목. ② Tier2 어댑터 **런타임 배선**(부품만 있고 조립 안 됨). ③ warning-first 표면들의 하드 게이트 승격(전부 "도입 telemetry 후"로 의도 연기). ④ catalog-gen·artifact-manifest·doctor 등 Axis-1 잔여 wiring. ⑤ Future Candidate 군(템플릿만). |
| **다층 추상화(repository/use-case/service/VM…) 대응 가능한가? (핵심)** | **현재로선 "아니오(부분적)".** "같은 3계층을 **어디에** 두느냐"(폴더 구조)는 config로 ~90% 흡수하지만, "계층이 **더 깊게 쪼개지면**"(repository/use-case/service/VM/data-source/mapper/entity) **킷의 모드 사다리·게이트 fact·레이어 린트에 그 중간 계층을 인식할 어휘도 게이트 자리도 없다.** |

**핵심 한 문장:** 킷의 모든 게이트는 **`screen → fake hook(AsyncState) → api`** 라는 **3계층 아키텍처를 코드 수준에서 못박고** 있다. `fake-hook/AsyncState seam`이 "화면과 HTTP 사이의 모든 것"을 단일 `hook` role 하나로 접어버려, 그 사이에 들어갈 중간 계층의 **게이트 단계 자체가 구조적으로 제거**돼 있다.

---

## 1. 현재 개발 상황 (강제 수준의 진실)

### 1.1 실제로 머지를 막는 것 = CI 5개 step뿐

`.github/workflows/frontend-workflow-kit.yml` 의 비-`continue-on-error` step만이 실제 하드 게이트다:

```txt
1. example:state          — 상태 집계 산출
2. example:readiness      — readiness 계산 (단, 모드가 낮아도 exit 1 아님 = '계산기')
3. _meta 멱등성 git diff  — 재생성 후 커밋본과 다르면 exit 1  ← 핵심 게이트
4. example:validate       — 검사 1~12, errors>0 → exit 1      ← 핵심 게이트
5. test:spec              — 단위 테스트 9종
```

근거: `.github/workflows/frontend-workflow-kit.yml:42-59`, `scripts/validate.mjs:566`

> **중요한 구분:** `readiness.mjs` 자체는 게이트가 아니라 **advisory 계산기**다 — `readiness_mode = min(fact_mode, decision_cap)` 를 출력만 하고, 모드가 낮아져도 `process.exit(1)` 을 호출하지 않는다(`readiness.mjs:336-381`). 실제 차단은 validate exit 1 + 멱등성 diff가 한다.

### 1.2 서브시스템별 강제 수준 매트릭스

| 서브시스템 | 상태 | 강제 수준 | 근거 |
|---|---|---|---|
| validate 검사 1~12 | ✅ | **하드 (CI exit 1)** | `validate.mjs:566` |
| 검사 8 (API Candidate↔zod 스키마, 엔드포인트 단위) | ✅ | **하드** | `validate.mjs:321-409` |
| 검사 9 (Open Decisions 형식) | ✅ | **하드** | roadmap:77 + 코드 |
| _meta 멱등성 (생성물 재현) | ✅ | **하드** | CI yml:47-52 |
| readiness 다운그레이드 (min(fact,cap), 사람-전용 불변식, malformed=fail-closed) | ✅ | 라이브 로직(CI exit 1 아님) | `readiness.mjs:240-261` |
| **Tier1 layout-profile (role→glob)** | ✅ | **라이브 게이트에 wired** | `readiness/validate/spec/workflow-state/...` |
| 검사 13 (Interaction Matrix v2) | 🔶 | warning-only | `validate.mjs:495-504` |
| forbidden-paths 경로 backstop | 🔶 | warning-first + **CI step 자체가 없음** | `forbidden-paths.mjs:256`, CI yml |
| lint-gen / lint-baseline | 🔶 | CI 있으나 `continue-on-error` | CI yml:33-39 |
| test-fixtures 골든 회귀 하니스 | 🔶 | CI `continue-on-error` | CI yml:66-68 |
| route-tree / nav-graph / catalog-gen (생성뷰) | 📄 | read-only 생성기, 게이트 아님 | `route-tree.mjs:55` 등 |
| Tier2 codegen + check-generated-files 가드 | 📄 | read-only, 항상 exit 0, `--enforce`=no-op | `check-generated-files.mjs:202` |
| route-cross-check | 🔶 | 항상 exit 0, 비결합 | `route-cross-check.mjs:81` |
| **pre-edit-mode-guard 훅 (편집 직전 1차 게이트)** | ❌ | **실제 구현 파일 없음 — 주석상 전제일 뿐** | `readiness.mjs:5` 주석 |
| workflow:packet/report/run (Execution Loop) | 📄 | runnable, CI 호출 없음 = 게이트 0 | `package.json:26-28` |

> **시사점:** 문서가 말하는 "3층 방어선(hooks → npm → CI)"은 실무상 **2층**이다 — 1차 방어인 `pre-edit-mode-guard` 훅이 코드로 존재하지 않는다. 그리고 CI(3차)는 위 5개만 하드다. "구현됨(implemented)"과 "강제됨(enforced)"은 다르며, roadmap의 ✅ 다수가 warning-first다.

### 1.3 Tier1 layout-profile — 문서보다 코드가 앞서 있음 (긍정적 발견)

설계 문서 `docs/design/drafts/customizable-architecture/tier1-layout-profile.md` 는 헤더에 **"Status: DESIGN / SPEC ONLY ... 구현이 아니다"** 라 적고 `layout-profile.mjs`·`implementation-mode-policy.yaml`·`readiness.mjs` 변경을 명시적 non-goal로 둔다. **그러나 실제 코드는 셋 다 구현·wired 완료됐다:**

- `loadLayoutProfile` 를 **라이브 게이트 전부**가 소비: `readiness.mjs:21` · `validate.mjs:45` · `workflow-state.mjs:22` · `workflow-packet.mjs:14` · `forbidden-paths.mjs:23` · `check-generated-files.mjs:22`.
- 설계가 **CRITICAL**로 지목한 `fake_hook_exists → {roles.hook}` 바인딩 **완료**: `spec.mjs:314` 가 `layout.roleToDir('hook', {domain})` 로 파생(하드코딩 `features/{domain}/hooks` 아님).
- 검사 8의 schemas 경로도 `{roles.api_schema}` 바인딩(`validate.mjs:328`). 미정의 role 참조는 **fail-closed**(throw, exit 2 — `layout-profile.mjs:58-66`). 회귀 테스트 12개 전부 통과.

→ **role 어휘 자체는 코드 수정 없이 확장 가능**하다(`mergeRoles` 가 임의 키 허용). 이게 "Axis 1"(폴더 구조) 대응의 토대다. 한계는 §3에서 다룬다.

---

## 2. 잔여 개발 (우선순위順)

| # | 항목 | 상태 | 무엇이 막나 / 무엇을 하면 완료 |
|---|---|---|---|
| **1** | **도입(adoption) 경로 — `adapt` 온보딩 스킬** | design-only | **단일 병목.** walkthrough 문서가 "미구현·가정"이라 자인(`adoption-onboarding-walkthrough.md:3-8`). 도입 telemetry가 없어 **거의 모든 warning-first 표면의 하드 승격이 영구 보류**. → 스킬 구현 + 실제 다층 brownfield end-to-end dry-run |
| **2** | **Tier2 어댑터 런타임 배선** | partial | 부품(route-core/codegen-core/adapters/manifest/golden)은 다 있으나 **조립 안 됨** — `adapters.router/codegen` config 키가 policy/preset에 **없고**, `route-tree.mjs` 가 여전히 `scanAppDir` 직접 호출. roadmap이 "사실상 마감"이라 적었지만 이는 "승격 의도 연기"지 배선 완료가 아님 |
| **3** | **catalog-gen `ui_primitive` 바인딩** | partial | `catalog-gen.mjs:23` `UI_MARKER='/src/components/ui/'` 하드코딩 → 비표준 ui 경로면 component-catalog 0건 → `rough-fixture-ui` 게이트 차단(consumer-ck R1 하드 블로커). loadLayoutProfile 소비처에 catalog-gen 없음 |
| **4** | doctor/preflight (오설정 조기탐지) | missing | 빈 docs가 validate **vacuous-green**(artifact_type 없으면 continue → exit 0)으로 CI 초록 통과하는 함정. `doctor.mjs` 설계만 있고 미구현 |
| **5** | warning-first 하드 승격 (lint·Interaction Matrix·Tier2) | 연기됨 | 전부 "도입 telemetry/brownfield dogfood 후 별도 Open Decision" — #1에 종속 |
| **6** | artifact-manifest `source:` 글롭 토큰화 | 누락 | `src/components/ui/**`·`src/app/**`·`src/api/schemas/**` 리터럴 잔존(설계 §10 edit 대상인데 미반영) |
| **7** | check-generated-files 노출·강제 | partial | `workflow:check-generated` npm 미노출, `--enforce` no-op. codegen manifest는 `active`인데 CI/validate가 재생성·비교 안 함 |
| **8** | Tier2 설계 계약 코드화 | design-only | Investigation/Verification `blocks_mode` readiness 파싱 · reconcile-input 킷 `skills/` vendor · route-cross-check nav 차원 |
| **9** | Open Decisions 후속 | design-only | decision-log 전역 이관 · deferred+Reversible+Assumptions 묶음 · 교차-화면 참조 · 인라인 [D-ID] 마커 · Dependencies 축 · U/D/C/G 통합 스키마 |
| **10** | Future Candidate (템플릿만) | design-only | Work Packet & Review Artifacts · Follow-up Quarantine Option B/C · role 확장 |
| **⚠** | **GitLab CI 파일 부재** | 모순 | roadmap이 CI를 `.gitlab-ci.yml` 기준으로 재분류(OD-11)했으나 **리포에 해당 파일이 없고** GitHub Actions만 존재. 모든 "CI 승격"의 전제 환경이 불일치 |

---

## 3. 다층 추상화 대응력 (핵심 질문) — Expo RN 기준

### 3.1 반드시 구분해야 할 두 축

사용자의 질문("훅/스크린/컴포넌트 수준이 아니라 추상화되어 여러 계층으로 쪼개졌을 때")은 **두 개의 다른 축**을 건드린다. 킷의 대응력이 축마다 정반대다.

| 축 | 무엇 | 킷 대응 | 메커니즘 |
|---|---|---|---|
| **Axis 1 — 같은 3계층을 *어디에* 두나** (디렉토리/폴더 구조) | `screen/hook/api` 를 다른 경로에 둠 | ✅ **대응(config-only)** | Tier1 layout-profile (role→glob 재바인딩, 다중경로, 도메인 오버라이드) |
| **Axis 2 — 계층이 *몇 개로* 쪼개지나** (아키텍처 깊이) | repository/use-case/service/VM 등 **중간 계층 추가** | ❌ **미대응** | 어휘·게이트·fact·lint 어디에도 자리 없음 |

**사용자 질문의 핵심은 Axis 2다.** 그리고 Axis 2가 바로 킷이 지금 못 하는 부분이다.

### 3.2 가장 큰 단일 차단 가정 — fake-hook / AsyncState seam

```txt
킷이 게이트하는 유일한 데이터 아키텍처:

   Screen  ──(AsyncState 계약: data/status/isLoading)──▶  fake hook  ──▶  api
   화면은 AsyncState 만 의존        hook 내부에서 fixture ↔ useQuery 교체        HTTP

   → "화면과 HTTP 사이의 모든 것" = 단일 {roles.hook} 하나로 접힘
```

근거: `examples/coupon-feature/src/lib/asyncState.ts:6-14`, `.../hooks/useCoupons.ts`, `implementation-mode-policy.yaml:83-91`(api-integrated-ui가 `forbidden: {roles.screen}` 로 "화면 무접촉, hook 내부 교체" 강제)

이 seam이 못박혀 있어서:
- **모드 사다리 7단계**(`docs-only→route-skeleton→screen-skeleton→rough-fixture-ui→final-fixture-ui→api-integrated-ui→production-ready`)의 중간 단계가 전부 `screen/component/hook/api` role만 참조한다(`implementation-mode-policy.yaml:21-101`). **repository/use-case/service/VM이 들어갈 모드 단계가 없다.**
- **게이트 fact**가 `fake_hook_exists`(= `{roles.hook}` 디렉토리에 `.ts(x)` 존재)만 본다(`spec.mjs:308-318`). `repository_exists`·`usecase_exists`·`viewmodel_exists` 같은 **계층 완성도 fact가 없어** 깊은 계층은 readiness 계산의 입력조차 되지 못한다.
- **layer-boundaries 린트**가 아는 계층은 정확히 **3개(api/screens/ui)뿐**(`lint-policy.template.yaml:15-26`, `eslint.workflow.config.mjs:96`). use-case→repository 의존성 역전, View→VM 경계 같은 규율을 표현할 layer-kind가 없다.

### 3.3 "role도 게이트도 fact도 없는" 추가 계층 (실측 열거)

> 아래 어휘는 킷 **전체 실행/설정/소스 파일(.mjs/.yaml/.json/.ts/.tsx)에서 0회 등장**한다. 오직 미구현 design 초안(`follow-up-quarantine-and-role-expansion.md`) 산문에만 나온다.

| 추가 계층 | role | 모드 게이트 | readiness fact | lint 인식 |
|---|:---:|:---:|:---:|:---:|
| repository | ❌ | ❌ | ❌ | ❌ |
| use-case / interactor | ❌ | ❌ | ❌ | ❌ |
| service | ❌ | ❌ | ❌ | ❌ |
| view-model / presenter | ❌ | ❌ | ❌ | ❌ |
| data-source | ❌ | ❌ | ❌ | ❌ |
| mapper / DTO 변환 | ❌ | ❌ | ❌ | ❌ |
| entity (도메인 모델) | ❌ | ❌ | ❌ | ❌ |
| store (전역 상태) | ❌ | ❌ | ❌ | ❌ |
| DI container | ❌ | ❌ | ❌ | 개념 부재 |

### 3.4 아키텍처 시나리오 적대적 검증 (4종)

각 시나리오를 "킷을 **현재 상태 그대로** 도입 가능한가"로 적대 판정:

| 시나리오 (Expo RN) | 판정 | 핵심 이유 |
|---|---|---|
| **Clean Architecture** (presentation·domain·data 4계층, 의존성 역전) | 🔴 **unsupported** | 4계층 중 어느 것도 role/게이트/fact 없음. 모드 사다리 중간 단계가 의미를 잃어 4계층을 단계적으로 강제 불가. fake-hook seam이 VM·use-case·repository를 단일 hook으로 흡수 |
| **MVVM** (View↔VM↔data, VM이 상태 소유) | 🟡 **partial** | route_entry/screen/ui_primitive/api_client/api_schema 5개는 깔끔히 매핑. 그러나 **VM**(핵심 계층)은 role/게이트/fact 없음 → hook role에 욱여넣어야 하고 그 순간 게이트 의미 상실 |
| **Feature-Sliced Design** (app/pages/widgets/features/entities/shared) | 🟡 **partial** | app/pages/shared는 매핑되나 **widgets/entities는 자리 없음**. 3대 하드코딩 차단: ① `route-skeleton`의 리터럴 `src/features/**` blanket guard(오버라이드 불가, `policy:46`) ② catalog-gen UI_MARKER ③ 3-layer 린트. **`fsd.yaml` 프리셋도 디스크에 없음**(설계만) |
| **Repository + Service** (DDD-lite, hook↓service↓repository↓api) | 🟡 **partial** | hook과 api 사이 service/repository 중간 계층이 role/게이트/fact 없음. api-integrated-ui가 "hook이 api 직접 연동"을 전제(`policy:83-91`)해 모델 불일치 |

> **공통 패턴:** "같은 3계층을 다른 폴더에 두는" 변형은 흡수되지만, **계층 깊이가 늘면 unsupported~partial로 떨어진다.** partial들도 "5개는 맞고 1~2개 핵심 계층만 깨지는" 게 아니라, **그 깨지는 계층이 바로 해당 아키텍처의 load-bearing 계층(VM·repository·service)**이라는 점이 본질이다.

### 3.5 부분적으로 돕는 탈출구 (그러나 전부 "게이트 의미 없는 우회")

1. **다중경로 role(`string[]`) + 도메인별 오버라이드** — 추가 폴더를 기존 role(예: `domain_component`) 아래로 흡수. 단 **계층 고유의 게이트 의미는 안 생김**(`tier1-layout-profile.md:84-119`).
2. **새 role 글롭 추가** — 로더는 허용(`mergeRoles`). 하지만 그 role을 *어느 모드에서 여는가*(mode↔role 결합)는 `implementation-mode-policy.yaml` **수작업 편집 + 사람 승격**이고(`llm-rules.template.md:23`), 완성도 fact가 없어 **"경로 허용"만 얻고 "readiness 게이트"는 못 얻는다**.
3. **production-ready 모드(`allowed: src/**`)** — 모든 CI 게이트 통과 후엔 임의 계층 자유 배치. 단 **사다리 최상단의 무규제 영역**일 뿐, 단계적 게이트가 아니다(게이트 가치 소멸).
4. **Tier2 RouteNode `meta` 탈출구** — router/codegen 의미용이지 아키텍처 계층용이 아님(게다가 design-only).

> 킷 자신의 role 확장 초안(`follow-up-quarantine-and-role-expansion.md`)조차 (1) **미구현**, (2) 제안 role이 전부 `domain_helper/adapter/mapper/schema/model/query_factory` 같은 **도메인-로컬 폴더 role**이지 cross-cutting 아키텍처 계층(repository/use-case)이 아니며, (3) "**실행 게이트를 추가하지 않는다**"고 못박는다.

---

## 4. 권고 (무엇을 해야 대응 가능해지나)

### 4.1 즉답 — 지금 다층 프로젝트가 킷을 도입한다면

- **Axis 1만 필요한 경우(같은 screen→hook→api를 다른 폴더에):** `project-layout.yaml`의 `roles` 오버라이드로 **지금도 가능**. (단 비표준 ui 경로면 #3 catalog-gen 차단에 걸림 — 선결 필요.)
- **Axis 2가 필요한 경우(repository/use-case/service/VM 등 계층 추가):** 현재는 **게이트 천장 안에서 표현 불가**. 선택지는 ⓐ 게이트 구간은 `screen→hook→api`로 평탄화하고 깊은 계층은 hook 내부 구현으로 흡수(아키텍처 양보), 또는 ⓑ 킷을 docs/골격 게이트 + production-ready CI 게이트로만 쓰고 계층별 단계 게이트는 포기, 또는 ⓒ 정책/스크립트 코드를 고침(= 킷 자체 개발).

### 4.2 킷이 Axis 2를 제대로 지원하려면 — "고정 사다리"를 "데이터 주도 계층 모델"로

이건 wiring 잔여가 아니라 **새 능력**이다. 킷의 철학("LLM이 추론하던 것을 파일로 고정")에 맞는 방향:

1. **seam 일반화** — 단일 `fake_hook_exists` fact를 **설정 가능한 계층 완성도 fact 집합**으로 교체. `project-layout.yaml`에 순서 있는 `layers:` 선언(각 계층 = role glob + 존재/완성도 fact + 진입 가능 모드)을 두고, `spec.mjs`가 role별 `role_dir_has_files` 류 fact를 일반 생성.
2. **mode↔role 결합의 config화** — 현재 수작업인 "새 role을 어느 모드에서 여나"를 정책 데이터로. 새 role도 fact 생성기와 묶으면 게이트 진입조건이 되게.
3. **layer-boundaries 린트의 N계층화** — 3 layer-kind 하드코딩을 `lint-policy.yaml`의 계층 그래프로 일반화(FSD 6레벨 위계, 의존성 역전 표현).
4. **선결 wiring 마감** — catalog-gen `ui_primitive` 바인딩, artifact-manifest 토큰화, `doctor.mjs`, `adapters.*` config 키. (Axis 1 도입조차 막는 잔여)
5. **거버넌스** — 이건 roadmap "지금 하지 말 것: 새 산출물 축 추가"에 정면으로 닿는다. **layer-depth 축 도입은 Open Decision으로 정식 결정**해야지 슬쩍 넣으면 안 된다. 그 전제로 #1(도입 경로)을 먼저 끝내 실제 다층 brownfield telemetry를 확보하는 게 순서.

---

## 5. 부록 — 문서↔코드 불일치 (팀 참고용)

조사 중 발견한 "문서 주장 ≠ 코드 현실" 지점(보고서 신뢰도·문서 정비용):

1. **tier1-layout-profile.md "DESIGN/SPEC ONLY"** ↔ 실제는 `layout-profile.mjs`·정책·readiness 전부 **구현·wired 완료**. 문서가 코드보다 뒤처짐(드물게 긍정적 방향).
2. **roadmap "item 2 사실상 마감"** ↔ Tier2 어댑터 `adapters.*` config 키 부재 + `route-tree.mjs` 가 어댑터 미소비. "마감"=승격 연기지 배선 완료 아님.
3. **roadmap CI = GitLab(`.gitlab-ci.yml`)** ↔ 해당 파일 **부재**, GitHub Actions만 존재.
4. **"✅ 구현됨" 톤** ↔ 검사 13·forbidden_paths·lint·test-fixtures는 전부 **warning-first(비차단)**. ✅만 보고 게이트 여부 판단 시 오판.
5. **artifact-manifest `codegen-openapi-client: active`** ↔ 그 command(check-generated)는 npm 미노출이고 CI/validate가 재생성·비교 안 함(`active` ≠ `enforced`).
6. **catalog/artifact-manifest source: 토큰화** — 설계 §10이 edit 대상에 올렸으나 리터럴 글롭 잔존.
7. **examples/layout-profile/custom-monorepo** — 이름은 "다층 monorepo"지만 실제는 `src` 트리 없는 **로더 단위테스트 입력**(flat 레이아웃, route_entry 재바인딩 1개). 다층 검증 아님.
8. **consumer-dogfood-001** — "end-to-end 완주" 증거지만 fresh `create-expo-app`의 **표준 src/ 레이아웃**이고 project-layout 오버라이드 미사용. **다층 brownfield 검증 아님.**

---

## 6. 조사 메타

- 방법: `Workflow` 멀티에이전트 — 6 투자자(구현상태·레이아웃롤·Tier2어댑터·다층천장·잔여개발·소비자도입) 병렬 → 4 시나리오 적대 검증. 10 에이전트, 274 tool use, ~109만 토큰.
- 모든 finding은 `path:line` 실측. 핵심 linchpin(`fake_hook_exists`→`{roles.hook}` 바인딩, layout-profile 소비처)은 메인 세션이 독립 교차검증.
- 한계: `consumer-ck` 1차 probe 원본 증거 파일이 리포에 부재(요약 서술에만 의존). 다층 brownfield의 실제 end-to-end dry-run 증거는 존재하지 않음(킷의 공백이자 이 보고서가 추론으로 메운 부분).
