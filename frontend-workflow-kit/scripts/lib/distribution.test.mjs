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

function walkPackedDocs(root, relDirs) {
  const out = [];
  for (const relDir of relDirs) {
    const start = path.join(root, relDir);
    if (!fs.existsSync(start)) continue;
    const stack = [start];
    while (stack.length) {
      const dir = stack.pop();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile() && /\.(md|ya?ml|json)$/i.test(entry.name)) {
          out.push(full);
        }
      }
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
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
    'docs/reference/ambiguity-triage.md',
    'docs/reference/input-reconciliation.md',
    'docs/reference/lint-policy-catalog.md',
    'docs/reference/lint-policy-rollout-ratchet.md',
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
    'skills/reconcile-input/SKILL.md',
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
  assert.equal(summary.files.includes('docs/reference/input-reconciliation.md'), true);
  assert.equal(summary.files.includes('input-reconciliation.md'), false);
  assert.deepEqual(summary.files, [...summary.files].sort((a, b) => a.localeCompare(b)));
  assert.ok(summary.excluded.some((entry) => entry.path === 'examples/**' && entry.classification === 'kit-dev-fixture'));
  assert.ok(summary.excluded.some((entry) => entry.path === 'docs/design/**' && entry.classification === 'design-draft'));
});

test('packed consumer-facing markdown does not link to excluded docs', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-pack-links-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const out = path.join(tmp, 'frontend-workflow-kit');

  const r = spawnSync(process.execPath, [PACK_CLI, '--out', out, '--json'], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);

  const scanned = walkPackedDocs(out, ['docs/reference', 'templates', 'skills']);
  assert.ok(scanned.length > 0, 'expected packed consumer docs/templates/skills to be scanned');

  for (const file of scanned) {
    const rel = path.relative(out, file).replace(/\\/g, '/');
    const raw = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(raw, /investigation-and-verification\.md/, rel);
    assert.doesNotMatch(raw, /docs\/workflows\//, rel);
    assert.doesNotMatch(raw, /docs\/design\//, rel);
    assert.doesNotMatch(raw, /\]\([^)]*(?:examples|temp)\//, rel);
  }
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
  assert.match(readme, /docs\/reference\/input-reconciliation\.md/);
  assert.match(readme, /check 12[^\n]+NO-OP/i);
  assert.doesNotMatch(readme, /roadmap-current\.md/);
  assert.doesNotMatch(readme, /MVP-B Phase/);
});

test('consumer reconciliation docs describe check 12 severity and retry row reuse', () => {
  const reference = fs.readFileSync(path.join(KIT_ROOT, 'docs', 'reference', 'input-reconciliation.md'), 'utf8');
  const template = fs.readFileSync(path.join(KIT_ROOT, 'templates', 'input', 'input-artifact.template.md'), 'utf8');
  const registerTemplate = fs.readFileSync(path.join(KIT_ROOT, 'templates', 'meta', 'reconciliation-register.template.md'), 'utf8');
  const skill = fs.readFileSync(path.join(KIT_ROOT, 'skills', 'reconcile-input', 'SKILL.md'), 'utf8');

  assert.match(reference, /register 파일이 없으면[^\n]+NO-OP/);
  assert.match(reference, /row 없음과 `Reconcile Status=not-started`/);
  assert.match(reference, /`in-progress`, `failed`, invalid enum, duplicate Input ID, missing required columns 는 항상 에러/);
  assert.match(reference, /Retry updates that row/);
  assert.match(skill, /`failed` → 새 행을 만들지 않는다/);
  assert.match(skill, /`not-started` → 같은 행을 `in-progress` 로 이동한다/);
  assert.match(template, /docs\/reference\/input-reconciliation\.md/);
  assert.match(registerTemplate, /docs\/reference\/input-reconciliation\.md/);
});

test('consumer package script template exposes current command aliases only', () => {
  const scriptsTemplate = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'package-scripts.template.json'), 'utf8'));
  assert.equal(scriptsTemplate.scripts['workflow:create-input'], 'node tools/frontend-workflow/scripts/create-input-artifact.mjs');
  assert.equal(scriptsTemplate.scripts['workflow:route-cross-check'], 'node tools/frontend-workflow/scripts/route-cross-check.mjs');
  assert.equal(scriptsTemplate.scripts['workflow:policy-draft'], 'node tools/frontend-workflow/scripts/policy-draft.mjs');
  assert.equal(Object.hasOwn(scriptsTemplate.scripts, 'workflow:check-generated'), false);
});
