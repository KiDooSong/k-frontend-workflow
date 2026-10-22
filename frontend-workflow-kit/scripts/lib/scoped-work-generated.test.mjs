import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { KIT_ROOT } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { analyzeApiCandidateContract, loadScreenSpec } from './spec.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { parseReconciliationReferenceView } from './reconciliation-markdown-ast.mjs';
import { createScopedApiResolver } from './scoped-work-api.mjs';
import { createScopedReferenceResolver } from './scoped-work-refs.mjs';
import { resolveScopedContractGraph, scopedGraphApiRowDependencies, scopedGraphApiRowContext, scopedGraphBodyRefs,
  scopedGraphSelectionRefs, scopedGraphSelectionSpans } from './scoped-work-graph.mjs';
import { scopedProjectionNode } from './scoped-work-projection.mjs';
import { scopeSet } from './scoped-work-normalize.mjs';

const layout = loadLayoutProfile({ kitRoot: KIT_ROOT });
const ID = 'RESULT-001-screen-spec';
const headers = ['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths'];
const cells = ['GET', '/later', 'candidate', 'deferred', 'unknown:U-LATER', 'src/api/later/**'];
const table = (columns, rows) => [`| ${columns.join(' | ')} |`, `|${columns.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const apiTable = table(headers, [cells]);
const unknownHeaders = ['ID', 'Question', 'Status'];
const unknownCells = ['U-LATER', 'Later API?', 'open'];
const unknownTable = table(unknownHeaders, [unknownCells]);
const legend = table(['Method', 'Meaning'], [['GET', 'Read only']]);
const unknownLegend = table(unknownHeaders, [['U-GENERATED', 'Generated example?', 'open']]);
const generated = (text) => `<!-- GENERATED:START summary -->\n\n${text}\n\n<!-- GENERATED:END summary -->`;
const bodyFor = ({ apiBefore = '', apiAfter = '', unknownBefore = '', unknownAfter = '',
  api = apiTable, unknowns = unknownTable } = {}) => [
  '## API Candidates', apiBefore, api, apiAfter, '## Unknowns', unknownBefore, unknowns, unknownAfter,
].filter(Boolean).join('\n\n');
const ids = (graph) => graph.nodes.map((node) => node.ref).sort();

// Actual source bytes, the target index and the existing API analyzer are the
// oracle. No pre-stripped replacement document or fabricated graph is supplied.
function fixture(t, entries) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-generated-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = entries.map(({ id = ID, body, fm = {} }, i) => {
    const file = path.join(root, `${i}.md`);
    const metadata = { artifact_id: id, artifact_type: 'screen-spec', screen_id: 'RESULT-001',
      domain: 'result', status: 'draft', work_execution: { version: 1, units: [{ id: 'client', kind: 'api-contract',
        contracts: [`artifact:${id}#api-candidates`], sources: [], api_candidates: [{ method: 'GET', path: '/later' }] }] }, ...fm };
    fs.writeFileSync(file, `---\n${JSON.stringify(metadata)}\n---\n${body}`);
    return { file, fm: metadata };
  });
  const targetIndex = buildReconciliationTargetIndex({ docs });
  const options = { targetIndex, projectRoot: root, inputArtifacts: [] };
  return { root, docs, options, targetIndex,
    graph: (contracts, extra = {}) => resolveScopedContractGraph({ ...options, contracts, ...extra }),
    api: () => createScopedApiResolver({ ...options, layout }).unit(docs[0].fm.artifact_id, 'screen:RESULT-001', 'client') };
}

