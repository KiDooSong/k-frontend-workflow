# 프론트엔드 LLM 워크플로우

> 범위: “추천 순서”부터 “결론” 직전까지 정리한 Markdown 문서입니다.  
> 목적: Expo 앱, 디자인시스템, Figma, 와이어프레임, 백엔드 API를 LLM 기반 프론트엔드 개발 흐름에 맞게 단계별로 정리합니다.

---

## 추천 순서

### 0. 먼저 “LLM 작업 규칙 파일”부터 만든다

레포 루트에 `AGENTS.md`나 `CLAUDE.md`, `.cursor/rules`, `docs/frontend/rules.md` 같은 파일을 만들어둔다.

여기에 최소한 아래 규칙을 넣어두는 것이 좋다.

```md
# Frontend AI Rules

- 새 UI 컴포넌트는 임의로 만들지 않는다.
- 반드시 src/components/ui 또는 src/design-system에 있는 컴포넌트를 우선 사용한다.
- 없는 컴포넌트가 필요하면 구현하지 말고 TODO와 제안만 남긴다.
- API endpoint, request, response는 추측하지 않는다.
- API 정보가 없으면 src/api/mock 또는 fixtures만 사용한다.
- 화면 파일에는 fetch 로직을 직접 넣지 않는다.
- 서버 상태는 hooks/query 계층에서 처리한다.
- 화면 구현 전 ScreenSpec 문서를 먼저 읽는다.
- 모르는 내용은 Unknowns 섹션에 남긴다.
```

이게 없으면 LLM이 매번 “좋아 보이는 방식”으로 새로 판단한다. 반대로 이 규칙이 있으면 환각을 꽤 줄일 수 있다.

---

## 1. 와이어프레임을 보고 바로 코드 만들지 말고, 먼저 `ScreenSpec`을 만든다

기획팀 Figma가 PPT/슬라이드 느낌이라면, 이것은 최종 UI 소스라기보다 **요구사항 원천**으로 보는 것이 좋다.

화면별로 다음과 같은 문서를 먼저 만든다.

```md
# ScreenSpec: 쿠폰 목록 화면

## Source
- 기획 피그마: 링크
- 와이어프레임 스크린샷: /docs/screens/coupon-list/wireframe.png
- 기획 설명 슬라이드: 링크 또는 캡처

## Purpose
사용자가 보유 쿠폰을 확인하고, 사용 가능한 쿠폰과 만료된 쿠폰을 구분해서 볼 수 있다.

## Route
/app/(tabs)/coupons

## Entry Points
- 하단 탭 > 쿠폰
- 홈 > 보유 쿠폰 카드 클릭

## Navigation
- 쿠폰 클릭 → 쿠폰 상세
- 뒤로가기 → 이전 화면
- 빈 상태 CTA → 이벤트 화면 또는 홈

## UI Sections
1. 상단 타이틀
2. 쿠폰 상태 탭
3. 쿠폰 리스트
4. 빈 상태
5. 오류 상태

## Data Requirements
- 보유 쿠폰 목록
- 쿠폰 상태: 사용 가능 / 사용 완료 / 만료
- 만료일
- 사용 조건
- 쿠폰 이미지 또는 아이콘

## API Candidates
- GET /coupons
- GET /coupons/{couponId}

## States
- loading
- success: has items
- success: empty
- error
- offline, 필요 시

## Unknowns
- 만료 쿠폰 노출 여부 확정 필요
- 쿠폰 정렬 기준 확정 필요
- API 응답 필드명 확인 필요

## Acceptance Criteria
- 사용 가능 쿠폰이 없으면 빈 상태를 보여준다.
- API 실패 시 재시도 버튼을 보여준다.
- 디자인시스템의 Button, Card, Text, EmptyState만 사용한다.
```

LLM에게 첫 작업으로 시킬 것은 코드가 아니라 `ScreenSpec` 작성이다.

