import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
}

test('current-work entry documentation routes single targets before legacy blocking', () => {
  assertCurrentWorkDocs(KIT);
});

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
