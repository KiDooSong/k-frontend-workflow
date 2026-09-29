import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { loadInputArtifact } from './input-artifact.mjs';
import { parseReconciliationMarkdown, parseReconciliationReferenceView } from './reconciliation-markdown-ast.mjs';
import { resolveScopedContractGraph } from './scoped-work-graph.mjs';
import { createScopedSourceResolver } from './scoped-work-sources.mjs';
import { createScopedReferenceResolver } from './scoped-work-refs.mjs';

const INPUT = 'IN-20260918-meeting-001';
const REF = `input:${INPUT}#extracted-facts/01`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n${body}`;
const ids = (graph) => graph.nodes.map((node) => node.ref).sort();

// Actual files -> native AST / typed index / source reader -> graph. No mocked
// resolver, synthetic ready flag, scope hash, human approval or path permission.
function fixture(t, entries, inputBody = '## Extracted Facts\n- Actual selected fact.\n- Other fact.') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-graph-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = entries.map(({ id, body = '## Rules\nActual rule.', fm = {} }, index) => {
    const file = path.join(root, `${index}.md`);
    const metadata = { artifact_id: id, artifact_type: 'screen-spec', status: 'draft', domain: 'result', ...fm };
    fs.writeFileSync(file, md(metadata, body));
    return { file, fm: metadata };
  });
  const inputFile = path.join(root, `${INPUT}.md`);
  const inputFm = { input_id: INPUT, input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting:graph-fixture',
    captured_at: '2026-09-18T00:00:00Z', captured_by: 'test', status: 'captured',
    affected_domains: ['result'], affected_screens: ['RESULT-001'] };
  fs.writeFileSync(inputFile, md(inputFm, inputBody));
  const options = () => ({ projectRoot: root, targetIndex: buildReconciliationTargetIndex({ docs }),
    inputArtifacts: [loadInputArtifact(inputFile)] });
  const args = options();
  return { root, docs, inputFile, args, options,
    graph: (contracts, extra = {}) => resolveScopedContractGraph({ ...args, contracts, ...extra }) };
}

test('D graph: actual multi-hop section, Decision and input evidence are all resolved without a permit', (t) => {
  const f = fixture(t, [
    { id: 'ROOT', body: '## Rules\nUse `decision:D-SAVE@OD`.\n\n## Other\n`artifact:MISSING`' },
    { id: 'OD', body: '## Open Decisions\n| ID | Status | Blocking Mode | Decision Needed | Options |\n|---|---|---|---|---|\n| D-SAVE | open | final-fixture-ui | Save? | `artifact:CONTRACT#rules` |' },
    { id: 'CONTRACT', body: `## Rules\nBased on \`${REF}\`.` },
  ]);
  const graph = f.graph(['artifact:ROOT#rules']);
  assert.deepEqual(ids(graph), [REF, 'artifact:CONTRACT#rules', 'artifact:ROOT#rules', 'decision:D-SAVE@OD'].sort());
  assert.equal(graph.edges.length, 3);
  assert.equal(graph.read_set.length, 4);
  assert.equal(graph.nodes.find((node) => node.ref === REF).selection.content, 'Actual selected fact.');
  assert.equal(graph.nodes.find((node) => node.kind === 'decision').selection.cells[1], 'open');
  for (const key of ['ready', 'allowed', 'basis_digest', 'approval_ref']) assert.equal(Object.hasOwn(graph, key), false);
  for (const entry of graph.read_set) { assert.equal(path.isAbsolute(entry.file), false); assert.match(entry.sha256, /^sha256:[a-f0-9]{64}$/); }
});

test('D graph: cyclic and diamond dependencies retain finite edges and shared nodes exactly once', (t) => {
  const f = fixture(t, [
    { id: 'A', body: '## Rules\n`artifact:B#rules`; `artifact:C#rules`' },
    { id: 'B', body: '## Rules\n`artifact:A#rules`; `artifact:D#rules`' },
    { id: 'C', body: '## Rules\n`artifact:D#rules`' }, { id: 'D' },
  ]);
  const graph = f.graph(['artifact:A#rules']);
  assert.equal(graph.nodes.length, 4); assert.equal(graph.edges.length, 5);
  assert.deepEqual(graph, f.graph(['artifact:A#rules']));
  fs.appendFileSync(f.docs[3].file, '\n`artifact:MISSING`');
  assert.throws(() => f.graph(['artifact:A#rules'], f.options()), /SW-REF-/);
});

