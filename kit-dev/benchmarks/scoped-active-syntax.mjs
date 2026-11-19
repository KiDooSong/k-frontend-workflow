// #332 oversized-document regression: paired direct-evaluator observations.
// Use the same actual fixture bytes/path, a fresh child for every sample and
// identical target-index preparation. No consumer inputs, profiling flags or
// enlarged Node heap are used. The output directory is retained as evidence.
//
// node kit-dev/benchmarks/scoped-active-syntax.mjs BEFORE_KIT AFTER_KIT FRESH_OUT
// Each KIT names a frontend-workflow-kit directory with installed dependencies.
// Fixed cases: 1/8/16 Unknown rows in a supported document just above the retained
// 8 Mi-character source budget. Evaluation time excludes index preparation.
// This measures a specific parse-count regression, not full CLI latency or a
// prediction for the unpublished consumer. A complete run is bounded to 175 s.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const script = fileURLToPath(import.meta.url);
const HELP = `Usage: node scoped-active-syntax.mjs BEFORE_KIT AFTER_KIT FRESH_OUT

BEFORE_KIT / AFTER_KIT: frontend-workflow-kit directories with installed dependencies.
FRESH_OUT: a new directory for fixtures, complete result JSON and the comparison report.

Runs fresh Node processes for 1, 8 and 16 Unknown rows on identical fixture paths.
Checks complete result equality and fixture/runtime preservation; uses default heap.
The complete benchmark has a 175-second budget. Results are single observations.
`;
const OWNER = 'screen:ACTIVE-001', CONTRACT = 'artifact:ACTIVE-RULES#rules';
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n${body}`;

function fixture(root, rows) {
  assert.equal(fs.existsSync(root), false, 'do not replace an existing fixture');
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  const put = (name, fm, body) => fs.writeFileSync(path.join(root, 'docs', name), md(fm, body));
  fs.writeFileSync(path.join(root, 'policy.yaml'), '{}');
  fs.writeFileSync(path.join(root, 'adoption.yaml'), JSON.stringify({ work_execution: { version: 1, owners: [OWNER], profiles: ['behavior'],
    role_limits: { behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } }));
  put('screen.md', { artifact_id: 'ACTIVE-SCREEN', artifact_type: 'screen-spec', screen_id: 'ACTIVE-001', domain: 'active',
    status: 'draft', api_required: false, screen_entry: 'src/features/active/screens/ActiveScreen.tsx',
    work_execution: { version: 1, units: [{ id: 'known', kind: 'behavior', contracts: [CONTRACT], sources: [] }] } }, '## Notes\nOwner.');
  put('rules.md', { artifact_id: 'ACTIVE-RULES', artifact_type: 'domain-rules', domain: 'active', status: 'confirmed' },
    '## Rules\nPreserve behavior.');
  const body = '## Unknowns\n| ID | Question | Status |\n|---|---|---|\n' +
    Array.from({ length: rows }, (_, i) => `| U-${i} | Review ${CONTRACT} | open |`).join('\n') +
    `\n\n## Appendix\n\n<!-- ${'x'.repeat(8 * 1024 * 1024)} -->\n`;
  put('large.md', { artifact_id: 'ACTIVE-LARGE', artifact_type: 'domain-rules', domain: 'other', status: 'draft' }, body);
}

function fingerprint(root, runtime = false) {
  const digest = createHash('sha256');
  const visit = (directory) => {
    for (const name of fs.readdirSync(directory).sort()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const file = path.join(directory, name), stat = fs.lstatSync(file);
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile() && (!runtime || !name.endsWith('.test.mjs'))) {
        digest.update(path.relative(root, file)).update('\0').update(String(stat.mode & 0o777)).update('\0').update(fs.readFileSync(file)).update('\0');
      }
    }
  };
  visit(root); return digest.digest('hex');
}

