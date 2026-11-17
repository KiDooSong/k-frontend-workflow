import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { parseReconciliationReferenceView, sharedReconciliationReferenceView } from './reconciliation-markdown-ast.mjs';
import { scopedAuthoredView, scopedSelectionNodes } from './scoped-work-authored.mjs';
import { createScopedReferenceResolver, scopedRawTable, scopedRawTableStats } from './scoped-work-refs.mjs';

// Real Markdown and its existing index exercise selection, not permission or
// approval. Each call makes a fresh resolver, as binding-status does per graph.
function fixture(t, body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-shared-refs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'doc.md');
  const fm = { artifact_id: 'DOC', artifact_type: 'screen-spec', status: 'draft' };
  let targetIndex;
  const write = (next) => {
    fs.writeFileSync(file, `---\n${JSON.stringify(fm)}\n---\n${next}`);
    targetIndex = buildReconciliationTargetIndex({ docs: [{ file, fm }] });
  };
  write(body);
  return { write, refs: () => createScopedReferenceResolver({ targetIndex, projectRoot: root }) };
}

const unknownTable = (rows) => `| Question | ID | Status |\n|---|---|---|\n${rows.map((row) => `| ${row.join(' | ')} |`).join('\n')}\n`;
const onlyTable = (view) => view.sections.find((section) => section.tables.length).tables[0];

test('#323 fresh resolvers reuse raw tables and keep first-column and ID row indexes separate', (t) => {
  const rows = Array.from({ length: 24 }, (_, i) => [`Question-${i}`, `U-SHARED-${i}`, 'open']);
  const body = `## Unknowns\n${unknownTable(rows)}`;
  const f = fixture(t, body), before = scopedRawTableStats();
  for (let pass = 0; pass < 12; pass += 1) {
    const refs = f.refs(), index = pass % rows.length;
    assert.deepEqual(refs.contract(`unknown:U-SHARED-${index}@DOC`).selection.cells, rows[index]);
    assert.deepEqual(refs.contract(`artifact:DOC#unknowns/Question-${index}`).selection.cells, rows[index]);
    assert.throws(() => refs.contract(`artifact:DOC#unknowns/U-SHARED-${index}`), /SW-REF-MISSING/,
      'the ID index must not substitute for a first-column selection');
  }
  const after = scopedRawTableStats();
  assert.equal(after.tables - before.tables, 1, 'one encoding across fresh resolvers');
  assert.equal(after.indexes - before.indexes, 2, 'one index for each row identity mode');
  assert.equal(after.indexedRows - before.indexedRows, rows.length * 2);
  assert.ok(after.reusedTables - before.reusedTables >= 11);
  assert.ok(after.reusedIndexes - before.reusedIndexes >= 22);
});

test('#323 public raw table projections stay detached and mutable for frozen or mutable input tables', () => {
  const body = '## Public table\n| ID | Value |\n|---|---|\n| public-1 | original |\n';
  for (const view of [parseReconciliationReferenceView(body), sharedReconciliationReferenceView(body)]) {
    const table = onlyTable(view), first = scopedRawTable(table), second = scopedRawTable(table);
    assert.notEqual(first, second);
    assert.notEqual(first.headers, second.headers);
    assert.notEqual(first.cells[0], second.cells[0]);
    assert.notEqual(first.rows[0], second.rows[0]);
    first.headers[0] = 'changed';
    first.cells[0][1] = 'changed';
    first.rows[0].Value = 'changed';
    assert.deepEqual(second, { headers: ['ID', 'Value'], cells: [['public-1', 'original']],
      rows: [{ ID: 'public-1', Value: 'original' }] });
    assert.deepEqual(scopedRawTable(table), second);
  }
  const mutable = onlyTable(parseReconciliationReferenceView(body));
  mutable.sourceText = mutable.sourceText.replace('original', 'edited');
  assert.equal(scopedRawTable(mutable).cells[0][1], 'edited');
});

