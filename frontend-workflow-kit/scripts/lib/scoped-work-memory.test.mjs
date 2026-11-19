import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSyntaxCache } from './syntax-cache.mjs';
import { KIT_ROOT } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { parseReconciliationReferenceView, sharedReconciliationReferenceView,
  reconciliationTreeNodeCount, reconciliationSyntaxCacheStats } from './reconciliation-markdown-ast.mjs';
import { scopedAuthoredView, scopedAuthoredCacheStats, scopedSelectionNodes,
  copyScopedSelectionContext } from './scoped-work-authored.mjs';
import { createScopedReferenceResolver } from './scoped-work-refs.mjs';
import { scopedGraphSelectionSpans } from './scoped-work-graph.mjs';
import { resolveScopedUncertaintyProjection, scopedUnknownAuthored } from './scoped-work-uncertainty.mjs';

const limits = { maxSourceChars: 16, maxNodes: 8, maxEntries: 4 };
const assertBounded = (stats) => {
  assert.ok(stats.source_chars <= stats.max_source_chars);
  assert.ok(stats.nodes <= stats.max_nodes);
  assert.ok(stats.entries <= stats.max_entries);
};

test('#331 syntax retention enforces independent source, node and entry budgets with LRU hits', () => {
  for (const [label, config, first, next] of [
    ['source', { ...limits, maxSourceChars: 4 }, { sourceChars: 2, nodes: 1 }, { sourceChars: 1, nodes: 1 }],
    ['nodes', { ...limits, maxNodes: 4 }, { sourceChars: 1, nodes: 2 }, { sourceChars: 1, nodes: 1 }],
    ['entries', { ...limits, maxEntries: 2 }, { sourceChars: 1, nodes: 1 }, { sourceChars: 1, nodes: 1 }],
  ]) {
    const cache = createSyntaxCache(config), a = {}, b = {}, c = {};
    cache.set('a', a, first); cache.set('b', b, first);
    assert.equal(cache.get('a'), a, `${label}: a hit renews recency`);
    cache.set('c', c, next);
    assert.equal(cache.get('b'), undefined, `${label}: the least recent entry is evicted`);
    assert.equal(cache.get('a'), a); assert.equal(cache.get('c'), c);
    assertBounded(cache.stats());
    assert.equal(cache.stats().evictions, 1);
  }
});

test('#331 syntax replacement releases old weight and oversized values cannot displace useful entries', () => {
  const cache = createSyntaxCache(limits), a = {}, b = {}, updated = {};
  cache.set('a', a, { sourceChars: 8, nodes: 4 });
  cache.set('b', b, { sourceChars: 8, nodes: 4 });
  cache.set('a', updated, { sourceChars: 2, nodes: 1 });
  assert.equal(cache.get('a'), updated); assert.equal(cache.get('b'), b);
  assert.equal(cache.stats().source_chars, 10); assert.equal(cache.stats().nodes, 5);
  const before = cache.stats();
  cache.set('c', {}, { sourceChars: 17, nodes: 1 });
  cache.set('d', {}, { sourceChars: 1, nodes: 9 });
  assert.equal(cache.get('c'), undefined); assert.equal(cache.get('d'), undefined);
  assert.equal(cache.get('a'), updated); assert.equal(cache.get('b'), b);
  assert.equal(cache.stats().source_chars, before.source_chars);
  assert.equal(cache.stats().nodes, before.nodes);
  assert.equal(cache.stats().evictions, before.evictions);
  assert.equal(cache.stats().oversized - before.oversized, 2);
  cache.set('a', {}, { sourceChars: 2, nodes: 9 });
  assert.equal(cache.get('a'), undefined, 'an oversized replacement cannot leave an obsolete cached value');
  assert.equal(cache.get('b'), b);
  assertBounded(cache.stats());
  const observation = cache.stats(); observation.entries = -1; observation.nodes = -1;
  assert.equal(cache.stats().entries, 1, 'diagnostic copies cannot mutate retention');
  assert.equal(cache.stats().nodes, 4);
});

