---
title: Notices Flows
domain: notices
status: draft
---

# Notices Flows

## 공지 목록 조회
1. 진입점(홈 공지 위젯 등)에서 공지 목록(NOTICE-001, `/notices`)으로 이동.
2. `GET /notices` 호출 → 로딩 중 SkeletonList.
3. 성공 → 공지 목록 렌더. 비어 있으면 EmptyState.
4. 실패 → ErrorState + Retry.

요약: 공지 진입 → `GET /notices` → 성공 시 목록, 비어있으면 EmptyState, 실패 시 ErrorState·Retry.

> 독립 화면 vs 홈 섹션 흡수(D-401), 콘텐츠 출처(U-401)는 미확정.
