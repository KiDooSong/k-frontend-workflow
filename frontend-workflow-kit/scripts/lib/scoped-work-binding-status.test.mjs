import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { KIT_ROOT } from './util.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';

// A packed run borrows only fixture documents from the source kit. All imports,
// configuration templates and spawned CLI executables still come from KIT_ROOT.
const FIXTURE_ROOT = process.env.SCOPED_WORK_TEST_FIXTURE_ROOT || KIT_ROOT;
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

function project(t, target = ENTRY) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'binding-status-')));
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'binding-status-request-')));
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); });
  for (const dir of ['docs', 'src']) fs.cpSync(path.join(FIXTURE_ROOT, 'examples/coupon-feature', dir), path.join(root, dir), { recursive: true });
  const put = (name, text) => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), text); };
  const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  put('config/policy.yaml', fs.readFileSync(path.join(KIT_ROOT, 'policies/implementation-mode-policy.yaml'), 'utf8'));
  put('config/adoption.yaml', `work_execution: ${JSON.stringify(WORK)}\n`);
  put('frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: config/adoption.yaml\n');
  put('config/manifest.yaml', fs.readFileSync(path.join(KIT_ROOT, 'catalog/artifact-manifest.yaml'), 'utf8'));
  put('config/layout.yaml', fs.readFileSync(path.join(KIT_ROOT, 'presets/expo-feature.yaml'), 'utf8'));
  const original = read(LIST), end = original.indexOf('\n---\n', 4);
  // The bindings sit in the owner spec's frontmatter; recording a digest changes only them.
  const bind = (decisions, uncertainties, units = UNITS) => {
    const body = read(LIST), at = body.indexOf('\n---\n', 4);
    put(LIST, `${original.slice(0, end)}\nscreen_entry: ${ENTRY}\nwork_execution: ${JSON.stringify(units)}` +
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
    { owner: OWNER, authority: 'scoped', unit: 'list-behavior', targets: [{ path: target, change: 'M' }] }] }));
  const node = (script, args) => spawnSync(process.execPath, [path.join(KIT_ROOT, 'scripts', script), ...args],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 });
  const status = (...args) => node('binding-status.mjs', ['--root', root, ...CONFIG, ...args]);
  const json = (run) => { assert.equal(run.status, 0, run.stderr || run.stdout); return JSON.parse(run.stdout); };
  const rows = () => Object.fromEntries(json(status('--json')).owners[0].rows.map((row) => [row.ref, row]));
  const readinessRun = () => node('readiness.mjs', ['--work', work, '--root', root, ...CONFIG, '--json']);
  const readiness = () => json(readinessRun());
  const blocking = () => {
    const env = readiness();
    return [...env.denials.filter((entry) => entry.code === 'unit-decision-blocked').flatMap((entry) => entry.decisions),
      ...env.denials.filter((entry) => entry.code === 'unit-uncertainty-unresolved').map((entry) => entry.application.uncertainty)].sort();
  };
  return { root, read, put, git, commit, bind, status, json, rows, readiness, readinessRun, blocking };
}

