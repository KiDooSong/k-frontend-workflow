// redteam-path-backstop.test.mjs - red-team Phase 1: forbidden-paths adversarial
// diff fixtures.
//
// These tests are regression pins for the EXISTING forbidden-paths backstop
// contract, not a new gate: `--enforce` already exits 1 on guarded-surface
// violations, and without `--enforce` the tool stays warning-first (exit 0 with
// violations recorded in JSON). Nothing here wires `--enforce` into CI, changes
// readiness/validate/forbidden-paths decision logic, or promotes a hard gate.
//
// Fixtures: the committed examples/path-backstop states/diffs (UNCLEARED project:
// COUPON-001 rough-fixture-ui, AUTH-001 final-fixture-ui - no screen reaches the
// api-integrated-ui clearance threshold) plus adversarial name-status diffs
// written to a temp dir. Live git diffs are never used - `--diff <file>` only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT } from './util.mjs';

const CLI = path.join(KIT_ROOT, 'scripts', 'forbidden-paths.mjs');
const FIXTURES = path.join(KIT_ROOT, 'examples', 'path-backstop');
const UNCLEARED_DOCS = path.join(FIXTURES, 'docs', 'frontend-workflow');

function runBackstop({ diff, docs = UNCLEARED_DOCS, enforce = false }) {
  const args = [CLI, '--diff', diff, '--docs', docs, '--json'];
  if (enforce) args.push('--enforce');
  return spawnSync(process.execPath, args, { encoding: 'utf8' });
}

function withDiff(content, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'redteam-path-backstop-'));
  try {
    const file = path.join(tmp, 'adversarial.diff.txt');
    fs.writeFileSync(file, content, 'utf8');
    return fn(file);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Adversarial shape: an authored/rough-level project smuggles one guarded
// src/api write in between allowed feature-path edits (camouflage).
const CAMOUFLAGED_API_WRITE = [
  'M\tsrc/features/coupons/screens/CouponListScreen.tsx',
  'A\tsrc/features/coupons/components/CouponBadge.tsx',
  'M\tsrc/api/couponClient.ts',
  '',
].join('\n');

const ALLOWED_ONLY = [
  'M\tsrc/features/coupons/screens/CouponListScreen.tsx',
  'A\tsrc/features/coupons/components/CouponBadge.tsx',
  '',
].join('\n');

// Corrupted status token: input error territory, never a metric finding.
const MALFORMED_DIFF = [
  'D123\tsrc/api/couponClient.ts',
  '',
].join('\n');

test('red-team: camouflaged src/api write from a rough/final-level project exits 1 under --enforce', () => {
  withDiff(CAMOUFLAGED_API_WRITE, (diff) => {
    const r = runBackstop({ diff, enforce: true });
    assert.equal(r.status, 1, r.stderr);
    const obj = JSON.parse(r.stdout);
    assert.equal(obj.ok, false);
    assert.equal(obj.enforced, true);
    assert.equal(obj.violations.length, 1);
    // Stable violation identity: only the guarded write is flagged, with the
    // narrowest matching surface and a non-empty reason.
    const violation = obj.violations[0];
    assert.equal(violation.file, 'src/api/couponClient.ts');
    assert.equal(violation.surface, 'src/api/**');
    assert.match(violation.reason, /api-integrated-ui/);
    assert.ok(violation.would_clear.length > 0);
    // The camouflage paths never appear as violations.
    assert.equal(obj.violations.some((v) => v.file.includes('features')), false);
  });
});

test('red-team: the same boundary-crossing diff without --enforce stays warning-first (exit 0, violations recorded)', () => {
  withDiff(CAMOUFLAGED_API_WRITE, (diff) => {
    const r = runBackstop({ diff });
    assert.equal(r.status, 0, r.stderr);
    const obj = JSON.parse(r.stdout);
    assert.equal(obj.ok, false);
    assert.equal(obj.enforced, false);
    // Warning-first contract: findings survive in JSON even though exit is 0.
    assert.equal(obj.violations.length, 1);
    assert.equal(obj.violations[0].file, 'src/api/couponClient.ts');
  });
});

test('red-team: allowed feature-path-only diff is silent even under --enforce', () => {
  withDiff(ALLOWED_ONLY, (diff) => {
    for (const enforce of [false, true]) {
      const r = runBackstop({ diff, enforce });
      assert.equal(r.status, 0, r.stderr);
      const obj = JSON.parse(r.stdout);
      assert.equal(obj.ok, true);
      assert.deepEqual(obj.violations, []);
    }
  });
});

test('red-team: rename smuggling into src/api is caught via the rename target path (committed fixture)', () => {
  const r = runBackstop({ diff: path.join(FIXTURES, 'diffs', 'case6-rename.txt'), enforce: true });
  assert.equal(r.status, 1, r.stderr);
  const obj = JSON.parse(r.stdout);
  assert.equal(obj.violations.length, 1);
  assert.equal(obj.violations[0].file, 'src/api/newClient.ts');
  assert.match(obj.violations[0].change, /renamed/);
});

test('red-team: openapi contract writes are always flagged (no mode allows them)', () => {
  const r = runBackstop({ diff: path.join(FIXTURES, 'diffs', 'case7-openapi.txt'), enforce: true });
  assert.equal(r.status, 1, r.stderr);
  const obj = JSON.parse(r.stdout);
  assert.equal(obj.violations.length, 1);
  assert.equal(obj.violations[0].surface, 'openapi.yaml');
});

test('red-team: malformed name-status input is an input error (exit 2), not a metric finding', () => {
  // A corrupted diff must never silently pass (fail-open) or count as a
  // violation metric - it is rejected as invalid input with or without --enforce.
  withDiff(MALFORMED_DIFF, (diff) => {
    for (const enforce of [false, true]) {
      const r = runBackstop({ diff, enforce });
      assert.equal(r.status, 2, `expected exit 2 (enforce=${enforce}): ${r.stdout}`);
      assert.match(r.stderr, /name-status/);
      assert.equal(r.stdout.includes('"violations"'), false);
    }
  });
});
