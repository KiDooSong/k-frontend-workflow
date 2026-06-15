# router-adapter / minimal-custom

route-tree 어댑터 솔기(`scripts/lib/route-core.mjs` 의 `loadRouterAdapter`)가 **내장 `expo-router` 가 아닌**
커스텀 어댑터도 해소하고, 코어가 그 발견 결과를 결정적으로 렌더함을 고정하는 최소 회귀 픽스처.

- `my-router.mjs` — 코드 정의 라우트를 *발견(discover)* 만 하는 최소 `RouterAdapter`(version 1).
  파일을 쓰지 않고, 정렬/렌더/결정성은 `route-core` 가 독점한다(어댑터=발견, 코어=결정성).
- `expected/route-tree.txt` — 코어(`renderRouteTree`)가 그 발견 결과를 렌더한 골든.

이 픽스처는 **단위 테스트 입력**이다(`scripts/lib/route-core.test.mjs`) — 실제 소스 트리를 동반하지 않는다.
Tier-1 `examples/layout-profile/custom-monorepo` 가 "프로파일 로더 단위 테스트 입력일 뿐"이라 명시한 선례와 동형.

> 설계 참조: `temp/proposals/tier2-router-codegen-adapter.md` §13(최소 custom-adapter 픽스처) · §6(어댑터=발견, 코어=결정성).
> 기본 `expo-router` 경로의 byte-identical 회귀는 `examples/route-tree/{basic-app,edge-cases}` 골든이 담당한다.
