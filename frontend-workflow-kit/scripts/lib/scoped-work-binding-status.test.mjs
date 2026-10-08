import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { KIT_ROOT } from './util.mjs';

// #275: the issue's coupon-feature repro through the public CLIs. COUPON-001 alone is adopted, with
// D-003 and U-001 bound out of its one unit. workflow:binding-status reports each binding's state and
// the digest to record; readiness --work shows whether the row blocks again.
const LIST = 'docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md';
const DETAIL = 'docs/frontend-workflow/domains/coupons/screens/coupon-detail/screen-spec.md';
const ENTRY = 'src/features/coupons/screens/CouponListScreen.tsx';
const OWNER = 'screen:COUPON-001';
const D003 = 'decision:D-003@COUPON-001-screen-spec', U001 = 'unknown:U-001@COUPON-001-screen-spec';
const ZERO = `sha256:${'0'.repeat(64)}`, APPROVAL = 'docs/approvals/coupon-scope-review.md#2026-10-07';
const WORK = { version: 1, owners: [OWNER], profiles: ['visual', 'behavior'], role_limits: {
  visual: ['screen', 'domain_component', 'hook', 'test'], behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] };
const UNITS = { version: 1, units: [{ id: 'list-behavior', kind: 'behavior', contracts: ['artifact:COUPON-001-screen-spec#state-matrix'], sources: [] }] };
const CONFIG = ['--docs', 'docs/frontend-workflow', '--src', 'src', '--policy', 'config/policy.yaml', '--manifest', 'config/manifest.yaml', '--layout', 'config/layout.yaml'];
const binding = (key, id, digest, overrides = {}) => ({ [key]: id, owner: OWNER, known_units: ['list-behavior'], blocks: [],
  basis_digest: digest, approval_ref: APPROVAL, ...overrides });

function project(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'binding-status-')));
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'binding-status-request-')));
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); });
  for (const dir of ['docs', 'src']) fs.cpSync(path.join(KIT_ROOT, 'examples/coupon-feature', dir), path.join(root, dir), { recursive: true });
  const put = (name, text) => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), text); };
  const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  put('config/policy.yaml', `${fs.readFileSync(path.join(KIT_ROOT, 'policies/implementation-mode-policy.yaml'), 'utf8')}\nwork_execution: ${JSON.stringify(WORK)}\n`);
  put('config/manifest.yaml', fs.readFileSync(path.join(KIT_ROOT, 'catalog/artifact-manifest.yaml'), 'utf8'));
  put('config/layout.yaml', fs.readFileSync(path.join(KIT_ROOT, 'presets/expo-feature.yaml'), 'utf8'));
  const original = read(LIST), end = original.indexOf('\n---\n', 4);
  // The bindings sit in the owner spec's frontmatter; recording a digest changes only them.
  const bind = (decisions, uncertainties) => {
    const body = read(LIST), at = body.indexOf('\n---\n', 4);
    put(LIST, `${original.slice(0, end)}\nscreen_entry: ${ENTRY}\nwork_execution: ${JSON.stringify(UNITS)}` +
      `\ndecision_work_scopes: ${JSON.stringify({ version: 1, bindings: decisions })}` +
      `\nuncertainty_work_scopes: ${JSON.stringify({ version: 1, bindings: uncertainties })}${body.slice(at)}`);
  };
  put(LIST, `${original.slice(0, end)}\nscreen_entry: ${ENTRY}${original.slice(end)}`);
  bind([binding('decision_id', 'D-003', ZERO)], [binding('unknown_id', 'U-001', ZERO)]);
  git('init', '-q'); git('config', 'maintenance.auto', 'false'); git('config', 'gc.auto', '0');
  git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'test');
  const commit = (message) => { git('add', '-A'); git('commit', '-qm', message); };
  commit('adopt COUPON-001 with two bindings');
  const work = path.join(outside, 'request.json');
  fs.writeFileSync(work, JSON.stringify({ version: 1, origin_inputs: [], requests: [
    { owner: OWNER, authority: 'scoped', unit: 'list-behavior', targets: [{ path: ENTRY, change: 'M' }] }] }));
  const node = (script, args) => spawnSync(process.execPath, [path.join(KIT_ROOT, 'scripts', script), ...args],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 });
  const status = (...args) => node('binding-status.mjs', ['--root', root, ...CONFIG, ...args]);
  const json = (run) => { assert.equal(run.status, 0, run.stderr || run.stdout); return JSON.parse(run.stdout); };
  const rows = () => Object.fromEntries(json(status('--json')).owners[0].rows.map((row) => [row.ref, row]));
  const blocking = () => {
    const env = json(node('readiness.mjs', ['--work', work, '--root', root, ...CONFIG, '--json']));
    return [...env.denials.filter((entry) => entry.code === 'unit-decision-blocked').flatMap((entry) => entry.decisions),
      ...env.denials.filter((entry) => entry.code === 'unit-uncertainty-unresolved').map((entry) => entry.application.uncertainty)].sort();
  };
  return { root, read, put, git, commit, bind, status, json, rows, blocking };
}

