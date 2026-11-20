// Public synthetic reproductions for #339-#342. Run each case in a fresh process.
// Counts and identities are the acceptance criteria; timings are observations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const HELP = `Usage: node scoped-cache-reuse.mjs KIT_ROOT 339|340|341|342 [FRESH_RESULT_FILE]

Run separately for the baseline and changed runtime with the same Node binary.
339 uses 88,000 unrelated bullets and can require substantial parser memory.
340 resolves 500 API rows; 341 evicts the AST after editing a public authored
view; 342 resolves one two-paragraph input section in two independent graphs.
Optional output contains the complete semantic result for byte comparison and
must not already exist. stdout contains operation counts, identity checks and
the result hash. Elapsed time/RSS are single observations, not a speedup claim.
`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;

async function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(HELP); return; }
  assert.ok(args.length >= 2 && args.length <= 3, HELP);
  const [kitArg, issue, resultFile] = args;
  assert.ok(['339', '340', '341', '342'].includes(issue), HELP);
  const kit = fs.realpathSync(kitArg);
  const lib = (name) => import(pathToFileURL(path.join(kit, 'scripts/lib', `${name}.mjs`)).href);
  const ast = await lib('reconciliation-markdown-ast');
  const graph = await lib('scoped-work-graph');
  const authored = await lib('scoped-work-authored');
  const refs = await lib('scoped-work-refs');
  const { splitFrontmatter } = await lib('util');
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `scoped-cache-${issue}-`)));
  let result, metrics;
  try {
    if (issue === '339') {
      const id = 'DEMO-RULES', file = path.join(root, 'rules.md');
      const text = '## Contract\n\nOne paragraph.\n\n## Notes\n\n' + '- unrelated filler\n'.repeat(88000);
      const raw = `---\nartifact_id: ${id}\nartifact_type: domain-rules\n---\n\n${text}`;
      fs.writeFileSync(file, raw);
      const { data: fm, body } = splitFrontmatter(raw);
      const targetIndex = { artifacts: new Map([[id, { file, fm, body }]]), duplicates: new Set() };
      const before = ast.reconciliationParseStats().parsed, started = performance.now();
      result = graph.resolveScopedContractGraph({ contracts: [`artifact:${id}#contract`], targetIndex, projectRoot: root });
      metrics = { parsed: ast.reconciliationParseStats().parsed - before, evaluation_ms: performance.now() - started,
        bullets: 88000, body_chars: body.length, nodes: result.nodes.length, read_files: result.read_set.length };
      assert.equal(result.nodes.length, 1); assert.equal(result.read_set.length, 1);
      assert.equal(fs.readFileSync(file, 'utf8'), raw);
    } else if (issue === '340') {
      const headers = ['Endpoint', 'Description'];
      const rows = Array.from({ length: 500 }, (_, i) => [`endpoint-${i}`, 'description']);
      const body = ['## API Candidates', '', '| Endpoint | Description |', '| --- | --- |',
        ...rows.map((cells) => `| ${cells.join(' | ')} |`), ''].join('\n');
      const first = ast.parseReconciliationReferenceView(body), second = ast.parseReconciliationReferenceView(body);
      assert.equal(first.tree, second.tree);
      const publicAuthoredViewShared = authored.scopedAuthoredView(body, first) === authored.scopedAuthoredView(body, second);
      const before = refs.scopedSectionLookupStats().examined, started = performance.now();
      result = rows.map((cells) => graph.scopedGraphApiRowContext(body, { headers, cells }));
      for (const context of result) assert.deepEqual(context.refs, []);
      metrics = { candidates: rows.length, same_native_tree: true, public_authored_view_shared: publicAuthoredViewShared,
        indexed_entries: refs.scopedSectionLookupStats().examined - before,
        parsed: ast.reconciliationParseStats().parsed, evaluation_ms: performance.now() - started };
    } else if (issue === '341') {
      const body = '## Unknowns\n\n| ID | Question |\n| --- | --- |\n| U-001 | Original? |\n';
      const rowOf = (view) => view.sections.find((section) => section.slug === 'unknowns').tableNodes[0].children[1];
      const select = (row) => authored.rememberScopedSelection({ type: 'row' }, body, [row]);
      const first = rowOf(ast.sharedReconciliationReferenceView(body)), original = select(first);
      assert.equal(authored.scopedSelectionUnknownAuthored(body, original), true);
      authored.scopedAuthoredView(body).byName.get('unknowns')[0].tables[0].headers[1] = 'Edited';
      assert.equal(authored.scopedAuthoredView(body).byName.get('unknowns')[0].tables[0].headers[1], 'Edited');
      for (let i = 0; i < 512; i += 1) ast.parseReconciliationReferenceView(`temporary-${i}\n`);
      const second = rowOf(ast.sharedReconciliationReferenceView(body));
      assert.notEqual(first, second); assert.deepEqual(first.position, second.position);
      result = { original_generation: authored.scopedSelectionUnknownAuthored(body, original),
        reparsed_generation: authored.scopedSelectionUnknownAuthored(body, select(second)), same_offsets: true,
        public_header: authored.scopedAuthoredView(body).byName.get('unknowns')[0].tables[0].headers[1] };
      assert.equal(result.public_header, 'Edited');
      metrics = { ...result };
    } else {
      const { loadInputArtifact } = await lib('input-artifact');
      const id = 'IN-20261119-meeting-0001', file = path.join(root, `${id}.md`);
      const fm = { input_id: id, input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting:synthetic',
        captured_at: '2026-11-19T00:00:00Z', captured_by: 'synthetic-test', status: 'captured',
        affected_domains: ['sample'], affected_screens: ['SAMPLE-001'] };
      const raw = md(fm, '## Summary\n\nFirst **paragraph**.\n\nSecond [paragraph](https://example.invalid/source).\n');
      fs.writeFileSync(file, raw);
      const { body } = splitFrontmatter(raw), ref = `input:${id}#summary`;
      const options = { contracts: [ref], targetIndex: { artifacts: new Map(), duplicates: new Set() },
        inputArtifacts: [loadInputArtifact(file)], projectRoot: root };
      const left = graph.resolveScopedContractGraph(options), right = graph.resolveScopedContractGraph(options);
      const a = left.nodes.find((node) => node.ref === ref).selection, b = right.nodes.find((node) => node.ref === ref).selection;
      const first = authored.scopedSelectionNodes(body, a), second = authored.scopedSelectionNodes(body, b);
      assert.notEqual(a, b); assert.equal(first.length, 2);
      assert.ok(first.every((node, i) => node === second[i]));
      const spans = graph.createScopedGraphSelectionSpanResolver(), view = ast.sharedReconciliationReferenceView(body);
      const firstSpans = spans(body, view, a, true), secondSpans = spans(body, view, b, true);
      assert.deepEqual(firstSpans, secondSpans);
      assert.deepEqual(left, right); assert.equal(fs.readFileSync(file, 'utf8'), raw);
      result = { graph: left, spans: firstSpans };
      metrics = { identical_native_nodes: first.length, leaf_spans: firstSpans.length,
        shared_internal_span_array: firstSpans === secondSpans };
    }
    const json = JSON.stringify(result);
    if (resultFile) fs.writeFileSync(path.resolve(resultFile), json, { flag: 'wx' });
    console.log(JSON.stringify({ issue: Number(issue), node: process.version, platform: `${process.platform}/${process.arch}`,
      ...metrics, result_bytes: Buffer.byteLength(json), result_sha256: hash(json), max_rss_kib: process.resourceUsage().maxRSS }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main(process.argv.slice(2)).catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
