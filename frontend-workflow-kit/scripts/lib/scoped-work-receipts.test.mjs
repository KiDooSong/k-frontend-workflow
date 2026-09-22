import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { loadInputArtifact } from './input-artifact.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { hashBytes } from './current-work-request.mjs';
import { resolveScopedCoverageBasis } from './scoped-work-coverage.mjs';
import { loadScopedCoverageReports, inspectScopedSourceCoverageFromReports } from './scoped-work-receipts.mjs';

const OWNER = 'screen:RESULT-001', INPUT = 'IN-20260917-meeting-001';
const REF = `input:${INPUT}#extracted-facts/01`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const fence = (value, mark = '```') => `${mark}work-coverage\n${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n${mark}\n`;
const yaml = (value) => Object.entries(value).map(([key, entry]) => `${key}: ${JSON.stringify(entry)}`).join('\n');
// Synthetic byte hashes are only parser fixtures, never coverage or approvals.
const receipt = () => ({ version: 1, owner: OWNER, unit: 'known', input_id: INPUT, item_ids: ['01'], source_refs: [REF],
  input_sha256: `sha256:${'1'.repeat(64)}`, effects_sha256: `sha256:${'2'.repeat(64)}`,
  contracts_sha256: `sha256:${'3'.repeat(64)}`, review_scope: 'reconcile-stage04-v1', coverage: 'complete-for-unit' });
function files(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-receipt-files-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text); return file; };
  const load = (coverage_reports = []) => loadScopedCoverageReports({ projectRoot: root, coverage_reports });
  return { root, put, load };
}

for (const [label, mark, eol] of [['YAML/LF', '```', '\n'], ['tilde/CRLF', '~~~', '\r\n'], ['long-fence/CR', '````', '\r']]) {
  test(`D receipt files: ${label} loads exact authored fields and pins original bytes`, (t) => {
    const f = files(t), value = receipt(), text = fence(yaml(value), mark).replaceAll('\n', eol);
    const file = f.put('reviews/result.md', text), out = f.load([file]);
    assert.deepEqual(out.receipts, [value]);
    assert.deepEqual(out.read_set, [{ file, sha256: hashBytes(Buffer.from(text)) }]);
    assert.deepEqual(out.records, [{ file, sha256: out.read_set[0].sha256, receipt: value }]);
  });
}

test('D receipt files: review Markdown need not invent frontmatter or a required output directory', (t) => {
  const f = files(t), a = f.put('consumer/review-result.md', '# Stage 04\n\n' + fence(receipt()));
  const before = f.load([a]);
  f.put(a, md({ custom_report_metadata: 'retained' }, '# Stage 04\n\n' + fence(receipt())));
  const after = f.load([a]);
  assert.deepEqual(after.receipts, before.receipts); assert.notDeepEqual(after.read_set, before.read_set);
});

test('D receipt files: report and block order are sets without mutating the selected paths', (t) => {
  const f = files(t), a = f.put('a.md', fence(receipt())), b = f.put('b.md', fence({ ...receipt(), unit: 'other' }));
  const paths = [b, a], copy = [...paths];
  assert.deepEqual(f.load(paths), f.load([a, b])); assert.deepEqual(paths, copy);
  f.put(a, fence({ ...receipt(), unit: 'other' }) + '\n' + fence(receipt()));
  assert.equal(f.load([a]).receipts.length, 2);
});

test('D receipt files: missing selection stays empty; an explicitly selected empty report fails', (t) => {
  const f = files(t); assert.deepEqual(f.load(), { receipts: [], records: [], read_set: [] });
  const file = f.put('empty.md', '# Review\nAll checked.');
  assert.throws(() => f.load([file]), /no root work-coverage fence/);
  assert.throws(() => f.load(['missing.md']));
});

test('D receipt files: duplicate identities fail across blocks and files even with differing hashes', (t) => {
  const f = files(t), a = f.put('a.md', fence(receipt())), b = f.put('b.md', fence({ ...receipt(), input_sha256: `sha256:${'9'.repeat(64)}` }));
  assert.throws(() => f.load([a, b]), /duplicate/);
  f.put(a, fence(receipt()) + '\n' + fence(receipt())); assert.throws(() => f.load([a]), /duplicate/);
  assert.throws(() => f.load([b, b]), /duplicate/);
});

