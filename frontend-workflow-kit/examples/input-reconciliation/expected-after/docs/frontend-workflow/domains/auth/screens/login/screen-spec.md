---
artifact_id: AUTH-001-screen-spec
artifact_type: screen-spec
domain: auth
screen_id: AUTH-001
route: /(auth)/login
status: confirmed
approved_by: 박PM
approved_at: 2026-06-13
decision_id: D-204
sources:
  - { type: planning, ref: figma-planning/login-1 }
  - { type: meeting, ref: meeting/2026-06-13-login-redirect }
depends_on: [navigation-map]
last_reviewed: 2026-06-13
---

# ScreenSpec: 로그인 (expected-after)

## Purpose
사용자가 이메일과 비밀번호로 로그인한다. 성공 시 보호 라우트 진입 흐름(returnTo)을 재개한다.

## Entry Points
<!-- GENERATED:START nav-graph -->
<!-- DO NOT EDIT MANUALLY. Generated from Navigation Map and inbound Interaction Matrix route edges. -->
<!-- GENERATED:END nav-graph -->

## UI Sections
1. Header
2. Login Form (Email, Password)
3. Submit Button
4. Inline Error

## State Matrix
| State | Condition | UI |
|---|---|---|
| loading | mutation.isPending | Button spinner + 입력 비활성화 |
| empty | 초기 진입 | 빈 폼 |
| error | mutation.isError | Inline Error |
| success | mutation.isSuccess | Route Guard 이동 |
| disabled | 입력값 유효성 미충족 또는 mutation.isPending | Submit controls disabled |
| refreshing | 세션 재검증 중 | Button spinner |

## Interaction Matrix
| User Action | Trigger | Result | Analytics Event |
|---|---|---|---|
| 로그인 제출 | Submit press | /(tabs)/home 또는 returnTo 이동 (D-204) | login_submit |
| 비밀번호 표시 토글 | Eye icon press | 비밀번호 마스킹 토글 | - |

## Mutation Matrix
| Action | API | Optimistic | Invalidate QueryKeys | Success UI | Failure UI |
|---|---|---|---|---|---|
| 로그인 | useLogin (candidate) | no | sessionKeys.all | Route Guard 이동 | Inline Error |

## Data Requirements
- 이메일, 비밀번호 입력값
- 로그인 응답의 세션 토큰 (저장은 session layer 담당)
- returnTo (보호 라우트 redirect 진입 시) — 단일 출처는 Navigation Map Route Guard

## API Candidates
- POST /auth/login (confidence: candidate)

## Copy Keys
| Key | 문구 | Status |
|---|---|---|
| auth.login.title | 로그인 | confirmed |
| auth.login.submit | 로그인 | confirmed |
| auth.login.error.invalid | 이메일 또는 비밀번호가 올바르지 않습니다 | confirmed |

## Accessibility
- 입력 필드: accessibilityLabel(이메일/비밀번호), 비밀번호는 secureTextEntry
- Submit: accessibilityState disabled 반영

## Acceptance Criteria
- [ ] State Matrix 의 6개 상태가 모두 구현됨 → LoginScreen.test.tsx
- [ ] 로그인 성공 시 returnTo 가 있으면 returnTo, 없으면 /(tabs)/home 으로 이동 (D-204)
- [ ] 잘못된 자격 증명 시 Inline Error 표시

## Unknowns
| ID | Question | Status |
|---|---|---|
| U-201 | 소셜 로그인(카카오/애플)은 MVP 범위에 포함되는가? | resolved |

## Open Decisions
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-204 | 로그인 성공 후 이동 위치 | → 기본 홈 + returnTo 우선 | final-fixture-ui | PM | resolved |
