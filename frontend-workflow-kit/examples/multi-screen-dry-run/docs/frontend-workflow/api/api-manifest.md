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
<!-- 검사 8 은 앞 5컬럼(Method|Path|Confidence|Linked Schema|Source)만 읽는다 — 용도·Response (요약)는 사람용 참고(검사 무관).
     Linked Schema 는 레거시 zod export 컬럼이다. 새 표는 Linked Contract + Contract Kind 를 쓸 수 있다. 이 예제는 전부 candidate/unknown 이라 TBD(미연결). -->
| Method | Path | Confidence | Linked Schema | Source | 용도 | Response (요약) |
|---|---|---|---|---|---|---|
| POST | /auth/login | candidate | TBD | - | 로그인 | { token, user } |
| GET | /home/summary | unknown | TBD | - | 홈 대시보드 요약 | { coupons, notices, reco } |
| GET | /coupons | candidate | TBD | - | 보유 쿠폰 목록 | CouponDto[] |
| GET | /coupons/{id} | candidate | TBD | - | 쿠폰 상세 | CouponDto |
| GET | /profile | unknown | TBD | - | 프로필 조회 | ProfileDto |
| PATCH | /profile | unknown | TBD | - | 프로필 수정 | ProfileDto |
| GET | /notices | candidate | TBD | - | 공지 목록 | NoticeDto[] |

## Notes
- /coupons 응답은 현재 bare array(CouponDto[]). 페이지네이션 정책 미정 (D-003).
- 쿠폰 상태 enum(사용 가능/사용 완료/만료)은 서버를 단일 출처로 한다.
