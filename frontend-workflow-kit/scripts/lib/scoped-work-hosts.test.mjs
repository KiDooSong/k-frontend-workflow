import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter, DEFAULTS } from './util.mjs';
import { buildState } from '../workflow-state.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { loadInputArtifact } from './input-artifact.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { COMPONENT_MAPPING_COLUMNS, MAPPING_PROVENANCE_COLUMNS } from './mapping-provenance.mjs';
import { inspectScopedSurfaceHosts } from './scoped-work-hosts.mjs';

const SURFACE = 'surface:RESULT-PANEL', MEMBERS = ['RESULT-001', 'RESULT-002'];
const DOCS = 'docs/frontend-workflow', PREFIX = 'src/features/result', SHARED = `${PREFIX}/components/panel`;
const TARGET = `${SHARED}/Panel.tsx`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
// The canonical legacy surface contract, so the generated legacy state has no
// structural surface errors unless a test introduces one.
const SURFACE_BODY = ['# Shared result panel', '## Purpose\nUniform result panel.',
  `## Host Contract\n${table(['Direction', 'Name', 'Meaning', 'Required'], [['input', 'result', 'Current result', 'no'], ['output', 'onRetry', 'Retry intent', 'yes']])}`,
  `## State Matrix\n${table(['State', 'Condition', 'UI'], ['loading', 'empty', 'error', 'success', 'disabled', 'refreshing'].map((state) => [state, state, state]))}`,
  `## Interaction Matrix\n${table(['User Action', 'Trigger', 'Result', 'Result Type', 'Target', 'Params', 'Analytics Event'], [['Retry', 'press', 'retry', 'state', 'result', '-', '-']])}`,
  '## Mutation Matrix\n없음', '## Data Requirements\n- none', '## API Candidates\n없음',
  `## Copy Keys\n${table(['Key', '문구', 'Status'], [['panel.retry', 'Retry', 'draft']])}`,
  '## Accessibility\n- labelled retry', '## Acceptance Criteria\n- [ ] same retry intent',
  `## Unknowns\n${table(['ID', 'Question', 'Status'], [])}`].join('\n\n');

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-hosts-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, DOCS), kitRoot = path.join(root, '.kit'), docs = new Map(), inputs = [];
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
  // The real mode ladder is needed by the legacy member base; the scoped section is additive.
  const policyText = fs.readFileSync(DEFAULTS.policy, 'utf8');
  const policyFile = path.join(kitRoot, 'policy.yaml');
  const writePolicy = () => put('.kit/policy.yaml', `${policyText}\nwork_execution: ${JSON.stringify(work)}\n`);
  writePolicy();
  const layoutFile = put('.kit/layout.yaml', JSON.stringify({ roles: { route_entry: 'src/app/**',
    screen: 'src/features/{domain}/screens/**', domain_component: 'src/features/{domain}/components/**',
    hook: 'src/features/{domain}/hooks/**', api_client: 'src/api/**', test: 'src/features/{domain}/tests/**' } }));
  const manifestFile = put('.kit/manifest.yaml', JSON.stringify({ version: 1, artifacts: {} }));
  // Legacy modes are cumulative: navigation-map and catalog facts let an authored
  // draft member reach rough-fixture-ui, whose base covers domain components.
  put(`${DOCS}/app/navigation-map.md`, '---\nstatus: draft\n---\n\n# Navigation Map\n');
  put(`${DOCS}/design/component-catalog.md`, '# Component Catalog\n');
  for (const number of [0, 1, 2]) write(`rules-${number}.md`, `domains/result/rules/rules-${number}.md`, { artifact_id: `RULES-${number}`,
    artifact_type: 'domain-rules', domain: 'result', status: 'confirmed', approved_by: 'synthetic-test-owner', approved_at: '2026-09-23',
    decision_id: `fixture-rules-${number}` }, `## Rules\nKnown local behavior ${number}, without network calls.\n\n## Other\nUnselected text.`);
  MEMBERS.forEach((id, index) => write(`screen-${index + 1}.md`, `domains/result/screens/${id.toLowerCase()}/screen-spec.md`, {
    artifact_id: `HOST-${index + 1}`, artifact_type: 'screen-spec', screen_id: id, domain: 'result', route: `/${id.toLowerCase()}`,
    status: 'draft', api_required: false, screen_entry: `${PREFIX}/screens/${id}.tsx`,
    work_execution: { version: 1, units: [{ id: 'known', kind: 'behavior', contracts: [`artifact:RULES-${index + 1}#rules`], sources: [] }] },
  }, '## Notes\nExisting host, no fabricated final mapping or readiness mode.'));
  write('surface.md', 'domains/result/surfaces/result-panel/surface-spec.md', { artifact_id: 'SURFACE', artifact_type: 'shared-surface-spec',
    surface_id: 'RESULT-PANEL', domain: 'result', status: 'draft', api_required: false, member_screens: [...MEMBERS],
    implementation_paths: [`${SHARED}/**`],
    work_execution: { version: 1, units: [{ id: 'panel', kind: 'behavior', contracts: ['artifact:RULES-0#rules'], sources: [],
      host_units: Object.fromEntries(MEMBERS.map((id) => [id, 'known'])) }] },
  }, SURFACE_BODY);
  const registerFile = path.join(docsDir, '_meta/reconciliation-register.md');
  // The committed legacy state is generated from the same documents.
  function writeState() {
    const layout = loadLayoutProfile({ kitRoot: root, flags: { layout: layoutFile } });
    put(`${DOCS}/_meta/workflow-state.yaml`, JSON.stringify(buildState({ docsDir, srcDir: path.join(root, 'src'),
      date: '2026-09-23', layout, projectRoot: root }).state));
  }
  const options = (targets = [{ path: TARGET, change: 'M' }]) => ({ owner: SURFACE, unit: 'panel', projectRoot: root, docsDir, kitRoot,
    policyFile, layoutFile, manifestFile, registerFile, inputArtifacts: inputs.map(loadInputArtifact), origin_inputs: [], coverage_reports: [],
    targets, targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) => ({ file,
      fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }),
  });
  function legacy(number = 2) {
    edit(`screen-${number}.md`, ({ fm }) => { delete fm.work_execution; });
    work.owners = work.owners.filter((owner) => owner !== `screen:${MEMBERS[number - 1]}`); writePolicy();
    edit('surface.md', ({ fm }) => { fm.work_execution.units[0].host_units[MEMBERS[number - 1]] = 'legacy-current'; });
  }
  // A frontmatter-only ScreenSpec is a stub, so its legacy mode cannot edit domain components.
  function stub(number = 2) { edit(`screen-${number}.md`, (doc) => { doc.body = ''; }); }
  function openDecision(number = 2) {
    edit(`screen-${number}.md`, ({ fm }) => { fm.decision_refs = ['D-HOST']; });
    write('open-decisions.md', 'global/open-decisions.md', { artifact_id: 'open-decision-register', artifact_type: 'open-decision-register', status: 'draft' },
      `## Open Decisions\n${table(['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'],
        [['D-HOST', 'Choose the host behavior.', 'A / B', 'api-integrated-ui', 'PM', 'open']])}`);
  }
  function visual() {
    const summaries = [], effects = [], selectors = {};
    MEMBERS.forEach((id, index) => {
      const number = index + 1, input = `IN-20260923-figma-00${number}`, mapping = `MAP-${number}`;
      const anchor = `input:${input}#extracted-facts/01`;
      // The section selection is independently broad. Surface binding below
      // selects exactly M-001; M-002 is a different host-local component.
      edit(`screen-${number}.md`, ({ fm }) => {
        if (fm.work_execution) fm.work_execution.units[0] = { id: 'known', kind: 'visual', contracts: [`artifact:${mapping}#component-mapping`], sources: [] };
      });
      write(`mapping-${number}.md`, `domains/result/mappings/mapping-${number}.md`, { artifact_id: mapping, artifact_type: 'figma-component-mapping',
        screen_id: id, domain: 'result', status: 'draft', provenance_contract: 1 },
      `## Component Mapping\n${table(COMPONENT_MAPPING_COLUMNS, [
        ['`M-001` · shared panel', 'Panel', `${SHARED}/Panel${number}.tsx`, 'Selected shared component'],
        ['`M-002` · local details', 'Local', `${PREFIX}/components/private-${number}/Local.tsx`, 'Unselected by surface'],
      ])}\n\n## Mapping Provenance\n${table(MAPPING_PROVENANCE_COLUMNS, [
        ['M-001', 'inherit', 'node', 'inherit', anchor], ['M-002', 'inherit', 'node', 'inherit', anchor.replace('/01', '/02')],
      ])}`);
      inputs.push(put(`${DOCS}/inputs/input-${number}.md`, md({ input_id: input, input_type: 'figma', source_type: 'figma',
        source_ref: `figma://file/host-fixture-${number}/node/${number}:1`, captured_at: '2026-09-23T00:00:00Z',
        captured_by: 'test', status: 'captured', affected_domains: ['result'], affected_screens: [id] },
      '## Extracted Facts\n- Shared panel from this host.\n- Separate host-local detail.')));
      summaries.push([input, 'figma', 'simple-update×2', 'reconciled', 'accepted', `artifact:${mapping}`, '-', '-']);
      for (const [item, key] of [['01', 'M-001'], ['02', 'M-002']]) effects.push([input, item, 'visual-evidence', 'simple-update', 'update',
        `artifact:${mapping}#component-mapping/${key}`, anchor.replace('/01', `/${item}`), 'inherit', 'node', 'inherit']);
      selectors[id] = { mapping_ref: `artifact:${mapping}#component-mapping`, m_keys: ['M-001'] };
      put(`${SHARED}/Panel${number}.tsx`, `export const Panel${number} = () => null;\n`);
    });
    edit('surface.md', ({ fm }) => { fm.work_execution.units[0].kind = 'visual'; fm.work_execution.units[0].host_visual_evidence = selectors; });
    put(`${DOCS}/_meta/reconciliation-register.md`, md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' },
      `${table(REQUIRED_REGISTER_COLS, summaries)}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS, effects)}`));
  }
  function run(extra = {}, { state = true, targets } = {}) {
    if (state) writeState();
    return inspectScopedSurfaceHosts({ ...options(targets), ...extra });
  }
  return { root, docs, inputs, put, write, edit, options, policyFile, registerFile, work, writePolicy, writeState,
    visual, legacy, stub, openDecision, run };
}
const noGrant = (result) => {
  assert.equal(result.permission_evaluated, false); assert.equal(result.approval_verified, false);
  assert.equal(result.semantic_coverage_verified, false);
  for (const name of ['ready', 'allowed', 'allowed_paths', 'owner_satisfied']) assert.equal(Object.hasOwn(result, name), false);
};
const denied = (result, code, host = 'screen:RESULT-002') => {
  assert.equal(result.hosts_satisfied, false);
  const entry = result.denials.find((item) => item.code === code && item.host === host);
  assert.ok(entry, JSON.stringify(result.denials));
  // Every denial is attributed to the evaluated surface/unit and names its host.
  assert.equal(entry.owner, SURFACE); assert.equal(entry.unit, 'panel');
  return entry;
};
const hostOf = (result, owner) => result.hosts.find((entry) => entry.owner === owner);

