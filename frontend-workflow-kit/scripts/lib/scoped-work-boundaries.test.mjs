import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { globMatches } from './path-backstop.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { resolveScopedBoundaryProjection, scopedPatternsOverlap } from './scoped-work-boundaries.mjs';

const OWNER = 'screen:RESULT-001';
const ROOT = 'src/features/result';
const HOOK = `${ROOT}/hooks/local/**`;
const COMPONENT = `${ROOT}/components/local/**`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const unit = () => ({ id: 'known', kind: 'behavior', contracts: ['artifact:RULES#rules'], sources: [] });
const roleMap = () => ({ screen: ['src/features/{domain}/screens/**'], domain_component: ['src/features/{domain}/components/**'],
  hook: ['src/features/{domain}/hooks/**'], api_client: ['src/api/**'], test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'] });
const headers = ['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths', 'Notes'];
const row = (endpoint = '/results', slice = HOOK, confidence = 'confirmed', gate = 'active', tracking = '') =>
  ['GET', endpoint, confidence, gate, tracking, slice, 'Candidate note.'];
const apiBody = (rows) => `## API Candidates\n| ${headers.join(' | ')} |\n|${headers.map(() => '---').join('|')}|\n${rows.map((cells) => `| ${cells.join(' | ')} |`).join('\n')}\n\n## Notes\nUnselected.`;
const screen = (id = 'RESULT-001', declarations = true) => ({ artifact_id: `SCREEN-${id}`, artifact_type: 'screen-spec',
  screen_id: id, domain: 'result', status: 'draft', screen_entry: `${ROOT}/screens/${id}.tsx`,
  ...(declarations ? { work_execution: { version: 1, private_paths: { domain_component: [COMPONENT], hook: [HOOK] },
    test_paths: [`${ROOT}/tests/local/**`], units: [unit()] } } : {}) });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-boundaries-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs'), kitRoot = path.join(root, '.kit');
  fs.mkdirSync(kitRoot); const docs = new Map();
  const policyFile = path.join(kitRoot, 'policy.yaml'), layoutFile = path.join(kitRoot, 'layout.yaml'), manifestFile = path.join(kitRoot, 'manifest.yaml');
  const putJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
  const policy = (owners = [OWNER], deny_paths = []) => putJson(policyFile, { work_execution: { version: 1, owners,
    profiles: ['visual', 'api-contract', 'behavior'], role_limits: {
      visual: ['screen', 'domain_component', 'hook', 'test'], 'api-contract': ['api_client', 'test'],
      behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'],
    }, deny_paths } });
  const layout = (value = { roles: roleMap() }) => putJson(layoutFile, value);
  const manifest = (artifacts = {}) => putJson(manifestFile, { version: 1, artifacts });
  const write = (name, fm, body) => {
    const file = path.join(docsDir, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, md(fm, body)); docs.set(name, file); return file;
  };
  const change = (name, update) => {
    const file = docs.get(name), parsed = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const value = { fm: parsed.data, body: parsed.body }; update(value); fs.writeFileSync(file, md(value.fm, value.body));
  };
  policy(); layout(); manifest();
  write('screen.md', screen(), '## Notes\nOwner housekeeping.');
  write('rules.md', { artifact_id: 'RULES', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed' }, '## Rules\nKnown contract.');
  const options = (owner = OWNER) => ({ owner, projectRoot: root, docsDir, kitRoot, policyFile, layoutFile, manifestFile,
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) =>
      ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }) });
  return { root, kitRoot, docs, policyFile, layoutFile, manifestFile, putJson, write, change, layout, policy, manifest, options,
    run: (owner = OWNER) => resolveScopedBoundaryProjection(options(owner)) };
}
const boundary = (out) => out.projection.ownership;
const role = (out, name) => boundary(out).units.find((unit) => unit.owner === OWNER).roles.find((entry) => entry.role === name);
const generated = (target) => ({ kind: 'generated', generated: true, do_not_edit: true, path: target });

