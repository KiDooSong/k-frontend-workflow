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
    'docs/reference/generated-files.md',
    'docs/reference/input-reconciliation.md',
    'docs/reference/lint-policy-catalog.md',
    'docs/reference/lint-policy-rollout-ratchet.md',
    'docs/reference/task-artifact-matrix.md',
    'package.json',
    'package-lock.json',
    'package-scripts.template.json',
    'LICENSE',
    'catalog/artifact-manifest.yaml',
    'policies/implementation-mode-policy.yaml',
    'presets/expo-feature.yaml',
    'schemas/frontmatter.schema.json',
    'scripts/create-input-artifact.mjs',
    'scripts/readiness.mjs',
    'scripts/validate.mjs',
    'scripts/workflow-run.mjs',
    'scripts/workflow-state.mjs',
    'skills/implement-screen/SKILL.md',
    'skills/reconcile-input/SKILL.md',
    'templates/repo/AGENTS.template.md',
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
    'scripts/pack-frontend-workflow-kit.mjs',
    'scripts/lib/distribution.test.mjs',
  ]) {
    assert.equal(exists(rel, out), false, `${rel} should not be packed`);
  }

  const summary = JSON.parse(fs.readFileSync(path.join(out, '_distribution-summary.json'), 'utf8'));
  assert.equal(summary.manifest, 'distribution-manifest.yaml');
  assert.equal(summary.destination_hint, 'tools/frontend-workflow');
  assert.equal(summary.files.includes('examples/coupon-feature/README.md'), false);
  assert.equal(summary.files.includes('docs/reference/input-reconciliation.md'), true);
  assert.equal(summary.files.includes('docs/reference/task-artifact-matrix.md'), true);
  assert.equal(summary.files.includes('docs/reference/generated-files.md'), true);
  assert.equal(summary.files.includes('templates/repo/AGENTS.template.md'), true);
  assert.equal(summary.files.includes('input-reconciliation.md'), false);
  assert.equal(summary.files.includes('scripts/pack-frontend-workflow-kit.mjs'), false);
  assert.equal(summary.files.includes('scripts/lib/distribution.test.mjs'), false);
  assert.deepEqual(summary.files, [...summary.files].sort((a, b) => a.localeCompare(b)));
  assert.ok(summary.excluded.some((entry) => (
    entry.path === 'scripts/pack-frontend-workflow-kit.mjs'
      && entry.classification === 'kit-dev-tooling'
      && /kit repo에서만 실행되는 pack\/distribution 검증용/.test(entry.reason)
  )));
  assert.ok(summary.excluded.some((entry) => (
    entry.path === 'scripts/lib/distribution.test.mjs'
      && entry.classification === 'kit-dev-test'
      && /kit repo에서만 실행되는 pack\/distribution 검증용/.test(entry.reason)
  )));
  assert.ok(summary.excluded.some((entry) => entry.path === 'examples/**' && entry.classification === 'kit-dev-fixture'));
  assert.ok(summary.excluded.some((entry) => entry.path === 'docs/design/**' && entry.classification === 'design-draft'));

  const packageJson = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
  assert.equal(Object.hasOwn(packageJson, 'scripts'), false);
  assert.equal(packageJson.bin['workflow-state'], 'scripts/workflow-state.mjs');

  const readme = fs.readFileSync(path.join(out, 'README.md'), 'utf8');
  for (const rel of [
    'templates/repo/AGENTS.template.md',
    'docs/reference/task-artifact-matrix.md',
    'docs/reference/generated-files.md',
  ]) {
    assert.match(readme, new RegExp(rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(exists(rel, out), true, `${rel} should be linked and packed`);
  }
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

test('packed adoption-probe docs match the draft output contract', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-pack-adoption-docs-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const out = path.join(tmp, 'frontend-workflow-kit');

  const r = spawnSync(process.execPath, [PACK_CLI, '--out', out, '--json'], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);

  const commands = fs.readFileSync(path.join(out, 'COMMANDS.md'), 'utf8');
  assert.match(commands, /--out temp\/runs\/adoption-probe-mobile-001 --id mobile-001/);
  assert.doesNotMatch(commands, /docs\/frontend-workflow\/_meta\/adoption-probe/);

  const layout = fs.readFileSync(path.join(out, 'templates', 'adoption', 'project-layout.template.yaml'), 'utf8');
  assert.match(layout, /temp\/runs\/adoption-probe-<id>\//);
  assert.doesNotMatch(layout, /docs\/frontend-workflow\/_meta\/adoption-probe/);
});

test('manifest exclude filters files captured by broad script includes', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-pack-exclude-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const manifest = path.join(tmp, 'manifest.yaml');
  const out = path.join(tmp, 'out');
  fs.writeFileSync(
    manifest,
    [
      'version: 1',
      'destination_hint: tools/frontend-workflow',
      'payload:',
      '  include:',
      '    - path: scripts/**',
      'exclude:',
      '  - path: scripts/pack-frontend-workflow-kit.mjs',
      '    classification: kit-dev-tooling',
      '    reason: kit repo에서만 실행되는 pack/distribution 검증용이며 consumer runtime/gate가 아님.',
      '  - path: scripts/lib/distribution.test.mjs',
      '    classification: kit-dev-test',
      '    reason: kit repo에서만 실행되는 pack/distribution 검증용이며 consumer runtime/gate가 아님.',
      '',
    ].join('\n'),
    'utf8',
  );

  const r = spawnSync(process.execPath, [PACK_CLI, '--manifest', manifest, '--out', out, '--json'], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);

  assert.equal(exists('scripts/readiness.mjs', out), true);
  assert.equal(exists('scripts/validate.mjs', out), true);
  assert.equal(exists('scripts/pack-frontend-workflow-kit.mjs', out), false);
  assert.equal(exists('scripts/lib/distribution.test.mjs', out), false);

  const summary = JSON.parse(fs.readFileSync(path.join(out, '_distribution-summary.json'), 'utf8'));
  assert.equal(summary.files.includes('scripts/readiness.mjs'), true);
  assert.equal(summary.files.includes('scripts/pack-frontend-workflow-kit.mjs'), false);
  assert.equal(summary.files.includes('scripts/lib/distribution.test.mjs'), false);
  assert.ok(summary.excluded.some((entry) => (
    entry.path === 'scripts/pack-frontend-workflow-kit.mjs'
      && entry.classification === 'kit-dev-tooling'
  )));
  assert.ok(summary.excluded.some((entry) => (
    entry.path === 'scripts/lib/distribution.test.mjs'
      && entry.classification === 'kit-dev-test'
  )));
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

test('consumer agent guide and task matrix cover artifact update traps', () => {
  const guide = fs.readFileSync(path.join(KIT_ROOT, 'templates', 'repo', 'AGENTS.template.md'), 'utf8');
  const matrix = fs.readFileSync(path.join(KIT_ROOT, 'docs', 'reference', 'task-artifact-matrix.md'), 'utf8');
  const generated = fs.readFileSync(path.join(KIT_ROOT, 'docs', 'reference', 'generated-files.md'), 'utf8');

  assert.match(guide, /AGENTS\.md/);
  assert.match(guide, /CLAUDE\.md/);
  assert.match(guide, /task-artifact-matrix\.md/);
  assert.match(guide, /generated-files\.md/);
  assert.match(guide, /npm run workflow:state/);
  assert.match(guide, /npm run workflow:readiness -- --screen <SCREEN_ID> --json/);
  assert.match(guide, /npm run workflow:validate/);

  for (const term of [
    'component-catalog',
    'component-gap-register',
    'workflow:catalog',
    'generated/do_not_edit',
    'Open Decisions',
    'Reconciliation Register',
  ]) {
    assert.match(matrix, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(matrix, /If ScreenSpec frontmatter or parsed body sections changed, run `workflow:state`/);
  assert.match(matrix, /Add or modify a route entry[\s\S]*workflow:state[\s\S]*workflow:route-tree/);
  assert.match(matrix, /Close or answer Unknowns[\s\S]*workflow:state[\s\S]*workflow:validate/);
  assert.match(matrix, /Codegen outputs \| The repo's actual codegen command/);

  assert.match(generated, /component-catalog\.md[\s\S]*workflow:catalog/);
  assert.match(generated, /layer-inventory\.yaml[\s\S]*workflow:state/);
  assert.match(generated, /workflow:check-generated[\s\S]*warning-first/);
  assert.match(generated, /Codegen outputs when present \| The repo's actual codegen command/);
  assert.match(generated, /does not update committed codegen files/);
  assert.doesNotMatch(generated, /Codegen outputs when present \|[^\n]*workflow:check-generated/);
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
  const packageJson = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'package.json'), 'utf8'));
  const commands = fs.readFileSync(path.join(KIT_ROOT, 'COMMANDS.md'), 'utf8');

  assert.equal(scriptsTemplate.scripts['workflow:create-input'], 'node tools/frontend-workflow/scripts/create-input-artifact.mjs');
  assert.equal(scriptsTemplate.scripts['workflow:route-cross-check'], 'node tools/frontend-workflow/scripts/route-cross-check.mjs');
  assert.equal(scriptsTemplate.scripts['workflow:policy-draft'], 'node tools/frontend-workflow/scripts/policy-draft.mjs');
  assert.equal(scriptsTemplate.scripts['workflow:check-generated'], 'node tools/frontend-workflow/scripts/check-generated-files.mjs');
  assert.equal(packageJson.scripts['workflow:check-generated'], 'node scripts/check-generated-files.mjs');
  assert.match(commands, /npm run workflow:check-generated/);
  assert.match(commands, /warning-first/);
  assert.match(commands, /must not be treated as a hard CI gate/);
});
