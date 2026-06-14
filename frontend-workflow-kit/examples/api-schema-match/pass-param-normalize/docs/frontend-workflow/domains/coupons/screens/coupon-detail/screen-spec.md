---
artifact_id: ASM-PASS3-screen-spec
artifact_type: screen-spec
domain: coupons
screen_id: ASM-PASS3
route: /(tabs)/coupons/[id]
status: draft
---

# ScreenSpec: 쿠폰 상세 (pass-param-normalize)

## Entry Points
<!-- GENERATED:START nav-graph -->
- 쿠폰 목록 > 쿠폰 카드 클릭
<!-- GENERATED:END nav-graph -->

## API Candidates
- GET /coupons/:id (confidence: confirmed)
- POST /coupons/[id]/use (confidence: confirmed)
