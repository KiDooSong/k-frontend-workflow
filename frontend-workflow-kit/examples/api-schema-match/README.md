# examples/api-schema-match — 검사 8 (API Candidates ↔ contract evidence 매칭) 회귀 픽스처

제안서 [api-schema-linking-decision.md](../../../temp/proposals/api-schema-linking-decision.md) 옵션 C 구현
검증용. 각 케이스는 독립 프로젝트 트리(docs/ + src/)이며, 검사 8 만 격리해 검증한다 — 나머지 검사
(1~7, 9~12)는 통과하도록 최소 구성했다(non-stub 이므로 Entry Points 의 nav-graph GENERATED 마커 포함,
status: draft 로 검사 7 회피).

| 케이스 | 기대 | 사유 |
|---|---|---|
| pass-zod | exit 0 | confirmed 후보 GET /coupons → manifest confirmed 행 + 레거시 Linked Schema=CouponListResponseSchema(zod export 존재) |
| pass-ts-type | exit 0 | confirmed 후보 GET /coupons → Linked Contract=CouponListResponse + Contract Kind=ts-type + Source 의 type export 존재 |
| pass-candidate-no-schema | exit 0 | candidate 전용(confirmed 0건) → 검사 8 무발화, contract evidence 없어도 통과 |
| pass-param-normalize | exit 0 | ScreenSpec `:id`/`[id]` ↔ manifest `{id}`/`{couponId}` 가 normEndpoint 정규화로 매칭 |
| fail-missing-schema | exit 1 (검사 8) | manifest 의 confirmed endpoint contract=TBD (미연결) |
| fail-missing-manifest-endpoint | exit 1 (검사 8) | confirmed 후보가 manifest ## Endpoints 에 미등록 |
| fail-missing-schema-export | exit 1 (검사 8) | zod contract=CouponListResponseSchema 인데 src/api/schemas/*.ts export 부재 |
| fail-duplicate-endpoint | exit 1 (검사 8) | 같은 (Method,Path) 가 다른 contract/kind/confidence 로 중복 선언(canonical 모순) |

실행:

    node scripts/validate.mjs --docs examples/api-schema-match/<case>/docs/frontend-workflow --src examples/api-schema-match/<case>/src

fail-* 는 반드시 "검사 8" 사유로만 실패해야 한다(다른 검사 오류 동반 금지).

## Contract 해소 규약 (검사 8)

- **권장 manifest 표:** `Method | Path | Operation ID | Confidence | Linked Contract | Contract Kind | Source`.
- **Contract Kind 허용값:** `zod | ts-type | openapi | manual | unknown`.
- **Zod 하위호환:** 기존 `Linked Schema` 5컬럼 표는 계속 `zod` 로 자동 추론된다. 이 경우 이름이
  `src/api/schemas/*.ts` 의 export(런타임 값: const/let/var/function/class/enum, 또는 값 재-export `export { X }`)로 해소돼야 한다.
- **TS type evidence:** `Contract Kind=ts-type` 은 `Source` 파일/디렉토리의 `export type Foo = ...` 또는
  `export interface Foo { ... }` 를 정적 contract evidence 로 인정한다. 명시적 type re-export
  (`export type { Foo }`, `export { type Foo }`)만 스캔한다. TS type evidence 는 런타임 validation evidence 가 아니다.
- **OpenAPI/manual/unknown:** contract evidence 종류를 기록하기 위한 호환 경로다. 이 PR 은 TS 타입에서 Zod/runtime validator 를 생성하지 않는다.
- **경로 파라미터 표기**는 `{id}`·`{couponId}`(OpenAPI)·`:id`(Express)·`[id]`(Expo Router)를 모두 `{}`
  로 정규화해 매칭한다. 단 화면 route(frontmatter.route)는 이 축에 섞지 않는다.
- **manifest 부재 시** 옛 전역 존재검사(zod 디렉토리/openapi.yaml 존재)로 폴백한다.