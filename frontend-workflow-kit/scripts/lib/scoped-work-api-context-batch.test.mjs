import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KIT_ROOT, splitFrontmatter } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { hashBytes } from './current-work-request.mjs';
import { reconciliationParseStats, reconciliationSyntaxCacheStats } from './reconciliation-markdown-ast.mjs';
import { scopedAuthoredView, scopedSelectionNodes } from './scoped-work-authored.mjs';
import { scopedSectionLookupStats } from './scoped-work-refs.mjs';
import { createScopedGraphApiRowContextResolver, scopedGraphApiRowContext,
  scopedGraphContexts } from './scoped-work-graph.mjs';
import { resolveScopedSourceProjection } from './scoped-work-source-relations.mjs';
import { resolveScopedUnitProjection } from './scoped-work-projection.mjs';

const headers = ['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths', 'Notes'];
const rows = Array.from({ length: 4 }, (_, index) => ['GET', `/example-${index}`, 'candidate', 'deferred',
  'unknown:U-LATER', `src/api/example-${index}/**`, '[ordinary][rules]']);
const table = (columns, values) => [`| ${columns.join(' | ')} |`, `|${columns.map(() => '---').join('|')}|`,
  ...values.map((cells) => `| ${cells.join(' | ')} |`)].join('\n');
const payload = (nodeLimit = false) => nodeLimit ? '- x\n'.repeat(88_000)
  : `~~~\n${'x'.repeat(8 * 1024 * 1024)}\n~~~\n`;
const apiBody = (padding = '', label = '') => `## API Candidates\n\n${table(headers, rows)}\n\n` +
  `## Unknowns\n\n${table(['ID', 'Question', 'Status'], [['U-LATER', 'Which contract?', 'open']])}\n\n` +
  `[rules]: artifact:DOC#rules\n\n## Background\n\n${padding}\n<!-- ${label} -->\n`;
const candidates = () => rows.map((cells) => ({ headers: [...headers], cells: [...cells],
  tracking: { ref: 'unknown:U-LATER@SCREEN' } }));
const expectedContext = { refs: ['artifact:DOC#rules', 'unknown:U-LATER@SCREEN'],
  ordinaryRefs: ['artifact:DOC#rules'], trackingRefs: ['unknown:U-LATER@SCREEN'] };
const parsed = () => reconciliationParseStats().parsed;
const withinBudgets = () => {
  const stats = reconciliationSyntaxCacheStats();
  assert.ok(stats.entries <= stats.max_entries && stats.source_chars <= stats.max_source_chars &&
    stats.nodes <= stats.max_nodes, 'the retained cache budgets are unchanged');
};

for (const [name, nodeLimit] of [['source', false], ['node', true]]) {
  test(`#344 API context batch: ${name}-oversized candidates share one view and physical row index`, () => {
    const body = apiBody(payload(nodeLimit), `${name} batch`), select = createScopedGraphApiRowContextResolver(body);
    const before = parsed(), examined = scopedSectionLookupStats().examined;
    const result = candidates().map(select);
    assert.deepEqual(result, candidates().map(() => expectedContext));
    assert.equal(parsed() - before, 1, 'one batch parses its oversized owner once');
    assert.equal(scopedSectionLookupStats().examined - examined, rows.length,
      'one native API row index serves every candidate');
    result[0].refs.push('artifact:CALLER#edit'); result[0].ordinaryRefs.length = 0;
    assert.deepEqual(select(candidates()[0]), expectedContext, 'results remain independent and mutable');
    if (!nodeLimit) {
      const after = parsed();
      assert.deepEqual(createScopedGraphApiRowContextResolver(body)(candidates()[0]), expectedContext);
      assert.equal(parsed() - after, 1, 'a later batch cannot inherit an oversized document pin');
    }
    withinBudgets();
  });
}

test('#344 API context batch: unused, failed and nested batches do not replace public views or leak active syntax', () => {
  const before = parsed();
  createScopedGraphApiRowContextResolver(apiBody(payload(), 'unused'));
  assert.equal(parsed(), before, 'an empty candidate batch does not parse');
  const body = apiBody('', 'public view');
  const publicView = scopedAuthoredView(body);
  const home = publicView.byName.get('api candidates')[0];
  home.tables[0].headers[0] = 'Edited';
  const select = createScopedGraphApiRowContextResolver(body);
  assert.deepEqual(select(candidates()[0]), expectedContext);
  assert.equal(scopedAuthoredView(body), publicView);
  assert.equal(home.tables[0].headers[0], 'Edited');
  const other = createScopedGraphApiRowContextResolver(body.replace('artifact:DOC#rules', 'artifact:OTHER#terms'));
  assert.deepEqual(other(candidates()[0]).ordinaryRefs, ['artifact:OTHER#terms']);
  assert.deepEqual(select(candidates()[1]), expectedContext);
  assert.throws(() => select({ headers, cells: ['missing'] }), /selected raw row is missing/);
  assert.deepEqual(select(candidates()[2]), expectedContext, 'a failed selection cannot poison the batch');
  assert.deepEqual(scopedGraphApiRowContext(body, candidates()[3]), expectedContext);
});

