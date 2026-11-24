import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseReconciliationReferenceView, sharedReconciliationReferenceView,
  reconciliationSyntaxCacheStats } from './reconciliation-markdown-ast.mjs';
import { scopedAuthoredView, rememberScopedSelection, copyScopedSelectionContext,
  scopedSelectionNodes, withScopedDocumentSyntax } from './scoped-work-authored.mjs';
import { scopedUnknownAuthored, scopedUnknownHomes } from './scoped-work-uncertainty.mjs';
import { resolveScopedContractGraph } from './scoped-work-graph.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { hashBytes } from './current-work-request.mjs';

// Run the actual relation stage with its real graph/read/audit dependencies.
// Only expose the private function in this in-memory test copy; do not replace
// a resolver, supply file-validity answers or add a runtime caller-base API.
const moduleUrl = new URL('./scoped-work-uncertainty.mjs', import.meta.url);
const moduleText = fs.readFileSync(moduleUrl, 'utf8');
assert.equal(moduleText.split('function uncertaintyProjection(options, base) {').length, 2);
const stageText = moduleText.replace('function uncertaintyProjection(options, base) {',
  'export function uncertaintyProjection(options, base) {')
  .replace(/from '(\.\/[^']+)'/g, (_, relative) => `from ${JSON.stringify(new URL(relative, moduleUrl).href)}`) +
  '\n//# sourceURL=scoped-work-selected-unknown-probe.mjs\n';
const { uncertaintyProjection } = await import(`data:text/javascript;base64,${Buffer.from(stageText).toString('base64')}`);

const table = '| ID | Question |\n| --- | --- |\n| U-SAME | Original question? |\n';
const generated = (text) => `<!-- GENERATED:START summary -->\n${text}\n<!-- GENERATED:END summary -->`;
const select = (body, row) => rememberScopedSelection({ type: 'row', section: 'unknowns',
  key: 'U-SAME', headers: ['ID', 'Question'], cells: ['U-SAME', 'Original question?'] }, body, [row]);

test('#347 selected Unknown: shared explicit views preserve canonical classification across AST eviction', () => {
  const body = `## Unknowns\n\n${generated(`${table}\n## Display\nGenerated summary.`)}\n\n${table}`;
  const publicRaw = parseReconciliationReferenceView(body), shared = sharedReconciliationReferenceView(body);
  const native = publicRaw.tree.children.filter((node) => node.type === 'table');
  const ordinary = select(body, native[0].children[1]), authored = select(body, native[1].children[1]);
  const publicAuthored = scopedAuthoredView(body, publicRaw);
  const headers = publicAuthored.byName.get('unknowns')[0].tables[0].headers;
  headers[1] = 'Edited';
  const classification = (view) => [ordinary, authored].map((selection) => ({
    canonical: scopedUnknownAuthored(body, selection), selected: scopedUnknownAuthored(body, selection, view),
  }));
  const expected = [{ canonical: false, selected: false }, { canonical: true, selected: true }];
  assert.deepEqual(classification(shared), expected);
  for (let i = 0; i <= reconciliationSyntaxCacheStats().max_entries; i += 1) {
    sharedReconciliationReferenceView(`Evict selected Unknown generation ${i}.`);
  }
  const rebuilt = sharedReconciliationReferenceView(body);
  assert.notEqual(rebuilt.tree, shared.tree, 'exercise a genuinely new native parser generation');
  assert.deepEqual(classification(rebuilt), expected);
  assert.equal(headers[1], 'Edited', 'canonical selection must not repair or replace the caller\'s mutable view');
  assert.equal(scopedAuthoredView(body, publicRaw), publicAuthored,
    'the public same-tree prewarm retains its own edited interpretation');
});

