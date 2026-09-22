import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { inspectScopedPaths } from './scoped-work-paths.mjs';

const OWNER = 'screen:RESULT-001', ROOT = 'src/features/result';
const ENTRY = `${ROOT}/screens/RESULT-001.tsx`, COMPONENT = `${ROOT}/components/local/**`, HOOK = `${ROOT}/hooks/local/**`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const roles = () => ({ screen: ['src/features/{domain}/screens/**'], domain_component: ['src/features/{domain}/components/**'],
  hook: ['src/features/{domain}/hooks/**'], api_client: ['src/api/**'], test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'] });
const unit = () => ({ id: 'known', kind: 'behavior', contracts: ['artifact:RULES#rules'], sources: [] });
const screen = (id = 'RESULT-001', adopted = true) => ({ artifact_id: `SCREEN-${id}`, artifact_type: 'screen-spec', screen_id: id,
  domain: 'result', status: 'draft', screen_entry: `${ROOT}/screens/${id}.tsx`, ...(adopted ? { work_execution: { version: 1,
    private_paths: { domain_component: [COMPONENT], hook: [HOOK] }, test_paths: [`${ROOT}/tests/local/**`], units: [unit()] } } : {}) });
const headers = ['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths', 'Notes'];
const row = (endpoint = '/results', slice = HOOK, confidence = 'confirmed', gate = 'active', tracking = '') =>
  ['GET', endpoint, confidence, gate, tracking, slice, 'Candidate note.'];
const apiBody = (rows) => `## API Candidates\n| ${headers.join(' | ')} |\n|${headers.map(() => '---').join('|')}|\n${rows.map((cells) => `| ${cells.join(' | ')} |`).join('\n')}\n`;
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-paths-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs'), kitRoot = path.join(root, '.kit'), docs = new Map();
  const policyFile = path.join(kitRoot, 'policy.yaml'), layoutFile = path.join(kitRoot, 'layout.yaml'), manifestFile = path.join(kitRoot, 'manifest.yaml');
  const put = (relative, content = 'export const value = 1;\n') => {
    const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file;
  };
  const json = (file, value) => put(path.relative(root, file), JSON.stringify(value));
  const write = (name, fm, body) => { const file = put(`docs/${name}`, md(fm, body)); docs.set(name, file); return file; };
  const change = (name, update) => {
    const file = docs.get(name), parsed = splitFrontmatter(fs.readFileSync(file, 'utf8')), value = { fm: parsed.data, body: parsed.body };
    update(value); fs.writeFileSync(file, md(value.fm, value.body));
  };
  json(policyFile, { work_execution: { version: 1, owners: [OWNER], profiles: ['visual', 'api-contract', 'behavior'], role_limits: {
    visual: ['screen', 'domain_component', 'hook', 'test'], 'api-contract': ['api_client', 'test'],
    behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'],
  }, deny_paths: [] } });
  json(layoutFile, { roles: roles() }); json(manifestFile, { version: 1, artifacts: {} });
  write('screen.md', screen(), '## Notes\nOwner.');
  write('rules.md', { artifact_id: 'RULES', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed' }, '## Rules\nKnown contract.');
  const options = () => ({ owner: OWNER, unit: 'known', projectRoot: root, docsDir, kitRoot, policyFile, layoutFile, manifestFile,
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) => ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }) });
  const run = (file, changeType = 'A', extra = {}) => inspectScopedPaths({ ...options(), targets: [{ path: file, change: changeType }], ...extra });
  const kind = (value) => change('screen.md', (doc) => { doc.fm.work_execution.units[0].kind = value; });
  const api = (rows, selections = []) => change('screen.md', (doc) => {
    doc.body = apiBody(rows); doc.fm.work_execution.units[0].api_candidates = selections;
  });
  const policy = (update) => { const value = JSON.parse(fs.readFileSync(policyFile, 'utf8')); update(value.work_execution); json(policyFile, value); };
  return { root, docs, kitRoot, policyFile, layoutFile, manifestFile, put, json, write, change, options, run, kind, api, policy };
}
const denied = (out, code) => { assert.equal(out.boundary_satisfied, false); assert.ok(out.paths.some((entry) => entry.denials.some((d) => d.code === code)), JSON.stringify(out.paths)); };
const selected = [{ method: 'GET', path: '/results' }];

