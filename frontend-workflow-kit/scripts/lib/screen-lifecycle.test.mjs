import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  analyzeScreenLifecycles,
  isAbsorbedScreenSpec,
  screenLifecycleOf,
} from './screen-lifecycle.mjs';
import { buildState } from '../workflow-state.mjs';
import { computeReadiness } from '../readiness.mjs';
import { buildNavGraph } from './nav-graph.mjs';
import { analyzeRouteCrossCheck } from './route-cross-check.mjs';
import { collectDoctorFindings } from './doctor.mjs';
import { analyzeSharedSurfaces } from './shared-surfaces.mjs';
import { analyzeVisualConsistency } from './visual-consistency.mjs';
import { analyzeVisualContractBootstrap } from './visual-contract-bootstrap.mjs';
import { loadScreenSpec } from './spec.mjs';
import { yamlStringify } from './util.mjs';

const DOCS = '/repo/docs/frontend-workflow';
const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function fakeSpec(screenId, frontmatter = {}, slug = String(screenId).toLowerCase()) {
  return {
    path: path.join(DOCS, 'domains', 'auth', 'screens', slug, 'screen-spec.md'),
    dir: path.join(DOCS, 'domains', 'auth', 'screens', slug),
    frontmatter: {
      artifact_id: `${String(screenId)}-screen-spec`,
      artifact_type: 'screen-spec',
      domain: 'auth',
      screen_id: screenId,
      route: `/${slug}`,
      status: 'draft',
      ...frontmatter,
    },
    sections: {},
    body: '',
    hasFrontmatter: true,
    parseError: null,
  };
}

function analyze(specs) {
  return analyzeScreenLifecycles({ specs, docsDir: DOCS });
}

function codes(record) {
  return record.errors.map((error) => error.code);
}

test('absent and explicit active lifecycle remain active without output errors', () => {
  const absent = fakeSpec('ACTIVE-A');
  const explicit = fakeSpec('ACTIVE-B', { screen_lifecycle: 'active' });
  const result = analyze([absent, explicit]);
  assert.equal(screenLifecycleOf(absent), 'active');
  assert.equal(screenLifecycleOf(explicit), 'active');
  assert.equal(isAbsorbedScreenSpec(absent), false);
  assert.deepEqual(result.liveSpecs, [absent, explicit]);
  assert.deepEqual(result.absorbedRecords, []);
  assert.deepEqual(result.invalidRecords, []);
});

test('valid absorbed screen resolves one unique active canonical target', () => {
  const target = fakeSpec('SIGNUP-NICKNAME');
  const source = fakeSpec('SOCIAL-NICKNAME', {
    screen_lifecycle: 'absorbed',
    absorbed_into: 'SIGNUP-NICKNAME',
    absorbed_at: '2026-07-15',
  });
  const result = analyze([source, target]);
  assert.equal(isAbsorbedScreenSpec(source), true);
  assert.deepEqual(result.liveSpecs, [target]);
  assert.equal(result.absorbedRecords.length, 1);
  assert.equal(result.absorbedRecords[0].absorbed_into, 'SIGNUP-NICKNAME');
  assert.deepEqual(result.absorbedRecords[0].errors, []);
});

test('missing, self, and nonexistent absorption targets fail closed', () => {
  const missingField = fakeSpec('MISSING-FIELD', { screen_lifecycle: 'absorbed' });
  const self = fakeSpec('SELF', { screen_lifecycle: 'absorbed', absorbed_into: 'SELF' });
  const missingTarget = fakeSpec('MISSING-TARGET', {
    screen_lifecycle: 'absorbed',
    absorbed_into: 'NO-SUCH-SCREEN',
  });
  const result = analyze([missingField, self, missingTarget]);
  assert.ok(codes(result.bySpec.get(missingField)).includes('missing-absorbed-into'));
  assert.ok(codes(result.bySpec.get(self)).includes('self-absorption'));
  assert.ok(codes(result.bySpec.get(missingTarget)).includes('missing-absorption-target'));
  assert.deepEqual(new Set(result.liveSpecs), new Set([missingField, self, missingTarget]));
  assert.equal(result.absorbedRecords.length, 0);
});

