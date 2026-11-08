import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIB = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.resolve(LIB, '../..');

const ENTRY_DOCS = [
  'skills/implement-screen/SKILL.md',
  'docs/reference/workflow-stages/06-implement-screen-or-code.md',
  'docs/reference/workflow-stages/08-validate-and-report.md',
  'COMMANDS.md',
];

function assertCurrentWorkDocs(root) {
  const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
  for (const [relative, currentHeading, legacyHeading] of [
    [ENTRY_DOCS[0], '### Current-work 분기', '### No-work / legacy 분기'],
    [ENTRY_DOCS[1], '## Current-work branch', '## Mode/readiness-driven'],
  ]) {
    const text = read(relative);
    const current = text.indexOf(currentHeading);
    const legacy = text.indexOf(legacyHeading);
    assert.ok(current >= 0 && legacy > current, `${relative}: select current before legacy blocking`);
    const branch = text.slice(current, legacy);
    assert.match(text.slice(0, legacy), /단일 target/, `${relative}: current is not limited to multiple targets`);
    for (const term of ['--work', 'origin_inputs', 'ready: true', 'HALT_READY_FOR_WORK',
      'future_requirements', 'legacy_readiness.blocking', 'deny', 'fallback', 'scoped']) {
      assert.ok(branch.includes(term), `${relative}: missing current boundary ${term}`);
    }
    assert.match(text.slice(legacy), /blocking/, `${relative}: preserve the no-work blocking branch`);
  }
  const reference = path.join(root, 'docs/reference/current-work.md');
  assert.ok(fs.statSync(reference).isFile());
  for (const relative of ENTRY_DOCS) {
    const links = [...read(relative).matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1].split('#')[0]);
    assert.ok(links.some((link) => path.resolve(root, path.dirname(relative), link) === reference),
      `${relative}: link directly to the existing current-work reference`);
  }
  assert.match(read('COMMANDS.md'), /single target/);
  assert.match(read('COMMANDS.md'), /--work/);
  const common = read('docs/reference/current-work.md').split('## Common CLI flow')[1].split('## Eligibility invariants')[0];
  const commands = common.split('```bash')[1].split('```')[0];
  assert.equal((commands.match(/npm run workflow:run/g) || []).length, 2);
  assert.match(commands, /--packet "\$RUN_EVIDENCE\/before\/work-packet\.md"/);
  assert.doesNotMatch(commands, /npm run workflow:(readiness|packet|report|forbidden-paths)/);
  for (const relative of ['skills/implement-shared-surface/SKILL.md', 'docs/reference/task-artifact-matrix.md']) {
    const text = read(relative);
    assert.match(text, /06-implement-screen-or-code\.md#select-the-execution-branch-first/);
    assert.match(text, /08-validate-and-report\.md#current-work-reportbackstop/);
    assert.match(text, /current-work\.md#common-cli-flow/);
  }

}

test('current-work entry documentation routes single targets before legacy blocking', () => {
  assertCurrentWorkDocs(KIT);
});

test('packed consumer payload contains and executes current-work runtime/reference', async (t) => {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'current-work-packed-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const temporary = path.join(temp, 'tmp');
  fs.mkdirSync(temporary);
  const env = { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary };
  const packed = path.join(temp, 'kit');
  const pack = spawnSync(process.execPath, [path.join(KIT, 'scripts/pack-frontend-workflow-kit.mjs'), '--out', packed], {
    cwd: KIT, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(pack.status, 0, pack.stderr || pack.stdout);
  for (const relative of [
    'scripts/lib/current-work-request.mjs',
    'scripts/lib/current-work-execution.mjs',
    'scripts/lib/current-work-cli.mjs',
    'scripts/lib/visual-refresh-snapshot-lifecycle.mjs',
    'scripts/lib/visual-refresh-snapshot-guardian.mjs',
    'scripts/lib/visual-refresh-snapshot-owner.mjs',
    'scripts/readiness.mjs',
    'scripts/workflow-packet.mjs',
    'scripts/workflow-run.mjs',
    'scripts/workflow-report.mjs',
    'scripts/forbidden-paths.mjs',
    'docs/reference/current-work.md',
  ]) assert.equal(fs.existsSync(path.join(packed, relative)), true, `packed missing ${relative}`);
  assert.equal(fs.existsSync(path.join(packed, 'scripts/lib/current-work-packed.test.mjs')), false);
  assertCurrentWorkDocs(packed);
  for (const relative of [...ENTRY_DOCS, 'docs/reference/current-work.md']) {
    assert.deepEqual(fs.readFileSync(path.join(packed, relative)), fs.readFileSync(path.join(KIT, relative)),
      `packed documentation differs: ${relative}`);
  }

  // The pack intentionally contains package metadata, not installed dependencies. For
  // this runtime smoke only, point its module resolution at the already lockfile-installed
  // source node_modules without adding anything to the payload.
  fs.symlinkSync(path.join(KIT, 'node_modules'), path.join(packed, 'node_modules'), 'dir');

  const root = path.join(temp, 'project');
  fs.mkdirSync(root);
  fs.cpSync(path.join(KIT, 'examples/coupon-feature/docs'), path.join(root, 'docs'), { recursive: true });
  fs.cpSync(path.join(KIT, 'examples/coupon-feature/src'), path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'config'));
  fs.copyFileSync(path.join(packed, 'policies/implementation-mode-policy.yaml'), path.join(root, 'config/policy.yaml'));
  fs.copyFileSync(path.join(packed, 'catalog/artifact-manifest.yaml'), path.join(root, 'config/manifest.yaml'));
  fs.copyFileSync(path.join(packed, 'presets/expo-feature.yaml'), path.join(root, 'config/layout.yaml'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  // Git >=2.47 may detach auto-maintenance after commit; it can race temp-dir removal.
  execFileSync('git', ['config', 'maintenance.auto', 'false'], { cwd: root });
  execFileSync('git', ['config', 'gc.auto', '0'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'baseline'], { cwd: root });
  const work = path.join(temp, 'request.json');
  fs.writeFileSync(work, JSON.stringify({
    version: 1,
    origin_inputs: [],
    requests: [{ owner: 'screen:COUPON-001', authority: 'current', requested_mode: 'rough-fixture-ui', targets: [{ path: 'src/features/coupons/screens/CouponListScreen.tsx', change: 'M' }] }],
  }));
  const run = spawnSync(process.execPath, [path.join(packed, 'scripts/readiness.mjs'),
    '--work', work, '--root', root, '--docs', 'docs/frontend-workflow', '--src', 'src',
    '--policy', 'config/policy.yaml', '--manifest', 'config/manifest.yaml', '--layout', 'config/layout.yaml', '--json'],
    { cwd: packed, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const out = JSON.parse(run.stdout);
  assert.equal(out.work_contract, 1);
  assert.equal(out.authority, 'current');
  assert.equal(out.ready, true);
  const execute = (extra) => {
    const result = spawnSync(process.execPath, [path.join(packed, 'scripts/workflow-run.mjs'),
      '--work', work, '--root', root, '--docs', 'docs/frontend-workflow', '--src', 'src',
      '--policy', 'config/policy.yaml', '--manifest', 'config/manifest.yaml', '--layout', 'config/layout.yaml', '--json', ...extra],
    { cwd: packed, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout);
  };
  const before = path.join(temp, 'before'), after = path.join(temp, 'after');
  assert.equal(execute(['--out', before]).state, 'HALT_READY_FOR_WORK');
  fs.appendFileSync(path.join(root, 'src/features/coupons/screens/CouponListScreen.tsx'), '\n// packed implementation\n');
  const done = execute(['--packet', path.join(before, 'work-packet.md'), '--out', after]);
  assert.equal(done.state, 'DONE_PENDING_REVIEW'); assert.equal(done.backstop.ok, true);
  assert.equal(done.checkpoint.matched, true);
  assert.match(fs.readFileSync(`${after}.md`, 'utf8'), /## Machine Envelope/);
  assert.ok(fs.existsSync(path.join(after, 'run-report.md')));

  await t.test('#292 packed raw materializer reclaims SIGTERM during a synchronous checkout write',
    { skip: process.platform === 'win32', timeout: 20000 }, async () => {
      const barrier = path.join(temp, 'materializing.json'), script = path.join(temp, 'interrupt-packed.mjs');
      const materializer = pathToFileURL(path.join(packed, 'scripts/lib/visual-refresh-git-objects.mjs')).href;
      const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim();
      // Import only the packed materializer: its relative guardian/owner imports must
      // work after distribution, including while synchronous work cannot handle signals.
      fs.writeFileSync(script, `
import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { materializeRawGitTree } from ${JSON.stringify(materializer)};
const original = fs.writeFileSync;
fs.writeFileSync = function(file, ...args) {
  const result = original.call(this, file, ...args);
  const parts = path.relative(${JSON.stringify(temporary)}, String(file)).split(path.sep);
  if (parts[0].startsWith('workflow-visual-refresh-tree-') && parts[1] === 'checkout' && parts.length > 2) {
    original(${JSON.stringify(barrier + '.pending')}, JSON.stringify({ pid: process.pid,
      snapshot: path.join(${JSON.stringify(temporary)}, parts[0]), file }));
    fs.renameSync(${JSON.stringify(barrier + '.pending')}, ${JSON.stringify(barrier)});
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  }
  return result;
};
syncBuiltinESMExports();
materializeRawGitTree({ repositoryRoot: ${JSON.stringify(root)}, tree: ${JSON.stringify(tree)} }).cleanup();
`);
      const waitFor = async (condition, message) => {
        const deadline = Date.now() + 5000;
        while (!condition()) {
          assert.ok(Date.now() < deadline, message);
          await delay(20);
        }
      };
      const child = spawn(process.execPath, [script], { cwd: packed, env,
        stdio: ['ignore', 'ignore', 'pipe'], timeout: 10000, killSignal: 'SIGKILL' });
      let closed = null, spawnError = null, stderr = '';
      child.on('error', (error) => { spawnError = error; });
      child.on('close', (code, signal) => { closed = { code, signal }; });
      child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
      try {
        await waitFor(() => fs.existsSync(barrier) || closed || spawnError, 'packed materializer did not write a checkout blob');
        assert.equal(spawnError, null);
        assert.equal(closed, null, stderr);
        const active = JSON.parse(fs.readFileSync(barrier, 'utf8'));
        assert.equal(active.pid, child.pid);
        assert.equal(path.dirname(active.snapshot), temporary);
        assert.ok(fs.statSync(active.file).isFile());
        assert.equal(child.kill('SIGTERM'), true);
        await waitFor(() => closed, 'packed materializer did not terminate after SIGTERM');
        assert.deepEqual(closed, { code: null, signal: 'SIGTERM' }, stderr);
        await waitFor(() => !fs.existsSync(active.snapshot), 'packed guardian did not reclaim the snapshot within 5 seconds');
        assert.deepEqual(fs.readdirSync(temporary).filter((name) => name.startsWith('workflow-visual-refresh-tree-')), []);
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        child.stderr.destroy();
      }
    });
});
