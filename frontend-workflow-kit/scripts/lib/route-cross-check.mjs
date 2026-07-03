// route-cross-check.mjs (lib) — ScreenSpec route ↔ route-tree.txt EXACT 교차검증 (warning-first).
//
// OD-4 = (A) 별도 warning-only 도구의 로직. ScreenSpec frontmatter `route` 집합과 route-tree.txt 의
//   `route: <token>` 집합을 EXACT(정규화 없음)로 양방향 대조한다. 불일치는 경고로만 surface 하며
//   (CLI 가 항상 exit 0), validate/nav-graph/route-tree 에 결합하지 않는다 — 별도 도구로만(§10(10b)·NG-1).
//
// 입력 = 어댑터가 아니라 산출물 2개다(어댑터 import 없음 — 산출물만 읽는다):
//   - route 집합           : <docs>/_meta/route-tree.txt → parseRouteTreeRouteTokens (route-core.mjs)
//                            = validate 검사 13 이 쓰는 그 추출과 동일(EXACT). route-tree.txt 가 곧
//                              어댑터 rawPath 의 투영이라 "어댑터 rawPath 집합"을 어댑터 import 없이 만족.
//   - ScreenSpec route 집합 : <docs>/domains/**/screen-spec.md 의 frontmatter `route`
//                            (수집 findFiles + 파싱 loadScreenSpec — validate.mjs:262-275 의 screen-spec
//                             수집/파싱을 그대로 재사용).
//
// 비교 규약은 §6 에서 확정: ScreenSpec route == adapter rawPath, EXACT(정규화 없음).
//   parseRouteTreeRouteTokens 가 [id]/(group) raw 표기를 정규화하지 않으므로(route-core.mjs:171-172)
//   양쪽 표기 규약이 일치한다. nav-graph/check 4 의 런타임 URL 보조 해소와 별개로, 이 standalone
//   route-tree cross-check 는 계속 raw token EXACT 만 본다.
//
// fail-soft: route-tree.txt 부재 또는 screen-spec 0건이면 조용히 skip(검사 13 "artifact 부재 시 skip"
//   동형 — validate.mjs:277-283). 크래시 금지. 결정성: 경고 정렬 고정(route/file 사전식),
//   타임스탬프·절대 머신경로 없음(모든 finding 경로는 docsDir 상대 posix).
//
// 이 모듈은 순수 로직 + 얕은 IO(산출물 읽기)만 한다. 출력/exit 는 CLI(scripts/route-cross-check.mjs).
// 첫 슬라이스는 route 차원만 — nav 차원(navigation-map drift)·codegen output↔docs 차원은 후속(§11b·§17).
//
// 상보 관계: validate 검사 13(interactionMatrixV2Issues, route-core.mjs:484)은 이미 Interaction Matrix v2
//   Target ↔ route-tree 를 validate 내부 경고로 교차검증한다. 이 도구는 입력이 다른 frontmatter route ↔
//   route-tree 변을 별도 standalone 으로 채운다(삼각형 {Result/Target}↔{frontmatter route}↔{route-tree}
//   의 마지막 변 — 실제 갭 메움, 중복 아님). "한쪽은 validate 안, 한쪽은 독립 도구" 비대칭은 OD-4 사람
//   결정(§10(10b): validate 를 무의존 contract 게이트로 유지)의 산물 — 향후 통합 여지로만 기록.
import path from 'node:path';
import { findFiles, readFileSafe, exists } from './util.mjs';
import { loadScreenSpec } from './spec.mjs';
import { parseRouteTreeRouteTokens } from './route-core.mjs';

