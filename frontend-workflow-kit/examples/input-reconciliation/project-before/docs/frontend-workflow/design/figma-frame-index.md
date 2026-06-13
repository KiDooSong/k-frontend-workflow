---
title: Figma Frame Index
status: draft
---

# Figma Frame Index

화면별 Figma 프레임 참조(ref) 인덱스다. 시각 디자인의 출처를 화면 ID 와 연결하기 위한 매핑 표이며, 비즈니스 동작의 출처는 아니다(동작은 ScreenSpec 우선). 이 인덱스는 화면 ↔ 대표 프레임 ref 연결만 담는다 — 프레임별 **상세 컴포넌트 매핑**(노드 → UI 요소 → 카탈로그 컴포넌트)은 각 화면 폴더의 `figma-component-mapping.md`(예: `domains/coupons/screens/coupon-list/figma-component-mapping.md`)에 둔다.

| Screen ID | Screen | Figma Frame Ref |
|---|---|---|
| AUTH-001 | login | `figma-planning/login-1` |
| HOME-001 | home | `figma-planning/home-3` |
| COUPON-001 | coupon-list | `figma-planning/coupon-list-12` |
| COUPON-002 | coupon-detail | `figma-planning/coupon-detail-18` |
| PROFILE-001 | profile-edit | `figma-planning/profile-edit-7` |
| NOTICE-001 | notice-list | `figma-planning/notice-list-22` |

> CouponCard 가로형 + SegmentedTabs 디자인 변경은 figma 입력 `IN-20260613-figma-001` 로 들어온다. 그 변경의 figma 매핑·gap 은 reconcile-input 세션에서 처리한다.
