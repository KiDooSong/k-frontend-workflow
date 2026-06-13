---
artifact_id: "coupons-domain-rules"
artifact_type: domain-rules
domain: coupons
status: draft
last_reviewed: 2026-06-12
---

# Coupons Domain Rules

## 공통 규칙
- 쿠폰 상태(사용 가능/사용 완료/만료)는 서버 enum 을 단일 출처로 삼는다. 화면에서 임의 파생·재정의 금지.
- 401 처리는 화면별로 구현하지 않고 API client/session layer 에서 처리한다.
- 쿠폰 목록(COUPON-001, `/(tabs)/coupons`)과 쿠폰 상세(COUPON-002, `/coupons/[id]`)는 같은 상태 enum·용어를 공유한다.
- 만료 쿠폰 노출 정책(D-001)·페이지네이션 방식(D-003)은 미확정이므로 확정 전 화면에서 임의 고정하지 않는다.

## 데이터/계약
- 쿠폰 목록은 `GET /coupons`, 상세는 `GET /coupons/{id}` 로 조회한다. 화면은 API DTO 에 직접 의존하지 않고 도메인 모델로 환원해 사용한다.
- query key factory 를 invalidation 의 단일 출처로 삼고, 목록·상세는 동일 factory 의 키 계층을 공유한다.
- 조회와 사용(mutation)은 분리하며, 사용 성공/실패 후 이동·토스트는 ScreenSpec 의 Mutation Matrix 를 따른다.

## 용어
- "쿠폰" = coupon. "보유 쿠폰" = 사용자가 소지한 쿠폰 목록.
- 쿠폰 상태 = 사용 가능 / 사용 완료 / 만료 (서버 enum 기준).
