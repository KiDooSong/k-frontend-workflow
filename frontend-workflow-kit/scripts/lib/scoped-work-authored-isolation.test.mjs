import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseReconciliationReferenceView, sharedReconciliationReferenceView,
  reconciliationSyntaxCacheStats, reconciliationParseStats } from './reconciliation-markdown-ast.mjs';
import { scopedAuthoredView, scopedAuthoredSections, sharedScopedAuthoredSections,
  rememberScopedSelection, scopedSelectionUnknownAuthored, withScopedDocumentSyntax } from './scoped-work-authored.mjs';
import { scopedGraphApiRowContext } from './scoped-work-graph.mjs';
import { createScopedReferenceResolver, scopedSectionLookupStats } from './scoped-work-refs.mjs';
import { buildReconciliationTargetIndex, sectionExactRowKeyCount } from './reconciliation-target-index.mjs';
import { createScopedSourceResolver } from './scoped-work-sources.mjs';
import { loadInputArtifact } from './input-artifact.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';

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

function targetPreflightFixture(t, family) {
  const projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-target-preflight-350-')));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const inputId = 'IN-20261120-meeting-350', evidence = `input:${inputId}#extracted-facts/01`;
  const name = family === 'unknown' ? 'unknowns' : 'api candidates';
  const section = name.replaceAll(' ', '-'), key = family === 'unknown' ? 'U-ORIGINAL' : 'GET';
  const editedKey = family === 'unknown' ? 'U-EDITED' : 'POST';
  const headers = family === 'unknown' ? ['ID', 'Question', 'Status']
    : ['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths'];
  const cells = family === 'unknown' ? [key, 'Original question?', 'open']
    : [key, '/example', 'confirmed', 'active', '-', 'src/api/example.ts'];
  const body = `## ${family === 'unknown' ? 'Unknowns' : 'API Candidates'}\n\n${table(headers, [cells])}\n` +
    `\n<!-- target preflight ${family} -->\n`;
  const md = (fm, content) => `---\n${JSON.stringify(fm)}\n---\n${content}`;
  const file = path.join(projectRoot, 'screen.md');
  const fm = { artifact_id: 'DOC', artifact_type: 'screen-spec', screen_id: 'EXAMPLE-001', domain: 'example', status: 'draft' };
  fs.writeFileSync(file, md(fm, body));
  const inputFile = path.join(projectRoot, `${inputId}.md`);
  fs.writeFileSync(inputFile, md({ input_id: inputId, input_type: 'meeting', source_type: 'meeting',
    source_ref: 'meeting:target-preflight', captured_at: '2026-11-20T00:00:00Z', captured_by: 'test',
    status: 'captured', affected_domains: ['example'], affected_screens: ['EXAMPLE-001'] },
  '## Extracted Facts\n\n- Original fact.\n'));
  const registerFile = path.join(projectRoot, 'register.md'), target = `artifact:DOC#${section}/${key}`;
  fs.writeFileSync(registerFile, md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1',
    structured_since: '2026-11-01T00:00:00Z' },
  `${table(REQUIRED_REGISTER_COLS, [[inputId, 'meeting', 'simple-update', 'partially-reconciled', 'pending',
    'artifact:DOC', '-', '-']])}\n\n## Reconciliation Items\n\n` +
  table(REQUIRED_ITEM_COLS, [[inputId, '01', 'compatible-fact', 'simple-update', 'update', target,
    evidence, 'inherit', 'statement', 'inherit']])));
  const options = () => ({ projectRoot, registerFile, inputArtifacts: [loadInputArtifact(inputFile)],
    targetIndex: buildReconciliationTargetIndex({ docs: [{ file, fm }] }) });
  const selection = { input_id: inputId, items: ['01'], source_refs: [evidence] };
  const prewarm = () => {
    const raw = parseReconciliationReferenceView(body), publicView = scopedAuthoredView(body, raw);
    const publicTable = publicView.byName.get(name)[0].tables[0];
    publicTable.sourceText = publicTable.sourceText.replace(`| ${key} |`, `| ${editedKey} |`);
    publicTable.rows[0][headers[0]] = editedKey;
    return { raw, publicView, publicTable };
  };
  return { body, name, section, key, editedKey, headers, cells, options, selection, prewarm };
}

