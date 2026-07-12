import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadYaml } from './util.mjs';

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACK_CLI = path.join(KIT_ROOT, 'scripts', 'pack-frontend-workflow-kit.mjs');

function exists(rel, root) {
  return fs.existsSync(path.join(root, rel));
}

function linkInstalledDependency(out, packageName) {
  const source = path.join(KIT_ROOT, 'node_modules', packageName);
  assert.equal(fs.existsSync(source), true, `dependency ${packageName} must be installed for packed CLI regression`);
  const target = path.join(out, 'node_modules', packageName);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fs.symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    fs.cpSync(source, target, { recursive: true });
  }
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
    'docs/reference/e2e-consumer-adoption.md',
    'docs/reference/e2e-playwright-agents.md',
    'docs/reference/doc-ownership.md',
    'docs/reference/generated-files.md',
    'docs/reference/input-reconciliation.md',
    'docs/reference/lint-policy-catalog.md',
    'docs/reference/lint-policy-rollout-ratchet.md',
    'docs/reference/task-artifact-matrix.md',
    'docs/reference/workflow-spine.md',
    'docs/reference/workflow-stages/00-start-here.md',
    'docs/reference/workflow-stages/01-source-specific-input-production.md',
    'docs/reference/workflow-stages/02-screen-identity-source-mapping.md',
    'docs/reference/workflow-stages/03-create-canonical-input-artifact.md',
    'docs/reference/workflow-stages/04-reconcile-input.md',
    'docs/reference/workflow-stages/05-author-workflow-contracts.md',
    'docs/reference/workflow-stages/06-implement-screen-or-code.md',
    'docs/reference/workflow-stages/07-regenerate-derived-views.md',
    'docs/reference/workflow-stages/08-validate-and-report.md',
    'docs/reference/workflow-stages/09-human-decision-gates.md',
    'docs/reference/workflow-stages/10-policy-layout-tier3-changes.md',
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
    'scripts/readiness-eval.mjs',
    'scripts/lib/readiness-eval-cases.json',
    'scripts/validate.mjs',
    'scripts/workflow-run.mjs',
    'scripts/workflow-state.mjs',
    'scripts/visual-consistency.mjs',
    'scripts/lib/visual-consistency.mjs',
    'scripts/visual-contract-bootstrap.mjs',
    'scripts/lib/visual-contract-bootstrap.mjs',
    'skills/implement-screen/SKILL.md',
    'skills/reconcile-input/SKILL.md',
    'skills/capture-learning/SKILL.md',
    'skills/visual-reconcile/SKILL.md',
    'skills/visual-contract-bootstrap/SKILL.md',
    'docs/reference/visual-reconciliation.md',
    'templates/design/visual-consistency-contract.template.md',
    'templates/e2e/web-plan.template.md',
    'templates/repo/AGENTS.template.md',
    'templates/screen/screen-spec.template.md',
    'templates/meta/session-learnings.template.md',
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
  assert.equal(summary.files.includes('docs/reference/doc-ownership.md'), true);
  assert.equal(summary.files.includes('docs/reference/e2e-consumer-adoption.md'), true);
  assert.equal(summary.files.includes('docs/reference/e2e-playwright-agents.md'), true);
  assert.equal(summary.files.includes('docs/reference/task-artifact-matrix.md'), true);
  assert.equal(summary.files.includes('docs/reference/generated-files.md'), true);
  assert.equal(summary.files.includes('docs/reference/workflow-spine.md'), true);
  assert.equal(summary.files.includes('docs/reference/workflow-stages/00-start-here.md'), true);
  assert.equal(summary.files.includes('docs/reference/workflow-stages/10-policy-layout-tier3-changes.md'), true);
  assert.equal(summary.files.includes('scripts/lib/readiness-eval-cases.json'), true);
  assert.equal(summary.files.includes('templates/e2e/web-plan.template.md'), true);
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
    'docs/reference/workflow-spine.md',
    'docs/reference/workflow-stages/00-start-here.md',
  ]) {
    assert.match(readme, new RegExp(rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(exists(rel, out), true, `${rel} should be linked and packed`);
  }
});

