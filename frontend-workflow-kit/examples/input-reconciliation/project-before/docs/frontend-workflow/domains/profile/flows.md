---
title: Profile Flows
domain: profile
status: draft
---

# Profile Flows

## 프로필 조회 / 편집
1. 마이 탭 진입 → 프로필 편집(PROFILE-001, `/(tabs)/my`).
2. `GET /profile` 호출 → 로딩 중 SkeletonList, 성공 시 현재 값으로 폼 채움.
3. 사용자가 필드 수정 후 제출 → 클라이언트 검증. 실패 시 필드 에러, 제출 중단.
4. 검증 통과 → `PATCH /profile` 호출.
5. 성공 → 프로필 캐시 invalidate + 성공 토스트. 실패 → ErrorState/필드 에러.

요약: 마이 진입 → `GET /profile` → 수정 → 검증 → `PATCH /profile` → 성공 시 토스트·캐시 갱신, 실패 시 에러.

> 편집 필드 범위(D-301)는 미확정. 확정 전까지 폼 필드 셋은 잠정이다.
