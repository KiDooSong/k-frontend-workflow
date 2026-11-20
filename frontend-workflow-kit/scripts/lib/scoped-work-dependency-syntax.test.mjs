// Exercise the actual uncertainty evaluator, adding observations in memory only.
// No caller-supplied graph or file-validity result is added to the runtime API.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { resolveScopedContractGraph, scopedGraphSelectionSpans } from './scoped-work-graph.mjs';
import { scopedSelectionNodes } from './scoped-work-authored.mjs';
import { reconciliationParseStats, reconciliationSyntaxCacheStats,
  sharedReconciliationReferenceView } from './reconciliation-markdown-ast.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { hashBytes } from './current-work-request.mjs';

const moduleUrl = new URL('./scoped-work-uncertainty.mjs', import.meta.url);
let instrumented = fs.readFileSync(moduleUrl, 'utf8');
function insert(from, to) {
  assert.equal(instrumented.split(from).length, 2, `one production observation point: ${from}`);
  instrumented = instrumented.replace(from, to);
}
insert('function uncertaintyProjection(options, base) {', 'export function uncertaintyProjection(options, base, probe) {');
insert('computeUncertaintyProjection(options, base));', 'computeUncertaintyProjection(options, base, probe));');
insert('function computeUncertaintyProjection(options, base) {', 'function computeUncertaintyProjection(options, base, probe) {');
insert('    const graph = resolveScopedContractGraph({ contracts: [token],',
  '    const graphBefore = probe.parsed();\n    const graph = resolveScopedContractGraph({ contracts: [token],');
insert('    for (const file of graph.read_set) read(file.file, file.sha256);',
  '    probe.graph(probe.parsed() - graphBefore);\n    for (const file of graph.read_set) read(file.file, file.sha256);');
insert('    candidates.set(physical, { record, entry, evidence, affected: affectedOwners(affected) });',
  '    probe.candidate(evidence.nodes);\n    candidates.set(physical, { record, entry, evidence, affected: affectedOwners(affected) });');
insert('    if (!spans.has(node.selection)) {',
  '    if (!spans.has(node.selection)) {\n      const rangeBefore = probe.parsed();');
insert("      spans.set(node.selection, selectionSpans(doc.body, view, node.selection, node.kind === 'input-evidence'));",
  "      spans.set(node.selection, selectionSpans(doc.body, view, node.selection, node.kind === 'input-evidence'));\n      probe.range(node, probe.parsed() - rangeBefore);");
insert('  const records = new Map(); const applications = []; const review = []; const inputs = [];',
  '  probe.relations();\n  const records = new Map(); const applications = []; const review = []; const inputs = [];');
instrumented = instrumented.replace(/from '(\.\/[^']+)'/g,
  (_, relative) => `from ${JSON.stringify(new URL(relative, moduleUrl).href)}`);
instrumented += '\n//# sourceURL=scoped-work-dependency-syntax-probe.mjs\n';
const { uncertaintyProjection } = await import(`data:text/javascript;base64,${Buffer.from(instrumented).toString('base64')}`);
const parsed = () => reconciliationParseStats().parsed;
let fixtureId = 0;

