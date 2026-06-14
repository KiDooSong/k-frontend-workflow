---
artifact_id: api-manifest
artifact_type: api-manifest
status: draft              # 문서 라이프사이클: missing|draft|review|confirmed|implemented|verified|deprecated
last_reviewed: "{YYYY-MM-DD}"
---

<!--
  API Manifest — 미확정 API 의 단일 출처. ScreenSpec 의 ## API Candidates 가 (Method, Path) 로 이 표를 참조하고,
  validate 검사 8 이 confirmed 후보를 이 표의 endpoint → Linked Schema(zod export)로 해소한다.

  ## Endpoints 작성 규칙 (검사 8 계약):
  - 표 헤더(Method | Path | Confidence | Linked Schema | Source)는 바꾸지 않는다 — 검사 8 이 헤더로 표를 파싱한다.
  - Confidence: unknown | candidate | confirmed. 추측으로 confirmed 로 올리지 않는다 (승격은 사람/확정 입력).
  - Linked Schema: src/api/schemas/*.ts 의 zod export 심볼 이름(런타임 값 — const/function/class/enum 또는 값 재-export).
      confirmed endpoint 는 반드시 실재하는 export 로 해소돼야 한다. 아직 없으면 TBD(또는 빈칸)로 두되, 그 행의 Confidence 도 confirmed 가 아니어야 한다.
      (타입 전용 export `export type`/`interface` 는 인정하지 않는다 — 사실 출처는 런타임 zod 값.)
  - Source: 정보용 컬럼(검사에 쓰지 않음). Source=openapi 라도 Linked Schema 는 여전히 zod export 로 해소된다
      — OpenAPI components.schemas 기반 해소는 아직 미구현(known limitation).
  - (Method, Path) 당 canonical 행 1개만 둔다. 같은 endpoint 를 다른 Linked Schema/Confidence 로 중복 선언하면 검사 8 이 충돌로 막는다.
  - 경로 파라미터 표기 {id}·:id·[id] 는 검사 8 이 모두 동일하게 정규화한다. 화면 route(frontmatter.route)는 이 축에 섞지 않는다.
-->

# API Manifest

> 미확정 API 의 단일 출처. 확정분의 사실 출처는 zod 스키마(src/api/schemas/*.ts). 화면은 이 DTO 에 직접 의존하지 않는다 (fake hook + AsyncState 계약).

## Endpoints
| Method | Path | Confidence | Linked Schema | Source |
|---|---|---|---|---|
| {GET} | {/path} | candidate | TBD | {planning} |

## Notes
- {엔드포인트 관련 미결 사항(페이지네이션 방식·상태 enum 단일출처 등). 결정이 필요한 선택은 화면 Open Decisions 로.}