test('duplicate and noncanonical target identities are rejected in the public key namespace', () => {
  const source = fakeSpec('SOURCE', {
    screen_lifecycle: 'absorbed',
    absorbed_into: '1',
  });
  const numeric = fakeSpec(1, {}, 'numeric');
  const canonical = fakeSpec('1', {}, 'canonical');
  const duplicate = analyze([source, numeric, canonical]);
  assert.ok(codes(duplicate.bySpec.get(source)).includes('ambiguous-absorption-target'));

  const booleanSource = fakeSpec('BOOLEAN-SOURCE', {
    screen_lifecycle: 'absorbed',
    absorbed_into: 'true',
  });
  const boolean = fakeSpec(true, {}, 'boolean');
  const canonicalBoolean = fakeSpec('true', {}, 'canonical-boolean');
  const booleanDuplicate = analyze([booleanSource, boolean, canonicalBoolean]);
  assert.ok(
    codes(booleanDuplicate.bySpec.get(booleanSource)).includes('ambiguous-absorption-target'),
  );

  const fallback = fakeSpec(false, { artifact_id: 'TARGET' }, 'fallback');
  const noncanonicalSource = fakeSpec('SOURCE-2', {
    screen_lifecycle: 'absorbed',
    absorbed_into: 'TARGET',
  });
  const noncanonical = analyze([noncanonicalSource, fallback]);
  assert.ok(codes(noncanonical.bySpec.get(noncanonicalSource)).includes('noncanonical-absorption-target'));
});

test('duplicate absorbed source identities with different targets fail closed for every source record', () => {
  const targetA = fakeSpec('AUTH-A');
  const targetB = fakeSpec('AUTH-B');
  const sourceA = fakeSpec(
    'OLD-AUTH',
    { screen_lifecycle: 'absorbed', absorbed_into: 'AUTH-A' },
    'old-auth-a',
  );
  const sourceB = fakeSpec(
    'OLD-AUTH',
    { screen_lifecycle: 'absorbed', absorbed_into: 'AUTH-B' },
    'old-auth-b',
  );
  const result = analyze([sourceA, sourceB, targetA, targetB]);

  for (const source of [sourceA, sourceB]) {
    assert.ok(codes(result.bySpec.get(source)).includes('ambiguous-absorption-source'));
    assert.equal(result.bySpec.get(source).valid, false);
    assert.ok(result.liveSpecs.includes(source));
  }
  assert.equal(result.absorbedRecords.length, 0);
});

test('active and absorbed records sharing one source identity both fail closed', () => {
  const target = fakeSpec('AUTH-A');
  const active = fakeSpec('OLD-AUTH', {}, 'old-auth-active');
  const absorbed = fakeSpec(
    'OLD-AUTH',
    { screen_lifecycle: 'absorbed', absorbed_into: 'AUTH-A' },
    'old-auth-absorbed',
  );
  const result = analyze([active, absorbed, target]);

  for (const source of [active, absorbed]) {
    assert.ok(codes(result.bySpec.get(source)).includes('ambiguous-absorption-source'));
    assert.equal(result.bySpec.get(source).valid, false);
    assert.ok(result.liveSpecs.includes(source));
  }
  assert.equal(result.absorbedRecords.length, 0);
});

test('malformed lifecycle concerns propagate ambiguity to every duplicate source record', () => {
  const invalidEnum = fakeSpec('OLD-ENUM', { screen_lifecycle: 'gone' }, 'old-enum-broken');
  const enumClean = fakeSpec('OLD-ENUM', {}, 'old-enum-clean');
  const enumResult = analyze([invalidEnum, enumClean]);
  assert.ok(codes(enumResult.bySpec.get(invalidEnum)).includes('invalid-screen-lifecycle'));
  for (const source of [invalidEnum, enumClean]) {
    assert.ok(codes(enumResult.bySpec.get(source)).includes('ambiguous-absorption-source'));
  }

  const mixed = fakeSpec('OLD-MIXED', { absorbed_into: 'AUTH-A' }, 'old-mixed-broken');
  const mixedClean = fakeSpec('OLD-MIXED', {}, 'old-mixed-clean');
  const mixedResult = analyze([mixed, mixedClean]);
  assert.ok(codes(mixedResult.bySpec.get(mixed)).includes('active-with-absorbed-field'));
  for (const source of [mixed, mixedClean]) {
    assert.ok(codes(mixedResult.bySpec.get(source)).includes('ambiguous-absorption-source'));
  }

  const legacyA = fakeSpec('LEGACY-DUP', {}, 'legacy-a');
  const legacyB = fakeSpec('LEGACY-DUP', {}, 'legacy-b');
  const legacyResult = analyze([legacyA, legacyB]);
  for (const source of [legacyA, legacyB]) {
    assert.equal(codes(legacyResult.bySpec.get(source)).includes('ambiguous-absorption-source'), false);
  }
});

