import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { splitFrontmatter, DEFAULTS } from './util.mjs';
import { buildState } from '../workflow-state.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { COMPONENT_MAPPING_COLUMNS, MAPPING_PROVENANCE_COLUMNS } from './mapping-provenance.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { resolveScopedBindingBasis } from './scoped-work-basis.mjs';
import { prepareScopedWork, cleanupScopedWork, publicScopedEnvelope, isScopedWorkDocument, evaluateScopedGit,
  scopedPacketEnvelope, assertScopedPacketMatches } from './scoped-work-execution.mjs';

const SURFACE = 'surface:RESULT-PANEL', MEMBERS = ['RESULT-001', 'RESULT-002'];
const DOCS = 'docs/frontend-workflow', PREFIX = 'src/features/result', SHARED = `${PREFIX}/components/panel`;
const PANEL = `${SHARED}/Panel.tsx`, ENTRY = (id) => `${PREFIX}/screens/${id}.tsx`;
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

// `prefix` places the project below the Git top level (monorepo root/apps/web).
function repository(t, { prefix = '' } = {}) {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-exec-')));
  const root = prefix ? path.join(repo, ...prefix.split('/')) : repo;
  fs.mkdirSync(root, { recursive: true });
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-exec-request-')));
  t.after(() => { fs.rmSync(repo, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); });
  const docs = new Map();
  function put(name, value) {
    const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value); return file;
  }
  function write(name, relative, fm, body) { const file = put(`${DOCS}/${relative}`, md(fm, body)); docs.set(name, file); return file; }
  function edit(name, update) {
    const file = docs.get(name), before = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const next = { fm: before.data, body: before.body }; update(next); fs.writeFileSync(file, md(next.fm, next.body));
  }
  const work = { version: 1, owners: [SURFACE, ...MEMBERS.map((id) => `screen:${id}`)], profiles: ['visual', 'api-contract', 'behavior'],
    role_limits: { visual: ['screen', 'domain_component', 'hook', 'test'], 'api-contract': ['api_client', 'test'],
      behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] };
  put('.kit/policy.yaml', `${fs.readFileSync(DEFAULTS.policy, 'utf8')}\nwork_execution: ${JSON.stringify(work)}\n`);
  const layoutFile = put('.kit/layout.yaml', JSON.stringify({ roles: { route_entry: 'src/app/**',
    screen: 'src/features/{domain}/screens/**', domain_component: 'src/features/{domain}/components/**',
    hook: 'src/features/{domain}/hooks/**', api_client: 'src/api/**', test: 'src/features/{domain}/tests/**' } }));
  put('.kit/manifest.yaml', JSON.stringify({ version: 1, artifacts: {} }));
  put(`${DOCS}/app/navigation-map.md`, '---\nstatus: draft\n---\n\n# Navigation Map\n');
  put(`${DOCS}/design/component-catalog.md`, '# Component Catalog\n');
  for (const number of [0, 1, 2]) write(`rules-${number}.md`, `domains/result/rules/rules-${number}.md`, { artifact_id: `RULES-${number}`,
    artifact_type: 'domain-rules', domain: 'result', status: 'confirmed', approved_by: 'synthetic-test-owner', approved_at: '2026-09-23',
    decision_id: `fixture-rules-${number}` }, `## Rules\nKnown local behavior ${number}, without network calls.`);
  MEMBERS.forEach((id, index) => write(`screen-${index + 1}.md`, `domains/result/screens/${id.toLowerCase()}/screen-spec.md`, {
    artifact_id: `HOST-${index + 1}`, artifact_type: 'screen-spec', screen_id: id, domain: 'result', route: `/${id.toLowerCase()}`,
    status: 'draft', api_required: false, screen_entry: ENTRY(id),
    work_execution: { version: 1, units: [{ id: 'known', kind: 'behavior', contracts: [`artifact:RULES-${index + 1}#rules`], sources: [] }] },
  }, '## Notes\nExisting host.'));
  write('surface.md', 'domains/result/surfaces/result-panel/surface-spec.md', { artifact_id: 'SURFACE', artifact_type: 'shared-surface-spec',
    surface_id: 'RESULT-PANEL', domain: 'result', status: 'draft', api_required: false, member_screens: [...MEMBERS],
    implementation_paths: [`${SHARED}/**`],
    work_execution: { version: 1, units: [{ id: 'panel', kind: 'behavior', contracts: ['artifact:RULES-0#rules'], sources: [],
      host_units: Object.fromEntries(MEMBERS.map((id) => [id, 'known'])) }] },
  }, SURFACE_BODY);
  for (const file of [PANEL, ...MEMBERS.map(ENTRY)]) put(file, 'export default null;\n');
  function writeState(update = (state) => state) {
    const layout = loadLayoutProfile({ kitRoot: root, flags: { layout: layoutFile } });
    const state = buildState({ docsDir: path.join(root, DOCS), srcDir: path.join(root, 'src'), date: '2026-09-23', layout, projectRoot: root }).state;
    put(`${DOCS}/_meta/workflow-state.yaml`, JSON.stringify(update(state)));
  }
  function commit(message = 'baseline', updateState) {
    writeState(updateState);
    git(repo, 'add', '-A'); git(repo, 'commit', '-qm', message);
  }
  git(repo, 'init', '-q'); git(repo, 'config', 'maintenance.auto', 'false'); git(repo, 'config', 'gc.auto', '0'); git(repo, 'config', 'user.email', 'test@example.com'); git(repo, 'config', 'user.name', 'test');
  commit();
  function request(requests = [surfaceRequest()], origins = [], where = outside) {
    const file = path.join(where, 'request.json');
    fs.writeFileSync(file, JSON.stringify({ version: 1, origin_inputs: origins, requests })); return file;
  }
  const flags = (work) => ({ work, root, docs: DOCS, src: 'src', policy: '.kit/policy.yaml', manifest: '.kit/manifest.yaml', layout: '.kit/layout.yaml' });
  function prepare(t2, work = request()) {
    const preflight = prepareScopedWork(flags(work));
    t2.after(() => cleanupScopedWork(preflight));
    return preflight;
  }
  // Host-owned Figma mappings, their canonical inputs and a v2 register; the surface
  // visual unit selects M-001 of each host. `extra` adds register rows for other inputs.
  function visual({ extra = [] } = {}) {
    const summaries = [], effects = [], selectors = {};
    MEMBERS.forEach((id, index) => {
      const number = index + 1, input = `IN-20260923-figma-00${number}`, mapping = `MAP-${number}`;
      const anchor = `input:${input}#extracted-facts/01`;
      edit(`screen-${number}.md`, ({ fm }) => { fm.work_execution.units[0] = { id: 'known', kind: 'visual', contracts: [`artifact:${mapping}#component-mapping`], sources: [] }; });
      write(`mapping-${number}.md`, `domains/result/mappings/mapping-${number}.md`, { artifact_id: mapping, artifact_type: 'figma-component-mapping',
        screen_id: id, domain: 'result', status: 'draft', provenance_contract: 1 },
      `## Component Mapping\n${table(COMPONENT_MAPPING_COLUMNS, [['`M-001` · shared panel', 'Panel', `${SHARED}/Panel${number}.tsx`, 'Shared']])}\n\n` +
      `## Mapping Provenance\n${table(MAPPING_PROVENANCE_COLUMNS, [['M-001', 'inherit', 'node', 'inherit', anchor]])}`);
      put(`${DOCS}/inputs/input-${number}.md`, md({ input_id: input, input_type: 'figma', source_type: 'figma',
        source_ref: `figma://file/exec-fixture-${number}/node/${number}:1`, captured_at: '2026-09-23T00:00:00Z', captured_by: 'test',
        status: 'captured', affected_domains: ['result'], affected_screens: [id] }, '## Extracted Facts\n- Shared panel from this host.'));
      summaries.push([input, 'figma', 'simple-update', 'reconciled', 'accepted', `artifact:${mapping}`, '-', '-']);
      effects.push([input, '01', 'visual-evidence', 'simple-update', 'update', `artifact:${mapping}#component-mapping/M-001`, anchor, 'inherit', 'node', 'inherit']);
      selectors[id] = { mapping_ref: `artifact:${mapping}#component-mapping`, m_keys: ['M-001'] };
      put(`${SHARED}/Panel${number}.tsx`, `export const Panel${number} = () => null;\n`);
    });
    for (const row of extra) { summaries.push(row.summary); if (row.input) put(`${DOCS}/inputs/${row.file}`, row.input); }
    edit('surface.md', ({ fm }) => { fm.work_execution.units[0].kind = 'visual'; fm.work_execution.units[0].host_visual_evidence = selectors; });
    put(`${DOCS}/_meta/reconciliation-register.md`, md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' },
      `${table(REQUIRED_REGISTER_COLS, summaries)}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS, effects)}`));
  }
  return { repo, root, outside, docs, put, write, edit, commit, request, flags, prepare, visual };
}
const surfaceRequest = (targets = [PANEL]) => ({ owner: SURFACE, authority: 'scoped', unit: 'panel',
  targets: targets.map((file) => ({ path: file, change: 'M' })) });