test('D hosts: both actual scoped host profiles, Decisions and role-ceiling consents are required, without a surface permit', (t) => {
  const f = fixture(t); f.writeState();
  const before = [...f.docs.values()].map((file) => fs.readFileSync(file)), out = f.run({}, { state: false });
  assert.equal(out.hosts_satisfied, true, JSON.stringify(out.denials)); assert.equal(out.hosts.length, 2);
  assert.deepEqual(out.hosts.map((entry) => entry.owner).sort(), MEMBERS.map((id) => `screen:${id}`));
  assert.ok(out.hosts.every((entry) => entry.profile.profile_satisfied && entry.decision_scopes.unit_checks.some((check) => check.decisions_clear)));
  for (const host of out.hosts) assert.deepEqual(host.consent, [{ path: TARGET, basis: 'member-role-ceiling', allowed: true,
    roles: [{ role: 'domain_component', enabled: true }] }]);
  assert.deepEqual(out.targets, [{ path: TARGET, change: 'M' }]); assert.deepEqual(out.legacy_hosts, []);
  // Adopted-only surfaces do not need or read the generated legacy state.
  assert.equal(out.read_set.some((entry) => entry.file.endsWith('_meta/workflow-state.yaml')), false);
  assert.deepEqual([...f.docs.values()].map((file) => fs.readFileSync(file)), before); noGrant(out);
});

