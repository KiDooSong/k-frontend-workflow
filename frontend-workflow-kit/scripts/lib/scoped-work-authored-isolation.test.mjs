import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReconciliationReferenceView, sharedReconciliationReferenceView,
  reconciliationSyntaxCacheStats, reconciliationParseStats } from './reconciliation-markdown-ast.mjs';
import { scopedAuthoredView, scopedAuthoredSections, sharedScopedAuthoredSections,
  rememberScopedSelection, scopedSelectionUnknownAuthored, withScopedDocumentSyntax } from './scoped-work-authored.mjs';
import { scopedGraphApiRowContext } from './scoped-work-graph.mjs';
import { scopedSectionLookupStats } from './scoped-work-refs.mjs';

const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((cells) => `| ${cells.join(' | ')} |`)].join('\n');
const unknownTable = table(['ID', 'Question'], [['U-ONE', 'Original question?']]);
const selected = (body, row) => rememberScopedSelection({ type: 'row' }, body, [row]);
const rowsOf = (view) => view.tree.children.filter((node) => node.type === 'table').map((node) => node.children[1]);
const evictParser = (label) => {
  for (let index = 0; index < reconciliationSyntaxCacheStats().max_entries; index += 1) {
    parseReconciliationReferenceView(`Temporary ${label} ${index}.\n`);
  }
};

test('#340 canonical API candidates reuse one physical section and row index while public views remain mutable', () => {
  const headers = ['Endpoint', 'Description'];
  const entries = Array.from({ length: 500 }, (_, index) => [`endpoint-${index}`, `See artifact:REF-${index}#rules`]);
  const body = `## API Candidates\n\n${table(headers, entries)}\n`;
  const firstRaw = parseReconciliationReferenceView(body), secondRaw = parseReconciliationReferenceView(body);
  assert.equal(firstRaw.tree, secondRaw.tree);
  assert.notEqual(firstRaw.sections, secondRaw.sections);
  const firstPublic = scopedAuthoredView(body, firstRaw), secondPublic = scopedAuthoredView(body, secondRaw);
  assert.notEqual(firstPublic, secondPublic, 'explicit mutable raw containers keep their separate interpretation');
  firstPublic.byName.get('api candidates')[0].tables[0].headers[0] = 'Caller edit';
  assert.equal(secondPublic.byName.get('api candidates')[0].tables[0].headers[0], 'Endpoint');
  const raw = sharedReconciliationReferenceView(body);
  const homes = sharedScopedAuthoredSections(body, 'api candidates', raw);
  assert.equal(homes, sharedScopedAuthoredSections(body, 'api candidates', raw));
  assert.ok(Object.isFrozen(homes) && Object.isFrozen(homes[0]) && Object.isFrozen(homes[0].tables));
  const before = scopedSectionLookupStats().examined, parsed = reconciliationParseStats().parsed;
  for (const [index, cells] of entries.entries()) {
    assert.deepEqual(scopedGraphApiRowContext(body, { headers, cells }).refs, [`artifact:REF-${index}#rules`]);
  }
  assert.equal(scopedSectionLookupStats().examined - before, entries.length,
    '500 candidate lookups build the 500-row native index once, not 500 times');
  assert.equal(reconciliationParseStats().parsed - parsed, 0);
  const candidate = { headers, cells: entries[0] }, result = scopedGraphApiRowContext(body, candidate);
  result.refs.push('artifact:CALLER#edit'); result.ordinaryRefs.length = 0;
  assert.deepEqual(scopedGraphApiRowContext(body, candidate).refs, ['artifact:REF-0#rules']);
});