test('absorbed target chains and cycles are rejected deterministically', () => {
  const active = fakeSpec('C');
  const middle = fakeSpec('B', { screen_lifecycle: 'absorbed', absorbed_into: 'C' });
  const head = fakeSpec('A', { screen_lifecycle: 'absorbed', absorbed_into: 'B' });
  const chain = analyze([head, middle, active]);
  assert.ok(codes(chain.bySpec.get(head)).includes('absorbed-absorption-target'));
  assert.ok(codes(chain.bySpec.get(head)).includes('absorption-chain'));
  assert.equal(chain.bySpec.get(middle).valid, true);

  const left = fakeSpec('LEFT', { screen_lifecycle: 'absorbed', absorbed_into: 'RIGHT' });
  const right = fakeSpec('RIGHT', { screen_lifecycle: 'absorbed', absorbed_into: 'LEFT' });
  const cycle = analyze([left, right]);
  assert.ok(codes(cycle.bySpec.get(left)).includes('absorption-cycle'));
  assert.ok(codes(cycle.bySpec.get(right)).includes('absorption-cycle'));
  assert.equal(cycle.absorbedRecords.length, 0);
});

test('invalid enum/date, mixed active fields, and malformed source identity stay live', () => {
  const invalidEnum = fakeSpec('ENUM', { screen_lifecycle: 'gone' });
  const invalidDate = fakeSpec('DATE', {
    screen_lifecycle: 'absorbed',
    absorbed_into: 'TARGET',
    absorbed_at: '2026-02-30',
  });
  const mixed = fakeSpec('MIXED', { absorbed_into: 'TARGET' });
  const malformedSource = fakeSpec(true, {
    screen_lifecycle: 'absorbed',
    absorbed_into: 'TARGET',
  });
  const target = fakeSpec('TARGET');
  const result = analyze([invalidEnum, invalidDate, mixed, malformedSource, target]);
  assert.ok(codes(result.bySpec.get(invalidEnum)).includes('invalid-screen-lifecycle'));
  assert.ok(codes(result.bySpec.get(invalidDate)).includes('invalid-absorbed-at'));
  assert.ok(codes(result.bySpec.get(mixed)).includes('active-with-absorbed-field'));
  assert.ok(codes(result.bySpec.get(malformedSource)).includes('invalid-source-screen-id'));
  for (const spec of [invalidEnum, invalidDate, mixed, malformedSource]) {
    assert.ok(result.liveSpecs.includes(spec));
  }
});

test('prototype-named canonical Screen IDs are handled as ordinary Map keys', () => {
  const target = fakeSpec('toString');
  const source = fakeSpec('constructor', {
    screen_lifecycle: 'absorbed',
    absorbed_into: 'toString',
  });
  const result = analyze([source, target]);
  assert.equal(result.absorbedRecords.length, 1);
  assert.equal(result.byPublicKey.get('toString')[0].spec, target);
  assert.deepEqual(result.liveSpecs, [target]);
});

function writeScreenAt(docsDir, slug, id, frontmatter = {}, body = '') {
  const dir = path.join(docsDir, 'domains', 'auth', 'screens', slug);
  fs.mkdirSync(dir, { recursive: true });
  const fm = {
    artifact_id: `${id}-screen-spec`,
    artifact_type: 'screen-spec',
    domain: 'auth',
    screen_id: id,
    route: `/${slug}`,
    status: 'draft',
    ...frontmatter,
  };
  const yaml = Object.entries(fm)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  fs.writeFileSync(path.join(dir, 'screen-spec.md'), `---\n${yaml}\n---\n${body}`, 'utf8');
}

