// redteam.test.mjs - workflow:redteam observation matrix.
//
// Pins the warning-first red-team report contract: selection, status labels,
// summary counting, exit codes, and output hygiene. Also carries the test-only
// golden tampering sentinel (A5 lightweight option): the existing test-fixtures
// generated-view harness is run against a temp-tampered golden copy and must
// report the drift. Committed fixtures are never mutated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  collectRedteamReport,
  expandRedteamGroups,
  formatRedteamHuman,
  listRedteamCases,
  REDTEAM_CASE_GROUPS,
  REDTEAM_CORE_GROUPS,
  REDTEAM_STATUSES,
  selectRedteamCases,
  summarizeRedteamCases,
} from './redteam.mjs';
import { runGeneratedViewCase } from './test-fixture.mjs';
import { KIT_ROOT } from './util.mjs';

const CLI = path.join(KIT_ROOT, 'scripts', 'redteam.mjs');

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

// Collect each selection once and share across assertions - the report is
// deterministic (pinned separately below) and each collection spawns real
// forbidden-paths children.
const CORE_REPORT = collectRedteamReport({});
const SELF_RESOLVE_REPORT = collectRedteamReport({ includeGroups: ['self-resolve'] });
const GOLDEN_REPORT = collectRedteamReport({ includeGroups: ['golden-tampering'] });

function caseById(report, id) {
  const found = report.cases.find((c) => c.id === id);
  assert.ok(found, `case ${id} missing from report`);
  return found;
}

// --- registry / selection -----------------------------------------------------

test('case registry: groups are fixed and every case carries a known group', () => {
  assert.deepEqual(REDTEAM_CASE_GROUPS, [
    'readiness',
    'path-backstop',
    'downgrade',
    'golden-tampering',
    'self-resolve',
  ]);
  assert.deepEqual(REDTEAM_CORE_GROUPS, ['readiness', 'path-backstop', 'downgrade']);
  for (const def of listRedteamCases()) {
    assert.ok(REDTEAM_CASE_GROUPS.includes(def.group), `${def.id} has unknown group ${def.group}`);
    assert.ok(def.threat.length > 0);
    assert.ok(def.invariant.length > 0);
    assert.ok(typeof def.expected.kind === 'string');
  }
});

test('default selection is the core groups only; opt-in groups are additive', () => {
  const core = selectRedteamCases({});
  assert.ok(core.length > 0);
  assert.ok(core.every((def) => REDTEAM_CORE_GROUPS.includes(def.group)));
  assert.equal(core.some((def) => def.group === 'self-resolve'), false);
  assert.equal(core.some((def) => def.group === 'golden-tampering'), false);

  const withSelfResolve = selectRedteamCases({ includeGroups: ['self-resolve'] });
  assert.ok(withSelfResolve.some((def) => def.group === 'self-resolve'));
  assert.ok(withSelfResolve.filter((def) => REDTEAM_CORE_GROUPS.includes(def.group)).length === core.length);

  const all = selectRedteamCases({ includeGroups: ['all'] });
  assert.deepEqual(
    [...new Set(all.map((def) => def.group))].sort(),
    [...REDTEAM_CASE_GROUPS].sort(),
  );
});

test('core and core-group names are accepted include no-ops', () => {
  const core = selectRedteamCases({});
  for (const group of ['core', 'readiness', 'path-backstop', 'downgrade']) {
    assert.deepEqual(
      selectRedteamCases({ includeGroups: [group] }).map((def) => def.id),
      core.map((def) => def.id),
    );
  }
});

test('unknown group or case id throws instead of being ignored', () => {
  assert.throws(() => expandRedteamGroups(['nope']), /unknown redteam group: nope/);
  assert.throws(() => selectRedteamCases({ caseIds: ['rt-nope'] }), /unknown redteam case id: rt-nope/);
});

test('--case selection narrows to exactly the requested ids, opt-in groups included', () => {
  const selected = selectRedteamCases({ caseIds: ['rt-self-resolve-provenance-gap', 'rt-d-to-unknown-current-gap'] });
  assert.deepEqual(
    selected.map((def) => def.id).sort(),
    ['rt-d-to-unknown-current-gap', 'rt-self-resolve-provenance-gap'],
  );
});

// --- report shape / summary -----------------------------------------------------