test('D preflight: a scoped surface request is evaluated only on the immutable HEAD baseline', (t) => {
  const r = repository(t), preflight = r.prepare(t), env = publicScopedEnvelope(preflight);
  assert.equal(env.ready, true, JSON.stringify(env.denials)); assert.equal(env.work_contract, 1); assert.equal(env.authority, 'scoped');
  assert.equal(env.snapshot.commit, git(r.root, 'rev-parse', 'HEAD').trim());
  assert.equal(env.snapshot.tree, git(r.root, 'rev-parse', 'HEAD^{tree}').trim());
  assert.match(env.request_digest, /^sha256:[0-9a-f]{64}$/); assert.equal(env.snapshot.work_request.path, null);
  const [selected] = env.requests;
  assert.deepEqual([selected.owner, selected.unit, selected.kind, selected.ready], [SURFACE, 'panel', 'behavior', true]);
  assert.deepEqual(selected.path_authorizations, [{ path: PANEL, change: 'M', reasons: [], allowed: true }]);
  assert.deepEqual(selected.evidence.hosts.map((host) => [host.owner, host.host_satisfied]),
    MEMBERS.map((id) => [`screen:${id}`, true]));
  assert.deepEqual(selected.evidence.contracts, ['artifact:RULES-0#rules']);
  // Every file the scoped hosts read is pinned for the backstop, not only C's resources.
  const pinned = new Set(env.snapshot.authority_read_set.map((entry) => entry.path));
  for (const file of ['.kit/policy.yaml', '.kit/layout.yaml', '.kit/manifest.yaml', `${DOCS}/_meta/workflow-state.yaml`,
    `${DOCS}/domains/result/rules/rules-1.md`, `${DOCS}/domains/result/rules/rules-2.md`,
    `${DOCS}/domains/result/surfaces/result-panel/surface-spec.md`]) assert.ok(pinned.has(file), file);
  assert.ok(env.snapshot.authority_read_set.some((entry) => entry.source === 'artifact-index'));
  // Legacy readiness is preserved; its phase blockers are informational only.
  assert.ok(env.legacy_readiness[SURFACE]); assert.equal(Object.hasOwn(env, '_context'), false);
  assert.equal(env.approval_verified, false);
});