test('#275 binding-status: B0-B5 change only the bindings whose row or unit contract changed', (t) => {
  const p = project(t), before = p.rows();
  assert.deepEqual([before[D003].state, before[D003].stale_reason, before[U001].state, before[U001].stale_reason],
    ['stale', 'basis', 'stale', 'basis'], 'the placeholder digests are not the computed ones');
  assert.deepEqual(p.blocking().filter((ref) => [D003, U001].includes(ref)), [D003, U001]);
  // A person records the computed digests; nothing else changes, so they stay current.
  p.bind([binding('decision_id', 'D-003', before[D003].computed_basis_digest)], [binding('unknown_id', 'U-001', before[U001].computed_basis_digest)]);
  p.commit('record computed basis digests');
  const recorded = p.rows();
  assert.deepEqual([recorded[D003].state, recorded[U001].state], ['current', 'current']);
  assert.equal(recorded[D003].computed_basis_digest, before[D003].computed_basis_digest);
  const base = p.git('rev-parse', 'HEAD').trim(), baseline = p.blocking();
  assert.ok(!baseline.includes(D003) && !baseline.includes(U001), 'B0: both bindings hold');

  const variants = [
    ['B1 Purpose sentence outside the unit contract', LIST, (text) => text.replace('구분해서 볼 수 있다.', '구분해서 한눈에 볼 수 있다.'), []],
    ['B2 another screen (COUPON-002) ScreenSpec', DETAIL, (text) => `${text}\n<!-- detail note -->\n`, []],
    ['B3 U-001 question', LIST, (text) => text.replace('어디에 있는가?', '어느 문서에 있는가?'), [U001]],
    ['B4 unrelated Open Decision row D-004', LIST, (text) => text.replace(/(\n\| D-003 \|[^\n]*)/,
      '$1\n| D-004 | 쿠폰 카드에 브랜드 로고를 넣을 것인가? | yes / no | final-fixture-ui | PM | open |'), []],
    ['B5 unit contract (State Matrix) row', LIST, (text) => text.replace('| SkeletonList |', '| SkeletonList (3 rows) |'), [D003, U001]],
  ];
  for (const [label, file, edit, stale] of variants) {
    const text = p.read(file), next = edit(text);
    assert.notEqual(next, text, `${label}: the edit applies`);
    p.put(file, next); p.commit(label);
    const rows = p.rows();
    assert.deepEqual([D003, U001].filter((ref) => rows[ref].state === 'stale'), stale, label);
    assert.deepEqual(p.blocking().filter((ref) => [D003, U001].includes(ref)), stale, `${label}: readiness --work`);
    if (label.startsWith('B4')) {
      assert.equal(rows['decision:D-004@COUPON-001-screen-spec'].state, 'missing');
      assert.ok(p.blocking().includes('decision:D-004@COUPON-001-screen-spec'), 'the new row has no binding and blocks');
    }
    p.git('reset', '-q', '--hard', base);
  }
});