test('#347 selected Unknown: explicit custom raw interpretation remains distinct from canonical shared views', () => {
  const body = `## Unknowns\n\n${table}\n<!-- custom selected raw -->`;
  const shared = sharedReconciliationReferenceView(body);
  const row = shared.sections.find((section) => section.slug === 'unknowns').tableNodes[0].children[1];
  const original = select(body, row), copy = copyScopedSelectionContext(original, structuredClone(original));
  const custom = { ...shared, sections: shared.sections.map((section) => section.slug !== 'unknowns' ? section : {
    ...section, tables: section.tables.map((entry) => ({ ...entry, headers: ['ID', 'Display'] })),
  }) };
  assert.equal(scopedUnknownAuthored(body, copy, custom), false);
  assert.equal(scopedUnknownAuthored(body, copy, { tree: shared.tree, sections: shared.sections }), true,
    'an internal wrapper retaining the exact shared sections preserves canonical provenance');
  assert.equal(scopedUnknownAuthored(body, original), true, 'custom interpretations cannot replace canonical row facts');
  assert.equal(custom.sections.find((section) => section.slug === 'unknowns').tables[0].headers[1], 'Display');
});

test('#347 selected Unknown: an active document keeps the edited public view and canonical selected-row answer', () => {
  const body = `## Unknowns\n\n${table}\n<!-- active selected raw -->`;
  const publicRaw = parseReconciliationReferenceView(body), publicView = scopedAuthoredView(body, publicRaw);
  const row = publicRaw.sections.find((section) => section.slug === 'unknowns').tableNodes[0].children[1];
  const selected = select(body, row), headers = publicView.byName.get('unknowns')[0].tables[0].headers;
  headers[1] = 'Edited';
  withScopedDocumentSyntax(body, (raw) => {
    assert.equal(scopedAuthoredView(body, raw), publicView);
    assert.equal(scopedUnknownAuthored(body, selected, raw), true);
    assert.equal(scopedUnknownAuthored(body, selected, publicRaw), false,
      'the explicitly supplied mutable public raw path keeps its existing custom interpretation');
    assert.equal(headers[1], 'Edited');
  });
  assert.equal(scopedUnknownAuthored(body, selected), true);
  assert.equal(headers[1], 'Edited');
});

function applicationFixture(t, body, refSuffix = '#unknowns/U-ONE') {
  const projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-selected-unknown-350-')));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const file = path.join(projectRoot, 'review-notes.md');
  const fm = { artifact_id: 'REVIEW', artifact_type: 'screen-spec', screen_id: 'REVIEW-001', status: 'draft' };
  fs.writeFileSync(file, `---\n${JSON.stringify(fm)}\n---\n${body}`);
  const targetIndex = buildReconciliationTargetIndex({ docs: [{ file, fm }] });
  const source = targetIndex.artifacts.get('REVIEW').body;
  const options = { targetIndex, projectRoot };
  const ref = `artifact:REVIEW${refSuffix}`, owner = 'screen:REVIEW-001';
  const evidence = resolveScopedContractGraph({ ...options, contracts: [ref] });
  const base = { read_set: evidence.read_set, projection: {
    owner, units: [{ owner, declaration: { id: 'fixture', contracts: [ref] }, sources: [], api_rows: [] }],
    owners: [{ owner, adopted: true }], host_links: [], evidence,
    decision_relations: { evidence: { nodes: [], roots: [], edges: [] }, applications: [], memberships: [] },
  } };
  return { file, body: source, options, base, run: () => uncertaintyProjection(options, base) };
}

const applicationTable = (id = 'U-ONE', question = 'Original question?') =>
  `| ID | Question | Status |\n| --- | --- | --- |\n| ${id} | ${question} | open |\n`;
function evictGeneration(body, label, original) {
  for (let i = 0; i <= reconciliationSyntaxCacheStats().max_entries; i += 1) {
    sharedReconciliationReferenceView(`Evict ${label} ${i}.`);
  }
  assert.notEqual(sharedReconciliationReferenceView(body).tree, original, 'use a genuinely new native parser generation');
}

