// Usage: node kit-dev/benchmarks/worktree-reads.mjs <before-kit-root> <after-kit-root> [runs=3] [cases=small,large]
// Each timed sample starts a fresh process and calls captureCurrentWorktree once.
// Git/fixture setup is outside elapsed time. Separate, untimed workers instrument
// readCurrentBytes allocations and actual reads; timing workers have no wrappers.
// These synthetic snapshot workloads do not measure a complete consumer CLI.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const script = fileURLToPath(import.meta.url);
const usage = 'usage: node worktree-reads.mjs <before-kit-root> <after-kit-root> [runs=3] [cases=small,large]';
const workloads = {
  small: { files: 2000, groups: 40, sizes: [256] },
  large: { files: 4, groups: 2, sizes: [16 * 1024 * 1024, 32 * 1024 * 1024] },
};
const allocationSizes = [0, 420, 64 * 1024, 16 * 1024 * 1024];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function positiveInteger(value) {
  const number = Number(value);
  assert.ok(Number.isSafeInteger(number) && number > 0, usage);
  return number;
}

function guardGitEnvironment() {
  // A temporary cwd cannot neutralize environment redirects to another repo.
  const redirected = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG',
    'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS'].filter((name) => process.env[name] !== undefined);
  assert.equal(redirected.length, 0, `run without Git redirection variables: ${redirected.join(', ')}`);
}

function workerEnvironment() {
  return { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: os.devNull,
    GIT_CONFIG_GLOBAL: os.devNull, GIT_ATTR_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0' };
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'], env: workerEnvironment() }).trim();
}

// Reuse a small block even for large files so fixture generation does not itself
// retain a 16/32 MiB Buffer. Include NUL/high bytes and a distinct per-file prefix.
function writePayload(file, size, seed) {
  const block = Buffer.alloc(Math.min(size, 64 * 1024));
  for (let offset = 0; offset < block.length; offset++) block[offset] = (offset + seed * 17) & 255;
  if (block.length >= 5) { block.writeUInt32LE(seed, 0); block[4] = 0; }
  const blob = createHash('sha1').update(`blob ${size}\0`);
  const content = createHash('sha256');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'wx');
  try {
    for (let written = 0; written < size;) {
      const slice = block.subarray(0, Math.min(block.length, size - written));
      let offset = 0;
      while (offset < slice.length) {
        const count = fs.writeSync(fd, slice, offset, slice.length - offset);
        assert.ok(count > 0, 'fixture write must make progress');
        offset += count;
      }
      blob.update(slice);
      content.update(slice);
      written += slice.length;
    }
  } finally {
    fs.closeSync(fd);
  }
  return { size, oid: blob.digest('hex'), sha256: content.digest('hex') };
}

function createFixture(root, scenario) {
  const workload = workloads[scenario];
  assert.ok(workload, usage);
  git(root, ['init', '--quiet', '--object-format=sha1']);
  for (const [key, value] of [['gc.auto', '0'], ['maintenance.auto', 'false'],
    ['core.autocrlf', 'false'], ['core.filemode', 'true']]) git(root, ['config', key, value]);
  const expected = [];
  const corpus = createHash('sha256');
  let totalBytes = 0;
  for (let index = 0; index < workload.files; index++) {
    const name = `data/group-${String(index % workload.groups).padStart(3, '0')}/file-${String(index).padStart(6, '0')}.bin`;
    const file = path.join(root, name);
    const size = workload.sizes[index % workload.sizes.length];
    const payload = writePayload(file, size, index);
    fs.chmodSync(file, index % 8 === 0 ? 0o755 : 0o644);
    const mode = fs.statSync(file).mode & 0o111 ? '100755' : '100644';
    expected.push([name, { mode, oid: payload.oid }]);
    corpus.update(JSON.stringify({ name, mode, size, sha256: payload.sha256 })).update('\n');
    totalBytes += size;
  }
  // Unchanged tracked files exercise actual raw reads/hashing while keeping
  // unrelated per-file hash-object writes outside this comparison.
  git(root, ['add', '--force', '--all']);
  const sourceTree = git(root, ['write-tree']);
  expected.sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  return { expected, sourceTree, indexBytes: fs.readFileSync(path.join(root, '.git', 'index')),
    fixture: { scenario, files: workload.files, groups: workload.groups,
      file_sizes_bytes: workload.sizes, total_bytes: totalBytes, corpus_sha256: corpus.digest('hex') } };
}