test('#350 exact target preflight preserves public edits and custom contracts while counting original source rows', (t) => {
  for (const family of ['unknown', 'api']) {
    const f = targetPreflightFixture(t, family), { raw, publicView, publicTable } = f.prewarm();
    const options = f.options(), record = options.targetIndex.artifacts.get('DOC');
    const custom = () => createScopedReferenceResolver(options).authoredContract(`unknown:${f.editedKey}@DOC`);
    if (family === 'unknown') assert.equal(custom().selection.cells[0], f.editedKey);
    assert.equal(sectionExactRowKeyCount(record, f.section, f.key), 1);
    assert.equal(sectionExactRowKeyCount(record, f.section, f.editedKey), 0);
    assert.equal(sectionExactRowKeyCount(record, f.section, f.key.toLowerCase()), 0);
    assert.equal(scopedAuthoredView(f.body), publicView);
    assert.equal(scopedAuthoredView(f.body, raw), publicView);
    assert.equal(publicTable.rows[0][f.headers[0]], f.editedKey);
    assert.match(publicTable.sourceText, new RegExp(f.editedKey));
    assert.equal(sharedScopedAuthoredSections(f.body, f.name, raw)[0].tables[0], publicTable,
      'an explicit custom raw interpretation retains its edited table');
    if (family === 'unknown') {
      assert.equal(custom().selection.cells[0], f.editedKey, 'canonical counting cannot erase legacy public custom contracts');
      assert.throws(() => createScopedReferenceResolver(options).authoredContract(`unknown:${f.key}@DOC`), /SW-REF-MISSING/);
    }
  }
});

for (const family of ['unknown', 'api']) test(`#350 ${family} target validation preserves public prewarm and complete source output`, (t) => {
  const f = targetPreflightFixture(t, family);
  const expected = createScopedSourceResolver(f.options()).source(f.selection);
  const { raw, publicView, publicTable } = f.prewarm();
  // A new target-index record forces actual v2 raw-row preflight rather than a
  // prior record's cached count. The source resolver performs real register,
  // input, metadata and exact target resolution around that validation.
  const actual = createScopedSourceResolver(f.options()).source(f.selection);
  assert.deepEqual(actual, expected);
  assert.equal(actual.groups[0].effects[0].target.selection.cells[0], f.key);
  assert.equal(scopedAuthoredView(f.body), publicView);
  assert.equal(scopedAuthoredView(f.body, raw), publicView);
  assert.equal(publicTable.rows[0][f.headers[0]], f.editedKey);
  assert.match(publicTable.sourceText, new RegExp(f.editedKey));
});