test('D boundary: actual layout, exact entries and declared roots remain separate intersections, not permits', (t) => {
  const f = fixture(t), before = [...f.docs.values()].map((file) => fs.readFileSync(file));
  const out = f.run();
  assert.deepEqual(role(out, 'screen').owned.map((entry) => entry.path), [`${ROOT}/screens/RESULT-001.tsx`]);
  assert.deepEqual(role(out, 'domain_component').layout_paths, [`${ROOT}/components/**`]);
  assert.deepEqual(role(out, 'domain_component').owned.map((entry) => entry.path), [COMPONENT]);
  assert.deepEqual(boundary(out).requires_legacy_base, []);
  for (const key of ['ready', 'allowed', 'allowed_paths', 'basis_digest', 'basis_version']) {
    assert.equal(Object.hasOwn(out, key), false); assert.equal(Object.hasOwn(out.projection, key), false);
    assert.equal(Object.hasOwn(boundary(out), key), false);
  }
  assert.deepEqual([...f.docs.values()].map((file) => fs.readFileSync(file)), before);
});

test('D boundary: caller role functions cannot replace file-backed layout; narrowing never widens the owned root', (t) => {
  const f = fixture(t);
  const out = resolveScopedBoundaryProjection({ ...f.options(), layout: { resolvePaths: () => ['src/**'] } });
  assert.deepEqual(out.projection, f.run().projection);
  f.layout({ roles: { ...roleMap(), domain_component: ['src/other/**'] } });
  const next = f.run();
  assert.deepEqual(role(next, 'domain_component').owned, role(out, 'domain_component').owned);
  assert.deepEqual(role(next, 'domain_component').layout_paths, ['src/other/**']);
  assert.notDeepEqual(next.projection, out.projection);
});

test('D boundary: preset/project/domain role replacement and empty-role ceilings use the existing loader', (t) => {
  const f = fixture(t), preset = path.join(f.kitRoot, 'presets', 'fixture.yaml');
  f.putJson(preset, { roles: roleMap() });
  f.layout({ preset: 'fixture', roles: { hook: ['src/project-hooks/**'] }, domains: { result: { roles: { hook: [] } } } });
  const out = f.run();
  assert.deepEqual(role(out, 'hook').layout_paths, []);
  assert.deepEqual(role(out, 'screen').layout_paths, [`${ROOT}/screens/**`]);
  assert.equal(boundary(out).resources.preset, '.kit/presets/fixture.yaml');
  assert.ok(out.read_set.some((record) => record.file === '.kit/presets/fixture.yaml'));
});

test('D boundary: layout set order, comments and unrelated generated entries change audit bytes only', (t) => {
  const f = fixture(t);
  const value = roleMap(); value.hook.push('src/extra-hooks/**'); f.layout({ roles: value });
  f.manifest({ selected: generated(`${ROOT}/components/local/generated.ts`), other: generated('src/unrelated/first.ts') });
  const before = f.run(); value.hook.reverse(); f.layout({ roles: value });
  fs.appendFileSync(f.layoutFile, '\n# Housekeeping\n');
  f.manifest({ other: generated('src/unrelated/second.ts'), selected: generated(`${ROOT}/components/local/generated.ts`) });
  const after = f.run(); assert.deepEqual(after.projection, before.projection);
  assert.notDeepEqual(after.read_set, before.read_set);
});

test('D boundary: actual selected API slice provenance is distinct from private hook ownership', (t) => {
  const f = fixture(t); f.change('screen.md', (doc) => {
    doc.body = apiBody([row('/results', 'src/api/results/**')]);
    doc.fm.work_execution.units[0].api_candidates = [{ method: 'GET', path: '/results' }];
  });
  const out = f.run(), owned = role(out, 'api_client').owned;
  assert.equal(owned.length, 1); assert.equal(owned[0].source, 'api');
  assert.deepEqual(owned[0].endpoint, { method: 'GET', path: '/results' });
  assert.deepEqual(role(out, 'hook').owned.map((entry) => entry.source), ['private']);
  assert.equal(boundary(out).api_claims[0].surface_kind, 'api-client');
});

