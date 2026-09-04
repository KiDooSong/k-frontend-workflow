import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import { KIT_ROOT } from './util.mjs';
import {
  analyzeSupersessionComponent,
  canonicalAuthorityPath,
  routeVisualBackstopRecords,
  visualImplementationAuthorization,
} from './visual-refresh-runtime.mjs';
import {
  materializeGitTree,
  resolveVisualDiffContext,
  VisualRefreshGitError,
} from './visual-refresh-git.mjs';

const READINESS = path.join(KIT_ROOT, 'scripts', 'readiness.mjs');
const READINESS_LEGACY = path.join(KIT_ROOT, 'scripts', 'readiness-legacy.mjs');
const BACKSTOP = path.join(KIT_ROOT, 'scripts', 'forbidden-paths.mjs');
const BACKSTOP_LEGACY = path.join(KIT_ROOT, 'scripts', 'forbidden-paths-legacy.mjs');

function run(file, args, cwd = KIT_ROOT) {
  return spawnSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8' });
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function input(file, inputId, supersedes = null) {
  return { file, fm: { input_id: inputId, supersedes } };
}

function summary(inputId, supersedes = null) {
  return { inputId, supersedes };
}

function roleLayout() {
  return {
    resolvePaths(tokens) {
      if (tokens[0] === '{roles.screen}') return ['src/features/shop/screens/**'];
      return [];
    },
  };
}

function apiStageEntry(overrides = {}) {
  return {
    readiness_mode: 'api-integrated-ui',
    allowed_paths: ['src/features/shop/hooks/**', 'src/api/**'],
    forbidden_paths: ['src/features/shop/screens/**'],
    delegated_shared_surfaces: [],
    __mode_order: [
      'contract-mocked-ui',
      'rough-fixture-ui',
      'final-fixture-ui',
      'api-integrated-ui',
      'production-ready',
    ],
    ...overrides,
  };
}

function routingAuthority(overrides = {}) {
  return {
    intent_authorization: { applicable: true },
    _context: {
      authorized_path: 'src/features/shop/screens/ShopScreen.tsx',
      selected_input_path:
        'docs/frontend-workflow/inputs/shop/IN-20260904-figma-001.md',
      selected_input_existed_at_source: false,
      register_path: 'docs/frontend-workflow/_meta/reconciliation-register.md',
      mapping_path:
        'docs/frontend-workflow/domains/shop/screens/shop/figma-component-mapping.md',
      screen_spec_path:
        'docs/frontend-workflow/domains/shop/screens/shop/screen-spec.md',
      visual_path_authorization: { allowed: true },
      generated_entries: [],
      generated_roots: [],
      candidate_claims: { active: [], denied: [] },
      selected_screen: 'SHOP-HOME',
      readiness: {
        readiness_mode: 'final-fixture-ui',
        allowed_paths: ['src/features/shop/**'],
        forbidden_paths: [],
        __mode_order: [
          'contract-mocked-ui',
          'rough-fixture-ui',
          'final-fixture-ui',
          'api-integrated-ui',
          'production-ready',
        ],
      },
      ...overrides,
    },
  };
}

function route(records, authority = routingAuthority()) {
  return routeVisualBackstopRecords({ records, authority, projectPrefix: '' });
}

test('authority paths require one canonical worktree-relative concrete path', () => {
  assert.equal(
    canonicalAuthorityPath('src/features/shop/screens/ShopScreen.tsx'),
    'src/features/shop/screens/ShopScreen.tsx',
  );
  for (const invalid of [
    '',
    '.',
    '../outside.ts',
    'src/../outside.ts',
    './src/file.ts',
    '/etc/passwd',
    'C:/src/file.ts',
    'src/**/*.tsx',
    'src\\file.ts',
    'src/file.ts/',
  ]) {
    assert.throws(() => canonicalAuthorityPath(invalid), undefined, invalid);
  }
});

test('supersession accepts one acyclic component with the selected input as sole leaf', () => {
  const first = 'IN-20260901-figma-001';
  const selected = 'IN-20260904-figma-002';
  const result = analyzeSupersessionComponent({
    inputArtifacts: [input('/first.md', first), input('/selected.md', selected, first)],
    registerRows: [summary(first), summary(selected, first)],
    selectedInputId: selected,
  });
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.componentIds, [first, selected]);
  assert.equal(result.selectedArtifact.file, '/selected.md');
});

