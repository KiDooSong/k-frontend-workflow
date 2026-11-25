// Observe the actual evaluator without adding a production graph/validity API.
// The in-memory copy keeps every real resolver, read, hash and final audit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { loadInputArtifact } from './input-artifact.mjs';
import { scopedReferenceResolverView } from './scoped-work-refs.mjs';
import { reconciliationSyntaxCacheStats } from './reconciliation-markdown-ast.mjs';
import { resolveScopedContractGraph, copyScopedGraphContexts } from './scoped-work-graph.mjs';
import { scopedProjectionNode } from './scoped-work-projection.mjs';

const moduleUrl = new URL('./scoped-work-uncertainty.mjs', import.meta.url);
let instrumented = fs.readFileSync(moduleUrl, 'utf8');
function insert(from, to) {
  assert.equal(instrumented.split(from).length, 2, `one production observation point: ${from}`);
  instrumented = instrumented.replace(from, to);
}
insert('function uncertaintyProjection(options, base) {', 'export function uncertaintyProjection(options, base, probe = {}) {');
insert('computeUncertaintyProjection(options, base));', 'computeUncertaintyProjection(options, base, probe));');
insert('function computeUncertaintyProjection(options, base) {', 'function computeUncertaintyProjection(options, base, probe) {');
insert('  function read(relative, expectedHash) {',
  '  function read(relative, expectedHash) {\n    probe.read?.(relative, expectedHash);');
insert('  function sourceFromBytes(relative, raw) {',
  '  function sourceFromBytes(relative, raw) {\n    probe.source?.(relative);');
insert('        refs = previous;', '        refs = previous;\n        probe.release?.(refs);');
insert('    candidates.set(physical, { record, entry, evidence, affected: affectedOwners(affected) });',
  '    candidates.set(physical, { record, entry, evidence, affected: affectedOwners(affected) });\n    probe.candidate?.(entry, refs);');
insert("    scopedProjectionProgress('candidate-documents');",
  "    probe.batch?.(relative, refs, documents.stats());\n    scopedProjectionProgress('candidate-documents');");
insert('  const skipped = new Map();', '  probe.boundary?.(refs, documents.stats());\n  const skipped = new Map();');
insert('  const consumedGraphs = [base.projection.evidence, base.projection.decision_relations.evidence];',
  '  probe.merged?.(refs, documents.stats());\n  const consumedGraphs = [base.projection.evidence, base.projection.decision_relations.evidence];');
insert('  for (const file of [...files.values()]) read(file.file, file.sha256);',
  '  probe.audit?.();\n  for (const file of [...files.values()]) read(file.file, file.sha256);');
instrumented = instrumented.replace(/from '(\.\/[^']+)'/g,
  (_, relative) => `from ${JSON.stringify(new URL(relative, moduleUrl).href)}`);
instrumented += '\n//# sourceURL=scoped-work-evaluation-lifetime-probe.mjs\n';
const { uncertaintyProjection } = await import(`data:text/javascript;base64,${Buffer.from(instrumented).toString('base64')}`);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const evidence = () => ({ nodes: [], roots: [], edges: [] });
function baseFor(owner = null) {
  return { read_set: [], projection: {
    owner, units: owner ? [{ owner, declaration: { id: 'fixture', contracts: [] }, sources: [], api_rows: [] }] : [],
    owners: owner ? [{ owner, adopted: true }] : [], host_links: [], evidence: evidence(),
    decision_relations: { evidence: evidence(), applications: [], memberships: [] },
  } };
}
const unknowns = (rows) => ['## Unknowns', '', '| ID | Question | Status |',
  '| --- | --- | --- |', ...rows, ''].join('\n');
