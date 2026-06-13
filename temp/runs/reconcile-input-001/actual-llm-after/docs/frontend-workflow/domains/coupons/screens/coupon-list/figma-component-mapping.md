---
artifact_id: COUPON-001-figma-component-mapping
artifact_type: figma-component-mapping
domain: coupons
screen_id: COUPON-001
figma_frame_ref: figma-planning/coupon-list-12-v2
sources:
  - { type: figma, ref: figma-planning/coupon-list-12-v2 }
last_reviewed: 2026-06-13
---

# Figma Component Mapping: 쿠폰 목록 (COUPON-001)

> 시각 디자인(figma) ↔ UI 컴포넌트 매핑. 출처는 figma 입력 IN-20260613-figma-001.
> **경계: 비즈니스 동작(어떤 쿠폰이 어느 탭에 들어가는지 등)은 ScreenSpec 이 단일 출처, 시각 디자인만 여기서 매핑한다.**

## Frame
- Figma Frame Ref: `figma-planning/coupon-list-12-v2`
- 이전 프레임: `figma-planning/coupon-list-12` (figma-frame-index.md)

## Component Mapping
| Figma 요소 | UI 컴포넌트 | 비고 | 카탈로그 |
|---|---|---|---|
| 쿠폰 카드 (썸네일 좌측, 정보 우측) | CouponCard (가로형/horizontal) | 세로형 → 가로형 레이아웃 변경 | 화면 전용 |
| 상태 탭 (3 세그먼트) | SegmentedTabs | 사용 가능 / 사용 완료 / 만료 — 탭 귀속(비즈니스)은 ScreenSpec | **없음 → G-001 (open)** |

## Notes
- SegmentedTabs 는 Component Catalog 에 없다 → component-gap-register.md 의 G-001 로 `open` 제안 (accept 는 사람).
- CouponCard 가로형은 화면 전용 컴포넌트로 본다 (공통 카탈로그 대상 아님). 시각 세부(썸네일 크기·간격)는 figma 프레임을 출처로 한다.
- 우선순위 규칙: 비즈니스 동작은 ScreenSpec 우선, 시각 디자인은 Figma 우선.