test('supersession fails closed for observation mismatch, fork, duplicate identity, and cycle', () => {
  const a = 'IN-20260901-figma-001';
  const b = 'IN-20260902-figma-002';
  const c = 'IN-20260903-figma-003';

  const mismatch = analyzeSupersessionComponent({
    inputArtifacts: [input('/a.md', a), input('/b.md', b, a)],
    registerRows: [summary(a), summary(b, null)],
    selectedInputId: b,
  });
  assert.ok(mismatch.reasons.some((entry) => entry.code === 'VR-SUPER-004'));

  const fork = analyzeSupersessionComponent({
    inputArtifacts: [input('/a.md', a), input('/b.md', b, a), input('/c.md', c, a)],
    registerRows: [summary(a), summary(b, a), summary(c, a)],
    selectedInputId: b,
  });
  assert.ok(fork.reasons.some((entry) => entry.code === 'VR-SUPER-006'));
  assert.ok(fork.reasons.some((entry) => entry.code === 'VR-SUPER-007'));

  const duplicate = analyzeSupersessionComponent({
    inputArtifacts: [input('/a.md', a), input('/b-1.md', b, a), input('/b-2.md', b, a)],
    registerRows: [summary(a), summary(b, a)],
    selectedInputId: b,
  });
  assert.ok(duplicate.reasons.some((entry) => entry.code === 'VR-SUPER-001'));

  const cycle = analyzeSupersessionComponent({
    inputArtifacts: [input('/a.md', a, b), input('/b.md', b, a)],
    registerRows: [summary(a, b), summary(b, a)],
    selectedInputId: b,
  });
  assert.ok(cycle.reasons.some((entry) => entry.code === 'VR-SUPER-008'));
});

test('only the canonical built-in API-stage screen deny may be waived', () => {
  const common = {
    file: 'src/features/shop/screens/ShopScreen.tsx',
    authorizedPath: 'src/features/shop/screens/ShopScreen.tsx',
    selectedScreen: 'SHOP-HOME',
    readiness: apiStageEntry(),
    layout: roleLayout(),
    domain: 'shop',
    generated: null,
    claims: { active: [], denied: [] },
    logicalRules: [
      {
        rule_id: 'policy:api-integrated-ui:deny:0:0',
        source: 'bundled:policies/implementation-mode-policy.yaml',
        authored_path: '{roles.screen}',
        resolved_path: 'src/features/shop/screens/**',
        disposition: 'deny',
        origin: 'implementation-mode-policy',
        scope: 'screen',
        mode: 'api-integrated-ui',
        role: 'screen',
        waivable_visual_refresh_api_stage_screen_deny: true,
      },
    ],
  };

  const builtIn = visualImplementationAuthorization({
    ...common,
    canonicalBuiltIn: true,
  });
  assert.equal(builtIn.allowed, true);
  assert.equal(builtIn.grant, 'visual-refresh-canonical-api-stage-screen-waiver');

  const custom = visualImplementationAuthorization({
    ...common,
    canonicalBuiltIn: false,
  });
  assert.equal(custom.allowed, false);

  const shared = visualImplementationAuthorization({
    ...common,
    canonicalBuiltIn: true,
    readiness: apiStageEntry({
      delegated_shared_surfaces: [
        {
          surface_id: 'SURFACE-SHOP',
          implementation_paths: ['src/features/shop/screens/**'],
        },
      ],
    }),
  });
  assert.equal(shared.allowed, false);
  assert.match(shared.reason, /delegated to shared surface/);

  const generated = visualImplementationAuthorization({
    ...common,
    canonicalBuiltIn: true,
    generated: { artifact_id: 'generated-screen', path: common.file },
  });
  assert.equal(generated.allowed, false);
  assert.match(generated.reason, /generated\/do-not-edit/);
});

test('visual record router grants exact screen M and narrow authority authoring operations only', () => {
  assert.deepEqual(
    route([{ status: 'M', path: 'src/features/shop/screens/ShopScreen.tsx', raw: 'M' }])
      .violations,
    [],
  );
  assert.deepEqual(
    route([
      {
        status: 'A',
        path: 'docs/frontend-workflow/inputs/shop/IN-20260904-figma-001.md',
        raw: 'A',
      },
      {
        status: 'M',
        path: 'docs/frontend-workflow/_meta/reconciliation-register.md',
        raw: 'M',
      },
      {
        status: 'A',
        path:
          'docs/frontend-workflow/domains/shop/screens/shop/figma-component-mapping.md',
        raw: 'A',
      },
    ]).violations,
    [],
  );

  const addScreen = route([
    { status: 'A', path: 'src/features/shop/screens/ShopScreen.tsx', raw: 'A' },
  ]);
  assert.ok(addScreen.violations.some((entry) => entry.code === 'VR-BACKSTOP-004'));

  const deleteScreen = route([
    { status: 'D', path: 'src/features/shop/screens/ShopScreen.tsx', raw: 'D' },
  ]);
  assert.ok(deleteScreen.violations.some((entry) => entry.code === 'VR-BACKSTOP-004'));

  const renameRegister = route([
    {
      status: 'R',
      oldPath: 'docs/frontend-workflow/_meta/reconciliation-register.md',
      newPath: 'docs/frontend-workflow/_meta/register.md',
      raw: 'R100',
    },
  ]);
  assert.ok(renameRegister.violations.some((entry) => entry.code === 'VR-BACKSTOP-006'));

  const screenSpec = route([
    {
      status: 'M',
      path: 'docs/frontend-workflow/domains/shop/screens/shop/screen-spec.md',
      raw: 'M',
    },
  ]);
  assert.ok(screenSpec.violations.some((entry) => entry.code === 'VR-BACKSTOP-009'));

  const unclassified = route([{ status: 'M', path: 'README.md', raw: 'M' }]);
  assert.ok(unclassified.violations.some((entry) => entry.code === 'VR-BACKSTOP-007'));
});