const variants = {
  control: {},
  generatedLegend: { apiAfter: generated(legend) },
  generatedHeadingBeforeTable: { apiBefore: generated('## Generated Summary\n\nOutput text.') },
  generatedLegendBeforeTable: { apiBefore: generated(legend) },
  generatedSameApiHeading: { apiBefore: generated('## API Candidates\n\nOutput text.') },
  generatedHeadingAfterTable: { apiAfter: generated('## Generated Summary\n\nOutput text.') },
  generatedSameApiHeadingAfterTable: { apiAfter: generated('## API Candidates\n\nOutput text.') },
  generatedUnknownHeading: { unknownBefore: generated('## Generated Summary\n\nOutput text.') },
  generatedSameUnknownHeading: { unknownBefore: generated('## Unknowns\n\nOutput text.') },
  generatedUnknownLegend: { unknownBefore: generated(unknownLegend), unknownAfter: generated(unknownLegend) },
  generatedUnknownHeadingAfterTable: { unknownAfter: generated('## Unknowns\n\nOutput text.') },
  combined: { apiBefore: generated('## API Candidates\n\nOutput text.'), apiAfter: generated(legend),
    unknownBefore: generated('## Unknowns\n\nOutput text.'), unknownAfter: generated(unknownLegend) },
};

for (const [name, options] of Object.entries(variants)) for (const eol of ['\n', '\r\n']) {
  test(`#282 GENERATED ${name} (${eol === '\n' ? 'LF' : 'CRLF'}): analyzer, API selection and graph agree on authored rows`, (t) => {
    const body = bodyFor(options).replace(/\n/g, eol);
    const f = fixture(t, [{ body }]);
    const spec = loadScreenSpec(f.docs[0].file);
    const analysis = analyzeApiCandidateContract(spec, { layout, domain: 'result' });
    assert.equal(spec.body, body, 'analysis retains the original source');
    assert.equal(analysis.valid, true);
    assert.equal(analysis.candidates.length, 1);
    assert.deepEqual(analysis.issues, []);
    const view = parseReconciliationReferenceView(body);
    const unknown = `unknown:U-LATER@${ID}`;
    const expectedRefs = [unknown];
    assert.deepEqual(scopedGraphBodyRefs(body, view, f.docs[0].fm), expectedRefs);
    assert.deepEqual(scopedGraphSelectionRefs(body, f.docs[0].fm,
      { type: 'section', section: 'api-candidates' }, view), expectedRefs);
    const resolved = f.api();
    assert.equal(resolved.candidates.length, 1);
    const candidate = resolved.candidates[0];
    assert.deepEqual(candidate.headers, headers);
    assert.deepEqual(candidate.cells, cells);
    assert.deepEqual(candidate.tracking.selection, {
      type: 'row', section: 'unknowns', key: 'U-LATER', headers: unknownHeaders, cells: unknownCells,
    }, 'internal source selection must not leak into the public/basis selection shape');
    assert.deepEqual(scopedGraphApiRowDependencies(body, candidate), expectedRefs);
    const rowText = `| ${unknownCells.join(' | ')} |`;
    const rowStart = body.indexOf(rowText), rowEnd = rowStart + rowText.length;
    const assertUnknownSpans = (selection) => {
      const spans = scopedGraphSelectionSpans(body, view, selection);
      assert.ok(spans.length > 0);
      assert.ok(spans.every(([start, end]) => rowStart <= start && end <= rowEnd), 'Unknown spans select its original authored row');
      assert.ok(spans.some(([start, end]) => body.slice(start, end) === 'Later API?'));
    };
    assertUnknownSpans(candidate.tracking.selection);
    for (const root of [`artifact:${ID}#api-candidates`, `artifact:${ID}`]) {
      const graph = f.graph([root]);
      assert.deepEqual(ids(graph), [root, unknown]);
      assert.deepEqual(graph.edges, [{ from: root, to: unknown }], 'a successful graph must retain its actual dependency');
      const selected = graph.nodes.find((node) => node.ref === unknown);
      assert.deepEqual(selected.selection, candidate.tracking.selection);
      assertUnknownSpans(selected.selection);
      const hash = `sha256:${createHash('sha256').update(fs.readFileSync(f.docs[0].file)).digest('hex')}`;
      assert.deepEqual(graph.read_set, [{ file: '0.md', sha256: hash }], 'read_set hashes unmodified original file bytes');
      const projected = f.graph([root], { project: scopedProjectionNode });
      assert.deepEqual(projected, { ...graph, nodes: scopeSet(graph.nodes.map(scopedProjectionNode)) });
      assertUnknownSpans(projected.nodes.find((node) => node.ref === unknown).selection);
    }
    const apiSpans = scopedGraphSelectionSpans(body, view, { type: 'section', section: 'api-candidates' });
    const trackingStart = body.indexOf('unknown:U-LATER');
    assert.ok(apiSpans.some(([start, end]) => start <= trackingStart && end >= trackingStart + 'unknown:U-LATER'.length),
      'section spans retain the API row beyond a generated H2');
    assert.ok(!apiSpans.some(([start, end]) => start <= rowStart && end >= rowEnd), 'API selection does not claim the Unknown section');
  });
}