function writeScreen(docsDir, id, frontmatter = {}, body = '') {
  writeScreenAt(docsDir, id.toLowerCase(), id, frontmatter, body);
}

const TEST_LAYOUT = {
  layerTelemetryDeclared: false,
  layers: [],
  resolvePaths(paths, { domain } = {}) {
    return (paths || []).map((value) => String(value).replaceAll('{domain}', domain || '{domain}'));
  },
  roleToDir(role, { domain } = {}) {
    return `src/${role}/${domain || '{domain}'}`;
  },
};

const TEST_POLICY = {
  order: ['docs-only', 'screen-skeleton'],
  modes: {
    'docs-only': { requires: [], allowed_paths: ['docs/**'], forbidden_paths: [] },
    'screen-skeleton': { requires: [], allowed_paths: ['src/**'], forbidden_paths: [] },
  },
};

test('workflow state keeps 8 active screens and registers 3 absorbed tombstones', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-lifecycle-state-'));
  const docsDir = path.join(root, 'docs', 'frontend-workflow');
  for (let i = 1; i <= 8; i++) writeScreen(docsDir, `ACTIVE-${i}`);
  for (let i = 1; i <= 3; i++) {
    writeScreen(docsDir, `ABSORBED-${i}`, {
      route: `/active-${i}`,
      screen_lifecycle: 'absorbed',
      absorbed_into: `ACTIVE-${i}`,
      absorbed_at: '2026-07-15',
    });
  }

  const { state, inventory } = buildState({
    docsDir,
    srcDir: null,
    projectRoot: root,
    date: '2026-07-16',
    layout: TEST_LAYOUT,
  });
  assert.equal(Object.keys(state.screens).length, 8);
  assert.equal(Object.keys(state.absorbed_screens).length, 3);
  assert.equal(state.global.stub_screen_specs_count, 8);
  assert.equal(inventory.screens.length, 11);
  assert.equal(inventory.screens.filter((row) => row.screen_lifecycle === 'absorbed').length, 3);
  assert.deepEqual(inventory.checks.duplicate_routes, []);

  const aggregate = computeReadiness({
    state,
    policy: TEST_POLICY,
    ci: {},
    manifest: {},
    layout: TEST_LAYOUT,
  });
  assert.equal(Object.keys(aggregate).length, 8);
  const direct = computeReadiness({
    state,
    policy: TEST_POLICY,
    ci: {},
    manifest: {},
    layout: TEST_LAYOUT,
    screenOnlyId: 'ABSORBED-1',
  });
  assert.deepEqual(direct['ABSORBED-1'], {
    readiness_mode: null,
    next_mode: null,
    readiness_applicable: false,
    screen_lifecycle: 'absorbed',
    absorbed_into: 'ACTIVE-1',
    absorbed_at: '2026-07-15',
    allowed_paths: [],
    forbidden_paths: [],
    blocking: [],
    next_actions: [
      'use canonical screen ACTIVE-1; do not author or implement the absorbed ScreenSpec',
    ],
  });
  assert.deepEqual(
    computeReadiness({
      state,
      policy: TEST_POLICY,
      ci: {},
      manifest: {},
      layout: TEST_LAYOUT,
      screenOnlyId: 'UNKNOWN',
    }),
    {},
  );

  const metaDir = path.join(docsDir, '_meta');
  fs.mkdirSync(metaDir, { recursive: true });
  fs.writeFileSync(path.join(metaDir, 'workflow-state.yaml'), yamlStringify(state), 'utf8');
  const cli = spawnSync(
    process.execPath,
    [
      path.join(KIT_ROOT, 'scripts', 'readiness.mjs'),
      '--docs',
      docsDir,
      '--screen',
      'ABSORBED-1',
      '--json',
    ],
    { cwd: KIT_ROOT, encoding: 'utf8' },
  );
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.equal(JSON.parse(cli.stdout)['ABSORBED-1'].readiness_applicable, false);
});

