# 확장 버전: 프론트 LLM 개발 워크플로우

## 0. 핵심 원칙

LLM에게 일을 시킬 때는 아래 우선순위를 유지하는 게 좋다.

```txt
앱 전체 규칙
→ 사용자 흐름 / 화면 목록 / 네비게이션
→ 디자인시스템 / API 계약 / 화면 계약
→ 화면별 매핑 문서
→ mock 기반 UI
→ 실제 API 연결
→ 상태 처리 / QA / 리팩터링
```

다르게 말하면:

```txt
전체에 영향 주는 문서가 먼저
화면 간 관계가 그다음
화면 하나의 계약이 그다음
디자인과 API 매핑이 그다음
코드는 마지막
```

---

# 1. 산출물 우선순위 체계

## P0. 전역 규칙 / 프로젝트 기준

이건 어떤 상황에서도 가장 먼저 잡는 게 좋다.  
피그마가 있든 없든, API가 있든 없든, 이게 없으면 LLM이 자기 마음대로 판단한다.

### 1. LLM 작업 규칙 문서

예:

```txt
AGENTS.md
CLAUDE.md
.cursor/rules/frontend.md
docs/frontend/llm-rules.md
```

내용:

```md
# Frontend LLM Rules

- 임의로 새 UI 컴포넌트를 만들지 않는다.
- 디자인시스템 컴포넌트를 우선 사용한다.
- API endpoint, request, response는 추측하지 않는다.
- 확정되지 않은 API는 candidate 또는 unknown으로 표시한다.
- 화면 파일에 fetch 로직을 직접 넣지 않는다.
- 화면 구현 전 ScreenSpec을 먼저 읽는다.
- 없는 정보는 Unknowns에 남긴다.
```

이 문서는 모든 작업의 상위 규칙이다.

---

### 2. 프로젝트 소스 맵

지금처럼 자료가 여러 곳에 흩어져 있으면 LLM이 뭘 봐야 하는지부터 헷갈린다.

```md
# Project Source Map

## Planning
- 기획 피그마: 링크
- 와이어프레임 캡처 위치: /docs/planning/wireframes
- 기획 설명 문서: 링크

## Design
- 디자인시스템 피그마: 링크
- 최종 화면 피그마: 링크
- 디자인 토큰: 링크 또는 파일

## Backend
- Confluence API 문서: 링크
- Backend repo: 링크
- API spec: 링크
- 인증 정책 문서: 링크

## Frontend
- Expo app repo
- UI component path
- API client path
- feature module path
```

LLM에게 매번 “어디를 참고해야 하는지” 알려주지 않아도 되게 만드는 문서다.

---

### 3. 용어집 / 도메인 Glossary

회사 앱에서는 용어가 중요하다.  
예를 들어 “회원”, “고객”, “사용자”, “계정”, “프로필”이 다르게 쓰일 수 있다.

```md
# Domain Glossary

| Term | Meaning | Notes |
|---|---|---|
| 사용자 | 앱에 로그인한 최종 사용자 | userId 기준 |
| 회원 | 서비스 가입 완료 사용자 | membership status 있음 |
| 쿠폰 | 사용자가 보유한 혜택 단위 | backend CouponDto와 연결 |
| 매장 | 오프라인 지점 | storeId 기준 |
```

이걸 안 만들면 LLM이 화면마다 다른 단어를 쓴다.

---

### 4. 폴더 구조 / 아키텍처 기준

초기에 구조를 고정해두면 이후 작업이 편하다.

```txt
src/
  app/
  components/
    ui/
  design-system/
  api/
  features/
  hooks/
  utils/
  constants/
```

문서로는 이렇게 둘 수 있다.

```md
# Frontend Architecture

## Routing
Expo Router 기반으로 src/app에서 관리한다.

## Feature Modules
도메인별 코드는 src/features/{featureName} 아래에 둔다.

## UI Components
공통 UI는 src/components/ui에 둔다.

## API
API client는 src/api에 둔다.

## Rule
화면 컴포넌트에서 fetch를 직접 호출하지 않는다.
```

---

## P1. 앱 전체 흐름 / 화면 구조

여기부터는 화면 기획과 관련된다.  
하지만 아직 피그마 최종본이 없어도 진행할 수 있다.

### 5. Feature Inventory

화면 목록보다 한 단계 위다.

```md
# Feature Inventory

| Feature | Description | Screens | Backend Needed | Priority |
|---|---|---|---|---|
| Auth | 로그인/로그아웃/토큰 관리 | Login, Signup | yes | P0 |
| Home | 메인 대시보드 | Home | yes | P0 |
| Coupon | 쿠폰 목록/상세 | CouponList, CouponDetail | yes | P1 |
| MyPage | 내 정보/설정 | MyPage, ProfileEdit | yes | P1 |
```

화면이 아니라 **기능 단위**로 먼저 자르는 문서다.

---

### 6. Screen Inventory

이건 화면 단위 목록이다.

```md
# Screen Inventory

| Screen ID | Screen Name | Feature | Route | Source | Status |
|---|---|---|---|---|---|
| AUTH-001 | 로그인 | Auth | /(auth)/login | 기획 p.3 | spec ready |
| HOME-001 | 홈 | Home | /(tabs)/home | 기획 p.7 | needs API |
| COUPON-001 | 쿠폰 목록 | Coupon | /(tabs)/coupons | 기획 p.12 | spec ready |
| COUPON-002 | 쿠폰 상세 | Coupon | /coupons/[id] | 기획 p.13 | needs design |
```

모든 화면 작업은 여기서 시작하는 게 좋다.

---

### 7. User Flow Map

화면 목록보다 중요한 게 사용자 흐름이다.

```md
# User Flow Map

## Login Flow
앱 실행
→ 로그인 여부 확인
→ 미로그인: 로그인 화면
→ 로그인 성공: 홈 화면
→ 로그인 실패: 에러 메시지

## Coupon Flow
홈
→ 보유 쿠폰 카드 클릭
→ 쿠폰 목록
→ 쿠폰 클릭
→ 쿠폰 상세
```