test('D graph: raw row selection never expands into unselected rows, but an independent broad ref stays broad', (t) => {
  const f = fixture(t, [{ id: 'ROWS', body: '## Rows\n| ID | Value |\n|---|---|\n| 01 | `artifact:GOOD#rules` |\n| 02 | `artifact:MISSING` |' }, { id: 'GOOD' }]);
  assert.deepEqual(ids(f.graph(['artifact:ROWS#rows/01'])), ['artifact:GOOD#rules', 'artifact:ROWS#rows/01']);
  assert.throws(() => f.graph(['artifact:ROWS#rows/01', 'artifact:ROWS#rows']), /SW-REF-/);
});

test('D graph: unrelated section edits change raw audit hashes, not selected nodes or dependency edges', (t) => {
  const f = fixture(t, [{ id: 'ROOT', body: '## Rules\n`artifact:GOOD#rules`\n\n## Other\nUnselected note.' }, { id: 'GOOD' }]);
  const before = f.graph(['artifact:ROOT#rules']);
  fs.appendFileSync(f.docs[0].file, '\nUnselected note changed.');
  const after = f.graph(['artifact:ROOT#rules'], f.options());
  assert.deepEqual(after.nodes, before.nodes); assert.deepEqual(after.edges, before.edges);
  assert.notDeepEqual(after.read_set, before.read_set);
  fs.writeFileSync(f.docs[1].file, fs.readFileSync(f.docs[1].file, 'utf8').replace('Actual rule.', 'Selected rule changed.'));
  assert.notDeepEqual(f.graph(['artifact:ROOT#rules'], f.options()).nodes, before.nodes);
});

test('D graph: code, comments, HTML, unused definitions and external URL substrings are not dependencies', (t) => {
  const body = '## Rules\n```md\nartifact:FENCED\n```\n\n    artifact:INDENTED\n\n<!-- artifact:COMMENT -->\n\n<div>artifact:HTML</div>\n\nhttps://example.invalid/?q=(artifact:URL)\n\n[label](https://example.invalid/artifact:DEST)\n\n[unused]: artifact:UNUSED\n';
  const f = fixture(t, [{ id: 'ROOT', body }]);
  assert.deepEqual(ids(f.graph(['artifact:ROOT#rules'])), ['artifact:ROOT#rules']);
});

test('D graph: explicit typed links and definitions outside the selected section resolve from the full AST', (t) => {
  const f = fixture(t, [{ id: 'ROOT', body: '## Rules\n[direct](artifact:A#rules) and [named][Evidence].\n\n## Other\n[Evidence]: artifact:B#rules\n[unused]: artifact:MISSING' }, { id: 'A' }, { id: 'B' }]);
  assert.deepEqual(ids(f.graph(['artifact:ROOT#rules'])), ['artifact:A#rules', 'artifact:B#rules', 'artifact:ROOT#rules']);
  fs.appendFileSync(f.docs[0].file, '\n[EVIDENCE]: artifact:A#rules');
  assert.throws(() => f.graph(['artifact:ROOT#rules'], f.options()), /definition is missing or ambiguous/);
});

test('D graph: encoded link identities and fragmented typed references cannot be repaired', (t) => {
  for (const text of ['[x](artifact&#58;GOOD)', '[x](artifact:GO%4FD)', 'artifact:GO<!-- gap -->OD', 'artifact:GO**OD**']) {
    const f = fixture(t, [{ id: 'ROOT', body: `## Rules\n${text}` }, { id: 'GO' }, { id: 'GOOD' }]);
    assert.throws(() => f.graph(['artifact:ROOT#rules']), /SW-GRAPH|SW-REF-/);
  }
  const f = fixture(t, [{ id: 'ROOT', body: '## Rules\nart<!-- gap -->ifact:MISSING\n\n**artifact:GOOD#rules**' }, { id: 'GOOD' }]);
  assert.deepEqual(ids(f.graph(['artifact:ROOT#rules'])), ['artifact:GOOD#rules', 'artifact:ROOT#rules']);
});

test('D graph: selected input bullet traverses its actual inline references, not rendered or nested-list text', (t) => {
  const f = fixture(t, [{ id: 'GOOD' }], '## Extracted Facts\n- Parent fact with `artifact:GOOD#rules`.\n  - Nested fact with `artifact:MISSING`.\n- Other fact.');
  assert.deepEqual(ids(f.graph([REF])), [REF, 'artifact:GOOD#rules'].sort());
  assert.throws(() => f.graph([REF.replace('/01', '/02')]), /SW-REF-/);
  assert.throws(() => f.graph([REF.replace('/01', '')]), /SW-REF-/);
});