test('D receipt files: malformed YAML, duplicate keys and unknown fields are not discarded', (t) => {
  const f = files(t);
  for (const text of ['owner: [', yaml(receipt()) + '\nunit: other', JSON.stringify({ ...receipt(), approved: true }), 'null', '[]']) {
    const file = f.put('bad.md', fence(text)); assert.throws(() => f.load([file]));
  }
});

test('D receipt files: null, wrong version/profile, empty selectors and invalid IDs fail actual receipt parsing', (t) => {
  const f = files(t);
  for (const patch of [{ version: 2 }, { review_scope: 'accepted' }, { item_ids: [] }, { item_ids: ['1'] },
    { source_refs: [] }, { input_sha256: null }, { coverage: 'accepted' }]) {
    const file = f.put('bad.md', fence({ ...receipt(), ...patch })); assert.throws(() => f.load([file]));
  }
});

test('D receipt files: nested examples, HTML and foreign code fences cannot impersonate attachments', (t) => {
  const f = files(t), fake = fence({ ...receipt(), unit: 'example' });
  const examples = ['<!--\n' + fake + '\n-->\n', fake.split('\n').map((line) => '> ' + line).join('\n'),
    '````markdown\n' + fake + '\n````\n', fake.split('\n').map((line) => '    ' + line).join('\n')];
  for (const example of examples) {
    const file = f.put('review.md', example); assert.throws(() => f.load([file]), /no root work-coverage fence/);
    f.put(file, example + '\n\n' + fence(receipt())); assert.deepEqual(f.load([file]).receipts, [receipt()]);
  }
});

test('D receipt files: unterminated fences, wrong closers and extra fence metadata are rejected', (t) => {
  const f = files(t);
  for (const text of ['```work-coverage\n' + yaml(receipt()), '```work-coverage\n' + yaml(receipt()) + '\n~~~',
    '```work-coverage example\n' + yaml(receipt()) + '\n```']) {
    assert.throws(() => f.load([f.put('bad.md', text)]), /fence/);
  }
});

test('D receipt files: malformed optional report frontmatter does not hide invalid data', (t) => {
  const f = files(t), file = f.put('bad.md', '---\nbroken: [\n---\n\n' + fence(receipt()));
  assert.throws(() => f.load([file]), /frontmatter/);
});

test('D receipt files: routing pairs survive parsing without becoming human or semantic approval', (t) => {
  const f = files(t), value = { ...receipt(), origin_source_refs: [], origin_relation: 'no-effect-on-unit' };
  assert.deepEqual(f.load([f.put('routing.md', fence(value))]).receipts, [value]);
  for (const field of ['origin_source_refs', 'origin_relation']) {
    const invalid = { ...value }; delete invalid[field];
    assert.throws(() => f.load([f.put('bad.md', fence(invalid))]), /together/);
  }
});

test('D receipt files: absolute, escaping, noncanonical and symlink paths never become selected report files', (t) => {
  const f = files(t); f.put('real.md', fence(receipt()));
  for (const file of [path.join(f.root, 'real.md'), '../real.md', './real.md', 'dir/../real.md']) assert.throws(() => f.load([file]));
  fs.symlinkSync(path.join(f.root, 'real.md'), path.join(f.root, 'alias.md'));
  assert.throws(() => f.load(['alias.md']));
  assert.throws(() => f.load(['.']));
});

