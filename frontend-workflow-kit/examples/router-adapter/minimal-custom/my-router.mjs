// examples/router-adapter/minimal-custom/my-router.mjs
// 최소 커스텀 RouterAdapter — 어댑터 솔기(route-core.loadRouterAdapter)가 *내장이 아닌* 어댑터도
// 해소·렌더함을 고정하는 회귀 픽스처. 코드 정의 라우트(파일트리 아님)를 *발견* 만 한다 —
// 파일을 쓰지 않고, 정렬/렌더/결정성은 route-core 가 독점한다(temp/proposals/tier2-router-codegen-adapter.md §6).
//
// 이 픽스처는 route-core.test.mjs 의 단위 입력이다(실제 소스 트리 미동반) — Tier-1 custom-monorepo
// 픽스처가 "프로파일 로더 단위 테스트 입력일 뿐"이라 명시한 선례와 동형(custom-monorepo/project-layout.yaml).
export const name = 'minimal-custom';
export const version = 1;

// discover(ctx) → 코어가 렌더할 노드 트리(children 배열). 노드 계약: { name, isDir, children?, route? }.
// 일부러 *미정렬* 순서(index 가 about 앞)로 반환한다 — 코어(route-core.normalizeRouteTree)가 결정적
// 순서(파일 먼저·이름순)로 정규화함을 골든으로 고정하기 위함이다("어댑터=발견, 코어=결정성").
// 그래서 expected/route-tree.txt 는 about → index 순(코어가 정렬한 결과)이다.
export function discover() {
  return [
    { name: 'index.tsx', isDir: false, route: '/' },
    { name: 'about.tsx', isDir: false, route: '/about' },
    {
      name: 'blog',
      isDir: true,
      children: [{ name: '[slug].tsx', isDir: false, route: '/blog/[slug]' }],
    },
  ];
}

export default { name, version, discover };