test('#282 GENERATED: deferred Unknown expansion retains the authored row through a multi-hop graph and projection', (t) => {
  const body = bodyFor({ ...variants.combined,
    unknowns: table(unknownHeaders, [['U-LATER', 'See `artifact:DETAIL#rules`', 'open']]) });
  const f = fixture(t, [{ body }, { id: 'DETAIL', body: '## Rules\nAuthoritative API detail.' }]);
  const root = `artifact:${ID}#api-candidates`, unknown = `unknown:U-LATER@${ID}`;
  const graph = f.graph([root]);
  assert.deepEqual(ids(graph), [root, 'artifact:DETAIL#rules', unknown].sort());
  assert.deepEqual(graph.edges, scopeSet([{ from: root, to: unknown }, { from: unknown, to: 'artifact:DETAIL#rules' }]));
  assert.deepEqual(f.graph([root], { project: scopedProjectionNode }), { ...graph, nodes: scopeSet(graph.nodes.map(scopedProjectionNode)) });
});

test('#282 GENERATED: equal bodies use each artifact identity and preserve root-order determinism', (t) => {
  const body = bodyFor(variants.combined);
  const f = fixture(t, [{ id: 'A', body }, { id: 'B', body }]);
  const roots = ['artifact:A#api-candidates', 'artifact:B#api-candidates'];
  const graph = f.graph(roots);
  assert.deepEqual(ids(graph), [...roots, 'unknown:U-LATER@A', 'unknown:U-LATER@B']);
  assert.deepEqual(graph.edges, roots.map((ref, index) => ({ from: ref, to: `unknown:U-LATER@${index ? 'B' : 'A'}` })));
  assert.deepEqual(graph, f.graph([...roots].reverse()));
  const view = parseReconciliationReferenceView(body);
  assert.equal(view.tree, parseReconciliationReferenceView(body).tree);
  for (const { fm } of [...f.docs].reverse()) {
    assert.deepEqual(scopedGraphBodyRefs(body, view, fm), [`unknown:U-LATER@${fm.artifact_id}`]);
  }
});

test('#282 GENERATED: a selected API row does not pre-resolve another row with a missing Tracking target', (t) => {
  const other = ['other', 'GET', '/other', 'candidate', 'deferred', 'unknown:U-MISSING', 'src/api/other/**'];
  const body = bodyFor({ ...variants.combined, api: table(['ID', ...headers], [['chosen', ...cells], other]) });
  const f = fixture(t, [{ body }]);
  const chosen = `artifact:${ID}#api-candidates/chosen`, unknown = `unknown:U-LATER@${ID}`;
  assert.deepEqual(ids(f.graph([chosen])), [chosen, unknown]);
  assert.deepEqual(f.graph([chosen]).edges, [{ from: chosen, to: unknown }]);
  assert.throws(() => f.graph([`artifact:${ID}#api-candidates/other`]), /SW-(REF|GRAPH)/);
  assert.deepEqual(ids(f.graph([`artifact:${ID}#unknowns`])), [`artifact:${ID}#unknowns`]);
});

test('#282 GENERATED: authored duplicate API/Unknown tables and sections remain ambiguous', (t) => {
  for (const options of [
    { api: `${apiTable}\n\n${apiTable}` },
    { apiAfter: `${generated(legend)}\n\n## API Candidates\n${apiTable}` },
    { unknowns: `${unknownTable}\n\n${unknownTable}` },
    { unknownAfter: `## Unknowns\n${unknownTable}` },
    { unknowns: table(unknownHeaders, [unknownCells, unknownCells]) },
  ]) {
    const body = bodyFor({ ...variants.combined, ...options });
    const f = fixture(t, [{ body }]);
    assert.throws(() => f.graph([`artifact:${ID}#api-candidates`]), /SW-(GRAPH|REF)-?/);
    assert.throws(() => f.api(), /SW-(API|REF|GRAPH)-?/);
  }
});

