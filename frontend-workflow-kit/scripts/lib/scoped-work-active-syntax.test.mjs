// Active work may reuse a document that exceeds the retained syntax budgets.
// The real file stays below the supported input limit and is never a fixture
// that requires expanding the process heap or a caller-supplied authority cache.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KIT_ROOT } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { reconciliationParseStats, reconciliationSyntaxCacheStats } from './reconciliation-markdown-ast.mjs';
import { resolveScopedUncertaintyProjection } from './scoped-work-uncertainty.mjs';
import { CURRENT_WORK_INPUT_LIMIT, hashBytes } from './current-work-request.mjs';

const OWNER = 'screen:ACTIVE-001', CONTRACT = 'artifact:ACTIVE-RULES#rules';
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n${body}`;
const expectedRef = (i) => `unknown:U-${i}@ACTIVE-LARGE`;

function fixture(t, rows, { selectUnknowns = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-active-syntax-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs'), docs = [];
  fs.mkdirSync(docsDir);
  const put = (name, fm, body) => {
    const file = path.join(docsDir, name);
    fs.writeFileSync(file, md(fm, body)); docs.push({ file, fm }); return file;
  };
  const policyFile = path.join(root, 'policy.yaml'), policyOverlayFile = path.join(root, 'adoption.yaml');
  fs.writeFileSync(policyFile, '{}');
  fs.writeFileSync(policyOverlayFile, JSON.stringify({ work_execution: { version: 1, owners: [OWNER], profiles: ['behavior'],
    role_limits: { behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } }));
  put('screen.md', { artifact_id: 'ACTIVE-SCREEN', artifact_type: 'screen-spec', screen_id: 'ACTIVE-001',
    domain: 'active', status: 'draft', api_required: false, screen_entry: 'src/features/active/screens/ActiveScreen.tsx',
    work_execution: { version: 1, units: [{ id: 'known', kind: 'behavior',
      contracts: [selectUnknowns ? 'artifact:ACTIVE-LARGE#unknowns' : CONTRACT], sources: [] }] } },
  '## Notes\nOne selected owner.');
  put('rules.md', { artifact_id: 'ACTIVE-RULES', artifact_type: 'domain-rules', domain: 'active', status: 'confirmed' },
    '## Rules\nPreserve behavior.');
  const fm = { artifact_id: 'ACTIVE-LARGE', artifact_type: 'domain-rules', domain: 'other', status: 'draft' };
  const rowsBody = '## Unknowns\n| ID | Question | Status |\n|---|---|---|\n' +
    Array.from({ length: rows }, (_, i) => `| U-${i} | Review ${CONTRACT} | open |`).join('\n') + '\n';
  const body = `${rowsBody}\n## Appendix\n\n<!-- small fixture padding -->\n`;
  const large = put('large.md', fm, body);
  const options = () => ({ owner: OWNER, policyFile, policyOverlayFile, docsDir, projectRoot: root,
    layout: loadLayoutProfile({ kitRoot: KIT_ROOT }), inputArtifacts: [], targetIndex: buildReconciliationTargetIndex({ docs }) });
  const expand = () => {
    const expanded = `${rowsBody}\n## Appendix\n\n<!-- ${'x'.repeat(reconciliationSyntaxCacheStats().max_source_chars)} -->\n`;
    fs.writeFileSync(large, md(fm, expanded));
    assert.ok(expanded.length > reconciliationSyntaxCacheStats().max_source_chars);
    assert.ok(fs.statSync(large).size < CURRENT_WORK_INPUT_LIMIT, 'the fixture is a supported file despite exceeding cache retention');
    return options();
  };
  return { root, large, rows, options, expand };
}

function measured(options) {
  const before = reconciliationParseStats(), started = performance.now();
  const result = resolveScopedUncertaintyProjection(options);
  return { result, parsed: reconciliationParseStats().parsed - before.parsed, elapsed: performance.now() - started };
}

function verifyRows(result, rows, relationKind = 'inverse-evidence') {
  const relation = result.projection.uncertainty_relations;
  assert.deepEqual(relation.records.map((record) => record.ref).sort(), Array.from({ length: rows }, (_, i) => expectedRef(i)).sort());
  assert.equal(relation.applications.length, rows);
  assert.ok(relation.applications.every((application) => application.relation === relationKind));
  assert.equal(relation.evidence.nodes.length, rows + 1);
  assert.deepEqual(relation.evidence.edges.map(({ from, to }) => [from, to]).sort(),
    Array.from({ length: rows }, (_, i) => [expectedRef(i), CONTRACT]).sort());
}

