// Focused pack regression for D28a only. It does not replay the already shipped
// resolver test suite. Existing package/CI globs still select their full suites.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT } from './util.mjs';

function checkedNode(args, cwd, env = process.env) {
  const run = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024, timeout: 120000 });
  assert.equal(run.error, undefined, String(run.error));
  assert.equal(run.signal, null, `terminated: ${run.signal}`);
  assert.equal(run.status, 0, `${run.stderr}\n${run.stdout}`);
  return run;
}

test('D hosts packed: the new real-file host suite runs against shipped runtime bytes only', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-hosts-packed-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const packed = path.join(temp, 'payload'), lib = path.join(packed, 'scripts/lib');
  const sourceLib = path.join(KIT_ROOT, 'scripts/lib');
  checkedNode([path.join(KIT_ROOT, 'scripts/pack-frontend-workflow-kit.mjs'), '--out', packed], KIT_ROOT);
  assert.deepEqual(fs.readdirSync(lib).filter((name) => /^scoped-work-.*\.test\.mjs$/.test(name)), []);
  const name = 'scoped-work-hosts.mjs', before = fs.readFileSync(path.join(lib, name));
  assert.deepEqual(before, fs.readFileSync(path.join(sourceLib, name)));
  fs.symlinkSync(path.join(KIT_ROOT, 'node_modules'), path.join(packed, 'node_modules'), 'dir');
  const driver = 'scoped-work-hosts.test.mjs';
  fs.copyFileSync(path.join(sourceLib, driver), path.join(lib, driver), fs.constants.COPYFILE_EXCL);
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const run = checkedNode(['--test', '--test-reporter=tap', path.join(lib, driver)], packed, env);
  const count = /^# tests (\d+)\r?$/m.exec(run.stdout);
  assert.ok(count && Number(count[1]) > 0, run.stdout);
  for (const metric of ['fail', 'cancelled', 'skipped', 'todo']) {
    assert.match(run.stdout, new RegExp(`^# ${metric} 0\\r?$`, 'm'), run.stdout);
  }
  assert.deepEqual(fs.readFileSync(path.join(lib, name)), before);
  t.diagnostic(`focused packed host subprocess: ${count[1]} tests (nested, not additive)`);
});
