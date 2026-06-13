---
title: API Error Policy
status: draft
---

# API Error Policy

> 화면 전역의 에러 처리 정책. 각 ScreenSpec State Matrix 의 error 행이 이 정책을 따른다.

## 분류
- 4xx (클라이언트): 사용자 입력/권한 문제. 401 은 session layer 가 토큰 갱신/로그아웃으로 처리.
- 5xx (서버): 일시 오류로 간주, Retry 제공.
- network/timeout: 연결 실패. Retry 제공.

## 화면 표현
- 기본 에러: ErrorState + Retry 버튼 (State Matrix 의 error 행).
- 빈 데이터: EmptyState (에러 아님).

## 미정
- 오프라인 전용(network-error) 진입 상태의 별도 UX 는 아직 정의되지 않았다.
