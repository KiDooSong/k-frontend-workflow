#!/usr/bin/env node
// workflow-state.mjs — 상태 집계기
// frontmatter + 본문을 파싱해 대시보드(_meta/workflow-state.yaml)와
// 인벤토리(_meta/screen-inventory.yaml)를 생성한다.
// 파생 카운트(tbd_count 등)는 여기서만 계산한다 (frontmatter 수동 기재 금지).
// 참고: frontend-workflow-kit-implementation.md §5
import path from 'node:path';
import {
  parseArgs,
  DEFAULTS,
  KIT_ROOT,
  findFiles,
  exists,
  splitFrontmatter,
  readFileSafe,
  emitGeneratedYaml,
  writeFile,
  runCli,
  projectRootOf,
  isCliEntry,
} from './lib/util.mjs';
import { loadScreenSpec, deriveMetrics, isStub } from './lib/spec.mjs';
import { loadLayoutProfile } from './lib/layout-profile.mjs';
import { scanLayerInventory } from './lib/layer-inventory.mjs';
import { enforceCliFlagContract } from './lib/cli-args.mjs';

function todayISO() {
  // 결정성: --date 로 고정 가능. 기본은 오늘 (generated_at 한 줄만 변동 허용).
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function buildState({ docsDir, srcDir, date, layout, projectRoot }) {
  // 레이아웃 프로파일(tier1): deriveMetrics 의 fake_hook_exists 가 {roles.hook} 디렉토리를 단일
  // 출처에서 파생하도록 주입한다. 호출부가 주지 않으면 기본 프로파일(expo-feature)을 로드 —
  // 토큰화 이전과 BYTE-동치(README §1.1).
  const resolvedLayout = layout || loadLayoutProfile({ kitRoot: KIT_ROOT });
  const domainsRoot = path.join(docsDir, 'domains');
  const specPaths = findFiles(domainsRoot, 'screen-spec.md');

  const screens = {};
  const inventory = [];
  const idSeen = new Map();
  const routeSeen = new Map();

  for (const specPath of specPaths) {
    const spec = loadScreenSpec(specPath);
    const fm = spec.frontmatter;
    const id = fm.screen_id || fm.artifact_id || path.basename(path.dirname(specPath));
    const domain = fm.domain || null;
    const route = fm.route || null;
    const routeEntry = fm.route_entry || null;
    const screenEntry = fm.screen_entry || null;
    const status = fm.status || 'draft';

    const derived = deriveMetrics(spec, { srcDir, layout: resolvedLayout, projectRoot });

    screens[id] = {
      status,
      domain,
      route,
      route_entry: routeEntry,
      screen_entry: screenEntry,
      stub: isStub(spec),
      derived,
    };

    const inventoryRow = { id, domain, route, status };
    if (routeEntry) inventoryRow.route_entry = routeEntry;
    if (screenEntry) inventoryRow.screen_entry = screenEntry;
    inventory.push(inventoryRow);

    // 중복 추적
    if (id) idSeen.set(id, (idSeen.get(id) || 0) + 1);
    if (route) routeSeen.set(route, (routeSeen.get(route) || 0) + 1);
  }

  // 정렬 (결정성)
  const sortedScreenKeys = Object.keys(screens).sort();
  const sortedScreens = {};
  for (const k of sortedScreenKeys) {
    const s = screens[k];
    const presentFacts = Object.fromEntries(
      Object.entries(s.derived)
        .filter(([key, value]) => /_present$/.test(key) && typeof value === 'boolean')
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    // 키 순서 고정
    sortedScreens[k] = {
      status: s.status,
      domain: s.domain,
      route: s.route,
      stub: s.stub,
      derived: {
        state_matrix_complete: s.derived.state_matrix_complete,
        interaction_matrix_complete: s.derived.interaction_matrix_complete,
        copy_keys_has_tbd: s.derived.copy_keys_has_tbd,
        tbd_count: s.derived.tbd_count,
        unknown_count: s.derived.unknown_count,
        open_decisions_count: s.derived.open_decisions_count,
        blocking_decisions: s.derived.blocking_decisions,
        malformed_decisions: s.derived.malformed_decisions,
        api_confidence_min: s.derived.api_confidence_min,
        ...(s.derived.api_required === false ? { api_required: false } : {}),
        ...presentFacts,
        fake_hook_exists: s.derived.fake_hook_exists,
        figma_mapping_status: s.derived.figma_mapping_status,
      },
    };
    if (s.route_entry) sortedScreens[k].route_entry = s.route_entry;
    if (s.screen_entry) sortedScreens[k].screen_entry = s.screen_entry;
  }

  // 전역 사실
  const navPath = path.join(docsDir, 'app', 'navigation-map.md');
  let navStatus = 'missing';
  if (exists(navPath)) {
    const navFm = splitFrontmatter(readFileSafe(navPath));
    navStatus = navFm.data?.status || 'draft';
  }
  const catalogPath = path.join(docsDir, 'design', 'component-catalog.md');
  const componentCatalogGenerated = exists(catalogPath);

  const state = {
    generated_at: date,
    global: {
      navigation_map_status: navStatus,
      component_catalog_generated: componentCatalogGenerated,
      stub_screen_specs_count: specPaths.length,
    },
    screens: sortedScreens,
  };

  // 인벤토리 + 중복 검사
  const duplicate_ids = [...idSeen.entries()].filter(([, n]) => n > 1).map(([k]) => k).sort();
  const duplicate_routes = [...routeSeen.entries()]
    .filter(([, n]) => n > 1)
    .map(([k]) => k)
    .sort();

  inventory.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const inventoryDoc = {
    screens: inventory.map((s) => {
      const row = {
        id: s.id,
        domain: s.domain,
        route: s.route,
        status: s.status,
      };
      if (s.route_entry) row.route_entry = s.route_entry;
      if (s.screen_entry) row.screen_entry = s.screen_entry;
      return row;
    }),
    checks: {
      duplicate_ids,
      duplicate_routes,
    },
  };

  const layerInventory = resolvedLayout.layerTelemetryDeclared
    ? scanLayerInventory({
        projectRoot: projectRoot || path.dirname(srcDir),
        srcDir,
        layout: resolvedLayout,
        screens: inventory,
      })
    : null;

  return { state, inventory: inventoryDoc, layerInventory };
}

function helpText() {
  return `workflow:state - screen-spec 집계로 _meta 상태 파일 생성 (workflow-state.yaml · screen-inventory.yaml)

Usage:
  node scripts/workflow-state.mjs [--docs <dir>] [--src <dir>] [--root <dir>]
                                  [--date <YYYY-MM-DD>] [--out <dir>] [--layout <file>]
                                  [--json] [--help]

Options:
  --docs <dir>    authoring 문서 루트. 기본: ${DEFAULTS.docs}
  --src <dir>     소스 루트(fake hook 존재 등 derived fact 탐색 기준). 기본: ${DEFAULTS.src}
  --root <dir>    프로젝트 루트 오버라이드. 기본: --src 의 상위 디렉토리
  --date <date>   generated_at 고정(결정성). 기본: 오늘
  --out <dir>     출력 디렉토리. 기본: <docs>/_meta
  --layout <file> project-layout.yaml 경로 오버라이드
  --json          파일을 쓰지 않고 결정적 JSON({ state, inventory })을 stdout 으로 출력
  --help          이 도움말 출력

Behavior:
  usage 오류(unknown option·값 없는 value flag·값 붙은 boolean flag·positional)는
  어떤 파일도 만들기 전에 exit 2 — 오타가 파일 쓰기로 조용히 진행되는 fail-open 을 금지한다.
`;
}

// parseArgs 는 모든 --foo 를 그대로 flags 에 넣으므로(거부 없음) CLI 별 allowlist 로 오타를 잡는다.
// 예: --jsno 오타가 "JSON 출력 없는 실제 _meta 파일 쓰기"로, --outt 오타가 기본 경로 쓰기로
// 조용히 진행되는 것을 막는다(exit 2). validate.mjs(PR #175)와 같은 계약.
const VALUE_FLAGS = new Set(['docs', 'src', 'root', 'date', 'out', 'layout']);
const BOOLEAN_FLAGS = new Set(['json', 'help']);

function main() {
  const argv = process.argv.slice(2);
  const { flags, positionals } = parseArgs(argv);
  // 인자 검증은 todayISO()·layout 로드·파일 탐색·파일 쓰기보다 먼저 — usage 오류에서 파일 생성/수정 0.
  enforceCliFlagContract({
    argv,
    flags,
    positionals,
    valueFlags: VALUE_FLAGS,
    booleanFlags: BOOLEAN_FLAGS,
    tool: 'workflow:state',
    helpCommand: 'node scripts/workflow-state.mjs',
  });
  if (flags.help) {
    process.stdout.write(helpText());
    return; // help 는 자연 종료 exit 0 (cli-stdout-flush 계약 — process.exit(0) 금지)
  }
  const docsDir = path.resolve(flags.docs || DEFAULTS.docs);
  const srcDir = path.resolve(flags.src || DEFAULTS.src);
  const projectRoot = projectRootOf(srcDir, flags);
  const date = (typeof flags.date === 'string' && flags.date) || todayISO();
  const outDir = flags.out ? path.resolve(flags.out) : path.join(docsDir, '_meta');
  // 레이아웃 프로파일(tier1): role→glob 단일 출처. --layout 으로 project-layout.yaml 경로 오버라이드.
  const layout = loadLayoutProfile({ kitRoot: KIT_ROOT, flags });

  const { state, inventory, layerInventory } = buildState({ docsDir, srcDir, date, layout, projectRoot });

  if (flags.json) {
    const payload = layerInventory ? { state, inventory, layer_inventory: layerInventory } : { state, inventory };
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return;
  }

  const stateYaml = emitGeneratedYaml(
    [
      'GENERATED FILE — DO NOT EDIT',
      'Source:  docs/frontend-workflow/domains/**/screen-spec.md (frontmatter + 본문)',
      'Command: npm run workflow:state',
    ],
    state,
  );
  const invYaml = emitGeneratedYaml(
    [
      'GENERATED FILE — DO NOT EDIT',
      'Source:  docs/frontend-workflow/domains/**/screen-spec.md (frontmatter)',
      'Command: npm run workflow:state',
    ],
    inventory,
  );

  const stateOut = path.join(outDir, 'workflow-state.yaml');
  const invOut = path.join(outDir, 'screen-inventory.yaml');
  writeFile(stateOut, stateYaml);
  writeFile(invOut, invYaml);
  let layerOut = null;
  if (layerInventory) {
    const layerYaml = emitGeneratedYaml(
      [
        'GENERATED FILE — DO NOT EDIT',
        'Source:  project-layout.yaml layers: telemetry + source tree scan',
        'Command: npm run workflow:state',
        'Scope:   warning-first; layer access feeds readiness paths; hard gates/CI are not promoted',
      ],
      layerInventory,
    );
    layerOut = path.join(outDir, 'layer-inventory.yaml');
    writeFile(layerOut, layerYaml);
  }

  const screenCount = Object.keys(state.screens).length;
  process.stdout.write(
    `workflow:state — ${screenCount} screen(s)\n` +
      `  wrote ${path.relative(process.cwd(), stateOut)}\n` +
      `  wrote ${path.relative(process.cwd(), invOut)}\n` +
      (layerOut ? `  wrote ${path.relative(process.cwd(), layerOut)}\n` : ''),
  );
  if (inventory.checks.duplicate_ids.length || inventory.checks.duplicate_routes.length) {
    process.stdout.write(
      `  ⚠ duplicate_ids=${JSON.stringify(inventory.checks.duplicate_ids)} ` +
        `duplicate_routes=${JSON.stringify(inventory.checks.duplicate_routes)}\n`,
    );
  }
}

// 직접 실행될 때만 main() (import 시 부작용 없음 — buildState 재사용 가능)
// runCli: 레이아웃 설정 오류(미정의 role·부재 --layout)를 exit 2 로 surface(stack trace+exit 1 차단).
if (isCliEntry(import.meta.url)) runCli(main, 'workflow:state');