// Synthetic consumer regression: one selected Item has effects on both the adopted screen's
// contract and another screen's deferred API table. No consumer repository or approval is edited.
const generated = (body) => `<!-- GENERATED:START summary -->\n\n${body}\n\n<!-- GENERATED:END summary -->`;
const generatedCases = [
  { name: 'control' },
  { name: 'generated API legend', apiAfter: generated('| Method | Meaning |\n|---|---|\n| GET | Read only |') },
  { name: 'generated API heading', apiBefore: generated('## Generated Summary\n\nOutput text.') },
  { name: 'generated Unknown heading', unknownBefore: generated('## Generated Summary\n\nOutput text.') },
  { name: 'generated duplicate headings with CRLF', apiBefore: generated('## API Candidates\n\nOutput text.'),
    unknownBefore: generated('## Unknowns\n\nOutput text.'), crlf: true },
];
for (const variant of generatedCases) test(`#282 CLI: ${variant.name} preserves cross-screen Tracking denials and stale bindings`, (t) => {
  const p = project(t), baseline = p.rows();
  const input = 'IN-20261019-meeting-001', ref = `input:${input}#extracted-facts/01`;
  const target = 'artifact:COUPON-002-screen-spec#api-candidates', unknown = 'unknown:U-LATER@COUPON-002-screen-spec';
  const inputFile = `docs/frontend-workflow/inputs/${input}.md`;
  const registerFile = 'docs/frontend-workflow/_meta/reconciliation-register.md';
  const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
  const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
  const decisions = [binding('decision_id', 'D-003', baseline[D003].computed_basis_digest)];
  const uncertainties = [binding('unknown_id', 'U-001', baseline[U001].computed_basis_digest)];
  p.bind(decisions, uncertainties); p.commit('record the existing binding digests');

  const units = structuredClone(UNITS);
  units.units[0].sources = [{ input_id: input, items: ['01'], source_refs: [ref] }];
  p.bind(decisions, uncertainties, units);
  const later = `${p.read(DETAIL)}\n## API Candidates\n\n${variant.apiBefore || ''}\n\n${table(['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths'], [
    ['GET', '/coupons/later', 'candidate', 'deferred', 'unknown:U-LATER', 'src/api/coupons/later/**'],
  ])}\n\n${variant.apiAfter || ''}\n\n## Unknowns\n\n${variant.unknownBefore || ''}\n\n${table(['ID', 'Question', 'Status'], [['U-LATER', 'Later coupon API?', 'open']])}\n`;
  p.put(DETAIL, variant.crlf ? later.replace(/\r?\n/g, '\r\n') : later);
  p.put(inputFile, md({ input_id: input, input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting:tracking-regression',
    captured_at: '2026-10-19T00:00:00Z', captured_by: 'test', status: 'captured', affected_domains: ['coupons'],
    affected_screens: ['COUPON-001', 'COUPON-002'] }, '## Extracted Facts\n- Coordinate list behavior and the later API.'));
  p.put(registerFile, md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' },
    `${table(REQUIRED_REGISTER_COLS, [[input, 'meeting', 'simple-update×1', 'partially-reconciled', 'pending',
      'artifact:COUPON-001-screen-spec; artifact:COUPON-002-screen-spec', '-', '-']])}\n\n## Reconciliation Items\n` +
    table(REQUIRED_ITEM_COLS, ['artifact:COUPON-001-screen-spec#state-matrix', target].map((itemTarget) =>
      [input, '01', 'compatible-fact', 'simple-update', 'update', itemTarget, ref, 'inherit', 'statement', 'inherit']))));
  p.commit('selected Item reaches another screen deferred API');
  const files = [LIST, DETAIL, inputFile, registerFile].map((file) => p.read(file));

  const report = p.json(p.status('--owner', OWNER, '--json'));
  const rows = Object.fromEntries(report.owners[0].rows.map((row) => [row.ref, row]));
  assert.ok(rows[unknown], 'generated content must not silently omit the cross-screen Tracking Unknown');
  assert.deepEqual([rows[unknown].state, rows[unknown].status, rows[unknown].home, rows[unknown].blocking_units],
    ['missing', 'open', DETAIL, ['list-behavior']]);
  assert.deepEqual([rows[U001].state, rows[U001].stale_reason, rows[U001].recorded.basis_digest],
    ['stale', 'basis', uncertainties[0].basis_digest]);
  const ready = p.readiness();
  assert.deepEqual([ready.authority, ready.ready], ['scoped', false]);
  assert.ok(ready.denials.some((entry) => entry.code === 'unit-uncertainty-unresolved' &&
    entry.application.uncertainty === unknown), 'the open Tracking Unknown still blocks the selected unit');
  assert.ok(ready.denials.some((entry) => entry.code === 'unit-uncertainty-unresolved' &&
    entry.application.uncertainty === U001), 'a stale binding remains a denial');
  assert.deepEqual(p.json(p.status('--owner', OWNER, '--json')), report);
  assert.equal(p.git('status', '--porcelain'), '');
  assert.deepEqual([LIST, DETAIL, inputFile, registerFile].map((file) => p.read(file)), files);
});

