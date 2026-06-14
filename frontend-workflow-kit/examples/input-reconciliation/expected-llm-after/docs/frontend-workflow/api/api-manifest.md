---
artifact_id: api-manifest
artifact_type: api-manifest
status: draft
last_reviewed: 2026-06-13
---

# API Manifest — expected-llm-after

> IN-20260613-api-001 반영: `GET /coupons` **응답 형태**가 page envelope 으로 바뀌었다 (사실 = simple-update).
> 단 화면 페이지네이션 **방식**은 D-003(**open**) 으로 남는다 — LLM 은 후보만 좁히고 닫지 않는다.
> 화면은 이 DTO 에 직접 의존하지 않는다 (fake hook + AsyncState).

## Endpoints
<!-- 검사 8 은 앞 5컬럼(Method|Path|Confidence|Linked Schema|Source)만 읽는다 — 용도·Response (요약)는 사람용 참고(검사 무관).
     reconcile 후(llm): 여전히 candidate → Linked Schema=TBD. GET /coupons 응답=page envelope(아래 Pagination 절). -->
| Method | Path | Confidence | Linked Schema | Source | 용도 | Response (요약) |
|---|---|---|---|---|---|---|
| POST | /auth/login | candidate | TBD | - | 로그인 | { token, user } |
| GET | /home/summary | unknown | TBD | - | 홈 대시보드 요약 | { coupons, notices, reco } |
| GET | /coupons | candidate | TBD | - | 보유 쿠폰 목록 | { items: CouponDto[], page, size, hasNext } |
| GET | /coupons/{id} | candidate | TBD | - | 쿠폰 상세 | CouponDto |
| GET | /profile | unknown | TBD | - | 프로필 조회 | ProfileDto |
| PATCH | /profile | unknown | TBD | - | 프로필 수정 | ProfileDto |
| GET | /notices | candidate | TBD | - | 공지 목록 | NoticeDto[] |

## Pagination (응답 형태=사실, 화면 방식=D-003 open)
- **응답 형태 (사실 · IN-api-001)**: `GET /coupons` 는 page envelope `{ items, page, size, hasNext }` 를 돌려준다. 기본 size = 20. 정렬은 만료 임박 순(서버 결정).
- **화면 페이지네이션 방식**: `offset/page` 가 유력 후보다(IN-api-001). 단 이는 **D-003 (open)** — 사람이 닫기 전까지 확정이 아니다. (LLM 은 후보만 좁힘)
- 화면 상태(`page`, `hasNext`)는 fake hook 의 AsyncState 로 표현한다 (DTO 직접 의존 금지) — 방식 확정과 무관히 유지되는 경계.

## Notes
- 쿠폰 상태 enum(사용 가능/사용 완료/만료)은 서버를 단일 출처로 한다. 상태 탭(planning)과 enum 매칭은 **U-001(open)** 의 응답 예시로 확인 가능 — U-001 을 `resolved` 로 닫는 것은 사람.
- confidence 는 여전히 candidate — `confirmed` 승격은 zod 스키마/OpenAPI 가 생기는 api-integrated 단계에서. (그 전에 screen-spec 의 API Candidate 를 confirmed 로 올리면 validate 검사 8 에 걸린다.)
