// D1 tests real syntax parsers and real public processes, not a permit model.
// R1 resolution/hash/approval/coverage semantics remain deliberately unimplemented.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { normalizeWorkRequest, strictJson } from './current-work-request.mjs';
import { normalizeScopedWorkRequestSyntax } from './scoped-work-request.mjs';
import { isReconciliationItemId } from './reconciliation-items.mjs';
import {
  decodeScopedYaml, parseScopedPolicy, parseScopedOwner, parseDecisionWorkScopes,
  parseWorkCoverageReceipt, parseWorkCoverageReceipts,
} from './scoped-work-declarations.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INPUT = 'IN-20260910-visual-spec-001';
const REF = `input:${INPUT}#extracted-facts/01`;
const HASH = `sha256:${'1'.repeat(64)}`; // Syntax fixture, never evidence of approval.
const clone = (v) => structuredClone(v);
const source = () => ({ input_id: INPUT, items: ['01'], source_refs: [REF] });
const unit = (id = 'layout', kind = 'visual') => ({
  id, kind, contracts: ['artifact:RESULT-001-screen-spec#interaction-matrix'], sources: [],
  ...(kind === 'api-contract' ? { api_candidates: [{ method: 'GET', path: '/results' }] } : {}),
});
const owner = () => ({ version: 1, units: [unit(), unit('save', 'behavior')] });
const policy = () => ({
  version: 1, owners: ['screen:RESULT-001'], profiles: ['visual', 'api-contract', 'behavior'],
  role_limits: { visual: ['screen', 'domain_component', 'hook', 'test'],
    'api-contract': ['api_client', 'test'], behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] },
  deny_paths: ['src/generated/**'],
});
const scoped = () => ({ owner: 'screen:RESULT-001', authority: 'scoped', unit: 'layout',
  targets: [{ path: 'src/result.tsx', change: 'M' }] });
const current = () => ({ owner: 'screen:RESULT-002', authority: 'current', requested_mode: 'rough-fixture-ui',
  targets: [{ path: 'src/other.tsx', change: 'M' }] });
const request = () => ({ version: 1, origin_inputs: [{ input_id: INPUT, source_refs: [REF] }], requests: [scoped()] });
const binding = () => ({ decision_id: 'D-SAVE', owner: 'screen:RESULT-001', known_units: ['layout', 'save'],
  blocks: ['save'], basis_digest: HASH, approval_ref: 'review:human-scope-fixture' });
const receipt = () => ({ version: 1, owner: 'screen:RESULT-001', unit: 'layout', input_id: INPUT,
  item_ids: ['01'], source_refs: [REF], input_sha256: HASH, effects_sha256: HASH, contracts_sha256: HASH,
  review_scope: 'reconcile-stage04-v1', coverage: 'complete-for-unit' });
const surface = () => ({ version: 1, units: [{ ...unit(),
  host_units: { 'RESULT-001': 'layout', 'RESULT-002': 'legacy-current' },
  host_visual_evidence: {
    'RESULT-001': { mapping_ref: 'artifact:RESULT-001-mapping#component-mapping', m_keys: ['M-001'] },
    'RESULT-002': { mapping_ref: 'artifact:RESULT-002-mapping#component-mapping', m_keys: ['M-007', 'M-008'] },
  },
}] });

// The same matrix applies to every new optional authored section, not legacy v1.
for (const [name, sample, parse] of [
  ['policy', policy, parseScopedPolicy],
  ['owner', owner, (v) => parseScopedOwner(v, 'screen:RESULT-001')],
  ['bindings', () => ({ version: 1, bindings: [binding()] }), parseDecisionWorkScopes],
]) {
  test(`D1 ${name}: absence differs from null; unknown/version/duplicate YAML are not ignored`, () => {
    assert.equal(parse(undefined), null);
    for (const value of [null, [], '1', { ...sample(), version: '1' }, { ...sample(), version: 2 },
      { ...sample(), version: null }, { ...sample(), unknown: true }]) assert.throws(() => parse(value));
    assert.throws(() => parse(decodeScopedYaml('version: 1\nversion: 1\n')));
    assert.throws(() => decodeScopedYaml('version: !unrecognized 1\n'));
    assert.doesNotThrow(() => parse(sample()));
  });
}

