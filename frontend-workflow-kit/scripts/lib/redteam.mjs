// redteam.mjs (lib) - warning-first adversarial observation matrix.
//
// Promotes the scattered red-team tests (readiness-redteam / readiness-failopen /
// redteam-path-backstop) into one deterministic observation report. It consumes
// the existing single-source tools - computeReadiness, the ScreenSpec parser, and
// the forbidden-paths CLI - and never reimplements their decision logic, never
// adds a gate, and never turns an observation into a pass/fail verdict.
//
// Status labels are OBSERVATIONS, not verdicts:
//   blocked        - an existing defense blocked the adversarial input (witness).
//   fail-closed    - malformed input pinned readiness conservatively (witness).
//   drift-detected - pinned behavior changed / golden drift observed.
//   observed-gap   - a real current gap is documented; needs a HUMAN design
//                    decision. Not a failure and never exit 1.
//   skipped        - case did not run (control bookkeeping or missing opt-in
//                    fixture, e.g. examples/** are not vendored to consumers).
//   input-error    - fixture/input contract witness (e.g. corrupted diff is
//                    rejected with exit 2 instead of failing open).
//
// severity: 'warning' only when a case documents a live gap or when a pinned
// observation deviates; expected defense witnesses stay 'info'. warning_count
// therefore never counts blocked/fail-closed/expected input-error cases.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT, exists } from './util.mjs';
import { computeReadiness } from '../readiness.mjs';
import { deriveMetrics, loadScreenSpec } from './spec.mjs';

export const REDTEAM_CASE_GROUPS = [
  'readiness',
  'path-backstop',
  'downgrade',
  'golden-tampering',
  'self-resolve',
];

// core = the cheap deterministic groups that always run. golden-tampering and
// self-resolve stay opt-in (--include golden-tampering / self-resolve / all).
export const REDTEAM_CORE_GROUPS = ['readiness', 'path-backstop', 'downgrade'];

export const REDTEAM_KNOWN_INCLUDES = ['core', ...REDTEAM_CASE_GROUPS, 'all'];

export const REDTEAM_STATUSES = [
  'blocked',
  'fail-closed',
  'drift-detected',
  'observed-gap',
  'skipped',
  'input-error',
];

// --- readiness observation harness ------------------------------------------
// Same synthetic-spec approach as readiness-redteam.test.mjs: adversarial spec
// text flows through the REAL ScreenSpec parser (loadScreenSpec/deriveMetrics)
// and the REAL computeReadiness. Temp files never leak into the report.

const STUB_LAYOUT = {
  layerTelemetryDeclared: false,
  resolvePaths: (paths) => (Array.isArray(paths) ? [...paths] : []),
};

const READINESS_POLICY = {
  order: ['docs-only', 'rough-fixture-ui', 'final-fixture-ui'],
  modes: {
    'docs-only': { requires: [], allowed_paths: ['docs/**'], forbidden_paths: [] },
    'rough-fixture-ui': {
      requires: ['screen_spec_authored == true'],
      allowed_paths: ['src/rough/**'],
      forbidden_paths: [],
    },
    'final-fixture-ui': {
      requires: ['state_matrix_complete == true'],
      allowed_paths: ['src/final/**'],
      forbidden_paths: [],
    },
  },
};

const STATE_MATRIX = [
  '## State Matrix',
  '',
  '| State | Notes |',
  '| --- | --- |',
  '| loading | yes |',
  '| empty | yes |',
  '| error | yes |',
  '| success | yes |',
  '| disabled | yes |',
  '| refreshing | yes |',
].join('\n');

export function decisionTable(row) {
  return [
    '## Open Decisions',
    '',
    '| ID | Decision Needed | Options | Blocking Mode | Owner | Status |',
    '| --- | --- | --- | --- | --- | --- |',
    row,
  ].join('\n');
}

export function unknownsTable(row) {
  return [
    '## Unknowns',
    '',
    '| ID | Question | Status |',
    '| --- | --- | --- |',
    row,
  ].join('\n');
}