이게 있어야 LLM이 화면 간 이동을 임의로 만들지 않는다.

---

### 8. Navigation Map

User Flow를 Expo Router 구조로 바꾸기 전 단계다.

```md
# Navigation Map

## Auth Stack
- /(auth)/login
- /(auth)/signup

## Main Tabs
- /(tabs)/home
- /(tabs)/coupons
- /(tabs)/my

## Modal
- /modal/terms
- /modal/filter

## Stack
- /coupons/[id]
- /notices/[id]
- /settings/profile
```

이 문서가 있으면 “화면 먼저 만들고 라우팅 나중에 맞추기”를 피할 수 있다.

---

### 9. Route Tree / Expo Router 파일 구조

Navigation Map을 실제 파일 구조로 바꾼 문서다.

```txt
src/app/
  _layout.tsx
  index.tsx
  (auth)/
    _layout.tsx
    login.tsx
  (tabs)/
    _layout.tsx
    home.tsx
    coupons.tsx
    my.tsx
  coupons/
    [id].tsx
  notices/
    [id].tsx
```

LLM에게 이 단계에서는 이렇게 시키면 된다.

```md
Navigation Map을 기준으로 Expo Router 파일 구조만 생성해줘.
각 화면은 placeholder만 넣고 실제 UI는 구현하지 마.
```

---

### 10. Auth Guard / Route Guard 정책

앱에서 로그인 여부에 따라 접근 가능한 화면이 다르면 따로 빼야 한다.

```md
# Route Guard Policy

## Public Routes
- /(auth)/login
- /(auth)/signup
- /modal/terms

## Private Routes
- /(tabs)/home
- /(tabs)/coupons
- /(tabs)/my
- /coupons/[id]

## Rule
- 미로그인 사용자가 Private Route 접근 시 /(auth)/login으로 보낸다.
- 로그인 사용자가 /(auth)/login 접근 시 /(tabs)/home으로 보낸다.
```

이건 네비게이션 구현 전에 잡는 게 좋다.

---

## P2. 화면 계약 문서

여기부터가 화면별 작업이다.  
와이어프레임만 있어도 가능하고, 최종 피그마가 있으면 더 정확해진다.

### 11. ScreenSpec

화면 하나의 핵심 계약서다.

```md
# ScreenSpec: 쿠폰 목록

## Screen ID
COUPON-001

## Purpose
사용자가 보유 쿠폰을 확인하고 상태별로 구분해서 볼 수 있다.

## Route
/(tabs)/coupons

## Entry Points
- 하단 탭 > 쿠폰
- 홈 > 보유 쿠폰 카드

## UI Sections
1. Header
2. Coupon Status Tabs
3. Coupon List
4. Empty State
5. Error State

## User Actions
- 쿠폰 클릭
- 상태 탭 변경
- 새로고침
- 뒤로가기

## States
- loading
- success
- empty
- error
- refreshing

## Unknowns
- 만료 쿠폰 노출 여부
- 정렬 기준
- API pagination 방식
```

LLM에게는 코드 말고 이 문서를 먼저 만들게 하는 게 좋다.

---

### 12. State Matrix

화면 상태를 따로 빼면 품질이 좋아진다.

```md
# State Matrix: CouponList

| State | Condition | UI |
|---|---|---|
| loading | query.isLoading | SkeletonList |
| success | data.length > 0 | CouponList |
| empty | data.length === 0 | EmptyState |
| error | query.isError | ErrorState + Retry |
| refreshing | query.isRefetching | RefreshControl |
```

이게 없으면 LLM은 loading/error/empty 처리를 대충 한다.

---

### 13. Interaction Matrix

사용자 액션을 따로 정리한다.

```md
# Interaction Matrix: CouponList

| User Action | Trigger | Result |
|---|---|---|
| 쿠폰 클릭 | CouponCard press | /coupons/[id]로 이동 |
| 상태 탭 변경 | Tab press | status filter 변경 |
| 새로고침 | pull to refresh | refetch |
| 재시도 | ErrorState button | refetch |
```

이걸 만들면 네비게이션과 훅 연결이 명확해진다.

---

### 14. Acceptance Criteria

기획 요구사항을 검증 가능한 체크리스트로 바꾼다.

```md
# Acceptance Criteria: CouponList

- [ ] 사용 가능 쿠폰이 있으면 리스트로 보여준다.
- [ ] 쿠폰이 없으면 EmptyState를 보여준다.
- [ ] API 실패 시 ErrorState와 재시도 버튼을 보여준다.
- [ ] 쿠폰 클릭 시 쿠폰 상세 화면으로 이동한다.
- [ ] 디자인시스템의 Button, Card, AppText를 사용한다.
```

LLM에게 마지막 QA를 시킬 때 이 문서가 기준이 된다.

---

### 15. Unknowns / Decision Log

불확실한 것을 묻어두지 말고 별도 문서로 관리한다.

```md
# Unknowns & Decisions

| ID | Area | Question | Status | Decision |
|---|---|---|---|---|
| U-001 | Coupon | 만료 쿠폰 노출 여부 | open |  |
| U-002 | API | status enum 값 | resolved | AVAILABLE, USED, EXPIRED |
| U-003 | Design | 쿠폰 카드 이미지 비율 | open |  |
```

이 문서가 있으면 LLM이 모르는 걸 “그럴듯하게 채우는” 일이 줄어든다.

---

## P3. 디자인시스템 / 피그마 관련 문서

최종 피그마가 늦으면 이 블록은 나중에 온다.  
하지만 최종 피그마가 이미 있으면 P2와 거의 동시에 진행해도 된다.

### 16. Design Token Map

피그마 토큰과 Tailwind / NativeWind 토큰을 연결한다.

```md
# Design Token Map

| Design Token | Frontend Token | Usage |
|---|---|---|
| color.bg.default | bg-background | screen background |
| color.text.primary | text-foreground | default text |
| color.text.muted | text-muted-foreground | secondary text |
| spacing.16 | p-4 | default screen padding |
| radius.md | rounded-md | card radius |
```

