---
artifact_id: "profile-domain-rules"
artifact_type: domain-rules
domain: profile
status: draft
last_reviewed: 2026-06-12
---

# Profile Domain Rules

## 공통 규칙
- 프로필 편집(PROFILE-001, `/(tabs)/my`)은 마이 탭의 진입 화면이며, 인증된 사용자만 접근한다.
- 401 처리는 화면별로 구현하지 않고 API client/session layer 에서 처리한다.
- 편집 가능한 필드 범위(닉네임·이메일·아바타·비밀번호 변경 포함 여부)는 미확정이다(D-301 open). 확정 전 화면에서 필드 셋을 임의 고정하지 않는다.
- 비밀번호·인증 관련 민감정보는 로그·analytics 에 남기지 않는다.

## 데이터/계약
- 프로필 조회는 `GET /profile`, 수정은 `PATCH /profile` 로 처리한다. 조회(query)와 수정(mutation)은 분리한다.
- 수정 성공 시 프로필 캐시를 invalidate 하고, 성공/실패 후 토스트·이동은 ScreenSpec 의 Mutation Matrix 를 따른다.
- 폼 검증(필수값/형식)은 제출 전 클라이언트에서 1차 수행하고, 서버 검증 결과는 필드 에러로 환원한다.

## 용어
- "프로필" = profile. "마이" = 프로필을 포함한 사용자 개인 영역 탭.
- "프로필 편집" = 닉네임·이메일·아바타 등 사용자 정보 수정(범위 D-301 확정 전).
