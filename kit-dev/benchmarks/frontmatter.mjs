// Usage: node kit-dev/benchmarks/frontmatter.mjs <before-kit-root> <after-kit-root> [runs=3]
// Fresh workers measure only splitFrontmatter calls after warming the entire
// working set. Imports, fixtures, serialization and correctness checks are not
// timed. This is a helper benchmark, not whole-CLI or memory evidence.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deserialize, serialize } from 'node:v8';

const script = fileURLToPath(import.meta.url);
const usage = 'usage: node frontmatter.mjs <before-kit-root> <after-kit-root> [runs=3]';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const document = (yaml, body = '## Evidence\n\n- Preserve the selected content.\n') => `---\n${yaml}\n---\n${body}`;
const input = (index) => document(`input_id: IN-20261112-meeting-${String(index).padStart(4, '0')}\ninput_type: meeting\nsource_type: meeting\nsource_ref: meeting:benchmark-${index}\ncaptured_at: "2026-11-12T00:00:00Z"\nstatus: captured\naffected_domains: [coupons]\naffected_screens: [COUPON-001]`);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function owner() {
  const units = Array.from({ length: 8 }, (_, index) => ({ id: `unit-${index}`, kind: 'behavior',
    contracts: ['artifact:COUPON-001-screen-spec#state-matrix'], sources: [] }));
  const bindings = Array.from({ length: 24 }, (_, index) => ({ owner: 'screen:COUPON-001',
    decision_id: `D-PERF-${index}`, known_units: units.map(({ id }) => id), blocks: [],
    basis_digest: `sha256:${'0'.repeat(64)}`, approval_ref: 'docs/approvals/performance.md#synthetic' }));
  return document(`artifact_id: COUPON-001-screen-spec\nartifact_type: screen-spec\ndomain: coupons\nscreen_id: COUPON-001\nwork_execution: ${JSON.stringify({ version: 1, units })}\ndecision_work_scopes: ${JSON.stringify({ version: 1, bindings })}`);
}

const cases = [
  { name: 'ordinary-mapping', iterations: 1024, create: () => [input(1)] },
  { name: 'large-owner', iterations: 128, create: () => [owner()] },
  { name: 'varied-input-inventory', iterations: 2048, create: () => Array.from({ length: 256 }, (_, index) => input(index)) },
  { name: 'yaml-alias-tag-fallback', iterations: 1024,
    create: () => [document('id: !!str 123\nbase: &shared\n  state: open\ncopy: *shared')] },
];

function contracts(split) {
  const source = document('id: original\nnested: {state: open}');
  const first = split(source), repeat = split(source);
  assert.notEqual(first.data, repeat.data); assert.notEqual(first.data.nested, repeat.data.nested);
  first.data.nested.state = 'mutated';
  assert.equal(split(source).data.nested.state, 'open');
  const changedBody = split(document('id: original\nnested: {state: open}', '## Changed body\n'));
  assert.equal(changedBody.body, '## Changed body\n');
  const changedMetadata = split(document('id: modified\nnested: {state: open}'));
  assert.equal(changedMetadata.data.id, 'modified');
  const alias = split(document('base: &shared {value: 1}\ncopy: *shared'));
  assert.equal(alias.data.base, alias.data.copy);
  alias.data.base.value = 2;
  assert.equal(split(document('base: &shared {value: 1}\ncopy: *shared')).data.base.value, 1);
  return [repeat, changedBody, changedMetadata, split(document('broken: [one')),
    split('\ufeff# No frontmatter\r\n'), split('---\r\nid: windows\r\n---\r\nbody\r\n')];
}

async function worker(kit, name) {
  const { splitFrontmatter } = await import(pathToFileURL(path.join(kit, 'scripts/lib/util.mjs')).href);
  if (name === 'contracts') return { output: serialize(contracts(splitFrontmatter)).toString('base64') };
  const entry = cases.find((candidate) => candidate.name === name);
  assert.ok(entry, `unknown case ${name}`);
  const inputs = entry.create(), original = JSON.stringify(inputs);
  const expected = inputs.map((text) => splitFrontmatter(text));
  for (let warmup = 0; warmup < 8; warmup++) for (const text of inputs) splitFrontmatter(text);
  const last = Array(inputs.length);
  const started = performance.now();
  for (let index = 0; index < entry.iterations; index++) {
    const slot = index % inputs.length;
    last[slot] = splitFrontmatter(inputs[slot]);
  }
  const elapsed = performance.now() - started;
  assert.deepEqual(last, expected, `${name}: timed result changed`);
  assert.equal(JSON.stringify(inputs), original, `${name}: input changed`);
  assert.deepEqual(inputs.map((text) => splitFrontmatter(text)), expected, `${name}: later result changed`);
  const output = serialize(expected).toString('base64');
  return { name, iterations: entry.iterations, distinct_documents: inputs.length,
    input_chars: inputs.reduce((total, text) => total + text.length, 0), input_sha256: sha256(original),
    output_sha256: sha256(JSON.stringify(expected)), elapsed_ms: elapsed, output };
}

function sample(kit, name) {
  const result = spawnSync(process.execPath, [script, '--worker', kit, name], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout); assert.equal(result.signal, null);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

function main(args) {
  assert.ok(args.length >= 2 && args.length <= 3, usage);
  const runs = Number(args[2] ?? 3);
  assert.ok(Number.isSafeInteger(runs) && runs > 0, usage);
  for (const name of ['NODE_OPTIONS', 'NODE_V8_COVERAGE']) assert.equal(process.env[name], undefined, `run without ${name}`);
  const kits = { before: path.resolve(args[0]), after: path.resolve(args[1]) }, results = [];
  const unpack = (output) => deserialize(Buffer.from(output, 'base64'));
  assert.deepEqual(unpack(sample(kits.after, 'contracts').output), unpack(sample(kits.before, 'contracts').output),
    'frontmatter contract results differ');
  for (const entry of cases) {
    const samples = { before: [], after: [] };
    let expected;
    for (let run = 0; run < runs; run++) for (const side of run % 2 ? ['after', 'before'] : ['before', 'after']) {
      const { elapsed_ms, output, ...result } = sample(kits[side], entry.name);
      const full = { ...result, output: unpack(output) };
      if (expected === undefined) expected = full;
      else assert.deepEqual(full, expected, `${entry.name}: full result differs between versions or samples`);
      samples[side].push(elapsed_ms);
    }
    const { output, ...details } = expected, before = median(samples.before), after = median(samples.after);
    results.push({ ...details, full_output_equal: true, samples_ms: samples,
      median_ms: { before, after }, reduction_percent: 100 * (1 - after / before) });
  }
  return { node: process.version, platform: `${process.platform}/${process.arch}`, runs, kits,
    timing: 'splitFrontmatter calls and loop only; 8 complete working-set warm-ups in each fresh worker; imports, fixture creation, serialization and checks excluded',
    scope: 'warm synthetic helper cost; fallback reported separately; not CLI, cold-cache or memory evidence', cases: results };
}

const args = process.argv.slice(2);
process.stdout.write(`${JSON.stringify(args[0] === '--worker' ? await worker(args[1], args[2]) : main(args), null, 2)}\n`);