test('D boundary: all-screen active/deferred overlap retains both owners and actual cross-claim conflicts', (t) => {
  const f = fixture(t); f.change('screen.md', (doc) => { doc.body = apiBody([row()]); });
  f.write('other.md', screen('RESULT-002', false), apiBody([row('/other', `${ROOT}/hooks/local/shared/**`, 'candidate', 'deferred', 'issue:#12')]));
  const out = f.run(), claims = boundary(out).api_claims;
  assert.deepEqual(new Set(claims.map((entry) => entry.owner)), new Set([OWNER, 'screen:RESULT-002']));
  assert.ok(claims.some((entry) => entry.kind === 'deferred'));
  assert.ok(boundary(out).api_conflicts.some((entry) => entry.owners.length === 2));
  assert.deepEqual(role(out, 'hook').owned.map((entry) => entry.path), [HOOK], 'private root does not delete restrictions');
});

test('D boundary: unselected API row notes and disjoint owner claims remain outside scope content', (t) => {
  const f = fixture(t); f.write('other.md', screen('RESULT-002', false), apiBody([row('/far', 'src/api/far/**')]));
  const before = f.run(); f.change('other.md', (doc) => { doc.body = apiBody([row('/different', 'src/api/different/**')]); });
  const after = f.run(); assert.deepEqual(after.projection, before.projection);
  assert.notDeepEqual(after.read_set, before.read_set);
});

test('D boundary: invalid/no-API and recovered malformed v2 claims stay visible as restrictions', (t) => {
  for (const invalid of [false, true]) {
    const f = fixture(t); f.change('screen.md', (doc) => {
      doc.fm.api_required = false;
      doc.body = apiBody([row('/later', invalid ? `${ROOT}/hooks/./local/**` : HOOK, 'candidate', 'deferred', 'issue:#12')]);
    });
    const claims = boundary(f.run()).api_claims;
    assert.equal(claims.length, 1); assert.equal(claims[0].contract_valid, false);
    assert.equal(claims[0].api_required, false); assert.equal(claims[0].path, HOOK);
    assert.equal(claims[0].kind, 'deferred');
  }
});

test('D boundary: ambiguous API surface classification is not guessed as hook/client', (t) => {
  const f = fixture(t); f.layout({ roles: { ...roleMap(), api_client: [`${ROOT}/hooks/**`] } });
  f.change('screen.md', (doc) => { doc.body = apiBody([row()]); doc.fm.work_execution.units[0].api_candidates = [{ method: 'GET', path: '/results' }]; });
  const out = f.run(); assert.equal(boundary(out).units[0].unknown_api_paths.length, 1);
  assert.equal(boundary(out).api_claims[0].surface_kind, null);
});

test('D boundary: another screen entry/private root and a shared surface reservation cannot disappear', (t) => {
  const f = fixture(t); const other = screen('RESULT-002', false);
  other.screen_entry = `${ROOT}/components/local/Other.tsx`;
  other.work_execution = { version: 1, private_paths: { hook: [`${ROOT}/hooks/local/other/**`] }, units: [unit()] };
  f.write('other.md', other, '## Notes\nOther owner.');
  f.write('surface.md', { artifact_id: 'SURFACE', artifact_type: 'shared-surface-spec', surface_id: 'PANEL', domain: 'result', status: 'draft',
    member_screens: ['RESULT-001', 'RESULT-002'], implementation_paths: [`${ROOT}/components/local/panel/**`] }, '## Notes\nShared owner.');
  const out = f.run(), reservations = boundary(out).reservations;
  assert.ok(reservations.some((entry) => entry.owner === 'screen:RESULT-002' && entry.source === 'screen_entry'));
  assert.ok(reservations.some((entry) => entry.owner === 'screen:RESULT-002' && entry.source === 'private'));
  assert.ok(reservations.some((entry) => entry.owner === 'surface:PANEL' && entry.source === 'surface'));
});

test('D boundary: generated and non-profile role reservations plus explicit deny survive private declarations', (t) => {
  const f = fixture(t);
  f.layout({ roles: { ...roleMap(), global_shared: [`${ROOT}/components/local/shared/**`] } });
  f.manifest({ generated: generated(`${ROOT}/components/local/*.generated.ts`) });
  f.policy([OWNER], [`${ROOT}/hooks/local/secret/**`]);
  const out = f.run(); assert.equal(boundary(out).generated.length, 1);
  assert.equal(boundary(out).other_role_boundaries.length, 1);
  assert.deepEqual(boundary(out).explicit_denies, [`${ROOT}/hooks/local/secret/**`]);
});