```md
다음 와이어프레임 스크린샷과 기획 설명을 보고 코드를 작성하지 말고 ScreenSpec만 작성해줘.

규칙:
- API endpoint는 확정하지 말고 후보로만 적어.
- 모르는 내용은 Unknowns에 적어.
- 디자인을 추측하지 말고 화면 구조와 사용자 행동만 정리해.
- 화면별 route, entry point, navigation action, state를 반드시 분리해.
```

이 단계의 목적은 **기획을 LLM이 바로 구현하지 못하게 막고, 먼저 정규화된 문서로 바꾸는 것**이다.

---

## 2. 여러 화면에서 `Screen Inventory`와 `Navigation Map`을 먼저 만든다

화면이 여러 장이면 개별 화면부터 구현할 경우 나중에 라우팅이 틀어질 가능성이 크다. 먼저 전체 화면 목록을 뽑는다.

```md
# Screen Inventory

| ID | Screen | Route | Type | Source | Status |
|---|---|---|---|---|---|
| AUTH-001 | 로그인 | /login | auth | 기획 p.3 | spec ready |
| HOME-001 | 홈 | /(tabs)/home | tab | 기획 p.7 | needs API |
| COUPON-001 | 쿠폰 목록 | /(tabs)/coupons | tab | 기획 p.12 | spec ready |
| COUPON-002 | 쿠폰 상세 | /coupons/[id] | stack | 기획 p.13 | needs backend |
```

그리고 네비게이션 맵을 만든다.

```md
# Navigation Map

## Auth Flow
/login
  -> /(tabs)/home on success

## Main Tabs
/(tabs)/home
/(tabs)/coupons
/(tabs)/my

## Stack Screens
/coupons/[id]
/notices/[id]
/settings/profile
```

Expo Router를 쓴다면 라우트가 파일 구조에서 파생되므로 이 단계가 특히 중요하다. Expo Router는 `src/app` 아래 파일과 디렉터리를 라우트로 사용하고, `_layout` 파일로 네비게이션 구조를 잡는 방식이다.

LLM에게 시킬 작업은 다음과 같이 나눈다.

```md
ScreenSpec 문서들을 읽고 Expo Router 기준의 route tree를 설계해줘.
아직 화면 UI는 구현하지 말고, src/app 파일 구조와 _layout 구조만 제안해줘.
각 route가 어떤 ScreenSpec과 연결되는지도 표로 만들어줘.
```

그 다음 구현은 작게 진행한다.

```md
제안한 route tree대로 src/app 하위에 빈 screen placeholder만 만들어줘.
각 화면은 Text로 Screen ID만 표시하고, 실제 UI는 구현하지 마.
```

즉, **네비게이션 뼈대 먼저** 잡는 것이 좋다.

---

## 3. 디자인시스템은 `Component Catalog`로 고정한다

디자인팀이 디자인시스템을 정비 중이라면, 프론트에서는 LLM이 읽을 수 있는 컴포넌트 카탈로그를 먼저 만들어야 한다.

예시는 다음과 같다.

```md
# Component Catalog

## Button
import { Button } from '@/components/ui/Button'

### Props
- variant: 'primary' | 'secondary' | 'ghost' | 'danger'
- size: 'sm' | 'md' | 'lg'
- disabled?: boolean
- loading?: boolean
- children: ReactNode

### Usage
<Button variant="primary" size="lg">확인</Button>

### Do not
- Pressable로 새 버튼을 만들지 말 것
- 임의 색상 className 사용 금지
```

```md
## Text
import { AppText } from '@/components/ui/AppText'

### Props
- variant: 'title' | 'subtitle' | 'body' | 'caption' | 'label'
- color: 'default' | 'muted' | 'danger' | 'success'
```

NativeWind를 쓰고 있다면 React Native에서 Tailwind 스타일의 `className` 기반 워크플로를 쓰는 구조와 맞다. Expo 설정에는 Metro 설정, `global.css`, Babel 설정 등이 관여하므로 프로젝트 초기에 한 번 고정해두는 것이 좋다.