test('D1 policy: explicit profiles/role ceilings and literal or terminal roots only', () => {
  const parsed = parseScopedPolicy(policy());
  assert.deepEqual(parsed.owners, ['screen:RESULT-001']);
  for (const mutate of [
    (v) => v.owners.push(v.owners[0]), (v) => v.owners.push('component:GLOBAL'),
    (v) => v.profiles.push('rough'), (v) => v.profiles.push('visual'),
    (v) => delete v.role_limits.visual, (v) => v.role_limits.visual.push('api_client'),
    (v) => v.role_limits['api-contract'].push('screen'), (v) => v.role_limits.behavior.push('route'),
    (v) => v.role_limits.behavior.push('schema'), (v) => v.role_limits.visual.push('screen'),
  ]) { const v = policy(); mutate(v); assert.throws(() => parseScopedPolicy(v)); }
  for (const bad of ['../src/**', 'src//x/**', 'src/./x/**', 'src\\x/**', '/src/**', 'src/*/x', 'src/**/x', '**', 'src/.git/**']) {
    assert.throws(() => parseScopedPolicy({ ...policy(), deny_paths: [bad] }), bad);
  }
  assert.doesNotThrow(() => parseScopedPolicy({ ...policy(), deny_paths: ['src/app/[id]/page.tsx', 'src/private/**'] }));
});

test('D1 owner: three kinds retain API/source/isolation selections without inventing facts', () => {
  const v = owner();
  v.units.push(unit('client', 'api-contract'));
  v.units[0].sources = [source()];
  v.units[0].isolation = { decisions: ['decision:D-SAVE@RESULT-001-screen-spec'], disabled_units: ['save'], exposure: 'development-only' };
  v.private_paths = { hook: ['src/features/result/hooks/preview/**'] };
  v.test_paths = ['src/features/result/tests/layout/**'];
  const before = clone(v);
  const parsed = parseScopedOwner(v, 'screen:RESULT-001');
  assert.deepEqual(v, before, 'parsing must not modify the declaration');
  assert.deepEqual(parsed.units.find((u) => u.id === 'client').api_candidates, [{ method: 'GET', path: '/results' }]);
  assert.deepEqual(parsed.units.find((u) => u.id === 'layout').sources, [source()]);
  assert.equal(parsed.units.find((u) => u.id === 'layout').isolation.exposure, 'development-only');
  assert.deepEqual(parsed.test_paths, v.test_paths);
  assert.equal(Object.hasOwn(parsed, 'ready'), false);
  assert.equal(Object.hasOwn(parsed, 'basis_digest'), false);
});

test('D1 owner: duplicate identities, invalid private roles, typed refs and isolation rejected', () => {
  for (const mutate of [
    (v) => v.units.push({ ...unit(), kind: 'behavior' }),
    (v) => v.units[0].id = 'Bad_ID', (v) => v.units[0].kind = 'unknown',
    (v) => v.units[0].contracts = ['RESULT-001'], (v) => v.units[0].contracts.push(v.units[0].contracts[0]),
    (v) => v.units[0].contracts = [], (v) => v.units[0].sources = [source(), source()],
    (v) => v.units[0].sources = [{ ...source(), items: [] }],
    (v) => v.units[0].sources = [{ ...source(), source_refs: [] }],
    (v) => v.units[0].sources = [{ ...source(), source_refs: [REF, REF.replace('/01', '/1')] }],
    (v) => v.units[0].isolation = { decisions: [], disabled_units: ['save'], exposure: 'development-only' },
    (v) => v.units[0].isolation = { decisions: ['decision:D-SAVE@RESULT-001-screen-spec'], disabled_units: ['layout'], exposure: 'development-only' },
    (v) => v.units[0].isolation = { decisions: ['decision:D-SAVE@RESULT-001-screen-spec'], disabled_units: ['missing'], exposure: 'production' },
    (v) => v.units[0].isolation = null,
    (v) => v.units[0].host_units = { 'RESULT-001': 'layout' },
    (v) => v.private_paths = { api_client: ['src/api/**'] },
    (v) => v.private_paths = { hook: ['src/hooks/**/all'] },
  ]) { const v = owner(); mutate(v); assert.throws(() => parseScopedOwner(v, 'screen:RESULT-001')); }
});

test('D1 API selector: method identity canonicalizes before duplicates; contract requires a selection', () => {
  const v = { version: 1, units: [unit('client', 'api-contract')] };
  v.units[0].api_candidates[0].method = 'get';
  assert.equal(parseScopedOwner(v, 'screen:RESULT-001').units[0].api_candidates[0].method, 'GET');
  for (const candidates of [[], null, [{ method: 'GET', path: '/results', confirmed: true }],
    [{ method: 'BOGUS', path: '/results' }], [{ method: 'GET', path: 'relative' }],
    [{ method: 'GET', path: '/results' }, { method: 'get', path: '/results' }]]) {
    assert.throws(() => parseScopedOwner({ version: 1, units: [{ ...unit('client', 'api-contract'), api_candidates: candidates }] }, 'screen:RESULT-001'));
  }
});

