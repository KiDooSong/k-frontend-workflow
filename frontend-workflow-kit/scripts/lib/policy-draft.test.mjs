import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DRAFT_POLICY_FILENAME,
  MIGRATION_GUIDE_FILENAME,
  buildPolicyDraft,
  draftPolicyText,
  renderMigrationGuide,
} from './policy-draft.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { loadYaml } from './util.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = path.resolve(HERE, '..', '..');
const CLI = path.join(KIT_ROOT, 'scripts', 'policy-draft.mjs');
const LIVE_POLICY = path.join(KIT_ROOT, 'policies', 'implementation-mode-policy.yaml');

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function samplePolicy() {
  return {
    version: 1,
    order: ['docs-only', 'rough-fixture-ui', 'final-fixture-ui', 'api-integrated-ui'],
    modes: {
      'docs-only': {
        requires: [],
        allowed_paths: ['docs/frontend-workflow/**'],
        forbidden_paths: ['src/**'],
      },
      'rough-fixture-ui': {
        requires: ['screen_spec_status >= draft'],
        allowed_paths: ['{roles.screen}', 'openapi.yaml'],
        forbidden_paths: ['{roles.api_client}'],
      },
      'final-fixture-ui': {
        requires: ['screen_spec_status >= confirmed'],
        allowed_paths: ['{roles.screen}', 'openapi.yml', '{roles.hook}'],
        forbidden_paths: [],
      },
      'api-integrated-ui': {
        requires: [],
        allowed_paths: ['{roles.hook}', '{roles.api_client}'],
        forbidden_paths: ['{roles.screen}'],
      },
    },
  };
}

test('buildPolicyDraft keeps default expo policy parity and is deterministic', () => {
  const layout = loadLayoutProfile({ kitRoot: KIT_ROOT });
  const policy = loadYaml(LIVE_POLICY);
  const first = buildPolicyDraft({ policy, layout, date: '2026-06-23' });
  const second = buildPolicyDraft({ policy, layout, date: '2026-06-23' });

  assert.deepEqual(first.draftPolicy, policy);
  assert.deepEqual(second.draftPolicy, policy);
  assert.equal(draftPolicyText(first.draftPolicy, { date: '2026-06-23' }), draftPolicyText(second.draftPolicy, { date: '2026-06-23' }));
  assert.equal(first.diff.differs, false);
  assert.equal(first.diff.changed_mode_access_rows.length, 0);
});

test('buildPolicyDraft preserves literals while replacing layer-derived access cells', () => {
  const policy = samplePolicy();
  const layout = {
    roles: {
      screen: 'src/features/{domain}/screens/**',
      hook: 'src/features/{domain}/hooks/**',
      api_client: 'src/api/**',
    },
    layers: [
      {
        role: 'screen',
        glob: 'src/features/{domain}/screens/**',
        fact: 'dir_has_files',
        access: { allow: ['rough-fixture-ui', 'final-fixture-ui'], forbid: ['api-integrated-ui'] },
      },
      {
        role: 'hook',
        glob: 'src/features/{domain}/hooks/**',
        fact: 'dir_has_files',
        access: { allow: ['api-integrated-ui'], forbid: [] },
      },
      {
        role: 'api_client',
        glob: 'src/api/**',
        fact: 'dir_has_files',
        access: { allow: ['api-integrated-ui'], forbid: ['rough-fixture-ui'] },
      },
    ],
  };

  const result = buildPolicyDraft({ policy, layout, date: '2026-06-23' });

  assert.deepEqual(result.draftPolicy.modes['final-fixture-ui'].allowed_paths, [
    '{roles.screen}',
    'openapi.yml',
  ]);
  assert.deepEqual(result.draftPolicy.modes['rough-fixture-ui'].allowed_paths, [
    '{roles.screen}',
    'openapi.yaml',
  ]);
  assert.ok(result.diff.removed_paths.some((row) => row.mode === 'final-fixture-ui' && row.path === '{roles.hook}'));
  assert.equal(result.draftPolicy.modes['docs-only'].forbidden_paths.includes('src/**'), true);
});

