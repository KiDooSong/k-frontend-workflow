import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { KIT_ROOT, yamlParse, yamlStringify } from './util.mjs';
import { evaluateVisualRefreshAuthority } from './visual-refresh-runtime.mjs';

const READINESS = path.join(KIT_ROOT, 'scripts', 'readiness.mjs');
const BACKSTOP = path.join(KIT_ROOT, 'scripts', 'forbidden-paths.mjs');
const PACKET = path.join(KIT_ROOT, 'scripts', 'workflow-packet.mjs');
const REPORT = path.join(KIT_ROOT, 'scripts', 'workflow-report.mjs');
const RUN = path.join(KIT_ROOT, 'scripts', 'workflow-run.mjs');
const SKILL = path.join(KIT_ROOT, 'skills', 'implement-screen', 'SKILL.md');
const INPUT_ID = 'IN-20260904-figma-001';
const SCREEN_ID = 'SHOP-HOME';
const SCREEN_PATH = 'src/features/shop/screens/ShopScreen.tsx';
const SPAWN_TIMEOUT = 60_000;

function tmpdir(t, prefix = 'visual-refresh-followup-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, relative, content) {
  const file = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  return file;
}
function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}
function run(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: SPAWN_TIMEOUT,
  });
}
function requireCaseAlias(t, root, canonical, alias) {
  let samePhysical = false;
  try {
    const first = fs.statSync(path.join(root, canonical), { bigint: true });
    const second = fs.statSync(path.join(root, alias), { bigint: true });
    samePhysical = first.dev === second.dev && first.ino === second.ino;
  } catch {}
  // Do not use realpath string equality to decide whether to skip: the behavior
  // under test is precisely that case aliases can identify one file differently.
  if (process.platform === 'darwin' && process.env.CI) {
    assert.equal(samePhysical, true, 'macOS CI must exercise case-insensitive identity, not silently skip it');
  }
  if (!samePhysical) t.skip('requires a case-insensitive filesystem');
  return samePhysical;
}
function stateRows() {
  return ['loading', 'empty', 'error', 'success', 'disabled', 'refreshing']
    .map((state) => `| ${state} | fixture | ${state} UI | none |`)
    .join('\n');
}
function screenSpec({ screenPath = SCREEN_PATH, screenId = SCREEN_ID } = {}) {
  return `---
artifact_id: ${screenId}-screen-spec
artifact_type: screen-spec
domain: shop
screen_id: ${screenId}
route: /shop
screen_entry: ${screenPath}
status: confirmed
---

# Shop

## Purpose

Render the shop screen.

## State Matrix

| State | Trigger | UI | User Action |
|---|---|---|---|
${stateRows()}

## API Candidates

| Method | Path | Confidence | Gate | Tracking | Slice Paths |
|---|---|---|---|---|---|
| GET | /shop | confirmed | active | - | src/features/shop/hooks/useShop.ts |

## Unknowns

없음
`;
}
function inputArtifact() {
  return `---
input_id: ${INPUT_ID}
input_type: figma
source_type: figma
source_ref: "figma://file/shop/frame/10:20"
captured_at: "2026-09-04T09:00:00+09:00"
captured_by: followup-test
status: captured
affected_domains: [shop]
affected_screens: [${SCREEN_ID}]
confidence: confirmed
supersedes: null
---

## Extracted Facts

- The primary shop card spacing is 16px.
`;
}
function mappingArtifact() {
  return `---
artifact_id: ${SCREEN_ID}-figma-component-mapping
artifact_type: figma-component-mapping
domain: shop
screen_id: ${SCREEN_ID}
status: draft
sources:
  - type: figma
    ref: "figma://file/shop/frame/10:20"
last_reviewed: "2026-09-04"
provenance_contract: 1
---

## Frame

- figma://file/shop/frame/10:20

## Component Mapping

| Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고 |
|---|---|---|---|
| \`M-001\` · Shop / node \`1:234\` | Primary card | components/ui/Card | spacing refresh |

## Mapping Provenance

| Mapping Key | Source Ref | Source Unit | Captured At | Evidence |
|---|---|---|---|---|
| M-001 | figma://file/shop/node/1:234 | instance | inherit | input:${INPUT_ID}#extracted-facts/01 |
`;
}
function registerArtifact() {
  return `---
title: Reconciliation Register
status: draft
kind: meta-register
reconciliation_contract: 2
review_profile: reconcile-stage04-v1
structured_since: "2026-09-01T00:00:00+09:00"
---

# Reconciliation Register

| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
| ${INPUT_ID} | figma | simple-update | reconciled | accepted | artifact:${SCREEN_ID}-figma-component-mapping | - | - |

## Reconciliation Items

| Input ID | Item | Basis | Classification | Effect | Target | Evidence | Source Ref | Source Unit | Captured At |
|---|---|---|---|---|---|---|---|---|---|
| ${INPUT_ID} | 01 | visual-evidence | simple-update | update | artifact:${SCREEN_ID}-figma-component-mapping#component-mapping/M-001 | input:${INPUT_ID}#extracted-facts/01 | figma://file/shop/node/1:234 | instance | inherit |
`;
}
function copyKitFile(root, target, sourceRelative) {
  const destination = path.join(root, ...target.split('/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(KIT_ROOT, ...sourceRelative.split('/')), destination);
  return destination;
}
function createFixture(t, { explicitResources = false, generatedScreenManifest = false, aliasPath = null } = {}) {
  const root = tmpdir(t);
  git(root, 'init'); git(root, 'config', 'maintenance.auto', 'false'); git(root, 'config', 'gc.auto', '0');
  git(root, 'config', 'user.email', 'visual-refresh@example.com');
  git(root, 'config', 'user.name', 'Visual Refresh Test');
  write(root, 'docs/frontend-workflow/app/navigation-map.md', '---\nartifact_id: navigation-map\nartifact_type: navigation-map\nstatus: draft\n---\n');
  write(root, 'docs/frontend-workflow/design/component-catalog.md', '# GENERATED FILE - DO NOT EDIT\n\n| Name | Source | Export | Status |\n|---|---|---|---|\n');
  write(root, 'docs/frontend-workflow/domains/shop/screens/shop-home/screen-spec.md', screenSpec());
  write(root, 'docs/frontend-workflow/domains/shop/screens/shop-home/figma-component-mapping.md', mappingArtifact());
  write(root, `docs/frontend-workflow/inputs/shop/${INPUT_ID}.md`, inputArtifact());
  write(root, 'docs/frontend-workflow/_meta/reconciliation-register.md', registerArtifact());
  write(root, SCREEN_PATH, 'export const ShopScreen = () => null;\n');
  write(root, 'src/features/shop/hooks/useShop.ts', 'export const useShop = () => ({});\n');

  if (aliasPath) {
    write(root, 'docs/frontend-workflow/domains/shop/screens/shop-alias/screen-spec.md', screenSpec({ screenPath: aliasPath, screenId: 'SHOP-ALIAS' }));
  }

  if (explicitResources) {
    copyKitFile(root, 'config/policy.yaml', 'policies/implementation-mode-policy.yaml');
    copyKitFile(root, 'config/manifest.yaml', 'catalog/artifact-manifest.yaml');
    copyKitFile(root, 'config/layout.yaml', 'policies/project-layout.yaml');
    const policyFile = path.join(root, 'config', 'policy.yaml');
    const policy = yamlParse(fs.readFileSync(policyFile, 'utf8'));
    policy.modes['api-integrated-ui'].allowed_paths.push('{roles.screen}');
    policy.modes['api-integrated-ui'].forbidden_paths = [];
    fs.writeFileSync(policyFile, yamlStringify(policy, { lineWidth: 0 }), 'utf8');
  } else if (generatedScreenManifest) {
    const manifestFile = copyKitFile(root, 'config/manifest.yaml', 'catalog/artifact-manifest.yaml');
    const manifest = yamlParse(fs.readFileSync(manifestFile, 'utf8'));
    manifest.artifacts['followup-generated-screen'] = {
      kind: 'generated',
      scope: 'screen',
      path: SCREEN_PATH,
      outputs: [{ path: SCREEN_PATH }],
      generated: true,
      do_not_edit: true,
      status: 'active',
    };
    fs.writeFileSync(manifestFile, yamlStringify(manifest, { lineWidth: 0 }), 'utf8');
  }

  git(root, 'add', '.');
  git(root, 'commit', '-m', 'authority baseline');
  return root;
}
function visualArgs(root) {
  return ['--root', root, '--screen', SCREEN_ID, '--intent', 'visual-refresh', '--input', INPUT_ID, '--path', SCREEN_PATH, '--json'];
}

test('forward treats a current-worktree generated marker as deny-only ownership evidence', (t) => {
  const root = createFixture(t, { generatedScreenManifest: true });
  write(root, SCREEN_PATH, '// GENERATED FILE - DO NOT EDIT\nexport const ShopScreen = () => null;\n');
  const result = run(READINESS, [...visualArgs(root), '--manifest', 'config/manifest.yaml'], root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.intent_authorization.applicable, false, result.stdout);
  assert.ok(json.intent_authorization.reasons.some((entry) => entry.code === 'VR-PATH-001'), result.stdout);
});

test('a staged explicit authority resource cannot self-grant the same visual diff', (t) => {
  const root = createFixture(t, { explicitResources: true });
  write(root, SCREEN_PATH, 'export const ShopScreen = () => "refreshed";\n');
  fs.appendFileSync(path.join(root, 'config', 'policy.yaml'), '\n# same-diff authority mutation\n', 'utf8');
  git(root, 'add', SCREEN_PATH, 'config/policy.yaml');
  const result = run(BACKSTOP, [
    ...visualArgs(root), '--policy', 'config/policy.yaml', '--manifest', 'config/manifest.yaml',
    '--layout', 'config/layout.yaml', '--staged', '--enforce',
  ], root);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, false);
  assert.ok(json.violations.some((entry) => entry.code === 'VR-BACKSTOP-012' && entry.file === 'config/policy.yaml'), result.stdout);
});

test('non-canonical .. screen_entry alias is a physical co-owner blocker', (t) => {
  const root = createFixture(t, { aliasPath: 'src/features/shop/screens/../screens/ShopScreen.tsx' });
  const result = run(READINESS, visualArgs(root), root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.intent_authorization.applicable, false, result.stdout);
  const reason = json.intent_authorization.reasons.find((entry) => entry.code === 'VR-SCREEN-010');
  assert.ok(reason, result.stdout);
  assert.ok(reason.owner_records.some((entry) => entry.screen_id === 'SHOP-ALIAS'), result.stdout);
});

test('case-only screen_entry alias is a physical co-owner blocker on case-insensitive filesystems', (t) => {
  const alias = 'src/features/shop/screens/shopscreen.tsx';
  const root = createFixture(t, { aliasPath: alias });
  if (!requireCaseAlias(t, root, SCREEN_PATH, alias)) return;
  const result = run(READINESS, visualArgs(root), root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.intent_authorization.applicable, false, result.stdout);
  assert.ok(json.intent_authorization.reasons.some((entry) => entry.code === 'VR-SCREEN-010'), result.stdout);
  write(root, SCREEN_PATH, 'export const ShopScreen = () => "refreshed";\n');
  git(root, 'add', SCREEN_PATH);
  const staged = run(BACKSTOP, [...visualArgs(root), '--staged', '--enforce'], root);
  assert.equal(staged.status, 1, staged.stderr || staged.stdout);
  const stagedJson = JSON.parse(staged.stdout);
  assert.ok(stagedJson.intent_authorization.reasons.some((entry) => entry.code === 'VR-SCREEN-010'), staged.stdout);
});

test('inode-verified case-only policy and docs aliases cannot bypass forward or staged authority', (t) => {
  const root = createFixture(t, { explicitResources: true });
  if (!requireCaseAlias(t, root, 'config/policy.yaml', 'Config/Policy.yaml')) return;
  const resources = ['--policy', 'config/policy.yaml', '--manifest', 'config/manifest.yaml', '--layout', 'config/layout.yaml'];
  for (const alias of [['--policy', 'Config/Policy.yaml'], ['--docs', 'Docs/frontend-workflow']]) {
    const forward = run(READINESS, [...visualArgs(root), ...resources, ...alias], root);
    assert.equal(forward.status, 2, forward.stdout);
    assert.match(forward.stderr, /spelling.*physical path/);
  }
  write(root, SCREEN_PATH, 'export const ShopScreen = () => "refresh";\n');
  fs.appendFileSync(path.join(root, 'config/policy.yaml'), '\n# changed authority\n');
  git(root, 'add', SCREEN_PATH, 'config/policy.yaml');
  const staged = run(BACKSTOP, [...visualArgs(root), ...resources, '--policy', 'Config/Policy.yaml', '--staged', '--enforce'], root);
  assert.equal(staged.status, 2, staged.stdout);
  assert.match(staged.stderr, /spelling.*physical path/);
});

test('forward rejects docs/src overlap before dirty source can enter the authority overlay', (t) => {
  const root = createFixture(t);
  const result = run(READINESS, [...visualArgs(root), '--docs', 'workspace', '--src', 'workspace/src'], root);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /--docs.*--src|겹칠 수 없음/);
});