test('D1 R1 host selector structure preserves every host/mapping/M-key; not a membership proof', () => {
  const v = surface();
  const parsed = parseScopedOwner(v, 'surface:RESULT-PANEL');
  assert.deepEqual(parsed.units[0].host_units, v.units[0].host_units);
  assert.deepEqual(parsed.units[0].host_visual_evidence, v.units[0].host_visual_evidence);
  for (const mutate of [
    (u) => delete u.host_units, (u) => delete u.host_visual_evidence,
    (u) => u.host_units = {}, (u) => delete u.host_visual_evidence['RESULT-002'],
    (u) => u.host_visual_evidence['OTHER-001'] = u.host_visual_evidence['RESULT-001'],
    (u) => u.host_visual_evidence['RESULT-001'].m_keys = [],
    (u) => u.host_visual_evidence['RESULT-001'].m_keys = ['M-001', 'M-001'],
    (u) => u.host_visual_evidence['RESULT-001'].m_keys = ['m-1'],
    (u) => u.host_visual_evidence['RESULT-001'].mapping_ref = 'artifact:RESULT-001-mapping#component-mapping/M-001',
    (u) => u.host_visual_evidence['RESULT-001'].mapping_ref = 'artifact:RESULT-001-mapping#notes',
    (u) => u.kind = 'behavior',
  ]) { const bad = surface(); mutate(bad.units[0]); assert.throws(() => parseScopedOwner(bad, 'surface:RESULT-PANEL')); }
});

test('D1 scope binding: explicit blocks subset and duplicate owner/decision validation, no approval inference', () => {
  const v = { version: 1, bindings: [binding()] };
  assert.deepEqual(parseDecisionWorkScopes(v).bindings[0].blocks, ['save']);
  assert.deepEqual(parseDecisionWorkScopes({ version: 1, bindings: [{ ...binding(), blocks: [] }] }).bindings[0].blocks, []);
  for (const mutate of [
    (b) => delete b.blocks, (b) => b.blocks = null, (b) => b.blocks = ['missing'],
    (b) => b.known_units.push('save'), (b) => b.basis_digest = 'hash',
    (b) => b.approval_ref = '', (b) => b.status = 'resolved',
  ]) { const b = binding(); mutate(b); assert.throws(() => parseDecisionWorkScopes({ version: 1, bindings: [b] })); }
  assert.throws(() => parseDecisionWorkScopes({ version: 1, bindings: [binding(), { ...binding(), blocks: [] }] }));
});

test('D1 R1 declaration order is stable while API/source/host selections remain visible (not scope hashing)', () => {
  const a = owner(); a.units.push(unit('client', 'api-contract')); a.units[0].sources = [source()];
  const b = clone(a); b.units.reverse();
  assert.deepEqual(parseScopedOwner(a, 'screen:RESULT-001'), parseScopedOwner(b, 'screen:RESULT-001'));
  const c = clone(a); c.units[2].api_candidates[0].path = '/results/next';
  assert.notDeepEqual(parseScopedOwner(a, 'screen:RESULT-001'), parseScopedOwner(c, 'screen:RESULT-001'));
  const d = clone(a); d.units[0].sources[0].items = ['02'];
  assert.notDeepEqual(parseScopedOwner(a, 'screen:RESULT-001'), parseScopedOwner(d, 'screen:RESULT-001'));
  const s = surface(); const changed = clone(s); changed.units[0].host_visual_evidence['RESULT-002'].m_keys = ['M-009'];
  assert.notDeepEqual(parseScopedOwner(s, 'surface:RESULT-PANEL'), parseScopedOwner(changed, 'surface:RESULT-PANEL'));
});

test('D1 request: current syntax output stays identical and mixed requests retain the original origins', () => {
  const onlyCurrent = { ...request(), requests: [current()] };
  assert.deepEqual(normalizeScopedWorkRequestSyntax(onlyCurrent), normalizeWorkRequest(onlyCurrent));
  const mixed = { ...request(), requests: [scoped(), current(), { ...scoped(), unit: 'save' }] };
  const out = normalizeScopedWorkRequestSyntax(mixed);
  assert.deepEqual(out.origin_inputs, request().origin_inputs);
  assert.equal(out.requests.length, 3, 'do not union shared path responsibilities');
  assert.equal(out.requests.filter((r) => r.owner === 'screen:RESULT-001').length, 2);
  assert.throws(() => normalizeWorkRequest(request()), /scoped is not implemented/);
});