function fixture(t, { peers = 1, family = 'unknown', oversized = true, nodeLimit = false, rows = 3 } = {}) {
  const id = ++fixtureId;
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-dependency-syntax-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const entries = new Map();
  const put = (name, body) => {
    const file = path.join(root, `${name}.md`), fm = { artifact_id: name, artifact_type: 'policy' };
    fs.writeFileSync(file, `---\n${JSON.stringify(fm)}\n---\n${body}`);
    const source = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const entry = { file, fm: source.data, body: source.body };
    entries.set(name, entry); return entry;
  };
  const refs = Array.from({ length: peers }, (_, index) => `artifact:peer-${index}#facts`);
  const rowsText = Array.from({ length: rows }, (_, index) => family === 'unknown'
    ? `| U-${index + 1} | ${refs.join(' ')} | open |` : `| C-${index + 1} | open | ${refs.join(' ')} |`).join('\n');
  put('questions', (family === 'unknown' ? '## Unknowns\n\n| ID | Question | Status |'
    : '## Conflicts\n\n| ID | Status | Evidence |') + `\n| --- | --- | --- |\n${rowsText}\n\n<!-- fixture ${id} -->\n`);
  // Typed Conflict refs use the target index's canonical row-family facts.
  // Build those facts through the real indexer, which also warms this small body.
  if (family === 'conflict') entries.set('questions', buildReconciliationTargetIndex({
    docs: [entries.get('questions')],
  }).artifacts.get('questions'));
  const documents = Array.from({ length: peers }, (_, index) => put(`peer-${index}`,
    // Each short paragraph adds twelve real AST nodes. Avoid a giant list's
    // Node 20 parser cost while still exceeding the unchanged node budget.
    `${nodeLimit ? '*a* *b* *c* *d*\n\n'.repeat(22000)
      : oversized ? `~~~\n${String(index).repeat(reconciliationSyntaxCacheStats().max_source_chars)}\n~~~\n\n` : ''}` +
    `<!-- dependency ${id}-${index} -->\n\n## Facts\n\nSelected evidence.\n`));
  const targetIndex = { artifacts: entries, duplicates: new Set() }, options = { projectRoot: root, targetIndex };
  const evidence = resolveScopedContractGraph({ ...options, contracts: refs });
  const owner = 'screen:DEPENDENCY-001';
  const base = { read_set: evidence.read_set, projection: {
    units: [{ owner, declaration: { id: 'fixture', contracts: refs }, sources: [], api_rows: [] }],
    owners: [{ owner, adopted: true, metadata: { domain: 'example' } }],
    decision_relations: { applications: [], memberships: [], evidence: { nodes: [], edges: [] } },
    host_links: [], evidence,
  } };
  return { root, documents, refs, options, base, family, rows };
}

function inspect(f, hooks = {}) {
  let candidateSelections = 0, rangeParses = 0, relationPhase = false;
  const nativeByFile = new Map(), arraysByFile = new Map(), graphParses = [], retained = [];
  const result = uncertaintyProjection(f.options, f.base, {
    parsed,
    graph(count) { graphParses.push(count); },
    candidate(nodes) {
      for (const node of nodes.filter((item) => f.refs.includes(item.ref))) {
        const entry = f.options.targetIndex.artifacts.get(node.artifact_id);
        const native = scopedSelectionNodes(entry.body, node.selection);
        assert.equal(native.length, 1);
        if (!nativeByFile.has(node.file)) { nativeByFile.set(node.file, new Set()); arraysByFile.set(node.file, []); }
        nativeByFile.get(node.file).add(native[0]); arraysByFile.get(node.file).push(native);
        retained.push(node);
        candidateSelections += 1;
      }
      hooks.candidate?.(candidateSelections);
    },
    range(node, count) { if (relationPhase && f.refs.includes(node.ref)) rangeParses += count; },
    relations() { relationPhase = true; hooks.relations?.(); },
  });
  return { result, candidateSelections, rangeParses, nativeByFile, arraysByFile, graphParses, retained };
}