test('D boundary: legacy host requires its later actual base check, never a fake integrated envelope', (t) => {
  const f = fixture(t); f.write('other.md', screen('RESULT-002', false), '## Notes\nLegacy host.');
  f.policy([OWNER, 'surface:PANEL']);
  f.write('surface.md', { artifact_id: 'SURFACE', artifact_type: 'shared-surface-spec', surface_id: 'PANEL', domain: 'result', status: 'draft',
    member_screens: ['RESULT-001', 'RESULT-002'], implementation_paths: [`${ROOT}/components/panel/**`],
    work_execution: { version: 1, units: [{ ...unit(), host_units: { 'RESULT-001': 'known', 'RESULT-002': 'legacy-current' } }] } }, '## Notes\nSurface.');
  const out = f.run('surface:PANEL');
  assert.deepEqual(boundary(out).requires_legacy_base, ['screen:RESULT-002']);
  assert.ok(boundary(out).reservations.some((entry) => entry.owner === 'screen:RESULT-002'));
  assert.equal(Object.hasOwn(out, 'allowed'), false);
});

test('D boundary: missing, aliased, malformed and changed resource/index snapshots are rejected', (t) => {
  const f = fixture(t); const before = f.options();
  f.change('screen.md', (doc) => { doc.body += '\nChanged after indexing.'; });
  assert.throws(() => resolveScopedBoundaryProjection(before), /indexed snapshot/);
  assert.throws(() => resolveScopedBoundaryProjection({ ...f.options(), layoutFile: path.join(f.root, 'missing.yaml') }));
  assert.throws(() => resolveScopedBoundaryProjection({ ...f.options(), manifestFile: `${f.kitRoot}/../.kit/manifest.yaml` }));
  fs.writeFileSync(f.layoutFile, 'roles: ['); assert.throws(() => f.run());
  f.layout({ roles: { ...roleMap(), hook: [`${ROOT}/hooks/../unsafe/**`] } }); assert.throws(() => f.run());
  f.layout({ roles: { ...roleMap(), hook: [HOOK, HOOK] } }); assert.throws(() => f.run());
});

test('D boundary: selected role/deny/reservation changes alter projection and caller mutations do not persist', (t) => {
  const f = fixture(t), before = f.run();
  before.projection.ownership.units[0].role_limits.length = 0;
  assert.ok(boundary(f.run()).units[0].role_limits.length > 0);
  const clean = f.run(); f.policy([OWNER], ['src/private/**']);
  assert.notDeepEqual(f.run().projection, clean.projection);
  f.write('other.md', { ...screen('RESULT-002', false), screen_entry: `${ROOT}/hooks/local/Owner.ts` }, '## Notes\nNew reservation.');
  assert.notDeepEqual(f.run().projection, clean.projection);
});

test('D boundary: pattern intersection matches the existing literal-bracket, star and double-star dialect', () => {
  for (const [left, right, witness] of [
    ['src/**', 'src/a/*.ts', 'src/a/test.ts'], ['src/*/x.ts', 'src/a/**', 'src/a/x.ts'],
    ['src/a/**/x.ts', 'src/**/b/*.ts', 'src/a/b/x.ts'],
    ['src/app/[id]/page.tsx', 'src/app/**', 'src/app/[id]/page.tsx'],
    ['한글/**', '한글/😀/*.ts', '한글/😀/test.ts'],
  ]) {
    assert.ok(globMatches(left, witness)); assert.ok(globMatches(right, witness));
    assert.equal(scopedPatternsOverlap(left, right), true); assert.equal(scopedPatternsOverlap(right, left), true);
  }
  for (const [left, right] of [['src/a/**', 'src/ab/**'], ['src/*/x.ts', 'src/a/b/x.ts'],
    ['src/app/[id]/page.tsx', 'src/app/id/page.tsx'], ['src/a.ts', 'src/a.tsx'], ['src/A/**', 'src/a/**']]) {
    assert.equal(scopedPatternsOverlap(left, right), false); assert.equal(scopedPatternsOverlap(right, left), false);
  }
  for (const invalid of ['../src/**', 'src/../other/**', 'src\\a\\**', '{roles.hook}', '/src/**', 'src//**']) {
    assert.throws(() => scopedPatternsOverlap(invalid, 'src/**'));
  }
});
