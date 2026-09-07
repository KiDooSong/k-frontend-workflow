import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import { KIT_ROOT, yamlParse, yamlStringify } from './util.mjs';

const READINESS = path.join(KIT_ROOT, 'scripts', 'readiness.mjs');
const BACKSTOP = path.join(KIT_ROOT, 'scripts', 'forbidden-paths.mjs');
const PACKET = path.join(KIT_ROOT, 'scripts', 'workflow-packet.mjs');
const REPORT = path.join(KIT_ROOT, 'scripts', 'workflow-report.mjs');
const RUN = path.join(KIT_ROOT, 'scripts', 'workflow-run.mjs');
const INPUT_ID = 'IN-20260904-figma-001';
const SCREEN_ID = 'SHOP-HOME';
const SCREEN_PATH = 'src/features/shop/screens/ShopScreen.tsx';
const TIMEOUT = 60_000;

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-refresh-orchestration-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function write(root, rel, content) {
  const file = path.join(root, ...rel.split('/'));
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
    timeout: TIMEOUT,
  });
}
function copyKit(project, rel, source) {
  const target = path.join(project, ...rel.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(KIT_ROOT, ...source.split('/')), target);
  return target;
}
function stateRows() {
  return ['loading', 'empty', 'error', 'success', 'disabled', 'refreshing']
    .map((state) => `| ${state} | fixture | ${state} UI | none |`)
    .join('\n');
}
function populate(project) {
  write(project, 'docs/frontend-workflow/app/navigation-map.md', '---\nartifact_id: navigation-map\nartifact_type: navigation-map\nstatus: draft\n---\n');
  write(project, 'docs/frontend-workflow/design/component-catalog.md', '# GENERATED FILE - DO NOT EDIT\n\n| Name | Source | Export | Status |\n|---|---|---|---|\n');
  write(project, 'docs/frontend-workflow/domains/shop/screens/shop-home/screen-spec.md', `---
artifact_id: SHOP-HOME-screen-spec
artifact_type: screen-spec
domain: shop
screen_id: ${SCREEN_ID}
route: /shop
screen_entry: ${SCREEN_PATH}
status: confirmed
---

# Shop

## Purpose

Render shop.

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
`);
  write(project, 'docs/frontend-workflow/domains/shop/screens/shop-home/figma-component-mapping.md', `---
artifact_id: SHOP-HOME-figma-component-mapping
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
| \`M-001\` · Shop / node \`1:234\` | Card | components/ui/Card | spacing |

## Mapping Provenance

| Mapping Key | Source Ref | Source Unit | Captured At | Evidence |
|---|---|---|---|---|
| M-001 | figma://file/shop/node/1:234 | instance | inherit | input:${INPUT_ID}#extracted-facts/01 |
`);
  write(project, `docs/frontend-workflow/inputs/shop/${INPUT_ID}.md`, `---
input_id: ${INPUT_ID}
input_type: figma
source_type: figma
source_ref: "figma://file/shop/frame/10:20"
captured_at: "2026-09-04T09:00:00+09:00"
captured_by: orchestration-test
status: captured
affected_domains: [shop]
affected_screens: [${SCREEN_ID}]
confidence: confirmed
supersedes: null
---

## Extracted Facts

- The primary card spacing is 16px.
`);
  write(project, 'docs/frontend-workflow/_meta/reconciliation-register.md', `---
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
| ${INPUT_ID} | figma | simple-update | reconciled | accepted | artifact:SHOP-HOME-figma-component-mapping | - | - |

## Reconciliation Items

| Input ID | Item | Basis | Classification | Effect | Target | Evidence | Source Ref | Source Unit | Captured At |
|---|---|---|---|---|---|---|---|---|---|
| ${INPUT_ID} | 01 | visual-evidence | simple-update | update | artifact:SHOP-HOME-figma-component-mapping#component-mapping/M-001 | input:${INPUT_ID}#extracted-facts/01 | figma://file/shop/node/1:234 | instance | inherit |
`);
  write(project, SCREEN_PATH, 'export const ShopScreen = () => null;\n');
  write(project, 'src/features/shop/hooks/useShop.ts', 'export const useShop = () => ({});\n');
}
function fixture(t, { prefix = '', explicit = false, plannedGenerated = false } = {}) {
  const repo = tmp(t);
  git(repo, 'init');
  git(repo, 'config', 'user.email', 'visual@example.com');
  git(repo, 'config', 'user.name', 'Visual Test');
  const project = prefix ? path.join(repo, ...prefix.split('/')) : repo;
  fs.mkdirSync(project, { recursive: true });
  populate(project);
  if (explicit) {
    copyKit(project, 'config/policy.yaml', 'policies/implementation-mode-policy.yaml');
    copyKit(project, 'config/manifest.yaml', 'catalog/artifact-manifest.yaml');
    copyKit(project, 'config/layout.yaml', 'policies/project-layout.yaml');
    const policyFile = path.join(project, 'config/policy.yaml');
    const policy = yamlParse(fs.readFileSync(policyFile, 'utf8'));
    policy.modes['api-integrated-ui'].allowed_paths.push('{roles.screen}');
    policy.modes['api-integrated-ui'].forbidden_paths = [];
    fs.writeFileSync(policyFile, yamlStringify(policy, { lineWidth: 0 }), 'utf8');
  }
  if (plannedGenerated) {
    const manifestFile = copyKit(project, 'config/manifest.yaml', 'catalog/artifact-manifest.yaml');
    const manifest = yamlParse(fs.readFileSync(manifestFile, 'utf8'));
    manifest.artifacts['planned-screen'] = {
      kind: 'generated', generated: true, do_not_edit: true, status: 'planned', path: SCREEN_PATH,
    };
    fs.writeFileSync(manifestFile, yamlStringify(manifest, { lineWidth: 0 }), 'utf8');
    write(project, SCREEN_PATH, '// GENERATED FILE - DO NOT EDIT\nexport const ShopScreen = () => null;\n');
  }
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'baseline');
  return { repo, project, rootArg: prefix || repo };
}
function tuple(rootArg) {
  return ['--root', rootArg, '--screen', SCREEN_ID, '--intent', 'visual-refresh', '--input', INPUT_ID, '--path', SCREEN_PATH, '--json'];
}
function packetFor(project, rootArg, cwd) {
  const packetPath = path.join(project, 'tmp', 'work-packet.md');
  const result = run(PACKET, [
    '--screen', SCREEN_ID, '--requested-mode', 'api-integrated-ui', '--intent', 'visual-refresh',
    '--input', INPUT_ID, '--path', SCREEN_PATH, '--root', rootArg, '--out', packetPath, '--json',
    '--date', '2026-09-07',
  ], cwd);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return packetPath;
}