test('visual packet -> staged report -> run preserves audit and re-evaluates backstop', (t) => {
  const root = createFixture(t);
  const packetPath = path.join(root, 'tmp', 'work-packet.md');
  const packet = run(PACKET, [
    '--screen', SCREEN_ID, '--requested-mode', 'api-integrated-ui', '--intent', 'visual-refresh',
    '--input', INPUT_ID, '--path', SCREEN_PATH, '--root', root, '--out', packetPath, '--json',
    '--date', '2026-09-07',
  ], root);
  assert.equal(packet.status, 0, packet.stderr || packet.stdout);
  const packetJson = JSON.parse(packet.stdout);
  assert.equal(packetJson.visual_refresh.authority_applicable, true, packet.stdout);
  assert.equal(packetJson.visual_refresh.input_id, INPUT_ID);
  assert.equal(packetJson.visual_refresh.authorized_path, SCREEN_PATH);
  const packetRaw = fs.readFileSync(packetPath, 'utf8');
  assert.match(packetRaw, /visual_source_tree:/);
  assert.match(packetRaw, /visual_destination_tree:/);

  write(root, SCREEN_PATH, 'export const ShopScreen = () => "refreshed";\n');
  git(root, 'add', SCREEN_PATH);
  const reportPath = path.join(root, 'tmp', 'run-report.md');
  const report = run(REPORT, [
    '--packet', packetPath, '--intent', 'visual-refresh', '--input', INPUT_ID, '--path', SCREEN_PATH,
    '--root', root, '--staged', '--out', reportPath, '--json', '--date', '2026-09-07',
  ], root);
  assert.equal(report.status, 0, report.stderr || report.stdout);
  const reportJson = JSON.parse(report.stdout);
  assert.equal(reportJson.forbidden.ok, true, report.stdout);
  assert.ok(reportJson.visual_refresh.backstop_source_tree, report.stdout);
  assert.ok(reportJson.visual_refresh.backstop_destination_tree, report.stdout);
  assert.equal(reportJson.visual_refresh.backstop_diff_kind, 'staged');
  assert.match(fs.readFileSync(reportPath, 'utf8'), /backstop snapshot:/);

  const runDir = path.join(root, 'tmp', 'workflow-run');
  const workflowRun = run(RUN, [
    '--screen', SCREEN_ID, '--requested-mode', 'api-integrated-ui', '--intent', 'visual-refresh',
    '--input', INPUT_ID, '--path', SCREEN_PATH, '--root', root, '--staged', '--out', runDir,
    '--skip-tests', '--json', '--date', '2026-09-07',
  ], root);
  assert.equal(workflowRun.status, 0, workflowRun.stderr || workflowRun.stdout);
  const runJson = JSON.parse(workflowRun.stdout);
  assert.equal(runJson.state, 'DONE_PENDING_REVIEW', workflowRun.stdout);
  assert.ok(fs.existsSync(path.join(runDir, 'run-report.md')));
});

