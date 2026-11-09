// Reproduce #300 directory-listing overhead using the real Git object reader.
// Usage: node kit-dev/benchmarks/raw-git-snapshot.mjs <kit-root> [files=2000] [groups=40] [runs=5]
// Run the same script against base and changed kit directories. Times include
// instrumentation and snapshot creation, not fixture setup, verification or cleanup.
// Small repeated blobs isolate path overhead; this is not a large consumer benchmark.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const [kitArg, fileArg = '2000', groupArg = '40', runArg = '5'] = process.argv.slice(2);
const [files, groups, runs] = [fileArg, groupArg, runArg].map(Number);
if (!kitArg || ![files, groups, runs].every((value) => Number.isSafeInteger(value) && value > 0) || groups > files) {
  throw new Error('usage: node raw-git-snapshot.mjs <kit-root> [files=2000] [groups=40] [runs=5]; positive integers, groups <= files');
}
// A temporary cwd does not override Git's environment redirects. Refuse them
// before creating a fixture so update-index/config cannot touch another repo.
const redirected = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG',
  'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS'].filter((name) => process.env[name] !== undefined);
if (redirected.length) throw new Error(`run the benchmark without Git redirection variables: ${redirected.join(', ')}`);
const { materializeRawGitTree } = await import(pathToFileURL(path.join(path.resolve(kitArg), 'scripts/lib/visual-refresh-git-objects.mjs')));
const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-snapshot-benchmark-'));
const git = (args, input) => execFileSync('git', args, {
  cwd: repositoryRoot, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
}).trim();
const blob = Buffer.from('raw Git bytes\r\n\0snapshot benchmark\n');
const names = Array.from({ length: files }, (_, index) =>
  `docs/raw/group-${String(index % groups).padStart(4, '0')}/file-${String(index).padStart(6, '0')}.md`);
const samples = [];
try {
  git(['init', '--quiet']);
  git(['config', 'gc.auto', '0']);
  git(['config', 'maintenance.auto', 'false']);
  const oid = git(['hash-object', '-w', '--stdin'], blob);
  git(['update-index', '-z', '--index-info'], names.map((name) => `100644 ${oid}\t${name}\0`).join(''));
  const tree = git(['write-tree']);
  for (let run = 0; run < runs; run++) {
    const original = { readdirSync: fs.readdirSync, lstatSync: fs.lstatSync, mkdirSync: fs.mkdirSync };
    const counts = { readdirSync: 0, lstatSync: 0 };
    let checkout = null;
    let view;
    fs.mkdirSync = function (directory, ...args) {
      const result = original.mkdirSync.call(this, directory, ...args);
      if (path.basename(String(directory)) === 'checkout' &&
          path.basename(path.dirname(String(directory))).startsWith('workflow-visual-refresh-tree-')) checkout = String(directory);
      return result;
    };
    for (const operation of Object.keys(counts)) {
      fs[operation] = function (file, ...args) {
        if (checkout && (String(file) === checkout || String(file).startsWith(`${checkout}${path.sep}`))) counts[operation]++;
        return original[operation].call(this, file, ...args);
      };
    }
    try {
      const start = performance.now();
      try {
        view = materializeRawGitTree({ repositoryRoot, tree });
        samples.push({ ms: Number((performance.now() - start).toFixed(2)), ...counts });
      } finally {
        Object.assign(fs, original);
      }
      assert.equal(checkout, view.root, 'instrumentation must observe the materialized checkout');
      assert.ok(counts.readdirSync > 0 && counts.lstatSync > 0, 'directory operations must be counted');
      for (const name of names) {
        assert.deepEqual(fs.readFileSync(path.join(view.root, name)), blob);
        assert.deepEqual(view.entry(name), { repository_path: name, mode: '100644', type: 'blob', oid });
      }
    } finally {
      view?.cleanup();
    }
  }
  const sorted = samples.map(({ ms }) => ms).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  console.log(JSON.stringify({ node: process.version, platform: process.platform, files, git_directories: groups + 2,
    runs, verified_raw_bytes_and_entries: true, median_ms: Number(median.toFixed(2)), samples }, null, 2));
} finally {
  fs.rmSync(repositoryRoot, { recursive: true, force: true });
}