핵심은 다음과 같다.

**LLM에게 “예쁘게 만들어줘”라고 하지 말고, “Component Catalog에 있는 컴포넌트만 사용해서 ScreenSpec을 구현해줘”라고 해야 한다.**

---

## 4. 백엔드는 `API Manifest`로 따로 뽑는다

백엔드가 Confluence와 레포에 흩어져 있다면, LLM이 화면 구현 중 API를 추측하게 두면 안 된다. 먼저 API 정보를 화면과 분리해서 정리해야 한다.

```md
# API Manifest

## getMyCoupons

### Status
candidate / confirmed / implemented / deprecated

### Source
- Confluence: 링크
- Backend file: modules/coupon/CouponController.java

### Method
GET

### Path
/api/v1/coupons

### Auth
Bearer token required

### Query
- status?: AVAILABLE | USED | EXPIRED
- page?: number
- size?: number

### Response
```ts
type CouponDto = {
  id: string;
  title: string;
  description: string;
  status: 'AVAILABLE' | 'USED' | 'EXPIRED';
  expiresAt: string;
}
```

### Used By
- COUPON-001 쿠폰 목록
- COUPON-002 쿠폰 상세

### Unknowns
- status enum 실제 값 확인 필요
- pagination 방식 확인 필요
```

가능하면 OpenAPI/Swagger가 있는지 먼저 확인하고, 있다면 TypeScript client 생성 쪽으로 가는 것이 좋다. OpenAPI가 없다면 최소한 `api-manifest.md`를 수동으로 만들고, LLM에게는 다음처럼 시킨다.

```md
백엔드 레포와 Confluence 내용을 바탕으로 API Manifest만 작성해줘.
화면 코드는 작성하지 마.
불확실한 endpoint, field, enum은 confirmed로 표시하지 말고 candidate 또는 unknown으로 표시해.
```

---

## 5. API 연동은 화면 안이 아니라 `api client → query hook → screen`으로 나눈다

화면에서 바로 `fetch()` 하게 만들면 나중에 관리가 어려워질 수 있다.

추천 구조는 다음과 같다.

```txt
src/
  api/
    client.ts
    types.ts
    coupon.api.ts
  features/
    coupons/
      hooks/
        useCoupons.ts
        useCouponDetail.ts
      screens/
        CouponListScreen.tsx
        CouponDetailScreen.tsx
      components/
        CouponCard.tsx
      fixtures/
        coupon.fixtures.ts
```

TanStack Query 같은 서버 상태 관리 도구를 사용하면 fetch, cache, mutation, loading, error 상태를 화면과 분리해서 관리하기 좋다.

LLM에게는 순서를 이렇게 준다.

첫 번째:

```md
API Manifest를 보고 src/api/coupon.api.ts만 작성해줘.
화면과 hook은 작성하지 마.
endpoint가 unknown인 항목은 구현하지 말고 TODO로 남겨.
```

두 번째:

```md
coupon.api.ts를 사용하는 useCoupons, useCouponDetail hook만 작성해줘.
UI 코드는 작성하지 마.
loading, error, empty 판단은 hook 또는 view model에서 screen이 쉽게 사용할 수 있게 반환해줘.
```

세 번째:

```md
기존 CouponListScreen에 useCoupons를 연결해줘.
새 API 함수나 endpoint는 만들지 마.
```

이렇게 하면 LLM이 화면 구현 중 API를 날조할 가능성이 줄어든다.

---

## 6. 화면 구현은 “mock data 기반 presentational screen”을 먼저 만든다

바로 API까지 연결하지 말고, 먼저 mock data로 화면만 만든다.

순서는 다음과 같다.

1. `ScreenSpec` 있음
2. `Component Catalog` 있음
3. `Route` 있음
4. `fixture data` 있음
5. 그 다음 화면 UI 구현

프롬프트 예시는 다음과 같다.

