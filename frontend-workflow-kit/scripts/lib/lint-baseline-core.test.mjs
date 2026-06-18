import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildLintGenModel, LintPolicyContractError, parseLintPolicyYaml } from './lint-gen-core.mjs';
import {
  buildLintBaselineReport,
  parseLintCountsJson,
  validateLintCounts,
} from './lint-baseline-core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = path.resolve(HERE, '..', '..');
const CLI = path.join(KIT_ROOT, 'scripts', 'lint-baseline.mjs');
const FIXTURE_ROOT = path.join(KIT_ROOT, 'examples', 'lint-baseline');

function fixturePath(caseName, relPath) {
  return path.join(FIXTURE_ROOT, caseName, relPath);
}

function loadPolicy(caseName) {
  const raw = fs.readFileSync(fixturePath(caseName, 'docs/frontend-workflow/_meta/lint-policy.yaml'), 'utf8');
  return parseLintPolicyYaml(raw, caseName);
}

function loadCounts(caseName) {
  const raw = fs.readFileSync(fixturePath(caseName, 'docs/frontend-workflow/_meta/lint-counts.json'), 'utf8');
  return parseLintCountsJson(raw, caseName);
}

function reportFor(caseName) {
  return buildLintBaselineReport(buildLintGenModel(loadPolicy(caseName)), loadCounts(caseName));
}

function runCli(caseName, args = []) {
  return spawnSync(
    process.execPath,
    [CLI, '--docs', fixturePath(caseName, 'docs/frontend-workflow'), ...args],
    {
      cwd: KIT_ROOT,
      encoding: 'utf8',
    },
  );
}

test('fixture: no ratchet policies pass without current counts', () => {
  const model = buildLintGenModel(loadPolicy('no-ratchet'));
  const report = buildLintBaselineReport(model);
  assert.equal(report.status, 'no-ratchet');
  assert.equal(report.ok, true);
  assert.deepEqual(report.results, []);

  const r = runCli('no-ratchet', ['--json']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const summary = JSON.parse(r.stdout);
  assert.equal(summary.status, 'no-ratchet');
  assert.equal(summary.counts_source, null);
});

test('fixture: current equal to baseline passes', () => {
  const report = reportFor('equal');
  assert.equal(report.status, 'pass');
  assert.deepEqual(report.results.map((result) => result.status), ['pass']);
  assert.equal(report.results[0].current, 3);
  assert.equal(report.results[0].baseline, 3);

  const r = runCli('equal', ['--json']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).status, 'pass');
});

test('fixture: current lower than baseline reports improvement', () => {
  const report = reportFor('lower');
  assert.equal(report.status, 'improvement');
  assert.equal(report.ok, true);
  assert.equal(report.results[0].delta, -2);

  const r = runCli('lower', ['--json']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).status, 'improvement');
});

test('fixture: current higher than baseline warns by default and fails only with --enforce', () => {
  const report = reportFor('higher');
  assert.equal(report.status, 'increase');
  assert.equal(report.ok, false);
  assert.equal(report.results[0].delta, 1);

  const warningFirst = runCli('higher', ['--json']);
  assert.equal(warningFirst.status, 0, warningFirst.stdout + warningFirst.stderr);
  assert.equal(JSON.parse(warningFirst.stdout).status, 'increase');

  const enforce = runCli('higher', ['--enforce', '--json']);
  assert.equal(enforce.status, 1, enforce.stdout + enforce.stderr);
  const summary = JSON.parse(enforce.stdout);
  assert.equal(summary.status, 'increase');
  assert.equal(summary.exit_code, 1);
});

test('fixture: missing baseline for ratchet policy is a contract failure', () => {
  const r = runCli('missing-baseline', ['--json']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const summary = JSON.parse(r.stdout);
  assert.match(summary.details.join('\n'), /baseline: required non-negative integer/);
});

test('fixture: malformed policy YAML is a contract failure', () => {
  const r = runCli('malformed-policy', ['--json']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const summary = JSON.parse(r.stdout);
  assert.match(summary.error, /YAML parse failed/);
});

test('fixture: unknown policy id in policy is a contract failure', () => {
  const r = runCli('unknown-policy', ['--json']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const summary = JSON.parse(r.stdout);
  assert.match(summary.details.join('\n'), /policies\.made-up-policy: unsupported field/);
});

test('fixture: unknown policy id in current counts is a contract failure', () => {
  const r = runCli('unknown-count-policy', ['--json']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const summary = JSON.parse(r.stdout);
  assert.match(summary.details.join('\n'), /counts\.made-up-policy: unknown policy id/);
});

test('counts contract requires v1 non-negative integer counts', () => {
  assert.deepEqual(validateLintCounts({ version: 1, counts: { 'no-fetch-in-screens': 0 } }), []);
  assert.throws(
    () => buildLintBaselineReport(buildLintGenModel(loadPolicy('equal')), { version: 1, counts: {} }),
    (err) => {
      assert.ok(err instanceof LintPolicyContractError);
      assert.match(err.details.join('\n'), /required current count/);
      return true;
    },
  );
  assert.throws(
    () => parseLintCountsJson('{', 'bad-counts'),
    (err) => {
      assert.ok(err instanceof LintPolicyContractError);
      assert.match(err.message, /JSON parse failed/);
      return true;
    },
  );
});
