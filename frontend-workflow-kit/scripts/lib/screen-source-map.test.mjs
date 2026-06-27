import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  collectScreenSourceMapFindings,
  parseScreenSourceMap,
} from './screen-source-map.mjs';

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function tmpdir(t, prefix = 'screen-source-map-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const MAP_HEADER =
  '| Canonical Screen ID | Domain | Route | ScreenSpec Path | Planning IDs | Design IDs | Figma Node IDs | Source Inputs | Mapping Status | Decision / Notes |';
const MAP_SEP = '|---|---|---|---|---|---|---|---|---|---|';

// row: [canonicalId, domain, route, specPath, planning, design, figmaNodes, sourceInputs, status, notes]
function writeMap(docsDir, rows) {
  const lines = ['---', 'artifact_id: screen-source-map', 'artifact_type: screen-source-map', 'status: draft', '---', '', '# Screen Source Map', '', MAP_HEADER, MAP_SEP];
  for (const r of rows) lines.push(`| ${r.join(' | ')} |`);
  lines.push('');
  write(path.join(docsDir, '_meta', 'screen-source-map.md'), lines.join('\n'));
}

function writeSpec(docsDir, { domain, slug, screenId, route }) {
  write(
    path.join(docsDir, 'domains', domain, 'screens', slug, 'screen-spec.md'),
    [
      '---',
      `artifact_id: ${screenId}-screen-spec`,
      'artifact_type: screen-spec',
      `domain: ${domain}`,
      `screen_id: ${screenId}`,
      `route: ${route}`,
      'status: draft',
      '---',
      '',
      `# ScreenSpec: ${screenId}`,
      '',
    ].join('\n'),
  );
}

function writeInput(docsDir, inputId, affectedScreens) {
  write(
    path.join(docsDir, 'inputs', `${inputId}.md`),
    ['---', `input_id: ${inputId}`, `affected_screens: [${affectedScreens.join(', ')}]`, '---', '', '## Summary', 'x', ''].join('\n'),
  );
}

test('collectScreenSourceMapFindings is a NO-OP when the map is absent (cold-start safe)', (t) => {
  const docsDir = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  writeSpec(docsDir, { domain: 'auth', slug: 'login', screenId: 'AUTH-LOGIN', route: '/login' });
  assert.deepEqual(collectScreenSourceMapFindings({ docsDir }), []);
});

// Case 1: existing planning code maps to an existing ScreenSpec -> no missing/mismatch warning.
test('planning code mapped to an existing ScreenSpec produces no warning', (t) => {
  const docsDir = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  writeSpec(docsDir, { domain: 'auth', slug: 'signup-email', screenId: 'AUTH-SIGNUP-EMAIL', route: '/signup/email' });
  writeMap(docsDir, [
    ['AUTH-SIGNUP-EMAIL', 'auth', '/signup/email', 'domains/auth/screens/signup-email/screen-spec.md', 'A-001', '-', '-', 'IN-20260625-visual-spec-001', 'confirmed', '-'],
  ]);
  const findings = collectScreenSourceMapFindings({ docsDir });
  assert.equal(findings.some((f) => f.check === 'screen-source-map-screen-missing'), false);
  assert.equal(findings.some((f) => f.check === 'screen-source-map-route-mismatch'), false);
});

// Case 2: a design frame with only a node id maps via the map to a canonical screen.
test('design node without a code maps via the map to a canonical screen', (t) => {
  const docsDir = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  writeSpec(docsDir, { domain: 'auth', slug: 'signup-email', screenId: 'AUTH-SIGNUP-EMAIL', route: '/signup/email' });
  writeMap(docsDir, [
    ['AUTH-SIGNUP-EMAIL', 'auth', '/signup/email', '-', '-', '-', '1:234', 'IN-20260625-figma-002', 'confirmed', 'node-only frame'],
  ]);
  const findings = collectScreenSourceMapFindings({ docsDir });
  assert.equal(findings.length, 0);
});

// Case 3: duplicate design code without split status is a warning.
test('a design code reused on two different canonical screens without split is a warning', (t) => {
  const docsDir = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  writeSpec(docsDir, { domain: 'auth', slug: 'a', screenId: 'AUTH-A', route: '/a' });
  writeSpec(docsDir, { domain: 'auth', slug: 'b', screenId: 'AUTH-B', route: '/b' });
  writeMap(docsDir, [
    ['AUTH-A', 'auth', '/a', '-', '-', 'J010', '-', '-', 'confirmed', '-'],
    ['AUTH-B', 'auth', '/b', '-', '-', 'J010', '-', '-', 'confirmed', '-'],
  ]);
  const dup = collectScreenSourceMapFindings({ docsDir }).find((f) => f.check === 'screen-source-map-duplicate-alias');
  assert.ok(dup);
  assert.equal(dup.severity, 'warning');
  assert.equal(dup.alias, 'J010');
  assert.deepEqual(dup.canonical_ids, ['AUTH-A', 'AUTH-B']);
});

// Case 4: duplicate design code with split status is accepted (no warning).
test('a design code split across two canonical screens with split status is accepted', (t) => {
  const docsDir = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  writeSpec(docsDir, { domain: 'auth', slug: 'a', screenId: 'AUTH-A', route: '/a' });
  writeSpec(docsDir, { domain: 'auth', slug: 'b', screenId: 'AUTH-B', route: '/b' });
  writeMap(docsDir, [
    ['AUTH-A', 'auth', '/a', '-', '-', 'J010', '-', '-', 'split', 'split into list+detail'],
    ['AUTH-B', 'auth', '/b', '-', '-', 'J010', '-', '-', 'split', 'split into list+detail'],
  ]);
  const findings = collectScreenSourceMapFindings({ docsDir });
  assert.equal(findings.some((f) => f.check === 'screen-source-map-duplicate-alias'), false);
});

test('a mapping to a canonical id with no ScreenSpec warns to run create-screen', (t) => {
  const docsDir = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  writeMap(docsDir, [
    ['AUTH-GHOST', 'auth', '/ghost', '-', 'A-009', '-', '-', '-', 'confirmed', '-'],
  ]);
  const missing = collectScreenSourceMapFindings({ docsDir }).find((f) => f.check === 'screen-source-map-screen-missing');
  assert.ok(missing);
  assert.equal(missing.screen_id, 'AUTH-GHOST');
  assert.match(missing.message, /workflow:create-screen/);
});

test('a merged canonical with no ScreenSpec still warns (merged is a current screen, only deprecated is exempt)', (t) => {
  const docsDir = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  writeMap(docsDir, [
    ['AUTH-MERGED', 'auth', '/merged', '-', 'A-001', 'J010', '-', '-', 'merged', 'two sources, one screen'],
    ['AUTH-OLD', 'auth', '/old', '-', 'A-099', '-', '-', '-', 'deprecated', 'retired'],
  ]);
  const findings = collectScreenSourceMapFindings({ docsDir });
  assert.ok(findings.some((f) => f.check === 'screen-source-map-screen-missing' && f.screen_id === 'AUTH-MERGED'));
  // deprecated stays exempt
  assert.equal(findings.some((f) => f.check === 'screen-source-map-screen-missing' && f.screen_id === 'AUTH-OLD'), false);
});

test('an input using a known source alias is told to use the canonical id (not flagged as unknown)', (t) => {
  const docsDir = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  writeSpec(docsDir, { domain: 'auth', slug: 'signup-email', screenId: 'AUTH-SIGNUP-EMAIL', route: '/signup/email' });
  writeMap(docsDir, [
    ['AUTH-SIGNUP-EMAIL', 'auth', '/signup/email', '-', 'A-001', 'J010', '-', '-', 'confirmed', '-'],
  ]);
  writeInput(docsDir, 'IN-20260627-figma-003', ['J010']); // J010 is a recognized design alias
  const findings = collectScreenSourceMapFindings({ docsDir });
  const alias = findings.find((f) => f.check === 'screen-source-map-input-alias');
  assert.ok(alias);
  assert.equal(alias.screen, 'J010');
  assert.deepEqual(alias.canonical_ids, ['AUTH-SIGNUP-EMAIL']);
  assert.equal(findings.some((f) => f.check === 'screen-source-map-input-unmapped'), false);
});

test('a map route that differs from the ScreenSpec route warns (route is evidence, not identity)', (t) => {
  const docsDir = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  writeSpec(docsDir, { domain: 'auth', slug: 'signup-email', screenId: 'AUTH-SIGNUP-EMAIL', route: '/signup/email' });
  writeMap(docsDir, [
    ['AUTH-SIGNUP-EMAIL', 'auth', '/signup', '-', 'A-001', '-', '-', '-', 'confirmed', '-'],
  ]);
  const mismatch = collectScreenSourceMapFindings({ docsDir }).find((f) => f.check === 'screen-source-map-route-mismatch');
  assert.ok(mismatch);
  assert.equal(mismatch.map_route, '/signup');
  assert.equal(mismatch.spec_route, '/signup/email');
});

// Part D/G signal: an input whose affected_screens carries a raw source alias is surfaced as scope-unclear.
test('an input referencing an unmapped raw source alias warns instead of being silently routed', (t) => {
  const docsDir = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  writeSpec(docsDir, { domain: 'auth', slug: 'signup-email', screenId: 'AUTH-SIGNUP-EMAIL', route: '/signup/email' });
  writeMap(docsDir, [
    ['AUTH-SIGNUP-EMAIL', 'auth', '/signup/email', '-', 'A-001', '-', '-', '-', 'confirmed', '-'],
  ]);
  writeInput(docsDir, 'IN-20260625-figma-001', ['J010']); // raw design code, not canonical
  writeInput(docsDir, 'IN-20260625-figma-002', ['AUTH-SIGNUP-EMAIL']); // canonical, ok

  const findings = collectScreenSourceMapFindings({ docsDir });
  const unmapped = findings.filter((f) => f.check === 'screen-source-map-input-unmapped');
  assert.equal(unmapped.length, 1);
  assert.equal(unmapped[0].screen, 'J010');
  assert.equal(unmapped[0].input_id, 'IN-20260625-figma-001');
});

test('parseScreenSourceMap reads the signature table and skips placeholder rows', () => {
  const raw = [
    '---',
    'artifact_id: screen-source-map',
    '---',
    '',
    MAP_HEADER,
    MAP_SEP,
    '| {AUTH-SIGNUP-EMAIL} | {auth} | {/signup/email} | {path} | {A-001} | {J010} | {1:234} | {IN} | {confirmed} | {-} |',
    '| AUTH-REAL | auth | /real | - | A-002 | J020 | 1:999 | IN-x | candidate | note |',
  ].join('\n');
  const parsed = parseScreenSourceMap(raw);
  assert.equal(parsed.exists, true);
  assert.equal(parsed.table, true);
  assert.equal(parsed.rows.length, 1); // placeholder row skipped
  assert.equal(parsed.rows[0].canonicalId, 'AUTH-REAL');
  assert.deepEqual(parsed.rows[0].design, ['J020']);
  assert.equal(parsed.rows[0].status, 'candidate');
});