test('#282 CLI: selected deferred API stays blocked with generated API and Unknown headings', (t) => {
  const target = 'src/api/coupons/later/client.ts', p = project(t, target);
  const unknown = 'unknown:U-LATER@COUPON-001-screen-spec';
  const units = structuredClone(UNITS);
  units.units[0].api_candidates = [{ method: 'GET', path: '/coupons/later' }];
  p.bind([], [], units);
  const api = `## API Candidates\n\n${generated('## Generated Summary\n\nOutput text.')}\n\n` +
    '| Method | Path | Confidence | Gate | Tracking | Slice Paths |\n|---|---|---|---|---|---|\n' +
    '| GET | /coupons/later | candidate | deferred | unknown:U-LATER | src/api/coupons/later/** |\n\n' +
    `${generated('| Method | Meaning |\n|---|---|\n| GET | Read only |')}\n`;
  const body = p.read(LIST).replace(/\n## API Candidates\n[\s\S]*?(?=\n## )/, `\n${api}`)
    .replace(/\n## Unknowns\n[\s\S]*?(?=\n## )/, '\n## Unknowns\n\n' +
      `${generated('## Generated Unknown Summary\n\nOutput text.')}\n\n` +
      '| ID | Question | Status |\n|---|---|---|\n| U-LATER | Later API contract? | open |\n');
  p.put(LIST, body); p.put(target, 'export const later = null;\n');
  p.commit('select a deferred API behind generated headings');
  const report = p.json(p.status('--owner', OWNER, '--json'));
  const row = report.owners[0].rows.find((entry) => entry.ref === unknown);
  assert.ok(row, 'the selected API Tracking Unknown is included in the binding report');
  assert.deepEqual([row.state, row.status, row.blocking_units], ['missing', 'open', ['list-behavior']]);
  const ready = p.readiness();
  assert.deepEqual([ready.authority, ready.ready], ['scoped', false]);
  for (const code of ['api-not-confirmed-active', 'deferred-api-claim']) {
    assert.ok(ready.denials.some((entry) => entry.code === code), JSON.stringify(ready.denials));
  }
  assert.ok(ready.denials.some((entry) => entry.code === 'unit-uncertainty-unresolved' &&
    entry.application.uncertainty === unknown), 'the actual selected open Unknown remains blocking');
  assert.equal(ready.requests[0].path_authorizations[0].allowed, false);
  assert.equal(p.git('status', '--porcelain'), '');
  assert.equal(p.read(LIST), body);
});

test('#284 CLI: directly selected generated Unknown remains blocking beside another authored ID', (t) => {
  const p = project(t), unknown = 'unknown:U-GENERATED@COUPON-001-screen-spec';
  const units = structuredClone(UNITS);
  units.units[0].contracts = [unknown];
  p.bind([], [], units);
  // The raw Unknown selector reaches the generated row before the generated H2.
  // The authored view reaches a different ID after that H2 and generated block.
  const body = p.read(LIST).replace(/\n## Unknowns\n[\s\S]*?(?=\n## )/, '\n## Unknowns\n\n' +
    `${generated('| ID | Question | Status |\n|---|---|---|\n' +
      '| U-GENERATED | Selected generated question? | open |\n\n## Generated Summary\n\nOutput text.')}\n\n` +
    '| ID | Question | Status |\n|---|---|---|\n| U-AUTHORED | Another authored question? | resolved |\n');
  p.put(LIST, body); p.commit('select a raw generated Unknown beside another authored ID');

  const report = p.json(p.status('--owner', OWNER, '--json'));
  const row = report.owners[0].rows.find((entry) => entry.ref === unknown);
  assert.ok(row, 'the directly selected raw GENERATED Unknown must appear in the public binding report');
  assert.deepEqual([row.state, row.status, row.home, row.blocking_units],
    ['missing', 'open', LIST, ['list-behavior']]);
  const ready = p.readiness();
  assert.deepEqual([ready.authority, ready.ready], ['scoped', false]);
  assert.ok(ready.denials.some((entry) => entry.code === 'unit-uncertainty-unresolved' &&
    entry.application.uncertainty === unknown), 'readiness must deny the actual selected raw open Unknown');
  assert.equal(ready.requests[0].path_authorizations[0].allowed, false);
  assert.equal(p.git('status', '--porcelain'), '');
  assert.equal(p.read(LIST), body);
});

const unknownSelections = [['row', '#unknowns/U-GENERATED'], ['section', '#unknowns'], ['body', '']];
for (const [selection, suffix] of unknownSelections) test(`#284 CLI: artifact ${selection} selection keeps generated Unknown blocking when an independent authored table is added`, (t) => {
  const p = project(t), unknown = 'unknown:U-GENERATED@COUPON-001-screen-spec';
  const units = structuredClone(UNITS);
  units.units[0].contracts = [`artifact:COUPON-001-screen-spec${suffix}`];
  p.bind([], [], units);
  const original = p.read(LIST);
  const table = (row) => '| ID | Question | Status |\n|---|---|---|\n' + row;
  // There is deliberately no H2 inside this GENERATED block. Both physical
  // tables therefore belong to the same native Unknowns section after the edit.
  const selected = generated(table('| U-GENERATED | An explicitly selected generated question? | open |'));
  const independent = table('| U-AUTHORED | Independent authored question? | resolved |');
  let baseline;
  for (const [label, authored] of [['generated table alone', ''], ['independent authored table added', independent]]) {
    const body = original.replace(/\n## Unknowns\n[\s\S]*?(?=\n## )/,
      `\n## Unknowns\n\n${authored}\n\n${selected}\n`);
    assert.ok(body.includes(selected), 'the selected generated row and block stay identical');
    p.put(LIST, body); p.commit(label);

    const report = p.json(p.status('--owner', OWNER, '--json'));
    const row = report.owners[0].rows.find((entry) => entry.ref === unknown);
    assert.ok(row, `${label}: binding-status must retain the artifact-selected GENERATED Unknown`);
    const result = [row.state, row.status, row.home, row.blocking_units];
    assert.deepEqual(result, ['missing', 'open', LIST, ['list-behavior']], label);
    if (baseline) assert.deepEqual(result, baseline, 'adding a separate authored table must not clear the selected row');
    baseline = result;

    const ready = p.readiness();
    assert.deepEqual([ready.authority, ready.ready], ['scoped', false], label);
    assert.ok(ready.denials.some((entry) => entry.code === 'unit-uncertainty-unresolved' &&
      entry.application.uncertainty === unknown), `${label}: the selected open Unknown must deny the unit`);
    assert.equal(ready.requests[0].path_authorizations[0].allowed, false, label);
    assert.equal(p.git('status', '--porcelain'), '', label);
    assert.equal(p.read(LIST), body, label);
  }
});

// #285: a formatted H2 outside GENERATED shares the native `unknowns` slug with
// the owner's literal home. The public report must fail closed rather than list
// only the literal home's rows; the same heading inside GENERATED stays display.
test('#285 CLI: a real formatted duplicate Unknowns H2 fails closed instead of dropping its open row', (t) => {
  const p = project(t), formatted = 'unknown:U-FORMATTED@COUPON-001-screen-spec';
  const original = p.read(LIST);
  const duplicate = '## **Unknowns**\n\n| ID | Question | Status |\n|---|---|---|\n| U-FORMATTED | Formatted duplicate question? | open |';
  const withHeading = (text) => original.replace('\n## Open Decisions', `\n${text}\n\n## Open Decisions`);
  const baseline = p.rows()[U001], blockers = p.blocking();
  assert.ok(blockers.includes(U001));

  const display = withHeading(generated(duplicate));
  p.put(LIST, display); p.commit('GENERATED formatted Unknowns heading');
  const rows = p.rows();
  assert.equal(rows[formatted], undefined, 'a GENERATED heading and table remain display output');
  assert.deepEqual([rows[U001].status, rows[U001].home, rows[U001].blocking_units],
    [baseline.status, baseline.home, baseline.blocking_units]);
  assert.deepEqual(p.blocking(), blockers);

  const body = withHeading(duplicate);
  p.put(LIST, body); p.commit('real formatted duplicate Unknowns heading');
  const report = p.status('--owner', OWNER, '--json');
  assert.notEqual(report.status, 0, 'binding-status must not report only the literal home');
  assert.match(`${report.stdout}${report.stderr}`, /SW-REF-AMBIGUOUS/);
  const ready = p.readinessRun();
  assert.equal(ready.status, 2, 'readiness --work must stop instead of authorizing without the open row');
  assert.match(ready.stderr, /SW-REF-AMBIGUOUS/);
  assert.equal(p.git('status', '--porcelain'), '');
  assert.equal(p.read(LIST), body);
});

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
    [rows[ref].state, rows[ref].status, rows[ref].resolved, rows[ref].blocking_units, rows[ref].recorded, rows[ref].computed_basis_digest,
      rows[ref].components]),
  [['missing', 'open', false, ['list-behavior'], null, null, null], ['missing', 'resolved', true, [], null, null, null]]);
  assert.equal(rows[D003].blocking_units, null, 'only a missing binding reports the units it leaves blocked');
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
  assert.ok(text.stdout.includes('decision:D-001@COUPON-001-screen-spec  open  missing  — no binding; blocks list-behavior\n'), text.stdout);
  assert.ok(text.stdout.includes('decision:D-002@COUPON-001-screen-spec  resolved  missing\n'), text.stdout);
  for (const expected of [`${OWNER} (known units: list-behavior)`, `${U001}  open  stale (basis)`, `${D003}  open  stale (known-units)`,
    'decision:D-404@COUPON-001-screen-spec  -  unresolved', `computed ${unknown.computed_basis_digest}`, `approval_ref ${APPROVAL}`]) {
    assert.ok(text.stdout.includes(expected), `${expected}\n${text.stdout}`);
  }
  assert.equal(p.git('status', '--porcelain'), ''); assert.equal(p.git('rev-parse', 'HEAD').trim(), head);
  assert.deepEqual([LIST, DETAIL].map((file) => p.read(file)), files);
});