test('kit:pack emits a payload manifest and excludes the upgrade-planner kit-dev test', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-pack-payload-manifest-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const out = path.join(tmp, 'frontend-workflow-kit');
  const r = spawnSync(process.execPath, [PACK_CLI, '--out', out, '--json'], { cwd: KIT_ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);

  // Default path (no --source-ref): kit/git supply the metadata.
  const manifest = JSON.parse(fs.readFileSync(path.join(out, '.kit-payload-manifest.json'), 'utf8'));
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.distribution_manifest_version, 1);
  assert.equal(manifest.payload.destination_hint, 'tools/frontend-workflow');
  assert.ok(Object.hasOwn(manifest.kit, 'source_ref')); // present (a SHA when git is available, else null)
  assert.equal(typeof manifest.kit.package_version, 'string');
  assert.ok(manifest.payload.files.length > 50);

  const readiness = manifest.payload.files.find((f) => f.path === 'scripts/readiness.mjs');
  assert.ok(readiness, 'readiness.mjs should appear in the payload manifest');
  assert.match(readiness.sha256, /^[0-9a-f]{64}$/);
  assert.equal(readiness.classification, 'consumer-runtime');
  assert.match(readiness.mode, /^100(644|755)$/);

  const readinessEvalCases = manifest.payload.files.find((f) => f.path === 'scripts/lib/readiness-eval-cases.json');
  assert.ok(readinessEvalCases, 'default readiness eval cases should appear in the payload manifest');
  assert.equal(readinessEvalCases.classification, 'consumer-runtime');
  assert.match(readinessEvalCases.sha256, /^[0-9a-f]{64}$/);

  // The upgrade tool ships to consumers; its kit-dev test stays in the kit repo.
  assert.equal(exists('scripts/upgrade-vendored-kit.mjs', out), true);
  assert.equal(exists('scripts/lib/upgrade-planner.test.mjs', out), false);
  assert.equal(manifest.payload.files.some((f) => f.path === 'scripts/lib/upgrade-planner.test.mjs'), false);

  // The manifest is not allowed to list itself or the summary file.
  assert.equal(manifest.payload.files.some((f) => f.path === '.kit-payload-manifest.json'), false);
  assert.equal(manifest.payload.files.some((f) => f.path === '_distribution-summary.json'), false);
  // File list is sorted (deterministic diffs).
  assert.deepEqual(
    manifest.payload.files.map((f) => f.path),
    [...manifest.payload.files.map((f) => f.path)].sort((a, b) => a.localeCompare(b)),
  );
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

test('packed eval and telemetry run with bundled default readiness cases', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-pack-eval-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const out = path.join(tmp, 'frontend-workflow-kit');

  const pack = spawnSync(process.execPath, [PACK_CLI, '--out', out, '--json'], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(pack.status, 0, pack.stderr);
  linkInstalledDependency(out, 'yaml');

  const evalRun = spawnSync(process.execPath, [path.join(out, 'scripts', 'readiness-eval.mjs'), '--json'], {
    cwd: out,
    encoding: 'utf8',
  });
  assert.equal(evalRun.status, 0, evalRun.stderr);
  const evalReport = JSON.parse(evalRun.stdout);
  assert.equal(evalReport.tool, 'workflow:eval');
  assert.equal(evalReport.total, 16);
  assert.equal(evalReport.confusion.false_open.count, 0);
  assert.equal(evalReport.confusion.false_closed.count, 0);
  assert.equal(evalReport.fail_closed_axis.leaked, 0);
  assert.equal(evalReport.blocking_kinds.mismatch.count, 0);

  const telemetryRun = spawnSync(process.execPath, [path.join(out, 'scripts', 'telemetry.mjs'), '--json'], {
    cwd: out,
    encoding: 'utf8',
  });
  assert.equal(telemetryRun.status, 0, telemetryRun.stderr);
  const telemetry = JSON.parse(telemetryRun.stdout);
  assert.equal(telemetry.tool, 'workflow:telemetry');
  const evalSurface = telemetry.surfaces.find((s) => s.surface_id === 'readiness-eval');
  assert.ok(evalSurface, 'telemetry should include readiness-eval surface');
  assert.equal(evalSurface.available, true);
  assert.equal(evalSurface.warning_count, 0);
  assert.equal(evalSurface.total, 16);
  assert.equal(evalSurface.blocking_mismatch, 0);
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
  assert.match(readme, /check 12[^\n]+row 없음[^\n]+row를 먼저 만들/);
  assert.match(readme, /check 12[^\n]+기존 row[^\n]+새 row를 만들지 말고 같은 row를 재개/);
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
  assert.equal(scriptsTemplate.scripts['workflow:visual-consistency'], 'node tools/frontend-workflow/scripts/visual-consistency.mjs');
  assert.equal(scriptsTemplate.scripts['workflow:visual-contract-bootstrap'], 'node tools/frontend-workflow/scripts/visual-contract-bootstrap.mjs');
  assert.equal(scriptsTemplate.scripts['workflow:doc-drift'], 'node tools/frontend-workflow/scripts/doc-drift.mjs');
  assert.equal(scriptsTemplate.scripts['workflow:eval'], 'node tools/frontend-workflow/scripts/readiness-eval.mjs');
  assert.equal(scriptsTemplate.scripts['workflow:policy-draft'], 'node tools/frontend-workflow/scripts/policy-draft.mjs');
  assert.equal(scriptsTemplate.scripts['workflow:check-generated'], 'node tools/frontend-workflow/scripts/check-generated-files.mjs');
  assert.equal(packageJson.scripts['workflow:doc-drift'], 'node scripts/doc-drift.mjs');
  assert.equal(packageJson.scripts['workflow:eval'], 'node scripts/readiness-eval.mjs');
  assert.equal(packageJson.scripts['workflow:check-generated'], 'node scripts/check-generated-files.mjs');
  assert.equal(packageJson.scripts['workflow:visual-consistency'], 'node scripts/visual-consistency.mjs');
  assert.equal(packageJson.scripts['workflow:visual-contract-bootstrap'], 'node scripts/visual-contract-bootstrap.mjs');
  assert.match(commands, /npm run workflow:visual-consistency/);
  assert.match(commands, /npm run workflow:visual-contract-bootstrap/);
  assert.match(commands, /review-only adoption helper/);
  assert.match(commands, /npm run workflow:doc-drift/);
  assert.match(commands, /npm run workflow:eval/);
  assert.match(commands, /false-open/);
  assert.match(commands, /Phase 0 warning-first diagnostic/);
  assert.match(commands, /npm run workflow:check-generated/);
  assert.match(commands, /warning-first/);
  assert.match(commands, /must not be treated as a hard CI gate/);
});

const SPINE_STAGES = [
  '00-start-here',
  '01-source-specific-input-production',
  '02-screen-identity-source-mapping',
  '03-create-canonical-input-artifact',
  '04-reconcile-input',
  '05-author-workflow-contracts',
  '06-implement-screen-or-code',
  '07-regenerate-derived-views',
  '08-validate-and-report',
  '09-human-decision-gates',
  '10-policy-layout-tier3-changes',
];

test('workflow spine and numbered stage docs exist and are wired', () => {
  const refDir = path.join(KIT_ROOT, 'docs', 'reference');
  const spinePath = path.join(refDir, 'workflow-spine.md');
  const stageDir = path.join(refDir, 'workflow-stages');

  // spine exists; stage docs 00-10 exist; spine links each one.
  assert.equal(fs.existsSync(spinePath), true, 'workflow-spine.md should exist');
  const spine = fs.readFileSync(spinePath, 'utf8');
  for (const name of SPINE_STAGES) {
    assert.equal(fs.existsSync(path.join(stageDir, `${name}.md`)), true, `${name}.md should exist`);
    assert.match(spine, new RegExp(`workflow-stages/${name}\\.md`), `spine should link ${name}`);
  }

  // AGENTS template routes to the spine + start-here first.
  const guide = fs.readFileSync(path.join(KIT_ROOT, 'templates', 'repo', 'AGENTS.template.md'), 'utf8');
  assert.match(guide, /docs\/reference\/workflow-spine\.md/);
  assert.match(guide, /docs\/reference\/workflow-stages\/00-start-here\.md/);

  // task-artifact matrix references stage numbers and the greppable prefix.
  const matrix = fs.readFileSync(path.join(refDir, 'task-artifact-matrix.md'), 'utf8');
  assert.match(matrix, /workflow-spine\.md/);
  assert.match(matrix, /02 → 03 → 04/);
  assert.match(matrix, /workflow-stages\/NN-\*\.md/);

  // Stage 01 + Stage 03 carry explicit consumer-customization guidance.
  const stage01 = fs.readFileSync(path.join(stageDir, '01-source-specific-input-production.md'), 'utf8');
  const stage03 = fs.readFileSync(path.join(stageDir, '03-create-canonical-input-artifact.md'), 'utf8');
  assert.match(stage01, /consumer-owned/i);
  assert.match(stage01, /Consumer repo customization:/);
  assert.match(stage03, /Consumer repo customization:/);
  assert.match(stage03, /default implementation \+ safe extension points/i);

  // Stage 02 references the screen-identity contract and the scaffolder.
  const stage02 = fs.readFileSync(path.join(stageDir, '02-screen-identity-source-mapping.md'), 'utf8');
  assert.match(stage02, /screen-identity\.md/);
  assert.match(stage02, /workflow:create-screen/);
});

test('workflow spine and stage docs have no broken relative links', () => {
  const refDir = path.join(KIT_ROOT, 'docs', 'reference');
  const stageDir = path.join(refDir, 'workflow-stages');
  const files = [
    path.join(refDir, 'workflow-spine.md'),
    ...SPINE_STAGES.map((name) => path.join(stageDir, `${name}.md`)),
  ];
  const linkRe = /\]\(([^)]+)\)/g;
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = linkRe.exec(raw)) !== null) {
      const target = match[1].trim();
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const rel = target.split('#')[0];
      if (!rel) continue;
      const resolved = path.resolve(path.dirname(file), rel);
      assert.equal(
        fs.existsSync(resolved),
        true,
        `${path.relative(KIT_ROOT, file).replace(/\\/g, '/')} links to missing ${target}`,
      );
    }
  }
});

// Distribution hygiene: dev/design/history docs must live OUTSIDE the consumer kit tree.
// This is the physical-tree counterpart to the manifest exclude guards — it fails if a
// dev-only directory/file ever reappears under frontend-workflow-kit/.
const MOVED_TO_KIT_DEV = [
  'docs/design',
  'docs/workflows',
  'roadmap-current.md',
  'CHANGELOG.md',
  'open-decisions.md',
  'investigation-and-verification.md',
  'temp',
];

test('dev-only docs do not physically live under the kit (moved to repo-root kit-dev/)', () => {
  for (const rel of MOVED_TO_KIT_DEV) {
    assert.equal(
      fs.existsSync(path.join(KIT_ROOT, rel)),
      false,
      `frontend-workflow-kit/${rel} must not exist — dev docs belong in repo-root kit-dev/`,
    );
  }
  // Consumer reference docs stay inside the kit.
  assert.equal(fs.existsSync(path.join(KIT_ROOT, 'docs', 'reference')), true, 'docs/reference must remain under the kit');
  // docs/ under the kit now contains only the consumer reference tree.
  assert.deepEqual(
    fs.readdirSync(path.join(KIT_ROOT, 'docs')).sort(),
    ['reference'],
    'frontend-workflow-kit/docs/ should contain only reference/',
  );
});

test('moved dev/design/history docs are present in repo-root kit-dev/', () => {
  const REPO_ROOT = path.resolve(KIT_ROOT, '..');
  for (const rel of MOVED_TO_KIT_DEV) {
    assert.equal(
      fs.existsSync(path.join(REPO_ROOT, 'kit-dev', rel)),
      true,
      `kit-dev/${rel} should exist after the move`,
    );
  }
});

