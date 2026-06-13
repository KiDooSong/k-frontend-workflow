---
input_id: "IN-20260613-qa-001"
input_type: "qa"
source_type: "qa"
source_ref: "qa/2026-06-13-coupon-offline-retry"
captured_at: "2026-06-13T00:00:00+09:00"
captured_by: "sample-qa-input-skill"
status: "captured"
confidence: "candidate"
affected_domains: ["coupons"]
affected_screens: ["COUPON-001"]
supersedes: null
---

# Input: 오프라인 쿠폰 목록 진입 시 network-error/offline ErrorState·Retry 누락

## Summary
오프라인(네트워크 없음) 상태에서 쿠폰 목록에 진입하면, 일반 에러와 구분되는 네트워크 전용 ErrorState/Retry UX 가 없다. QA 에서 빈 화면/멈춤으로 관측됨.

## Extracted Facts
- 오프라인 진입 시 네트워크 전용 안내가 없다.
- 일반 5xx 서버 에러와 오프라인(network-error)을 구분해야 한다.
- 재시도(Retry) 시 온라인 복귀하면 정상 로드되어야 한다.

## Suggested Target Artifacts
- COUPON-001 screen-spec (State Matrix — offline/network-error 행, Acceptance Criteria)
- api/api-error-policy.md (network/offline 정책)

## Expected Reconciliation
- classification: simple-update (State Matrix + Acceptance Criteria) + policy update (api-error-policy)
- State Matrix 에 `offline`(network-error) 상태 행을 추가한다 (UI: 네트워크 전용 ErrorState + Retry).
- api-error-policy 에 network/offline 분기와 Retry 동작을 명시한다.
- Acceptance Criteria 에 오프라인 진입/복귀 시나리오를 추가한다.

## Should Not Do
- Do not implement code directly from this input.
- Do not promote candidate facts to confirmed without source or approval.
- Do not edit generated files directly.
