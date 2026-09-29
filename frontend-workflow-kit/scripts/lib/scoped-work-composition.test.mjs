import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter, DEFAULTS } from './util.mjs';
import { buildState } from '../workflow-state.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { inspectScopedWorkRequests } from './scoped-work-composition.mjs';

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

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-compose-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, DOCS), docs = new Map();
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
  const policyText = fs.readFileSync(DEFAULTS.policy, 'utf8');
  const writePolicy = () => put('.kit/policy.yaml', `${policyText}\nwork_execution: ${JSON.stringify(work)}\n`);
  const policyFile = writePolicy();
  const layoutFile = put('.kit/layout.yaml', JSON.stringify({ roles: { route_entry: 'src/app/**',
    screen: 'src/features/{domain}/screens/**', domain_component: 'src/features/{domain}/components/**',
    hook: 'src/features/{domain}/hooks/**', api_client: 'src/api/**', test: 'src/features/{domain}/tests/**' } }));
  const manifestFile = put('.kit/manifest.yaml', JSON.stringify({ version: 1, artifacts: {} }));
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
  // M targets must exist in the observed tree; A targets must not.
  for (const file of [PANEL, ...MEMBERS.map(ENTRY)]) put(file, 'export default null;\n');
  function writeState() {
    const layout = loadLayoutProfile({ kitRoot: root, flags: { layout: layoutFile } });
    put(`${DOCS}/_meta/workflow-state.yaml`, JSON.stringify(buildState({ docsDir, srcDir: path.join(root, 'src'),
      date: '2026-09-23', layout, projectRoot: root }).state));
  }
  function legacy(number = 2) {
    edit(`screen-${number}.md`, ({ fm }) => { delete fm.work_execution; });
    work.owners = work.owners.filter((owner) => owner !== `screen:${MEMBERS[number - 1]}`); writePolicy();
    edit('surface.md', ({ fm }) => { fm.work_execution.units[0].host_units[MEMBERS[number - 1]] = 'legacy-current'; });
  }
  const resources = () => ({ projectRoot: root, docsDir, kitRoot: path.join(root, '.kit'), policyFile, layoutFile, manifestFile,
    registerFile: path.join(docsDir, '_meta/reconciliation-register.md'), inputArtifacts: [],
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) => ({ file,
      fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }) });
  function run(requests, extra = {}, { origins = [] } = {}) {
    writeState();
    return inspectScopedWorkRequests({ ...resources(), ...extra, request: { version: 1, origin_inputs: origins, requests } });
  }
  return { root, docs, put, edit, work, writePolicy, writeState, legacy, resources, run };
}
const surface = (targets = [PANEL]) => ({ owner: SURFACE, authority: 'scoped', unit: 'panel',
  targets: targets.map((file) => ({ path: file, change: 'M' })) });
const screen = (id, targets = [ENTRY(id)]) => ({ owner: `screen:${id}`, authority: 'scoped', unit: 'known',
  targets: targets.map((file) => ({ path: file, change: 'M' })) });
const noGrant = (result) => {
  assert.equal(result.permission_evaluated, false); assert.equal(result.approval_verified, false);
  assert.equal(result.semantic_coverage_verified, false);
  assert.ok(result.required_checks.some((item) => item.includes('before/after')));
};
const requestOf = (result, owner) => result.requests.find((entry) => entry.owner === owner);

test('D compose: a surface request needs its own checks and every host consent, then is only a preflight candidate', (t) => {
  const f = fixture(t), out = f.run([surface()]);
  assert.equal(out.ready, true, JSON.stringify(out.denials));
  const selected = requestOf(out, SURFACE);
  assert.equal(selected.owner_satisfied, true); assert.equal(selected.hosts_satisfied, true);
  assert.deepEqual(selected.path_authorizations, [{ path: PANEL, change: 'M', reasons: [], allowed: true }]);
  assert.deepEqual(selected.host_result.hosts.map((host) => host.owner), MEMBERS.map((id) => `screen:${id}`));
  assert.deepEqual(out.origin_inputs, []); assert.deepEqual(out.shared_targets, []); noGrant(out);
});

test('D compose: independent screen and surface requests are each evaluated with their own owner checks', (t) => {
  const f = fixture(t), out = f.run([screen('RESULT-001'), surface()]);
  assert.equal(out.ready, true, JSON.stringify(out.denials));
  assert.deepEqual(out.requests.map((entry) => [entry.owner, entry.unit, entry.ready]),
    [['screen:RESULT-001', 'known', true], [SURFACE, 'panel', true]]);
  assert.equal(requestOf(out, 'screen:RESULT-001').host_result, null);
});

