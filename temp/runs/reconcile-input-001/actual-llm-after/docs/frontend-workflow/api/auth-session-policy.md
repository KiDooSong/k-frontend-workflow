---
title: Auth & Session Policy
status: draft
---

# Auth & Session Policy

인증·세션 처리의 횡단 정책이다. 화면별 ScreenSpec 은 이 정책을 전제로 하며, 여기 정의된 동작을 화면에서 중복 구현하지 않는다.

## 401 / 토큰 갱신
- 401 응답과 토큰 갱신은 **session layer(API client)에서 단일하게 처리**한다. 각 화면에서 401 분기나 재시도·재발급 로직을 구현하지 않는다.
- 토큰 갱신에 실패하면 세션을 종료하고 로그인(`/(auth)/login`)으로 보낸다. 이 리다이렉트 동작 자체는 session layer 가 트리거한다.

## 토큰 저장
- 로그인 성공 응답의 세션 토큰은 session layer 가 단일 출처로 보관한다. 화면 로컬 state 에 토큰을 복제하지 않는다.
- 토큰은 안전한 저장소(secure storage)에 보관하며, 일반 로그/캐시/쿼리 파라미터에 노출하지 않는다.

## 보호 라우트 / redirect & returnTo
- 미인증 상태로 보호 라우트에 진입하면 로그인으로 redirect 하고, 인증 성공 후 원래 목적지로 복귀하기 위해 `returnTo` 개념을 사용한다.
- **단, redirect 규칙과 returnTo 분기의 단일 출처는 Navigation Map 의 Route Guard 다.** 이 문서는 정책 의도만 기술하며, 구체적인 경로·가드 동작은 navigation-map 을 따른다. 여기서 경로를 임의로 정의하지 않는다.

## 민감정보 로깅 금지
- 토큰·비밀번호·인증코드 등 민감정보는 로그·analytics 이벤트·에러 메시지에 남기지 않는다.
- 에러 리포팅 시 요청 헤더/바디에서 인증 관련 필드는 마스킹한다.