이걸 안 만들면 LLM이 `p-5`, `mt-7`, `text-[#333333]` 같은 임의 스타일을 계속 만들어낸다.

---

### 17. Component Catalog

디자인시스템 컴포넌트 목록이다.

````md
# Component Catalog

## Button

### Import
```ts
import { Button } from '@/components/ui/Button';
```

### Props
```ts
type ButtonProps = {
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  size: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
};
```

### Do
```tsx
<Button variant="primary" size="lg">
  확인
</Button>
```

### Do Not
```tsx
<Pressable className="bg-blue-500 px-4 py-3 rounded-lg">
  <Text>확인</Text>
</Pressable>
```
````

LLM에게 가장 자주 먹히는 통제 문서다.

---

### 18. Component Gap Register

디자인에는 있는데 코드에는 없는 컴포넌트를 따로 관리한다.

```md
# Component Gap Register

| Need | Figma Component | Existing Code | Decision |
|---|---|---|---|
| Segmented Tabs | DS/Tabs/Segmented | 없음 | 새로 구현 필요 |
| Coupon Card | App/CouponCard | 없음 | feature component로 구현 |
| Bottom Sheet | DS/BottomSheet | 없음 | 라이브러리 검토 필요 |
```

중요한 점은, LLM이 화면 구현 중 즉흥적으로 공통 컴포넌트를 만들지 못하게 하는 것이다.

---

### 19. Figma Frame Index

최종 피그마가 여러 화면이면 화면 ID와 피그마 프레임을 매핑해야 한다.

```md
# Figma Frame Index

| Screen ID | Screen Name | Figma Frame | Status |
|---|---|---|---|
| AUTH-001 | 로그인 | Login / Default | final |
| HOME-001 | 홈 | Home / Default | final |
| COUPON-001 | 쿠폰 목록 | Coupon / List | final |
| COUPON-002 | 쿠폰 상세 | Coupon / Detail | draft |
```

이게 없으면 LLM이 잘못된 프레임을 참고할 수 있다.

---

### 20. Figma Component Mapping

최종 피그마를 코드 컴포넌트에 매핑한다.

```md
# Figma Component Mapping: CouponList

| Figma Layer | Frontend Component | Props / Notes |
|---|---|---|
| Header / Title | AppHeader | title="쿠폰" |
| Tab / Available | SegmentedTabs | value="available" |
| Coupon Card | CouponCard | coupon prop |
| Empty State | EmptyState | type="coupon" |
| CTA Button | Button | variant="primary" |
```

이 단계가 있으면 LLM이 “피그마를 보고 알아서 구현”하지 않고, “피그마를 기존 코드 구조에 매핑”하게 된다.

---

### 21. Visual QA Checklist

피그마와 실제 화면 비교용이다.

```md
# Visual QA Checklist: CouponList

- [ ] 화면 padding이 디자인 토큰과 일치한다.
- [ ] Header 높이가 디자인과 일치한다.
- [ ] CouponCard 간격이 일치한다.
- [ ] EmptyState 문구가 기획과 일치한다.
- [ ] Button variant가 디자인시스템과 일치한다.
- [ ] 임의 색상값이 없다.
- [ ] 임의 spacing 값이 없다.
```

최종 피그마가 있을 때 특히 중요하다.

---

### 22. Responsive / Device Policy

모바일 앱이라도 기기 크기 차이가 있다.

```md
# Device Layout Policy

## Target Devices
- Small phone
- Standard phone
- Large phone

## Rules
- 화면 좌우 padding은 기본 p-4를 사용한다.
- 리스트 하단에는 safe area padding을 고려한다.
- 고정 높이 사용을 피한다.
- 텍스트는 줄바꿈 가능성을 고려한다.
```

LLM이 고정 height를 남발하는 걸 줄일 수 있다.

---

## P4. 백엔드 / API 관련 문서

API가 빨리 확정되면 이 블록은 매우 앞당겨도 된다.  
오히려 화면보다 먼저 만들어두면 프론트 개발 속도가 빨라진다.

### 23. API Manifest

API 전체 목록이다.

````md
# API Manifest

## getCoupons

### Status
confirmed

### Method
GET

### Path
/api/v1/coupons

### Query
```ts
type GetCouponsQuery = {
  status?: 'AVAILABLE' | 'USED' | 'EXPIRED';
  page?: number;
  size?: number;
};
```

### Response
```ts
type CouponDto = {
  id: string;
  title: string;
  description: string;
  status: 'AVAILABLE' | 'USED' | 'EXPIRED';
  expiresAt: string;
};
```

### Used By
- COUPON-001
- COUPON-002
````

중요한 건 `confirmed / candidate / unknown`을 구분하는 것이다.

---

### 24. Domain Model Map

백엔드 DTO와 프론트 도메인 모델을 구분한다.

````md
# Domain Model Map

## Backend DTO
```ts
type CouponDto = {
  id: string;
  title: string;
  desc: string;
  expireDate: string;
};
```

## Frontend Model
```ts
type Coupon = {
  id: string;
  title: string;
  description: string;
  expiresAt: Date;
};
```

## Mapping
```ts
function mapCouponDto(dto: CouponDto): Coupon {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.desc,
    expiresAt: new Date(dto.expireDate),
  };
}
```
````

LLM에게 이걸 만들게 하면 화면에서 DTO 필드를 직접 쓰는 일이 줄어든다.

---

### 25. API-to-Screen Mapping

어떤 화면이 어떤 API를 쓰는지 정리한다.

```md
# API to Screen Mapping

| Screen ID | API | Purpose | Required |
|---|---|---|---|
| HOME-001 | getHomeSummary | 홈 요약 정보 | yes |
| COUPON-001 | getCoupons | 쿠폰 목록 | yes |
| COUPON-002 | getCouponDetail | 쿠폰 상세 | yes |
| MY-001 | getMyProfile | 내 정보 | yes |
```

화면 구현 중 API를 추측하지 않게 해준다.

---

### 26. Auth / Session Policy