test('D1 request: scoped needs a unit, excludes mode/authority overrides and supports planned A/M only', () => {
  for (const mutate of [
    (r) => delete r.unit, (r) => r.unit = null, (r) => r.requested_mode = 'production-ready',
    (r) => r.allowed = true, (r) => r.authority = 'override', (r) => r.targets = [],
    (r) => r.targets.push({ ...r.targets[0] }), (r) => r.coverage_reports = null,
    (r) => r.coverage_reports = ['../review.md'], (r) => r.coverage_reports = ['review.md', 'review.md'],
    (r) => r.targets[0].path = 'src/../result.tsx',
  ]) { const v = request(); mutate(v.requests[0]); assert.throws(() => normalizeScopedWorkRequestSyntax(v)); }
  for (const change of ['D', 'R', 'C', 'T']) {
    const v = request(); v.requests[0].targets[0].change = change;
    assert.throws(() => normalizeScopedWorkRequestSyntax(v), /A\/M only/);
  }
  const v = request(); v.requests[0].targets[0].change = 'A';
  assert.equal(normalizeScopedWorkRequestSyntax(v).requests[0].targets[0].change, 'A');
});

test('D1 request: duplicate unit/current owner, conflicting shared changes and origin errors are rejected', () => {
  for (const mutate of [
    (v) => v.requests.push({ ...scoped(), targets: [{ path: 'src/another.tsx', change: 'M' }] }),
    (v) => v.requests.push({ ...current(), owner: scoped().owner }),
    (v) => v.requests.push({ ...scoped(), unit: 'save', targets: [{ path: 'src/result.tsx', change: 'A' }] }),
    (v) => delete v.origin_inputs, (v) => v.origin_inputs = null, (v) => v.origin_inputs.push(v.origin_inputs[0]),
    (v) => v.origin_inputs[0].source_refs.push(REF.replace('/01', '/1')),
    (v) => v.origin_inputs[0].source_refs = [REF.replace(INPUT, 'IN-20260910-other-001')],
    (v) => v.origin_inputs[0].ignored = true,
  ]) { const v = request(); mutate(v); assert.throws(() => normalizeScopedWorkRequestSyntax(v)); }
  assert.throws(() => normalizeScopedWorkRequestSyntax(strictJson('{"version":1,"version":1}')));
});

test('D1 coverage structure: no-effect preserves nonempty routing evidence and full-input origin', () => {
  const r = { ...receipt(), origin_source_refs: [], origin_relation: 'no-effect-on-unit' };
  assert.deepEqual(parseWorkCoverageReceipt(r), r);
  assert.deepEqual(parseWorkCoverageReceipt({ ...r, origin_relation: 'covered-for-unit' }).origin_source_refs, []);
  assert.equal(Object.hasOwn(parseWorkCoverageReceipt(r), 'ready'), false);
  for (const mutate of [
    (v) => v.source_refs = [], (v) => v.item_ids = [], (v) => v.item_ids.push('01'),
    (v) => v.input_sha256 = '1'.repeat(64), (v) => v.effects_sha256 = null,
    (v) => v.contracts_sha256 = 'sha256:old', (v) => v.coverage = 'accepted',
    (v) => v.review_scope = 'caller', (v) => v.origin_relation = 'ignored',
    (v) => delete v.origin_source_refs, (v) => delete v.origin_relation,
    (v) => v.origin_source_refs = [REF.replace(INPUT, 'IN-20260910-other-001')],
    (v) => v.approved = true,
  ]) { const bad = clone(r); mutate(bad); assert.throws(() => parseWorkCoverageReceipt(bad)); }
  assert.throws(() => parseWorkCoverageReceipts([r, { ...r, item_ids: ['02'] }]));
});

test('review P2: shared v2 Item ID syntax accepts two digits without coercion', () => {
  for (let n = 0; n < 100; n++) {
    assert.equal(isReconciliationItemId(String(n).padStart(2, '0')), true);
  }
  for (const value of ['1', '001', 'not-an-item', '', ' 01', '01 ', '01\n', '０１',
    1, 12, null, undefined, true, ['01'], { toString: () => '01' }]) {
    assert.equal(isReconciliationItemId(value), false, String(value));
  }
});

