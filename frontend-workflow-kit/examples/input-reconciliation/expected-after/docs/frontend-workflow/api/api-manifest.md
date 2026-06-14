---
artifact_id: api-manifest
artifact_type: api-manifest
status: draft
last_reviewed: 2026-06-13
---

# API Manifest — expected-after

> IN-20260613-api-001 반영: `GET /coupons` 응답이 page envelope 으로 변경됨.
> 화면은 이 DTO 에 직접 의존하지 않는다 (fake hook + AsyncState).

## Endpoints
<!-- 검사 8 은 앞 5컬럼(Method|Path|Confidence|Linked Schema|Source)만 읽는다 — 용도·Response (요약)는 사람용 참고(검사 무관).
     reconcile 후(after): 여전히 candidate → Linked Schema=TBD(confirmed 승격은 api-integrated 단계). GET /coupons 가 page envelope 으로 바뀐 사실은 아래 Pagination Policy 참조. -->
| Method | Path | Confidence | Linked Schema | Source | 용도 | Response (요약) |
|---|---|---|---|---|---|---|
| POST | /auth/login | candidate | TBD | - | 로그인 | { token, user } |
| GET | /home/summary | unknown | TBD | - | 홈 대시보드 요약 | { coupons, notices, reco } |
| GET | /coupons | candidate | TBD | - | 보유 쿠폰 목록 | { items: CouponDto[], page, size, hasNext } |
| GET | /coupons/{id} | candidate | TBD | - | 쿠폰 상세 | CouponDto |
| GET | /profile | unknown | TBD | - | 프로필 조회 | ProfileDto |
| PATCH | /profile | unknown | TBD | - | 프로필 수정 | ProfileDto |
| GET | /notices | candidate | TBD | - | 공지 목록 | NoticeDto[] |

## Pagination Policy (신규 — D-003)
- 방식: offset/page (page, size). 기본 size = 20.
- `hasNext` 로 다음 페이지 존재 여부를 노출한다.
- 화면 상태(`page`, `hasNext`)는 fake hook 의 AsyncState 로 표현한다 (DTO 직접 의존 금지).

## Notes
- 쿠폰 상태 enum(사용 가능/사용 완료/만료)은 서버를 단일 출처로 한다. 상태 탭(planning)과 enum 매칭은 U-001 응답 예시로 확인됨.
- confidence 는 여전히 candidate — `confirmed` 승격은 zod 스키마/OpenAPI 가 생기는 api-integrated 단계에서. (그 전에 screen-spec 의 API Candidate 를 confirmed 로 올리면 validate 검사 8 에 걸린다.)
