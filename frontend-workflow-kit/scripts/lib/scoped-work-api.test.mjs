import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KIT_ROOT } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { createScopedApiResolver } from './scoped-work-api.mjs';

const layout = loadLayoutProfile({ kitRoot: KIT_ROOT });
const ID = 'RESULT-001-screen-spec';
const OWNER = 'screen:RESULT-001';
const headers = ['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths'];
const api = (endpoint = '/results', confidence = 'confirmed', gate = 'active', tracking = '', slice = 'src/api/results/**') =>
  ['GET', endpoint, confidence, gate, tracking, slice];
const selector = (endpoint = '/results', method = 'GET') => ({ method, path: endpoint });
const work = (selections = [selector()]) => ({ version: 1, units: [{ id: 'client', kind: 'api-contract',
  contracts: [`artifact:${ID}#api-candidates`], sources: [], api_candidates: selections }] });
const table = (rows, columns = headers) => [`| ${columns.join(' | ')} |`,
  `|${columns.map(() => '---').join('|')}|`, ...rows.map((cells) => `| ${cells.join(' | ')} |`)].join('\n');
const bodyFor = (rows = [api()], columns = headers) => `# Screen\n\n## API Candidates\n${table(rows, columns)}\n\n## Notes\nUnrelated.\n`;

// Real file -> canonical target index + layout -> existing API analyzer -> D
// resolver. No fake readiness state or alternate permission model is involved.
function fixture(t, { body = bodyFor(), fm = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-api-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'screen.md');
  const metadata = JSON.parse(JSON.stringify({ artifact_id: ID, artifact_type: 'screen-spec', screen_id: 'RESULT-001',
    domain: 'result', status: 'draft', work_execution: work(), ...fm }));
  const write = (nextBody = body, nextMetadata = metadata) => fs.writeFileSync(file,
    `---\n${JSON.stringify(nextMetadata)}\n---\n${nextBody}`);
  write();
  const docs = [{ file, fm: metadata }];
  const targetIndex = buildReconciliationTargetIndex({ docs });
  const resolver = createScopedApiResolver({ targetIndex, projectRoot: root, layout });
  return { root, file, docs, metadata, targetIndex, resolver, write,
    run: (id = ID, owner = OWNER, unit = 'client') => resolver.unit(id, owner, unit) };
}

test('D API: real owner selection retains complete raw row and existing v2 slice analysis', (t) => {
  const row = [...api(), 'contract note'];
  const f = fixture(t, { body: bodyFor([row], [...headers, 'Notes']) });
  const result = f.run();
  assert.equal(result.owner, OWNER);
  assert.equal(result.unit, 'client');
  assert.equal(result.file, 'screen.md');
  assert.equal(result.metadata.status, 'draft', 'do not synthesize a confirmed owner');
  assert.deepEqual(result.selections, [selector()]);
  assert.deepEqual(result.candidates[0].cells, row);
  assert.deepEqual(result.candidates[0].headers, [...headers, 'Notes']);
  assert.deepEqual(result.candidates[0].candidate.safe_slice_paths, ['src/api/results/**']);
  assert.equal(result.candidates[0].candidate.confidence, 'confirmed');
  assert.equal(result.candidates[0].candidate.gate, 'active');
  for (const key of ['ready', 'allowed', 'basis_digest']) assert.equal(Object.hasOwn(result, key), false);
});

test('D API: actual declaration parser canonicalizes selector sets without modifying authored bytes', (t) => {
  const f = fixture(t, { body: bodyFor([api('/z', 'confirmed', 'active', '', 'src/api/z/**'), api()]),
    fm: { work_execution: work([selector('/z', 'get'), selector()]) } });
  const before = fs.readFileSync(f.file);
  const result = f.run();
  assert.deepEqual(result.selections, [selector(), selector('/z')]);
  result.selections[0].path = '/tamper';
  result.metadata.status = 'confirmed';
  result.candidates[0].candidate.safe_slice_paths.push('src/**');
  assert.deepEqual(fs.readFileSync(f.file), before);
  assert.equal(f.run().metadata.status, 'draft');
  assert.deepEqual(f.run().selections, [selector(), selector('/z')]);
  assert.throws(() => fixture(t, { fm: { work_execution: work([selector(), selector('/results', 'get')]) } }).run(), /duplicate/);
});

