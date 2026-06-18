# Run report — Tier2 codegen adapter seam 첫 구현 slice

> **Status: IMPLEMENTATION — 2026-06-18.** 설계 `temp/proposals/tier2-router-codegen-adapter.md` §7·§8·§9·§14·§17 PR-3 중 codegen 절반의 첫 slice 를 구현한다. route-tree 어댑터 솔기(#49)와 같은 경계로 **adapter=discovery/input normalization**, **core=결정성/정렬/렌더/출력 naming**을 고정한다. 이번 slice 는 실제 TypeScript client/hook 파일을 생성하지 않고, 후보 manifest golden 으로 byte-identical 결정성만 증명한다.

## 구현 범위

| 영역 | 파일 | 내용 |
|---|---|---|
| codegen core | `scripts/lib/codegen-core.mjs` | `loadCodegenAdapter`(이름/`{module}`/객체 해소 + version/manifest compatibility 검사), `normalizeCodegenModel`(method/path/operationId/domain 검증, 정렬, collision 진단), `renderCodegenManifest`(무타임스탬프 deterministic text), hook/output naming 계약. |
| codegen adapter | `scripts/adapters/codegens/openapi-client.mjs` | OpenAPI `paths` 문서에서 endpoint 후보 IR 을 발견. 파일 쓰기/렌더/정렬/hook naming 없음. `api_schema` 입력 부재, malformed OpenAPI, operationId 누락은 fail-closed. |
| adapter manifest | `scripts/adapters/codegens/manifest.json` | `openapi-client` id/version/module/core compatibility 명시. router manifest 와 병렬인 codegen 전용 등록 파일. |
| fixture/golden | `examples/codegen-adapter/openapi-client/**` | 최소 OpenAPI fixture + deterministic candidate manifest golden. 동일 입력 반복 렌더 byte-identical 고정. |
| tests | `scripts/lib/codegen-core.test.mjs`, `package.json` | manifest loading, openapi-client discovery, core sorting/render determinism, role-derived output path, hook naming, missing/unsupported/collision diagnostics. |
| docs | `README.md`, `roadmap-current.md` | “첫 slice 완료”와 실제 TS generation/hard gate 잔여를 명시. |

## 고정한 최소 계약

- `operationId` 는 `/^[A-Za-z][A-Za-z0-9]*$/` 만 v1 지원한다. 하이픈/기타 문자는 추측 변환하지 않고 진단한다.
- hook name 은 core 가 `hookPrefix + PascalCase(operationId) + (Query|Mutation)` 으로 생성한다.
- query/mutation 판정은 method 기준이다: `GET/HEAD/OPTIONS` = query, 나머지 supported mutating methods = mutation.
- client output 은 `{roles.api_client}` 에서 파생하며 기본 `src/api/generated/<operationId>.client.ts` 형태다.
- hook output 은 `{roles.hook}` 에서 파생하며 기본 `src/features/{domain}/hooks/<hookName>.ts` 형태다.
- endpoint, hook name, client output path, hook output path 충돌은 모두 fail-closed 진단이다.
- output manifest 에 timestamp 나 machine-local absolute path 를 넣지 않는다.

## 의도적으로 하지 않은 것

- `readiness` 승격/정책 fact 추가 없음.
- `validate` hard gate 추가 없음.
- `nav-graph` 가 codegen adapter 를 직접 소비하지 않음.
- CI hard gate 또는 required check 추가 없음.
- `catalog/artifact-manifest.yaml` 에 새 generated artifact axis 추가 없음.
- 실제 TypeScript API client/hook 파일 생성 없음.
- 기존 route-tree golden output 변경 없음.
- lint-pack hard gate promotion, Work Packet/reconcile-input vendor, Interaction Matrix telemetry 시작 없음.
- Open Decision 자동 resolve/close 없음.

## 검증

```bash
cd frontend-workflow-kit
node --test scripts/lib/codegen-core.test.mjs
# PASS — 19 tests

npm test
# PASS — test-fixtures 27 fixtures(26 pass, 1 xfail) + node:test 110 pass
```

추가 확인:

- codegen golden determinism 은 `C3: renderCodegenManifest is byte-identical to golden and stable across repeated renders` 로 고정.
- 리뷰 반영 회귀는 `C10`~`C19` 로 고정: multiline path/header injection, Windows/UNC absolute output, out-of-base sourceFiles, malformed conventions, role-root escape, resolved output pattern traversal, wildcard-free concrete output paths, single-glob string[] roles.
- 기존 route-tree/nav-graph/component-catalog generated-view fixtures 는 `test-fixtures` 에서 각 2회 실행 결정성 + golden 일치를 통과.
- 새 CLI 는 만들지 않았다. 그래서 별도 CLI 2회 실행 검증 대상은 없다.

## 남은 Tier2 codegen follow-up

- 실제 TS client/hook emitter 와 파일 쓰기/check-mode.
- generated-file guard 의 codegen 산출물 `V1_REPRODUCE` 계약 등록.
- custom codegen adapter dogfood fixture.
- OD-5(`api_generated` role 여부), OD-6(output 입도), OD-7(hook 출력 스코프) 확정.
- validate/nav-graph 관계 문서화 또는 warning-only cross-check 설계. hard gate 승격은 별도 decision PR 에서만 검토.
