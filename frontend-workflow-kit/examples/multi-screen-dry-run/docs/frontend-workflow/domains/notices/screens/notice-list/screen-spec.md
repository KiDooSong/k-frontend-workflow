---
artifact_id: NOTICE-001-screen-spec
artifact_type: screen-spec
domain: notices
screen_id: NOTICE-001
route: /notices
status: draft
sources:
  - { type: planning, ref: figma-planning/notice-list-5 }
depends_on: [navigation-map]
last_reviewed: 2026-06-12
---

# ScreenSpec: 공지 목록

## Purpose
사용자가 서비스 공지를 최신순으로 확인한다.

## Entry Points
<!-- GENERATED:START nav-graph -->
<!-- DO NOT EDIT MANUALLY. Generated from Navigation Map and inbound Interaction Matrix route edges. -->
<!-- GENERATED:END nav-graph -->

## UI Sections
1. Header
2. Notice List
3. Empty State
4. Error State

## State Matrix
| State | Condition | UI |
|---|---|---|
| loading | query.isLoading | SkeletonList |
| empty | data.length === 0 | EmptyState |
| error | query.isError | ErrorState + Retry |
| success | data.length > 0 | NoticeList |
| disabled | 주요 액션 사용 조건 미충족 또는 요청 처리 중 | disabled control/state |
| refreshing | query.isRefreshing | RefreshControl |

## Interaction Matrix
| User Action | Trigger | Result | Analytics Event |
|---|---|---|---|
| 공지 항목 클릭 | Notice press | 상세 펼침 또는 이동 (형태 미정 — D-401) | notice_item_click |
| 새로고침 | pull to refresh | refetch | - |

## Mutation Matrix
없음

## Data Requirements
- 공지 목록(제목, 날짜, 본문 요약)

## API Candidates
- GET /notices (confidence: candidate)

## Copy Keys
| Key | 문구 | Status |
|---|---|---|
| notice.list.title | 공지사항 | confirmed |
| notice.list.empty | 등록된 공지가 없습니다 | confirmed |

## Accessibility
- 공지 항목 accessibilityRole, 날짜 포함 label

## Acceptance Criteria
- [ ] State Matrix 의 6개 상태가 모두 구현됨 → NoticeListScreen.test.tsx
- [ ] 공지 노출 형태(독립 화면/홈 섹션) 확정(D-401) 후 골격 진행

## Unknowns
| ID | Question | Status |
|---|---|---|
| U-401 | 공지 콘텐츠 출처(CMS/정적/관리자)는? | open |

## Open Decisions
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-401 | 공지를 독립 화면으로 둘지 홈 섹션으로 흡수할지 | 독립 화면 / 홈 섹션 | screen-skeleton | PM | open |
