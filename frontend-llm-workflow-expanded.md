# 확장판: 산출물 카탈로그와 우선순위 체계

> ⚠ **현행 정본 주의 (2026-06-14 추가)**: 게이트·검사·티어·모드 사다리의 **현재 정본**은
> [roadmap-current.md](kit-dev/roadmap-current.md) · [open-decisions.md](kit-dev/open-decisions.md) · [문서 소유권 지도](frontend-workflow-kit/docs/reference/doc-ownership.md)다.
> 이 문서는 **설계 배경·사상**으로 읽되, `decision_cap`·검사 9~12·`screen-skeleton`/`docs-only` 등
> 현행 게이트 세부는 위 정본을 따른다 (이 문서엔 미반영 — 역방향 드리프트, 분석 보고서 P3/P4).

> 목적: [Core 워크플로우](frontend-llm-workflow.md)의 산출물을 전체 카탈로그로 정의하고,
> 자료 준비 상태에 따라 무엇을 먼저 할지 판단하는 체계를 제공한다.
> 버전: v5 (2026-06-12) — 이전 버전: `archive/` (v1 원본명, `*-v2`~`*-v4`)
>
> v5 변경점(외부 리뷰 반영): confirmed 승격 시 승인 메타데이터(approved_by/approved_at/decision_id) 필수화,
> zod 스키마는 코드 파일이 출처(manifest는 링크), State Coverage 구현 수단을 프로젝트별 선택으로,
> 산출물 경로·생성 여부의 기계가독 레지스트리(artifact-manifest.yaml) 연결.
>
> v4 변경점: 문서 배치를 도메인 우선으로 재편 — P1을 stub ScreenSpec + 생성 뷰 모델로 교체.
> Screen Inventory / Route Tree / Nav Graph(Entry Points 역색인)는 자동 생성물로 전환,
> Navigation Map은 전역 뼈대만 유지, Flows는 도메인 내부/크로스 도메인으로 분리.
>
> v3 변경점: 린트 규칙(#01)을 정책 단위 토글 모델(lint-policy.yaml)로 재정의,
> `existing_lint_config` 태그와 adapt 우선순위 규칙 추가.
>
> v1 대비 변경점 (v2):
> - 화면별 문서 7종 → ScreenSpec 1개 파일로 통합 (섹션화)
> - 산출물에 "생성 방식" 축 추가 (수동 작성 / 자동 생성 / 하이브리드)
> - 상태값을 "문서 라이프사이클"과 "내용 확신도"로 분리
> - 케이스 A~J를 규범에서 제외하고 태그 조합의 워크드 예제로 강등
> - 기계 검증(P0)을 최우선 산출물로 추가
> - Mutation Matrix, Copy Keys, Accessibility, Analytics, Deep Link 보강

---

## 0. 핵심 원칙

```txt
전체에 영향 주는 것(기계 검증, 전역 규칙)이 먼저
화면 간 관계(인벤토리, 네비게이션)가 그다음
화면 하나의 계약(ScreenSpec)이 그다음
디자인과 API 매핑이 그다음
코드는 마지막
검증은 테스트가 기본, LLM 리뷰는 의미적 항목 전담
```

그리고 산출물마다 반드시 물어야 할 질문:

```txt
이 정보의 단일 출처는 어디인가?
- 코드에서 파생 가능하면 → 자동 생성 (문서로 쓰지 않는다)
- 의도/계약/미확정이면 → 문서로 쓴다
```

---

## 1. 상태 모델 (v1의 enum 혼선 정리)

v1은 `missing/draft/candidate/confirmed/...` 하나의 enum에 두 개념을 섞었다.
`api_manifest: candidate`가 "문서가 초안"인지 "내용이 미확정"인지 모호했다. 분리한다.

### 문서 라이프사이클 (artifact status) — 문서 단위

```txt
missing → draft → review → confirmed → implemented → verified
                                ↓
                            deprecated
```

| 상태 | 의미 | 전환 조건 |
|---|---|---|
| missing | 아직 없음 | - |
| draft | 작성 중, 미검토 | 누구나 생성 가능 |
| review | 검토 요청됨 | 작성 완료 시 |
| confirmed | 담당자 승인됨 | **사람의 승인 필요. LLM이 승격 금지.** 승인 메타데이터 필수 (아래) |
| implemented | 코드에 반영됨 | 구현 PR 머지 시 |
| verified | 테스트/QA 통과 | CI + 리뷰 통과 시 |
| deprecated | 폐기 | 사람의 결정 |

confirmed 승격 시 frontmatter에 승인 메타데이터를 남긴다.
"이 confirmed가 진짜 최신인가?" 문제를 막는 유일한 방법이다.

```yaml
status: confirmed
approved_by: 김PM
approved_at: 2026-06-12
approval_source: { type: slack, ref: "#app-planning/12345" }
decision_id: D-014        # decision-log.md와 연결
```

### 내용 확신도 (confidence) — 문서 안의 개별 항목 단위

```txt
unknown → candidate → confirmed
```

| 확신도 | 의미 | 구현 가능 여부 |
|---|---|---|
| unknown | 정보 없음 | 구현 금지, TODO만 |
| candidate | 출처는 있으나 미확정 | fake hook/fixture까지만 |
| confirmed | 확정 (출처 명시) | 실제 구현 가능 |

예: `screen-spec.md`의 status는 `confirmed`(문서 승인됨)인데
그 안의 특정 API는 confidence `candidate`(아직 미확정)일 수 있다. 이제 모순이 아니다.

---

## 2. 산출물 카탈로그

**기본 세트 ~15개 + 선택 세트**로 나눈다. 모든 프로젝트에 전부 만들지 않는다.

각 산출물의 경로·템플릿·생성 여부·필수 frontmatter는 `artifact-manifest.yaml`에
기계가독 형식으로 등록된다 — 스킬이 디렉토리 구조를 문서에서 추론하지 않게 하기 위해서다.
([킷 구현 명세](frontend-workflow-kit-implementation.md) 참고)

### P0. 기계 검증 + 전역 규칙 (모든 상황에서 최우선)

| # | 산출물 | 생성 방식 | 비고 |
|---|---|---|---|
| 01 | Lint Policy Pack | 하이브리드 | 정책 카탈로그(fetch 금지, Pressable 금지, 임의 색상 금지, 레이어 경계) + `lint-policy.yaml`(정책별 on/off·경로·심각도·rollout, 사람/LLM 편집) → ESLint 설정은 생성물. 기존 린트가 있으면 adapt 절차로 합성 |
| 02 | zod 스키마 컨벤션 + CI 게이트 | 코드(설정) | typecheck → lint → 스키마 검증 → 테스트 (ratchet 정책은 위반 수 증가 시에만 실패) |
| 03 | LLM 작업 규칙 (CLAUDE.md) | 수동 | **린트로 강제 불가능한 규칙만.** 작게 유지 |
| 04 | 프로젝트 소스 맵 | 수동 | 기획/디자인/백엔드 자료 위치 고정 |
| 05 | 도메인 용어집 | 수동 | 회원/사용자/계정 등 용어 통일 |
| 06 | 프론트 아키텍처 기준 | 수동 | 폴더 구조, 레이어 규칙 (린트와 짝) |

### P1. 앱 전체 구조

| # | 산출물 | 생성 방식 | 비고 |
|---|---|---|---|
| 07 | Domains 목록 | 생성/축소 | Feature Inventory의 후신 — domains/*/domain-rules frontmatter에서 생성 |
| 08 | Stub ScreenSpec 세트 | 수동(LLM 초안) | 화면 발굴: frontmatter(ID/route/domain)만 채운 stub을 **도메인 경로에** 작성 |
| 09 | Screen Inventory / Route Tree / Nav Graph | **자동 생성** | frontmatter·src/app·Interaction Matrix에서 생성되는 전역 뷰 3종. 작성하지 않는다 |
| 10 | Flows | 수동 | 도메인 내부: domains/{d}/flows.md, **크로스 도메인만** app/flows/ |
| 11 | Navigation Map (뼈대) | 수동 | 탭/스택/모달 + Route Guard + **Deep Link** + 크로스 도메인 엣지만 |

### P2. 화면 계약 (화면당 1개 파일)

| # | 산출물 | 생성 방식 | 비고 |
|---|---|---|---|
| 12 | **ScreenSpec (통합형)** | 수동(LLM 초안) | 아래 섹션을 모두 포함 |

ScreenSpec 내부 섹션 (v1의 별도 문서 7종이 여기로 흡수됨):

```txt
Purpose / Route / UI Sections
Entry Points          ← v4부터 생성됨: nav-graph가 인바운드 엣지를 역색인 (직접 작성 금지)
State Matrix          ← v1 #12
Interaction Matrix    ← v1 #13 (+ Analytics Event 컬럼). 화면 이동 엣지의 단일 선언 지점
Mutation Matrix       ← v2 신규: 액션→API→optimistic→invalidate queryKey→성공/실패 UI
Data Requirements / API Candidates
Copy Keys             ← v2 신규: 문구 단일 출처 (LLM이 문구를 지어내지 않게)
Accessibility         ← v2 신규
Acceptance Criteria   ← v1 #14 (State Matrix와 중복 서술 금지, 테스트 ID 연결)
Unknowns              ← v1 #15 (화면 단위)
```

특정 섹션이 비대해지면 그때만 파일로 분리한다. 기본은 1파일.

### P3. 디자인 / Figma

| # | 산출물 | 생성 방식 | 비고 |
|---|---|---|---|
| 13 | Design Token Map | 하이브리드 | Figma 토큰 ↔ tailwind config. config가 단일 출처 |
| 14 | **Component Catalog** | **자동 생성** | props는 코드에서 추출 (`npm run catalog:gen`) |
| 15 | Component Guidelines | 수동 | Do/Don't, 선택 기준, a11y — 자동 생성 불가능한 의도만 |
| 16 | Component Gap Register | 수동 | 디자인에 있고 코드에 없는 것. 즉흥 구현 차단 |
| 17 | Figma Frame Index | 수동 | 화면 ID ↔ 프레임. 잘못된 프레임 참조 방지 |
| 18 | Figma Component Mapping | 수동(LLM 초안) | 화면별. Conflicts 섹션 필수 |
| 19 | Device/Responsive Policy | 수동 | 선택 세트 |

### P4. 백엔드 / API

| # | 산출물 | 생성 방식 | 비고 |
|---|---|---|---|
| 20 | OpenAPI / codegen client | **자동 생성** | 있으면 confirmed API의 단일 출처 |
| 21 | API Manifest | 수동 | **미확정분 전용.** 확정 즉시 #20으로 이관. zod 코드는 넣지 않고 #22 파일을 링크 |
| 22 | zod 스키마 (DTO) | 코드 | 타입·fixture·런타임 검증의 단일 출처 |
| 23 | Domain Model Map | 코드+주석 | DTO→프론트 모델 매핑 함수가 곧 문서 |
| 24 | API-to-Screen Mapping | 수동 | ScreenSpec의 API Candidates를 집계해 생성 가능 |
| 25 | Auth / Session Policy | 수동 | 전역 1회 |
| 26 | API Error Policy | 수동 | 전역 1회. State Matrix와 연결 |
| 27 | Fixture | **자동 생성** | zod 스키마에서 생성 또는 스키마로 검증 |

### P5. 구현 (산출물이 아니라 작업 단위)

```txt
28 Route Skeleton          placeholder만
29 Fake Hook               인터페이스 고정 + fixture 구현 (v1의 "fixture→hook 교체" 대체)
30 Presentational UI       전 상태 구현
31 Storybook 스토리        State Matrix 행 = 스토리 1개
32 Figma 기준 UI 보정      mapping 문서 이후에만
33 Hook 내부 교체          화면 수정 없음
```

### P6. 검증

| # | 산출물 | 도구 | 비고 |
|---|---|---|---|
| 34 | 컴포넌트/스타일 위반 검출 | **ESLint (CI)** | v1 #43의 자동화 |
| 35 | DTO/fixture 정합성 | **zod + 테스트** | v1 #40의 자동화 |
| 36 | State Coverage | 스토리(기본값) / 컴포넌트 테스트 / MSW 시나리오 | v1 #41의 자동화. 수단은 프로젝트별 선택 |
| 37 | E2E (Acceptance) | **Maestro** | 가능한 항목만 |
| 38 | LLM 의미 리뷰 | LLM (별도 컨텍스트) | 기획 누락/과해석/문구 날조/Unknowns 임의 확정 |
| 39 | Navigation Review | LLM 또는 스크립트 | Navigation Map ↔ route tree 비교 |

> v1의 검증 7종 중 4종이 기계 검증으로 이동했다. LLM 리뷰는 기계가 못 잡는 것 전담이다.

---

## 3. 태그 기반 동적 워크플로우

실제 프로젝트는 "케이스 A" 같은 단일 케이스에 딱 맞지 않는다.
**자료 준비 상태를 태그로 기술하고, 태그가 우선순위를 결정한다.**

### 상태 태그

```yaml
case_tags:
  planning_available: true
  wireframe_available: true
  final_figma_available: false
  design_system_available: false
  design_system_in_progress: true
  api_confirmed: false
  api_partially_known: true
  openapi_available: false        # v2 추가: 있으면 API 경로가 완전히 달라짐
  existing_lint_config: true      # v3 추가: 있으면 lint-pack 드롭인 금지, adapt 절차로 도입
  backend_repo_available: true
  navigation_clear: false
  auth_policy_clear: false
```

### 우선순위 규칙

```yaml
priority_rules:
  # 기계 검증과 전역 규칙은 태그와 무관하게 항상 최우선
  - always:
      - lint-policy-pack
      - llm-rules
      - source-map

  - when: { existing_lint_config: true }
    prioritize: [adapt-lint-pack]   # 드롭인 금지. scan→map→diff→rollout 후 기존 설정 뒤에 합성
    restrict: [lint-preset-dropin]

  - when: { navigation_clear: false }
    prioritize: [stub-screen-specs, flows, navigation-map, route-skeleton]
    restrict: [screen-implementation]

  - when: { openapi_available: true }
    prioritize: [codegen-client, query-hooks]
    skip: [api-manifest]            # 수동 manifest 불필요

  - when: { api_confirmed: false }
    prioritize: [api-manifest, zod-schemas, fixtures, fake-hooks]
    restrict: [hook-internal-swap]  # fake hook까지만, 실제 연동 금지

  - when: { final_figma_available: true }
    prioritize: [figma-frame-index, figma-component-mapping]

  - when: { design_system_in_progress: true }
    prioritize: [component-catalog-gen, component-gap-register]
    restrict: [final-visual-polish]
```

### 우선순위 판단 공식 (규칙에 없는 상황)

```txt
1. 이 작업이 앱 전체에 영향을 주는가?         → 먼저 한다
2. 이 작업이 여러 화면에 영향을 주는가?       → 개별 화면보다 먼저 한다
3. 이 작업의 결과를 기계로 검증할 수 있는가?  → 검증 수단부터 만든다
4. 이 작업이 확정 자료(confirmed)에 기반하는가? → 앞당겨도 된다
5. 이 작업이 추측을 포함하는가?               → candidate/unknown 문서로만 남기고 구현하지 않는다
6. 이 작업이 나중에 쉽게 바뀔 수 있는가?      → skeleton 또는 fake hook 수준까지만 한다
```

---

## 4. 태그 조합 워크드 예제

> v1의 케이스 A~J는 규범이 아니라 **예제**다. 실제 판단은 3장의 태그와 규칙으로 한다.

### 예제 1. 와이어프레임만 있고 최종 Figma가 늦는 경우

```txt
태그: wireframe_available, final_figma_missing, api_partially_known, navigation_unclear

흐름: 기계검증 → 전역규칙 → stub ScreenSpec(화면 발굴) → Navigation Map(뼈대) → Route Skeleton
      → ScreenSpec → zod 스키마(candidate) → fixture → fake hook
      → presentational UI(rough) → 스토리
      → (Figma 도착 후) Frame Index → Component Mapping → UI 보정
      → (API 확정 후) hook 내부 교체 → 통합 검증

핵심: 와이어프레임 → ScreenSpec → fake hook 기반 UI.
      Figma와 API는 늦게 와도 화면 코드를 다시 짜지 않는다.
```

### 예제 2. API가 화면보다 먼저 확정된 경우

```txt
태그: api_confirmed (openapi_available이면 더 좋음), final_figma_missing

흐름: 기계검증 → 전역규칙 → OpenAPI codegen(또는 Manifest+zod)
      → Domain Model Map → query/mutation hooks (진짜 구현)
      → stub ScreenSpec → Navigation Map(뼈대) → ScreenSpec 완성
      → presentational UI → 통합

핵심: 데이터 계층을 먼저 완성한다. 단, 화면 UI는 ScreenSpec 없이 만들지 않는다.
```

### 예제 3. 모든 자료가 나온 뒤 개발 시작 (일정 지연형)

```txt
태그: 전부 available/confirmed

흐름: 기계검증 → 전역규칙 → stub ScreenSpec/Navigation Map(뼈대) → Token Map/Catalog/Frame Index
      → (화면 1개) ScreenSpec → Mapping → hook → UI → 테스트 → 검증
      → golden example 확정 → 나머지 화면 복제

핵심: 자료가 모두 있어도 구현은 화면 단위 vertical slice.
      "앱 전체 구현해줘"는 자료가 완비되어도 금지.
```

### 예제 4. 디자인시스템은 준비됐고 기획이 거친 경우

```txt
태그: design_system_available, planning_rough

흐름: 기계검증 → catalog:gen 파이프라인 → Guidelines → Gap Register
      → 공통 컴포넌트 안정화 (+ 스토리)
      → domains 목록/stub ScreenSpec → ScreenSpec 초안 → skeleton

핵심: 컴포넌트 기반을 먼저 안정화. 화면은 placeholder 수준 유지.
```

### 예제 5. 화면은 많은데 네비게이션이 불명확한 경우

```txt
태그: navigation_clear: false

흐름: stub ScreenSpec(화면 발굴) → Flows(도메인 내부/크로스 도메인) → Navigation Map(뼈대)
      → Route Guard / Deep Link 정책 → Route Skeleton (→ route-tree는 src/app에서 생성)
      → 그 다음에야 ScreenSpec 완성

핵심: 개별 화면 구현 절대 금지. 네비게이션 뼈대가 모든 것보다 우선.

프롬프트:
  모든 와이어프레임을 보고 화면 구현하지 말고
  도메인별 stub ScreenSpec과 Navigation Map(뼈대)만 만들어줘.
  화면 간 이동이 불확실한 부분은 Unknowns에 적어줘.
```

---

## 5. 화면 패턴 프리셋 (v1 "도메인 preset"에서 명칭 정리)

auth는 **도메인**이고 list/form/detail은 **화면 패턴**이다. 둘을 분리한다.

```txt
domains/        auth, coupons, payment ...     (비즈니스 영역별 규칙)
screen-patterns/ list, detail, form, search ... (UI 패턴별 규칙)
```

화면 하나는 도메인 1개 + 패턴 1개를 갖는다. (예: 쿠폰 목록 = coupons × list)

### list 패턴

```md
- State Matrix에 loading/success/empty/error/refreshing 5개 상태 필수
- pagination이 있으면 hasNextPage / fetchNextPage 정책 명시
- 아이템 클릭 destination을 Interaction Matrix에 기록
- 스켈레톤 UI 컴포넌트 지정
```

### form 패턴

```md
- validation rule 명시 (zod 스키마와 공유 가능하면 공유)
- Mutation Matrix 필수 (optimistic 여부, invalidate 대상, 실패 롤백)
- field-level error와 form-level error 구분
- submit 중 중복 제출 방지 정책
- keyboard avoiding 정책
```

### detail 패턴

```md
- 404/권한 없음 상태 필수 (API Error Policy와 연결)
- 진입 파라미터([id]) 유효성 처리
- 딥링크 직접 진입 시 동작 정의
```

도메인 규칙 예 (auth):

```md
# Auth Domain Rules
- 401 처리는 화면별로 구현하지 않고 API client/session layer에서 처리한다.
- 로그인 성공 후 이동 경로는 Navigation Map을 따른다.
- 비밀번호, 토큰, 인증코드는 로그에 남기지 않는다.
- token storage는 auth-session-policy.md를 따른다.
```

---

## 6. 산출물 의존 관계

```txt
기계 검증 (린트/스키마/CI)
└─ 모든 코드 작업의 게이트

LLM Rules + 소스 맵 + 용어집
└─ 모든 LLM 작업의 컨텍스트

stub ScreenSpec (frontmatter: ID/route/domain — 도메인 경로에 작성)
├─ Screen Inventory (생성 — frontmatter 집계)
└─ ScreenSpec 완성 (본문)
   └─ Interaction Matrix ──nav-graph──▶ Entry Points 역색인 (생성)

Navigation Map (뼈대: 탭/스택/모달, Guard, Deep Link, 크로스 도메인 엣지)
└─ Route Skeleton (src/app)
   └─ Route Tree (생성 — 파일 트리에서)

코드(components/ui) ──catalog:gen──▶ Component Catalog
                                      └─ Figma Component Mapping
                                         └─ UI 보정

OpenAPI / zod 스키마
├─ codegen client / API client
├─ fixture (생성/검증)
└─ fake hook (인터페이스 고정)
   └─ Presentational UI
      └─ hook 내부 교체 (통합)

ScreenSpec (통합형)
├─ Presentational UI의 기준
├─ 스토리/테스트의 기준
├─ Figma Mapping의 기준
└─ LLM 의미 리뷰의 기준
```

우선순위가 헷갈릴 때:

```txt
Figma Component Mapping보다 Component Catalog가 상위
API-to-Screen Mapping보다 OpenAPI/zod 스키마가 상위
Route Skeleton보다 Navigation Map이 상위
Screen UI보다 ScreenSpec이 상위
프롬프트 규칙보다 린트 규칙이 상위
생성 뷰(Screen Inventory / Route Tree / Nav Graph)는 출처가 아니라 대시보드 — 항상 하위
```

---

## 7. 충돌 정책

충돌은 영역별로 우선 출처가 다르다. (v1의 "무조건 ScreenSpec 우선"을 대체)

```txt
비즈니스 동작:   ScreenSpec(기획) 우선
시각 디자인:     최종 Figma 우선
데이터 계약:     OpenAPI / API Manifest confirmed 우선
라우팅 구조:     Navigation Map 우선
컴포넌트 사용:   Component Catalog 우선
문구:           Copy Keys confirmed 우선
```

충돌 발견 시 LLM은 판단하지 않고 기록한다:

```md
# Conflicts

| ID | Area | Source A | Source B | Conflict | Status | Decision |
|---|---|---|---|---|---|---|
| C-001 | Coupon | Figma | API | 피그마에 만료 탭 있으나 API enum에 EXPIRED 없음 | open | TBD |
| C-002 | Auth | 기획 | Nav Map | 로그인 후 마이페이지 vs 홈 | resolved | 홈 (2026-06-12, 김PM) |
```

---

## 8. 3층 운영 구조

```txt
1층: 앱 전체 계약
  기계 검증 세트, LLM Rules, 소스 맵, 용어집,
  Navigation Map(뼈대), 크로스 도메인 Flows,
  Component Catalog(생성) + Guidelines, OpenAPI/zod 스키마, 전역 정책(Auth/Error)
  ※ Screen Inventory / Route Tree / Nav Graph는 생성 뷰 — 계약이 아니라 대시보드

2층: 화면별 계약 (도메인 경로에 작성)
  ScreenSpec (통합형 1파일, stub→완성), 도메인 Flows, Figma Component Mapping

3층: 구현과 검증
  Route Skeleton, Fake Hook, Presentational UI, 스토리,
  UI 보정, Hook 교체, CI 게이트, LLM 의미 리뷰
```

기본 흐름:

```txt
1. 1층(전체 계약 + 기계 검증)을 먼저 만든다.
2. 준비된 자료별로 병렬 진행한다.
   - 와이어프레임 있음 → ScreenSpec
   - Figma 있음 → Frame Index / Component Mapping
   - API 있음 → OpenAPI codegen 또는 Manifest + zod
   - 디자인시스템 있음 → catalog:gen + Guidelines
3. 화면별 계약이 모이면 구현한다. (vertical slice, 한 번에 한 화면)
4. fake hook으로 UI와 데이터 출처를 분리한다. 교체 단계를 만들지 않는다.
5. 검증은 테스트가 기본, LLM 리뷰는 의미적 항목만.
```

---

## 한 줄 요약

```txt
기계 검증 → 전역 계약 → 앱 구조 → 화면 계약 → 디자인/API 매핑
→ fake hook 기반 UI → hook 내부 교체 → 테스트 검증 → 복제
```

자료 상황별:

```txt
와이어프레임 먼저  → ScreenSpec 우선
Figma 먼저        → Component Mapping 우선
API 먼저          → OpenAPI/스키마/hook 우선
모두 있음         → 계약 먼저, vertical slice 구현
디자인시스템 불안정 → catalog 파이프라인 + skeleton 중심
네비게이션 불명확  → Navigation Map 최우선, 화면 구현 금지
```