test('collectRedteamReport is deterministic and uses only allowed status labels', () => {
  const first = collectRedteamReport({ includeGroups: ['all'] });
  const second = collectRedteamReport({ includeGroups: ['all'] });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.tool, 'workflow:redteam');
  assert.equal(first.mode, 'warning-first');
  assert.equal(first.schema_version, 1);
  assert.equal(first.ok, true);
  for (const c of first.cases) {
    assert.ok(REDTEAM_STATUSES.includes(c.status), `${c.id} has unknown status ${c.status}`);
    assert.ok(['info', 'warning'].includes(c.severity));
    assert.equal(typeof c.expected.kind, 'string');
    assert.ok(Array.isArray(c.notes));
  }
});

test('summary counts statuses and warning_count counts warning severity only', () => {
  const cases = [
    { status: 'fail-closed', severity: 'info' },
    { status: 'blocked', severity: 'info' },
    { status: 'observed-gap', severity: 'warning' },
    { status: 'drift-detected', severity: 'warning' },
    { status: 'skipped', severity: 'info' },
    { status: 'input-error', severity: 'info' },
  ];
  assert.deepEqual(summarizeRedteamCases(cases), {
    case_count: 6,
    observed_gap_count: 1,
    blocked_count: 1,
    fail_closed_count: 1,
    drift_detected_count: 1,
    skipped_count: 1,
    input_error_count: 1,
    warning_count: 2,
  });
});

// --- readiness fail-closed witnesses -------------------------------------------

test('malformed Open Decision cases observe fail-closed with severity info', () => {
  const report = CORE_REPORT;
  for (const id of [
    'rt-open-decision-blocking-mode-typo',
    'rt-open-decision-missing-status',
    'rt-open-decision-non-enum-status',
    'rt-open-decision-non-table-section',
  ]) {
    const c = caseById(report, id);
    assert.equal(c.status, 'fail-closed', `${id}: ${JSON.stringify(c)}`);
    assert.equal(c.severity, 'info');
    assert.equal(c.observed.readiness_mode, 'docs-only');
    assert.ok(c.observed.blocking_kinds.includes('invalid_open_decision'));
    assert.equal(c.expected.kind, 'fail-closed');
  }
});

test('malformed policy requirement cases observe fail-closed even when the underlying fact is true', () => {
  const report = CORE_REPORT;
  for (const id of ['rt-policy-malformed-bare-token', 'rt-policy-malformed-single-equals']) {
    const c = caseById(report, id);
    assert.equal(c.status, 'fail-closed', `${id}: ${JSON.stringify(c)}`);
    assert.equal(c.severity, 'info');
    assert.equal(c.observed.readiness_mode, 'rough-fixture-ui');
    assert.ok(c.observed.blocking_kinds.includes('invalid_policy_requirement'));
  }
});

// --- path-backstop witnesses ----------------------------------------------------

test('camouflaged guarded api write observes blocked (enforce witness) plus warning-first note', () => {
  const report = CORE_REPORT;
  const c = caseById(report, 'rt-path-backstop-guarded-api-write');
  assert.equal(c.status, 'blocked', JSON.stringify(c));
  assert.equal(c.severity, 'info');
  assert.equal(c.observed.enforce_child_exit, 1);
  assert.equal(c.observed.enforce_violation_count, 1);
  assert.equal(c.observed.violation_file, 'src/api/couponClient.ts');
  assert.equal(c.observed.violation_surface, 'src/api/**');
  assert.equal(c.observed.warning_first_child_exit, 0);
  assert.equal(c.observed.warning_first_violation_count, 1);
  assert.ok(c.notes.some((n) => n.includes('warning-first')));
  assert.ok(c.notes.some((n) => n.includes('not wired into CI')));
});

test('allowed-path control observes skipped with zero violations', () => {
  const report = CORE_REPORT;
  const c = caseById(report, 'rt-path-backstop-allowed-paths-control');
  assert.equal(c.status, 'skipped', JSON.stringify(c));
  assert.equal(c.severity, 'info');
  assert.equal(c.observed.enforce_child_exit, 0);
  assert.equal(c.observed.warning_first_child_exit, 0);
  assert.equal(c.observed.violation_count, 0);
});

test('malformed diff input observes input-error (exit 2, no metric finding) and does not count as a warning', () => {
  const report = CORE_REPORT;
  const c = caseById(report, 'rt-path-backstop-malformed-diff-input');
  assert.equal(c.status, 'input-error', JSON.stringify(c));
  assert.equal(c.severity, 'info');
  assert.equal(c.observed.enforce_child_exit, 2);
  assert.equal(c.observed.warning_first_child_exit, 2);
  assert.equal(c.observed.violations_reported, false);
  assert.ok(c.notes.some((n) => n.includes('not counted in warning_count')));
});