인증은 전역 정책으로 분리해야 한다.

```md
# Auth Session Policy

## Token
- accessToken 사용
- refreshToken 사용 여부: unknown

## Storage
- secure storage 사용

## Expired Token
- 401 발생 시 refresh 시도
- refresh 실패 시 logout

## Screens
- 로그인 필요 화면 접근 시 login으로 redirect
```

이게 없으면 LLM이 화면마다 다른 인증 처리를 넣는다.

---

### 27. API Error Policy

API 에러를 화면마다 다르게 처리하지 않도록 한다.

```md
# API Error Policy

| Error Type | Condition | UI |
|---|---|---|
| Network Error | 인터넷 연결 실패 | ErrorState + Retry |
| Unauthorized | 401 | 로그인 화면 이동 |
| Forbidden | 403 | 권한 없음 화면 |
| Not Found | 404 | NotFoundState |
| Server Error | 500 | ErrorState |
```

이 문서는 State Matrix와 연결된다.

---

### 28. Mock / Fixture Contract

API가 늦거나 화면을 먼저 만들어야 할 때 중요하다.

```md
# Fixture Contract: Coupon

## File
src/features/coupons/fixtures/coupon.fixtures.ts

## Rule
- fixture는 실제 API response와 최대한 동일한 형태를 사용한다.
- confirmed field만 사용한다.
- unknown field는 주석으로 남긴다.
```

fixture를 대충 만들면 나중에 API 연결할 때 깨진다.

---

## P5. 구현 준비 문서

이제부터 코드에 가까워진다.  
그래도 바로 화면을 만드는 게 아니라, 구현 단위를 나눈다.

### 29. Feature Implementation Plan

기능 하나를 어떤 순서로 구현할지 정리한다.

```md
# Feature Implementation Plan: Coupon

## Scope
- 쿠폰 목록
- 쿠폰 상세
- 쿠폰 상태 필터

## Files
- src/features/coupons/screens/CouponListScreen.tsx
- src/features/coupons/screens/CouponDetailScreen.tsx
- src/features/coupons/components/CouponCard.tsx
- src/features/coupons/hooks/useCoupons.ts
- src/api/coupon.api.ts

## Order
1. route placeholder
2. fixture
3. presentational components
4. screen UI
5. API client
6. query hook
7. integration
8. state QA
```

화면 하나가 아니라 feature 단위 작업계획이다.

---

### 30. Route Skeleton

네비게이션 뼈대만 만든다.

```tsx
export default function CouponRoute() {
  return <CouponListScreen />;
}
```

또는 초반에는:

```tsx
export default function CouponRoute() {
  return <PlaceholderScreen screenId="COUPON-001" />;
}
```

이 단계에서는 UI 구현 금지다.

---

### 31. Screen Skeleton

화면 섹션만 잡는다.

```tsx
export function CouponListScreen() {
  return (
    <Screen>
      <Header />
      <StatusTabs />
      <CouponList />
    </Screen>
  );
}
```

아직 스타일과 API는 최소화한다.

---

### 32. Presentational Components

API 없이 props만 받는 컴포넌트다.

```tsx
type CouponCardProps = {
  title: string;
  description: string;
  expiresAt: string;
  disabled?: boolean;
  onPress?: () => void;
};

export function CouponCard(props: CouponCardProps) {
  // 디자인시스템 컴포넌트만 사용
}
```

LLM에게는 이렇게 시키면 좋다.

```md
CouponCard를 presentational component로만 구현해줘.
API, navigation, query hook은 사용하지 마.
```

---

### 33. Fixture 기반 화면

mock data로 UI를 완성한다.

```tsx
const coupons = couponFixtures;

export function CouponListScreen() {
  return <CouponList coupons={coupons} />;
}
```

이 단계에서 피그마 반영과 레이아웃을 잡는다.

---

### 34. API Client

순수 API 호출 함수다.

```ts
export async function getCoupons(query: GetCouponsQuery): Promise<CouponDto[]> {
  return apiClient.get('/api/v1/coupons', { params: query });
}
```

화면에서는 직접 사용하지 않는다.

---

### 35. Query Hooks

서버 상태를 hook으로 감싼다.

```ts
export function useCoupons(status: CouponStatus) {
  return useQuery({
    queryKey: ['coupons', status],
    queryFn: () => getCoupons({ status }),
    select: mapCouponListDto,
  });
}
```

화면은 이 hook만 사용한다.

---

### 36. Mutation Hooks

등록, 수정, 삭제, 신청 같은 동작이 있으면 별도로 분리한다.

```ts
export function useUseCoupon() {
  return useMutation({
    mutationFn: useCouponApi,
  });
}
```

조회 hook과 mutation hook은 분리하는 게 좋다.

---

### 37. Screen Integration

fixture를 hook으로 교체한다.

```md
CouponListScreen의 fixture를 useCoupons hook으로 교체해줘.

규칙:
- UI 레이아웃은 바꾸지 마.
- API client는 수정하지 마.
- loading, empty, error, success 상태만 연결해.
```

이게 핵심이다.  
**UI 구현과 API 연결을 같은 프롬프트에 넣지 않는다.**

---

## P6. 품질 검증 / QA 문서

LLM에게 구현을 맡겼으면 반드시 검증용 작업도 따로 시켜야 한다.

### 38. Screen QA Checklist

```md
# Screen QA: CouponList

## Spec
- [ ] ScreenSpec의 UI Sections가 모두 구현됨
- [ ] User Actions가 모두 연결됨
- [ ] State Matrix가 모두 반영됨

## Design
- [ ] Component Mapping과 일치함
- [ ] 임의 컴포넌트 없음
- [ ] 임의 색상 없음

## API
- [ ] API Manifest의 confirmed API만 사용함
- [ ] candidate API를 구현하지 않음
- [ ] DTO mapping이 있음

## Navigation
- [ ] route가 Navigation Map과 일치함
- [ ] 잘못된 hardcoded path 없음
```

---

### 39. Design Diff Review

피그마와 코드 차이를 리뷰하는 작업이다.

