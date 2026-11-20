// Public synthetic probes for #344–#348. Run exactly one case per fresh process
// with the same Node executable for each before/after observation. This observes
// parse counts and semantic results, not end-to-end CLI or consumer performance.
//
// node scoped-syntax-lifetimes.mjs KIT_ROOT 344|345|346|347|348 [FRESH_RESULT_FILE]
// KIT_ROOT names a frontend-workflow-kit directory with installed dependencies.
// Optional 344-node / 346-node cases exceed the node budget instead of the source
// budget. Those cases can be substantially slower; no enlarged heap is required.
// The optional file contains the complete semantic JSON with no normalization.
// Existing files are never overwritten. Stdout contains observations and its hash.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HELP = `Usage: node scoped-syntax-lifetimes.mjs KIT_ROOT 344|345|346|347|348 [FRESH_RESULT_FILE]

Run one synthetic case in a fresh process; use the same Node executable before/after.
KIT_ROOT: frontend-workflow-kit directory with installed dependencies.
FRESH_RESULT_FILE: optional new file for complete semantic JSON, opened with wx.
Additional slow cases: 344-node and 346-node (88,000 bullets exceed the node budget).

#344 uses the explicit evaluation batch when available, or independent scalar calls
on older runtimes. These are labeled; the scalar API itself is not a persistent cache.
#345 observes the actual evaluator through an in-memory module copy. No installed
source or returned graph is modified. #346 records artifact/input strict/candidate
graphs. #347 and #348 intentionally change semantic results when the bugs are fixed.
`;
const [kitArgument, caseName, resultArgument, ...extra] = process.argv.slice(2);
const caseNames = ['344', '345', '346', '347', '348', '344-node', '346-node'];
if (['--help', '-h'].includes(kitArgument) && !caseName) {
  console.log(HELP);
  process.exit(0);
}
if (!kitArgument || !caseNames.includes(caseName) || extra.length) {
  console.error(HELP);
  process.exit(2);
}
const resultFile = resultArgument ? path.resolve(resultArgument) : null;
if (resultFile) assert.equal(fs.existsSync(resultFile), false, 'use a fresh result file');
const kit = path.resolve(kitArgument);
const lib = pathToFileURL(path.join(kit, 'scripts/lib') + path.sep);
const load = (name) => import(new URL(`${name}.mjs`, lib));
const ast = await load('reconciliation-markdown-ast');
const graph = await load('scoped-work-graph');
const authored = await load('scoped-work-authored');
const { splitFrontmatter } = await load('util');
const count = () => ast.reconciliationParseStats().parsed;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const oversizedFence = () => ['~~~', 'x'.repeat(8 * 1024 * 1024), '~~~', '', ''].join('\n');
const artifact = (id, body) => ['---', `artifact_id: ${id}`, 'artifact_type: policy', '---', body].join('\n');

async function temporary(run) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-syntax-lifetimes-')));
  const sources = [];
  const write = (name, text) => {
    const file = path.join(root, name);
    fs.writeFileSync(file, text, { flag: 'wx' });
    const parsed = splitFrontmatter(text);
    assert(parsed.hasFrontmatter && !parsed.parseError);
    sources.push({ file: name, sha256: hash(text), bytes: Buffer.byteLength(text) });
    return { file, fm: parsed.data, body: parsed.body };
  };
  try {
    const value = await run(root, write);
    return { ...value, sources };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function api(nodeLimit) {
  const headers = ['Endpoint', 'Gate', 'Tracking'];
  const rows = [0, 1, 2, 3].map((index) => [`GET /example${index}`, 'required', '-']);
  const table = [headers, ['---', '---', '---'], ...rows]
    .map((row) => `| ${row.join(' | ')} |`).join('\n');
  const payload = nodeLimit ? '- x\n'.repeat(88_000) : oversizedFence();
  const body = `## API Candidates\n\n${table}\n\n## Background\n\n${payload}`;
  const batchAvailable = typeof graph.createScopedGraphApiRowContextResolver === 'function';
  const select = batchAvailable ? graph.createScopedGraphApiRowContextResolver(body)
    : (candidate) => graph.scopedGraphApiRowContext(body, candidate);
  const before = count();
  const contexts = rows.map((cells) => select({ headers, cells }));
  return {
    result: contexts,
    observations: { api_mode: batchAvailable ? 'evaluation-batch' : 'independent-scalar-baseline',
      candidates: contexts.length, whole_parses: count() - before, source_chars: body.length,
      source_sha256: hash(body) },
  };
}