```md
다음 파일만 수정해줘.

- src/features/coupons/screens/CouponListScreen.tsx
- src/features/coupons/components/CouponCard.tsx

입력:
- ScreenSpec: docs/screens/coupon-list/spec.md
- Component Catalog: docs/design-system/component-catalog.md
- Fixture: src/features/coupons/fixtures/coupon.fixtures.ts

규칙:
- API 연결하지 마.
- useQuery 사용하지 마.
- fixture data만 사용해.
- src/components/ui에 없는 컴포넌트를 만들지 마.
- className은 디자인 토큰 기반으로만 사용해.
- 모르는 디자인 값은 임의 추측하지 말고 TODO 주석으로 남겨.
```

이 단계의 결과는 **기획 구조에 맞는 화면 배치**다. 아직 백엔드와 최종 Figma 픽셀 정합성을 목표로 하지 않는다.

---

## 7. 최종 Figma가 나오면 `Figma → Component Mapping`을 한다

최종 디자인이 나왔을 때도 바로 “이 프레임 구현해줘”라고 하면 안 된다. 먼저 Figma 레이어를 프론트 컴포넌트로 매핑하는 문서를 만든다.

```md
# Figma Component Mapping: CouponListScreen

## Source
- Figma final frame: 링크
- ScreenSpec: COUPON-001

## Mapping

| Figma Layer | Frontend Component | Notes |
|---|---|---|
| Header / Title | AppHeader | title="쿠폰" |
| Tab / Available | SegmentedTabs | variant="underline" |
| Coupon Card | CouponCard | existing feature component |
| Empty State | EmptyState | icon required |
| CTA Button | Button | variant="primary" |

## Token Mapping

| Figma token | NativeWind / Tailwind token |
|---|---|
| color.bg.default | bg-background |
| color.text.primary | text-foreground |
| spacing.16 | p-4 |
```

Figma MCP를 쓴다면 이 단계에서 효과가 크다. Figma MCP는 선택한 레이어나 프레임의 디자인 컨텍스트를 agentic coding 도구로 가져오는 데 활용할 수 있고, Code Connect 매핑을 활용하면 Figma 컴포넌트를 코드 컴포넌트와 연결하는 데 도움이 된다.

좋은 프롬프트 예시는 다음과 같다.

```md
Figma MCP로 가져온 이 frame context를 보고 코드를 작성하지 말고,
기존 Component Catalog와 매칭되는 Component Mapping 문서만 만들어줘.

규칙:
- 기존 컴포넌트에 없는 것은 Missing Component로 표시해.
- 임의로 새 컴포넌트 코드를 만들지 마.
- Figma layer 이름, 사용할 코드 컴포넌트, 필요한 props를 표로 정리해.
- ScreenSpec과 충돌하는 부분은 Conflict 섹션에 적어.
```

이 단계가 있으면 최종 Figma와 화면 구현 사이의 괴리가 줄어든다.

---

## 8. 그 다음에만 최종 화면을 구현한다

이제 LLM에게 실제 화면 구현을 맡긴다. 단, 컨텍스트는 화면 하나 단위로 제한한다.

한 화면마다 “Screen Capsule”을 만들어두면 좋다.

```txt
docs/screens/coupon-list/
  wireframe.png
  spec.md
  final-figma.md
  component-mapping.md
  api-mapping.md
  acceptance.md
```

프롬프트 예시는 다음과 같다.

```md
CouponListScreen을 최종 피그마 기준으로 수정해줘.

반드시 읽을 것:
- docs/screens/coupon-list/spec.md
- docs/screens/coupon-list/component-mapping.md
- docs/screens/coupon-list/api-mapping.md
- docs/design-system/component-catalog.md
- src/features/coupons/fixtures/coupon.fixtures.ts

규칙:
- 이 작업에서는 API 연결하지 마.
- presentational UI만 수정해.
- 새 dependency 추가 금지.
- 새 공통 컴포넌트 추가 금지.
- 필요한 컴포넌트가 없으면 TODO로 남겨.
- Figma와 ScreenSpec이 충돌하면 ScreenSpec 우선, 충돌 내역을 주석 또는 응답에 남겨.
```

