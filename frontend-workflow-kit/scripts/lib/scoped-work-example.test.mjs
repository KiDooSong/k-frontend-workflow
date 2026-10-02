import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { KIT_ROOT } from './util.mjs';

// #260 regression: the issue's coupon-feature repro through the public CLI. Only
// COUPON-001 is adopted; each variant changes one document format that the
// general contract accepts.
const LIST = 'docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md';
const DETAIL = 'docs/frontend-workflow/domains/coupons/screens/coupon-detail/screen-spec.md';
const ENTRY = 'src/features/coupons/screens/CouponListScreen.tsx';
const WORK = { version: 1, owners: ['screen:COUPON-001'], profiles: ['visual', 'behavior'], role_limits: {
  visual: ['screen', 'domain_component', 'hook', 'test'], behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] };
const UNITS = { version: 1, units: [{ id: 'list-behavior', kind: 'behavior', contracts: ['artifact:COUPON-001-screen-spec#state-matrix'], sources: [] }] };

function readiness(t, edit = () => {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-example-')));
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-example-request-')));
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); });
  for (const dir of ['docs', 'src']) fs.cpSync(path.join(KIT_ROOT, 'examples/coupon-feature', dir), path.join(root, dir), { recursive: true });
  const put = (name, text) => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), text); };
  const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
  put('config/policy.yaml', `${fs.readFileSync(path.join(KIT_ROOT, 'policies/implementation-mode-policy.yaml'), 'utf8')}\nwork_execution: ${JSON.stringify(WORK)}\n`);
  put('config/manifest.yaml', fs.readFileSync(path.join(KIT_ROOT, 'catalog/artifact-manifest.yaml'), 'utf8'));
  put('config/layout.yaml', fs.readFileSync(path.join(KIT_ROOT, 'presets/expo-feature.yaml'), 'utf8'));
  const list = read(LIST), end = list.indexOf('\n---\n', 4);
  put(LIST, `${list.slice(0, end)}\nscreen_entry: ${ENTRY}\nwork_execution: ${JSON.stringify(UNITS)}${list.slice(end)}`);
  edit({ read, put });
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q'); git('config', 'maintenance.auto', 'false'); git('config', 'gc.auto', '0');
  git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'test'); git('add', '-A'); git('commit', '-qm', 'baseline');
  const work = path.join(outside, 'request.json');
  fs.writeFileSync(work, JSON.stringify({ version: 1, origin_inputs: [], requests: [
    { owner: 'screen:COUPON-001', authority: 'scoped', unit: 'list-behavior', targets: [{ path: ENTRY, change: 'M' }] }] }));
  return spawnSync(process.execPath, [path.join(KIT_ROOT, 'scripts', 'readiness.mjs'), '--work', work, '--root', root,
    '--docs', 'docs/frontend-workflow', '--src', 'src', '--policy', 'config/policy.yaml', '--manifest', 'config/manifest.yaml',
    '--layout', 'config/layout.yaml', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 });
}
const json = (run) => { assert.equal(run.status, 0, run.stderr || run.stdout); return JSON.parse(run.stdout); };
const codes = (env) => [...new Set(env.denials.map((entry) => entry.code))].sort();
const append = (name, text) => ({ read, put }) => put(name, `${read(name)}${text}`);
const PROSE = '\n## Unknowns\n\nNone — no new open questions for this screen.\n';

