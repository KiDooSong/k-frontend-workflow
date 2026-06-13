---
title: Auth Flows
domain: auth
status: draft
---

# Auth Flows

## 로그인
1. 사용자가 로그인 화면(AUTH-001, `/(auth)/login`)에서 아이디·비밀번호를 입력한다.
2. 제출 → 클라이언트 검증(필수값/형식). 실패 시 필드 에러 표시, 제출 중단.
3. 검증 통과 → `POST /auth/login` 호출.
4. 성공 → 세션 layer 가 토큰 저장 → 항상 홈(`/(tabs)/home`)으로 이동 (D-204).
5. 실패(401/검증 실패) → 로그인 화면 유지 + ErrorState/필드 에러 표시.

요약: 로그인 입력 → 검증 → `POST /auth/login` → 성공 시 홈(`/(tabs)/home`), 실패 시 에러.

## 세션 만료
1. 보호된 화면에서 API 가 401 반환.
2. session layer 가 세션 폐기 → 로그인(`/(auth)/login`)으로 리다이렉트.