for (const change of ['remove section', 'move section', 'splice replacement', 'deep copied replacement', 'add section']) {
  test(`#360 mutable raw ${change} keeps each current section with its own metadata and tables`, () => {
    const body = `## API Candidates\n\n${table(['Method', 'Path'], [['GET', '/items']])}\n\n` +
      `## Unknowns\n\n${unknownTable}\n\n## Notes\n\nUnrelated notes.\n\n<!-- ${change} -->`;
    const raw = parseReconciliationReferenceView(body), [preamble, api, unknown, notes] = raw.sections;
    const canonical = sharedScopedAuthoredSections(body, 'unknowns');
    scopedAuthoredView(body, raw);
    if (change === 'remove section') raw.sections.splice(1, 1);
    if (change === 'move section') raw.sections.push(...raw.sections.splice(1, 1));
    if (change === 'splice replacement') raw.sections.splice(1, 1, { ...unknown, title: 'Replacement Unknowns', slug: 'replacement-unknowns' });
    if (change === 'deep copied replacement') raw.sections.splice(1, 1,
      { ...structuredClone(unknown), title: 'Copied Unknowns', slug: 'copied-unknowns' });
    if (change === 'add section') raw.sections.splice(2, 0, { ...notes, title: 'Additional Notes', slug: 'additional-notes' });
    const current = scopedAuthoredView(body, raw);
    assert.deepEqual(current.sections.slice(1).map(({ title, slug }) => ({ title, slug })),
      raw.sections.filter((section) => section !== preamble).map(({ title, slug }) => ({ title, slug })),
      'the current raw section order and metadata are authoritative');
    for (const [name, source] of [['unknowns', unknown], ['notes', notes]]) {
      const home = scopedAuthoredSections(body, name, raw).find((section) => section.slug === source.slug);
      assert.equal(home.title, source.title);
      assert.deepEqual(home.tableNodes, source.tableNodes);
      assert.deepEqual(home.tables, source.tables);
    }
    const apiHomes = scopedAuthoredSections(body, 'api candidates', raw);
    if (['remove section', 'splice replacement', 'deep copied replacement'].includes(change)) assert.deepEqual(apiHomes, []);
    else assert.equal(apiHomes[0].tables[0], api.tables[0]);
    if (['splice replacement', 'deep copied replacement'].includes(change)) {
      const homes = scopedAuthoredSections(body, 'unknowns', raw);
      assert.equal(homes.length, 2);
      assert.deepEqual(homes[0].tables, raw.sections[1].tables);
      assert.deepEqual(homes[0].tableNodes, raw.sections[1].tableNodes);
    }
    if (change === 'add section') assert.equal(scopedAuthoredSections(body, 'notes', raw).length, 2);
    current.sections.find((section) => section.slug === 'notes').title = 'Public edit';
    assert.equal(scopedAuthoredView(body, raw), current, 'an unchanged raw list preserves direct authored edits');
    assert.equal(scopedAuthoredSections(body, 'notes', raw).find((section) => section.slug === 'notes').title, 'Public edit');
    assert.equal(sharedScopedAuthoredSections(body, 'unknowns'), canonical);
    assert.equal(canonical[0].tables[0].headers[1], 'Question');
  });
}

test('#360 empty custom sections and unused revoked table containers do not fail cache eligibility', () => {
  const body = '## Notes\n\nUnrelated notes.\n\n## Empty\n';
  const raw = parseReconciliationReferenceView(body), notes = raw.sections.find((section) => section.slug === 'notes');
  const revoked = Proxy.revocable([], {}); revoked.revoke();
  notes.tables = revoked.proxy;
  const before = scopedAuthoredSections(body, 'notes', raw);
  assert.equal(before[0].title, 'Notes'); assert.deepEqual(before[0].tables, []);
  raw.sections.splice(1, 1);
  assert.deepEqual(scopedAuthoredSections(body, 'notes', raw), []);
  assert.equal(scopedAuthoredSections(body, 'empty', raw)[0].title, 'Empty');
  for (const fields of [{}, { text: '' }]) {
    raw.sections.push({ title: 'Added Empty', slug: 'added-empty', nodes: [], tableNodes: [], tables: [], ...fields });
    const added = scopedAuthoredSections(body, 'added empty', raw);
    assert.equal(added.length, 1); assert.equal(added[0].title, 'Added Empty');
    assert.deepEqual(added[0].tables, []);
    raw.sections.pop();
  }
  raw.sections.length = 0;
  assert.deepEqual(scopedAuthoredView(body, raw).sections.slice(1), []);
  assert.equal(sharedScopedAuthoredSections(body, 'notes')[0].title, 'Notes');
});

test('#360 an unused raw tables getter is never called by build or cache eligibility', () => {
  const body = '## Notes\n\nNo table consumes the custom container.\n';
  const raw = parseReconciliationReferenceView(body);
  let calls = 0;
  Object.defineProperty(raw.sections[1], 'tables', { get() { calls += 1; throw new Error('unused tables getter'); } });
  for (let index = 0; index < 2; index += 1) assert.deepEqual(scopedAuthoredSections(body, 'notes', raw)[0].tables, []);
  assert.equal(calls, 0);
});

