import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { KIT_ROOT, yamlParse, yamlStringify } from './util.mjs';

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
  git(root, 'init');
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
  let samePhysical = false;
  try {
    samePhysical = fs.realpathSync(path.join(root, ...alias.split('/'))) === fs.realpathSync(path.join(root, ...SCREEN_PATH.split('/')));
  } catch {}
  if (!samePhysical) {
    t.skip('requires a case-insensitive filesystem (covered by macOS smoke)');
    return;
  }
  const result = run(READINESS, visualArgs(root), root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.intent_authorization.applicable, false, result.stdout);
  assert.ok(json.intent_authorization.reasons.some((entry) => entry.code === 'VR-SCREEN-010'), result.stdout);
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
  for (const token of ['--intent visual-refresh', '--input <INPUT_ID>', 'workflow:run', '--staged', 'visual_authority_applicable']) {
    assert.ok(skill.includes(token), `implement-screen missing ${token}`);
  }
});
