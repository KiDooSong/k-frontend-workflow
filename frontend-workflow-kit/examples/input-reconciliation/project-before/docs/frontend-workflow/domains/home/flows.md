---
title: Home Flows
domain: home
status: draft
---

# Home Flows

## 홈 진입 / 요약 로드
1. 로그인 성공 후 홈(HOME-001, `/(tabs)/home`)으로 진입.
2. `GET /home/summary` 호출 → 로딩 중 SkeletonList 표시.
3. 성공 → 위젯(쿠폰 요약·공지·추천) 렌더. 데이터 없음 → EmptyState.
4. 실패 → ErrorState + Retry.

요약: 홈 진입 → `GET /home/summary` → 성공 시 위젯 렌더, 실패 시 ErrorState·Retry.

## 위젯에서 상세로 이동
1. 쿠폰 요약 위젯 탭 → 쿠폰 목록(`/(tabs)/coupons`).
2. 공지 위젯 탭 → 공지 목록(`/notices`).

> 위젯 구성·우선순위는 D-101 확정 전까지 잠정이다.
