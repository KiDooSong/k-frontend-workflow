// nav-graph.mjs (lib) — 화면 간 내비게이션 그래프 모델 빌더 (순수 함수, IO 없음).
// screen-spec.md 의 ## Interaction Matrix(Result 컬럼)에서 이동 엣지를 도출하고,
// app/navigation-map.md 로 알려진 라우트를 시드한다. ScreenSpec 은 절대 수정하지 않는다(읽기 전용).
//
// 파싱 단일 출처(spec.mjs:2): 직접 md 파싱 금지. loadScreenSpec/parseTable/col 을 그대로 쓰고,
// 라우트 추출(cellRoutes/isConcreteRoute)은 spec.mjs 의 단일 출처를 import 해 쓴다 — 정규식 drift 불가
// (검사 4·검사 P13 과 동작 일치). v2 구조화 표(Result Type/Target)는 interactionRowRoutes/
// interactionEdgeRoutes 로 Target 셀에서 라우트를 읽는다(어느 셀을 읽느냐만 모드 분기, 정규식은 공유).
//
// 참고: frontend-workflow-kit-implementation.md (nav-graph View 1)
import path from 'node:path';
import {
  loadScreenSpec,
  parseTable,
  col,
  isStub,
  getSections,
  cellRoutes,
  isConcreteRoute,
  isConcreteTargetRoute,
  interactionMatrixIsV2,
  interactionRowRoutes,
  interactionEdgeRoutes,
  buildRuntimeRouteTargetIndex,
  resolveRouteTargetInScreenInventory,
} from './spec.mjs';
import { findFiles, readFileSafe } from './util.mjs';
import { parseExpoIndexRouteTokens } from './route-core.mjs';

export { cellRoutes, isConcreteRoute }; // 하위호환 재노출(이전 nav-graph export 소비자 보호)

// navigation-map.md 의 ## Structure 불릿 + ## Deep Links 표에서 "알려진 라우트" 집합을 모은다.
// 비권위적 시드/교차검증용 — 이동 엣지는 여기서 만들지 않는다(이동 엣지는 SOURCE Interaction Matrix 단일 출처).
// ## Cross-Domain Edges 는 MVP-C Phase 1 에서 의도적으로 읽지 않는다(Must-follow: movement edges only from
// source Interaction Matrix). nav-map 의 From/To 표를 엣지원으로 삼는 reconciliation 은 후속 단계로 미룬다
// (Codex 리뷰 P2 — Phase 1 규칙상 의도적 제외).
export function parseNavigationMapRoutes(navMapText) {
  const routes = new Set();
  if (!navMapText) return routes;
  const sections = getSections(navMapText);

  // ## Structure: "- Tabs: /(tabs)/home, /(tabs)/coupons, /(tabs)/my" 같은 불릿. 각 라우트 토큰 추출.
  const structure = sections['structure'];
  if (structure) {
    for (const r of cellRoutes(structure)) if (isConcreteRoute(r)) routes.add(r);
  }

  // ## Deep Links: | Pattern | Route | ... | 표의 Route 컬럼.
  const deepLinks = parseTable(sections['deep links']);
  if (deepLinks) {
    for (const row of deepLinks.rows) {
      const v = col(row, 'Route');
      for (const r of cellRoutes(v)) if (isConcreteRoute(r)) routes.add(r);
    }
  }
  return routes;
}

// 한 spec 의 screenId 를 도출한다 — workflow-state.mjs 의 fallback 체인과 동일(대시보드와 노드 id 일치).
function screenIdOf(spec, specPath) {
  const fm = spec.frontmatter || {};
  return fm.screen_id || fm.artifact_id || path.basename(path.dirname(specPath));
}