test('D API: endpoint identity is exact and duplicate native rows cannot select a first winner', (t) => {
  for (const rows of [[api('/other')], [api('/Results')], [api(), api()], [api(), ['get', ...api().slice(1)]]]) {
    assert.throws(() => fixture(t, { body: bodyFor(rows) }).run(), /SW-API-SELECTION/);
  }
  assert.throws(() => fixture(t, { fm: { work_execution: work([selector('/results/', 'GET')]) } }).run(), /SW-API-SELECTION/);
});

test('D API: legacy, missing, duplicate, fenced and commented candidate tables cannot become v2 evidence', (t) => {
  const normal = table([api()]);
  for (const body of ['## API Candidates\n- GET /results (confidence: confirmed)\n', '## Notes\nNo API.\n',
    `${bodyFor()}\n## API Candidates\n${normal}\n`,
    `## API Candidates\n${normal}\n\n${normal}\n`,
    `## API Candidates\n\`\`\`md\n${normal}\n\`\`\`\n`,
    `## API Candidates\n<!--\n${normal}\n-->\n`]) {
    assert.throws(() => fixture(t, { body }).run(), /SW-API-/);
  }
});

test('D API: raw widths, duplicate columns and comment-repaired authority cells fail closed', (t) => {
  const commented = api(); commented[2] = 'con<!-- hidden -->firmed';
  for (const body of [bodyFor([[...api(), 'extra']]), bodyFor([api().slice(0, -1)]),
    bodyFor([[...api(), 'src/api/hidden/**']], [...headers, 'slice paths']), bodyFor([commented])]) {
    assert.throws(() => fixture(t, { body }).run(), /SW-(API|REF)-/);
  }
  const linked = api(); linked[1] = '[/results](https://example.invalid)';
  assert.throws(() => fixture(t, { body: bodyFor([linked]) }).run(), /SW-API-/);
});

test('D API: existing no-API, invalid/deferred and narrow Slice Paths rules are not relaxed', (t) => {
  assert.throws(() => fixture(t, { fm: { api_required: false } }).run(), /SW-API-CONTRACT/);
  for (const row of [api('/results', 'confirmed', 'deferred', 'issue:#12'), api('/results', 'candidate', 'deferred'),
    api('/results', 'confirmed', 'active', '', 'src/**'), api('/results', 'confirmed', 'active', '', 'src/api/../api/results/**'),
    api('/results', 'confirmed', 'active', '', 'src/features/other/screens/**')]) {
    assert.throws(() => fixture(t, { body: bodyFor([row]) }).run(), /SW-API-CONTRACT/);
  }
  assert.throws(() => fixture(t, { body: bodyFor([api(), api('/later', 'candidate', 'deferred', 'issue:#12')]) }).run(), /SW-API-CONTRACT/);
});

test('D API: valid unconfirmed/deferred rows remain facts, not grants', (t) => {
  for (const row of [api('/results', 'candidate'), api('/results', 'candidate', 'deferred', 'issue:#12')]) {
    const result = fixture(t, { body: bodyFor([row]) }).run();
    assert.equal(result.candidates[0].candidate.confidence, 'candidate');
    assert.equal(result.candidates[0].candidate.gate, row[3]);
    assert.equal(result.candidates[0].candidate.tracking, row[4] || null);
    assert.equal(Object.hasOwn(result, 'ready'), false);
    assert.equal(Object.hasOwn(result.candidates[0], 'allowed'), false);
  }
});

