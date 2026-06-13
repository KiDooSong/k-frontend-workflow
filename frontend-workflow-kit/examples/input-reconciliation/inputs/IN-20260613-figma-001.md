---
input_id: "IN-20260613-figma-001"
input_type: "figma"
source_type: "figma"
source_ref: "figma-planning/coupon-list-12-v2"
captured_at: "2026-06-13T00:00:00+09:00"
captured_by: "sample-figma-input-skill"
status: "captured"
confidence: "candidate"
affected_domains: ["coupons"]
affected_screens: ["COUPON-001"]
supersedes: null
---

# Input: CouponCard 가로형 + SegmentedTabs 도입

## Summary
CouponCard 레이아웃을 세로형에서 가로형(horizontal)으로 변경하고, 쿠폰 상태 탭을 SegmentedTabs 컴포넌트로 표현한다.

## Extracted Facts
- CouponCard: 가로형 레이아웃 (썸네일 좌측, 정보 우측).
- 상태 탭: SegmentedTabs 형태 (3개 세그먼트).
- 이 입력은 시각 변경만 다룬다 — 어떤 쿠폰이 어느 탭에 들어가는지(비즈니스)는 ScreenSpec 이 정한다.

## Suggested Target Artifacts
- domains/coupons/screens/coupon-list/figma-component-mapping.md (신규)
- global/component-gap-register.md (SegmentedTabs 부재 시 제안)
- COUPON-001 screen-spec (UI Sections — 시각 참조)

## Expected Reconciliation
- classification: simple-update (figma-component-mapping 생성) + component-gap (G-001 SegmentedTabs)
- figma-component-mapping 을 만들어 CouponCard(가로형)·SegmentedTabs 를 프레임에 매핑한다.
- Component Catalog 에 SegmentedTabs 가 없으므로 G-001 을 component-gap-register 에 `open` 으로 제안한다 (LLM 은 제안만, accept 는 사람).
- 우선순위 규칙: **비즈니스 동작은 ScreenSpec 우선, 시각 디자인은 Figma 우선.**

## Should Not Do
- Do not implement code directly from this input.
- Do not promote candidate facts to confirmed without source or approval.
- Do not edit generated files directly.
