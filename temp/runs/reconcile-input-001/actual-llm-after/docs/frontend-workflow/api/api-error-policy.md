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
- offline (network-error): 네트워크 없음. 5xx 와 구분해 네트워크 전용 ErrorState + Retry 제공 (IN-20260613-qa-001).

## 화면 표현
- 기본 에러: ErrorState + Retry 버튼 (State Matrix 의 error 행).
- 네트워크 전용(offline/network-error): 네트워크 전용 ErrorState + Retry (State Matrix 의 offline 행). Retry 시 온라인 복귀하면 정상 로드.
- 빈 데이터: EmptyState (에러 아님).

## 미정
- (해소됨) 오프라인 전용(network-error) 진입 상태 UX 는 IN-20260613-qa-001 로 정의됨 — 위 "분류"·"화면 표현" 참조.
