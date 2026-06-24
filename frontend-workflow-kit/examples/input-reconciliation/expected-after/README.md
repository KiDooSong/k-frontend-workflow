# expected-after — 이상적 reconcile 결과

`inputs/` 의 7건을 `project-before/` baseline 에 reconcile 했을 때 **reconcile-input(+사람)** 이
만들어 내야 하는 **이상적 최종 상태**다. 나중 세션의 출력을 이 트리와 대조한다.

- 이 트리는 production app 도, 코드 구현 예제도 아니다 (md-only).
- 이 예제는 future skill(reconcile-input) 테스트용 정답 fixture 다.
- 구현 결과물은 별도 세션에서 implement-screen 을 실행해 생성하며, 이 트리는 코드를 만들지 않는다.
- coupon-feature golden example 을 대체하지 않는다.

## LLM-vs-human 경계 (중요)

reconcile-input(LLM)은 blocker 를 **올리기만** 한다 — `open` 행 추가, resolved 결정을 `resolved → open` 으로 재오픈,
Unknown 답/근거 연결, 충돌 기록, 갭 제안(`open`). simple-update(문서 형태가 바뀌지 않는 갱신)도 적용한다.
그러나 결정을 `resolved` 로 닫거나, 충돌을 `resolved` 로 닫거나, Unknown 을 `resolved` 로 닫거나, status 를 `confirmed` 로 승격하거나, 갭을 `accepted` 로 받는 것은 **사람만** 한다.

이 `expected-after/` 는 사람이 닫는 결정까지 마친 **이상적 end state** 다.
따라서 D-001 / D-003 / D-204 가 resolved 로, C-001 과 U-001 이 resolved 로 보이는 것은 **사람 단계의 결과**이지 LLM 단독 출력이 아니다.
단 D-501/C-002 는 live policy replacement / hard gate / CI promotion 을 다루는 별도 promotion decision 이므로 이 fixture 에서도 open 으로 둔다.
어느 단계가 LLM 몫이고 어느 단계가 사람 몫인지는 reports 의 reconciliation 요약이 단계별로 명시한다.
나중 세션이 reconcile-input 만 돌린 출력과 이 트리를 비교할 때는, 그 차이가 "사람 단계"임을 감안해야 한다.

## 바뀐 산출물과 이유 (입력 7건 기준)

| 입력 | 바뀐 산출물 | LLM 이 한 일 | 사람이 한 일 |
|---|---|---|---|
| IN-20260613-planning-001 | COUPON-001 screen-spec (UI Sections·Copy Keys), _meta/decision-log.md | D-001 에 separate-tab 근거를 입력으로 연결, 상태 탭 값↔서버 enum 매칭은 기존 U-001(응답 예시)로 확인되도록 연결(별도 Unknown 신설 없음), UI/Copy simple-update | **D-001 을 resolved(→ separate tab)로 닫음** |
| IN-20260613-figma-001 | domains/coupons/screens/coupon-list/figma-component-mapping.md(신규), global/component-gap-register.md | CouponCard 가로형 매핑 생성, SegmentedTabs 부재를 **G-001 `open` 으로 제안**, "비즈니스=ScreenSpec / 시각=Figma" 경계 명시 | (G-001 accept 는 보류 — 사람 몫) |
| IN-20260613-api-001 | api/api-manifest.md, COUPON-001 (pagination state) | `GET /coupons` 응답을 bare array → page envelope 로 simple-update, hasNext 정책 기록, **U-001 resolved**, D-003 에 정보 제공("화면은 DTO 에 직접 의존하지 않음" 유지) | **D-003 을 resolved(→ offset/page)로 닫음** |
| IN-20260613-meeting-001 | _meta/conflicts.md, app/navigation-map.md, AUTH-001 | resolved D-204 와의 충돌을 감지해 **C-001 생성**, **D-204 를 resolved → open 으로 재오픈**, returnTo 우선 규칙을 Route Guard 갱신으로 제안 | **C-001 을 resolved 로, D-204 를 다시 resolved(returnTo 우선 + 기본 홈)로 닫음 (사람 수락)** |
| IN-20260613-qa-001 | COUPON-001 (State Matrix·Acceptance Criteria), api/api-error-policy.md | State Matrix 에 `offline`/network-error 행 추가, api-error-policy 에 네트워크/오프라인 retry 추가, Acceptance Criteria 추가 (simple-update) | (별도 사람 결정 없음 — 전부 simple-update 범위) |
| IN-20260613-testid-001 | COUPON-001 Accessibility | testID anchor 를 draft/recommended 로 기록, D-001 의존 selector 는 `VER-001 open` 으로 남김. 코드/test 구현 없음 | naming confirmed 승격 없음(별도 승인 전까지 evidence) |
| IN-20260613-policy-migration-001 | _meta/conflicts.md, _meta/decision-log.md, policy draft/migration review notes | readiness access wired / policy draft generated / migration guide generated 를 기록, live policy adoption 요구를 **C-002 + D-501 open** 으로 올림 | 이 fixture 에서 닫지 않음. live policy replacement·hard gate·CI promotion 은 별도 결정 전까지 금지 |

## md-only 게이트 천장

expected-after 도 md-only 다 — 사실 기준 readiness 천장은 여전히 모든 화면 `screen-skeleton` 이다.
표/리포트에 보이는 화면별 **target readiness 는 design intent**(implement-screen 세션이 fake hook·생성 카탈로그·figma 매핑·사람 승인을 더했을 때의 목표)이며, md-only 게이트의 실제 출력과는 일부러 다르다.
예: 입력 reconcile 후 COUPON-001 의 target 은 final-fixture-ui 로 올라가지만, md-only 게이트 출력은 그대로 screen-skeleton 이다.