for (const family of ['unknown', 'conflict']) {
  test(`#345 dependency syntax: three ${family} candidates share one oversized external selection`, (t) => {
    const f = fixture(t, { family }), before = parsed(), observed = inspect(f);
    assert.equal(observed.result.projection.uncertainty_relations.applications.length, 3);
    assert.ok(observed.result.projection.uncertainty_relations.applications.every((row) => row.relation === 'inverse-evidence'));
    assert.equal(observed.candidateSelections, 3);
    assert.deepEqual([...observed.nativeByFile.values()].map((nodes) => nodes.size), [1]);
    assert.equal(observed.rangeParses, 0);
    assert.deepEqual(observed.graphParses, [1, 0, 0], 'the dependency parses once within this evaluation');
    assert.equal(parsed() - before, family === 'conflict' ? 1 : 2,
      'one external parse and, unless the typed row index warmed it, one candidate document parse');
    assert.deepEqual(observed.result.read_set, [...f.options.targetIndex.artifacts.values()].map((entry) => ({
      file: path.basename(entry.file), sha256: hashBytes(fs.readFileSync(entry.file)),
    })).sort((a, b) => a.file.localeCompare(b.file)));
    const arrays = [...observed.arraysByFile.values()][0];
    assert.notEqual(arrays[0], arrays[1], 'physical node sharing must not merge mutable context wrappers');
    const sharedNode = arrays[0][0]; arrays[1][0] = null;
    assert.equal(arrays[0][0], sharedNode); assert.equal(arrays[2][0], sharedNode);
    const after = parsed(); sharedReconciliationReferenceView(f.documents[0].body);
    assert.equal(parsed() - after, 1, 'a completed evaluation cannot retain its oversized dependency in a global cache');
    const cache = reconciliationSyntaxCacheStats();
    assert.ok(cache.source_chars <= cache.max_source_chars && cache.nodes <= cache.max_nodes && cache.entries <= cache.max_entries);
  });
}

test('#345 dependency syntax: a shared external AST above the node budget also parses once per evaluation', (t) => {
  const before = reconciliationSyntaxCacheStats();
  const f = fixture(t, { nodeLimit: true }), observed = inspect(f);
  assert.ok(f.documents[0].body.length < reconciliationSyntaxCacheStats().max_source_chars,
    'this fixture exceeds structural retention, not the source-length limit');
  assert.equal(observed.result.projection.uncertainty_relations.applications.length, 3);
  assert.equal(observed.candidateSelections, 3);
  assert.deepEqual([...observed.nativeByFile.values()].map((nodes) => nodes.size), [1]);
  assert.deepEqual(observed.graphParses, [1, 0, 0]);
  assert.equal(observed.rangeParses, 0);
  const cache = reconciliationSyntaxCacheStats();
  assert.ok(cache.oversized > before.oversized, 'the node-budget overflow must reject global cache admission');
  assert.ok(cache.source_chars <= cache.max_source_chars && cache.nodes <= cache.max_nodes && cache.entries <= cache.max_entries);
});

test('#345 dependency syntax: alternating oversized dependencies retain one node per physical selection and no relation parses', (t) => {
  const f = fixture(t, { peers: 2 }), observed = inspect(f);
  assert.equal(observed.result.projection.uncertainty_relations.applications.length, 3);
  assert.equal(observed.candidateSelections, 6);
  assert.deepEqual([...observed.nativeByFile.values()].map((nodes) => nodes.size), [1, 1]);
  assert.equal(observed.rangeParses, 0);
  assert.deepEqual(observed.graphParses, [2, 2, 2], 'one overflow slot may reparse alternating dependencies instead of retaining all large trees');
  for (const node of observed.retained) {
    const entry = f.options.targetIndex.artifacts.get(node.artifact_id);
    assert.deepEqual(scopedGraphSelectionSpans(entry.body, null, node.selection),
      [[entry.body.indexOf('Selected evidence.'), entry.body.indexOf('Selected evidence.') + 'Selected evidence.'.length]]);
  }
});

test('#345 dependency syntax: reused syntax still validates a changed dependency on the next candidate graph', (t) => {
  const f = fixture(t), file = f.documents[0].file;
  assert.throws(() => inspect(f, { candidate(count) { if (count === 1) fs.appendFileSync(file, '\nChanged before next graph.\n'); } }),
    /snapshot|changed|differs/);
  const after = parsed(); sharedReconciliationReferenceView(f.documents[0].body);
  assert.equal(parsed() - after, 1, 'an exception releases the evaluation\'s oversized dependency slot');
});

test('#345 dependency syntax: precomputed external spans do not bypass the final current-byte audit', (t) => {
  const f = fixture(t);
  assert.throws(() => inspect(f, { relations() { fs.appendFileSync(f.documents[0].file, '\nLate source change.\n'); } }),
    /document changed during uncertainty resolution/);
});
