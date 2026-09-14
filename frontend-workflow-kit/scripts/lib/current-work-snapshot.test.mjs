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

function packetFixture(t) {
  const f = fixture(t);
  for (const name of ['policy', 'manifest', 'layout']) fs.copyFileSync(path.join(f.root, `config/${name}.yaml`), path.join(f.root, `config/${name}-copy.yaml`));
  fs.writeFileSync(path.join(f.root, 'config/ci.yaml'), '{}\n');
  fs.cpSync(path.join(f.root, 'docs'), path.join(f.root, 'docs-copy'), { recursive: true });
  fs.cpSync(path.join(f.root, 'src'), path.join(f.root, 'src-copy'), { recursive: true });
  const twin = path.join(f.root, 'apps/twin');
  fs.mkdirSync(twin, { recursive: true });
  for (const dir of ['docs', 'src', 'config']) fs.cpSync(path.join(f.root, dir), path.join(twin, dir), { recursive: true });
  f.git(['add', '-A']); f.git(['commit', '-qm', 'alternate resources in the same baseline']);
  const packet = path.join(f.temp, 'packet.md');
  body(f.cli('workflow-packet', ['--out', packet]), 0);
  fs.appendFileSync(f.target, '\n// requested change\n');
  return { ...f, packet, twin };
}

test('P1 packet/report rejects every resource selector change, including added/removed CI and project prefix', (t) => {
  const f = packetFixture(t);
  const original = body(f.cli('workflow-report', ['--packet', f.packet]), 0);
  assert.equal(original.backstop.ok, true);
  for (const [flag, value] of [['policy', 'config/policy-copy.yaml'], ['manifest', 'config/manifest-copy.yaml'], ['layout', 'config/layout-copy.yaml'], ['docs', 'docs-copy/frontend-workflow'], ['src', 'src-copy'], ['ci', 'config/ci.yaml'], ['root', f.twin]]) {
    const out = path.join(f.temp, `must-not-write-${flag}.md`);
    const result = f.cli('workflow-report', ['--packet', f.packet, `--${flag}`, value, '--out', out]);
    assert.equal(result.status, 2, `${flag}: ${result.stderr || result.stdout}`);
    assert.match(result.stderr, /project\/resource context/);
    assert.equal(fs.existsSync(out), false);
  }
  const withCi = path.join(f.temp, 'with-ci.md');
  body(f.cli('workflow-packet', ['--ci', 'config/ci.yaml', '--out', withCi]), 0);
  assert.equal(f.cli('workflow-report', ['--packet', withCi]).status, 2);
});

test('P1 denied packet cannot become allowed by choosing a different policy in the same tree', async (t) => {
  const { parse, stringify } = await import('yaml');
  const f = fixture(t);
  const p = path.join(f.root, 'config/policy.yaml');
  const normal = fs.readFileSync(p, 'utf8');
  fs.writeFileSync(path.join(f.root, 'config/normal.yaml'), normal);
  const policy = parse(normal);
  for (const mode of Object.values(policy.modes)) mode.forbidden_paths = [...(mode.forbidden_paths || []), TARGET];
  fs.writeFileSync(p, stringify(policy));
  f.git(['add', 'config']); f.git(['commit', '-qm', 'deny and allow policies coexist']);
  const packet = path.join(f.temp, 'denied.md');
  const denied = body(f.cli('workflow-packet', ['--out', packet]), 0);
  assert.equal(denied.ready, false);
  fs.appendFileSync(f.target, '\n// implementation\n');
  const control = body(f.cli('workflow-report', ['--packet', packet]), 0);
  assert.equal(control.ready, false); assert.equal(control.backstop.ok, false);
  const changed = f.cli('workflow-report', ['--packet', packet, '--policy', 'config/normal.yaml']);
  assert.equal(changed.status, 2); assert.match(changed.stderr, /project\/resource context/);
});

