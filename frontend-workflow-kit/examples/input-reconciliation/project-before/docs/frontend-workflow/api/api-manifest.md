---
artifact_id: api-manifest
artifact_type: api-manifest
status: draft
last_reviewed: 2026-06-12
---

# API Manifest

> 미확정 API 의 단일 출처. 확정분은 OpenAPI/zod 로 이관한다. confidence: unknown|candidate|confirmed.
> 화면은 이 manifest 의 DTO 에 직접 의존하지 않는다 (fake hook + AsyncState 계약).

## Endpoints
| Method | Path | 용도 | Response (요약) | confidence |
|---|---|---|---|---|
| POST | /auth/login | 로그인 | { token, user } | candidate |
| GET | /home/summary | 홈 대시보드 요약 | { coupons, notices, reco } | unknown |
| GET | /coupons | 보유 쿠폰 목록 | CouponDto[] | candidate |
| GET | /coupons/{id} | 쿠폰 상세 | CouponDto | candidate |
| GET | /profile | 프로필 조회 | ProfileDto | unknown |
| PATCH | /profile | 프로필 수정 | ProfileDto | unknown |
| GET | /notices | 공지 목록 | NoticeDto[] | candidate |

## Notes
- /coupons 응답은 현재 bare array(CouponDto[]). 페이지네이션 정책 미정 (D-003).
- 쿠폰 상태 enum(사용 가능/사용 완료/만료)은 서버를 단일 출처로 한다.