async function dependency() {
  // Observe a private evaluator without widening the production API. Every
  // insertion must have one exact match; unsupported versions fail explicitly.
  // Imports still resolve to the original runtime, so syntax counters and node
  // sidecars are identical to those used by the ordinary public entry points.
  const url = new URL('scoped-work-uncertainty.mjs', lib);
  let source = fs.readFileSync(url, 'utf8');
  const patch = (from, to) => {
    assert.equal(source.split(from).length, 2, `one evaluator observation point: ${from}`);
    source = source.replace(from, to);
  };
  patch('function uncertaintyProjection(options, base) {',
    'export function uncertaintyProjection(options, base, probe) {');
  const wrapped = source.includes('function computeUncertaintyProjection(options, base) {');
  if (wrapped) {
    patch('computeUncertaintyProjection(options, base));', 'computeUncertaintyProjection(options, base, probe));');
    patch('function computeUncertaintyProjection(options, base) {',
      'function computeUncertaintyProjection(options, base, probe) {');
  }
  const graphStart = '    const graph = resolveScopedContractGraph({ contracts: [token],';
  patch(graphStart, `    const graphBefore = probe.parsed();\n${graphStart}`);
  const graphRead = '    for (const file of graph.read_set) read(file.file, file.sha256);';
  patch(graphRead, `    probe.graph(probe.parsed() - graphBefore);\n${graphRead}`);
  const candidate = '    candidates.set(physical, { record, entry, evidence, affected: affectedOwners(affected) });';
  patch(candidate, `    probe.candidate(evidence.nodes);\n${candidate}`);
  patch('    if (!spans.has(node.selection)) {',
    '    if (!spans.has(node.selection)) {\n      const rangeBefore = probe.parsed();');
  const range = source.includes('selectionSpans(doc.body, view, node.selection,')
    ? "      spans.set(node.selection, selectionSpans(doc.body, view, node.selection, node.kind === 'input-evidence'));"
    : "      spans.set(node.selection, selectionSpans(doc.body, doc.view, node.selection, node.kind === 'input-evidence'));";
  patch(range, `${range}\n      probe.range(node, probe.parsed() - rangeBefore);`);
  const relations = '  const records = new Map(); const applications = []; const review = []; const inputs = [];';
  patch(relations, `  probe.relations();\n${relations}`);
  source = source.replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from ${JSON.stringify(new URL(relative, url).href)}`);
  const { uncertaintyProjection } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return temporary((projectRoot, write) => {
    const peer = write('peer.md', artifact('peer', `${oversizedFence()}## Facts\n\nSelected evidence\n`));
    const questions = write('questions.md', artifact('questions', [
      '## Unknowns', '', '| ID | Question | Status |', '| --- | --- | --- |',
      ...[1, 2, 3].map((id) => `| U-${id} | artifact:peer#facts | open |`), '',
    ].join('\n')));
    const targetIndex = { artifacts: new Map([['peer', peer], ['questions', questions]]), duplicates: new Set() };
    const options = { projectRoot, targetIndex }, ref = 'artifact:peer#facts';
    const evidence = graph.resolveScopedContractGraph({ ...options, contracts: [ref] });
    const owner = 'screen:EXAMPLE-001';
    const base = { read_set: evidence.read_set, projection: {
      units: [{ owner, declaration: { id: 'fixture', contracts: [ref] }, sources: [], api_rows: [] }],
      owners: [{ owner, adopted: true, metadata: { domain: 'example' } }],
      decision_relations: { applications: [], evidence: { nodes: [], edges: [] } },
      host_links: [], evidence,
    } };
    let candidateSelections = 0, rangeParses = 0, relationRangeParses = 0, relationPhase = false;
    const nativeNodes = new Set(), graphParses = [], before = count();
    const result = uncertaintyProjection(options, base, {
      parsed: count,
      graph(parses) { graphParses.push(parses); },
      candidate(nodes) {
        for (const node of nodes.filter((item) => item.ref === ref)) {
          const selected = authored.scopedSelectionNodes(peer.body, node.selection);
          assert.equal(selected?.length, 1);
          nativeNodes.add(selected[0]);
          candidateSelections += 1;
        }
      },
      range(node, parses) {
        if (node.ref !== ref) return;
        rangeParses += parses;
        if (relationPhase) relationRangeParses += parses;
      },
      relations() { relationPhase = true; },
    });
    return { result, observations: { evaluator: wrapped ? 'scoped-wrapper-and-compute' : 'direct-evaluator',
      applications: result.projection.uncertainty_relations.applications.length,
      candidate_selections: candidateSelections, distinct_native_nodes: nativeNodes.size,
      graph_parses: graphParses, range_parses: rangeParses, relation_range_parses: relationRangeParses,
      whole_parses_after_base: count() - before } };
  });
}

