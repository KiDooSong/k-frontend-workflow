---
artifact_id: coupons-domain-rules
artifact_type: domain-rules
domain: coupons
status: draft
last_reviewed: 2026-06-12
---

# Coupons Domain Rules

## 공통 규칙
- 쿠폰 상태(사용 가능/사용 완료/만료)는 서버 enum 을 단일 출처로 삼는다. 화면에서 임의 파생 금지.
- 401 처리는 화면별로 구현하지 않고 API client/session layer 에서 처리한다.
- 쿠폰 사용 성공/실패 후 이동·토스트는 ScreenSpec 의 Mutation Matrix 를 따른다.

## 데이터/계약
- query key factory: src/features/coupons/queryKeys.ts (`couponKeys`) 가 invalidation 의 단일 출처.
- 조회 hook(useCoupons)과 mutation hook(useUseCoupon)은 분리한다.
- DTO 스키마: src/api/schemas/coupon.schema.ts (zod). 타입은 z.infer 로 파생.

## 용어
- "쿠폰" = coupon. "보유 쿠폰" = 사용자가 소지한 쿠폰 목록.
