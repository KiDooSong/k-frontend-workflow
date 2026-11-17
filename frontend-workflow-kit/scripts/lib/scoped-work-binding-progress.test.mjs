import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { KIT_ROOT } from './util.mjs';
import { withWorkflowProgress, withBindingStatusProgress, bindingStatusProgress } from './workflow-progress.mjs';

const FIXTURE_ROOT = process.env.SCOPED_WORK_TEST_FIXTURE_ROOT || KIT_ROOT;
const OWNER = 'screen:COUPON-001';
const LIST = 'docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md';
const CONFIG = ['--docs', 'docs/frontend-workflow', '--src', 'src', '--policy', 'config/policy.yaml',
  '--manifest', 'config/manifest.yaml', '--layout', 'config/layout.yaml'];
const TOOL = path.join(KIT_ROOT, 'scripts/binding-status.mjs');

function project(t, broken = false) {
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'binding-progress-')));
  const root = path.join(scratch, 'project'), temporary = path.join(scratch, 'tmp');
  fs.mkdirSync(root); fs.mkdirSync(temporary);
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const put = (relative, content) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content);
  };
  for (const name of ['docs', 'src']) fs.cpSync(path.join(FIXTURE_ROOT, 'examples/coupon-feature', name),
    path.join(root, name), { recursive: true });
  for (const [name, original] of [['policy.yaml', 'policies/implementation-mode-policy.yaml'],
    ['manifest.yaml', 'catalog/artifact-manifest.yaml'], ['layout.yaml', 'presets/expo-feature.yaml']]) {
    put(`config/${name}`, fs.readFileSync(path.join(KIT_ROOT, original)));
  }
  put('config/adoption.yaml', `work_execution: ${JSON.stringify({ version: 1, owners: [OWNER], profiles: ['behavior'],
    role_limits: { behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] })}\n`);
  put('frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: config/adoption.yaml\n');
  const body = fs.readFileSync(path.join(root, LIST), 'utf8'), end = body.indexOf('\n---\n', 4);
  const units = { version: 1, units: [{ id: 'list-behavior', kind: 'behavior', sources: [],
    contracts: [broken ? 'artifact:MISSING#rules' : 'artifact:COUPON-001-screen-spec#state-matrix'] }] };
  const common = { owner: OWNER, known_units: ['list-behavior'], blocks: [],
    basis_digest: `sha256:${'0'.repeat(64)}`, approval_ref: 'docs/approvals/progress.md#synthetic' };
  put(LIST, `${body.slice(0, end)}\nscreen_entry: src/features/coupons/screens/CouponListScreen.tsx` +
    `\nwork_execution: ${JSON.stringify(units)}` +
    `\ndecision_work_scopes: ${JSON.stringify({ version: 1, bindings: [{ ...common, decision_id: 'D-003' }] })}` +
    `\nuncertainty_work_scopes: ${JSON.stringify({ version: 1, bindings: [{ ...common, unknown_id: 'U-001' }] })}${body.slice(end)}`);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q'); git('config', 'user.name', 'test'); git('config', 'user.email', 'test@example.invalid');
  git('config', 'gc.auto', '0'); git('config', 'maintenance.auto', 'false');
  git('add', '-A'); git('commit', '-qm', 'Synthetic binding progress fixture');
  const env = { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary };
  const command = (...args) => [TOOL, '--root', root, ...CONFIG, '--owner', OWNER, ...args];
  const cli = (...args) => spawnSync(process.execPath, command(...args),
    { cwd: root, env, encoding: 'utf8', timeout: 60000, maxBuffer: 32 * 1024 * 1024 });
  return { scratch, root, temporary, env, command, cli, git };
}

function success(result) {
  assert.equal(result.error, undefined); assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function phases(stderr) {
  return stderr.trimEnd().split('\n').map((line) => {
    assert.match(line, /^binding-status \[\d+\.\d{3}s\] /);
    return line.match(/^binding-status \[[^\]]+\] ([a-z-]+:[a-z]+)/)[1];
  });
}

