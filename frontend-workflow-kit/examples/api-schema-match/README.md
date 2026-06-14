# examples/api-schema-match — 검사 8 (API Candidates ↔ 스키마 매칭) 회귀 픽스처

제안서 [api-schema-linking-decision.md](../../../temp/proposals/api-schema-linking-decision.md) 옵션 C 구현
검증용. 각 케이스는 독립 프로젝트 트리(docs/ + src/)이며, 검사 8 만 격리해 검증한다 — 나머지 검사
(1~7, 9~12)는 통과하도록 최소 구성했다(non-stub 이므로 Entry Points 의 nav-graph GENERATED 마커 포함,
status: draft 로 검사 7 회피).

| 케이스 | 기대 | 사유 |
|---|---|---|
| pass-zod | exit 0 | confirmed 후보 GET /coupons → manifest confirmed 행 + Linked Schema=CouponListResponseSchema(zod export 존재) |
| pass-candidate-no-schema | exit 0 | candidate 전용(confirmed 0건) → 검사 8 무발화, 스키마 없어도 통과 |
| pass-param-normalize | exit 0 | ScreenSpec `:id`/`[id]` ↔ manifest `{id}`/`{couponId}` 가 normEndpoint 정규화로 매칭 |
| fail-missing-schema | exit 1 (검사 8) | manifest 의 confirmed endpoint Linked Schema=TBD (미연결) |
| fail-missing-manifest-endpoint | exit 1 (검사 8) | confirmed 후보가 manifest ## Endpoints 에 미등록 |
| fail-missing-schema-export | exit 1 (검사 8) | Linked Schema=CouponListResponseSchema 인데 src/api/schemas/*.ts export 부재 |
| fail-duplicate-endpoint | exit 1 (검사 8) | 같은 (Method,Path) 가 다른 Linked Schema 로 중복 선언(canonical 모순) |

실행:

    node scripts/validate.mjs --docs examples/api-schema-match/<case>/docs/frontend-workflow --src examples/api-schema-match/<case>/src

fail-* 는 반드시 "검사 8" 사유로만 실패해야 한다(다른 검사 오류 동반 금지).

## 스키마 해소 규약 (검사 8)

- **사실 출처는 zod export 심볼.** Linked Schema 이름이 `src/api/schemas/*.ts` 의 export(런타임 값:
  const/let/var/function/class/enum, 또는 값 재-export `export { X }`)로 해소돼야 한다. 타입 전용
  export(`export type`/`interface`, `export type { X }`)와 주석 처리된 export 는 인정하지 않는다.
- **OpenAPI 는 known limitation.** manifest 의 `Source` 컬럼은 정보용일 뿐 검사에 쓰지 않는다.
  `Source=openapi` 행이라도 Linked Schema 는 여전히 zod export 로 해소돼야 한다 — OpenAPI
  `components.schemas` 기반 해소는 아직 구현하지 않았다(제안서 OD-5 옵트인 후속).
- **경로 파라미터 표기**는 `{id}`·`{couponId}`(OpenAPI)·`:id`(Express)·`[id]`(Expo Router)를 모두 `{}`
  로 정규화해 매칭한다. 단 화면 route(frontmatter.route)는 이 축에 섞지 않는다.
- **manifest 부재 시** 옛 전역 존재검사(zod 디렉토리/openapi.yaml 존재)로 폴백한다.
