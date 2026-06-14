---
artifact_id: "{domain}-domain-rules"
artifact_type: domain-rules
domain: "{domain}"
status: draft
last_reviewed: "{YYYY-MM-DD}"
---

<!--
  도메인(비즈니스 영역)별 규칙. 화면 패턴(list/form/detail)과 분리한다.
  화면 하나는 도메인 1개 + 패턴 1개를 갖는다 (예: 쿠폰 목록 = coupons × list).
  여기에는 이 도메인 화면 전체에 공통으로 적용되는 규칙만 적는다.
-->

# {Domain} Domain Rules

## 공통 규칙
- {예: 401 처리는 화면별로 구현하지 않고 API client/session layer 에서 처리한다.}
- {예: 성공 후 이동 경로는 Navigation Map 을 따른다.}
- {예: 민감정보(토큰/비밀번호/인증코드)는 로그에 남기지 않는다.}

## 데이터/계약
- {이 도메인의 query key factory 위치, invalidation 정책 등}

## 용어
- {도메인 용어 통일 — CONTEXT.md (도메인 용어집, CONTEXT-FORMAT 기준) 와 연결}