test('existing selected input and generated outputs remain final denies', (t) => {
  const existing = route(
    [
      {
        status: 'M',
        path: 'docs/frontend-workflow/inputs/shop/IN-20260904-figma-001.md',
        raw: 'M',
      },
    ],
    routingAuthority({ selected_input_existed_at_source: true }),
  );
  assert.ok(existing.violations.some((entry) => entry.code === 'VR-BACKSTOP-005'));

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-refresh-generated-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const generatedPath = path.join(root, 'src', 'features', 'shop', 'screens', 'ShopScreen.tsx');
  fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
  fs.writeFileSync(generatedPath, '// GENERATED FILE - DO NOT EDIT\n', 'utf8');
  const generated = route(
    [{ status: 'M', path: 'src/features/shop/screens/ShopScreen.tsx', raw: 'M' }],
    routingAuthority({
      generated_entries: [
        {
          owner_id: 'generated:generated-screen:0',
          artifact_id: 'generated-screen',
          pattern: 'src/features/shop/screens/ShopScreen.tsx',
          status: 'active',
          do_not_edit: true,
          origin: 'artifact-manifest+generated-header',
        },
      ],
      generated_roots: [{ kind: 'destination', root }],
    }),
  );
  assert.ok(generated.violations.some((entry) => entry.code === 'VR-BACKSTOP-003'));
});

test('staged resolver binds records and both immutable trees in one result', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-refresh-git-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(root, 'screen.tsx'), 'before\n', 'utf8');
  git(root, 'add', 'screen.tsx');
  git(root, 'commit', '-m', 'initial');
  fs.writeFileSync(path.join(root, 'screen.tsx'), 'after\n', 'utf8');
  git(root, 'add', 'screen.tsx');

  const resolved = resolveVisualDiffContext({ repositoryRoot: root, staged: true });
  assert.equal(resolved.diff_kind, 'staged');
  assert.notEqual(resolved.source_tree, resolved.destination_tree);
  assert.deepEqual(
    resolved.records.map((record) => [record.status, record.path]),
    [['M', 'screen.tsx']],
  );

  const source = materializeGitTree({ repositoryRoot: root, tree: resolved.source_tree });
  const destination = materializeGitTree({
    repositoryRoot: root,
    tree: resolved.destination_tree,
  });
  t.after(() => source.cleanup());
  t.after(() => destination.cleanup());
  assert.equal(fs.readFileSync(path.join(source.root, 'screen.tsx'), 'utf8'), 'before\n');
  assert.equal(
    fs.readFileSync(path.join(destination.root, 'screen.tsx'), 'utf8'),
    'after\n',
  );
});

test('diff context rejects ambiguous modes, malformed ranges, and repositories without HEAD', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-refresh-empty-git-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init');

  assert.throws(
    () => resolveVisualDiffContext({ repositoryRoot: root, staged: true, base: 'main' }),
    VisualRefreshGitError,
  );
  assert.throws(
    () => resolveVisualDiffContext({ repositoryRoot: root, range: 'main' }),
    VisualRefreshGitError,
  );
  assert.throws(
    () => resolveVisualDiffContext({ repositoryRoot: root, staged: true }),
    VisualRefreshGitError,
  );
});

test('no-intent wrappers preserve legacy stdout, stderr, and exit status', () => {
  for (const [wrapper, legacy] of [
    [READINESS, READINESS_LEGACY],
    [BACKSTOP, BACKSTOP_LEGACY],
  ]) {
    const actual = run(wrapper, ['--help']);
    const expected = run(legacy, ['--help']);
    assert.equal(actual.status, expected.status, wrapper);
    assert.equal(actual.stdout, expected.stdout, wrapper);
    assert.equal(actual.stderr, expected.stderr, wrapper);
  }
});

test('stray visual tuple and unsupported visual --diff fail as usage errors', () => {
  const stray = run(READINESS, ['--input', 'IN-20260904-figma-001']);
  assert.equal(stray.status, 2);
  assert.match(stray.stderr, /--input requires --intent visual-refresh/);

  const unsupported = run(BACKSTOP, [
    '--screen',
    'SHOP-HOME',
    '--intent',
    'visual-refresh',
    '--input',
    'IN-20260904-figma-001',
    '--path',
    'src/features/shop/screens/ShopScreen.tsx',
    '--diff',
    'changes.diff',
  ]);
  assert.equal(unsupported.status, 2);
  assert.match(unsupported.stderr, /does not support --diff|지원하지 않음/);
});
