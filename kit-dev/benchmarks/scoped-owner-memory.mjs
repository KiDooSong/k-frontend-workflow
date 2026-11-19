// node kit-dev/benchmarks/scoped-owner-memory.mjs <before-kit> <after-kit>
//   --out <fresh-directory> [--inputs 1274] [--documents 256] [--bullets 80]
//   [--input-bytes 11728] [--timeout-ms 240000] [--budget-ms 1200000]
//   [--heap-mb 256] [--diagnostics] [--fixture fixture.json] [--fixture-only]
// Default-heap ready/denied/postwork runs compare all output bytes. An optional
// deliberately constrained-heap pair is separate evidence, not a default-heap
// or undisclosed-consumer OOM reproduction. Every child has a hard timeout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createFixture, request, environment, hash, repositoryState, DOCS, OWNER, TARGETS } from './scoped-owner-memory-fixture.mjs';

const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const log = (value) => process.stderr.write(`${new Date().toISOString()} ${value}\n`);
const USAGE = 'scoped-owner-memory.mjs <before-kit> <after-kit> --out fresh-directory [--inputs 1274] [--documents 256] [--bullets 80] [--input-bytes 11728] [--timeout-ms 240000] [--budget-ms 1200000] [--heap-mb 256] [--diagnostics] [--fixture fixture.json] [--fixture-only]';

function parseArgs(args) {
  assert.ok(args.length >= 2, USAGE);
  const kits = { before: fs.realpathSync(args[0]), after: fs.realpathSync(args[1]) }, flags = {};
  for (let n = 2; n < args.length; n++) {
    const key = args[n]; assert.match(key, /^--[a-z-]+$/, USAGE); assert.ok(!Object.hasOwn(flags, key), `duplicate ${key}`);
    flags[key] = ['--fixture-only', '--diagnostics'].includes(key) ? true : args[++n]; assert.notEqual(flags[key], undefined, USAGE);
  }
  const allowed = ['--out', '--inputs', '--documents', '--bullets', '--input-bytes', '--timeout-ms', '--budget-ms', '--heap-mb', '--diagnostics', '--fixture', '--fixture-only'];
  for (const key of Object.keys(flags)) assert.ok(allowed.includes(key), `unknown ${key}`);
  const number = (key, fallback, min) => { const value = Number(flags[key] ?? fallback);
    assert.ok(Number.isSafeInteger(value) && value >= min, `${key} must be an integer >= ${min}`); return value; };
  return { kits, out: path.resolve(flags['--out'] || fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-owner-memory-'))),
    fixtureFile: flags['--fixture'] && path.resolve(flags['--fixture']), fixtureOnly: flags['--fixture-only'], diagnostics: !!flags['--diagnostics'],
    timeout: number('--timeout-ms', 240000, 1000), budget: number('--budget-ms', 1200000, 1000),
    heapMb: flags['--heap-mb'] ? number('--heap-mb', 0, 64) : null,
    fixtureConfig: { inputs: number('--inputs', 1274, 2), documents: number('--documents', 256, 0),
      bullets: number('--bullets', 80, 1), inputBytes: number('--input-bytes', 11728, 0) } };
}

function resourceHook(out) {
  const file = path.join(out, 'resource-hook.mjs');
  fs.writeFileSync(file, String.raw`import fs from 'node:fs';import v8 from 'node:v8';
const phases=new Map(),peak={heapUsed:0,rss:0,external:0,arrayBuffers:0};let samples=0;
function sample(label){const current=process.memoryUsage();samples++;
 for(const key of Object.keys(peak))peak[key]=Math.max(peak[key],current[key]);
 if(label){const row=phases.get(label)||{samples:0,heap_used_max:0,rss_max:0};row.samples++;
 row.heap_used_max=Math.max(row.heap_used_max,current.heapUsed);row.rss_max=Math.max(row.rss_max,current.rss);phases.set(label,row);}}
const write=fs.writeSync;if(process.env.SCOPED_MEMORY_PROGRESS==='1')fs.writeSync=function(fd,bytes,...args){if(fd===2){try{
 const text=Buffer.isBuffer(bytes)?bytes.toString('utf8'):String(bytes);
 const hit=/^workflow:run \[[\d.]+s\] ([a-z-]+:(?:start|done|failed|progress))/.exec(text);
 if(hit)sample(hit[1]);}catch{}}return write.call(this,fd,bytes,...args);};
sample('process:start');process.once('exit',()=>{sample('process:exit');fs.writeFileSync(process.env.SCOPED_MEMORY_RESOURCES,JSON.stringify({
 heap_size_limit:v8.getHeapStatistics().heap_size_limit,resources:process.resourceUsage(),sampled_peak:peak,samples,phases:Object.fromEntries(phases)}));});
`);
  return file;
}

function runtimeFingerprint(kit) {
  const files = [];
  const visit = (directory, prefix = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name, file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file, relative);
      else if (!entry.name.endsWith('.test.mjs')) files.push([relative, hash(fs.readFileSync(file))]);
    }
  };
  visit(path.join(kit, 'scripts'));
  return { scripts_sha256: hash(JSON.stringify(files)), script_files: files.length,
    package_sha256: hash(fs.readFileSync(path.join(kit, 'package.json'))),
    lock_sha256: fs.existsSync(path.join(kit, 'package-lock.json')) ? hash(fs.readFileSync(path.join(kit, 'package-lock.json'))) : null };
}