function fixture(t) {
  const projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-evaluation-lifetime-')));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const write = (name, fm, body) => {
    const file = path.join(projectRoot, name);
    fs.writeFileSync(file, `---\n${JSON.stringify(fm)}\n---\n${body}`, { flag: 'wx' });
    return { file, fm };
  };
  return { projectRoot, write };
}
function inputFixture(t, anchors = 12) {
  const { projectRoot, write } = fixture(t), inputId = 'IN-20261120-meeting-777';
  const sections = Array.from({ length: 12 }, (_, index) => index + 1);
  const input = write('input.md', {
    input_id: inputId, input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting/example',
    captured_at: '2026-11-20T00:00:00Z', captured_by: 'fixture',
    status: 'captured', affected_domains: ['example'], affected_screens: ['EXAMPLE-001'],
  }, sections.map((index) => `## Section ${index}\n\nEvidence.\n`).join('\n'));
  const refs = sections.slice(0, anchors).map((index) => `input:${inputId}#section-${index}`).join(' ');
  const document = write('unknowns.md', { artifact_id: 'fixture', artifact_type: 'conflicts' },
    unknowns(Array.from({ length: 5 }, (_, index) => `| U-${index + 1} | See ${refs} | open |`)));
  const options = { projectRoot, targetIndex: buildReconciliationTargetIndex({ docs: [document] }),
    inputArtifacts: [loadInputArtifact(input.file)] };
  const base = baseFor(), readSet = [input, document].map(({ file }) => ({
    file: path.basename(file), sha256: `sha256:${hash(fs.readFileSync(file))}`,
  })).sort((a, b) => a.file.localeCompare(b.file));
  const expected = { projection: { ...base.projection, uncertainty_relations: {
    records: [], applications: [], scope_review_needed: [], relation_inputs: [],
    evidence: { roots: [], nodes: [], edges: [] },
  } }, read_set: readSet, unaudited: [] };
  return { input, document, options, base, expected };
}

test('#351 evaluation sources: one and twelve anchors keep the same per-file audit/read count', (t) => {
  for (const anchors of [1, 12]) {
    const f = inputFixture(t, anchors), open = fs.openSync;
    let reads = 0, audited = 0, decoded = 0;
    const hook = t.mock.method(fs, 'openSync', function (file, ...args) {
      if (file === f.input.file) reads += 1;
      return open.call(this, file, ...args);
    });
    let result;
    try {
      result = uncertaintyProjection(f.options, f.base, {
        read(file) { if (file === 'input.md') audited += 1; },
        source(file) { if (file === 'input.md') decoded += 1; },
      });
    } finally { hook.mock.restore(); }
    assert.deepEqual(result, f.expected, 'the complete projection and read set stay unchanged');
    assert.equal(reads, 21, 'five input resolutions, ten graph reads, five uncertainty graph audits and one final audit');
    assert.equal(audited, 6, 'each graph and the final audit still read actual input bytes');
    assert.equal(decoded, 5, 'all anchors in a candidate graph use its one verified input source');
    if (anchors === 12) assert.equal(hash(JSON.stringify(result)),
      '52a9311967b173d07ee8b3bcc498b874d4058b621c8ff9d0efecd274203575a7',
      'complete public reproduction JSON is byte-identical to the baseline');
  }
});

for (const moment of ['next graph', 'graph audit', 'final audit']) {
  test(`#351 evaluation sources: changed input still fails at ${moment}`, (t) => {
    const f = inputFixture(t), original = fs.readFileSync(f.input.file);
    let changed = false, releases = 0;
    const change = () => {
      if (changed) return;
      changed = true;
      fs.appendFileSync(f.input.file, '\nChanged input after the previous observation.\n');
    };
    const probe = {
      release(resolver) { assert.equal(resolver, null); releases += 1; },
      ...(moment === 'next graph' ? { candidate: change } : {}),
      ...(moment === 'graph audit' ? { read(file, expected) { if (file === 'input.md' && expected) change(); } } : {}),
      ...(moment === 'final audit' ? { audit: change } : {}),
    };
    assert.throws(() => uncertaintyProjection(f.options, f.base, probe), /changed|snapshot|differs/);
    assert.equal(changed, true, 'the mutation must occur at the selected boundary');
    assert.ok(releases > 0, 'the document resolver is released even when a candidate throws');
    fs.writeFileSync(f.input.file, original);
    assert.deepEqual(uncertaintyProjection(f.options, f.base), f.expected, 'a failed evaluation leaves no stale live source');
  });
}

