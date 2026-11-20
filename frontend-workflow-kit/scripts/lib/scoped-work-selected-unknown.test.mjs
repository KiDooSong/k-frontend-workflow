import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReconciliationReferenceView, sharedReconciliationReferenceView,
  reconciliationSyntaxCacheStats } from './reconciliation-markdown-ast.mjs';
import { scopedAuthoredView, rememberScopedSelection, copyScopedSelectionContext,
  withScopedDocumentSyntax } from './scoped-work-authored.mjs';
import { scopedUnknownAuthored } from './scoped-work-uncertainty.mjs';

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
