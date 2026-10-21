// Kit-dev harness only. Assert test exclusion first, then place unchanged test
// drivers beside the actual packed runtime. Never copy source runtime modules
// over the payload or recursively invoke this pack test / D1's pack test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT } from './util.mjs';
import { PAYLOAD_MANIFEST_NAME, sha256OfFile } from './kit-manifest.mjs';

const suites = ['scoped-work-refs.test.mjs', 'scoped-work-sources.test.mjs',
  'scoped-work-mapping.test.mjs', 'scoped-work-api.test.mjs', 'scoped-work-normalize.test.mjs', 'scoped-work-graph.test.mjs',
  'scoped-work-projection.test.mjs', 'scoped-work-decisions.test.mjs', 'scoped-work-boundaries.test.mjs', 'scoped-work-uncertainty.test.mjs',
  'scoped-work-applicability.test.mjs', 'scoped-work-basis.test.mjs', 'scoped-work-bindings.test.mjs', 'scoped-work-transitions.test.mjs',
  'scoped-work-git-transitions.test.mjs', 'scoped-work-coverage.test.mjs', 'scoped-work-receipts.test.mjs', 'scoped-work-source-relations.test.mjs', 'scoped-work-input-coverage.test.mjs', 'scoped-work-profiles.test.mjs', 'scoped-work-paths.test.mjs', 'scoped-work-decision-scopes.test.mjs', 'scoped-work-owner.test.mjs'];
const runtime = ['scoped-work-request.mjs', 'scoped-work-declarations.mjs', 'reconciliation-markdown-ast.mjs', 'scoped-work-binding-status.mjs',
  ...suites.map((name) => name.replace('.test.mjs', '.mjs'))];
// This regression exercises several real modules, rather than a matching .mjs.
const resolverSuites = [...suites, 'scoped-work-generated.test.mjs'];
const cliSuite = 'scoped-work-binding-status.test.mjs';

function checkedNode(args, cwd, env = process.env) {
  const run = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024, timeout: 120000 });
  assert.equal(run.error, undefined, String(run.error));
  assert.equal(run.signal, null, `terminated: ${run.signal}`);
  assert.equal(run.status, 0, `${run.stderr}\n${run.stdout}`);
  return run;
}

test('D packed: real reference, source, mapping, API, normalization, graph traversal, unit projection, decision applicability, ownership boundaries, uncertainty relations, combined applicability, scope-basis digests and conservative binding/transition, canonical Decision scope application and original Git snapshot inspection plus coverage receipt integrity, selected review-file transport, canonical source relations, reviewed input coverage and profile/concrete path and single-owner prerequisites run from the shipped runtime', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-packed-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const packed = path.join(temp, 'payload');
  const lib = path.join(packed, 'scripts/lib');
  checkedNode([path.join(KIT_ROOT, 'scripts/pack-frontend-workflow-kit.mjs'), '--out', packed], KIT_ROOT);
  assert.equal(fs.existsSync(path.join(packed, 'examples')), false);
  assert.equal(fs.existsSync(path.join(packed, 'scripts/pack-frontend-workflow-kit.mjs')), false);
  assert.ok(fs.existsSync(path.join(packed, 'scripts/binding-status.mjs')), 'the #275 binding status CLI ships');
  assert.deepEqual(fs.readdirSync(lib).filter((name) => /^scoped-work-.*\.test\.mjs$/.test(name)), [],
    'scoped kit-dev tests must not be delivered to consumers');
  const bytes = new Map(runtime.map((name) => [name, fs.readFileSync(path.join(lib, name))]));
  const payload = JSON.parse(fs.readFileSync(path.join(packed, PAYLOAD_MANIFEST_NAME), 'utf8'));
  const checkPayload = () => {
    for (const entry of payload.payload.files) {
      assert.equal(sha256OfFile(path.join(packed, entry.path)), entry.sha256, `manifest: ${entry.path}`);
    }
  };
  checkPayload();
  for (const [name, value] of bytes) {
    assert.deepEqual(value, fs.readFileSync(path.join(KIT_ROOT, 'scripts/lib', name)), name);
  }
  // The installed lockfile dependencies are shared, not a different runtime or
  // hand-written stand-in. Relative imports below resolve only within payload.
  fs.symlinkSync(path.join(KIT_ROOT, 'node_modules'), path.join(packed, 'node_modules'), 'dir');
  for (const name of [...resolverSuites, cliSuite]) {
    fs.copyFileSync(path.join(KIT_ROOT, 'scripts/lib', name), path.join(lib, name), fs.constants.COPYFILE_EXCL);
  }
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // Start a separate explicit test-runner process.
  const run = checkedNode(['--test', '--test-reporter=tap', ...resolverSuites.map((name) => path.join(lib, name))], packed, env);
  const count = /^# tests (\d+)\r?$/m.exec(run.stdout);
  assert.ok(count && Number(count[1]) >= 211, run.stdout);
  for (const metric of ['fail', 'cancelled', 'skipped', 'todo']) {
    assert.match(run.stdout, new RegExp(`^# ${metric} 0\\r?$`, 'm'), run.stdout);
  }
  for (const [name, value] of bytes) assert.deepEqual(fs.readFileSync(path.join(lib, name)), value, name);
  t.diagnostic(`packed resolver subprocess: ${count[1]} tests, no failures/cancellations/skips/todos`);
  // The fixture data remains outside the payload. KIT_ROOT in this copied
  // driver resolves to packed, so both public CLIs execute shipped code only.
  const cli = checkedNode(['--test', '--test-reporter=tap', '--test-name-pattern=^#282 CLI:', path.join(lib, cliSuite)], packed,
    { ...env, SCOPED_WORK_TEST_FIXTURE_ROOT: KIT_ROOT });
  assert.match(cli.stdout, /^# pass 6\r?$/m, cli.stdout);
  for (const metric of ['fail', 'cancelled', 'todo']) {
    assert.match(cli.stdout, new RegExp(`^# ${metric} 0\\r?$`, 'm'), cli.stdout);
  }
  // A filtered-out #275 test can be reported as skipped on older Node versions;
  // the six #282 regressions must all execute and pass on every supported Node.
  checkPayload();
  assert.equal(fs.existsSync(path.join(packed, 'examples')), false);
  t.diagnostic('packed readiness/binding-status subprocess: all 6 #282 generated-boundary CLI cases passed');
});

test('D resolver suites stay wired to both package commands and existing focused/macOS CI', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'package.json'), 'utf8'));
  for (const name of ['test', 'test:spec']) assert.ok(pkg.scripts[name].includes('scripts/lib/scoped-work-*.test.mjs'), name);
  const workflow = fs.readFileSync(path.join(KIT_ROOT, '../.github/workflows/frontend-workflow-kit.yml'), 'utf8');
  assert.match(workflow, /run: node --test scripts\/lib\/scoped-work-\*\.test\.mjs/);
  const macos = workflow.slice(workflow.indexOf('  macos-smoke:'));
  assert.ok(macos.includes('scripts/lib/scoped-work-*.test.mjs'));
  assert.ok(macos.includes('scripts/lib/current-work-snapshot.test.mjs'), 'retain existing C regression');
});