```md
다음 파일을 보고 Figma Component Mapping과 다른 부분만 찾아줘.
수정하지 말고 차이점 목록만 작성해줘.

- CouponListScreen.tsx
- CouponCard.tsx
- component-mapping.md
```

LLM에게 바로 수정시키기보다, 먼저 diff를 뽑게 하는 게 좋다.

---

### 40. API Contract Review

```md
API Manifest와 실제 coupon.api.ts, useCoupons.ts를 비교해서
불일치하는 field, endpoint, status handling을 찾아줘.
수정하지 말고 리포트만 작성해줘.
```

---

### 41. State Coverage Review

```md
State Matrix 기준으로 CouponListScreen에서 누락된 상태를 찾아줘.
loading, success, empty, error, refreshing을 모두 확인해줘.
```

---

### 42. Navigation Review

```md
Navigation Map과 src/app route tree를 비교해서
누락된 route, 잘못된 route, 잘못된 redirect를 찾아줘.
```

---

### 43. Component Usage Review

```md
Component Catalog에 없는 UI 컴포넌트를 사용한 곳을 찾아줘.
Pressable, Text, View로 직접 만든 버튼/카드/탭이 있는지 확인해줘.
```

이 리뷰는 디자인시스템 정착에 특히 중요하다.

---

### 44. PR Review Prompt

나중에 화면 하나 끝날 때마다 LLM에게 리뷰시키는 템플릿이다.

```md
다음 변경사항을 리뷰해줘.

기준 문서:
- ScreenSpec
- Component Mapping
- API Manifest
- State Matrix
- Component Catalog

리뷰 항목:
1. 기획 누락
2. 디자인시스템 위반
3. API 추측
4. 상태 처리 누락
5. 네비게이션 오류
6. 불필요한 컴포넌트 생성
7. 리팩터링 필요 지점

수정하지 말고 리뷰 코멘트만 작성해줘.
```

---

# 확장된 전체 목록

기존 15단계를 더 세분화하면 이렇게 볼 수 있다.

```txt
P0. 전역 규칙
01. LLM 작업 규칙 문서
02. 프로젝트 소스 맵
03. 도메인 용어집
04. 프론트 아키텍처 기준

P1. 앱 전체 구조
05. Feature Inventory
06. Screen Inventory
07. User Flow Map
08. Navigation Map
09. Route Tree
10. Auth / Route Guard Policy

P2. 화면 계약
11. ScreenSpec
12. State Matrix
13. Interaction Matrix
14. Acceptance Criteria
15. Unknowns / Decision Log

P3. 디자인 / 피그마
16. Design Token Map
17. Component Catalog
18. Component Gap Register
19. Figma Frame Index
20. Figma Component Mapping
21. Visual QA Checklist
22. Responsive / Device Policy

P4. 백엔드 / API
23. API Manifest
24. Domain Model Map
25. API-to-Screen Mapping
26. Auth / Session Policy
27. API Error Policy
28. Mock / Fixture Contract

P5. 구현
29. Feature Implementation Plan
30. Route Skeleton
31. Screen Skeleton
32. Presentational Components
33. Fixture 기반 화면
34. API Client
35. Query Hooks
36. Mutation Hooks
37. Screen Integration

P6. 검증
38. Screen QA Checklist
39. Design Diff Review
40. API Contract Review
41. State Coverage Review
42. Navigation Review
43. Component Usage Review
44. PR Review Prompt
```

이렇게 보면 15개가 아니라 **44개 산출물/작업 단위**로 쪼갤 수 있다.

---

# 하지만 실제 순서는 고정이 아니다

중요한 건 이 44개를 항상 1번부터 44번까지 하는 게 아니라는 점이다.

실제 순서는 자료 준비 상태에 따라 달라진다.

---

# 상황별 추천 진행 순서

## 케이스 A. 와이어프레임만 있고 최종 피그마가 늦는 경우

이건 앞에서 이야기한 기본 상황이다.

```txt
01 LLM 작업 규칙
02 프로젝트 소스 맵
03 도메인 용어집
04 아키텍처 기준
05 Feature Inventory
06 Screen Inventory
07 User Flow Map
08 Navigation Map
09 Route Tree
10 Route Guard Policy
11 ScreenSpec
12 State Matrix
13 Interaction Matrix
14 Acceptance Criteria
15 Unknowns
16 Component Catalog
18 Component Gap Register
23 API Manifest 후보
28 Fixture Contract
30 Route Skeleton
31 Screen Skeleton
32 Presentational Components
33 Fixture 기반 화면
20 Figma Component Mapping
37 API 연결
38 QA
```

이 경우 핵심은:

```txt
와이어프레임 → ScreenSpec → mock UI
```

최종 피그마는 나중에 들어와서 UI 보정에 쓰면 된다.

---

## 케이스 B. API가 화면보다 먼저 확정된 경우

백엔드가 빠르게 확정된다면 API 쪽을 앞당기는 게 좋다.

```txt
01 LLM 작업 규칙
02 프로젝트 소스 맵
03 도메인 용어집
04 아키텍처 기준
23 API Manifest
24 Domain Model Map
25 API-to-Screen Mapping 초안
26 Auth / Session Policy
27 API Error Policy
28 Fixture Contract
34 API Client
35 Query Hooks
36 Mutation Hooks
05 Feature Inventory
06 Screen Inventory
07 User Flow Map
08 Navigation Map
11 ScreenSpec
33 Fixture 기반 화면
37 Screen Integration
38 QA
```

이 경우 핵심은:

```txt
API Manifest → Domain Model → Hooks
```

단, 화면이 없으면 hooks를 만들더라도 실제 화면 연결은 늦춰야 한다.

좋은 작업 단위는:

```md
API Manifest 기준으로 api client와 query hook만 작성해줘.
화면 코드는 작성하지 마.
```

---

## 케이스 C. 화면 기획과 최종 피그마가 동시에 나온 경우

가장 좋은 상황이다.  
ScreenSpec과 Figma Mapping을 거의 동시에 만들 수 있다.

