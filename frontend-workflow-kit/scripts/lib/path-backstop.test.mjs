import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { KIT_ROOT, yamlStringify } from './util.mjs';
import {
  parseNameStatusText,
  pathAuthorization,
  writePathsOf,
} from './path-backstop.mjs';

const CLI = path.join(KIT_ROOT, 'scripts', 'forbidden-paths.mjs');

function candidate(method, endpoint, gate, tracking, slicePath) {
  return {
    raw: `${method} ${endpoint}`,
    method,
    path: endpoint,
    confidence: gate === 'active' ? 'confirmed' : 'candidate',
    gate,
    tracking,
    slice_paths: [slicePath],
    safe_slice_paths: [slicePath],
    contract_version: 2,
    valid: true,
  };
}

function screenDerived({ v2 = false } = {}) {
  const base = {
    state_matrix_complete: true,
    interaction_matrix_complete: true,
    copy_keys_has_tbd: false,
    tbd_count: 1,
    unknown_count: 1,
    open_decisions_count: 0,
    blocking_decisions: [],
    malformed_decisions: [],
    api_confidence_min: v2 ? 'candidate' : 'confirmed',
    fake_hook_exists: true,
    figma_mapping_status: 'draft',
  };
  if (!v2) return base;
  const active = candidate('GET', '/live', 'active', '-', 'src/api/live/**');
  const deferred = candidate(
    'GET',
    '/stock',
    'deferred',
    'issue:#210',
    'src/api/stock/**',
  );
  return {
    ...base,
    api_candidate_contract_version: 2,
    api_actionable_confidence_min: 'confirmed',
    api_actionable_candidates_count: 1,
    api_candidate_deferrals_valid: true,
    api_actionable_candidates: [active],
    api_deferred_candidates: [deferred],
    api_candidate_contract_issues: [],
  };
}

function stateFixture() {
  return {
    generated_at: '2026-07-24',
    global: {
      navigation_map_status: 'draft',
      component_catalog_generated: true,
      stub_screen_specs_count: 2,
    },
    screens: {
      V2: {
        status: 'confirmed',
        domain: 'create',
        route: '/create',
        stub: false,
        derived: screenDerived({ v2: true }),
      },
      LEGACY: {
        status: 'confirmed',
        domain: 'legacy',
        route: '/legacy',
        stub: false,
        derived: screenDerived(),
      },
    },
  };
}

function runBackstop(t, diffText, state = stateFixture()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-candidate-backstop-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = path.join(root, 'docs', 'frontend-workflow');
  const meta = path.join(docs, '_meta');
  fs.mkdirSync(meta, { recursive: true });
  fs.writeFileSync(path.join(meta, 'workflow-state.yaml'), yamlStringify(state), 'utf8');
  const diff = path.join(root, 'changes.diff');
  fs.writeFileSync(diff, diffText, 'utf8');
  const result = spawnSync(
    process.execPath,
    [CLI, '--docs', docs, '--diff', diff, '--enforce', '--json'],
    { cwd: root, encoding: 'utf8' },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    json: result.stdout ? JSON.parse(result.stdout) : null,
  };
}

test('forbidden matching has priority over a broader allowed path', () => {
  const result = pathAuthorization(
    'src/api/stock/client.ts',
    ['src/api/**'],
    ['src/api/stock/**'],
  );
  assert.equal(result.allowed, false);
  assert.deepEqual(result.allowed_by, ['src/api/**']);
  assert.deepEqual(result.forbidden_by, ['src/api/stock/**']);
});

test('deferred candidate diff is blocked even when another legacy screen is api-integrated', (t) => {
  const result = runBackstop(t, 'M\tsrc/api/stock/client.ts\n');
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.violations[0].candidate.screen_id, 'V2');
  assert.equal(result.json.violations[0].candidate.endpoint, 'GET /stock');
  assert.equal(result.json.violations[0].candidate.tracking, 'issue:#210');
});

test('confirmed active candidate slice diff passes', (t) => {
  const result = runBackstop(t, 'M\tsrc/api/live/client.ts\n');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.ok, true);
});

test('legacy broad authorization cannot replace an active v2 slice owner below api-integrated', (t) => {
  const state = stateFixture();
  state.screens.V2.derived.api_actionable_confidence_min = 'candidate';
  const result = runBackstop(t, 'M\tsrc/api/live/client.ts\n', state);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.json.ok, false);
  assert.match(result.json.violations[0].reason, /V2:GET \/live/);
  assert.match(result.json.violations[0].reason, /tracking=-/);
});

test('an integrated v2 contract denies an unowned hook path', (t) => {
  const state = stateFixture();
  delete state.screens.LEGACY;
  const result = runBackstop(t, 'M\tsrc/features/create/hooks/useUnowned.ts\n', state);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.json.ok, false);
  assert.match(result.json.violations[0].reason, /not authorized/);
});

test('legacy-only hook behavior stays outside the historical guarded surface', (t) => {
  const state = stateFixture();
  delete state.screens.V2;
  const result = runBackstop(t, 'M\tsrc/features/legacy/hooks/useLegacy.ts\n', state);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.ok, true);
});

test('rename and copy evaluate only the new path and keep deferred ownership', (t) => {
  const rename = runBackstop(
    t,
    'R100\tsrc/api/old/client.ts\tsrc/api/stock/client.ts\n',
  );
  assert.equal(rename.status, 1, rename.stderr);
  assert.equal(rename.json.violations[0].file, 'src/api/stock/client.ts');

  const copy = runBackstop(
    t,
    'C100\tsrc/api/live/client.ts\tsrc/api/stock/copied.ts\n',
  );
  assert.equal(copy.status, 1, copy.stderr);
  assert.equal(copy.json.violations[0].file, 'src/api/stock/copied.ts');
});

test('Windows separators normalize before deferred path matching', (t) => {
  const result = runBackstop(t, 'M\tsrc\\api\\stock\\client.ts\n');
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.json.violations[0].file, 'src/api/stock/client.ts');
});

test('name-status parser keeps rename/copy write-path semantics', () => {
  const records = parseNameStatusText(
    [
      'R100\tsrc/api/old.ts\tsrc/api/new.ts',
      'C100\tsrc/api/source.ts\tsrc/api/copied.ts',
    ].join('\n'),
  );
  assert.deepEqual(records.flatMap(writePathsOf), [
    'src/api/new.ts',
    'src/api/copied.ts',
  ]);
});
