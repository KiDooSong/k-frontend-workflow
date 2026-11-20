// Public synthetic end-to-end probes for kit issues #350–#353.
// Derived from https://github.com/KiDooSong/ck-ai-m/issues/9.
// Usage (Node 24): node scoped-evaluation-boundaries.mjs CASE KIT_DIR [RESULT_JSON]
// RESULT_JSON preserves the complete semantic output for byte comparison.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [testCase, kitDir, resultFile] = process.argv.slice(2);
let semanticResult;
assert(['unknown', 'reads', 'retention', 'iterator'].includes(testCase) && kitDir);
const lib = pathToFileURL(path.join(fs.realpathSync(path.resolve(kitDir)), 'scripts/lib') + path.sep);
const load = (name) => import(new URL(name + '.mjs', lib));
const readCounter = Symbol.for('frontkit.review.readCounter');

function replaceMarker(source, marker, replacement) {
  assert.equal(source.split(marker).length, 2, 'Expected one ' + marker);
  return source.replace(marker, replacement);
}

// Count real reader calls and sample the evaluator at the row-batch boundary.
// The loader instruments the in-memory copies of the installed modules.
registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (!url.startsWith(lib.href)) return loaded;
    if (url.endsWith('/scoped-work-uncertainty.mjs')) {
      let source = String(loaded.source) + '\nexport { uncertaintyProjection };';
      if (testCase === 'retention') {
        const boundary = '  const skipped = new Map();';
        source = replaceMarker(source, boundary, '  options.measure(refs, documents.stats());\n' + boundary);
      }
      return { ...loaded, source };
    }
    if (url.endsWith('/current-work-request.mjs') && ['reads', 'retention'].includes(testCase)) {
      const marker = "export function readCurrentBytes(file, label = 'input') {";
      const tick = "\n  globalThis[Symbol.for('frontkit.review.readCounter')]?.(file, label);";
      return { ...loaded, source: replaceMarker(String(loaded.source), marker, marker + tick) };
    }
    return loaded;
  },
});

const ast = await load('reconciliation-markdown-ast');
const authored = await load('scoped-work-authored');
const graph = await load('scoped-work-graph');
const uncertainty = await load('scoped-work-uncertainty');
assert.equal(typeof uncertainty.uncertaintyProjection, 'function');
const refs = await load('scoped-work-refs');
const { buildReconciliationTargetIndex } = await load('reconciliation-target-index');
const { loadInputArtifact } = await load('input-artifact');