여기까지 하면 “화면 생김새”가 잡힌다.

---

## 9. 마지막에 API hook을 연결한다

화면 UI와 API를 동시에 붙이면 LLM이 둘 중 하나를 망칠 가능성이 높다. UI가 fixture로 완성된 뒤에 hook만 연결한다.

```md
CouponListScreen의 fixture data를 useCoupons hook으로 교체해줘.

규칙:
- UI 레이아웃은 바꾸지 마.
- src/api는 수정하지 마.
- useCoupons hook의 반환값만 사용해.
- loading, error, empty, success 상태를 ScreenSpec의 State Matrix에 맞게 연결해.
```

이때 ScreenSpec에 상태표가 있어야 좋다.

```md
# State Matrix

| State | Condition | UI |
|---|---|---|
| loading | query.isLoading | SkeletonList |
| error | query.isError | ErrorState + Retry button |
| empty | data.length === 0 | EmptyState |
| success | data.length > 0 | CouponList |
| refreshing | refetching | RefreshControl |
```

LLM은 상태표가 없으면 임의로 `ActivityIndicator` 하나만 넣고 끝낼 가능성이 크다.

---

## 10. 화면 하나를 끝까지 만든 뒤 패턴을 복제한다

처음부터 모든 화면을 병렬로 LLM에게 맡기지 않는다.

추천은 **대표 화면 하나를 vertical slice로 끝까지 완성**하는 것이다.

예를 들어:

```txt
쿠폰 목록 화면
= route
+ ScreenSpec
+ Component Mapping
+ API Manifest
+ fixture
+ presentational UI
+ hook
+ API 연결
+ loading/error/empty 상태
+ QA checklist
```

이걸 하나 완성한 뒤, 그 구조를 템플릿으로 삼아서 다른 화면에 반복 적용한다.

즉, 첫 화면은 느리게, 이후 화면은 빠르게 가는 방식이 좋다.

---

## 내가 추천하는 실제 작업 순서

당장 지금 상황 기준으로는 이렇게 가면 된다.

```txt
1. AGENTS.md / LLM rules 작성
2. 디자인시스템 Component Catalog 작성
3. 와이어프레임 스크린샷 → ScreenSpec 변환
4. 전체 Screen Inventory 작성
5. Navigation Map 작성
6. Expo Router route skeleton 생성
7. 백엔드 Confluence/소스 → API Manifest 작성
8. API client / types / hooks 계층 작성
9. 화면별 fixture 작성
10. mock data 기반 presentational screen 구현
11. 최종 Figma 나오면 Component Mapping 작성
12. 최종 Figma 기준 UI 보정
13. API hook 연결
14. loading / empty / error / permission 상태 연결
15. 화면별 acceptance checklist로 리뷰
```

중요한 건 **화면 구현이 10번 이후**라는 점이다. 초기에는 코드를 많이 치는 것보다, LLM이 헷갈리지 않을 문맥을 만드는 것이 더 이득이다.

---

## LLM에게 맡기기 좋은 단위와 안 좋은 단위

좋은 단위:

```txt
- 이 와이어프레임을 ScreenSpec으로 변환해줘
- 이 ScreenSpec들로 Navigation Map 만들어줘
- 이 Navigation Map대로 Expo Router skeleton만 만들어줘
- 이 API 문서로 API Manifest 만들어줘
- 이 API Manifest로 hook만 만들어줘
- 이 Component Mapping 기준으로 이 화면 하나만 수정해줘
- 이 화면에서 fixture를 hook으로 교체해줘
- 이 ScreenSpec 기준으로 누락 상태를 리뷰해줘
```

안 좋은 단위:

```txt
- 이 앱 전체 만들어줘
- 이 피그마 보고 화면 다 만들어줘
- 백엔드도 보고 알아서 연동해줘
- 디자인시스템에 맞게 적당히 예쁘게 해줘
- 이 화면들 전체를 한 번에 구현해줘
```

