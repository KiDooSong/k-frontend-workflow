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

// owners: which owners the policy adopts; the documents always declare units.
function repository(t, { owners = [SURFACE, 'screen:RESULT-001', 'screen:RESULT-002'], policySection = true } = {}) {
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
  const policyFile = put('.kit/policy.yaml', `${fs.readFileSync(DEFAULTS.policy, 'utf8')}${policySection ? `\nwork_execution: ${JSON.stringify(work)}\n` : ''}`);
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
    work_execution: { version: 1, ...(index === 0 ? { private_paths: { domain_component: [PRIVATE] }, test_paths: [`${PREFIX}/tests/result-001/**`] } : {}),
      units: [{ id: 'known', kind: 'behavior', contracts: [`artifact:RULES-${index + 1}#rules`], sources: [] }] },
  }, '## Notes\nExisting host.'));
  write('surface.md', 'domains/result/surfaces/result-panel/surface-spec.md', { artifact_id: 'SURFACE', artifact_type: 'shared-surface-spec',
    surface_id: 'RESULT-PANEL', domain: 'result', status: 'draft', api_required: false, member_screens: [...MEMBERS],
    implementation_paths: [`${SHARED}/**`],
    work_execution: { version: 1, units: [{ id: 'panel', kind: 'behavior', contracts: ['artifact:RULES-0#rules'], sources: [],
      host_units: Object.fromEntries(MEMBERS.map((id) => [id, 'known'])) }] },
  }, SURFACE_BODY);
  for (const file of [PANEL, HOOK, ...MEMBERS.map(ENTRY)]) put(file, 'export default null;\n');
  const layout = loadLayoutProfile({ kitRoot: root, flags: { layout: layoutFile } });
  put(`${DOCS}/_meta/workflow-state.yaml`, JSON.stringify(buildState({ docsDir: path.join(root, DOCS), srcDir: path.join(root, 'src'),
    date: '2026-09-23', layout, projectRoot: root }).state));
  git(root, 'init', '-q'); git(root, 'config', 'maintenance.auto', 'false'); git(root, 'config', 'gc.auto', '0'); git(root, 'config', 'user.email', 'test@example.com'); git(root, 'config', 'user.name', 'test');
  git(root, 'add', '-A'); git(root, 'commit', '-qm', 'baseline');
  const resources = ['--docs', path.join(root, DOCS), '--policy', policyFile, '--manifest', manifestFile, '--layout', layoutFile];
  const script = (name, args) => spawnSync(process.execPath, [path.join(KIT_ROOT, 'scripts', name), ...args], { cwd: root, encoding: 'utf8' });
  return { root, docs, put, policyFile, resources, script,
    policy: () => yamlParse(fs.readFileSync(policyFile, 'utf8')), docsDir: path.join(root, DOCS) };
}
const sources = (marker) => marker.paths.map((entry) => [entry.owner, entry.path, entry.source]);

test('D adoption: an unadopted repository gets an empty marker and unchanged path decisions', (t) => {
  const r = repository(t, { policySection: false });
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
  const plain = repository(t, { policySection: false });
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