test('#282 GENERATED: malformed Tracking and malformed prose still fail closed', (t) => {
  for (const tracking of ['unknown:U-LATER; artifact:MISSING', 'unknown:U-LATER<!-- hidden -->',
    '**unknown:U-LATER**', '`unknown:U-LATER`', 'unknown:U-MISSING']) {
    const row = [...cells]; row[4] = tracking;
    const f = fixture(t, [{ body: bodyFor({ ...variants.combined, api: table(headers, [row]) }) }]);
    assert.throws(() => f.graph([`artifact:${ID}#api-candidates`]), /SW-(GRAPH|REF)-?/);
    assert.throws(() => f.api(), /SW-(API|REF|GRAPH)-?/);
  }
  const f = fixture(t, [{ body: `${bodyFor(variants.combined)}\n\n## Notes\nunknown:U-LATER` }]);
  assert.throws(() => f.graph([`artifact:${ID}`]), /SW-GRAPH/);
});

test('#282 GENERATED: local Tracking still requires a canonical open Unknown in authored content', (t) => {
  for (const unknowns of [unknownTable.replace('open', 'resolved'), unknownTable.replace('Question', 'Description'),
    unknownTable.replace('U-LATER', 'U-OTHER'), generated(unknownTable)]) {
    const f = fixture(t, [{ body: bodyFor({ ...variants.combined, unknowns }) }]);
    assert.throws(() => f.graph([`artifact:${ID}#api-candidates`]), /SW-(GRAPH|REF)-?/);
    assert.throws(() => f.api(), /SW-(API|REF|GRAPH)-?/);
  }
  const f = fixture(t, [{ body: bodyFor({ api: generated(apiTable) }) }]);
  assert.throws(() => f.graph([`artifact:${ID}#api-candidates`]), /SW-GRAPH/);
  assert.throws(() => f.api(), /SW-API-/);
});

test('#282 GENERATED: ordinary fully qualified references can still select a generated Unknown', (t) => {
  const body = bodyFor({ unknowns: generated(unknownTable) });
  const f = fixture(t, [{ body }]);
  const unknown = `unknown:U-LATER@${ID}`;
  const refs = createScopedReferenceResolver(f.options);
  assert.deepEqual(refs.contract(unknown).selection.cells, unknownCells);
  assert.deepEqual(ids(f.graph([unknown])), [unknown]);
  assert.throws(() => f.graph([`artifact:${ID}#api-candidates`]), /SW-GRAPH/);
});

test('#282 GENERATED: ordinary artifact rows can still select generated-only API evidence', (t) => {
  const active = ['GET', '/later', 'confirmed', 'active', '-', 'src/api/later/**'];
  const body = bodyFor({ api: generated(table(headers, [active])) });
  const f = fixture(t, [{ body }]);
  const ref = `artifact:${ID}#api-candidates/GET`;
  const graph = f.graph([ref]);
  assert.deepEqual(ids(graph), [ref]);
  assert.deepEqual(graph.nodes[0].selection.cells, active);
  assert.throws(() => f.api(), /SW-API-/, 'generated evidence cannot supply an authored API unit');
});

test('#282 GENERATED: ordinary and Tracking references to the same authored row agree regardless of visit order', (t) => {
  const body = bodyFor(variants.combined);
  const f = fixture(t, [{ body }, { id: 'BRIDGE', body: `## Rules\nartifact:${ID}#api-candidates` }]);
  const unknown = `unknown:U-LATER@${ID}`;
  for (const roots of [
    [unknown, `artifact:${ID}#api-candidates`],
    [`artifact:${ID}#api-candidates`, unknown],
    [unknown, 'artifact:BRIDGE#rules'],
    ['artifact:BRIDGE#rules', unknown],
  ]) for (const project of [null, scopedProjectionNode]) {
    const graph = f.graph(roots, { project });
    assert.deepEqual(graph.nodes.find((node) => node.ref === unknown).selection.cells, unknownCells);
    assert.ok(graph.edges.some((edge) => edge.from === `artifact:${ID}#api-candidates` && edge.to === unknown));
  }
});

