import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { resolveScopedBindingBasis } from './scoped-work-basis.mjs';
import { inspectScopedOwner } from './scoped-work-owner.mjs';

const OWNER = 'screen:RESULT-001', ROOT = 'src/features/result', ENTRY = `${ROOT}/screens/RESULT-001.tsx`;
const HOME = 'global/open-decisions.md', REF = 'decision:D-ONE@open-decision-register';
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const unit = (id = 'known') => ({ id, kind: 'behavior', contracts: [`artifact:RULES#${id === 'known' ? 'rules' : 'other'}`], sources: [] });
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-owner-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs'), kitRoot = path.join(root, '.kit'), docs = new Map();
  const put = (name, value) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); return file; };
  const write = (name, fm, body) => { const file = put(`docs/${name}`, md(fm, body)); docs.set(name, file); return file; };
  const edit = (name, update) => { const file = docs.get(name), parsed = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const doc = { fm: parsed.data, body: parsed.body }; update(doc); fs.writeFileSync(file, md(doc.fm, doc.body)); };
  const policyFile = put('.kit/policy.yaml', JSON.stringify({ work_execution: { version: 1, owners: [OWNER], profiles: ['visual', 'api-contract', 'behavior'],
    role_limits: { visual: ['screen', 'domain_component', 'hook', 'test'], 'api-contract': ['api_client', 'test'],
      behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } }));
  const layoutFile = put('.kit/layout.yaml', JSON.stringify({ roles: { screen: ['src/features/{domain}/screens/**'],
    domain_component: ['src/features/{domain}/components/**'], hook: ['src/features/{domain}/hooks/**'],
    api_client: ['src/api/**'], test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'] } }));
  const manifestFile = put('.kit/manifest.yaml', JSON.stringify({ version: 1, artifacts: {} }));
  write('screen.md', { artifact_id: 'SCREEN-RESULT-001', artifact_type: 'screen-spec', screen_id: 'RESULT-001', domain: 'result', status: 'draft',
    screen_entry: ENTRY, api_required: false, work_execution: { version: 1, private_paths: { hook: [`${ROOT}/hooks/local/**`] },
      test_paths: [`${ROOT}/tests/local/**`], units: [unit(), unit('other')] } }, '## Notes\nExisting screen.');
  write('rules.md', { artifact_id: 'RULES', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed',
    approved_by: 'synthetic-fixture-owner', approved_at: '2026-09-22', decision_id: 'fixture-known-contract' },
  '## Rules\nKnown local behavior without API calls.\n\n## Other\nOther known behavior.');
  const options = () => ({ owner: OWNER, unit: 'known', projectRoot: root, docsDir, kitRoot, policyFile, layoutFile, manifestFile,
    registerFile: path.join(docsDir, 'register.md'), inputArtifacts: [], origin_inputs: [], coverage_reports: [],
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) => ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }),
    targets: [{ path: ENTRY, change: 'A' }] });
  function decision(blocks, seal = true) {
    edit('screen.md', ({ fm }) => { fm.decision_refs = ['D-ONE']; });
    write(HOME, { artifact_id: 'open-decision-register', artifact_type: 'open-decision-register', status: 'draft',
      ...(blocks === undefined ? {} : { decision_work_scopes: { version: 1, bindings: [{ decision_id: 'D-ONE', owner: OWNER,
        known_units: ['known', 'other'], blocks, basis_digest: `sha256:${'0'.repeat(64)}`, approval_ref: 'review:synthetic-only' }] } }) },
    '## Open Decisions\n| ID | Decision Needed | Options | Blocking Mode | Owner | Status |\n|---|---|---|---|---|---|\n| D-ONE | Choose one. | A / B | api-integrated-ui | PM | open |');
    if (blocks !== undefined && seal) {
      const digest = resolveScopedBindingBasis({ ...options(), decisionRef: REF }).basis_digest;
      edit(HOME, ({ fm }) => { fm.decision_work_scopes.bindings[0].basis_digest = digest; });
    }
  }
  function api() {
    edit('screen.md', (doc) => { doc.fm.api_required = true; doc.fm.work_execution.units[0].api_candidates = [{ method: 'GET', path: '/results' }];
      doc.body = '## API Candidates\n| Method | Path | Confidence | Gate | Tracking | Slice Paths |\n|---|---|---|---|---|---|\n| GET | /results | confirmed | active | | src/api/results/** |'; });
    write('api.md', { artifact_id: 'API', artifact_type: 'api-manifest', status: 'draft' },
      '## Endpoints\n| Method | Path | Confidence | Linked Contract | Contract Kind | Source |\n|---|---|---|---|---|---|\n| GET | /results | confirmed | ResultsResponse | ts-type | contracts |');
    put('contracts/result.ts', 'export interface ResultsResponse { value: string }\n');
  }
  return { root, docs, put, write, edit, policyFile, options, decision, api, run: (extra = {}) => inspectScopedOwner({ ...options(), ...extra }) };
}
const denied = (out, prerequisite) => { assert.equal(out.owner_satisfied, false); assert.ok(out.denials.some((d) => d.prerequisite === prerequisite), JSON.stringify(out.denials)); };
const noGrant = (out) => { assert.equal(out.permission_evaluated, false); assert.equal(out.approval_verified, false);
  for (const key of ['ready', 'allowed', 'approved', 'allowed_paths']) assert.equal(Object.hasOwn(out, key), false); };

test('D owner: actual known behavior, concrete ownership and clear decisions compose without Figma or a permit', (t) => {
  const f = fixture(t), before = fs.readFileSync(f.docs.get('screen.md')), out = f.run();
  assert.equal(out.owner_satisfied, true, JSON.stringify(out.denials)); assert.equal(out.profile.profile_satisfied, true);
  assert.equal(out.path_policy.boundary_satisfied, true); assert.equal(out.decision_scopes.unit_checks[0].decisions_clear, true);
  assert.deepEqual(fs.readFileSync(f.docs.get('screen.md')), before); assert.equal(fs.existsSync(path.join(f.root, ENTRY)), false); noGrant(out);
});

test('D owner: regular modification retains target bytes and mode independently of authority resources', (t) => {
  const f = fixture(t), file = f.put(ENTRY, 'export const text = "한글";\r\n'); fs.chmodSync(file, 0o755);
  const before = fs.readFileSync(file), out = f.run({ targets: [{ path: ENTRY, change: 'M' }] });
  assert.equal(out.owner_satisfied, true); assert.equal(out.target_read_set[0].executable, true);
  assert.deepEqual(fs.readFileSync(file), before); noGrant(out);
});

test('D owner: profile denial survives a valid path and an empty Decision block set', (t) => {
  const f = fixture(t); f.edit('rules.md', ({ fm }) => { fm.status = 'draft'; }); const out = f.run();
  denied(out, 'profile'); assert.equal(out.path_policy.boundary_satisfied, true); noGrant(out);
});

test('D owner: a satisfied profile cannot authorize another owner path or explicit deny', (t) => {
  const f = fixture(t); let out = f.run({ targets: [{ path: `${ROOT}/screens/Other.tsx`, change: 'A' }] });
  denied(out, 'path'); assert.equal(out.profile.profile_satisfied, true);
  const policy = JSON.parse(fs.readFileSync(f.policyFile, 'utf8')); policy.work_execution.deny_paths = [ENTRY]; fs.writeFileSync(f.policyFile, JSON.stringify(policy));
  out = f.run(); denied(out, 'path'); assert.ok(out.denials.some((d) => d.code === 'explicit-deny'));
});

test('D owner: a missing scope blocks an open Decision despite otherwise complete prerequisites', (t) => {
  const f = fixture(t); f.decision(); const out = f.run(); denied(out, 'decision');
  assert.equal(out.profile.profile_satisfied, true); assert.equal(out.path_policy.boundary_satisfied, true);
  assert.deepEqual(out.decision_scopes.blocking_units, ['known', 'other']); noGrant(out);
});

test('D owner: a current canonical scope applies only its actual blocked units, without authenticating review', (t) => {
  const f = fixture(t); f.decision(['other']); assert.equal(f.run().owner_satisfied, true);
  denied(f.run({ unit: 'other' }), 'decision'); noGrant(f.run());
});

test('D owner: stale scope cannot be borrowed after a selected contract edit', (t) => {
  const f = fixture(t); f.decision(['other']); f.edit('rules.md', (doc) => { doc.body = doc.body.replace('Known local', 'Changed local'); });
  const out = f.run(); denied(out, 'decision'); assert.deepEqual(out.decision_scopes.blocking_units, ['known', 'other']);
});

test('D owner: caller-supplied intermediate results cannot replace canonical evaluation', (t) => {
  const f = fixture(t);
  for (const key of ['profile_result', 'path_result', 'decision_result', 'owner_result', 'approved', 'approval_verifier', 'decisions_clear', 'owner_satisfied']) {
    assert.throws(() => f.run({ [key]: true }), /SW-OWNER: caller/);
  }
});

test('D owner: unknown units, missing concrete targets and unsupported changes never become successful empty work', (t) => {
  const f = fixture(t);
  assert.throws(() => f.run({ unit: 'missing' })); assert.throws(() => f.run({ targets: [] }));
  assert.throws(() => f.run({ targets: [{ path: ENTRY, change: 'D' }] }));
});

test('D owner: a late profile evidence edit is detected even though later prerequisites do not consume the file', (t) => {
  const f = fixture(t); f.api(); f.put(ENTRY, 'export const value = 1;');
  // readCurrentBytes opens once and uses readSync, not readFileSync.
  const original = fs.openSync; let changed = false;
  t.mock.method(fs, 'openSync', function(file, ...args) {
    const value = original.call(this, file, ...args);
    if (!changed && String(file) === path.join(f.root, ENTRY)) { changed = true; fs.appendFileSync(path.join(f.root, 'contracts/result.ts'), '\n// later change'); }
    return value;
  });
  assert.throws(() => f.run({ targets: [{ path: ENTRY, change: 'M' }] }), /snapshot changed|authority changed/); assert.equal(changed, true);
});

test('D owner: late API evidence directory additions are detected without treating the old file hashes as completeness', (t) => {
  const f = fixture(t); f.api(); f.put(ENTRY, 'export const value = 1;');
  // readCurrentBytes opens once and uses readSync, not readFileSync.
  const original = fs.openSync; let changed = false;
  t.mock.method(fs, 'openSync', function(file, ...args) {
    const value = original.call(this, file, ...args);
    if (!changed && String(file) === path.join(f.root, ENTRY)) { changed = true; f.put('contracts/new.ts', 'export interface Another {}'); }
    return value;
  });
  assert.throws(() => f.run({ targets: [{ path: ENTRY, change: 'M' }] }), /directory membership changed/); assert.equal(changed, true);
});

test('D owner: returned observations and caller targets are independent across repeated real-file evaluations', (t) => {
  const f = fixture(t), args = f.options(), before = JSON.stringify(args.targets), out = inspectScopedOwner(args);
  assert.equal(JSON.stringify(args.targets), before); out.read_set.length = 0; out.decision_scopes.blocking_units.push('known');
  const next = f.run(); assert.equal(next.owner_satisfied, true); assert.ok(next.read_set.length > 0); noGrant(next);
});

test('D owner: API-dependent behavior pins contract files and directory membership before path composition', (t) => {
  const f = fixture(t); f.api(); const target = f.put(ENTRY, 'export const value = 1;');
  const before = fs.readFileSync(target), out = f.run({ targets: [{ path: ENTRY, change: 'M' }] });
  assert.equal(out.owner_satisfied, true, JSON.stringify(out.denials));
  assert.equal(out.profile.api_evidence.length, 1); assert.equal(out.profile.api_evidence[0].satisfied, true);
  assert.ok(out.read_set.some((entry) => entry.file === 'contracts/result.ts'));
  assert.ok(out.directory_read_set.some((entry) => entry.file === 'contracts' &&
    entry.entries.some(([name, kind]) => name === 'result.ts' && kind === 'file')));
  assert.deepEqual(fs.readFileSync(target), before); noGrant(out);
});