for (const [label, editedField, refSuffix, decorate] of [
  ['header on exact row', 'header', '#unknowns/U-ONE', (body) => body],
  ['cells on selected section', 'cells', '#unknowns', (body) => body],
  ['cells after GENERATED heading', 'cells', '#unknowns/U-ONE',
    (body) => body.replace('## Unknowns\n\n', `## Unknowns\n\n${generated('## Display\n\nGenerated summary.')}\n\n`)],
]) test(`#350 selected Unknown: full ${label} application is independent of public edits and eviction`, (t) => {
  const f = applicationFixture(t, decorate(`## Unknowns\n\n${applicationTable()}\n<!-- ${label} -->\n`), refSuffix);
  const raw = parseReconciliationReferenceView(f.body), publicView = scopedAuthoredView(f.body, raw);
  const publicTable = publicView.byName.get('unknowns')[0].tables[0];
  const expected = f.run(), expectedBytes = JSON.stringify(expected);
  assert.equal(expected.projection.uncertainty_relations.applications.length, 1);
  assert.deepEqual(expected.read_set, [{ file: 'review-notes.md', sha256: hashBytes(fs.readFileSync(f.file)) }]);
  if (editedField === 'header') publicTable.headers[1] = 'Edited';
  else {
    publicTable.sourceText = publicTable.sourceText.replace('Original question?', 'Edited public question?');
    publicTable.rows[0].Question = 'Edited public question?';
  }
  const check = () => {
    assert.equal(JSON.stringify(f.run()), expectedBytes, 'complete projection and read-set bytes remain canonical');
    assert.equal(scopedAuthoredView(f.body), publicView, 'internal evaluation cannot replace the public prewarm');
    assert.equal(scopedAuthoredView(f.body, raw), publicView, 'the exact public raw interpretation is retained');
    if (editedField === 'header') assert.equal(publicTable.headers[1], 'Edited');
    else {
      assert.match(publicTable.sourceText, /Edited public question\?/);
      assert.equal(publicTable.rows[0].Question, 'Edited public question?');
    }
  };
  check();
  evictGeneration(f.body, label, raw.tree);
  check();
});

test('#350 selected Unknown: generated raw evidence keeps its physical row through canonical internal evaluation', (t) => {
  const body = `## Unknowns\n\n${generated(`${applicationTable('U-RAW', 'Generated question?')}\n## Display\n\nSummary.`)}\n\n` +
    applicationTable('U-AUTHORED', 'Authored question?');
  const f = applicationFixture(t, body, '#unknowns/U-RAW');
  const selected = f.base.projection.evidence.nodes[0].selection;
  const originalNode = scopedSelectionNodes(f.body, selected)[0];
  assert.equal(scopedUnknownAuthored(f.body, selected), false);
  const expected = JSON.stringify(f.run());
  const raw = parseReconciliationReferenceView(f.body), publicView = scopedAuthoredView(f.body, raw);
  publicView.byName.get('unknowns')[0].tables[0].headers[1] = 'Display';
  assert.equal(JSON.stringify(f.run()), expected);
  evictGeneration(f.body, 'generated physical row', raw.tree);
  assert.equal(JSON.stringify(f.run()), expected);
  assert.equal(scopedSelectionNodes(f.body, selected)[0], originalNode);
  assert.equal(scopedUnknownAuthored(f.body, selected), false);
  assert.equal(scopedAuthoredView(f.body), publicView);
  assert.equal(publicView.byName.get('unknowns')[0].tables[0].headers[1], 'Display');
});

test('#350 Unknown homes: default lookup preserves public cell edits and explicit custom raw interpretation', () => {
  const body = `## Unknowns\n\n${applicationTable()}\n<!-- public homes isolation -->\n`;
  const raw = parseReconciliationReferenceView(body), publicView = scopedAuthoredView(body, raw);
  const publicTable = publicView.byName.get('unknowns')[0].tables[0];
  publicTable.rows[0].Question = 'Edited public cell';
  publicTable.sourceText = publicTable.sourceText.replace('Original question?', 'Edited public cell');
  for (let i = 0; i < 2; i += 1) {
    const homes = scopedUnknownHomes(body);
    assert.equal(homes[0].location.tables[0].rows[0].Question, 'Original question?');
    assert.equal(scopedAuthoredView(body), publicView);
    assert.equal(publicTable.rows[0].Question, 'Edited public cell');
    assert.match(publicTable.sourceText, /Edited public cell/);
  }
  const customHomes = scopedUnknownHomes(body, raw);
  assert.equal(customHomes[0].location.tables[0], publicTable);
  assert.equal(customHomes[0].location.tables[0].rows[0].Question, 'Edited public cell');
  assert.equal(scopedAuthoredView(body), publicView);
});