test('#323 shared encodings never expose mutable selection or metadata aliases', (t) => {
  const body = `## Unknowns\n${unknownTable([['Isolation question', 'U-ISOLATION', 'open']])}`;
  const f = fixture(t, body), first = f.refs().contract('unknown:U-ISOLATION@DOC');
  const nodes = scopedSelectionNodes(body, first.selection);
  first.selection.headers[0] = 'Changed';
  first.selection.cells[0] = 'Changed';
  first.metadata.status = 'confirmed';
  const next = f.refs().contract('unknown:U-ISOLATION@DOC');
  assert.deepEqual(next.selection.headers, ['Question', 'ID', 'Status']);
  assert.deepEqual(next.selection.cells, ['Isolation question', 'U-ISOLATION', 'open']);
  assert.equal(next.metadata.status, 'draft');
  assert.notEqual(first.selection.cells, next.selection.cells);
  assert.notEqual(first.metadata, next.metadata);
  assert.equal(scopedSelectionNodes(body, next.selection)[0], nodes[0],
    'private native-row context still names the exact shared source row');
});

for (const sourceKind of ['mutable table', 'frozen sourceText accessor']) {
  test(`#323 authored prewarming with a ${sourceKind} cannot reuse stale raw text or row indexes`, (t) => {
    const original = unknownTable([[`Original ${sourceKind}`, 'U-ORIGINAL', 'open']]);
    const body = `## Unknowns\n${original}`, f = fixture(t, body);
    const raw = parseReconciliationReferenceView(body), table = onlyTable(raw);
    let sourceText = table.sourceText;
    if (sourceKind === 'frozen sourceText accessor') {
      Object.defineProperty(table, 'sourceText', { enumerable: true, get: () => sourceText });
      Object.freeze(table);
    }
    const authored = scopedAuthoredView(body, raw);
    assert.equal(onlyTable(authored), table);
    assert.equal(raw.tree, sharedReconciliationReferenceView(body).tree,
      'the mutable authoring projection and ordinary view share the native AST');
    assert.equal(f.refs().contract('unknown:U-ORIGINAL@DOC').selection.cells[0], `Original ${sourceKind}`);
    assert.equal(f.refs().authoredContract('unknown:U-ORIGINAL@DOC').selection.cells[0], `Original ${sourceKind}`);

    sourceText = unknownTable([['Edited question', 'U-EDITED', 'open']]).trimEnd();
    if (sourceKind === 'mutable table') table.sourceText = sourceText;
    assert.deepEqual(f.refs().authoredContract('unknown:U-EDITED@DOC').selection.cells,
      ['Edited question', 'U-EDITED', 'open']);
    assert.throws(() => f.refs().authoredContract('unknown:U-ORIGINAL@DOC'), /SW-REF-MISSING/,
      'a fresh resolver must rebuild the mutable source row index');
    assert.equal(f.refs().contract('unknown:U-ORIGINAL@DOC').selection.cells[0], `Original ${sourceKind}`,
      'mutable authoring data cannot contaminate the ordinary immutable table');
  });
}

test('#323 one frozen source table used by two native tables keeps each selection at its physical row', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-shared-sites-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const table = unknownTable([['Same question', 'U-SAME', 'open']]);
  const bodies = [`# First document\n\n## Unknowns\n${table}`,
    `# Another document with a longer prefix\n\n## Unknowns\n${table}`];
  const raw = bodies.map((body) => parseReconciliationReferenceView(body));
  const shared = Object.freeze(onlyTable(raw[0]));
  raw[1].sections.find((section) => section.tables.length).tables[0] = shared;
  bodies.forEach((body, index) => scopedAuthoredView(body, raw[index]));
  const docs = bodies.map((body, index) => {
    const file = path.join(root, `${index}.md`);
    const fm = { artifact_id: `DOC${index}`, artifact_type: 'screen-spec', status: 'draft' };
    fs.writeFileSync(file, `---\n${JSON.stringify(fm)}\n---\n${body}`);
    return { file, fm };
  });
  const targetIndex = buildReconciliationTargetIndex({ docs });
  const refs = createScopedReferenceResolver({ targetIndex, projectRoot: root });
  const first = refs.authoredContract('unknown:U-SAME@DOC0').selection;
  const second = refs.authoredContract('unknown:U-SAME@DOC1').selection;
  const repeated = refs.authoredContract('unknown:U-SAME@DOC0').selection;
  const firstNode = scopedSelectionNodes(bodies[0], first)[0];
  const secondNode = scopedSelectionNodes(bodies[1], second)[0];
  assert.notEqual(firstNode, secondNode);
  assert.notEqual(firstNode.position.start.offset, secondNode.position.start.offset);
  assert.equal(scopedSelectionNodes(bodies[0], repeated)[0], firstNode,
    'equal source cells do not make two physical native rows interchangeable');
  const fresh = createScopedReferenceResolver({ targetIndex, projectRoot: root });
  assert.equal(scopedSelectionNodes(bodies[0], fresh.authoredContract('unknown:U-SAME@DOC0').selection)[0], firstNode);
  assert.equal(scopedSelectionNodes(bodies[1], fresh.authoredContract('unknown:U-SAME@DOC1').selection)[0], secondNode);
});

