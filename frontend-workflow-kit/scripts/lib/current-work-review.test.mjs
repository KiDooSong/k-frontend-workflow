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

const REGISTER = 'docs/frontend-workflow/_meta/reconciliation-register.md';
const MAPPING = 'docs/frontend-workflow/domains/coupons/screens/coupon-list/figma-component-mapping.md';
function originFixture(t, { v2 = false } = {}) {
  const f = fixture(t);
  const source = path.join(KIT, 'examples/reconciliation-validation/v2-pass/docs/frontend-workflow');
  if (v2) fs.cpSync(source, path.join(f.root, 'docs/frontend-workflow'), { recursive: true });
  else {
    fs.mkdirSync(path.join(f.root, 'docs/frontend-workflow/inputs'), { recursive: true });
    fs.copyFileSync(path.join(source, `inputs/${INPUT}.md`), path.join(f.root, `docs/frontend-workflow/inputs/${INPUT}.md`));
    fs.writeFileSync(path.join(f.root, REGISTER), `| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |\n|---|---|---|---|---|---|---|---|\n| ${INPUT} | figma | simple-update | reconciled | accepted | COUPON-001 screen-spec | - | - |\n`);
  }
  f.request.origin_inputs = [{ input_id: INPUT, source_refs: [] }]; f.writeRequest();
  const commit = () => { f.git(['add', 'docs']); f.git(['commit', '-qm', 'canonical reconciliation']); };
  commit();
  return { ...f, commit, register: path.join(f.root, REGISTER), mapping: path.join(f.root, MAPPING) };
}

test('review P1-2: missing required register columns is an input error before any output', (t) => {
  const f = originFixture(t);
  fs.writeFileSync(f.register, `| Input ID | Reconcile Status |\n|---|---|\n| ${INPUT} | reconciled |\n`); f.commit();
  const output = path.join(f.temp, 'must-not-write.json');
  const result = f.cli('readiness', ['--out', output]);
  assert.equal(result.status, 2); assert.match(result.stderr, /필수 컬럼|register/i);
  assert.equal(fs.existsSync(output), false);
});

test('review P1-2: normal unrelated partial remains warning-only; selected partial stays non-ready', (t) => {
  const f = originFixture(t);
  const other = 'IN-20260720-figma-002';
  const original = fs.readFileSync(path.join(f.root, `docs/frontend-workflow/inputs/${INPUT}.md`), 'utf8');
  fs.writeFileSync(path.join(f.root, `docs/frontend-workflow/inputs/${other}.md`), original.replaceAll(INPUT, other).replace('COUPON-001', 'OTHER-001'));
  fs.appendFileSync(f.register, `| ${other} | figma | simple-update | partially-reconciled | pending | OTHER-001 screen-spec | - | - |\n`); f.commit();
  const result = body(f.cli('readiness'));
  assert.equal(result.ready, true);
  assert.ok(result.reconciliation_warnings.some(w => w.message.includes('RR-LIFECYCLE-101')));
  f.request.origin_inputs = [{ input_id: other, source_refs: [] }]; f.writeRequest();
  assert.equal(body(f.cli('readiness')).ready, false);
});

test('review P1-2: v2 completion runs existing typed target, evidence, routing and contract checks', (t) => {
  const f = originFixture(t, { v2: true });
  assert.equal(body(f.cli('readiness')).ready, true);
  const raw = fs.readFileSync(f.register, 'utf8');
  for (const [from, to] of [
    ['#extracted-facts/01', '#missing-section/01'],
    ['artifact:COUPON-001-figma-component-mapping#component-mapping/M-001', 'artifact:MISSING#component-mapping/M-001'],
    ['| visual-evidence |', '| unknown-basis |'],
    ['reconciliation_contract: 2', 'reconciliation_contract: 3'],
  ]) {
    fs.writeFileSync(f.register, raw.replace(from, to)); f.commit();
    const result = f.cli('readiness');
    assert.equal(result.status, 2, `${from}: ${result.stderr || result.stdout}`);
    assert.match(result.stderr, /reconciliation|register|RR-|RP-/i);
  }
});

test('review P2-1: relation uses the resolved typed artifact owner, never ID or URL substrings', async (t) => {
  const { relatedToOwner } = await import('./current-work-execution-core.mjs');
  const { buildReconciliationTargetIndex } = await import('./reconciliation-target-index.mjs');
  const f = originFixture(t, { v2: true });
  const artifact = { fm: { input_id: INPUT, affected_screens: ['COUPON-0010'] } };
  const parts = { kind: 'screen', id: 'COUPON-001' };
  const state = { screens: { 'COUPON-001': { domain: 'coupons' } } };
  const docs = [{ file: f.mapping, fm: { artifact_id: 'COUPON-0010-figma-component-mapping', artifact_type: 'figma-component-mapping', screen_id: 'COUPON-0010', domain: 'coupons' } }];
  const rows = [{ inputId: INPUT, target: 'artifact:COUPON-0010-figma-component-mapping#component-mapping/M-001', sourceRef: 'https://example.invalid/COUPON-001' }];
  assert.equal(relatedToOwner(artifact, parts, state, rows, buildReconciliationTargetIndex({ docs })), false);
  assert.equal(relatedToOwner(artifact, parts, state, rows), false);
  docs[0].fm.artifact_id = 'mapping-alias'; docs[0].fm.screen_id = 'COUPON-001';
  rows[0].target = 'artifact:mapping-alias#component-mapping/M-001';
  assert.equal(relatedToOwner(artifact, parts, state, rows, buildReconciliationTargetIndex({ docs })), true);
  docs.push({ ...docs[0] });
  assert.equal(relatedToOwner(artifact, parts, state, rows, buildReconciliationTargetIndex({ docs })), false);
});