test('D preflight: uncommitted worktree edits cannot change baseline authority in either direction', (t) => {
  const r = repository(t);
  r.edit('rules-2.md', ({ fm }) => { fm.status = 'draft'; });
  assert.equal(r.prepare(t).ready, true, 'the committed confirmed contract is the baseline');
  r.commit('draft host contract');
  const blocked = r.prepare(t);
  assert.equal(blocked.ready, false);
  assert.ok(blocked.denials.some((entry) => entry.code === 'confirmed-behavior-contract-required' && entry.host === 'screen:RESULT-002'));
  r.edit('rules-2.md', ({ fm }) => { fm.status = 'confirmed'; });
  assert.equal(r.prepare(t).ready, false, 'a worktree repair is not baseline authority');
});

test('D preflight: stale legacy state and legacy structural errors are errors, not future requirements', (t) => {
  const r = repository(t);
  r.commit('drop a screen from the generated state', (state) => { delete state.screens['RESULT-001']; return state; });
  const stale = r.prepare(t, r.request([{ owner: 'screen:RESULT-001', authority: 'scoped', unit: 'known',
    targets: [{ path: ENTRY('RESULT-001'), change: 'M' }] }]));
  assert.equal(stale.ready, false); assert.deepEqual(stale.errors.map((entry) => entry.code), ['SW-LEGACY-STATE-001']);
  const s = repository(t); s.edit('surface.md', (doc) => { doc.body = doc.body.replace('| retry | state |', '| retry | route |'); }); s.commit('route edge');
  const invalid = s.prepare(t);
  assert.equal(invalid.ready, false); assert.ok(invalid.errors.some((entry) => entry.code === 'SW-AUTHORITY-INVALID' && entry.owner === SURFACE));
});

