import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET = 'src/features/coupons/screens/CouponListScreen.tsx';
const hash = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function fixture(t, { change = 'M', prefix = '' } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'current-snapshot-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, 'repo'), root = path.join(repo, prefix);
  fs.mkdirSync(root, { recursive: true });
  fs.cpSync(path.join(KIT, 'examples/coupon-feature/docs'), path.join(root, 'docs'), { recursive: true });
  fs.cpSync(path.join(KIT, 'examples/coupon-feature/src'), path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'config'));
  for (const [source, target] of [['policies/implementation-mode-policy.yaml', 'policy.yaml'], ['catalog/artifact-manifest.yaml', 'manifest.yaml'], ['presets/expo-feature.yaml', 'layout.yaml']]) {
    fs.copyFileSync(path.join(KIT, source), path.join(root, 'config', target));
  }
  const git = (args, input) => execFileSync('git', args, { cwd: repo, input, stdio: ['pipe', 'pipe', 'pipe'] });
  git(['init', '-q']); git(['config', 'user.name', 'test']); git(['config', 'user.email', 'test@example.com']);
  git(['add', '-A']); git(['commit', '-qm', 'baseline']);
  const work = path.join(temp, 'request.json');
  fs.writeFileSync(work, JSON.stringify({ version: 1, origin_inputs: [], requests: [{ owner: 'screen:COUPON-001', authority: 'current', requested_mode: 'rough-fixture-ui', targets: [{ path: TARGET, change }] }] }));
  const args = ['--work', work, '--root', root, '--docs', 'docs/frontend-workflow', '--src', 'src', '--policy', 'config/policy.yaml', '--manifest', 'config/manifest.yaml', '--layout', 'config/layout.yaml'];
  const cli = (script = 'forbidden-paths', extra = ['--staged', '--enforce']) => spawnSync(process.execPath, [path.join(KIT, 'scripts', script + '.mjs'), ...args, ...extra, '--json'], { cwd: KIT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const repositoryPath = prefix ? `${prefix}/${TARGET}` : TARGET;
  const stage = (mode, bytes) => {
    const oid = String(git(['hash-object', '-w', '--stdin'], bytes)).trim();
    git(['update-index', '--add', '--cacheinfo', `${mode},${oid},${repositoryPath}`]);
    return oid;
  };
  return { temp, repo, root, work, args, cli, git, stage, repositoryPath, target: path.join(root, TARGET), index: path.join(repo, '.git/index') };
}
function body(result, status) {
  assert.equal(result.status, status, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

for (const [mode, change, code] of [['120000', 'T', 'CW-GIT-TYPE'], ['100755', 'M', 'CW-GIT-MODE']]) {
  test(`P1 staged ${mode}: worktree variation cannot change index evidence or verdict`, { skip: process.platform === 'win32' }, (t) => {
    const f = fixture(t, { change });
    const bytes = mode === '120000' ? Buffer.from('other.tsx') : fs.readFileSync(f.target);
    const oid = f.stage(mode, bytes);
    const beforeIndex = fs.readFileSync(f.index);
    const first = body(f.cli(), 1);
    assert.equal(first.ok, false);
    assert.ok(first.violations.some((v) => v.code === code));
    const evidence = first.changed_records[0].evidence;
    assert.equal(evidence.oid, oid); assert.equal(evidence.git_mode, mode); assert.equal(evidence.hash, hash(bytes));
    assert.equal(evidence.kind, mode === '120000' ? 'symlink' : 'file');
    if (mode === '120000') { fs.unlinkSync(f.target); fs.symlinkSync('other.tsx', f.target); }
    else fs.chmodSync(f.target, 0o755);
    const second = body(f.cli(), 1);
    assert.deepEqual(second.changed_records, first.changed_records);
    assert.deepEqual(second.violations, first.violations);
    assert.equal(second.snapshot.destination_tree, first.snapshot.destination_tree);
    assert.deepEqual(fs.readFileSync(f.index), beforeIndex);
  });
}

test('P1 staged raw binary blob and project prefix: worktree symlink is not the index file', { skip: process.platform === 'win32' }, (t) => {
  const f = fixture(t, { prefix: 'apps/mobile' });
  const bytes = Buffer.from([0, 255, 254, 128, 13, 10]);
  const oid = f.stage('100644', bytes);
  fs.unlinkSync(f.target); fs.symlinkSync('absent.tsx', f.target);
  const beforeIndex = fs.readFileSync(f.index);
  const result = body(f.cli(), 0);
  assert.equal(result.ok, true);
  assert.equal(result.changed_records[0].evidence.oid, oid);
  assert.equal(result.changed_records[0].evidence.hash, hash(bytes));
  assert.equal(result.changed_records[0].evidence.git_mode, '100644');
  assert.match(result.snapshot.destination_tree, /^[0-9a-f]{40,64}$/);
  assert.deepEqual(fs.readFileSync(f.index), beforeIndex);
});

test('P1 staged deletion remains missing even when the worktree retains a file', (t) => {
  const f = fixture(t, { change: 'D' });
  f.git(['update-index', '--force-remove', f.repositoryPath]);
  const result = body(f.cli(), 0);
  assert.equal(result.ok, true);
  assert.equal(result.changed_records[0].evidence.kind, 'missing');
  assert.equal(fs.existsSync(f.target), true);
});

test('P1 unmerged index is an explicit tool error and is not rewritten', (t) => {
  const f = fixture(t);
  const oid = String(f.git(['rev-parse', `HEAD:${f.repositoryPath}`])).trim();
  f.git(['update-index', '--index-info'], `0 ${'0'.repeat(oid.length)}\t${f.repositoryPath}\n100644 ${oid} 1\t${f.repositoryPath}\n100644 ${oid} 2\t${f.repositoryPath}\n`);
  const beforeIndex = fs.readFileSync(f.index);
  const result = f.cli();
  assert.equal(result.status, 2); assert.match(result.stderr, /unmerged/);
  assert.deepEqual(fs.readFileSync(f.index), beforeIndex);
});
