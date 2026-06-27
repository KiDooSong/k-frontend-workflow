# Investigation And Verification

긴 조사, 기술 검증, 플랫폼별 확인이 필요한 작업을 세션 간에 이어받을 수 있도록 산출물로 남기는 흐름이다.

이 문서는 `Input Reconciliation`이나 `Open Decisions`를 대체하지 않는다. 그 둘 사이에 필요한 "증거 만들기" 축을 정의한다.

```txt
Input Reconciliation
= 새 입력이 기존 문서/결정과 맞는지 대조

Open Decisions
= 사람이 선택해야 하는 결정 대기 항목

Investigation / Verification
= 아직 결정할 수 없어서 조사·실험·플랫폼 검증이 필요한 항목
```

예를 들어 auth 기능에서 소셜 로그인, 앱 전환, SDK 설정, callback, 키보드 동작, iOS/Android 차이를 검증해야 한다면 이것은 단순 `Unknowns`나 `Open Decisions`만으로 담기 어렵다. 여러 세션에 걸쳐 증거를 모으고, 결과를 ScreenSpec이나 결정 항목으로 다시 흘려보내야 한다.

## 설계 근거

이 축은 새 발명이 아니라 기존 실무 패턴을 프론트 워크플로우에 맞춘 것이다.

```txt
Requirements Traceability
= 요구사항이 입력 → 설계 → 구현 → 테스트까지 어떻게 이어지는지 앞뒤로 추적한다.

Change Impact Analysis
= 변경이 어떤 요구사항, 화면, 코드, 테스트에 영향을 주는지 추정한다.

Spike
= 불확실한 기술/기능 문제를 시간 제한을 두고 조사·실험해 의사결정에 필요한 정보를 만든다.

ADR / Decision Record
= 결정과 근거를 남긴다. Investigation 결과는 Open Decision을 resolve하는 근거가 될 수 있다.
```

참고:

- Requirements traceability: https://en.wikipedia.org/wiki/Requirements_traceability
- Change impact analysis: https://en.wikipedia.org/wiki/Change_impact_analysis
- Spike: https://en.wikipedia.org/wiki/Spike_%28software_development%29
- Architectural decision: https://en.wikipedia.org/wiki/Architectural_decision

## 언제 쓰는가

다음 상황은 `Investigation`이나 `Verification` 산출물로 분리한다.

```txt
SDK / 외부 서비스 동작을 확인해야 함
플랫폼별 동작 차이가 있음
앱 전환, 딥링크, callback, permission 같은 런타임 검증이 필요함
기획/디자인은 아직 미완성이지만 기술 제약을 먼저 알아야 함
결정을 내리기 전 근거가 부족함
한 세션에서 끝나지 않을 정도로 조사 범위가 큼
테스트 기기/계정/환경이 필요함
```

예시:

```txt
auth/social-login-sdk
auth/app-switching-callback
auth/keyboard-platform-behavior
auth/apple-login-review-requirements
coupon/offline-redemption-flow
payment/webview-redirect-and-callback
```

## 어디에 저장하는가

도메인에 속한 검증은 도메인 아래에 둔다.

```txt
docs/frontend-workflow/domains/{domain}/
  investigations/
    {topic}.md
  verification/
    {topic}-matrix.md
```

예시:

```txt
docs/frontend-workflow/domains/auth/
  investigations/
    social-login-sdk.md
    app-switching-callback.md
    keyboard-platform-behavior.md
  verification/
    auth-platform-matrix.md
  screens/
    login/screen-spec.md
    signup/screen-spec.md
    social-callback/screen-spec.md
```

여러 도메인에 걸친 항목은 global 아래에 둔다.

```txt
docs/frontend-workflow/global/investigations/
docs/frontend-workflow/global/verification/
```

원본 자료, 긴 로그, 영상, 스크린샷은 raw/input artifact에 둘 수 있다. 이 킷 문서에는 다음 세션이 판단할 수 있는 요약, 상태, 증거 링크, 결론, blocker만 남긴다.

## Investigation 문서 형식

