// node kit-dev/benchmarks/owner-projection.mjs <before-kit> <after-kit>
//   [--out <directory>] [--fixture <fixture.json>] [--fixture-only]
//   [--inputs 1397] [--units 5] [--rows 937] [--input-bytes 4096]
//   [--runs 3] [--timeout-ms 240000] [--budget-ms 1200000]
//   [--baseline <label=another-before-kit>] (repeatable; shares after samples)
//   [--control-fixture <small-fixture.json>] (optional cheaper denied control)
// Both public CLIs consume ONE committed synthetic tree. Actual total times use
// fresh processes without progress or instrumentation; separate diagnostics
// report snapshot/input preparation/owner projection/digest phases and capture
// complete binding inspections, basis JSON and read sets for exact comparison.
// Outputs and raw diagnostic files stay under --out; private snapshots must be
// removed by each successful CLI. No consumer document or timing is reproduced.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { OWNER, DOCS, ENTRY, hash, environment, createFixture, repositoryState } from './owner-projection-fixture.mjs';

const USAGE = 'owner-projection.mjs <before-kit> <after-kit> [--baseline label=kit] [--out directory] [--fixture fixture.json] [--control-fixture fixture.json] [--fixture-only] [--inputs 1397] [--units 5] [--rows 937] [--input-bytes 4096] [--runs 3] [--timeout-ms 240000] [--budget-ms 1200000]';
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const median = (values) => { const sorted = [...values].sort((a, b) => a - b), i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2; };
const log = (message) => process.stderr.write(`${new Date().toISOString()} ${message}\n`);

function argumentsFor(args) {
  assert.ok(args.length >= 2, USAGE);
  const kits = { before: fs.realpathSync(args[0]), after: fs.realpathSync(args[1]) }, flags = {};
  for (let i = 2; i < args.length; i++) {
    const key = args[i]; assert.match(key, /^--[a-z-]+$/, USAGE);
    if (key === '--baseline') {
      const match = /^([a-z][a-z0-9-]*)=(.+)$/.exec(args[++i] ?? ''); assert.ok(match, '--baseline requires label=kit');
      assert.ok(!Object.hasOwn(kits, match[1]), `duplicate runtime label ${match[1]}`);
      kits[match[1]] = fs.realpathSync(match[2]); continue;
    }
    assert.ok(!Object.hasOwn(flags, key), `duplicate flag ${key}`);
    if (key === '--fixture-only') flags[key] = true;
    else { assert.ok(i + 1 < args.length && !args[i + 1].startsWith('--'), USAGE); flags[key] = args[++i]; }
  }
  const known = new Set(['--out', '--fixture', '--control-fixture', '--fixture-only', '--inputs', '--units', '--rows', '--input-bytes', '--runs', '--timeout-ms', '--budget-ms']);
  for (const key of Object.keys(flags)) assert.ok(known.has(key), `unknown flag ${key}`);
  const integer = (key, fallback, min) => { const value = Number(flags[key] ?? fallback);
    assert.ok(Number.isSafeInteger(value) && value >= min, `${key} must be an integer >= ${min}`); return value; };
  return { kits, fixtureFile: flags['--fixture'] && path.resolve(flags['--fixture']), fixtureOnly: flags['--fixture-only'],
    controlFixtureFile: flags['--control-fixture'] && path.resolve(flags['--control-fixture']),
    out: flags['--out'] ? path.resolve(flags['--out']) : fs.mkdtempSync(path.join(os.tmpdir(), 'owner-projection-bench-')),
    runs: integer('--runs', 3, 1), timeout: integer('--timeout-ms', 240000, 1000), budget: integer('--budget-ms', 1200000, 1000),
    fixtureConfig: { inputs: integer('--inputs', 1397, 1), units: integer('--units', 5, 2),
      rows: integer('--rows', 937, 4), inputBytes: integer('--input-bytes', 4096, 2048) } };
}