test('D paths: exact entry and private child paths satisfy only concrete boundary prerequisites', (t) => {
  const f = fixture(t);
  for (const file of [ENTRY, `${ROOT}/components/local/Card.tsx`, `${ROOT}/hooks/local/useFixture.ts`, `${ROOT}/tests/local/Card.test.ts`]) {
    const out = f.run(file); assert.equal(out.boundary_satisfied, true, JSON.stringify(out.paths));
    assert.equal(out.permission_evaluated, false); assert.equal(fs.existsSync(path.join(f.root, file)), false);
    for (const key of ['ready', 'allowed', 'allowed_paths', 'approved', 'basis_digest']) assert.equal(Object.hasOwn(out, key), false);
  }
  denied(f.run(`${ROOT}/screens/Other.tsx`), 'outside-owned-role-intersection');
  denied(f.run(`${ROOT}/components/sibling/Card.tsx`), 'outside-owned-role-intersection');
  denied(f.run(`${ROOT}/tests/sibling/Card.test.ts`), 'outside-owned-role-intersection');
});

test('D paths: existing regular modifications retain actual bytes and executable observation', (t) => {
  const f = fixture(t), file = f.put(ENTRY, 'export const label = "한글";\r\n'); fs.chmodSync(file, 0o755);
  const before = fs.readFileSync(file), out = f.run(ENTRY, 'M'); assert.equal(out.boundary_satisfied, true);
  assert.equal(out.target_read_set[0].executable, true); assert.match(out.target_read_set[0].sha256, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(fs.readFileSync(file), before); assert.equal(out.permission_evaluated, false, 'working-tree observation is not original Git proof');
  denied(f.run(ENTRY), 'add-target-exists'); denied(f.run(`${ROOT}/components/local/Missing.tsx`, 'M'), 'modify-target-missing');
});

test('D paths: layout narrowing and profile role ceilings cannot be bypassed by ownership', (t) => {
  const f = fixture(t); f.json(f.layoutFile, { roles: { ...roles(), domain_component: ['src/other/**'] } });
  denied(f.run(`${ROOT}/components/local/Card.tsx`), 'outside-owned-role-intersection');
  f.json(f.layoutFile, { roles: roles() }); f.policy((value) => { value.role_limits.behavior = ['screen']; });
  denied(f.run(`${ROOT}/hooks/local/useKnown.ts`), 'outside-owned-role-intersection');
  assert.equal(f.run(ENTRY).boundary_satisfied, true);
  f.policy((value) => { value.profiles = ['visual']; }); denied(f.run(ENTRY), 'profile-not-enabled');
});

test('D paths: test fallback requires an absent role, not explicit empty or narrowed test role', (t) => {
  const f = fixture(t), file = `${ROOT}/tests/local/Known.test.ts`, value = roles(); delete value.test;
  f.json(f.layoutFile, { roles: value }); assert.equal(f.run(file).boundary_satisfied, true);
  denied(f.run(`${ROOT}/tests/unowned/Known.test.ts`), 'outside-owned-role-intersection');
  f.json(f.layoutFile, { roles: { ...value, test: [] } }); denied(f.run(file), 'outside-owned-role-intersection');
  f.json(f.layoutFile, { roles: { ...value, test: ['tests/elsewhere/**'] } }); denied(f.run(file), 'outside-owned-role-intersection');
  f.json(f.layoutFile, { roles: value }); f.policy((p) => { p.role_limits.behavior = ['screen']; });
  denied(f.run(file), 'outside-owned-role-intersection');
});

test('D paths: preset and domain role replacement preserve explicit empty test ceiling', (t) => {
  const f = fixture(t); f.json(path.join(f.kitRoot, 'presets', 'fixture.yaml'), { roles: roles() });
  f.json(f.layoutFile, { preset: 'fixture', domains: { result: { roles: { test: [] } } } });
  denied(f.run(`${ROOT}/tests/local/Known.test.ts`), 'outside-owned-role-intersection');
  assert.equal(f.run(ENTRY).boundary_satisfied, true);
});

test('D paths: explicit denies, generated outputs, global roles and own routes survive private declarations', (t) => {
  const f = fixture(t), file = `${ROOT}/components/local/Reserved.tsx`;
  f.policy((value) => { value.deny_paths = [file]; }); denied(f.run(file), 'explicit-deny');
  f.policy((value) => { value.deny_paths = []; });
  f.json(f.manifestFile, { version: 1, artifacts: { reserved: { kind: 'generated', generated: true, do_not_edit: true, path: file } } });
  denied(f.run(file), 'generated-path'); f.json(f.manifestFile, { version: 1, artifacts: {} });
  f.json(f.layoutFile, { roles: { ...roles(), global_component: [file] } }); denied(f.run(file), 'non-profile-role');
  f.json(f.layoutFile, { roles: roles() }); f.change('screen.md', (doc) => { doc.fm.route_entry = file; }); denied(f.run(file), 'route-entry');
});

test('D paths: another screen entry, private hook and test root cannot be covered by this owner', (t) => {
  const f = fixture(t), other = screen('RESULT-002', false);
  other.screen_entry = `${ROOT}/components/local/Other.tsx`;
  other.work_execution = { version: 1, private_paths: { hook: [`${ROOT}/hooks/local/other/**`] }, test_paths: [`${ROOT}/tests/local/other/**`], units: [unit()] };
  f.write('other.md', other, '## Notes\nOther owner.');
  for (const file of [other.screen_entry, `${ROOT}/hooks/local/other/useOther.ts`, `${ROOT}/tests/local/other/Other.test.ts`]) denied(f.run(file), 'other-owner-reservation');
});

test('D paths: broad screen ownership cannot undelegate a shared surface with caller options', (t) => {
  const f = fixture(t); f.write('other.md', screen('RESULT-002', false), '## Notes\nOther owner.');
  f.write('surface.md', { artifact_id: 'SURFACE', artifact_type: 'shared-surface-spec', surface_id: 'PANEL', domain: 'result', status: 'draft',
    member_screens: ['RESULT-001', 'RESULT-002'], implementation_paths: [`${ROOT}/components/local/panel/**`] }, '## Notes\nShared owner.');
  denied(f.run(`${ROOT}/components/local/panel/Panel.tsx`, 'A', { sharedSurfaceExemption: true, allowed_paths: ['src/**'] }), 'shared-surface-delegation');
});

test('D paths: a surface retains every host responsibility without claiming its base permissions', (t) => {
  const f = fixture(t); f.policy((p) => { p.owners.push('surface:PANEL'); });
  f.write('other.md', screen('RESULT-002', false), '## Notes\nLegacy host.');
  f.write('surface.md', { artifact_id: 'SURFACE', artifact_type: 'shared-surface-spec', surface_id: 'PANEL', domain: 'result', status: 'draft',
    member_screens: ['RESULT-001', 'RESULT-002'], implementation_paths: [`${ROOT}/components/panel/**`],
    work_execution: { version: 1, units: [{ ...unit(), host_units: { 'RESULT-001': 'known', 'RESULT-002': 'legacy-current' } }] } }, '## Notes\nShared owner.');
  const out = f.run(`${ROOT}/components/panel/Panel.tsx`, 'A', { owner: 'surface:PANEL' });
  assert.equal(out.boundary_satisfied, true, JSON.stringify(out.paths));
  assert.deepEqual(out.host_units, { 'RESULT-001': 'known', 'RESULT-002': 'legacy-current' });
  assert.ok(out.requires_legacy_base.includes('screen:RESULT-002')); assert.equal(out.permission_evaluated, false);
});

test('D paths: selected confirmed active API admits only its real client Slice Paths', (t) => {
  const f = fixture(t); f.kind('api-contract'); f.api([row('/results', 'src/api/results/**')], selected);
  const out = f.run('src/api/results/client.ts'); assert.equal(out.boundary_satisfied, true, JSON.stringify(out.paths));
  assert.deepEqual(out.paths[0].roles, ['api_client']); assert.deepEqual(out.paths[0].selected_endpoints, selected);
  denied(f.run('src/api/unselected/client.ts'), 'unselected-api-client');
  denied(f.run(ENTRY), 'outside-owned-role-intersection');
});

test('D paths: API client paths hidden inside a private component remain guarded', (t) => {
  const f = fixture(t), file = `${ROOT}/components/local/client.ts`;
  f.json(f.layoutFile, { roles: { ...roles(), api_client: [`${ROOT}/components/local/**`] } });
  denied(f.run(file), 'unselected-api-client'); f.kind('visual'); denied(f.run(file), 'visual-api-client');
});

test('D paths: behavior selects claimed APIs while a visual private fixture hook does not invent API authority', (t) => {
  const f = fixture(t), file = `${ROOT}/hooks/local/useKnown.ts`; f.api([row()]);
  denied(f.run(file), 'unselected-api-claim'); f.kind('visual');
  const visual = f.run(file); assert.equal(visual.boundary_satisfied, true, JSON.stringify(visual.paths)); assert.deepEqual(visual.paths[0].selected_endpoints, []);
  f.kind('behavior'); f.api([row()], selected); assert.equal(f.run(file).boundary_satisfied, true);
});

test('D paths: a selected but unconfirmed API never satisfies a behavior API claim', (t) => {
  const f = fixture(t); f.api([row('/results', HOOK, 'candidate')], selected);
  denied(f.run(`${ROOT}/hooks/local/useKnown.ts`), 'unselected-api-claim');
});

test('D paths: deferred and invalid no-API reservations remain restrictions on fixture hooks', (t) => {
  const f = fixture(t); f.kind('visual'); f.api([row('/later', HOOK, 'candidate', 'deferred', 'issue:#12')]);
  denied(f.run(`${ROOT}/hooks/local/useKnown.ts`), 'deferred-api-claim');
  f.change('screen.md', (doc) => { doc.fm.api_required = false; });
  const out = f.run(`${ROOT}/hooks/local/useKnown.ts`); denied(out, 'no-api-claim'); denied(out, 'invalid-api-claim');
});

test('D paths: cross-owner API conflicts cannot be voted away, even for the same endpoint', (t) => {
  const f = fixture(t), file = `${ROOT}/hooks/local/shared/useKnown.ts`; f.api([row()], selected);
  f.write('other.md', screen('RESULT-002', false), apiBody([row('/results', `${ROOT}/hooks/local/shared/**`)]));
  const out = f.run(file); denied(out, 'api-other-owner'); denied(out, 'api-ownership-conflict');
  assert.equal(f.run(`${ROOT}/hooks/local/unshared.ts`).boundary_satisfied, true, 'only the concrete intersection conflicts');
});

test('D paths: ambiguous hook/client surfaces do not become either role by caller choice', (t) => {
  const f = fixture(t); f.json(f.layoutFile, { roles: { ...roles(), api_client: [`${ROOT}/hooks/**`] } }); f.api([row()], selected);
  denied(f.run(`${ROOT}/hooks/local/useKnown.ts`, 'A', { surface_kind: 'hook' }), 'ambiguous-api-surface');
});

test('D paths: inactive owner, missing unit, stale index and fabricated layouts do not supply authority', (t) => {
  const f = fixture(t); f.change('screen.md', (doc) => { doc.fm.status = 'deprecated'; }); denied(f.run(ENTRY), 'owner-inactive');
  f.change('screen.md', (doc) => { doc.fm.status = 'draft'; }); assert.throws(() => f.run(ENTRY, 'A', { unit: 'missing' }));
  const options = f.options(); f.change('screen.md', (doc) => { doc.fm.screen_entry = `${ROOT}/screens/Moved.tsx`; });
  assert.throws(() => inspectScopedPaths({ ...options, targets: [{ path: ENTRY, change: 'A' }] }));
  denied(f.run(ENTRY, 'A', { layout: { rolesFor: () => ({ screen: ['src/**'] }), resolvePaths: () => ['src/**'] }, boundary: { allowed: true }, approved: true }), 'outside-owned-role-intersection');
});

test('D paths: unsupported changes, duplicate targets, aliases and glob targets are rejected', (t) => {
  const f = fixture(t);
  for (const change of ['D', 'R', 'C', 'T']) assert.throws(() => f.run(ENTRY, change));
  for (const file of [ENTRY.replace('/screens/', '/./screens/'), `/${ENTRY}`, ENTRY.replaceAll('/', '\\'), `${ROOT}/screens/**`, '.git/config']) assert.throws(() => f.run(file));
  assert.throws(() => inspectScopedPaths({ ...f.options(), targets: [{ path: ENTRY, change: 'A' }, { path: ENTRY, change: 'A' }] }));
});

test('D paths: leaf and ancestor symlinks and directory targets are never regular A/M observations', (t) => {
  const f = fixture(t), target = `${ROOT}/components/local/link.ts`, real = f.put(`${ROOT}/components/local/real.ts`);
  fs.symlinkSync(real, path.join(f.root, target)); assert.throws(() => f.run(target, 'M'));
  const dir = path.join(f.root, `${ROOT}/hooks/local/link`); fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.symlinkSync(path.dirname(real), dir, 'dir'); assert.throws(() => f.run(`${ROOT}/hooks/local/link/new.ts`));
  assert.throws(() => f.run(`${ROOT}/components/local`, 'M'));
});

function afterTargetRead(t, file, mutate) {
  const originalOpen = fs.openSync, originalClose = fs.closeSync, descriptors = new Set(); let changed = false;
  const open = t.mock.method(fs, 'openSync', function (name, ...args) {
    const fd = originalOpen.call(this, name, ...args); if (String(name) === file) descriptors.add(fd); return fd;
  });
  const close = t.mock.method(fs, 'closeSync', function (fd) {
    const selected = descriptors.delete(fd), result = originalClose.call(this, fd);
    if (selected && !changed) { changed = true; mutate(); } return result;
  });
  return { changed: () => changed, restore: () => { close.mock.restore(); open.mock.restore(); } };
}

test('D paths: a changed authority file during target inspection invalidates the entire observation', (t) => {
  const f = fixture(t), file = f.put(ENTRY), options = f.options();
  const mutation = afterTargetRead(t, file, () => fs.appendFileSync(f.policyFile, '\n# changed during inspection\n'));
  assert.throws(() => inspectScopedPaths({ ...options, targets: [{ path: ENTRY, change: 'M' }] }), /snapshot changed/);
  assert.equal(mutation.changed(), true);
});

test('D paths: changed target bytes or executable bits during inspection cannot be returned as stable', (t) => {
  for (const modeOnly of [false, true]) {
    const f = fixture(t), file = f.put(ENTRY), options = f.options();
    const mutation = afterTargetRead(t, file, () => modeOnly ? fs.chmodSync(file, 0o755) : fs.appendFileSync(file, '// changed\n'));
    assert.throws(() => inspectScopedPaths({ ...options, targets: [{ path: ENTRY, change: 'M' }] }), /target snapshot changed/);
    assert.equal(mutation.changed(), true); mutation.restore();
  }
});

test('D paths: a new file appearing at an observed absent target invalidates the observation', (t) => {
  const f = fixture(t), file = f.put(ENTRY), addition = `${ROOT}/components/local/Added.tsx`, options = f.options();
  const mutation = afterTargetRead(t, file, () => f.put(addition));
  assert.throws(() => inspectScopedPaths({ ...options, targets: [{ path: addition, change: 'A' }, { path: ENTRY, change: 'M' }] }), /target snapshot changed/);
  assert.equal(mutation.changed(), true);
});

test('D paths: the absent-test-role fallback cannot grant edits to its own authority files', (t) => {
  const f = fixture(t), value = roles(); delete value.test; f.json(f.layoutFile, { roles: value });
  f.change('screen.md', (doc) => { doc.fm.work_execution.test_paths = ['docs/rules.md']; });
  denied(f.run('docs/rules.md', 'M'), 'authority-resource');
});

test('D paths: set order and caller result mutation do not widen a later concrete observation', (t) => {
  const f = fixture(t), options = f.options(), targets = [{ path: ENTRY, change: 'A' }, { path: `${ROOT}/hooks/local/useKnown.ts`, change: 'A' }];
  const before = JSON.stringify(targets), first = inspectScopedPaths({ ...options, targets });
  const second = inspectScopedPaths({ ...options, targets: [...targets].reverse() }); assert.deepEqual(second, first); assert.equal(JSON.stringify(targets), before);
  first.paths[0].roles.push('invented'); first.paths[0].boundary_satisfied = false;
  assert.deepEqual(inspectScopedPaths({ ...f.options(), targets }), second);
});