test('buildPolicyDraft adds custom explicit globs without custom role tokens', () => {
  const policy = samplePolicy();
  const layout = {
    roles: {
      screen: 'src/features/{domain}/screens/**',
      hook: 'src/features/{domain}/hooks/**',
      api_client: 'src/api/**',
    },
    layers: [
      {
        role: 'screen',
        glob: 'src/features/{domain}/screens/**',
        fact: 'dir_has_files',
        access: { allow: ['rough-fixture-ui', 'final-fixture-ui'], forbid: ['api-integrated-ui'] },
      },
      {
        role: 'hook',
        glob: 'src/features/{domain}/hooks/**',
        fact: 'dir_has_files',
        access: { allow: ['api-integrated-ui'], forbid: [] },
      },
      {
        role: 'api_client',
        glob: 'src/api/**',
        fact: 'dir_has_files',
        access: { allow: ['api-integrated-ui'], forbid: ['rough-fixture-ui'] },
      },
      {
        role: 'view_model',
        glob: 'src/presentation/{domain}/viewmodels/**',
        fact: 'dir_has_files',
        access: { allow: ['rough-fixture-ui', 'final-fixture-ui'], forbid: ['api-integrated-ui'] },
      },
      {
        role: 'repository',
        glob: ['src/domain/{domain}/repositories/**', 'src/data/{domain}/repositories/**'],
        fact: 'dir_has_files',
        access: { allow: ['api-integrated-ui'], forbid: [] },
      },
    ],
  };

  const result = buildPolicyDraft({ policy, layout, date: '2026-06-23' });

  assert.deepEqual(result.draftPolicy.modes['rough-fixture-ui'].allowed_paths, [
    '{roles.screen}',
    'openapi.yaml',
    'src/presentation/{domain}/viewmodels/**',
  ]);
  assert.deepEqual(result.draftPolicy.modes['api-integrated-ui'].allowed_paths, [
    '{roles.hook}',
    '{roles.api_client}',
    'src/domain/{domain}/repositories/**',
    'src/data/{domain}/repositories/**',
  ]);
  assert.deepEqual(result.draftPolicy.modes['api-integrated-ui'].forbidden_paths, [
    '{roles.screen}',
    'src/presentation/{domain}/viewmodels/**',
  ]);
  assert.equal(
    JSON.stringify(result.draftPolicy).includes('{roles.view_model}') || JSON.stringify(result.draftPolicy).includes('{roles.repository}'),
    false,
  );
});

test('buildPolicyDraft keeps literal guards when custom layer globs collide', () => {
  const policy = {
    version: 1,
    order: ['docs-only', 'screen-skeleton', 'rough-fixture-ui', 'api-integrated-ui'],
    modes: {
      'docs-only': {
        requires: [],
        allowed_paths: ['docs/frontend-workflow/**'],
        forbidden_paths: ['src/**'],
      },
      'screen-skeleton': {
        requires: [],
        allowed_paths: ['{roles.screen}'],
        forbidden_paths: ['{roles.api_client}', 'openapi.yaml'],
      },
      'rough-fixture-ui': {
        requires: [],
        allowed_paths: ['{roles.screen}'],
        forbidden_paths: ['{roles.api_client}', 'openapi.yaml'],
      },
      'api-integrated-ui': {
        requires: [],
        allowed_paths: ['{roles.api_client}'],
        forbidden_paths: ['{roles.screen}'],
      },
    },
  };
  const layout = {
    roles: {
      screen: 'src/features/{domain}/screens/**',
      api_client: 'src/api/**',
    },
    layers: [
      {
        role: 'screen',
        glob: 'src/features/{domain}/screens/**',
        fact: 'dir_has_files',
        access: { allow: ['screen-skeleton', 'rough-fixture-ui'], forbid: ['api-integrated-ui'] },
      },
      {
        role: 'api_client',
        glob: 'src/api/**',
        fact: 'dir_has_files',
        access: { allow: ['api-integrated-ui'], forbid: ['screen-skeleton', 'rough-fixture-ui'] },
      },
      {
        role: 'custom_source',
        glob: 'src/**',
        fact: 'dir_has_files',
        access: { allow: ['api-integrated-ui'], forbid: [] },
      },
      {
        role: 'contract_file',
        glob: 'openapi.yaml',
        fact: 'file_exists',
        access: { allow: ['api-integrated-ui'], forbid: [] },
      },
    ],
  };

  const result = buildPolicyDraft({ policy, layout, date: '2026-06-23' });

  assert.deepEqual(result.draftPolicy.modes['docs-only'].forbidden_paths, ['src/**']);
  assert.deepEqual(result.draftPolicy.modes['screen-skeleton'].forbidden_paths, [
    '{roles.api_client}',
    'openapi.yaml',
  ]);
  assert.deepEqual(result.draftPolicy.modes['rough-fixture-ui'].forbidden_paths, [
    '{roles.api_client}',
    'openapi.yaml',
  ]);
  assert.deepEqual(result.draftPolicy.modes['api-integrated-ui'].allowed_paths, [
    '{roles.api_client}',
    'src/**',
    'openapi.yaml',
  ]);
  assert.equal(result.diff.removed_paths.some((row) => row.mode === 'docs-only' && row.path === 'src/**'), false);
  assert.equal(result.diff.removed_paths.some((row) => row.path === 'openapi.yaml'), false);
});

