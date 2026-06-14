# 프론트엔드 LLM 워크플로우 (Core)

> ⚠ **현행 정본 주의 (2026-06-14 추가)**: 게이트·검사·티어·모드 사다리의 **현재 정본**은
> [roadmap-current.md](frontend-workflow-kit/roadmap-current.md) · [open-decisions.md](frontend-workflow-kit/open-decisions.md) · [README 문서지도](frontend-workflow-kit/README.md#문서-지도)다.
> 이 문서는 **설계 배경·사상**으로 읽되, `decision_cap`·검사 9~12·`screen-skeleton`/`docs-only` 등
> 현행 게이트 세부는 위 정본을 따른다 (이 문서엔 미반영 — 역방향 드리프트, 분석 보고서 P3/P4).

> 목적: Expo 앱, 디자인시스템, Figma, 와이어프레임, 백엔드 API를 LLM 기반 프론트엔드 개발 흐름에 맞게 단계별로 정리한다.
> 버전: v5 (2026-06-12) — 이전 버전: `archive/` (v1 원본명, `*-v2`~`*-v4`)
> v5 변경(외부 리뷰 반영): 문서 경로 통일(docs/frontend-workflow/design/*), Entry Points를 GENERATED 블록 마커로,
> tbd_count frontmatter 제거(스크립트가 본문에서 계산), fake hook 반환 타입(AsyncState) 명시 고정,
> query key factory를 invalidation의 단일 출처로, zod 스키마는 코드 파일이 출처(manifest는 링크), 기술 기본값/대체 구분.
> v4 변경: 문서 배치를 도메인 우선으로 재편. Screen Inventory/Route Tree/Entry Points는 생성물로 전환,
> Navigation Map은 전역 뼈대(탭/가드/딥링크/크로스 도메인 엣지)만 유지, 이동 엣지는 출발 화면 Interaction Matrix에서 단일 선언.
> v3 변경: 0단계의 린트 규칙을 정책 단위 토글 모델(lint-policy.yaml)로 재정의. 브라운필드(기존 린트 보유) 도입 절차 추가.
> 함께 읽기: [확장판 — 산출물 카탈로그와 우선순위](frontend-llm-workflow-expanded.md), [스킬팩 설계](frontend-workflow-skillpack-concept.md), [킷 구현 명세](frontend-workflow-kit-implementation.md)

---

## 핵심 원칙 4가지

이 워크플로우 전체를 관통하는 원칙이다. 모든 단계는 이 원칙의 적용이다.

```txt
1. LLM이 "결정"하지 않게 하고 "매핑"하게 만든다.
   - 결정(기획, 디자인, API 계약)은 문서에서 온다. LLM은 문서를 코드로 매핑한다.

2. 통제는 프롬프트보다 기계 검증이 우선이다.
   - 프롬프트 규칙은 확률적으로 지켜진다. 린트/타입/스키마/CI는 결정적으로 지켜진다.
   - 기계로 강제할 수 있는 규칙은 프롬프트에 두지 않고 도구로 옮긴다.

3. 문서는 "의도"만 쓰고, "사실"은 코드에서 파생시킨다.
   - 기획 의도, 매핑 관계, 미확정 사항 → 사람이/LLM이 쓰는 문서
   - 컴포넌트 props, API 타입, fixture → 코드에서 자동 생성 (드리프트 원천 차단)

4. 같은 정보를 두 곳에 두지 않는다.
   - 상태는 문서 frontmatter가 단일 출처, 대시보드는 스크립트가 생성한다.
   - confirmed API는 OpenAPI가 단일 출처, 수동 manifest는 미확정분 전용이다.
```

---

## 0. 기계 검증 기반을 먼저 깐다

LLM 규칙 파일보다 먼저, 프로젝트 초기에 한 번 설정한다.
**프롬프트로 부탁하던 규칙의 절반 이상은 여기서 강제된다.**

단, 규칙은 ESLint 설정 파일이 아니라 **정책(policy) 단위**로 관리한다.
프로젝트마다 스택(NativeWind/StyleSheet), 폴더 구조, 기존 린트 설정이 다르므로,
정책별로 켜고 끄고(severity), 적용 경로를 바꾸고, 구현 수단을 고를 수 있어야 한다.

```txt
lint-policy.yaml (단일 출처 — 사람/LLM이 편집)
  ├─ 정책별 enabled / severity / rollout / paths / implementation / reason
  └─ lint-gen ──▶ eslint.workflow.config.mjs (생성물 — 기존 설정 뒤에 합성, 직접 수정 금지)
```

이 조정은 LLM이 프로젝트를 스캔해 제안하되, 결과는 lint-policy.yaml에 기록되고
사람이 승인한다. 상세 모델과 브라운필드 도입 절차는
[스킬팩 설계 3장](frontend-workflow-skillpack-concept.md)을 따른다.

### 0-1. 핵심 정책 4종 (참조 구현: ESLint 기준)

```txt
- 화면 파일 fetch 직접 호출 금지            [tier: architecture]
  → no-restricted-imports + eslint-plugin-boundaries로
    features/*/screens 에서 src/api 직접 import 차단

- 임의 색상/스타일 금지 (text-[#333] 등)    [tier: style — 스택 따라 조정 가능]
  → NativeWind: eslint-plugin-tailwindcss arbitrary value 금지 + config 토큰 제한
  → StyleSheet 등 다른 스택: 색상 리터럴을 잡는 대체 구현으로 매핑 (또는 off + reason)

- Pressable/Text/View 로 버튼·카드 직접 제작 금지   [tier: architecture]
  → no-restricted-syntax 로 screens/features 내 Pressable 직접 사용 차단
    (components/ui 내부에서만 허용)

- 레이어 위반 금지 (screen → api 직접 의존 등)      [tier: architecture]
  → eslint-plugin-boundaries 의 element-types 규칙
  → 경로는 하드코딩하지 않고 frontend-architecture.md 에 선언된 레이어 경로에서 파생
```

**기존 프로젝트에 이미 린트가 있으면 설정을 덮어쓰지 않는다.**
adapt 절차(scan → map → diff → rollout)로 기존 설정 뒤에 합성하고,
기존 위반이 많은 규칙은 warn 선행 / 신규 코드 한정 / 카운트 래칫(baseline 기록,
증가 시에만 CI 실패) 중에서 위반 수에 맞게 도입한다.

### 0-2. 타입/스키마 검증

```txt
- API DTO는 zod 스키마로 정의한다. 타입은 z.infer 로 파생시킨다.
- fixture는 zod 스키마에서 생성하거나, 최소한 테스트에서 스키마로 검증한다.
  → "fixture가 실제 API와 동일한 형태"라는 규칙을 사람이 아니라 스키마가 지킨다.
- OpenAPI가 있으면 API client는 codegen 산출물을 쓴다.
  → 존재하지 않는 endpoint는 애초에 타입 에러가 된다.
```

### 0-3. CI 게이트

```txt
typecheck → lint → fixture 스키마 검증 → 컴포넌트 테스트

(브라운필드에서 rollout: ratchet 정책은 "위반 수가 baseline보다 증가하지 않음"이 pass 기준)
```

### 0-4. 승격 루프 (운영 규칙)

```txt
LLM 리뷰에서 같은 위반이 2번 이상 발견되면,
그 규칙은 프롬프트 룰에서 린트 정책으로 승격한다.
(= 정책 문서 추가 + lint-policy.yaml 에서 enable. rollout은 현재 위반 수 기준으로 선택)
```

이 루프가 있으면 시스템은 쓸수록 단단해진다. LLM 리뷰는 린트가 잡지 못하는 것
(기획 누락, 과해석, 의미적 오류)에만 집중하게 된다.

---

## 1. LLM 작업 규칙 파일은 "작고 안정적으로" 만든다

레포 루트에 `CLAUDE.md`(또는 `AGENTS.md`)를 만든다.
단, **여기에는 린트로 강제할 수 없는 규칙만 남긴다.** 규칙 파일이 길수록 LLM의 준수율은 떨어진다.

```md
# Frontend AI Rules

## 판단 금지 (문서 기반으로만)
- API endpoint, request, response 는 추측하지 않는다.
  확정 정보가 없으면 candidate/unknown 으로 표시하고 구현하지 않는다.
- 화면 구현 전 해당 화면의 ScreenSpec 을 먼저 읽는다.
- 디자인 값을 추측하지 않는다. 모르면 TODO 주석으로 남긴다.
- 새 공통 컴포넌트가 필요하면 구현하지 말고 Component Gap Register 에 제안만 남긴다.
- 모르는 내용은 Unknowns 섹션에 남긴다.

## 충돌 시 우선순위
- 비즈니스 동작: ScreenSpec(기획) 우선
- 시각 디자인: 최종 Figma 우선
- 데이터 계약: OpenAPI/API Manifest 우선
- 라우팅 구조: Navigation Map 우선
- 컴포넌트 사용: Component Catalog 우선
- 충돌을 발견하면 임의 판단하지 말고 conflicts 에 기록한다.

## 참조 경로
- 화면 계약: docs/frontend-workflow/domains/{domain}/screens/{screen}/screen-spec.md
- 컴포넌트 카탈로그: docs/frontend-workflow/design/component-catalog.md (자동 생성)
- API: openapi.yaml (확정분) / docs/frontend-workflow/api/api-manifest.md (미확정분)
```

`fetch 직접 금지`, `임의 색상 금지`, `Pressable 금지` 같은 항목이 여기 없는 이유는
**0단계의 린트가 이미 강제하기 때문**이다.

---

## 2. 와이어프레임 → ScreenSpec: 화면 계약은 "화면당 1개 파일"

기획 Figma(슬라이드형)는 최종 UI 소스가 아니라 **요구사항 원천**으로 본다.
LLM의 첫 작업은 코드가 아니라 ScreenSpec 작성이다.

v1에서는 화면당 7개 파일(spec, state-matrix, interaction-matrix, acceptance, mapping, fixture-contract, qa)로
나눴지만, 30개 화면이면 210개 파일이 된다. **화면당 1개 파일 + frontmatter + 섹션**으로 통합한다.
특정 섹션이 비대해질 때만 분리한다.

````md
---
artifact_id: COUPON-001-screen-spec
artifact_type: screen-spec
domain: coupons
screen_id: COUPON-001
status: draft            # 문서 라이프사이클: missing|draft|review|confirmed|implemented|verified
sources:
  - type: planning
    ref: figma-planning/coupon-slide-12
  - type: wireframe
    ref: docs/raw/wireframes/coupon-list.png
last_reviewed: 2026-06-12
# tbd/unknown/candidate 개수는 frontmatter에 쓰지 않는다 —
# 스크립트(workflow-state.mjs)가 본문을 파싱해 계산한다 (수동 카운트는 반드시 드리프트)
---

# ScreenSpec: 쿠폰 목록

## Purpose
사용자가 보유 쿠폰을 확인하고, 사용 가능한 쿠폰과 만료된 쿠폰을 구분해서 볼 수 있다.

## Route
/(tabs)/coupons

## Entry Points
<!-- GENERATED:START nav-graph -->
<!-- 직접 작성하지 마세요. 다른 화면의 Interaction Matrix 선언을
     `npm run workflow:nav` 가 역색인해 채웁니다. -->
- 하단 탭 > 쿠폰 (navigation-map: Tabs)
- HOME-001 > 보유 쿠폰 카드 클릭
<!-- GENERATED:END nav-graph -->
<!-- 템플릿에는 위 예시 bullet 없이 빈 GENERATED 블록만 둔다 -->


## UI Sections
1. Header
2. Coupon Status Tabs
3. Coupon List
4. Empty State
5. Error State

## State Matrix
| State | Condition | UI |
|---|---|---|
| loading | query.isLoading | SkeletonList |
| success | data.length > 0 | CouponList |
| empty | data.length === 0 | EmptyState |
| error | query.isError | ErrorState + Retry |
| refreshing | query.isRefetching | RefreshControl |

## Interaction Matrix
<!-- 화면 이동 엣지의 단일 선언 지점. 여기 적은 이동이 대상 화면의 Entry Points로 집계된다 -->
| User Action | Trigger | Result | Analytics Event |
|---|---|---|---|
| 쿠폰 클릭 | CouponCard press | /coupons/[id] 이동 | coupon_card_click |
| 상태 탭 변경 | Tab press | status filter 변경 | coupon_tab_change |
| 새로고침 | pull to refresh | refetch | - |
| 재시도 | ErrorState button | refetch | - |

## Mutation Matrix
<!-- 조회 전용 화면이면 "없음"으로 명시. 있으면 반드시 작성 -->
| Action | API | Optimistic | Invalidate QueryKeys | Success UI | Failure UI |
|---|---|---|---|---|---|
| 쿠폰 사용 | useCoupon (candidate) | no | couponKeys.all, couponKeys.detail(id) | 토스트 + 상태 갱신 | 에러 토스트 + 롤백 |

## Data Requirements
- 보유 쿠폰 목록 (상태: 사용 가능 / 사용 완료 / 만료)
- 만료일, 사용 조건, 쿠폰 이미지

## API Candidates
- GET /coupons          (confidence: candidate)
- GET /coupons/{id}     (confidence: candidate)

## Copy Keys
<!-- 문구를 LLM이 지어내지 않도록 i18n 키 또는 확정 문구로 관리 -->
| Key | 문구 | Status |
|---|---|---|
| coupon.list.title | 쿠폰 | confirmed |
| coupon.list.empty | TBD | tbd |

## Accessibility
- CouponCard: accessibilityRole="button", accessibilityLabel="{title}, {만료일}"
- 상태 탭: accessibilityState selected 반영

## Acceptance Criteria
<!-- State Matrix 와 중복 서술하지 않는다. 테스트로 옮길 수 있는 항목은 테스트 ID를 적는다 -->
- [ ] State Matrix 의 5개 상태가 모두 구현됨 → CouponListScreen.test.tsx
- [ ] 쿠폰 클릭 시 상세 이동 → maestro/coupon-list.yaml
- [ ] 만료 쿠폰 노출 정책 반영 (U-001 확정 후)

## Unknowns
| ID | Question | Status |
|---|---|---|
| U-001 | 만료 쿠폰 노출 여부 | open |
| U-002 | 정렬 기준 | open |
| U-003 | API pagination 방식 | open |
````

LLM에게 시키는 프롬프트:

```md
다음 와이어프레임 스크린샷과 기획 설명을 보고 코드를 작성하지 말고 ScreenSpec만 작성해줘.

규칙:
- API endpoint는 확정하지 말고 candidate로만 적어.
- 모르는 내용은 Unknowns에, 미확정 문구는 Copy Keys에 TBD로 적어.
- 디자인을 추측하지 말고 화면 구조와 사용자 행동만 정리해.
- mutation이 있는 화면이면 Mutation Matrix를 반드시 작성해. 없으면 "없음"으로 명시해.
- Entry Points는 작성하지 마 (생성됨). 화면 이동은 Interaction Matrix에만 선언해.
```

---

## 3. 여러 화면이면 stub ScreenSpec과 Navigation Map(뼈대)을 먼저

개별 화면부터 구현하면 라우팅이 틀어진다. 다만 전역에 큰 문서를 쌓지 않는다 —
**작성은 도메인 경로에서 하고, 전역 뷰는 생성한다.**

### 화면 발굴: 인벤토리 문서 대신 stub ScreenSpec

전체 화면 목록을 뽑는 작업은 별도 인벤토리 문서가 아니라,
**도메인별로 frontmatter만 채운 stub screen-spec을 까는 것**으로 한다.

```yaml
# domains/coupons/screens/coupon-detail/screen-spec.md (stub — 본문은 구현 직전에)
---
artifact_id: COUPON-002-screen-spec
screen_id: COUPON-002
domain: coupons
route: /coupons/[id]
status: draft
sources: [{ type: planning, ref: 기획 p.13 }]
---
```

Screen Inventory는 이 frontmatter들을 스크립트가 집계한 **생성물**이다
(`_meta/screen-inventory.yaml`). 누락 화면·ID 중복·route 충돌 검사도 스크립트가 한다.
첫날부터 작성은 도메인 경로에서만 일어난다.

### Navigation Map: 전역에는 뼈대만

도메인 내부 이동(쿠폰 목록 → 쿠폰 상세)은 각 화면 ScreenSpec의 Interaction Matrix가
이미 선언한다. 전역 Navigation Map에는 **도메인이 소유할 수 없는 것만** 남긴다.

```md
# Navigation Map (Skeleton)

## Structure
- Tabs: /(tabs)/home, /(tabs)/coupons, /(tabs)/my
- Auth Stack: /(auth)/login, /(auth)/signup
- Modals: /modal/terms

## Route Guard
- 미로그인 사용자가 Private Route 접근 시 /(auth)/login 으로 보낸다.
- 로그인 사용자가 /(auth)/login 접근 시 /(tabs)/home 으로 보낸다.

## Deep Links
| Pattern | Route | Auth 필요 | 비고 |
|---|---|---|---|
| myapp://coupons/:id | /coupons/[id] | yes | 푸시 알림 진입점 |
| myapp://login | /(auth)/login | no | |

## Cross-Domain Edges
<!-- 서로 다른 도메인을 잇는 이동만. 도메인 내부 이동은 각 ScreenSpec에 선언 -->
| From | To | Trigger |
|---|---|---|
| HOME-001 | COUPON-001 | 보유 쿠폰 카드 |
| AUTH-001 | HOME-001 | 로그인 성공 |
```

### Route Tree: 코드가 진실

Expo Router는 `src/app` 파일 트리가 곧 라우트다. skeleton 생성 전에는 LLM이
Navigation Map 기준으로 제안하고, 생성 후에는 `_meta/route-tree.txt`를
스크립트가 `src/app`에서 만든다. **손으로 쓰는 route-tree 문서는 두지 않는다.**

LLM 작업 순서:

```md
1) 와이어프레임을 보고 화면 구현하지 말고, 도메인별 stub ScreenSpec과
   Navigation Map(뼈대)만 만들어줘. 이동이 불확실한 부분은 Unknowns에 적어줘.

2) Navigation Map 기준으로 src/app 하위에 빈 placeholder만 만들어줘.
   각 화면은 Text로 Screen ID만 표시해.
```

**네비게이션 뼈대 먼저, 화면 구현은 나중.**

이 배치의 효과: 화면 하나를 구현할 때 LLM이 읽는 것은
`domains/{domain}/**` + 얇아진 `app/navigation-map.md` + 디자인 카탈로그가 전부다.

---

## 4. Component Catalog는 "자동 생성 + 수동 Do/Don't"

v1에서는 카탈로그 전체를 수동 작성했지만, props 정보는 코드와 반드시 어긋난다.
**구조를 둘로 나눈다.**

```txt
docs/frontend-workflow/design/
  component-catalog.md        ← 스크립트가 생성 (커밋은 하되 손으로 수정 금지)
  component-guidelines.md     ← 수동 작성 (Do/Don't, 선택 기준, a11y 규칙)
```

### 자동 생성분 (component-catalog.md)

`react-docgen-typescript` 또는 TS compiler API로 `src/components/ui/*`의
컴포넌트명, import 경로, props 타입을 추출한다. `npm run catalog:gen` 한 번으로 갱신.

### 수동 작성분 (component-guidelines.md)

```md
## Button

### When to use
- 화면 내 모든 액션 버튼. 탭/링크성 이동은 ListItem 또는 Link 사용.

### Do
<Button variant="primary" size="lg">확인</Button>

### Do Not
- Pressable 로 새 버튼을 만들지 말 것 (→ 린트가 차단함)
- loading 중 onPress 중복 방지는 Button 내부에서 처리됨. 화면에서 재구현 금지.

### Accessibility
- children 이 아이콘 단독이면 accessibilityLabel 필수
```

핵심 지시는 변하지 않는다:

**"예쁘게 만들어줘"가 아니라 "Component Catalog에 있는 컴포넌트만 사용해서 ScreenSpec을 구현해줘".**

---

## 5. API: OpenAPI가 단일 출처, 수동 Manifest는 미확정분 전용

### OpenAPI가 있는 경우 (우선 확인)

```txt
openapi.yaml → codegen → src/api/generated/*
```

- confirmed API의 단일 출처는 OpenAPI다. 수동 문서를 중복으로 만들지 않는다.
- 없는 endpoint는 타입 에러가 되므로 "API 날조"가 구조적으로 불가능해진다.

### OpenAPI가 없는 경우

`api-manifest.md`를 만들되, **미확정/후보 API 관리 도구**로 쓴다.

단일 출처 경계를 명확히 한다:

```txt
confirmed API가 OpenAPI에 있음
  → OpenAPI가 단일 출처. generated client 사용.
confirmed API가 OpenAPI에 없음
  → src/api/schemas/*.ts 의 zod 스키마가 단일 출처.
    manifest는 설명/출처/미확정 사항만 기록하고 스키마는 링크한다.
candidate API
  → manifest에만 존재. api client 구현 금지, fake hook/fixture까지만 허용.
```

````md
# API Manifest

## getMyCoupons

### Confidence
candidate          <!-- unknown | candidate | confirmed -->

### Source
- Confluence: 링크
- Backend file: modules/coupon/CouponController.java

### Method / Path
GET /api/v1/coupons

### Query
- status?: AVAILABLE | USED | EXPIRED
- page?: number / size?: number

### Response Schema
- Source: src/api/schemas/coupon.schema.ts (zod — 단일 출처, 타입은 z.infer로 파생)
- Confidence: candidate

<!-- zod 코드는 manifest에 넣지 않는다. 스키마는 코드 파일이 출처고,
     manifest는 링크와 미확정 사항만 기록한다. 문서 속 코드 사본은 반드시 드리프트한다. -->

### Used By
- COUPON-001, COUPON-002

### Unknowns
- status enum 실제 값 확인 필요
- pagination 방식 확인 필요
````

LLM 프롬프트:

```md
백엔드 레포와 Confluence 내용을 바탕으로 API Manifest만 작성해줘.
화면 코드는 작성하지 마.
불확실한 endpoint, field, enum은 confirmed로 표시하지 말고 candidate 또는 unknown으로 표시해.
Response 스키마는 src/api/schemas/ 에 zod로 작성하고 manifest에는 링크만 남겨.
```

---

## 6. 데이터 계층: fixture→hook "교체 단계"를 없앤다

v1의 가장 큰 위험 단계는 "fixture 기반 화면을 만들고 나중에 hook으로 교체"였다.
화면 코드를 다시 수정해야 하므로 "UI 바꾸지 마" 같은 방어 프롬프트가 필요했다.
**교체 단계 자체를 제거한다.** 두 가지 방법 중 하나를 택한다.

### 방법 A: 같은 인터페이스의 fake hook (기본 추천)

화면은 처음부터 `useCoupons`를 쓴다. 내부 구현만 단계에 따라 바뀐다.

핵심은 **반환 타입을 먼저 고정**하는 것이다. 화면이 TanStack Query의 세부 플래그
(`isFetching`, `isPending`, `isRefetching` 등)에 직접 의존하면 fake 구현과 real 구현의
shape 차이가 나중에 새 문제를 만든다.

```ts
// 화면이 의존하는 유일한 계약 — TanStack Query 객체를 그대로 노출하지 않는다
export type AsyncState<TData, TError = Error> = {
  data: TData | undefined;
  status: 'idle' | 'loading' | 'success' | 'empty' | 'error';
  isLoading: boolean;
  isRefreshing: boolean;
  isError: boolean;
  error: TError | null;
  refetch: () => Promise<unknown>;
};

export type UseCouponsResult = AsyncState<Coupon[]>;
```

```ts
// 1단계: API 미확정 — fixture를 같은 인터페이스로 반환
export function useCoupons(status: CouponStatus): UseCouponsResult {
  const data = couponFixtures.filter(c => c.status === status);
  return {
    data,
    status: data.length ? 'success' : 'empty',
    isLoading: false, isRefreshing: false, isError: false, error: null,
    refetch: async () => {},
  };
}

// 2단계: API 확정 — 내부만 교체, 화면은 한 줄도 안 바뀜
export function useCoupons(status: CouponStatus): UseCouponsResult {
  const query = useQuery({
    queryKey: couponKeys.list(status),
    queryFn: () => getCoupons({ status }),
    select: mapCouponListDto,
  });
  return toAsyncState(query); // query 객체를 화면에 그대로 노출하지 않는다
}
```

이렇게 하면 hook 내부가 fixture든 MSW든 TanStack Query든 화면은 안정적이다.

### 방법 B: MSW (React Native 지원)

첫날부터 진짜 `useQuery`를 쓰고, mock handler만 교체한다.
loading/error/empty를 handler에서 시뮬레이션할 수 있어 State Matrix 검증이 쉬워진다.

```ts
// mocks/handlers/coupon.ts — 실제 API가 열리면 이 파일만 제거
http.get('/api/v1/coupons', () => HttpResponse.json(couponFixtures))
```

어느 쪽이든 결과는 같다: **화면 코드는 데이터 출처 변경에 영향을 받지 않는다.**

### 레이어 구조

```txt
src/
  api/
    client.ts
    schemas/            ← zod 스키마 (DTO 단일 출처)
    coupon.api.ts
  features/
    coupons/
      queryKeys.ts           ← query key factory (invalidation의 단일 출처)
      hooks/
        useCoupons.ts        (조회)
        useUseCoupon.ts      (mutation — 조회와 분리)
      screens/
      components/
      fixtures/              ← zod 스키마에서 생성/검증
```

queryKey는 문자열 배열을 손으로 쓰지 않는다. **query key factory가 단일 출처**다.
LLM이 `['coupons', id]`, `['coupon', id]`, `['coupons', 'detail', id]`를 오가는 문제를 차단한다.

```ts
export const couponKeys = {
  all: ['coupons'] as const,
  list: (status: CouponStatus) => ['coupons', 'list', status] as const,
  detail: (id: string) => ['coupons', 'detail', id] as const,
};
```

mutation hook에는 ScreenSpec의 Mutation Matrix에 적힌 **invalidate 대상**을 그대로 반영하되,
Matrix에도 키 이름(`couponKeys.all`, `couponKeys.detail(id)`)으로 적는다.
invalidation은 LLM이 가장 잘 환각하는 지점이므로 반드시 문서에서 매핑한다.

LLM 작업 순서:

```md
1) API Manifest(또는 OpenAPI)를 보고 src/api/coupon.api.ts만 작성해줘. 화면/hook 금지.
   confidence가 unknown인 항목은 구현하지 말고 TODO로 남겨.

2) useCoupons hook을 작성해줘. UseCouponsResult 인터페이스를 먼저 정의하고,
   API가 candidate인 동안은 fixture 기반 fake 구현으로 작성해. UI 코드 금지.

3) (API 확정 후) useCoupons 내부 구현만 useQuery로 교체해줘.
   인터페이스와 화면 코드는 수정하지 마.
```

---

## 7. 화면 구현: fake hook 기반 presentational screen

ScreenSpec, Component Catalog, Route, fake hook(fixture)이 준비된 뒤에 화면을 만든다.

```md
다음 파일만 수정해줘.
- src/features/coupons/screens/CouponListScreen.tsx
- src/features/coupons/components/CouponCard.tsx

입력:
- ScreenSpec: docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md
- Component Catalog: docs/frontend-workflow/design/component-catalog.md
- Guidelines: docs/frontend-workflow/design/component-guidelines.md

규칙:
- useCoupons hook만 사용해 (현재 fake 구현). src/api 수정 금지.
- State Matrix의 모든 상태(loading/success/empty/error/refreshing)를 구현해.
- 문구는 Copy Keys의 confirmed 값만 사용하고, tbd는 키 이름 그대로 표시해.
- Accessibility 섹션의 요구사항을 반영해.
- 모르는 디자인 값은 임의 추측하지 말고 TODO 주석으로 남겨.
```

이 단계의 목표는 **기획 구조에 맞는 화면 배치 + 전체 상태 처리**다.
픽셀 정합성은 최종 Figma 단계에서 잡는다.

각 상태는 Storybook 스토리(또는 컴포넌트 테스트)로 고정한다. State Matrix의 행 하나 = 스토리 하나.

---

## 8. 최종 Figma가 나오면 Component Mapping 후 UI 보정

최종 디자인이 나와도 "이 프레임 구현해줘"는 금지. 먼저 매핑 문서를 만든다.

```md
# Figma Component Mapping: CouponListScreen

## Mapping
| Figma Layer | Frontend Component | Notes |
|---|---|---|
| Header / Title | AppHeader | title="쿠폰" |
| Tab / Available | SegmentedTabs | variant="underline" |
| Coupon Card | CouponCard | 기존 feature component |
| Empty State | EmptyState | icon 필요 |

## Missing Components
| Need | Figma Component | Decision |
|---|---|---|
| Segmented Tabs | DS/Tabs/Segmented | Component Gap Register에 등록 |

## Conflicts
| Area | ScreenSpec | Figma | 처리 |
|---|---|---|---|
| 만료 탭 | 노출 (U-001 미확정) | 미노출 | 시각 요소 → Figma 우선, U-001 업데이트 |
```

Figma MCP를 쓰면 frame context를 가져와 매핑 문서 작성에 활용한다.

```md
Figma MCP로 가져온 frame context를 보고 코드를 작성하지 말고
Component Mapping 문서만 만들어줘.
- 기존 컴포넌트에 없는 것은 Missing Component로 표시해.
- ScreenSpec과 충돌하는 부분은 Conflict 섹션에 적고, 충돌 우선순위 규칙을 적용해.
```

매핑이 끝난 뒤에만 UI를 보정한다. 이때도 수정 가능 파일을 제한한다.

---

## 9. API 통합: hook 내부 교체 + 통합 검증

6단계에서 인터페이스를 고정했으므로, 통합은 **hook 내부 구현 교체**로 끝난다.
화면 파일은 건드리지 않는다.

통합 직후 검증할 것:

```txt
- fixture 스키마 검증 테스트가 실제 응답에도 통과하는가 (zod parse)
- State Matrix의 각 상태가 실제 API 조건에서 재현되는가
- Mutation Matrix의 invalidation이 동작하는가
```

---

## 10. 검증: 체크리스트가 아니라 테스트로

v1의 검증은 전부 "읽는 체크리스트"였다. 실행 가능한 것부터 테스트로 옮긴다.
**실패하는 테스트가 체크리스트보다 강력한 환각 탐지기다.**

| 검증 대상 | 도구 | 비고 |
|---|---|---|
| 컴포넌트/스타일 규칙 위반 | ESLint (CI) | 0단계에서 구축 |
| DTO/fixture 정합성 | zod + 테스트 | |
| State Matrix 커버리지 | Storybook(기본값) / 컴포넌트 테스트 / fixture 화면 / MSW 시나리오 | 상태 행 = 시나리오 1개. 수단은 프로젝트별 선택 |
| Acceptance Criteria | Maestro (Expo E2E) | 가능한 항목만 |
| 기획 누락 / 과해석 / 의미 오류 | LLM 리뷰 | 기계가 못 잡는 것 전담 |

LLM 리뷰 프롬프트 (구현과 분리된 깨끗한 컨텍스트에서 실행):

```md
다음 변경사항을 ScreenSpec, Component Mapping, API Manifest 기준으로 리뷰해줘.

리뷰 항목 (린트/테스트가 못 잡는 것만):
1. 기획 누락 또는 과해석
2. ScreenSpec과 다른 동작
3. Unknowns를 임의로 확정한 부분
4. 문구를 지어낸 부분 (Copy Keys 대조)

수정하지 말고 리뷰 코멘트만 작성해줘.
```

---

## 11. 화면 하나를 vertical slice로 끝까지, 그 다음 복제

처음부터 모든 화면을 병렬로 맡기지 않는다.
대표 화면 하나(예: 쿠폰 목록)를 다음 전체 사이클로 완성한다.

```txt
route + ScreenSpec + fake hook + presentational UI(전 상태)
+ 스토리/테스트 + Figma mapping + UI 보정 + hook 내부 교체 + 통합 검증
```

완성된 화면이 **이후 모든 화면의 golden example**이 된다.
LLM에게는 "쿠폰 목록과 같은 구조로"라고 지시할 수 있게 되고, few-shot 효과가 가장 크다.

---

## 추천 작업 순서 (요약)

```txt
 1. 린트/타입/스키마/CI 기계 검증 기반 구축          ← v1에 없던 0단계
 2. CLAUDE.md / LLM rules 작성 (작게)
 3. Component Catalog 자동 생성 파이프라인 + Guidelines 작성
 4. 도메인별 stub ScreenSpec 생성 (frontmatter만) — Screen Inventory는 생성물
 5. Navigation Map 작성 (뼈대: 탭/스택/모달, Route Guard, Deep Link, 크로스 도메인 엣지)
 6. Expo Router route skeleton 생성 — 이후 route-tree는 src/app에서 생성
 7. 와이어프레임 → ScreenSpec 완성 (화면당 1파일, 구현할 화면부터)
 8. OpenAPI 확인 → 있으면 codegen / 없으면 API Manifest(zod 스키마 포함)
 9. api client + fake hook (인터페이스 고정)
10. fixture를 zod 스키마에서 생성
11. fake hook 기반 presentational screen 구현 (전 상태)
12. State Matrix → Storybook 스토리/테스트
13. 최종 Figma → Component Mapping → UI 보정
14. hook 내부 교체 (화면 수정 없음)
15. 통합 검증 + LLM 리뷰 (의미적 항목만)
16. golden example 확정 → 다음 화면 복제
```

---

## 좋은 작업 단위 / 나쁜 작업 단위

좋은 단위 — 항상 **하나의 목적, 제한된 파일, 명확한 금지사항, 기준 문서, 출력 형식**을 함께 준다:

```txt
- 이 와이어프레임을 ScreenSpec으로 변환해줘
- 이 ScreenSpec들로 Navigation Map 만들어줘
- 이 Navigation Map대로 Expo Router skeleton만 만들어줘
- 이 API 문서로 API Manifest만 작성해줘 (zod 스키마 포함)
- UseCouponsResult 인터페이스와 fake hook만 작성해줘
- 이 Component Mapping 기준으로 이 화면 하나만 보정해줘
- useCoupons 내부 구현만 useQuery로 교체해줘
- 이 ScreenSpec 기준으로 기획 누락만 리뷰해줘
```

나쁜 단위:

```txt
- 이 앱 전체 만들어줘
- 이 피그마 보고 화면 다 만들어줘
- 백엔드도 보고 알아서 연동해줘
- 디자인시스템에 맞게 적당히 예쁘게 해줘
```

---

## 참고

- Expo Router: https://docs.expo.dev/router/introduction/
- NativeWind: https://www.nativewind.dev/docs/getting-started/installation
- TanStack Query React Native: https://tanstack.com/query/v5/docs/framework/react/react-native
- Figma MCP Server: https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server
- Hey API (OpenAPI → TS): https://heyapi.dev/docs/openapi/typescript/get-started
- MSW: https://mswjs.io/ (React Native 지원)
- Maestro (Expo E2E): https://docs.expo.dev/build-reference/e2e-tests/
- react-docgen-typescript: https://github.com/styleguidist/react-docgen-typescript

선행 사례 (구조 참고용): GitHub Spec Kit(constitution ≈ LLM rules, spec/plan/tasks 분리),
AWS Kiro(requirements/design/tasks), BMAD Method. 이들이 이미 겪은
문서 드리프트·상태 추적·게이트 설계 문제의 해법을 참고할 수 있다.

기술 선택 주의: TanStack Query, Storybook, Maestro, MSW는 **추천 기본값**이지 강제값이 아니다.
프로젝트 상황에 따라 대체 가능하며, 대체했다면 그 선택을 lint-policy / state coverage 설정에 기록한다.