test('shipped implement-screen documents the visual tuple and staged backstop path', () => {
  const skill = fs.readFileSync(SKILL, 'utf8');
  for (const token of ['--intent visual-refresh', '--input <INPUT_ID>', 'workflow:run', '--staged', 'visual_authority_applicable', 'visual_prework.path_allowed:true', '--readiness', 'HALT_TOOL_ERROR']) {
    assert.ok(skill.includes(token), `implement-screen missing ${token}`);
  }
});

// #257: frontend-workflow.config.yaml names the adoption overlay and the layout for visual-refresh too.
const ADOPTION = { version: 1, owners: [`screen:${SCREEN_ID}`], profiles: ['behavior'], role_limits: { behavior: ['screen'] }, deny_paths: [] };
function adoptShop(root, { config = true, commit = true } = {}) {
  const spec = path.join(root, 'docs/frontend-workflow/domains/shop/screens/shop-home/screen-spec.md');
  fs.writeFileSync(spec, fs.readFileSync(spec, 'utf8').replace('status: confirmed\n',
    `status: confirmed\nwork_execution: ${JSON.stringify({ version: 1, units: [{ id: 'layout', kind: 'behavior',
      contracts: [`artifact:${SCREEN_ID}-screen-spec#state-matrix`], sources: [] }] })}\n`));
  write(root, 'config/adoption.yaml', `work_execution: ${JSON.stringify(ADOPTION)}\n`);
  if (config) write(root, 'frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: config/adoption.yaml\nlayout: config/layout.yaml\n');
  git(root, 'add', '.'); if (commit) git(root, 'commit', '-m', 'adopt shop');
}
const explicitPolicy = ['--policy', 'config/policy.yaml', '--manifest', 'config/manifest.yaml'];

test('#257 visual-refresh reads the adoption overlay and the layout from frontend-workflow.config.yaml', (t) => {
  const root = createFixture(t, { explicitResources: true });
  const before = run(READINESS, [...visualArgs(root), ...explicitPolicy], root);
  assert.equal(JSON.parse(before.stdout).path_authorization.allowed, true, before.stderr || before.stdout);
  adoptShop(root);
  const result = run(READINESS, [...visualArgs(root), ...explicitPolicy], root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.path_authorization.allowed, false, result.stdout);
  assert.match(json.path_authorization.reason, /work-selection-required/);
  const provenance = json.intent_authorization.resource_provenance;
  assert.equal(provenance.layout.source, 'config/layout.yaml');
  assert.equal(provenance.policy_overlay.source, 'config/adoption.yaml');
  assert.equal(provenance.config.source, 'frontend-workflow.config.yaml');
  const mismatch = run(READINESS, [...visualArgs(root), ...explicitPolicy, '--layout', 'config/policy.yaml'], root);
  assert.equal(mismatch.status, 2, mismatch.stdout);
  assert.match(mismatch.stderr, /WORK-CONFIG: --layout config\/policy\.yaml differs from frontend-workflow\.config\.yaml layout config\/layout\.yaml/);
});

test('#257 visual-refresh refuses owner units without a configured overlay and a base policy that adopts', (t) => {
  const root = createFixture(t, { explicitResources: true });
  adoptShop(root, { config: false });
  const result = run(READINESS, [...visualArgs(root), ...explicitPolicy], root);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /WORK-CONFIG: owner documents declare work_execution \(screen:SHOP-HOME\)/);
  fs.appendFileSync(path.join(root, 'config/policy.yaml'), `work_execution: ${JSON.stringify(ADOPTION)}\n`);
  write(root, 'frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: config/adoption.yaml\n');
  const inline = run(READINESS, [...visualArgs(root), ...explicitPolicy], root);
  assert.equal(inline.status, 2, inline.stdout);
  assert.match(inline.stderr, /the base policy must not declare work_execution/);
});

test('#257 a visual diff cannot change the adoption overlay or create the config', (t) => {
  // An overlay that adopts no owner yet keeps the screen applicable, so the record check runs.
  const adopted = createFixture(t, { explicitResources: true });
  write(adopted, 'config/adoption.yaml', `work_execution: ${JSON.stringify({ ...ADOPTION, owners: [] })}\n`);
  write(adopted, 'frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: config/adoption.yaml\nlayout: config/layout.yaml\n');
  git(adopted, 'add', '.'); git(adopted, 'commit', '-m', 'adoption config');
  write(adopted, SCREEN_PATH, 'export const ShopScreen = () => "refreshed";\n');
  fs.appendFileSync(path.join(adopted, 'config/adoption.yaml'), '# narrowed later\n');
  git(adopted, 'add', '.');
  const staged = run(BACKSTOP, [...visualArgs(adopted), ...explicitPolicy, '--staged', '--enforce'], adopted);
  const json = JSON.parse(staged.stdout);
  assert.ok(json.violations.some((entry) => entry.code === 'VR-BACKSTOP-012' && entry.file === 'config/adoption.yaml'), staged.stdout);
  const plain = createFixture(t, { explicitResources: true });
  write(plain, SCREEN_PATH, 'export const ShopScreen = () => "refreshed";\n');
  write(plain, 'frontend-workflow.config.yaml', 'version: 1\nlayout: config/layout.yaml\n');
  git(plain, 'add', '.');
  const created = run(BACKSTOP, [...visualArgs(plain), ...explicitPolicy, '--layout', 'config/layout.yaml', '--staged', '--enforce'], plain);
  assert.equal(created.status, 1, created.stderr || created.stdout);
  assert.ok(JSON.parse(created.stdout).violations.some((entry) => entry.code === 'VR-BACKSTOP-012' && entry.file === 'frontend-workflow.config.yaml'), created.stdout);
});

test('#257 forward readiness reads the worktree config, not the committed one', (t) => {
  const root = createFixture(t, { explicitResources: true });
  adoptShop(root);
  // The worktree withdraws the config while the owner still declares units.
  fs.rmSync(path.join(root, 'frontend-workflow.config.yaml'));
  const result = run(READINESS, [...visualArgs(root), ...explicitPolicy, '--layout', 'config/layout.yaml'], root);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /WORK-CONFIG: owner documents declare work_execution \(screen:SHOP-HOME\)/);
});

