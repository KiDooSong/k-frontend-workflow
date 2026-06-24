// adoption-probe.mjs — draft-only brownfield adoption probe.
// It renders adoption templates into temp/runs/adoption-probe-<id>/ and runs
// existing workflow commands only against scratch copies, never live docs.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  KIT_ROOT,
  exists,
  isDir,
  readFileSafe,
  walkFiles,
  writeFile,
  loadYaml,
  yamlStringify,
} from './util.mjs';
import { writePolicyDraftArtifacts } from './policy-draft.mjs';

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

function detectRoleMap(projectRoot, srcDir) {
  const srcRel = safeRepoRel(projectRoot, srcDir, 'src');
  const roles = Object.fromEntries(
    BUILT_IN_ROLES.map((role) => [role, pickRole(projectRoot, srcRel, role)]),
  );
  if (roles.hook.evidence.includes('/viewmodels')) {
    roles.hook.note = 'temporary flattening: viewmodel path mapped to hook role';
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

function roleGlobRootsForLayer(roleMap, layerPath) {
  const roots = [];
  const pathParts = toPosix(layerPath).split('/');
  const srcIndex = pathParts.indexOf('src');
  const domains = new Set();
  if (srcIndex >= 0) {
    for (const segment of pathParts.slice(srcIndex + 1)) {
      const isLayerSegment = EXTRA_LAYER_PATTERNS.some((p) => p.segments.includes(segment.toLowerCase()));
      if (segment && !isLayerSegment) domains.add(segment);
    }
  }

  for (const role of Object.values(roleMap)) {
    const glob = toPosix(role.glob || '');
    if (!glob) continue;
    const concreteGlobs = glob.includes('{domain}')
      ? Array.from(domains).map((domain) => glob.replaceAll('{domain}', domain))
      : [glob];
    for (const concrete of concreteGlobs) {
      const root = concrete.replace(/\/\*\*$/, '').replace(/\*.*$/, '').replace(/\/+$/, '');
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
  return [
    ['Adoption report', outputs.adoption_report, 'draft'],
    ['Layout draft', outputs.project_layout, 'draft; scratch-readiness input'],
    ['Implementation policy draft', outputs.implementation_policy_draft, 'draft; not live wired'],
    ['Implementation policy migration guide', outputs.implementation_policy_migration, 'draft; human review before live replacement'],
    ['Tier3 gap report', outputs.tier3_gap_report, 'draft'],
    ['Visual intake note', outputs.visual_spec_intake_note, 'draft'],
    ['testID intake note', outputs.testid_intake_note, 'draft'],
    ['Tier3 live wiring implementation note', outputs.tier3_live_wiring_note, 'draft'],
  ]
    .map(([name, file, status]) => `| ${name} | \`${pathRef(opts, file)}\` | ${status} |`)
    .join('\n');
}

function renderAdoptionReport(opts, env, roleMap, extraLayers, observation, f3, outputs) {
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
    LAYER_ROWS: layerRows(extraLayers, f3, observation.layerInventory),
    EXTRA_LAYER_COUNT: String(extraLayers.length),
    F3_SUMMARY: f3Summary(f3),
    CATALOG_SUMMARY: catalogSummary(observation, roleMap),
    VALIDATE_SUMMARY: validateSummary(observation.validateJson, observation.commands.validate),
    COMMAND_ROWS: commandRows(opts, observation, roleMap),
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

function renderSummary(opts, env, roleMap, extraLayers, observation, f3, outputs) {
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
    extra_layers: extraLayers,
    layer_inventory: observation.layerInventory,
    environment: env,
    observations: {
      readiness: readinessSummary(observation.readinessJson),
      validate: validateSummary(observation.validateJson, observation.commands.validate),
      catalog: catalogSummary(observation, roleMap),
      f3,
    },
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
  const cwd = path.resolve(flags.cwd || process.cwd());
  const repoRoot = path.resolve(flags.repo || process.cwd());
  const srcDir = resolveUnder(repoRoot, flags.src || 'src');
  const docsDir = resolveUnder(repoRoot, flags.docs || path.join('docs', 'frontend-workflow'));
  const id = sanitizeId(flags.id);
  const outDir = path.resolve(flags.out || path.join(repoRoot, 'temp', 'runs', `adoption-probe-${id}`));
  assertDraftOutDir(repoRoot, docsDir, srcDir, outDir, id);
  const projectName = flags['project-name'] || packageName(repoRoot);
  const srcRel = safeRepoRel(repoRoot, srcDir, 'src');
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
    kitSnapshot: kitSnapshot(),
    layoutPath: path.join(outDir, 'project-layout.draft.yaml'),
  };
}

export function runAdoptionProbe(flags = {}) {
  const opts = normalizeOptions(flags);
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

  writeFile(outputs.adoption_report, renderAdoptionReport(opts, env, roleMap, extraLayers, observation, f3, outputs));
  writeFile(outputs.tier3_gap_report, renderTier3GapReport(opts, extraLayers, observation, f3));
  writeFile(outputs.visual_spec_intake_note, renderVisualNote(opts, env));
  writeFile(outputs.testid_intake_note, renderTestIdNote(opts, env));
  writeFile(outputs.tier3_live_wiring_note, renderTier3ImplementationNote(opts, extraLayers));
  writeFile(outputs.summary, renderSummary(opts, env, roleMap, extraLayers, observation, f3, outputs));

  return { opts, env, roleMap, extraLayers, observation, f3, policyDraft, outputs };
}

export function formatProbeResult(result) {
  const { opts, observation, f3, outputs } = result;
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
  lines.push('  invariant: draft-only; live docs/source/policy/CI/pre-edit/OD/confirmed untouched');
  return lines.join('\n') + '\n';
}

const STRING_FLAGS = new Set(['repo', 'out', 'src', 'docs', 'id', 'date', 'project-name']);

function adoptionProbeCliError(message) {
  const err = new Error(message);
  err.name = 'AdoptionProbeCliError';
  return err;
}

export function cliMain(argv) {
  try {
    const flags = parseCliArgs(argv);
    const result = runAdoptionProbe(flags);
    if (flags.json) process.stdout.write(JSON.stringify(displayOutputs(result.opts, result.outputs), null, 2) + '\n');
    else process.stdout.write(formatProbeResult(result));
  } catch (err) {
    if (err && err.name === 'AdoptionProbeCliError') {
      process.stderr.write(`workflow:adoption-probe: ${err.message}\n`);
      process.exitCode = 2;
      return;
    }
    throw err;
  }
}

function parseCliArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq !== -1) {
      const key = a.slice(2, eq);
      flags[key] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  for (const key of STRING_FLAGS) {
    if (flags[key] === true || flags[key] === '') throw adoptionProbeCliError(`--${key} requires a value`);
  }
  return flags;
}
