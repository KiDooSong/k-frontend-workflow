---
artifact_id: api-manifest
artifact_type: api-manifest
status: draft
last_reviewed: 2026-06-13
---

# API Manifest

> 미확정 API 의 단일 출처. 확정분은 OpenAPI/zod 로 이관한다. confidence: unknown|candidate|confirmed.
> 화면은 이 manifest 의 DTO 에 직접 의존하지 않는다 (fake hook + AsyncState 계약).

## Endpoints
| Method | Path | 용도 | Response (요약) | confidence |
|---|---|---|---|---|
| POST | /auth/login | 로그인 | { token, user } | candidate |
| GET | /home/summary | 홈 대시보드 요약 | { coupons, notices, reco } | unknown |
| GET | /coupons | 보유 쿠폰 목록 | { items: CouponDto[], page, size, hasNext } | candidate |
| GET | /coupons/{id} | 쿠폰 상세 | CouponDto | candidate |
| GET | /profile | 프로필 조회 | ProfileDto | unknown |
| PATCH | /profile | 프로필 수정 | ProfileDto | unknown |
| GET | /notices | 공지 목록 | NoticeDto[] | candidate |

## Notes
- /coupons 응답은 page envelope `{ items, page, size, hasNext }` 로 변경 (기본 size=20, 정렬=만료 임박 순, 서버 결정; IN-20260613-api-001). 이전 bare array(CouponDto[])는 대체됨.
- 페이지네이션 방식 결정(D-003)은 offset/page 로 좁혀 진행 중 (사람 확정 대기).
- 쿠폰 상태 enum(사용 가능/사용 완료/만료)은 서버를 단일 출처로 한다. 상태 탭(IN-20260613-planning-001)과 이 enum 의 1:1 매칭은 U-001(open) 의 응답 예시로 확인 — U-001 resolved 닫기는 사람.