test('#350 canonical graph section results keep mutable node wrappers independent between resolvers', (t) => {
  const f = applicationFixture(t, `## Unknowns\n\n${applicationTable()}\n<!-- graph wrapper isolation -->\n`, '#unknowns');
  const graph = () => resolveScopedContractGraph({ ...f.options, contracts: ['artifact:REVIEW#unknowns'] });
  const first = graph().nodes[0].selection, second = graph().nodes[0].selection;
  const firstNodes = scopedSelectionNodes(f.body, first), secondNodes = scopedSelectionNodes(f.body, second);
  const before = [...secondNodes];
  assert.notEqual(firstNodes, secondNodes);
  firstNodes.length = 0;
  assert.deepEqual(secondNodes, before);
  assert.deepEqual(scopedSelectionNodes(f.body, graph().nodes[0].selection), before);
});

test('#350 Unknown homes: default results keep detached mutable containers and original native identities', () => {
  for (const rawOnly of [false, true]) {
    const body = `## Unknowns\n\n${rawOnly ? generated(applicationTable()) : applicationTable()}\n\n- Native bullet.\n` +
      `\n<!-- detached homes ${rawOnly} -->\n`;
    const raw = parseReconciliationReferenceView(body), publicView = scopedAuthoredView(body, raw);
    publicView.byName.get('unknowns')[0].title = 'Public edited home';
    const canonical = scopedUnknownHomes(body, sharedReconciliationReferenceView(body));
    const first = scopedUnknownHomes(body), second = scopedUnknownHomes(body);
    const home = first[0].location, original = canonical[0].location, other = second[0].location;
    assert.equal(first[0].authored, !rawOnly);
    assert.notEqual(first, second);
    assert.notEqual(first[0], second[0]);
    assert.notEqual(home, original); assert.notEqual(home, other);
    assert.equal(Object.isFrozen(home), false);
    for (const [name, value] of Object.entries(home)) if (Array.isArray(value)) {
      assert.notEqual(value, original[name]); assert.notEqual(value, other[name]);
      assert.equal(Object.isFrozen(value), false, name);
      if (name !== 'tables') assert.ok(value.every((node, index) => node === original[name][index]));
    }
    assert.equal(home.tableNodes[0], original.tableNodes[0]);
    assert.equal(home.bulletNodes[0], original.bulletNodes[0]);
    assert.notEqual(home.tables[0], original.tables[0]);
    assert.notEqual(home.tables[0].headers, other.tables[0].headers);
    assert.notEqual(home.tables[0].rows, other.tables[0].rows);
    assert.notEqual(home.tables[0].rows[0], other.tables[0].rows[0]);
    home.title = 'Returned home edit';
    home.tables[0].headers[1] = 'Display';
    home.tables[0].rows[0].Question = 'Returned cell edit';
    home.tables[0].sourceText = 'Returned source edit';
    home.nodes.length = 0; home.tableNodes.length = 0; home.bulletNodes.length = 0;
    first[0].authored = !first[0].authored;
    assert.deepEqual(second, canonical, 'edits cannot affect another public result or the internal canonical homes');
    assert.deepEqual(scopedUnknownHomes(body), canonical, 'later public lookups retain source semantics');
    assert.equal(scopedAuthoredView(body), publicView);
    assert.equal(publicView.byName.get('unknowns')[0].title, 'Public edited home');
  }
});
