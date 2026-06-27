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
  assert.equal(summary.files.includes('docs/reference/workflow-spine.md'), true);
  assert.equal(summary.files.includes('docs/reference/workflow-stages/00-start-here.md'), true);
  assert.equal(summary.files.includes('docs/reference/workflow-stages/10-policy-layout-tier3-changes.md'), true);
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