// 한 spec 의 outbound 이동 엣지를 도출한다. Interaction Matrix 행을 직접 재순회한다
// (interactionRowRoutes 가 행 메타데이터와 무관히 라우트만 주므로 trigger/action 은 여기서 엮는다).
// 라우트 >=1 개를 내는 행만 엣지. v1: Result 셀, v2: Result Type=route 행의 Target 셀(어느 셀이냐만 모드 분기).
//   각 엣지: { to_route, trigger, action } — to_route=라우트, trigger=Trigger, action=User Action.
function outboundEdgesOf(spec) {
  const table = parseTable(spec.sections['interaction matrix']);
  if (!table) return [];
  const mode = interactionMatrixIsV2(table) ? 'v2' : 'v1';
  const edges = [];
  for (const row of table.rows) {
    const routes = interactionRowRoutes(row, mode).filter(isConcreteTargetRoute);
    if (routes.length === 0) continue; // 라우트 없는 행(refetch·"status filter 변경"·비-route 타입)은 엣지 없음
    const trigger = (col(row, 'Trigger') || '').trim();
    const action = (col(row, 'User Action') || '').trim();
    for (const to_route of routes) {
      edges.push({ to_route, trigger, action });
    }
  }
  return edges;
}

// 안정 정렬 키 — 엣지 배열을 결정적으로 정렬한다(필드를 빈 문자열로 이어 비교).
// 키가 단사(injective)일 필요는 없다: 키가 같아도 Array.prototype.sort 안정성 덕에 입력 순서가
// 보존되어(정렬된 specPaths·표 행 순서) 출력이 항상 결정적이다.
function inboundKey(e) {
  return [e.from || '', e.trigger || '', e.route || ''].join('');
}
function outboundKey(e) {
  return [e.to_route || '', e.trigger || '', e.action || ''].join('');
}

