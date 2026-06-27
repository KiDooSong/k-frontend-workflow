# 01 — 킷이 보장하는 것 vs 시각 축의 비대칭

> 한 줄 요약: 이 킷은 동작·상태·내비·데이터·컴포넌트·카피·a11y 의 7개 축을 "파일로 고정 + 기계 검사"로 강하게 보장한다. 시각 디자인만 그 규율에서 빠져 있다 — 선언은 있으나 산출물도 게이트도 없다.
> 날짜: 2026-06-21 · status: draft

---

## 0. 무엇을 묻나

질문은 "Figma 화면을 95% 구현할 수 있나"였다. 답하려면 먼저 **이 킷이 무엇을 어떻게 보장하는지**를 정확히 분해해야 한다. 킷의 사상은 [README.md](../../../frontend-workflow-kit/README.md) 의 불변식에 명시돼 있다:

> "사실의 단일 출처: zod=코드, query key=factory, props=컴포넌트. 문서는 링크/의도만."
> "LLM 이 추론하던 것을 파일로 고정한다 — 상태/판정/검사를 결정적 스크립트로 옮긴다."

즉 이 킷의 품질 보장 공식은 **(1) 단일 출처를 파일로 고정 → (2) 기계로 검사**다. 어떤 축이 이 공식을 따르면 강하게 보장되고, 따르지 않으면 "프롬프트로 부탁하는" 확률적 영역에 남는다. 핵심 원칙 2번이 못박는다: "통제는 프롬프트보다 기계 검증이 우선이다. 프롬프트 규칙은 확률적으로 지켜진다."

## 1. 킷이 강하게 보장하는 축

아래 축들은 모두 위 공식을 충족한다 — 그래서 "최종 구현 가정" 시 95%+ 신뢰할 수 있다.

| 축 | 무엇을 담나 | 산출물(단일 출처) | 게이트/검사 |
|---|---|---|---|
| 화면 동작·상태 | loading/success/empty/error/refreshing 5상태, 조건→UI | screen-spec `## State Matrix` | readiness `state_matrix_complete` · validate |
| 화면 이동·내비 | 액션→결과 라우트, 탭/가드/딥링크 | screen-spec `## Interaction Matrix` + navigation-map + 생성 route-tree/nav-graph | 검사 13 route cross-check(warning-first) |
| 데이터 계약 | DTO 모양, endpoint 후보, confidence | zod `src/api/schemas/*.ts` + api-manifest | 검사 8 API↔스키마 매칭(하드) |
| 컴포넌트 사용 | 어떤 카탈로그 컴포넌트를 쓰는가, props | component-catalog(코드에서 생성) | check-generated · 린트 boundaries |
| 변이·무효화 | mutation→invalidate queryKey | screen-spec `## Mutation Matrix` + queryKey factory | 린트 · 리뷰 |
| 카피/문구 | i18n 키, 확정/미확정 | screen-spec `## Copy Keys` (confirmed/draft/tbd) | workflow-state 카운트 · "추측 금지" |
| 접근성 | role/label/state | screen-spec `## Accessibility` | 리뷰(부분 자동화 가능) |

특히 **State Matrix 강제**는 단순 fidelity보다 더 가치 있는 지점이다. 디자이너가 Figma 에 empty/error/refreshing 프레임을 안 그리는 경우가 흔한데, 이 킷은 5상태를 **누락 불가**로 만든다. *기능적 정확도*는 "이 프레임 보고 만들어줘"보다 구조적으로 높다.

## 2. 시각 축의 비대칭 — 선언만 있고 파일·검사가 없다

[frontend-llm-workflow.md](../../../frontend-llm-workflow.md) 의 LLM 충돌 우선순위는 분명히 적는다:

```txt
- 비즈니스 동작: ScreenSpec(기획) 우선
- 시각 디자인:   최종 Figma 우선        ← 시각의 단일 출처를 "Figma"로 선언
- 데이터 계약:   OpenAPI/API Manifest 우선
- 라우팅 구조:   Navigation Map 우선
- 컴포넌트 사용: Component Catalog 우선
```

문제: **시각을 제외한 모든 우선순위는 그 출처가 실제 파일로 존재한다.** ScreenSpec·API Manifest·Navigation Map·Component Catalog 는 전부 `docs/frontend-workflow/**` 의 검사 가능한 파일이다. 그런데 "시각 디자인: 최종 Figma 우선"의 *Figma* 는:

- **킷 안에 materialize 된 파일이 아니다.** 원격 Figma 문서일 뿐이다.
- 그 시각값을 받아 담을 킷 산출물(figma-component-mapping)은 **값 칸이 없다**(→ 보고서 02 §B).
- 따라서 "Figma 우선"이라는 규칙은 **대조할 대상이 킷 안에 없어** 검사가 불가능하다.

다른 축과 나란히 두면 비대칭이 선명하다:

| 우선순위 규칙 | 출처가 킷 파일인가 | 값을 담는가 | 기계 검사 |
|---|---|---|---|
| 동작 → ScreenSpec | ✅ | ✅ | ✅ |
| 데이터 → API Manifest/zod | ✅ | ✅ | ✅ |
| 라우팅 → Navigation Map | ✅ | ✅ | ✅ |
| 컴포넌트 → Catalog | ✅ | ✅ | ✅ |
| **시각 → Figma** | ❌(원격) | ❌(담을 칸 없음) | ❌ |

게이트 인벤토리도 이를 뒷받침한다. [roadmap-current.md](../../../kit-dev/roadmap-current.md) 의 readiness fact 목록에 시각/픽셀 fact 는 없다. 유일한 Figma 관련 fact 인 `figma_mapping_status` 조차 매핑 문서가 **draft 로 존재하는지**(`>= draft`)만 보고, 값이 채워졌는지·코드와 일치하는지는 보지 않는다([figma-component-mapping.template.md](../../../frontend-workflow-kit/templates/screen/figma-component-mapping.template.md) frontmatter 주석). 즉 **"매핑 문서가 있다" ≠ "Figma 대로 보인다".**

## 3. 혼동 주의 — `layout-profile` 은 시각 레이아웃이 아니다

이름 때문에 "레이아웃은 처리되네"라고 오해하기 쉽다. 이 레포의 `layout-profile`(`scripts/lib/layout-profile.mjs`, [presets/expo-feature.yaml](../../../frontend-workflow-kit/presets/expo-feature.yaml))은 **폴더/role 경로 프로파일**이다:

```yaml
roles:
  route_entry: src/app/**
  screen: src/features/{domain}/screens/**
  ui_primitive: src/components/ui/**
```

즉 "어떤 파일이 어떤 역할인가"(프로젝트 구조)를 다루지, "Figma 에서 추출한 시각 레이아웃(위치·간격·정렬)"과는 **무관하다.** 질문하신 "피그마에서 추출한 레이아웃 위치"는 이 킷 어디에도 구조화돼 들어오지 않는다.

## 4. 결론 — "충실도"는 두 종류다

| 충실도 종류 | 이 킷의 현 위치 | "최종 구현 가정" 시 도달치 |
|---|---|---|
| **기능적 충실도** (동작·상태·내비·데이터·카피·a11y) | 파일 고정 + 기계 검사 | 95%+ 현실적 |
| **시각적 충실도** (색·간격·타이포·치수·레이아웃·에셋) | 선언만, 산출물·검사 0 | 보장 불가 (보고서 02·03) |

질문이 겨냥한 것은 두 번째 — *"디자이너가 그린 그 화면"* 이다. 그 축에서 정보가 파이프라인 어디서 새는지는 [02 — 파이프라인에서 시각 충실도가 새는 지점](02-where-visual-fidelity-leaks.md) 으로 이어진다.
