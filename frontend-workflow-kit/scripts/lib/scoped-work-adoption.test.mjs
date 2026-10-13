import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { splitFrontmatter, DEFAULTS, KIT_ROOT, yamlParse } from './util.mjs';
import { buildState } from '../workflow-state.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { readinessPathAuthorization, WORK_SELECTION_REQUIRED_REASON } from './path-backstop.mjs';
import { adoptedWorkPaths, NO_ADOPTED_WORK } from './scoped-work-adoption.mjs';
import { WORK_CONFIG_FILE } from './work-config.mjs';
import { prepareCurrentWork, cleanupCurrentWork, evaluateCurrentGit } from './current-work-execution.mjs';
import { visualImplementationAuthorization as runtimeVisualAuthorization } from './visual-refresh-runtime.mjs';
import { visualImplementationAuthorization as coreVisualAuthorization } from './visual-refresh-authority.mjs';

const SURFACE = 'surface:RESULT-PANEL', MEMBERS = ['RESULT-001', 'RESULT-002'];
const DOCS = 'docs/frontend-workflow', PREFIX = 'src/features/result', SHARED = `${PREFIX}/components/panel`;
const PANEL = `${SHARED}/Panel.tsx`, ENTRY = (id) => `${PREFIX}/screens/${id}.tsx`;
const PRIVATE = `${PREFIX}/components/result-001/**`, HOOK = `${PREFIX}/hooks/useResult.ts`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const SURFACE_BODY = ['# Shared result panel', '## Purpose\nUniform result panel.',
  `## Host Contract\n${table(['Direction', 'Name', 'Meaning', 'Required'], [['output', 'onRetry', 'Retry intent', 'yes']])}`,
  `## State Matrix\n${table(['State', 'Condition', 'UI'], ['loading', 'empty', 'error', 'success', 'disabled', 'refreshing'].map((state) => [state, state, state]))}`,
  `## Interaction Matrix\n${table(['User Action', 'Trigger', 'Result', 'Result Type', 'Target', 'Params', 'Analytics Event'], [['Retry', 'press', 'retry', 'state', 'result', '-', '-']])}`,
  '## Mutation Matrix\n없음', '## Data Requirements\n- none', '## API Candidates\n없음',
  `## Copy Keys\n${table(['Key', '문구', 'Status'], [['panel.retry', 'Retry', 'draft']])}`,
  '## Accessibility\n- labelled retry', '## Acceptance Criteria\n- [ ] same retry intent',
  `## Unknowns\n${table(['ID', 'Question', 'Status'], [])}`].join('\n\n');
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

