import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildState } from '../workflow-state.mjs';
import { computeReadiness } from '../readiness.mjs';
import { implementationPathIssues } from './shared-surfaces.mjs';
import { validateSchema } from './schema.mjs';
import { DEFAULTS, KIT_ROOT, loadYaml } from './util.mjs';

const VALIDATE = path.join(KIT_ROOT, 'scripts', 'validate.mjs');
const STATE = path.join(KIT_ROOT, 'scripts', 'workflow-state.mjs');
const READINESS = path.join(KIT_ROOT, 'scripts', 'readiness.mjs');

function withProject(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-surfaces-'));
  const docsDir = path.join(root, 'docs', 'frontend-workflow');
  const srcDir = path.join(root, 'src');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.mkdirSync(srcDir, { recursive: true });
  try {
    return fn({ root, docsDir, srcDir });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function yamlList(key, values) {
  if (values === undefined) return '';
  if (!Array.isArray(values)) return `${key}: ${values}\n`;
  return `${key}:\n${values.map((value) => `  - ${JSON.stringify(value)}`).join('\n')}\n`;
}

function writeScreen(
  docsDir,
  id,
  {
    domain = 'chat',
    refs,
    routeEntry,
    screenEntry,
    body = '',
    slug = String(id).toLowerCase(),
    artifactId = `${id}-screen-spec`,
    screenIdYaml = String(id),
    omitScreenId = false,
    route = `/${String(id).toLowerCase()}`,
  } = {},
) {
  const dir = path.join(docsDir, 'domains', domain, 'screens', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'screen-spec.md'),
    `---\n` +
      `artifact_id: ${artifactId}\n` +
      `artifact_type: screen-spec\n` +
      `domain: ${domain}\n` +
      (omitScreenId ? '' : `screen_id: ${screenIdYaml}\n`) +
      `route: ${route}\n` +
      (routeEntry ? `route_entry: ${routeEntry}\n` : '') +
      (screenEntry ? `screen_entry: ${screenEntry}\n` : '') +
      yamlList('decision_refs', refs) +
      `status: draft\n` +
      `---\n` +
      body,
    'utf8',
  );
}

const VALID_SURFACE_BODY = `
# Shared composer

## Purpose
Uniform composer behavior.

## Host Contract
| Direction | Name | Meaning | Required |
|---|---|---|---|
| input | draftText | Initial draft | no |
| output | onSubmit | Normalized submit intent | yes |

## State Matrix
| State | Condition | UI |
|---|---|---|
| loading | loading | spinner |
| empty | empty | prompt |
| error | error | retry |
| success | ready | composer |
| disabled | disabled | disabled composer |
| refreshing | refreshing | spinner |

## Interaction Matrix
| User Action | Trigger | Result | Result Type | Target | Params | Analytics Event |
|---|---|---|---|---|---|---|
| Type | input | draft changes | state | draft | - | - |

## Mutation Matrix
없음

## Data Requirements
- none

## API Candidates
없음

## Copy Keys
| Key | 문구 | Status |
|---|---|---|
| composer.placeholder | Message | draft |

## Accessibility
- labelled input

## Acceptance Criteria
- [ ] submits the same normalized intent

## Unknowns
없음
`;

function writeSurface(
  docsDir,
  id,
  {
    domain = 'chat',
    slug = id.toLowerCase(),
    members = ['CHAT-A', 'CHAT-B'],
    paths = ['src/features/chat/components/composer/**'],
    refs,
    body = VALID_SURFACE_BODY,
    extraFrontmatter = '',
    surfaceIdYaml = String(id),
  } = {},
) {
  const dir = path.join(docsDir, 'domains', domain, 'surfaces', slug);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'surface-spec.md');
  fs.writeFileSync(
    file,
    `---\n` +
      `artifact_id: ${id}-shared-surface-spec\n` +
      `artifact_type: shared-surface-spec\n` +
      `domain: ${domain}\n` +
      `surface_id: ${surfaceIdYaml}\n` +
      yamlList('member_screens', members) +
      (paths === null ? '' : yamlList('implementation_paths', paths)) +
      yamlList('decision_refs', refs) +
      extraFrontmatter +
      `status: draft\n` +
      `---\n` +
      body,
    'utf8',
  );
  return file;
}

function writeRegister(docsDir, rows) {
  const file = path.join(docsDir, 'global', 'open-decisions.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `---\nartifact_id: open-decision-register\nartifact_type: open-decision-register\nstatus: draft\n---\n\n` +
      `# Decisions\n\n## Open Decisions\n\n` +
      `| ID | Decision Needed | Options | Blocking Mode | Owner | Status |\n` +
      `|---|---|---|---|---|---|\n` +
      rows
        .map(
          (row) =>
            `| ${row.id} | ${row.question || 'Choose behavior'} | A / B | ${row.mode || 'final-fixture-ui'} | PM | ${row.status || 'open'} |`,
        )
        .join('\n') +
      `\n`,
    'utf8',
  );
}

function fullyReady(state) {
  state.global.navigation_map_status = 'confirmed';
  state.global.component_catalog_generated = true;
  state.global.stub_screen_specs_count = Object.keys(state.screens).length;
  for (const screen of Object.values(state.screens)) {
    screen.status = 'confirmed';
    screen.stub = false;
    Object.assign(screen.derived, {
      state_matrix_complete: true,
      interaction_matrix_complete: true,
      api_confidence_min: 'confirmed',
      fake_hook_exists: true,
      figma_mapping_status: 'confirmed',
    });
  }
  for (const surface of Object.values(state.surfaces || {})) {
    surface.status = 'confirmed';
    surface.stub = false;
    Object.assign(surface.derived, {
      state_matrix_complete: true,
      interaction_matrix_complete: true,
      api_confidence_min: 'confirmed',
    });
  }
  return state;
}

const CI = {
  ci_lint: 'pass',
  ci_schema_validation: 'pass',
  state_coverage_complete: true,
  llm_semantic_review: 'pass',
};

function readinessFor(state, surfaceOnlyId) {
  return computeReadiness({
    state: fullyReady(state),
    policy: loadYaml(DEFAULTS.policy),
    manifest: loadYaml(DEFAULTS.manifest),
    ci: CI,
    surfaceOnlyId,
  });
}