function specBody(section = '') {
  return [
    '## Purpose',
    '',
    'Adversarial readiness input (red-team synthetic spec).',
    '',
    STATE_MATRIX,
    '',
    section,
  ].filter(Boolean).join('\n');
}

function withSyntheticDerived(section, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-redteam-'));
  try {
    const file = path.join(tmp, 'screen-spec.md');
    fs.writeFileSync(
      file,
      [
        '---',
        'screen_id: S1',
        'domain: coupons',
        'status: authored',
        '---',
        '',
        specBody(section),
        '',
      ].join('\n'),
      'utf8',
    );
    const spec = loadScreenSpec(file);
    return fn(deriveMetrics(spec, { srcDir: path.join(tmp, 'src') }));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function readinessFor(derived, policy = READINESS_POLICY) {
  return computeReadiness({
    state: {
      global: {},
      screens: {
        S1: { domain: 'coupons', status: 'authored', stub: false, derived },
      },
    },
    policy,
    ci: {},
    manifest: {},
    layout: STUB_LAYOUT,
  }).S1;
}

function observeReadiness(section) {
  return withSyntheticDerived(section, (derived) => ({
    derived,
    readiness: readinessFor(derived),
  }));
}

function policyWithFinalRequires(finalRequires) {
  return {
    ...READINESS_POLICY,
    modes: {
      ...READINESS_POLICY.modes,
      'final-fixture-ui': {
        ...READINESS_POLICY.modes['final-fixture-ui'],
        requires: finalRequires,
      },
    },
  };
}

// Facts injected directly (readiness-failopen.test.mjs pattern) - the threat is
// the policy text, not the spec parser, so no synthetic spec file is needed.
function observePolicyReadiness(finalRequires, derived) {
  return readinessFor(derived, policyWithFinalRequires(finalRequires));
}

function blockingKindsOf(blocking) {
  const kinds = new Set();
  for (const entry of blocking || []) {
    if (entry.invalid_open_decision) kinds.add('invalid_open_decision');
    else if (entry.open_decision) kinds.add('open_decision');
    else if (entry.invalid_policy_requirement) kinds.add('invalid_policy_requirement');
    else kinds.add('fact');
  }
  return [...kinds].sort();
}

function readinessObserved(readiness) {
  return {
    readiness_mode: String(readiness?.readiness_mode || ''),
    blocking_kinds: blockingKindsOf(readiness?.blocking),
  };
}

// --- observation result helpers ---------------------------------------------

// Defense witness: while the pinned defense holds, the case records the defense
// label with severity info. A deviation means the defense no longer holds - that
// is itself an observed gap (warning), never an exit-code change.
function defenseObservation({ expectedKind, held, observed, notes = [] }) {
  if (held) return { status: expectedKind, severity: 'info', observed, notes };
  return {
    status: 'observed-gap',
    severity: 'warning',
    observed,
    notes: [
      ...notes,
      `expected ${expectedKind} but the observed behavior deviated - the pinned defense no longer holds; review this case and the underlying tool`,
    ],
  };
}

// Known-gap observation: while the gap reproduces it stays observed-gap (warning
// - needs a human design decision). When it stops reproducing, the pinned
// behavior drifted and the case records drift-detected so it gets updated.
function gapObservation({ held, observed, notes = [] }) {
  if (held) return { status: 'observed-gap', severity: 'warning', observed, notes };
  return {
    status: 'drift-detected',
    severity: 'warning',
    observed,
    notes: [
      ...notes,
      'documented gap did not reproduce - readiness behavior changed; update this red-team case',
    ],
  };
}

function skippedObservation(notes) {
  return { status: 'skipped', severity: 'info', observed: {}, notes };
}

// --- forbidden-paths (path-backstop) harness ---------------------------------
// Committed fixtures only - never a live git diff, never a fixture mutation.
// examples/** are not vendored to consumers, so a missing fixture is a skip
// (with a note), not an error.

const FORBIDDEN_PATHS_CLI = path.join(KIT_ROOT, 'scripts', 'forbidden-paths.mjs');
const REDTEAM_DIFFS = path.join(KIT_ROOT, 'examples', 'redteam', 'path-backstop', 'diffs');
const BACKSTOP_DOCS = path.join(KIT_ROOT, 'examples', 'path-backstop', 'docs', 'frontend-workflow');

function backstopFixtureMissingNotes(diffFile) {
  return [
    `path-backstop fixture not available in this install (examples/${path.posix.join('redteam/path-backstop/diffs', diffFile)} or the uncleared example state is missing).`,
    'examples/** are kit-repo fixtures and are not vendored into consumer payloads; run workflow:redteam from the kit repo for this group.',
  ];
}

function runForbiddenPathsFixture(diffFile, { enforce = false } = {}) {
  const args = [
    FORBIDDEN_PATHS_CLI,
    '--diff', path.join(REDTEAM_DIFFS, diffFile),
    '--docs', BACKSTOP_DOCS,
    '--json',
  ];
  if (enforce) args.push('--enforce');
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  if (result.error) return { spawned: false, exit: null, json: null };
  let json = null;
  try {
    json = JSON.parse(result.stdout || '');
  } catch {
    json = null;
  }
  return { spawned: true, exit: result.status, json };
}

function backstopCase(diffFile, fn) {
  const state = path.join(BACKSTOP_DOCS, '_meta', 'workflow-state.yaml');
  if (!exists(FORBIDDEN_PATHS_CLI) || !exists(path.join(REDTEAM_DIFFS, diffFile)) || !exists(state)) {
    return skippedObservation(backstopFixtureMissingNotes(diffFile));
  }
  return fn();
}

function violationCount(json) {
  return Array.isArray(json?.violations) ? json.violations.length : -1;
}

// --- case registry ------------------------------------------------------------
// Order is the fixed report order. `expected.kind` states the invariant's
// expected observation; `run()` returns the observed status/severity/notes.

const CASES = [
  // --- readiness fail-closed witnesses (core) --------------------------------
  {
    id: 'rt-open-decision-blocking-mode-typo',
    group: 'readiness',
    threat: 'a Blocking Mode typo in an Open Decision row could silently drop the decision cap',
    invariant: 'malformed Open Decision is fail-closed (docs-only + invalid_open_decision)',
    expected: 'fail-closed',
    run() {
      const { readiness } = observeReadiness(
        decisionTable('| D-TYPO | choose copy | A/B | final_fixture_ui | pm | open |'),
      );
      const observed = readinessObserved(readiness);
      return defenseObservation({
        expectedKind: 'fail-closed',
        held: observed.readiness_mode === 'docs-only'
          && observed.blocking_kinds.includes('invalid_open_decision'),
        observed,
      });
    },
  },
  {
    id: 'rt-open-decision-missing-status',
    group: 'readiness',
    threat: 'an Open Decision row with an emptied Status cell could disappear from the gate',
    invariant: 'missing Status is fail-closed instead of disappearing',
    expected: 'fail-closed',
    run() {
      const { readiness } = observeReadiness(
        decisionTable('| D-NO-STATUS | choose copy | A/B | final-fixture-ui | pm | |'),
      );
      const observed = readinessObserved(readiness);
      return defenseObservation({
        expectedKind: 'fail-closed',
        held: observed.readiness_mode === 'docs-only'
          && observed.blocking_kinds.includes('invalid_open_decision'),
        observed,
      });
    },
  },
  {
    id: 'rt-open-decision-non-enum-status',
    group: 'readiness',
    threat: 'a non-enum Status ("done") could be read as resolved and lift the cap',
    invariant: 'non-enum Status is fail-closed instead of disappearing',
    expected: 'fail-closed',
    run() {
      const { readiness } = observeReadiness(
        decisionTable('| D-BAD-STATUS | choose copy | A/B | final-fixture-ui | pm | done |'),
      );
      const observed = readinessObserved(readiness);
      return defenseObservation({
        expectedKind: 'fail-closed',
        held: observed.readiness_mode === 'docs-only'
          && observed.blocking_kinds.includes('invalid_open_decision'),
        observed,
      });
    },
  },
  {
    id: 'rt-open-decision-non-table-section',
    group: 'readiness',
    threat: 'rewriting the Open Decisions table as bullets could make every decision unparseable and invisible',
    invariant: 'a non-table Open Decisions section is fail-closed',
    expected: 'fail-closed',
    run() {
      const { readiness } = observeReadiness([
        '## Open Decisions',
        '',
        '- D-BULLET: decide the copy before final UI.',
      ].join('\n'));
      const observed = readinessObserved(readiness);
      return defenseObservation({
        expectedKind: 'fail-closed',
        held: observed.readiness_mode === 'docs-only'
          && observed.blocking_kinds.includes('invalid_open_decision'),
        observed,
      });
    },
  },
  {
    id: 'rt-policy-malformed-bare-token',
    group: 'readiness',
    threat: 'a bare-token policy requirement (no operator) could silently drop a mode gate (fail-open)',
    invariant: 'malformed policy requirement is fail-closed (mode capped + invalid_policy_requirement)',
    expected: 'fail-closed',
    run() {
      const readiness = observePolicyReadiness(['state_matrix_complete'], { state_matrix_complete: true });
      const observed = readinessObserved(readiness);
      return defenseObservation({
        expectedKind: 'fail-closed',
        held: observed.readiness_mode === 'rough-fixture-ui'
          && observed.blocking_kinds.includes('invalid_policy_requirement'),
        observed,
      });
    },
  },
  {
    id: 'rt-policy-malformed-single-equals',
    group: 'readiness',
    threat: 'a single-equals policy requirement could be misparsed and silently pass the gate',
    invariant: 'malformed policy requirement (single =) is fail-closed',
    expected: 'fail-closed',
    run() {
      const readiness = observePolicyReadiness(['screen_spec_status = authored'], { state_matrix_complete: true });
      const observed = readinessObserved(readiness);
      return defenseObservation({
        expectedKind: 'fail-closed',
        held: observed.readiness_mode === 'rough-fixture-ui'
          && observed.blocking_kinds.includes('invalid_policy_requirement'),
        observed,
      });
    },
  },

  // --- path-backstop adversarial diffs (core) --------------------------------
  {
    id: 'rt-path-backstop-guarded-api-write',
    group: 'path-backstop',
    threat: 'a guarded src/api write camouflaged between allowed feature-path edits, before clearance',
    invariant: 'the diff backstop flags the guarded write: --enforce exits 1; without --enforce it stays warning-first with the violation recorded',
    expected: 'blocked',
    run() {
      return backstopCase('guarded-api-write.txt', () => {
        const enforced = runForbiddenPathsFixture('guarded-api-write.txt', { enforce: true });
        const warningFirst = runForbiddenPathsFixture('guarded-api-write.txt');
        if (!enforced.spawned || !warningFirst.spawned) {
          return defenseObservation({
            expectedKind: 'blocked',
            held: false,
            observed: {},
            notes: ['forbidden-paths CLI could not be spawned'],
          });
        }
        const violation = Array.isArray(enforced.json?.violations) ? enforced.json.violations[0] : null;
        const observed = {
          enforce_child_exit: enforced.exit,
          enforce_violation_count: violationCount(enforced.json),
          violation_file: violation ? String(violation.file || '') : null,
          violation_surface: violation ? String(violation.surface || '') : null,
          warning_first_child_exit: warningFirst.exit,
          warning_first_violation_count: violationCount(warningFirst.json),
        };
        return defenseObservation({
          expectedKind: 'blocked',
          held: enforced.exit === 1
            && enforced.json?.ok === false
            && observed.enforce_violation_count === 1
            && observed.violation_file === 'src/api/couponClient.ts'
            && warningFirst.exit === 0
            && observed.warning_first_violation_count === 1,
          observed,
          notes: [
            'blocked is the --enforce witness (child exit 1); the same diff without --enforce stays exit 0 with the violation recorded in JSON (warning-first contract, kept as a note instead of a second status).',
            'observation only - --enforce is not wired into CI by this case.',
          ],
        });
      });
    },
  },
  {
    id: 'rt-path-backstop-allowed-paths-control',
    group: 'path-backstop',
    threat: 'control case - the backstop must stay silent for allowed feature-path-only diffs',
    invariant: 'an allowed-path diff produces zero violations with and without --enforce',
    expected: 'skipped',
    run() {
      return backstopCase('allowed-only.txt', () => {
        const enforced = runForbiddenPathsFixture('allowed-only.txt', { enforce: true });
        const warningFirst = runForbiddenPathsFixture('allowed-only.txt');
        if (!enforced.spawned || !warningFirst.spawned) {
          return defenseObservation({
            expectedKind: 'skipped',
            held: false,
            observed: {},
            notes: ['forbidden-paths CLI could not be spawned'],
          });
        }
        const observed = {
          enforce_child_exit: enforced.exit,
          warning_first_child_exit: warningFirst.exit,
          violation_count: violationCount(enforced.json),
        };
        return defenseObservation({
          expectedKind: 'skipped',
          held: enforced.exit === 0
            && warningFirst.exit === 0
            && enforced.json?.ok === true
            && observed.violation_count === 0,
          observed,
          notes: [
            'control case: an allowed feature-path-only diff stays silent; recorded as skipped so blocked_count counts only guarded-write witnesses.',
          ],
        });
      });
    },
  },
  {
    id: 'rt-path-backstop-malformed-diff-input',
    group: 'path-backstop',
    threat: 'a corrupted name-status diff could fail open (silently pass) or pollute violation metrics',
    invariant: 'malformed diff input is rejected as an input error (exit 2) with and without --enforce - a fixture/input contract witness, never a metric finding',
    expected: 'input-error',
    run() {
      return backstopCase('malformed.txt', () => {
        const enforced = runForbiddenPathsFixture('malformed.txt', { enforce: true });
        const warningFirst = runForbiddenPathsFixture('malformed.txt');
        if (!enforced.spawned || !warningFirst.spawned) {
          return defenseObservation({
            expectedKind: 'input-error',
            held: false,
            observed: {},
            notes: ['forbidden-paths CLI could not be spawned'],
          });
        }
        const observed = {
          enforce_child_exit: enforced.exit,
          warning_first_child_exit: warningFirst.exit,
          violations_reported: Boolean(enforced.json) || Boolean(warningFirst.json),
        };
        return defenseObservation({
          expectedKind: 'input-error',
          held: enforced.exit === 2 && warningFirst.exit === 2 && observed.violations_reported === false,
          observed,
          notes: [
            'fixture/input contract witness: corrupted name-status input is rejected (exit 2) instead of failing open, and never becomes a violation metric.',
            'expected input errors are not counted in warning_count.',
          ],
        });
      });
    },
  },

  // --- D->U downgrade observation (core) --------------------------------------
  {
    id: 'rt-open-decision-blocks-final',
    group: 'downgrade',
    threat: 'control case - the blocker kept as an open Open Decision row must cap readiness',
    invariant: 'an open Open Decision row blocks its Blocking Mode',
    expected: 'blocked',
    run() {
      const { readiness } = observeReadiness(
        decisionTable('| D-DOWN | choose auth copy | A/B | final-fixture-ui | pm | open |'),
      );
      const observed = readinessObserved(readiness);
      return defenseObservation({
        expectedKind: 'blocked',
        held: observed.readiness_mode === 'rough-fixture-ui'
          && (readiness.blocking || []).some((b) => b.open_decision?.id === 'D-DOWN'),
        observed,
        notes: [
          'control: the same blocker kept as an open Open Decision row caps readiness below final-fixture-ui.',
        ],
      });
    },
  },
  {
    id: 'rt-d-to-unknown-current-gap',
    group: 'downgrade',
    threat: 'an LLM (or hurried author) rewrites an open Open Decision (D) as an Unknown (U), so the decision cap disappears and readiness climbs back up',
    invariant: 'CURRENT GAP: a blocker moved into the Unknowns section reopens final-fixture-ui (Unknowns are intentionally non-blocking)',
    expected: 'observed-gap',
    run() {
      const { readiness, derived } = observeReadiness(
        unknownsTable('| U-DOWN | which auth copy do we ship? | open |'),
      );
      const observed = {
        ...readinessObserved(readiness),
        unknown_count: Number(derived?.unknown_count) || 0,
        tbd_count: Number(derived?.tbd_count) || 0,
      };
      return gapObservation({
        held: observed.readiness_mode === 'final-fixture-ui'
          && observed.blocking_kinds.length === 0
          && observed.unknown_count === 1,
        observed,
        notes: [
          'Unknown is non-blocking by design; this case records the downgrade risk without changing readiness.',
          'No gate was added: readiness and the Open Decision parser are unchanged, and Unknowns remain a legitimate fact-finding queue.',
          'The downgrade stays observable via derived unknown_count/tbd_count; the canonical observation point requires a human design decision (red-team Phase 2).',
        ],
      });
    },
  },

  // --- golden tampering sentinel (opt-in) -------------------------------------
  {
    id: 'rt-golden-tampering-sentinel',
    group: 'golden-tampering',
    threat: 'expected/golden output is tampered with so a drifted generator output looks green',
    invariant: 'the existing test-fixtures harness reports tampered goldens as drift (xpass/content mismatch)',
    expected: 'drift-detected',
    run() {
      return skippedObservation([
        'golden tampering sentinel is test-only in this PR: scripts/lib/redteam.test.mjs runs the existing generated-view fixture harness against a temp-tampered golden copy and asserts the drift is reported.',
        'committed fixtures are never mutated; a future CLI-backed sentinel could surface that drift here as status drift-detected.',
      ]);
    },
  },

  // --- self-resolve observation (opt-in) --------------------------------------
  {
    id: 'rt-self-resolve-provenance-gap',
    group: 'self-resolve',
    threat: 'the same agent/session that opened an Open Decision flips its Status to resolved, and readiness rises without any human in the loop',
    invariant: 'CURRENT GAP: readiness alone cannot attribute WHO resolved an Open Decision - open->resolved provenance is not machine-attributable from readiness output',
    expected: 'observed-gap',
    run() {
      const open = observeReadiness(
        decisionTable('| D-SELF | choose auth copy | A/B | final-fixture-ui | pm | open |'),
      ).readiness;
      const resolved = observeReadiness(
        decisionTable('| D-SELF | choose auth copy | A/B | final-fixture-ui | pm | resolved |'),
      ).readiness;
      const observed = {
        open_row_readiness_mode: String(open?.readiness_mode || ''),
        resolved_row_readiness_mode: String(resolved?.readiness_mode || ''),
        resolved_row_blocking_kinds: blockingKindsOf(resolved?.blocking),
      };
      return gapObservation({
        held: observed.open_row_readiness_mode === 'rough-fixture-ui'
          && observed.resolved_row_readiness_mode === 'final-fixture-ui'
          && observed.resolved_row_blocking_kinds.length === 0,
        observed,
        notes: [
          'a resolved row may be a legitimate human resolution; readiness alone cannot attribute the actor or provenance of the open->resolved transition.',
          'this case records the gap without blocking resolved rows and without adding actor tracking, git-blame logic, automatic reversal, or a new gate.',
          'a canonical observation point likely belongs to the reconcile/session/provenance layer, not readiness; that is a human design decision.',
          'no automatic resolve/confirm/close is added by this case.',
        ],
      });
    },
  },
];

// --- selection / report --------------------------------------------------------

export function listRedteamCases() {
  return CASES.map((def) => ({
    id: def.id,
    group: def.group,
    threat: def.threat,
    invariant: def.invariant,
    expected: { kind: def.expected },
  }));
}

// Additive like telemetry groups: core always runs; --include adds the opt-in
// groups on top ('core' and the core group names are accepted no-ops).
export function expandRedteamGroups(includeGroups = []) {
  const groups = new Set(REDTEAM_CORE_GROUPS);
  for (const group of includeGroups) {
    if (group === 'core') continue;
    if (group === 'all') {
      for (const known of REDTEAM_CASE_GROUPS) groups.add(known);
      continue;
    }
    if (!REDTEAM_CASE_GROUPS.includes(group)) {
      throw new Error(`unknown redteam group: ${group} (known: ${REDTEAM_KNOWN_INCLUDES.join(', ')})`);
    }
    groups.add(group);
  }
  return groups;
}

export function selectRedteamCases({ includeGroups = [], caseIds = [] } = {}) {
  const groups = expandRedteamGroups(includeGroups);
  if (caseIds.length > 0) {
    const known = new Set(CASES.map((def) => def.id));
    for (const id of caseIds) {
      if (!known.has(id)) {
        throw new Error(`unknown redteam case id: ${id}`);
      }
    }
    // --case narrows to exactly the requested ids (any group, opt-in included).
    const wanted = new Set(caseIds);
    return CASES.filter((def) => wanted.has(def.id));
  }
  return CASES.filter((def) => groups.has(def.group));
}

function runCaseDefinition(def) {
  let result;
  try {
    result = def.run();
  } catch {
    // A crashed case runner is an unexpected input error - it IS a warning
    // (unlike the expected input-contract witnesses), but never an exit-1.
    result = {
      status: 'input-error',
      severity: 'warning',
      observed: {},
      notes: ['case runner failed unexpectedly; run scripts/lib/redteam.test.mjs for details'],
    };
  }
  return {
    id: def.id,
    group: def.group,
    threat: def.threat,
    invariant: def.invariant,
    status: result.status,
    severity: result.severity,
    observed: result.observed || {},
    expected: { kind: def.expected },
    notes: result.notes || [],
  };
}

export function summarizeRedteamCases(cases) {
  const count = (status) => cases.filter((c) => c.status === status).length;
  return {
    case_count: cases.length,
    observed_gap_count: count('observed-gap'),
    blocked_count: count('blocked'),
    fail_closed_count: count('fail-closed'),
    drift_detected_count: count('drift-detected'),
    skipped_count: count('skipped'),
    input_error_count: count('input-error'),
    warning_count: cases.filter((c) => c.severity === 'warning').length,
  };
}

// docsDir/srcDir are accepted for CLI interface consistency but intentionally
// unused today: every core case runs against synthetic specs or committed kit
// fixtures so the report stays deterministic regardless of the consumer repo.
export function collectRedteamReport({ includeGroups = [], caseIds = [] } = {}) {
  const selected = selectRedteamCases({ includeGroups, caseIds });
  const cases = selected.map((def) => runCaseDefinition(def));
  return {
    tool: 'workflow:redteam',
    mode: 'warning-first',
    schema_version: 1,
    // ok only means the red-team observation report was produced. It is not a
    // verdict about any case, and observed gaps never flip it.
    ok: true,
    summary: summarizeRedteamCases(cases),
    cases,
  };
}

export function formatRedteamHuman(report) {
  const cases = Array.isArray(report?.cases) ? report.cases : [];
  const summary = report?.summary || summarizeRedteamCases(cases);
  const lines = [
    `workflow:redteam - warning-first: ${summary.case_count} case(s) observed, ${summary.warning_count} warning(s) (gaps needing a human design decision)`,
  ];
  for (const c of cases) {
    const marker = c.severity === 'warning' ? ' (warning)' : '';
    lines.push(`  ${c.id} [${c.group}] ${c.status}${marker}`);
    if (c.severity === 'warning') {
      for (const note of c.notes) lines.push(`    - ${note}`);
    }
  }
  lines.push(
    'status labels are observations, not pass/fail verdicts; observed-gap means "needs a human design decision", not failure.',
  );
  return lines;
}