// owners: which owners the overlay adopts; the documents always declare units unless
// declareUnits is false. adopted=false leaves frontend-workflow.config.yaml out (#257).
function repository(t, { owners = [SURFACE, 'screen:RESULT-001', 'screen:RESULT-002'], adopted = true, declareUnits = true } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-adoption-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = new Map();
  function put(name, value) {
    const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value); return file;
  }
  function write(name, relative, fm, body) { const file = put(`${DOCS}/${relative}`, md(fm, body)); docs.set(name, file); return file; }
  const work = { version: 1, owners, profiles: ['visual', 'api-contract', 'behavior'],
    role_limits: { visual: ['screen', 'domain_component', 'hook', 'test'], 'api-contract': ['api_client', 'test'],
      behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] };
  const policyFile = put('.kit/policy.yaml', fs.readFileSync(DEFAULTS.policy, 'utf8'));
  const overlayFile = put('.kit/adoption.yaml', `work_execution: ${JSON.stringify(work)}\n`);
  if (adopted) put(WORK_CONFIG_FILE, 'version: 1\npolicy_overlay: .kit/adoption.yaml\nlayout: .kit/layout.yaml\n');
  const layoutFile = put('.kit/layout.yaml', JSON.stringify({ roles: { route_entry: 'src/app/**',
    screen: 'src/features/{domain}/screens/**', domain_component: 'src/features/{domain}/components/**',
    hook: 'src/features/{domain}/hooks/**', api_client: 'src/api/**', test: 'src/features/{domain}/tests/**' } }));
  const manifestFile = put('.kit/manifest.yaml', JSON.stringify({ version: 1, artifacts: {} }));
  put(`${DOCS}/app/navigation-map.md`, '---\nstatus: draft\n---\n\n# Navigation Map\n');
  put(`${DOCS}/design/component-catalog.md`, '# Component Catalog\n');
  for (const number of [0, 1, 2]) write(`rules-${number}.md`, `domains/result/rules/rules-${number}.md`, { artifact_id: `RULES-${number}`,
    artifact_type: 'domain-rules', domain: 'result', status: 'confirmed', approved_by: 'synthetic-test-owner', approved_at: '2026-09-23',
    decision_id: `fixture-rules-${number}` }, `## Rules\nKnown local behavior ${number}.`);
  MEMBERS.forEach((id, index) => write(`screen-${index + 1}.md`, `domains/result/screens/${id.toLowerCase()}/screen-spec.md`, {
    artifact_id: `HOST-${index + 1}`, artifact_type: 'screen-spec', screen_id: id, domain: 'result', route: `/${id.toLowerCase()}`,
    status: 'draft', api_required: false, screen_entry: ENTRY(id),
    ...(declareUnits ? { work_execution: { version: 1, ...(index === 0 ? { private_paths: { domain_component: [PRIVATE] }, test_paths: [`${PREFIX}/tests/result-001/**`] } : {}),
      units: [{ id: 'known', kind: 'behavior', contracts: [`artifact:RULES-${index + 1}#rules`], sources: [] }] } } : {}),
  }, '## Notes\nExisting host.'));
  write('surface.md', 'domains/result/surfaces/result-panel/surface-spec.md', { artifact_id: 'SURFACE', artifact_type: 'shared-surface-spec',
    surface_id: 'RESULT-PANEL', domain: 'result', status: 'draft', api_required: false, member_screens: [...MEMBERS],
    implementation_paths: [`${SHARED}/**`],
    ...(declareUnits ? { work_execution: { version: 1, units: [{ id: 'panel', kind: 'behavior', contracts: ['artifact:RULES-0#rules'], sources: [],
      host_units: Object.fromEntries(MEMBERS.map((id) => [id, 'known'])) }] } } : {}),
  }, SURFACE_BODY);
  for (const file of [PANEL, HOOK, ...MEMBERS.map(ENTRY)]) put(file, 'export default null;\n');
  const layout = loadLayoutProfile({ kitRoot: root, flags: { layout: layoutFile } });
  put(`${DOCS}/_meta/workflow-state.yaml`, JSON.stringify(buildState({ docsDir: path.join(root, DOCS), srcDir: path.join(root, 'src'),
    date: '2026-09-23', layout, projectRoot: root }).state));
  git(root, 'init', '-q'); git(root, 'config', 'maintenance.auto', 'false'); git(root, 'config', 'gc.auto', '0'); git(root, 'config', 'user.email', 'test@example.com'); git(root, 'config', 'user.name', 'test');
  git(root, 'add', '-A'); git(root, 'commit', '-qm', 'baseline');
  const resources = ['--docs', path.join(root, DOCS), '--policy', policyFile, '--manifest', manifestFile, '--layout', layoutFile];
  const script = (name, args) => spawnSync(process.execPath, [path.join(KIT_ROOT, 'scripts', name), ...args], { cwd: root, encoding: 'utf8' });
  return { root, docs, put, policyFile, overlayFile, resources, script,
    policy: () => adopted ? { ...yamlParse(fs.readFileSync(policyFile, 'utf8')), ...yamlParse(fs.readFileSync(overlayFile, 'utf8')) }
      : yamlParse(fs.readFileSync(policyFile, 'utf8')),
    docsDir: path.join(root, DOCS) };
}
const sources = (marker) => marker.paths.map((entry) => [entry.owner, entry.path, entry.source]);

test('D adoption: an unadopted repository gets an empty marker and unchanged path decisions', (t) => {
  const r = repository(t, { adopted: false });
  assert.equal(adoptedWorkPaths({ docsDir: r.docsDir, policy: r.policy() }), NO_ADOPTED_WORK);
  assert.equal(adoptedWorkPaths({ docsDir: r.docsDir, policy: undefined }), NO_ADOPTED_WORK);
  const entry = { readiness_mode: 'production-ready', allowed_paths: ['src/**'], forbidden_paths: [] };
  assert.deepEqual(readinessPathAuthorization({ file: PANEL, screenId: 'X', entry, adopted: NO_ADOPTED_WORK }),
    readinessPathAuthorization({ file: PANEL, screenId: 'X', entry }));
});