test('D preflight: mixed documents, non A/M changes, unresolved origins and symlinked requests are input errors', (t) => {
  const r = repository(t);
  const current = { owner: 'screen:RESULT-001', authority: 'current', requested_mode: 'rough-fixture-ui', targets: [{ path: ENTRY('RESULT-001'), change: 'M' }] };
  assert.throws(() => r.prepare(t, r.request([current, surfaceRequest()])), /mixed current\/scoped/);
  assert.equal(isScopedWorkDocument({ requests: [current] }), false);
  assert.throws(() => r.prepare(t, r.request([{ ...surfaceRequest(), targets: [{ path: PANEL, change: 'D' }] }])), /A\/M only/);
  assert.throws(() => r.prepare(t, r.request([surfaceRequest()], [{ input_id: 'IN-20260923-figma-009', source_refs: [] }])), /origin IN-20260923-figma-009/);
  const link = path.join(r.outside, 'link.json'); fs.symlinkSync(r.request(), link);
  assert.throws(() => r.prepare(t, link), /regular file required/);
  assert.throws(() => r.prepare(t, r.request([{ ...surfaceRequest(), unit: 'unknown-unit' }])), /unit/);
});

test('D preflight: a request inside the project is identified by its path and exact bytes', (t) => {
  const r = repository(t), file = r.request([surfaceRequest()], [], r.root);
  const env = publicScopedEnvelope(r.prepare(t, file));
  assert.equal(env.snapshot.work_request.path, 'request.json');
  assert.equal(env.snapshot.work_request.hash, `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`);
});

test('D preflight: the materialized baseline is removed on cleanup', (t) => {
  const r = repository(t), preflight = prepareScopedWork(r.flags(r.request()));
  const baseline = preflight._context.baselineRoot;
  assert.ok(fs.existsSync(baseline)); cleanupScopedWork(preflight); assert.equal(fs.existsSync(baseline), false);
});

const NEW = `${SHARED}/New.tsx`;
const codes = (result) => result.violations.map((entry) => entry.code);
const withNew = () => [{ ...surfaceRequest(), targets: [{ path: NEW, change: 'A' }, { path: PANEL, change: 'M' }] }];

test('D backstop: only allowed requested regular-file A/M targets may change', (t) => {
  const r = repository(t), preflight = r.prepare(t, r.request(withNew()));
  assert.equal(preflight.ready, true, JSON.stringify(preflight.denials));
  const idle = evaluateScopedGit(preflight);
  assert.deepEqual(idle.implementation_records, []);
  assert.deepEqual(codes(idle).sort(), ['SW-GIT-MISSING-REQUESTED', 'SW-GIT-MISSING-REQUESTED']);
  r.put(PANEL, 'export default function Panel() { return null; }\n'); r.put(NEW, 'export const New = 1;\n');
  const done = evaluateScopedGit(preflight);
  assert.equal(done.ok, true, JSON.stringify(done.violations));
  assert.deepEqual(done.implementation_records.map((record) => `${record.status}:${record.projectPath}`).sort(), [`A:${NEW}`, `M:${PANEL}`]);
  assert.equal(done.snapshot.diff_kind, 'HEAD..worktree');
});