// --- D->U downgrade + self-resolve observations ----------------------------------

test('open Open Decision control observes blocked below final-fixture-ui', () => {
  const report = CORE_REPORT;
  const c = caseById(report, 'rt-open-decision-blocks-final');
  assert.equal(c.status, 'blocked', JSON.stringify(c));
  assert.equal(c.severity, 'info');
  assert.equal(c.observed.readiness_mode, 'rough-fixture-ui');
  assert.ok(c.observed.blocking_kinds.includes('open_decision'));
});

test('D->U downgrade gap is observed-gap (warning) with the non-gating design note', () => {
  const report = CORE_REPORT;
  const c = caseById(report, 'rt-d-to-unknown-current-gap');
  assert.equal(c.status, 'observed-gap', JSON.stringify(c));
  assert.equal(c.severity, 'warning');
  assert.equal(c.observed.readiness_mode, 'final-fixture-ui');
  assert.deepEqual(c.observed.blocking_kinds, []);
  assert.equal(c.observed.unknown_count, 1);
  assert.equal(c.observed.tbd_count, 1);
  assert.ok(c.notes.some((n) => n.includes('Unknown is non-blocking by design')));
  assert.ok(c.notes.some((n) => n.includes('No gate was added')));
  assert.ok(c.notes.some((n) => n.includes('human design decision')));
});

test('self-resolve provenance gap is opt-in and observed-gap without blocking resolved rows', () => {
  assert.equal(CORE_REPORT.cases.some((c) => c.id === 'rt-self-resolve-provenance-gap'), false);

  const report = SELF_RESOLVE_REPORT;
  const c = caseById(report, 'rt-self-resolve-provenance-gap');
  assert.equal(c.status, 'observed-gap', JSON.stringify(c));
  assert.equal(c.severity, 'warning');
  assert.equal(c.observed.open_row_readiness_mode, 'rough-fixture-ui');
  assert.equal(c.observed.resolved_row_readiness_mode, 'final-fixture-ui');
  assert.deepEqual(c.observed.resolved_row_blocking_kinds, []);
  assert.ok(c.notes.some((n) => n.includes('legitimate human resolution')));
  assert.ok(c.notes.some((n) => n.includes('reconcile/session/provenance layer')));
  assert.ok(c.notes.some((n) => n.includes('no automatic resolve/confirm/close')));
});

test('core summary: one warning (the D->U gap), defenses stay info', () => {
  const report = CORE_REPORT;
  assert.equal(report.summary.case_count, report.cases.length);
  assert.equal(report.summary.observed_gap_count, 1);
  assert.equal(report.summary.warning_count, 1);
  assert.equal(report.summary.fail_closed_count, 6);
  assert.equal(report.summary.blocked_count, 2);
  assert.equal(report.summary.skipped_count, 1);
  assert.equal(report.summary.input_error_count, 1);
  assert.equal(report.summary.drift_detected_count, 0);
});

// --- golden tampering sentinel ---------------------------------------------------

test('golden-tampering CLI case is opt-in and skipped with a test-only note', () => {
  assert.equal(CORE_REPORT.cases.some((c) => c.id === 'rt-golden-tampering-sentinel'), false);

  const report = GOLDEN_REPORT;
  const c = caseById(report, 'rt-golden-tampering-sentinel');
  assert.equal(c.status, 'skipped');
  assert.equal(c.severity, 'info');
  assert.equal(c.expected.kind, 'drift-detected');
  assert.ok(c.notes.some((n) => n.includes('test-only in this PR')));
});