test('D adoption: the marker holds every adopted owner root, not the whole owner or domain', (t) => {
  const r = repository(t);
  const marker = adoptedWorkPaths({ docsDir: r.docsDir, policy: r.policy(),
    claims: { active: [{ screen_id: 'RESULT-002', path: 'src/api/result/**' }, { screen_id: 'OTHER-001', path: 'src/api/other/**' }], denied: [] } });
  assert.deepEqual(marker.owners, ['screen:RESULT-001', 'screen:RESULT-002', SURFACE]);
  assert.deepEqual(sources(marker), [
    ['screen:RESULT-001', `${PREFIX}/components/result-001/**`, 'private_paths.domain_component'],
    [SURFACE, `${SHARED}/**`, 'implementation_paths'],
    ['screen:RESULT-001', ENTRY('RESULT-001'), 'screen_entry'],
    ['screen:RESULT-002', ENTRY('RESULT-002'), 'screen_entry'],
    ['screen:RESULT-001', `${PREFIX}/tests/result-001/**`, 'test_paths'],
    ['screen:RESULT-002', 'src/api/result/**', 'api_candidate_slice'],
  ].sort((a, b) => Buffer.compare(Buffer.from(a[1]), Buffer.from(b[1]))));
  // A broad production-ready allow cannot open an adopted path for any screen.
  const entry = { readiness_mode: 'production-ready', allowed_paths: ['src/**'], forbidden_paths: [] };
  const denied = readinessPathAuthorization({ file: PANEL, screenId: 'RESULT-009', entry, adopted: marker });
  assert.equal(denied.allowed, false); assert.equal(denied.reason, WORK_SELECTION_REQUIRED_REASON);
  assert.deepEqual(denied.work_selection_required.map((item) => item.owner), [SURFACE]);
  assert.equal(readinessPathAuthorization({ file: HOOK, screenId: 'RESULT-001', entry, adopted: marker }).allowed, true);
});

test('D adoption: missing, duplicate or undeclared adopted owners fail closed', (t) => {
  const r = repository(t, { owners: ['screen:RESULT-404'] });
  assert.throws(() => adoptedWorkPaths({ docsDir: r.docsDir, policy: r.policy() }), /no canonical document: screen:RESULT-404/);
  const d = repository(t); d.put(`${DOCS}/domains/result/screens/copy/screen-spec.md`, fs.readFileSync(d.docs.get('screen-1.md')));
  assert.throws(() => adoptedWorkPaths({ docsDir: d.docsDir, policy: d.policy() }), /ambiguous adopted owner screen:RESULT-001/);
  const u = repository(t), file = u.docs.get('screen-2.md'), doc = splitFrontmatter(fs.readFileSync(file, 'utf8'));
  delete doc.data.work_execution; fs.writeFileSync(file, md(doc.data, doc.body));
  assert.throws(() => adoptedWorkPaths({ docsDir: u.docsDir, policy: u.policy() }), /lacks work units: screen:RESULT-002/);
});

test('D adoption: readiness --path returns work-selection-required for an adopted path only', (t) => {
  const r = repository(t);
  const check = (file) => {
    const run = r.script('readiness.mjs', [...r.resources, '--screen', 'RESULT-001', '--path', file, '--json']);
    assert.equal(run.status, 0, run.stderr); return JSON.parse(run.stdout)['RESULT-001'].path_authorization;
  };
  const adopted = check(ENTRY('RESULT-001'));
  assert.equal(adopted.allowed, false); assert.equal(adopted.reason, WORK_SELECTION_REQUIRED_REASON);
  assert.equal(check(HOOK).allowed, true);
  const plain = repository(t, { adopted: false, declareUnits: false });
  const run = plain.script('readiness.mjs', [...plain.resources, '--screen', 'RESULT-001', '--path', ENTRY('RESULT-001'), '--json']);
  assert.equal(JSON.parse(run.stdout)['RESULT-001'].path_authorization.allowed, true);
});