test('#275 binding-status: each row shows its state, recorded binding, computed digest and components', (t) => {
  const p = project(t);
  // A stale known_units set, and bindings whose row does not apply to the owner.
  p.bind([binding('decision_id', 'D-003', ZERO, { known_units: ['list-behavior', 'list-visual'] }),
    binding('decision_id', 'D-404', ZERO)], [binding('unknown_id', 'U-001', ZERO)]);
  p.put(DETAIL, p.read(DETAIL).replace('\n---\n', `\ndecision_work_scopes: ${JSON.stringify({ version: 1,
    bindings: [{ ...binding('decision_id', 'D-001', ZERO) }] })}\n---\n`));
  // A resolved row without a binding blocks nothing (review r1).
  p.put(LIST, p.read(LIST).replace(/(\n\| D-002 \|[^\n]*\| )open( \|)/, '$1resolved$2'));
  p.commit('bindings to inspect');
  const head = p.git('rev-parse', 'HEAD').trim(), files = [LIST, DETAIL].map((file) => p.read(file));
  const env = p.json(p.status('--json'));
  assert.equal(env.binding_status, 1); assert.equal(env.basis_version, 2); assert.equal(env.approval_verified, false);
  assert.equal(env.snapshot.commit, head);
  assert.deepEqual(env.owners.map((entry) => [entry.owner, entry.known_units]), [[OWNER, ['list-behavior']]]);
  const rows = Object.fromEntries(env.owners[0].rows.map((row) => [row.ref, row]));
  assert.deepEqual(Object.keys(rows).sort(), ['decision:D-001@COUPON-001-screen-spec', 'decision:D-001@COUPON-002-screen-spec',
    'decision:D-002@COUPON-001-screen-spec', D003, 'decision:D-404@COUPON-001-screen-spec', U001]);
  assert.deepEqual(['decision:D-001@COUPON-001-screen-spec', 'decision:D-002@COUPON-001-screen-spec'].map((ref) =>
    [rows[ref].state, rows[ref].status, rows[ref].resolved, rows[ref].recorded, rows[ref].computed_basis_digest, rows[ref].components]),
  [['missing', 'open', false, null, null, null], ['missing', 'resolved', true, null, null, null]]);
  assert.deepEqual([rows[D003].state, rows[D003].stale_reason, rows[D003].computed_basis_digest, rows[D003].recorded.known_units],
    ['stale', 'known-units', null, ['list-behavior', 'list-visual']]);
  for (const ref of ['decision:D-404@COUPON-001-screen-spec', 'decision:D-001@COUPON-002-screen-spec']) {
    assert.deepEqual([rows[ref].state, rows[ref].status, rows[ref].computed_basis_digest], ['unresolved', null, null], ref);
  }
  assert.equal(rows['decision:D-001@COUPON-002-screen-spec'].home, DETAIL);
  const unknown = rows[U001];
  assert.deepEqual([unknown.kind, unknown.status, unknown.state, unknown.stale_reason, unknown.home], ['unknown', 'open', 'stale', 'basis', LIST]);
  assert.deepEqual(unknown.recorded, { known_units: ['list-behavior'], blocks: [], basis_digest: ZERO, approval_ref: APPROVAL });
  assert.match(unknown.computed_basis_digest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(unknown.components).sort(), ['evidence', 'relations', 'target', 'units']);
  for (const value of Object.values(unknown.components)) assert.match(value, /^sha256:[0-9a-f]{64}$/);
  // The text report names the same states; neither form writes anything.
  const text = p.status();
  assert.equal(text.status, 0, text.stderr);
  assert.ok(text.stdout.includes('decision:D-001@COUPON-001-screen-spec  open  missing  — no binding; blocks every unit'), text.stdout);
  assert.ok(text.stdout.includes('decision:D-002@COUPON-001-screen-spec  resolved  missing\n'), text.stdout);
  for (const expected of [`${OWNER} (known units: list-behavior)`, `${U001}  open  stale (basis)`, `${D003}  open  stale (known-units)`,
    'decision:D-404@COUPON-001-screen-spec  -  unresolved', `computed ${unknown.computed_basis_digest}`, `approval_ref ${APPROVAL}`]) {
    assert.ok(text.stdout.includes(expected), `${expected}\n${text.stdout}`);
  }
  assert.equal(p.git('status', '--porcelain'), ''); assert.equal(p.git('rev-parse', 'HEAD').trim(), head);
  assert.deepEqual([LIST, DETAIL].map((file) => p.read(file)), files);
});

test('#275 binding-status: the committed HEAD is read, as readiness --work reads it', (t) => {
  const p = project(t), before = p.rows();
  p.put(LIST, p.read(LIST).replace('어디에 있는가?', '어느 문서에 있는가?'));
  const uncommitted = p.rows();
  assert.equal(uncommitted[U001].computed_basis_digest, before[U001].computed_basis_digest);
  p.commit('edit U-001');
  assert.notEqual(p.rows()[U001].computed_basis_digest, before[U001].computed_basis_digest);
});

test('#275 binding-status: usage and input errors exit 2', (t) => {
  const p = project(t);
  for (const [args, message] of [
    [['--jsno'], /binding-status: unknown option --jsno/],
    [['--owner', 'screen:COUPON-002'], /binding-status: .*not adopted/],
    [['--owner', OWNER, '--owner', OWNER], /binding-status: --owner accepts one owner/],
    [['--owner', 'COUPON-001'], /binding-status: /],
  ]) {
    const run = p.status(...args);
    assert.deepEqual([run.status, run.stdout], [2, ''], args.join(' '));
    assert.match(run.stderr, message, args.join(' '));
  }
  const help = p.status('--help');
  assert.equal(help.status, 0); assert.match(help.stdout, /workflow:binding-status/);
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'binding-status-nogit-')));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const nogit = spawnSync(process.execPath, [path.join(KIT_ROOT, 'scripts', 'binding-status.mjs'), '--root', outside, ...CONFIG],
    { cwd: outside, encoding: 'utf8' });
  assert.equal(nogit.status, 2); assert.match(nogit.stderr, /binding-status: /);
});