test('D graph: current raw input audit is separate from selected evidence content', (t) => {
  const f = fixture(t, []);
  const before = f.graph([REF]);
  fs.appendFileSync(f.inputFile, '\n\n## Notes\nUnrelated new note.');
  const after = f.graph([REF], f.options());
  assert.deepEqual(after.nodes, before.nodes); assert.deepEqual(after.edges, before.edges);
  assert.notDeepEqual(after.read_set, before.read_set);
  assert.equal(Object.hasOwn(after.nodes[0], 'input_sha256'), false);
});

test('D graph: missing/duplicate roots, anchors and canonical artifacts fail instead of picking a first result', (t) => {
  const f = fixture(t, [{ id: 'GOOD' }]);
  for (const contracts of [[], ['artifact:GOOD', 'artifact:GOOD'], [REF, REF.replace('/01', '/1')],
    ['artifact:GOOD#absent'], [REF.replace('/01', '/99')], ['artifact:MISSING']]) {
    assert.throws(() => f.graph(contracts));
  }
  const duplicate = buildReconciliationTargetIndex({ docs: [...f.docs, f.docs[0]] });
  assert.throws(() => f.graph(['artifact:GOOD'], { targetIndex: duplicate }), /SW-REF-AMBIGUOUS/);
  assert.throws(() => f.graph([REF], { inputArtifacts: [...f.args.inputArtifacts, f.args.inputArtifacts[0]] }));
});

test('D graph: malformed explicit body references are errors, never a smaller successful graph', (t) => {
  for (const token of ['artifact:GOOD#Upper', 'decision:U-WRONG@GOOD', `input:${INPUT}`, 'artifact:']) {
    const f = fixture(t, [{ id: 'ROOT', body: `## Rules\n\`${token}\`` }, { id: 'GOOD' }]);
    assert.throws(() => f.graph(['artifact:ROOT#rules']), /SW-GRAPH/);
  }
});

test('D graph: indexed body/metadata changes and missing files are rejected for ordinary contracts too', (t) => {
  for (const change of [(raw) => raw.replace('Actual rule.', 'New selected rule.'),
    (raw) => raw.replace('"status":"draft"', '"status":"confirmed"')]) {
    const f = fixture(t, [{ id: 'GOOD' }]);
    fs.writeFileSync(f.docs[0].file, change(fs.readFileSync(f.docs[0].file, 'utf8')));
    assert.throws(() => f.graph(['artifact:GOOD#rules']), /indexed snapshot/);
  }
  const f = fixture(t, [{ id: 'GOOD' }]); fs.unlinkSync(f.docs[0].file);
  assert.throws(() => f.graph(['artifact:GOOD#rules']));
});

test('D graph: native canonical repository path checks reject leaf and ancestor symlinks', (t) => {
  for (const ancestor of [false, true]) {
    const f = fixture(t, [{ id: 'GOOD' }]);
    if (ancestor) {
      fs.mkdirSync(path.join(f.root, 'real'));
      fs.renameSync(f.docs[0].file, path.join(f.root, 'real/0.md'));
      fs.symlinkSync(path.join(f.root, 'real'), path.join(f.root, 'alias'), 'dir');
      f.args.targetIndex.artifacts.get('GOOD').file = path.join(f.root, 'alias/0.md');
    } else {
      fs.renameSync(f.docs[0].file, path.join(f.root, 'real.md'));
      fs.symlinkSync(path.join(f.root, 'real.md'), f.docs[0].file);
    }
    assert.throws(() => f.graph(['artifact:GOOD#rules']), /symlink/);
  }
});

test('D graph: metadata typed sources are resolved but binding approval metadata cannot self-seed authority', (t) => {
  const f = fixture(t, [{ id: 'ROOT', fm: { sources: [{ type: 'meeting', ref: REF }],
    approval_source: { type: 'document', ref: 'artifact:SUPPORT#rules' },
    decision_work_scopes: { bindings: [{ approval_ref: 'artifact:NOT-A-GRAPH-ROOT', basis_digest: 'not-a-permit' }] } } }, { id: 'SUPPORT' }]);
  const graph = f.graph(['artifact:ROOT#rules']);
  assert.deepEqual(ids(graph), [REF, 'artifact:ROOT#rules', 'artifact:SUPPORT#rules'].sort());
  assert.equal(graph.nodes.find((node) => node.artifact_id === 'ROOT').metadata.status, 'draft');
});

