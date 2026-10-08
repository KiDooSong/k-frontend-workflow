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
// Re-pinned for #262: open C-008 and C-012 name only COUPON-002 in 영향 화면 and hold no typed
// reference, so they no longer apply to the COUPON-001 unit; that changes D-001's basis too. Resolved
// rows keep their relations whatever the cell names. Against 7e943bb those two denials are the only
// difference (evidence, reviews and other denials are equal).
// Re-pinned for #275: scope-basis-v2 hashes only D-001's relation closure and the unit facts, so the
// recorded digest is recomputed once. Against the #262 pin the envelope differs only in the bytes that
// record it: the hash of the COUPON-001 spec, the docs tree oid and the commit tree. Denials, evidence
// and reviews are equal. The v2 bytes later gained the related rows that apply to no owner, one
// merged relation evidence graph, and lost metadata decision_refs lists (reviews r1-r3); the
// envelope again differs only there.
const BASIS = 'sha256:3d281826f4fd31aebdd34ab1f425f882da927c405664dfd4cf3151420f9aba45';
const ENVELOPE = '464a1c7eaa31d9b2189395dfbc412431a75bf8d8420b1e956cd648c0fc092eac';
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

test('#265 golden: the scoped envelope, basis digest and error text stay pinned (re-pinned for #262, digest for #275)', (t) => {
  const run = readiness(t, pinned(ROWS));
  const envelope = json(run);
  assert.deepEqual(envelope.denials.filter((entry) => entry.code === 'unit-decision-blocked').flatMap((entry) => entry.decisions),
    ['decision:D-002@COUPON-001-screen-spec', 'decision:D-003@COUPON-001-screen-spec'], 'the pinned basis digest keeps the D-001 binding current');
  const stdout = run.stdout.split(envelope.snapshot.commit).join('<commit>');
  assert.equal(createHash('sha256').update(stdout).digest('hex'), ENVELOPE, 'the scoped envelope differs from the #275 pin');

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
    assert.deepEqual(legacySources(env), [{ input_id: LEGACY_INPUT, ref: null, reason: 'legacy-summary-only', summary: { input_id: LEGACY_INPUT, source: 'meeting',
      classification: 'simple-update', reconcile_status: 'reconciled', result, touched_artifacts: 'artifact:COUPON-001-screen-spec',
      created_items: '-', supersedes: '-',
      row: `| ${LEGACY_INPUT} | meeting | simple-update | reconciled | ${result} | artifact:COUPON-001-screen-spec | - | - |` } }]);
  }
  // An annotated Result is not a canonical code, also when an HTML comment hides the note from the table parser.
  // An Item connects at item level instead of through the Summary.
  for (const result of ['accepted — kept after review', 'accepted <!-- kept after review -->']) {
    const annotated = json(readiness(t, legacySource({ result })));
    assert.ok(annotated.denials.some((entry) => entry.code === 'source-effect-unconnected'), result); assert.deepEqual(reviews(annotated), [], result);
  }
  const backfilled = json(readiness(t, legacySource({ items: true })));
  assert.deepEqual(codes(backfilled), codes(baseline)); assert.deepEqual(reviews(backfilled), []);
  assert.equal(legacySources(backfilled), undefined);
});

// #262: the issue's Unknown variants (U1-U4) and the 영향 화면 rule through the public CLI.
const U = '| U-001 | 현재 쿠폰 API 응답 예시(목록/상세)는 어디에 있는가? | open |';
const resolveU = ({ read, put }) => put(LIST, read(LIST).replace(U, U.replace('| open |', '| resolved |')));
const resolveDecisions = ({ read, put }) => put(LIST, read(LIST).replaceAll('| PM | open |', '| PM | resolved |').replaceAll('| BE | open |', '| BE | resolved |'));
const conflictRegister = (rows) => ({ put }) => put('docs/frontend-workflow/global/conflicts.md', '---\nartifact_id: conflicts\nartifact_type: conflicts\nstatus: draft\n---\n\n# Conflicts\n\n' +
  `| ID | 충돌 지점 | A (출처/값) | B (출처/값) | 영향 화면 | Status |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n`);
const both = (...edits) => (io) => { for (const edit of edits) edit(io); };

test('#262 example: a resolved Unknown stops blocking; a Conflict naming only another screen does not apply', (t) => {
  const uncertain = (env) => env.denials.filter((entry) => entry.code === 'unit-uncertainty-unresolved').map((entry) => entry.application.uncertainty).sort();
  assert.deepEqual(uncertain(json(readiness(t))), ['unknown:U-001@COUPON-001-screen-spec']);
  const resolved = json(readiness(t, resolveU));
  const removed = json(readiness(t, ({ read, put }) => put(LIST, read(LIST).replace(`${U}\n`, ''))));
  assert.deepEqual(resolved.denials, removed.denials, 'a resolved row blocks no more than no row');
  assert.deepEqual(codes(resolved), ['api-selection-required', 'unit-decision-blocked']);
  assert.deepEqual(codes(json(readiness(t, both(resolveU, resolveDecisions)))), ['api-selection-required']);
  const named = json(readiness(t, both(resolveU, conflictRegister([
    '| C-001 | Detail banner | Planning | Figma | COUPON-002 | open |',
    '| C-002 | List badge | Planning | Figma | COUPON-002 · COUPON-001 | open |',
    '| C-003 | Everywhere | Planning | Figma | global | open |',
    '| C-004 | Detail copy | Planning | Figma | COUPON-002 상세 | open |']))));
  assert.deepEqual(uncertain(named), ['conflict:C-002@conflicts', 'conflict:C-003@conflicts', 'conflict:C-004@conflicts']);
});
