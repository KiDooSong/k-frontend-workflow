// #335: exact dense-node lookup plus paired real applicability and public CLIs.
// Synthetic inputs only. Runtime copies and the committed fixture stay intact;
// whole result/packet/status/report bytes are compared without normalization.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createFixture, environment, repositoryState, DOCS, OWNER } from './scoped-owner-memory-fixture.mjs';
import { git, hash } from './owner-projection-fixture.mjs';

const script = fileURLToPath(import.meta.url);
const HELP = `Usage: node scoped-unknown-reuse.mjs BEFORE_KIT AFTER_KIT FRESH_OUT
  [--rows 2] [--timeout-ms 180000] [--budget-ms 900000]

Uses fresh default-heap Node processes and one shared committed synthetic tree.
Runs the exact 52,800-row / four-lookup reproduction, full applicability pairs,
binding-status pairs, and workflow:run ready/denied/postwork pairs. Source-length
overflow with a small Unknown table bounds the actual evaluator/CLI workload.
Every child is timed out; paired measurements have an explicit total budget
(fixture preparation is excluded).
The output directory must not exist. Results are observations, not medians or
predictions for the undisclosed consumer. No source files or bindings are fixed
by the benchmark itself.
`;
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}\n`;
const lib = (kit, name) => import(pathToFileURL(path.join(kit, 'scripts/lib', `${name}.mjs`)).href);

function fingerprint(kit) {
  const files = [];
  const visit = (directory, relative = '') => {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name), key = relative ? `${relative}/${name}` : name, stat = fs.lstatSync(file);
      if (stat.isDirectory()) visit(file, key);
      else if (stat.isFile() && !name.endsWith('.test.mjs')) files.push([key, stat.mode & 0o777, hash(fs.readFileSync(file))]);
    }
  };
  visit(path.join(kit, 'scripts'));
  return { scripts_sha256: hash(JSON.stringify(files)), package_sha256: hash(fs.readFileSync(path.join(kit, 'package.json'))),
    lock_sha256: hash(fs.readFileSync(path.join(kit, 'package-lock.json'))) };
}

async function makeFixture(kit, root, rows) {
  const fixture = await createFixture(kit, root, { inputs: 2, documents: 0, bullets: 1, inputBytes: 0 });
  const [{ splitFrontmatter }, { loadLayoutProfile }, { buildState }] = await Promise.all([
    lib(kit, 'util'), lib(kit, 'layout-profile'), import(pathToFileURL(path.join(kit, 'scripts/workflow-state.mjs')).href),
  ]);
  const large = `${DOCS}/domains/memory/rules/unknown-reuse.md`;
  const body = '## Unknowns\n\n| ID | Question | Status |\n|---|---|---|\n' +
    Array.from({ length: rows }, (_, i) => `| U-REUSE-${i} | Review artifact:MEMORY-RULES#rules | resolved |`).join('\n') +
    `\n\n## Appendix\n\n<!-- ${'x'.repeat(8 * 1024 * 1024)} -->\n`;
  fs.writeFileSync(path.join(root, large), md({ artifact_id: 'UNKNOWN-REUSE', artifact_type: 'domain-rules', domain: 'memory',
    status: 'confirmed', approved_by: 'synthetic-test-owner', approved_at: '2026-11-19', decision_id: 'synthetic-unknown-reuse' }, body));
  const screen = path.join(root, DOCS, 'domains/memory/screens/memory/screen-spec.md');
  const parsed = splitFrontmatter(fs.readFileSync(screen, 'utf8'));
  parsed.data.work_execution.units.push({ id: 'selected', kind: 'behavior',
    contracts: ['artifact:UNKNOWN-REUSE#unknowns'], sources: [] });
  fs.writeFileSync(screen, md(parsed.data, parsed.body));
  const layout = loadLayoutProfile({ kitRoot: root, flags: { layout: path.join(root, '.kit/layout.yaml') } });
  fs.writeFileSync(path.join(root, DOCS, '_meta/workflow-state.yaml'), JSON.stringify(buildState({ docsDir: path.join(root, DOCS),
    srcDir: path.join(root, 'src'), date: '2026-11-19', layout, projectRoot: root }).state));
  git(root, 'add', '--', DOCS); git(root, 'commit', '-qm', 'Synthetic oversized Unknown application corpus');
  const names = git(root, 'ls-files', '-z').split('\0').filter(Boolean);
  return { ...fixture, commit: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}'),
    tracked_files: names.length, tracked_bytes: names.reduce((sum, name) => sum + fs.lstatSync(path.join(root, name)).size, 0),
    unknown_rows: rows, large_unknown_body_chars: body.length, large_unknown_file: large,
    unit_ids: parsed.data.work_execution.units.map((unit) => unit.id), state: repositoryState(root) };
}

