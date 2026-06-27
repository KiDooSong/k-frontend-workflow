---
artifact_id: PROFILE-001-screen-spec
artifact_type: screen-spec
domain: profile
screen_id: PROFILE-001
route: /(tabs)/profile
status: confirmed
approved_by: 김PM
approved_at: 2026-06-20
decision_id: D-101
sources:
  - { type: planning, ref: figma-planning/profile-slide-3 }
depends_on: [navigation-map]
last_reviewed: 2026-06-20
---

# ScreenSpec: 프로필

## Purpose
사용자가 자신의 프로필(이름/이메일/등급)을 확인한다.

## Entry Points
<!-- GENERATED:START nav-graph -->
<!-- 직접 작성하지 마세요. -->
- 하단 탭 > 마이 (navigation-map: Tabs)
<!-- GENERATED:END nav-graph -->

## UI Sections
1. Header
2. Profile Card
3. Error State

## State Matrix
| State | Condition | UI |
|---|---|---|
| loading | vm.status === 'loading' | SkeletonCard |
| success | vm.status === 'success' | ProfileCard |
| empty | vm.profile === null | EmptyState |
| error | vm.status === 'error' | ErrorState + Retry |

## Interaction Matrix
| User Action | Trigger | Result | Analytics Event |
|---|---|---|---|
| 새로고침 | pull to refresh | refetch | profile_refresh |
| 재시도 | ErrorState button | refetch | - |

## Mutation Matrix
없음

## Data Requirements
- 프로필: 이름, 이메일, 등급

## API Candidates
- GET /profile (confidence: confirmed)

## Copy Keys
| Key | 문구 | Status |
|---|---|---|
| profile.title | 프로필 | confirmed |

## Accessibility
- ProfileCard: accessibilityRole="summary"

## Acceptance Criteria
- [ ] State Matrix 의 4개 상태가 모두 구현됨 → ProfileScreen.test.tsx

## Unknowns
없음

## Open Decisions
없음