test('D backstop: an implementation diff cannot self-grant through authority, documents or requests', (t) => {
  const r = repository(t), preflight = r.prepare(t);
  r.put(PANEL, 'export const changed = 1;\n'); r.edit('rules-1.md', ({ fm }) => { fm.status = 'draft'; });
  const authority = evaluateScopedGit(preflight);
  assert.equal(authority.ok, false);
  assert.ok(authority.violations.some((entry) => entry.code === 'SW-GIT-AUTHORITY-CHANGED' && entry.path === `${DOCS}/domains/result/rules/rules-1.md`));
  const s = repository(t), second = s.prepare(t);
  s.put(PANEL, 'export const changed = 1;\n');
  s.put(`${DOCS}/domains/result/rules/late.md`, md({ artifact_id: 'LATE', artifact_type: 'domain-rules', domain: 'result', status: 'draft' }, '## Rules\nLate.'));
  const inventory = evaluateScopedGit(second);
  assert.ok(inventory.violations.some((entry) => entry.code === 'SW-GIT-AUTHORITY-CHANGED' && entry.source === 'artifact-index'), JSON.stringify(inventory.violations));
  const third = s.prepare(t, s.request()); fs.appendFileSync(path.join(s.outside, 'request.json'), '\n');
  assert.throws(() => evaluateScopedGit(third), /work request changed after preflight/);
});

test('D backstop: unrequested paths and delete/mode/type changes are violations', (t) => {
  const r = repository(t), preflight = r.prepare(t);
  r.put(PANEL, 'export const changed = 1;\n'); r.put('src/features/result/components/other/Other.tsx', 'export const other = 1;\n');
  assert.deepEqual(codes(evaluateScopedGit(preflight)), ['SW-GIT-UNREQUESTED']);
  const d = repository(t), deleted = d.prepare(t); fs.rmSync(path.join(d.root, PANEL));
  assert.deepEqual(codes(evaluateScopedGit(deleted)).sort(), ['SW-GIT-MISSING-REQUESTED', 'SW-GIT-UNSUPPORTED-CHANGE']);
  const m = repository(t), mode = m.prepare(t); m.put(PANEL, 'export const changed = 1;\n'); fs.chmodSync(path.join(m.root, PANEL), 0o755);
  assert.deepEqual(codes(evaluateScopedGit(mode)), ['SW-GIT-MODE']);
  const y = repository(t), type = y.prepare(t); fs.rmSync(path.join(y.root, PANEL)); fs.symlinkSync('Other.tsx', path.join(y.root, PANEL));
  const typed = codes(evaluateScopedGit(type));
  assert.ok(typed.includes('SW-GIT-UNSUPPORTED-CHANGE') || typed.includes('SW-GIT-TYPE'), JSON.stringify(typed));
});

test('D backstop: a target denied at the baseline stays denied after implementation', (t) => {
  const r = repository(t); r.edit('rules-2.md', ({ fm }) => { fm.status = 'draft'; }); r.commit('draft host contract');
  const preflight = r.prepare(t); assert.equal(preflight.ready, false);
  r.put(PANEL, 'export const changed = 1;\n');
  const result = evaluateScopedGit(preflight);
  assert.equal(result.ok, false); assert.deepEqual(codes(result), ['SW-GIT-DENIED-TARGET']);
});

test('D backstop: --staged evaluates the index, not unstaged worktree bytes', (t) => {
  const r = repository(t), preflight = r.prepare(t);
  r.put(PANEL, 'export const staged = 1;\n'); git(r.root, 'add', PANEL);
  r.put('src/features/result/components/other/Unstaged.tsx', 'export const unstaged = 1;\n');
  const staged = evaluateScopedGit(preflight, { staged: true });
  assert.equal(staged.ok, true, JSON.stringify(staged.violations)); assert.equal(staged.snapshot.diff_kind, 'HEAD..index');
  assert.deepEqual(codes(evaluateScopedGit(preflight)), ['SW-GIT-UNREQUESTED']);
});