test('report dispatcher accepts equals syntax and duplicate last-wins intent', (t) => {
  const { repo, project } = fixture(t);
  const packet = packetFor(project, repo, repo);
  write(project, SCREEN_PATH, 'export const ShopScreen = () => "refresh";\n');
  git(repo, 'add', SCREEN_PATH);

  for (const intentArgs of [
    ['--intent=visual-refresh'],
    ['--intent', 'not-visual', '--intent', 'visual-refresh'],
  ]) {
    const result = run(REPORT, [
      '--packet', packet, ...intentArgs, `--input=${INPUT_ID}`, `--path=${SCREEN_PATH}`,
      '--root', repo, '--staged', '--json',
    ], repo);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const json = JSON.parse(result.stdout);
    assert.equal(json.forbidden.status, 'pass', result.stdout);
    assert.equal(json.visual_refresh.input_id, INPUT_ID);
  }

  const stray = run(REPORT, ['--packet', packet, '--input', INPUT_ID, '--path', SCREEN_PATH, '--staged', '--json'], repo);
  assert.equal(stray.status, 2, stray.stdout);
  assert.match(stray.stderr, /require --intent visual-refresh/);
});

test('workflow run turns visual backstop execution errors into HALT_TOOL_ERROR and preserves error', (t) => {
  const { repo, project } = fixture(t);
  write(project, SCREEN_PATH, 'export const ShopScreen = () => "refresh";\n');
  git(repo, 'add', SCREEN_PATH);
  const result = run(RUN, [
    '--screen', SCREEN_ID, '--requested-mode', 'api-integrated-ui', '--intent', 'visual-refresh',
    '--input', INPUT_ID, '--path', SCREEN_PATH, '--root', repo, '--base', 'definitely-missing-ref', '--json',
    '--date', '2026-09-07',
  ], repo);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.state, 'HALT_TOOL_ERROR', result.stdout);
  assert.equal(json.forbidden.status, 'error', result.stdout);
  assert.match(json.reason, /visual backstop 실행 오류/);
});

test('workflow run preserves denied visual backstop evidence instead of hiding it', (t) => {
  const { repo, project } = fixture(t, { explicit: true });
  write(project, SCREEN_PATH, 'export const ShopScreen = () => "refresh";\n');
  fs.appendFileSync(path.join(project, 'config/policy.yaml'), '\n# same-diff mutation\n');
  git(repo, 'add', SCREEN_PATH, 'config/policy.yaml');
  const result = run(RUN, [
    '--screen', SCREEN_ID, '--requested-mode', 'api-integrated-ui', '--intent', 'visual-refresh',
    '--input', INPUT_ID, '--path', SCREEN_PATH, '--root', repo,
    '--policy', 'config/policy.yaml', '--manifest', 'config/manifest.yaml', '--layout', 'config/layout.yaml',
    '--staged', '--json', '--date', '2026-09-07',
  ], repo);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.state, 'DONE_PENDING_REVIEW', result.stdout);
  assert.equal(json.forbidden.ok, false, result.stdout);
  assert.ok(json.forbidden.violations.some((v) => v.code === 'VR-BACKSTOP-012'), result.stdout);
  assert.ok(json.visual_refresh.backstop_source_tree, result.stdout);
  assert.ok(json.changed_files.some((entry) => entry.path === 'config/policy.yaml'), result.stdout);
});