async function worker(kind, kit, root, resultFile) {
  const ast = await lib(kit, 'reconciliation-markdown-ast');
  let metrics;
  if (kind === 'dense') {
    const authored = await lib(kit, 'scoped-work-authored'), { scopedUnknownAuthored } = await lib(kit, 'scoped-work-uncertainty');
    const body = ['## Unknowns', '', '| ID | Question |', '| --- | --- |',
      ...Array.from({ length: 52800 }, (_, i) => `| U-${i} | Question? |`), ''].join('\n');
    const view = authored.scopedAuthoredView(body), table = view.sections.find((section) => section.slug === 'unknowns').tableNodes[0];
    const selections = table.children.slice(1, 5).map((row) => authored.rememberScopedSelection({ type: 'row' }, body, [row]));
    const check = () => {
      const before = ast.reconciliationParseStats().parsed;
      for (const selection of selections) assert.equal(scopedUnknownAuthored(body, selection), true);
      return ast.reconciliationParseStats().parsed - before;
    };
    const started = performance.now(), outside = check(), elapsed = performance.now() - started;
    metrics = { source_chars: body.length, native_nodes: ast.reconciliationTreeNodeCount(view.tree), selections: selections.length,
      outside_batch_parses: outside, outside_batch_ms: elapsed, inside_batch_parses: authored.withScopedDocumentSyntax(body, check),
      syntax_cache: ast.reconciliationSyntaxCacheStats(), authored_cache: authored.scopedAuthoredCacheStats() };
    for (const stats of [metrics.syntax_cache, metrics.authored_cache]) {
      assert.ok(stats.source_chars <= stats.max_source_chars && stats.nodes <= stats.max_nodes && stats.entries <= stats.max_entries);
    }
    writeJson(resultFile, metrics);
  } else {
    assert.equal(kind, 'applicability');
    const [{ baselineArtifactIndex }, { collectInputArtifacts }, { resolveScopedApplicabilityProjection }] = await Promise.all([
      lib(kit, 'scoped-work-execution'), lib(kit, 'input-artifact'), lib(kit, 'scoped-work-applicability'),
    ]);
    const docsDir = path.join(root, DOCS), { targetIndex } = baselineArtifactIndex(docsDir);
    const options = { owner: OWNER, projectRoot: root, docsDir, kitRoot: kit, targetIndex,
      policyFile: path.join(root, '.kit/policy.yaml'), policyOverlayFile: path.join(root, '.kit/adoption.yaml'),
      layoutFile: path.join(root, '.kit/layout.yaml'), manifestFile: path.join(root, '.kit/manifest.yaml'),
      registerFile: path.join(docsDir, '_meta/reconciliation-register.md'), srcDir: path.join(root, 'src'),
      inputArtifacts: collectInputArtifacts(path.join(docsDir, 'inputs')) };
    const before = ast.reconciliationParseStats().parsed, started = performance.now();
    const result = resolveScopedApplicabilityProjection(options), json = JSON.stringify(result);
    fs.writeFileSync(resultFile, json);
    metrics = { after_index_parses: ast.reconciliationParseStats().parsed - before, evaluation_ms: performance.now() - started,
      result_sha256: hash(json), result_bytes: Buffer.byteLength(json),
      unknown_applications: result.projection.uncertainty_relations.applications.length };
  }
  return { kind, node: process.version, exec_argv: process.execArgv, max_rss_kib: process.resourceUsage().maxRSS, ...metrics };
}

