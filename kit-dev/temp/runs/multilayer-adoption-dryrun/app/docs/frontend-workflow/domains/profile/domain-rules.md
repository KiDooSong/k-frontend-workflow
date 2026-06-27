---
artifact_id: profile-domain-rules
artifact_type: domain-rules
domain: profile
status: draft
last_reviewed: 2026-06-21
---

# Profile Domain Rules (Clean Architecture)

## 공통 규칙
- 화면(View)은 ViewModel 의 AsyncState 만 의존한다. 화면에서 직접 fetch/매핑 금지.
- 도메인 규칙(검증/계산)은 use-case 에만 둔다. ViewModel·Repository 에 비즈니스 로직 분산 금지.
- Repository 인터페이스는 domain 계층 소유, 구현체는 data 계층 소유 (의존성 역전).

## 데이터/계약
- DTO 스키마: src/api/schemas/profile.schema.ts (zod). 도메인 엔티티는 Mapper 가 DTO→Entity 변환.
- 데이터 소스(원격)는 data/profile/datasources 에 격리. ViewModel 은 use-case 만 호출.

## 용어
- "프로필" = profile. Entity(도메인) ≠ DTO(서버 응답).
