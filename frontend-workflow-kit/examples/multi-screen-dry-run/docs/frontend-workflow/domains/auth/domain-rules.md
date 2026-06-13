---
artifact_id: "auth-domain-rules"
artifact_type: domain-rules
domain: auth
status: draft
last_reviewed: 2026-06-12
---

# Auth Domain Rules

## 공통 규칙
- 로그인 화면(AUTH-001, `/(auth)/login`)은 인증 스택에 두고, 인증 성공 후에만 탭 영역으로 진입한다.
- 401/세션 만료 처리는 화면별로 구현하지 않고 API client/session layer 에서 처리하며, 필요 시 로그인으로 리다이렉트한다.
- 로그인 성공 후 이동 경로는 Navigation Map 을 따른다. 기본은 항상 홈(`/(tabs)/home`)이다 (D-204 resolved).
- 토큰·비밀번호·인증코드 등 민감정보는 로그·analytics·에러 메시지에 남기지 않는다.

## 데이터/계약
- 로그인은 `POST /auth/login` 단일 mutation 으로 처리하고, 성공 응답의 세션 토큰은 세션 저장소(session layer)가 단일 출처로 보관한다.
- 인증 상태는 화면 로컬 state 가 아니라 세션 layer 가 소유하며, 각 화면은 이를 구독한다.
- 폼 검증(필수값/형식)은 제출 전 클라이언트에서 1차 수행하고, 서버 검증 결과는 ErrorState/필드 에러로 환원한다.

## 용어
- "로그인" = login. "세션" = 인증 성공 후 유지되는 사용자 인증 상태.
- "인증 스택" = 탭 진입 전 로그인 등 인증 화면이 속한 네비게이션 영역.