for (const identicalCells of [false, true]) test(`#282 GENERATED: raw/authored Unknown collisions compare physical rows (${identicalCells ? 'same' : 'different'} cells)`, (t) => {
  // The raw Unknown section ends at the generated H2 and selects the generated
  // proxy. The authored section continues past it to the actual contract row.
  const proxy = table(unknownHeaders, [['U-LATER', identicalCells ? 'Later API?' : 'Generated proxy?', 'open']]);
  const body = bodyFor({ unknownBefore: generated(`${proxy}\n\n## Generated Summary\n\nOutput text.`) });
  const f = fixture(t, [{ body }, { id: 'BRIDGE', body: `## Rules\nartifact:${ID}#api-candidates` }]);
  const unknown = `unknown:U-LATER@${ID}`;
  const view = parseReconciliationReferenceView(body);
  const ordinary = f.graph([unknown]).nodes[0];
  assert.equal(ordinary.selection.cells[1], identicalCells ? 'Later API?' : 'Generated proxy?', 'ordinary raw-row semantics are retained');
  const tracked = f.graph([`artifact:${ID}#api-candidates`]).nodes.find((node) => node.ref === unknown);
  assert.equal(tracked.selection.cells[1], 'Later API?');
  const generatedEnd = body.indexOf('<!-- GENERATED:END summary -->');
  assert.ok(scopedGraphSelectionSpans(body, view, ordinary.selection).every(([, end]) => end < generatedEnd),
    'ordinary graph selection keeps the generated row source span');
  assert.ok(scopedGraphSelectionSpans(body, view, tracked.selection).every(([start]) => start > generatedEnd),
    'Tracking graph selection keeps the authored row source span even when cells match');
  const candidate = f.api().candidates[0];
  const dependencies = scopedGraphApiRowDependencies(body, candidate);
  assert.deepEqual(dependencies, [unknown]);
  const apiGraph = f.graph(dependencies, { trackingRefs: [candidate.tracking.ref] });
  assert.ok(scopedGraphSelectionSpans(body, view, apiGraph.nodes[0].selection).every(([start]) => start > generatedEnd),
    'API row dependencies retain authored Tracking context when promoted to graph roots');
  for (const roots of [
    [unknown, `artifact:${ID}#api-candidates`],
    [`artifact:${ID}#api-candidates`, unknown],
    [unknown, 'artifact:BRIDGE#rules'],
    ['artifact:BRIDGE#rules', unknown],
  ]) for (const project of [null, scopedProjectionNode]) {
    assert.throws(() => f.graph(roots, { project }), /SW-(REF|GRAPH).*ambig/i,
      'reference-string deduplication must not hide conflicting source rows');
  }
});

for (const location of ['Notes cell', 'section prose']) test(`#282 GENERATED: ordinary and Tracking references in ${location} keep separate source demands`, (t) => {
  const unknown = `unknown:U-LATER@${ID}`;
  for (const conflict of [false, true]) {
    const proxy = table(unknownHeaders, [['U-LATER', 'Generated proxy?', 'open']]);
    const body = bodyFor({
      api: table(['ID', ...headers, ...(location === 'Notes cell' ? ['Notes'] : [])],
        [['chosen', ...cells, ...(location === 'Notes cell' ? [unknown] : [])]]),
      apiAfter: location === 'section prose' ? `Ordinary reference: ${unknown}` : '',
      unknownBefore: generated(`${conflict ? `${proxy}\n\n` : ''}## Generated Summary\n\nOutput text.`),
    });
    const f = fixture(t, [{ body }]);
    const section = `artifact:${ID}#api-candidates`, row = `${section}/chosen`;
    for (const root of [section, `artifact:${ID}`]) {
      if (conflict) assert.throws(() => f.graph([root]), /SW-(REF|GRAPH).*ambig/i,
        'ordinary text must not disappear when its canonical ref equals a Tracking edge');
      else assert.deepEqual(f.graph([root]).edges, [{ from: root, to: unknown }]);
    }
    const candidate = f.api().candidates[0];
    const context = scopedGraphApiRowContext(body, candidate);
    assert.deepEqual(context.refs, [unknown]);
    assert.deepEqual(context.trackingRefs, [unknown]);
    assert.deepEqual(context.ordinaryRefs, location === 'Notes cell' ? [unknown] : [],
      'only ordinary references in the selected API row are graph-root demands');
    if (conflict && location === 'Notes cell') {
      assert.throws(() => f.graph([row]), /SW-(REF|GRAPH).*ambig/i);
      assert.throws(() => f.graph(context.refs, context), /SW-(REF|GRAPH).*ambig/i);
    } else {
      assert.deepEqual(f.graph([row]).edges, [{ from: row, to: unknown }]);
      assert.equal(f.graph(context.refs, context).nodes[0].selection.cells[1], 'Later API?');
    }
  }
});