test('D graph: root order is stable and the source index, origins and caller selectors remain unchanged', (t) => {
  const f = fixture(t, [{ id: 'A' }, { id: 'B' }]);
  const roots = ['artifact:B#rules', 'artifact:A#rules', REF];
  const before = structuredClone(f.args);
  const graph = f.graph(roots);
  assert.deepEqual(graph, f.graph([...roots].reverse()));
  assert.deepEqual(f.args, before);
  graph.nodes[0].metadata.status = 'confirmed';
  assert.deepEqual(f.args, before);
  assert.deepEqual(roots, ['artifact:B#rules', 'artifact:A#rules', REF]);
});

test('D graph: shared AST reference view is opt-in and leaves every existing projection shape unchanged', () => {
  const body = '## Rules\n`artifact:DOC`\n\n## Other\nText.';
  const legacy = parseReconciliationMarkdown(body);
  const structural = parseReconciliationReferenceView(body);
  assert.deepEqual(Object.keys(legacy).sort(), ['contentBody', 'occurrences', 'proseBody']);
  for (const entry of legacy.occurrences) {
    for (const key of ['nodes', 'bulletNodes', 'bulletSources', 'tableNodes']) assert.equal(Object.hasOwn(entry, key), false);
  }
  assert.equal(structural.tree.type, 'root');
  assert.ok(structural.sections.find((section) => section.slug === 'rules').nodes.length);
  assert.deepEqual(parseReconciliationMarkdown(body), legacy);
});

for (const eol of ['\n', '\r\n', '\r']) {
  test(`D review P2: selected inline-code value changes source and graph content (${JSON.stringify(eol)})`, (t) => {
    const body = ['## Extracted Facts', '- Retry up to `3` times.', '- Other `7` times.'].join(eol);
    const f = fixture(t, [], body);
    const beforeSource = createScopedSourceResolver(f.args).evidence(REF);
    const before = f.graph([REF]);
    assert.equal(beforeSource.anchor.content, 'Retry up to `3` times.');
    assert.equal(before.nodes[0].selection.content, beforeSource.anchor.content);
    fs.writeFileSync(f.inputFile, fs.readFileSync(f.inputFile, 'utf8').replace('`3`', '`10`'));
    const afterSource = createScopedSourceResolver(f.options()).evidence(REF);
    const after = f.graph([REF], f.options());
    assert.equal(afterSource.anchor.content, 'Retry up to `10` times.');
    assert.notDeepEqual(afterSource.anchor, beforeSource.anchor);
    assert.notDeepEqual(after.nodes, before.nodes);
    assert.deepEqual(after.edges, before.edges, 'a numeric code value is not a typed dependency');
    assert.notDeepEqual(after.read_set, before.read_set);
    // Witness the original information loss without changing the relation parser.
    const prose = (text) => parseReconciliationMarkdown(text).occurrences.find((section) => section.slug === 'extracted-facts').bulletTexts[0];
    assert.equal(prose(body), prose(body.replace('`3`', '`10`')));
    assert.equal(Object.hasOwn(after, 'basis_digest'), false);
  });
}

test('D review P2: unselected earlier and nested code edits do not change the selected parent', (t) => {
  const body = '## Extracted Facts\n- Earlier `7` times.\n- Retry up to `3` times.\n  - Nested `8` times.\n- Last fact.';
  const f = fixture(t, [], body);
  const parentRef = REF.replace('/01', '/02');
  const nestedRef = REF.replace('/01', '/03');
  const before = f.graph([parentRef]);
  const nestedBefore = f.graph([nestedRef]);
  assert.equal(before.nodes[0].selection.content, 'Retry up to `3` times.');
  assert.equal(nestedBefore.nodes[0].selection.content, 'Nested `8` times.');
  fs.writeFileSync(f.inputFile, fs.readFileSync(f.inputFile, 'utf8').replace('`7`', '`7000`').replace('`8`', '`8000`'));
  const after = f.graph([parentRef], f.options());
  assert.deepEqual(after.nodes, before.nodes, 'source offsets and unselected code are not scope content');
  assert.deepEqual(after.edges, before.edges);
  assert.notDeepEqual(after.read_set, before.read_set);
  assert.notDeepEqual(f.graph([nestedRef], f.options()).nodes, nestedBefore.nodes, 'nested bullet remains independently selectable');
});