test('D adoption: legacy forbidden-paths reports an adopted change and enforces it', (t) => {
  const r = repository(t), diff = r.put('changes.txt', `M\t${PANEL}\nM\t${HOOK}\n`);
  const advisory = r.script('forbidden-paths.mjs', [...r.resources, '--diff', diff, '--json']);
  assert.equal(advisory.status, 0, advisory.stderr);
  const report = JSON.parse(advisory.stdout);
  const violations = report.violations.filter((entry) => entry.work_selection_required);
  assert.deepEqual(violations.map((entry) => [entry.file, entry.work_selection_required[0].owner]), [[PANEL, SURFACE]]);
  assert.equal(r.script('forbidden-paths.mjs', [...r.resources, '--diff', diff, '--json', '--enforce']).status, 1);
});

test('D adoption: current work cannot fall back to legacy authority on an adopted path', (t) => {
  const r = repository(t);
  const request = r.put('.work/current.json', JSON.stringify({ version: 1, origin_inputs: [], requests: [{ owner: 'screen:RESULT-001',
    authority: 'current', requested_mode: 'rough-fixture-ui', targets: [{ path: ENTRY('RESULT-001'), change: 'M' }, { path: HOOK, change: 'M' }] }] }));
  const flags = { work: request, root: r.root, docs: DOCS, src: 'src', policy: '.kit/policy.yaml', manifest: '.kit/manifest.yaml', layout: '.kit/layout.yaml' };
  const preflight = prepareCurrentWork(flags); t.after(() => cleanupCurrentWork(preflight));
  assert.equal(preflight.ready, false);
  assert.deepEqual(preflight.denials.map((entry) => [entry.code, entry.path]), [['CW-WORK-SELECTION-REQUIRED', ENTRY('RESULT-001')]]);
  const hook = preflight.requests[0].path_authorizations.find((entry) => entry.path === HOOK);
  assert.equal(hook.allowed, true);
  r.put(ENTRY('RESULT-001'), 'export default function Screen() { return null; }\n');
  r.put(HOOK, 'export const useResult = () => null;\n');
  const git2 = evaluateCurrentGit(preflight);
  assert.ok(git2.violations.some((entry) => entry.code === 'CW-GIT-DENIED-TARGET' && entry.path === ENTRY('RESULT-001')), JSON.stringify(git2.violations));
});

test('D adoption: visual-refresh v1 path authority returns work-selection-required without a waiver', () => {
  const marker = { owners: ['screen:RESULT-001'], paths: [{ owner: 'screen:RESULT-001', path: ENTRY('RESULT-001'), source: 'screen_entry' }] };
  const readiness = { readiness_mode: 'final-fixture-ui', allowed_paths: [`${PREFIX}/screens/**`], forbidden_paths: [],
    __mode_order: ['docs-only', 'screen-skeleton', 'rough-fixture-ui', 'final-fixture-ui', 'api-integrated-ui'] };
  const args = { file: ENTRY('RESULT-001'), authorizedPath: ENTRY('RESULT-001'), selectedScreen: 'RESULT-001', readiness,
    layout: { resolvePaths: () => [] }, domain: 'result', canonicalBuiltIn: true, generated: null };
  for (const authorize of [runtimeVisualAuthorization, coreVisualAuthorization]) {
    assert.equal(authorize(args).allowed, true);
    const guarded = authorize({ ...args, adopted: marker });
    assert.equal(guarded.allowed, false); assert.match(guarded.reason, /work-selection-required.*--work with authority:scoped/);
    assert.deepEqual(guarded.work_selection_required.map((entry) => entry.owner), ['screen:RESULT-001']);
  }
});

test('W28: withdrawing adoption inside an implementation diff cannot reopen legacy authority for that run', (t) => {
  const r = repository(t);
  const request = r.put('.work/current.json', JSON.stringify({ version: 1, origin_inputs: [], requests: [{ owner: 'screen:RESULT-001',
    authority: 'current', requested_mode: 'rough-fixture-ui', targets: [{ path: ENTRY('RESULT-001'), change: 'M' }] }] }));
  const flags = { work: request, root: r.root, docs: DOCS, src: 'src', policy: '.kit/policy.yaml', manifest: '.kit/manifest.yaml', layout: '.kit/layout.yaml' };
  const preflight = prepareCurrentWork(flags); t.after(() => cleanupCurrentWork(preflight));
  assert.deepEqual(preflight.denials.map((entry) => entry.code), ['CW-WORK-SELECTION-REQUIRED']);
  // The same diff drops the adoption overlay and edits the adopted path.
  fs.rmSync(r.overlayFile); fs.rmSync(path.join(r.root, WORK_CONFIG_FILE));
  r.put(ENTRY('RESULT-001'), 'export default function Screen() { return null; }\n');
  const codes = evaluateCurrentGit(preflight).violations.map((entry) => entry.code);
  assert.ok(codes.includes('CW-GIT-AUTHORITY-CHANGED'), JSON.stringify(codes));
  assert.ok(codes.includes('CW-GIT-DENIED-TARGET'), JSON.stringify(codes));
});