async function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(HELP); return; }
  assert.ok(args.length >= 3, HELP);
  const [before, after, outArg] = args, flags = {};
  for (let i = 3; i < args.length; i += 2) {
    assert.ok(['--rows', '--timeout-ms', '--budget-ms'].includes(args[i]) && !Object.hasOwn(flags, args[i]), HELP);
    flags[args[i]] = Number(args[i + 1]);
  }
  const rows = flags['--rows'] ?? 2, timeout = flags['--timeout-ms'] ?? 180000, budget = flags['--budget-ms'] ?? 900000;
  assert.ok(Number.isSafeInteger(rows) && rows > 0 && rows <= 16, '--rows must be 1..16');
  assert.ok([timeout, budget].every((n) => Number.isSafeInteger(n) && n >= 1000), 'timeouts must be positive milliseconds >= 1000');
  assert.deepEqual(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS']
    .filter((name) => process.env[name] !== undefined), [], 'run without Git redirection variables');
  const kits = { before: fs.realpathSync(before), after: fs.realpathSync(after) }, out = path.resolve(outArg);
  assert.equal(fs.existsSync(out), false, 'refuse to replace an existing output directory');
  fs.mkdirSync(out, { recursive: true });
  const fingerprints = Object.fromEntries(Object.entries(kits).map(([side, kit]) => [side, fingerprint(kit)]));
  const fixture = await makeFixture(kits.before, path.join(out, 'fixture'), rows);
  const fixtureFile = path.join(out, 'fixture.json'); writeJson(fixtureFile, fixture);
  const deadline = performance.now() + budget;
  const env = environment();
  for (const key of ['NODE_OPTIONS', 'NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE']) delete env[key];
  const report = { node: process.version, platform: `${process.platform}/${process.arch}`, kits, runtime_fingerprints: fingerprints,
    script_sha256: hash(fs.readFileSync(script)), config: { rows, timeout_ms: timeout, budget_ms: budget }, fixture,
    method: 'Exact dense-node four-lookup reproduction; fresh processes for every direct evaluator and public CLI run. Same committed synthetic fixture, requests and result paths. Default heap. Whole output bytes, runtime fingerprints, HEAD/index/worktree and snapshot cleanup preserved. Full workflow ready/denied/postwork checks delegated to the existing memory harness. The total measurement budget starts after fixture preparation. Time/RSS are single observations; no undisclosed-consumer claim.',
    dense: {}, applicability: {}, binding_status: {}, workflow: null, verified: false };
  const verifyRuntime = () => {
    for (const [side, kit] of Object.entries(kits)) assert.deepEqual(fingerprint(kit), fingerprints[side], `${side} runtime changed during comparison`);
  };
  const run = (label, argv, maximum = timeout) => {
    verifyRuntime();
    const remaining = deadline - performance.now(); assert.ok(remaining >= 1000, 'whole benchmark budget exhausted');
    console.error(`${new Date().toISOString()} ${label}: starting`);
    const started = performance.now(), result = spawnSync(process.execPath, argv, { cwd: fixture.root, env,
      encoding: 'utf8', timeout: Math.floor(Math.min(maximum, remaining)), maxBuffer: 16 * 1024 * 1024 });
    fs.writeFileSync(path.join(out, `${label}.stdout`), result.stdout || ''); fs.writeFileSync(path.join(out, `${label}.stderr`), result.stderr || '');
    assert.equal(result.error, undefined, String(result.error)); assert.equal(result.signal, null, result.stderr);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    verifyRuntime(); assert.deepEqual(repositoryState(fixture.root), fixture.state, 'original repository changed');
    console.error(`${new Date().toISOString()} ${label}: ${(performance.now() - started).toFixed(1)} ms`);
    return { stdout: result.stdout, stderr: result.stderr, whole_process_ms: performance.now() - started };
  };
  try {
    for (const kind of ['dense', 'applicability']) {
      for (const side of kind === 'dense' ? ['before', 'after'] : ['after', 'before']) {
        const resultFile = path.join(out, `${kind}-${side}.json`);
        const result = run(`${kind}-${side}`, [script, '--worker', kind, kits[side], fixture.root, resultFile]);
        assert.equal(result.stderr, '');
        report[kind][side] = { ...JSON.parse(result.stdout), whole_process_ms: result.whole_process_ms };
        assert.deepEqual(report[kind][side].exec_argv, []);
        writeJson(path.join(out, 'report.partial.json'), report);
      }
    }
    assert.equal(report.dense.after.outside_batch_parses, 0, 'four remembered rows must not reconstruct the oversized tree');
    assert.equal(report.dense.after.inside_batch_parses, 0);
    assert.ok(report.applicability.after.after_index_parses < report.applicability.before.after_index_parses,
      'the real applicability loop must perform less parsing');
    assert.deepEqual(fs.readFileSync(path.join(out, 'applicability-after.json')), fs.readFileSync(path.join(out, 'applicability-before.json')),
      'complete applicability JSON differs');
    let bindingBytes;
    for (const side of ['before', 'after']) {
      const temporary = fs.mkdtempSync(path.join(out, 'binding-tmp-'));
      env.TMPDIR = temporary; env.TMP = temporary; env.TEMP = temporary;
      const result = run(`binding-${side}`, [path.join(kits[side], 'scripts/binding-status.mjs'), '--root', fixture.root,
        '--docs', DOCS, '--src', 'src', '--policy', '.kit/policy.yaml', '--manifest', '.kit/manifest.yaml',
        '--layout', '.kit/layout.yaml', '--owner', OWNER, '--json']);
      assert.equal(result.stderr, ''); assert.deepEqual(fs.readdirSync(temporary), [], 'CLI did not clean its raw snapshot');
      if (bindingBytes !== undefined) assert.equal(result.stdout, bindingBytes, 'complete binding-status JSON differs');
      bindingBytes = result.stdout;
      report.binding_status[side] = { whole_process_ms: result.whole_process_ms, result_bytes: Buffer.byteLength(result.stdout), result_sha256: hash(result.stdout) };
      fs.rmdirSync(temporary); delete env.TMPDIR; delete env.TMP; delete env.TEMP;
      writeJson(path.join(out, 'report.partial.json'), report);
    }
    const remaining = deadline - performance.now(); assert.ok(remaining > 1000, 'no budget remains for actual workflow CLIs');
    const workflow = run('workflow-pairs', [path.join(path.dirname(script), 'scoped-owner-memory.mjs'), kits.before, kits.after,
      '--out', path.join(out, 'workflow'), '--fixture', fixtureFile, '--timeout-ms', String(timeout),
      '--budget-ms', String(Math.floor(remaining - 500))], remaining);
    const workflowReport = JSON.parse(fs.readFileSync(path.join(out, 'workflow/results.json'), 'utf8'));
    assert.equal(workflowReport.verified, true);
    report.workflow = { result_file: path.join(out, 'workflow/results.json'), whole_process_ms: workflow.whole_process_ms,
      cases: Object.fromEntries(Object.entries(workflowReport.cases).map(([name, samples]) => [name,
        samples.map(({ side, elapsed_ms, metrics }) => ({ side, elapsed_ms, max_rss_kib: metrics?.resources.maxRSS }))])) };
    report.verified = true;
  } finally { writeJson(path.join(out, 'report.json'), report); }
  console.log(JSON.stringify({ verified: report.verified, report: path.join(out, 'report.json'), dense: report.dense,
    applicability: report.applicability, binding_status: report.binding_status, workflow: report.workflow }, null, 2));
}

if (process.argv[2] === '--worker') {
  const [, , , kind, kit, root, resultFile] = process.argv;
  console.log(JSON.stringify(await worker(kind, kit, root, resultFile)));
} else {
  main(process.argv.slice(2)).catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
}