test('#323 binding progress contexts keep report phases out of workflow-run and nested opt-out', (t) => {
  const chunks = [], original = fs.writeSync;
  const hook = t.mock.method(fs, 'writeSync', function(fd, bytes, offset, length, ...args) {
    if (fd !== 2) return original.call(this, fd, bytes, offset, length, ...args);
    chunks.push(Buffer.from(bytes.subarray(offset, offset + length))); return length;
  });
  try {
    withWorkflowProgress(true, () => bindingStatusProgress('hidden:start'));
    assert.equal(withBindingStatusProgress(true, () => {
      withBindingStatusProgress(false, () => bindingStatusProgress('hidden:start'));
      bindingStatusProgress('decision-bindings:progress', '1/37 checked');
      return 23;
    }), 23);
    const before = Buffer.concat(chunks).toString('utf8');
    bindingStatusProgress('outside:start');
    assert.equal(Buffer.concat(chunks).toString('utf8'), before);
    assert.doesNotMatch(before, /hidden|outside/);
    const lines = before.trimEnd().split('\n');
    assert.equal(lines.length, 5);
    assert.ok(lines.slice(0, 2).every((line) => line.startsWith('workflow:run [')));
    assert.ok(lines.slice(2).every((line) => line.startsWith('binding-status [')));
    assert.match(lines[3], /decision-bindings:progress "1\/37 checked"$/);
  } finally { hook.mock.restore(); }
});

for (const json of [false, true]) test(`#323 binding progress preserves ${json ? 'JSON' : 'text'} output, digest states and repository bytes`, (t) => {
  const p = project(t), args = json ? ['--json'] : [];
  const before = p.git('rev-parse', 'HEAD'), index = fs.readFileSync(path.join(p.root, '.git/index'));
  const plain = p.cli(...args), observed = p.cli(...args, '--progress');
  success(plain); success(observed);
  assert.equal(plain.stderr, ''); assert.equal(observed.stdout, plain.stdout);
  const steps = phases(observed.stderr);
  for (const phase of ['run:start', 'snapshot:start', 'snapshot:done', 'inputs:start', 'inputs:done', 'owner:start',
    'owner-projection:start', 'owner-projection:done', 'decision-bindings:start', 'decision-bindings:done',
    'uncertainty-bindings:start', 'uncertainty-bindings:done', 'owner:done', 'cleanup:start', 'cleanup:done', 'run:done']) {
    assert.ok(steps.includes(phase), `missing phase ${phase}`);
  }
  assert.equal(steps[0], 'run:start'); assert.equal(steps.at(-1), 'run:done');
  assert.ok(steps.indexOf('snapshot:done') < steps.indexOf('owner-projection:start'));
  assert.ok(steps.indexOf('owner:done') < steps.indexOf('cleanup:start'));
  if (json) {
    const report = JSON.parse(observed.stdout), rows = report.owners[0].rows;
    const computed = rows.filter((row) => row.computed_basis_digest !== null).length;
    assert.ok(computed > 0, 'the fixture must exercise real digest work');
    assert.equal(steps.filter((phase) => phase === 'binding-digest:start').length, computed);
    assert.equal(steps.filter((phase) => phase === 'binding-digest:done').length, computed);
    assert.equal(report.approval_verified, false);
    assert.equal(rows.find((row) => row.ref === 'decision:D-003@COUPON-001-screen-spec').stale_reason, 'basis');
    assert.equal(rows.find((row) => row.ref === 'decision:D-001@COUPON-001-screen-spec').computed_basis_digest, null,
      'diagnostics must not turn missing rows into computed bindings');
  }
  assert.deepEqual(fs.readdirSync(p.temporary), []);
  assert.equal(p.git('rev-parse', 'HEAD'), before); assert.equal(p.git('status', '--porcelain'), '');
  assert.deepEqual(fs.readFileSync(path.join(p.root, '.git/index')), index);
});