test('#352 evaluation syntax: completed oversized row batches retain no reference resolver views', (t) => {
  const { projectRoot, write } = fixture(t), budget = reconciliationSyntaxCacheStats().max_source_chars;
  const filler = 'x'.repeat(budget);
  const docs = [1, 2, 3, 4].map((index) => write(`doc-${index}.md`, {
    artifact_id: `doc-${index}`, artifact_type: 'screen-spec', screen_id: `OTHER-${index}`,
  }, unknowns([`| U-${index} | ${index === 4 ? '' : 'Valid?'} | open |`]) +
    `\n~~~\n${filler}${index}\n~~~\n`));
  const targetIndex = buildReconciliationTargetIndex({ docs });
  const retained = (resolver) => [...targetIndex.artifacts.values()]
    .filter(({ fm, body }) => scopedReferenceResolverView(resolver, fm.artifact_id, body))
    .map(({ fm }) => fm.artifact_id);
  const active = [], completed = [];
  let boundary = false, malformedReads = 0;
  const result = uncertaintyProjection({ projectRoot, targetIndex }, baseFor('screen:FOCUS'), {
    read(file) { if (file === 'doc-4.md') malformedReads += 1; },
    candidate(entry, resolver) { active.push(retained(resolver)); assert.deepEqual(retained(resolver), [entry.fm.artifact_id]); },
    batch(file, resolver, cache) {
      assert.equal(resolver, null, `${file}: the row batch releases its resolver`);
      completed.push(retained(resolver));
      assert.equal(cache.entries, 0, 'each oversized source remains outside the bounded document cache');
    },
    boundary(resolver, cache) {
      boundary = true;
      assert.equal(resolver, null);
      assert.deepEqual(retained(resolver), []);
      assert.equal(cache.entries, 0);
    },
  });
  assert.equal(boundary, true);
  assert.deepEqual(active, [['doc-1'], ['doc-2'], ['doc-3']], 'the active resolver holds only its own document');
  assert.deepEqual(completed, [[], [], [], []]);
  assert.equal(result.projection.uncertainty_relations.applications.length, 0);
  assert.deepEqual(result.unaudited.map(({ file }) => file), ['doc-4.md']);
  assert.equal(malformedReads, 3, 'one enumeration read, one bounded relevance check and one final audit');
  assert.deepEqual(result.read_set, docs.map(({ file }) => ({ file: path.basename(file), sha256: `sha256:${hash(fs.readFileSync(file))}` })));
});

test('#359 evaluation merge: many selected sections share one current oversized source per file without retaining a view', (t) => {
  const { projectRoot, write } = fixture(t), budget = reconciliationSyntaxCacheStats().max_source_chars;
  const filler = 'x'.repeat(budget), sections = Array.from({ length: 16 }, (_, index) => `section-${index}`);
  const docs = ['FIRST', 'SECOND'].map((artifact_id) => write(`${artifact_id}.md`, {
    artifact_id, artifact_type: 'domain-rules', domain: 'example', status: 'confirmed',
  }, sections.map((slug) => `## ${slug}\n\nIndependent evidence.\n`).join('\n') + `\n## Background\n\n~~~\n${filler}\n~~~\n`));
  const options = { projectRoot, targetIndex: buildReconciliationTargetIndex({ docs }) };
  const contracts = docs.flatMap(({ fm }) => sections.map((slug) => `artifact:${fm.artifact_id}#${slug}`));
  const base = baseFor();
  const graph = () => resolveScopedContractGraph({ ...options, contracts, project: scopedProjectionNode });
  const first = graph(), second = graph();
  const evidenceOf = (value) => copyScopedGraphContexts(value, { roots: value.roots, nodes: value.nodes, edges: value.edges });
  base.read_set = first.read_set;
  base.projection.evidence = evidenceOf(first);
  base.projection.decision_relations.evidence = evidenceOf(second);
  const decoded = new Map();
  let merged = false, boundary = false;
  const result = uncertaintyProjection(options, base, {
    source(file) { decoded.set(file, (decoded.get(file) || 0) + 1); },
    merged(resolver, cache) {
      merged = true;
      assert.deepEqual([...decoded].sort(), [['FIRST.md', 1], ['SECOND.md', 1]],
        'each merge batch shares its current bytes across both sets of sixteen selections');
      assert.equal(resolver, null);
      assert.equal(cache.entries, 0, 'native selected nodes do not require a whole oversized document view');
    },
    boundary(resolver, cache) {
      boundary = true;
      assert.equal(resolver, null);
      assert.equal(cache.entries, 0, 'the later document scan also leaves oversized syntax outside the bounded cache');
    },
  });
  assert.equal(merged, true);
  assert.equal(boundary, true);
  assert.deepEqual(result, { projection: { ...base.projection, uncertainty_relations: {
    records: [], applications: [], scope_review_needed: [], relation_inputs: [], evidence: evidence(),
  } }, read_set: first.read_set, unaudited: [] }, 'the complete graphs and final canonical read-set are preserved');
});