test('#340 canonical API rows preserve GENERATED exclusion, Tracking and cache generations', () => {
  const headers = ['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths', 'Description'];
  const cells = ['GET', '/example', 'candidate', 'deferred', 'unknown:U-LATER', 'src/api/**', 'See artifact:RULES#rules'];
  const rows = table(headers, [cells]);
  const body = `## API Candidates\n\n<!-- GENERATED:START summary -->\n\n${rows}\n\n<!-- GENERATED:END summary -->\n\n${rows}\n`;
  const candidate = { headers, cells, tracking: { ref: 'unknown:U-LATER@SCREEN' } };
  const expected = { refs: ['artifact:RULES#rules', 'unknown:U-LATER@SCREEN'],
    ordinaryRefs: ['artifact:RULES#rules'], trackingRefs: ['unknown:U-LATER@SCREEN'] };
  const publicView = scopedAuthoredView(body), publicHome = publicView.byName.get('api candidates')[0];
  publicHome.tableNodes.length = 0;
  const first = sharedReconciliationReferenceView(body), canonical = sharedScopedAuthoredSections(body, 'api candidates', first);
  assert.equal(canonical[0].tableNodes.length, 1, 'public edits cannot replace canonical physical table membership');
  assert.deepEqual(scopedGraphApiRowContext(body, candidate), expected);
  evictParser('api generation');
  const next = sharedReconciliationReferenceView(body), current = sharedScopedAuthoredSections(body, 'api candidates', next);
  assert.notEqual(first.tree, next.tree); assert.notEqual(canonical, current);
  assert.deepEqual(scopedGraphApiRowContext(body, candidate), expected);
  assert.equal(scopedAuthoredView(body), publicView, 'private canonical misses preserve the mutable public prewarm');
  assert.equal(publicHome.tableNodes.length, 0);
});

test('#341 canonical Unknown classification survives public header edits and AST eviction', () => {
  const body = `## Unknowns\n\n${unknownTable}\n\n<!-- header isolation -->\n`;
  const raw = sharedReconciliationReferenceView(body), [first] = rowsOf(raw), original = selected(body, first);
  assert.equal(scopedSelectionUnknownAuthored(body, original), true);
  const publicView = scopedAuthoredView(body);
  publicView.byName.get('unknowns')[0].tables[0].headers[1] = 'Edited';
  assert.equal(scopedAuthoredView(body), publicView);
  evictParser('unknown header');
  const reparsed = sharedReconciliationReferenceView(body), [second] = rowsOf(reparsed);
  assert.notEqual(first, second); assert.deepEqual(first.position, second.position);
  assert.equal(scopedSelectionUnknownAuthored(body, original), true);
  assert.equal(scopedSelectionUnknownAuthored(body, selected(body, second)), true);
  assert.equal(scopedAuthoredView(body), publicView);
  assert.equal(publicView.byName.get('unknowns')[0].tables[0].headers[1], 'Edited');
});

test('#341 canonical facts keep authored and GENERATED equal-cell rows distinct across generations', () => {
  const body = `## Unknowns\n\n<!-- GENERATED:START summary -->\n\n${unknownTable}\n\n<!-- GENERATED:END summary -->\n\n${unknownTable}\n`;
  let prior;
  for (let generation = 0; generation < 2; generation += 1) {
    const raw = sharedReconciliationReferenceView(body), rows = rowsOf(raw);
    if (prior) {
      assert.notEqual(prior.tree, raw.tree);
      rows.forEach((row, index) => assert.deepEqual(row.position, rowsOf(prior)[index].position));
    }
    const selections = rows.map((row) => selected(body, row));
    assert.deepEqual(selections.map((selection) => scopedSelectionUnknownAuthored(body, selection)), [false, true]);
    if (!generation) {
      scopedAuthoredView(body).byName.get('unknowns')[0].tables[0].headers[1] = 'Display';
      prior = raw; evictParser('physical rows');
    }
  }
});

test('#341 explicit custom raw headers stay mutable without poisoning canonical facts or active scopes', () => {
  const body = `## Unknowns\n\n${unknownTable}\n\n<!-- explicit raw isolation -->\n`;
  const raw = parseReconciliationReferenceView(body), [row] = rowsOf(raw), selection = selected(body, row);
  const home = raw.sections.find((section) => section.slug === 'unknowns');
  home.tables[0].headers[1] = 'Display';
  const publicView = scopedAuthoredView(body, raw);
  assert.equal(scopedSelectionUnknownAuthored(body, selection, raw), false);
  assert.equal(sharedScopedAuthoredSections(body, 'unknowns', raw), scopedAuthoredSections(body, 'unknowns', raw),
    'a supplied noncanonical raw view keeps its explicit interpretation');
  const check = () => {
    assert.equal(scopedSelectionUnknownAuthored(body, selection), true);
    assert.equal(scopedAuthoredView(body), publicView);
    assert.equal(scopedSelectionUnknownAuthored(body, selection, raw), false);
  };
  check(); withScopedDocumentSyntax(body, check); check();
  home.tables[0].headers[1] = 'Question';
  assert.equal(scopedSelectionUnknownAuthored(body, selection, raw), true);
  assert.equal(scopedSelectionUnknownAuthored(body, selection), true);
});