test('P1 packet identity includes resource kind/path/mode/OID and rejects missing or duplicate context', (t) => {
  const f = packetFixture(t);
  const raw = fs.readFileSync(f.packet, 'utf8');
  const pattern = /(## Machine Envelope\s*\n```json\s*\n)([\s\S]*?)(\n```)/;
  for (const change of [
    v => delete v.snapshot.project_prefix,
    v => delete v.snapshot.resources,
    v => v.snapshot.resources.push(v.snapshot.resources[0]),
    v => v.snapshot.resources[0].mode = '100755',
    v => v.snapshot.resources[0].oid = '0'.repeat(40),
    v => v.snapshot.resources[0].path = 'elsewhere',
    v => v.snapshot.resources[0].kind = 'unexpected',
  ]) {
    const value = JSON.parse(pattern.exec(raw)[2]); change(value);
    fs.writeFileSync(f.packet, raw.replace(pattern, (_, before, _json, after) => before + JSON.stringify(value) + after));
    assert.equal(f.cli('workflow-report', ['--packet', f.packet]).status, 2);
  }
  const value = JSON.parse(pattern.exec(raw)[2]); value.snapshot.resources.reverse();
  fs.writeFileSync(f.packet, raw.replace(pattern, (_, before, _json, after) => before + JSON.stringify(value) + after));
  assert.equal(body(f.cli('workflow-report', ['--packet', f.packet]), 0).backstop.ok, true);
});

function authorityFixture(t) {
  const f = fixture(t);
  const input = 'docs/frontend-workflow/inputs/IN-20260720-figma-001.md';
  fs.mkdirSync(path.dirname(path.join(f.root, input)), { recursive: true });
  fs.copyFileSync(path.join(KIT, 'examples/reconciliation-validation/v2-pass', input), path.join(f.root, input));
  const register = 'docs/frontend-workflow/_meta/reconciliation-register.md';
  fs.writeFileSync(path.join(f.root, register), '---\nkind: meta-register\n---\n\n| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |\n|---|---|---|---|---|---|---|---|\n| IN-20260720-figma-001 | figma | simple-update | reconciled | accepted | COUPON-001 screen-spec | - | - |\n');
  fs.writeFileSync(path.join(f.root, 'config/ci.yaml'), '{}\n');
  f.args.push('--ci', 'config/ci.yaml');
  const request = JSON.parse(fs.readFileSync(f.work));
  request.origin_inputs = [{ input_id: 'IN-20260720-figma-001', source_refs: [] }];
  fs.writeFileSync(f.work, JSON.stringify(request));
  f.git(['add', '-A']); f.git(['commit', '-qm', 'canonical origin and CI baseline']);
  fs.appendFileSync(f.target, '\n// implementation\n');
  return { ...f, input, register };
}
for (const flag of ['assume-unchanged', 'skip-worktree']) {
  test(`P1-3 ${flag}: every consumed authority file is checked directly; user index is unchanged`, (t) => {
    const f = authorityFixture(t);
    const names = ['config/policy.yaml', 'config/manifest.yaml', 'config/layout.yaml', 'config/ci.yaml',
      'docs/frontend-workflow/_meta/workflow-state.yaml', f.register, f.input];
    for (const name of names) {
      const file = path.join(f.root, name), original = fs.readFileSync(file);
      f.git(['update-index', `--${flag}`, name]);
      fs.appendFileSync(file, '\n');
      assert.equal(String(f.git(['diff', '--name-only', 'HEAD'])).includes(name), false, `fixture must hide ${name}`);
      const before = fs.readFileSync(f.index);
      const result = body(f.cli('forbidden-paths', ['--enforce']), 1);
      assert.ok(result.violations.some((v) => v.code === 'CW-GIT-AUTHORITY-CHANGED' && v.path === name), name);
      const check = result.snapshot.authority_checks.find((c) => c.path === name);
      assert.equal(check.ok, false); assert.notEqual(check.hash, check.after.hash);
      assert.deepEqual(fs.readFileSync(f.index), before);
      fs.writeFileSync(file, original);
      assert.equal(body(f.cli('forbidden-paths', ['--enforce']), 0).ok, true);
      f.git(['update-index', `--no-${flag}`, name]);
    }
  });
  test(`P1-3 ${flag}: hidden requested work and unrequested cross-root files are not omitted`, (t) => {
    const f = fixture(t, { prefix: 'apps/mobile' });
    const other = 'src/unrequested.ts', outside = 'outside.txt';
    fs.writeFileSync(path.join(f.root, other), 'before\n'); fs.writeFileSync(path.join(f.repo, outside), 'before\n');
    f.git(['add', '-A']); f.git(['commit', '-qm', 'extra tracked files']);
    const names = [f.repositoryPath, `apps/mobile/${other}`, outside];
    f.git(['update-index', `--${flag}`, ...names]);
    fs.appendFileSync(f.target, '\n// hidden requested change\n');
    const first = body(f.cli('forbidden-paths', ['--enforce']), 0);
    assert.equal(first.ok, true); assert.equal(first.changed_records[0].status, 'M');
    assert.equal(first.changed_records[0].evidence.hash, hash(fs.readFileSync(f.target)));
    fs.appendFileSync(path.join(f.root, other), 'after\n'); fs.appendFileSync(path.join(f.repo, outside), 'after\n');
    assert.equal(String(f.git(['diff', '--name-only', 'HEAD'])), '');
    const before = fs.readFileSync(f.index);
    const result = body(f.cli('forbidden-paths', ['--enforce']), 1);
    assert.ok(result.violations.some((v) => v.code === 'CW-GIT-UNREQUESTED' && v.path === other));
    assert.ok(result.violations.some((v) => v.code === 'CW-GIT-OUTSIDE-ROOT'));
    assert.deepEqual(fs.readFileSync(f.index), before);
  });
}

test('P1-3 staged authority follows index only; report/run retain detected hidden worktree violations', (t) => {
  const f = authorityFixture(t), policy = path.join(f.root, 'config/policy.yaml');
  const original = fs.readFileSync(policy), changed = Buffer.concat([original, Buffer.from('\n')]);
  const packet = path.join(f.temp, 'packet.md');
  body(f.cli('workflow-packet', ['--out', packet]), 0);
  f.git(['add', f.repositoryPath]);
  const oid = String(f.git(['hash-object', '-w', '--stdin'], changed)).trim();
  f.git(['update-index', '--cacheinfo', `100644,${oid},config/policy.yaml`]);
  const before = fs.readFileSync(f.index);
  assert.equal(body(f.cli(), 1).snapshot.authority_checks.find((c) => c.path === 'config/policy.yaml').after.hash, hash(changed));
  assert.equal(body(f.cli('forbidden-paths', ['--enforce']), 0).ok, true);
  f.git(['update-index', '--cacheinfo', `100644,${String(f.git(['rev-parse', 'HEAD:config/policy.yaml'])).trim()},config/policy.yaml`]);
  f.git(['update-index', '--assume-unchanged', 'config/policy.yaml']);
  fs.writeFileSync(policy, changed);
  const index = fs.readFileSync(f.index);
  assert.equal(body(f.cli('workflow-report', ['--packet', packet]), 0).backstop.ok, false);
  assert.equal(body(f.cli('workflow-run', []), 0).backstop.ok, false);
  assert.equal(body(f.cli('forbidden-paths', []), 0).ok, false); // advisory still exits zero
  assert.equal(body(f.cli(), 0).ok, true); // worktree authority must not contaminate index verdict
  assert.deepEqual(fs.readFileSync(f.index), index);
  assert.ok(before.length > 0);
});

test('P1-3 ignored new inputs and absent optional register cannot escape read-set/inventory checks', (t) => {
  const f = fixture(t), input = 'docs/frontend-workflow/inputs/IN-20260914-user-note-001.md';
  const register = 'docs/frontend-workflow/_meta/reconciliation-register.md';
  if (fs.existsSync(path.join(f.root, register))) {
    fs.unlinkSync(path.join(f.root, register)); f.git(['add', register]); f.git(['commit', '-qm', 'no optional register']);
  }
  fs.writeFileSync(path.join(f.repo, '.git/info/exclude'), `${input}\n${register}\n`);
  fs.mkdirSync(path.dirname(path.join(f.root, input)), { recursive: true });
  fs.writeFileSync(path.join(f.root, input), 'new uncaptured input\n');
  fs.writeFileSync(path.join(f.root, register), 'new register\n');
  fs.appendFileSync(f.target, '\n// implementation\n');
  assert.equal(String(f.git(['ls-files', '--others', '--exclude-standard'])), '');
  const result = body(f.cli('forbidden-paths', ['--enforce']), 1);
  for (const name of [input, register]) assert.ok(result.snapshot.authority_checks.some((c) => c.path === name && !c.ok), name);
});

test('P1-3 hidden executable changes, deletions and symlink ancestors use raw filesystem identity', { skip: process.platform === 'win32' }, (t) => {
  const f = fixture(t);
  f.git(['config', 'core.filemode', 'false']);
  f.git(['update-index', '--skip-worktree', f.repositoryPath]);
  fs.chmodSync(f.target, 0o755);
  const mode = body(f.cli('forbidden-paths', ['--enforce']), 1);
  assert.ok(mode.violations.some((v) => v.code === 'CW-GIT-MODE'));
  const request = JSON.parse(fs.readFileSync(f.work)); request.requests[0].targets[0].change = 'D';
  fs.writeFileSync(f.work, JSON.stringify(request)); fs.unlinkSync(f.target);
  assert.equal(body(f.cli('forbidden-paths', ['--enforce']), 0).ok, true);
  fs.renameSync(path.join(f.root, 'config'), path.join(f.temp, 'config'));
  fs.symlinkSync(path.join(f.temp, 'config'), path.join(f.root, 'config'));
  const result = f.cli('forbidden-paths', ['--enforce']);
  assert.equal(result.status, 2); assert.match(result.stderr, /non-directory ancestor/);
});

test('P1-3 ignored dirty gitlinks fail explicitly without refreshing the user index', (t) => {
  const f = fixture(t), sub = path.join(f.temp, 'sub');
  fs.mkdirSync(sub);
  const git = (args) => execFileSync('git', args, { cwd: sub, stdio: ['pipe', 'pipe', 'pipe'] });
  git(['init', '-q']); git(['config', 'user.name', 'test']); git(['config', 'user.email', 'test@example.com']);
  fs.writeFileSync(path.join(sub, 'file'), 'before\n'); git(['add', '.']); git(['commit', '-qm', 'sub baseline']);
  f.git(['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sub, 'dep']);
  f.git(['commit', '-qm', 'gitlink baseline']); f.git(['config', 'submodule.dep.ignore', 'all']);
  execFileSync('git', ['update-index', '--assume-unchanged', 'file'], { cwd: path.join(f.root, 'dep') });
  fs.appendFileSync(path.join(f.root, 'dep/file'), 'dirty\n'); fs.appendFileSync(f.target, '\n// implementation\n');
  const before = fs.readFileSync(f.index), result = f.cli('forbidden-paths', ['--enforce']);
  assert.equal(result.status, 2); assert.match(result.stderr, /dirty submodule/);
  assert.deepEqual(fs.readFileSync(f.index), before);
});