// #257: frontend-workflow.config.yaml at the project root is the one adoption location.
const currentRequest = (r, targets) => r.put('.work/current.json', JSON.stringify({ version: 1, origin_inputs: [], requests: [{
  owner: 'screen:RESULT-001', authority: 'current', requested_mode: 'rough-fixture-ui', targets: targets.map((file) => ({ path: file, change: 'M' })) }] }));
const noPolicy = (r) => ['--docs', r.docsDir, '--manifest', '.kit/manifest.yaml'];

test('#257 every entry reads the adoption overlay and the layout from frontend-workflow.config.yaml', (t) => {
  const r = repository(t);
  const readiness = r.script('readiness.mjs', [...noPolicy(r), '--screen', 'RESULT-001', '--path', ENTRY('RESULT-001'), '--json']);
  assert.equal(readiness.status, 0, readiness.stderr);
  assert.equal(JSON.parse(readiness.stdout)['RESULT-001'].path_authorization.reason, WORK_SELECTION_REQUIRED_REASON);
  const explicit = r.script('readiness.mjs', [...r.resources, '--screen', 'RESULT-001', '--path', ENTRY('RESULT-001'), '--json']);
  assert.equal(explicit.stdout, readiness.stdout);
  const diff = r.put('changes.txt', `M\t${PANEL}\n`);
  const forbidden = r.script('forbidden-paths.mjs', [...noPolicy(r), '--diff', diff, '--json']);
  assert.equal(forbidden.status, 0, forbidden.stderr);
  assert.deepEqual(JSON.parse(forbidden.stdout).violations.filter((entry) => entry.work_selection_required).map((entry) => entry.file), [PANEL]);
  // --work needs its base policy inside --root; the kit default lies outside this fixture.
  const preflight = prepareCurrentWork({ work: currentRequest(r, [ENTRY('RESULT-001')]), root: r.root, docs: DOCS, src: 'src',
    policy: '.kit/policy.yaml', manifest: '.kit/manifest.yaml' });
  t.after(() => cleanupCurrentWork(preflight));
  assert.deepEqual(preflight.denials.map((entry) => entry.code), ['CW-WORK-SELECTION-REQUIRED']);
  const resources = Object.fromEntries(preflight.snapshot.resources.map((entry) => [entry.kind, entry.path]));
  assert.equal(resources.config, WORK_CONFIG_FILE);
  assert.equal(resources.policy_overlay, '.kit/adoption.yaml');
  assert.equal(resources.layout, '.kit/layout.yaml');
  assert.ok(['.kit/adoption.yaml', WORK_CONFIG_FILE].every((name) =>
    preflight.snapshot.authority_read_set.some((entry) => entry.path === name && entry.kind === 'file')));
});

test('#257 owner documents that declare work_execution without a configured overlay are refused, not judged unadopted', (t) => {
  for (const config of [null, 'version: 1\nlayout: .kit/layout.yaml\n']) {
    const r = repository(t, { adopted: false });
    if (config) r.put(WORK_CONFIG_FILE, config);
    const refused = /WORK-CONFIG: owner documents declare work_execution \(screen:RESULT-001, screen:RESULT-002, surface:RESULT-PANEL\)/;
    for (const args of [['--screen', 'RESULT-001', '--path', ENTRY('RESULT-001'), '--json'], ['--json']]) {
      const run = r.script('readiness.mjs', [...r.resources, ...args]);
      assert.equal(run.status, 2, run.stdout); assert.match(run.stderr, refused);
    }
    const run = r.script('forbidden-paths.mjs', [...r.resources, '--diff', r.put('changes.txt', `M\t${HOOK}\n`), '--json']);
    assert.equal(run.status, 2, run.stdout); assert.match(run.stderr, refused);
    assert.throws(() => prepareCurrentWork({ work: currentRequest(r, [HOOK]), root: r.root, docs: DOCS, src: 'src',
      policy: '.kit/policy.yaml', manifest: '.kit/manifest.yaml', layout: '.kit/layout.yaml' }), refused);
  }
});

