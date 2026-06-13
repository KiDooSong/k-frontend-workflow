---
title: Frontend Architecture
status: draft
kind: architecture-overview
---

# Frontend Architecture (개요)

"샘플 커머스 앱"의 프런트 아키텍처를 **문서 레벨**로 정리한 개요다.
이 fixture 엔 실제 `src/` 가 없다 — 아래 구조는 나중에 implement-screen 세션이 코드를 만들 때 따르는 청사진이며,
지금은 문서로만 존재한다. 이 문서는 prose 문서이므로 `artifact_type` 을 갖지 않는다.

## 라우팅 구조 (Expo Router)
- **Tabs**: `/(tabs)/home`, `/(tabs)/coupons`, `/(tabs)/my` — 인증 후 진입하는 메인 탭 영역.
- **Auth Stack**: `/(auth)/login` — 탭 진입 전 인증 화면 영역.
- **그 외 화면**: `/coupons/[id]`(쿠폰 상세), `/notices`(공지 목록).
- 라우팅 구조의 단일 출처는 Navigation Map(app/navigation-map.md)이다. Route Guard·딥링크·크로스도메인 엣지도 거기서 선언한다.

## AsyncState 계약
- 화면은 데이터 로딩 결과를 `status`(loading / success / empty / error) 한 축으로만 보고 분기한다.
- TanStack Query 등 내부 라이브러리 객체는 화면에 노출하지 않는다 — 화면은 AsyncState 만 본다.
- 그래서 각 ScreenSpec 의 State Matrix 는 `loading | success | empty | error | refreshing` 5행을 모두 채운다.

## fake-hook → API 교체 단계 (fixture-first)
1. 화면은 도메인 데이터 훅 하나(예: `useCoupons`)만 사용한다.
2. 초기에는 그 훅을 **fixture 기반 fake** 로 구현해 모든 State Matrix 분기를 먼저 완성한다.
3. API 가 확정되면 훅 **내부만** `useQuery` 로 교체한다 — 화면 코드는 바뀌지 않는다.
4. 이 단계 분리 덕에 디자인/상태 구현과 API 확정이 서로를 기다리지 않는다.
   (이 fixture 엔 코드가 없으므로 단계 자체는 개념으로만 존재한다.)

## query key factory
- invalidation 의 단일 출처로 도메인별 query key factory(예: `couponKeys`)를 둔다.
- 조회 훅과 mutation 훅을 분리하고, mutation 성공 후 무엇을 invalidate 할지는 이 factory 가 결정한다.
- DTO 스키마(zod)를 단일 출처로 두고 타입은 거기서 파생한다 — 화면은 DTO 에 직접 의존하지 않고 도메인 모델/AsyncState 만 본다.

## 문서 레벨이라는 점
- 위 모든 항목은 **계약/개념**이다. 실제 파일이 어디 놓일지는 source-map.md 의 "예정 구조"를 보라.
- reconcile-input 이 다루는 것도 이 문서 트리이지 코드가 아니다 — 입력은 ScreenSpec/Manifest/Navigation Map 등 문서에 반영된다.