test('#360 empty literal and formatted homes keep physical identity through removal, reinsertion and node-array replacement', () => {
  const body = '## Unknowns\n\n## **Unknowns**\n\n## Notes\n\nUnrelated prose.\n';
  const raw = parseReconciliationReferenceView(body), literal = raw.sections[1], formatted = raw.sections[2];
  const literalNodes = literal.nodes;
  assert.deepEqual(literal.nodes, formatted.nodes, 'both empty homes have the same public node values');
  assert.equal(scopedAuthoredSections(body, 'unknowns', raw).length, 2);
  raw.sections.splice(1, 1);
  assert.deepEqual(scopedAuthoredSections(body, 'unknowns', raw), [], 'the formatted heading cannot create a literal authoring home');
  assert.equal(scopedAuthoredSections(body, '**unknowns**', raw).length, 1);
  raw.sections.push(literal);
  assert.equal(scopedAuthoredSections(body, 'unknowns', raw).length, 2, 'reinsertion restores duplicate-slug ambiguity');
  literal.nodes = formatted.nodes;
  assert.deepEqual(scopedAuthoredSections(body, 'unknowns', raw), [], 'equal empty values cannot hide a changed source array');
  literal.nodes = literalNodes;
  assert.equal(scopedAuthoredSections(body, 'unknowns', raw).length, 2);
  assert.equal(sharedScopedAuthoredSections(body, 'unknowns').length, 2);
});

test('#360 current raw sections preserve GENERATED heading continuation without resurrecting a removed home', () => {
  const second = table(['ID', 'Question'], [['U-TWO', 'Second question?']]);
  const body = `## API Candidates\n\n${table(['Method', 'Path'], [['GET', '/items']])}\n\n` +
    `## Unknowns\n\n${unknownTable}\n\n<!-- GENERATED:START summary -->\n\n## Summary\n\n${unknownTable}\n\n` +
    `<!-- GENERATED:END summary -->\n\n${second}\n\n## Notes\n\nRetained notes.\n`;
  const raw = parseReconciliationReferenceView(body), expected = sharedScopedAuthoredSections(body, 'unknowns');
  assert.equal(expected[0].tables.length, 2);
  assert.deepEqual(scopedAuthoredSections(body, 'unknowns', raw), expected);
  raw.sections.splice(raw.sections.findIndex((section) => section.slug === 'api-candidates'), 1);
  assert.deepEqual(scopedAuthoredSections(body, 'unknowns', raw), expected);
  assert.deepEqual(scopedAuthoredSections(body, 'summary', raw), []);
  raw.sections.splice(raw.sections.findIndex((section) => section.slug === 'unknowns'), 1);
  assert.deepEqual(scopedAuthoredSections(body, 'unknowns', raw), [], 'a retained generated chunk is not a new authoring home');
  assert.equal(scopedAuthoredSections(body, 'notes', raw)[0].title, 'Notes');
  assert.equal(sharedScopedAuthoredSections(body, 'unknowns'), expected);
});

test('#360 editing a raw node array keeps its physical heading filter; replacing that array selects the new source', () => {
  const body = `## API Candidates\n\n${table(['Method', 'Path'], [['GET', '/items']])}\n\n## Unknowns\n\n${unknownTable}\n`;
  const raw = parseReconciliationReferenceView(body), [, api, unknown] = raw.sections;
  scopedAuthoredView(body, raw);
  api.nodes.splice(0, api.nodes.length, ...unknown.nodes);
  api.tableNodes.splice(0, api.tableNodes.length, ...unknown.tableNodes);
  api.tables.splice(0, api.tables.length, ...unknown.tables);
  assert.deepEqual(scopedAuthoredSections(body, 'api candidates', raw)[0].tables, [],
    'an Unknown table is not authored under the original API heading');
  api.nodes = unknown.nodes; api.title = 'Copied Unknowns'; api.slug = 'copied-unknowns';
  assert.deepEqual(scopedAuthoredSections(body, 'api candidates', raw), []);
  const homes = scopedAuthoredSections(body, 'unknowns', raw);
  assert.equal(homes.length, 2, 'two current entries remain two homes even when they share one physical table');
  assert.deepEqual(homes.map((home) => [home.title, home.slug, home.tables.length]),
    [['Copied Unknowns', 'copied-unknowns', 1], ['Unknowns', 'unknowns', 1]]);
});

test('#360 full raw deep copies preserve empty formatted and literal source homes', () => {
  for (const body of ['## **Unknowns**\n', '## Unknowns\n\n## **Unknowns**\n',
    '## Unknowns\n\n## **Unknowns**\n\n## Notes\nRetained notes.\n']) {
    const raw = parseReconciliationReferenceView(body);
    const expected = scopedAuthoredView(body, raw).sections.map(({ name, title, slug }) => ({ name, title, slug }));
    const expectedHomes = scopedAuthoredSections(body, 'unknowns', raw).length;
    const copy = structuredClone(raw);
    assert.deepEqual(scopedAuthoredView(body, copy).sections.map(({ name, title, slug }) => ({ name, title, slug })), expected);
    assert.equal(scopedAuthoredSections(body, 'unknowns', copy).length, expectedHomes,
      'a formatted heading cannot become a literal authoring home after copying');
  }
});

