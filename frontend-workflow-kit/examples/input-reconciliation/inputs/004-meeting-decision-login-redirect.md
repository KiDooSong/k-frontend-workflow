---
input_id: "IN-20260613-meeting-001"
input_type: "meeting"
source_type: "meeting"
source_ref: "meeting/2026-06-13-login-redirect"
captured_at: "2026-06-13T00:00:00+09:00"
captured_by: "sample-meeting-input-skill"
status: "captured"
confidence: "confirmed"
affected_domains: ["auth"]
affected_screens: ["AUTH-001"]
supersedes: null
---

# Input: 로그인 성공 후 홈 이동, 단 protected redirect 중이면 returnTo 우선

## Summary
로그인 성공 시 기본은 홈(/(tabs)/home) 이동이되, 보호 라우트 redirect 로 로그인에 진입한 경우에는 returnTo(원래 목적지)로 우선 이동한다.

## Extracted Facts
- 기본 목적지: /(tabs)/home.
- protected route redirect 진입 시: returnTo 가 있으면 returnTo 우선.
- returnTo 의 단일 출처는 Navigation Map 의 Route Guard.

## Suggested Target Artifacts
- app/navigation-map.md (Route Guard)
- AUTH-001 screen-spec (Interaction Matrix, Acceptance Criteria, Open Decisions D-204)
- _meta/conflicts.md, _meta/decision-log.md

## Expected Reconciliation
- classification: conflict (vs resolved D-204 "항상 홈")
- 기존 resolved 결정 D-204 는 "로그인 성공 → 항상 홈" 이다. 이 입력은 returnTo 우선을 추가하므로 기존 결정에 도전한다 (resolved 결정 재오픈 케이스).
- LLM 은 Conflicts 에 C-001(이전 값 `항상 홈` 보존)을 기록하고, D-204 를 resolved → open 으로 재오픈한다 (게이트를 올리는 보수적 방향).
- 사람이 재심해 D-204 를 "기본 홈 + returnTo 우선" 으로 다시 resolved 로 닫고, navigation-map Route Guard 를 갱신한다. C-001 도 함께 닫는다 (닫힘 동기화).

## Should Not Do
- Do not implement code directly from this input.
- Do not promote candidate facts to confirmed without source or approval.
- Do not edit generated files directly.