function runtimeFingerprint(kit) {
  const entries = [];
  const visit = (root, prefix = '') => { for (const item of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${item.name}` : item.name, absolute = path.join(root, item.name);
    if (item.isDirectory()) visit(absolute, relative);
    else entries.push([relative, hash(fs.readFileSync(absolute))]);
  } };
  visit(path.join(kit, 'scripts'));
  return { scripts_sha256: hash(JSON.stringify(entries)), script_files: entries.length,
    package_sha256: hash(fs.readFileSync(path.join(kit, 'package.json'))),
    lock_sha256: fs.existsSync(path.join(kit, 'package-lock.json')) ? hash(fs.readFileSync(path.join(kit, 'package-lock.json'))) : null };
}

function diagnosticHook(out) {
  const loader = path.join(out, 'diagnostic-loader.mjs'), hook = path.join(out, 'diagnostic-hook.mjs');
  fs.writeFileSync(loader, String.raw`import path from 'node:path';
import {pathToFileURL} from 'node:url';
const prefix=pathToFileURL(path.join(process.env.OWNER_BENCH_KIT,'scripts/lib/')).href;
const names=['materializeRawGitTree','collectInputArtifacts','baselineArtifactIndex','validateCurrentReconciliation','prepareScopedInputMetadata',
 'applicabilityProjection','scopedBindingBasis','inspectScopedSnapshotOwner','inspectScopedSnapshotBindings','inspectScopedSnapshotDecisionBindings',
 'resolveScopedUnitProjection','createScopedSourceResolver','resolveScopedCandidateGraph','resolveScopedContractGraph'];
export async function load(url,context,nextLoad){const result=await nextLoad(url,context);
 if(!url.startsWith(prefix)||!url.endsWith('.mjs'))return result;let source=String(result.source);
 for(const name of names){const pattern=new RegExp('(export )?function '+name+'\\([\\s\\S]*?\\) \\{');
 source=source.replace(pattern,(match,ex='')=>ex+'function '+name+'(...args){return globalThis.__ownerBench.call('+JSON.stringify(name)+',__ownerOriginal_'+name+',this,args);}\nfunction __ownerOriginal_'+name+match.slice(match.indexOf('(')));}
 return {...result,source};}
`);
  fs.writeFileSync(hook, String.raw`import fs from 'node:fs';import path from 'node:path';import {types} from 'node:util';
import {register} from 'node:module';import {pathToFileURL} from 'node:url';
const functions={},depths=new Map(),captures=[];
const selected=new Set(['scopedBindingBasis','inspectScopedSnapshotOwner','inspectScopedSnapshotBindings','inspectScopedSnapshotDecisionBindings']);
globalThis.__ownerBench={call(name,fn,receiver,args){const depth=depths.get(name)||0;depths.set(name,depth+1);
 const row=functions[name]??={calls:0,outer_calls:0,inclusive_ms:0};row.calls++;if(!depth)row.outer_calls++;
 const start=depth?0n:process.hrtime.bigint();
 try{const value=fn.apply(receiver,args);if(selected.has(name))captures.push({function:name,value});return value;}
 finally{if(!depth)row.inclusive_ms+=Number(process.hrtime.bigint()-start)/1e6;depths.set(name,depth);}}};
register(new URL('./diagnostic-loader.mjs',import.meta.url),import.meta.url);
const kit=process.env.OWNER_BENCH_KIT;
const ast=await import(pathToFileURL(path.join(kit,'scripts/lib/reconciliation-markdown-ast.mjs')).href);
const provenance=await import(pathToFileURL(path.join(kit,'scripts/lib/provenance.mjs')).href);
const metadataPath=path.join(kit,'scripts/lib/scoped-work-input-metadata.mjs');
const metadata=fs.existsSync(metadataPath)?await import(pathToFileURL(metadataPath).href):null;
const cloneCounts={calls:0,input_metadata:0,source_constructor_input_metadata:0,preparation_input_metadata:0,other_input_metadata:0};
const originalClone=globalThis.structuredClone;
globalThis.structuredClone=function(...args){cloneCounts.calls++;const value=args[0];
 // Descriptor-only classification does not consume getters or proxy traps.
 if(value&&typeof value==='object'&&!types.isProxy(value)&&['input_id','input_type','source_type'].every(key=>
   typeof Object.getOwnPropertyDescriptor(value,key)?.value==='string')){
  cloneCounts.input_metadata++;cloneCounts[depths.get('createScopedSourceResolver')?'source_constructor_input_metadata':
   depths.get('prepareScopedInputMetadata')?'preparation_input_metadata':'other_input_metadata']++;}
 return originalClone.apply(this,args);};
process.once('exit',()=>{
 fs.writeFileSync(process.env.OWNER_BENCH_DIAGNOSTICS,JSON.stringify({functions,
  input_metadata:metadata?.scopedInputMetadataStats?.()??null,parse:ast.reconciliationParseStats?.()??null,
  timestamp_syntax:provenance.rfc3339SyntaxStats?.()??null,structured_clone:cloneCounts,resources:process.resourceUsage(),captures}));
});
`);
  return hook;
}

function stageTimes(stderr) {
  const pending = new Map(), phases = [];
  for (const line of stderr.split('\n')) {
    const hit = /^(?:workflow:run|binding-status) \[([\d.]+)s\] ([a-z-]+):(start|done|failed)(?: (.*))?$/.exec(line);
    if (!hit) continue;
    const [, seconds, name, event, detail] = hit;
    if (event === 'start') { if (!pending.has(name)) pending.set(name, []); pending.get(name).push(Number(seconds)); }
    else { const started = pending.get(name)?.pop(); if (started !== undefined)
      phases.push({ name, event, elapsed_ms: (Number(seconds) - started) * 1000, detail: detail ?? null }); }
  }
  return phases;
}

async function invoke(context, side, cli, label, diagnostic = false, control = false) {
  const { kits, fixture, out, deadline, timeout, hook } = context;
  const remaining = deadline - performance.now(); assert.ok(remaining >= 1000, 'explicit benchmark budget exhausted');
  const recordDir = path.join(out, label); fs.mkdirSync(recordDir, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(out, 'private-tmp-'));
  const runOut = path.join(out, 'current-output'); fs.rmSync(runOut, { recursive: true, force: true }); fs.rmSync(`${runOut}.md`, { force: true });
  const work = path.join(out, control ? 'request-denied.json' : 'request-ready.json');
  const args = [...(diagnostic ? ['--import', hook] : []), path.join(kits[side], `scripts/${cli}.mjs`),
    '--root', fixture.root, '--docs', DOCS, '--src', 'src', '--policy', '.kit/policy.yaml',
    '--manifest', '.kit/manifest.yaml', '--layout', '.kit/layout.yaml', '--json',
    ...(cli === 'binding-status' ? ['--owner', OWNER] : ['--work', work, '--out', runOut, '--date', '2026-11-19']),
    ...(diagnostic ? ['--progress'] : [])];
  const counts = path.join(recordDir, 'diagnostics.json');
  const started = performance.now(); log(`${label}: started ${diagnostic ? 'separate diagnostic' : 'uninstrumented CLI'}`);
  let stdout = '', stderr = '', timer, heartbeat, result;
  try {
    result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: fixture.root, env: environment({ TMPDIR: temporary, TMP: temporary, TEMP: temporary,
        ...(diagnostic ? { OWNER_BENCH_KIT: kits[side], OWNER_BENCH_DIAGNOSTICS: counts } : {}) }), stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', (bytes) => { stdout += bytes; });
      child.stderr.on('data', (bytes) => { stderr += bytes; if (diagnostic) process.stderr.write(`${label}: ${bytes}`); });
      heartbeat = setInterval(() => log(`${label}: still running (${((performance.now() - started) / 1000).toFixed(1)} s)`), 15000);
      timer = setTimeout(() => { child.kill('SIGTERM'); }, Math.min(timeout, remaining));
      child.once('error', reject); child.once('close', (status, signal) => resolve({ status, signal }));
    });
    const elapsed = performance.now() - started;
    fs.writeFileSync(path.join(recordDir, 'stdout.json'), stdout); fs.writeFileSync(path.join(recordDir, 'stderr.log'), stderr);
    const artifacts = {};
    for (const [name, file] of [['packet', path.join(runOut, 'work-packet.md')], ['status', `${runOut}.md`], ['report', path.join(runOut, 'run-report.md')]]) {
      artifacts[name] = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (artifacts[name] !== null) fs.writeFileSync(path.join(recordDir, `${name}.md`), artifacts[name]);
    }
    const record = { label, side, cli, diagnostic, control, elapsed_ms: elapsed, ...result,
      stdout, stderr, artifacts, temporary_entries: fs.readdirSync(temporary),
      ...(diagnostic && fs.existsSync(counts) ? { diagnostics: { ...JSON.parse(fs.readFileSync(counts, 'utf8')), phases: stageTimes(stderr) } } : {}) };
    writeJson(path.join(recordDir, 'result.json'), record);
    assert.equal(result.signal, null, `CLI terminated: ${result.signal}; budget ${Math.min(timeout, remaining)} ms`);
    assert.equal(result.status, 0, stderr || stdout); if (!diagnostic) assert.equal(stderr, '');
    assert.deepEqual(record.temporary_entries, [], 'CLI must clean its private raw snapshot');
    assert.deepEqual(repositoryState(fixture.root), fixture.state, 'original HEAD/tree/index/bytes/modes/status changed');
    log(`${label}: ${(elapsed / 1000).toFixed(3)} s; repository and private-snapshot cleanup verified`);
    return record;
  } finally { clearTimeout(timer); clearInterval(heartbeat); fs.rmSync(temporary, { recursive: true, force: true }); }
}

function verify(record, fixture, expected) {
  const report = JSON.parse(record.stdout);
  assert.equal(report.snapshot.commit, fixture.commit); assert.equal(report.snapshot.tree, fixture.tree);
  assert.notEqual(report.approval_verified, true);
  if (record.cli === 'binding-status') {
    assert.equal(report.approval_verified, false);
    assert.equal(report.owners.length, 1); assert.equal(report.owners[0].owner, OWNER);
    assert.deepEqual(report.owners[0].known_units, fixture.unit_ids);
    assert.equal(report.owners[0].rows.length, fixture.config.rows, 'actual checked row count');
    assert.equal(report.owners[0].rows.filter((row) => row.kind === 'decision' && row.computed_basis_digest !== null).length, 2, 'actual computed Decision digests');
    assert.equal(report.owners[0].rows.filter((row) => row.kind !== 'decision' && row.computed_basis_digest !== null).length, 0);
  } else {
    assert.equal(report.authority, 'scoped'); assert.equal(report.requests.length, 1);
    assert.equal(report.ready, !record.control);
    assert.equal(report.state, record.control ? 'HALT_AMBIGUITY' : 'HALT_READY_FOR_WORK');
    if (record.control) assert.ok(report.denials.length > 0); else { assert.deepEqual(report.errors, []); assert.deepEqual(report.denials, []); }
    assert.match(record.artifacts.packet, /^---\nkind: scoped-work-packet\n/);
    assert.match(record.artifacts.status, /^---\nkind: scoped-work-run-status\n/);
  }
  const value = { stdout: record.stdout, artifacts: record.artifacts };
  if (expected) assert.deepEqual(value, expected, 'complete CLI stdout and every emitted artifact must be byte-identical; no fields omitted');
  if (record.diagnostic) {
    assert.equal(record.diagnostics.functions.scopedBindingBasis.calls, 2, 'exactly two actual Decision basis computations');
    assert.equal(record.diagnostics.captures.filter((entry) => entry.function === 'scopedBindingBasis').length, 2);
  }
  return value;
}

async function main(args) {
  const config = argumentsFor(args), { kits, out } = config;
  const forbidden = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_CONFIG', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS', 'NODE_V8_COVERAGE', 'NODE_OPTIONS'].filter((name) => process.env[name] !== undefined);
  assert.deepEqual(forbidden, [], 'run without Git redirection or Node instrumentation variables');
  for (const kit of Object.values(kits)) assert.equal(fs.statSync(kits.before).dev, fs.statSync(kit).dev, 'stage runtime copies on the same filesystem');
  fs.mkdirSync(out, { recursive: true }); assert.equal(fs.existsSync(path.join(out, 'results.json')), false, 'use a fresh results directory');
  const fixture = config.fixtureFile ? JSON.parse(fs.readFileSync(config.fixtureFile, 'utf8'))
    : await createFixture(kits.before, path.join(out, 'fixture'), config.fixtureConfig);
  fixture.state ??= repositoryState(fixture.root);
  assert.equal(fixture.state.status, ''); assert.deepEqual(repositoryState(fixture.root), fixture.state, 'shared fixture changed since creation');
  writeJson(path.join(out, 'fixture.json'), fixture);
  if (config.fixtureOnly) { console.log(JSON.stringify(fixture, null, 2)); return; }
  const controlFixture = config.controlFixtureFile ? JSON.parse(fs.readFileSync(config.controlFixtureFile, 'utf8')) : fixture;
  controlFixture.state ??= repositoryState(controlFixture.root);
  assert.equal(controlFixture.state.status, '');
  assert.deepEqual(repositoryState(controlFixture.root), controlFixture.state, 'denied control fixture changed since creation');
  const request = (unit) => ({ version: 1, origin_inputs: [], requests: [{ owner: OWNER, authority: 'scoped', unit,
    targets: [{ path: ENTRY, change: 'M' }] }] });
  writeJson(path.join(out, 'request-ready.json'), request(fixture.unit_ids[0]));
  writeJson(path.join(out, 'request-denied.json'), request(controlFixture.unit_ids.at(-1)));
  const context = { ...config, fixture, hook: diagnosticHook(out), deadline: performance.now() + config.budget };
  const output = { benchmark: 'shared-owner-projection', node: process.version, platform: `${process.platform}/${process.arch}`,
    harness_sha256: hash(fs.readFileSync(new URL(import.meta.url))), fixture_builder_sha256: hash(fs.readFileSync(new URL('./owner-projection-fixture.mjs', import.meta.url))),
    kits, runtime_fingerprints: Object.fromEntries(Object.entries(kits).map(([side, kit]) => [side, runtimeFingerprint(kit)])),
    config: { runs: config.runs, timeout_ms: config.timeout, budget_ms: config.budget }, fixture, control_fixture: controlFixture,
    method: {
      fixture: 'One committed synthetic owner tree is shared by both CLIs and both runtime copies. Resolved historical rows, two stale synthetic declarations and one unselected pending source unit. Not a reproduction or prediction of undisclosed consumer documents/timings.',
      timing: 'Fresh actual CLI processes; runtime order reverses each round; all samples retained, no excluded warm-up. Additional baselines share the identical after samples/diagnostics. No imports/progress/profilers in timed runs. Includes process startup, raw snapshot, evaluation, output artifacts and cleanup. Fixture construction/verification excluded; filesystem caches warmed by setup.',
      diagnostics: 'Separate fresh CLI processes with --progress and an ESM function wrapper. Inclusive function times overlap and include wrapper/recording costs; they are not additive or uninstrumented timings. Stage durations are parsed from the optional progress stream. Resource usage is the diagnostic process high-water RSS/CPU, including the loader, excluding Git child CPU/RSS.',
      equivalence: 'Exact full stdout JSON and packet/status/report bytes; no runtime/path fields normalized because both sides use the identical fixture/request/output paths. Complete captured binding/basis/owner JSON (including reasons and read sets) must also agree. Actual row and digest counts asserted. Ready and denied controls both run; a separately supplied denied-control fixture is recorded explicitly and shared by every runtime. HEAD/tree/index/worktree bytes/modes/status and private snapshot cleanup checked after every CLI.',
    }, cases: {}, denied_control: {} };
  try {
    for (const cli of ['workflow-run', 'binding-status']) {
      const entry = output.cases[cli] = { samples: [], diagnostics: {} }; let expected, captured;
      const sides = Object.keys(kits);
      for (let run = 1; run <= config.runs; run++) for (const side of run % 2 ? sides : [...sides].reverse()) {
        const result = await invoke(context, side, cli, `${cli}-${side}-run-${run}`);
        expected = verify(result, fixture, expected); entry.samples.push({ side, run, elapsed_ms: result.elapsed_ms });
      }
      entry.output_sha256 = hash(expected.stdout);
      entry.artifact_sha256 = Object.fromEntries(Object.entries(expected.artifacts).map(([name, value]) => [name, value === null ? null : hash(value)]));
      const report = JSON.parse(expected.stdout);
      entry.authority_read_set_sha256 = report.snapshot.authority_read_set ? hash(JSON.stringify(report.snapshot.authority_read_set)) : null;
      entry.verdict = cli === 'workflow-run' ? { state: report.state, ready: report.ready,
        reasons_sha256: hash(JSON.stringify({ errors: report.errors, denials: report.denials,
          requests: report.requests.map((request) => ({ owner: request.owner, unit: request.unit,
            prerequisite_denials: request.prerequisite_denials, path_authorizations: request.path_authorizations })) })) }
        : { rows: report.owners[0].rows.length, computed_decision_digests: report.owners[0].rows.filter((row) => row.kind === 'decision' && row.computed_basis_digest !== null).length };
      entry.medians_ms = Object.fromEntries(sides.map((side) => [side, median(entry.samples.filter((s) => s.side === side).map((s) => s.elapsed_ms))]));
      entry.speedup = entry.medians_ms.before / entry.medians_ms.after;
      entry.comparisons = Object.fromEntries(sides.filter((side) => side !== 'after').map((side) => [side,
        { speedup: entry.medians_ms[side] / entry.medians_ms.after, difference_ms: entry.medians_ms.after - entry.medians_ms[side] }]));
      for (const side of sides) {
        const result = await invoke(context, side, cli, `${cli}-${side}-diagnostic`, true); verify(result, fixture, expected);
        if (captured) assert.deepEqual(result.diagnostics.captures, captured, 'entire captured binding/basis/owner results including read sets must match');
        captured ??= result.diagnostics.captures;
        const { captures, ...metrics } = result.diagnostics;
        const bases = captures.filter((entry) => entry.function === 'scopedBindingBasis').map((entry) => entry.value);
        const readSets = [];
        const collect = (value, at = '') => { if (!value || typeof value !== 'object') return;
          for (const [key, child] of Object.entries(value)) { const name = `${at}/${key}`;
            if (key === 'read_set' || key.endsWith('_read_set')) readSets.push({ path: name, value: child });
            else collect(child, name); } };
        collect(captures);
        entry.diagnostics[side] = { ...metrics, captures_sha256: hash(JSON.stringify(captures)),
          basis_json_sha256: hash(JSON.stringify(bases.map((basis) => basis.basis))),
          basis_and_component_digests: bases.map((basis) => ({ basis_digest: basis.basis_digest, component_digests: basis.component_digests })),
          read_sets_sha256: hash(JSON.stringify(readSets)) };
      }
      writeJson(path.join(out, 'results.partial.json'), output);
    }
    output.cross_cli_basis_equivalent = {};
    for (const side of Object.keys(kits)) {
      const run = output.cases['workflow-run'].diagnostics[side], status = output.cases['binding-status'].diagnostics[side];
      assert.equal(run.basis_json_sha256, status.basis_json_sha256, 'both CLIs must compute identical complete binding basis JSON on the shared tree');
      assert.deepEqual(run.basis_and_component_digests, status.basis_and_component_digests, 'both CLIs must compute identical basis and component digests');
      output.cross_cli_basis_equivalent[side] = true;
    }
    let denied;
    for (const side of Object.keys(kits)) {
      const result = await invoke({ ...context, fixture: controlFixture }, side, 'workflow-run', `workflow-run-${side}-denied-control`, false, true);
      denied = verify(result, controlFixture, denied); output.denied_control[side] = { verified: true, output_sha256: hash(result.stdout),
        artifact_sha256: Object.fromEntries(Object.entries(result.artifacts).map(([name, value]) => [name, value === null ? null : hash(value)])) };
    }
    for (const [side, kit] of Object.entries(kits)) assert.deepEqual(runtimeFingerprint(kit), output.runtime_fingerprints[side], `${side} runtime changed during benchmark`);
    output.verified = true;
  } catch (error) { output.verified = false; output.failure = error.message; process.exitCode = 1; }
  finally { writeJson(path.join(out, 'results.json'), output); console.log(JSON.stringify(output, null, 2)); }
}

await main(process.argv.slice(2));