test('buildPolicyDraft includes domains.<d>.layers from resolved layouts', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-draft-domain-layers-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const layoutPath = path.join(tmp, 'project-layout.yaml');
  write(
    layoutPath,
    [
      'version: 1',
      'domains:',
      '  profile:',
      '    layers:',
      '      - role: repository',
      '        glob: src/profile-only/repositories/**',
      '        fact: dir_has_files',
      '        access:',
      '          allow: [api-integrated-ui]',
      '',
    ].join('\n'),
  );
  const layout = loadLayoutProfile({ kitRoot: KIT_ROOT, flags: { layout: layoutPath } });
  const policy = {
    version: 1,
    order: ['api-integrated-ui'],
    modes: {
      'api-integrated-ui': {
        requires: [],
        allowed_paths: [],
        forbidden_paths: [],
      },
    },
  };

  const result = buildPolicyDraft({ policy, layout, date: '2026-06-23' });

  assert.deepEqual(Object.keys(layout.domains), ['profile']);
  assert.deepEqual(result.draftPolicy.modes['api-integrated-ui'].allowed_paths, [
    'src/profile-only/repositories/**',
  ]);
  assert.ok(
    result.diff.added_paths.some(
      (row) =>
        row.mode === 'api-integrated-ui' &&
        row.column === 'allowed_paths' &&
        row.path === 'src/profile-only/repositories/**',
    ),
  );
  assert.ok(result.layerRows.some((row) => row.role === 'repository' && row.path === 'src/profile-only/repositories/**'));
});

test('buildPolicyDraft treats domains.<d>.layers as role-level replacement', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-draft-domain-replace-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const layoutPath = path.join(tmp, 'project-layout.yaml');
  write(
    layoutPath,
    [
      'version: 1',
      'layers:',
      '  - role: repository',
      '    glob: src/data/{domain}/repositories/**',
      '    fact: dir_has_files',
      '    access:',
      '      allow: [api-integrated-ui]',
      'domains:',
      '  profile:',
      '    layers:',
      '      - role: repository',
      '        glob: src/profile-only/repositories/**',
      '        fact: dir_has_files',
      '        access:',
      '          allow: [final-fixture-ui]',
      '',
    ].join('\n'),
  );
  const layout = loadLayoutProfile({ kitRoot: KIT_ROOT, flags: { layout: layoutPath } });
  const policy = {
    version: 1,
    order: ['final-fixture-ui', 'api-integrated-ui'],
    modes: {
      'final-fixture-ui': { requires: [], allowed_paths: [], forbidden_paths: [] },
      'api-integrated-ui': { requires: [], allowed_paths: [], forbidden_paths: [] },
    },
  };

  const result = buildPolicyDraft({ policy, layout, date: '2026-06-23' });

  assert.deepEqual(result.draftPolicy.modes['final-fixture-ui'].allowed_paths, [
    'src/profile-only/repositories/**',
  ]);
  assert.deepEqual(result.draftPolicy.modes['api-integrated-ui'].allowed_paths, []);
  assert.equal(
    result.layerRows.some((row) => row.role === 'repository' && row.path === 'src/data/{domain}/repositories/**'),
    false,
  );
});