test('layer inventory derives domains from live screens only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-lifecycle-layers-'));
  const docsDir = path.join(root, 'docs', 'frontend-workflow');
  writeScreen(docsDir, 'ACTIVE', { domain: 'auth' });
  writeScreen(docsDir, 'ABSORBED', {
    domain: 'legacy',
    screen_lifecycle: 'absorbed',
    absorbed_into: 'ACTIVE',
  });
  const layout = {
    ...TEST_LAYOUT,
    layerTelemetryDeclared: true,
    layers: [
      {
        role: 'feature_layer',
        glob: 'src/features/{domain}/**',
        fact: 'dir_has_files',
        access: { allow: [], forbid: [] },
      },
    ],
  };
  const { layerInventory } = buildState({
    docsDir,
    srcDir: path.join(root, 'src'),
    projectRoot: root,
    date: '2026-07-16',
    layout,
  });
  assert.deepEqual(layerInventory.layers.map((row) => row.domain), ['auth']);
  assert.equal(JSON.stringify(layerInventory).includes('legacy'), false);
});

test('malformed absorption stays in state and readiness fails closed with no allowed paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-lifecycle-invalid-'));
  const docsDir = path.join(root, 'docs', 'frontend-workflow');
  writeScreen(docsDir, 'BROKEN', {
    screen_lifecycle: 'absorbed',
    absorbed_into: 'MISSING',
  });
  const { state } = buildState({
    docsDir,
    srcDir: null,
    projectRoot: root,
    date: '2026-07-16',
    layout: TEST_LAYOUT,
  });
  assert.ok(state.screens.BROKEN);
  assert.equal(state.absorbed_screens, undefined);
  assert.equal(state.screens.BROKEN.derived.lifecycle_errors[0].code, 'missing-absorption-target');
  const readiness = computeReadiness({
    state,
    policy: TEST_POLICY,
    ci: {},
    manifest: {},
    layout: TEST_LAYOUT,
    screenOnlyId: 'BROKEN',
  });
  assert.equal(readiness.BROKEN.readiness_mode, 'docs-only');
  assert.deepEqual(readiness.BROKEN.allowed_paths, []);
  assert.equal(readiness.BROKEN.blocking[0].invalid_screen_lifecycle.code, 'missing-absorption-target');
});

test('workflow state does not select one redirect from duplicate absorbed source identities', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-lifecycle-duplicate-absorbed-'));
  const docsDir = path.join(root, 'docs', 'frontend-workflow');
  writeScreen(docsDir, 'AUTH-A');
  writeScreen(docsDir, 'AUTH-B');
  writeScreenAt(docsDir, 'old-auth-a', 'OLD-AUTH', {
    screen_lifecycle: 'absorbed',
    absorbed_into: 'AUTH-A',
  });
  writeScreenAt(docsDir, 'old-auth-b', 'OLD-AUTH', {
    screen_lifecycle: 'absorbed',
    absorbed_into: 'AUTH-B',
  });

  const { state } = buildState({
    docsDir,
    srcDir: null,
    projectRoot: root,
    date: '2026-07-20',
    layout: TEST_LAYOUT,
  });
  assert.equal(state.absorbed_screens, undefined);
  assert.ok(
    state.screens['OLD-AUTH'].derived.lifecycle_errors.some(
      (error) => error.code === 'ambiguous-absorption-source',
    ),
  );
  assert.deepEqual(
    state.screens['OLD-AUTH'].derived.lifecycle_errors.find(
      (error) => error.code === 'ambiguous-absorption-source',
    ).locations,
    [
      'domains/auth/screens/old-auth-a/screen-spec.md',
      'domains/auth/screens/old-auth-b/screen-spec.md',
    ],
  );
  const readiness = computeReadiness({
    state,
    policy: TEST_POLICY,
    ci: {},
    manifest: {},
    layout: TEST_LAYOUT,
    screenOnlyId: 'OLD-AUTH',
  });
  assert.notEqual(readiness['OLD-AUTH'].readiness_applicable, false);
  assert.deepEqual(readiness['OLD-AUTH'].allowed_paths, []);
  assert.equal(
    readiness['OLD-AUTH'].blocking[0].invalid_screen_lifecycle.code,
    'ambiguous-absorption-source',
  );
});

