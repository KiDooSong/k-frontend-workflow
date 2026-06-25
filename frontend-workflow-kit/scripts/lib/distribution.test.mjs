import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACK_CLI = path.join(KIT_ROOT, 'scripts', 'pack-frontend-workflow-kit.mjs');

function exists(rel, root) {
  return fs.existsSync(path.join(root, rel));
}

test('kit:pack copies only the consumer allowlist and writes a stable summary', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-pack-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const out = path.join(tmp, 'frontend-workflow-kit');

  const r = spawnSync(process.execPath, [PACK_CLI, '--out', out, '--json'], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);

  for (const rel of [
    'README.md',
    'COMMANDS.md',
    'CONVENTIONS.md',
    'distribution-manifest.yaml',
    'package.json',
    'package-lock.json',
    'package-scripts.template.json',
    'LICENSE',
    'catalog/artifact-manifest.yaml',
    'policies/implementation-mode-policy.yaml',
    'presets/expo-feature.yaml',
    'schemas/frontmatter.schema.json',
    'scripts/readiness.mjs',
    'scripts/pack-frontend-workflow-kit.mjs',
    'skills/implement-screen/SKILL.md',
    'templates/screen/screen-spec.template.md',
  ]) {
    assert.equal(exists(rel, out), true, `${rel} should be packed`);
  }

  for (const rel of [
    'examples',
    'temp',
    'docs/design',
    'docs/workflows/mvp-b.md',
    'roadmap-current.md',
    'CHANGELOG.md',
    'open-decisions.md',
    'input-reconciliation.md',
    'investigation-and-verification.md',
  ]) {
    assert.equal(exists(rel, out), false, `${rel} should not be packed`);
  }

  const summary = JSON.parse(fs.readFileSync(path.join(out, '_distribution-summary.json'), 'utf8'));
  assert.equal(summary.manifest, 'distribution-manifest.yaml');
  assert.equal(summary.destination_hint, 'tools/frontend-workflow');
  assert.equal(summary.files.includes('examples/coupon-feature/README.md'), false);
  assert.deepEqual(summary.files, [...summary.files].sort((a, b) => a.localeCompare(b)));
  assert.ok(summary.excluded.some((entry) => entry.path === 'examples/**' && entry.classification === 'kit-dev-fixture'));
});

test('kit:pack fails closed when an allowlisted source is missing', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-pack-missing-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const manifest = path.join(tmp, 'bad-manifest.yaml');
  fs.writeFileSync(
    manifest,
    [
      'version: 1',
      'payload:',
      '  include:',
      '    - path: __missing__.md',
      '',
    ].join('\n'),
    'utf8',
  );

  const r = spawnSync(process.execPath, [PACK_CLI, '--manifest', manifest, '--out', path.join(tmp, 'out')], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /allowlisted file missing/);
});

test('consumer README points to the manifest-backed pack flow', () => {
  const readme = fs.readFileSync(path.join(KIT_ROOT, 'README.md'), 'utf8');
  assert.match(readme, /distribution-manifest\.yaml/);
  assert.match(readme, /npm run kit:pack/);
  assert.doesNotMatch(readme, /roadmap-current\.md/);
  assert.doesNotMatch(readme, /MVP-B Phase/);
});