test('D backstop: API evidence directory membership is compared against the baseline listing', (t) => {
  const r = repository(t); r.put('contracts/api/one.yaml', 'openapi: 3.0.0\n'); r.commit('api evidence');
  const preflight = r.prepare(t);
  // The profile records listings for directory evidence sources; inject one here to
  // exercise the backstop comparison without an API-candidate fixture.
  preflight.snapshot.scoped_directory_read_set = [{ file: 'contracts/api', entries: [['one.yaml', 'file']] }];
  r.put(PANEL, 'export const changed = 1;\n');
  assert.equal(evaluateScopedGit(preflight).ok, true);
  r.put('contracts/api/two.yaml', 'openapi: 3.0.0\n');
  assert.ok(codes(evaluateScopedGit(preflight)).includes('SW-GIT-EVIDENCE-DIRECTORY-CHANGED'));
});

const ORIGIN = 'IN-20260923-figma-001';
const visualRequest = () => [{ owner: SURFACE, authority: 'scoped', unit: 'panel', targets: [{ path: `${SHARED}/Panel1.tsx`, change: 'M' }] }];
const hostRequest = () => [{ owner: 'screen:RESULT-001', authority: 'scoped', unit: 'known', targets: [{ path: ENTRY('RESULT-001'), change: 'M' }] }];

test('W35: a connected origin is preserved from the scoped preflight into packet transport', (t) => {
  const r = repository(t); r.visual(); r.commit('visual evidence');
  const preflight = r.prepare(t, r.request(hostRequest(), [{ input_id: ORIGIN, source_refs: [] }]));
  const env = publicScopedEnvelope(preflight);
  assert.equal(env.ready, true, JSON.stringify(env.denials));
  assert.deepEqual(env.origin_inputs.map((origin) => [origin.input_id, origin.path, origin.reconcile_status, origin.reconcile_result]),
    [[ORIGIN, `${DOCS}/inputs/input-1.md`, 'reconciled', 'accepted']]);
  assert.match(env.origin_inputs[0].raw_hash, /^sha256:[0-9a-f]{64}$/);
  assert.ok(env.requests[0].evidence.coverage.some((entry) => entry.input_id === ORIGIN && entry.accepted_for_source));
  const packet = scopedPacketEnvelope(preflight);
  assert.doesNotThrow(() => assertScopedPacketMatches(preflight, packet));
  assert.throws(() => assertScopedPacketMatches(preflight, { ...packet, origin_inputs: [] }), /origin identity\/hash changed/);
  assert.throws(() => assertScopedPacketMatches(preflight, { ...packet, request_digest: `sha256:${'0'.repeat(64)}` }), /request digest changed/);
});

test('W33/W35: a surface keeps the origin for every host subrequest; an unexplained host relation stays non-ready', (t) => {
  const r = repository(t); r.visual(); r.commit('visual evidence');
  const preflight = r.prepare(t, r.request(visualRequest(), [{ input_id: ORIGIN, source_refs: [] }]));
  assert.equal(preflight.ready, false);
  // Host 1 and the surface explain the origin through the selected mapping evidence;
  // host 2 needs its own reviewed routing (no-effect-on-unit), never a borrowed pass.
  assert.deepEqual(preflight.denials.map((entry) => [entry.code, entry.host ?? null, entry.input_id]),
    [['origin-input-unreconciled', 'screen:RESULT-002', ORIGIN]]);
  assert.equal(publicScopedEnvelope(preflight).origin_inputs[0].input_id, ORIGIN);
});

test('W05: an unrelated partial input stays a warning and does not deny the selected scoped unit', (t) => {
  const r = repository(t);
  const other = 'IN-20260923-figma-009';
  // Captured before structured_since: a legacy row without Items, still partially reconciled.
  r.visual({ extra: [{ summary: [other, 'figma', 'simple-update', 'partially-reconciled', 'pending', '-', '-', '-'], file: 'input-9.md',
    input: md({ input_id: other, input_type: 'figma', source_type: 'figma', source_ref: 'figma://file/unrelated/node/9:1',
      captured_at: '2026-08-15T00:00:00Z', captured_by: 'test', status: 'captured', affected_domains: ['result'], affected_screens: ['RESULT-001'] },
    '## Extracted Facts\n- Unrelated partial detail.') }] });
  r.commit('unrelated partial input');
  const preflight = r.prepare(t, r.request(hostRequest()));
  assert.equal(preflight.ready, true, JSON.stringify([preflight.denials, preflight.errors]));
  assert.ok(preflight.reconciliation_warnings.some((entry) => /RR-LIFECYCLE-101/.test(entry.message)), JSON.stringify(preflight.reconciliation_warnings));
});