test('#323 binding progress can reach stderr before synchronous snapshot preparation completes', async (t) => {
  const p = project(t), plain = p.cli('--json'); success(plain);
  const preload = path.join(p.scratch, 'pause-snapshot.cjs'), acknowledged = path.join(p.scratch, 'acknowledged');
  fs.writeFileSync(preload, `
const fs = require('node:fs'), original = fs.writeSync;
let paused = false;
fs.writeSync = function(fd, bytes, ...args) {
  const result = original.call(this, fd, bytes, ...args);
  if (!paused && fd === 2 && Buffer.isBuffer(bytes) && bytes.includes(Buffer.from('snapshot:start'))) {
    paused = true;
    const ack = Buffer.alloc(1);
    if (fs.readSync(0, ack, 0, 1, null) !== 1 || ack[0] !== 120) throw new Error('missing snapshot acknowledgment');
    fs.writeFileSync(${JSON.stringify(acknowledged)}, 'acknowledged');
  }
  return result;
};
`);
  const child = spawn(process.execPath, ['--require', preload, ...p.command('--json', '--progress')],
    { cwd: p.root, env: p.env, stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000, killSignal: 'SIGKILL' });
  let stdout = '', stderr = '', released = false, atPause, stdinError;
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    if (!released && stderr.includes('snapshot:start')) {
      released = true; atPause = { stdout, running: child.exitCode === null };
      child.stdin.end('x');
    }
  });
  child.stdin.on('error', (error) => { stdinError = error; });
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal }));
  });
  assert.deepEqual(result, { code: 0, signal: null }, stderr);
  assert.equal(stdinError, undefined); assert.equal(released, true);
  assert.deepEqual(atPause, { stdout: '', running: true });
  assert.equal(fs.readFileSync(acknowledged, 'utf8'), 'acknowledged');
  assert.equal(stdout, plain.stdout); assert.match(stderr, /run:done/);
  assert.deepEqual(fs.readdirSync(p.temporary), []);
});