function fixture(t, selectedCount, label, surface = false) {
  const projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-api-batch-')));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const write = (name, fm, body) => {
    const file = path.join(projectRoot, name);
    fs.writeFileSync(file, `---\n${JSON.stringify(fm)}\n---\n\n${body}`);
    return { file, fm };
  };
  const owner = surface ? 'surface:EXAMPLE-PANEL' : 'screen:EXAMPLE-001';
  const document = write('rules.md', { artifact_id: 'DOC', artifact_type: 'domain-rules', domain: 'example', status: 'draft' },
    '## Rules\nSelected ordinary rule.\n');
  const hosts = surface ? ['EXAMPLE-001', 'EXAMPLE-002'] : [];
  const screen = write('screen.md', { artifact_id: 'SCREEN',
    ...(surface ? { artifact_type: 'shared-surface-spec', surface_id: 'EXAMPLE-PANEL', member_screens: hosts,
      implementation_paths: ['src/shared/example/**'] } : { artifact_type: 'screen-spec', screen_id: 'EXAMPLE-001' }),
    domain: 'example', status: 'draft', work_execution: { version: 1, units: [{ id: 'client', kind: 'api-contract',
      contracts: ['artifact:DOC#rules'], sources: [], api_candidates: rows.slice(0, selectedCount)
        .map((row) => ({ method: row[0], path: row[1] })),
      ...(surface ? { host_units: Object.fromEntries(hosts.map((host) => [host, 'legacy-current'])) } : {}) }] } }, apiBody(payload(), label));
  const hostDocs = hosts.map((id) => write(`${id}.md`, { artifact_id: `${id}-spec`, artifact_type: 'screen-spec',
    screen_id: id, domain: 'example', status: 'draft' }, '## Notes\nLegacy host.\n'));
  const policyFile = path.join(projectRoot, 'policy.yaml'), policyOverlayFile = path.join(projectRoot, 'adoption.yaml');
  fs.writeFileSync(policyFile, '{}');
  fs.writeFileSync(policyOverlayFile, JSON.stringify({ work_execution: { version: 1, owners: [owner], profiles: ['api-contract'],
    role_limits: { 'api-contract': ['api_client', 'test'] }, deny_paths: [] } }));
  const targetIndex = buildReconciliationTargetIndex({ docs: [screen, document, ...hostDocs] });
  return { projectRoot, owner, unit: 'client', policyFile, policyOverlayFile, targetIndex,
    inputArtifacts: [], registerFile: path.join(projectRoot, 'register.md'), layout: loadLayoutProfile({ kitRoot: KIT_ROOT }) };
}

for (const surface of [false, true]) for (const [name, run] of [
  ['source relation', resolveScopedSourceProjection], ['unit projection', resolveScopedUnitProjection],
]) {
  const kind = surface ? 'surface' : 'screen';
  test(`#344 API context batch: actual ${kind} ${name} parses do not scale with selected candidate count`, (t) => {
    const counts = [];
    for (const size of [1, 4]) {
      const options = fixture(t, size, `${kind} ${name} ${size}`, surface), before = parsed();
      const result = run(options);
      counts.push(parsed() - before);
      const evidence = result.contracts || result.projection.evidence;
      const context = scopedGraphContexts(evidence);
      assert.deepEqual(context.trackingRefs, ['unknown:U-LATER@SCREEN']);
      assert.ok(context.ordinaryRefs.includes('artifact:DOC#rules'));
      const unknown = evidence.nodes.find((node) => node.ref === 'unknown:U-LATER@SCREEN');
      assert.ok(unknown, 'every selected API retains its exact canonical Tracking target');
      const source = splitFrontmatter(fs.readFileSync(path.join(options.projectRoot, 'screen.md'), 'utf8')).body;
      const nodes = scopedSelectionNodes(source, unknown.selection);
      assert.equal(nodes.length, 1);
      assert.equal(source.slice(nodes[0].position.start.offset, nodes[0].position.end.offset),
        '| U-LATER | Which contract? | open |', 'the physical selected row is preserved');
      assert.ok(evidence.nodes.some((node) => node.ref === 'artifact:DOC#rules'));
      if (result.projection) {
        assert.equal(result.projection.units[0].api_rows.length, size);
        assert.deepEqual(result.projection.units[0].api_rows.map(({ cells }) => cells[1]), rows.slice(0, size).map((row) => row[1]));
      }
      for (const entry of result.read_set) assert.equal(entry.sha256,
        hashBytes(fs.readFileSync(path.join(options.projectRoot, entry.file))));
      withinBudgets();
    }
    t.diagnostic(`${kind} ${name} whole parses for 1/4 selected API candidates: ${counts.join('/')}`);
    assert.equal(counts[1], counts[0], `candidate count must not multiply whole parses (${counts.join(' -> ')})`);
  });
}
