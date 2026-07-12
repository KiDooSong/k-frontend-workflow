// adoption-probe.mjs — draft-only brownfield adoption probe.
// It renders adoption templates into temp/runs/adoption-probe-<id>/ and runs
// existing workflow commands only against scratch copies, never live docs.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  KIT_ROOT,
  parseArgs,
  exists,
  isDir,
  readFileSafe,
  walkFiles,
  writeFile,
  loadYaml,
  yamlStringify,
} from './util.mjs';
import { enforceCliFlagContract } from './cli-args.mjs';
import { writePolicyDraftArtifacts } from './policy-draft.mjs';
import { renderBootstrapMarkdown } from './visual-contract-bootstrap.mjs';

const SCRIPT_ROOT = path.join(KIT_ROOT, 'scripts');
const TEMPLATE_ROOT = path.join(KIT_ROOT, 'templates', 'adoption');
const BUILT_IN_ROLES = [
  'route_entry',
  'screen',
  'domain_component',
  'hook',
  'ui_primitive',
  'api_client',
  'api_schema',
];

const DEFAULT_ROLE_GLOBS = {
  route_entry: 'src/app/**',
  screen: 'src/features/{domain}/screens/**',
  domain_component: 'src/features/{domain}/components/**',
  hook: 'src/features/{domain}/hooks/**',
  ui_primitive: 'src/components/ui/**',
  api_client: 'src/api/**',
  api_schema: 'src/api/schemas/**',
};

const EXTRA_LAYER_PATTERNS = [
  { layer: 'view_model', segments: ['viewmodels', 'viewmodel', 'view-models', 'presenters'] },
  { layer: 'use_case', segments: ['usecases', 'usecase', 'use-cases', 'interactors'] },
  { layer: 'repository', segments: ['repositories', 'repository'] },
  { layer: 'entity', segments: ['entities', 'entity', 'models'] },
  { layer: 'data_source', segments: ['datasources', 'datasource', 'data-sources', 'services'] },
  { layer: 'mapper', segments: ['mappers', 'mapper'] },
];

const EXTRA_LAYER_ACCESS = {
  view_model: ['rough-fixture-ui', 'final-fixture-ui'],
  use_case: ['rough-fixture-ui', 'final-fixture-ui'],
  entity: ['rough-fixture-ui', 'final-fixture-ui'],
  repository: ['final-fixture-ui', 'api-integrated-ui'],
  data_source: ['api-integrated-ui'],
  mapper: ['api-integrated-ui'],
};

function toPosix(p) {
  return String(p || '').replace(/\\/g, '/');
}

function rel(root, abs) {
  const r = toPosix(path.relative(root, abs));
  return r || '.';
}

