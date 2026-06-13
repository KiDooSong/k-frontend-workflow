---
title: Source Map (예정 구조)
status: draft
kind: source-map
---

# Source Map — 예정 구조 (이 fixture 엔 코드 없음)

> **이 트리에는 `src/` 가 없다.** 아래는 나중에 implement-screen 세션이 화면을 구현할 때
> 코드가 **놓일 자리**를 미리 적어 둔 청사진이다. 지금은 어떤 파일도 존재하지 않는다.
> 이 문서는 prose 문서이므로 `artifact_type` 을 갖지 않는다.

## 예정 디렉터리 (구현 시)

```txt
src/
  app/                              # Expo Router 라우트 → 화면 연결
    (auth)/login.tsx                # AUTH-001  → /(auth)/login
    (tabs)/home.tsx                 # HOME-001  → /(tabs)/home
    (tabs)/coupons.tsx              # COUPON-001 → /(tabs)/coupons
    (tabs)/my.tsx                   # PROFILE-001 → /(tabs)/my
    coupons/[id].tsx                # COUPON-002 → /coupons/[id]
    notices.tsx                     # NOTICE-001 → /notices
  features/
    auth/      (hooks/, fixtures/, screens/, queryKeys.ts)
    home/      (hooks/, fixtures/, screens/, queryKeys.ts)
    coupons/   (hooks/, fixtures/, components/, screens/, queryKeys.ts)
    profile/   (hooks/, fixtures/, screens/, queryKeys.ts)
    notices/   (hooks/, fixtures/, screens/, queryKeys.ts)
  components/ui/                    # 공통 컴포넌트 (Component Catalog 대상)
    Button, TextField, SkeletonList, EmptyState, ErrorState, Avatar
    # SegmentedTabs 는 baseline 카탈로그에 없음 → G-001 로 제안 예정
  api/
    client.ts                       # 단일 API client (401/세션 처리)
    schemas/*.schema.ts             # DTO 단일 출처 (zod)
  lib/
    asyncState.ts                   # 화면이 의존하는 유일한 계약
```

## 매핑 원칙 (구현 시 지켜질 것)
- 화면 ID ↔ route ↔ `src/app` 파일은 1:1 이며, route 집합은 Navigation Map 과 §2 표를 단일 출처로 한다.
- 도메인 로직/훅/fixture 는 `src/features/{domain}` 에 모은다. 화면은 도메인 훅 하나만 본다.
- 공통 UI 는 `src/components/ui` 에 두고 Component Catalog 가 그 props 를 반영한다.
- DTO 는 `src/api/schemas` 의 zod 스키마가 단일 출처다. 화면은 DTO 에 직접 의존하지 않는다.
- 이 매핑은 문서상의 약속일 뿐, 실제 파일 생성은 별도 implement-screen 세션의 몫이다.
