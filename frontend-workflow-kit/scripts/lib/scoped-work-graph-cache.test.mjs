import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { createScopedReferenceResolver } from './scoped-work-refs.mjs';
import { parseReconciliationReferenceView, sharedReconciliationReferenceView,
  reconciliationSyntaxCacheStats } from './reconciliation-markdown-ast.mjs';
import { copyScopedSelectionContext, scopedAuthoredView } from './scoped-work-authored.mjs';
import { resolveScopedContractGraph, resolveScopedCandidateGraph, scopedGraphSelectionRefs,
  scopedGraphSelectionSpans } from './scoped-work-graph.mjs';

const ID = 'CACHE-SCREEN', API = `artifact:${ID}#api-candidates`, UNKNOWN = `unknown:U-LATER@${ID}`;
const columns = ['ID', 'Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths', 'Notes'];
const cells = ['chosen', 'GET', '/later', 'candidate', 'deferred', 'unknown:U-LATER', 'src/api/later/**', ''];
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const generated = (body) => `<!-- GENERATED:START summary -->\n\n${body}\n\n<!-- GENERATED:END summary -->`;
const bodyFor = ({ notes = '', apiAfter = '', status = 'open', unknownBefore = '' } = {}) =>
  `## API Candidates\n\n${table(columns, [[...cells.slice(0, -1), notes]])}\n\n${apiAfter}\n\n## Unknowns\n\n${unknownBefore}\n\n` +
  table(['ID', 'Question', 'Status'], [['U-LATER', 'Later API?', status]]);

function fixture(t, body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-graph-cache-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'screen.md');
  const fm = { artifact_id: ID, artifact_type: 'screen-spec', screen_id: 'CACHE-001', domain: 'cache', status: 'draft' };
  fs.writeFileSync(file, `---\n${JSON.stringify(fm)}\n---\n${body}`);
  const options = { projectRoot: root, targetIndex: buildReconciliationTargetIndex({ docs: [{ file, fm }] }), inputArtifacts: [] };
  return { body, fm, options, refs: createScopedReferenceResolver(options) };
}

const modes = {
  strict: (options, refs) => resolveScopedContractGraph({ ...options, contracts: refs }),
  candidate: (options, refs) => resolveScopedCandidateGraph({ ...options, roots: refs.map((ref) => ({ ref, mode: 'ordinary' })) }),
};
function referenceEdges(graph) {
  const refs = new Map(graph.nodes.map((node) => [node.key ?? node.ref, node.ref]));
  return graph.edges.map((edge) => ({ from: refs.get(edge.from), to: refs.get(edge.to) }));
}

test('#331 graph cache: remembered API rows and sections keep Tracking across native parser generations', async (t) => {
  const { parseReconciliationReferenceView: reparse } = await import('./reconciliation-markdown-ast.mjs?graph-cache-generation');
  for (const eol of ['\n', '\r\n']) {
    const body = bodyFor().replace(/\n/g, eol), f = fixture(t, body);
    const original = parseReconciliationReferenceView(body), fresh = reparse(body);
    assert.notEqual(original.tree, fresh.tree);
    for (const token of [API, `${API}/chosen`]) {
      const selected = f.refs.contract(token).selection;
      const copy = copyScopedSelectionContext(selected, structuredClone(selected));
      const spans = scopedGraphSelectionSpans(body, original, selected);
      for (const selection of [selected, copy]) {
        assert.deepEqual(scopedGraphSelectionRefs(body, f.fm, selection, fresh), [UNKNOWN]);
        assert.deepEqual(scopedGraphSelectionSpans(body, fresh, selection), spans);
        assert.throws(() => scopedGraphSelectionRefs(`${body}\nChanged.`, f.fm, selection, fresh),
          /selection body changed/, 'a different body cannot borrow the old cell coordinates');
      }
    }
  }
});

test('#331 graph cache: other columns and separate GENERATED rows cannot borrow canonical Tracking spans', async (t) => {
  const { parseReconciliationReferenceView: reparse } = await import('./reconciliation-markdown-ast.mjs?graph-cache-ordinary');
  const generatedCells = ['display', ...cells.slice(1)];
  const body = bodyFor({ apiAfter: generated(table(columns, [generatedCells])) });
  const f = fixture(t, body), fresh = reparse(body);
  const chosen = f.refs.contract(`${API}/chosen`).selection, display = f.refs.contract(`${API}/display`).selection;
  assert.deepEqual(scopedGraphSelectionRefs(body, f.fm, chosen, fresh), [UNKNOWN]);
  assert.throws(() => scopedGraphSelectionRefs(body, f.fm, display, fresh),
    /unsupported or malformed typed reference: unknown:U-LATER/,
    'identical Tracking text in a different physical table remains ordinary evidence');
  const other = fixture(t, bodyFor({ notes: 'unknown:U-LATER' }));
  const selection = other.refs.contract(`${API}/chosen`).selection;
  assert.throws(() => scopedGraphSelectionRefs(other.body, other.fm, selection, reparse(other.body)),
    /unsupported or malformed typed reference: unknown:U-LATER/,
    'a different column does not inherit the Tracking shorthand exception');
  for (const run of Object.values(modes)) {
    assert.throws(() => run(f.options, [`${API}/display`]), /unsupported or malformed typed reference/);
    assert.throws(() => run(other.options, [`${API}/chosen`]), /unsupported or malformed typed reference/);
  }
});