function fixture(run) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'frontkit-r5-repro-')));
  try {
    function write(name, metadata, body) {
      const file = path.join(root, name);
      fs.writeFileSync(file, '---\n' + JSON.stringify(metadata) + '\n---\n' + body, { flag: 'wx' });
      return { file, fm: metadata };
    }
    return run(root, write);
  } finally {
    delete globalThis[readCounter];
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const emptyEvidence = () => ({ nodes: [], roots: [], edges: [] });
function baseFor(owner, contracts = [], evidence = emptyEvidence()) {
  const units = owner ? [{ owner, declaration: { id: 'fixture', contracts }, sources: [], api_rows: [] }] : [];
  const owners = owner ? [{ owner, adopted: true }] : [];
  return { read_set: evidence.read_set ?? [], projection: {
    owner, units, owners, host_links: [], evidence,
    decision_relations: { evidence: emptyEvidence(), applications: [], memberships: [] },
  } };
}
const unknownRows = (rows) => [
  '## Unknowns', '', '| ID | Question | Status |', '| --- | --- | --- |', ...rows, '',
].join('\n');

function unknown() {
  return fixture((projectRoot, write) => {
    const doc = write('review-notes.md',
      { artifact_id: 'review-notes', artifact_type: 'screen-spec', screen_id: 'REV-001' },
      unknownRows(['| U-001 | Original? | open |']));
    const targetIndex = buildReconciliationTargetIndex({ docs: [doc] });
    const { body } = targetIndex.artifacts.get('review-notes');
    const options = { targetIndex, projectRoot };
    const ref = 'artifact:review-notes#unknowns/U-001';
    const evidence = graph.resolveScopedContractGraph({ ...options, contracts: [ref] });
    const base = baseFor('screen:REV-001', [ref], evidence);
    const selected = evidence.nodes[0].selection;
    const tree = ast.sharedReconciliationReferenceView(body).tree;
    const publicView = authored.scopedAuthoredView(body, ast.parseReconciliationReferenceView(body));
    const headers = publicView.byName.get('unknowns')[0].tables[0].headers;
    headers[1] = 'Edited';
    const observe = () => {
      const classified = authored.withScopedDocumentSyntax(body, (raw) =>
        uncertainty.scopedUnknownAuthored(body, selected, raw));
      try {
        const result = uncertainty.uncertaintyProjection(options, base);
        semanticResult = result;
        return { classified, applications: result.projection.uncertainty_relations.applications.length,
          edited: headers[1], outputSha256: createHash('sha256').update(JSON.stringify(result)).digest('hex') };
      } catch (error) {
        return { classified, error: error.message, edited: headers[1] };
      }
    };
    const before = observe();
    for (let i = 0; i < 515; i += 1) ast.parseReconciliationReferenceView('eviction ' + i);
    const evicted = tree !== ast.sharedReconciliationReferenceView(body).tree;
    assert(evicted);
    return { before, evicted, after: observe() };
  });
}

function inputReads() {
  return fixture((projectRoot, write) => {
    const inputId = 'IN-20261120-meeting-777';
    const numbers = Array.from({ length: 12 }, (_, index) => index + 1);
    const input = write('input.md', {
      input_id: inputId, input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting/example',
      captured_at: '2026-11-20T00:00:00Z', captured_by: 'fixture',
      status: 'captured', affected_domains: ['example'], affected_screens: ['EXAMPLE-001'],
    }, numbers.map((i) => '## Section ' + i + '\n\nEvidence.\n').join('\n'));
    const anchors = numbers.map((i) => 'input:' + inputId + '#section-' + i).join(' ');
    const rows = Array.from({ length: 5 }, (_, i) => '| U-' + (i + 1) + ' | See ' + anchors + ' | open |');
    const doc = write('unknowns.md', { artifact_id: 'fixture', artifact_type: 'conflicts' }, unknownRows(rows));
    const options = {
      projectRoot, targetIndex: buildReconciliationTargetIndex({ docs: [doc] }),
      inputArtifacts: [loadInputArtifact(input.file)],
    };
    const counts = {};
    globalThis[readCounter] = (file, label) => {
      if (file === input.file) counts[label] = (counts[label] ?? 0) + 1;
    };
    const result = uncertainty.uncertaintyProjection(options, baseFor(null));
    semanticResult = result;
    return {
      readsByLabel: counts,
      totalReads: Object.values(counts).reduce((sum, value) => sum + value, 0),
      readSet: result.read_set.length,
      outputSha256: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
    };
  });
}

function retention() {
  return fixture((projectRoot, write) => {
    const maxChars = ast.reconciliationSyntaxCacheStats().max_source_chars;
    const filler = 'x'.repeat(maxChars);
    const docs = [1, 2, 3, 4].map((i) => {
      const question = i === 4 ? '' : 'Valid?';
      const body = unknownRows(['| U-' + i + ' | ' + question + ' | open |']) +
        '\n~~~\n' + filler + i + '\n~~~\n';
      return write('doc-' + i + '.md',
        { artifact_id: 'doc-' + i, artifact_type: 'screen-spec', screen_id: 'OTHER-' + i }, body);
    });
    const targetIndex = buildReconciliationTargetIndex({ docs });
    let boundary;
    let malformedReads = 0;
    globalThis[readCounter] = (file) => {
      if (file === docs[3].file) malformedReads += 1;
    };
    const options = { projectRoot, targetIndex, measure(resolver, cache) {
      const retained = [...targetIndex.artifacts.values()]
        .filter(({ fm, body }) => refs.scopedReferenceResolverView(resolver, fm.artifact_id, body) !== null)
        .map(({ fm }) => fm.artifact_id);
      boundary = { retained, documentCacheEntries: cache.entries, documentOversizeMisses: cache.oversized };
    } };
    const result = uncertainty.uncertaintyProjection(options, baseFor('screen:FOCUS'));
    semanticResult = result;
    return {
      ...boundary,
      applications: result.projection.uncertainty_relations.applications.length,
      malformedReads,
      unaudited: result.unaudited.map(({ file }) => file),
    };
  });
}

function iterator() {
  const point = (offset) => Object.freeze({ offset });
  const position = (start, end) => Object.freeze({ start: point(start), end: point(end) });
  const leaf = (start, end) => Object.freeze({ type: 'text', position: position(start, end) });
  const first = leaf(0, 1);
  const second = leaf(1, 2);
  const body = 'ab';
  const selectionFor = (children) => authored.rememberScopedSelection({ type: 'section' }, body,
    [Object.freeze({ type: 'paragraph', position: position(0, 2), children })]);
  let selected = first;
  const custom = [first];
  custom[Symbol.iterator] = function* () { yield selected; };
  const own = selectionFor(Object.freeze(custom));
  const ordinary = selectionFor(Object.freeze([first]));
  const resolve = graph.createScopedGraphSelectionSpanResolver();
  const initial = resolve(body, null, ordinary);
  const ownInitial = resolve(body, null, own);
  selected = second;
  const ownAfter = resolve(body, null, own);
  const ownFresh = graph.scopedGraphSelectionSpans(body, null, own);

  const prototype = Object.getPrototypeOf([][Symbol.iterator]());
  const saved = Object.getOwnPropertyDescriptor(prototype, 'next');
  let cached;
  let fresh;
  try {
    Object.defineProperty(prototype, 'next', { ...saved, value() {
      const step = saved.value.call(this);
      return step.value === first ? { done: false, value: second } : step;
    } });
    cached = resolve(body, null, ordinary);
    fresh = graph.scopedGraphSelectionSpans(body, null, ordinary);
  } finally {
    Object.defineProperty(prototype, 'next', saved);
  }
  return { own: [ownInitial, ownAfter, ownFresh], inheritedNext: [initial, cached, fresh] };
}

const cases = { unknown, reads: inputReads, retention, iterator };
const observations = cases[testCase]();
const semantic = JSON.stringify(semanticResult ?? observations);
if (resultFile) fs.writeFileSync(resultFile, semantic, { flag: 'wx' });
console.log(JSON.stringify({ case: testCase, node: process.version, observations,
  result_bytes: Buffer.byteLength(semantic),
  result_sha256: createHash('sha256').update(semantic).digest('hex') }));
