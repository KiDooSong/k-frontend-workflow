// Classification must outlive a document's active syntax batch without keeping
// an oversized authored view alive or changing the physical selection contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadLayoutProfile } from './layout-profile.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { reconciliationParseStats, reconciliationSyntaxCacheStats, reconciliationTreeNodeCount,
  parseReconciliationReferenceView } from './reconciliation-markdown-ast.mjs';
import { scopedAuthoredView, scopedAuthoredCacheStats, rememberScopedSelection,
  scopedSelectionNodes, copyScopedSelectionContext, withScopedDocumentSyntax } from './scoped-work-authored.mjs';
import { scopedUnknownAuthored, resolveScopedUncertaintyProjection } from './scoped-work-uncertainty.mjs';
import { resolveScopedApplicabilityProjection } from './scoped-work-applicability.mjs';
import { scopedBindingBasis } from './scoped-work-basis.mjs';
import { CURRENT_WORK_INPUT_LIMIT, hashBytes } from './current-work-request.mjs';

const table = (rows) => '| ID | Question | Status |\n|---|---|---|\n' +
  rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
const generated = (body) => `<!-- GENERATED:START summary -->\n\n${body}\n\n<!-- GENERATED:END summary -->`;
const oversized = (body) => `${body}\n\n## Appendix\n\n<!-- ${'x'.repeat(reconciliationSyntaxCacheStats().max_source_chars)} -->\n`;
const selection = (body, row, cells = ['U-SAME', 'Question?', 'open']) => rememberScopedSelection({
  type: 'row', section: 'unknowns', key: cells[0], headers: ['ID', 'Question', 'Status'], cells,
}, body, [row]);
const bounded = (stats) => {
  assert.ok(stats.source_chars <= stats.max_source_chars);
  assert.ok(stats.nodes <= stats.max_nodes);
  assert.ok(stats.entries <= stats.max_entries);
};

test('#335 Unknown reuse: four physical rows outside the node-budget batch need no additional parse', (t) => {
  const rows = Array.from({ length: 52800 }, (_, i) => `| U-${i} | Question? |`);
  const body = ['## Unknowns', '', '| ID | Question |', '| --- | --- |', ...rows, ''].join('\n');
  const view = scopedAuthoredView(body), nativeNodes = reconciliationTreeNodeCount(view.tree);
  assert.equal(body.length, 1256135);
  assert.equal(nativeNodes, 264009);
  assert.ok(body.length < reconciliationSyntaxCacheStats().max_source_chars);
  assert.ok(nativeNodes > reconciliationSyntaxCacheStats().max_nodes, 'this is structural eviction, not the long-source case');
  const table = view.sections.find((section) => section.slug === 'unknowns').tableNodes[0];
  const selections = table.children.slice(1, 5).map((row) => rememberScopedSelection({ type: 'row' }, body, [row]));
  const before = reconciliationParseStats().parsed;
  for (const selected of selections) assert.equal(scopedUnknownAuthored(body, selected), true);
  const parsed = reconciliationParseStats().parsed - before;
  t.diagnostic(`${nativeNodes} native nodes; four post-batch rows: ${parsed} additional parses`);
  assert.equal(parsed, 0);
  bounded(reconciliationSyntaxCacheStats()); bounded(scopedAuthoredCacheStats());
  const fresh = reconciliationParseStats().parsed;
  assert.notEqual(parseReconciliationReferenceView(body).tree, view.tree,
    'the compact row facts do not install the oversized tree in the global parser cache');
  assert.equal(reconciliationParseStats().parsed - fresh, 1);
});