function validateProject({ root, docsDir, srcDir }) {
  const result = spawnSync(
    process.execPath,
    [
      VALIDATE,
      '--docs',
      docsDir,
      '--src',
      srcDir,
      '--root',
      root,
      '--manifest',
      DEFAULTS.manifest,
      '--schema',
      DEFAULTS.schema,
      '--policy',
      DEFAULTS.policy,
      '--json',
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  assert.ok(result.stdout, result.stderr);
  return { result, report: JSON.parse(result.stdout) };
}

test('valid two-screen surface is additive in state and reserves shared code from member screen readiness', () => {
  withProject(({ docsDir, srcDir }) => {
    writeScreen(docsDir, 'CHAT-A');
    writeScreen(docsDir, 'CHAT-B');
    writeSurface(docsDir, 'CHAT-COMPOSER');

    const { state, inventory } = buildState({ docsDir, srcDir, date: '2026-07-15' });
    const surface = state.surfaces['CHAT-COMPOSER'];
    assert.deepEqual(surface.member_screens, ['CHAT-A', 'CHAT-B']);
    assert.deepEqual(surface.implementation_paths, [
      'src/features/chat/components/composer/**',
    ]);
    assert.equal(surface.derived.state_matrix_complete, true);
    assert.equal(surface.derived.interaction_matrix_complete, true);
    assert.deepEqual(surface.derived.membership_errors, []);
    assert.deepEqual(surface.derived.path_errors, []);
    assert.equal(surface.source.path, 'domains/chat/surfaces/chat-composer/surface-spec.md');
    assert.deepEqual(
      state.screens['CHAT-A'].derived.shared_surfaces.map((row) => row.surface_id),
      ['CHAT-COMPOSER'],
    );
    assert.equal(inventory.screens.some((row) => row.id === 'CHAT-COMPOSER'), false);

    const screenReadiness = readinessFor(state);
    assert.equal(screenReadiness['CHAT-A'].readiness_mode, 'production-ready');
    assert.ok(
      screenReadiness['CHAT-A'].allowed_paths.includes('src/**'),
      'broad member allow remains visible',
    );
    assert.ok(
      screenReadiness['CHAT-A'].forbidden_paths.includes(
        'src/features/chat/components/composer/**',
      ),
    );
    assert.equal(
      screenReadiness['CHAT-A'].delegated_shared_surfaces[0].surface_id,
      'CHAT-COMPOSER',
    );

    const surfaceReadiness = readinessFor(state, 'CHAT-COMPOSER')['CHAT-COMPOSER'];
    assert.equal(surfaceReadiness.readiness_mode, 'production-ready');
    assert.equal(surfaceReadiness.surface_fact_mode, 'production-ready');
    assert.equal(surfaceReadiness.member_cap, 'production-ready');
    assert.deepEqual(surfaceReadiness.allowed_paths, [
      'src/features/chat/components/composer/**',
    ]);
    assert.deepEqual(surfaceReadiness.forbidden_paths, []);
  });
});

test('prototype-named screen and surface IDs remain own state/readiness records with plain-object output', () => {
  for (const surfaceId of ['constructor', 'toString']) {
    withProject(({ docsDir, srcDir }) => {
      const memberA = surfaceId === 'constructor' ? 'constructor' : 'CHAT-A';
      writeScreen(docsDir, memberA);
      writeScreen(docsDir, 'CHAT-B');
      writeSurface(docsDir, surfaceId, {
        members: [memberA, 'CHAT-B'],
        paths: [`src/features/chat/components/${surfaceId.toLowerCase()}/**`],
      });

      const state = buildState({ docsDir, srcDir, date: '2026-07-15' }).state;
      assert.equal(Object.getPrototypeOf(state.screens), Object.prototype);
      assert.equal(Object.getPrototypeOf(state.surfaces), Object.prototype);
      assert.equal(Object.hasOwn(state.screens, memberA), true);
      assert.equal(Object.hasOwn(state.surfaces, surfaceId), true);
      assert.equal(state.surfaces[surfaceId].source.path.includes(`/${surfaceId.toLowerCase()}/`), true);

      const screenReadiness = readinessFor(state);
      assert.equal(Object.getPrototypeOf(screenReadiness), Object.prototype);
      assert.equal(Object.hasOwn(screenReadiness, memberA), true);
      assert.equal(screenReadiness[memberA].readiness_mode, 'production-ready');

      const surfaceReadiness = readinessFor(state, surfaceId);
      assert.equal(Object.getPrototypeOf(surfaceReadiness), Object.prototype);
      assert.equal(Object.hasOwn(surfaceReadiness, surfaceId), true);
      assert.equal(surfaceReadiness[surfaceId].readiness_mode, 'production-ready');
      assert.deepEqual(surfaceReadiness[surfaceId].allowed_paths, [
        `src/features/chat/components/${surfaceId.toLowerCase()}/**`,
      ]);
    });
  }
});

test('duplicate and malformed prototype-sensitive surface IDs stay deterministic and fail closed', () => {
  withProject(({ docsDir, srcDir }) => {
    writeScreen(docsDir, 'CHAT-A');
    writeScreen(docsDir, 'CHAT-B');
    writeSurface(docsDir, 'constructor', {
      slug: 'first',
      paths: ['src/features/chat/components/first/**'],
    });
    writeSurface(docsDir, 'constructor', {
      slug: 'second',
      paths: ['src/features/chat/components/second/**'],
    });

    const state = buildState({ docsDir, srcDir, date: '2026-07-15' }).state;
    assert.equal(Object.hasOwn(state.surfaces, 'constructor'), true);
    assert.deepEqual(state.surfaces.constructor.implementation_paths, [
      'src/features/chat/components/first/**',
    ]);
    assert.equal(state.surfaces.constructor.source.path.includes('/first/'), true);
    assert.ok(
      state.surfaces.constructor.derived.identity_errors.some(
        (issue) => issue.code === 'duplicate-surface-id',
      ),
    );
    assert.equal(
      readinessFor(state, 'constructor').constructor.readiness_mode,
      'docs-only',
    );
  });

  withProject(({ docsDir, srcDir }) => {
    writeScreen(docsDir, 'CHAT-A');
    writeScreen(docsDir, 'CHAT-B');
    writeSurface(docsDir, '__proto__');

    const state = buildState({ docsDir, srcDir, date: '2026-07-15' }).state;
    assert.equal(Object.getPrototypeOf(state.surfaces), Object.prototype);
    assert.equal(Object.hasOwn(state.surfaces, '__proto__'), true);
    assert.ok(
      state.surfaces.__proto__.derived.contract_errors.some(
        (issue) => issue.code === 'invalid-surface-id',
      ),
    );
    const readiness = readinessFor(state, '__proto__');
    assert.equal(Object.getPrototypeOf(readiness), Object.prototype);
    assert.equal(Object.hasOwn(readiness, '__proto__'), true);
    assert.equal(readiness.__proto__.readiness_mode, 'docs-only');
  });
});

test('surface duplicate selection uses the serialized property key for numeric and string IDs', () => {
  withProject(({ docsDir, srcDir }) => {
    writeScreen(docsDir, 'CHAT-A');
    writeScreen(docsDir, 'CHAT-B');
    writeSurface(docsDir, '1', {
      slug: 'a-invalid',
      surfaceIdYaml: '1',
      paths: ['src/features/chat/components/numeric-id/**'],
    });
    writeSurface(docsDir, '1', {
      slug: 'z-valid',
      surfaceIdYaml: '"1"',
      paths: ['src/features/chat/components/string-id/**'],
    });

    const state = buildState({ docsDir, srcDir, date: '2026-07-15' }).state;
    assert.deepEqual(Object.keys(state.surfaces), ['1']);
    const selected = state.surfaces['1'];
    assert.equal(selected.source.path.includes('/a-invalid/'), true);
    assert.deepEqual(selected.implementation_paths, [
      'src/features/chat/components/numeric-id/**',
    ]);
    assert.ok(
      selected.derived.contract_errors.some(
        (issue) => issue.code === 'invalid-surface-id',
      ),
    );
    assert.deepEqual(
      selected.derived.identity_errors.find(
        (issue) => issue.code === 'duplicate-surface-id',
      ),
      {
        code: 'duplicate-surface-id',
        message: 'surface_id is globally duplicated: 1',
        surface_id: '1',
        locations: [
          'domains/chat/surfaces/a-invalid/surface-spec.md',
          'domains/chat/surfaces/z-valid/surface-spec.md',
        ],
      },
    );
    assert.equal(
      selected.derived.path_errors.some(
        (issue) => issue.code === 'surface-path-overlap',
      ),
      false,
    );

    const readiness = readinessFor(state, '1')['1'];
    assert.equal(readiness.readiness_mode, 'docs-only');
    assert.deepEqual(readiness.allowed_paths, []);
    assert.deepEqual(readiness.forbidden_paths, [
      'src/features/chat/components/numeric-id/**',
    ]);
  });
});

test('present-falsy surface IDs collide with canonical public keys and fail closed', () => {
  for (const scenario of [
    { name: 'zero', rawYaml: '0', publicKey: '0' },
    { name: 'false', rawYaml: 'false', publicKey: 'false' },
  ]) {
    withProject((project) => {
      writeScreen(project.docsDir, 'CHAT-A');
      writeScreen(project.docsDir, 'CHAT-B');
      const invalidSlug = `a-${scenario.name}-invalid`;
      const validSlug = `z-${scenario.name}-valid`;
      const invalidPath = `src/features/chat/components/${scenario.name}-invalid/**`;
      writeSurface(project.docsDir, `malformed-${scenario.name}-surface`, {
        slug: invalidSlug,
        surfaceIdYaml: scenario.rawYaml,
        paths: [invalidPath],
      });
      writeSurface(project.docsDir, `canonical-${scenario.name}-surface`, {
        slug: validSlug,
        surfaceIdYaml: JSON.stringify(scenario.publicKey),
        paths: [`src/features/chat/components/${scenario.name}-valid/**`],
      });

      const state = buildState({
        docsDir: project.docsDir,
        srcDir: project.srcDir,
        date: '2026-07-16',
      }).state;
      assert.deepEqual(Object.keys(state.surfaces), [scenario.publicKey]);
      const selected = state.surfaces[scenario.publicKey];
      assert.equal(selected.source.path.includes(`/${invalidSlug}/`), true);
      assert.deepEqual(selected.implementation_paths, [invalidPath]);
      assert.deepEqual(
        selected.derived.contract_errors.find(
          (issue) => issue.code === 'invalid-surface-id',
        ),
        {
          code: 'invalid-surface-id',
          message: `surface_id must be a canonical ID: ${scenario.publicKey}`,
        },
      );
      assert.deepEqual(
        selected.derived.identity_errors.find(
          (issue) => issue.code === 'duplicate-surface-id',
        ),
        {
          code: 'duplicate-surface-id',
          message: `surface_id is globally duplicated: ${scenario.publicKey}`,
          surface_id: scenario.publicKey,
          locations: [
            `domains/chat/surfaces/${invalidSlug}/surface-spec.md`,
            `domains/chat/surfaces/${validSlug}/surface-spec.md`,
          ],
        },
      );

      const readiness = readinessFor(state, scenario.publicKey)[scenario.publicKey];
      assert.equal(readiness.readiness_mode, 'docs-only');
      assert.deepEqual(readiness.allowed_paths, []);
      assert.deepEqual(readiness.forbidden_paths, [invalidPath]);

      const { result, report } = validateProject(project);
      assert.equal(result.status, 1);
      assert.ok(
        report.errors.some(
          (entry) =>
            entry.check === 2 &&
            entry.message === `surface_id must be a canonical ID: ${scenario.publicKey}`,
        ),
      );
      assert.ok(
        report.errors.some(
          (entry) =>
            entry.check === 5 &&
            entry.message === `surface_id is globally duplicated: ${scenario.publicKey}`,
        ),
      );
    });
  }
});

test('screen identity uses the serialized property key for state duplicates and surface membership', () => {
  withProject((project) => {
    writeScreen(project.docsDir, '1', {
      slug: 'a-invalid',
      artifactId: 'numeric-one-screen-spec',
      screenIdYaml: '1',
      route: '/numeric-one',
    });
    writeScreen(project.docsDir, '1', {
      slug: 'z-valid',
      artifactId: 'string-one-screen-spec',
      screenIdYaml: '"1"',
      route: '/string-one',
    });
    writeScreen(project.docsDir, 'CHAT-B');
    writeSurface(project.docsDir, 'SCREEN-ID-COLLISION', {
      members: ['1', 'CHAT-B'],
      paths: ['src/features/chat/components/screen-id-collision/**'],
    });

    const { state, inventory } = buildState({
      docsDir: project.docsDir,
      srcDir: project.srcDir,
      date: '2026-07-16',
    });
    assert.deepEqual(Object.keys(state.screens), ['1', 'CHAT-B']);
    assert.equal(state.screens['1'].route, '/string-one');
    assert.deepEqual(inventory.checks.duplicate_ids, ['1']);
    const collisionRows = inventory.screens.filter((row) => String(row.id) === '1');
    assert.equal(collisionRows.length, 2);
    assert.deepEqual(collisionRows.map((row) => typeof row.id).sort(), ['number', 'string']);
    assert.deepEqual(collisionRows.map((row) => row.route).sort(), ['/numeric-one', '/string-one']);

    const surface = state.surfaces['SCREEN-ID-COLLISION'];
    assert.deepEqual(
      surface.derived.membership_errors.find((issue) => issue.code === 'ambiguous-member'),
      {
        code: 'ambiguous-member',
        message: 'member screen identity is duplicated: 1',
        screen_id: '1',
      },
    );
    const readiness = readinessFor(state, 'SCREEN-ID-COLLISION')['SCREEN-ID-COLLISION'];
    assert.equal(readiness.readiness_mode, 'docs-only');
    assert.deepEqual(readiness.allowed_paths, []);
    assert.deepEqual(readiness.forbidden_paths, [
      'src/features/chat/components/screen-id-collision/**',
    ]);

    const { result, report } = validateProject(project);
    assert.equal(result.status, 1);
    const messages = report.errors
      .filter((entry) => [3, 5].includes(entry.check))
      .map((entry) => entry.message)
      .join('\n');
    assert.match(messages, /member screen identity is duplicated: 1/);
    assert.match(messages, /screen_id 중복: 1 \(2건\)/);
  });
});

test('present-falsy screen identities collide with canonical public keys and fail surfaces closed', () => {
  for (const scenario of [
    {
      name: 'zero',
      rawValue: 0,
      rawYaml: '0',
      canonicalYaml: '"0"',
      publicKey: '0',
      rawType: 'number',
    },
    {
      name: 'false',
      rawValue: false,
      rawYaml: 'false',
      canonicalYaml: '"false"',
      publicKey: 'false',
      rawType: 'boolean',
    },
  ]) {
    withProject((project) => {
      writeScreen(project.docsDir, scenario.publicKey, {
        slug: `a-${scenario.name}-invalid`,
        artifactId: `${scenario.name}-invalid-screen-spec`,
        screenIdYaml: scenario.rawYaml,
        route: `/${scenario.name}-invalid`,
      });
      writeScreen(project.docsDir, scenario.publicKey, {
        slug: `z-${scenario.name}-valid`,
        artifactId: `${scenario.name}-valid-screen-spec`,
        screenIdYaml: scenario.canonicalYaml,
        route: `/${scenario.name}-valid`,
      });
      writeScreen(project.docsDir, 'CHAT-B');
      const surfaceId = `SCREEN-ID-${scenario.name.toUpperCase()}-COLLISION`;
      const declaredPath = `src/features/chat/components/${scenario.name}-collision/**`;
      writeSurface(project.docsDir, surfaceId, {
        members: [scenario.publicKey, 'CHAT-B'],
        paths: [declaredPath],
      });

      const { state, inventory } = buildState({
        docsDir: project.docsDir,
        srcDir: project.srcDir,
        date: '2026-07-16',
      });
      assert.deepEqual(inventory.checks.duplicate_ids, [scenario.publicKey]);
      const collisionRows = inventory.screens.filter(
        (row) => String(row.id) === scenario.publicKey,
      );
      assert.equal(collisionRows.length, 2);
      assert.deepEqual(
        collisionRows.map((row) => typeof row.id).sort(),
        [scenario.rawType, 'string'].sort(),
      );
      assert.ok(collisionRows.some((row) => row.id === scenario.rawValue));
      assert.ok(collisionRows.some((row) => row.id === scenario.publicKey));

      assert.deepEqual(
        state.surfaces[surfaceId].derived.membership_errors.find(
          (issue) => issue.code === 'ambiguous-member',
        ),
        {
          code: 'ambiguous-member',
          message: `member screen identity is duplicated: ${scenario.publicKey}`,
          screen_id: scenario.publicKey,
        },
      );
      const readiness = readinessFor(state, surfaceId)[surfaceId];
      assert.equal(readiness.readiness_mode, 'docs-only');
      assert.deepEqual(readiness.allowed_paths, []);
      assert.deepEqual(readiness.forbidden_paths, [declaredPath]);

      const { result, report } = validateProject(project);
      assert.equal(result.status, 1);
      const messages = report.errors
        .filter((entry) => [3, 5].includes(entry.check))
        .map((entry) => entry.message)
        .join('\n');
      assert.match(
        messages,
        new RegExp(`member screen identity is duplicated: ${scenario.publicKey}`),
      );
      assert.match(
        messages,
        new RegExp(`screen_id 중복: ${scenario.publicKey} \\(2건\\)`),
      );
    });
  }
});

test('singleton present-falsy screen identities cannot satisfy canonical surface members', () => {
  for (const scenario of [
    { name: 'zero', rawYaml: '0', publicKey: '0' },
    { name: 'false', rawYaml: 'false', publicKey: 'false' },
  ]) {
    withProject((project) => {
      const slug = `${scenario.name}-only`;
      writeScreen(project.docsDir, scenario.publicKey, {
        slug,
        artifactId: `${scenario.name}-only-screen-spec`,
        screenIdYaml: scenario.rawYaml,
        route: `/${scenario.name}-only`,
      });
      writeScreen(project.docsDir, 'CHAT-B');
      const surfaceId = `MALFORMED-${scenario.name.toUpperCase()}-MEMBER`;
      const declaredPath = `src/features/chat/components/${scenario.name}-member/**`;
      writeSurface(project.docsDir, surfaceId, {
        members: [scenario.publicKey, 'CHAT-B'],
        paths: [declaredPath],
      });

      const { state, inventory } = buildState({
        docsDir: project.docsDir,
        srcDir: project.srcDir,
        date: '2026-07-16',
      });
      assert.deepEqual(inventory.checks.duplicate_ids, []);
      assert.deepEqual(
        state.surfaces[surfaceId].derived.membership_errors.find(
          (issue) => issue.code === 'invalid-member-screen-id',
        ),
        {
          code: 'invalid-member-screen-id',
          message: `member screen identity is not a canonical string: ${scenario.publicKey}`,
          screen_id: scenario.publicKey,
          locations: [`domains/chat/screens/${slug}/screen-spec.md`],
        },
      );
      const readiness = readinessFor(state, surfaceId)[surfaceId];
      assert.equal(readiness.readiness_mode, 'docs-only');
      assert.deepEqual(readiness.allowed_paths, []);
      assert.deepEqual(readiness.forbidden_paths, [declaredPath]);

      const { result, report } = validateProject(project);
      assert.equal(result.status, 1);
      assert.ok(
        report.errors.some(
          (entry) =>
            entry.check === 3 &&
            entry.message ===
              `member screen identity is not a canonical string: ${scenario.publicKey}`,
        ),
      );
    });
  }
});

test('a singleton non-string screen ID cannot satisfy a canonical surface member', () => {
  withProject((project) => {
    writeScreen(project.docsDir, '1', {
      slug: 'numeric-only',
      artifactId: 'numeric-only-screen-spec',
      screenIdYaml: '1',
      route: '/numeric-only',
    });
    writeScreen(project.docsDir, 'CHAT-B');
    writeSurface(project.docsDir, 'MALFORMED-MEMBER', {
      members: ['1', 'CHAT-B'],
      paths: ['src/features/chat/components/malformed-member/**'],
    });

    const { state, inventory } = buildState({
      docsDir: project.docsDir,
      srcDir: project.srcDir,
      date: '2026-07-16',
    });
    assert.equal(Object.hasOwn(state.screens, '1'), true);
    assert.deepEqual(inventory.checks.duplicate_ids, []);
    assert.deepEqual(
      state.surfaces['MALFORMED-MEMBER'].derived.membership_errors.find(
        (issue) => issue.code === 'invalid-member-screen-id',
      ),
      {
        code: 'invalid-member-screen-id',
        message: 'member screen identity is not a canonical string: 1',
        screen_id: '1',
        locations: ['domains/chat/screens/numeric-only/screen-spec.md'],
      },
    );

    const readiness = readinessFor(state, 'MALFORMED-MEMBER')['MALFORMED-MEMBER'];
    assert.equal(readiness.readiness_mode, 'docs-only');
    assert.deepEqual(readiness.allowed_paths, []);
    assert.deepEqual(readiness.forbidden_paths, [
      'src/features/chat/components/malformed-member/**',
    ]);

    const { result, report } = validateProject(project);
    assert.equal(result.status, 1);
    assert.ok(
      report.errors.some(
        (entry) =>
          entry.check === 3 &&
          entry.message === 'member screen identity is not a canonical string: 1',
      ),
    );
  });

  withProject(({ docsDir, srcDir }) => {
    writeScreen(docsDir, '1', {
      slug: 'string-only',
      artifactId: 'string-only-screen-spec',
      screenIdYaml: '"1"',
      route: '/string-only',
    });
    writeScreen(docsDir, 'CHAT-B');
    writeSurface(docsDir, 'CANONICAL-MEMBER', {
      members: ['1', 'CHAT-B'],
      paths: ['src/features/chat/components/canonical-member/**'],
    });

    const state = buildState({ docsDir, srcDir, date: '2026-07-16' }).state;
    assert.deepEqual(state.surfaces['CANONICAL-MEMBER'].derived.membership_errors, []);
    const readiness = readinessFor(state, 'CANONICAL-MEMBER')['CANONICAL-MEMBER'];
    assert.equal(readiness.readiness_mode, 'production-ready');
    assert.deepEqual(readiness.allowed_paths, [
      'src/features/chat/components/canonical-member/**',
    ]);
  });
});

test('surface membership uses the same fallback Screen key namespace as workflow state', () => {
  withProject((project) => {
    writeScreen(project.docsDir, 'CHAT-A', {
      slug: 'a-valid',
      artifactId: 'valid-chat-a-spec',
      route: '/valid-chat-a',
    });
    writeScreen(project.docsDir, 'fallback', {
      slug: 'z-malformed',
      artifactId: 'CHAT-A',
      omitScreenId: true,
      route: '/malformed-chat-a',
    });
    writeScreen(project.docsDir, 'CHAT-B');
    writeSurface(project.docsDir, 'FALLBACK-COLLISION', {
      members: ['CHAT-A', 'CHAT-B'],
      paths: ['src/features/chat/components/fallback-collision/**'],
    });

    const { state, inventory } = buildState({
      docsDir: project.docsDir,
      srcDir: project.srcDir,
      date: '2026-07-16',
    });
    assert.equal(state.screens['CHAT-A'].route, '/malformed-chat-a');
    assert.deepEqual(inventory.checks.duplicate_ids, ['CHAT-A']);
    assert.deepEqual(
      state.surfaces['FALLBACK-COLLISION'].derived.membership_errors.find(
        (issue) => issue.code === 'ambiguous-member',
      ),
      {
        code: 'ambiguous-member',
        message: 'member screen identity is duplicated: CHAT-A',
        screen_id: 'CHAT-A',
      },
    );

    const readiness = readinessFor(state, 'FALLBACK-COLLISION')['FALLBACK-COLLISION'];
    assert.equal(readiness.readiness_mode, 'docs-only');
    assert.deepEqual(readiness.allowed_paths, []);
    assert.deepEqual(readiness.forbidden_paths, [
      'src/features/chat/components/fallback-collision/**',
    ]);

    const { result, report } = validateProject(project);
    assert.equal(result.status, 1);
    const messages = report.errors
      .filter((entry) => [3, 5].includes(entry.check))
      .map((entry) => entry.message)
      .join('\n');
    assert.match(messages, /member screen identity is duplicated: CHAT-A/);
    assert.match(messages, /screen_id 중복: CHAT-A \(2건\)/);
  });

  withProject(({ docsDir, srcDir }) => {
    writeScreen(docsDir, 'fallback', {
      slug: 'fallback-only',
      artifactId: 'CHAT-A',
      omitScreenId: true,
      route: '/fallback-only',
    });
    writeScreen(docsDir, 'CHAT-B');
    writeSurface(docsDir, 'FALLBACK-ONLY', {
      members: ['CHAT-A', 'CHAT-B'],
      paths: ['src/features/chat/components/fallback-only/**'],
    });

    const state = buildState({ docsDir, srcDir, date: '2026-07-16' }).state;
    assert.equal(Object.hasOwn(state.screens, 'CHAT-A'), true);
    assert.deepEqual(
      state.surfaces['FALLBACK-ONLY'].derived.membership_errors.find(
        (issue) => issue.code === 'invalid-member-screen-id',
      ),
      {
        code: 'invalid-member-screen-id',
        message: 'member screen identity is not a canonical string: CHAT-A',
        screen_id: 'CHAT-A',
        locations: ['domains/chat/screens/fallback-only/screen-spec.md'],
      },
    );
    const readiness = readinessFor(state, 'FALLBACK-ONLY')['FALLBACK-ONLY'];
    assert.equal(readiness.readiness_mode, 'docs-only');
    assert.deepEqual(readiness.allowed_paths, []);
  });
});

test('an absent prototype-named --surface selector never resolves an inherited phantom record', () => {
  withProject(({ docsDir, srcDir }) => {
    writeScreen(docsDir, 'CHAT-A');
    writeScreen(docsDir, 'CHAT-B');
    writeSurface(docsDir, 'COMPOSER');
    const state = buildState({ docsDir, srcDir, date: '2026-07-15' }).state;
    assert.deepEqual(readinessFor(state, 'constructor'), {});
  });
});

test('three-screen surface decision refs preserve canonical source + surface via and fan out malformed refs fail-closed', () => {
  withProject(({ docsDir, srcDir }) => {
    writeScreen(docsDir, 'CHAT-A');
    writeScreen(docsDir, 'CHAT-B');
    writeScreen(docsDir, 'CHAT-C');
    writeRegister(docsDir, [
      { id: 'D-OPEN' },
      { id: 'D-DONE', status: 'resolved' },
    ]);
    writeSurface(docsDir, 'CHAT-COMPOSER', {
      members: ['CHAT-A', 'CHAT-B', 'CHAT-C'],
      refs: ['D-OPEN', 'D-DONE'],
    });

    let state = buildState({ docsDir, srcDir, date: '2026-07-15' }).state;
    const surface = state.surfaces['CHAT-COMPOSER'];
    const canonical = {
      artifact_id: 'open-decision-register',
      artifact_type: 'open-decision-register',
      path: 'global/open-decisions.md',
    };
    const via = {
      artifact_id: 'CHAT-COMPOSER-shared-surface-spec',
      artifact_type: 'shared-surface-spec',
      surface_id: 'CHAT-COMPOSER',
      path: 'domains/chat/surfaces/chat-composer/surface-spec.md',
    };
    assert.deepEqual(surface.derived.decision_refs.map((row) => row.id), [
      'D-DONE',
      'D-OPEN',
    ]);
    assert.equal(surface.derived.decision_refs[0].status, 'resolved');
    assert.deepEqual(surface.derived.decision_refs[0].source, canonical);
    assert.deepEqual(surface.derived.decision_refs[0].via, via);
    for (const id of ['CHAT-A', 'CHAT-B', 'CHAT-C']) {
      assert.deepEqual(state.screens[id].derived.blocking_decisions[0].source, canonical);
      assert.deepEqual(state.screens[id].derived.blocking_decisions[0].via, via);
    }
    const readiness = readinessFor(state, 'CHAT-COMPOSER')['CHAT-COMPOSER'];
    assert.equal(readiness.readiness_mode, 'rough-fixture-ui');
    assert.deepEqual(readiness.blocking[0].open_decision.via, via);

    writeSurface(docsDir, 'CHAT-COMPOSER', {
      members: ['CHAT-A', 'CHAT-B', 'CHAT-C'],
      refs: ['D-MISSING'],
    });
    state = buildState({ docsDir, srcDir, date: '2026-07-15' }).state;
    for (const id of ['CHAT-A', 'CHAT-B', 'CHAT-C']) {
      assert.equal(state.screens[id].derived.malformed_decisions[0].code, 'unresolved-ref');
      assert.equal(readinessFor(state)[id].readiness_mode, 'docs-only');
    }
    assert.equal(
      readinessFor(state, 'CHAT-COMPOSER')['CHAT-COMPOSER'].readiness_mode,
      'docs-only',
    );
  });
});

test('malformed and ambiguous canonical decision refs fail every surface member closed', () => {
  for (const scenario of [
    {
      name: 'malformed',
      rows: [{ id: 'D-BAD', status: 'invalid' }],
      expectedCode: 'malformed-row',
    },
    {
      name: 'ambiguous',
      rows: [{ id: 'D-DUP' }, { id: 'D-DUP' }],
      expectedCode: 'ambiguous-ref',
    },
  ]) {
    withProject(({ docsDir, srcDir }) => {
      for (const id of ['CHAT-A', 'CHAT-B', 'CHAT-C']) writeScreen(docsDir, id);
      writeRegister(docsDir, scenario.rows);
      const ref = scenario.rows[0].id;
      writeSurface(docsDir, `SURFACE-${scenario.name.toUpperCase()}`, {
        members: ['CHAT-A', 'CHAT-B', 'CHAT-C'],
        refs: [ref],
      });

      const state = buildState({ docsDir, srcDir, date: '2026-07-15' }).state;
      for (const id of ['CHAT-A', 'CHAT-B', 'CHAT-C']) {
        assert.ok(
          state.screens[id].derived.malformed_decisions.some(
            (row) => row.id === ref && row.code === scenario.expectedCode,
          ),
          `${scenario.name} ref must fan out to ${id}`,
        );
        assert.equal(readinessFor(state)[id].readiness_mode, 'docs-only');
      }
      assert.equal(
        readinessFor(state, `SURFACE-${scenario.name.toUpperCase()}`)[
          `SURFACE-${scenario.name.toUpperCase()}`
        ].readiness_mode,
        'docs-only',
      );
    });
  }
});

test('membership, identity, traversal, broad wildcard, member entry and surface overlap errors are deterministic and fail closed', () => {
  withProject((project) => {
    writeScreen(project.docsDir, 'CHAT-A', {
      screenEntry: 'src/features/chat/components/composer/Composer.tsx',
    });
    writeScreen(project.docsDir, 'OTHER', { domain: 'other' });
    writeSurface(project.docsDir, 'BAD-SURFACE', {
      members: ['CHAT-A', 'CHAT-A', 'MISSING', 'OTHER'],
      paths: [
        '../escape/**',
        'src/**',
        'src/features/chat/components/composer/**',
      ],
    });
    writeSurface(project.docsDir, 'OVERLAP', {
      members: ['CHAT-A', 'OTHER'],
      paths: ['src/features/chat/components/composer/field/**'],
    });
    writeSurface(project.docsDir, 'ONE-MEMBER', {
      members: ['CHAT-A'],
      paths: ['src/features/chat/components/single/**'],
    });

    const state = buildState({
      docsDir: project.docsDir,
      srcDir: project.srcDir,
      date: '2026-07-15',
    }).state;
    const bad = state.surfaces['BAD-SURFACE'].derived;
    const membershipCodes = bad.membership_errors.map((issue) => issue.code);
    assert.ok(membershipCodes.includes('duplicate-member'));
    assert.ok(membershipCodes.includes('missing-member'));
    assert.ok(membershipCodes.includes('cross-domain-member'));
    assert.ok(
      state.surfaces['ONE-MEMBER'].derived.membership_errors.some(
        (issue) => issue.code === 'too-few-members',
      ),
    );
    const pathCodes = bad.path_errors.map((issue) => issue.code);
    assert.ok(pathCodes.includes('unsafe-path-segment'));
    assert.ok(pathCodes.includes('broad-wildcard'));
    assert.ok(pathCodes.includes('member-entry-overlap'));
    assert.ok(pathCodes.includes('surface-path-overlap'));
    assert.deepEqual(
      bad.path_errors.find((issue) => issue.code === 'member-entry-overlap'),
      {
        code: 'member-entry-overlap',
        message:
          'implementation path src/features/chat/components/composer/** overlaps member CHAT-A screen_entry: src/features/chat/components/composer/Composer.tsx',
        path: 'src/features/chat/components/composer/**',
        screen_id: 'CHAT-A',
        entry_kind: 'screen_entry',
        entry_path: 'src/features/chat/components/composer/Composer.tsx',
      },
    );
    assert.equal(
      readinessFor(state, 'BAD-SURFACE')['BAD-SURFACE'].readiness_mode,
      'docs-only',
    );
    assert.equal(
      readinessFor(state, 'ONE-MEMBER')['ONE-MEMBER'].readiness_mode,
      'docs-only',
    );

    const { result, report } = validateProject(project);
    assert.equal(result.status, 1);
    const messages = report.errors.filter((entry) => [3, 5].includes(entry.check)).map((entry) => entry.message).join('\n');
    assert.match(messages, /duplicate Screen ID/);
    assert.match(messages, /does not exist/);
    assert.match(messages, /belongs to domain other/);
    assert.match(messages, /unsafe\/hidden segment/);
    assert.match(messages, /too broad/);
    assert.match(messages, /overlaps member/);
    assert.match(messages, /overlaps surface/);
  });
});

test('same-domain and cross-domain non-member ScreenSpec entries are global ownership errors', () => {
  withProject((project) => {
    writeScreen(project.docsDir, 'CHAT-A');
    writeScreen(project.docsDir, 'CHAT-B');
    writeScreen(project.docsDir, 'CHAT-C', {
      routeEntry: 'src/features/chat/components/composer/index.tsx',
    });
    writeScreen(project.docsDir, 'OTHER', {
      domain: 'other',
      screenEntry: 'src/features/chat/components/cross-domain/OtherScreen.tsx',
    });
    writeSurface(project.docsDir, 'SAME-DOMAIN-OVERLAP', {
      paths: ['src/features/chat/components/composer/**'],
    });
    writeSurface(project.docsDir, 'CROSS-DOMAIN-OVERLAP', {
      paths: ['src/features/chat/components/cross-domain/**'],
    });

    const state = buildState({
      docsDir: project.docsDir,
      srcDir: project.srcDir,
      date: '2026-07-15',
    }).state;
    const sameDomain = state.surfaces['SAME-DOMAIN-OVERLAP'];
    assert.deepEqual(
      sameDomain.derived.path_errors.find(
        (issue) => issue.code === 'non-member-entry-overlap',
      ),
      {
        code: 'non-member-entry-overlap',
        message:
          'implementation path src/features/chat/components/composer/** overlaps non-member screen CHAT-C route_entry: src/features/chat/components/composer/index.tsx',
        path: 'src/features/chat/components/composer/**',
        screen_id: 'CHAT-C',
        screen_domain: 'chat',
        entry_kind: 'route_entry',
        entry_path: 'src/features/chat/components/composer/index.tsx',
        screen_spec_path: 'domains/chat/screens/chat-c/screen-spec.md',
      },
    );
    assert.deepEqual(sameDomain.member_screens, ['CHAT-A', 'CHAT-B']);

    const crossDomain = state.surfaces['CROSS-DOMAIN-OVERLAP'];
    assert.deepEqual(
      crossDomain.derived.path_errors.find(
        (issue) => issue.code === 'non-member-entry-overlap',
      ),
      {
        code: 'non-member-entry-overlap',
        message:
          'implementation path src/features/chat/components/cross-domain/** overlaps non-member screen OTHER screen_entry: src/features/chat/components/cross-domain/OtherScreen.tsx',
        path: 'src/features/chat/components/cross-domain/**',
        screen_id: 'OTHER',
        screen_domain: 'other',
        entry_kind: 'screen_entry',
        entry_path: 'src/features/chat/components/cross-domain/OtherScreen.tsx',
        screen_spec_path: 'domains/other/screens/other/screen-spec.md',
      },
    );
    assert.deepEqual(crossDomain.member_screens, ['CHAT-A', 'CHAT-B']);

    for (const surfaceId of ['SAME-DOMAIN-OVERLAP', 'CROSS-DOMAIN-OVERLAP']) {
      const readiness = readinessFor(state, surfaceId)[surfaceId];
      assert.equal(readiness.readiness_mode, 'docs-only');
      assert.deepEqual(readiness.allowed_paths, []);
      assert.deepEqual(readiness.forbidden_paths, state.surfaces[surfaceId].implementation_paths);
    }

    const screenReadiness = readinessFor(state);
    for (const nonMember of ['CHAT-C', 'OTHER']) {
      assert.equal(
        Object.hasOwn(state.screens[nonMember].derived, 'shared_surfaces'),
        false,
      );
      assert.equal(
        Object.hasOwn(screenReadiness[nonMember], 'delegated_shared_surfaces'),
        false,
      );
    }

    const { result, report } = validateProject(project);
    assert.equal(result.status, 1);
    const overlapMessages = report.errors
      .filter((entry) => entry.check === 3)
      .map((entry) => entry.message)
      .join('\n');
    assert.match(overlapMessages, /overlaps non-member screen CHAT-C route_entry/);
    assert.match(overlapMessages, /overlaps non-member screen OTHER screen_entry/);
  });
});

test('non-member entry ownership compares lexical repository-path equivalents and preserves raw provenance', () => {
  for (const scenario of [
    {
      name: 'dot-prefix',
      option: 'routeEntry',
      entryKind: 'route_entry',
      entryPath: () => './src/features/x/Foo.tsx',
    },
    {
      name: 'backslash',
      option: 'screenEntry',
      entryKind: 'screen_entry',
      entryPath: () => String.raw`src\features\x\Foo.tsx`,
    },
    {
      name: 'dot-segment',
      option: 'routeEntry',
      entryKind: 'route_entry',
      entryPath: () => 'src/features/x/../x/Foo.tsx',
    },
    {
      name: 'repeated-separator',
      option: 'screenEntry',
      entryKind: 'screen_entry',
      entryPath: () => 'src//features/x/Foo.tsx',
    },
  ]) {
    withProject((project) => {
      const entryPath = scenario.entryPath(project);
      writeScreen(project.docsDir, 'CHAT-A');
      writeScreen(project.docsDir, 'CHAT-B');
      writeScreen(project.docsDir, 'CHAT-C', {
        [scenario.option]: entryPath,
      });
      const surfaceId = `ENTRY-${scenario.name.toUpperCase()}-OVERLAP`;
      const implementationPath = 'src/features/x/**';
      writeSurface(project.docsDir, surfaceId, { paths: [implementationPath] });

      const { state, inventory } = buildState({
        docsDir: project.docsDir,
        srcDir: project.srcDir,
        date: '2026-07-16',
      });
      const expectedMessage =
        `implementation path ${implementationPath} overlaps non-member screen CHAT-C ` +
        `${scenario.entryKind}: ${entryPath}`;
      assert.deepEqual(
        state.surfaces[surfaceId].derived.path_errors.find(
          (issue) => issue.code === 'non-member-entry-overlap',
        ),
        {
          code: 'non-member-entry-overlap',
          message: expectedMessage,
          path: implementationPath,
          screen_id: 'CHAT-C',
          screen_domain: 'chat',
          entry_kind: scenario.entryKind,
          entry_path: entryPath,
          screen_spec_path: 'domains/chat/screens/chat-c/screen-spec.md',
        },
      );
      assert.equal(
        inventory.screens.find((row) => row.id === 'CHAT-C')[scenario.entryKind],
        entryPath,
      );
      assert.deepEqual(state.surfaces[surfaceId].member_screens, ['CHAT-A', 'CHAT-B']);

      const readiness = readinessFor(state, surfaceId)[surfaceId];
      assert.equal(readiness.readiness_mode, 'docs-only');
      assert.deepEqual(readiness.allowed_paths, []);
      assert.deepEqual(readiness.forbidden_paths, [implementationPath]);
      assert.equal(
        Object.hasOwn(state.screens['CHAT-C'].derived, 'shared_surfaces'),
        false,
      );
      assert.equal(
        Object.hasOwn(readinessFor(state)['CHAT-C'], 'delegated_shared_surfaces'),
        false,
      );

      const { result, report } = validateProject(project);
      assert.equal(result.status, 1);
      assert.ok(
        report.errors.some(
          (entry) => entry.check === 3 && entry.message === expectedMessage,
        ),
      );
    });
  }
});

test('entry ownership rejects checkout-dependent absolute and escaping relative paths', () => {
  for (const scenario of [
    {
      name: 'absolute-inside-root',
      entryPath: (project) =>
        path.join(project.root, 'src', 'features', 'x', 'Foo.tsx'),
      code: 'absolute-or-nonportable-path',
      message: (entryPath) =>
        `ScreenSpec screen_entry uses an absolute or nonportable path: ${entryPath}`,
    },
    {
      name: 'absolute-outside-root',
      entryPath: (project) =>
        path.join(path.dirname(project.root), 'outside-project', 'Foo.tsx'),
      code: 'absolute-or-nonportable-path',
      message: (entryPath) =>
        `ScreenSpec screen_entry uses an absolute or nonportable path: ${entryPath}`,
    },
    {
      name: 'traversal-reentry',
      entryPath: (project) =>
        `../${path.basename(project.root)}/src/features/x/Foo.tsx`,
      code: 'invalid-path',
      message: (entryPath) =>
        `ScreenSpec screen_entry must remain project-relative after normalization: ${entryPath}`,
    },
    {
      name: 'windows-drive',
      entryPath: () => String.raw`C:\work\repo\src\features\x\Foo.tsx`,
      code: 'absolute-or-nonportable-path',
      message: (entryPath) =>
        `ScreenSpec screen_entry uses an absolute or nonportable path: ${entryPath}`,
    },
    {
      name: 'windows-drive-relative',
      entryPath: () => String.raw`C:src\features\x\Foo.tsx`,
      code: 'absolute-or-nonportable-path',
      message: (entryPath) =>
        `ScreenSpec screen_entry uses an absolute or nonportable path: ${entryPath}`,
    },
    {
      name: 'windows-drive-relative-traversal',
      entryPath: () => String.raw`c:..\outside\Foo.tsx`,
      code: 'absolute-or-nonportable-path',
      message: (entryPath) =>
        `ScreenSpec screen_entry uses an absolute or nonportable path: ${entryPath}`,
    },
    {
      name: 'windows-unc',
      entryPath: () => String.raw`\\server\share\repo\src\features\x\Foo.tsx`,
      code: 'absolute-or-nonportable-path',
      message: (entryPath) =>
        `ScreenSpec screen_entry uses an absolute or nonportable path: ${entryPath}`,
    },
  ]) {
    withProject((project) => {
      const entryPath = scenario.entryPath(project);
      const implementationPath = 'src/features/x/**';
      const surfaceId = `ENTRY-${scenario.name.toUpperCase()}-INVALID`;
      writeScreen(project.docsDir, 'CHAT-A');
      writeScreen(project.docsDir, 'CHAT-B');
      writeScreen(project.docsDir, 'CHAT-C', { screenEntry: entryPath });
      writeSurface(project.docsDir, surfaceId, { paths: [implementationPath] });

      const { state, inventory } = buildState({
        docsDir: project.docsDir,
        srcDir: project.srcDir,
        date: '2026-07-16',
      });
      const expectedMessage = scenario.message(entryPath);
      assert.deepEqual(
        state.surfaces[surfaceId].derived.path_errors.find(
          (issue) => issue.code === scenario.code,
        ),
        {
          code: scenario.code,
          message: expectedMessage,
          screen_id: 'CHAT-C',
          screen_domain: 'chat',
          entry_kind: 'screen_entry',
          entry_path: entryPath,
          screen_spec_path: 'domains/chat/screens/chat-c/screen-spec.md',
        },
      );
      assert.equal(
        state.surfaces[surfaceId].derived.path_errors.some(
          (issue) =>
            issue.code === 'member-entry-overlap' ||
            issue.code === 'non-member-entry-overlap',
        ),
        false,
      );
      assert.equal(
        inventory.screens.find((row) => row.id === 'CHAT-C').screen_entry,
        entryPath,
      );

      const readiness = readinessFor(state, surfaceId)[surfaceId];
      assert.equal(readiness.readiness_mode, 'docs-only');
      assert.deepEqual(readiness.allowed_paths, []);
      assert.deepEqual(readiness.forbidden_paths, [implementationPath]);

      const { result, report } = validateProject(project);
      assert.equal(result.status, 1);
      assert.ok(
        report.errors.some(
          (entry) => entry.check === 3 && entry.message === expectedMessage,
        ),
      );
    });
  }
});

test('member entry ownership uses the same lexical comparison and retains authored diagnostics', () => {
  withProject((project) => {
    const entryPath = 'src/features/x/../x/Member.tsx';
    const implementationPath = 'src/features/x/**';
    writeScreen(project.docsDir, 'CHAT-A', { screenEntry: entryPath });
    writeScreen(project.docsDir, 'CHAT-B');
    writeSurface(project.docsDir, 'MEMBER-LEXICAL-OVERLAP', {
      paths: [implementationPath],
    });

    const state = buildState({
      docsDir: project.docsDir,
      srcDir: project.srcDir,
      date: '2026-07-16',
    }).state;
    assert.deepEqual(
      state.surfaces['MEMBER-LEXICAL-OVERLAP'].derived.path_errors.find(
        (issue) => issue.code === 'member-entry-overlap',
      ),
      {
        code: 'member-entry-overlap',
        message:
          `implementation path ${implementationPath} overlaps member CHAT-A ` +
          `screen_entry: ${entryPath}`,
        path: implementationPath,
        screen_id: 'CHAT-A',
        entry_kind: 'screen_entry',
        entry_path: entryPath,
      },
    );
    const readiness = readinessFor(state, 'MEMBER-LEXICAL-OVERLAP')[
      'MEMBER-LEXICAL-OVERLAP'
    ];
    assert.equal(readiness.readiness_mode, 'docs-only');
    assert.deepEqual(readiness.allowed_paths, []);
    assert.deepEqual(readiness.forbidden_paths, [implementationPath]);
  });
});

test('duplicate surface IDs and screen/route/nesting identity fields are rejected', () => {
  withProject((project) => {
    writeScreen(project.docsDir, 'CHAT-A');
    writeScreen(project.docsDir, 'CHAT-B');
    writeSurface(project.docsDir, 'DUP-SURFACE', {
      slug: 'first',
      paths: ['src/features/chat/components/first/**'],
      extraFrontmatter: 'route: /not-a-screen\nscreen_id: CHAT-A\nmember_surfaces: [OTHER]\n',
    });
    writeSurface(project.docsDir, 'DUP-SURFACE', {
      slug: 'second',
      paths: ['src/features/chat/components/second/**'],
    });
    const state = buildState({
      docsDir: project.docsDir,
      srcDir: project.srcDir,
      date: '2026-07-15',
    }).state;
    assert.ok(
      state.surfaces['DUP-SURFACE'].derived.identity_errors.some(
        (issue) => issue.code === 'duplicate-surface-id',
      ),
    );
    assert.equal(
      readinessFor(state, 'DUP-SURFACE')['DUP-SURFACE'].readiness_mode,
      'docs-only',
    );
    const { report } = validateProject(project);
    assert.ok(
      report.errors.some(
        (entry) => entry.check === 5 && /surface_id is globally duplicated/.test(entry.message),
      ),
    );
    assert.ok(
      report.errors.filter((entry) => entry.check === 2).some(
        (entry) => /must not declare (route|screen_id|member_surfaces)/.test(entry.message),
      ),
    );
  });
});

test('multiple non-overlapping surfaces per screen work; duplicate fan-out through screen/surface or two surfaces is rejected', () => {
  withProject((project) => {
    writeScreen(project.docsDir, 'CHAT-A', { refs: ['D-SHARED'] });
    writeScreen(project.docsDir, 'CHAT-B');
    writeRegister(project.docsDir, [{ id: 'D-SHARED' }]);
    writeSurface(project.docsDir, 'COMPOSER', {
      paths: ['src/features/chat/components/composer/**'],
      refs: ['D-SHARED'],
    });
    writeSurface(project.docsDir, 'ATTACHMENTS', {
      paths: ['src/features/chat/components/attachments/**'],
      refs: ['D-SHARED'],
    });

    const state = buildState({
      docsDir: project.docsDir,
      srcDir: project.srcDir,
      date: '2026-07-15',
    }).state;
    assert.deepEqual(
      state.screens['CHAT-A'].derived.shared_surfaces.map((entry) => entry.surface_id),
      ['ATTACHMENTS', 'COMPOSER'],
    );
    assert.ok(
      state.screens['CHAT-A'].derived.malformed_decisions.some(
        (row) => row.code === 'duplicate-referrer',
      ),
    );
    assert.equal(readinessFor(state)['CHAT-A'].readiness_mode, 'docs-only');
    const { report } = validateProject(project);
    assert.ok(
      report.errors.some(
        (entry) => entry.check === 9 && /여러 referrer 경로로 중복 적용/.test(entry.message),
      ),
    );
  });

  withProject((project) => {
    writeScreen(project.docsDir, 'CHAT-A');
    writeScreen(project.docsDir, 'CHAT-B');
    writeRegister(project.docsDir, [{ id: 'D-SURFACES' }]);
    writeSurface(project.docsDir, 'COMPOSER', {
      paths: ['src/features/chat/components/composer/**'],
      refs: ['D-SURFACES'],
    });
    writeSurface(project.docsDir, 'ATTACHMENTS', {
      paths: ['src/features/chat/components/attachments/**'],
      refs: ['D-SURFACES'],
    });
    const state = buildState({
      docsDir: project.docsDir,
      srcDir: project.srcDir,
      date: '2026-07-15',
    }).state;
    assert.deepEqual(state.surfaces.COMPOSER.derived.path_errors, []);
    assert.deepEqual(state.surfaces.ATTACHMENTS.derived.path_errors, []);
    for (const surfaceId of ['COMPOSER', 'ATTACHMENTS']) {
      assert.ok(
        state.surfaces[surfaceId].derived.decision_fanout_errors.some(
          (issue) => issue.code === 'duplicate-referrer',
        ),
      );
    }
    assert.equal(readinessFor(state)['CHAT-A'].readiness_mode, 'docs-only');
    const { report } = validateProject(project);
    assert.ok(
      report.errors.some(
        (entry) => entry.check === 9 && /여러 referrer 경로로 중복 적용/.test(entry.message),
      ),
    );
  });
});

test('absent implementation_paths is documentation-valid but grants no code path', () => {
  withProject(({ docsDir, srcDir }) => {
    writeScreen(docsDir, 'CHAT-A');
    writeScreen(docsDir, 'CHAT-B');
    writeSurface(docsDir, 'DOCS-ONLY-SURFACE', { paths: null });
    const state = buildState({ docsDir, srcDir, date: '2026-07-15' }).state;
    const result = readinessFor(state, 'DOCS-ONLY-SURFACE')['DOCS-ONLY-SURFACE'];
    assert.deepEqual(result.allowed_paths, []);
    assert.deepEqual(result.forbidden_paths, []);
    assert.ok(result.next_actions.some((action) => /declare narrow implementation_paths/.test(action)));
  });
});

test('surface mode is capped by the least-ready member and declared paths require every member policy intersection', () => {
  withProject(({ docsDir, srcDir }) => {
    writeScreen(docsDir, 'CHAT-A');
    writeScreen(docsDir, 'CHAT-B');
    writeSurface(docsDir, 'CHAT-COMPOSER');
    const state = fullyReady(buildState({ docsDir, srcDir, date: '2026-07-15' }).state);
    state.screens['CHAT-B'].status = 'draft';
    state.screens['CHAT-B'].stub = true;
    state.screens['CHAT-B'].derived.fake_hook_exists = false;
    const result = computeReadiness({
      state,
      policy: loadYaml(DEFAULTS.policy),
      manifest: loadYaml(DEFAULTS.manifest),
      ci: CI,
      surfaceOnlyId: 'CHAT-COMPOSER',
    })['CHAT-COMPOSER'];
    assert.equal(result.surface_fact_mode, 'production-ready');
    assert.equal(result.member_cap, 'screen-skeleton');
    assert.equal(result.readiness_mode, 'screen-skeleton');
    assert.deepEqual(result.limiting_members, ['CHAT-B']);
    assert.deepEqual(result.allowed_paths, []);
    assert.deepEqual(result.forbidden_paths, ['src/features/chat/components/composer/**']);
    assert.ok(
      result.path_authorization[0].causes.some(
        (cause) => cause.kind === 'member-policy-coverage' && cause.screen_id === 'CHAT-B',
      ),
    );
  });
});

test('surface validation reuses API/Copy checks and hard-rejects v1, route rows, and local Open Decisions', () => {
  withProject((project) => {
    writeScreen(project.docsDir, 'CHAT-A');
    writeScreen(project.docsDir, 'CHAT-B');
    const invalidBody = `
# Invalid

## Purpose
Authored.

## Interaction Matrix
| User Action | Trigger | Result | Result Type | Target | Params | Analytics Event |
|---|---|---|---|---|---|---|
| Open | click | navigate | route | /chat-a | - | - |

## API Candidates
- GET /messages (confidence: confirmed)

## Copy Keys
| Key | 문구 | Status |
|---|---|---|
| composer.bad | Bad | invented |

## Open Decisions
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-LOCAL | Choose | A / B | final-fixture-ui | PM | open |
`;
    writeSurface(project.docsDir, 'INVALID-SURFACE', { body: invalidBody });
    const { report } = validateProject(project);
    const errors = report.errors;
    assert.ok(errors.some((entry) => entry.check === 4 && /Result Type=route/.test(entry.message)));
    assert.ok(errors.some((entry) => entry.check === 8 && /confirmed API/.test(entry.message)));
    assert.ok(errors.some((entry) => entry.check === 9 && /local ## Open Decisions/.test(entry.message)));
    assert.ok(errors.some((entry) => entry.check === 10 && /invented/.test(entry.message)));
  });

  withProject((project) => {
    writeScreen(project.docsDir, 'CHAT-A');
    writeScreen(project.docsDir, 'CHAT-B');
    writeSurface(project.docsDir, 'V1-SURFACE', {
      body: `\n# V1\n\n## Purpose\nAuthored.\n\n## Interaction Matrix\n| User Action | Trigger | Result | Analytics Event |\n|---|---|---|---|\n| Type | input | draft | - |\n`,
    });
    const { report } = validateProject(project);
    assert.ok(
      report.errors.some(
        (entry) => entry.check === 4 && /must use v2 columns/.test(entry.message),
      ),
    );
  });
});

test('frontmatter schema minItems and path syntax helpers enforce the surface contract', () => {
  const schema = JSON.parse(fs.readFileSync(DEFAULTS.schema, 'utf8'));
  const base = {
    artifact_id: 'COMPOSER-shared-surface-spec',
    artifact_type: 'shared-surface-spec',
    surface_id: 'COMPOSER',
    member_screens: ['CHAT-A'],
    status: 'draft',
  };
  assert.ok(validateSchema(base, schema).some((message) => /minItems/.test(message)));
  assert.deepEqual(
    validateSchema({ ...base, member_screens: ['CHAT-A', 'CHAT-B'] }, schema),
    [],
  );
  assert.equal(implementationPathIssues('src/features/chat/composer/**').length, 0);
  assert.ok(implementationPathIssues('/tmp/composer/**').length > 0);
  for (const driveRelativePath of [
    'C:src/features/x/**',
    'c:../outside/**',
  ]) {
    assert.ok(
      implementationPathIssues(driveRelativePath).some(
        (issue) => issue.code === 'absolute-or-nonportable-path',
      ),
    );
  }
  assert.ok(implementationPathIssues('src/**').some((issue) => issue.code === 'broad-wildcard'));
  assert.ok(
    implementationPathIssues('docs/frontend-workflow/_meta/**').some(
      (issue) => issue.code === 'workflow-output-path',
    ),
  );
});

test('--surface CLI is strict, mutually exclusive, help-before-I/O, and returns keyed output', () => {
  const help = spawnSync(process.execPath, [READINESS, '--help'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--surface <id>/);

  for (const args of [
    ['--surface', ' '],
    ['--surface', 'bad/id'],
    ['--screen', 'CHAT-A', '--surface', 'COMPOSER'],
  ]) {
    const result = spawnSync(process.execPath, [READINESS, ...args], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(result.status, 2, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    assert.doesNotMatch(result.stderr, /workflow-state.*없음/);
  }

  withProject(({ docsDir, srcDir }) => {
    writeScreen(docsDir, 'CHAT-A');
    writeScreen(docsDir, 'CHAT-B');
    writeSurface(docsDir, 'COMPOSER');
    const stateResult = spawnSync(
      process.execPath,
      [STATE, '--docs', docsDir, '--src', srcDir, '--date', '2026-07-15'],
      { encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(stateResult.status, 0, stateResult.stderr);
    const readiness = spawnSync(
      process.execPath,
      [READINESS, '--docs', docsDir, '--surface', 'COMPOSER', '--json'],
      { encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(readiness.status, 0, readiness.stderr);
    assert.deepEqual(Object.keys(JSON.parse(readiness.stdout)), ['COMPOSER']);

    const missingPrototypeName = spawnSync(
      process.execPath,
      [READINESS, '--docs', docsDir, '--surface', 'constructor', '--json'],
      { encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(missingPrototypeName.status, 0, missingPrototypeName.stderr);
    assert.deepEqual(JSON.parse(missingPrototypeName.stdout), {});

    const missingPrototypeScreen = spawnSync(
      process.execPath,
      [READINESS, '--docs', docsDir, '--screen', 'constructor', '--json'],
      { encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(missingPrototypeScreen.status, 0, missingPrototypeScreen.stderr);
    assert.deepEqual(JSON.parse(missingPrototypeScreen.stdout), {});
  });
});

test('CLI state YAML to readiness JSON round-trip preserves a constructor surface own record', () => {
  withProject(({ docsDir, srcDir }) => {
    writeScreen(docsDir, 'CHAT-A');
    writeScreen(docsDir, 'CHAT-B');
    writeSurface(docsDir, 'constructor');

    const stateResult = spawnSync(
      process.execPath,
      [STATE, '--docs', docsDir, '--src', srcDir, '--date', '2026-07-15'],
      { encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(stateResult.status, 0, stateResult.stderr);
    const generatedState = loadYaml(
      path.join(docsDir, '_meta', 'workflow-state.yaml'),
    );
    assert.equal(Object.hasOwn(generatedState.surfaces, 'constructor'), true);

    const readiness = spawnSync(
      process.execPath,
      [READINESS, '--docs', docsDir, '--surface', 'constructor', '--json'],
      { encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(readiness.status, 0, readiness.stderr);
    const result = JSON.parse(readiness.stdout);
    assert.equal(Object.hasOwn(result, 'constructor'), true);
    assert.equal(result.constructor.readiness_mode, 'docs-only');
    assert.deepEqual(result.constructor.member_modes.map((row) => row.screen_id), [
      'CHAT-A',
      'CHAT-B',
    ]);
  });
});

test('custom docs, src, root, and layout stay aligned across surface state, readiness, and validate CLIs', () => {
  withProject(({ root, docsDir, srcDir }) => {
    writeScreen(docsDir, 'CHAT-A');
    writeScreen(docsDir, 'CHAT-B');
    writeSurface(docsDir, 'CUSTOM-COMPOSER', {
      paths: ['src/shared/chat/composer/**'],
    });
    const layoutPath = path.join(root, 'project-layout.yaml');
    fs.writeFileSync(
      layoutPath,
      `version: 1\npreset: expo-feature\nroles:\n  domain_component: src/shared/{domain}/**\n`,
      'utf8',
    );

    const stateResult = spawnSync(
      process.execPath,
      [
        STATE,
        '--docs',
        docsDir,
        '--src',
        srcDir,
        '--root',
        root,
        '--layout',
        layoutPath,
        '--date',
        '2026-07-15',
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(stateResult.status, 0, stateResult.stderr);

    const readiness = spawnSync(
      process.execPath,
      [
        READINESS,
        '--docs',
        docsDir,
        '--layout',
        layoutPath,
        '--surface',
        'CUSTOM-COMPOSER',
        '--json',
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(readiness.status, 0, readiness.stderr);
    const readinessJson = JSON.parse(readiness.stdout)['CUSTOM-COMPOSER'];
    assert.deepEqual(readinessJson.forbidden_paths, ['src/shared/chat/composer/**']);
    assert.equal(readinessJson.path_authorization[0].path, 'src/shared/chat/composer/**');

    const validation = spawnSync(
      process.execPath,
      [
        VALIDATE,
        '--docs',
        docsDir,
        '--src',
        srcDir,
        '--root',
        root,
        '--layout',
        layoutPath,
        '--manifest',
        DEFAULTS.manifest,
        '--schema',
        DEFAULTS.schema,
        '--policy',
        DEFAULTS.policy,
        '--json',
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
    assert.ok([0, 1].includes(validation.status), validation.stderr);
    const report = JSON.parse(validation.stdout);
    assert.equal(
      report.errors.some((entry) => /CUSTOM-COMPOSER|src\/shared\/chat\/composer/.test(entry.message)),
      false,
    );
  });
});

test('a repository with no surface keeps the state shape free of surfaces and screen delegation fields', () => {
  withProject(({ docsDir, srcDir }) => {
    writeScreen(docsDir, 'CHAT-A');
    const state = buildState({ docsDir, srcDir, date: '2026-07-15' }).state;
    assert.equal(Object.prototype.hasOwnProperty.call(state, 'surfaces'), false);
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        state.screens['CHAT-A'].derived,
        'shared_surfaces',
      ),
      false,
    );
    const readiness = computeReadiness({
      state,
      policy: loadYaml(DEFAULTS.policy),
      manifest: loadYaml(DEFAULTS.manifest),
      ci: {},
    });
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        readiness['CHAT-A'],
        'delegated_shared_surfaces',
      ),
      false,
    );
  });
});