test('D compose: a shared target needs every responsibility; a surface allow never cancels a screen delegation deny', (t) => {
  const f = fixture(t), out = f.run([screen('RESULT-001', [PANEL]), surface()]);
  assert.equal(out.ready, false);
  // The screen does not own the surface path, so its own check denies it.
  const own = requestOf(out, 'screen:RESULT-001').path_authorizations[0];
  assert.equal(own.allowed, false);
  assert.deepEqual(own.reasons.map((entry) => entry.code), ['outside-owned-role-intersection']);
  const joint = requestOf(out, SURFACE).path_authorizations[0];
  assert.equal(joint.allowed, false);
  assert.deepEqual(joint.reasons.map((entry) => entry.code), ['shared-target-responsibility-denied']);
  // Responsibilities are a canonical set (normalized JSON byte order), not request order.
  assert.deepEqual(out.shared_targets, [{ path: PANEL, allowed: false, responsibilities: [
    { owner: 'screen:RESULT-001', unit: 'known', change: 'M', allowed: false },
    { owner: SURFACE, unit: 'panel', change: 'M', allowed: true }] }]);
  noGrant(out);
});

test('D compose: a host prerequisite deny blocks every target of the surface request', (t) => {
  const f = fixture(t); f.edit('rules-2.md', ({ fm }) => { fm.status = 'draft'; }); f.put(`${SHARED}/Other.tsx`, 'export default null;\n');
  const out = f.run([surface([PANEL, `${SHARED}/Other.tsx`])]), selected = requestOf(out, SURFACE);
  assert.equal(out.ready, false); assert.equal(selected.hosts_satisfied, false); assert.equal(selected.owner_satisfied, true);
  assert.ok(selected.prerequisite_denials.some((entry) => entry.code === 'confirmed-behavior-contract-required' &&
    entry.host === 'screen:RESULT-002' && entry.prerequisite === 'host-profile'));
  assert.ok(selected.path_authorizations.every((entry) => entry.allowed === false && entry.reasons.length === 0));
});

test('D compose: a legacy-current host base deny stays with its target', (t) => {
  const f = fixture(t); f.legacy();
  assert.equal(f.run([surface()]).ready, true);
  f.edit('screen-2.md', (doc) => { doc.body = ''; });
  const out = f.run([surface([PANEL, `${PREFIX}/components/other/Other.tsx`])]), selected = requestOf(out, SURFACE);
  assert.equal(out.ready, false);
  const panel = selected.path_authorizations.find((entry) => entry.path === PANEL);
  assert.deepEqual(panel.reasons.map((entry) => [entry.code, entry.host]), [['legacy-member-base-denied', 'screen:RESULT-002']]);
});

test('D compose: current authority, duplicate selectors and non A/M scoped changes are not composed', (t) => {
  const f = fixture(t);
  assert.throws(() => f.run([{ owner: 'screen:RESULT-001', authority: 'current', requested_mode: 'rough-fixture-ui',
    targets: [{ path: ENTRY('RESULT-001'), change: 'M' }] }]), /current requests are evaluated by current work/);
  assert.throws(() => f.run([surface(), surface()]), /duplicate/);
  assert.throws(() => f.run([{ ...surface(), targets: [{ path: PANEL, change: 'D' }] }]), /A\/M only/);
  assert.throws(() => f.run([{ ...surface(), allowed: true }]), /unknown field allowed/);
});

test('D compose: caller verdicts, owners and hosts cannot be supplied as options', (t) => {
  const f = fixture(t);
  for (const key of ['owner', 'unit', 'targets', 'approved', 'hosts_satisfied', 'owner_result', 'origin_inputs', 'coverage_reports']) {
    assert.throws(() => f.run([surface()], { [key]: true }), /SW-COMPOSE: unsupported caller option/);
  }
});

test('D compose: authority changed between two requests invalidates the composition', (t) => {
  const f = fixture(t), original = fs.openSync, rules = f.docs.get('rules-1.md'), entry = path.join(f.root, ENTRY('RESULT-002'));
  let changed = false;
  // The second request observes its own target; change a first-request authority then.
  t.mock.method(fs, 'openSync', function(file, ...args) {
    if (!changed && String(file) === entry) { changed = true; fs.appendFileSync(rules, '\nLate edit.'); }
    return original.call(this, file, ...args);
  });
  fs.mkdirSync(path.dirname(entry), { recursive: true }); fs.writeFileSync(entry, 'export default null;\n');
  assert.throws(() => f.run([screen('RESULT-001'), screen('RESULT-002')]), /changed/); assert.equal(changed, true);
});

test('D compose: output is detached from later caller mutation and reevaluates from files', (t) => {
  const f = fixture(t), requests = [surface()], out = f.run(requests);
  out.requests[0].path_authorizations[0].allowed = false; requests[0].targets.push({ path: `${SHARED}/Late.tsx`, change: 'A' });
  const next = f.run([surface()]);
  assert.equal(next.ready, true); assert.deepEqual(requestOf(next, SURFACE).targets, [{ path: PANEL, change: 'M' }]);
});
