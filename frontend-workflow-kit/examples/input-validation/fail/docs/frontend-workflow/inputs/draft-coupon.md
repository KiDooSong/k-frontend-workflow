---
input_id: "draft-coupon"
input_type: "planning"
source_type: "planning-doc"
source_ref: "planning/2026-06-14-coupon-draft"
captured_at: "2026-06-14T00:00:00+09:00"
captured_by: "sample-planning-input-skill"
status: "captured"
affected_domains: ["coupons"]
affected_screens: ["COUPON-001"]
confidence: "candidate"
supersedes: null
---

# Input: input_id 형식을 위반한 초안 메모

## Summary
input_id 가 "draft-coupon" 으로 INPUT_ID_PATTERN(IN-{YYYYMMDD}-{source}-{NNN})을 위반한다. id 형식이 깨지면 멱등성·역추적·supersede 매칭이 흔들린다.

## Extracted Facts
- input_id 가 IN- 접두/날짜/시퀀스 형식을 따르지 않는다.
- 나머지 required 필드는 채워져 있다.

## Suggested Target Artifacts
- (해당 없음 — 형식 위반 시연용)

## Expected Reconciliation
- classification: (검증 실패 — input_id 형식 위반)

## Should Not Do
- Do not implement code directly from this input.
- Do not promote candidate facts to confirmed without source or approval.
- Do not edit generated files directly.