test('renderMigrationGuide includes added, removed, custom, and draft-only adoption guidance', () => {
  const policy = samplePolicy();
  const layout = {
    roles: { screen: 'src/features/{domain}/screens/**', hook: 'src/features/{domain}/hooks/**' },
    layers: [
      {
        role: 'screen',
        glob: 'src/features/{domain}/screens/**',
        fact: 'dir_has_files',
        access: { allow: ['rough-fixture-ui'], forbid: [] },
      },
      {
        role: 'hook',
        glob: 'src/features/{domain}/hooks/**',
        fact: 'dir_has_files',
        access: { allow: ['api-integrated-ui'], forbid: [] },
      },
      {
        role: 'view_model',
        glob: 'src/presentation/{domain}/viewmodels/**',
        fact: 'dir_has_files',
        access: { allow: ['rough-fixture-ui'], forbid: ['api-integrated-ui'] },
      },
    ],
  };
  const result = buildPolicyDraft({ policy, layout, date: '2026-06-23' });
  const guide = renderMigrationGuide({
    date: '2026-06-23',
    livePolicyPath: LIVE_POLICY,
    layoutPath: path.join(KIT_ROOT, 'policies', 'project-layout.yaml'),
    draftPath: path.join(os.tmpdir(), DRAFT_POLICY_FILENAME),
    diff: result.diff,
    layerRows: result.layerRows,
    manualDecisions: result.manualDecisions,
    cwd: KIT_ROOT,
  });

  assert.match(guide, /Draft only/);
  assert.match(guide, /The live `policies\/implementation-mode-policy.yaml` file is not replaced/);
  assert.match(guide, /Pre-edit hooks are not enforced/);
  assert.match(guide, /src\/presentation\/\{domain\}\/viewmodels\/\*\*/);
  assert.match(guide, /\{roles\.hook\}/);
  assert.match(guide, /Recommended Adoption Steps/);
});

test('workflow:policy-draft writes only requested draft outputs and does not mutate live policy', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-draft-cli-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const layoutPath = path.join(tmp, 'project-layout.yaml');
  const outDir = path.join(tmp, 'out');
  write(
    layoutPath,
    [
      'version: 1',
      'preset: expo-feature',
      'layers:',
      '  - role: view_model',
      '    glob: src/presentation/{domain}/viewmodels/**',
      '    fact: dir_has_files',
      '    access:',
      '      allow: [rough-fixture-ui]',
      '',
    ].join('\n'),
  );

  const before = fs.readFileSync(LIVE_POLICY, 'utf8');
  const r = spawnSync(
    process.execPath,
    [CLI, '--layout', layoutPath, '--policy', LIVE_POLICY, '--out', outDir, '--date', '2026-06-23'],
    { cwd: KIT_ROOT, encoding: 'utf8' },
  );
  const after = fs.readFileSync(LIVE_POLICY, 'utf8');

  assert.equal(r.status, 0, r.stderr);
  assert.equal(after, before);
  assert.equal(fs.existsSync(path.join(outDir, DRAFT_POLICY_FILENAME)), true);
  assert.equal(fs.existsSync(path.join(outDir, MIGRATION_GUIDE_FILENAME)), true);
  assert.match(fs.readFileSync(path.join(outDir, DRAFT_POLICY_FILENAME), 'utf8'), /src\/presentation\/\{domain\}\/viewmodels\/\*\*/);
  assert.equal(fs.existsSync(path.join(KIT_ROOT, 'policies', DRAFT_POLICY_FILENAME)), false);
});

test('workflow:policy-draft CLI fails closed for explicit missing --policy', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-draft-missing-policy-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const missingPolicy = path.join(tmp, 'missing-policy.yaml');
  const outDir = path.join(tmp, 'out');
  const r = spawnSync(process.execPath, [CLI, '--policy', missingPolicy, '--out', outDir], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });

  assert.equal(r.status, 2);
  assert.match(r.stderr, /workflow:policy-draft: policy-draft: policy file missing:/);
  assert.doesNotMatch(r.stderr, /\n\s+at\s+/);
  assert.equal(r.stdout, '');
  assert.equal(fs.existsSync(path.join(outDir, DRAFT_POLICY_FILENAME)), false);
  assert.equal(fs.existsSync(path.join(outDir, MIGRATION_GUIDE_FILENAME)), false);
});