test('#257 visual readiness checks the adoption config before the first commit (r3)', (t) => {
  const root = createFixture(t, { explicitResources: true });
  fs.rmSync(path.join(root, '.git'), { recursive: true, force: true });
  git(root, 'init');
  const unborn = run(READINESS, [...visualArgs(root), ...explicitPolicy], root);
  assert.equal(unborn.status, 0, unborn.stderr || unborn.stdout);
  assert.ok(JSON.parse(unborn.stdout).intent_authorization.reasons.some((entry) => entry.code === 'VR-GIT-001'), unborn.stdout);
  write(root, 'frontend-workflow.config.yaml', 'version: 2\n');
  const malformed = run(READINESS, [...visualArgs(root), ...explicitPolicy], root);
  assert.equal(malformed.status, 2, malformed.stdout);
  assert.match(malformed.stderr, /WORK-CONFIG: frontend-workflow\.config\.yaml: version 1 required/);
  write(root, 'frontend-workflow.config.yaml', 'version: 1\n');
  fs.appendFileSync(path.join(root, 'config/policy.yaml'), `work_execution: ${JSON.stringify(ADOPTION)}\n`);
  const adopting = run(READINESS, [...visualArgs(root), ...explicitPolicy], root);
  assert.equal(adopting.status, 2, adopting.stdout);
  assert.match(adopting.stderr, /WORK-CONFIG: the base policy must not declare work_execution/);
});