function joinPosix(...parts) {
  return parts
    .filter((p) => p != null && p !== '')
    .map((p) => toPosix(p).replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

function safeRepoRel(repoRoot, abs, fallback) {
  return isSameOrInside(path.resolve(repoRoot), path.resolve(abs)) ? rel(repoRoot, abs) : fallback;
}

function resolveUnder(root, value) {
  if (!value) return null;
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function defaultProbeId() {
  const d = new Date();
  return (
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate(),
    ).padStart(2, '0')}-` +
    `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(
      2,
      '0',
    )}${String(d.getSeconds()).padStart(2, '0')}`
  );
}

function sanitizeId(value) {
  return String(value || defaultProbeId())
    .trim()
    .replace(/^adoption-probe-/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || defaultProbeId();
}

function packageName(repoRoot) {
  const pkg = readFileSafe(path.join(repoRoot, 'package.json'));
  if (!pkg) return path.basename(repoRoot);
  try {
    const parsed = JSON.parse(pkg);
    return parsed.name || path.basename(repoRoot);
  } catch {
    return path.basename(repoRoot);
  }
}

function detectPackageManager(repoRoot) {
  const lockfiles = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
  ];
  const found = lockfiles.find(([file]) => exists(path.join(repoRoot, file)));
  return found ? `${found[1]} (${found[0]})` : 'not observed';
}

function detectFramework(repoRoot) {
  const pkg = readFileSafe(path.join(repoRoot, 'package.json'));
  if (!pkg) return { value: 'not observed', evidence: 'package.json missing' };
  try {
    const parsed = JSON.parse(pkg);
    const deps = { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) };
    const tags = [];
    if (deps.expo) tags.push('Expo');
    if (deps['expo-router']) tags.push('expo-router');
    if (deps.react) tags.push('React');
    if (deps.next) tags.push('Next.js');
    if (deps.vite) tags.push('Vite');
    return {
      value: tags.length ? tags.join(' + ') : 'package.json present, framework not inferred',
      evidence: 'package.json',
    };
  } catch {
    return { value: 'package.json parse failed', evidence: 'package.json' };
  }
}

function firstExistingDir(projectRoot, candidates) {
  for (const c of candidates) {
    const abs = path.join(projectRoot, ...c.split('/'));
    if (isDir(abs)) return c;
  }
  return null;
}

function globForDir(dir) {
  return dir ? `${toPosix(dir).replace(/\/+$/, '')}/**` : null;
}

function roleCandidates(srcRel, role) {
  const candidatesByRole = {
    route_entry: [
      { base: 'src', path: 'app' },
      { base: 'repo', path: 'app' },
      { base: 'src', path: 'routes' },
      { base: 'src', path: 'pages' },
    ],
    screen: [
      { base: 'src', path: 'presentation/{domain}/screens' },
      { base: 'src', path: 'features/{domain}/screens' },
      { base: 'src', path: 'screens' },
      { base: 'src', path: 'pages' },
    ],
    domain_component: [
      { base: 'src', path: 'presentation/{domain}/components' },
      { base: 'src', path: 'features/{domain}/components' },
      { base: 'src', path: 'components' },
    ],
    hook: [
      { base: 'src', path: 'features/{domain}/hooks' },
      { base: 'src', path: 'presentation/{domain}/hooks' },
      { base: 'src', path: 'presentation/{domain}/viewmodels' },
      { base: 'src', path: 'hooks' },
    ],
    ui_primitive: [
      { base: 'src', path: 'components/ui' },
      { base: 'src', path: 'shared/ui' },
      { base: 'src', path: 'ui' },
      { base: 'repo', path: 'packages/ui/src' },
    ],
    api_client: [
      { base: 'src', path: 'api' },
      { base: 'src', path: 'data/{domain}/datasources' },
      { base: 'src', path: 'services' },
    ],
    api_schema: [
      { base: 'src', path: 'api/schemas' },
      { base: 'src', path: 'api/schema' },
      { base: 'src', path: 'schemas' },
    ],
  };
  return (candidatesByRole[role] || []).map((c) =>
    c.base === 'src' ? joinPosix(srcRel, c.path) : toPosix(c.path),
  );
}

function defaultRoleGlob(srcRel, role) {
  const fallback = DEFAULT_ROLE_GLOBS[role];
  return fallback ? fallback.replace(/^src(?=\/|$)/, srcRel) : fallback;
}

function pickRole(projectRoot, srcRel, role) {
  const candidates = roleCandidates(srcRel, role);
  for (const raw of candidates) {
    if (!raw.includes('{domain}')) {
      const found = firstExistingDir(projectRoot, [raw]);
      if (found) return roleInfo(role, globForDir(found), 'confirmed', found);
      continue;
    }
    const concreteRoot = raw.split('/{domain}/')[0];
    const suffix = raw.split('/{domain}/')[1];
    const rootAbs = path.join(projectRoot, ...concreteRoot.split('/'));
    if (!isDir(rootAbs)) continue;
    const domains = fs.readdirSync(rootAbs, { withFileTypes: true }).filter((e) => e.isDirectory());
    const match = domains.find((d) => isDir(path.join(rootAbs, d.name, ...suffix.split('/'))));
    if (match) return roleInfo(role, `${raw}/**`, 'confirmed', `${concreteRoot}/${match.name}/${suffix}`);
  }
  return roleInfo(role, defaultRoleGlob(srcRel, role), 'candidate', 'default preset fallback');
}

function roleInfo(role, glob, confidence, evidence) {
  return { role, glob: toPosix(glob), confidence, evidence: toPosix(evidence), note: '' };
}


function rootsOverlap(a, b) {
  if (!a || !b) return false;
  return a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
}

function appendNote(role, note) {
  if (!role) return;
  role.note = role.note ? `${role.note}; ${note}` : note;
}

function routeScreenSeparation(roleMap) {
  const route = roleMap?.route_entry;
  const screen = roleMap?.screen;
  const routeRoot = globRootPattern(route?.glob || '');
  const screenRoot = globRootPattern(screen?.glob || '');
  const shapeSeparated = Boolean(routeRoot && screenRoot && !rootsOverlap(routeRoot, screenRoot));
  const confirmed = route?.confidence === 'confirmed' && screen?.confidence === 'confirmed';
  const separated = Boolean(shapeSeparated && confirmed);
  return {
    supported: true,
    separated,
    candidate_separated: Boolean(shapeSeparated && !confirmed),
    confirmed,
    route_entry_glob: route?.glob || null,
    screen_glob: screen?.glob || null,
    route_entry_evidence: route?.evidence || null,
    screen_evidence: screen?.evidence || null,
    observation: separated
      ? 'route_entry and screen roots are independent; thin routes plus separate screen/view files are supported'
      : shapeSeparated
        ? 'candidate defaults are independent, not observed; thin route support is a proposal until both roles are confirmed'
        : 'route_entry and screen roots overlap or one role is candidate; path coupling is not assumed',
  };
}
function detectRoleMap(projectRoot, srcDir) {
  const srcRel = safeRepoRel(projectRoot, srcDir, 'src');
  const roles = Object.fromEntries(
    BUILT_IN_ROLES.map((role) => [role, pickRole(projectRoot, srcRel, role)]),
  );
  if (roles.hook.evidence.includes('/viewmodels')) {
    roles.hook.note = 'temporary flattening: viewmodel path mapped to hook role';
  }
  const separation = routeScreenSeparation(roles);
  if (separation.separated) {
    appendNote(roles.route_entry, 'independent from screen role; thin route boundary supported');
    appendNote(roles.screen, 'independent from route_entry role; screen/view implementation may live elsewhere');
  }
  return roles;
}

function detectExtraLayers(projectRoot, srcDir) {
  if (!isDir(srcDir)) return [];
  const dirs = walkDirs(srcDir);
  const out = [];
  const seen = new Set();
  for (const dir of dirs) {
    const base = path.basename(dir).toLowerCase();
    const match = EXTRA_LAYER_PATTERNS.find((p) => p.segments.includes(base));
    if (!match) continue;
    const relPath = rel(projectRoot, dir);
    const key = `${match.layer}:${relPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ layer: match.layer, path: relPath });
  }
  return out.sort((a, b) => (a.layer + a.path).localeCompare(b.layer + b.path));
}

function isSameOrInside(parent, child) {
  const p = toPosix(parent).replace(/\/+$/, '');
  const c = toPosix(child).replace(/\/+$/, '');
  return c === p || c.startsWith(`${p}/`);
}

function globRootPattern(glob) {
  return toPosix(glob || '').replace(/\/\*\*$/, '').replace(/\*.*$/, '').replace(/\/+$/, '');
}

function concreteRoleRootsForLayer(glob, layerPath) {
  const rootPattern = globRootPattern(glob);
  if (!rootPattern) return [];
  if (!rootPattern.includes('{domain}')) return [rootPattern];

  const patternParts = rootPattern.split('/').filter(Boolean);
  const layerParts = toPosix(layerPath).replace(/\/+$/, '').split('/').filter(Boolean);
  if (patternParts.length > layerParts.length) return [];

  const concreteParts = [];
  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const layerPart = layerParts[i];
    if (patternPart === '{domain}') {
      if (!layerPart) return [];
      concreteParts.push(layerPart);
      continue;
    }
    if (patternPart !== layerPart) return [];
    concreteParts.push(patternPart);
  }
  return [concreteParts.join('/')];
}

function roleGlobRootsForLayer(roleMap, layerPath) {
  const roots = [];
  for (const role of Object.values(roleMap)) {
    const evidence = toPosix(role.evidence || '').replace(/\/+$/, '');
    if (evidence && evidence !== 'default preset fallback') {
      roots.push({ role: role.role, root: evidence });
    }

    const glob = toPosix(role.glob || '');
    if (!glob) continue;
    for (const root of concreteRoleRootsForLayer(glob, layerPath)) {
      if (root) roots.push({ role: role.role, root });
    }
  }
  return roots;
}

function builtInRoleForLayer(roleMap, layer) {
  return roleGlobRootsForLayer(roleMap, layer.path).find((candidate) => isSameOrInside(candidate.root, layer.path));
}

function splitF3Layers(roleMap, extraLayers) {
  const removable = [];
  const excluded = [];
  for (const layer of extraLayers) {
    const builtInRole = builtInRoleForLayer(roleMap, layer);
    if (builtInRole) excluded.push({ ...layer, role: builtInRole.role, reason: `flattened into built-in ${builtInRole.role} role` });
    else removable.push(layer);
  }
  return { removable, excluded };
}
function walkDirs(root) {
  const out = [];
  if (!isDir(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      out.push(full);
      stack.push(full);
    }
  }
  return out.sort();
}

function detectArchitecture(projectRoot, srcDir, extraLayers) {
  const srcRel = safeRepoRel(projectRoot, srcDir, 'src');
  const has = (p) => isDir(path.join(projectRoot, ...joinPosix(srcRel, p).split('/')));
  if (has('domain') && has('data')) return 'Clean Architecture / layered';
  if (extraLayers.some((x) => x.layer === 'view_model')) return 'MVVM-like';
  if (['pages', 'widgets', 'features', 'entities', 'shared'].filter(has).length >= 3) {
    return 'Feature-Sliced Design-like';
  }
  if (isDir(srcDir)) return 'ad-hoc / shallow layered';
  return 'not observed';
}

function detectCi(repoRoot) {
  const candidates = ['.github/workflows', '.gitlab-ci.yml', 'circle.yml', '.circleci/config.yml'];
  const found = candidates.filter((p) => exists(path.join(repoRoot, ...p.split('/'))));
  return found.length ? found.join(', ') : 'not observed';
}

function detectApi(repoRoot, srcDir) {
  const srcRel = safeRepoRel(repoRoot, srcDir, 'src');
  const candidates = [joinPosix(srcRel, 'api'), 'openapi.yaml', 'openapi.yml', joinPosix(srcRel, 'data')];
  const found = candidates.filter((p) => exists(path.join(repoRoot, ...p.split('/'))));
  return found.length ? found.join(', ') : 'not observed';
}

function detectVisual(repoRoot) {
  const files = walkFiles(repoRoot, ['.json', '.yaml', '.yml', '.md'])
    .map((f) => rel(repoRoot, f))
    .filter((p) => /figma|token|baseline/i.test(p))
    .slice(0, 8);
  return files.length ? files.join(', ') : 'not observed';
}

function detectTestId(repoRoot, srcDir) {
  const files = walkFiles(srcDir, ['.tsx', '.ts', '.jsx', '.js']).slice(0, 2000);
  const hits = [];
  for (const f of files) {
    const text = readFileSafe(f);
    if (text && /\b(testID|data-testid)\b/.test(text)) hits.push(rel(repoRoot, f));
    if (hits.length >= 8) break;
  }
  return hits.length ? hits.join(', ') : 'not observed';
}

function scanEnvironment(opts, roleMap, extraLayers) {
  const framework = detectFramework(opts.repoRoot);
  return {
    framework: framework.value,
    frameworkEvidence: framework.evidence,
    packageManager: detectPackageManager(opts.repoRoot),
    architecture: detectArchitecture(opts.repoRoot, opts.srcDir, extraLayers),
    srcDepth: srcDepthSummary(opts.srcDir, extraLayers),
    ci: detectCi(opts.repoRoot),
    api: detectApi(opts.repoRoot, opts.srcDir),
    visual: detectVisual(opts.repoRoot),
    testid: detectTestId(opts.repoRoot, opts.srcDir),
    roleMap,
    routeScreenSeparation: routeScreenSeparation(roleMap),
  };
}

function srcDepthSummary(srcDir, extraLayers) {
  if (!isDir(srcDir)) return 'src missing';
  const names = new Set(extraLayers.map((x) => x.layer));
  return names.size ? `${names.size + 3}+ layer signals (${[...names].sort().join(', ')})` : '3-layer or shallow';
}

function renderTemplate(name, replacements) {
  const source = readFileSafe(path.join(TEMPLATE_ROOT, name));
  if (source == null) throw new Error(`template missing: ${name}`);
  let text = source;
  for (const [key, value] of Object.entries(replacements)) {
    text = text.split(`{${key}}`).join(String(value));
  }
  return text;
}

function requireTemplate(name) {
  if (readFileSafe(path.join(TEMPLATE_ROOT, name)) == null) {
    throw new Error(`template missing: ${name}`);
  }
}

function layerPattern(layer) {
  return EXTRA_LAYER_PATTERNS.find((p) => p.layer === layer.layer) || null;
}

function draftGlobForLayer(layer) {
  const parts = toPosix(layer.path).split('/').filter(Boolean);
  const pattern = layerPattern(layer);
  const layerIndex = pattern ? parts.findIndex((part) => pattern.segments.includes(part.toLowerCase())) : -1;
  if (layerIndex > 1) {
    const previous = parts[layerIndex - 1].toLowerCase();
    if (!['src', 'app', 'components', 'shared', 'api'].includes(previous)) parts[layerIndex - 1] = '{domain}';
  }
  return `${parts.join('/')}/**`;
}

function draftLayerModel(extraLayers) {
  const order = new Map(EXTRA_LAYER_PATTERNS.map((pattern, index) => [pattern.layer, index]));
  const byRole = new Map();
  for (const layer of extraLayers) {
    const glob = draftGlobForLayer(layer);
    const current = byRole.get(layer.layer) || {
      role: layer.layer,
      glob: [],
      fact: 'dir_has_files',
      access: { allow: EXTRA_LAYER_ACCESS[layer.layer] || [], forbid: [] },
    };
    if (!current.glob.includes(glob)) current.glob.push(glob);
    byRole.set(layer.layer, current);
  }
  return [...byRole.values()]
    .sort((a, b) => (order.get(a.role) ?? 999) - (order.get(b.role) ?? 999) || a.role.localeCompare(b.role))
    .map((layer) => ({ ...layer, glob: layer.glob.length === 1 ? layer.glob[0] : layer.glob.sort() }));
}

function renderLayersBlock(extraLayers) {
  const layers = draftLayerModel(extraLayers);
  if (layers.length === 0) {
    return [
      '# layers: []',
      '# No extra Axis 2 layer paths were observed by this probe.',
      '# If added later, layers affect readiness only when passed through a declared layout; hard gates stay separate.',
    ].join('\n');
  }
  return yamlStringify({ layers }, { lineWidth: 0 }).trimEnd();
}

function renderProjectLayout(opts, roleMap, extraLayers) {
  const replacements = {
    ROUTE_GLOB: roleMap.route_entry.glob,
    SCREEN_GLOB: roleMap.screen.glob,
    COMPONENT_GLOB: roleMap.domain_component.glob,
    HOOK_GLOB: roleMap.hook.glob,
    UI_GLOB: roleMap.ui_primitive.glob,
    API_CLIENT_GLOB: roleMap.api_client.glob,
    API_SCHEMA_GLOB: roleMap.api_schema.glob,
    confirmed: 'see adoption-report',
    path: 'see adoption-report',
    DOMAIN_SCREEN_GLOB: 'see adoption-report',
    PROJECT_LAYOUT_CONTEXT: `probe ${opts.id}, proposal only, scratch-readiness input`,
    LAYERS_BLOCK: renderLayersBlock(extraLayers),
  };
  let text = renderTemplate('project-layout.template.yaml', replacements);
  text = text.replace(/\{confirmed\|candidate\}/g, 'see adoption-report');

  return text;
}

function roleRows(roleMap) {
  return BUILT_IN_ROLES.map((role) => {
    const r = roleMap[role];
    return `| ${role} | \`${r.glob}\` | ${r.confidence} | \`${r.evidence}\` | ${r.note || 'observed/proposed'} |`;
  }).join('\n');
}

function f3ExcludedMap(f3) {
  return new Map((f3.excluded || []).map((layer) => [layer.path, layer]));
}

function layerRows(extraLayers, f3, layerInventory) {
  if (extraLayers.length === 0) {
    return '| not observed | not observed | - | - | - | - | no extra Axis 2 layer detected |';
  }
  const inventoryRows = extraInventoryRows(layerInventory, extraLayers);
  if (inventoryRows.length) {
    const facts = layerInventory?.facts || {};
    return inventoryRows
      .map((row) => {
        const roleCell = row.overlap_role ? `flattened into ${row.overlap_role}` : 'telemetry role';
        const fact = `${row.role}_present=${facts[`${row.role}_present`] === true}`;
        return `| ${row.role} | \`${row.resolved_glob || row.glob}\` | ${roleCell} | yes (readiness access) | ${fact} | no | readiness access wired; hard_gate_wired=false |`;
      })
      .join('\n');
  }
  const excluded = f3ExcludedMap(f3);
  return extraLayers
    .map((l) => {
      const flattened = excluded.get(l.path);
      return `| ${l.layer} | \`${l.path}\` | ${flattened ? `built-in ${flattened.role}` : 'telemetry draft'} | yes (readiness access) | pending inventory | no | ${flattened ? flattened.reason : 'readiness access wired; hard_gate_wired=false'} |`;
    })
    .join('\n');
}

function extraLayerRoleSet(extraLayers) {
  return new Set(extraLayers.map((layer) => layer.layer));
}

function extraInventoryRows(layerInventory, extraLayers) {
  const roles = extraLayerRoleSet(extraLayers);
  return (layerInventory?.layers || []).filter((row) => roles.has(row.role));
}

export function accessSummary(row) {
  const allow = row?.access?.allow || [];
  const forbid = row?.access?.forbid || [];
  const parts = [];
  if (allow.length) parts.push(`allow [${allow.join(', ')}]`);
  if (forbid.length) parts.push(`forbid [${forbid.join(', ')}]`);
  const readinessWired = row?.readiness_access_wired === true || allow.length > 0 || forbid.length > 0;
  const hardGateWired = row?.hard_gate_wired === true;
  parts.push(`readiness_access_wired=${readinessWired}`);
  parts.push(`hard_gate_wired=${hardGateWired}`);
  return parts.join('; ');
}


function routeScreenRows(env) {
  const s = env.routeScreenSeparation || {};
  const rows = [
    ['Route entry role', s.route_entry_glob ? `\`${s.route_entry_glob}\`` : 'not observed', s.route_entry_evidence ? `evidence: \`${s.route_entry_evidence}\`` : 'candidate'],
    ['Screen entry role', s.screen_glob ? `\`${s.screen_glob}\`` : 'not observed', s.screen_evidence ? `evidence: \`${s.screen_evidence}\`` : 'candidate'],
    ['Separation model', s.separated ? 'observed independent roots' : s.candidate_separated ? 'candidate defaults, not observed' : 'not proven from roots', s.observation || 'path coupling is not assumed'],
  ];
  return rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} |`).join('\n');
}
function envRows(env) {
  return [
    ['Framework / router', env.framework, env.frameworkEvidence],
    ['Package manager / lockfile', env.packageManager, 'repo root'],
    ['Architecture style', env.architecture, 'src tree'],
    ['src layout depth', env.srcDepth, 'src tree'],
    ['Existing lint / CI', env.ci, '.github/.gitlab/package.json'],
    ['API definition location', env.api, 'src/openapi scan'],
    ['Figma / design token source', env.visual, 'keyword scan'],
    ['testID practice', env.testid, 'src grep'],
  ]
    .map(([a, b, c]) => `| ${a} | ${cell(b)} | ${cell(c)} |`)
    .join('\n');
}

function cell(value) {
  return String(value == null || value === '' ? 'not observed' : value).replace(/\n/g, '<br>');
}

function pathRef(opts, target) {
  const abs = path.resolve(target);
  const bases = [
    [opts.cwd, '.'],
    [opts.outDir, '<probe-run>'],
    [opts.repoRoot, '<target-repo>'],
    [KIT_ROOT, '<kit-root>'],
  ];
  for (const [base, label] of bases) {
    const root = path.resolve(base);
    if (isSameOrInside(root, abs)) {
      const suffix = toPosix(path.relative(root, abs));
      return suffix ? `${label}/${suffix}` : label;
    }
  }
  return toPosix(path.basename(abs));
}

function sanitizeEvidenceText(text, opts) {
  const replacements = [
    [opts.outDir, '<probe-run>'],
    [opts.repoRoot, '<target-repo>'],
    [KIT_ROOT, '<kit-root>'],
    [opts.cwd, '.'],
  ]
    .filter(([from]) => from)
    .map(([from, to]) => [path.resolve(from), to])
    .sort((a, b) => b[0].length - a[0].length);
  let out = String(text || '');
  for (const [from, to] of replacements) {
    out = out.split(from).join(to).split(toPosix(from)).join(to);
  }
  return out;
}

function sanitizePathishEvidenceText(text, opts) {
  return sanitizeEvidenceText(text, opts).split(path.sep).join('/');
}

function sanitizeCommandForEvidence(command, opts) {
  return {
    ...command,
    args: (command.args || []).map((arg) => sanitizePathishEvidenceText(arg, opts)),
    invocation: sanitizePathishEvidenceText(command.invocation, opts),
    stdout: sanitizeEvidenceText(command.stdout, opts),
    stderr: sanitizeEvidenceText(command.stderr, opts),
  };
}
function commandLine(name, args) {
  return `node ${toPosix(path.relative(KIT_ROOT, path.join(SCRIPT_ROOT, name)))} ${args.join(' ')}`;
}

function runNodeScript(name, args, opts) {
  const script = path.join(SCRIPT_ROOT, name);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: opts.cwd || KIT_ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    tool: name,
    args,
    invocation: commandLine(name, args),
    exitCode: result.status == null ? 1 : result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    ok: result.status === 0,
  };
}

function writeObservation(opts, name, command) {
  const sanitized = sanitizeCommandForEvidence(command, opts);
  const outDir = opts.outDir;
  const dir = path.join(outDir, 'observations');
  writeFile(path.join(dir, `${name}.stdout.txt`), sanitized.stdout || '');
  writeFile(path.join(dir, `${name}.stderr.txt`), sanitized.stderr || '');
  writeFile(path.join(dir, `${name}.json`), JSON.stringify(sanitized, null, 2) + '\n');
}

function copyDirIfExists(from, to) {
  if (!isDir(from)) {
    fs.mkdirSync(to, { recursive: true });
    return false;
  }
  fs.cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      return base !== 'node_modules' && base !== '.git';
    },
  });
  return true;
}

function prepareScratch(opts) {
  const scratchRoot = path.join(opts.outDir, 'scratch', 'project');
  const docsScratch = path.join(scratchRoot, 'docs', 'frontend-workflow');
  const srcScratch = path.join(scratchRoot, ...opts.srcRel.split('/'));
  fs.rmSync(path.join(opts.outDir, 'scratch'), { recursive: true, force: true });
  fs.mkdirSync(scratchRoot, { recursive: true });
  copyDirIfExists(opts.docsDir, docsScratch);
  copyDirIfExists(opts.srcDir, srcScratch);
  return { scratchRoot, docsScratch, srcScratch };
}

function observeWorkflow(opts, scratch) {
  const layoutArg = opts.layoutPath;
  const state = runNodeScript(
    'workflow-state.mjs',
    ['--root', scratch.scratchRoot, '--docs', scratch.docsScratch, '--src', scratch.srcScratch, '--layout', layoutArg, '--date', opts.date],
    { cwd: KIT_ROOT },
  );
  const readiness = runNodeScript(
    'readiness.mjs',
    ['--docs', scratch.docsScratch, '--layout', layoutArg, '--json'],
    { cwd: KIT_ROOT },
  );
  const validate = runNodeScript(
    'validate.mjs',
    ['--root', scratch.scratchRoot, '--docs', scratch.docsScratch, '--src', scratch.srcScratch, '--layout', layoutArg, '--json'],
    { cwd: KIT_ROOT },
  );
  const catalogOut = path.join(opts.outDir, 'component-catalog.observed.md');
  const catalog = isDir(scratch.srcScratch)
    ? runNodeScript(
        'catalog-gen.mjs',
        ['--root', scratch.scratchRoot, '--src', scratch.srcScratch, '--layout', layoutArg, '--out', catalogOut],
        { cwd: KIT_ROOT },
      )
    : {
        tool: 'catalog-gen.mjs',
        args: [],
        invocation: 'catalog skipped: src missing',
        exitCode: 2,
        stdout: '',
        stderr: 'src missing',
        ok: false,
      };

  const commands = { state, readiness, validate, catalog };
  for (const [name, cmd] of Object.entries(commands)) writeObservation(opts, name, cmd);
  return {
    commands,
    readinessJson: parseJson(readiness.stdout),
    validateJson: parseJson(validate.stdout),
    catalogCount: parseCatalogCount(catalog.stdout),
    layerInventory: loadLayerInventory(path.join(scratch.docsScratch, '_meta', 'layer-inventory.yaml')),
  };
}

function loadLayerInventory(file) {
  if (!exists(file)) return null;
  try {
    return loadYaml(file);
  } catch {
    return null;
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return null;
  }
}

function parseCatalogCount(text) {
  const m = /workflow:catalog\s+.\s+(\d+)\s+component\(s\)/.exec(text || '');
  return m ? Number(m[1]) : null;
}

function relativeToSrc(opts, repoRelativePath) {
  const layerPath = toPosix(repoRelativePath).replace(/^\/+/, '');
  const srcRel = toPosix(opts.srcRel).replace(/^\/+|\/+$/g, '');
  if (!srcRel || srcRel === '.') return layerPath;
  if (layerPath === srcRel) return '';
  return layerPath.startsWith(`${srcRel}/`) ? layerPath.slice(srcRel.length + 1) : layerPath;
}

function observeF3(opts, roleMap, extraLayers, originalReadiness) {
  const { removable, excluded } = splitF3Layers(roleMap, extraLayers);
  if (opts.skipF3 || extraLayers.length === 0 || !isDir(opts.srcDir)) {
    return {
      status: extraLayers.length === 0 ? 'skipped: no extra layers detected' : 'skipped',
      same: null,
      removed: [],
      excluded,
    };
  }
  if (removable.length === 0) {
    return {
      status: 'skipped: all extra layers are flattened into built-in roles',
      same: null,
      removed: [],
      excluded,
    };
  }
  const f3Root = path.join(opts.outDir, 'scratch-f3', 'project');
  const f3Docs = path.join(f3Root, 'docs', 'frontend-workflow');
  const f3Src = path.join(f3Root, ...opts.srcRel.split('/'));
  fs.rmSync(path.join(opts.outDir, 'scratch-f3'), { recursive: true, force: true });
  fs.mkdirSync(f3Root, { recursive: true });
  copyDirIfExists(opts.docsDir, f3Docs);
  copyDirIfExists(opts.srcDir, f3Src);
  const removed = [];
  for (const layer of removable) {
    const relPath = relativeToSrc(opts, layer.path);
    const target = path.join(f3Src, ...relPath.split('/'));
    if (isDir(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      removed.push(layer.path);
    }
  }
  const state = runNodeScript(
    'workflow-state.mjs',
    ['--root', f3Root, '--docs', f3Docs, '--src', f3Src, '--layout', opts.layoutPath, '--date', opts.date],
    { cwd: KIT_ROOT },
  );
  const readiness = runNodeScript(
    'readiness.mjs',
    ['--docs', f3Docs, '--layout', opts.layoutPath, '--json'],
    { cwd: KIT_ROOT },
  );
  writeObservation(opts, 'f3-state', state);
  writeObservation(opts, 'f3-readiness', readiness);
  const same = normalizeJsonText(readiness.stdout) === normalizeJsonText(originalReadiness.commands.readiness.stdout);
  return {
    status: readiness.ok ? 'observed' : 'readiness failed',
    same,
    removed,
    excluded,
    exitCode: readiness.exitCode,
  };
}

function normalizeJsonText(text) {
  const parsed = parseJson(text);
  return parsed == null ? String(text || '').trim() : JSON.stringify(parsed);
}

// --- visual observation (--visual) -------------------------------------------
// PR144/145 visual tooling을 probe scratch copy에 대해 관측만 한다. draft/observation
// 출력은 전부 probe run dir 내부에 쓰고, live docs/src·canonical contract는 절대 건드리지
// 않는다. 실패는 finding으로만 기록하고 probe 전체 exit behavior를 바꾸지 않는다(게이트 아님).

// 기존 contract 위치: --visual-contract override가 live docsDir 안을 가리키면 scratch copy의
// 같은 상대 경로로 재매핑한다 (probe는 scratch만 읽는다). docsDir 밖 경로는 그대로 읽는다(읽기 전용).
function visualContractPaths(opts, scratch) {
  if (opts.visualContract) {
    const live = path.resolve(opts.visualContract);
    if (isSameOrInside(path.resolve(opts.docsDir), live)) {
      const relPath = path.relative(opts.docsDir, live);
      return { scratchContract: path.join(scratch.docsScratch, relPath), liveContract: live, overridden: true };
    }
    return { scratchContract: live, liveContract: live, overridden: true };
  }
  const suffix = ['design', 'visual-consistency-contract.md'];
  return {
    scratchContract: path.join(scratch.docsScratch, ...suffix),
    liveContract: path.join(opts.docsDir, ...suffix),
    overridden: false,
  };
}

function visualCommandSummary(json, fallbackLabel) {
  const s = json && json.summary ? json.summary : null;
  return {
    errors: s ? s.errors ?? 0 : null,
    warnings: s ? s.warnings ?? 0 : null,
    infos: s ? s.infos ?? 0 : null,
    parsed: Boolean(s),
    label: fallbackLabel,
  };
}

// consistency findings의 rule별 상위 빈도 (warning/error만 — advisory info는 잡음 방지 위해 제외).
function topRules(consistencyJson, limit = 3) {
  const counts = new Map();
  for (const f of consistencyJson?.findings || []) {
    if (f.severity !== 'warning' && f.severity !== 'error') continue;
    counts.set(f.rule, (counts.get(f.rule) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, limit)
    .map(([rule, count]) => `${rule} (${count})`);
}

function observeVisual(opts, scratch) {
  if (!opts.visual) {
    return {
      enabled: false,
      status: 'skipped',
      reason: '--visual not passed (default probe behavior unchanged)',
      findings: [],
      bootstrap: null,
      consistency: null,
      next_actions: [],
    };
  }

  const findings = [];
  const contractPaths = visualContractPaths(opts, scratch);
  const existingContractFound = exists(contractPaths.scratchContract);

  // 1) bootstrap — scratch docs/src 기준 review-only draft 후보 추출 (JSON stdout 관측).
  //    cwd를 probe run dir로 두어 bootstrap/consistency 출력 내부 경로가 scratch/... 상대
  //    경로로 나오게 한다 (머신 경로 누출 없는 deterministic observation).
  const bootstrapArgs = ['--docs', scratch.docsScratch, '--src', scratch.srcScratch];
  if (opts.visualDomain) bootstrapArgs.push('--domain', opts.visualDomain);
  if (opts.visualScreens.length) bootstrapArgs.push('--screen', opts.visualScreens.join(','));
  if (contractPaths.overridden) bootstrapArgs.push('--contract', contractPaths.scratchContract);
  bootstrapArgs.push('--json');
  const bootstrapCmd = runNodeScript('visual-contract-bootstrap.mjs', bootstrapArgs, { cwd: opts.outDir });
  writeObservation(opts, 'visual-contract-bootstrap', bootstrapCmd);
  const bootstrapJson = parseJson(bootstrapCmd.stdout);
  if (!bootstrapCmd.ok) {
    findings.push({
      severity: 'error',
      rule: 'visual-bootstrap-failed',
      message: `visual-contract-bootstrap exit ${bootstrapCmd.exitCode} — observations/visual-contract-bootstrap.* 참조 (probe는 계속 진행; 게이트 아님).`,
    });
  }

  // 2) markdown draft — bootstrap이 구조적으로 성공했을 때만 run dir 내부에 쓴다
  //    (CLI --out 가드 동형: 깨진 입력으로 만든 draft는 review 대상이 아니다).
  const draftPath = path.join(opts.outDir, 'visual', 'visual-consistency-contract.draft.md');
  let draftWritten = false;
  if (bootstrapCmd.ok && bootstrapJson && bootstrapJson.ok) {
    writeFile(draftPath, renderBootstrapMarkdown(bootstrapJson));
    draftWritten = true;
  }

  const bootstrapSummary = visualCommandSummary(bootstrapJson);
  const bootstrap = {
    ran: true,
    ok: bootstrapCmd.ok,
    exit: bootstrapCmd.exitCode,
    screens: bootstrapJson?.summary?.screens ?? null,
    candidate_families: bootstrapJson?.summary?.candidate_families ?? null,
    suggested_contract_rows: bootstrapJson?.summary?.suggested_contract_rows ?? null,
    component_gap_candidates: bootstrapJson?.summary?.component_gap_candidates ?? null,
    errors: bootstrapSummary.errors,
    warnings: bootstrapSummary.warnings,
    infos: bootstrapSummary.infos,
    draft_path: draftWritten ? draftPath : null,
    existing_contract: {
      found: existingContractFound,
      path: contractPaths.liveContract,
      overridden: contractPaths.overridden,
    },
  };

  // 3) consistency — 기존 contract가 있으면 그 기준, 없고 draft만 있으면 draft 기준 advisory.
  let consistency;
  if (opts.skipVisualConsistency) {
    consistency = {
      ran: false,
      contract_source: 'skipped',
      reason: '--skip-visual-consistency passed — bootstrap observation only',
    };
  } else if (!existingContractFound && !draftWritten) {
    consistency = {
      ran: false,
      contract_source: 'skipped',
      reason: bootstrapCmd.ok
        ? 'no existing contract and no bootstrap draft — nothing to check against'
        : 'bootstrap failed — no contract to check against',
    };
  } else {
    const contractSource = existingContractFound ? 'existing' : 'bootstrap-draft';
    const consistencyArgs = ['--docs', scratch.docsScratch, '--src', scratch.srcScratch];
    if (contractSource === 'bootstrap-draft') consistencyArgs.push('--contract', draftPath);
    else if (contractPaths.overridden) consistencyArgs.push('--contract', contractPaths.scratchContract);
    if (opts.visualDomain) consistencyArgs.push('--domain', opts.visualDomain);
    // bootstrap 과 동일한 screen scope 를 유지한다 — visual-consistency --screen 도
    // 콤마 목록을 받으므로 목록 전체를 그대로 넘긴다 (scope 불일치로 unrelated
    // family warning 이 adoption report 에 섞이는 것 방지).
    if (opts.visualScreens.length) consistencyArgs.push('--screen', opts.visualScreens.join(','));
    consistencyArgs.push('--json');
    const consistencyCmd = runNodeScript('visual-consistency.mjs', consistencyArgs, { cwd: opts.outDir });
    writeObservation(opts, 'visual-consistency', consistencyCmd);
    const consistencyJson = parseJson(consistencyCmd.stdout);
    if (!consistencyCmd.ok) {
      findings.push({
        severity: 'error',
        rule: 'visual-consistency-failed',
        message: `visual-consistency exit ${consistencyCmd.exitCode} (contract source: ${contractSource}) — observations/visual-consistency.* 참조 (probe는 계속 진행; 게이트 아님).`,
      });
    }
    const summary = visualCommandSummary(consistencyJson);
    consistency = {
      ran: true,
      contract_source: contractSource,
      advisory_draft_contract: contractSource === 'bootstrap-draft',
      ok: consistencyCmd.ok,
      exit: consistencyCmd.exitCode,
      families: consistencyJson?.summary?.families ?? null,
      screens: consistencyJson?.summary?.screens ?? null,
      errors: summary.errors,
      warnings: summary.warnings,
      infos: summary.infos,
      top_rules: consistencyJson ? topRules(consistencyJson) : [],
    };
  }

  const nextActions = [];
  if (draftWritten) {
    nextActions.push('Review the bootstrap draft before editing the canonical visual-consistency-contract (accepted rows only; needs-review values are decided by humans).');
  }
  if ((bootstrap.component_gap_candidates ?? 0) > 0) {
    nextActions.push('Propose Component Gaps (G-xxx) in component-gap-register for uncataloged shared components — accept stays human-only.');
  }
  nextActions.push(
    existingContractFound
      ? 'Apply accepted suggested additions to the existing canonical contract manually; never overwrite it wholesale.'
      : 'Create the canonical visual-consistency-contract manually from accepted rows only (start from templates/design/visual-consistency-contract.template.md).',
  );
  nextActions.push('Re-run workflow:visual-consistency against the canonical contract (warning-first, not a gate).');
  nextActions.push('Continue with the visual-reconcile / implement-screen skills for actual updates.');

  return {
    enabled: true,
    status: findings.some((f) => f.severity === 'error') ? 'failed' : 'observed',
    reason: null,
    findings,
    bootstrap,
    consistency,
    next_actions: nextActions,
  };
}

// probe-summary.json / CLI --json 용 visual 요약 — 경로는 pathRef로만 노출한다
// (raw stdout은 observations/* 파일이 정본; JSON에 중복 embed하지 않는다).
function visualSummaryJson(opts, visual) {
  if (!visual.enabled) {
    return { enabled: false, status: visual.status, reason: visual.reason };
  }
  const observations = { bootstrap: pathRef(opts, path.join(opts.outDir, 'observations', 'visual-contract-bootstrap.json')) };
  if (visual.consistency && visual.consistency.ran) {
    observations.consistency = pathRef(opts, path.join(opts.outDir, 'observations', 'visual-consistency.json'));
  }
  return {
    enabled: true,
    status: visual.status,
    draft_only: true,
    gate: false,
    findings: visual.findings,
    bootstrap: {
      ...visual.bootstrap,
      draft_path: visual.bootstrap.draft_path ? pathRef(opts, visual.bootstrap.draft_path) : null,
      existing_contract: {
        ...visual.bootstrap.existing_contract,
        path: pathRef(opts, visual.bootstrap.existing_contract.path),
      },
    },
    consistency: visual.consistency,
    observations,
    next_actions: visual.next_actions,
  };
}

function visualCounts(bootstrap) {
  return (
    `${bootstrap.screens ?? '?'} screen(s), ${bootstrap.candidate_families ?? '?'} candidate family(ies), ` +
    `${bootstrap.suggested_contract_rows ?? '?'} suggested contract row(s), ` +
    `${bootstrap.component_gap_candidates ?? '?'} component gap candidate(s), ` +
    `findings ${bootstrap.errors ?? '?'} error(s) · ${bootstrap.warnings ?? '?'} warning(s) · ${bootstrap.infos ?? '?'} info(s)`
  );
}

function visualConsistencyCell(consistency) {
  if (!consistency || !consistency.ran) {
    return `skipped — ${consistency ? consistency.reason : 'not run'}`;
  }
  const source =
    consistency.contract_source === 'bootstrap-draft'
      ? 'bootstrap-draft contract (advisory — draft contract, not the canonical one)'
      : 'existing contract';
  return (
    `ran against ${source}: exit ${consistency.exit}, ` +
    `${consistency.errors ?? '?'} error(s), ${consistency.warnings ?? '?'} warning(s), ${consistency.infos ?? '?'} info(s)` +
    (consistency.top_rules && consistency.top_rules.length ? `; top rules: ${consistency.top_rules.join(', ')}` : '')
  );
}

function visualRows(opts, visual) {
  if (!visual.enabled) {
    return [
      '- Status: **skipped** — `--visual` not passed (default probe output/behavior unchanged).',
      '- Enable with `npm run workflow:adoption-probe -- --repo <target-repo> --visual` to observe `workflow:visual-contract-bootstrap` (and, when a contract or bootstrap draft exists, `workflow:visual-consistency`) against the probe scratch copy.',
      '- Boundaries: observation-only when enabled — draft/review output under the probe run dir, warning-first, not a gate, never auto-applied to the canonical contract.',
    ].join('\n');
  }
  const b = visual.bootstrap;
  const lines = [];
  lines.push(`- Status: **${visual.status}** — draft-only visual observation (warning-first; not a gate, not approval, not confirmed promotion).`);
  lines.push('');
  lines.push('| Item | Observation |');
  lines.push('|---|---|');
  lines.push(`| Bootstrap run | exit ${b.exit} — ${visualCounts(b)} |`);
  lines.push(
    `| Bootstrap draft | ${b.draft_path ? `\`${pathRef(opts, b.draft_path)}\` (review-only draft — apply accepted rows manually)` : 'not written (bootstrap failed or structural error)'} |`,
  );
  lines.push(
    `| Existing contract | ${
      b.existing_contract.found
        ? `found: \`${pathRef(opts, b.existing_contract.path)}\` — used as consistency baseline; bootstrap emits suggested additions only (no overwrite)`
        : `not found (\`${pathRef(opts, b.existing_contract.path)}\`) — cold start`
    } |`,
  );
  lines.push(`| Visual consistency | ${visualConsistencyCell(visual.consistency)} |`);
  const observationFiles = [`\`${pathRef(opts, path.join(opts.outDir, 'observations', 'visual-contract-bootstrap.json'))}\``];
  if (visual.consistency && visual.consistency.ran) {
    observationFiles.push(`\`${pathRef(opts, path.join(opts.outDir, 'observations', 'visual-consistency.json'))}\``);
  }
  lines.push(`| Observations | ${observationFiles.join(' · ')} |`);
  for (const f of visual.findings) {
    lines.push(`| Finding | [${f.severity}] ${f.rule}: ${sanitizePathishEvidenceText(f.message, opts)} |`);
  }
  lines.push('');
  lines.push('Recommended next actions (human review only):');
  lines.push('');
  visual.next_actions.forEach((action, i) => lines.push(`${i + 1}. ${action}`));
  lines.push('');
  lines.push(
    '- Boundaries: visual-consistency warnings are diagnostics, never approval/readiness/`confirmed` promotion; the bootstrap draft is never auto-applied to the canonical contract; no live docs/src were modified; Component Gap accept and Open Decision resolve stay human-only.',
  );
  return lines.join('\n');
}

function readinessSummary(readinessJson) {
  if (!readinessJson || typeof readinessJson !== 'object') return 'not parsed';
  const entries = Object.entries(readinessJson);
  if (entries.length === 0) return 'no screens';
  return entries
    .map(([id, r]) => `${id}: ${r.readiness_mode || 'unknown'}`)
    .join(', ');
}

function validateSummary(validateJson, command) {
  if (validateJson && typeof validateJson === 'object') {
    const errors = validateJson.count ?? (validateJson.errors || []).length ?? '?';
    const warnings = (validateJson.warnings || []).length;
    return `ok=${validateJson.ok === true}, errors=${errors}, warnings=${warnings}, exit=${command.exitCode}`;
  }
  return `not parsed, exit=${command.exitCode}`;
}

function catalogSummary(observation, roleMap) {
  const count = observation.catalogCount == null ? 'unknown' : String(observation.catalogCount);
  const ui = roleMap.ui_primitive.glob;
  if (observation.commands.catalog.ok && observation.catalogCount === 0) {
    return `0 components observed from ${ui}; inspect ui_primitive glob/source with draft layout`;
  }
  if (observation.commands.catalog.ok) return `${count} components observed from ${ui} via draft layout`;
  return `catalog failed exit=${observation.commands.catalog.exitCode}`;
}

function f3Summary(f3) {
  if (f3.same == null) return f3.status;
  const comparison = f3.same
    ? 'readiness byte-identical after scratch Tier3-only layer removal'
    : 'readiness changed after scratch Tier3-only layer removal';
  return f3.excluded && f3.excluded.length ? `${comparison}; ${f3.excluded.length} flattened built-in path(s) kept` : comparison;
}

function f3CoreSignal(f3) {
  if (f3.same == null) return 'not run';
  return f3.same ? 'silent' : 'observed change';
}

function blindSpotRows(extraLayers, observation, f3) {
  const catalogStatus =
    observation.commands.catalog.ok && observation.catalogCount > 0
      ? 'layout-aware catalog populated'
      : 'inspect ui_primitive/source';
  const layerCount = extraLayers.length;
  return [
    ['B1', 'catalog-gen ui_primitive observation / F4', catalogStatus, observation.commands.catalog.ok ? 'layout-aware catalog output' : 'tool error', 'verify draft role map if count is 0'],
    ['B2', 'additional layer access / F1', layerCount ? `${layerCount} readiness-wired layer path(s)` : 'not observed', 'readiness access wired', 'hard-gate promotion follow-up'],
    ['B3', 'domain+data edit boundary / F2', layerCount ? 'declared access reflected in readiness paths' : 'not observed', 'hard gates not promoted', 'CI/pre-edit enforcement follow-up'],
    ['B4', 'complete vs missing layers / F3', f3Summary(f3), f3CoreSignal(f3), 'Tier3 PR-C'],
    ['B5', 'validate layer-blind / F5', 'applies: validate is document-structure only', 'green can be misleading', 'Tier3 PR-E + PR-C'],
  ]
    .map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} |`)
    .join('\n');
}

function commandRows(opts, observation, roleMap) {
  return [
    [sanitizePathishEvidenceText(observation.commands.state.invocation, opts), observation.commands.state.exitCode, observation.layerInventory ? 'workflow-state generated layer inventory under probe scratch' : 'workflow-state generated under probe scratch', 'readiness access metadata split from hard gates'],
    [sanitizePathishEvidenceText(observation.commands.readiness.invocation, opts), observation.commands.readiness.exitCode, readinessSummary(observation.readinessJson), 'readiness paths include declared layer access when layout declares layers'],
    [sanitizePathishEvidenceText(observation.commands.validate.invocation, opts), observation.commands.validate.exitCode, validateSummary(observation.validateJson, observation.commands.validate), 'document consistency only'],
    [sanitizePathishEvidenceText(observation.commands.catalog.invocation, opts), observation.commands.catalog.exitCode, catalogSummary(observation, roleMap), 'layout-aware catalog observation'],
  ]
    .map((r) => `| \`${r[0]}\` | ${r[1]} | ${r[2]} | ${r[3]} |`)
    .join('\n');
}

function outputRows(opts, outputs) {
  const rows = [
    ['Adoption report', outputs.adoption_report, 'draft'],
    ['Layout draft', outputs.project_layout, 'draft; scratch-readiness input'],
    ['Implementation policy draft', outputs.implementation_policy_draft, 'draft; not live wired'],
    ['Implementation policy migration guide', outputs.implementation_policy_migration, 'draft; human review before live replacement'],
    ['Tier3 gap report', outputs.tier3_gap_report, 'draft'],
    ['Visual intake note', outputs.visual_spec_intake_note, 'draft'],
    ['testID intake note', outputs.testid_intake_note, 'draft'],
    ['Tier3 live wiring implementation note', outputs.tier3_live_wiring_note, 'draft'],
  ];
  if (outputs.visual_contract_bootstrap_draft) {
    rows.push(['Visual contract bootstrap draft', outputs.visual_contract_bootstrap_draft, 'draft; review-only — never auto-applied to the canonical contract']);
  }
  return rows.map(([name, file, status]) => `| ${name} | \`${pathRef(opts, file)}\` | ${status} |`).join('\n');
}

function renderAdoptionReport(opts, env, roleMap, extraLayers, observation, f3, visual, outputs) {
  const axis1 = Object.values(roleMap).some((r) => r.confidence === 'confirmed')
    ? 'possible/partial: role map drafted from observed paths'
    : 'candidate only: no matching src layout observed';
  const axis2 = extraLayers.length
    ? 'readiness access wired; implementation-mode-policy draft generated; live policy not replaced; hard gates/CI/pre-edit hooks not promoted'
    : 'policy draft generated from default layout; live policy not replaced; hard gates/CI/pre-edit hooks not promoted';
  return renderTemplate('adoption-report.template.md', {
    PROJECT_NAME: opts.projectName,
    'YYYY-MM-DD': opts.date,
    KIT_SNAPSHOT: opts.kitSnapshot,
    PROBE_OUTPUT: pathRef(opts, opts.outDir),
    REPO_REF: opts.repoRef,
    AXIS1_SUMMARY: axis1,
    AXIS2_SUMMARY: axis2,
    ENV_ROWS: envRows(env),
    ROLE_ROWS: roleRows(roleMap),
    ROUTE_SCREEN_ROWS: routeScreenRows(env),
    LAYER_ROWS: layerRows(extraLayers, f3, observation.layerInventory),
    EXTRA_LAYER_COUNT: String(extraLayers.length),
    F3_SUMMARY: f3Summary(f3),
    CATALOG_SUMMARY: catalogSummary(observation, roleMap),
    VALIDATE_SUMMARY: validateSummary(observation.validateJson, observation.commands.validate),
    COMMAND_ROWS: commandRows(opts, observation, roleMap),
    VISUAL_ROWS: visualRows(opts, visual),
    OBSERVATIONS_PATH: pathRef(opts, path.join(opts.outDir, 'observations')),
    BLIND_SPOT_ROWS: blindSpotRows(extraLayers, observation, f3),
    OUTPUT_ROWS: outputRows(opts, outputs),
  });
}

function renderTier3GapReport(opts, extraLayers, observation, f3) {
  const inventoryRows = extraInventoryRows(observation.layerInventory, extraLayers);
  const rows = inventoryRows.length
    ? inventoryRows
        .map((row) => {
          const currentRole = row.overlap_role ? `flattened into ${row.overlap_role}` : 'telemetry role only';
          const fact = `${row.role}_present=${observation.layerInventory?.facts?.[`${row.role}_present`] === true}`;
          return `| \`${row.resolved_glob || row.glob}\` | ${row.role} | ${accessSummary(row)} | ${currentRole} | ${fact} | readiness yes / hard gate no |`;
        })
        .join('\n')
    : extraLayers.length
      ? extraLayers.map((l) => `| \`${l.path}\` | ${l.layer} | parsed access row only | telemetry draft | pending inventory | no |`).join('\n')
      : '| not observed | not observed | none | no | no | no |';
  return renderTemplate('tier3-gap-report.template.md', {
    PROJECT_NAME: opts.projectName,
    'YYYY-MM-DD': opts.date,
    TIER3_ROWS: rows,
    EXTRA_LAYER_COUNT: String(extraLayers.length),
    F3_SUMMARY: f3Summary(f3),
    F3_SIGNAL: f3CoreSignal(f3),
    CATALOG_SUMMARY: catalogSummary(observation, opts.roleMap),
    VALIDATE_SUMMARY: validateSummary(observation.validateJson, observation.commands.validate),
    OBSERVED_EXTRA_LAYERS: extraLayers.length ? extraLayers.map((l) => `\`${l.path}\``).join(', ') : 'none',
  });
}

function renderVisualNote(opts, env) {
  let text = renderTemplate('visual-spec-intake-note.template.md', {
    PROJECT_NAME: opts.projectName,
    'YYYY-MM-DD': opts.date,
  });
  text = text.replace(
    '- Figma source: {제공/없음} · facts: {제공/없음} · baseline: {제공/없음} · token manifest: {제공/없음}.',
    `- Figma/token source observation: ${env.visual}.`,
  );
  text = text.replace(
    '- 결론: {시각 intake 계약 적용 가능 / 소비 레포 수집물 미제공이라 skip}.',
    `- Conclusion: ${env.visual === 'not observed' ? 'skip(no-op); consumer visual inputs not observed' : 'intake contract can reference observed consumer-owned files'}.`,
  );
  return text;
}

function renderTestIdNote(opts, env) {
  let text = renderTemplate('testid-intake-note.template.md', {
    PROJECT_NAME: opts.projectName,
    'YYYY-MM-DD': opts.date,
  });
  text = text.replace(
    '- 기존 testID 관행: {일부 존재(grep 근거)/없음}.',
    `- Existing testID practice: ${env.testid}.`,
  );
  text = text.replace(
    '- E2E 러너: {Playwright/Maestro/Detox/없음}.',
    '- E2E runner: not inferred by adoption-probe.',
  );
  text = text.replace(
    '- 결론: {권장 규약 안내만 / 소비 레포가 이미 다른 규약이면 dialect 로 기록 — 강제 rename 금지}.',
    '- Conclusion: guidance only; no rename, harness, CI, or gate created.',
  );
  return text;
}

function renderTier3ImplementationNote(opts, extraLayers) {
  return `# Tier3 Live Wiring Implementation Note — ${opts.projectName}

> **Status: READINESS ACCESS WIRED / HARD GATES NOT PROMOTED — ${opts.date}.** This note describes the remaining non-readiness wiring.
> It does not promote CI, pre-edit hooks, Open Decisions, confirmed state, or hard gates.

## Wiring Points

| Slice | Wiring point | Required before touching |
|---|---|---|
| PR-D | \`layout-profile.synthesizeModePolicy()\` feeds layer allow/forbid cells into readiness paths | implemented for readiness access; hard gates remain off |
| PR-D | \`implementation-mode-policy.draft.yaml\` is generated from resolved layer access | review artifact only; live policy is not replaced |
| PR-D | \`implementation-mode-policy.migration.md\` compares live vs draft | human review before any live policy update |
| PR-D | CI/pre-edit hardening | not promoted in this probe |
| PR-E | \`lint-gen-core\` consumes import-boundary layer subset | warning-first rollout and import-DAG subset agreed |

## Parity Tests

- Forward-gate parity: synthesized role-token allow/forbid cells equal current policy role-token cells.
- Backstop parity: guarded surface remains \`openapi.yaml\`, \`openapi.yml\`, \`src/api/**\`; screen re-lock does not leak into clearance.
- Golden parity: coupon/readiness fixtures remain byte-equivalent.
- Alias parity: \`fake_hook_exists\` remains the legacy TS-only hook readiness input; \`hook_present\` may observe broader source files.

## Failure Modes

- Generated policy drops a forbidden role-token cell, widening edit surface.
- Backstop starts clearing screen paths that readiness intentionally re-locks.
- Layer lint treats non-import layers such as route entries as DAG nodes.
- A green validate run is mistaken for layer health.
- Catalog count 0 is misread as "no UI" instead of source mismatch or empty role glob.

## Rollout Order

1. Keep this probe draft-only and collect one real brownfield run.
2. If catalog count is 0, verify the ui_primitive glob/source before Tier3 work.
3. PR-B parity tests first, then PR-C fact generalization if needed.
4. PR-D readiness access wiring is active for declared layers; keep CI/pre-edit hardening separate.
5. PR-E lint DAG warning-first, then telemetry before any hardening OD.

Observed extra layers in this run: ${extraLayers.length ? extraLayers.map((l) => `\`${l.path}\``).join(', ') : 'none'}.
`;
}

function renderSummary(opts, env, roleMap, extraLayers, observation, f3, visual, outputs) {
  const data = {
    probe_id: opts.id,
    project_name: opts.projectName,
    date: opts.date,
    draft_only: true,
    repo_ref: opts.repoRef,
    docs_source: pathRef(opts, opts.docsDir),
    src_source: pathRef(opts, opts.srcDir),
    out_dir: pathRef(opts, opts.outDir),
    scratch_dir: pathRef(opts, path.join(opts.outDir, 'scratch')),
    invariants: {
      live_docs_untouched_by_workflow_state: true,
      source_scaffold_created: false,
      ci_changed: false,
      open_decision_resolved: false,
      hard_gate_promoted: false,
      live_policy_replaced: false,
      pre_edit_hooks_promoted: false,
    },
    role_map: roleMap,
    route_screen_separation: env.routeScreenSeparation,
    extra_layers: extraLayers,
    layer_inventory: observation.layerInventory,
    environment: env,
    observations: {
      readiness: readinessSummary(observation.readinessJson),
      validate: validateSummary(observation.validateJson, observation.commands.validate),
      catalog: catalogSummary(observation, roleMap),
      f3,
    },
    visual: visualSummaryJson(opts, visual),
    outputs: Object.fromEntries(Object.entries(outputs).map(([key, value]) => [key, pathRef(opts, value)])),
  };
  return JSON.stringify(data, null, 2) + '\n';
}

function displayOutputs(opts, outputs) {
  return Object.fromEntries(Object.entries(outputs).map(([key, value]) => [key, pathRef(opts, value)]));
}

function kitSnapshot() {
  return 'working-tree draft';
}

function assertDraftOutDir(repoRoot, docsDir, srcDir, outDir, id) {
  const expectedLeaf = `adoption-probe-${id}`;
  const out = path.resolve(outDir);
  const runsDir = path.dirname(out);
  const tempDir = path.dirname(runsDir);
  if (
    path.basename(out) !== expectedLeaf ||
    path.basename(runsDir) !== 'runs' ||
    path.basename(tempDir) !== 'temp'
  ) {
    throw new Error(`--out must resolve to temp/runs/${expectedLeaf}`);
  }

  const blocked = [
    ['live docs/frontend-workflow', docsDir],
    ['source tree', srcDir],
  ];
  for (const [label, dir] of blocked) {
    if (dir && isSameOrInside(path.resolve(dir), out)) {
      throw new Error(`--out must not be inside ${label}: ${toPosix(path.relative(repoRoot, dir) || dir)}`);
    }
  }
}

export function normalizeOptions(flags = {}) {
  validateSemanticOptions(flags);
  return normalizeValidatedOptions(flags);
}

function normalizeValidatedOptions(flags) {
  const cwd = path.resolve(flags.cwd || process.cwd());
  const repoRoot = path.resolve(flags.repo || flags['repo-root'] || process.cwd());
  const srcDir = resolveUnder(repoRoot, flags.src || 'src');
  const docsDir = resolveUnder(repoRoot, flags.docs || path.join('docs', 'frontend-workflow'));
  const id = sanitizeId(flags.id);
  const outDir = path.resolve(flags.out || path.join(repoRoot, 'temp', 'runs', `adoption-probe-${id}`));
  assertDraftOutDir(repoRoot, docsDir, srcDir, outDir, id);
  const projectName = flags['project-name'] || packageName(repoRoot);
  const srcRel = safeRepoRel(repoRoot, srcDir, 'src');
  const visual = Boolean(flags.visual);
  return {
    cwd,
    id,
    repoRoot,
    srcDir,
    srcRel,
    docsDir,
    outDir,
    projectName,
    repoRef: pathRef({ cwd, repoRoot, outDir, srcDir, docsDir }, repoRoot),
    date: flags.date || todayISO(),
    skipF3: Boolean(flags['skip-f3']),
    visual,
    visualDomain: typeof flags['visual-domain'] === 'string' ? flags['visual-domain'] : null,
    visualScreens:
      typeof flags['visual-screen'] === 'string'
        ? flags['visual-screen'].split(',').map((s) => s.trim()).filter(Boolean)
        : [],
    visualContract:
      typeof flags['visual-contract'] === 'string' ? resolveUnder(repoRoot, flags['visual-contract']) : null,
    skipVisualConsistency: Boolean(flags['skip-visual-consistency']),
    kitSnapshot: kitSnapshot(),
    layoutPath: path.join(outDir, 'project-layout.draft.yaml'),
  };
}

export function runAdoptionProbe(flags = {}) {
  return runAdoptionProbeWithOptions(normalizeOptions(flags));
}

function runAdoptionProbeWithOptions(opts) {
  fs.mkdirSync(opts.outDir, { recursive: true });
  writeFile(path.join(opts.outDir, '.gitignore'), 'scratch/\nscratch-f3/\n');

  const roleMap = detectRoleMap(opts.repoRoot, opts.srcDir);
  const extraLayers = detectExtraLayers(opts.repoRoot, opts.srcDir);
  const env = scanEnvironment(opts, roleMap, extraLayers);
  opts.roleMap = roleMap;

  writeFile(opts.layoutPath, renderProjectLayout(opts, roleMap, extraLayers));
  const policyDraft = writePolicyDraftArtifacts({
    kitRoot: KIT_ROOT,
    layoutPath: opts.layoutPath,
    policyPath: path.join(KIT_ROOT, 'policies', 'implementation-mode-policy.yaml'),
    outDir: opts.outDir,
    date: opts.date,
    cwd: opts.cwd,
  });
  const scratch = prepareScratch(opts);
  const observation = observeWorkflow(opts, scratch);
  const f3 = observeF3(opts, roleMap, extraLayers, observation);
  const visual = observeVisual(opts, scratch);

  const outputs = {
    adoption_report: path.join(opts.outDir, 'adoption-report.md'),
    project_layout: opts.layoutPath,
    implementation_policy_draft: policyDraft.paths.draft,
    implementation_policy_migration: policyDraft.paths.migration,
    tier3_gap_report: path.join(opts.outDir, 'tier3-gap-report.md'),
    visual_spec_intake_note: path.join(opts.outDir, 'visual-spec-intake-note.md'),
    testid_intake_note: path.join(opts.outDir, 'testid-intake-note.md'),
    tier3_live_wiring_note: path.join(opts.outDir, 'tier3-live-wiring-implementation-note.md'),
    summary: path.join(opts.outDir, 'probe-summary.json'),
  };
  if (visual.enabled && visual.bootstrap && visual.bootstrap.draft_path) {
    outputs.visual_contract_bootstrap_draft = visual.bootstrap.draft_path;
  }

  writeFile(outputs.adoption_report, renderAdoptionReport(opts, env, roleMap, extraLayers, observation, f3, visual, outputs));
  writeFile(outputs.tier3_gap_report, renderTier3GapReport(opts, extraLayers, observation, f3));
  writeFile(outputs.visual_spec_intake_note, renderVisualNote(opts, env));
  writeFile(outputs.testid_intake_note, renderTestIdNote(opts, env));
  writeFile(outputs.tier3_live_wiring_note, renderTier3ImplementationNote(opts, extraLayers));
  writeFile(outputs.summary, renderSummary(opts, env, roleMap, extraLayers, observation, f3, visual, outputs));

  return { opts, env, roleMap, extraLayers, observation, f3, visual, policyDraft, outputs };
}

export function formatProbeResult(result) {
  const { opts, observation, f3, visual, outputs } = result;
  const lines = [];
  lines.push('workflow:adoption-probe — draft-only run complete');
  lines.push(`  probe_id: ${opts.id}`);
  lines.push(`  out_dir : ${pathRef(opts, outputs.adoption_report ? path.dirname(outputs.adoption_report) : opts.outDir)}`);
  lines.push(`  report  : ${pathRef(opts, outputs.adoption_report)}`);
  lines.push(`  layout  : ${pathRef(opts, outputs.project_layout)}`);
  lines.push(`  policy  : ${pathRef(opts, outputs.implementation_policy_draft)}`);
  lines.push(`  guide   : ${pathRef(opts, outputs.implementation_policy_migration)}`);
  lines.push(`  readiness: ${readinessSummary(observation.readinessJson)}`);
  lines.push(`  validate : ${validateSummary(observation.validateJson, observation.commands.validate)}`);
  lines.push(`  catalog  : ${catalogSummary(observation, result.roleMap)}`);
  lines.push(`  layers   : ${observation.layerInventory ? `${observation.layerInventory.layers.length} inventory row(s), readiness access wired; hard gates off` : 'not observed'}`);
  lines.push(`  f3       : ${f3Summary(f3)}`);
  if (visual && visual.enabled) {
    const consistencyPart =
      visual.consistency && visual.consistency.ran
        ? `consistency ${visual.consistency.warnings ?? '?'} warning(s) [${visual.consistency.contract_source}]`
        : `consistency skipped (${visual.consistency ? visual.consistency.reason : 'not run'})`;
    lines.push(
      `  visual   : ${visual.status} — bootstrap ${visual.bootstrap.candidate_families ?? '?'} candidate family(ies), ` +
        `${visual.bootstrap.component_gap_candidates ?? '?'} gap candidate(s); ${consistencyPart} (draft-only, not a gate)`,
    );
  }
  lines.push('  invariant: draft-only; live docs/source/policy/CI/pre-edit/OD/confirmed untouched');
  return lines.join('\n') + '\n';
}

const VALUE_FLAGS = new Set([
  'repo',
  'repo-root',
  'out',
  'src',
  'docs',
  'id',
  'date',
  'project-name',
  'visual-domain',
  'visual-screen',
  'visual-contract',
]);
const BOOLEAN_FLAGS = new Set([
  'skip-f3',
  'visual',
  'skip-visual-consistency',
  'json',
  'help',
]);

function helpText() {
  return `workflow:adoption-probe - brownfield consumer adoption observation (draft/review-only)

Purpose and boundary:
  Observe kit adoption against a scratch copy of a brownfield consumer repository.
  Outputs are draft/review-only. The probe never edits live docs/src/policy/CI,
  resolves Open Decisions, promotes status to confirmed, or promotes a hard gate.

Usage:
  node scripts/adoption-probe.mjs --repo <path> [options]

Target and output:
  --repo <dir>                 Existing target repository directory
  --repo-root <dir>            Alias for --repo (--repo keeps existing precedence)
  --src <path>                 Source path relative to the target repo (default: src)
  --docs <path>                Workflow docs path (default: docs/frontend-workflow)
  --id <id>                    Probe id
  --date <YYYY-MM-DD>          Deterministic observation date
  --project-name <name>        Project name override
  --out <dir>                  Output directory
                               default: temp/runs/adoption-probe-<id>/
                               leaf must be adoption-probe-<id>

Execution options:
  --skip-f3                    Skip the F3 scratch comparison
  --json                       Print the existing outputs-only JSON shape

Visual options (require --visual):
  --visual                     Observe visual bootstrap/consistency in scratch
  --visual-domain <domain>     Limit visual observation to one domain
  --visual-screen <ID[,ID...]> Limit visual observation to screen ids
  --visual-contract <path>     Existing visual contract location override
  --skip-visual-consistency    Run visual bootstrap only

Other:
  --help                       Print this help without scanning, writing, or spawning

Exit codes:
  0  help or probe generation completed
  2  usage, input, or configuration error

Visual child-command failures remain probe findings and do not automatically become
hard failures. All boolean options are bare flags and do not accept values.
`;
}

function adoptionProbeCliError(message) {
  const err = new Error(message);
  err.name = 'AdoptionProbeCliError';
  return err;
}

function validateSemanticOptions(
  flags,
  fail = (message) => {
    throw adoptionProbeCliError(message);
  },
) {
  const visual = Boolean(flags.visual);
  for (const key of ['visual-domain', 'visual-screen', 'visual-contract', 'skip-visual-consistency']) {
    if (flags[key] != null && !visual) fail(`--${key} requires --visual`);
  }
}

function validateExplicitRepoPaths(flags, fail) {
  for (const name of ['repo', 'repo-root']) {
    if (flags[name] === undefined) continue;
    const target = path.resolve(flags[name]);
    if (!exists(target)) fail(`--${name} must point to an existing directory: ${flags[name]}`);
    if (!isDir(target)) fail(`--${name} must point to a directory: ${flags[name]}`);
  }
}

function normalizeCliOptions(flags, fail) {
  try {
    return normalizeValidatedOptions(flags);
  } catch (err) {
    if (err && /^--out\b/.test(String(err.message || ''))) fail(err.message);
    throw err;
  }
}

export function cliMain(argv) {
  try {
    // Parse -> syntactic contract -> help -> explicit repo -> semantic options -> normalize -> run.
    // Every usage/help path completes before date/id defaults, scans, writes, or child processes.
    const { flags, positionals } = parseArgs(argv);
    const usageError = enforceCliFlagContract({
      flags,
      positionals,
      valueFlags: VALUE_FLAGS,
      booleanFlags: BOOLEAN_FLAGS,
      tool: 'workflow:adoption-probe',
      helpCommand: 'node scripts/adoption-probe.mjs',
    });
    if (flags.help) {
      process.stdout.write(helpText());
      return;
    }
    validateExplicitRepoPaths(flags, usageError);
    validateSemanticOptions(flags, usageError);
    const opts = normalizeCliOptions(flags, usageError);
    const result = runAdoptionProbeWithOptions(opts);
    if (flags.json) {
      const payload = displayOutputs(result.opts, result.outputs);
      // --visual일 때만 visual 요약을 추가한다 — 기본(--visual 없음) JSON 계약은 그대로 유지.
      if (result.visual && result.visual.enabled) payload.visual = visualSummaryJson(result.opts, result.visual);
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    } else {
      process.stdout.write(formatProbeResult(result));
    }
  } catch (err) {
    if (err && err.name === 'AdoptionProbeCliError') {
      process.stderr.write(`workflow:adoption-probe: ${err.message}\n`);
      process.stderr.write('Try `node scripts/adoption-probe.mjs --help`.\n');
      process.exitCode = 2;
      return;
    }
    throw err;
  }
}
