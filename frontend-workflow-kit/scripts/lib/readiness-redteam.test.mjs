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