const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
function source(t) {
  const f = files(t), docs = [];
  const doc = (name, fm, body) => { f.put(name, md(fm, body)); docs.push({ file: path.join(f.root, name), fm }); };
  const inputFile = path.join(f.root, `${INPUT}.md`);
  f.put(`${INPUT}.md`, md({ input_id: INPUT, input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting:receipt-fixture',
    captured_at: '2026-09-17T00:00:00Z', captured_by: 'test', status: 'captured', affected_domains: ['result'], affected_screens: ['RESULT-001'] },
  '## Extracted Facts\n- Actual selected fact.'));
  doc('contract.md', { artifact_id: 'DOC', artifact_type: 'business-rules', domain: 'result', status: 'draft' }, '## Rules\nSelected rule.');
  doc('screen.md', { artifact_id: 'SCREEN', artifact_type: 'screen-spec', screen_id: 'RESULT-001', domain: 'result', status: 'draft',
    screen_entry: 'src/features/result/screens/RESULT-001.tsx', work_execution: { version: 1, units: [{ id: 'known', kind: 'behavior',
      contracts: ['artifact:DOC#rules'], sources: [{ input_id: INPUT, items: ['01'], source_refs: [REF] }] }] } }, '## Notes\nNot permission.');
  const registerFile = path.join(f.root, 'register.md');
  f.put('register.md', md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' },
    table(REQUIRED_REGISTER_COLS, [[INPUT, 'meeting', 'simple-update', 'partially-reconciled', 'pending', 'artifact:DOC', '-', '-']]) +
    '\n\n## Reconciliation Items\n' + table(REQUIRED_ITEM_COLS, [[INPUT, '01', 'compatible-fact', 'simple-update', 'update',
      'artifact:DOC#rules', REF, 'inherit', 'statement', 'inherit']])));
  const options = () => ({ owner: OWNER, unit: 'known', inputId: INPUT, projectRoot: f.root, registerFile,
    inputArtifacts: [loadInputArtifact(inputFile)], targetIndex: buildReconciliationTargetIndex({ docs }) });
  const value = { ...resolveScopedCoverageBasis(options()).basis, review_scope: 'reconcile-stage04-v1', coverage: 'complete-for-unit' };
  const report = f.put('actual-review.md', fence(yaml(value)));
  const run = (coverage_reports = [report], extra = {}) => inspectScopedSourceCoverageFromReports({ ...options(), coverage_reports, ...extra });
  return { ...f, inputFile, report, value, options, run };
}
const noPermit = (out) => {
  for (const field of ['ready', 'allowed', 'basis_digest', 'effective_binding']) assert.equal(Object.hasOwn(out, field), false);
  for (const field of ['semantic_coverage_verified', 'origin_relation_verified', 'approval_verified']) assert.equal(out[field], false);
};

test('D receipt files: actual source inspection adopts only the file-backed receipt and merges its byte pin', (t) => {
  const f = source(t), before = fs.readFileSync(path.join(f.root, f.report)), out = f.run();
  assert.equal(out.receipt_state, 'current'); assert.equal(out.receipt_required, true); noPermit(out);
  assert.deepEqual(out.coverage_report, { file: f.report, sha256: hashBytes(before) });
  assert.ok(out.read_set.some((entry) => entry.file === f.report && entry.sha256 === hashBytes(before)));
  assert.deepEqual(fs.readFileSync(path.join(f.root, f.report)), before);
});

test('D receipt files: memory receipts cannot bypass report transport, even when byte-current', (t) => {
  const f = source(t);
  for (const receipts of [[], [f.value], undefined]) assert.throws(() => f.run([], { receipts }), /in-memory receipts/);
});

test('D receipt files: no report or other-unit report stays missing instead of borrowing coverage', (t) => {
  const f = source(t); const empty = f.run([]); assert.equal(empty.receipt_state, 'missing'); assert.equal(empty.coverage_report, null); noPermit(empty);
  f.put(f.report, fence({ ...f.value, unit: 'other' }));
  const out = f.run(); assert.equal(out.receipt_state, 'missing'); assert.equal(out.coverage_report, null); noPermit(out);
});

test('D receipt files: source bytes changing after the report was authored make file-backed coverage stale', (t) => {
  const f = source(t); fs.appendFileSync(f.inputFile, '\n\n## Notes\nAdditional source bytes.');
  const out = f.run(); assert.equal(out.receipt_state, 'stale'); assert.deepEqual(out.receipt_mismatches, ['input_sha256']); noPermit(out);
});

test('D receipt files: real report mutation during source evaluation invalidates the pinned snapshot', (t) => {
  const f = source(t), options = f.options(), original = fs.openSync, owner = path.join(f.root, 'screen.md');
  let changed = false;
  t.mock.method(fs, 'openSync', function (file, ...args) {
    const fd = original.call(this, file, ...args);
    if (!changed && file === owner) { changed = true; fs.appendFileSync(path.join(f.root, f.report), '\nChanged during evaluation.'); }
    return fd;
  });
  assert.throws(() => inspectScopedSourceCoverageFromReports({ ...options, coverage_reports: [f.report] }), /snapshot changed/); assert.equal(changed, true);
});

test('D receipt files: routing-only attachment is preserved without granting positive source coverage', (t) => {
  const f = source(t); f.put(f.report, fence({ ...f.value, origin_source_refs: [REF], origin_relation: 'no-effect-on-unit' }));
  const out = f.run(); assert.equal(out.receipt_state, 'routing-only'); noPermit(out);
});