```md
---
artifact_id: AUTH-INV-001
artifact_type: investigation
domain: auth
status: in-progress
blocks_mode: api-integrated-ui
owner: FE
created_at: 2026-06-13
last_reviewed: 2026-06-13
sources:
  - { type: input, ref: docs/frontend-workflow/inputs/IN-20260613-meeting-001.md }
related_screens: [AUTH-LOGIN, AUTH-CALLBACK]
related_decisions: [D-AUTH-001]
---

# Investigation: Social Login SDK

## Question
소셜 로그인 SDK와 앱 전환 callback을 어떤 방식으로 붙여야 하는가?

## Why It Matters
- API 연동 단계 전에 callback route와 failure state를 알아야 한다.
- iOS/Android 동작 차이가 화면 상태와 에러 UX에 영향을 준다.

## Scope
- Kakao / Apple / Google login
- app installed / not installed
- cancel / failure / duplicate account
- callback route and deep link behavior

## Evidence
| ID | Source | Finding | Confidence |
|---|---|---|---|
| E-001 | SDK docs | redirect callback requires native URL scheme | candidate |
| E-002 | device test | Android cancel returns error code X | observed |

## Findings
- pending

## Impact
| Artifact | Impact |
|---|---|
| AUTH-LOGIN ScreenSpec | State Matrix에 cancel/failure 상태 필요 |
| AUTH-CALLBACK ScreenSpec | callback route 필요 |
| Open Decisions | provider 우선순위 결정 필요 |

## Next Actions
- [ ] iOS 실기기에서 app installed 케이스 확인
- [ ] Android 미설치 fallback 확인
- [ ] BE callback contract 확인

## Result
pending
```

## Verification Matrix 형식

플랫폼, 브라우저, 기기, 계정 상태 등 조합이 중요한 경우 matrix로 관리한다.

```md
---
artifact_id: AUTH-VER-001
artifact_type: verification-matrix
domain: auth
status: in-progress
blocks_mode: production-ready
owner: QA
last_reviewed: 2026-06-13
related_screens: [AUTH-LOGIN, AUTH-CALLBACK]
---

# Verification Matrix: Auth Platform Behavior

| Case | iOS | Android | Web | Evidence | Status |
|---|---|---|---|---|---|
| Kakao app installed | pending | pending | n/a | - | open |
| Kakao app not installed | pending | pending | n/a | - | open |
| User cancels login | pending | pending | n/a | - | open |
| Keyboard overlaps CTA | pending | pending | pending | - | open |
| Callback duplicate account | pending | pending | n/a | - | open |
```

상태값:

```txt
open
= 아직 확인 전

in-progress
= 확인 중

passed
= 확인 완료, 이슈 없음

failed
= 문제 확인됨. Conflict, Open Decision, bug/task로 연결 필요

blocked
= 계정/기기/환경/타팀 응답이 없어 확인 불가

not-applicable
= 해당 플랫폼에 적용 안 됨
```

## 상태 모델

Investigation:

```txt
open
= 조사 필요, 아직 시작 안 함

in-progress
= 조사 중

blocked
= 외부 환경/권한/계정/응답 대기

resolved
= 결론이 나서 관련 문서/결정에 반영됨

abandoned
= 더 이상 필요 없음
```

Verification Matrix:

```txt
open
in-progress
passed
failed
blocked
not-applicable
```

## Open Decisions와의 관계

Investigation은 결정을 대체하지 않는다. 결정을 내리기 위한 증거를 만든다.

```txt
결정이 필요하지만 근거가 부족함
→ Open Decision 추가
→ Investigation 생성
→ Evidence 수집
→ 사용자 결정
→ Open Decision resolved
→ ScreenSpec / Domain Rules / API 문서 업데이트
```

예시:

```md
## Open Decisions
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-AUTH-001 | 소셜 로그인 provider 우선순위는? | Kakao / Apple / Google | final-fixture-ui | Product | open |

## Related Investigations
- AUTH-INV-001 social-login-sdk
```

## Input Reconciliation과의 관계

새 입력이 들어왔는데 바로 반영하기 어렵고 검증이 필요하면 Reconciliation 은 `investigation-needed` 로 분류하고 Investigation 을 만든다(`input-reconciliation.md` 의 Classification·Created Items 에 등록된다).

```txt
input result
→ reconcile input
→ investigation-needed 로 분류
→ investigation / verification 생성 (Register Created Items 에 INV-/VER- 기록)
→ 막을 화면에 Open Decision 을 올린다   ← MVP-A 의 실제 게이트 (Unknown 은 fact-finding 큐, 자동 게이트 아님)
   (investigation 의 blocks_mode 를 readiness 가 직접 읽는 것은 후속)
```