for (const [name, parseIds] of [
  ['source.items', (items) => {
    const value = owner();
    value.units[0].sources = [{ ...source(), items }];
    return parseScopedOwner(value, 'screen:RESULT-001')
      .units.find((entry) => entry.id === 'layout').sources[0].items;
  }],
  ['receipt.item_ids', (item_ids) => parseWorkCoverageReceipt({ ...receipt(), item_ids }).item_ids],
]) {
  test(`review P2: ${name} enforces v2 Item IDs before reference resolution`, () => {
    assert.deepEqual(parseIds(['01']), ['01']);
    const ids = ['99', '01', '00'];
    assert.deepEqual(parseIds(ids), ['00', '01', '99']);
    assert.deepEqual(ids, ['99', '01', '00'], 'do not mutate authored selectors');
    for (const value of ['1', '001', 'not-an-item', '', ' 01', '01 ', '01\n', '０１',
      1, 12, null, undefined, true, ['01'], {}]) {
      // A valid first selector must not hide a later malformed one.
      assert.throws(() => parseIds(['01', value]), {
        name: 'ScopedWorkContractError', message: /Item ID: expected exactly two digits/,
      }, `${name}: ${String(value)}`);
    }
    assert.throws(() => parseIds(['01', '01']), /duplicate selector/);
    assert.throws(() => parseIds([]), /nonempty array required/);
  });
}

// Actual Git fixture + actual public wrappers. No authority files are needed:
// C's strict request rejection must happen before snapshot/resource evaluation.
// Missing modules/usage failures are not accepted as the expected rejection.
function cliFixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-contracts-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'project'); fs.mkdirSync(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  // Git >=2.47 may detach auto-maintenance after commit; it can race temp-dir removal.
  execFileSync('git', ['config', 'maintenance.auto', 'false'], { cwd: root });
  execFileSync('git', ['config', 'gc.auto', '0'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'baseline'], { cwd: root });
  const work = path.join(temp, 'request.json'); fs.writeFileSync(work, JSON.stringify(request()));
  return { temp, root, work };
}
function assertUnsupportedCli(root, fixture) {
  for (const script of ['readiness.mjs', 'workflow-packet.mjs', 'workflow-run.mjs', 'workflow-report.mjs', 'forbidden-paths.mjs']) {
    const output = path.join(fixture.temp, `out-${script}`);
    const args = ['--work', fixture.work, '--root', fixture.root, '--json'];
    if (script !== 'forbidden-paths.mjs') args.push('--out', output);
    if (script === 'workflow-report.mjs') args.push('--packet', path.join(fixture.temp, 'missing-packet.md'));
    const run = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args],
      { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 60000 });
    assert.equal(run.error, undefined, `${script}: ${run.error}`);
    assert.equal(run.status, 2, `${script}: ${run.stderr}\n${run.stdout}`);
    assert.match(run.stderr + run.stdout, /C supports authority:current only; scoped is not implemented/, script);
    assert.equal(fs.existsSync(output), false, `${script}: rejected request must not write output`);
  }
}
test('D1 five public CLIs reject scoped before output or packet use', (t) => {
  assertUnsupportedCli(KIT, cliFixture(t));
});
test('D1 packed CLI remains unsupported; declaration modules are packaged, tests are not', (t) => {
  const fixture = cliFixture(t);
  const packed = path.join(fixture.temp, 'packed');
  const run = spawnSync(process.execPath, [path.join(KIT, 'scripts/pack-frontend-workflow-kit.mjs'), '--out', packed],
    { cwd: KIT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 60000 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  for (const file of ['current-work-request.mjs', 'scoped-work-request.mjs', 'scoped-work-declarations.mjs', 'reconciliation-items.mjs']) {
    assert.deepEqual(fs.readFileSync(path.join(packed, 'scripts/lib', file)), fs.readFileSync(path.join(KIT, 'scripts/lib', file)));
  }
  assert.equal(fs.existsSync(path.join(packed, 'scripts/lib/scoped-work-contracts.test.mjs')), false);
  fs.symlinkSync(path.join(KIT, 'node_modules'), path.join(packed, 'node_modules'), 'dir');
  const load = spawnSync(process.execPath, ['--input-type=module', '-e',
    "import { parseScopedPolicy } from './scripts/lib/scoped-work-declarations.mjs'; if (parseScopedPolicy(undefined) !== null) process.exitCode = 1;"],
    { cwd: packed, encoding: 'utf8', timeout: 60000 });
  assert.equal(load.status, 0, load.stderr || load.stdout);
  assertUnsupportedCli(packed, fixture);
});