test('review P2-1: public preflight does not connect COUPON-0010 or a coincidental external URL', (t) => {
  const f = originFixture(t, { v2: true });
  fs.writeFileSync(f.mapping, fs.readFileSync(f.mapping, 'utf8').replaceAll('COUPON-001', 'COUPON-0010'));
  fs.writeFileSync(f.register, fs.readFileSync(f.register, 'utf8').replaceAll('COUPON-001-figma-component-mapping', 'COUPON-0010-figma-component-mapping').replace('figma://file/abc/node/1:234', 'figma://file/COUPON-001/node/1:234'));
  const input = path.join(f.root, `docs/frontend-workflow/inputs/${INPUT}.md`);
  fs.writeFileSync(input, fs.readFileSync(input, 'utf8').replaceAll('COUPON-001', 'COUPON-0010')); f.commit();
  const result = body(f.cli('readiness'));
  assert.equal(result.ready, false);
  assert.ok(result.denials.some(d => d.code === 'CW-ORIGIN-UNCONNECTED'));
});

test('review typed-index dependencies are pinned including hidden existing and ignored new artifacts', (t) => {
  const f = originFixture(t, { v2: true });
  const packet = path.join(f.temp, 'packet.md'); body(f.cli('workflow-packet', ['--out', packet]));
  fs.appendFileSync(f.target, '\n// requested\n');
  f.git(['update-index', '--assume-unchanged', MAPPING]);
  fs.appendFileSync(f.mapping, '\n');
  const hidden = body(f.cli('forbidden-paths', ['--enforce']), 1);
  assert.ok(hidden.snapshot.authority_checks.some(c => c.path === MAPPING && !c.ok));
  const newName = 'docs/frontend-workflow/domains/coupons/ignored-alias.md';
  fs.writeFileSync(path.join(f.repo, '.git/info/exclude'), newName + '\n');
  fs.copyFileSync(f.mapping, path.join(f.root, newName));
  const added = body(f.cli('forbidden-paths', ['--enforce']), 1);
  assert.ok(added.snapshot.authority_checks.some(c => c.source === 'artifact-index' && !c.ok));
});

for (const staged of [false, true]) {
  test(`review P2-2: unchanged-source copy is detected and authorized (${staged ? 'index' : 'worktree'})`, (t) => {
    const f = fixture(t, { prefix: 'apps/mobile' });
    const copy = 'src/features/coupons/screens/CouponListCopy.tsx';
    f.request.requests[0].targets = [{ path: copy, change: 'C' }]; f.writeRequest();
    assert.equal(body(f.cli('readiness')).ready, true);
    fs.copyFileSync(f.target, path.join(f.root, copy));
    if (staged) f.git(['add', `apps/mobile/${copy}`, 'apps/mobile/.workflow/current-work.json']);
    const index = fs.readFileSync(path.join(f.repo, '.git/index'));
    const result = body(f.cli('forbidden-paths', [...(staged ? ['--staged'] : []), '--enforce']));
    assert.equal(result.ok, true);
    const record = result.implementation_records[0];
    assert.equal(record.status, 'C');
    assert.equal(record.oldProjectPath, TARGET);
    assert.equal(record.newProjectPath, copy);
    assert.equal(record.evidence.git_mode, '100644');
    assert.equal(fs.existsSync(f.target), true);
    assert.deepEqual(fs.readFileSync(path.join(f.repo, '.git/index')), index);
  });
}

test('review P2-2: a mixed C/A selection retains A semantics without hiding unrelated changes', (t) => {
  const f = fixture(t);
  const copy = 'src/features/coupons/screens/Copy.tsx', added = 'src/features/coupons/screens/Added.tsx';
  f.request.requests[0].targets = [{ path: copy, change: 'C' }, { path: added, change: 'A' }]; f.writeRequest();
  for (const name of [copy, added]) fs.copyFileSync(f.target, path.join(f.root, name));
  const result = body(f.cli('forbidden-paths', ['--enforce']));
  assert.equal(result.ok, true);
  assert.ok(result.implementation_records.some(r => r.status === 'C' && r.newProjectPath === copy));
  assert.ok(result.implementation_records.some(r => r.status === 'A' && r.projectPath === added));
  fs.writeFileSync(path.join(f.root, '.workflow/unrequested'), 'not an input');
  const unexpected = body(f.cli('forbidden-paths', ['--enforce']), 1);
  assert.ok(unexpected.violations.some(v => v.path === '.workflow/unrequested' && v.code === 'CW-GIT-UNREQUESTED'));
});

for (const outside of [false, true]) {
  test(`review P2-2: copy source requires the same owner and project (${outside ? 'cross-root' : 'denied source'})`, (t) => {
    const f = fixture(t, { inside: false, prefix: outside ? 'apps/mobile' : '' });
    const old = outside ? 'outside-source.ts' : 'src/api/secret.ts';
    const source = path.join(f.repo, old);
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, 'export const uniqueSource = "copy-source-authorization-fixture";\n');
    f.git(['add', old]); f.git(['commit', '-qm', 'copy source baseline']);
    const copy = 'src/features/coupons/screens/Copy.tsx';
    f.request.requests[0].targets = [{ path: copy, change: 'C' }]; f.writeRequest();
    fs.copyFileSync(source, path.join(f.root, copy));
    const out = body(f.cli('forbidden-paths', ['--enforce']), 1);
    assert.ok(out.violations.some(v => v.code === (outside ? 'CW-GIT-CROSS-ROOT' : 'CW-GIT-OLD-PATH-DENIED')));
    assert.ok(out.implementation_records.some(r => r.status === 'C'));
  });
}