async function worker(kit, root, rows, resultFile) {
  const lib = (name) => import(pathToFileURL(path.join(kit, 'scripts/lib', `${name}.mjs`)));
  const [{ loadLayoutProfile }, { buildReconciliationTargetIndex }, { resolveScopedUncertaintyProjection },
    { reconciliationParseStats }, { splitFrontmatter }] = await Promise.all([
      'layout-profile', 'reconciliation-target-index', 'scoped-work-uncertainty', 'reconciliation-markdown-ast', 'util',
    ].map(lib));
  const docsDir = path.join(root, 'docs');
  const docs = ['screen.md', 'rules.md', 'large.md'].map((name) => {
    const file = path.join(docsDir, name);
    return { file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data };
  });
  // Both runtimes perform the same ordinary public index preparation first.
  const options = { owner: OWNER, projectRoot: root, docsDir, policyFile: path.join(root, 'policy.yaml'),
    policyOverlayFile: path.join(root, 'adoption.yaml'), inputArtifacts: [], layout: loadLayoutProfile({ kitRoot: kit }),
    targetIndex: buildReconciliationTargetIndex({ docs }) };
  const before = reconciliationParseStats(), started = performance.now();
  const result = resolveScopedUncertaintyProjection(options);
  const elapsed = performance.now() - started, after = reconciliationParseStats();
  assert.equal(result.projection.uncertainty_relations.records.length, rows);
  assert.equal(result.projection.uncertainty_relations.applications.length, rows);
  assert.ok(result.projection.uncertainty_relations.applications.every((item) => item.relation === 'inverse-evidence'));
  const json = JSON.stringify(result); fs.writeFileSync(resultFile, json);
  return { rows, node: process.version, exec_argv: process.execArgv, evaluated_ms: elapsed,
    after_index_additional_parses: after.parsed - before.parsed, after_index_reused: after.reused - before.reused,
    result_sha256: hash(json), result_bytes: Buffer.byteLength(json), max_rss_kib: process.resourceUsage().maxRSS,
    input_bytes: fs.statSync(path.join(root, 'docs/large.md')).size };
}

if (process.argv[2] === '--worker') {
  const [, , , kit, root, rows, resultFile] = process.argv;
  console.log(JSON.stringify(await worker(kit, root, Number(rows), resultFile)));
} else if (process.argv.length === 3 && ['--help', '-h'].includes(process.argv[2])) {
  console.log(HELP);
} else if (process.argv.length !== 5) {
  console.error(HELP);
  process.exitCode = 2;
} else {
  const deadline = performance.now() + 175000;
  const [, , before, after, outArg] = process.argv;
  const output = path.resolve(outArg);
  assert.equal(fs.existsSync(output), false, 'use a fresh output directory');
  fs.mkdirSync(output, { recursive: true });
  const kits = { before: path.resolve(before), after: path.resolve(after) };
  const runtimeHashes = Object.fromEntries(Object.entries(kits).map(([side, kit]) => [side, fingerprint(path.join(kit, 'scripts'), true)]));
  const report = { node: process.version, platform: `${process.platform}/${process.arch}`, script_sha256: hash(fs.readFileSync(script)),
    worker_source_sha256: hash(worker.toString()), runtime_script_sha256: runtimeHashes, kits,
    method: 'One fresh process per side and row count; identical actual fixture path/bytes and index warm-up; evaluator-only monotonic time after indexing, no Node profiling/heap flags; order alternates. Single observations, not medians or a consumer prediction. Exact complete result JSON bytes and fixture/runtime preservation checked.', cases: [] };
  const env = { ...process.env };
  for (const key of ['NODE_OPTIONS', 'NODE_V8_COVERAGE', 'NODE_TEST_CONTEXT']) delete env[key];
  for (const [index, rows] of [1, 8, 16].entries()) {
    const root = path.join(output, `fixture-${rows}`); fixture(root, rows);
    const fixtureHash = fingerprint(root), entry = { rows, fixture_root: root, fixture_sha256: fixtureHash, samples: {} };
    report.cases.push(entry);
    for (const side of index % 2 ? ['after', 'before'] : ['before', 'after']) {
      const remaining = deadline - performance.now(); assert.ok(remaining > 1000, 'comparison deadline exhausted');
      const resultFile = path.join(output, `${rows}-${side}.json`);
      const started = performance.now();
      const run = spawnSync(process.execPath, [script, '--worker', kits[side], root, String(rows), resultFile], {
        cwd: root, env, encoding: 'utf8', timeout: Math.floor(Math.min(remaining, 120000)), maxBuffer: 8 * 1024 * 1024,
      });
      assert.equal(run.error, undefined, String(run.error)); assert.equal(run.signal, null, run.stderr);
      assert.equal(run.status, 0, run.stderr || run.stdout); assert.equal(run.stderr, '');
      entry.samples[side] = { ...JSON.parse(run.stdout), whole_process_ms: performance.now() - started };
      assert.deepEqual(entry.samples[side].exec_argv, [], 'default heap, no instrumentation arguments');
      assert.equal(fingerprint(root), fixtureHash, 'actual fixture bytes/modes changed');
      console.log(JSON.stringify({ rows, side, ...entry.samples[side] }));
    }
    assert.deepEqual(fs.readFileSync(path.join(output, `${rows}-after.json`)), fs.readFileSync(path.join(output, `${rows}-before.json`)),
      'complete result JSON bytes must match without removing or normalizing fields');
    entry.exact_json_equal = true;
    fs.writeFileSync(path.join(output, 'report.partial.json'), JSON.stringify(report, null, 2));
  }
  for (const [side, kit] of Object.entries(kits)) assert.equal(fingerprint(path.join(kit, 'scripts'), true), runtimeHashes[side], `${side} runtime changed`);
  report.verified = true;
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verified: true, report: path.join(output, 'report.json') }));
}
