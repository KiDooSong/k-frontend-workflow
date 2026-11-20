// #337: repeated whole-input preparation, measured through actual public CLIs.
// Synthetic fixtures only. Plain timing and --progress operation diagnostics
// use separate fresh processes; complete result bytes are never normalized.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createFixture, environment, hash, repositoryState, DOCS, OWNER } from './scoped-owner-memory-fixture.mjs';

const script = fileURLToPath(import.meta.url);
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const log = (value) => console.error(`${new Date().toISOString()} ${value}`);
const HELP = `Usage: node scoped-source-preparation.mjs BEFORE_KIT AFTER_KIT FRESH_OUT
  [--inputs 32,128] [--samples 5] [--timeout-ms 180000] [--budget-ms 900000]

Builds committed synthetic fixtures with one owner and two units. Each input
count gets five plain binding-status pairs with alternating before/after order,
then one separate --progress pair. Every plain sample, median, minimum and
maximum is recorded. --samples accepts 1..9 pairs, fixed before measurement.
The largest fixture also runs the existing ready/denied/postwork workflow:run
comparison, including every stdout, packet, status and report byte.

Input-metadata diagnostics count completed owner-projection record preparations,
not file reads, Markdown parses or preparation outside that progress context.
Plain elapsed time includes startup, input preparation, evaluation and cleanup.
Fresh default-heap processes; diagnostic/workflow timings are single observations,
and no timings predict consumer performance. The output directory must not exist. Every child has
a hard timeout and the measurement budget starts after fixture preparation.
--inputs accepts up to four distinct counts from 2 to 4096.
`;

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

function progressMetrics(stderr) {
  const lines = stderr.split('\n').filter((line) => line.includes(`"${OWNER}`));
  assert.equal(lines.filter((line) => line.includes('owner-projection:start ')).length, 1, 'owner diagnostics must be active');
  assert.equal(lines.filter((line) => line.includes('owner-projection:done ')).length, 1, 'owner diagnostics must finish');
  const counts = lines.flatMap((line) => [...line.matchAll(/; input-metadata: (\d+) records prepared/g)].map((m) => Number(m[1])));
  assert.ok(counts.every((value, i) => i === 0 || value >= counts[i - 1]), 'owner preparation count must be cumulative');
  const sources = lines.filter((line) => line.includes('owner-stage:done '))
    .flatMap((line) => [...line.matchAll(/; sources; elapsed_ms=([\d.]+)/g)].map((m) => Number(m[1])));
  assert.equal(sources.length, 2, 'the fixture must evaluate both unit source stages');
  return { owner_input_metadata_records: counts.at(-1) ?? 0, source_stage_count: sources.length,
    source_stage_ms: sources, source_stages_total_ms: sources.reduce((sum, value) => sum + value, 0) };
}

function timingSummary(samples) {
  const values = samples.map(({ whole_process_ms }) => whole_process_ms).sort((a, b) => a - b), middle = Math.floor(values.length / 2);
  return { median_ms: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2,
    min_ms: values[0], max_ms: values.at(-1) };
}

