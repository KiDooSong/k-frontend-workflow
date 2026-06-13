---
input_id: "IN-20260614-api-001"
input_type: "api"
source_type: "api-doc"
source_ref: "api-doc/2026-06-14-coupons-detail-dup"
captured_at: "2026-06-14T00:00:00+09:00"
captured_by: "sample-api-input-skill"
status: "captured"
affected_domains: ["coupons"]
affected_screens: ["COUPON-001"]
confidence: "candidate"
supersedes: null
raw_artifacts: []
---

# Input: (중복) GET /coupons/{id} issuedAt — 같은 input_id 재사용

## Summary
이 파일은 IN-20260614-api-001.md 와 같은 input_id 를 의도적으로 재사용한다 — input_id 전역 유일 규칙 위반(중복) 케이스. 파일명도 input_id 와 다르다(파일명≠input_id 경고도 함께 난다).

## Extracted Facts
- input_id 가 IN-20260614-api-001 으로 중복된다.
- 내용은 의미상 동일하지만, 입력을 고칠 때는 새 input_id + supersedes 를 써야 한다.

## Suggested Target Artifacts
- (해당 없음 — 형식 위반 시연용)

## Expected Reconciliation
- classification: (해당 없음)
- 올바른 처리: 같은 id 를 덮어쓰지 말고 새 input_id 발급 후 supersedes 로 이전 id 를 가리킨다.

## Should Not Do
- Do not implement code directly from this input.
- Do not promote candidate facts to confirmed without source or approval.
- Do not edit generated files directly.