const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n${body}`;
const table = '| ID | Question | Status |\n|---|---|---|\n| U-SAME | Same question? | open |\n';

test('#331 dense syntax evicts by native nodes and preserves raw/authored physical selections after reparsing', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-memory-selection-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const body = `## Unknowns\n\n<!-- GENERATED:START summary -->\n\n${table}\n## Generated Summary\n\nOutput.\n\n<!-- GENERATED:END summary -->\n\n${table}`;
  const file = path.join(root, 'rules.md'), fm = { artifact_id: 'MEMORY-RULES', artifact_type: 'domain-rules', status: 'draft' };
  fs.writeFileSync(file, md(fm, body));
  const targetIndex = buildReconciliationTargetIndex({ docs: [{ file, fm }] });
  const refs = () => createScopedReferenceResolver({ targetIndex, projectRoot: root });
  const token = 'unknown:U-SAME@MEMORY-RULES', oldRefs = refs();
  const raw = oldRefs.contract(token), authored = oldRefs.authoredContract(token);
  assert.deepEqual(raw.selection, authored.selection, 'public cells alone cannot distinguish physical rows');
  const rawNode = scopedSelectionNodes(body, raw.selection)[0], authoredNode = scopedSelectionNodes(body, authored.selection)[0];
  assert.notEqual(rawNode.position.start.offset, authoredNode.position.start.offset);
  const rawCopy = copyScopedSelectionContext(raw.selection, structuredClone(raw.selection));
  const authoredCopy = copyScopedSelectionContext(authored.selection, structuredClone(authored.selection));
  const original = parseReconciliationReferenceView(body), originalAuthored = scopedAuthoredView(body, original);
  const expectedRaw = scopedGraphSelectionSpans(body, original, rawCopy);
  const expectedAuthored = scopedGraphSelectionSpans(body, original, authoredCopy);
  const before = { parser: reconciliationSyntaxCacheStats(), authored: scopedAuthoredCacheStats() };
  const budget = Math.max(before.parser.max_nodes, before.authored.max_nodes);
  let pressure = 0, sourceChars = 0, entries = 0;
  while (pressure <= budget) {
    const dense = `## Cache pressure ${entries}\n\n` + Array.from({ length: 160 }, (_, i) =>
      `- Fact ${entries}/${i}: **value** [link](https://example.invalid/${i}).`).join('\n');
    const view = sharedReconciliationReferenceView(dense);
    scopedAuthoredView(dense, view);
    pressure += reconciliationTreeNodeCount(view.tree); sourceChars += dense.length; entries += 1;
    assertBounded(reconciliationSyntaxCacheStats()); assertBounded(scopedAuthoredCacheStats());
    assert.ok(entries < 512, 'the dense corpus must hit nodes before the entry limit');
  }
  assert.ok(sourceChars < Math.min(before.parser.max_source_chars, before.authored.max_source_chars),
    'short dense syntax pressures node retention while the entire source still fits');
  assert.ok(reconciliationSyntaxCacheStats().evictions > before.parser.evictions);
  assert.ok(scopedAuthoredCacheStats().evictions > before.authored.evictions);
  const fresh = parseReconciliationReferenceView(body), freshAuthored = scopedAuthoredView(body, fresh);
  assert.notEqual(fresh.tree, original.tree, 'the real parser entry was evicted');
  assert.notEqual(freshAuthored, originalAuthored, 'the authored entry cannot retain every old native tree');
  assert.deepEqual(scopedGraphSelectionSpans(body, fresh, rawCopy), expectedRaw);
  assert.deepEqual(scopedGraphSelectionSpans(body, fresh, authoredCopy), expectedAuthored);
  assert.equal(scopedUnknownAuthored(body, rawCopy, fresh), false);
  assert.equal(scopedUnknownAuthored(body, authoredCopy, fresh), true);
  assert.deepEqual(refs().contract(token), raw);
  assert.deepEqual(refs().authoredContract(token), authored);
});