test('W06: selected coverage report files are read from the committed baseline, never assumed', (t) => {
  const r = repository(t); r.visual(); r.commit('visual evidence');
  const review = `${DOCS}/_meta/reviews/result-review.md`;
  const requests = [{ ...hostRequest()[0], coverage_reports: [review] }];
  assert.throws(() => r.prepare(t, r.request(requests)), /result-review\.md/);
  r.put(review, '# Review\n\nNo structured coverage attachment.\n');
  assert.throws(() => r.prepare(t, r.request(requests)), /result-review\.md/, 'an uncommitted report is not baseline evidence');
  r.commit('review file without a receipt fence');
  assert.throws(() => r.prepare(t, r.request(requests)), /no root work-coverage fence: .*result-review\.md/);
});

test('W23: a project below the Git top level keeps repository paths and reports outside-root changes', (t) => {
  const r = repository(t, { prefix: 'apps/web' }), preflight = r.prepare(t);
  const env = publicScopedEnvelope(preflight);
  assert.equal(env.ready, true, JSON.stringify(env.denials)); assert.equal(env.snapshot.project_prefix, 'apps/web');
  assert.ok(env.snapshot.authority_read_set.some((entry) => entry.path === '.kit/policy.yaml'), 'authority paths stay project-relative');
  r.put(PANEL, 'export const changed = 1;\n');
  const inside = evaluateScopedGit(preflight);
  assert.equal(inside.ok, true, JSON.stringify(inside.violations));
  assert.deepEqual(inside.implementation_records.map((record) => [record.path, record.projectPath]), [[`apps/web/${PANEL}`, PANEL]]);
  fs.writeFileSync(path.join(r.repo, 'README.md'), '# outside the project\n');
  assert.deepEqual(evaluateScopedGit(preflight).violations.map((entry) => entry.code), ['SW-GIT-OUTSIDE-ROOT']);
});

test('W27: six arrival orders of three reconciled inputs keep the same scoped permit, and origin order is irrelevant', (t) => {
  const r = repository(t), planning = 'IN-20260923-planning-003';
  // A third, non-Figma input reconciled before structured_since (a legacy row without Items).
  r.visual({ extra: [{ summary: [planning, 'planning', 'simple-update', 'reconciled', 'accepted', '-', '-', '-'], file: 'input-3.md',
    input: md({ input_id: planning, input_type: 'planning', source_type: 'planning-doc', source_ref: 'docs://planning/result-panel',
      captured_at: '2026-08-20T00:00:00Z', captured_by: 'test', status: 'captured', affected_domains: ['result'], affected_screens: ['RESULT-001'] },
    '## Extracted Facts\n- Retry copy stays unchanged.') }] });
  r.commit('three reconciled inputs');
  const ids = [ORIGIN, 'IN-20260923-figma-002', planning];
  const decide = (preflight) => {
    const env = publicScopedEnvelope(preflight);
    return JSON.stringify({ ready: env.ready, denials: env.denials, origins: env.origin_inputs.map((origin) => [origin.input_id, origin.raw_hash]),
      requests: env.requests.map(({ owner, unit, ready, path_authorizations, prerequisite_denials, evidence }) =>
        ({ owner, unit, ready, path_authorizations, prerequisite_denials, evidence })) });
  };
  // Rewrite the register and Items rows as if the three inputs had been reconciled in `order`.
  const register = path.join(r.root, DOCS, '_meta/reconciliation-register.md'), original = fs.readFileSync(register, 'utf8');
  const arrange = (order) => {
    const lines = original.split('\n');
    for (let index = 0; index < lines.length;) {
      if (!lines[index].startsWith('| IN-')) { index += 1; continue; }
      let end = index; while (end < lines.length && lines[end].startsWith('| IN-')) end += 1;
      const rows = lines.slice(index, end), arranged = order.flatMap((i) => rows.filter((row) => row.split('|')[1].trim() === ids[i]));
      assert.equal(arranged.length, rows.length);
      lines.splice(index, end - index, ...arranged); index = end;
    }
    return lines.join('\n');
  };
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]], hosts = new Set(), surfaces = new Set();
  for (const order of orders) {
    const text = arrange(order);
    if (text !== fs.readFileSync(register, 'utf8')) { fs.writeFileSync(register, text); r.commit(`arrival ${order.join('')}`); }
    const host = r.prepare(t, r.request(hostRequest(), [{ input_id: ORIGIN, source_refs: [] }]));
    assert.equal(host.ready, true, JSON.stringify([order, host.denials, host.errors]));
    hosts.add(decide(host));
    // The surface aggregates both hosts' Items; checked at the first and the fully reversed arrival.
    if (order === orders[0] || order === orders.at(-1)) {
      const surface = r.prepare(t, r.request(visualRequest()));
      assert.equal(surface.ready, true, JSON.stringify([order, surface.denials, surface.errors]));
      surfaces.add(decide(surface));
    }
  }
  assert.deepEqual([hosts.size, surfaces.size], [1, 1]);
  // The caller's origin listing order is not an arrival order either.
  const origins = ids.slice(0, 2).map((input_id) => ({ input_id, source_refs: [] }));
  assert.equal(decide(r.prepare(t, r.request(hostRequest(), [...origins].reverse()))), decide(r.prepare(t, r.request(hostRequest(), origins))));
});