test('workflow state fails closed for an active and absorbed source identity collision', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-lifecycle-active-absorbed-'));
  const docsDir = path.join(root, 'docs', 'frontend-workflow');
  writeScreen(docsDir, 'AUTH-A');
  writeScreenAt(docsDir, 'old-auth-active', 'OLD-AUTH');
  writeScreenAt(docsDir, 'old-auth-absorbed', 'OLD-AUTH', {
    screen_lifecycle: 'absorbed',
    absorbed_into: 'AUTH-A',
  });

  const { state } = buildState({
    docsDir,
    srcDir: null,
    projectRoot: root,
    date: '2026-07-20',
    layout: TEST_LAYOUT,
  });
  assert.equal(state.absorbed_screens, undefined);
  assert.ok(
    state.screens['OLD-AUTH'].derived.lifecycle_errors.some(
      (error) => error.code === 'ambiguous-absorption-source',
    ),
  );
  const readiness = computeReadiness({
    state,
    policy: TEST_POLICY,
    ci: {},
    manifest: {},
    layout: TEST_LAYOUT,
    screenOnlyId: 'OLD-AUTH',
  });
  assert.notEqual(readiness['OLD-AUTH'].readiness_applicable, false);
  assert.deepEqual(readiness['OLD-AUTH'].allowed_paths, []);
  assert.equal(
    readiness['OLD-AUTH'].blocking[0].invalid_screen_lifecycle.code,
    'ambiguous-absorption-source',
  );
});

test('malformed lifecycle duplicates stay fail-closed in both filesystem path orders', () => {
  const cases = [
    { name: 'invalid-enum', frontmatter: { screen_lifecycle: 'gone' } },
    { name: 'active-with-absorbed-field', frontmatter: { absorbed_into: 'AUTH-A' } },
  ];
  for (const concern of cases) {
    for (const cleanLast of [true, false]) {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), `screen-lifecycle-${concern.name}-${cleanLast ? 'clean-last' : 'clean-first'}-`),
      );
      try {
        const docsDir = path.join(root, 'docs', 'frontend-workflow');
        writeScreen(docsDir, 'AUTH-A');
        writeScreenAt(
          docsDir,
          cleanLast ? 'a-broken' : 'z-broken',
          'OLD-AUTH',
          concern.frontmatter,
        );
        writeScreenAt(docsDir, cleanLast ? 'z-clean' : 'a-clean', 'OLD-AUTH');

        const { state } = buildState({
          docsDir,
          srcDir: null,
          projectRoot: root,
          date: '2026-07-20',
          layout: TEST_LAYOUT,
        });
        assert.ok(
          state.screens['OLD-AUTH'].derived.lifecycle_errors.some(
            (error) => error.code === 'ambiguous-absorption-source',
          ),
          `${concern.name}/${cleanLast ? 'clean-last' : 'clean-first'} must retain ambiguity`,
        );
        const readiness = computeReadiness({
          state,
          policy: TEST_POLICY,
          ci: {},
          manifest: {},
          layout: TEST_LAYOUT,
          screenOnlyId: 'OLD-AUTH',
        });
        assert.equal(readiness['OLD-AUTH'].readiness_mode, 'docs-only');
        assert.deepEqual(readiness['OLD-AUTH'].allowed_paths, []);
        assert.ok(
          readiness['OLD-AUTH'].blocking.some(
            (blocker) =>
              blocker.invalid_screen_lifecycle?.code === 'ambiguous-absorption-source',
          ),
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  }
});

test('no-marker state omits lifecycle output keys', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-lifecycle-legacy-'));
  const docsDir = path.join(root, 'docs', 'frontend-workflow');
  writeScreen(docsDir, 'LEGACY');
  const { state, inventory } = buildState({
    docsDir,
    srcDir: null,
    projectRoot: root,
    date: '2026-07-16',
    layout: TEST_LAYOUT,
  });
  assert.equal(Object.hasOwn(state, 'absorbed_screens'), false);
  assert.equal(Object.hasOwn(state.screens.LEGACY.derived, 'lifecycle_errors'), false);
  assert.equal(Object.hasOwn(inventory.screens[0], 'screen_lifecycle'), false);
});

function runValidate(root, docsDir) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(KIT_ROOT, 'scripts', 'validate.mjs'),
      '--docs',
      docsDir,
      '--src',
      path.join(root, 'src'),
      '--json',
    ],
    { cwd: KIT_ROOT, encoding: 'utf8' },
  );
  return {
    ...result,
    json: result.stdout ? JSON.parse(result.stdout) : null,
  };
}

