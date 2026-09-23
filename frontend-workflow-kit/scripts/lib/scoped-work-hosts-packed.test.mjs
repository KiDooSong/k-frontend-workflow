// Focused pack regression for D28+ host consent, request composition, the scoped
// baseline preflight/Git backstop, adopted-path guards, the downgrade refusal and
// the public work CLIs. It does not replay the already shipped resolver test suite.
// Existing package/CI globs still select their full suites.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT } from './util.mjs';

const SUITES = ['scoped-work-hosts.test.mjs', 'scoped-work-composition.test.mjs', 'scoped-work-execution.test.mjs',
  'scoped-work-adoption.test.mjs', 'scoped-work-downgrade.test.mjs', 'scoped-work-cli.test.mjs'];
// The downgrade and CLI suites exercise the shipped planner and work CLI modules.
const SHIPPED = { 'scoped-work-downgrade.test.mjs': 'upgrade-planner.mjs', 'scoped-work-cli.test.mjs': 'current-work-cli.mjs' };
const RUNTIME = SUITES.map((name) => SHIPPED[name] ?? name.replace('.test.mjs', '.mjs'));

function checkedNode(args, cwd, env = process.env) {
  const run = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024, timeout: 300000 });
  assert.equal(run.error, undefined, String(run.error));
  assert.equal(run.signal, null, `terminated: ${run.signal}`);
  assert.equal(run.status, 0, `${run.stderr}\n${run.stdout}`);
  return run;
}

test('D hosts packed: host consent, composition and scoped execution suites run against shipped runtime bytes only', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-hosts-packed-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const packed = path.join(temp, 'payload'), lib = path.join(packed, 'scripts/lib');
  const sourceLib = path.join(KIT_ROOT, 'scripts/lib');
  checkedNode([path.join(KIT_ROOT, 'scripts/pack-frontend-workflow-kit.mjs'), '--out', packed], KIT_ROOT);
  assert.deepEqual(fs.readdirSync(lib).filter((name) => /^scoped-work-.*\.test\.mjs$/.test(name)), []);
  const before = new Map(RUNTIME.map((name) => [name, fs.readFileSync(path.join(lib, name))]));
  for (const [name, bytes] of before) assert.deepEqual(bytes, fs.readFileSync(path.join(sourceLib, name)), name);
  fs.symlinkSync(path.join(KIT_ROOT, 'node_modules'), path.join(packed, 'node_modules'), 'dir');
  for (const driver of SUITES) fs.copyFileSync(path.join(sourceLib, driver), path.join(lib, driver), fs.constants.COPYFILE_EXCL);
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const run = checkedNode(['--test', '--test-reporter=tap', ...SUITES.map((driver) => path.join(lib, driver))], packed, env);
  const count = /^# tests (\d+)\r?$/m.exec(run.stdout);
  assert.ok(count && Number(count[1]) > 0, run.stdout);
  for (const metric of ['fail', 'cancelled', 'skipped', 'todo']) {
    assert.match(run.stdout, new RegExp(`^# ${metric} 0\\r?$`, 'm'), run.stdout);
  }
  for (const [name, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(lib, name)), bytes, name);
  t.diagnostic(`focused packed host/composition subprocess: ${count[1]} tests (nested, not additive)`);
});
