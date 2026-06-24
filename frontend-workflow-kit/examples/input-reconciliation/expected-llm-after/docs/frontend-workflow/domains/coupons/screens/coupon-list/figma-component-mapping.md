---
artifact_id: COUPON-001-figma-component-mapping
artifact_type: figma-component-mapping
domain: coupons
screen_id: COUPON-001
status: draft
sources:
  - { type: figma, ref: figma-planning/coupon-list-12-v2 }
last_reviewed: 2026-06-13
---

# Figma Component Mapping: 쿠폰 목록 (expected-llm-after)

> IN-20260613-figma-001 로 생성. 시각은 Figma 우선, 비즈니스 동작은 ScreenSpec 우선.
> 신규 생성은 simple-update 계열이라 LLM 단독으로 완결 — expected-after 와 내용이 같다.

| Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고 |
|---|---|---|---|
| coupon-list-12-v2 / CouponCard | 쿠폰 카드(가로형) | features/coupons/components/CouponCard | 썸네일 좌, 정보 우 |
| coupon-list-12-v2 / StatusTabs | 상태 탭 | SegmentedTabs (G-001, 카탈로그 미보유) | 사용 가능/사용 완료/만료 |
| coupon-list-12-v2 / EmptyState | 빈 상태 | components/ui/EmptyState | |

## Visual Spec
| Element | Property | Value | Source | Token Status | Provenance | Gap / Open | Notes |
|---|---|---|---|---|---|---|---|
| CouponCard | layout | horizontal | figma node `CouponCard` | source-backed | IN-20260613-figma-001 | - | behavior remains ScreenSpec-owned |
| CouponCard | spacing | `space.4` | figma token export | tokenized | IN-20260613-figma-001 / token manifest candidate | - | source-backed token |
| StatusTabs | radius | raw 999 | figma visual observation | raw | IN-20260613-figma-001 | G-001 / VER-001 | keep as open visual value until token source exists |

## Notes
- SegmentedTabs 는 Component Catalog 에 없다 → G-001(component-gap-register)로 제안됨(`open`). accept 전까지 구현 금지.
- 어떤 쿠폰이 어느 탭에 들어가는지(분류)는 ScreenSpec 의 State/Interaction 이 단일 출처. Figma 는 시각만.
- 탭의 **존재 여부**는 D-001(open)에 달려 있다 — separate-tab 으로 닫히기 전엔 이 매핑도 후보 시각안이다.
- `figma_mapping_status=draft` 는 이 mapping artifact 의 lifecycle 만 뜻한다. pixel fidelity / visual regression / token completeness 를 증명하지 않는다.
