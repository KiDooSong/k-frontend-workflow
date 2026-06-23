import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanLayerInventory } from './layer-inventory.mjs';

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOW_STATE = path.join(KIT_ROOT, 'scripts', 'workflow-state.mjs');

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function writeScreenSpec(root) {
  write(
    path.join(root, 'docs', 'frontend-workflow', 'domains', 'profile', 'screens', 'profile', 'screen-spec.md'),
    [
      '---',
      'screen_id: PROFILE-001',
      'domain: profile',
      'route: /profile',
      'status: draft',
      '---',
      '',
      '## Purpose',
      'Profile screen.',
      '',
    ].join('\n'),
  );
}

test('scanLayerInventory observes deterministic layer facts and flattened overlap', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-inventory-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  write(path.join(tmp, 'src', 'presentation', 'profile', 'viewmodels', 'useProfile.ts'), 'export const vm = true;\n');
  write(path.join(tmp, 'src', 'domain', 'profile', 'usecases', 'GetProfile.ts'), 'export const uc = true;\n');
  write(path.join(tmp, 'src', 'data', 'profile', 'repositories', 'ProfileRepo.ts'), 'export const repo = true;\n');
  write(path.join(tmp, 'src', 'domain', 'profile', 'usecases', 'node_modules', 'ignored.ts'), 'ignored\n');
  write(path.join(tmp, 'src', 'domain', 'profile', 'usecases', '.cache', 'ignored.ts'), 'ignored\n');

  const layout = {
    roles: {
      hook: 'src/presentation/{domain}/viewmodels/**',
      api_schema: 'src/api/schemas/**',
    },
    layers: [
      {
        role: 'view_model',
        glob: 'src/presentation/{domain}/viewmodels/**',
        fact: 'dir_has_files',
        access: { allow: ['rough-fixture-ui', 'final-fixture-ui'], forbid: [] },
      },
      { role: 'use_case', glob: 'src/domain/{domain}/usecases/**', fact: 'dir_has_files', access: { allow: [], forbid: [] } },
      { role: 'repository', glob: 'src/data/{domain}/repositories/**', fact: 'dir_has_files', access: { allow: [], forbid: [] } },
      { role: 'missing', glob: 'src/domain/{domain}/missing/**', fact: 'dir_has_files', access: { allow: [], forbid: [] } },
      { role: 'outside', glob: '../outside/**', fact: 'dir_has_files', access: { allow: [], forbid: [] } },
    ],
  };

  const inventory = scanLayerInventory({ projectRoot: tmp, srcDir: path.join(tmp, 'src'), layout, screens: [{ domain: 'profile' }] });
  assert.equal(inventory.facts.view_model_present, true);
  assert.equal(inventory.facts.use_case_present, true);
  assert.equal(inventory.facts.repository_present, true);
  assert.equal(inventory.facts.missing_present, false);
  assert.equal(inventory.facts.outside_present, false);

  const byRole = new Map(inventory.layers.map((row) => [row.role, row]));
  assert.equal(byRole.get('view_model').overlap_role, 'hook');
  assert.equal(byRole.get('view_model').gate_wired, false);
  assert.equal(byRole.get('use_case').file_count, 1, 'node_modules and dot-directories are ignored');
  assert.equal(byRole.get('missing').status, 'missing');
  assert.equal(byRole.get('outside').status, 'out_of_scope');
});

