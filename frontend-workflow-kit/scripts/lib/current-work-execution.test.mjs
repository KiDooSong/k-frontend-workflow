import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.resolve(LIB_DIR, '../..');
const SCRIPTS = path.join(KIT, 'scripts');
const SCREEN = 'src/features/coupons/screens/CouponListScreen.tsx';

function run(script, args, options = {}) {
  return spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    cwd: options.cwd || KIT,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
    maxBuffer: 32 * 1024 * 1024,
  });
}
function json(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
function writeRequest(t, value) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'current-work-request-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'request.json');
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}
function request({ path: target = SCREEN, change = 'M', mode = 'rough-fixture-ui', origins = [] } = {}) {
  return {
    version: 1,
    origin_inputs: origins,
    requests: [{ owner: 'screen:COUPON-001', authority: 'current', requested_mode: mode, targets: [{ path: target, change }] }],
  };
}
function copyDir(source, destination) { fs.cpSync(source, destination, { recursive: true }); }
function project(t, { malformedPolicy = false, origin = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'current-work-project-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  copyDir(path.join(KIT, 'examples/coupon-feature/docs'), path.join(root, 'docs'));
  copyDir(path.join(KIT, 'examples/coupon-feature/src'), path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.copyFileSync(path.join(KIT, 'policies/implementation-mode-policy.yaml'), path.join(root, 'config/policy.yaml'));
  fs.copyFileSync(path.join(KIT, 'catalog/artifact-manifest.yaml'), path.join(root, 'config/manifest.yaml'));
  fs.copyFileSync(path.join(KIT, 'presets/expo-feature.yaml'), path.join(root, 'config/layout.yaml'));
  if (malformedPolicy) {
    const file = path.join(root, 'config/policy.yaml');
    let raw = fs.readFileSync(file, 'utf8');
    raw = raw.replace('screen_spec_status >= draft', 'screen_spec_status ?? draft');
    fs.writeFileSync(file, raw);
  }
  if (origin) {
    const inputDir = path.join(root, 'docs/frontend-workflow/inputs');
    fs.mkdirSync(inputDir, { recursive: true });
    let input = fs.readFileSync(path.join(KIT, 'examples/reconciliation-validation/v2-pass/docs/frontend-workflow/inputs/IN-20260720-figma-001.md'), 'utf8');
    if (origin === 'unconnected') input = input.replace('affected_screens: ["COUPON-001"]', 'affected_screens: ["OTHER-001"]');
    fs.writeFileSync(path.join(inputDir, 'IN-20260720-figma-001.md'), input);
    fs.mkdirSync(path.join(root, 'docs/frontend-workflow/_meta'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/frontend-workflow/_meta/reconciliation-register.md'), `---\ntitle: Current work origin fixture\nstatus: draft\nkind: meta-register\n---\n\n# Reconciliation Register\n\n| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |\n|---|---|---|---|---|---|---|---|\n| IN-20260720-figma-001 | figma | simple-update | reconciled | accepted | ${origin === 'unconnected' ? 'OTHER-001 screen-spec' : 'COUPON-001 screen-spec'} | - | - |\n`);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'baseline'], { cwd: root });
  return root;
}
function common(root, work) {
  return ['--work', work, '--root', root, '--docs', 'docs/frontend-workflow', '--src', 'src', '--policy', 'config/policy.yaml', '--manifest', 'config/manifest.yaml', '--layout', 'config/layout.yaml'];
}

test('W01: no-work readiness wrapper preserves legacy stdout/stderr/exit', (t) => {
  const root = project(t);
  const args = ['--docs', path.join(root, 'docs/frontend-workflow'), '--policy', path.join(root, 'config/policy.yaml'), '--manifest', path.join(root, 'config/manifest.yaml'), '--layout', path.join(root, 'config/layout.yaml'), '--screen', 'COUPON-001', '--json'];
  const wrapped = run('readiness.mjs', args);
  const legacy = run('readiness-legacy.mjs', args);
  assert.equal(wrapped.status, legacy.status);
  assert.equal(wrapped.stdout, legacy.stdout);
  assert.equal(wrapped.stderr, legacy.stderr);
});

test('W02/W03: current keeps higher prerequisites as future but uses exact current path authority', (t) => {
  const root = project(t);
  const good = writeRequest(t, request());
  const ready = json(run('readiness.mjs', [...common(root, good), '--json']));
  assert.equal(ready.ready, true);
  assert.equal(ready.requests[0].readiness_mode, 'rough-fixture-ui');
  assert.ok(ready.future_requirements.length > 0);
  assert.equal(ready.requests[0].path_authorizations[0].allowed, true);

  const bad = writeRequest(t, request({ path: 'src/api/client.ts', change: 'A' }));
  const denied = json(run('readiness.mjs', [...common(root, bad), '--json']));
  assert.equal(denied.ready, false);
  assert.ok(denied.denials.some((entry) => entry.code === 'CW-PATH-DENIED'));
});

test('W04: malformed current policy remains an execution error, not future-only', (t) => {
  const root = project(t, { malformedPolicy: true });
  const work = writeRequest(t, request({ mode: 'docs-only', path: 'docs/frontend-workflow/global/llm-rules.md' }));
  const out = json(run('readiness.mjs', [...common(root, work), '--json']));
  assert.equal(out.ready, false);
  assert.ok(out.errors.some((entry) => entry.code === 'CW-AUTHORITY-INVALID'));
});

test('generated/do-not-edit ownership is final even when current mode glob matches', (t) => {
  const root = project(t);
  const work = writeRequest(t, request({ mode: 'docs-only', path: 'docs/frontend-workflow/_meta/workflow-state.yaml' }));
  const out = json(run('readiness.mjs', [...common(root, work), '--json']));
  assert.equal(out.ready, false);
  assert.match(out.denials[0].reason, /generated\/do-not-edit ownership is final/);
});

test('W33/W35: origin stays non-ready while unconnected and becomes ready after canonical connection', (t) => {
  const origin = [{ input_id: 'IN-20260720-figma-001', source_refs: [] }];
  const disconnectedRoot = project(t, { origin: 'unconnected' });
  const disconnectedWork = writeRequest(t, request({ origins: origin }));
  const disconnected = json(run('readiness.mjs', [...common(disconnectedRoot, disconnectedWork), '--json']));
  assert.equal(disconnected.ready, false);
  assert.ok(disconnected.denials.some((entry) => entry.code === 'CW-ORIGIN-UNCONNECTED'));
  assert.equal(disconnected.origin_inputs[0].input_id, origin[0].input_id);

  const connectedRoot = project(t, { origin: 'connected' });
  const connectedWork = writeRequest(t, request({ origins: origin }));
  const ready = json(run('readiness.mjs', [...common(connectedRoot, connectedWork), '--json']));
  assert.equal(ready.ready, true);
  assert.equal(ready.origin_inputs[0].input_id, origin[0].input_id);
  assert.match(ready.origin_inputs[0].raw_hash, /^sha256:/);
  assert.deepEqual(ready.origin_inputs[0].related_owners, ['screen:COUPON-001']);
});

test('W34: unresolved origin source ref is a usage/tool error before output execution', (t) => {
  const root = project(t, { origin: 'connected' });
  const work = writeRequest(t, request({ origins: [{ input_id: 'IN-20260720-figma-001', source_refs: ['input:IN-20260720-figma-001#missing/01'] }] }));
  const result = run('readiness.mjs', [...common(root, work), '--json']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unresolved source ref/);
  assert.equal(result.stdout, '');
});

test('five public CLIs preserve request/origin/digest and backstop actual Git diff', (t) => {
  const root = project(t, { origin: 'connected' });
  const origin = [{ input_id: 'IN-20260720-figma-001', source_refs: [] }];
  const work = writeRequest(t, request({ origins: origin }));
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'current-work-output-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const args = common(root, work);

  const readiness = json(run('readiness.mjs', [...args, '--json']));
  const packet = json(run('workflow-packet.mjs', [...args, '--out', path.join(output, 'packet.md'), '--json']));
  const before = json(run('workflow-run.mjs', [...args, '--json']));
  assert.equal(before.state, 'HALT_READY_FOR_WORK');

  fs.appendFileSync(path.join(root, SCREEN), '\n// current-work integration\n');
  const forbidden = json(run('forbidden-paths.mjs', [...args, '--json']));
  const report = json(run('workflow-report.mjs', [...args, '--packet', path.join(output, 'packet.md'), '--json']));
  const after = json(run('workflow-run.mjs', [...args, '--json']));

  assert.equal(forbidden.ok, true);
  assert.equal(report.backstop.ok, true);
  assert.equal(after.state, 'DONE_PENDING_REVIEW');
  assert.equal(after.backstop.ok, true);
  for (const env of [readiness, packet, forbidden, report, after]) {
    assert.equal(env.request_digest, readiness.request_digest);
    assert.equal(env.origin_inputs[0].input_id, origin[0].input_id);
    assert.equal(env.origin_inputs[0].raw_hash, readiness.origin_inputs[0].raw_hash);
  }
});

test('backstop is advisory by default, --enforce exits 1, and detects unrequested files', (t) => {
  const root = project(t);
  const work = writeRequest(t, request());
  const args = common(root, work);
  fs.appendFileSync(path.join(root, SCREEN), '\n// allowed\n');
  fs.mkdirSync(path.join(root, 'src/unrequested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/unrequested/file.ts'), 'export const nope = true;\n');
  const advisory = run('forbidden-paths.mjs', [...args, '--json']);
  assert.equal(advisory.status, 0, advisory.stderr);
  const body = JSON.parse(advisory.stdout);
  assert.equal(body.ok, false);
  assert.ok(body.violations.some((entry) => entry.code === 'CW-GIT-UNREQUESTED' && entry.path === 'src/unrequested/file.ts'));
  const enforce = run('forbidden-paths.mjs', [...args, '--enforce', '--json']);
  assert.equal(enforce.status, 1, enforce.stderr);
});

test('packet is audit-only: request byte changes are rejected on report', (t) => {
  const root = project(t);
  const work = writeRequest(t, request());
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'current-work-packet-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const args = common(root, work);
  const packet = run('workflow-packet.mjs', [...args, '--out', path.join(output, 'packet.md'), '--json']);
  assert.equal(packet.status, 0, packet.stderr);
  fs.appendFileSync(work, '\n');
  const report = run('workflow-report.mjs', [...args, '--packet', path.join(output, 'packet.md'), '--json']);
  assert.equal(report.status, 2);
  assert.match(report.stderr, /work request bytes changed/);
});

test('work branch rejects legacy/visual tuple flags instead of silently mixing authority', (t) => {
  const root = project(t);
  const work = writeRequest(t, request());
  for (const extra of [['--screen', 'COUPON-001'], ['--intent', 'visual-refresh'], ['--requested-mode', 'rough-fixture-ui']]) {
    const result = run('readiness.mjs', [...common(root, work), ...extra, '--json']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /unknown option/);
  }
});