function memoryAfterGc() {
  global.gc();
  global.gc();
  const memory = process.memoryUsage();
  return { heap_used_bytes: memory.heapUsed, rss_bytes: memory.rss,
    external_bytes: memory.external, array_buffer_bytes: memory.arrayBuffers };
}

async function captureSample(kitRoot, scenario) {
  assert.equal(typeof global.gc, 'function', 'capture worker requires --expose-gc');
  const { captureCurrentWorktree } = await import(pathToFileURL(path.join(kitRoot, 'scripts/lib/current-work-integrity.mjs')).href);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwkit-worktree-reads-'));
  try {
    const { expected, sourceTree, indexBytes, fixture } = createFixture(root, scenario);
    const beforeMemory = memoryAfterGc();
    const start = performance.now();
    const snapshot = captureCurrentWorktree(root, sourceTree);
    const elapsed = performance.now() - start;
    const maxRssKiB = process.resourceUsage().maxRSS;
    const afterMemory = memoryAfterGc();
    // All verification follows both timing and memory snapshots. Exact Git blob
    // identities cover every raw file byte; modes and paths are checked too.
    const entries = [...snapshot.entries].sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    assert.deepEqual(entries, expected, 'every path, raw blob identity and Git mode must match');
    assert.equal(snapshot.tree, sourceTree, 'an unchanged worktree must reproduce the exact tree');
    assert.equal(snapshot.observed_index_tree, sourceTree, 'the observed index tree must remain exact');
    assert.deepEqual(fs.readFileSync(path.join(root, '.git', 'index')), indexBytes, 'capture must not rewrite the original index');
    return { ...fixture, source_tree: sourceTree, destination_tree: snapshot.tree,
      observed_index_tree: snapshot.observed_index_tree, entries_sha256: sha256(JSON.stringify(entries)),
      index_unchanged: true, elapsed_ms: elapsed, max_rss_kib: maxRssKiB,
      before_memory: beforeMemory, after_gc: afterMemory };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function countReaderAllocations(read) {
  const methods = ['alloc', 'allocUnsafe', 'allocUnsafeSlow', 'concat'];
  const original = Object.fromEntries(methods.map((name) => [name, Buffer[name]]));
  const originalRead = fs.readSync;
  const buffers = Object.fromEntries(methods.map((name) => [name, { calls: 0, bytes: 0 }]));
  const reads = { calls: 0, requested_bytes: 0, returned_bytes: 0, eof_reads: 0 };
  // Buffer.concat may call another public allocation method internally. Count
  // that allocation once, at the outer concat request, not again as allocUnsafe.
  let depth = 0;
  for (const name of methods) {
    Buffer[name] = function(...args) {
      if (!depth) {
        buffers[name].calls++;
        buffers[name].bytes += name === 'concat'
          ? args[1] ?? args[0].reduce((total, chunk) => total + chunk.length, 0)
          : args[0];
      }
      depth++;
      try { return original[name].apply(this, args); }
      finally { depth--; }
    };
  }
  fs.readSync = function(...args) {
    const [, buffer, offset, length] = args;
    const requested = typeof offset === 'object' && offset !== null
      ? offset.length ?? buffer.byteLength - (offset.offset ?? 0)
      : length ?? buffer.byteLength - (offset ?? 0);
    const count = originalRead.apply(this, args);
    reads.calls++;
    reads.requested_bytes += requested;
    reads.returned_bytes += count;
    if (!count) reads.eof_reads++;
    return count;
  };
  try {
    const raw = read();
    return { raw, buffers, requested_buffer_bytes: Object.values(buffers).reduce((total, entry) => total + entry.bytes, 0), reads };
  } finally {
    for (const name of methods) Buffer[name] = original[name];
    fs.readSync = originalRead;
  }
}

async function allocationSample(kitRoot) {
  const { readCurrentBytes } = await import(pathToFileURL(path.join(kitRoot, 'scripts/lib/current-work-request.mjs')).href);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwkit-reader-allocations-'));
  try {
    return allocationSizes.map((size, index) => {
      const file = path.join(root, `input-${index}.bin`);
      const expected = writePayload(file, size, index);
      const { raw, ...counts } = countReaderAllocations(() => readCurrentBytes(file, 'benchmark input'));
      assert.equal(raw.length, size, 'the complete exact-size input must be returned');
      assert.equal(sha256(raw), expected.sha256, 'raw bytes must remain exact');
      assert.equal(counts.reads.returned_bytes, size, 'actual bytes read must match the stable file');
      assert.equal(counts.reads.eof_reads, 1, 'the reader must check EOF, including exact-limit files');
      return { file_bytes: size, content_sha256: expected.sha256, ...counts };
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function runWorker(mode, kitRoot, scenario) {
  return JSON.parse(execFileSync(process.execPath,
    ['--expose-gc', script, mode, kitRoot, ...(scenario ? [scenario] : [])],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: workerEnvironment() }));
}

async function main(args) {
  guardGitEnvironment();
  if (args[0] === '--capture-worker') {
    assert.equal(args.length, 3, usage);
    console.log(JSON.stringify(await captureSample(path.resolve(args[1]), args[2])));
    return;
  }
  if (args[0] === '--allocation-worker') {
    assert.equal(args.length, 2, usage);
    console.log(JSON.stringify(await allocationSample(path.resolve(args[1]))));
    return;
  }
  assert.ok(args.length >= 2 && args.length <= 4, usage);
  const [beforeArg, afterArg, runArg = '3', caseArg = 'small,large'] = args;
  const runs = positiveInteger(runArg);
  const scenarios = caseArg.split(',');
  assert.ok(scenarios.length && scenarios.every((name) => Object.hasOwn(workloads, name)), usage);
  const kits = { before: path.resolve(beforeArg), after: path.resolve(afterArg) };
  const cases = [];
  for (const scenario of scenarios) {
    const samples = [];
    let expected;
    for (let run = 0; run < runs; run++) {
      for (const side of run % 2 ? ['after', 'before'] : ['before', 'after']) {
        const raw = runWorker('--capture-worker', kits[side], scenario);
        const { elapsed_ms, max_rss_kib, before_memory, after_gc, ...verified } = raw;
        if (!expected) expected = verified;
        else assert.deepEqual(verified, expected, 'exact corpus, byte identities, modes and trees must agree across all workers');
        samples.push({ side, run: run + 1, elapsed_ms, max_rss_kib, before_memory, after_gc });
        console.error(`${scenario}, run ${run + 1}/${runs}, ${side}: capture ${elapsed_ms.toFixed(1)} ms; exact tree/index verified`);
      }
    }
    const medians = Object.fromEntries(['before', 'after'].map((side) => {
      const selected = samples.filter((entry) => entry.side === side);
      return [side, { elapsed_ms: median(selected.map((entry) => entry.elapsed_ms)),
        max_rss_kib: median(selected.map((entry) => entry.max_rss_kib)),
        after_gc: Object.fromEntries(Object.keys(selected[0].after_gc)
          .map((key) => [key, median(selected.map((entry) => entry.after_gc[key]))])) }];
    }));
    cases.push({ ...expected, medians, capture_speedup: medians.before.elapsed_ms / medians.after.elapsed_ms, samples });
  }
  const allocations = Object.fromEntries(['before', 'after'].map((side) =>
    [side, runWorker('--allocation-worker', kits[side])]));
  assert.deepEqual(allocations.before.map(({ file_bytes, content_sha256 }) => ({ file_bytes, content_sha256 })),
    allocations.after.map(({ file_bytes, content_sha256 }) => ({ file_bytes, content_sha256 })), 'allocation workers must return identical raw bytes');
  console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch,
    runs, kits, measurement: {
      elapsed_ms: 'First actual captureCurrentWorktree call in a fresh process; includes raw reads/hashing, path and stability checks, Git discovery and temporary-index snapshot creation. Excludes imports, fixture/Git setup, forced GC, result verification and cleanup. No instrumentation wrappers are installed.',
      max_rss_kib: 'Node process peak RSS observed immediately after capture; includes imports and fixture/Git setup, excludes later verification, and does not include Git child-process RSS. Not a reader-only or retained-memory measure.',
      after_gc: 'Memory after capture and two explicit GCs, before verification. The returned snapshot and expected entries remain live.',
      allocations: 'Separate untimed readCurrentBytes workers count explicit Buffer allocation/concat requests (nested requests counted once), actual readSync bytes and EOF reads. Counts are not peak/live memory and are not mixed into capture timings.',
      order: 'Fresh process per kit/case/run, before/after order alternates. Fixture creation and Git setup warm the filesystem cache; this does not measure cold-storage latency.',
      scope: 'Synthetic unchanged-worktree snapshot capture and a focused bounded reader allocation probe; not end-to-end consumer CLI performance.',
    }, cases, allocations }, null, 2));
}

await main(process.argv.slice(2));