function evidence(nodeLimit) {
  return temporary((projectRoot, write) => {
    const body = `${nodeLimit ? '' : oversizedFence()}## Extracted Facts\n\n` +
      (nodeLimit ? '- one\n'.repeat(88_000) : '- one\n');
    const id = 'IN-20261119-meeting-777';
    const inputHeader = [
      '---', `input_id: ${id}`, 'input_type: meeting', 'source_type: meeting',
      'source_ref: meeting/example', 'captured_at: "2026-11-20T00:00:00Z"',
      'captured_by: fixture', 'status: captured', 'affected_domains: [example]',
      'affected_screens: [EXAMPLE-001]', '---', '',
    ].join('\n');
    const artifactRecord = write('ordinary.md', artifact('fixture', body));
    const inputRecord = write('input.md', inputHeader + body);
    const result = {}, observations = {};
    for (const [kind, ref] of [['artifact', 'artifact:fixture'], ['input', `input:${id}#extracted-facts/1`]]) {
      const args = { projectRoot,
        targetIndex: { artifacts: new Map(kind === 'artifact' ? [['fixture', artifactRecord]] : []), duplicates: new Set() },
        inputArtifacts: kind === 'input' ? [{ file: inputRecord.file, fm: inputRecord.fm, hasFrontmatter: true, parseError: null }] : [],
      };
      for (const [mode, resolve] of [
        ['strict', () => graph.resolveScopedContractGraph({ ...args, contracts: [ref] })],
        ['candidate', () => graph.resolveScopedCandidateGraph({ ...args, roots: [{ ref, mode: 'ordinary' }] })],
      ]) {
        const before = count(), value = resolve(), name = `${kind}_${mode}`;
        result[name] = value;
        observations[name] = { whole_parses: count() - before, nodes: value.nodes.length, reads: value.read_set.length };
      }
    }
    return { result, observations };
  });
}

async function unknown() {
  const { scopedUnknownAuthored } = await load('scoped-work-uncertainty');
  const body = '## Unknowns\n\n| ID | Question |\n| --- | --- |\n| U-001 | Example |\n';
  const publicView = ast.parseReconciliationReferenceView(body);
  const shared = ast.sharedReconciliationReferenceView(body);
  const rawRow = publicView.sections.find((section) => section.slug === 'unknowns').tableNodes[0].children[1];
  const selection = authored.rememberScopedSelection({ type: 'row' }, body, [rawRow]);
  const header = authored.scopedAuthoredView(body, publicView).byName.get('unknowns')[0].tables[0].headers;
  header[1] = 'Edited';
  const before = { default: scopedUnknownAuthored(body, selection),
    explicit_shared_raw: scopedUnknownAuthored(body, selection, shared) };
  for (let index = 0; index < 513; index += 1) ast.sharedReconciliationReferenceView(`evict ${index}`);
  const rebuilt = ast.sharedReconciliationReferenceView(body);
  assert.notEqual(shared.tree, rebuilt.tree, 'the probe must actually evict and rebuild the syntax');
  const after = { default: scopedUnknownAuthored(body, selection),
    explicit_shared_raw: scopedUnknownAuthored(body, selection, rebuilt) };
  return { result: { before, after, edited_header: header[1] },
    observations: { syntax_rebuilt: true, intended_semantic_correction: true } };
}

function iterator() {
  const position = (start, end) => Object.freeze({
    start: Object.freeze({ offset: start }), end: Object.freeze({ offset: end }),
  });
  const leaf = (start, end) => Object.freeze({ type: 'text', position: position(start, end) });
  const first = leaf(0, 1), second = leaf(1, 2);
  let current = first;
  const children = [first];
  Object.defineProperty(children, Symbol.iterator, { get() {
    return function* () { yield current; };
  } });
  Object.freeze(children);
  const node = Object.freeze({ type: 'paragraph', position: position(0, 2), children });
  const view = { tree: { children: [node] } }, selection = { type: 'body' };
  const resolve = graph.createScopedGraphSelectionSpanResolver();
  const initial = resolve('ab', view, selection);
  current = second;
  const cached = resolve('ab', view, selection);
  const fresh = graph.scopedGraphSelectionSpans('ab', view, selection);
  return { result: { initial, cached, fresh }, observations: { intended_semantic_correction: true } };
}

const cases = { 344: () => api(false), 345: dependency, 346: () => evidence(false), 347: unknown, 348: iterator,
  '344-node': () => api(true), '346-node': () => evidence(true) };
const { result, observations, sources } = await cases[caseName]();
const semantic = JSON.stringify(result);
if (resultFile) fs.writeFileSync(resultFile, semantic, { flag: 'wx' });
console.log(JSON.stringify({ case: caseName, node: process.version, executable: process.execPath,
  exec_argv: process.execArgv, observations, ...(sources ? { sources } : {}),
  result_sha256: hash(semantic), result_bytes: Buffer.byteLength(semantic),
  ...(resultFile ? { result_file: resultFile } : {}), syntax_cache: ast.reconciliationSyntaxCacheStats() }));
