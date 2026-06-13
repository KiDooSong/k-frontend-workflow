---
title: API Error Policy (expected-after)
status: draft
---

# API Error Policy — expected-after

> IN-20260613-qa-001 반영: network/offline 분기와 Retry 동작 추가.

## 분류
- 4xx (클라이언트): 사용자 입력/권한 문제. 401 은 session layer 가 토큰 갱신/로그아웃으로 처리.
- 5xx (서버): 일시 오류로 간주, Retry 제공.
- **network-error / offline (신규)**: 네트워크 연결 없음. 일반 5xx 와 구분해 네트워크 전용 ErrorState 를 보여준다.

## 화면 표현
- 기본 서버 에러: ErrorState + Retry (State Matrix 의 error 행).
- **오프라인(network-error): 네트워크 전용 ErrorState + Retry (State Matrix 의 offline 행).**
- Retry 시 온라인 복귀하면 자동 재요청해 정상 상태로 전환한다.
- 빈 데이터: EmptyState (에러 아님).

## 적용 화면
- COUPON-001: State Matrix 에 `offline` 행 추가됨. 다른 목록/대시보드 화면도 동일 정책을 따른다.