test('relative monorepo root is resolved once across packet report and run', (t) => {
  const { repo, project, rootArg } = fixture(t, { prefix: 'packages/mobile' });
  const packet = packetFor(project, rootArg, repo);
  write(project, SCREEN_PATH, 'export const ShopScreen = () => "refresh";\n');
  git(repo, 'add', 'packages/mobile/' + SCREEN_PATH);

  const report = run(REPORT, [
    '--packet', packet, '--intent', 'visual-refresh', '--input', INPUT_ID, '--path', SCREEN_PATH,
    '--root', rootArg, '--staged', '--json',
  ], repo);
  assert.equal(report.status, 0, report.stderr || report.stdout);
  assert.equal(JSON.parse(report.stdout).forbidden.ok, true, report.stdout);

  const workflowRun = run(RUN, [
    '--screen', SCREEN_ID, '--requested-mode', 'api-integrated-ui', '--intent', 'visual-refresh',
    '--input', INPUT_ID, '--path', SCREEN_PATH, '--root', rootArg, '--staged', '--json', '--date', '2026-09-07',
  ], repo);
  assert.equal(workflowRun.status, 0, workflowRun.stderr || workflowRun.stdout);
  assert.equal(JSON.parse(workflowRun.stdout).state, 'DONE_PENDING_REVIEW', workflowRun.stdout);
});

test('planned generated do-not-edit screen with marker remains a final deny', (t) => {
  const { repo } = fixture(t, { plannedGenerated: true });
  const forward = run(READINESS, [...tuple(repo), '--manifest', 'config/manifest.yaml'], repo);
  assert.equal(forward.status, 0, forward.stderr || forward.stdout);
  const json = JSON.parse(forward.stdout);
  assert.equal(json.intent_authorization.applicable, false, forward.stdout);
  assert.ok(json.intent_authorization.reasons.some((r) => r.code === 'VR-PATH-001'), forward.stdout);
});

test('custom implementation role root underneath docs is rejected before overlay', (t) => {
  const { repo, project } = fixture(t);
  const sourceDocs = path.join(project, 'docs/frontend-workflow');
  fs.cpSync(sourceDocs, path.join(project, 'workspace'), { recursive: true });
  const layoutFile = copyKit(project, 'config/layout.yaml', 'policies/project-layout.yaml');
  const layout = yamlParse(fs.readFileSync(layoutFile, 'utf8'));
  layout.roles = { ...(layout.roles || {}), hook: 'workspace/hooks/**' };
  fs.writeFileSync(layoutFile, yamlStringify(layout, { lineWidth: 0 }), 'utf8');
  write(project, 'workspace/hooks/useShop.ts', 'export const useShop = () => ({ dirty: true });\n');

  const result = run(READINESS, [
    ...tuple(repo), '--docs', 'workspace', '--src', 'src', '--layout', 'config/layout.yaml',
  ], repo);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /implementation role\/layer root|겹침/);
});

test('case-only authority resource and docs aliases fail closed on case-insensitive filesystems', (t) => {
  const { repo, project } = fixture(t, { explicit: true });
  const policyAlias = path.join(project, 'Config/Policy.yaml');
  let aliases = false;
  try {
    aliases = fs.realpathSync(policyAlias) === fs.realpathSync(path.join(project, 'config/policy.yaml'));
  } catch {}
  if (!aliases) {
    t.skip('requires a case-insensitive filesystem (covered by macOS smoke)');
    return;
  }
  const policy = run(READINESS, [
    ...tuple(repo), '--policy', 'Config/Policy.yaml', '--manifest', 'config/manifest.yaml', '--layout', 'config/layout.yaml',
  ], repo);
  assert.equal(policy.status, 2, policy.stdout);
  assert.match(policy.stderr, /spelling.*physical path/);

  const docs = run(READINESS, [...tuple(repo), '--docs', 'Docs/frontend-workflow'], repo);
  assert.equal(docs.status, 2, docs.stdout);
  assert.match(docs.stderr, /spelling.*physical path/);
});

test('visual packet report and run reject unknown authority option typos before work', (t) => {
  const { repo } = fixture(t);
  const cases = [
    [PACKET, ['--screen', SCREEN_ID, '--requested-mode', 'api-integrated-ui', '--intent', 'visual-refresh', '--input', INPUT_ID, '--path', SCREEN_PATH, '--root', repo, '--polciy', 'x']],
    [REPORT, ['--packet', 'missing.md', '--intent', 'visual-refresh', '--input', INPUT_ID, '--path', SCREEN_PATH, '--staged', '--polciy', 'x']],
    [RUN, ['--screen', SCREEN_ID, '--requested-mode', 'api-integrated-ui', '--intent', 'visual-refresh', '--input', INPUT_ID, '--path', SCREEN_PATH, '--root', repo, '--polciy', 'x']],
  ];
  for (const [script, args] of cases) {
    const result = run(script, args, repo);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /unknown option --polciy/);
  }
});