test('#323 changed source bytes get a new encoding and the selection keeps its current native row', (t) => {
  const body = '## Rows\n| ID | Value |\n|---|---|\n| changed-1 | before |\n';
  const f = fixture(t, body), first = f.refs().contract('artifact:DOC#rows/changed-1');
  const before = scopedRawTableStats();
  const nextBody = `A new paragraph moves the physical table.\n\n${body.replace('before', 'after')}`;
  f.write(nextBody);
  const next = f.refs().contract('artifact:DOC#rows/changed-1');
  assert.equal(next.selection.cells[1], 'after');
  assert.equal(scopedRawTableStats().tables - before.tables, 1);
  assert.equal(scopedRawTableStats().indexes - before.indexes, 1);
  const nextNodes = scopedSelectionNodes(nextBody, next.selection);
  assert.notEqual(nextNodes[0], scopedSelectionNodes(body, first.selection)[0]);
  assert.equal(nextBody.slice(nextNodes[0].position.start.offset, nextNodes[0].position.end.offset), '| changed-1 | after |');
  assert.throws(() => scopedSelectionNodes(nextBody, first.selection), /SW-REF-SNAPSHOT/);
});

test('#323 equal text in two physical tables remains ambiguous after cache warming', (t) => {
  const table = '| ID | Value |\n|---|---|\n| duplicate-1 | same |\n';
  const body = `## Rows\n${table}\n${table}`, f = fixture(t, body);
  const native = parseReconciliationReferenceView(body).sections[1].tableNodes;
  assert.equal(native.length, 2);
  assert.notEqual(native[0], native[1]);
  const before = scopedRawTableStats();
  for (let pass = 0; pass < 3; pass += 1) {
    assert.throws(() => f.refs().contract('artifact:DOC#rows/duplicate-1'), /SW-REF-AMBIGUOUS/);
  }
  const after = scopedRawTableStats();
  assert.equal(after.tables - before.tables, 2, 'physical tables keep separate encodings');
  assert.equal(after.indexes - before.indexes, 2);
});

test('#323 warm valid tables cannot hide later duplicate headers, malformed widths or duplicate rows', (t) => {
  const good = '## Rows\n| ID | Value |\n|---|---|\n| error-1 | original |\n';
  const f = fixture(t, good);
  assert.equal(f.refs().contract('artifact:DOC#rows/error-1').selection.cells[1], 'original');
  for (const [body, error] of [
    [good.replace('ID | Value', 'ID | id'), /SW-REF-TABLE: duplicate column identity/],
    [good.replace('| error-1 | original |', '| error-1 |'), /SW-REF-TABLE: row width differs from header/],
    [good.replace('| error-1 | original |', '| error-1 | original | extra |'), /SW-REF-TABLE: row width differs from header/],
    [`${good}| error-1 | again |\n`, /SW-REF-AMBIGUOUS/],
  ]) {
    f.write(body);
    for (let pass = 0; pass < 2; pass += 1) assert.throws(() => f.refs().contract('artifact:DOC#rows/error-1'), error);
  }
  f.write(good);
  assert.equal(f.refs().contract('artifact:DOC#rows/error-1').selection.cells[1], 'original');
});
