---
artifact_id: "home-domain-rules"
artifact_type: domain-rules
domain: home
status: draft
last_reviewed: 2026-06-12
---

# Home Domain Rules

## 공통 규칙
- 홈 대시보드(HOME-001, `/(tabs)/home`)는 인증된 사용자의 첫 진입 화면이며, 탭 영역의 기본 탭이다.
- 홈은 여러 도메인 요약(쿠폰 요약·공지·추천)을 모으는 집계 화면이다. 각 위젯의 상세 비즈니스 규칙은 해당 도메인 규칙을 따른다.
- 위젯 구성/우선순위는 미확정이다(D-101 open). 확정 전에는 위젯 목록·순서를 화면에서 임의 고정하지 않는다.
- 401 처리는 화면별로 구현하지 않고 API client/session layer 에서 처리한다.

## 데이터/계약
- 홈 요약은 `GET /home/summary` 단일 조회로 가져오는 것을 기본으로 하되, 스펙·필드 확정 출처가 미정이다(U-101 open).
- 각 위젯에서 상세로 이동할 때는 해당 도메인 화면 라우트를 사용한다(예: 쿠폰 요약 → `/(tabs)/coupons`, 공지 → `/notices`).
- 홈은 요약 데이터만 소유하고, 상세 데이터의 캐시·invalidation 은 각 도메인이 소유한다.

## 용어
- "대시보드" = dashboard. "위젯" = 홈에 모이는 도메인 요약 블록(쿠폰 요약·공지·추천).
- "홈 요약" = `GET /home/summary` 로 내려오는 집계 데이터.