test('#360 raw deep copies can delete nonempty homes without losing remaining source identity', () => {
  const body = `## API Candidates\n\n${table(['Method', 'Path'], [['GET', '/items']])}\n\n` +
    `## Unknowns\n\n${unknownTable}\n\n## Notes\nRetained notes.\n`;
  const raw = structuredClone(parseReconciliationReferenceView(body));
  scopedAuthoredView(body, raw);
  raw.sections.splice(1, 1);
  assert.deepEqual(scopedAuthoredSections(body, 'api candidates', raw), []);
  assert.equal(scopedAuthoredSections(body, 'unknowns', raw)[0].tables[0].headers[1], 'Question');
  assert.equal(scopedAuthoredSections(body, 'notes', raw)[0].title, 'Notes');
  raw.sections.push(...raw.sections.splice(1, 1));
  assert.deepEqual(scopedAuthoredView(body, raw).sections.slice(1).map((home) => home.slug), ['notes', 'unknowns']);
});

test('#360 ambiguous empty sources in partial or reordered raw deep copies fail explicitly', () => {
  const body = '## Unknowns\n\n## **Unknowns**\n\n## Notes\nRetained notes.\n';
  for (const change of [(sections) => sections.splice(1, 1),
    (sections) => sections.splice(1, 0, ...sections.splice(3, 1))]) {
    const original = parseReconciliationReferenceView(body), copy = structuredClone(original);
    assert.equal(scopedAuthoredSections(body, 'unknowns', copy).length, 2);
    change(copy.sections);
    assert.throws(() => scopedAuthoredView(body, copy), /empty custom section requires unambiguous native source context/);
    change(original.sections);
    assert.equal(scopedAuthoredSections(body, 'notes', original)[0].title, 'Notes',
      'source-preserving mutable views do not inherit the context-loss restriction');
  }
});

test('#360 empty source recovery tracks raw text changes without eligibility getter calls', () => {
  const body = '## **Unknowns**\n', raw = structuredClone(parseReconciliationReferenceView(body));
  assert.deepEqual(scopedAuthoredSections(body, 'unknowns', raw), []);
  raw.sections[1].text = 'No matching native empty extent.';
  assert.throws(() => scopedAuthoredView(body, raw), /empty custom section requires unambiguous native source context/);
  let reads = 0;
  Object.defineProperty(raw.sections[1], 'text', { get() { reads += 1; return ''; } });
  for (let call = 1; call <= 2; call += 1) {
    assert.deepEqual(scopedAuthoredSections(body, 'unknowns', raw), []);
    assert.equal(reads, call, 'only the actual source recovery reads its text once');
  }
});

for (const kind of ['accessor', 'proxy']) test(`#360 active authored scope does not reuse a ${kind} raw wrapper`, () => {
  const body = `## Unknowns\n\n${unknownTable}\n\n<!-- active ${kind} -->`;
  withScopedDocumentSyntax(body, (raw) => {
    const active = scopedAuthoredView(body, raw);
    active.byName.get('unknowns')[0].title = 'Edited active view';
    let reads = 0;
    const custom = kind === 'accessor' ? {
      get tree() { reads += 1; return raw.tree; },
      get sections() { reads += 1; return raw.sections; },
    } : new Proxy(raw, { get(target, key, receiver) {
      if (key === 'tree' || key === 'sections') reads += 1;
      return Reflect.get(target, key, receiver);
    } });
    for (let call = 1; call <= 2; call += 1) {
      const built = scopedAuthoredView(body, custom);
      assert.notEqual(built, active, 'fixed getter values cannot certify the active cache');
      assert.equal(built.byName.get('unknowns')[0].title, 'Unknowns');
      assert.equal(reads, call * 2, 'only the actual build reads tree and sections once each');
      assert.equal(scopedAuthoredView(body), active);
    }
  });
});