예시:

```txt
새 입력: "카카오 로그인은 앱 전환 후 callback으로 돌아온다"
분류: investigation-needed
생성: auth/investigations/app-switching-callback.md
링크: 막을 화면에 Open Decision 추가   # 이게 MVP-A 의 blocker (단순 사실은 Unknown, 게이트는 Open Decision)
blocks_mode: api-integrated-ui                # 후속에 readiness 가 직접 게이트할 때 사용
```

## Readiness와의 관계

MVP-A에서는 Investigation/Verification을 readiness에 직접 연결하지 않는다. 대신 관련 ScreenSpec의 `Open Decisions`가 blocker 역할을 한다 — open decision 이 `decision_cap` 으로 모드를 다운그레이드한다.

**그래서 막는 investigation 은 반드시 대응하는 `Open Decision` 을 가진다 — 그게 실제 blocker 다.** `Unknowns` 는 fact-finding 큐일 뿐 MVP-A 자동 게이트가 아니다(open-decisions.md "Unknown 은 자동 게이트가 아니다"); "막아야 하는데 아직 모른다"는 Unknown 으로만 두지 말고 Open Decision 으로 승격한다. investigation 문서 자체도 MVP-A 에서 게이트하지 않으므로, 링크된 Open Decision 이 없으면 아무것도 안 막힌다(silent fail-open 주의). 위 readiness 문단의 `blocks_mode → 게이트` 는 후속에서 자동화한다.

후속 확장에서는 다음을 파싱할 수 있다.

```txt
open investigation with blocks_mode <= target mode
→ readiness blocker

failed verification case
→ production-ready blocker

blocked verification case
→ next_actions에 환경/계정/담당자 요청 표시
```

즉, 초기에는 문서 handoff를 우선하고, 자동 게이트는 나중에 붙인다.

## 세션 Handoff 규칙

긴 조사는 세션이 끊길 것을 전제로 작성한다. 매 세션 종료 전 다음을 남긴다.

```txt
현재 상태
확인한 증거
아직 불확실한 점
다음 액션
막힌 이유
관련 ScreenSpec / Decision / Conflict 링크
```

금지:

```txt
조사 결과를 기억에만 두기
결론 없이 원본 링크만 남기기
테스트 로그를 남기고 해석을 안 쓰기
Open Decision을 resolve하지 않고 ScreenSpec을 임의 확정하기
실험 코드를 제품 코드에 섞고 추적 없이 방치하기
```

## Prototype / Spike 코드

조사 중 코드가 필요할 수 있다. 이 코드는 production path와 분리한다.

권장:

```txt
experiments/{domain}/{topic}/
docs/frontend-workflow/domains/{domain}/investigations/assets/
```

원칙:

```txt
prototype은 증거 수집용이다.
제품 코드로 승격하려면 ScreenSpec / readiness / allowed_paths를 다시 통과한다.
prototype 결과는 Investigation 문서의 Evidence 또는 Findings에 요약한다.
```

## MVP Placement

이 축은 기존 MVP 로드맵을 갈아엎지 않는다. 위치는 다음과 같다.

```txt
Input Skill
→ Input Reconciliation
→ Investigation / Verification
→ Open Decisions / Conflicts / ScreenSpec 업데이트
→ State
→ Readiness
→ Work
→ Validate
```

MVP-A에서 할 수 있는 것:

```txt
1. 설계 문서 작성
2. investigation / verification 템플릿 추가
3. auth 같은 golden scenario 문서 예시 추가
```

후속에서 할 수 있는 것:

```txt
1. artifact-manifest에 investigation / verification-matrix 등록
2. workflow-state가 open investigation과 failed verification을 집계
3. readiness가 blocks_mode를 반영
4. validate가 깨진 matrix / stale evidence를 검사
5. reconcile-input 스킬이 investigation-needed를 자동 생성
```

## 핵심 원칙

```txt
모든 원본 자료를 킷 안에 복사하지 않는다.
다음 세션이 판단할 수 있는 상태, 증거, 결론, blocker를 남긴다.

조사는 결정을 대체하지 않는다.
조사는 Open Decision을 resolve하기 위한 근거를 만든다.

플랫폼 검증은 기억이 아니라 matrix로 남긴다.
긴 작업은 세션 handoff를 기본값으로 설계한다.
```
