// examples/codegen-adapter/minimal-custom/my-codegen.mjs
// 최소 커스텀 CodegenAdapter — 어댑터 솔기(codegen-core.loadCodegenAdapter)가 *내장이 아닌* 어댑터도
// 해소·렌더함을 고정하는 회귀 픽스처. OpenAPI 파싱 없이 코드로 선언한 operation 후보만 *발견* 한다 —
// 파일을 쓰지 않고, 정렬/네이밍/렌더/결정성은 codegen-core 가 독점한다(temp/proposals/tier2-router-codegen-adapter.md §7).
//
// 이 픽스처는 codegen-core.test.mjs 의 단위 입력이다(실제 소스 트리·내장 매니페스트 등록 미동반) —
// Tier-1 custom-monorepo 픽스처가 "프로파일 로더 단위 테스트 입력일 뿐"이라 명시한 선례와 동형
// (examples/layout-profile/custom-monorepo/project-layout.yaml).
export const name = 'minimal-custom';
export const version = 1;

// conventions 를 내장 openapi-client(use/Query/Mutation · generated/.client.ts)와 *다르게* 선언해
// "컨벤션-as-config"(§9d)를 증명한다 — 코어가 이 토큰으로 hook 이름·출력 경로를 결정적으로 조립한다.
// clientOut/hookOut 패턴은 Tier-1 role 파생(§9b)이라 openapi-client 와 같은 표면(roles.api_client/hook)을 쓴다.
export const conventions = {
  hookPrefix: 'use',
  querySuffix: 'Fetch', //      openapi-client: 'Query'
  mutationSuffix: 'Command', //   openapi-client: 'Mutation'
  clientOut: '{roles.api_client}',
  hookOut: '{roles.hook}',
  clientSubdir: '_generated', //  openapi-client(default): 'generated'
  clientFileSuffix: '.api.ts', // openapi-client(default): '.client.ts'
};

// discover(ctx) → 코어가 정규화·렌더할 CodegenModel. operation 계약: { method, path, operationId, domain, sourceFile }.
// 일부러 *미정렬* 순서(POST 먼저·깊은 경로 먼저)로 반환한다 — 코어(normalizeCodegenModel)가 결정적
// 순서(path → method rank → operationId)로 정규화함을 골든으로 고정하기 위함이다("어댑터=발견, 코어=결정성").
// 그래서 expected/codegen-manifest.txt 는 GET /widgets → GET /widgets/{widgetId} → POST …/archive 순이다.
// OpenAPI 문서를 읽지 않고 파일도 쓰지 않는다 — 입력 검증·정렬·네이밍·렌더는 전부 코어 소유.
export function discover(ctx = {}) {
  const source = ctx.source || 'examples/codegen-adapter/minimal-custom/my-codegen.mjs';
  return {
    adapter: name,
    version,
    source,
    sourceFiles: [source],
    conventions,
    operations: [
      { method: 'POST', path: '/widgets/{widgetId}/archive', operationId: 'archiveWidget', domain: 'widgets', sourceFile: source },
      { method: 'GET', path: '/widgets', operationId: 'listWidgets', domain: 'widgets', sourceFile: source },
      { method: 'GET', path: '/widgets/{widgetId}', operationId: 'getWidget', domain: 'widgets', sourceFile: source },
    ],
  };
}

export default { name, version, conventions, discover };