LLM에게는 항상 **입력 문서, 수정 가능 파일, 금지 사항, 출력 형식**을 같이 줘야 한다.

---

## 프론트 구조는 이런 식이 무난하다

```txt
src/
  app/
    _layout.tsx
    index.tsx
    (auth)/
      login.tsx
    (tabs)/
      _layout.tsx
      home.tsx
      coupons.tsx
      my.tsx
    coupons/
      [id].tsx

  components/
    ui/
      Button.tsx
      AppText.tsx
      Card.tsx
      EmptyState.tsx
      ErrorState.tsx

  design-system/
    tokens.ts
    theme.ts

  api/
    client.ts
    types.ts
    coupon.api.ts

  features/
    coupons/
      screens/
        CouponListScreen.tsx
        CouponDetailScreen.tsx
      components/
        CouponCard.tsx
      hooks/
        useCoupons.ts
        useCouponDetail.ts
      fixtures/
        coupon.fixtures.ts
```

`src/app`은 라우팅, `features`는 도메인 화면, `components/ui`는 디자인시스템 컴포넌트, `api`는 서버 통신으로 분리하는 식이다.

---

## 환각 줄이는 핵심 규칙

가장 중요한 규칙은 다음과 같다.

**LLM이 “결정”하지 않게 하고, “매핑”하게 만들어야 한다.**

예를 들면:

```txt
나쁨:
피그마 보고 쿠폰 화면 만들어줘.

좋음:
이 Figma frame을 ScreenSpec, Component Catalog, Component Mapping에 맞춰
CouponListScreen.tsx에만 반영해줘.
없는 컴포넌트나 API는 만들지 말고 TODO로 남겨.
```

```txt
나쁨:
백엔드 레포 보고 API 연결해줘.

좋음:
CouponController와 Confluence 문서를 보고 API Manifest만 갱신해줘.
confirmed/candidate/unknown을 구분해줘.
그 다음 confirmed API만 hook으로 구현해줘.
```

```txt
나쁨:
디자인시스템에 맞춰 예쁘게 해줘.

좋음:
Component Catalog에 정의된 Button, Card, AppText, EmptyState만 사용해.
임의 Pressable, Text, View 조합으로 새 버튼/카드 만들지 마.
```

---

## 가장 추천하는 운영 방식

화면마다 아래 체크리스트를 통과해야 다음 단계로 넘긴다.

```md
# Screen Implementation Checklist

## Planning
- [ ] ScreenSpec 있음
- [ ] Route 확정됨
- [ ] Entry point 확정됨
- [ ] Navigation action 확정됨

## Design
- [ ] Component Mapping 있음
- [ ] 사용 컴포넌트가 Component Catalog에 있음
- [ ] Missing Component가 TODO로 분리됨

## Data
- [ ] API Manifest 있음
- [ ] confirmed API와 candidate API 구분됨
- [ ] fixture 있음
- [ ] hook 있음

## UI
- [ ] fixture 기반 화면 구현됨
- [ ] loading 상태 있음
- [ ] empty 상태 있음
- [ ] error 상태 있음

## Integration
- [ ] hook 연결됨
- [ ] API field mapping 검증됨
- [ ] navigation 동작 확인됨

## QA
- [ ] ScreenSpec acceptance criteria 충족
- [ ] 최종 Figma와 주요 spacing/component 차이 확인
- [ ] 임의 컴포넌트 생성 없음
```

---

## 참고 링크

- Expo Router Introduction: https://docs.expo.dev/router/introduction/
- NativeWind Installation: https://www.nativewind.dev/docs/getting-started/installation
- TanStack Query React Native: https://tanstack.com/query/v5/docs/framework/react/react-native
- Figma MCP Server Guide: https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server
- Hey API OpenAPI TypeScript: https://heyapi.dev/docs/openapi/typescript/get-started