```txt
01 LLM 작업 규칙
02 프로젝트 소스 맵
03 도메인 용어집
04 아키텍처 기준
05 Feature Inventory
06 Screen Inventory
07 User Flow Map
08 Navigation Map
09 Route Tree
11 ScreenSpec
16 Design Token Map
17 Component Catalog
18 Component Gap Register
19 Figma Frame Index
20 Figma Component Mapping
12 State Matrix
13 Interaction Matrix
14 Acceptance Criteria
23 API Manifest
25 API-to-Screen Mapping
28 Fixture Contract
30 Route Skeleton
32 Presentational Components
33 Fixture 기반 화면
34 API Client
35 Query Hooks
37 Screen Integration
38 QA
```

이 경우 핵심은:

```txt
ScreenSpec + Figma Component Mapping을 같이 만든다.
```

즉, LLM에게 바로 화면 구현을 시키지 말고:

```md
기획 화면과 최종 피그마를 비교해서
ScreenSpec, Component Mapping, Unknowns를 먼저 작성해줘.
코드는 작성하지 마.
```

---

## 케이스 D. 개발 일정이 늦어져서 기획, 피그마, API가 모두 나와 있는 경우

이 경우에도 바로 “앱 전체 구현”을 시키면 위험하다.  
대신 가장 빠른 검증 루트로 간다.

```txt
01 LLM 작업 규칙
02 프로젝트 소스 맵
03 도메인 용어집
04 아키텍처 기준
05 Feature Inventory
06 Screen Inventory
07 User Flow Map
08 Navigation Map
09 Route Tree
16 Design Token Map
17 Component Catalog
19 Figma Frame Index
23 API Manifest
24 Domain Model Map
25 API-to-Screen Mapping
11 ScreenSpec
12 State Matrix
13 Interaction Matrix
14 Acceptance Criteria
20 Figma Component Mapping
28 Fixture Contract
30 Route Skeleton
32 Presentational Components
33 Fixture 기반 화면
34 API Client
35 Query Hooks
37 Screen Integration
38 QA
39 Design Diff Review
40 API Contract Review
41 State Coverage Review
```

이 경우 핵심은:

```txt
자료가 모두 있어도 구현은 화면 단위 vertical slice로 한다.
```

즉:

```txt
쿠폰 목록 한 화면 완성
→ 쿠폰 상세
→ 홈
→ 마이페이지
```

이런 식으로 가야 한다.

---

## 케이스 E. 디자인시스템은 준비됐고, 기획이 아직 거친 경우

디자인시스템을 프론트에 먼저 정착시키는 게 좋다.

```txt
01 LLM 작업 규칙
04 아키텍처 기준
16 Design Token Map
17 Component Catalog
18 Component Gap Register
22 Responsive / Device Policy
05 Feature Inventory 초안
06 Screen Inventory 초안
11 ScreenSpec 초안
28 Fixture Contract
30 Route Skeleton
32 Presentational Components
33 Fixture 기반 화면
```

이 경우 핵심은:

```txt
디자인시스템 컴포넌트부터 안정화
```

화면은 placeholder나 rough layout 수준으로 두고, 컴포넌트 기반을 먼저 만들면 된다.

---

## 케이스 F. 기획은 확정됐지만 디자인시스템이 아직 불안정한 경우

이 경우 화면을 너무 예쁘게 만들려고 하면 나중에 다 갈아엎는다.

```txt
01 LLM 작업 규칙
02 프로젝트 소스 맵
03 도메인 용어집
05 Feature Inventory
06 Screen Inventory
07 User Flow Map
08 Navigation Map
11 ScreenSpec
12 State Matrix
13 Interaction Matrix
14 Acceptance Criteria
23 API Manifest 후보
28 Fixture Contract
30 Route Skeleton
31 Screen Skeleton
33 Fixture 기반 화면 rough version
18 Component Gap Register
17 Component Catalog 업데이트 대기
20 Figma Component Mapping 이후 보정
```

이 경우 핵심은:

```txt
레이아웃 골격과 상태 처리만 먼저 만든다.
디테일한 스타일은 늦춘다.
```

LLM 프롬프트는 이렇게 해야 한다.

```md
디자인 디테일을 구현하지 말고 화면 구조와 상태 처리만 구현해줘.
임의 색상, 임의 spacing, 임의 컴포넌트 생성 금지.
```

---

## 케이스 G. 최종 피그마는 있는데 API가 불확실한 경우

이 경우는 UI를 먼저 끝낼 수 있다.

```txt
01 LLM 작업 규칙
16 Design Token Map
17 Component Catalog
19 Figma Frame Index
20 Figma Component Mapping
05 Feature Inventory
06 Screen Inventory
07 User Flow Map
08 Navigation Map
11 ScreenSpec
12 State Matrix
13 Interaction Matrix
28 Fixture Contract
30 Route Skeleton
32 Presentational Components
33 Fixture 기반 화면
23 API Manifest candidate
25 API-to-Screen Mapping candidate
34 API Client confirmed만
35 Query Hooks confirmed만
37 Screen Integration 나중
```

이 경우 핵심은:

```txt
API는 candidate로 두고, fixture 기반 UI를 먼저 완성한다.
```

화면에는 실제 API를 붙이지 말고, fixture와 hook interface만 맞춰두는 게 좋다.

---

## 케이스 H. API는 확정됐는데 최종 피그마가 없는 경우

이 경우는 데이터 계층을 먼저 만들고, 화면은 구조만 잡는다.

```txt
01 LLM 작업 규칙
23 API Manifest
24 Domain Model Map
26 Auth / Session Policy
27 API Error Policy
34 API Client
35 Query Hooks
36 Mutation Hooks
05 Feature Inventory
06 Screen Inventory
07 User Flow Map
08 Navigation Map
11 ScreenSpec
12 State Matrix
28 Fixture Contract
31 Screen Skeleton
37 Integration 준비
20 Figma Component Mapping 나중
33 Fixture 기반 UI 나중
```

이 경우 핵심은:

```txt
API와 hook은 만들되, 최종 UI는 피그마 이후에 만든다.
```

---

## 케이스 I. 화면은 많은데 네비게이션이 불명확한 경우

절대 개별 화면부터 구현하면 안 된다.

```txt
01 LLM 작업 규칙
05 Feature Inventory
06 Screen Inventory
07 User Flow Map
08 Navigation Map
09 Route Tree
10 Route Guard Policy
30 Route Skeleton
11 ScreenSpec
12 State Matrix
13 Interaction Matrix
33 Fixture 기반 화면
```

이 경우 핵심은:

```txt
화면 구현보다 route tree가 우선
```

LLM에게는 이렇게 시키면 된다.

```md
모든 와이어프레임을 보고 화면 구현하지 말고
Screen Inventory와 Navigation Map만 만들어줘.
화면 간 이동 관계가 불확실한 부분은 Unknowns에 적어줘.
```

---

## 케이스 J. 컴포넌트 갭이 많은 경우

디자인시스템에는 있는데 프론트 컴포넌트가 부족한 상황이다.

```txt
01 LLM 작업 규칙
16 Design Token Map
17 Component Catalog
18 Component Gap Register
19 Figma Frame Index
20 Figma Component Mapping
22 Responsive / Device Policy
32 Presentational Components
33 Fixture 기반 화면
38 QA
43 Component Usage Review
```

이 경우 핵심은:

```txt
화면 구현 전에 공통 컴포넌트 부족분을 분류한다.
```

단, 모든 컴포넌트를 한 번에 만들려고 하면 위험하다.  
먼저 화면에서 반복적으로 쓰이는 것부터 만든다.

우선순위 예:

```txt
1. Button
2. Text
3. Input
4. Card
5. Header
6. EmptyState
7. ErrorState
8. Tabs
9. BottomSheet
10. ListItem
```

---

# 문서 간 우선순위 표

아래 표가 가장 실무적으로 중요하다.

| 우선순위 | 문서 | 이유 | 없으면 생기는 문제 |
|---|---|---|---|
| 1 | LLM 작업 규칙 | 모든 LLM 작업의 제약 조건 | 임의 구현, API 날조, 컴포넌트 남발 |
| 2 | 프로젝트 소스 맵 | 참고 자료 위치 고정 | 엉뚱한 문서/피그마/API 참고 |
| 3 | 도메인 용어집 | 용어 통일 | 화면마다 다른 용어 사용 |
| 4 | Feature Inventory | 앱 기능 범위 정의 | 화면 단위로만 쪼개져 구조가 흐려짐 |
| 5 | Screen Inventory | 화면 전체 목록 정의 | 누락 화면 발생 |
| 6 | User Flow Map | 사용자 흐름 정의 | 잘못된 진입/이탈 경로 |
| 7 | Navigation Map | 앱 이동 구조 정의 | route 구조 붕괴 |
| 8 | Route Tree | Expo Router 파일 구조 정의 | 화면 파일 위치 혼란 |
| 9 | Component Catalog | 사용 가능한 UI 컴포넌트 정의 | LLM이 임의 컴포넌트 생성 |
| 10 | Design Token Map | 스타일 토큰 정의 | 임의 색상/간격 남발 |
| 11 | API Manifest | API 계약 정의 | endpoint/field 추측 |
| 12 | Domain Model Map | DTO와 프론트 모델 분리 | 화면에서 백엔드 필드에 직접 의존 |
| 13 | ScreenSpec | 화면 요구사항 정의 | 기획 누락/과해석 |
| 14 | State Matrix | loading/error/empty 정의 | 상태 처리 누락 |
| 15 | Interaction Matrix | 사용자 액션 정의 | 클릭/이동/필터 누락 |
| 16 | Figma Frame Index | 화면과 피그마 프레임 연결 | 잘못된 프레임 참고 |
| 17 | Figma Component Mapping | 피그마를 코드 컴포넌트로 매핑 | 피그마를 임의 구현 |
| 18 | API-to-Screen Mapping | 화면과 API 연결 | 불필요한 API 호출 |
| 19 | Fixture Contract | mock data 기준 정의 | mock과 실제 API 괴리 |
| 20 | Acceptance Criteria | 완료 기준 정의 | 구현 완료 판단 불가 |
| 21 | QA Checklist | 검증 기준 정의 | 리뷰 기준 부재 |
| 22 | Decision Log | 미확정/확정 이력 관리 | 같은 질문 반복, 추측 증가 |

---

# 상위 문서와 하위 문서 관계

이렇게 보면 된다.

```txt
LLM 작업 규칙
└─ 모든 작업에 영향

프로젝트 소스 맵
└─ ScreenSpec / API Manifest / Figma Mapping의 출처 관리

Feature Inventory
└─ Screen Inventory
   └─ User Flow Map
      └─ Navigation Map
         └─ Route Tree
            └─ Route Skeleton

Component Catalog
└─ Figma Component Mapping
   └─ Presentational Components
      └─ Screen UI

API Manifest
└─ Domain Model Map
   └─ API Client
      └─ Query Hooks
         └─ Screen Integration

ScreenSpec
├─ State Matrix
├─ Interaction Matrix
├─ Acceptance Criteria
├─ Figma Component Mapping
├─ API-to-Screen Mapping
└─ Screen QA Checklist
```

즉, 비슷해 보여도 우선순위가 다르다.

예를 들어:

```txt
Figma Component Mapping보다 Component Catalog가 상위
API-to-Screen Mapping보다 API Manifest가 상위
Route Skeleton보다 Navigation Map이 상위
Screen UI보다 ScreenSpec이 상위
Query Hook보다 API Manifest가 상위
```

---

# “준비된 자료”별로 앞당길 수 있는 것

## 와이어프레임이 준비됨

바로 가능한 것:

```txt
Screen Inventory
User Flow Map
Navigation Map
ScreenSpec
State Matrix
Interaction Matrix
Acceptance Criteria
Fixture Contract
Route Skeleton
Screen Skeleton
```

아직 조심해야 하는 것:

```txt
최종 스타일 구현
정확한 spacing 구현
컴포넌트 세부 variant 확정
```

---

## 최종 피그마가 준비됨

바로 가능한 것:

```txt
Figma Frame Index
Design Token Map
Component Catalog 검증
Figma Component Mapping
Visual QA Checklist
Presentational Components
Fixture 기반 화면
```

아직 조심해야 하는 것:

```txt
API field 추측
기획 의도 과해석
화면 이동 임의 판단
```

---

## API가 준비됨

바로 가능한 것:

```txt
API Manifest
Domain Model Map
API Error Policy
Auth Session Policy
API Client
Query Hooks
Mutation Hooks
Fixture Contract
API-to-Screen Mapping
```

아직 조심해야 하는 것:

```txt
화면 UI 임의 구현
사용자 흐름 임의 결정
피그마 없는 스타일 확정
```

---

## 디자인시스템이 준비됨

바로 가능한 것:

```txt
Design Token Map
Component Catalog
Component Gap Register
Responsive Policy
공통 UI 컴포넌트 구현
Component Usage Review
```

아직 조심해야 하는 것:

```txt
화면별 구체 UI 확정
최종 피그마 없는 레이아웃 디테일
```

---

# 우선순위 판단 공식

작업을 시킬 때 이 기준으로 판단하면 된다.

```txt
1. 이 작업이 앱 전체에 영향을 주는가?
   → 그렇다면 먼저 한다.

2. 이 작업이 여러 화면에 영향을 주는가?
   → 개별 화면보다 먼저 한다.

3. 이 작업이 화면 구현의 기준이 되는가?
   → 코드보다 먼저 한다.

4. 이 작업이 확정 자료에 기반하는가?
   → 앞당겨도 된다.

5. 이 작업이 추측을 포함하는가?
   → candidate / unknown 문서로만 남기고 구현하지 않는다.

6. 이 작업이 나중에 쉽게 바뀔 수 있는가?
   → skeleton 또는 fixture 수준으로만 한다.
```

---

# LLM에게 줄 작업 단위도 더 세분화하기

기존에는:

```txt
화면 만들어줘
```

라고 하면 위험하다.

확장 버전에서는 이렇게 나눈다.

```txt
1. 화면 목록만 뽑아줘
2. 사용자 흐름만 정리해줘
3. 네비게이션 맵만 만들어줘
4. route tree만 제안해줘
5. route skeleton만 생성해줘
6. ScreenSpec만 작성해줘
7. State Matrix만 작성해줘
8. Interaction Matrix만 작성해줘
9. Acceptance Criteria만 작성해줘
10. Component Mapping만 작성해줘
11. API Manifest만 작성해줘
12. API-to-Screen Mapping만 작성해줘
13. fixture만 작성해줘
14. presentational component만 작성해줘
15. fixture 기반 화면만 구현해줘
16. api client만 작성해줘
17. query hook만 작성해줘
18. 화면에 hook만 연결해줘
19. 상태 처리만 보강해줘
20. QA 리뷰만 해줘
```

즉, LLM에게는 항상:

```txt
하나의 목적
제한된 파일
명확한 금지사항
기준 문서
출력 형식
```

을 줘야 한다.

---

# 추천하는 최종 운영 방식

나는 이걸 **3층 구조**로 운영하는 게 제일 좋아 보인다.

## 1층: 앱 전체 계약

```txt
LLM Rules
Project Source Map
Feature Inventory
Screen Inventory
User Flow Map
Navigation Map
Route Tree
Component Catalog
API Manifest
```

이건 앱 전체의 기준이다.

---

## 2층: 화면별 계약

```txt
ScreenSpec
State Matrix
Interaction Matrix
Acceptance Criteria
Figma Component Mapping
API-to-Screen Mapping
Fixture Contract
```

이건 화면 하나의 기준이다.

---

## 3층: 구현과 검증

```txt
Route Skeleton
Screen Skeleton
Presentational Components
Fixture UI
API Client
Query Hooks
Screen Integration
QA Reviews
```

이건 실제 코드 작업이다.

---

# 실제로는 이렇게 진행하면 좋음

자료 준비 상황과 관계없이, 가장 안정적인 기본 흐름은 이렇다.

```txt
1. 앱 전체 계약을 먼저 만든다.
2. 준비된 자료별로 병렬 문서를 만든다.
   - 와이어프레임 있음 → ScreenSpec
   - 피그마 있음 → Component Mapping
   - API 있음 → API Manifest
   - 디자인시스템 있음 → Component Catalog
3. 화면별로 필요한 계약 문서가 모이면 구현한다.
4. 구현은 fixture UI와 API 연결을 분리한다.
5. 마지막에 QA 문서 기준으로 검증한다.
```

핵심은 이거다.

```txt
자료가 늦게 나오면 skeleton / spec 중심으로 간다.
자료가 빨리 나오면 mapping / contract를 앞당긴다.
자료가 모두 나와도 구현은 화면 단위로 쪼갠다.
```

---

# 한 줄 요약

기존 15단계는 “기본 선형 순서”였고,  
확장 버전은 이렇게 보는 게 맞다.

```txt
전역 규칙
→ 앱 구조 계약
→ 화면 계약
→ 디자인 계약
→ API 계약
→ 화면별 매핑
→ fixture UI
→ API hook
→ 통합
→ QA
```

그리고 상황별로는:

```txt
와이어프레임 먼저 있음 → ScreenSpec 우선
피그마 먼저 있음 → Component Mapping 우선
API 먼저 있음 → API Manifest / Hook 우선
모두 있음 → 문서 계약 먼저 만들고 화면별 vertical slice 구현
디자인시스템 불안정 → skeleton 중심
네비게이션 불명확 → Navigation Map 최우선
```

이렇게 운영하면 “피그마가 늦는 상황”뿐 아니라,  
“API가 먼저 확정된 상황”, “기획과 피그마가 동시에 나온 상황”, “자료가 모두 나온 뒤 개발이 시작된 상황”까지 대응할 수 있다.
