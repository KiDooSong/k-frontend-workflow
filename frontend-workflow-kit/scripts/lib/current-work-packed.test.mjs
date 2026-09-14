import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LIB = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.resolve(LIB, '../..');

test('packed consumer payload contains and executes current-work runtime/reference', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'current-work-packed-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const packed = path.join(temp, 'kit');
  const pack = spawnSync(process.execPath, [path.join(KIT, 'scripts/pack-frontend-workflow-kit.mjs'), '--out', packed], {
    cwd: KIT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(pack.status, 0, pack.stderr || pack.stdout);
  for (const relative of [
    'scripts/lib/current-work-request.mjs',
    'scripts/lib/current-work-execution.mjs',
    'scripts/lib/current-work-cli.mjs',
    'scripts/readiness.mjs',
    'scripts/workflow-packet.mjs',
    'scripts/workflow-run.mjs',
    'scripts/workflow-report.mjs',
    'scripts/forbidden-paths.mjs',
    'docs/reference/current-work.md',
  ]) assert.equal(fs.existsSync(path.join(packed, relative)), true, `packed missing ${relative}`);
  assert.equal(fs.existsSync(path.join(packed, 'scripts/lib/current-work-packed.test.mjs')), false);

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
    { cwd: packed, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const out = JSON.parse(run.stdout);
  assert.equal(out.work_contract, 1);
  assert.equal(out.authority, 'current');
  assert.equal(out.ready, true);
});
