// readiness-eval.test.mjs - warning-first readiness label measurement coverage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  DEFAULT_EVAL_CASES_PATH,
  loadEvalCases,
  runEvalCase,
  runReadinessEval,
  summarizeEval,
  validateEvalCases,
} from './readiness-eval.mjs';
import { KIT_ROOT } from './util.mjs';

const CLI = path.join(KIT_ROOT, 'scripts', 'readiness-eval.mjs');

function defaultCases() {
  return loadEvalCases(DEFAULT_EVAL_CASES_PATH).cases;
}

function caseById(id) {
  const testCase = defaultCases().find((entry) => entry.id === id);
  assert.ok(testCase, `missing seed case ${id}`);
  return structuredClone(testCase);
}

function withCasesFile(cases, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-eval-test-'));
  const file = path.join(root, 'cases.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ schema_version: 1, cases }, null, 2), 'utf8');
    return fn(file);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('loadEvalCases validates schema_version and unique ids', () => {
  assert.throws(
    () => validateEvalCases({ schema_version: 2, cases: [] }),
    /schema_version must be 1/,
  );

  const sample = caseById('eval/control-final-open');
  assert.throws(
    () => validateEvalCases({ schema_version: 1, cases: [sample, structuredClone(sample)] }),
    /duplicate case id/,
  );

  const loaded = loadEvalCases(DEFAULT_EVAL_CASES_PATH);
  assert.equal(loaded.schema_version, 1);
  assert.ok(loaded.cases.length >= 12);
});

test('missing label_source rejects cases file', () => {
  const sample = caseById('eval/control-final-open');
  delete sample.label_source;
  assert.throws(
    () => validateEvalCases({ schema_version: 1, cases: [sample] }),
    /label_source must be an object/,
  );
});

test('control-final-open is an exact true_open', () => {
  const result = runEvalCase(caseById('eval/control-final-open'));
  assert.equal(result.actual_readiness_mode, 'final-fixture-ui');
  assert.equal(result.outcome, 'true_open');
  assert.equal(result.exact_match, true);
  assert.equal(result.blocking_match, true);
  assert.deepEqual(result.observed_blocking_kinds, []);
});

test('open decision block case is true_closed', () => {
  const result = runEvalCase(caseById('eval/control-open-decision-blocks-final'));
  assert.equal(result.actual_readiness_mode, 'rough-fixture-ui');
  assert.equal(result.outcome, 'true_closed');
  assert.deepEqual(result.observed_blocking_kinds, ['open_decision']);
});

test('malformed Open Decision typo is fail-closed correct', () => {
  const result = runEvalCase(caseById('eval/od-blocking-mode-typo'));
  const report = summarizeEval([result]);
  assert.equal(result.actual_readiness_mode, 'docs-only');
  assert.deepEqual(result.observed_blocking_kinds, ['invalid_open_decision']);
  assert.equal(report.fail_closed_axis.expected, 1);
  assert.equal(report.fail_closed_axis.correct, 1);
  assert.equal(report.fail_closed_axis.leaked, 0);
});

test('malformed policy requires is fail-closed correct', () => {
  const result = runEvalCase(caseById('eval/policy-malformed-bare-token'));
  const report = summarizeEval([result]);
  assert.equal(result.actual_readiness_mode, 'rough-fixture-ui');
  assert.deepEqual(result.observed_blocking_kinds, ['invalid_policy_requirement']);
  assert.equal(report.fail_closed_axis.expected, 1);
  assert.equal(report.fail_closed_axis.correct, 1);
  assert.equal(report.fail_closed_axis.leaked, 0);
});

test('synthetic wrong label records false_open without adding it to the seed corpus', () => {
  const wrong = caseById('eval/control-final-open');
  wrong.id = 'eval/test-only-wrong-label';
  wrong.expect.readiness_mode = 'rough-fixture-ui';
  wrong.expect.gate = 'block';
  wrong.expect.blocking_kinds = ['open_decision'];

  const report = summarizeEval([runEvalCase(wrong)]);
  assert.equal(report.confusion.false_open.count, 1);
  assert.deepEqual(report.confusion.false_open.cases, ['eval/test-only-wrong-label']);
  assert.equal(report.confusion.false_closed.count, 0);
});

test('synthetic blocker label drift records blocking_mismatch without changing exact_match', () => {
  const wrong = caseById('eval/control-final-open');
  wrong.id = 'eval/test-only-blocking-label-drift';
  wrong.expect.blocking_kinds = ['open_decision'];

  const report = summarizeEval([runEvalCase(wrong)]);
  assert.equal(report.exact_match, 1);
  assert.equal(report.blocking_kinds.match, 0);
  assert.equal(report.blocking_kinds.mismatch.count, 1);
  assert.deepEqual(report.blocking_kinds.mismatch.cases, ['eval/test-only-blocking-label-drift']);
  assert.equal(report.cases[0].blocking_match, false);
});

test('report cases are sorted by id', () => {
  const zCase = caseById('eval/policy-malformed-single-equals');
  const aCase = caseById('eval/control-final-open');
  const report = summarizeEval([runEvalCase(zCase), runEvalCase(aCase)]);
  assert.deepEqual(report.cases.map((entry) => entry.id), [
    'eval/control-final-open',
    'eval/policy-malformed-single-equals',
  ]);
});

test('report has no timestamp, duration, temp path, or absolute path', () => {
  const report = runReadinessEval({ casesPath: DEFAULT_EVAL_CASES_PATH });
  const text = JSON.stringify(report, null, 2);
  assert.equal(/generated_at|timestamp|duration/i.test(text), false);
  assert.equal(/readiness-eval-|\/tmp\/|[A-Z]:\\/i.test(text), false);
});

test('CLI --json emits parseable JSON and exits 0', () => {
  const r = spawnSync(process.execPath, [CLI, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  const obj = JSON.parse(r.stdout);
  assert.equal(obj.tool, 'workflow:eval');
  assert.equal(obj.mode, 'warning-first');
  assert.equal(obj.total, 16);
  assert.equal(obj.confusion.false_open.count, 0);
  assert.equal(obj.blocking_kinds.mismatch.count, 0);
});

test('eval metric mismatch does not cause exit 1', () => {
  const wrong = caseById('eval/control-final-open');
  wrong.id = 'eval/test-only-cli-wrong-label';
  wrong.expect.readiness_mode = 'rough-fixture-ui';
  wrong.expect.gate = 'block';
  wrong.expect.blocking_kinds = ['open_decision'];

  withCasesFile([wrong], (file) => {
    const r = spawnSync(process.execPath, [CLI, '--cases', file, '--json'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const obj = JSON.parse(r.stdout);
    assert.equal(obj.confusion.false_open.count, 1);
    assert.equal(obj.ok, true);
  });
});