test('#335 Unknown reuse: oversized generated and authored equal-cell rows keep distinct copied facts', () => {
  const cells = ['U-SAME', 'Question?', 'open'], rows = table([cells]);
  const body = oversized(`## Unknowns\n\n${generated(`${rows}\n\n## Generated Summary\n\nDisplay.`)}\n\n${rows}`);
  let ordinary, authored;
  withScopedDocumentSyntax(body, (raw) => {
    const tables = raw.tree.children.filter((node) => node.type === 'table');
    ordinary = selection(body, tables[0].children[1], cells);
    authored = selection(body, tables[1].children[1], cells);
    assert.equal(scopedUnknownAuthored(body, ordinary, raw), false);
    assert.equal(scopedUnknownAuthored(body, authored, raw), true);
  });
  assert.deepEqual(ordinary, authored, 'only the private physical context distinguishes these rows');
  const ordinaryCopy = copyScopedSelectionContext(ordinary, structuredClone(ordinary));
  const authoredCopy = copyScopedSelectionContext(authored, structuredClone(authored));
  const before = reconciliationParseStats().parsed;
  for (let unit = 0; unit < 6; unit += 1) {
    assert.equal(scopedUnknownAuthored(body, ordinaryCopy), false);
    assert.equal(scopedUnknownAuthored(body, authoredCopy), true);
  }
  const nodes = scopedSelectionNodes(body, authoredCopy), original = nodes[0];
  nodes[0] = scopedSelectionNodes(body, ordinaryCopy)[0];
  assert.equal(scopedUnknownAuthored(body, authoredCopy), false, 'a sidecar array cannot carry a former row\'s answer after replacement');
  nodes[0] = original;
  assert.equal(scopedUnknownAuthored(body, authoredCopy), true);
  assert.equal(scopedUnknownAuthored(body, structuredClone(authored)), false, 'JSON cannot supply physical source authority');
  authoredCopy.type = 'section';
  assert.equal(scopedUnknownAuthored(body, authoredCopy), false, 'a row fact cannot turn a section into a row');
  authoredCopy.type = 'row';
  assert.throws(() => scopedUnknownAuthored(`${body}\nChanged.`, authoredCopy), /SW-REF-SNAPSHOT: selection body changed/);
  assert.equal(reconciliationParseStats().parsed - before, 0);
  assert.deepEqual(authoredCopy, authored, 'reuse adds no public selection or basis fields');
});

test('#335 Unknown reuse: explicit custom raw homes cannot borrow or poison default row classification', () => {
  const body = oversized(`## Unknowns\n\n${table([['U-SAME', 'Question?', 'open']])}\n\n<!-- custom-view case -->`);
  let selected;
  withScopedDocumentSyntax(body, (raw) => {
    selected = selection(body, raw.sections.find((home) => home.slug === 'unknowns').tableNodes[0].children[1]);
    assert.equal(scopedUnknownAuthored(body, selected), true);
    const custom = { ...raw, sections: raw.sections.map((home) => home.slug !== 'unknowns' ? home : {
      ...home, tables: home.tables.map((entry) => ({ ...entry, headers: ['ID', 'Display', 'Status'] })),
    }) };
    assert.equal(scopedUnknownAuthored(body, selected, custom), false, 'an explicit noncanonical table has no authored Unknown signature');
    assert.equal(scopedUnknownAuthored(body, selected), true, 'a custom view does not replace canonical row facts');
  });
  const before = reconciliationParseStats().parsed;
  assert.equal(scopedUnknownAuthored(body, selected), true);
  assert.equal(reconciliationParseStats().parsed - before, 0);
});

test('#335 Unknown reuse: an unprepared foreign-parser row is classified once and copied without reparsing', async () => {
  const { parseReconciliationReferenceView: reparse } = await import('./reconciliation-markdown-ast.mjs?unknown-reuse-foreign-generation');
  const body = oversized(`## Unknowns\n\n${table([['U-SAME', 'Question?', 'open']])}\n\n<!-- foreign-generation case -->`);
  const raw = reparse(body), selected = selection(body, raw.sections.find((home) => home.slug === 'unknowns').tableNodes[0].children[1]);
  const first = reconciliationParseStats().parsed;
  assert.equal(scopedUnknownAuthored(body, selected), true);
  assert.ok(reconciliationParseStats().parsed - first <= 1, 'one uncached canonical parse may prepare a foreign row');
  const copied = copyScopedSelectionContext(selected, structuredClone(selected)), before = reconciliationParseStats().parsed;
  for (let unit = 0; unit < 4; unit += 1) assert.equal(scopedUnknownAuthored(body, copied), true);
  assert.equal(reconciliationParseStats().parsed - before, 0);
  assert.throws(() => scopedUnknownAuthored(`${body}\nChanged.`, copied), /SW-REF-SNAPSHOT: selection body changed/);
});

function applicationFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-unknown-reuse-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs'), kitRoot = path.join(root, '.kit'), docs = [];
  fs.mkdirSync(docsDir); fs.mkdirSync(kitRoot);
  const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n${body}`;
  const put = (name, fm, body) => {
    const file = path.join(docsDir, name);
    fs.writeFileSync(file, md(fm, body)); docs.push({ file, fm }); return file;
  };
  const owner = 'screen:REUSE-001', contract = 'artifact:REUSE-RULES#rules';
  const policyFile = path.join(kitRoot, 'policy.yaml'), policyOverlayFile = path.join(kitRoot, 'adoption.yaml');
  const layoutFile = path.join(kitRoot, 'layout.yaml'), manifestFile = path.join(kitRoot, 'manifest.yaml');
  fs.writeFileSync(policyFile, '{}');
  fs.writeFileSync(layoutFile, JSON.stringify({ roles: {
    screen: ['src/features/{domain}/screens/**'], domain_component: ['src/features/{domain}/components/**'],
    hook: ['src/features/{domain}/hooks/**'], api_client: ['src/api/**'], test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'],
  } }));
  fs.writeFileSync(manifestFile, JSON.stringify({ version: 1, artifacts: {} }));
  fs.writeFileSync(policyOverlayFile, JSON.stringify({ work_execution: { version: 1, owners: [owner], profiles: ['behavior'],
    role_limits: { behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } }));
  put('screen.md', { artifact_id: 'REUSE-SCREEN', artifact_type: 'screen-spec', screen_id: 'REUSE-001', domain: 'reuse',
    status: 'draft', api_required: false, screen_entry: 'src/features/reuse/screens/ReuseScreen.tsx', work_execution: { version: 1,
      units: ['one', 'two', 'three'].map((id) => ({ id, kind: 'behavior', contracts: [contract], sources: [] })) } },
  '## Notes\nThree independent consumers.');
  put('rules.md', { artifact_id: 'REUSE-RULES', artifact_type: 'domain-rules', domain: 'reuse', status: 'confirmed' },
    '## Rules\nPreserve behavior.');
  const fm = { artifact_id: 'REUSE-LARGE', artifact_type: 'domain-rules', domain: 'other', status: 'draft' };
  const body = `## Unknowns\n\n${table([['U-ONE', `Review ${contract}`, 'open'], ['U-TWO', `Review ${contract}`, 'resolved']])}`;
  const large = put('large.md', fm, body);
  const options = () => ({ owner, projectRoot: root, docsDir, kitRoot, policyFile, policyOverlayFile, layoutFile, manifestFile, inputArtifacts: [],
    layout: loadLayoutProfile({ kitRoot, flags: { layout: layoutFile } }), targetIndex: buildReconciliationTargetIndex({ docs }) });
  const expand = () => {
    fs.writeFileSync(large, md(fm, oversized(body)));
    assert.ok(fs.statSync(large).size < CURRENT_WORK_INPUT_LIMIT);
    return options();
  };
  return { root, large, options, expand };
}