// Review r2: a row without a binding blocks the units its relations reach, which need not be all.
test('#275 binding-status: a missing binding reports only the units its row blocks', (t) => {
  const p = project(t), foreign = 'unknown:U-101@points-domain-rules';
  p.bind([], [], { version: 1, units: [...UNITS.units,
    { id: 'list-interaction', kind: 'behavior', contracts: ['artifact:COUPON-001-screen-spec#interaction-matrix'], sources: [] }] });
  p.put('docs/frontend-workflow/domains/points/domain-rules.md', '---\nartifact_id: points-domain-rules\nartifact_type: domain-rules\n' +
    'domain: points\nstatus: draft\n---\n\n# Points Domain Rules\n\n## Unknowns\n| ID | Question | Status |\n|---|---|---|\n' +
    '| U-101 | Does `artifact:COUPON-001-screen-spec#state-matrix` hold for points? | open |\n');
  p.commit('two units and a foreign Unknown');
  const rows = p.rows();
  assert.deepEqual([rows[foreign].state, rows[foreign].blocking_units], ['missing', ['list-behavior']]);
  assert.deepEqual(rows['decision:D-001@COUPON-001-screen-spec'].blocking_units, ['list-behavior', 'list-interaction']);
  const text = p.status();
  assert.ok(text.stdout.includes(`${foreign}  open  missing  — no binding; blocks list-behavior\n`), text.stdout);
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