test('#282 GENERATED: artifact Unknown section and row selectors retain authored dependencies and original spans', (t) => {
  for (const heading of ['## Generated Summary', '## Unknowns']) for (const eol of ['\n', '\r\n']) {
    const content = 'See `artifact:DETAIL#rules`';
    const body = bodyFor({ unknownBefore: generated(`${heading}\n\nOutput text.`),
      unknowns: table(unknownHeaders, [['U-LATER', content, 'open']]) }).replace(/\n/g, eol);
    const f = fixture(t, [{ body }, { id: 'DETAIL', body: '## Rules\nAuthoritative detail.' }]);
    const view = parseReconciliationReferenceView(body);
    const refs = createScopedReferenceResolver(f.options);
    const section = `artifact:${ID}#unknowns`, row = `${section}/U-LATER`;
    const directSelection = { type: 'section', section: 'unknowns' };
    assert.deepEqual(scopedGraphSelectionRefs(body, f.docs[0].fm, directSelection, view), ['artifact:DETAIL#rules']);
    const contentStart = body.indexOf(content), contentEnd = contentStart + content.length;
    for (const selection of [directSelection, refs.contract(section).selection, refs.contract(row).selection]) {
      const spans = scopedGraphSelectionSpans(body, view, selection);
      assert.ok(spans.some(([start, end]) => start >= contentStart && end <= contentEnd),
        'Unknown section/row must include authored content after a generated H2');
    }
    for (const root of [section, row]) {
      const graph = f.graph([root]);
      assert.deepEqual(ids(graph), [root, 'artifact:DETAIL#rules'].sort());
      assert.deepEqual(graph.edges, [{ from: root, to: 'artifact:DETAIL#rules' }]);
    }
  }
});

test('#282 GENERATED: authored caches follow a reparsed source tree instead of retaining obsolete node identities', async (t) => {
  // A separate real parser instance models the raw AST cache evicting this body
  // while the authored cache retains it, without allocating 32 MiB of filler.
  const { parseReconciliationReferenceView: reparse } = await import('./reconciliation-markdown-ast.mjs?generated-cache-generation');
  const body = bodyFor(variants.combined);
  const f = fixture(t, [{ body }]);
  const original = parseReconciliationReferenceView(body), fresh = reparse(body);
  assert.notEqual(original.tree, fresh.tree);
  const unknown = `unknown:U-LATER@${ID}`;
  assert.deepEqual(scopedGraphBodyRefs(body, original, f.docs[0].fm), [unknown]);
  assert.deepEqual(scopedGraphBodyRefs(body, fresh, f.docs[0].fm), [unknown],
    'Tracking cell identity must come from the same tree the scanner traverses');
  assert.deepEqual(scopedGraphSelectionRefs(body, f.docs[0].fm,
    { type: 'section', section: 'api-candidates' }, fresh), [unknown]);
  const refs = createScopedReferenceResolver(f.options);
  assert.deepEqual(refs.contract(unknown).selection.cells, unknownCells,
    'ordinary fallback compares raw/authored nodes from the same current AST');
  assert.deepEqual(scopedGraphApiRowDependencies(body, f.api().candidates[0]), [unknown]);
  const root = `artifact:${ID}#api-candidates`;
  assert.deepEqual(f.graph([root]).edges, [{ from: root, to: unknown }]);
});

