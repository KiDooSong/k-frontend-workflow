# Run log — 검사 8 강화: API Candidates(confirmed) ↔ api-manifest endpoint ↔ zod schema export

> 목적(한 줄): `validate.mjs` 검사 8 을 "zod 스키마 디렉토리 또는 openapi.yaml 존재" 전역 검사에서 **엔드포인트 단위**로 격상한다.
> 모든 CONFIRMED ScreenSpec API 후보 → api-manifest `## Endpoints` 의 (Method, Path) 매칭 → 그 endpoint 가 confidence=confirmed ∧ Linked Schema 보유 ∧ Linked Schema 가 `src/api/schemas/*.ts` 의 export 심볼로 해소되어야 한다.
>
> - 날짜: 2026-06-14
> - 브랜치: `feat/api-schema-match` (ISOLATED worktree)
> - 설계: 제안서 **Option C** (PR #16 — "API Candidates↔스키마 매칭 규약 결정").
> - 단계: Build + Validate + 4 reviews 완료 → 본 구현 보고서 기록.
> - 본 보고서의 모든 exit code/메시지는 build·validation·review 의 구조화 결과(소스 오브 트루스)에서 인용했다. 명령은 재실행하지 않았다.

---

## 1. 구현한 파일 (Implemented files)

| 산출물 | 경로 | 역할 |
|---|---|---|
| lib (신규) | `frontend-workflow-kit/scripts/lib/api-manifest.mjs` | api-manifest `## Endpoints` 표를 endpoint→schema canonical 로 읽는 파서 + 매칭 유틸. export: `normEndpoint`, `isSchemaUnset`, `parseManifestEndpoints`, `buildEndpointIndex`, `collectSchemaExports`, `HTTP_METHODS`. import 시 부작용 0. 의존(`util.mjs`의 `readFileSafe`/`isDir`/`splitFrontmatter`, `spec.mjs`의 `getSections`/`parseTable`/`col`) 존재 검증됨. |
| spec (수정, 2 edits) | `frontend-workflow-kit/scripts/lib/spec.mjs` | (1) `function col` → `export function col` 로 변경(api-manifest.mjs 와 헤더 매칭 공유). (2) `parseApiCandidates` 에 `API_CANDIDATE_RE` + `method`/`path` 필드 추가. **CONTRACT-CRITICAL**: `raw` 는 여전히 `t.replace(/^-\s*/, '')`, `confidence` 는 여전히 `conf` — byte-identical 의미. method/path 만 추가(미인식 시 `null`)되어 `minApiConfidence`/`deriveMetrics(api_confidence_min)`/readiness 출력 불변. |
| validate (수정, 2 edits) | `frontend-workflow-kit/scripts/validate.mjs` | (1) reconciliation-register import 뒤에 4-심볼 api-manifest import(`buildEndpointIndex`, `collectSchemaExports`, `isSchemaUnset`, `normEndpoint`) 추가. (2) 검사 8 블록 전체를 Option C 엔드포인트 단위 해소로 교체. `parseApiCandidates` import 유지. |
| 픽스처 (신규) | `frontend-workflow-kit/examples/api-schema-match/**` | 5 케이스(pass-zod, fail-missing-schema, fail-missing-manifest-endpoint, fail-missing-schema-export, pass-candidate-no-schema) + README. 각 케이스는 독립 프로젝트 트리(docs/ + src/), 검사 8 만 격리 검증(나머지 검사 1~7·9~12 는 통과하도록 최소 구성). 총 16 파일. |
| 본 보고서 (신규) | `C:/Users/thdrl/source/repos/k-frontend-workflow/.claude/worktrees/api-schema-match/temp/runs/api-schema-match-001.md` | 본 구현 보고서. |

핵심 불변식:
- **readiness/state 불변**: spec.mjs 의 confidence/raw 계약 보존(method/path 만 신규 필드). `readiness.mjs`·`workflow-state.mjs` **미수정**. 골든 L2 스냅샷(coupon-feature·multi-screen-dry-run) byte-identical 재현.
- **zod-export-only**: 사실 출처는 zod export 심볼. **OpenAPI components.schemas 해소는 미구현(known limitation)** — manifest Source 컬럼은 정보용이며 검사에 쓰지 않는다(`hasOpenApi` 는 폴백 경로에서만 사용).
- **manifest 부재 시 폴백**: `artifact_type==='api-manifest'` 문서가 하나도 없으면 옛 전역 존재검사(`hasZod || hasOpenApi`)로 폴백 — 엄격 모드로 기존 프로젝트를 깨지 않는다.
- **candidate 무발화**: ScreenSpec 에 confirmed 후보가 0건이면 검사 8 무발화(옛 동작). candidate-confidence endpoint 는 Linked Schema 누락만으로 실패하지 않는다(게이트 트리거는 ScreenSpec confirmed 후보).

> **상태(STATUS): UNCOMMITTED.** worktree `git status --short` 실측: `M scripts/lib/spec.mjs`, `M scripts/validate.mjs`, `?? scripts/lib/api-manifest.mjs`, `?? examples/api-schema-match/`, `?? temp/runs/api-schema-match-001.md`. 아직 커밋하지 않았다(브랜치 `feat/api-schema-match`).

---

## 2. 파서 동작 (Parser behavior)

**`parseApiCandidates(sectionText)` (spec.mjs)** — `- GET /coupons (confidence: confirmed)` 같은 불릿 줄에서 `{ raw, confidence, method, path }` 를 반환한다.
- `raw` = `t.replace(/^-\s*/, '')` (불릿 제거, 기존 계약 그대로).
- `confidence` = `confidence: <word>` / `confidence=<word>` 에서 소문자 추출, 미발견 시 `'unknown'` (기존 계약 그대로).
- `method`/`path` = `API_CANDIDATE_RE = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b\s+(\/[^\s()]+)/i` 매칭. method 는 대문자화, path 는 그대로. 미인식 시 둘 다 `null`.

**`parseManifestEndpoints(body)` (api-manifest.mjs)** — `getSections(body)` → `## endpoints` 섹션 → `parseTable` → 각 행을 `col(row, ...)` 으로 읽어 `{ method, path, confidence, linkedSchema, source, key }` 반환.
- `method`/`path` = trim. `confidence` = 소문자 trim. `linkedSchema`/`source` = trim.
- `key` = `normEndpoint(method, path)` (정규화 키, §3 참조).
- method·path 둘 다 빈 행은 건너뛴다.
- `buildEndpointIndex(manifestFiles)` 는 각 manifest 파일을 `readFileSafe` → `splitFrontmatter` → `parseManifestEndpoints` 한 뒤 `Map<key, {...e, file}>` 으로 모은다. 같은 키 중복 시 **last-wins**.

**`collectSchemaExports(schemasDir)` (api-manifest.mjs)** — `src/api/schemas/*.ts` 를 정규식 스캔(AST 미사용)해 export 심볼 이름 집합(`Set`)을 만든다.
- 선언형: `export (default?) (async?) const|let|var|function(*?)|class|enum|type|interface NAME` → `reDecl` 로 `NAME` 수집.
- 리스트형: `export { A, B as C, default as D }` / `export type { ... }` → `reList` 로 `{...}` 내부를 콤마 분리, `as <alias>` 가 있으면 alias 이름을, 없으면 식별자 이름을 수집.
- 디렉토리 부재/읽기 실패 시 빈 `Set` 반환(오탐 방지).

---

## 3. 경로 매칭 규칙 (Path matching rules)

핵심은 `normEndpoint(method, p)` (api-manifest.mjs) — ScreenSpec 후보의 (Method, Path) 와 manifest endpoint 를 같은 정규화 키로 비교한다.

- **method 대문자화**: `String(method).trim().toUpperCase()` → `get` 과 `GET` 동일시.
- **쿼리/해시 제거**: `pp.replace(/[?#].*$/, '')` → `/coupons?status=active` 와 `/coupons` 동일시.
- **파라미터명 무시**: `pp.replace(/\{[^}]*\}/g, '{}')` → `{id}` 와 `{couponId}` 가 모두 `{}` 로 정규화되어 매칭. (파라미터 위치·개수는 유지되므로 `/coupons/{}` 와 `/coupons/{}/items` 는 구분됨.)
- **trailing slash 제거(루트 보존)**: `if (pp.length > 1) pp = pp.replace(/\/+$/, '')` → `/coupons/` 와 `/coupons` 동일시, 단 루트 `/` 는 보존.
- 결과 키 = `"<METHOD> <normPath>"` (예: `GET /coupons`).

> ★ **화면 route(`[id]`)는 절대 섞지 않는다.** `normEndpoint` 는 API path 축에만 쓴다(제안서 §7). ScreenSpec 의 Interaction Matrix 라우트(`/coupons/[id]`)와 API path(`/coupons/{id}`)는 표기 체계가 다르므로 의도적으로 분리한다(검사 8 은 `## API Candidates` 의 method/path 만 본다).

---

## 4. Pass/fail 픽스처 매트릭스 (E–I)

명령 = `node scripts/validate.mjs --docs examples/api-schema-match/<case>/docs/frontend-workflow --src examples/api-schema-match/<case>/src`. 아래 exit code·check-8 메시지는 validation.matrix 실측값.

| # | 케이스 | 기대 exit | 실측 exit | 의도 사유 충족 | 검사 8 메시지 (fail) |
|---|---|---|---|---|---|
| E | pass-zod | 0 | **0** | ✅ | — (check8Messages 없음, otherCheckErrors 없음) |
| F | fail-missing-schema | 1 | **1** | ✅ | `confirmed endpoint GET /coupons 에 Linked Schema 가 없음(빈칸/TBD) → 해소: ## Endpoints 행의 Linked Schema 에 실제 export 스키마명을 기입하세요.` |
| G | fail-missing-manifest-endpoint | 1 | **1** | ✅ | `confirmed API GET /coupons 가 api-manifest ## Endpoints 에 매칭되는 엔드포인트가 없음 → 해소: api/api-manifest.md ## Endpoints 에 GET /coupons 행을 추가하거나 ScreenSpec confidence 를 candidate 로 낮추세요.` |
| H | fail-missing-schema-export | 1 | **1** | ✅ | `confirmed endpoint GET /coupons 의 Linked Schema=CouponListResponseSchema 가 src/api/schemas/*.ts export 에서 발견되지 않음 → 해소: 스키마 export 를 추가하거나 Linked Schema 를 올바른 export 이름으로 수정하세요.` |
| I | pass-candidate-no-schema | 0 | **0** | ✅ | — (candidate 전용, 검사 8 무발화; 스키마 디렉토리 부재여도 통과) |

세 fail 케이스 공통: **check-8 메시지 정확히 1건, otherCheckErrors 비어 있음**(다른 검사 오류 동반 0건) → `intendedReasonMet=true`, `verdict=pass`. 매트릭스 전체 `green=true`.

**격리 검증 의미**
- E pass-zod: confirmed `GET /coupons` → manifest confirmed 행 + `Linked Schema=CouponListResponseSchema` → `coupon.ts` 가 `CouponSchema`+`CouponListResponseSchema` export → 해소 성공.
- F: manifest 엔드포인트는 confirmed 이나 `Linked Schema=TBD` → `isSchemaUnset` 적중 → 에러는 **manifest 파일** 에 귀속.
- G: confirmed 후보 `GET /coupons` 가 manifest 에 미등록(manifest 엔 `POST /auth/login` 만) → 에러는 **screen-spec 파일** 에 귀속.
- H: `Linked Schema=CouponListResponseSchema` 인데 `coupon.ts` 는 `CouponSchema` 만 export → `schemaExports.has(...)` 실패 → 에러는 **manifest 파일** 에 귀속.
- I: ScreenSpec 후보가 모두 candidate(confirmed 0건) → 검사 8 무발화. manifest 의 candidate 행 `Linked Schema=TBD` 허용, `src/` 에 schemas 디렉토리 부재여도 통과.

**회귀 게이트(별도 확인)**: `example:state`·`example:readiness`·`example:validate` 전부 exit 0, `npm test` = `test-fixtures — PASS (21 fixtures: 20 pass, 1 xfail, 0 xpass, 0 xdrift, 0 fail)` exit 0 (build 노트 + validation.commandsRun 일치). `regressionGreen=true`. coupon-feature·multi-screen-dry-run 의 validate 파이프라인 골든 무변경. 단일 XFAIL(reconcile-input-001)은 사전-문서화된 기대-실패 픽스처(golden 아님)로 본 변경의 회귀 아님.

---

## 5. False-positive 위험 (False-positive risks)

- **manifest 부재 폴백**: `artifact_type==='api-manifest'` 문서가 없으면 옛 전역 존재검사(`hasZod || hasOpenApi`)로 폴백 — 엄격 모드가 manifest 미도입 기존 프로젝트를 깨는 것을 방지(마이그레이션 안전). 트레이드오프: manifest 가 없으면 엔드포인트 단위 강제가 무력화된다.
- **표기 불일치(normEndpoint 가 흡수 못 함)**: 세그먼트 차이(`/coupon` vs `/coupons`), 대소문자(path 부분은 그대로 비교 — method 만 대문자화), 슬래시 외 표기 차이는 정규화로 흡수되지 않아 "매칭 엔드포인트 없음" 오탐(G 유형)을 낼 수 있다. 쿼리스트링·trailing slash·파라미터명만 흡수된다.
- **동일 이름 export 의 도메인 교차**: `collectSchemaExports` 는 `src/api/schemas/*.ts` 전체를 평면 스캔하므로 도메인을 구분하지 못한다. 다른 도메인의 같은 이름 export 가 우연히 존재하면 잘못 해소되는 **false-negative**(있어야 할 에러를 놓침) 가 가능하다.
- **stale/draft manifest 가 confirmed 화면을 차단**: manifest 의 endpoint confidence 가 아직 candidate 면, ScreenSpec 이 confirmed 여도 검사 8 이 실패한다(confidence 불일치 에러). manifest 갱신 지연이 화면을 막을 수 있다.
- **confidence 이중 출처**: 게이트 트리거는 **ScreenSpec** 후보 confidence(confirmed 일 때만 발화). manifest endpoint confidence 는 정보용처럼 보이지만, 본 작업 규칙상 **매칭된 endpoint 도 confirmed 여야** 한다(둘 중 하나라도 어긋나면 에러). 즉 confidence 를 두 곳에서 일치시켜야 한다.
- **TBD/빈칸을 미설정으로 취급**: `isSchemaUnset` 은 `''`/`-`/`tbd`(대소문자 무시)를 미설정으로 본다. 실제 스키마명이 우연히 이 토큰과 겹치는 경우는 없으나, Linked Schema 를 의도적으로 비워둔 confirmed endpoint 는 항상 F 유형 에러가 된다(설계 의도).

---

## 6. 실행한 명령 (Commands run)

validation.commandsRun 및 build 검증 기준. 모든 exit code 실측.

| 명령 | exit | 비고 |
|---|---|---|
| `node --check scripts/lib/api-manifest.mjs` | 0 | 신규 파일 구문 OK |
| `node --check scripts/lib/spec.mjs` | 0 | 수정 파일 구문 OK |
| `node --check scripts/validate.mjs` | 0 | 수정 파일 구문 OK |
| `npm run example:state` | 0 | `workflow:state — 2 screen(s)`; `_meta/*.yaml` 골든과 byte-identical |
| `npm run example:readiness` | 0 | COUPON-001/COUPON-002 정상 출력 |
| `npm run example:validate` | 0 | `workflow:validate — OK` |
| `npm test` (= `node scripts/test-fixtures.mjs`) | 0 | `PASS (21 fixtures: 20 pass, 1 xfail, 0 xpass, 0 xdrift, 0 fail)` |
| `node scripts/validate.mjs ... pass-zod ...` (E) | 0 | check8 0건 |
| `node scripts/validate.mjs ... fail-missing-schema ...` (F) | 1 | check8 1건 |
| `node scripts/validate.mjs ... fail-missing-manifest-endpoint ...` (G) | 1 | check8 1건 |
| `node scripts/validate.mjs ... fail-missing-schema-export ...` (H) | 1 | check8 1건 |
| `node scripts/validate.mjs ... pass-candidate-no-schema ...` (I) | 0 | check8 0건 |

---

## 7. 알려진 한계 (Known limitations)

- **OpenAPI components.schemas 해소 미구현**: Linked Schema 해소는 zod export 심볼만 본다. manifest 의 Source 컬럼은 정보용이며 검사에 쓰지 않는다. `hasOpenApi`(openapi.yaml/yml 존재)는 **폴백 경로에서만** 사용된다(manifest 부재 시). OpenAPI 기반 endpoint 의 정밀 해소는 후속(제안서 OD-5).
- **export 스캔은 정규식(AST 아님)**: 배럴 재-export(`export { X } from './x'`)·`export * from`·동적 export 는 해소되지 않는다. 즉 스키마가 배럴을 통해서만 노출되면 false-negative(H 유형 오탐) 가능.
- **다중 manifest 병합은 last-wins**: 한 트리에 api-manifest 가 여럿이면 `buildEndpointIndex` 가 같은 키에 대해 마지막 것으로 덮어쓴다(중복 경고 없음).
- **manifest-측 에러는 manifest 파일 경로에 귀속**: F·H 의 에러 `file` 은 screen-spec 이 아니라 `api/api-manifest.md` 다(G 는 screen-spec). 트리거가 ScreenSpec confirmed 후보임에도 수정 지점이 manifest 이므로 의도적 귀속이나, 에러 위치 직관과 어긋날 수 있다.
- **검사 8 은 npm test 골든에서 직접 실행되지 않음**: 본 변경의 검사 8 자체는 신규 `examples/api-schema-match/**` 픽스처(수동/매트릭스 실행)로만 검증되고, `npm test` 의 21 픽스처 골든은 무회귀(출력 동등성)만 보장한다. (§8 후속 권고 참조.)

---

## 8. 다음 단계 권고 (Next step recommendation)

제안서 Open Decisions 및 릴리스 전제 기준:

- **OD-1 — api-manifest 를 catalog 에 등록**: `catalog/artifact-manifest.yaml` 에 `api-manifest` artifact 타입을 등록해 검사 2(아티팩트 매니페스트 커버리지)가 인지하게 한다. (본 작업은 catalog 수정 금지 범위라 미반영.)
- **OD-2 — 더 깊은 검증 / optional openapi.paths(3-d) 검사**: manifest endpoint 와 openapi.paths 의 교차 정합 검사(3-d) 옵션 추가.
- **OD-5 — OpenAPI opt-in 모드**: Source=openapi 인 endpoint 를 components.schemas 로 해소하는 opt-in 경로(현재 known limitation 해소).
- **OD-6 — api-manifest 템플릿**: Linked Schema 컬럼을 포함한 `## Endpoints` 표 템플릿을 templates/ 에 추가(현재 픽스처에만 표 형태 존재).
- **릴리스 전제**: `v0.2.0-mvp-b-rc1` 태그 생성(본 작업 범위 밖 — 미수행, 전제로만 기록)을 릴리스 전에 처리.
- **골든 커버리지 확장**: 골든 예제 트리 하나를 마이그레이션해 `npm test` 안에서 검사 8 을 직접 행사(현재는 무회귀만 보장)하도록 고려.

---

## 9. Codex 리뷰 반영 (PR #19 follow-up)

PR #19 의 Codex 자동 리뷰(코멘트) 중 타당한 지적을 반영했다.

| 지적 | 반영 | 변경 |
|---|---|---|
| M1 export 스캔 거짓양성 | ✅ | `collectSchemaExports`: 스캔 전 주석 제거(죽은 export 무시) + 타입 전용 export(`type`/`interface`, `export type {}`, 인라인 `{ type X }`) 제외 — 런타임 값 export 만 인정. ("export 가 실제 zod 인지"의 AST 증명은 여전히 known limitation.) |
| M2 중복 endpoint 무음 | ✅ | `buildEndpointIndex` 가 `{ index, conflicts }` 반환. 같은 (Method,Path) 가 다른 Linked Schema/confidence 로 중복 선언되면 검사 8 이 manifest 파일에 에러(동일 중복 행은 무시). |
| m1 `:id`/`[id]` 미정규화 | ✅ | `normEndpoint` 가 `{id}`·`[id]`·`:id` 를 모두 `{}` 로 정규화(표기 차이 거짓 "미등록" 방지). |
| m2 `TRACE`/`CONNECT` 누락 | ✅ | `API_CANDIDATE_RE`(spec.mjs) + `HTTP_METHODS` 에 추가. |
| m3 OpenAPI 한계 미고지 | ✅ | 픽스처 README 에 zod-export-only / `Source=openapi` 도 zod export 필요 명시. |
| M3 픽스처 npm test 미편입 | ⏸ 보류 | 골든 하니스(test-fixtures.mjs)에 validate-exit 종류 추가가 필요한 별도 후속(§8). manual/매트릭스 실행으로만 검증. |

신규 회귀 픽스처 2종(총 7종: pass 3 / fail 4):
- `fail-duplicate-endpoint` — 충돌 중복 endpoint → exit 1(검사 8, manifest 귀속). 두 스키마 모두 export 해 해소 자체는 통과시키고 충돌만 단일 사유로 남긴다.
- `pass-param-normalize` — `GET /coupons/:id`·`POST /coupons/[id]/use`(ScreenSpec) ↔ `/coupons/{id}`·`/coupons/{couponId}/use`(manifest) → 정규화 매칭 → exit 0.

재검증: `node --check` 3파일 OK · `example:state/readiness/validate` + `npm test` green(무회귀) · 픽스처 7종 의도대로 exit code + 검사 8 단일 사유.

**잔여 위험(수용, Codex 3c).** `normEndpoint` 가 파라미터가 아닌 **리터럴** `[seg]`/`:seg` 도 `{}` 로 합칠 수 있다(예: `/files/[draft]` ↔ `/files/{id}`). 실제 API path 에선 드물고, 더 조이면 `:id`/`[id]` 거짓-누락(m1)이 재발하므로 트레이드오프로 수용한다. 의도된 정규화(쿼리스트링·trailing slash 제거, `{id}↔{couponId}` 통합)는 위험이 아니다. 또한 zod export 스캔의 배럴(`export * from`)·타파일 재-export 미해소(§7)와 "matched export 가 실제 zod 인지"의 AST 미검증은 known limitation 으로 유지한다.