// 표시용 경로 — fromDir 상대 posix(\→/). 절대 머신경로를 출력에 흘리지 않는다(결정성).
function relPosix(fromDir, absPath) {
  const rel = path.relative(fromDir, absPath);
  return (rel || '.').split(path.sep).join('/');
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// docsDir 아래 screen-spec frontmatter `route` 를 수집한다(validate.mjs:262-275 와 동일 식).
//   반환: { count, routeToFiles }  — count 는 screen-spec.md 파일 수(0 이면 skip 신호),
//   routeToFiles 는 route -> [docsDir-상대 posix 파일경로] (route 없는 spec 은 미등록).
function collectSpecRoutes(docsDir) {
  const specPaths = findFiles(path.join(docsDir, 'domains'), 'screen-spec.md');
  const routeToFiles = new Map();
  for (const p of specPaths) {
    const spec = loadScreenSpec(p);
    const route = spec.frontmatter && spec.frontmatter.route;
    if (typeof route !== 'string' || route === '') continue; // route 없는 stub 등은 대조 대상 아님
    const rel = relPosix(docsDir, p);
    const files = routeToFiles.get(route) || [];
    if (!files.includes(rel)) files.push(rel);
    routeToFiles.set(route, files);
  }
  return { count: specPaths.length, routeToFiles };
}

// 산출물 2개를 읽어 EXACT 양방향 대조한다(부작용 없음 — 읽기만). 반환은 그대로 JSON 직렬화 가능
// (CLI --json 페이로드). 모든 finding 경로는 docsDir 상대 posix(머신 독립·결정적).
export function analyzeRouteCrossCheck({ docsDir }) {
  const routeTreeFile = path.join(docsDir, '_meta', 'route-tree.txt');
  const routeTreeFound = exists(routeTreeFile);
  // route-tree 토큰은 파일이 있으면 항상 파싱한다 — skip 케이스에도 tree_route_count 를 정직하게 보고하기
  // 위해(route_tree_found:true 옆에 하드코딩 0 을 박지 않는다). 파일이 없으면 빈 집합(=0).
  const treeRouteSet = routeTreeFound
    ? parseRouteTreeRouteTokens(readFileSafe(routeTreeFile))
    : new Set();
  const { count: screenSpecCount, routeToFiles } = collectSpecRoutes(docsDir);

  const base = {
    tool: 'route-cross-check',
    mode: 'warning-first',
    docs: relPosix(process.cwd(), docsDir),
    route_tree: relPosix(docsDir, routeTreeFile),
    route_tree_found: routeTreeFound,
    screen_spec_count: screenSpecCount,
  };

  // fail-soft skip — route-tree.txt 부재 또는 screen-spec 0건(검사 13 동형). 크래시·불일치 경고 없음.
  if (!routeTreeFound || screenSpecCount === 0) {
    const reason = !routeTreeFound
      ? `route-tree.txt 없음: ${base.route_tree} (아직 생성 전이거나 미커밋 — warning-first skip)`
      : 'screen-spec 0건 (domains/**/screen-spec.md 없음 — warning-first skip)';
    return {
      ...base,
      skipped: true,
      skip_reason: reason,
      spec_route_count: routeToFiles.size,
      tree_route_count: treeRouteSet.size,
      spec_not_in_tree: [],
      tree_not_in_spec: [],
      warning_count: 0,
    };
  }

  const specRouteSet = new Set(routeToFiles.keys());

  // 방향 1: ScreenSpec route 인데 route-tree 에 없음 — 선언했는데 트리에 없음(drift/오타 신호, 더 강함).
  //   파일 컨텍스트를 함께 단다(어느 spec 이 표류했는지).
  const specNotInTree = [...specRouteSet]
    .filter((r) => !treeRouteSet.has(r))
    .sort(compareText)
    .map((route) => ({ route, files: [...routeToFiles.get(route)].sort(compareText) }));

  // 방향 2: route-tree 에 있는데 ScreenSpec 없음 — 누락 문서이거나 레이아웃·그룹 라우트일 수 있음.
  const treeNotInSpec = [...treeRouteSet].filter((r) => !specRouteSet.has(r)).sort(compareText);

  return {
    ...base,
    skipped: false,
    skip_reason: null,
    spec_route_count: specRouteSet.size,
    tree_route_count: treeRouteSet.size,
    spec_not_in_tree: specNotInTree,
    tree_not_in_spec: treeNotInSpec,
    warning_count: specNotInTree.length + treeNotInSpec.length,
  };
}

// report → 불일치 경고 블록(라인 배열). skip 이거나 불일치가 없으면 빈 배열(catalog-gen
// formatBarrelWarnings 미러 — "말할 게 있을 때만 말한다"). 양방향을 각각 라벨한다.
export function formatRouteCrossCheckWarnings(report) {
  if (!report || report.skipped || report.warning_count === 0) return [];
  const lines = [
    'route-cross-check — WARNING: ScreenSpec route ↔ route-tree mismatch (warning-first, non-blocking)',
    `  route-tree: ${report.route_tree}`,
  ];
  for (const { route, files } of report.spec_not_in_tree) {
    // 방향 1(더 강한 신호) — route 와 표류 의심 spec 파일을 함께.
    lines.push(`  ScreenSpec route not in route-tree: ${route}  (${files.join(', ')})`);
  }
  if (report.tree_not_in_spec.length) {
    // 방향 2 — 파일 귀속이 없으므로 한 줄에 사전식으로 모은다.
    lines.push(`  route-tree route without ScreenSpec: ${report.tree_not_in_spec.join(', ')}`);
  }
  return lines;
}

// CLI 사람-읽기 출력(stderr) 전체 — skip 통지 / ok 요약 / 경고 블록. standalone 도구라
// 항상 한 줄 이상을 돌려준다(돌긴 돌았는지 가독). exit code 는 바꾸지 않는다(CLI 가 항상 0).
export function formatRouteCrossCheckHuman(report) {
  if (report.skipped) {
    return [`route-cross-check — skip (warning-first): ${report.skip_reason}`];
  }
  const warnings = formatRouteCrossCheckWarnings(report);
  if (warnings.length) return warnings;
  return [
    `route-cross-check — ok (warning-first): ScreenSpec ↔ route-tree consistent ` +
      `(${report.spec_route_count} spec route(s), ${report.tree_route_count} tree route(s))`,
  ];
}
