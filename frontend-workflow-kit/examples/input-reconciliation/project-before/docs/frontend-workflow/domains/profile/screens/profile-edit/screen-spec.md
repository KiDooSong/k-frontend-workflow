---
artifact_id: PROFILE-001-screen-spec
artifact_type: screen-spec
domain: profile
screen_id: PROFILE-001
route: /(tabs)/my
status: draft
sources:
  - { type: planning, ref: figma-planning/profile-7 }
depends_on: [navigation-map]
last_reviewed: 2026-06-12
---

# ScreenSpec: 프로필 편집

## Purpose
사용자가 자신의 프로필 정보를 확인하고 수정한다. (편집 범위 미확정 — D-301)

## Entry Points
<!-- GENERATED:START nav-graph -->
<!-- DO NOT EDIT MANUALLY. Generated from Navigation Map and inbound Interaction Matrix route edges. -->
<!-- GENERATED:END nav-graph -->

## UI Sections
1. Profile Header (Avatar)
2. Editable Fields (범위 미정 — D-301)
3. Save Button

## State Matrix
| State | Condition | UI |
|---|---|---|
| loading | query.isLoading | SkeletonList |
| empty | 데이터 없음 | EmptyState |
| error | query.isError | ErrorState + Retry |
| success | data 존재 | Profile Form |
| disabled | 저장 가능 조건 미충족 또는 mutation.isPending | Save control disabled |
| refreshing | query.isRefreshing | RefreshControl |

## Interaction Matrix
| User Action | Trigger | Result | Analytics Event |
|---|---|---|---|
| 저장 | Save press | 프로필 저장 (Mutation) | profile_save |
| 아바타 변경 | Avatar press | 이미지 선택 (범위 미정 — D-301) | - |

## Mutation Matrix
| Action | API | Optimistic | Invalidate QueryKeys | Success UI | Failure UI |
|---|---|---|---|---|---|
| 프로필 수정 | useUpdateProfile (candidate) | no | profileKeys.all | 토스트 | 에러 토스트 |

## Data Requirements
- 프로필 필드 (닉네임·이메일·아바타 등 — 범위는 D-301 에서 확정)

## API Candidates
- GET /profile (confidence: unknown)
- PATCH /profile (confidence: unknown)

## Copy Keys
| Key | 문구 | Status |
|---|---|---|
| profile.edit.title | 프로필 편집 | confirmed |
| profile.edit.save | 저장 | confirmed |

## Accessibility
- 입력 필드 label, Save accessibilityState 반영

## Acceptance Criteria
- [ ] 편집 범위 확정(D-301) 전에는 문서까지만 진행한다
- [ ] State Matrix 의 6개 상태가 모두 구현됨 (확정 후)

## Unknowns
| ID | Question | Status |
|---|---|---|
| U-301 | 비밀번호 변경을 이 화면에 포함하나, 별도 화면인가? | open |

## Open Decisions
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-301 | 프로필 편집 범위/필드 확정(닉네임·이메일·아바타·비밀번호 변경 포함 여부) | TBD | route-skeleton | PM | open |