test('validate keeps schema/approval checks but skips live behavior checks for valid absorbed specs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-lifecycle-validate-valid-'));
  const docsDir = path.join(root, 'docs', 'frontend-workflow');
  writeScreen(docsDir, 'CANONICAL');
  writeScreen(
    docsDir,
    'ABSORBED',
    {
      status: 'confirmed',
      approved_by: 'product-owner',
      approved_at: '2026-07-15',
      decision_id: 'D-203',
      screen_lifecycle: 'absorbed',
      absorbed_into: 'CANONICAL',
      absorbed_at: '2026-07-15',
    },
    `\n## Copy Keys\n\n| Key | 문구 | Status |\n|---|---|---|\n| bad | stale | invalid |\n\n## API Candidates\n\n- GET /stale (confidence: confirmed)\n`,
  );
  const result = runValidate(root, docsDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(result.json.errors, []);
});

test('validate keeps confirmed approval metadata checks for valid absorbed specs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-lifecycle-validate-approval-'));
  const docsDir = path.join(root, 'docs', 'frontend-workflow');
  writeScreen(docsDir, 'CANONICAL');
  writeScreen(docsDir, 'ABSORBED', {
    status: 'confirmed',
    screen_lifecycle: 'absorbed',
    absorbed_into: 'CANONICAL',
  });
  const result = runValidate(root, docsDir);
  assert.equal(result.status, 1);
  assert.equal(result.json.errors.filter((error) => error.check === 7).length, 3);
});

test('validate assigns lifecycle structure/reference failures to existing checks 2 and 3', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-lifecycle-validate-invalid-'));
  const docsDir = path.join(root, 'docs', 'frontend-workflow');
  writeScreen(docsDir, 'MISSING-INTO', { screen_lifecycle: 'absorbed' });
  writeScreen(docsDir, 'MISSING-TARGET', {
    screen_lifecycle: 'absorbed',
    absorbed_into: 'UNKNOWN',
  });
  writeScreen(docsDir, 'TARGET');
  writeScreen(docsDir, 'BAD-ENUM', { screen_lifecycle: 'gone' });
  writeScreen(docsDir, 'BAD-DATE', {
    screen_lifecycle: 'absorbed',
    absorbed_into: 'TARGET',
    absorbed_at: '2026-02-30',
  });
  const result = runValidate(root, docsDir);
  assert.equal(result.status, 1);
  assert.ok(result.json.errors.some((error) => error.check === 1 && /screen_lifecycle/.test(error.message)));
  assert.ok(result.json.errors.some((error) => error.check === 1 && /absorbed_at/.test(error.message)));
  assert.ok(result.json.errors.some((error) => error.check === 2 && /requires absorbed_into/.test(error.message)));
  assert.ok(result.json.errors.some((error) => error.check === 3 && /target does not exist/.test(error.message)));
});

test('active interaction cannot target an absorbed former route', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-lifecycle-validate-route-'));
  const docsDir = path.join(root, 'docs', 'frontend-workflow');
  writeScreen(docsDir, 'CANONICAL');
  writeScreen(docsDir, 'ABSORBED', {
    route: '/former',
    screen_lifecycle: 'absorbed',
    absorbed_into: 'CANONICAL',
  });
  writeScreen(
    docsDir,
    'SOURCE',
    {},
    `\n## Interaction Matrix\n\n| Trigger | User Action | Result |\n|---|---|---|\n| tap | continue | navigate to \`/former\` |\n`,
  );
  const result = runValidate(root, docsDir);
  assert.equal(result.status, 1);
  assert.ok(result.json.errors.some((error) => error.check === 4 && /\/former/.test(error.message)));
});

