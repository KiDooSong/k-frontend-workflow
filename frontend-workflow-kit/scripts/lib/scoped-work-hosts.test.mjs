import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { loadInputArtifact } from './input-artifact.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { COMPONENT_MAPPING_COLUMNS, MAPPING_PROVENANCE_COLUMNS } from './mapping-provenance.mjs';
import { inspectScopedSurfaceHosts } from './scoped-work-hosts.mjs';

const SURFACE = 'surface:RESULT-PANEL', MEMBERS = ['RESULT-001', 'RESULT-002'];
const PREFIX = 'src/features/result', SHARED = `${PREFIX}/components/panel`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-hosts-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs'), kitRoot = path.join(root, '.kit'), docs = new Map(), inputs = [];
  function put(name, value) {
    const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value); return file;
  }
  function write(name, fm, body) { const file = put(`docs/${name}`, md(fm, body)); docs.set(name, file); return file; }
  function edit(name, update) {
    const file = docs.get(name), before = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const next = { fm: before.data, body: before.body }; update(next); fs.writeFileSync(file, md(next.fm, next.body));
  }
  const policyFile = put('.kit/policy.yaml', JSON.stringify({ work_execution: { version: 1,
    owners: [SURFACE, ...MEMBERS.map((id) => `screen:${id}`)], profiles: ['visual', 'api-contract', 'behavior'],
    role_limits: { visual: ['screen', 'domain_component', 'hook', 'test'], 'api-contract': ['api_client', 'test'],
      behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } }));
  const layoutFile = put('.kit/layout.yaml', JSON.stringify({ roles: {
    screen: ['src/features/{domain}/screens/**'], domain_component: ['src/features/{domain}/components/**'],
    hook: ['src/features/{domain}/hooks/**'], api_client: ['src/api/**'],
    test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'],
  } }));
  const manifestFile = put('.kit/manifest.yaml', JSON.stringify({ version: 1, artifacts: {} }));
  for (const number of [0, 1, 2]) write(`rules-${number}.md`, { artifact_id: `RULES-${number}`, artifact_type: 'domain-rules',
    domain: 'result', status: 'confirmed', approved_by: 'synthetic-test-owner', approved_at: '2026-09-23',
    decision_id: `fixture-rules-${number}` }, `## Rules\nKnown local behavior ${number}, without network calls.\n\n## Other\nUnselected text.`);
  MEMBERS.forEach((id, index) => write(`screen-${index + 1}.md`, { artifact_id: `HOST-${index + 1}`, artifact_type: 'screen-spec',
    screen_id: id, domain: 'result', status: 'draft', api_required: false, screen_entry: `${PREFIX}/screens/${id}.tsx`,
    work_execution: { version: 1, units: [{ id: 'known', kind: 'behavior', contracts: [`artifact:RULES-${index + 1}#rules`], sources: [] }] },
  }, '## Notes\nExisting host, no fabricated final mapping or readiness mode.'));
  write('surface.md', { artifact_id: 'SURFACE', artifact_type: 'shared-surface-spec', surface_id: 'RESULT-PANEL',
    domain: 'result', status: 'draft', api_required: false, member_screens: [...MEMBERS], implementation_paths: [`${SHARED}/**`],
    work_execution: { version: 1, units: [{ id: 'panel', kind: 'behavior', contracts: ['artifact:RULES-0#rules'], sources: [],
      host_units: Object.fromEntries(MEMBERS.map((id) => [id, 'known'])) }] },
  }, '## Notes\nShared implementation with two independently responsible hosts.');
  const registerFile = path.join(docsDir, 'register.md');
  const options = () => ({ owner: SURFACE, unit: 'panel', projectRoot: root, docsDir, kitRoot, policyFile, layoutFile, manifestFile, registerFile,
    inputArtifacts: inputs.map(loadInputArtifact), origin_inputs: [], coverage_reports: [],
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) => ({ file,
      fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }),
  });
  function legacy(number = 2) {
    edit(`screen-${number}.md`, ({ fm }) => { delete fm.work_execution; });
    const policy = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
    policy.work_execution.owners = policy.work_execution.owners.filter((owner) => owner !== `screen:${MEMBERS[number - 1]}`);
    fs.writeFileSync(policyFile, JSON.stringify(policy));
    edit('surface.md', ({ fm }) => { fm.work_execution.units[0].host_units[MEMBERS[number - 1]] = 'legacy-current'; });
  }
  function openDecision(number = 2) {
    edit(`screen-${number}.md`, ({ fm }) => { fm.decision_refs = ['D-HOST']; });
    write('global/open-decisions.md', { artifact_id: 'open-decision-register', artifact_type: 'open-decision-register', status: 'draft' },
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
      edit(`screen-${number}.md`, ({ fm }) => { fm.work_execution.units[0] = {
        id: 'known', kind: 'visual', contracts: [`artifact:${mapping}#component-mapping`], sources: [],
      }; });
      write(`mapping-${number}.md`, { artifact_id: mapping, artifact_type: 'figma-component-mapping', screen_id: id,
        domain: 'result', status: 'draft', provenance_contract: 1 },
      `## Component Mapping\n${table(COMPONENT_MAPPING_COLUMNS, [
        ['`M-001` · shared panel', 'Panel', `${SHARED}/Panel${number}.tsx`, 'Selected shared component'],
        ['`M-002` · local details', 'Local', `${PREFIX}/components/private-${number}/Local.tsx`, 'Unselected by surface'],
      ])}\n\n## Mapping Provenance\n${table(MAPPING_PROVENANCE_COLUMNS, [
        ['M-001', 'inherit', 'node', 'inherit', anchor], ['M-002', 'inherit', 'node', 'inherit', anchor.replace('/01', '/02')],
      ])}`);
      inputs.push(put(`docs/input-${number}.md`, md({ input_id: input, input_type: 'figma', source_type: 'figma',
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
    put('docs/register.md', md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' },
      `${table(REQUIRED_REGISTER_COLS, summaries)}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS, effects)}`));
  }
  return { root, docs, inputs, put, write, edit, options, policyFile, registerFile, visual, legacy, openDecision,
    run: (extra = {}) => inspectScopedSurfaceHosts({ ...options(), ...extra }) };
}
const noGrant = (result) => {
  assert.equal(result.permission_evaluated, false); assert.equal(result.approval_verified, false);
  assert.equal(result.semantic_coverage_verified, false);
  for (const name of ['ready', 'allowed', 'allowed_paths', 'owner_satisfied']) assert.equal(Object.hasOwn(result, name), false);
};
const denied = (result, code, host = 'screen:RESULT-002') => {
  assert.equal(result.hosts_satisfied, false);
  assert.ok(result.denials.some((entry) => entry.code === code && entry.host === host), JSON.stringify(result.denials));
};

test('D hosts: both actual scoped host profiles and Decisions are required, without a surface permit', (t) => {
  const f = fixture(t), before = [...f.docs.values()].map((file) => fs.readFileSync(file)), out = f.run();
  assert.equal(out.hosts_satisfied, true, JSON.stringify(out.denials)); assert.equal(out.hosts.length, 2);
  assert.deepEqual(out.hosts.map((entry) => entry.owner).sort(), MEMBERS.map((id) => `screen:${id}`));
  assert.ok(out.hosts.every((entry) => entry.profile.profile_satisfied && entry.decision_scopes.unit_checks.some((check) => check.decisions_clear)));
  assert.deepEqual([...f.docs.values()].map((file) => fs.readFileSync(file)), before); noGrant(out);
});

test('D hosts: later host denial is not hidden by the first host success', (t) => {
  const f = fixture(t); f.edit('rules-2.md', ({ fm }) => { fm.status = 'draft'; }); const out = f.run();
  denied(out, 'confirmed-behavior-contract-required'); assert.equal(out.hosts.length, 2);
  assert.equal(out.hosts.find((entry) => entry.owner === 'screen:RESULT-001').host_satisfied, true); noGrant(out);
});

test('D hosts: evaluation retains all host denials rather than stopping at the first failure', (t) => {
  const f = fixture(t); for (const number of [1, 2]) f.edit(`rules-${number}.md`, ({ fm }) => { fm.status = 'draft'; });
  const out = f.run(); assert.equal(out.hosts.length, 2); assert.ok(out.hosts.every((entry) => !entry.host_satisfied));
  assert.equal(new Set(out.denials.map((entry) => entry.host)).size, 2);
});

test('D hosts: an unbound open Decision on only the second host remains blocking', (t) => {
  const f = fixture(t); f.openDecision(); const out = f.run(); denied(out, 'host-decision-blocked');
  assert.equal(out.hosts.find((entry) => entry.owner === 'screen:RESULT-002').profile.profile_satisfied, true);
  noGrant(out);
});

test('D hosts: member and host selector ordering changes no host prerequisite verdict', (t) => {
  const f = fixture(t), before = f.run();
  f.edit('surface.md', ({ fm }) => { fm.member_screens.reverse(); fm.work_execution.units[0].host_units = { 'RESULT-002': 'known', 'RESULT-001': 'known' }; });
  const pick = (result) => result.hosts.map(({ owner, unit, host_satisfied }) => ({ owner, unit, host_satisfied })).sort((a, b) => a.owner.localeCompare(b.owner));
  assert.deepEqual(pick(f.run()), pick(before));
});

test('D hosts: missing, duplicate and nonmember host selections never become a smaller successful set', (t) => {
  for (const change of [
    ({ fm }) => { delete fm.work_execution.units[0].host_units['RESULT-002']; },
    ({ fm }) => { fm.member_screens.push('RESULT-001'); },
    ({ fm }) => { fm.work_execution.units[0].host_units['RESULT-999'] = 'known'; },
  ]) { const f = fixture(t); f.edit('surface.md', change); assert.throws(() => f.run()); }
});

test('D hosts: foreign domains and mismatched host unit kinds are not coerced or borrowed', (t) => {
  for (const change of [({ fm }) => { fm.domain = 'foreign'; }, ({ fm }) => { fm.work_execution.units[0].kind = 'visual'; }]) {
    const f = fixture(t); f.edit('screen-2.md', change); assert.throws(() => f.run());
  }
});

test('D hosts: a legacy-current member stays explicitly unresolved, never a fabricated successful base', (t) => {
  const f = fixture(t); f.legacy(); const out = f.run(); denied(out, 'legacy-member-base-required');
  assert.deepEqual(out.requires_legacy_base, ['screen:RESULT-002']);
  const legacy = out.hosts.find((entry) => !entry.adopted);
  assert.equal(legacy.profile, null); assert.equal(legacy.decision_scopes, null); noGrant(out);
});

test('D hosts: caller host lists, approvals, legacy envelopes and callbacks cannot substitute canonical inputs', (t) => {
  const f = fixture(t);
  for (const key of ['host_units', 'host_results', 'approved', 'approval_verifier', 'legacy_base', 'state', 'layout', 'evaluator', 'hosts_satisfied']) {
    assert.throws(() => f.run({ [key]: true }), /SW-HOST: unsupported caller option/);
  }
  assert.throws(() => f.run({ owner: 'screen:RESULT-001', unit: 'known' }), /only an exact surface/);
});

test('D hosts: satisfied host checks alone do not evaluate the surface own contract or concrete targets', (t) => {
  const f = fixture(t); f.edit('rules-0.md', ({ fm }) => { fm.status = 'draft'; });
  const out = f.run(); assert.equal(out.hosts_satisfied, true); noGrant(out);
  assert.ok(out.required_checks.some((item) => item.includes('Surface own profile')));
});

test('D hosts visual: two native mappings retain distinct Figma nodes and only selected surface component paths', (t) => {
  const f = fixture(t); f.visual(); const out = f.run();
  assert.equal(out.hosts_satisfied, true, JSON.stringify(out.denials));
  assert.equal(out.hosts.length, 2); assert.ok(out.hosts.every((entry) => entry.mapping.rows.length === 1));
  assert.equal(new Set(out.hosts.map((entry) => entry.mapping.rows[0].effective_source_ref)).size, 2);
  assert.deepEqual(out.component_read_set.map((entry) => entry.path).sort(), [`${SHARED}/Panel1.tsx`, `${SHARED}/Panel2.tsx`]);
  assert.ok(out.component_read_set.every((entry) => entry.exists)); noGrant(out);
});

test('D hosts visual: selected mapping cannot borrow another host identity', (t) => {
  const f = fixture(t); f.visual(); f.edit('mapping-2.md', ({ fm }) => { fm.screen_id = 'RESULT-001'; });
  assert.throws(() => f.run());
});

test('D hosts visual: a host-private or prefix-lookalike component cannot impersonate surface ownership', (t) => {
  for (const replacement of [`${PREFIX}/components/private-2/Panel.tsx`, `${SHARED}-other/Panel.tsx`]) {
    const f = fixture(t); f.visual(); f.edit('mapping-2.md', (doc) => { doc.body = doc.body.replace(`${SHARED}/Panel2.tsx`, replacement); });
    denied(f.run(), 'host-component-not-surface-owned');
  }
});

test('D hosts visual: one inline-code-wrapped exact path works but mixed labels/lists are not guessed', (t) => {
  const f = fixture(t); f.visual(); f.edit('mapping-2.md', (doc) => { doc.body = doc.body.replace(`${SHARED}/Panel2.tsx`, `\`${SHARED}/Panel2.tsx\``); });
  assert.equal(f.run().hosts_satisfied, true);
  f.edit('mapping-2.md', (doc) => { doc.body = doc.body.replace(`\`${SHARED}/Panel2.tsx\``, `${SHARED}/Panel2.tsx, src/private/Other.tsx`); });
  denied(f.run(), 'host-component-path-unresolved');
});

test('D hosts visual: selected symlinked components are rejected, without resolving a different physical owner', (t) => {
  const f = fixture(t); f.visual(); const file = path.join(f.root, `${SHARED}/Panel2.tsx`);
  fs.unlinkSync(file); fs.symlinkSync(f.put('private/outside.tsx', 'export const other = 1;'), file);
  assert.throws(() => f.run());
});

test('D hosts visual: a valid legacy host mapping does not erase the outstanding member-base check', (t) => {
  const f = fixture(t); f.visual(); f.legacy(); const out = f.run(); denied(out, 'legacy-member-base-required');
  assert.equal(out.hosts.find((entry) => !entry.adopted).mapping.rows.length, 1); noGrant(out);
});

test('D hosts visual: partial coverage cannot be borrowed from the successful peer', (t) => {
  const f = fixture(t); f.visual();
  const raw = fs.readFileSync(f.registerFile, 'utf8');
  fs.writeFileSync(f.registerFile, raw.replace('reconciled | accepted', 'partially-reconciled | pending'));
  const out = f.run(); assert.equal(out.hosts_satisfied, false); assert.ok(out.denials.some((entry) => entry.prerequisite === 'host-profile'));
  noGrant(out);
});

for (const changedKind of ['authority', 'component']) test(`D hosts visual: a late earlier-host ${changedKind} mutation invalidates composition`, (t) => {
  const f = fixture(t); f.visual(); const trigger = path.join(f.root, `${SHARED}/Panel2.tsx`), original = fs.openSync;
  let changed = false;
  t.mock.method(fs, 'openSync', function(file, ...args) {
    const fd = original.call(this, file, ...args);
    if (!changed && String(file) === trigger) {
      changed = true;
      fs.appendFileSync(changedKind === 'authority' ? f.docs.get('mapping-1.md') : path.join(f.root, `${SHARED}/Panel1.tsx`), '\n// changed late');
    }
    return fd;
  });
  assert.throws(() => f.run(), /snapshot changed|changed between hosts/); assert.equal(changed, true);
});

test('D hosts: caller mutations of one observation cannot change subsequent native evaluations', (t) => {
  const f = fixture(t), args = f.options(), input = JSON.stringify(args.origin_inputs), out = inspectScopedSurfaceHosts(args);
  out.hosts.length = 0; out.read_set.length = 0;
  const next = f.run(); assert.equal(next.hosts_satisfied, true); assert.equal(next.hosts.length, 2);
  assert.equal(JSON.stringify(args.origin_inputs), input); noGrant(next);
});