test('D #260 example: general-contract formats keep a structured scoped result; the adopted owner stays fail-closed', (t) => {
  const baseline = json(readiness(t));
  assert.equal(baseline.authority, 'scoped'); assert.equal(baseline.ready, false);

  // B: another screen's Unknown ID without the U- prefix.
  const other = json(readiness(t, append(DETAIL, '\n## Unknowns\n\n| ID | Question | Status |\n|---|---|---|\n| COUPON-002-U001 | Where is the detail response sample? | open |\n')));
  assert.deepEqual(other.denials, baseline.denials);

  // C: the adopted screen's local decision ID without the D- prefix.
  const local = json(readiness(t, ({ read, put }) => put(LIST, read(LIST).replaceAll('D-001', 'COUPON-001-D001'))));
  assert.deepEqual(codes(local), codes(baseline));
  assert.ok(local.denials.some((entry) => JSON.stringify(entry).includes('decision:COUPON-001-D001@COUPON-001-screen-spec')));

  // D: another screen's prose-only Unknowns section is reported, not fatal.
  const prose = json(readiness(t, append(DETAIL, PROSE)));
  assert.deepEqual(prose.denials, baseline.denials);
  assert.ok(prose.required_reviews.some((entry) => entry.startsWith(`Unaudited uncertainty section ${DETAIL}#unknowns:`)));
  assert.equal(baseline.required_reviews.some((entry) => entry.startsWith('Unaudited')), false);

  // A reference to the selected contract keeps it fatal, also when YAML escapes it.
  const linked = readiness(t, ({ read, put }) => {
    const detail = read(DETAIL);
    put(DETAIL, `${detail.replace('depends_on: [navigation-map]', 'depends_on: [navigation-map, "artifact\\u003aCOUPON-001-screen-spec#state-matrix"]')}${PROSE}`);
  });
  assert.equal(linked.status, 2); assert.match(linked.stderr, /SW-UNCERTAINTY: one canonical unknown table required/);

  // The same prose section on the adopted owner still stops the preflight.
  const own = readiness(t, ({ read, put }) => put(LIST, read(LIST).replace(/\n## Unknowns\n[\s\S]*?(?=\n## )/, PROSE.trimEnd())));
  assert.equal(own.status, 2); assert.match(own.stderr, /SW-UNCERTAINTY: one canonical unknown table required/);
});

// #265 regression: output pinned from 97b25c7, the commit before the shared parse. The register mixes
// open rows with and without typed refs and resolved rows. D-001's scope binding carries the basis
// digest that commit computed, so D-001 stops blocking only while the digest is unchanged. Only
// snapshot.commit depends on the run. A change meant to alter this output re-pins it and says so.
const BASIS = 'sha256:72d340fb9daa7aa73b848461c728d8a4e1b9d2f3b187c0da4757c7ff476569fd';
const ENVELOPE = 'd3657b62c28f8b1f78ef5aa0928597a121731e6ef2899c9ce65c22fe264c4a4b';
const SCOPES = { version: 1, bindings: [{ decision_id: 'D-001', owner: 'screen:COUPON-001', known_units: ['list-behavior'],
  blocks: [], basis_digest: BASIS, approval_ref: 'review:golden' }] };
const ROWS = Array.from({ length: 12 }, (_, i) => {
  const a = i % 3 === 0 ? '`artifact:COUPON-001-screen-spec#state-matrix`' : `A ${i + 1}`;
  return `| C-${String(i + 1).padStart(3, '0')} | Conflict ${i + 1} | ${a} | B ${i + 1} | COUPON-00${(i % 2) + 1} | ${i % 4 === 1 ? 'resolved' : 'open'} |`;
});
const pinned = (rows) => ({ read, put }) => {
  put(LIST, read(LIST).replace('\n---\n', `\ndecision_work_scopes: ${JSON.stringify(SCOPES)}\n---\n`));
  put(DETAIL, `${read(DETAIL)}${PROSE}`);
  put('docs/frontend-workflow/global/conflicts.md', '---\nartifact_id: conflicts\nartifact_type: conflicts\nstatus: draft\n---\n\n# Conflicts\n\n' +
    `| ID | 충돌 지점 | A (출처/값) | B (출처/값) | 영향 화면 | Status |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n`);
};

test('#265 golden: the scoped envelope, basis digest and error text stay as they were before the shared parse', (t) => {
  const run = readiness(t, pinned(ROWS));
  const envelope = json(run);
  assert.deepEqual(envelope.denials.filter((entry) => entry.code === 'unit-decision-blocked').flatMap((entry) => entry.decisions),
    ['decision:D-002@COUPON-001-screen-spec', 'decision:D-003@COUPON-001-screen-spec'], 'the pinned basis digest keeps the D-001 binding current');
  const stdout = run.stdout.split(envelope.snapshot.commit).join('<commit>');
  assert.equal(createHash('sha256').update(stdout).digest('hex'), ENVELOPE, 'the scoped envelope differs from 97b25c7');

  const width = readiness(t, pinned(ROWS.map((row, i) => (i === 5 ? `${row} extra |` : row))));
  assert.deepEqual([width.status, width.stdout, width.stderr], [2, '', 'readiness: SW-REF-TABLE: row width differs from header\n']);
  const duplicate = readiness(t, pinned([...ROWS.slice(0, 4), ROWS[3], ...ROWS.slice(4)]));
  assert.deepEqual([duplicate.status, duplicate.stdout, duplicate.stderr],
    [2, '', 'readiness: SW-UNCERTAINTY: duplicate uncertainty conflict:C-004@conflicts\n']);
});

// #269: a summary-only legacy input (captured before structured_since) cited by the selected contract.
const LEGACY_INPUT = 'IN-20260601-meeting-001';
const WIREFRAME = '  - { type: wireframe, ref: docs/raw/wireframes/coupon-list.md }\n';
const legacySource = ({ result = 'accepted', items = false } = {}) => ({ read, put }) => {
  put(LIST, read(LIST).replace(WIREFRAME, `${WIREFRAME}  - { type: meeting, ref: ${LEGACY_INPUT} }\n`));
  put(`docs/frontend-workflow/inputs/${LEGACY_INPUT}.md`, ['---', `input_id: "${LEGACY_INPUT}"`, 'input_type: "meeting"',
    'source_type: "meeting"', 'source_ref: "meeting:coupon-expiry-review"', 'captured_at: "2026-06-01T00:00:00+09:00"',
    'captured_by: "meeting-input"', 'status: "captured"', 'affected_domains: ["coupons"]', 'affected_screens: ["COUPON-001"]', '---', '',
    '# Coupon expiry review', '', '## Extracted Facts', '', '- Expired coupons are listed after active ones, greyed out.', ''].join('\n'));
  const item = `| ${LEGACY_INPUT} | 01 | compatible-fact | simple-update | update | artifact:COUPON-001-screen-spec#state-matrix | ` +
    `input:${LEGACY_INPUT}#extracted-facts/01 | inherit | statement | inherit |\n`;
  put('docs/frontend-workflow/_meta/reconciliation-register.md', '---\ntitle: Reconciliation Register\nstatus: draft\nkind: meta-register\n' +
    'reconciliation_contract: 2\nreview_profile: reconcile-stage04-v1\nstructured_since: "2026-09-01T00:00:00+09:00"\n---\n\n' +
    '# Reconciliation Register\n\n| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |\n' +
    `|---|---|---|---|---|---|---|---|\n| ${LEGACY_INPUT} | meeting | simple-update | reconciled | ${result} | artifact:COUPON-001-screen-spec | - | - |\n\n` +
    '## Reconciliation Items\n\n| Input ID | Item | Basis | Classification | Effect | Target | Evidence | Source Ref | Source Unit | Captured At |\n' +
    `|---|---|---|---|---|---|---|---|---|---|\n${items ? item : ''}`);
};

test('#269 example: a summary-only legacy source connects through its reconciled Summary and is listed for review', (t) => {
  const reviews = (env) => env.required_reviews.filter((entry) => entry.startsWith('Legacy summary-only source'));
  const legacySources = (env) => env.requests[0].evidence.legacy_sources?.map(({ input_sha256, ...entry }) => entry);
  const baseline = json(readiness(t));
  for (const result of ['accepted', 'pending-user-decision']) {
    const env = json(readiness(t, legacySource({ result })));
    assert.deepEqual(codes(env), codes(baseline), result);
    assert.deepEqual(reviews(env).map((entry) => entry.slice(0, entry.indexOf(')') + 1)),
      [`Legacy summary-only source ${LEGACY_INPUT} (reconciled + ${result})`]);
    assert.deepEqual(legacySources(env), [{ input_id: LEGACY_INPUT, ref: null, reason: 'legacy-summary-only', reconcile_status: 'reconciled', result }]);
  }
  // An annotated Result is not a canonical code; an Item connects at item level instead of through the Summary.
  const annotated = json(readiness(t, legacySource({ result: 'accepted — kept after review' })));
  assert.ok(annotated.denials.some((entry) => entry.code === 'source-effect-unconnected')); assert.deepEqual(reviews(annotated), []);
  const backfilled = json(readiness(t, legacySource({ items: true })));
  assert.deepEqual(codes(backfilled), codes(baseline)); assert.deepEqual(reviews(backfilled), []);
  assert.equal(legacySources(backfilled), undefined);
});