test('D hosts: later host denial is not hidden by the first host success', (t) => {
  const f = fixture(t); f.edit('rules-2.md', ({ fm }) => { fm.status = 'draft'; }); const out = f.run();
  const entry = denied(out, 'confirmed-behavior-contract-required');
  assert.equal(entry.prerequisite, 'host-profile'); assert.equal(entry.host_unit, 'known');
  assert.equal(out.hosts.length, 2); assert.equal(hostOf(out, 'screen:RESULT-001').host_satisfied, true); noGrant(out);
});

test('D hosts: evaluation retains all host denials rather than stopping at the first failure', (t) => {
  const f = fixture(t); for (const number of [1, 2]) f.edit(`rules-${number}.md`, ({ fm }) => { fm.status = 'draft'; });
  const out = f.run(); assert.equal(out.hosts.length, 2); assert.ok(out.hosts.every((entry) => !entry.host_satisfied));
  assert.equal(new Set(out.denials.map((entry) => entry.host)).size, 2);
});

test('D hosts: an unbound open Decision on only the second host remains blocking', (t) => {
  const f = fixture(t); f.openDecision(); const out = f.run();
  assert.deepEqual(denied(out, 'host-decision-blocked').decisions, ['decision:D-HOST@open-decision-register']);
  assert.equal(hostOf(out, 'screen:RESULT-002').profile.profile_satisfied, true);
  noGrant(out);
});

