---
artifact_id: "notices-domain-rules"
artifact_type: domain-rules
domain: notices
status: draft
last_reviewed: 2026-06-12
---

# Notices Domain Rules

## 공통 규칙
- 공지 목록(NOTICE-001, `/notices`)은 공지 콘텐츠를 시간순으로 보여주는 읽기 전용 화면이다.
- 401 처리는 화면별로 구현하지 않고 API client/session layer 에서 처리한다.
- 공지를 독립 화면으로 둘지 홈 섹션으로 흡수할지는 미확정이다(D-401 open). 확정 전 배치를 화면에서 임의 고정하지 않는다.
- 공지 콘텐츠 출처(CMS/정적/관리자)가 미정이므로(U-401) 콘텐츠 가공·필드를 화면에서 임의 가정하지 않는다.

## 데이터/계약
- 공지 목록은 `GET /notices` 로 조회하며, 읽기 전용이므로 mutation 은 두지 않는다.
- 화면은 API DTO 에 직접 의존하지 않고 도메인 모델로 환원해 사용한다.
- 빈 목록·로드 실패는 EmptyState/ErrorState 로 처리하고, 재시도(Retry)를 제공한다.

## 용어
- "공지" = notice. "공지 목록" = 사용자에게 노출되는 공지 콘텐츠 목록.
- "콘텐츠 출처" = 공지 본문을 제공하는 시스템(CMS/정적/관리자, U-401 확정 전).
