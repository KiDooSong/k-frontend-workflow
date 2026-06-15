// scripts/lib/route-tree.mjs — 하위호환 재노출 shim.
//
// route-tree 로직은 core(결정성 렌더)와 adapter(발견)로 분리됐다
// (temp/proposals/tier2-router-codegen-adapter.md §5·§6 — "어댑터=발견, 코어=결정성"):
//   · 발견(discovery): scripts/adapters/routers/expo-router.mjs  → scanAppDir / computeRoute
//   · 코어(결정성):     scripts/lib/route-core.mjs               → renderRouteTree / ROUTE_COL / loadRouterAdapter
//
// 이 모듈은 이전 import 경로(`./lib/route-tree.mjs`)를 깨지 않도록 둘을 그대로 재노출한다.
// 동작은 byte-identical — 기존 scanAppDir/renderRouteTree 소비자(및 vendored copy)는 변경 없이 동작한다.
export { scanAppDir, computeRoute } from '../adapters/routers/expo-router.mjs';
export { renderRouteTree, ROUTE_COL } from './route-core.mjs';
