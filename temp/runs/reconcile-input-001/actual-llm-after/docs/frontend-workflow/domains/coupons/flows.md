---
title: Coupons Flows
domain: coupons
status: draft
---

# Coupons Flows

## 쿠폰 목록 조회
1. 쿠폰 탭 진입 → 쿠폰 목록(COUPON-001, `/(tabs)/coupons`).
2. `GET /coupons` 호출 → 로딩 중 SkeletonList.
3. 성공 → 보유 쿠폰 목록 렌더. 비어 있으면 EmptyState.
4. 실패 → ErrorState + Retry.

요약: 쿠폰 탭 → `GET /coupons` → 성공 시 목록, 비어있으면 EmptyState, 실패 시 ErrorState·Retry.

## 쿠폰 상세 진입
1. 목록(`/(tabs)/coupons`)에서 쿠폰 항목 탭 → 상세(COUPON-002, `/coupons/[id]`).
2. `GET /coupons/{id}` 호출 → 상세 렌더.

> 만료 쿠폰 노출(D-001)·페이지네이션 방식(D-003)은 미확정. 상태 enum 은 서버를 단일 출처로 사용.