function uncertaintyFixture(t, count) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-memory-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs'), docs = [];
  const put = (name, fm, body) => {
    const file = path.join(docsDir, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, md(fm, body)); docs.push({ file, fm }); return file;
  };
  const owner = 'screen:MEMORY-001';
  const policyFile = path.join(root, 'policy.yaml'), policyOverlayFile = path.join(root, 'adoption.yaml');
  fs.writeFileSync(policyFile, '{}');
  fs.writeFileSync(policyOverlayFile, JSON.stringify({ work_execution: { version: 1, owners: [owner], profiles: ['behavior'],
    role_limits: { behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } }));
  put('screen.md', { artifact_id: 'MEMORY-SCREEN', artifact_type: 'screen-spec', screen_id: 'MEMORY-001',
    domain: 'memory', status: 'draft', screen_entry: 'src/features/memory/screens/MemoryScreen.tsx', api_required: false,
    work_execution: { version: 1, units: [{ id: 'known', kind: 'behavior', contracts: ['artifact:MEMORY-CONTRACT#rules'], sources: [] }] } },
  '## Notes\nOne synthetic owner.');
  put('rules.md', { artifact_id: 'MEMORY-CONTRACT', artifact_type: 'domain-rules', domain: 'memory', status: 'confirmed' },
    '## Rules\nPreserve the displayed result.');
  const extra = [];
  for (let i = 0; i < count; i += 1) extra.push(put(`unrelated-${String(i).padStart(4, '0')}.md`, {
    artifact_id: `MEMORY-UNRELATED-${i}`, artifact_type: 'domain-rules', domain: 'other', status: 'draft',
  }, `## Notes\nUnrelated synthetic note ${i}.` + (i === count - 1
    ? '\n\n## Unknowns\n| ID | Question | Status |\n|---|---|---|\n| U-LATE | Review artifact:MEMORY-CONTRACT#rules | open |\n'
    : '')));
  return { root, extra, options: { owner, policyFile, policyOverlayFile, docsDir, projectRoot: root,
    layout: loadLayoutProfile({ kitRoot: KIT_ROOT }), inputArtifacts: [],
    targetIndex: buildReconciliationTargetIndex({ docs }) } };
}

test('#331 a document sweep larger than retention keeps every audit hash and rejects a late mutation', (t) => {
  const count = createSyntaxCache().stats().max_entries + 8;
  const f = uncertaintyFixture(t, count);
  const before = resolveScopedUncertaintyProjection(f.options);
  assert.deepEqual(before.projection.uncertainty_relations.records.map((row) => row.ref),
    [`unknown:U-LATE@MEMORY-UNRELATED-${count - 1}`], 'a late inverse dependency still joins the selected evidence');
  assert.ok(before.projection.uncertainty_relations.evidence.nodes.some((node) => node.ref === 'artifact:MEMORY-CONTRACT#rules'));
  const reads = new Set(before.read_set.map((entry) => entry.file));
  for (const file of f.extra) assert.ok(reads.has(path.relative(f.root, file).split(path.sep).join('/')),
    'evicting a document view never drops its validation read');
  const again = resolveScopedUncertaintyProjection(f.options);
  assert.deepEqual(again, before, 'reparsed syntax leaves every projection and audit byte unchanged');
  const first = f.extra[0], last = f.extra.at(-1), originalOpen = fs.openSync;
  let changed = false, revisited = false;
  const hook = t.mock.method(fs, 'openSync', function (file, ...args) {
    if (file === first && changed && typeof args[0] === 'number' &&
      !(args[0] & fs.constants.O_WRONLY) && !(args[0] & fs.constants.O_RDWR)) revisited = true;
    if (file === last && !changed && / at document \([^)]*scoped-work-uncertainty\.mjs:/.test(new Error().stack)) {
      changed = true;
      fs.appendFileSync(first, '\nChanged after the cache-sized document sweep.');
    }
    return originalOpen.call(this, file, ...args);
  });
  assert.throws(() => resolveScopedUncertaintyProjection(f.options), /document changed during uncertainty resolution/);
  hook.mock.restore();
  assert.equal(changed, true, 'the last inspected document triggered the mutation');
  assert.equal(revisited, true, 'the evicted first document still receives a final file read');
});