test('#257 a visual report refuses adoption before any other resource of its backstop fails (r4)', (t) => {
  const cases = [
    ['a base policy that adopts', (root) => fs.appendFileSync(path.join(root, 'config/policy.yaml'), `work_execution: ${JSON.stringify(ADOPTION)}\n`),
      /WORK-CONFIG: the base policy must not declare work_execution/],
    ['owner units without an overlay', (root) => adoptShop(root, { config: false, commit: false }),
      /WORK-CONFIG: owner documents declare work_execution \(screen:SHOP-HOME\)/],
  ];
  for (const [name, adopt, refusal] of cases) {
    const root = createFixture(t, { explicitResources: true });
    const packetPath = path.join(root, 'tmp', 'work-packet.md');
    const packet = run(PACKET, ['--screen', SCREEN_ID, '--requested-mode', 'api-integrated-ui', '--intent', 'visual-refresh', '--input', INPUT_ID,
      '--path', SCREEN_PATH, '--root', root, ...explicitPolicy, '--out', packetPath, '--json'], root);
    assert.equal(packet.status, 0, packet.stderr || packet.stdout);
    // The staged destination misplaces adoption and breaks the manifest the backstop reads first.
    write(root, SCREEN_PATH, 'export const ShopScreen = () => "refreshed";\n');
    write(root, 'config/manifest.yaml', 'artifacts: [unclosed\n');
    adopt(root);
    git(root, 'add', '.');
    const report = run(REPORT, ['--packet', packetPath, '--intent', 'visual-refresh', '--input', INPUT_ID, '--path', SCREEN_PATH,
      '--root', root, ...explicitPolicy, '--staged', '--json'], root);
    assert.equal(report.status, 2, `${name}: ${report.stdout}`);
    assert.match(report.stderr, refusal, name);
  }
});