test('D API: deferred Unknown tracking requires an exact unique canonical open row', (t) => {
  const base = bodyFor([api('/results', 'candidate', 'deferred', 'unknown:U-LATER')]);
  const unknown = '| ID | Question | Status |\n|---|---|---|\n| U-LATER | Later API? | open |';
  const result = fixture(t, { body: `${base}\n## Unknowns\n${unknown}\n` }).run();
  assert.deepEqual(result.candidates[0].tracking.selection.cells, ['U-LATER', 'Later API?', 'open']);
  for (const body of [`${base}\n## Notes\n${unknown}`, `${base}\n## Unknowns\n${unknown.replace('open', 'closed')}`,
    `${base}\n## Unknowns\n${unknown}\n| U-LATER | duplicate | open |`,
    `${base}\n## Unknowns\n${unknown.replace('U-LATER', 'U-<!-- hidden -->LATER')}`]) {
    assert.throws(() => fixture(t, { body }).run(), /SW-(API|REF)-/);
  }
});

test('D API: owner identity, declared unit and actual layout are required', (t) => {
  const f = fixture(t);
  assert.throws(() => f.run(ID, 'screen:OTHER-001'), /SW-API-OWNER/);
  assert.throws(() => f.run(ID, 'surface:RESULT-001'), /SW-API-OWNER/);
  assert.throws(() => f.run(ID, OWNER, 'missing'), /SW-API-UNIT/);
  assert.throws(() => fixture(t, { fm: { work_execution: undefined } }).run(), /SW-API-UNIT/);
  assert.throws(() => fixture(t, { fm: { work_execution: null } }).run());
  assert.throws(() => fixture(t, { fm: { artifact_type: 'domain-rules' } }).run(), /SW-API-OWNER/);
  assert.throws(() => createScopedApiResolver({ targetIndex: f.targetIndex, projectRoot: f.root }), /SW-API-LAYOUT/);
});

test('D API: stale indexed body or metadata cannot substitute current API evidence', (t) => {
  const f = fixture(t);
  f.write(bodyFor([api('/changed')]));
  assert.throws(() => f.run(), /SW-API-SNAPSHOT/);
  const other = fixture(t);
  other.write(undefined, { ...other.metadata, status: 'confirmed' });
  assert.throws(() => other.run(), /SW-API-SNAPSHOT/);
});

test('D API: unselected valid row/section edits do not widen the returned selection', (t) => {
  const first = fixture(t, { body: bodyFor([api(), api('/other', 'candidate', 'active', '', 'src/api/other/**')]) }).run();
  const changed = fixture(t, { body: bodyFor([api(), api('/different', 'confirmed', 'active', '', 'src/api/different/**')])
    .replace('Unrelated.', 'Unrelated new notes.') }).run();
  assert.deepEqual(first, changed, 'the eventual R1 projector must not hash the entire API section for row selection');
});

test('D API: surface API evidence belongs to the surface, without inventing a Screen ID or host permission', (t) => {
  const declared = work();
  declared.units[0].host_units = { 'RESULT-001': 'legacy-current', 'RESULT-002': 'legacy-current' };
  const f = fixture(t, { fm: { artifact_type: 'shared-surface-spec', screen_id: undefined,
    surface_id: 'RESULT-PANEL', work_execution: declared } });
  const result = f.run(ID, 'surface:RESULT-PANEL');
  assert.equal(result.owner, 'surface:RESULT-PANEL');
  assert.equal(Object.hasOwn(result.metadata, 'screen_id'), false);
  assert.equal(result.candidates.length, 1);
  assert.equal(Object.hasOwn(result, 'host_permissions'), false);
});

test('D API: a declared no-API behavior unit needs no fabricated candidate table', (t) => {
  const declared = work();
  declared.units[0].kind = 'behavior';
  delete declared.units[0].api_candidates;
  declared.units[0].contracts = [`artifact:${ID}#rules`];
  const result = fixture(t, { body: '## Rules\nExisting non-API behavior.\n',
    fm: { api_required: false, work_execution: declared } }).run();
  assert.deepEqual(result.selections, []);
  assert.deepEqual(result.candidates, []);
  assert.equal(Object.hasOwn(result, 'ready'), false);
});