for (const failure of ['owner', 'materialization']) test(`#323 failing ${failure} shows cleanup before the actual deletion and preserves its error`, async (t) => {
  const p = project(t, failure === 'owner');
  const preload = path.join(p.scratch, 'pause-cleanup.cjs'), paused = path.join(p.scratch, 'cleanup.json');
  fs.writeFileSync(preload, `
const fs = require('node:fs'), path = require('node:path'), remove = fs.rmSync, write = fs.writeFileSync;
let blocked = false, injected = false;
fs.writeFileSync = function(file, ...args) {
  const result = write.call(this, file, ...args);
  const parts = path.relative(${JSON.stringify(p.temporary)}, String(file)).split(path.sep);
  if (${failure === 'materialization'} && !injected && parts[0].startsWith('workflow-visual-refresh-tree-') &&
      parts[1] === 'checkout' && parts.length > 2) {
    injected = true;
    throw new Error('synthetic materialization failure');
  }
  return result;
};
fs.rmSync = function(file, ...args) {
  if (process.env.FWK_TEST_PAUSE_CLEANUP === '1' && !blocked && path.basename(String(file)) === 'checkout' &&
      path.basename(path.dirname(String(file))).startsWith('workflow-visual-refresh-tree-')) {
    blocked = true;
    fs.writeFileSync(${JSON.stringify(paused)}, JSON.stringify({ file: String(file) }));
    fs.writeSync(2, 'TEST cleanup paused before deletion\\n');
    const ack = Buffer.alloc(1);
    if (fs.readSync(0, ack, 0, 1, null) !== 1 || ack[0] !== 120) throw new Error('missing cleanup acknowledgment');
  }
  return remove.call(this, file, ...args);
};
`);
  const plain = spawnSync(process.execPath, ['--require', preload, ...p.command('--json')],
    { cwd: p.root, env: { ...p.env, FWK_TEST_PAUSE_CLEANUP: '0' }, encoding: 'utf8', timeout: 60000 });
  assert.equal(plain.status, 2); assert.equal(plain.stdout, '');
  assert.doesNotMatch(plain.stderr, /binding-status \[/); assert.deepEqual(fs.readdirSync(p.temporary), []);
  if (failure === 'materialization') assert.match(plain.stderr, /raw Git tree materialization failed: synthetic materialization failure/);
  const child = spawn(process.execPath, ['--require', preload, ...p.command('--json', '--progress')],
    { cwd: p.root, env: { ...p.env, FWK_TEST_PAUSE_CLEANUP: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000, killSignal: 'SIGKILL' });
  let stdout = '', stderr = '', released = false, atPause, pauseError, stdinError;
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    if (!released && stderr.includes('TEST cleanup paused before deletion')) {
      released = true;
      try {
        const snapshot = JSON.parse(fs.readFileSync(paused, 'utf8'));
        atPause = { stdout, stderr, running: child.exitCode === null, snapshotExists: fs.existsSync(snapshot.file) };
      } catch (error) { pauseError = error; }
      finally { child.stdin.end('x'); }
    }
  });
  child.stdin.on('error', (error) => { stdinError = error; });
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal }));
  });
  assert.deepEqual(result, { code: plain.status, signal: null }, stderr);
  assert.equal(stdinError, undefined); assert.equal(pauseError, undefined); assert.equal(released, true);
  assert.equal(atPause.running, true); assert.equal(atPause.snapshotExists, true); assert.equal(atPause.stdout, '');
  assert.match(atPause.stderr, /cleanup:start/); assert.doesNotMatch(atPause.stderr, /cleanup:done|run:failed/);
  assert.equal(stdout, plain.stdout); assert.ok(stderr.endsWith(plain.stderr));
  if (failure === 'owner') assert.match(stderr, /owner:start/);
  else { assert.match(stderr, /snapshot:start/); assert.doesNotMatch(stderr, /snapshot:done|owner:start/); }
  assert.match(stderr, /run:failed/); assert.doesNotMatch(stderr, /run:done/);
  assert.equal((stderr.match(/cleanup:start/g) || []).length, 1);
  assert.equal((stderr.match(/cleanup:done/g) || []).length, 1);
  assert.deepEqual(fs.readdirSync(p.temporary), []);
});

test('#323 a closed progress sink preserves the binding report and successful exit', (t) => {
  const p = project(t), plain = p.cli('--json'); success(plain);
  const preload = path.join(p.scratch, 'closed-progress.cjs');
  fs.writeFileSync(preload, `
const fs = require('node:fs'), original = fs.writeSync;
fs.writeSync = function(fd, ...args) {
  if (fd === 2) throw Object.assign(new Error('closed progress sink'), { code: 'EPIPE' });
  return original.call(this, fd, ...args);
};
`);
  const observed = spawnSync(process.execPath, ['--require', preload, ...p.command('--json', '--progress')],
    { cwd: p.root, env: p.env, encoding: 'utf8', timeout: 60000, maxBuffer: 32 * 1024 * 1024 });
  success(observed); assert.equal(observed.stdout, plain.stdout); assert.equal(observed.stderr, '');
  assert.deepEqual(fs.readdirSync(p.temporary), []);
});

test('#323 binding progress is an opt-in boolean and help explains stderr', () => {
  const cli = (...args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', timeout: 10000 });
  for (const args of [['--progress=true'], ['--progress', 'true'], ['--progress=false', '--progress']]) {
    const result = cli(...args);
    assert.equal(result.status, 2); assert.equal(result.stdout, '');
    assert.match(result.stderr, /--progress does not accept a value/);
    assert.doesNotMatch(result.stderr, /binding-status \[/);
  }
  const help = cli('--progress', '--help'); success(help);
  assert.match(help.stdout, /--progress.*stderr/); assert.equal(help.stderr, '');
});
