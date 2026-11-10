// Reproduce #300's GFM table parsing cost with the dependencies installed in two kits.
// Usage: node kit-dev/benchmarks/gfm-tables.mjs <before-kit-root> <after-kit-root> [rows=100,200,400,800] [runs=3]
// Install each kit's own lockfile first. Each sample starts a fresh Node process and
// loads only that kit's parser. This synthetic table benchmark is not a CLI benchmark.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const columns = 10;
const script = fileURLToPath(import.meta.url);
const usage = 'usage: node gfm-tables.mjs <before-kit-root> <after-kit-root> [rows=100,200,400,800] [runs=3]; rows and runs must be positive integers';

function positiveInteger(value) {
  const number = Number(value);
  assert.ok(Number.isSafeInteger(number) && number > 0, usage);
  return number;
}

function document(rows) {
  const header = `| ${Array.from({ length: columns }, (_, column) => `Column ${column}`).join(' | ')} |\n`;
  const delimiter = `| ${Array(columns).fill('---').join(' | ')} |\n`;
  const body = Array.from({ length: rows }, (_, row) =>
    `| ${Array.from({ length: columns }, (_, column) =>
      `artifact:COUPON-${String(row).padStart(3, '0')}-mapping#component/M-${String(column).padStart(3, '0')} — source evidence and explanation`
    ).join(' | ')} |`).join('\n');
  return `# Perf benchmark\n\n## Items\n\n${header}${delimiter}${body}\n`;
}

function packageDetails(name, entry) {
  let directory = path.dirname(entry);
  while (true) {
    const manifest = path.join(directory, 'package.json');
    if (fs.existsSync(manifest)) {
      const metadata = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (metadata.name === name && typeof metadata.version === 'string') {
        return { version: metadata.version, entry };
      }
    }
    const parent = path.dirname(directory);
    assert.notEqual(parent, directory, `cannot find ${name}'s package version from ${entry}`);
    directory = parent;
  }
}

async function sample(kitRoot, rows) {
  assert.ok(fs.existsSync(path.join(kitRoot, 'package.json')), `missing kit package.json: ${kitRoot}`);
  const requireFromKit = createRequire(path.join(kitRoot, 'package.json'));
  const names = ['mdast-util-from-markdown', 'mdast-util-gfm', 'micromark-extension-gfm'];
  const entries = names.map((name) => requireFromKit.resolve(name));
  const packages = Object.fromEntries(names.map((name, index) => [name, packageDetails(name, entries[index])]));
  // Resolve the table package from GFM itself, including a nested dependency if present.
  const tableName = 'micromark-extension-gfm-table';
  const tableEntry = createRequire(entries[2]).resolve(tableName);
  packages[tableName] = packageDetails(tableName, tableEntry);
  const [{ fromMarkdown }, { gfmFromMarkdown }, { gfm }] = await Promise.all(
    entries.map((entry) => import(pathToFileURL(entry).href))
  );
  const input = document(rows);
  const options = { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] };
  const start = performance.now();
  const tree = fromMarkdown(input, options);
  const parseMs = performance.now() - start;
  // Capture the process high-water mark before validation and JSON serialization.
  // It includes startup, imports and fixture setup, not only parser allocations.
  const maxRssKiB = process.resourceUsage().maxRSS;
  const tables = tree.children.filter((node) => node.type === 'table');
  assert.equal(tables.length, 1, 'the fixture must parse as exactly one table');
  assert.equal(tables[0].children.length, rows + 1, 'include the header and every body row');
  let cells = 0;
  for (const row of tables[0].children) {
    assert.equal(row.type, 'tableRow');
    assert.equal(row.children.length, columns, 'every row must retain all ten cells');
    for (const cell of row.children) assert.equal(cell.type, 'tableCell');
    cells += row.children.length;
  }
  assert.equal(cells, (rows + 1) * columns);
  assert.equal(tree.position?.start.offset, 0, 'the AST must retain source positions');
  assert.equal(tree.position?.end.offset, input.length, 'the AST must cover the complete input');
  const digest = createHash('sha256').update(JSON.stringify(tree)).digest('hex');
  return { packages, rows, columns, cells, input_chars: input.length, input_bytes: Buffer.byteLength(input),
    parse_ms: parseMs, max_rss_kib: maxRssKiB, ast_sha256: digest };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function main(args) {
  if (args[0] === '--worker') {
    assert.equal(args.length, 3, usage);
    console.log(JSON.stringify(await sample(path.resolve(args[1]), positiveInteger(args[2]))));
    return;
  }
  assert.ok(args.length >= 2 && args.length <= 4, usage);
  const [beforeArg, afterArg, rowArg = '100,200,400,800', runArg = '3'] = args;
  const rows = rowArg.split(',').map(positiveInteger);
  const runs = positiveInteger(runArg);
  const kits = { before: { root: path.resolve(beforeArg) }, after: { root: path.resolve(afterArg) } };
  const cases = [];
  for (const rowCount of rows) {
    const samples = [];
    let expected;
    for (let run = 0; run < runs; run++) {
      const order = run % 2 ? ['after', 'before'] : ['before', 'after'];
      for (const side of order) {
        const raw = JSON.parse(execFileSync(process.execPath,
          [script, '--worker', kits[side].root, String(rowCount)],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
        const { packages, parse_ms, max_rss_kib, ...verified } = raw;
        if (!kits[side].packages) kits[side].packages = packages;
        else assert.deepEqual(packages, kits[side].packages, `${side} dependencies changed during the benchmark`);
        if (!expected) expected = verified;
        else assert.deepEqual(verified, expected, 'input, row/cell counts and full AST including positions must match across every sample');
        samples.push({ side, run: run + 1, parse_ms, max_rss_kib, ast_sha256: raw.ast_sha256 });
      }
    }
    const medians = Object.fromEntries(['before', 'after'].map((side) => {
      const selected = samples.filter((entry) => entry.side === side);
      return [side, { parse_ms: median(selected.map((entry) => entry.parse_ms)),
        max_rss_kib: median(selected.map((entry) => entry.max_rss_kib)) }];
    }));
    cases.push({ ...expected, medians,
      parse_speedup: medians.before.parse_ms / medians.after.parse_ms, samples });
  }
  console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch,
    runs, columns, measurement: {
      parse_ms: 'First fromMarkdown call in a fresh process; excludes imports, input generation, extension setup, verification and AST hashing.',
      max_rss_kib: 'Process peak RSS observed immediately after parsing; includes startup/imports/input setup and excludes later verification/hash work. Not retained AST memory.',
      order: 'Before/after order alternates between runs; no warmup or AST cache.',
      scope: 'Synthetic GFM table parsing, not end-to-end consumer CLI performance.',
    }, kits, verified_full_ast_and_positions: true, cases }, null, 2));
}

await main(process.argv.slice(2));
