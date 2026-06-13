# Reconciliation Summary — reconcile-input-002

> 입력 5건(IN-20260613-*)을 project-before baseline 에 reconcile 한 결과 요약 (LLM 단독 출력).
> 수정된 계약(resolves-unknown = 답/근거 연결 + open 유지, 닫기는 사람) 기준 재실행.
> 단일 출처: `_meta/reconciliation-register.md`. 이 문서는 사람이 읽는 요약이다.

## 입력별 처리

| # | Input ID | Classification | LLM 반영(게이트 올림·simple-update) | 사람 몫(게이트 내림) |
|---|---|---|---|---|
| 1 | IN-20260613-planning-001 | resolves-decision + simple-update | COUPON-001 상태 탭 UI Sections·Interaction·Copy Keys(draft)·Acceptance 보강, D-001 에 separate-tab 후보 기록 | D-001 을 separate tab 으로 resolve, 탭 Copy Keys confirmed 승격 |
| 2 | IN-20260613-figma-001 | simple-update + component-gap | figma-component-mapping.md 생성(CouponCard 가로형·SegmentedTabs), G-001(SegmentedTabs) open 제안, COUPON-001 UI Sections 시각 참조 | G-001 accept(카탈로그 반영) |
| 3 | IN-20260613-api-001 | simple-update + resolves-unknown + resolves-decision | api-manifest /coupons → page envelope, U-001 에 응답 예시 답/근거 연결(open 유지), D-003 옵션 offset/page 로 좁힘 | U-001 resolved 닫기, D-003 resolve |
| 4 | IN-20260613-meeting-001 | conflict (decision reopen) | C-001 open 기록(이전 값 '항상 홈' 보존), D-204 resolved→open 재오픈(AUTH-001 + decision-log) | D-204 재-resolve, navigation-map Route Guard returnTo 반영, C-001 동기 close |
| 5 | IN-20260613-qa-001 | simple-update + policy-update | COUPON-001 State Matrix offline 행·Acceptance 추가, api-error-policy network/offline 분기 정의 | (없음) |

## 게이트 변화 (Open Decision = 실제 게이트)
- **새로 raise**: D-204 재오픈(AUTH-001 final-fixture-ui) → AUTH-001 readiness 다운그레이드.
- **유지(open)**: D-001(COUPON-001), D-003(COUPON-001) — 입력이 정보를 보탰지만 LLM 은 닫지 않음.
- **신호만(게이트 아님)**: C-001(conflict, passive log), G-001(component gap 제안), U-001(unknown — 답 제공됐으나 open 유지).

## 불변식 점검 (수정된 계약 기준)
- register-first: 5개 입력 모두 reconciliation-register 에 행 존재, Reconcile Status=reconciled.
- LLM 은 게이트를 올리기만 함: resolved 결정 재-resolve 0건, conflict close 0건, confirmed 승격 0건, gap accept 0건, **Unknown resolved 닫기 0건**.
- AUTH-001(confirmed) frontmatter 강등 안 함 — D-204 만 open 으로 재오픈(게이트는 readiness 가 건다).
- **U-001 은 답/근거만 연결하고 open 유지** (resolvable 표시, 닫기는 사람). 별도 Unknown 신설 안 함 — enum 매칭 확인은 U-001 에 귀속(api-manifest 주석).

## md-only 게이트 천장 (참고)
- 이 fixture 는 src 없음 → `fake_hook_exists=false`, `component_catalog_generated=false`.
- 사실 기준 readiness 천장 = 모든 화면 `screen-skeleton`. reports 의 target readiness 는 design intent 이며 md-only gate 실제 출력과 라벨로 구분한다.
- 본 dry-run 은 npm 스크립트(state/readiness/validate)를 실행하지 않는다(코드 변경 없음). 게이트 효과는 위 "게이트 변화"로 논리 추적만 한다.
