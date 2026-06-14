# examples/api-schema-match — 검사 8 (API Candidates ↔ 스키마 매칭) 회귀 픽스처

제안서 [api-schema-linking-decision.md](../../../temp/proposals/api-schema-linking-decision.md) 옵션 C 구현
검증용. 각 케이스는 독립 프로젝트 트리(docs/ + src/)이며, 검사 8 만 격리해 검증한다 — 나머지 검사
(1~7, 9~12)는 통과하도록 최소 구성했다(non-stub 이므로 Entry Points 의 nav-graph GENERATED 마커 포함,
status: draft 로 검사 7 회피).

| 케이스 | 기대 | 사유 |
|---|---|---|
| pass-zod | exit 0 | confirmed 후보 GET /coupons → manifest confirmed 행 + Linked Schema=CouponListResponseSchema(zod export 존재) |
| fail-missing-schema | exit 1 (검사 8) | manifest 의 confirmed endpoint Linked Schema=TBD (미연결) |
| fail-missing-manifest-endpoint | exit 1 (검사 8) | confirmed 후보가 manifest ## Endpoints 에 미등록 |
| fail-missing-schema-export | exit 1 (검사 8) | Linked Schema=CouponListResponseSchema 인데 src/api/schemas/*.ts export 부재 |
| pass-candidate-no-schema | exit 0 | candidate 전용(confirmed 0건) → 검사 8 무발화, 스키마 없어도 통과 |

실행:

    node scripts/validate.mjs --docs examples/api-schema-match/<case>/docs/frontend-workflow --src examples/api-schema-match/<case>/src

fail-* 는 반드시 "검사 8" 사유로만 실패해야 한다(다른 검사 오류 동반 금지).