test('#335 Unknown reuse: real applicability preserves row-by-unit facts, basis and file observations', (t) => {
  const f = applicationFixture(t), small = resolveScopedUncertaintyProjection(f.options());
  const smallClosure = resolveScopedApplicabilityProjection(f.options());
  const options = f.expand(), result = resolveScopedUncertaintyProjection(options);
  assert.deepEqual(result.projection, small.projection, 'unselected padding cannot alter any projected fact');
  assert.deepEqual(result.unaudited, small.unaudited);
  assert.deepEqual(result.read_set, small.read_set.map((entry) => entry.file === 'docs/large.md'
    ? { ...entry, sha256: hashBytes(fs.readFileSync(f.large)) } : entry));
  const { records, applications } = result.projection.uncertainty_relations;
  assert.equal(records.length, 2); assert.equal(applications.length, 6);
  const byRef = new Map(records.map((record) => [record.ref, record]));
  const before = reconciliationParseStats().parsed;
  for (const application of applications) {
    const record = byRef.get(application.uncertainty);
    assert.equal(scopedUnknownAuthored(options.targetIndex.artifacts.get(record.artifact_id).body, record.selection), true);
  }
  assert.equal(reconciliationParseStats().parsed - before, 0, 'the real applicability loop cannot parse once per row and unit');
  const closure = resolveScopedApplicabilityProjection(options);
  assert.deepEqual(closure.projection, smallClosure.projection, 'the actual fixed-point evaluator preserves every public projected fact');
  assert.deepEqual(closure.unaudited, smallClosure.unaudited);
  assert.deepEqual(closure.read_set, smallClosure.read_set.map((entry) => entry.file === 'docs/large.md'
    ? { ...entry, sha256: hashBytes(fs.readFileSync(f.large)) } : entry));
  const binding = { uncertainty: 'unknown:U-ONE@REUSE-LARGE', owner: options.owner,
    known_units: ['one', 'three', 'two'], blocks: ['one'] };
  assert.deepEqual(scopedBindingBasis(closure.projection, binding), scopedBindingBasis(smallClosure.projection, binding),
    'compact private facts cannot alter basis bytes, component digests or the full binding digest');
  fs.appendFileSync(f.large, '\nChanged after the completed pass.');
  assert.throws(() => resolveScopedApplicabilityProjection(options), /snapshot|changed|differs/,
    'retained syntax facts do not replace a new evaluation\'s current-file and read-set checks');
});