test('D review P2: selected raw multiline content retains markup, code and order with LF-only normalization', (t) => {
  const body = '## Extracted Facts\n- Keep  **literal** `3` and ``a ` b``.\n  Continue with `4`.\n\n  - Nested `8` value.\n\n  End with `5`.\n- Other fact.';
  const f = fixture(t, [], body);
  const before = f.graph([REF]);
  const content = before.nodes[0].selection.content;
  assert.ok(content.startsWith('Keep  **literal** `3` and ``a ` b``.\n  Continue with `4`.'));
  assert.ok(content.endsWith('End with `5`.'));
  assert.equal(content.includes('Nested'), false);
  assert.equal(content.includes('`8`'), false);
  assert.equal(content.includes('Other fact'), false);
  const raw = fs.readFileSync(f.inputFile, 'utf8');
  fs.writeFileSync(f.inputFile, raw.replace(/\n/g, '\r\n'));
  const crlf = f.graph([REF], f.options());
  assert.deepEqual(crlf.nodes, before.nodes);
  assert.deepEqual(crlf.edges, before.edges);
  assert.notDeepEqual(crlf.read_set, before.read_set);
  fs.writeFileSync(f.inputFile, raw.replace('`8`', '`88888`'));
  assert.deepEqual(f.graph([REF], f.options()).nodes, before.nodes);
  fs.writeFileSync(f.inputFile, raw.replace('`5`', '`50`'));
  assert.notDeepEqual(f.graph([REF], f.options()).nodes, before.nodes);
});

test('D review P2: graph row candidates use the exact canonical table filter, not native lookalikes', (t) => {
  const table = '| ID | Value |\n|---|---|\n| 01 | [kept][Evidence] |';
  const variants = [
    table.split('\n').map((line) => ` ${line}`).join('\n'),
    ` ${table}`, // Native sourceText can equal the canonical table after this offset.
    table.split('\n').map((line) => line.slice(1)).join('\n'),
    `Paragraph without a blank boundary.\n${table}`,
  ];
  for (const eol of ['\n', '\r\n']) for (const decoy of variants) {
    const body = `## Rows\n\n${decoy}\n\n${table}\n\n## Definitions\n[Evidence]: artifact:GOOD#rules`.replace(/\n/g, eol);
    const f = fixture(t, [{ id: 'ROWS', body }, { id: 'GOOD' }]);
    const ref = 'artifact:ROWS#rows/01';
    const selected = createScopedReferenceResolver(f.args).contract(ref);
    const section = parseReconciliationReferenceView(body).sections.find((entry) => entry.slug === 'rows');
    assert.equal(section.tables.length, 1);
    assert.equal(section.tableNodes.length, 1);
    assert.equal(section.nodes.filter((node) => node.type === 'table').length, 2, 'native decoy really exists');
    assert.equal(section.tableNodes[0].position.start.column, 1);
    const graph = f.graph([ref]);
    assert.deepEqual(graph.nodes.find((node) => node.ref === ref).selection, selected.selection);
    assert.deepEqual(ids(graph), ['artifact:GOOD#rules', ref]);
    assert.deepEqual(graph.edges, [{ from: ref, to: 'artifact:GOOD#rules' }]);
  }
});

test('D review P2: canonical child rows share the filter and real duplicate rows still fail', (t) => {
  const table = '| ID | Status | Blocking Mode | Decision Needed | Options |\n|---|---|---|---|---|\n| D-SAVE | open | final-fixture-ui | Save? | Keep/Change |';
  const indented = table.split('\n').map((line) => ` ${line}`).join('\n');
  const f = fixture(t, [{ id: 'OD', body: `## Open Decisions\n\n${indented}\n\n${table}` }]);
  const ref = 'decision:D-SAVE@OD';
  assert.deepEqual(f.graph([ref]).nodes[0].selection, createScopedReferenceResolver(f.args).contract(ref).selection);
  for (const body of [
    `## Open Decisions\n\n${indented}`,
    `## Open Decisions\n\n${table}\n\n${table}`,
    `## Open Decisions\n\n${indented}\n\n${table}\n\n${table}`,
  ]) {
    const broken = fixture(t, [{ id: 'OD', body }]);
    assert.throws(() => broken.graph([ref]), /SW-REF-/);
    assert.throws(() => broken.graph(['artifact:OD#open-decisions/D-SAVE']), /SW-REF-/);
  }
});
