// Regression witnesses for the follow-up review of PR #243 at 89715634.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET = 'src/features/coupons/screens/CouponListScreen.tsx';
const INPUT = 'IN-20260720-figma-001';
function fixture(t, { inside = true, prefix = '' } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'current-review-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, 'repo'), root = path.join(repo, prefix);
  fs.mkdirSync(root, { recursive: true });
  for (const name of ['docs', 'src']) fs.cpSync(path.join(KIT, 'examples/coupon-feature', name), path.join(root, name), { recursive: true });
  fs.mkdirSync(path.join(root, 'config'));
  for (const [from, to] of [['policies/implementation-mode-policy.yaml', 'policy.yaml'], ['catalog/artifact-manifest.yaml', 'manifest.yaml'], ['presets/expo-feature.yaml', 'layout.yaml']]) fs.copyFileSync(path.join(KIT, from), path.join(root, 'config', to));
  const git = (args, input) => execFileSync('git', args, { cwd: repo, input, stdio: ['pipe', 'pipe', 'pipe'] });
  git(['init', '-q']); git(['config', 'user.name', 'test']); git(['config', 'user.email', 'test@example.com']);
  git(['add', '-A']); git(['commit', '-qm', 'baseline']);
  const work = inside ? path.join(root, '.workflow/current-work.json') : path.join(temp, 'work.json');
  fs.mkdirSync(path.dirname(work), { recursive: true });
  const request = { version: 1, origin_inputs: [], requests: [{ owner: 'screen:COUPON-001', authority: 'current', requested_mode: 'rough-fixture-ui', targets: [{ path: TARGET, change: 'M' }] }] };
  const writeRequest = () => fs.writeFileSync(work, JSON.stringify(request));
  writeRequest();
  const args = ['--work', work, '--root', root, '--docs', 'docs/frontend-workflow', '--src', 'src', '--policy', 'config/policy.yaml', '--manifest', 'config/manifest.yaml', '--layout', 'config/layout.yaml'];
  const cli = (script, extra = []) => spawnSync(process.execPath, [path.join(KIT, 'scripts', script + '.mjs'), ...args, ...extra, '--json'], { cwd: KIT, encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  return { temp, repo, root, work, request, writeRequest, args, cli, git, target: path.join(root, TARGET) };
}
function body(result, status = 0) {
  assert.equal(result.status, status, result.stderr || result.stdout || result.error?.message);
  return JSON.parse(result.stdout);
}

for (const prefix of ['', 'apps/mobile']) {
  test(`review P1-1: in-project new request is not implementation (${prefix || 'root'})`, (t) => {
    const f = fixture(t, { prefix });
    const beforeIndex = fs.readFileSync(path.join(f.repo, '.git/index'));
    const readiness = body(f.cli('readiness'));
    const packet = path.join(f.temp, 'packet.md');
    body(f.cli('workflow-packet', ['--out', packet]));
    assert.equal(body(f.cli('workflow-run')).state, 'HALT_READY_FOR_WORK');
    const before = body(f.cli('forbidden-paths'));
    assert.equal(before.implementation_records.length, 0);
    assert.equal(before.execution_input_records.length, 1);
    assert.equal(before.execution_input_records[0].projectPath, '.workflow/current-work.json');
    assert.ok(!before.violations.some(v => v.path === '.workflow/current-work.json'));
    fs.appendFileSync(f.target, '\n// requested implementation\n');
    const after = body(f.cli('forbidden-paths', ['--enforce']));
    assert.equal(after.ok, true);
    assert.equal(after.implementation_records.length, 1);
    assert.equal(after.request_digest, readiness.request_digest);
    assert.equal(body(f.cli('workflow-report', ['--packet', packet])).backstop.ok, true);
    assert.equal(body(f.cli('workflow-run')).state, 'DONE_PENDING_REVIEW');
    assert.deepEqual(fs.readFileSync(path.join(f.repo, '.git/index')), beforeIndex);
  });
}

test('review P1-1: only the pinned request is classified; another .workflow file is still unrequested', (t) => {
  const f = fixture(t);
  fs.appendFileSync(f.target, '\n// requested\n');
  fs.writeFileSync(path.join(f.root, '.workflow/other.json'), '{}');
  const out = body(f.cli('forbidden-paths', ['--enforce']), 1);
  assert.equal(out.execution_input_records.length, 1);
  assert.ok(out.violations.some(v => v.code === 'CW-GIT-UNREQUESTED' && v.path === '.workflow/other.json'));
});

test('review P1-1: staged request is bound to raw input bytes, not the worktree substitute', (t) => {
  const f = fixture(t);
  fs.appendFileSync(f.target, '\n// requested\n');
  f.git(['add', TARGET, '.workflow/current-work.json']);
  assert.equal(body(f.cli('forbidden-paths', ['--staged', '--enforce'])).ok, true);
  fs.appendFileSync(f.work, '\n'); // semantic digest is equal but raw hash differs
  const out = body(f.cli('forbidden-paths', ['--staged', '--enforce']), 1);
  assert.ok(out.violations.some(v => v.path === '.workflow/current-work.json'));
});

test('review P1-1: packet raw binding and requested-source classification cannot be bypassed', (t) => {
  const f = fixture(t);
  const packet = path.join(f.temp, 'packet.md');
  body(f.cli('workflow-packet', ['--out', packet]));
  fs.appendFileSync(f.work, '\n');
  const mismatch = f.cli('workflow-report', ['--packet', packet]);
  assert.equal(mismatch.status, 2); assert.match(mismatch.stderr, /request bytes changed/);
  f.request.requests[0].targets = [{ path: '.workflow/current-work.json', change: 'A' }]; f.writeRequest();
  const requested = body(f.cli('forbidden-paths', ['--enforce']), 1);
  assert.equal(requested.execution_input_records.length, 0);
  assert.ok(requested.violations.some(v => v.path === '.workflow/current-work.json'));
});