test('W13: missing, foreign or stale Decision scopes deny scoped work; no scope state changes the legacy cap', (t) => {
  const r = repository(t), owner = 'screen:RESULT-001', decisionRef = 'decision:D-ONE@open-decision-register';
  const home = (scopes = {}) => r.write('decisions.md', 'global/open-decisions.md', { artifact_id: 'open-decision-register',
    artifact_type: 'open-decision-register', status: 'draft', ...scopes },
  `## Open Decisions\n${table(['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'], [['D-ONE', 'Choose the retry behavior.', 'A / B', 'rough-fixture-ui', 'PM', 'open']])}`);
  const scope = (fields = {}) => ({ decision_work_scopes: { version: 1, bindings: [{ decision_id: 'D-ONE', owner, known_units: ['known'], blocks: [],
    basis_digest: `sha256:${'0'.repeat(64)}`, approval_ref: 'review:synthetic-only', ...fields }] } });
  const outcome = (scopes, message) => {
    home(scopes); r.commit(message);
    const env = publicScopedEnvelope(r.prepare(t, r.request(hostRequest())));
    return { ready: env.ready, codes: env.denials.map((entry) => entry.code), legacy: env.legacy_readiness[owner] };
  };
  r.edit('screen-1.md', ({ fm }) => { fm.decision_refs = ['D-ONE']; });
  const blocked = [outcome(undefined, 'no scope'), outcome(scope({ owner: 'screen:RESULT-002' }), 'another owner scope'), outcome(scope(), 'stale scope')];
  for (const entry of blocked) assert.deepEqual([entry.ready, entry.codes], [false, ['unit-decision-blocked']]);
  // A person reviews the scope and records the current basis digest.
  const docsDir = path.join(r.root, DOCS);
  const { basis_digest: digest } = resolveScopedBindingBasis({ owner, unit: 'known', decisionRef, projectRoot: r.root, docsDir, kitRoot: path.join(r.root, '.kit'),
    policyFile: path.join(r.root, '.kit/policy.yaml'), layoutFile: path.join(r.root, '.kit/layout.yaml'), manifestFile: path.join(r.root, '.kit/manifest.yaml'),
    registerFile: path.join(docsDir, '_meta/reconciliation-register.md'), inputArtifacts: [],
    targetIndex: buildReconciliationTargetIndex({ docs: [...r.docs.values()].map((file) => ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }) });
  const current = outcome(scope({ basis_digest: digest }), 'current scope');
  assert.deepEqual([current.ready, current.codes], [true, []]);
  assert.equal(blocked[0].legacy.__decision_cap, 'screen-skeleton');
  for (const entry of [...blocked, current]) assert.deepEqual(entry.legacy, blocked[0].legacy);
});