// A copy of the kit whose bundled policy declares work_execution.
function adoptingKit(t) {
  const kit = tmpdir(t, 'visual-adoption-kit-');
  for (const dir of ['scripts', 'policies', 'catalog', 'presets', 'schemas', 'templates']) {
    fs.cpSync(path.join(KIT_ROOT, dir), path.join(kit, dir), { recursive: true, filter: (source) => !source.endsWith('.test.mjs') });
  }
  fs.copyFileSync(path.join(KIT_ROOT, 'package.json'), path.join(kit, 'package.json'));
  fs.symlinkSync(path.join(KIT_ROOT, 'node_modules'), path.join(kit, 'node_modules'));
  fs.appendFileSync(path.join(kit, 'policies/implementation-mode-policy.yaml'), `\nwork_execution: ${JSON.stringify(ADOPTION)}\n`);
  return kit;
}

test('#257 a visual report refuses a bundled policy that adopts, whatever its backstop fails on first (r3)', (t) => {
  const root = createFixture(t), kit = adoptingKit(t);
  const packetPath = path.join(root, 'tmp', 'work-packet.md');
  const packet = run(PACKET, ['--screen', SCREEN_ID, '--requested-mode', 'api-integrated-ui', '--intent', 'visual-refresh',
    '--input', INPUT_ID, '--path', SCREEN_PATH, '--root', root, '--out', packetPath, '--json'], root);
  assert.equal(packet.status, 0, packet.stderr || packet.stdout);
  write(root, SCREEN_PATH, 'export const ShopScreen = () => "refreshed";\n');
  git(root, 'add', SCREEN_PATH);
  const report = run(path.join(kit, 'scripts', 'workflow-report.mjs'), ['--packet', packetPath, '--intent', 'visual-refresh',
    '--input', INPUT_ID, '--path', SCREEN_PATH, '--root', root, '--staged', '--json'], root);
  assert.equal(report.status, 2, report.stdout);
  assert.match(report.stderr, /WORK-CONFIG: the base policy must not declare work_execution/);
});