async function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(HELP); return; }
  assert.ok(args.length >= 3, HELP);
  const [before, after, outArg] = args, flags = {};
  for (let i = 3; i < args.length; i += 2) {
    const key = args[i];
    assert.ok(['--inputs', '--samples', '--timeout-ms', '--budget-ms'].includes(key) && !Object.hasOwn(flags, key), HELP);
    assert.notEqual(args[i + 1], undefined, HELP); flags[key] = args[i + 1];
  }
  const counts = (flags['--inputs'] ?? '32,128').split(',').map(Number).sort((a, b) => a - b);
  const sampleCount = Number(flags['--samples'] ?? 5);
  const timeout = Number(flags['--timeout-ms'] ?? 180000), budget = Number(flags['--budget-ms'] ?? 900000);
  assert.ok(counts.length >= 1 && counts.length <= 4 && new Set(counts).size === counts.length &&
    counts.every((n) => Number.isSafeInteger(n) && n >= 2 && n <= 4096), '--inputs must contain distinct integers from 2 to 4096');
  assert.ok(Number.isSafeInteger(sampleCount) && sampleCount >= 1 && sampleCount <= 9, '--samples must be an integer from 1 to 9');
  assert.ok([timeout, budget].every((n) => Number.isSafeInteger(n) && n >= 1000), 'timeouts must be milliseconds >= 1000');
  assert.deepEqual(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS',
    'NODE_OPTIONS', 'NODE_V8_COVERAGE'].filter((name) => process.env[name] !== undefined), [],
  'run without Git redirection or Node instrumentation variables');
  const kits = { before: fs.realpathSync(before), after: fs.realpathSync(after) }, out = path.resolve(outArg);
  assert.equal(fs.statSync(kits.before).dev, fs.statSync(kits.after).dev, 'use runtime copies on the same filesystem');
  assert.equal(fs.existsSync(out), false, 'refuse to replace an existing output directory');
  fs.mkdirSync(out, { recursive: true });
  const fingerprints = Object.fromEntries(Object.entries(kits).map(([side, kit]) => [side, fingerprint(kit)]));
  const fixtures = [];
  for (const inputs of counts) {
    const directory = path.join(out, `inputs-${inputs}`); fs.mkdirSync(directory);
    const fixture = await createFixture(kits.before, path.join(directory, 'fixture'), { inputs, documents: 0, bullets: 1, inputBytes: 0 });
    const file = path.join(directory, 'fixture.json'); writeJson(file, fixture); fixtures.push({ inputs, directory, file, fixture });
  }
  const deadline = performance.now() + budget;
  const env = environment(); delete env.NODE_TEST_CONTEXT;
  const report = { benchmark: 'scoped-source-preparation', node: process.version, platform: `${process.platform}/${process.arch}`,
    kits, runtime_fingerprints: fingerprints, harness_sha256: hash(fs.readFileSync(script)),
    fixture_builder_sha256: hash(fs.readFileSync(new URL('./scoped-owner-memory-fixture.mjs', import.meta.url))),
    workflow_harness_sha256: hash(fs.readFileSync(new URL('./scoped-owner-memory.mjs', import.meta.url))),
    config: { inputs: counts, plain_samples: sampleCount, timeout_ms: timeout, budget_ms: budget }, fixtures: fixtures.map(({ inputs, file }) => ({ inputs, file })),
    method: {
      corpus: 'One adopted synthetic owner, two units, two selected source inputs, and a variable full input inventory. Zero unrelated documents, one bullet per input, no padding. No private consumer contents.',
      execution: 'Plain and --progress binding-status use separate fresh default-heap Node processes without loaders or resource hooks. The predeclared plain sample count is fixed for every side/input count; before/after order alternates each pair and reverses its starting side for the next input count. Every plain elapsed sample and median/min/max are retained. Plain elapsed covers the complete process. One separate diagnostic pair per size and one workflow pair per case; workflow uses the existing memory harness and its symmetric startup/exit resource hook, with no call-count loader.',
      diagnostics: 'Owner input-metadata counts measure completed record-preparation operations inside the owner progress context. Zero means no such owner events, not zero process preparation, reads or parsing. Sources-stage elapsed values come only from separate diagnostic processes.',
      equivalence: 'Complete binding-status stdout is identical before/after and with/without progress. The largest fixture also compares complete workflow ready/denied/postwork stdout and packet/status/report bytes. Runtime fingerprints, fixture HEAD/index/bytes/modes/status and successful child snapshot cleanup are checked.',
      limits: 'The total budget excludes fixture preparation. Diagnostic times and workflow time/RSS are single observations; plain samples are a small fixed series, not a consumer performance prediction. Synthetic results do not establish consumer runtime or OOM resolution. Preparation outside owner progress remains included in whole-process timing.',
    }, binding_status: [], workflow: null, verified: false };
  const verifyRuntime = () => {
    for (const [side, kit] of Object.entries(kits)) assert.deepEqual(fingerprint(kit), fingerprints[side], `${side} runtime changed during comparison`);
  };
  const run = async (label, argv, entry, { maximum = timeout, temporary } = {}) => {
    verifyRuntime();
    const remaining = deadline - performance.now(); assert.ok(remaining >= 1000, 'whole benchmark budget exhausted');
    log(`${label}: starting`);
    let stdout = '', stderr = '', timedOut = false, timer, killTimer, heartbeat;
    const started = performance.now();
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, argv, { cwd: entry.fixture.root,
          env: temporary ? { ...env, TMPDIR: temporary, TMP: temporary, TEMP: temporary } : env, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
        child.stdout.on('data', (value) => { stdout += value; }); child.stderr.on('data', (value) => { stderr += value; });
        heartbeat = setInterval(() => log(`${label}: running ${((performance.now() - started) / 1000).toFixed(1)} s`), 15000);
        timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); killTimer = setTimeout(() => child.kill('SIGKILL'), 5000); },
          Math.min(maximum, remaining));
        child.once('error', reject); child.once('close', (status, signal) => resolve({ status, signal }));
      });
      const wholeProcessMs = performance.now() - started;
      fs.writeFileSync(path.join(out, `${label}.stdout`), stdout); fs.writeFileSync(path.join(out, `${label}.stderr`), stderr);
      assert.equal(timedOut, false, 'child exceeded explicit timeout');
      assert.equal(result.signal, null, stderr); assert.equal(result.status, 0, stderr || stdout);
      verifyRuntime(); assert.deepEqual(repositoryState(entry.fixture.root), entry.fixture.state, 'original repository changed');
      if (temporary) assert.deepEqual(fs.readdirSync(temporary), [], 'successful child must clean its snapshot');
      log(`${label}: ${wholeProcessMs.toFixed(1)} ms`);
      return { stdout, stderr, whole_process_ms: wholeProcessMs };
    } finally { clearTimeout(timer); clearTimeout(killTimer); clearInterval(heartbeat); }
  };
  try {
    for (const [index, entry] of fixtures.entries()) {
      const row = { inputs: entry.inputs, plain: {}, diagnostic: {} }; report.binding_status.push(row);
      let expected;
      for (const diagnostic of [false, true]) {
        const kind = diagnostic ? 'diagnostic' : 'plain';
        for (let sample = 0; sample < (diagnostic ? 1 : sampleCount); sample += 1) {
          const order = (index + sample) % 2 === 0 ? ['before', 'after'] : ['after', 'before'];
          for (const [position, side] of order.entries()) {
            const temporary = fs.mkdtempSync(path.join(entry.directory, 'snapshots-'));
            const label = `inputs-${entry.inputs}-${kind}-${side}${diagnostic ? '' : `-${sample + 1}`}`;
            const result = await run(label, [path.join(kits[side], 'scripts/binding-status.mjs'),
              '--root', entry.fixture.root, '--docs', DOCS, '--src', 'src', '--policy', '.kit/policy.yaml',
              '--manifest', '.kit/manifest.yaml', '--layout', '.kit/layout.yaml', '--owner', OWNER, '--json', ...(diagnostic ? ['--progress'] : [])],
            entry, { temporary });
            if (expected !== undefined) assert.equal(result.stdout, expected, 'complete binding-status stdout differs');
            else expected = result.stdout;
            JSON.parse(result.stdout);
            const common = { result_bytes: Buffer.byteLength(result.stdout), result_sha256: hash(result.stdout) };
            if (diagnostic) row.diagnostic[side] = { whole_process_ms: result.whole_process_ms, ...common, ...progressMetrics(result.stderr) };
            else {
              assert.equal(result.stderr, '', 'ordinary CLI stderr must stay empty');
              const saved = row.plain[side] ??= { ...common, samples: [] };
              saved.samples.push({ sample: sample + 1, order: position + 1, whole_process_ms: result.whole_process_ms });
              Object.assign(saved, timingSummary(saved.samples));
            }
            fs.rmdirSync(temporary); writeJson(path.join(out, 'report.partial.json'), report);
          }
        }
      }
      assert.ok(row.diagnostic.after.owner_input_metadata_records < row.diagnostic.before.owner_input_metadata_records,
        'the owned snapshot must reduce repeated owner input-record preparation');
    }
    const largest = fixtures.at(-1), remaining = deadline - performance.now();
    assert.ok(remaining >= 12000, 'insufficient budget remains for workflow comparisons and child cleanup');
    const workflow = await run('workflow-pairs', [path.join(path.dirname(script), 'scoped-owner-memory.mjs'), kits.before, kits.after,
      '--out', path.join(out, 'workflow'), '--fixture', largest.file, '--timeout-ms', String(timeout),
      '--budget-ms', String(Math.floor(remaining - 10000))], largest, { maximum: remaining });
    const workflowReport = JSON.parse(fs.readFileSync(path.join(out, 'workflow/results.json'), 'utf8'));
    assert.equal(workflowReport.verified, true);
    report.workflow = { inputs: largest.inputs, result_file: path.join(out, 'workflow/results.json'),
      whole_process_ms: workflow.whole_process_ms, cases: Object.fromEntries(Object.entries(workflowReport.cases).map(([name, samples]) =>
        [name, samples.map(({ side, elapsed_ms, metrics }) => ({ side, elapsed_ms, max_rss_kib: metrics?.resources.maxRSS }))])) };
    for (const entry of fixtures) assert.deepEqual(repositoryState(entry.fixture.root), entry.fixture.state);
    report.verified = true;
  } finally { writeJson(path.join(out, 'report.json'), report); }
  console.log(JSON.stringify({ verified: report.verified, report: path.join(out, 'report.json'), binding_status: report.binding_status,
    workflow: report.workflow }, null, 2));
}

main(process.argv.slice(2)).catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