test('D hosts: member and host selector ordering changes no host prerequisite verdict', (t) => {
  const f = fixture(t), before = f.run();
  f.edit('surface.md', ({ fm }) => { fm.member_screens.reverse(); fm.work_execution.units[0].host_units = { 'RESULT-002': 'known', 'RESULT-001': 'known' }; });
  const pick = (result) => result.hosts.map(({ owner, unit, host_satisfied, consent }) => ({ owner, unit, host_satisfied, consent }))
    .sort((a, b) => a.owner.localeCompare(b.owner));
  assert.deepEqual(pick(f.run()), pick(before));
});

test('D hosts: missing, duplicate and nonmember host selections never become a smaller successful set', (t) => {
  for (const [change, pattern] of [
    [({ fm }) => { delete fm.work_execution.units[0].host_units['RESULT-002']; }, /membership and host_units must match/],
    [({ fm }) => { fm.member_screens.push('RESULT-001'); }, /duplicate/],
    [({ fm }) => { fm.work_execution.units[0].host_units['RESULT-999'] = 'known'; }, /membership and host_units must match/],
  ]) { const f = fixture(t); f.edit('surface.md', change); assert.throws(() => f.run({}, { state: false }), pattern); }
});

test('D hosts: foreign domains and mismatched host unit kinds are not coerced or borrowed', (t) => {
  for (const [change, pattern] of [[({ fm }) => { fm.domain = 'foreign'; }, /host domain differs/],
    [({ fm }) => { fm.work_execution.units[0].kind = 'visual'; }, /host unit kind differs/]]) {
    const f = fixture(t); f.edit('screen-2.md', change); assert.throws(() => f.run({}, { state: false }), pattern);
  }
});

test('D hosts: a legacy-current member consents through its actual legacy member base, not a fabricated envelope', (t) => {
  const f = fixture(t); f.legacy(); const out = f.run();
  assert.equal(out.hosts_satisfied, true, JSON.stringify(out.denials)); assert.deepEqual(out.legacy_hosts, ['screen:RESULT-002']);
  const legacy = hostOf(out, 'screen:RESULT-002');
  assert.equal(legacy.adopted, false); assert.equal(legacy.profile, null); assert.equal(legacy.decision_scopes, null);
  assert.deepEqual(legacy.consent, [{ path: TARGET, basis: 'legacy-member-base', member_readiness_mode: 'rough-fixture-ui',
    allowed: true, causes: [] }]);
  assert.equal(hostOf(out, 'screen:RESULT-001').consent[0].basis, 'member-role-ceiling');
  assert.ok(out.read_set.some((entry) => entry.file === `${DOCS}/_meta/workflow-state.yaml`)); noGrant(out);
});

