// Usage: node kit-dev/benchmarks/table-selection.mjs <before-kit-root> <after-kit-root> [runs=3]
// Synthetic exported-helper costs only, not binding-status or consumer CLI time.
// Each fresh worker warms the AST/helper before timing only function calls;
// imports, fixture construction, serialization and equality checks are excluded.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const script = fileURLToPath(import.meta.url);
const usage = 'usage: node table-selection.mjs <before-kit-root> <after-kit-root> [runs=3]';
const summaryColumns = ['Input ID', 'Source', 'Classification', 'Reconcile Status', 'Result',
  'Touched Artifacts', 'Created Items', 'Supersedes'];
const itemColumns = ['Input ID', 'Item', 'Basis', 'Classification', 'Effect', 'Target',
  'Evidence', 'Source Ref', 'Source Unit', 'Captured At'];
const hash = (text) => createHash('sha256').update(text).digest('hex');
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const inputId = (index) => `IN-20261112-review-${String(index).padStart(4, '0')}`;
const table = (columns, rows) => [`| ${columns.join(' | ')} |`,
  `| ${columns.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');

function fixture(summaryRows, itemRows, duplicate = false) {
  const summary = table(summaryColumns, Array.from({ length: summaryRows }, (_, index) =>
    [inputId(index), 'meeting', 'simple-update', 'reconciled', 'accepted',
      `artifact:BENCH-${index}`, '-', '-']));
  const items = table(itemColumns, Array.from({ length: itemRows }, (_, index) => {
    const source = index % summaryRows;
    return [inputId(source), String(1 + Math.floor(index / summaryRows)).padStart(2, '0'),
      'compatible-fact', 'simple-update', 'update', `artifact:BENCH-${source}#state-matrix`,
      `input:${inputId(source)}#extracted-facts/01`, 'inherit', 'statement', 'inherit'];
  }));
  return { text: `# Reconciliation Register\n\n${summary}\n\n## Reconciliation Items\n\n${items}\n` +
      (duplicate ? `\n## Duplicate Summary\n\n${summary}\n` : ''),
    columns: [...summaryColumns], summary_rows: summaryRows, item_rows: itemRows,
    matching_tables: duplicate ? 2 : 1 };
}

const cases = [
  { name: 'first-raw-summary', helper: 'parseTable', iterations: 32, create: () => fixture(500, 2000) },
  { name: 'strict-summary-selection', helper: 'summary', iterations: 32, create: () => fixture(500, 2000) },
  { name: 'duplicate-summary-selection', helper: 'summary', iterations: 32, create: () => fixture(250, 1000, true) },
];

async function worker(kit, version, name) {
  assert.ok(['before', 'after'].includes(version), 'worker version must be before or after');
  const entry = cases.find((candidate) => candidate.name === name);
  assert.ok(entry, `unknown benchmark case ${name}`);
  const lib = (module) => import(pathToFileURL(path.join(kit, `scripts/lib/${module}.mjs`)).href);
  const [spec, markdown] = await Promise.all([lib('spec'), lib('reconciliation-markdown-ast')]);
  const input = entry.create(), original = JSON.stringify(input);
  const run = entry.helper === 'parseTable' ? () => spec.parseTable(input.text)
    : version === 'before'
      ? () => markdown.parseStrictTables(input.text)
        .filter((candidate) => markdown.describeHeaderMismatch(candidate, input.columns) === null)
      : () => markdown.parseStrictTablesWithHeaders(input.text, input.columns);
  const output = run(), serialized = JSON.stringify(output);
  const selected = entry.helper === 'parseTable' ? [output] : output;
  assert.equal(selected.length, entry.helper === 'parseTable' ? 1 : input.matching_tables);
  for (const selectedTable of selected) {
    assert.deepEqual(selectedTable.headers, input.columns);
    assert.equal(selectedTable.rowCount, input.summary_rows);
  }
  for (let index = 0; index < 8; index++) run();
  let last;
  const started = performance.now();
  for (let index = 0; index < entry.iterations; index++) last = run();
  const elapsed = performance.now() - started;
  assert.equal(JSON.stringify(input), original, `${name}: fixture mutated`);
  assert.equal(JSON.stringify(last), serialized, `${name}: timed result changed`);
  assert.equal(JSON.stringify(run()), serialized, `${name}: later call changed result`);
  return { name, helper: entry.helper, iterations: entry.iterations,
    summary_rows: input.summary_rows, item_rows: input.item_rows, selected_tables: selected.length,
    input_chars: input.text.length, input_sha256: hash(input.text), output_sha256: hash(serialized),
    elapsed_ms: elapsed, output: serialized };
}

function sample(kit, version, name) {
  const result = spawnSync(process.execPath, [script, '--worker', kit, version, name], {
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
  const kits = { before: path.resolve(args[0]), after: path.resolve(args[1]) }, results = [];
  for (const entry of cases) {
    const samples = { before: [], after: [] };
    let expected;
    for (let run = 0; run < runs; run++) for (const version of run % 2 ? ['after', 'before'] : ['before', 'after']) {
      const { elapsed_ms, ...result } = sample(kits[version], version, entry.name);
      if (expected === undefined) expected = result;
      else assert.deepEqual(result, expected, `${entry.name}: full output differs between versions or samples`);
      samples[version].push(elapsed_ms);
    }
    const { output, ...details } = expected;
    const beforeMs = median(samples.before), afterMs = median(samples.after);
    results.push({ ...details, full_output_equal: true, samples_ms: samples,
      median_ms: { before: beforeMs, after: afterMs }, speedup: beforeMs / afterMs,
      reduction_percent: 100 * (1 - afterMs / beforeMs) });
  }
  return { node: process.version, platform: `${process.platform}/${process.arch}`, runs, kits,
    timing: 'helper calls only after 8 warm-up calls in each fresh process; AST parsing is warmed and excluded',
    scope: 'synthetic table selection only; not a CLI or memory benchmark', cases: results };
}

const args = process.argv.slice(2);
const result = args[0] === '--worker' ? await worker(args[1], args[2], args[3]) : main(args);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
