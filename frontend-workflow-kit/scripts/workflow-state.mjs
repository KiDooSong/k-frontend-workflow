#!/usr/bin/env node
// workflow-state.mjs — 상태 집계기
// frontmatter + 본문을 파싱해 대시보드(_meta/workflow-state.yaml)와
// 인벤토리(_meta/screen-inventory.yaml)를 생성한다.
// 파생 카운트(tbd_count 등)는 여기서만 계산한다 (frontmatter 수동 기재 금지).
// 참고: frontend-workflow-kit-implementation.md §5
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parseArgs,
  DEFAULTS,
  findFiles,
  exists,
  splitFrontmatter,
  readFileSafe,
  emitGeneratedYaml,
  writeFile,
} from './lib/util.mjs';
import { loadScreenSpec, deriveMetrics, isStub } from './lib/spec.mjs';

function todayISO() {
  // 결정성: --date 로 고정 가능. 기본은 오늘 (generated_at 한 줄만 변동 허용).
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function buildState({ docsDir, srcDir, date }) {
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
    const status = fm.status || 'draft';

    const derived = deriveMetrics(spec, { srcDir });

    screens[id] = {
      status,
      domain,
      route,
      stub: isStub(spec),
      derived,
    };

    inventory.push({ id, domain, route, status });

    // 중복 추적
    if (id) idSeen.set(id, (idSeen.get(id) || 0) + 1);
    if (route) routeSeen.set(route, (routeSeen.get(route) || 0) + 1);
  }

  // 정렬 (결정성)
  const sortedScreenKeys = Object.keys(screens).sort();
  const sortedScreens = {};
  for (const k of sortedScreenKeys) {
    const s = screens[k];
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
        api_confidence_min: s.derived.api_confidence_min,
        fake_hook_exists: s.derived.fake_hook_exists,
        figma_mapping_status: s.derived.figma_mapping_status,
      },
    };
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
    screens: inventory.map((s) => ({
      id: s.id,
      domain: s.domain,
      route: s.route,
      status: s.status,
    })),
    checks: {
      duplicate_ids,
      duplicate_routes,
    },
  };

  return { state, inventory: inventoryDoc };
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const docsDir = path.resolve(flags.docs || DEFAULTS.docs);
  const srcDir = path.resolve(flags.src || DEFAULTS.src);
  const date = (typeof flags.date === 'string' && flags.date) || todayISO();
  const outDir = flags.out ? path.resolve(flags.out) : path.join(docsDir, '_meta');

  const { state, inventory } = buildState({ docsDir, srcDir, date });

  if (flags.json) {
    process.stdout.write(JSON.stringify({ state, inventory }, null, 2) + '\n');
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

  const screenCount = Object.keys(state.screens).length;
  process.stdout.write(
    `workflow:state — ${screenCount} screen(s)\n` +
      `  wrote ${path.relative(process.cwd(), stateOut)}\n` +
      `  wrote ${path.relative(process.cwd(), invOut)}\n`,
  );
  if (inventory.checks.duplicate_ids.length || inventory.checks.duplicate_routes.length) {
    process.stdout.write(
      `  ⚠ duplicate_ids=${JSON.stringify(inventory.checks.duplicate_ids)} ` +
        `duplicate_routes=${JSON.stringify(inventory.checks.duplicate_routes)}\n`,
    );
  }
}

// 직접 실행될 때만 main() (import 시 부작용 없음 — buildState 재사용 가능)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
