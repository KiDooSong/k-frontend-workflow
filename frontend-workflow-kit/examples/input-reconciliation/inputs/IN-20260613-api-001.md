---
input_id: "IN-20260613-api-001"
input_type: "api"
source_type: "api-doc"
source_ref: "api-doc/2026-06-13-coupons-pagination"
captured_at: "2026-06-13T00:00:00+09:00"
captured_by: "sample-api-input-skill"
status: "captured"
confidence: "candidate"
affected_domains: ["coupons"]
affected_screens: ["COUPON-001"]
supersedes: null
---

# Input: 쿠폰 목록 응답이 CouponDto[] → page envelope 로 변경

## Summary
`GET /coupons` 응답이 bare array(`CouponDto[]`)에서 페이지 envelope(`{ items, page, size, hasNext }`)로 변경된다.

## Extracted Facts
- 응답 형태: `{ items: CouponDto[], page: number, size: number, hasNext: boolean }`.
- 페이지 크기 기본 20.
- 정렬은 만료 임박 순(서버 결정).
- 쿠폰 API 응답 예시 문서가 함께 제공됨 (U-001 의 답).

## Suggested Target Artifacts
- api/api-manifest.md (/coupons 응답 형태)
- COUPON-001 screen-spec (Data Requirements, API Candidates, Open Decisions D-003)
- COUPON-001 Unknowns U-001

## Expected Reconciliation
- classification: simple-update (api-manifest) + resolves-unknown (U-001) + resolves-decision 후보 (D-003 → offset/page)
- api-manifest 의 /coupons 응답을 page envelope 으로 갱신한다.
- U-001(쿠폰 API 응답 예시 위치)을 resolved 로 닫을 수 있다 (사람 확인 후).
- D-003(페이지네이션) 선택지를 `offset/page` 로 좁힌다 (LLM 은 resolve 하지 않고, 사람이 닫는다).
- **화면은 API DTO 에 직접 의존하지 않는다** — hasNext/page 상태는 fake hook 의 AsyncState 로 노출한다.

## Should Not Do
- Do not implement code directly from this input.
- Do not promote candidate facts to confirmed without source or approval.
- Do not edit generated files directly.