test('#284 generic artifact rows preserve generated API and Unknown rows beside authored tables', (t) => {
  const apiHeaders = ['ID', ...headers];
  const authoredApi = ['author', 'GET', '/author', 'confirmed', 'active', '-', 'src/api/author/**'];
  const generatedApi = ['generated', 'GET', '/generated', 'confirmed', 'active', '-', 'src/api/generated/**'];
  const authoredUnknown = ['U-AUTHOR', 'Authored question?', 'open'];
  const generatedUnknown = ['U-GEN', 'Generated question?', 'open'];
  for (const eol of ['\n', '\r\n']) {
    const body = bodyFor({ api: table(apiHeaders, [authoredApi]), apiAfter: generated(table(apiHeaders, [generatedApi])),
      unknowns: table(unknownHeaders, [authoredUnknown]), unknownAfter: generated(table(unknownHeaders, [generatedUnknown])) }).replace(/\n/g, eol);
    const f = fixture(t, [{ body }]);
    const refs = createScopedReferenceResolver(f.options);
    const view = parseReconciliationReferenceView(body);
    for (const [section, columns, expected] of [
      ['api-candidates', apiHeaders, authoredApi], ['api-candidates', apiHeaders, generatedApi],
      ['unknowns', unknownHeaders, authoredUnknown], ['unknowns', unknownHeaders, generatedUnknown],
    ]) {
      const ref = `artifact:${ID}#${section}/${expected[0]}`;
      const selected = refs.contract(ref);
      assert.deepEqual(selected.selection, { type: 'row', section, key: expected[0], headers: columns, cells: expected });
      const graph = f.graph([ref]);
      assert.deepEqual(ids(graph), [ref]);
      assert.deepEqual(graph.edges, []);
      const rowText = `| ${expected.join(' | ')} |`, start = body.indexOf(rowText), end = start + rowText.length;
      for (const selection of [selected.selection, graph.nodes[0].selection]) {
        const spans = scopedGraphSelectionSpans(body, view, selection);
        assert.ok(spans.length > 0 && spans.every(([a, b]) => start <= a && b <= end));
      }
    }
    assert.throws(() => refs.tracking(`unknown:U-GEN@${ID}`), /SW-(GRAPH|REF)/,
      'generic evidence selection must not turn a generated row into an authored Tracking witness');
  }
});

for (const identicalCells of [false, true]) test(`#284 generic artifact rows reject physical raw/authored key collisions (${identicalCells ? 'same' : 'different'} cells)`, (t) => {
  const apiHeaders = ['ID', ...headers];
  const authoredApi = ['chosen', 'GET', '/author', 'confirmed', 'active', '-', 'src/api/author/**'];
  const generatedApi = identicalCells ? authoredApi : ['chosen', 'GET', '/generated', 'confirmed', 'active', '-', 'src/api/generated/**'];
  const authoredUnknown = ['U-SHARED', 'Authored question?', 'open'];
  const generatedUnknown = identicalCells ? authoredUnknown : ['U-SHARED', 'Generated question?', 'open'];
  for (const heading of [false, true]) {
    const apiExample = generated(`${table(apiHeaders, [generatedApi])}${heading ? '\n\n## Generated API Summary\n\nOutput.' : ''}`);
    const unknownExample = generated(`${table(unknownHeaders, [generatedUnknown])}${heading ? '\n\n## Generated Unknown Summary\n\nOutput.' : ''}`);
    const body = bodyFor({ api: table(apiHeaders, [authoredApi]), apiBefore: heading ? apiExample : '', apiAfter: heading ? '' : apiExample,
      unknowns: table(unknownHeaders, [authoredUnknown]), unknownBefore: heading ? unknownExample : '', unknownAfter: heading ? '' : unknownExample });
    const f = fixture(t, [{ body }]);
    const refs = createScopedReferenceResolver(f.options);
    for (const ref of [`artifact:${ID}#api-candidates/chosen`, `artifact:${ID}#unknowns/U-SHARED`]) {
      assert.throws(() => refs.contract(ref), /SW-REF-AMBIGUOUS/);
      assert.throws(() => f.graph([ref]), /SW-REF-AMBIGUOUS/);
    }
    assert.deepEqual(refs.tracking(`unknown:U-SHARED@${ID}`).selection.cells, authoredUnknown,
      'the local Tracking resolver continues to use the unique authored row');
  }
});