test('W40: a legacy member base deny is retained and no scoped peer or valid mapping opens it', (t) => {
  for (const mode of ['behavior', 'visual']) {
    const f = fixture(t); if (mode === 'visual') f.visual(); f.legacy(); f.stub();
    const targets = mode === 'visual' ? [{ path: `${SHARED}/Panel2.tsx`, change: 'M' }] : undefined;
    const out = f.run({}, { targets }), entry = denied(out, 'legacy-member-base-denied');
    assert.equal(entry.member_readiness_mode, 'screen-skeleton');
    assert.deepEqual(entry.causes.map((cause) => cause.kind), ['member-policy-coverage']);
    assert.equal(hostOf(out, 'screen:RESULT-001').host_satisfied, true);
    if (mode === 'visual') assert.equal(hostOf(out, 'screen:RESULT-002').mapping.rows.length, 1);
    noGrant(out);
  }
});

test('D hosts: a legacy member base covers only declared surface paths', (t) => {
  const f = fixture(t); f.legacy();
  const outside = `${PREFIX}/components/other/Other.tsx`;
  const out = f.run({}, { targets: [{ path: TARGET, change: 'M' }, { path: outside, change: 'A' }] });
  const entry = denied(out, 'legacy-member-base-denied');
  assert.equal(entry.path, outside); assert.equal(entry.reason, 'outside-declared-surface-path');
  // Targets are normalized in path byte order.
  assert.deepEqual(hostOf(out, 'screen:RESULT-002').consent.map((item) => [item.path, item.allowed]), [[outside, false], [TARGET, true]]);
});

test('D hosts: a stale generated legacy state is rejected instead of interpreted', (t) => {
  const f = fixture(t); f.legacy(); f.writeState();
  f.edit('surface.md', ({ fm }) => { fm.implementation_paths.push(`${PREFIX}/components/extra/**`); });
  assert.throws(() => f.run({}, { state: false }), /regenerate workflow:state/);
});

test('D hosts: legacy structural surface errors deny the legacy member base', (t) => {
  // A route edge in a surface Interaction Matrix is a legacy surface contract error.
  const f = fixture(t); f.legacy(); f.edit('surface.md', (doc) => { doc.body = doc.body.replace('| retry | state |', '| retry | route |'); });
  const entry = denied(f.run(), 'legacy-member-base-denied');
  assert.ok(entry.causes.some((cause) => cause.kind === 'surface-contract'), JSON.stringify(entry));
});

test('D hosts: a late legacy state mutation after its base is pinned invalidates composition', (t) => {
  const f = fixture(t); f.legacy(); f.writeState();
  const state = path.join(f.root, DOCS, '_meta/workflow-state.yaml'), original = fs.openSync;
  let pinned = false, changed = false;
  t.mock.method(fs, 'openSync', function(file, ...args) {
    const fd = original.call(this, file, ...args);
    if (String(file) === state) pinned = true;
    else if (pinned && !changed) { changed = true; fs.appendFileSync(state, '\n'); }
    return fd;
  });
  assert.throws(() => f.run({}, { state: false }), /changed/); assert.equal(changed, true);
});

test('D hosts: an adopted host consents only within its member role ceiling', (t) => {
  const f = fixture(t);
  f.work.role_limits.behavior = ['screen', 'hook', 'api_client', 'test']; f.writePolicy();
  const out = f.run();
  for (const host of MEMBERS.map((id) => `screen:${id}`)) {
    const entry = denied(out, 'host-role-ceiling-denied', host);
    assert.equal(entry.path, TARGET); assert.deepEqual(entry.roles, [{ role: 'domain_component', enabled: false }]);
  }
  const unrelated = f.run({}, { targets: [{ path: 'src/other/Outside.tsx', change: 'A' }] });
  assert.deepEqual(denied(unrelated, 'host-role-ceiling-denied').roles, []);
});