test('#257 a base policy that declares work_execution is refused, whatever the overlay', (t) => {
  const r = repository(t);
  r.put('.kit/inline-policy.yaml', `${fs.readFileSync(DEFAULTS.policy, 'utf8')}\nwork_execution: ${fs.readFileSync(r.overlayFile, 'utf8').slice('work_execution: '.length)}`);
  const refused = /WORK-CONFIG: the base policy must not declare work_execution/;
  const run = r.script('readiness.mjs', ['--docs', r.docsDir, '--policy', '.kit/inline-policy.yaml', '--manifest', '.kit/manifest.yaml', '--screen', 'RESULT-001', '--json']);
  assert.equal(run.status, 2, run.stdout); assert.match(run.stderr, refused);
  git(r.root, 'add', '-A'); git(r.root, 'commit', '-qm', 'inline policy');
  assert.throws(() => prepareCurrentWork({ work: currentRequest(r, [HOOK]), root: r.root, docs: DOCS, src: 'src',
    policy: '.kit/inline-policy.yaml', manifest: '.kit/manifest.yaml' }), refused);
});

test('#257 an explicit --layout must be the layout frontend-workflow.config.yaml names', (t) => {
  const r = repository(t);
  r.put('.kit/other-layout.yaml', fs.readFileSync(path.join(r.root, '.kit/layout.yaml')));
  git(r.root, 'add', '-A'); git(r.root, 'commit', '-qm', 'other layout');
  const refused = /WORK-CONFIG: --layout \.kit\/other-layout\.yaml differs from frontend-workflow\.config\.yaml layout \.kit\/layout\.yaml/;
  const run = r.script('readiness.mjs', [...noPolicy(r), '--layout', '.kit/other-layout.yaml', '--screen', 'RESULT-001', '--json']);
  assert.equal(run.status, 2, run.stdout); assert.match(run.stderr, refused);
  const forbidden = r.script('forbidden-paths.mjs', [...noPolicy(r), '--layout', path.join(r.root, '.kit/other-layout.yaml'), '--diff', r.put('changes.txt', `M\t${HOOK}\n`), '--json']);
  assert.equal(forbidden.status, 2, forbidden.stdout); assert.match(forbidden.stderr, refused);
  assert.throws(() => prepareCurrentWork({ work: currentRequest(r, [HOOK]), root: r.root, docs: DOCS, src: 'src',
    manifest: '.kit/manifest.yaml', layout: '.kit/other-layout.yaml' }), refused);
  const same = r.script('readiness.mjs', [...noPolicy(r), '--layout', path.join(r.root, '.kit/layout.yaml'), '--screen', 'RESULT-001', '--json']);
  assert.equal(same.status, 0, same.stderr);
});

test('#257 the config and its overlay are authority files of a work run', (t) => {
  for (const [name, edit] of [['.kit/adoption.yaml', (r) => fs.appendFileSync(r.overlayFile, '# widened later\n')],
    [WORK_CONFIG_FILE, (r) => fs.appendFileSync(path.join(r.root, WORK_CONFIG_FILE), '# moved later\n')]]) {
    const r = repository(t);
    const preflight = prepareCurrentWork({ work: currentRequest(r, [HOOK]), root: r.root, docs: DOCS, src: 'src',
      policy: '.kit/policy.yaml', manifest: '.kit/manifest.yaml' });
    t.after(() => cleanupCurrentWork(preflight));
    assert.equal(preflight.ready, true, JSON.stringify(preflight.errors));
    r.put(HOOK, 'export const useResult = () => null;\n'); edit(r);
    const violations = evaluateCurrentGit(preflight).violations;
    assert.ok(violations.some((entry) => entry.code === 'CW-GIT-AUTHORITY-CHANGED' && entry.path === name), JSON.stringify(violations));
  }
  // Without a config, a work diff cannot create one either.
  const plain = repository(t, { adopted: false, declareUnits: false });
  const preflight = prepareCurrentWork({ work: currentRequest(plain, [HOOK]), root: plain.root, docs: DOCS, src: 'src',
    policy: '.kit/policy.yaml', manifest: '.kit/manifest.yaml', layout: '.kit/layout.yaml' });
  t.after(() => cleanupCurrentWork(preflight));
  assert.equal(preflight.snapshot.resources.some((entry) => entry.kind === 'config'), false);
  plain.put(HOOK, 'export const useResult = () => null;\n');
  plain.put(WORK_CONFIG_FILE, 'version: 1\npolicy_overlay: .kit/adoption.yaml\n');
  const violations = evaluateCurrentGit(preflight).violations;
  assert.ok(violations.some((entry) => entry.code === 'CW-GIT-AUTHORITY-CHANGED' && entry.path === WORK_CONFIG_FILE), JSON.stringify(violations));
});

