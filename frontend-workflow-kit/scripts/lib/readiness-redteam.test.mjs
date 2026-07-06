// readiness-redteam.test.mjs - Phase 0 adversarial readiness fail-closed coverage.
//
// These tests consume computeReadiness and the existing ScreenSpec parser. They do
// not reimplement readiness decisions or add new gates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeReadiness } from '../readiness.mjs';
import { deriveMetrics, loadScreenSpec } from './spec.mjs';

const layout = {
  layerTelemetryDeclared: false,
  resolvePaths: (paths) => (Array.isArray(paths) ? [...paths] : []),
};

const policy = {
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

function specBody(openDecisionsSection = '') {
  return [
    '## Purpose',
    '',
    'Exercise adversarial readiness inputs.',
    '',
    STATE_MATRIX,
    '',
    openDecisionsSection,
  ].filter(Boolean).join('\n');
}

function withDerived(openDecisionsSection, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-redteam-'));
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
        specBody(openDecisionsSection),
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

function run(openDecisionsSection = '') {
  return withDerived(openDecisionsSection, (derived) => computeReadiness({
    state: {
      global: {},
      screens: {
        S1: {
          domain: 'coupons',
          status: 'authored',
          stub: false,
          derived,
        },
      },
    },
    policy,
    ci: {},
    manifest: {},
    layout,
  }).S1);
}

function decisionTable(row) {
  return [
    '## Open Decisions',
    '',
    '| ID | Decision Needed | Options | Blocking Mode | Owner | Status |',
    '| --- | --- | --- | --- | --- | --- |',
    row,
  ].join('\n');
}

function invalidDecision(result, id) {
  return result.blocking.find((b) => b.invalid_open_decision?.id === id)?.invalid_open_decision;
}

test('control: complete facts with no Open Decision reach final-fixture-ui', () => {
  const r = run();
  assert.equal(r.readiness_mode, 'final-fixture-ui');
  assert.deepEqual(r.blocking, []);
});

test('control: well-formed open Open Decision blocks only the target mode', () => {
  const r = run(decisionTable('| D-OK | choose copy | A/B | final-fixture-ui | pm | open |'));
  assert.equal(r.readiness_mode, 'rough-fixture-ui');
  assert.ok(r.blocking.some((b) => b.open_decision?.id === 'D-OK'));
  assert.equal(r.blocking.some((b) => b.invalid_open_decision), false);
});

test('Open Decision Blocking Mode typo fails closed to docs-only', () => {
  const r = run(decisionTable('| D-TYPO | choose copy | A/B | final_fixture_ui | pm | open |'));
  assert.equal(r.readiness_mode, 'docs-only');
  assert.deepEqual(invalidDecision(r, 'D-TYPO'), {
    id: 'D-TYPO',
    blocking_mode: 'final_fixture_ui',
  });
});

test('Open Decision missing Status fails closed instead of disappearing', () => {
  const r = run(decisionTable('| D-NO-STATUS | choose copy | A/B | final-fixture-ui | pm | |'));
  assert.equal(r.readiness_mode, 'docs-only');
  assert.deepEqual(invalidDecision(r, 'D-NO-STATUS'), {
    id: 'D-NO-STATUS',
    blocking_mode: 'final-fixture-ui',
  });
});

test('Open Decision non-enum Status fails closed instead of disappearing', () => {
  const r = run(decisionTable('| D-BAD-STATUS | choose copy | A/B | final-fixture-ui | pm | done |'));
  assert.equal(r.readiness_mode, 'docs-only');
  assert.deepEqual(invalidDecision(r, 'D-BAD-STATUS'), {
    id: 'D-BAD-STATUS',
    blocking_mode: 'final-fixture-ui',
  });
});

test('Open Decisions section with non-table content fails closed', () => {
  const r = run([
    '## Open Decisions',
    '',
    '- D-BULLET: decide the copy before final UI.',
  ].join('\n'));
  assert.equal(r.readiness_mode, 'docs-only');
  assert.deepEqual(invalidDecision(r, '(unparsable-decisions)'), {
    id: '(unparsable-decisions)',
    blocking_mode: '(none)',
  });
});

test('Blocking Mode docs-only is invalid and fails closed', () => {
  const r = run(decisionTable('| D-FLOOR | choose copy | A/B | docs-only | pm | open |'));
  assert.equal(r.readiness_mode, 'docs-only');
  assert.deepEqual(invalidDecision(r, 'D-FLOOR'), {
    id: 'D-FLOOR',
    blocking_mode: 'docs-only',
  });
});

// --- red-team Phase 1: D→U downgrade observation ----------------------------
// Threat model: an LLM (or a hurried author) rewrites an open Open Decision (D)
// as an Unknown (U) so the decision cap disappears and readiness climbs back up.
// These tests OBSERVE current behavior - they add no gate, do not make readiness
// treat Unknowns as blocking, and must not fail while the gap exists. The point
// is to pin the threat model in the repo mechanically.
//
// TODO(red-team Phase 2): decide where a D→U downgrade should be observed
// canonically - e.g. a diff-aware observation (Open Decisions row removed while
// an equivalent Unknowns row appears) in validate/eval/telemetry - and whether it
// stays info-only. Blocking Unknowns outright is NOT the goal (Unknowns are a
// legitimate fact-finding queue, per the roadmap gate inventory).

function unknownsTable(row) {
  return [
    '## Unknowns',
    '',
    '| ID | Question | Status |',
    '| --- | --- | --- |',
    row,
  ].join('\n');
}

function observe(openDecisionsSection) {
  return withDerived(openDecisionsSection, (derived) => ({
    derived,
    readiness: computeReadiness({
      state: {
        global: {},
        screens: {
          S1: { domain: 'coupons', status: 'authored', stub: false, derived },
        },
      },
      policy,
      ci: {},
      manifest: {},
      layout,
    }).S1,
  }));
}

test('red-team control: the same decision kept as an open D row blocks final-fixture-ui', () => {
  const { readiness } = observe(decisionTable('| D-DOWN | choose auth copy | A/B | final-fixture-ui | pm | open |'));
  assert.equal(readiness.readiness_mode, 'rough-fixture-ui');
  assert.ok(readiness.blocking.some((b) => b.open_decision?.id === 'D-DOWN'));
});

test('red-team: in-table downgrade (Status rewritten to "unknown") already fails closed', () => {
  // Rewriting the Status cell in place does NOT bypass the gate: a non-enum
  // status is malformed and pins the screen to docs-only (fail-closed).
  const r = run(decisionTable('| D-DOWN | choose auth copy | A/B | final-fixture-ui | pm | unknown |'));
  assert.equal(r.readiness_mode, 'docs-only');
  assert.deepEqual(invalidDecision(r, 'D-DOWN'), {
    id: 'D-DOWN',
    blocking_mode: 'final-fixture-ui',
  });
});

test('red-team: documents current D→U downgrade gap without changing readiness - a D row moved to the Unknowns section reopens final-fixture-ui', () => {
  // KNOWN GAP OBSERVATION (not a desired pass/fail security proof): moving the
  // decision out of Open Decisions into an open Unknowns row removes the
  // decision cap entirely under current rules, so readiness climbs back to
  // final-fixture-ui. This pins today's actual behavior; no gate is added and
  // Unknowns stay non-blocking by design.
  const { readiness, derived } = observe(
    unknownsTable('| U-DOWN | which auth copy do we ship? | open |'),
  );
  assert.equal(readiness.readiness_mode, 'final-fixture-ui');
  assert.deepEqual(readiness.blocking, []);
  assert.equal(derived.open_decisions_count, 0);
  // The downgrade is not invisible: it remains observable as an open Unknown in
  // the derived metrics (unknown_count/tbd_count), which is where a Phase 2
  // canonical observation could anchor without turning Unknowns into a gate.
  assert.equal(derived.unknown_count, 1);
  assert.equal(derived.tbd_count, 1);
});