// 순수 빌더: docsDir 를 읽어 { screens, routes } 그래프 모델을 만든다. 부작용 없음(직렬화/쓰기는 CLI 가).
//   screens[<id>] = { inbound?: [{from, trigger, route}], outbound?: [{to_route, trigger, action}] }
//   routes[<route>] = { inbound: [{from, trigger}] }
// 규칙:
//   - 이동/outbound 엣지는 SOURCE 화면 자신의 Interaction Matrix Result 컬럼에서만 나온다.
//   - 모든 outbound 엣지 S->R 은 routes[R].inbound 에 {from:S, trigger} 를 무조건 추가한다.
//   - R 이 어떤 로드된 화면의 fm.route 와 EXACT 문자열 일치하거나, Expo 단일 filesystem group 을 제외한
//     런타임 URL 이 단일 ScreenSpec route 로 해소되면 그 화면 D 로 해소한다(비루트는 검사 4 와 동일).
//     루트(`/`) alias 는 기본 Expo route-tree 의 실제 group-directory index.* 증거로 후보를 먼저 필터링하고
//     verified 후보가 유일할 때만 선택한다. 검사 4의 inventory-only hard gate와 의도적으로 분리한다.
//     해소되고 D!==S 면 screens[D].inbound 에 {from:S, trigger, route:R} 추가.
//   - navigation-map 의 라우트는 routes 레지스트리에 시드만 한다(엣지 생성 아님).
export function buildNavGraph({ docsDir }) {
  const domainsRoot = path.join(docsDir, 'domains');
  const specPaths = findFiles(domainsRoot, 'screen-spec.md');

  // 1) 모든 spec 로드 + (id, route, outbound 엣지) 수집. route->screenId 해소 맵 구성.
  const loaded = [];
  const routeToScreen = new Map(); // fm.route(raw) -> screenId. 목적지 해소는 검사 4 와 같은 helper 를 쓴다.
  const routeSet = new Set();
  for (const specPath of specPaths) {
    const spec = loadScreenSpec(specPath);
    const id = screenIdOf(spec, specPath);
    const route = (spec.frontmatter && spec.frontmatter.route) || null;

    // route->screenId 등록은 stub 여부와 무관하게 먼저 한다. stub(frontmatter 만 있는 발견 단계 화면)도
    // 자신의 route 로 들어오는 inbound 의 "목적지"가 될 수 있다 (Codex 리뷰 P2: stub destination 해소).
    if (route && !routeToScreen.has(route)) {
      routeToScreen.set(route, id);
      routeSet.add(route);
    }

    // stub 은 본문(Interaction Matrix)이 없어 outbound 이동 엣지를 만들 수 없다 — 목적지로만 남는다.
    if (isStub(spec)) continue;

    const outbound = outboundEdgesOf(spec);

    // 교차검증: 행별 추출의 합집합이 interactionEdgeRoutes(전체 spec, v2-aware) 와 같은 라우트 집합인지 확인.
    // 불일치는 행 순회/추출 표류 신호 → 던져서 조용한 누락을 막는다(검사 P13 과 동작 일치 보장).
    // interactionEdgeRoutes 는 v1 표에서 interactionResultRoutes 와 같은 집합을 내므로 v1 동작은 불변.
    const perRow = new Set(outbound.map((e) => e.to_route));
    const viaHelper = new Set(interactionEdgeRoutes(spec).filter(isConcreteTargetRoute));
    for (const r of viaHelper) {
      if (!perRow.has(r)) {
        throw new Error(
          `nav-graph: 라우트 추출 불일치(${id}) — interactionEdgeRoutes 는 ${r} 를 냈으나 행별 추출엔 없음`,
        );
      }
    }

    loaded.push({ id, route, outbound });
  }

  const screens = {}; // id -> { inbound:[], outbound:[] } (빈 키는 마지막에 제거)
  const routes = {}; // route -> { inbound:[] }
  const ensureScreen = (id) => (screens[id] ||= { inbound: [], outbound: [] });
  const ensureRoute = (r) => (routes[r] ||= { inbound: [] });
  const runtimeRouteTargetIndex = buildRuntimeRouteTargetIndex(routeSet);
  const expoIndexRouteSet = parseExpoIndexRouteTokens(
    readFileSafe(path.join(docsDir, '_meta', 'route-tree.txt')),
  );

  // 2) navigation-map 라우트 시드 — 알려진 라우트가 미참조라도 routes[] 에 등장하게.
  const navMapText = readFileSafe(path.join(docsDir, 'app', 'navigation-map.md'));
  for (const r of parseNavigationMapRoutes(navMapText)) ensureRoute(r);

  // 3) 엣지 적용.
  for (const s of loaded) {
    for (const e of s.outbound) {
      // outbound: 소스 화면에 기록.
      ensureScreen(s.id).outbound.push({
        to_route: e.to_route,
        trigger: e.trigger,
        action: e.action,
      });
      // route inbound: 무조건 기록.
      ensureRoute(e.to_route).inbound.push({ from: s.id, trigger: e.trigger });
      // 목적 화면 해소: 검사 4 와 같은 route target semantics + 자기 자신 아님.
      const destRoute = resolveRouteTargetInScreenInventory(e.to_route, routeSet, runtimeRouteTargetIndex, {
        expoIndexRouteSet,
      });
      const dest = destRoute ? routeToScreen.get(destRoute) : null;
      if (dest && dest !== s.id) {
        ensureScreen(dest).inbound.push({ from: s.id, trigger: e.trigger, route: e.to_route });
      }
    }
  }

  // 4) 결정성: 화면 id 정렬 · 라우트 경로 정렬 · 각 inbound/outbound 정렬. 빈 키 제거.
  const outScreens = {};
  for (const id of Object.keys(screens).sort()) {
    const node = screens[id];
    node.inbound.sort((a, b) => inboundKey(a).localeCompare(inboundKey(b)));
    node.outbound.sort((a, b) => outboundKey(a).localeCompare(outboundKey(b)));
    const emitted = {};
    if (node.inbound.length) emitted.inbound = node.inbound;
    if (node.outbound.length) emitted.outbound = node.outbound;
    if (Object.keys(emitted).length) outScreens[id] = emitted; // 엣지 없는 화면은 노드로 넣지 않는다
  }

  const outRoutes = {};
  for (const r of Object.keys(routes).sort()) {
    const node = routes[r];
    node.inbound.sort((a, b) =>
      [a.from || '', a.trigger || ''].join('').localeCompare([b.from || '', b.trigger || ''].join('')),
    );
    outRoutes[r] = { inbound: node.inbound };
  }

  return { screens: outScreens, routes: outRoutes };
}