test('golden tampering sentinel (test-only): a tampered golden copy is reported as drift by the existing harness', () => {
  const caseDir = path.join(KIT_ROOT, 'examples', 'route-tree', 'basic-app');
  const scriptPath = path.join(KIT_ROOT, 'scripts', 'route-tree.mjs');
  const inputDir = path.join(caseDir, 'src', 'app');
  const expectedFile = path.join(caseDir, 'expected', 'route-tree.txt');
  const original = fs.readFileSync(expectedFile, 'utf8');

  // control: the untampered committed golden matches.
  const control = runGeneratedViewCase({
    id: 'rt-golden-control',
    kind: 'route-tree',
    scriptPath,
    inputFlag: '--app',
    inputDir,
    expectedFile,
  });
  assert.equal(control.failed, 0, JSON.stringify(control.checks));

  // adversarial sentinel: tamper a TEMP COPY of the golden (committed fixture
  // is never mutated) and assert the harness reports the content drift.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'redteam-golden-'));
  try {
    const tamperedExpected = path.join(tmp, 'route-tree.txt');
    fs.writeFileSync(tamperedExpected, `${original}TAMPERED-SENTINEL-LINE\n`, 'utf8');
    const tampered = runGeneratedViewCase({
      id: 'rt-golden-tampered',
      kind: 'route-tree',
      scriptPath,
      inputFlag: '--app',
      inputDir,
      expectedFile: tamperedExpected,
    });
    assert.ok(tampered.failed > 0, 'tampered golden must be reported as drift');
    const content = tampered.checks.find((check) => check.check === 'GV:content');
    assert.ok(content, 'GV:content check missing');
    assert.equal(content.ok, false, 'GV:content must flag the tampered golden');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  assert.equal(fs.readFileSync(expectedFile, 'utf8'), original, 'committed golden must stay untouched');
});

// --- CLI contract -----------------------------------------------------------------

test('CLI --json exits 0 with a parseable warning-first report despite observed gaps', () => {
  const r = runCli(['--json']);
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.tool, 'workflow:redteam');
  assert.equal(report.ok, true);
  assert.ok(report.summary.observed_gap_count >= 1, 'D->U gap must be observed');
  assert.ok(report.cases.length === report.summary.case_count);
});

test('CLI --include self-resolve and --case narrow selection as documented', () => {
  const withGroup = runCli(['--include', 'self-resolve', '--json']);
  assert.equal(withGroup.status, 0, withGroup.stderr);
  const groupReport = JSON.parse(withGroup.stdout);
  assert.ok(groupReport.cases.some((c) => c.id === 'rt-self-resolve-provenance-gap'));

  const withCase = runCli(['--case', 'rt-d-to-unknown-current-gap', '--json']);
  assert.equal(withCase.status, 0, withCase.stderr);
  const caseReport = JSON.parse(withCase.stdout);
  assert.deepEqual(caseReport.cases.map((c) => c.id), ['rt-d-to-unknown-current-gap']);
  assert.equal(caseReport.summary.case_count, 1);
});

test('CLI --include golden-tampering exits 0 with the skipped sentinel case', () => {
  const r = runCli(['--include', 'golden-tampering', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  const c = report.cases.find((entry) => entry.id === 'rt-golden-tampering-sentinel');
  assert.ok(c);
  assert.equal(c.status, 'skipped');
});

test('CLI usage errors exit 2: unknown group, unknown case id, unknown flag, empty values', () => {
  for (const args of [
    ['--include', 'nope', '--json'],
    ['--case', 'rt-nope', '--json'],
    ['--enforce', '--json'],
    ['--include', '', '--json'],
    ['--docs', '', '--json'],
  ]) {
    const r = runCli(args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /workflow:redteam/);
  }
});

test('CLI human output is warning-first prose without a verdict', () => {
  const r = runCli([]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /workflow:redteam - warning-first/);
  assert.match(r.stdout, /not pass\/fail verdicts/);
});

test('output hygiene: no timestamp/duration/verdict/promotion fields and no machine paths', () => {
  const r = runCli(['--include', 'all', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const text = r.stdout;
  assert.equal(/generated_at|timestamp|duration|elapsed|verdict|threshold|promotion_ready|can_promote/i.test(text), false);
  assert.equal(/"passed"|"failed"|"safe"|"unsafe"/.test(text), false);
  assert.equal(text.includes(KIT_ROOT), false, 'kit root path must not leak');
  assert.equal(text.includes(os.tmpdir()), false, 'temp path must not leak');
  // stdout is the JSON document only - no raw child stdout/stderr embedding.
  const report = JSON.parse(text);
  assert.equal(typeof report, 'object');
});

test('formatRedteamHuman surfaces warning case notes and the observation disclaimer', () => {
  const report = CORE_REPORT;
  const lines = formatRedteamHuman(report);
  assert.ok(lines[0].includes('warning-first'));
  assert.ok(lines.some((line) => line.includes('rt-d-to-unknown-current-gap [downgrade] observed-gap (warning)')));
  assert.ok(lines.some((line) => line.includes('Unknown is non-blocking by design')));
  assert.ok(lines[lines.length - 1].includes('not pass/fail verdicts'));
});
