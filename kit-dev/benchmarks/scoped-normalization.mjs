// Usage: node kit-dev/benchmarks/scoped-normalization.mjs <before-kit-root> <after-kit-root> [runs=3]
// Synthetic exported-helper costs, not whole binding-status or consumer timings.
// Each sample gets a fresh process, warms the selected helper, then times only
// its calls. Imports, fixture construction and output/error checks are excluded.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const script = fileURLToPath(import.meta.url);
const usage = 'usage: node scoped-normalization.mjs <before-kit-root> <after-kit-root> [runs=3]';
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function records(count, unicode = false) {
  return Array.from({ length: count }, (_, index) => ({
    ref: `artifact:SPEC-${index}#state-matrix`, owner: 'screen:BENCHMARK-001',
    metadata: { artifact_type: 'screen-spec', title: unicode ? `한글 文 😀 ${index}` : `Document ${index}`,
      ...(unicode ? { '\ue000': 'BMP key', '\u{1f600}': 'supplementary key' } : {}), '2': 'two', '10': 'ten' },
    selection: { sections: ['state-matrix', 'interaction-matrix'], cells: ['ID', `R-${index}`, 'open'] },
    evidence: [{ source: 'input:IN-20261111-meeting-001#facts/01',
      text: `${unicode ? '본문 😀' : 'Selected evidence'} ${index}: preserve authored order. `.repeat(5) }],
    enabled: true, optional: null,
  })).reverse();
}

const cases = [
  { name: 'set-small', helper: 'scopeSet', iterations: 256, create: () => records(8) },
  { name: 'set-large', helper: 'scopeSet', iterations: 8, create: () => records(256) },
  { name: 'set-unicode', helper: 'scopeSet', iterations: 32, create: () => records(64, true) },
  { name: 'json-graph', helper: 'scopeJson', iterations: 16, create: () => ({ nodes: records(128), edges: [['B', 'A'], ['A', 'C']] }) },
  { name: 'lf-ascii', helper: 'scopeLf', iterations: 128, create: () => ' body text\r\nnext line\rfinal line  \n'.repeat(2048) },
  { name: 'lf-unicode', helper: 'scopeLf', iterations: 128, create: () => ' 한글 文 😀\r\n다음 줄\r마지막 줄  \n'.repeat(2048) },
];

function contracts(api) {
  const outcomes = [];
  const check = (name, run) => {
    try { outcomes.push({ name, value: run() }); }
    catch (error) { outcomes.push({ name, error: { name: error.name, message: error.message } }); }
  };
  check('UTF-8 key ordering', () => api.scopeJson({ '2': 2, '10': 10, '\ue000': 'BMP', '\u{1f600}': 'supplementary' }));
  check('ordered nested arrays', () => api.scopeSet([{ id: 2, cells: ['B', 'A'] }, { id: 1, cells: ['A', 'B'] }]));
  check('duplicate member', () => api.scopeSet([{ b: 2, a: 1 }, { a: 1, b: 2 }], 'benchmark set'));
  check('validation before duplicate', () => api.scopeSet([1, 1, NaN], 'benchmark set'));
  check('lone high surrogate', () => api.scopeJson('before\ud800after'));
  check('lone low surrogate key', () => api.scopeJson({ '\udfff': 1 }));
  check('sparse array', () => api.scopeSet(Array(2)));
  check('containing-array cycle', () => { const values = []; values.push({ parent: values }); return api.scopeSet(values); });
  check('accessor is never called', () => {
    let calls = 0;
    const getter = Object.defineProperty({}, 'value', { enumerable: true, get() { calls += 1; return 1; } });
    try { return api.scopeSet([getter]); }
    finally { assert.equal(calls, 0); }
  });
  check('detached aliases', () => {
    const shared = { value: 1 }, input = [{ id: 1, shared }, { id: 2, shared }];
    const output = api.scopeSet(input); output[0].shared.value = 2;
    return { input: shared.value, other: output[1].shared.value, aliases: output[0].shared === output[1].shared };
  });
  check('proxy preserves second-pass error', () => {
    let reads = 0;
    const value = new Proxy({ value: 1 }, { getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (key === 'value') descriptor.value = ++reads === 1 ? 1 : NaN;
      return descriptor;
    } });
    return api.scopeSet([value]);
  });
  check('proxy array reads', () => api.scopeSet(new Proxy([1], {
    get(target, key, receiver) { return key === '0' ? 2 : Reflect.get(target, key, receiver); },
  })));
  return outcomes;
}

async function worker(kit, name) {
  const api = await import(pathToFileURL(path.join(kit, 'scripts/lib/scoped-work-normalize.mjs')).href);
  if (name === 'contracts') return { node: process.version, outcomes: contracts(api) };
  const entry = cases.find((candidate) => candidate.name === name);
  assert.ok(entry, `unknown benchmark case ${name}`);
  const input = entry.create(), original = JSON.stringify(input);
  const run = () => api[entry.helper](input);
  const output = run(), outputSha256 = hash(output);
  for (let index = 0; index < 8; index++) run();
  let checksum = 0;
  const started = performance.now();
  for (let index = 0; index < entry.iterations; index++) checksum += run().length;
  const elapsed = performance.now() - started;
  assert.equal(JSON.stringify(input), original, `${name}: source data mutated`);
  assert.equal(hash(run()), outputSha256, `${name}: later call changed output`);
  return { name, helper: entry.helper, iterations: entry.iterations, elapsed_ms: elapsed, checksum, output_sha256: outputSha256 };
}

function sample(kit, name) {
  const result = spawnSync(process.execPath, [script, '--worker', kit, name], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

function main(args) {
  assert.ok(args.length >= 2 && args.length <= 3, usage);
  const runs = Number(args[2] ?? 3);
  assert.ok(Number.isSafeInteger(runs) && runs > 0, usage);
  assert.equal(process.env.NODE_OPTIONS, undefined, 'run without NODE_OPTIONS instrumentation');
  assert.equal(process.env.NODE_V8_COVERAGE, undefined, 'run without NODE_V8_COVERAGE instrumentation');
  const kits = { before: path.resolve(args[0]), after: path.resolve(args[1]) };
  const before = sample(kits.before, 'contracts'), after = sample(kits.after, 'contracts');
  assert.deepEqual(after, before, 'exported helper outputs/errors changed');
  const results = [];
  for (const entry of cases) {
    const samples = { before: [], after: [] };
    let expected;
    for (let run = 0; run < runs; run++) for (const version of run % 2 ? ['after', 'before'] : ['before', 'after']) {
      const result = sample(kits[version], entry.name);
      const { elapsed_ms, ...output } = result;
      if (expected === undefined) expected = output;
      else assert.deepEqual(output, expected, `${entry.name}: output differs between versions or samples`);
      samples[version].push(elapsed_ms);
    }
    const beforeMs = median(samples.before), afterMs = median(samples.after);
    results.push({ ...expected, samples_ms: samples, median_ms: { before: beforeMs, after: afterMs },
      speedup: beforeMs / afterMs, reduction_percent: 100 * (1 - afterMs / beforeMs) });
  }
  return { node: process.version, platform: `${process.platform}/${process.arch}`, runs, kits,
    contract_cases: before.outcomes.length, timing: 'helper calls only, after 8 warm-up calls in each fresh process', cases: results };
}

const args = process.argv.slice(2);
const result = args[0] === '--worker' ? await worker(args[1], args[2]) : main(args);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