test('nav, route, doctor, shared ownership, and visual consumers use the same live-screen partition', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-lifecycle-consumers-'));
  const docsDir = path.join(root, 'docs', 'frontend-workflow');
  const activeBody = `\n## Interaction Matrix\n\n| Trigger | User Action | Result |\n|---|---|---|\n| tap | continue | navigate to \`/auth-a\` |\n`;
  writeScreen(docsDir, 'AUTH-A', { route: '/auth-a' });
  writeScreen(docsDir, 'AUTH-C', { route: '/auth-c' }, activeBody);
  writeScreen(
    docsDir,
    'AUTH-B',
    {
      route: '/former',
      screen_entry: 'src/features/auth/screens/MissingAbsorbed.tsx',
      screen_lifecycle: 'absorbed',
      absorbed_into: 'AUTH-A',
    },
    activeBody,
  );

  const metaDir = path.join(docsDir, '_meta');
  fs.mkdirSync(metaDir, { recursive: true });
  fs.writeFileSync(
    path.join(metaDir, 'route-tree.txt'),
    '# GENERATED FILE — DO NOT EDIT\n   file.tsx route: /auth-a\n   file.tsx route: /auth-c\n',
    'utf8',
  );

  const nav = buildNavGraph({ docsDir });
  assert.equal(Object.hasOwn(nav.screens, 'AUTH-B'), false);
  assert.equal(Object.hasOwn(nav.routes, '/former'), false);
  assert.ok(nav.screens['AUTH-C'].outbound.some((edge) => edge.to_route === '/auth-a'));

  const routeReport = analyzeRouteCrossCheck({ docsDir });
  assert.equal(routeReport.screen_spec_count, 2);
  assert.equal(routeReport.spec_route_count, 2);
  assert.equal(routeReport.warning_count, 0);

  const doctor = collectDoctorFindings({
    layout: { roles: {}, layers: [] },
    projectRoot: root,
    policy: { modes: {}, order: [] },
    docsDir,
  });
  assert.equal(
    doctor.some(
      (finding) =>
        finding.check === 'route-screen-mapping-entry-missing' &&
        finding.screen_id === 'AUTH-B',
    ),
    false,
  );

  const screenSpecs = ['AUTH-A', 'AUTH-B', 'AUTH-C'].map((id) =>
    loadScreenSpec(
      path.join(docsDir, 'domains', 'auth', 'screens', id.toLowerCase(), 'screen-spec.md'),
    ),
  );
  const surfaceSpec = {
    ...fakeSpec('AUTH-SURFACE', {}, 'surface'),
    path: path.join(docsDir, 'domains', 'auth', 'surfaces', 'auth-surface', 'surface-spec.md'),
    dir: path.join(docsDir, 'domains', 'auth', 'surfaces', 'auth-surface'),
    frontmatter: {
      artifact_id: 'AUTH-SURFACE',
      artifact_type: 'shared-surface-spec',
      domain: 'auth',
      surface_id: 'AUTH-SURFACE',
      member_screens: ['AUTH-A', 'AUTH-B'],
      implementation_paths: ['src/features/auth/screens/MissingAbsorbed.tsx'],
      status: 'draft',
    },
  };
  const [surface] = analyzeSharedSurfaces({
    docsDir,
    surfaceSpecs: [surfaceSpec],
    screenSpecs,
  });
  assert.ok(surface.membership_errors.some((error) => error.code === 'absorbed-member'));
  assert.equal(
    surface.path_errors.some((error) => error.code === 'non-member-entry-overlap'),
    false,
  );

  const designDir = path.join(docsDir, 'design');
  fs.mkdirSync(designDir, { recursive: true });
  fs.writeFileSync(
    path.join(designDir, 'visual-consistency-contract.md'),
    `---\nartifact_id: visual-consistency-contract\nartifact_type: visual-consistency-contract\nstatus: draft\n---\n\n## Screen Families\n\n| Family | Member Screens | Layout/Shell Owner | Logo Policy | Header Policy | CTA Policy | Copy Source | Status | Evidence |\n|---|---|---|---|---|---|---|---|---|\n| Auth | AUTH-A, AUTH-B | shell | shared | shared | shared | ScreenSpec | draft | test |\n`,
    'utf8',
  );
  const visual = analyzeVisualConsistency({ docsDir });
  assert.equal(visual.summary.screens, 1);
  assert.equal(
    visual.findings.some((finding) => finding.screen_id === 'AUTH-B'),
    false,
  );

  const bootstrap = analyzeVisualContractBootstrap({
    docsDir,
    contractPath: path.join(root, 'missing-contract.md'),
  });
  assert.equal(JSON.stringify(bootstrap).includes('AUTH-B'), false);
});
