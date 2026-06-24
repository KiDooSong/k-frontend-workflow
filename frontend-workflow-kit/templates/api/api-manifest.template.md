---
artifact_id: api-manifest
artifact_type: api-manifest
status: draft              # 문서 라이프사이클: missing|draft|review|confirmed|implemented|verified|deprecated
last_reviewed: "{YYYY-MM-DD}"
---

<!--
  API Manifest — 미확정 API 의 단일 출처. ScreenSpec 의 ## API Candidates 가 (Method, Path) 로 이 표를 참조하고,
  validate 검사 8 이 confirmed 후보를 이 표의 endpoint → Linked Contract evidence 로 해소한다.

  ## Endpoints 작성 규칙 (검사 8 계약):
  - 권장 표 헤더: Method | Path | Operation ID | Confidence | Linked Contract | Contract Kind | Source.
  - Confidence: unknown | candidate | confirmed. 추측으로 confirmed 로 올리지 않는다 (승격은 사람/확정 입력).
  - Contract Kind 허용값: zod | ts-type | openapi | manual | unknown.
  - zod: src/api/schemas/*.ts 의 런타임 export 심볼 이름(const/function/class/enum 또는 값 재-export).
      레거시 표의 Linked Schema 컬럼은 계속 zod 로 자동 추론된다.
  - ts-type: Source 경로의 `export type Foo = ...` 또는 `export interface Foo { ... }` 정적 evidence.
      명시적 type re-export(`export type { Foo }`, `export { type Foo }`)만 스캔한다. TS type evidence 는 런타임 validation evidence 가 아니다.
  - openapi/manual/unknown: contract evidence 종류를 기록하기 위한 호환 경로다. 이 PR 은 TS 타입에서 런타임 validator 를 생성하지 않는다.
  - Source: ts-type 일 때는 파일/디렉토리 경로를 적는다(예: src/api/types/coupon.ts). zod 레거시는 정보용으로 유지 가능.
  - (Method, Path) 당 canonical 행 1개만 둔다. 같은 endpoint 를 다른 contract/kind/confidence 로 중복 선언하면 검사 8 이 충돌로 막는다.
  - 경로 파라미터 표기 {id}·:id·[id] 는 검사 8 이 모두 동일하게 정규화한다. 화면 route(frontmatter.route)는 이 축에 섞지 않는다.
-->

# API Manifest

> 미확정 API 의 단일 출처. 확정분의 사실 출처는 Linked Contract + Contract Kind. 화면은 DTO 에 직접 의존하지 않는다 (fake hook + AsyncState 계약).

## Endpoints
| Method | Path | Operation ID | Confidence | Linked Contract | Contract Kind | Source |
|---|---|---|---|---|---|---|
| {GET} | {/path} | {operationId} | candidate | TBD | unknown | {planning} |

## Notes
- {엔드포인트 관련 미결 사항(페이지네이션 방식·상태 enum 단일출처 등). 결정이 필요한 선택은 화면 Open Decisions 로.}