test('scanLayerInventory reports multi-glob rows independently while facts stay aggregate', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-inventory-multiglob-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  write(path.join(tmp, 'src', 'data', 'profile', 'repositories', 'ProfileRepo.ts'), 'export const repo = true;\n');

  const layout = {
    roles: {},
    layers: [
      {
        role: 'repository',
        glob: ['src/data/{domain}/repositories/**', 'src/domain/{domain}/repositories/**'],
        fact: 'dir_has_files',
        access: { allow: ['final-fixture-ui'], forbid: [] },
      },
    ],
  };

  const inventory = scanLayerInventory({ projectRoot: tmp, srcDir: path.join(tmp, 'src'), layout, screens: [{ domain: 'profile' }] });
  assert.equal(inventory.facts.repository_present, true);
  const rows = new Map(inventory.layers.map((row) => [row.resolved_glob, row]));
  assert.equal(rows.get('src/data/profile/repositories/**').status, 'present');
  assert.equal(rows.get('src/data/profile/repositories/**').file_count, 1);
  assert.equal(rows.get('src/domain/profile/repositories/**').status, 'missing');
  assert.equal(rows.get('src/domain/profile/repositories/**').file_count, 0);
});

test('scanLayerInventory follows domain-specific layersFor declarations', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-inventory-domain-layers-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  write(path.join(tmp, 'src', 'features', 'coupons', 'repositories', 'couponRepository.ts'), 'export const couponRepository = {};\n');

  const layout = {
    layers: [],
    layersFor(domain) {
      return domain === 'coupons'
        ? [
            {
              role: 'repository',
              glob: 'src/features/coupons/repositories/**',
              fact: 'dir_has_files',
              access: { allow: [], forbid: [] },
            },
          ]
        : [];
    },
  };

  const inventory = scanLayerInventory({ projectRoot: tmp, srcDir: path.join(tmp, 'src'), layout, screens: [{ domain: 'coupons' }] });
  assert.equal(inventory.facts.repository_present, true);
  assert.equal(inventory.layers.length, 1);
  assert.equal(inventory.layers[0].domain, 'coupons');
  assert.equal(inventory.layers[0].resolved_glob, 'src/features/coupons/repositories/**');
  assert.equal(inventory.layers[0].status, 'present');
});

test('workflow-state writes layer-inventory only for explicit telemetry layers', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-layer-inventory-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  writeScreenSpec(tmp);
  write(path.join(tmp, 'src', 'presentation', 'profile', 'viewmodels', 'useProfile.ts'), 'export const vm = true;\n');
  const docsDir = path.join(tmp, 'docs', 'frontend-workflow');
  const srcDir = path.join(tmp, 'src');
  const outDefault = path.join(tmp, 'out-default');

  const defaultRun = spawnSync(
    process.execPath,
    [WORKFLOW_STATE, '--docs', docsDir, '--src', srcDir, '--out', outDefault, '--date', '2026-06-23'],
    { cwd: KIT_ROOT, encoding: 'utf8' },
  );
  assert.equal(defaultRun.status, 0, defaultRun.stderr);
  assert.equal(fs.existsSync(path.join(outDefault, 'layer-inventory.yaml')), false);

  const layoutPath = path.join(tmp, 'project-layout.yaml');
  write(
    layoutPath,
    [
      'version: 1',
      'roles:',
      '  screen: src/presentation/{domain}/screens/**',
      'layers:',
      '  - role: view_model',
      '    glob: src/presentation/{domain}/viewmodels/**',
      '    fact: dir_has_files',
      '    access:',
      '      allow: [rough-fixture-ui, final-fixture-ui]',
      '',
    ].join('\n'),
  );
  const outLayer = path.join(tmp, 'out-layer');
  const layerRun = spawnSync(
    process.execPath,
    [WORKFLOW_STATE, '--docs', docsDir, '--src', srcDir, '--layout', layoutPath, '--out', outLayer, '--date', '2026-06-23'],
    { cwd: KIT_ROOT, encoding: 'utf8' },
  );
  assert.equal(layerRun.status, 0, layerRun.stderr);
  const inventoryText = fs.readFileSync(path.join(outLayer, 'layer-inventory.yaml'), 'utf8');
  assert.match(inventoryText, /view_model_present: true/);
  assert.match(inventoryText, /gate_wired: false/);
  assert.match(inventoryText, /not gate-wired/);
});