test('#257 forward readiness reads the worktree overlay the config names', (t) => {
  const root = createFixture(t, { explicitResources: true });
  adoptShop(root);
  write(root, 'config/adoption.yaml', `work_execution: ${JSON.stringify({ ...ADOPTION, owners: [] })}\n`);
  git(root, 'add', '.'); git(root, 'commit', '-m', 'adopt nothing yet');
  // Only the worktree overlay adopts the screen.
  write(root, 'config/adoption.yaml', `work_execution: ${JSON.stringify(ADOPTION)}\n`);
  const result = run(READINESS, [...visualArgs(root), ...explicitPolicy], root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(JSON.parse(result.stdout).path_authorization.reason, /work-selection-required/, result.stdout);
});

test('#257 a configured overlay must stay outside the implementation roots, like an explicit resource', (t) => {
  const root = createFixture(t, { explicitResources: true });
  write(root, 'src/adoption.yaml', `work_execution: ${JSON.stringify({ ...ADOPTION, owners: [] })}\n`);
  write(root, 'frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: src/adoption.yaml\nlayout: config/layout.yaml\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'overlay under src');
  const result = run(READINESS, [...visualArgs(root), ...explicitPolicy], root);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /--policy_overlay authority resource는 implementation role\/layer root와 분리돼야 함: resource=src\/adoption\.yaml/);
});

test('#257 visual packet and run resolve --layout from --root, like every visual resource (r1)', (t) => {
  const root = createFixture(t, { explicitResources: true });
  write(root, 'config/adoption.yaml', `work_execution: ${JSON.stringify({ ...ADOPTION, owners: [] })}\n`);
  write(root, 'frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: config/adoption.yaml\nlayout: config/layout.yaml\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'adoption config');
  const elsewhere = path.dirname(root);
  const tuple = ['--screen', SCREEN_ID, '--requested-mode', 'api-integrated-ui', '--intent', 'visual-refresh', '--input', INPUT_ID,
    '--path', SCREEN_PATH, '--root', root, ...explicitPolicy, '--json'];
  const packet = run(PACKET, [...tuple, '--layout', 'config/layout.yaml'], elsewhere);
  assert.equal(packet.status, 0, packet.stderr || packet.stdout);
  assert.equal(JSON.parse(packet.stdout).visual_refresh.authority_applicable, true, packet.stdout);
  const workflowRun = run(RUN, [...tuple, '--layout', 'config/layout.yaml'], elsewhere);
  assert.equal(workflowRun.status, 0, workflowRun.stderr || workflowRun.stdout);
  assert.equal(JSON.parse(workflowRun.stdout).state, 'HALT_READY_FOR_WORK', workflowRun.stdout);
  const mismatch = run(PACKET, [...tuple, '--layout', 'config/policy.yaml'], elsewhere);
  assert.equal(mismatch.status, 2, mismatch.stdout);
  assert.match(mismatch.stderr, /WORK-CONFIG: --layout config\/policy\.yaml differs/);
});

test('#257 a visual report refuses a configuration its backstop refuses (r2)', (t) => {
  const root = createFixture(t, { explicitResources: true });
  write(root, 'config/adoption.yaml', `work_execution: ${JSON.stringify({ ...ADOPTION, owners: [] })}\n`);
  write(root, 'frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: config/adoption.yaml\nlayout: config/layout.yaml\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'adoption config');
  const packetPath = path.join(root, 'tmp', 'work-packet.md');
  const packet = run(PACKET, ['--screen', SCREEN_ID, '--requested-mode', 'api-integrated-ui', '--intent', 'visual-refresh', '--input', INPUT_ID,
    '--path', SCREEN_PATH, '--root', root, ...explicitPolicy, '--out', packetPath, '--json'], root);
  assert.equal(packet.status, 0, packet.stderr || packet.stdout);
  // Only the staged destination breaks the config; the worktree keeps the valid one.
  write(root, SCREEN_PATH, 'export const ShopScreen = () => "refreshed";\n');
  write(root, 'frontend-workflow.config.yaml', 'version: 2\n');
  git(root, 'add', SCREEN_PATH, 'frontend-workflow.config.yaml');
  write(root, 'frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: config/adoption.yaml\nlayout: config/layout.yaml\n');
  const report = run(REPORT, ['--packet', packetPath, '--intent', 'visual-refresh', '--input', INPUT_ID, '--path', SCREEN_PATH,
    '--root', root, ...explicitPolicy, '--staged', '--json'], root);
  assert.equal(report.status, 2, report.stdout);
  assert.match(report.stderr, /WORK-CONFIG: frontend-workflow\.config\.yaml: version 1 required/);
});

test('#257 a direct visual evaluation protects the authority files the config names (r2)', (t) => {
  const root = createFixture(t, { explicitResources: true });
  write(root, 'config/adoption.yaml', `work_execution: ${JSON.stringify({ ...ADOPTION, owners: [] })}\n`);
  write(root, 'frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: config/adoption.yaml\nlayout: config/layout.yaml\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'adoption config');
  const tree = git(root, 'rev-parse', 'HEAD^{tree}');
  // No tuple normalization: the options name neither the layout nor the overlay.
  const result = evaluateVisualRefreshAuthority({ sourceRoot: root, destinationRoot: root, selectedScreen: SCREEN_ID, selectedInputId: INPUT_ID,
    checkedPath: SCREEN_PATH, options: { policy: 'config/policy.yaml', manifest: 'config/manifest.yaml' },
    snapshot: { source_tree: tree, destination_tree: tree, diff_kind: 'staged' } });
  assert.ok(result._context, JSON.stringify(result.intent_authorization));
  for (const name of ['config/adoption.yaml', 'config/layout.yaml', 'frontend-workflow.config.yaml']) {
    assert.ok(result._context.authority_resource_paths.includes(name), `${name}: ${JSON.stringify(result._context.authority_resource_paths)}`);
  }
});