test('D hosts: nonconcrete or missing targets are rejected before any host is evaluated', (t) => {
  const f = fixture(t); f.writeState();
  for (const targets of [[], [{ path: `${SHARED}/**`, change: 'M' }], [{ path: '../outside.tsx', change: 'M' }], [{ path: TARGET }]]) {
    assert.throws(() => f.run({}, { state: false, targets }));
  }
  assert.throws(() => inspectScopedSurfaceHosts({ ...f.options(), targets: undefined }));
});

test('D hosts: caller host lists, approvals, legacy envelopes and callbacks cannot substitute canonical inputs', (t) => {
  const f = fixture(t); f.writeState();
  for (const key of ['host_units', 'host_results', 'approved', 'approval_verifier', 'legacy_base', 'state', 'layout', 'evaluator', 'hosts_satisfied', 'consent']) {
    assert.throws(() => f.run({ [key]: true }, { state: false }), /SW-HOST: unsupported caller option/);
  }
  assert.throws(() => f.run({ owner: 'screen:RESULT-001', unit: 'known' }, { state: false }), /only an exact surface/);
});

test('D hosts: satisfied host checks alone do not evaluate the surface own contract or concrete targets', (t) => {
  const f = fixture(t); f.edit('rules-0.md', ({ fm }) => { fm.status = 'draft'; });
  const out = f.run(); assert.equal(out.hosts_satisfied, true); noGrant(out);
  assert.ok(out.required_checks.some((item) => item.includes('Surface own profile')));
  assert.equal(out.required_reviews.some((item) => item.includes('Figma node IDs')), false);
});

test('D hosts visual: two native mappings retain distinct Figma nodes and only selected surface component paths', (t) => {
  const f = fixture(t); f.visual(); const out = f.run({}, { targets: [{ path: `${SHARED}/Panel1.tsx`, change: 'M' }] });
  assert.equal(out.hosts_satisfied, true, JSON.stringify(out.denials));
  assert.equal(out.hosts.length, 2); assert.ok(out.hosts.every((entry) => entry.mapping.rows.length === 1));
  assert.equal(new Set(out.hosts.map((entry) => entry.mapping.rows[0].effective_source_ref)).size, 2);
  assert.deepEqual(out.component_read_set.map((entry) => entry.path).sort(), [`${SHARED}/Panel1.tsx`, `${SHARED}/Panel2.tsx`]);
  assert.ok(out.component_read_set.every((entry) => entry.exists));
  assert.ok(out.required_reviews.some((item) => item.includes('Figma node IDs'))); noGrant(out);
});

test('D hosts visual: selected mapping cannot borrow another host identity', (t) => {
  const f = fixture(t); f.visual(); f.edit('mapping-2.md', ({ fm }) => { fm.screen_id = 'RESULT-001'; });
  assert.throws(() => f.run(), /mapping belongs to a different host/);
});

test('D hosts visual: a host-private or prefix-lookalike component cannot impersonate surface ownership', (t) => {
  for (const replacement of [`${PREFIX}/components/private-2/Panel.tsx`, `${SHARED}-other/Panel.tsx`]) {
    const f = fixture(t); f.visual(); f.edit('mapping-2.md', (doc) => { doc.body = doc.body.replace(`${SHARED}/Panel2.tsx`, replacement); });
    assert.equal(denied(f.run(), 'host-component-not-surface-owned').path, replacement);
  }
});

test('D hosts visual: one inline-code-wrapped exact path works but mixed labels/lists are reported as unresolved evidence', (t) => {
  const f = fixture(t); f.visual(); f.edit('mapping-2.md', (doc) => { doc.body = doc.body.replace(`${SHARED}/Panel2.tsx`, `\`${SHARED}/Panel2.tsx\``); });
  assert.equal(f.run().hosts_satisfied, true);
  f.edit('mapping-2.md', (doc) => { doc.body = doc.body.replace(`\`${SHARED}/Panel2.tsx\``, `${SHARED}/Panel2.tsx, src/private/Other.tsx`); });
  // B §8.2.1-4: an unresolved selected component is surface visual evidence that cannot be used.
  assert.equal(denied(f.run(), 'surface-visual-evidence-unresolved').m_key, 'M-001');
});