test('#284 generic artifact rows deduplicate one physical row visible through raw and authored homes', (t) => {
  const apiHeaders = ['ID', ...headers];
  const authoredApi = ['chosen', 'GET', '/author', 'confirmed', 'active', '-', 'src/api/author/**'];
  for (const sameHeading of [false, true]) {
    const body = bodyFor({ api: table(apiHeaders, [authoredApi]),
      apiBefore: generated(`${sameHeading ? '## API Candidates' : '## Generated API Summary'}\n\nOutput.`),
      unknownBefore: generated(`${sameHeading ? '## Unknowns' : '## Generated Unknown Summary'}\n\nOutput.`) });
    const f = fixture(t, [{ body }]);
    const refs = createScopedReferenceResolver(f.options);
    for (const [ref, expected] of [[`artifact:${ID}#api-candidates/chosen`, authoredApi], [`artifact:${ID}#unknowns/U-LATER`, unknownCells]]) {
      assert.deepEqual(refs.contract(ref).selection.cells, expected);
      assert.deepEqual(f.graph([ref]).nodes[0].selection.cells, expected);
    }
  }
});

for (const [title, slug, columns, row] of [
  ['API Candidates', 'api-candidates', ['ID', ...headers], ['chosen', 'GET', '/author', 'confirmed', 'active', '-', 'src/api/author/**']],
  ['Unknowns', 'unknowns', unknownHeaders, ['U-AUTHOR', 'Authored question?', 'open']],
]) {
  for (const format of ['plain', 'bold']) test(`#284 generic artifact section and row reject real duplicate ${title} (${format})`, (t) => {
    const heading = format === 'plain' ? `## ${title}` : `## **${title}**`;
    for (const eol of ['\n', '\r\n']) for (const duplicateFirst of [false, true]) {
      const authored = `## ${title}\n\n${table(columns, [row])}`;
      const duplicate = `${heading}\n\nartifact:MISSING`;
      const body = (duplicateFirst ? [duplicate, authored] : [authored, duplicate]).join('\n\n').replace(/\n/g, eol);
      const f = fixture(t, [{ body }]);
      const refs = createScopedReferenceResolver(f.options);
      for (const ref of [`artifact:${ID}#${slug}`, `artifact:${ID}#${slug}/${row[0]}`]) {
        assert.throws(() => refs.contract(ref), /SW-REF-AMBIGUOUS/);
        assert.throws(() => f.graph([ref]), /SW-REF-AMBIGUOUS/,
          'reject ambiguous selection before silently dropping the other real section or following its missing dependency');
      }
    }
  });

  test(`#284 generic artifact section and row ignore GENERATED same-slug ${title} headings`, (t) => {
    for (const heading of [`## ${title}`, `## **${title}**`]) for (const duplicateFirst of [false, true]) {
      const example = generated(`${heading}\n\nGenerated display text.`);
      const body = `## ${title}\n\n${(duplicateFirst ? [example, table(columns, [row])] : [table(columns, [row]), example]).join('\n\n')}`;
      const f = fixture(t, [{ body }]);
      const refs = createScopedReferenceResolver(f.options);
      const sectionRef = `artifact:${ID}#${slug}`, rowRef = `${sectionRef}/${row[0]}`;
      assert.ok(refs.contract(sectionRef).selection.content.includes(row[1]));
      assert.deepEqual(refs.contract(rowRef).selection.cells, row);
      for (const ref of [sectionRef, rowRef]) {
        assert.deepEqual(ids(f.graph([ref])), [ref]);
        assert.deepEqual(f.graph([ref]).edges, []);
      }
    }
  });
}
