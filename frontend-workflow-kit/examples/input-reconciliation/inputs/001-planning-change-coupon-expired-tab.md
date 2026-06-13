---
input_id: "IN-20260613-planning-001"
input_type: "planning"
source_type: "planning-doc"
source_ref: "planning/2026-06-13-coupon-status-tabs"
captured_at: "2026-06-13T00:00:00+09:00"
captured_by: "sample-planning-input-skill"
status: "captured"
confidence: "candidate"
affected_domains: ["coupons"]
affected_screens: ["COUPON-001"]
supersedes: null
---

# Input: 쿠폰 목록 상태 탭(사용 가능/사용 완료/만료) 추가

## Summary
쿠폰 목록 화면에 상태별 탭 3개(`사용 가능`, `사용 완료`, `만료`)를 추가한다. 사용자가 탭으로 쿠폰 상태를 전환해 본다.

## Extracted Facts
- 탭은 3개: 사용 가능 / 사용 완료 / 만료.
- 기본 선택 탭은 `사용 가능`.
- 만료 쿠폰도 별도 `만료` 탭에서 노출한다 (재발급 동선 고려).
- 탭 라벨 문구가 새로 필요하다.

## Suggested Target Artifacts
- COUPON-001 screen-spec (UI Sections, Interaction Matrix, Copy Keys)
- COUPON-001 Open Decisions: D-001 (만료 쿠폰 노출)
- design/component-catalog (상태 탭 컴포넌트 필요 여부 — figma 입력과 연계)

## Expected Reconciliation
- classification: resolves-decision (D-001 → separate tab) + simple-update (Copy Keys / UI Sections 보강)
- D-001 "만료 쿠폰 노출"의 선택지 `separate tab` 을 사람이 고를 수 있게 한다 (LLM 은 resolve 하지 않는다).
- 상태 탭 라벨 Copy Keys 를 추가한다 (coupon.tab.available / used / expired).
- 상태 값이 서버 enum 과 1:1 로 매칭되는지 확인한다 — 매칭 미확인 시 Unknown 으로 남긴다 (API enum 충돌 가능성).

## Should Not Do
- Do not implement code directly from this input.
- Do not promote candidate facts to confirmed without source or approval.
- Do not edit generated files directly.