test('D hosts visual: selected symlinked components are rejected, without resolving a different physical owner', (t) => {
  const f = fixture(t); f.visual(); const file = path.join(f.root, `${SHARED}/Panel2.tsx`);
  fs.unlinkSync(file); fs.symlinkSync(f.put('private/outside.tsx', 'export const other = 1;'), file);
  assert.throws(() => f.run(), /symlink\/junction segment is forbidden/);
});

test('D hosts visual: partial coverage cannot be borrowed from the successful peer', (t) => {
  const f = fixture(t); f.visual();
  const raw = fs.readFileSync(f.registerFile, 'utf8');
  fs.writeFileSync(f.registerFile, raw.replace('reconciled | accepted', 'partially-reconciled | pending'));
  const out = f.run(); assert.equal(out.hosts_satisfied, false);
  const entry = denied(out, 'source-coverage-unready', 'screen:RESULT-001');
  assert.equal(entry.prerequisite, 'host-profile'); assert.equal(entry.input_id, 'IN-20260923-figma-001');
  noGrant(out);
});

for (const changedKind of ['authority', 'component']) test(`D hosts visual: a late earlier-host ${changedKind} mutation invalidates composition`, (t) => {
  const f = fixture(t); f.visual(); f.writeState();
  const trigger = path.join(f.root, `${SHARED}/Panel2.tsx`), original = fs.openSync;
  let changed = false;
  t.mock.method(fs, 'openSync', function(file, ...args) {
    const fd = original.call(this, file, ...args);
    if (!changed && String(file) === trigger) {
      changed = true;
      fs.appendFileSync(changedKind === 'authority' ? f.docs.get('mapping-1.md') : path.join(f.root, `${SHARED}/Panel1.tsx`), '\n// changed late');
    }
    return fd;
  });
  assert.throws(() => f.run({}, { state: false }), /snapshot changed|changed between hosts/); assert.equal(changed, true);
});

test('D hosts: caller mutations of one observation cannot change subsequent native evaluations', (t) => {
  const f = fixture(t); f.writeState();
  const args = f.options(), input = JSON.stringify(args.origin_inputs), out = inspectScopedSurfaceHosts(args);
  out.hosts.length = 0; out.read_set.length = 0; args.targets.push({ path: `${SHARED}/Late.tsx`, change: 'A' });
  const next = f.run({}, { state: false }); assert.equal(next.hosts_satisfied, true); assert.equal(next.hosts.length, 2);
  assert.deepEqual(next.targets, [{ path: TARGET, change: 'M' }]);
  assert.equal(JSON.stringify(args.origin_inputs), input); noGrant(next);
});

test('W38: a deprecated host mapping is denied for adopted and legacy hosts alike', (t) => {
  for (const legacyHost of [false, true]) {
    const f = fixture(t); f.visual(); if (legacyHost) f.legacy();
    f.edit('mapping-2.md', ({ fm }) => { fm.status = 'deprecated'; });
    const out = f.run({}, { targets: [{ path: `${SHARED}/Panel1.tsx`, change: 'M' }] });
    denied(out, 'host-mapping-deprecated');
    // The adopted host's own profile reports it too; the legacy host has no profile to borrow.
    assert.equal(out.denials.some((entry) => entry.code === 'visual-mapping-deprecated' && entry.host === 'screen:RESULT-002'), !legacyHost);
    assert.equal(hostOf(out, 'screen:RESULT-001').host_satisfied, true);
  }
});

test('W39: an open visual Conflict on one host holds the surface until that host resolves it', (t) => {
  const f = fixture(t); f.visual();
  const targets = [{ path: `${SHARED}/Panel1.tsx`, change: 'M' }];
  const conflict = (status) => f.edit('screen-2.md', (doc) => {
    doc.body = `## Notes\nExisting host.\n\n## Conflicts\n${table(['ID', 'Description', 'Status'],
      [['C-PANEL', 'Panel spacing differs from the RESULT-001 frame; see artifact:MAP-2#component-mapping', status]])}`;
  });
  conflict('open');
  const held = f.run({}, { targets });
  denied(held, 'unit-uncertainty-unresolved');
  assert.equal(hostOf(held, 'screen:RESULT-001').host_satisfied, true);
  conflict('resolved');
  const released = f.run({}, { targets });
  assert.equal(released.hosts_satisfied, true, JSON.stringify(released.denials)); noGrant(released);
});