test('#332 active syntax: an oversized document is parsed independently of its number of Unknown rows', (t) => {
  const counts = [];
  for (const rows of [1, 8, 16]) {
    const f = fixture(t, rows), small = resolveScopedUncertaintyProjection(f.options());
    const options = f.expand(); // Measure only evaluation, after building the real target index.
    const { result, parsed, elapsed } = measured(options);
    counts.push(parsed);
    t.diagnostic(`${rows} rows: ${parsed} additional parses after indexing; ${elapsed.toFixed(1)} ms`);
    verifyRows(result, rows);
    assert.deepEqual(result.projection, small.projection, 'unselected Appendix size cannot change projected relations or evidence');
    assert.deepEqual(result.unaudited, small.unaudited);
    assert.deepEqual(result.read_set, small.read_set.map((entry) => entry.file === 'docs/large.md'
      ? { ...entry, sha256: hashBytes(fs.readFileSync(f.large)) } : entry),
    'all current file observations survive; only the changed document hash differs');
  }
  assert.ok(counts[0] > 0 && counts[0] <= 4, `bounded phase work must still parse the uncached body: ${counts}`);
  assert.deepEqual(counts, [counts[0], counts[0], counts[0]], 'row loops reuse their active document instead of parsing once per row');
});

test('#332 active syntax: a selected Unknowns section does not reparse its covered rows after enumeration', (t) => {
  const counts = [];
  for (const rows of [1, 8]) {
    const f = fixture(t, rows, { selectUnknowns: true }), small = resolveScopedUncertaintyProjection(f.options());
    const { result, parsed, elapsed } = measured(f.expand());
    counts.push(parsed);
    t.diagnostic(`selected Unknowns section, ${rows} rows: ${parsed} additional parses after indexing; ${elapsed.toFixed(1)} ms`);
    verifyRows(result, rows, 'selected-evidence');
    assert.deepEqual(result.projection, small.projection);
    assert.deepEqual(result.unaudited, small.unaudited);
    assert.deepEqual(result.read_set, small.read_set.map((entry) => entry.file === 'docs/large.md'
      ? { ...entry, sha256: hashBytes(fs.readFileSync(f.large)) } : entry));
  }
  // Selecting this section also parses it in the preceding unit/Decision
  // layers. Those fixed phase costs are separate from per-row reconstruction.
  assert.ok(counts[0] > 0 && counts[0] <= 16, `fixed relation phases must keep oversized parsing bounded: ${counts}`);
  assert.deepEqual(counts, [counts[0], counts[0]], 'coveredUnknownRows/addSelectedUnknown/ranges cannot reparse once per covered row');
});

test('#332 active syntax: completed evaluations do not retain an oversized document or borrow a later observation', (t) => {
  const f = fixture(t, 8), options = f.expand();
  const first = measured(options), second = measured(options);
  verifyRows(first.result, f.rows); verifyRows(second.result, f.rows);
  assert.ok(first.parsed > 0 && first.parsed <= 4);
  assert.equal(second.parsed, first.parsed, 'a separate evaluation must parse again even while the first result is retained');
  assert.deepEqual(second.result, first.result, 'independent parsing and reads preserve every public result field');
  // The same indexed snapshot cannot accept a later body through active syntax.
  fs.appendFileSync(f.large, '\nChanged after the completed evaluation.');
  assert.throws(() => resolveScopedUncertaintyProjection(options), /snapshot|changed|differs/);
});

test('#332 active syntax: a current-file change inside candidate resolution still invalidates the pinned syntax', (t) => {
  const f = fixture(t, 2), options = f.expand(), open = fs.openSync;
  const stackLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 40;
  t.after(() => { Error.stackTraceLimit = stackLimit; });
  let changed = false;
  const hook = t.mock.method(fs, 'openSync', function (file, ...args) {
    if (file === f.large && !changed && / at addCandidate \(/.test(new Error().stack)) {
      changed = true;
      fs.appendFileSync(f.large, '\nChanged while the current document is active.');
    }
    return open.call(this, file, ...args);
  });
  assert.throws(() => resolveScopedUncertaintyProjection(options), /snapshot|changed|differs/);
  hook.mock.restore();
  assert.equal(changed, true, 'the mutation occurs after selecting a candidate from the active document');
  const fresh = measured(f.options());
  assert.ok(fresh.parsed > 0 && fresh.parsed <= 4, 'the failed evaluation releases its active document before a fresh indexed evaluation');
  verifyRows(fresh.result, f.rows);
});