test('#331 graph cache: canonical Tracking still requires an open authored Unknown and preserves physical alternatives', (t) => {
  const resolved = fixture(t, bodyFor({ status: 'resolved' }));
  for (const run of Object.values(modes)) {
    assert.throws(() => run(resolved.options, [API]), /deferred Tracking requires a canonical open Unknown/);
  }
  const proxy = table(['ID', 'Question', 'Status'], [['U-LATER', 'Later API?', 'open']]);
  const body = bodyFor({ unknownBefore: generated(`${proxy}\n\n## Generated Summary\n\nOutput.`) });
  const f = fixture(t, body);
  for (const refs of [[API, UNKNOWN], [UNKNOWN, API]]) {
    assert.throws(() => modes.strict(f.options, refs), /ambiguous raw\/authored selection/);
    const candidate = modes.candidate(f.options, refs);
    const alternatives = candidate.nodes.filter((node) => node.ref === UNKNOWN);
    assert.equal(alternatives.length, 2, 'candidate discovery keeps both physical Unknown rows');
    assert.deepEqual(alternatives.map((node) => node.modes[0]).sort(), ['ordinary', 'tracking']);
    const view = parseReconciliationReferenceView(body);
    assert.notDeepEqual(...alternatives.map((node) => scopedGraphSelectionSpans(body, view, node.record.selection)));
  }
});

test('#331 graph cache: an oversized uncached body keeps strict and candidate deferred Tracking graphs equivalent', (t) => {
  const budget = reconciliationSyntaxCacheStats().max_source_chars;
  const body = `${bodyFor()}\n\n## Appendix\n\n<!-- ${'x'.repeat(budget)} -->\n`;
  assert.ok(body.length > budget);
  const f = fixture(t, body), before = reconciliationSyntaxCacheStats();
  const strict = modes.strict(f.options, [API]), candidate = modes.candidate(f.options, [API]);
  assert.deepEqual(strict.nodes.map((node) => node.ref).sort(), [API, UNKNOWN].sort());
  assert.deepEqual(candidate.nodes.map((node) => node.ref).sort(), [API, UNKNOWN].sort());
  assert.deepEqual(referenceEdges(strict), [{ from: API, to: UNKNOWN }]);
  assert.deepEqual(referenceEdges(candidate), referenceEdges(strict));
  assert.deepEqual(candidate.read_set, strict.read_set, 'both graphs verify the same actual file bytes');
  assert.equal(candidate.nodes.find((node) => node.ref === UNKNOWN).record.selection.cells[2], 'open');
  assert.ok(reconciliationSyntaxCacheStats().oversized > before.oversized,
    'the real configured cache bypass, not a mocked parse, caused repeated native generations');
});

test('#350 graph cache: custom Tracking interpretations cannot populate or borrow the canonical tree cache', (t) => {
  const body = `${bodyFor()}\n\n<!-- custom Tracking cache provenance -->\n`, f = fixture(t, body);
  const selection = f.refs.contract(`${API}/chosen`).selection;
  const custom = parseReconciliationReferenceView(body), canonical = sharedReconciliationReferenceView(body);
  assert.equal(custom.tree, canonical.tree, 'both interpretations deliberately share the same native tree');
  const home = scopedAuthoredView(body, custom).byName.get('api candidates')[0], tableNode = home.tableNodes[0];
  home.tableNodes.length = 0;
  const read = (view) => scopedGraphSelectionRefs(body, f.fm, selection, view);
  assert.throws(() => read(custom), /unsupported or malformed typed reference: unknown:U-LATER/);
  assert.deepEqual(read(canonical), [UNKNOWN], 'a custom-first miss cannot poison canonical Tracking');
  home.tableNodes.push(tableNode);
  assert.deepEqual(read(custom), [UNKNOWN], 'a later explicit custom edit must be observed');
  home.tableNodes.length = 0;
  assert.throws(() => read(custom), /unsupported or malformed typed reference: unknown:U-LATER/,
    'a custom view cannot inherit a previously cached canonical Tracking exception');
  assert.deepEqual(read(canonical), [UNKNOWN]);
  assert.equal(home.tableNodes.length, 0, 'internal canonical processing preserves the public custom edit');
});
