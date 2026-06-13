---
input_type: "user-note"
source_type: "user-note"
source_ref: "note/2026-06-14-misc"
captured_at: "2026-06-14T00:00:00+09:00"
captured_by: "sample-user-note-input-skill"
status: "captured"
affected_domains: ["coupons"]
affected_screens: ["COUPON-001"]
confidence: "unknown"
supersedes: null
---

# Input: input_id 가 통째로 빠진 메모

## Summary
frontmatter 는 있으나 required 키 input_id 가 통째로 빠진 입력이다 — 멱등성·역추적·미처리 감지의 키가 없어 입력 결과물로 불완전하다.

## Extracted Facts
- input_id 가 frontmatter 에 없다.
- 나머지 required 필드는 채워져 있다.

## Suggested Target Artifacts
- (해당 없음 — 형식 위반 시연용)

## Expected Reconciliation
- classification: (검증 실패 — input_id 누락)

## Should Not Do
- Do not implement code directly from this input.
- Do not promote candidate facts to confirmed without source or approval.
- Do not edit generated files directly.
