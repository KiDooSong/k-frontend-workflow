# codegen-adapter / minimal-custom

codegen 어댑터 솔기(`scripts/lib/codegen-core.mjs` 의 `loadCodegenAdapter`)가 **내장 `openapi-client` 가 아닌**
비-내장 custom codegen 어댑터도 해소하고, `codegen-core` 가 그 발견 결과를 결정적으로 렌더함을 고정하는 최소 회귀 픽스처.

- `my-codegen.mjs` — OpenAPI 파싱 없이 코드로 선언한 operation 후보를 *발견(discover)* 만 하는 최소
  `CodegenAdapter`(version 1). 파일을 쓰지 않고, 정렬/네이밍/렌더/결정성은 `codegen-core` 가 독점한다
  (어댑터=발견, 코어=결정성). conventions(`Fetch`/`Command` · `_generated/*.api.ts`)를 내장 `openapi-client`
  (`Query`/`Mutation` · `generated/*.client.ts`)와 다르게 선언해 "컨벤션-as-config"를 증명한다.
- `expected/codegen-manifest.txt` — 코어(`renderCodegenManifest`)가 그 발견 결과를 렌더한 골든.
  어댑터가 일부러 미정렬로 반환한 operation 을 코어가 결정적 순서(path → method → operationId)로 정규화한 결과다.
- `expected/getWidget.api.ts` · `expected/useGetWidgetFetch.ts` — `renderCodegenFiles` 의 client/hook 렌더 표면
  골든 한 쌍(매개변수 query). manifest 뿐 아니라 렌더 표면까지 byte-동치로 고정한다.

이 픽스처는 **단위 테스트 입력**이다(`scripts/lib/codegen-core.test.mjs`) — 실제 소스 트리를 동반하지 않고,
내장 codegen 매니페스트(`scripts/adapters/codegens/manifest.json`)에도 등록하지 않는다(테스트는 `{module}`/경로로 로드).
Tier-1 `examples/layout-profile/custom-monorepo` 가 "프로파일 로더 단위 테스트 입력일 뿐"이라 명시한 선례와 동형.

> 설계 참조: `temp/proposals/tier2-router-codegen-adapter.md` §13(최소 custom-adapter 픽스처) ·
> §7(codegen 어댑터=발견, 코어=결정성) · §9(출력 경로·hook 네이밍 = 컨벤션-as-config).
> 내장 `openapi-client` 경로의 byte-identical 회귀는 `examples/codegen-adapter/openapi-client` 골든이 담당한다.