test('manifest retains exclude guards for the moved dev-doc directories', () => {
  const manifest = fs.readFileSync(path.join(KIT_ROOT, 'distribution-manifest.yaml'), 'utf8');
  for (const guard of ['docs/design/**', 'docs/workflows/**', 'temp/**']) {
    assert.match(manifest, new RegExp(`path:\\s*${guard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `manifest should keep ${guard} as a guard`);
  }
});

// --- Progressive-disclosure lint: skills stay compact routers, detail lives in canonical docs. ---
// "One fact, one home" — a skill names the critical invariants inline and links the rest; it does
// not restate the references. These grep-style checks fail if a skill re-bloats into a handbook or
// if a safety rule removed from a skill loses its canonical home.

const WORKFLOW_SKILLS = [
  { skill: 'reconcile-input', stage: '04-reconcile-input' },
  { skill: 'implement-screen', stage: '06-implement-screen-or-code' },
  { skill: 'e2e-agent', stage: '08-validate-and-report' },
];

test('doc-ownership map exists, maps concepts to homes, and is wired into the spine', () => {
  const refDir = path.join(KIT_ROOT, 'docs', 'reference');
  const ownershipPath = path.join(refDir, 'doc-ownership.md');
  assert.equal(fs.existsSync(ownershipPath), true, 'docs/reference/doc-ownership.md should exist');
  const ownership = fs.readFileSync(ownershipPath, 'utf8');

  // It maps the repeated concepts to their canonical homes (incl. the implement-path invariant).
  for (const home of [
    'workflow-spine.md',
    'task-artifact-matrix.md',
    'generated-files.md',
    'input-reconciliation.md',
    'screen-identity.md',
    'allowed_paths',
    'forbidden_paths',
  ]) {
    assert.match(ownership, new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `ownership map should reference ${home}`);
  }
  // The "one fact, one home" dedup rule is stated explicitly.
  assert.match(ownership, /canonical home/i);
  assert.match(ownership, /2\+ skills\/docs/);

  // The spine links the ownership map so an agent can discover it.
  const spine = fs.readFileSync(path.join(refDir, 'workflow-spine.md'), 'utf8');
  assert.match(spine, /doc-ownership\.md/);
});

test('workflow skills are compact routers that link the spine, their stage doc, and the ownership map', () => {
  for (const { skill, stage } of WORKFLOW_SKILLS) {
    const raw = fs.readFileSync(path.join(KIT_ROOT, 'skills', skill, 'SKILL.md'), 'utf8');
    // Progressive disclosure: link the spine + the owning stage doc + the ownership map.
    assert.match(raw, /workflow-spine\.md/, `${skill} should link the workflow spine`);
    assert.match(raw, new RegExp(`workflow-stages/${stage}\\.md`), `${skill} should link its stage doc`);
    assert.match(raw, /doc-ownership\.md/, `${skill} should link the doc-ownership map`);
    // Stays compact — handbook detail moved to references. Old sizes were 140 / 217 lines.
    const lines = raw.split('\n').length;
    assert.ok(lines <= 120, `${skill}/SKILL.md should stay a compact router (<=120 lines), got ${lines}`);
  }
});

test('e2e-agent optional web evidence surface is wired without a missing matrix dependency', () => {
  const skill = fs.readFileSync(path.join(KIT_ROOT, 'skills', 'e2e-agent', 'SKILL.md'), 'utf8');
  const planTemplate = fs.readFileSync(path.join(KIT_ROOT, 'templates', 'e2e', 'web-plan.template.md'), 'utf8');
  const setupDoc = fs.readFileSync(path.join(KIT_ROOT, 'docs', 'reference', 'e2e-playwright-agents.md'), 'utf8');
  const visualCapture = fs.readFileSync(path.join(KIT_ROOT, 'docs', 'reference', 'e2e-visual-capture.md'), 'utf8');
  const readme = fs.readFileSync(path.join(KIT_ROOT, 'README.md'), 'utf8');
  const startHere = fs.readFileSync(path.join(KIT_ROOT, 'docs', 'reference', 'workflow-stages', '00-start-here.md'), 'utf8');
  const stage08 = fs.readFileSync(path.join(KIT_ROOT, 'docs', 'reference', 'workflow-stages', '08-validate-and-report.md'), 'utf8');
  const spine = fs.readFileSync(path.join(KIT_ROOT, 'docs', 'reference', 'workflow-spine.md'), 'utf8');
  const ownership = fs.readFileSync(path.join(KIT_ROOT, 'docs', 'reference', 'doc-ownership.md'), 'utf8');

  assert.match(skill, /^name: e2e-agent$/m);
  assert.match(skill, /e2e 짜줘/);
  assert.match(skill, /tests\/web-plans\/\{domain\}/);
  assert.match(skill, /tests\/web\/\{domain\}\/\{screen-slug\}\/<suite>\.spec\.ts/);
  assert.match(skill, /e2e-playwright-agents\.md/);
  assert.match(skill, /templates\/e2e\/web-plan\.template\.md/);
  assert.match(skill, /consumer-owned E2E 표면/);
  assert.match(skill, /fixture green/);
  assert.match(skill, /Stage 07의 generated derived view가 아니다/);
  assert.match(skill, /COUPON-001` -> `coupon-001/);
  assert.match(skill, /AUTH\/SIGNUP_EMAIL` -> `auth-signup-email/);
  assert.match(skill, /kit-dev\/temp\/runs\/<run-id>\/tests\/web-plans/);
  assert.match(skill, /reviewed canonical final plan/);
  assert.match(skill, /raw planner output/);
  assert.match(skill, /official planner output body/);
  assert.match(skill, /run-isolated/);
  assert.match(skill, /seed_file/);
  assert.match(skill, /playwright_project/);
  assert.match(skill, /base_url/);
  assert.match(skill, /test_dir/);
  assert.match(skill, /setup required/);
  assert.match(skill, /planner를 우선 호출/);
  assert.match(skill, /visual capture candidates를 planning sidecar/);
  assert.match(skill, /needs-human-decision/);
  assert.match(skill, /template은 kit dogfood, preflight notes, human-reviewed context scaffold에만 쓰며 generator input으로 넘기지 않는다/);
  assert.match(skill, /Plan-only는 test runner, generator\/healer를 실행하지 않고 `tests\/web\/\*\*`나 `tests\/web\/screenshots\/\*\*`를 만들지 않으며 Playwright 실행이나 screenshot 생성을 하지 않는다/);
  assert.doesNotMatch(skill, /Verification Matrix/);

  assert.match(planTemplate, /## Not Generator Input/);
  assert.match(planTemplate, /not the Playwright planner output/);
  assert.match(planTemplate, /## Workflow Context/);
  assert.match(planTemplate, /Identity \/ Source/);
  assert.match(planTemplate, /Shallow Smoke Scope/);
  assert.match(planTemplate, /Evidence-Only Disclaimer/);
  assert.match(planTemplate, /Planner Context Packet/);
  assert.match(planTemplate, /## Generator Handoff Boundary/);
  assert.match(planTemplate, /## Official Planner Output/);
  assert.match(planTemplate, /prefer real\s+planner output over this template/);
  assert.match(planTemplate, /Official default\/raw planner landing surface: `specs\/\{planner-output\}\.md`/);
  assert.match(planTemplate, /Canonical final plan path: `tests\/web-plans\/\{domain\}\/\{screen-slug\}\/plan\.md`/);
  assert.match(planTemplate, /Per-run draft path/);
  assert.match(planTemplate, /seed_file/);
  assert.match(planTemplate, /playwright_project/);
  assert.match(planTemplate, /base_url/);
  assert.match(planTemplate, /test_dir/);
  assert.match(planTemplate, /### Visual Capture Candidates/);
  assert.match(planTemplate, /future `capture` mode only/);
  assert.match(planTemplate, /direct-entry\|journey-entry\|native-only\|needs-human-decision/);
  assert.match(planTemplate, /Do not pass Visual Capture Candidates as behavioral test scenarios/);
  assert.match(planTemplate, /\*\*Seed:\*\*/);
  assert.match(planTemplate, /\*\*File:\*\* `\{test_dir\}\/\{domain\}\/\{screen-slug\}\/<suite>\.spec\.ts`/);
  assert.match(planTemplate, /- expect:/);
  assert.doesNotMatch(planTemplate, /Verification Matrix/);

  assert.match(setupDoc, /planner -> generator -> healer/);
  assert.match(setupDoc, /npx playwright init-agents --loop=codex/);
  assert.match(setupDoc, /--loop=claude/);
  assert.match(setupDoc, /MCP wiring is required/);
  assert.match(setupDoc, /\.codex\/agents\/playwright_test_\*\.toml/);
  assert.match(setupDoc, /\.claude\/agents\/playwright-test-\*\.md/);
  assert.match(setupDoc, /\.mcp\.json/);
  assert.match(setupDoc, /--config playwright\.config\.ts --project web/);
  assert.match(setupDoc, /selected Playwright `testDir` or project\s+`testDir`/);
  assert.match(setupDoc, /`seed\.spec\.ts` filename/);
  assert.match(setupDoc, /The plan scaffold directory remains `specs\/`/);
  assert.match(setupDoc, /webServer\.url/);
  assert.match(setupDoc, /use\.baseURL/);
  assert.match(setupDoc, /E2E_BASE_URL/);
  assert.match(setupDoc, /E2E_PORT/);
  assert.match(setupDoc, /E2E_RUN_ID/);
  assert.match(setupDoc, /reuseExistingServer: !process\.env\.CI/);
  assert.match(setupDoc, /## Worktrees and Sessions/);
  assert.match(setupDoc, /init-agents` output is repo content/);
  assert.match(setupDoc, /hot-mount/);
  assert.match(setupDoc, /subagent call does not mount MCP again/);
  assert.match(setupDoc, /web server ports/);
  assert.match(setupDoc, /## Path model/);
  assert.match(setupDoc, /plan path is workspace-relative and not tied to `testDir`/);
  assert.match(setupDoc, /Generated tests must stay inside the configured `testDir`/);
  assert.match(setupDoc, /seed must also live inside `testDir`/);
  assert.match(setupDoc, /Do not set `testDir` to the repo root/);
  assert.match(setupDoc, /tests\/web\/\{domain\}\/\{screen-slug\}\/<suite>\.spec\.ts/);
  assert.match(setupDoc, /seed_file/);
  assert.match(setupDoc, /playwright_project/);
  assert.match(setupDoc, /base_url/);
  assert.match(setupDoc, /test_dir/);
  assert.match(setupDoc, /raw\/default landing surface/);
  assert.match(setupDoc, /human-reviewed final plan/);
  assert.match(setupDoc, /governance convention, not a\s+Playwright requirement/);
  assert.match(setupDoc, /Playwright planner output body/);
  assert.match(setupDoc, /Per-run drafts must be isolated/);
  assert.match(setupDoc, /Generator output -> `tests\/web\/\{domain\}\/\{screen-slug\}\/<suite>\.spec\.ts`/);
  assert.match(setupDoc, /non-generator `Visual Capture Candidates` sidecar/);
  assert.match(setupDoc, /generator consumes the official\s+behavioral planner output only/);
  assert.match(setupDoc, /Regenerate the agent\s+definitions whenever Playwright is updated/);
  assert.match(setupDoc, /ScreenSpec -> planner context/);
  assert.match(setupDoc, /stop with setup\s+required/);
  assert.doesNotMatch(setupDoc, /Verification Matrix/);

  assert.match(visualCapture, /## Candidate discovery during plan mode/);
  assert.match(visualCapture, /include visual capture candidates\s+by default/);
  assert.match(visualCapture, /not a required canonical artifact/);
  assert.match(visualCapture, /mock\/fixture stages/);
  assert.match(visualCapture, /## Visual Capture Candidates/);
  assert.match(visualCapture, /direct-entry\|journey-entry\|native-only\|needs-human-decision/);
  assert.match(visualCapture, /Do not write visual specs until the web surface is runnable/);

  assert.match(stage08, /e2e-agent/);
  assert.match(stage08, /\.\.\/\.\.\/\.\.\/skills\/e2e-agent\/SKILL\.md/);
  assert.match(stage08, /\*\*optional and never a gate\*\*/);
  assert.doesNotMatch(stage08, /Verification Matrix/);

  assert.match(startHere, /e2e-agent/);
  assert.match(startHere, /\|\s*05\/06\/08\s*\|\s*e2e-agent\s*\|/);
  assert.match(readme, /Optional Web E2E Evidence/);
  assert.match(readme, /skills\/e2e-agent\/SKILL\.md/);
  assert.match(readme, /tests\/web-plans\/\*\*/);
  assert.match(spine, /e2e-agent/);
  assert.match(spine, /optional evidence/);
  assert.match(ownership, /optional web E2E evidence/);
});

test('e2e consumer adoption guide sequences setup without duplicating the canonical references', () => {
  const refDir = path.join(KIT_ROOT, 'docs', 'reference');
  const adoption = fs.readFileSync(path.join(refDir, 'e2e-consumer-adoption.md'), 'utf8');
  const readme = fs.readFileSync(path.join(KIT_ROOT, 'README.md'), 'utf8');
  const ownership = fs.readFileSync(path.join(refDir, 'doc-ownership.md'), 'utf8');
  const skill = fs.readFileSync(path.join(KIT_ROOT, 'skills', 'e2e-agent', 'SKILL.md'), 'utf8');

  // It is a wrapper that links the canonical homes rather than restating them.
  assert.match(adoption, /e2e-playwright-agents\.md/);
  assert.match(adoption, /e2e-behavioral-rules\.md/);
  assert.match(adoption, /\.\.\/\.\.\/skills\/e2e-agent\/SKILL\.md/);
  assert.match(adoption, /workflow-stages\/08-validate-and-report\.md/);
  assert.match(adoption, /screen-identity\.md/);

  // The consumer install/commit/ignore/run sequence is present.
  assert.match(adoption, /npx playwright init-agents --loop=codex/);
  assert.match(adoption, /--loop=claude/);
  assert.match(adoption, /--config playwright\.config\.ts --project web/);
  assert.match(adoption, /\.mcp\.json/);
  assert.match(adoption, /\.codex\/agents\/playwright_test_\*\.toml/);
  assert.match(adoption, /\.claude\/agents\/playwright-test-\*\.md/);
  assert.match(adoption, /Do not commit:/);
  assert.match(adoption, /node_modules/);
  assert.match(adoption, /E2E_PORT/);
  assert.match(adoption, /E2E_BASE_URL/);
  assert.match(adoption, /E2E_RUN_ID/);
  assert.match(adoption, /Do not set `testDir`\s+to the repo root/);

  // Canonical paths match the post-#116 model: folder-per-screen tests + plan/draft tree.
  assert.match(adoption, /tests\/web\/\{domain\}\/\{screen-slug\}\/<suite>\.spec\.ts/);
  assert.match(adoption, /tests\/web-plans\/\{domain\}\/\{screen-slug\}\/plan\.md/);
  assert.match(adoption, /tests\/web-plans\/\{domain\}\/\{screen-slug\}\/drafts\/\{run-id\}\/plan\.md/);
  assert.match(adoption, /setup\s+required/);
  assert.match(adoption, /Review checklist/);
  assert.match(adoption, /behavior-only planning/);
  assert.match(adoption, /When reviewing a plan/);
  assert.match(adoption, /Ambiguous candidates are marked `needs-human-decision`/);
  assert.match(adoption, /No visual spec or screenshot artifact was created in plan-only mode/);

  // It must not reintroduce retired/forbidden surface into a consumer-facing e2e doc.
  assert.doesNotMatch(adoption, /tests\/web\/\{domain\}\/\{screen-slug\}\.spec\.ts/);
  assert.doesNotMatch(adoption, /scenario-slug/);
  assert.doesNotMatch(adoption, /Verification Matrix/);

  // It is non-gating, like the rest of the optional E2E surface.
  assert.match(adoption, /never a gate/);
  assert.match(adoption, /optional/i);

  // It is discoverable from the README, the ownership map, and the skill.
  assert.match(readme, /docs\/reference\/e2e-consumer-adoption\.md/);
  assert.match(ownership, /e2e-consumer-adoption\.md/);
  assert.match(skill, /e2e-consumer-adoption\.md/);
});

test('no skill embeds the canonical task-artifact matrix or generated-file tables', () => {
  const skillsDir = path.join(KIT_ROOT, 'skills');
  const skillFiles = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(skillsDir, e.name, 'SKILL.md'))
    .filter((p) => fs.existsSync(p));
  assert.ok(skillFiles.length >= 2, 'expected at least the two workflow skills with SKILL.md');
  for (const file of skillFiles) {
    const raw = fs.readFileSync(file, 'utf8');
    const rel = path.relative(KIT_ROOT, file).replace(/\\/g, '/');
    // The canonical task-artifact matrix header must live only in task-artifact-matrix.md.
    assert.doesNotMatch(raw, /\|\s*Task\s*\|\s*Read first\s*\|\s*May update\s*\|/i, `${rel} must not embed the task-artifact matrix`);
    // The canonical generated-file regeneration table must live only in generated-files.md.
    assert.doesNotMatch(raw, /\|\s*Generated file[^|\n]*\|\s*Regenerate with\s*\|/i, `${rel} must not embed the generated-file table`);
  }
});

test('reconcile-input keeps the critical register/gate invariants inline (not just linked)', () => {
  const skill = fs.readFileSync(path.join(KIT_ROOT, 'skills', 'reconcile-input', 'SKILL.md'), 'utf8');
  // The executor needs these in-hand to act safely without a second read.
  assert.match(skill, /register-first/);
  assert.match(skill, /gate raising only/i);
  assert.match(skill, /`reconciled` → \*\*멈춘다/);
  assert.match(skill, /`failed` → 새 행을 만들지 않는다/);
  assert.match(skill, /`not-started` → 같은 행을 `in-progress` 로 이동한다/);
  // Identity is never invented from a source code; ambiguous identity routes to Stage 02.
  assert.match(skill, /canonical Screen ID 를 발명하지 않는다/);
  assert.match(skill, /02-screen-identity-source-mapping\.md/);
});

test('safety invariants removed from skills still live in canonical references', () => {
  const refDir = path.join(KIT_ROOT, 'docs', 'reference');
  const read = (p) => fs.readFileSync(path.join(refDir, p), 'utf8');
  const reconciliation = read('input-reconciliation.md');
  const generated = read('generated-files.md');
  const identity = read('screen-identity.md');
  const stage06 = read('workflow-stages/06-implement-screen-or-code.md');
  const stage09 = read('workflow-stages/09-human-decision-gates.md');

  // register-first + same-input retry row reuse
  assert.match(reconciliation, /register-first/);
  assert.match(reconciliation, /Retry updates that row/);
  // gate raising only (agents raise gates, people lower them) — match the full principle
  assert.match(reconciliation, /gate raising only/i);
  assert.match(stage09, /Agents \*\*raise\*\* gates; people \*\*lower\*\* them/);
  // generated files are not hand-edited, and a concrete regeneration command stays listed
  assert.match(generated, /Do not hand-edit/i);
  assert.match(generated, /workflow:catalog/);
  // source ids are aliases (not canonical); the canonical screen id is workflow-owned
  assert.match(identity, /aliases \/ evidence\*\*, not canonical/);
  assert.match(identity, /워크플로우가 소유|workflow-owned/);
  // component gaps are proposal-only (accept is human)
  assert.match(reconciliation, /accept\(카탈로그 반영\)·구현은 사람/);
  // live policy is not replaced by a draft
  assert.match(reconciliation, /live policy replacement 아님|implementation-mode-policy\.yaml replacement/);
  // allowed_paths / forbidden_paths invariant home
  assert.match(stage06, /allowed_paths/);
  assert.match(stage06, /forbidden_paths/);
});

// --- Session-learnings capture surface: lightweight, manual, non-gating review backlog. ---
// These checks pin the wiring so the feature cannot silently lose its template, skill, or the
// docs that tell an agent when (optionally) to capture a learning — and so its safety framing
// (no auto-issues, no secrets, not a source of truth, not a gate) stays in the text.

test('session-learnings capture surface is wired into template, skill, schema, stage 08, AGENTS, and the task matrix', () => {
  const template = fs.readFileSync(path.join(KIT_ROOT, 'templates', 'meta', 'session-learnings.template.md'), 'utf8');
  const skill = fs.readFileSync(path.join(KIT_ROOT, 'skills', 'capture-learning', 'SKILL.md'), 'utf8');
  const schema = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'schemas', 'frontmatter.schema.json'), 'utf8'));
  const stage08 = fs.readFileSync(path.join(KIT_ROOT, 'docs', 'reference', 'workflow-stages', '08-validate-and-report.md'), 'utf8');
  const startHere = fs.readFileSync(path.join(KIT_ROOT, 'docs', 'reference', 'workflow-stages', '00-start-here.md'), 'utf8');
  const agents = fs.readFileSync(path.join(KIT_ROOT, 'templates', 'repo', 'AGENTS.template.md'), 'utf8');
  const matrix = fs.readFileSync(path.join(KIT_ROOT, 'docs', 'reference', 'task-artifact-matrix.md'), 'utf8');

  // Template: meta-register frontmatter (screen-source-map family), review-backlog framing,
  // context-quality guidance, manual review steps, and the structured entry schema.
  assert.match(template, /artifact_type: session-learnings/);
  assert.match(template, /status: draft/);
  assert.match(template, /review backlog/i);
  assert.match(template, /source of truth/);
  assert.match(template, /not\*\* a gate/);
  assert.match(template, /memory store/);
  assert.match(template, /does not file GitHub issues/);
  assert.match(template, /Never record secrets/);
  assert.match(template, /Minimum context checklist/);
  assert.match(template, /future reconstructability/i);
  assert.match(template, /How to review/);
  assert.match(template, /Group entries by/);
  assert.match(template, /LRN-0001/);
  assert.match(template, /consumer-repo/);
  assert.match(template, /frontend-workflow-kit/);
  // Pin the full canonical LRN entry schema (exact column labels) so field drift is caught.
  for (const field of [
    'Date',
    'Repo Scope',
    'Workflow Stage',
    'Trigger',
    'Context Read',
    'Expected',
    'Actual / Friction',
    'Workaround Used',
    'Evidence',
    'Suspected Root Cause',
    'Impact',
    'Candidate Follow-up',
    'Owner Guess',
    'Status',
  ]) {
    assert.match(template, new RegExp(`\\|\\s*${field.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s*\\|`), `template should keep LRN field "${field}"`);
  }

  // Skill: short, template-driven, classifies scope, never auto-files, never records secrets,
  // never invents missing facts, and links the template + spine + stage 08.
  assert.match(skill, /^name: capture-learning$/m);
  assert.match(skill, /_meta\/session-learnings\.md/);
  assert.match(skill, /templates\/meta\/session-learnings\.template\.md/);
  assert.match(skill, /workflow-spine\.md/);
  assert.match(skill, /08-validate-and-report\.md/);
  assert.match(skill, /이슈를 자동 생성하지 않는다/);
  assert.match(skill, /비밀을 기록하지 않는다/);
  assert.match(skill, /consumer-repo.*frontend-workflow-kit.*both.*unknown/);
  assert.match(skill, /LRN-####/);
  assert.match(skill, /발명하지 않는다/);
  assert.match(skill, /모르면[^\n]*unknown/);
  // The report-summary example must use a valid Repo Scope enum value in the {scope} slot,
  // not a bare "kit" (matches Stage 08's "({scope}, {candidate follow-up})" pattern).
  assert.doesNotMatch(skill, /\(kit,/, 'skill example {scope} should be a Repo Scope enum value (frontend-workflow-kit), not "kit"');
  const skillLines = skill.split('\n').length;
  assert.ok(skillLines <= 80, `capture-learning/SKILL.md should stay short (<=80 lines), got ${skillLines}`);

  // Schema: artifact_type enum carries session-learnings (consistent with screen-source-map).
  assert.ok(
    schema.properties.artifact_type.enum.includes('session-learnings'),
    'frontmatter schema enum should include session-learnings',
  );

  // Stage 08: optional, non-gating capture step + skill/template links + handoff summary field.
  assert.match(stage08, /capture-learning/);
  assert.match(stage08, /session-learnings/);
  assert.match(stage08, /optional and never a gate/i);
  assert.match(stage08, /Learnings captured/);
  assert.match(stage08, /LRN-0007/);
  assert.match(stage08, /\.\.\/\.\.\/\.\.\/skills\/capture-learning\/SKILL\.md/);

  // Start Here router: a row points the capture ask at Stage 08 + capture-learning.
  assert.match(startHere, /capture-learning/);
  assert.match(startHere, /session-learnings/);
  assert.match(startHere, /\|\s*08\s*\|\s*capture-learning/);

  // AGENTS template: session-end prompt with the non-negotiable guardrails.
  assert.match(agents, /session-learnings/);
  assert.match(agents, /capture-learning/);
  assert.match(agents, /do not store secrets/i);
  assert.match(agents, /do not file issues automatically/i);

  // Task matrix: a capture row in both the main matrix and the stage reference.
  assert.match(matrix, /Capture a workflow \/ adoption learning/);
  assert.match(matrix, /session-learnings\.md/);
  assert.match(matrix, /auto-file GitHub issues/);
  assert.match(matrix, /Treat captured entries as source of truth/);
  assert.match(matrix, /Capture a workflow \/ adoption learning \| 08/);
});

// --- Manifest ↔ schema ↔ template artifact_type consistency (#153 ⑤) -------------------
// A document authored from a shipped template must not violate validate 검사 1: every
// authoring artifact whose required_frontmatter includes artifact_type must have its
// manifest key in the frontmatter schema artifact_type enum, and its template must stamp
// that same artifact_type. This pins the kit against self-contradictions like the
// visual-consistency-contract enum omission observed by consumer adoption.
test('artifact-manifest authoring keys are in the frontmatter schema artifact_type enum and templates agree', () => {
  const manifest = loadYaml(path.join(KIT_ROOT, 'catalog', 'artifact-manifest.yaml'));
  const schema = JSON.parse(
    fs.readFileSync(path.join(KIT_ROOT, 'schemas', 'frontmatter.schema.json'), 'utf8'),
  );
  const enumValues = schema.properties.artifact_type.enum;
  const authoringKeys = Object.entries(manifest.artifacts)
    .filter(
      ([, a]) =>
        a.kind === 'authoring' &&
        Array.isArray(a.required_frontmatter) &&
        a.required_frontmatter.includes('artifact_type'),
    )
    .map(([key]) => key);
  // The regression that motivated this test stays pinned explicitly (#153 ⑤).
  assert.ok(authoringKeys.includes('visual-consistency-contract'));
  for (const key of authoringKeys) {
    assert.ok(
      enumValues.includes(key),
      `frontmatter schema artifact_type enum must include manifest authoring key "${key}"`,
    );
    const template = fs.readFileSync(path.join(KIT_ROOT, manifest.artifacts[key].template), 'utf8');
    assert.match(
      template,
      new RegExp(`^artifact_type:\\s*"?${key}"?\\s*(?:#.*)?$`, 'm'),
      `template for "${key}" must stamp artifact_type: ${key}`,
    );
  }
});

// --- IMP-05 (#166): packed-payload CLI smoke — core / adoption / observation / visual. ---
// One pack, one consumer-like payload under os.tmpdir() (examples/** is never packed), and
// every check spawns the PUBLIC CLIs with cwd = payload root. Running from tmpdir is the
// witness that no packed script accidentally imports from the kit source tree, and the
// missing examples/ tree is the witness for the fail-soft cold-start contract.
// Golden hygiene: assertions never touch absolute paths or wall-clock timestamps —
// date-bearing flows pass an explicit --date, and the written artifacts are scanned to
// prove no absolute path leaked into them.
// These are kit-repo release checks only: the observed CLIs stay warning-first for
// consumers (no new hard gate, no warning-first promotion, no new artifact axis).
test('packed payload CLI smoke: core, adoption, observation, visual (IMP-05)', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-pack-smoke-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const out = path.join(tmp, 'frontend-workflow-kit');

  const pack = spawnSync(process.execPath, [PACK_CLI, '--out', out, '--json'], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(pack.status, 0, pack.stderr);
  linkInstalledDependency(out, 'yaml');

  const cli = (script, ...args) =>
    spawnSync(process.execPath, [path.join(out, 'scripts', script), ...args], {
      cwd: out,
      encoding: 'utf8',
    });
  const SMOKE_DATE = '2026-07-01';

  await t.test('payload integrity: upgrade-planner files, package-scripts targets, relative links', () => {
    // Upgrade planner ships complete: entry CLI + its lib imports + the payload manifest it plans against.
    for (const rel of [
      'scripts/upgrade-vendored-kit.mjs',
      'scripts/lib/upgrade-planner.mjs',
      'scripts/lib/kit-manifest.mjs',
      'scripts/lib/util.mjs',
      '.kit-payload-manifest.json',
    ]) {
      assert.equal(exists(rel, out), true, `${rel} is required by the upgrade planner`);
    }
    const upgradeHelp = cli('upgrade-vendored-kit.mjs', '--help');
    assert.equal(upgradeHelp.status, 0, upgradeHelp.stderr);
    assert.match(upgradeHelp.stdout, /--current/);
    assert.match(upgradeHelp.stdout, /--next/);

    // Every package-scripts.template.json target must exist inside the payload.
    const scriptsTemplate = JSON.parse(
      fs.readFileSync(path.join(out, 'package-scripts.template.json'), 'utf8'),
    );
    const targets = Object.entries(scriptsTemplate.scripts);
    assert.ok(targets.length > 0, 'package-scripts.template.json should define scripts');
    for (const [name, command] of targets) {
      const match = command.match(/^node tools\/frontend-workflow\/(scripts\/[\w./-]+\.mjs)$/);
      assert.ok(match, `${name} should invoke a payload script (got: ${command})`);
      assert.equal(exists(match[1], out), true, `${name} target ${match[1]} must be packed`);
    }

    // Relative links inside the packed payload, checked with the SHIPPED doc-drift CLI
    // (it already ignores code fences/spans and link-shaped prose examples). Asserting
    // zero warnings here is a kit release check on the payload we ship; the consumer-side
    // tool itself stays warning-first exit 0.
    const drift = cli('doc-drift.mjs', '--json');
    assert.equal(drift.status, 0, drift.stderr);
    const driftReport = JSON.parse(drift.stdout);
    assert.equal(driftReport.tool, 'workflow:doc-drift');
    assert.equal(driftReport.mode, 'warning-first');
    assert.equal(driftReport.ok, true);
    assert.equal(
      driftReport.warning_count,
      0,
      `packed payload should have no broken relative links: ${JSON.stringify(driftReport.findings)}`,
    );
  });

  await t.test('observation surfaces run from the payload: redteam, telemetry --list-surfaces', () => {
    // eval + full telemetry runs are covered by the dedicated packed-eval test above.
    const redteam = cli('redteam.mjs', '--json');
    assert.equal(redteam.status, 0, redteam.stderr);
    const redteamReport = JSON.parse(redteam.stdout);
    assert.equal(redteamReport.tool, 'workflow:redteam');
    assert.equal(redteamReport.mode, 'warning-first');
    assert.ok(redteamReport.summary.case_count > 0, 'redteam should run its bundled cases');
    assert.equal(redteamReport.summary.input_error_count, 0);

    // Usage/config errors exit 2 (never absorbed into the warning-first report).
    const redteamBadGroup = cli('redteam.mjs', '--include', '__no-such-group__', '--json');
    assert.equal(redteamBadGroup.status, 2);
    assert.match(redteamBadGroup.stderr, /unknown redteam group/);

    // --list-surfaces prints the registry without running any child CLI.
    const surfaces = cli('telemetry.mjs', '--list-surfaces', '--json');
    assert.equal(surfaces.status, 0, surfaces.stderr);
    const registry = JSON.parse(surfaces.stdout);
    assert.equal(registry.tool, 'workflow:telemetry');
    const ids = registry.surfaces.map((s) => s.surface_id);
    for (const id of [
      'route-cross-check',
      'doc-drift',
      'readiness-eval',
      'visual-consistency',
      'visual-contract-bootstrap',
      'redteam',
    ]) {
      assert.ok(ids.includes(id), `telemetry surface registry should list ${id}`);
    }
  });

  await t.test('core cold start without examples is fail-soft; readiness fails closed without state', () => {
    // state --json: report-only, exit 0, empty screens — no examples/** required.
    const state = cli('workflow-state.mjs', '--json');
    assert.equal(state.status, 0, state.stderr);
    const stateReport = JSON.parse(state.stdout);
    assert.deepEqual(stateReport.state.screens, {});
    assert.deepEqual(stateReport.inventory.screens, []);

    // readiness without workflow-state.yaml: fail-closed usage/input error (exit 2), not a silent pass.
    const readiness = cli('readiness.mjs', '--json');
    assert.equal(readiness.status, 2);
    assert.match(readiness.stderr, /workflow-state\.yaml/);

    // validate on an empty consumer repo: vacuous pass is exit 0 but loudly warned (cold-start).
    const validate = cli('validate.mjs', '--json');
    assert.equal(validate.status, 0, validate.stderr);
    const validateReport = JSON.parse(validate.stdout);
    assert.equal(validateReport.ok, true);
    assert.equal(validateReport.count, 0);
    assert.ok(
      validateReport.warnings.some((w) => w.check === 'cold-start'),
      'empty payload validate should carry the cold-start warning',
    );

    // visual-consistency structural error path: missing docs root is exit 1 (not a skip).
    const visualNoDocs = cli('visual-consistency.mjs', '--json');
    assert.equal(visualNoDocs.status, 1);
    const visualNoDocsReport = JSON.parse(visualNoDocs.stdout);
    assert.equal(visualNoDocsReport.skipped, false);
    assert.ok(visualNoDocsReport.findings.some((f) => f.rule === 'docs-not-found'));
  });

  await t.test('core CLI argument contract from the packed payload: help + usage errors before any write', () => {
    // 공개 CLI 를 payload 에서 직접 spawn — source tree import 에 우연히 의존하지 않는다.
    // workflow-state: --help 는 exit 0 이고 payload 트리를 건드리지 않는다.
    const stateHelp = cli('workflow-state.mjs', '--help');
    assert.equal(stateHelp.status, 0, stateHelp.stderr);
    assert.match(stateHelp.stdout, /workflow:state/);
    assert.match(stateHelp.stdout, /--date/);
    // unknown flag(--jsno 오타)는 파일 IO 전에 exit 2 — JSON 대신 실제 쓰기로 진행되지 않는다.
    const stateTypo = cli('workflow-state.mjs', '--jsno');
    assert.equal(stateTypo.status, 2);
    assert.match(stateTypo.stderr, /unknown option --jsno/);
    assert.equal(exists('docs/frontend-workflow/_meta', out), false, '--jsno must not write _meta');
    // readiness: --help 는 workflow-state.yaml 이 아직 없어도 성공한다(인자 검증·help 가 state 로드보다 먼저).
    const readinessHelp = cli('readiness.mjs', '--help');
    assert.equal(readinessHelp.status, 0, readinessHelp.stderr);
    assert.match(readinessHelp.stdout, /workflow:readiness/);
    // --screeen 오타는 usage 오류(exit 2, unknown option)다 — state 부재 입력 오류로도,
    // 전체 화면 출력 fallback 으로도 흡수되지 않는다.
    const readinessTypo = cli('readiness.mjs', '--screeen', 'COUPON-001');
    assert.equal(readinessTypo.status, 2);
    assert.match(readinessTypo.stderr, /unknown option --screeen/);
    assert.doesNotMatch(readinessTypo.stderr, /workflow-state\.yaml/);
    assert.equal(readinessTypo.stdout, '');
    // forbidden-paths: --help 는 state/policy 없는 payload 에서도 exit 0 (인자 검증·help 가 모든 로드보다 먼저).
    const forbiddenHelp = cli('forbidden-paths.mjs', '--help');
    assert.equal(forbiddenHelp.status, 0, forbiddenHelp.stderr);
    assert.match(forbiddenHelp.stdout, /workflow:forbidden-paths/);
    assert.match(forbiddenHelp.stdout, /--enforce/);
    // --enforc 오타는 usage 오류 exit 2 — enforcement 소실 warning-first fallback 으로 절대 내려가지 않는다.
    const forbiddenTypo = cli('forbidden-paths.mjs', '--enforc');
    assert.equal(forbiddenTypo.status, 2);
    assert.match(forbiddenTypo.stderr, /unknown option --enforc/);
    assert.doesNotMatch(forbiddenTypo.stderr, /workflow-state/);
    assert.equal(forbiddenTypo.stdout, '');

    // Generated views: packed help and typos are side-effect-free before any input scan/write.
    for (const [script, tool] of [
      ['route-tree.mjs', 'workflow:route-tree'],
      ['nav-graph.mjs', 'workflow:nav-graph'],
      ['catalog-gen.mjs', 'workflow:catalog'],
    ]) {
      const help = cli(script, '--help');
      assert.equal(help.status, 0, help.stderr);
      assert.match(help.stdout, new RegExp(tool));
      const typo = cli(script, '--outt', path.join(out, 'requested-by-typo'));
      assert.equal(typo.status, 2);
      assert.match(typo.stderr, /unknown option --outt/);
      assert.equal(typo.stdout, '');
    }
    assert.equal(exists('docs/frontend-workflow/_meta/route-tree.txt', out), false);
    assert.equal(exists('docs/frontend-workflow/_meta/nav-graph.yaml', out), false);
    assert.equal(exists('docs/frontend-workflow/design/component-catalog.md', out), false);
    assert.equal(exists('requested-by-typo', out), false);

    // Each packed CLI also completes one normal fixture run without source-tree imports.
    const generatedFixtures = path.join(out, 'temp', 'generated-view-fixtures');
    const routeApp = path.join(generatedFixtures, 'route', 'src', 'app');
    fs.mkdirSync(routeApp, { recursive: true });
    fs.writeFileSync(path.join(routeApp, 'index.tsx'), 'export default function Home() { return null; }\n');
    const routeOut = path.join(generatedFixtures, 'route-tree.txt');
    const route = cli('route-tree.mjs', '--app', routeApp, '--out', routeOut);
    assert.equal(route.status, 0, route.stderr);
    assert.match(fs.readFileSync(routeOut, 'utf8'), /route: \//);

    const navDocs = path.join(generatedFixtures, 'nav', 'docs', 'frontend-workflow');
    fs.mkdirSync(navDocs, { recursive: true });
    const navOut = path.join(generatedFixtures, 'nav-graph.yaml');
    const nav = cli('nav-graph.mjs', '--docs', navDocs, '--out', navOut);
    assert.equal(nav.status, 0, nav.stderr);
    assert.match(fs.readFileSync(navOut, 'utf8'), /screens: \{\}/);

    const catalogSrc = path.join(generatedFixtures, 'catalog', 'src', 'components', 'ui');
    fs.mkdirSync(catalogSrc, { recursive: true });
    fs.writeFileSync(path.join(catalogSrc, 'Button.tsx'), 'export function Button() { return null; }\n');
    const catalogOut = path.join(generatedFixtures, 'component-catalog.md');
    const catalog = cli('catalog-gen.mjs', '--src', path.join(generatedFixtures, 'catalog', 'src'), '--out', catalogOut);
    assert.equal(catalog.status, 0, catalog.stderr);
    assert.match(fs.readFileSync(catalogOut, 'utf8'), /\| Button \| src\/components\/ui\/Button\.tsx \|/);

    // adoption-probe: help/usage must not create the draft run tree, even in the payload.
    const adoptionOut = path.join(out, 'temp', 'runs', 'adoption-probe-packed-help');
    const adoptionHelp = cli(
      'adoption-probe.mjs',
      '--repo', out,
      '--out', adoptionOut,
      '--id', 'packed-help',
      '--help',
    );
    assert.equal(adoptionHelp.status, 0, adoptionHelp.stderr);
    assert.match(adoptionHelp.stdout, /workflow:adoption-probe/);
    assert.equal(fs.existsSync(adoptionOut), false);
    const adoptionTypo = cli('adoption-probe.mjs', '--repo', out, '--id', 'packed-typo', '--hlep');
    assert.equal(adoptionTypo.status, 2);
    assert.match(adoptionTypo.stderr, /unknown option --hlep/);
    assert.equal(exists('temp/runs/adoption-probe-packed-typo', out), false);
    const adoptionBooleanValue = cli(
      'adoption-probe.mjs',
      '--repo', out,
      '--id', 'packed-visual-false',
      '--visual=false',
    );
    assert.equal(adoptionBooleanValue.status, 2);
    assert.match(adoptionBooleanValue.stderr, /--visual does not accept a value/);
    assert.equal(exists('temp/runs/adoption-probe-packed-visual-false', out), false);
  });

  await t.test('adoption CLIs bootstrap a consumer docs tree: doctor, create-screen, create-input', () => {
    const doctor = cli('doctor.mjs', '--json');
    assert.equal(doctor.status, 0, doctor.stderr);
    const doctorReport = JSON.parse(doctor.stdout);
    assert.equal(doctorReport.tool, 'workflow:doctor');
    assert.equal(doctorReport.ok, true);

    // Usage error path: an invalid canonical screen id is exit 2.
    const badScreen = cli('create-screen.mjs', '--domain', 'coupon', '--screen-id', 'COUPON/LIST', '--route', '/coupons', '--json');
    assert.equal(badScreen.status, 2);
    assert.match(badScreen.stderr, /screen_id/);

    const screen = cli(
      'create-screen.mjs',
      '--domain', 'coupon',
      '--screen-id', 'COUPON-LIST',
      '--route', '/coupons',
      '--date', SMOKE_DATE,
      '--json',
    );
    assert.equal(screen.status, 0, screen.stderr);
    const screenReport = JSON.parse(screen.stdout);
    assert.equal(screenReport.screen_id, 'COUPON-LIST');
    assert.equal(screenReport.wrote, true);
    const screenSpecRel = 'docs/frontend-workflow/domains/coupon/screens/coupon-list/screen-spec.md';
    assert.equal(exists(screenSpecRel, out), true, 'create-screen should write the stub ScreenSpec');

    // Usage error path: unknown flag is exit 2.
    const badInput = cli('create-input-artifact.mjs', '--id', 'x', '--json');
    assert.equal(badInput.status, 2);
    assert.match(badInput.stderr, /unknown flag/);

    const input = cli(
      'create-input-artifact.mjs',
      '--source', 'figma',
      '--input-type', 'figma',
      '--source-type', 'figma',
      '--source-ref', 'figma://file/abc',
      '--captured-by', 'figma-adapter',
      '--domain', 'coupon',
      '--screen', 'COUPON-LIST',
      '--summary', 'Coupon list',
      '--fact', 'List shows coupons',
      '--date', SMOKE_DATE,
      '--json',
    );
    assert.equal(input.status, 0, input.stderr);
    const inputReport = JSON.parse(input.stdout);
    // Deterministic id: derived from the explicit --date, never from the wall clock.
    assert.equal(inputReport.input_id, 'IN-20260701-figma-001');
    assert.equal(exists('docs/frontend-workflow/inputs/IN-20260701-figma-001.md', out), true);

    // Golden hygiene: authored artifacts must not embed the tmp payload's absolute path.
    for (const rel of [screenSpecRel, 'docs/frontend-workflow/inputs/IN-20260701-figma-001.md']) {
      const raw = fs.readFileSync(path.join(out, rel), 'utf8');
      assert.doesNotMatch(raw, /fwk-pack-smoke-/, `${rel} must not embed the payload absolute path`);
    }

    // Normal packed adoption-probe remains compatible and imports only payload files.
    const probe = cli(
      'adoption-probe.mjs',
      '--repo', out,
      '--id', 'packed-normal',
      '--date', SMOKE_DATE,
      '--skip-f3',
      '--json',
    );
    assert.equal(probe.status, 0, probe.stderr);
    const probeOutputs = JSON.parse(probe.stdout);
    // macOS realpaths os.tmpdir() from /var/... to /private/var/..., so pathRef may
    // choose either the cwd-relative or <probe-run> base. Pin the stable contract:
    // no absolute temp path leaks, the report suffix is preserved, and the file exists.
    const adoptionReportRef = probeOutputs.adoption_report.replace(/\\/g, '/');
    assert.match(adoptionReportRef, /(?:^|\/)adoption-report\.md$/);
    assert.equal(path.isAbsolute(adoptionReportRef), false);
    assert.doesNotMatch(adoptionReportRef, /fwk-pack-smoke-/);
    assert.equal(exists('temp/runs/adoption-probe-packed-normal/adoption-report.md', out), true);
    const probeSummary = JSON.parse(
      fs.readFileSync(path.join(out, 'temp', 'runs', 'adoption-probe-packed-normal', 'probe-summary.json'), 'utf8'),
    );
    assert.equal(probeSummary.draft_only, true);
    assert.equal(probeSummary.invariants.hard_gate_promoted, false);
  });

  await t.test('core post-bootstrap: state writes meta, readiness evaluates, validate blocks (exit 1)', () => {
    // Write mode (no --json) persists the derived state views.
    const stateWrite = cli('workflow-state.mjs', '--date', SMOKE_DATE);
    assert.equal(stateWrite.status, 0, stateWrite.stderr);
    for (const rel of [
      'docs/frontend-workflow/_meta/workflow-state.yaml',
      'docs/frontend-workflow/_meta/screen-inventory.yaml',
    ]) {
      assert.equal(exists(rel, out), true, `${rel} should be written by workflow:state`);
      const raw = fs.readFileSync(path.join(out, rel), 'utf8');
      assert.doesNotMatch(raw, /fwk-pack-smoke-/, `${rel} must not embed the payload absolute path`);
    }
    const stateYaml = fs.readFileSync(path.join(out, 'docs/frontend-workflow/_meta/workflow-state.yaml'), 'utf8');
    assert.match(
      stateYaml,
      new RegExp(`generated_at: ["']?${SMOKE_DATE}`),
      'workflow-state.yaml should stamp the explicit --date, not the wall clock',
    );

    const readiness = cli('readiness.mjs', '--screen', 'COUPON-LIST', '--json');
    assert.equal(readiness.status, 0, readiness.stderr);
    const readinessReport = JSON.parse(readiness.stdout)['COUPON-LIST'];
    assert.ok(readinessReport, 'readiness should report the bootstrapped screen');
    assert.equal(readinessReport.readiness_mode, 'docs-only');
    assert.ok(readinessReport.allowed_paths.includes('docs/frontend-workflow/**'));
    assert.ok(readinessReport.forbidden_paths.includes('src/**'));
    assert.ok(readinessReport.blocking.length > 0, 'a stub screen must stay blocked (docs-only)');

    // validate exit 1 path: the stub depends on a navigation-map that does not exist yet.
    const validate = cli('validate.mjs', '--json');
    assert.equal(validate.status, 1);
    const validateReport = JSON.parse(validate.stdout);
    assert.equal(validateReport.ok, false);
    assert.ok(
      validateReport.errors.some((e) => /navigation-map/.test(e.message)),
      `validate should block on the missing navigation-map: ${JSON.stringify(validateReport.errors)}`,
    );
  });

  await t.test('visual: contract-absent safe skip and review-only bootstrap smoke', () => {
    // A docs tree without a visual contract is a quiet warning-first skip, never a block.
    const visual = cli('visual-consistency.mjs', '--json');
    assert.equal(visual.status, 0, visual.stderr);
    const visualReport = JSON.parse(visual.stdout);
    assert.equal(visualReport.contract_found, false);
    assert.equal(visualReport.skipped, true);
    assert.equal(visualReport.ok, true);
    assert.equal(visualReport.summary.errors, 0);

    // Structural smoke of the bootstrap helper: review-only, sees the screen, writes nothing.
    const bootstrap = cli('visual-contract-bootstrap.mjs', '--json');
    assert.equal(bootstrap.status, 0, bootstrap.stderr);
    const bootstrapReport = JSON.parse(bootstrap.stdout);
    assert.equal(bootstrapReport.mode, 'review-only');
    assert.equal(bootstrapReport.summary.screens, 1);
    assert.equal(bootstrapReport.existing_contract.found, false);
    assert.equal(
      exists('docs/frontend-workflow/design/visual-consistency-contract.md', out),
      false,
      'bootstrap smoke must not create a canonical contract',
    );
  });
});

test('optional skill surfaces have no broken relative links', () => {
  const files = [
    path.join(KIT_ROOT, 'skills', 'e2e-agent', 'SKILL.md'),
    path.join(KIT_ROOT, 'skills', 'capture-learning', 'SKILL.md'),
    path.join(KIT_ROOT, 'docs', 'reference', 'e2e-consumer-adoption.md'),
    path.join(KIT_ROOT, 'docs', 'reference', 'e2e-playwright-agents.md'),
    path.join(KIT_ROOT, 'templates', 'e2e', 'web-plan.template.md'),
    path.join(KIT_ROOT, 'templates', 'meta', 'session-learnings.template.md'),
  ];
  const linkRe = /\]\(([^)]+)\)/g;
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = linkRe.exec(raw)) !== null) {
      const target = match[1].trim();
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const rel = target.split('#')[0];
      if (!rel) continue;
      const resolved = path.resolve(path.dirname(file), rel);
      assert.equal(
        fs.existsSync(resolved),
        true,
        `${path.relative(KIT_ROOT, file).replace(/\\/g, '/')} links to missing ${target}`,
      );
    }
  }
});