test('#257 packet and report resolve the configured layout and hand it to every leaf', (t) => {
  const r = repository(t);
  const layout = path.join(r.root, '.kit/layout.yaml');
  const packetArgs = ['--docs', r.docsDir, '--policy', '.kit/policy.yaml', '--manifest', '.kit/manifest.yaml',
    '--screen', 'RESULT-001', '--requested-mode', 'rough-fixture-ui'];
  const packet = r.script('workflow-packet.mjs', [...packetArgs, '--out', path.join(r.root, 'packet.md'), '--json']);
  assert.equal(packet.status, 0, packet.stderr);
  assert.match(JSON.parse(packet.stdout).readiness_source, new RegExp(`--layout ${layout.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')} --json`));
  r.put('.kit/other-layout.yaml', fs.readFileSync(layout));
  const mismatch = r.script('workflow-packet.mjs', [...packetArgs, '--layout', '.kit/other-layout.yaml', '--json']);
  assert.equal(mismatch.status, 2, mismatch.stdout);
  assert.match(mismatch.stderr, /WORK-CONFIG: --layout \.kit\/other-layout\.yaml differs/);
  const reportFile = path.join(r.root, 'report.md');
  const report = r.script('workflow-report.mjs', ['--packet', path.join(r.root, 'packet.md'), '--docs', r.docsDir,
    '--diff', r.put('changes.txt', `M\t${HOOK}\n`), '--skip-tests', '--out', reportFile, '--json']);
  assert.equal(report.status, 0, report.stderr);
  const invocations = fs.readFileSync(reportFile, 'utf8');
  for (const leaf of ['validate.mjs', 'forbidden-paths.mjs', 'check-generated-files.mjs']) {
    assert.match(invocations, new RegExp(`${leaf.replace('.', '\\.')}[^\\n]*--layout ${layout.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`), leaf);
  }
  const reportMismatch = r.script('workflow-report.mjs', ['--packet', path.join(r.root, 'packet.md'), '--docs', r.docsDir,
    '--layout', '.kit/other-layout.yaml', '--skip-tests', '--json']);
  assert.equal(reportMismatch.status, 2, reportMismatch.stdout);
  assert.match(reportMismatch.stderr, /WORK-CONFIG: --layout \.kit\/other-layout\.yaml differs/);
});

test('#257 legacy readiness and forbidden-paths judge with the configured layout', (t) => {
  const r = repository(t);
  // Only the configured layout puts src/remote under the api_client role.
  const alt = JSON.parse(fs.readFileSync(path.join(r.root, '.kit/layout.yaml'), 'utf8'));
  alt.roles.api_client = 'src/remote/**';
  r.put('.kit/alt-layout.yaml', JSON.stringify(alt));
  r.put(WORK_CONFIG_FILE, 'version: 1\npolicy_overlay: .kit/adoption.yaml\nlayout: .kit/alt-layout.yaml\n');
  const readiness = r.script('readiness.mjs', [...noPolicy(r), '--screen', 'RESULT-001', '--json']);
  assert.equal(readiness.status, 0, readiness.stderr);
  const forbiddenPaths = JSON.parse(readiness.stdout)['RESULT-001'].forbidden_paths;
  assert.ok(forbiddenPaths.includes('src/remote/**') && !forbiddenPaths.includes('src/api/**'), JSON.stringify(forbiddenPaths));
  const diff = r.put('changes.txt', 'M\tsrc/remote/result/client.ts\nM\tsrc/api/result/client.ts\n');
  const forbidden = r.script('forbidden-paths.mjs', [...noPolicy(r), '--diff', diff, '--json']);
  assert.equal(forbidden.status, 0, forbidden.stderr);
  assert.deepEqual(JSON.parse(forbidden.stdout).violations.map((entry) => entry.file), ['src/remote/result/client.ts']);
});