async function invoke(context, side, name, { denied = false, postwork = false, heapMb = null, diagnostic = false } = {}) {
  const { out, kits, fixture, deadline, hook } = context, remaining = deadline - performance.now();
  assert.ok(remaining >= 1000, 'explicit benchmark budget exhausted');
  assert.deepEqual(runtimeFingerprint(kits[side]), context.fingerprints[side], `${side} runtime source/lock changed before ${name}`);
  const recordDir = path.join(out, name); fs.mkdirSync(recordDir, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(out, 'child-tmp-')), destination = path.join(out, 'shared-output');
  fs.rmSync(destination, { recursive: true, force: true }); fs.rmSync(`${destination}.md`, { force: true });
  const work = path.join(out, denied ? 'request-denied.json' : 'request-ready.json'), metricsFile = path.join(recordDir, 'resources.json');
  const args = [...(heapMb ? [`--max-old-space-size=${heapMb}`] : []), '--import', hook,
    path.join(kits[side], 'scripts/workflow-run.mjs'), '--root', fixture.root, '--docs', DOCS, '--src', 'src',
    '--policy', '.kit/policy.yaml', '--manifest', '.kit/manifest.yaml', '--layout', '.kit/layout.yaml',
    '--work', work, '--out', destination, '--date', '2026-11-19', '--json', ...(diagnostic ? ['--progress'] : []),
    ...(postwork ? ['--packet', path.join(out, 'shared-checkpoint.md')] : [])];
  let stdout = '', stderr = '', timedOut = false, timer, killTimer, heartbeat;
  const started = performance.now(); log(`${name}: starting ${heapMb ? `${heapMb} MiB old-space limit` : 'default heap'}`);
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: fixture.root, env: environment({ TMPDIR: temporary, TMP: temporary, TEMP: temporary,
        SCOPED_MEMORY_RESOURCES: metricsFile, SCOPED_MEMORY_PROGRESS: diagnostic ? '1' : '0' }), stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', (value) => { stdout += value; });
      child.stderr.on('data', (value) => { stderr += value; });
      heartbeat = setInterval(() => log(`${name}: running ${((performance.now() - started) / 1000).toFixed(1)} s`), 15000);
      timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); killTimer = setTimeout(() => child.kill('SIGKILL'), 5000); },
        Math.min(context.timeout, remaining));
      child.once('error', reject); child.once('close', (status, signal) => resolve({ status, signal }));
    });
    const elapsed = performance.now() - started;
    assert.deepEqual(runtimeFingerprint(kits[side]), context.fingerprints[side], `${side} runtime source/lock changed during ${name}`);
    const artifacts = {};
    for (const [key, file] of [['packet', path.join(destination, 'work-packet.md')], ['status', `${destination}.md`], ['report', path.join(destination, 'run-report.md')]]) {
      artifacts[key] = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (artifacts[key] !== null) fs.writeFileSync(path.join(recordDir, `${key}.md`), artifacts[key]);
    }
    const record = { name, side, denied, postwork, diagnostic, heap_mb: heapMb, elapsed_ms: elapsed,
      ...result, timed_out: timedOut, oom: /heap out of memory|Reached heap limit|Allocation failed/.test(stderr),
      stdout, stderr, artifacts, temporary_entries: fs.readdirSync(temporary),
      metrics: fs.existsSync(metricsFile) ? JSON.parse(fs.readFileSync(metricsFile, 'utf8')) : null };
    fs.writeFileSync(path.join(recordDir, 'stdout.json'), stdout); fs.writeFileSync(path.join(recordDir, 'stderr.log'), stderr);
    writeJson(path.join(recordDir, 'result.json'), record);
    log(`${name}: ${(record.elapsed_ms / 1000).toFixed(3)} s; status=${result.status}; signal=${result.signal}; OOM=${record.oom}`);
    return record;
  } finally {
    clearTimeout(timer); clearTimeout(killTimer); clearInterval(heartbeat);
    // A deliberately killed child cannot run its exit cleanup. Only this
    // harness-created temporary directory is removed, never consumer files.
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function verify(record, fixture, expected) {
  assert.equal(record.timed_out, false, 'child exceeded explicit timeout');
  assert.equal(record.signal, null, record.stderr); assert.equal(record.status, 0, record.stderr || record.stdout);
  if (!record.diagnostic) assert.equal(record.stderr, '', 'ordinary CLI stderr must stay empty');
  assert.deepEqual(record.temporary_entries, [], 'successful child must clean the raw snapshot itself');
  const report = JSON.parse(record.stdout);
  assert.equal(report.authority, 'scoped'); assert.equal(report.requests.length, 1); assert.equal(report.requests[0].owner, OWNER);
  assert.equal(report.requests[0].targets.length, 2); assert.equal(report.origin_inputs.length, 1);
  assert.equal(report.snapshot.commit, fixture.commit); assert.equal(report.snapshot.tree, fixture.tree);
  assert.equal(report.ready, !record.denied); assert.notEqual(report.approval_verified, true);
  assert.equal(report.state, record.denied ? 'HALT_AMBIGUITY' : record.postwork ? 'DONE_PENDING_REVIEW' : 'HALT_READY_FOR_WORK');
  if (record.denied) assert.ok(report.denials.length > 0);
  else { assert.deepEqual(report.errors, []); assert.deepEqual(report.denials, []);
    assert.ok(report.requests[0].path_authorizations.every((value) => value.allowed)); }
  if (record.postwork) { assert.equal(report.backstop.ok, true); assert.equal(report.checkpoint.matched, true); assert.ok(record.artifacts.report); }
  assert.match(record.artifacts.packet, /^---\nkind: scoped-work-packet\n/);
  assert.match(record.artifacts.status, /^---\nkind: scoped-work-run-status\n/);
  const value = { stdout: record.stdout, artifacts: record.artifacts };
  if (expected) assert.deepEqual(value, expected, 'complete stdout and packet/status/report bytes differ; no fields normalized');
  return value;
}

async function main(args) {
  const config = parseArgs(args), { out, kits } = config;
  assert.deepEqual(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_CONFIG', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS', 'NODE_V8_COVERAGE', 'NODE_OPTIONS'].filter((name) => process.env[name] !== undefined),
  [], 'run without Git redirection or Node instrumentation variables');
  assert.equal(fs.statSync(kits.before).dev, fs.statSync(kits.after).dev, 'use runtime copies on the same filesystem');
  fs.mkdirSync(out, { recursive: true }); assert.equal(fs.existsSync(path.join(out, 'results.json')), false, 'use a fresh output directory');
  const fixture = config.fixtureFile ? JSON.parse(fs.readFileSync(config.fixtureFile, 'utf8'))
    : await createFixture(kits.before, path.join(out, 'fixture'), config.fixtureConfig);
  assert.equal(fixture.state.status, ''); assert.deepEqual(repositoryState(fixture.root), fixture.state, 'shared fixture changed');
  writeJson(path.join(out, 'fixture.json'), fixture);
  if (config.fixtureOnly) { console.log(JSON.stringify(fixture, null, 2)); return; }
  writeJson(path.join(out, 'request-ready.json'), request(false)); writeJson(path.join(out, 'request-denied.json'), request(true));
  const fingerprints = Object.fromEntries(Object.entries(kits).map(([side, kit]) => [side, runtimeFingerprint(kit)]));
  const context = { ...config, fixture, hook: resourceHook(out), fingerprints, deadline: performance.now() + config.budget };
  const result = { benchmark: 'single-owner-memory', node: process.version, platform: `${process.platform}/${process.arch}`,
    harness_sha256: hash(fs.readFileSync(new URL(import.meta.url))),
    fixture_builder_sha256: hash(fs.readFileSync(new URL('./scoped-owner-memory-fixture.mjs', import.meta.url))), kits, fixture,
    runtime_fingerprints: fingerprints,
    method: {
      corpus: 'Synthetic adopted screen, one selected behavior unit, one active confirmed API candidate/manual contract, two existing M paths and one origin Evidence. A second pending-source unit supplies the denied control. Unrelated dense artifact documents exercise uncertainty document retention. No fabricated gigabyte blobs or real consumer contents.',
      execution: 'Fresh actual workflow:run child processes; includes startup, committed raw tree, evaluation, packet/status/report and cleanup. Primary cases omit --progress and use the same small startup/exit resource hook in both runtimes; no function/call-count loader. Optional diagnostic pair separately adds --progress and samples at writes. Each side has one retained sample per case, so elapsed values are observations, not a stable speedup claim.',
      memory: 'Node process-lifetime high-water RSS from resourceUsage().maxRSS (KiB). Primary heap/external/arrayBuffers samples are startup/exit only; diagnostic maxima also sample progress writes, never true transient peaks. Excludes Git child resource usage. Default-heap runs have no heap override; optional --heap-mb sets V8 --max-old-space-size, not a total process-memory cap; measured heap_size_limit is recorded separately.',
      equivalence: 'Same Git tree, request paths and output paths. Compare complete stdout JSON and every packet/status/report byte, including denial reasons, all public read sets, digests, checkpoint and backstop; nothing normalized away. Original repository bytes/modes/index/HEAD/status and child snapshot cleanup checked. Runtime scripts (excluding tests), package and lock hashes must stay identical before/after every child.',
      limitation: 'No conclusion about the undisclosed #331 consumer or 63-minute OOM follows from this bounded synthetic corpus. Parser scratch allocations and genuinely selected graphs still scale with input.',
    }, cases: {}, diagnostics: null, constrained_heap: null };
  let expectedReady;
  try {
    for (const denied of [false, true]) {
      const name = denied ? 'denied' : 'ready', records = result.cases[name] = []; let expected;
      for (const side of ['before', 'after']) {
        const record = await invoke(context, side, `default-${name}-${side}`, { denied }); records.push(record);
        expected = verify(record, fixture, expected); assert.deepEqual(repositoryState(fixture.root), fixture.state);
      }
      if (!denied) { expectedReady = expected; fs.writeFileSync(path.join(out, 'shared-checkpoint.md'), expected.artifacts.packet); }
    }
    const originals = TARGETS.map((target) => fs.readFileSync(path.join(fixture.root, target)));
    try {
      TARGETS.forEach((target, n) => fs.appendFileSync(path.join(fixture.root, target), `// Synthetic requested implementation ${n}.\n`));
      const changed = repositoryState(fixture.root), records = result.cases.postwork = []; let expected;
      for (const side of ['before', 'after']) {
        const record = await invoke(context, side, `default-postwork-${side}`, { postwork: true }); records.push(record);
        expected = verify(record, fixture, expected); assert.deepEqual(repositoryState(fixture.root), changed);
        assert.equal(fs.readFileSync(path.join(out, 'shared-checkpoint.md'), 'utf8'), expectedReady.artifacts.packet);
      }
    } finally { TARGETS.forEach((target, n) => fs.writeFileSync(path.join(fixture.root, target), originals[n])); }
    assert.deepEqual(repositoryState(fixture.root), fixture.state);
    if (config.diagnostics) {
      result.diagnostics = [];
      for (const side of ['before', 'after']) {
        const record = await invoke(context, side, `diagnostic-ready-${side}`, { diagnostic: true }); result.diagnostics.push(record);
        verify(record, fixture, expectedReady); assert.deepEqual(repositoryState(fixture.root), fixture.state);
      }
    }
    if (config.heapMb) {
      const records = result.constrained_heap = { heap_mb: config.heapMb, records: [] };
      for (const side of ['before', 'after']) {
        const record = await invoke(context, side, `constrained-ready-${side}`, { heapMb: config.heapMb }); records.records.push(record);
        if (record.status === 0 && record.signal === null) verify(record, fixture, expectedReady);
        else assert.ok(record.oom, `limited-heap failure must be a reported V8 OOM, not a timeout/contract error: ${record.stderr}`);
        assert.deepEqual(repositoryState(fixture.root), fixture.state);
      }
    }
    result.verified = true;
  } finally { writeJson(path.join(out, 'results.json'), result); }
  console.log(JSON.stringify({ results: path.join(out, 'results.json'), verified: result.verified, fixture,
    cases: Object.fromEntries(Object.entries(result.cases).map(([name, records]) => [name, records.map(({ side, elapsed_ms, metrics }) =>
      ({ side, elapsed_ms, heap_size_limit: metrics?.heap_size_limit, peak_rss_kib: metrics?.resources.maxRSS,
        sampled_heap_peak: metrics?.sampled_peak.heapUsed }))])), constrained_heap: result.constrained_heap && {
      heap_mb: result.constrained_heap.heap_mb, records: result.constrained_heap.records.map(({ side, status, signal, oom, elapsed_ms }) =>
        ({ side, status, signal, oom, elapsed_ms })) } }, null, 2));
}

main(process.argv.slice(2)).catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
