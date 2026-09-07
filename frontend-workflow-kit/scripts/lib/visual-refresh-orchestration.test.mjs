import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

import { KIT_ROOT, yamlParse, yamlStringify } from './util.mjs';
import { visualAuditFromReadiness, visualPreworkIssues } from './visual-refresh-transport.mjs';

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

const RESOURCE_ARGS = ['--policy', 'config/policy.yaml', '--manifest', 'config/manifest.yaml', '--layout', 'config/layout.yaml'];
const MODE_ARGS = ['--requested-mode', 'api-integrated-ui', '--date', '2026-09-07'];

function jsonResult(result, expectedStatus = 0) {
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test('intent applicable with wrong path stays denied through Packet and no-output Run', (t) => {
  const { repo } = fixture(t);
  const args = [...tuple(repo), '--path', 'README.md'];
  const readiness = jsonResult(run(READINESS, args, repo));
  assert.equal(readiness.intent_authorization.applicable, true);
  assert.equal(readiness.path_authorization.allowed, false);
  assert.equal(readiness.visual_refresh_audit.path_allowed, false);
  const packetPath = path.join(repo, 'tmp', 'denied-packet.md');
  const packet = jsonResult(run(PACKET, [...args, ...MODE_ARGS, '--out', packetPath], repo));
  assert.equal(packet.visual_refresh.authority_applicable, true);
  assert.equal(packet.visual_refresh.selected_screen, SCREEN_ID);
  assert.equal(packet.visual_refresh.authorized_path, SCREEN_PATH);
  assert.equal(packet.visual_refresh.checked_path, 'README.md');
  assert.equal(packet.visual_refresh.path_allowed, false);
  assert.equal(packet.visual_refresh.path_reason, readiness.path_authorization.reason);
  assert.match(fs.readFileSync(packetPath, 'utf8'), /visual_path_allowed: false/);

  const result = jsonResult(run(RUN, [...args, ...MODE_ARGS], repo));
  assert.equal(result.state, 'HALT_AMBIGUITY');
  assert.equal(result.report, null);
  assert.equal(result.visual_prework.path_allowed, false);
  assert.equal(result.visual_refresh.checked_path, 'README.md');
  assert.match(result.reason, /pre-work authorization denied/);
  const out = path.join(repo, 'tmp', 'denied-run');
  jsonResult(run(RUN, [...args, ...MODE_ARGS, '--out', out], repo));
  const status = fs.readFileSync(out + '.md', 'utf8');
  assert.match(status, /Visual Pre-work/);
  assert.match(status, /"path_allowed": false/);
  assert.match(status, /README\.md/);
  assert.equal(fs.existsSync(path.join(out, 'run-report.md')), false);
});

test('packet-only HALT_READY_FOR_WORK retains the exact affirmative path decision', (t) => {
  const { repo } = fixture(t);
  const direct = jsonResult(run(READINESS, tuple(repo), repo));
  const result = jsonResult(run(RUN, [...tuple(repo), ...MODE_ARGS], repo));
  assert.equal(result.state, 'HALT_READY_FOR_WORK');
  assert.equal(result.report, null);
  assert.equal(result.visual_prework.selected_screen, SCREEN_ID);
  assert.equal(result.visual_prework.input_id, INPUT_ID);
  assert.equal(result.visual_prework.authorized_path, SCREEN_PATH);
  assert.equal(result.visual_prework.checked_path, SCREEN_PATH);
  assert.equal(result.visual_prework.path_allowed, true);
  assert.equal(result.visual_prework.path_grant, direct.path_authorization.grant);
  assert.deepEqual(result.visual_prework.path_authorization, direct.path_authorization);
  assert.equal(result.visual_prework.source_tree, git(repo, 'rev-parse', 'HEAD^{tree}'));
  assert.deepEqual(result.visual_refresh, result.visual_prework);
});

test('visual transport requires every tuple identity and an explicit boolean path decision', () => {
  const expected = { screen: SCREEN_ID, input: INPUT_ID, checkedPath: SCREEN_PATH };
  const audit = visualAuditFromReadiness({
    intent_authorization: { intent: 'visual-refresh', applicable: true, input_id: INPUT_ID, authorized_path: SCREEN_PATH },
    visual_refresh_audit: { selected_screen: SCREEN_ID },
    path_authorization: { allowed: true, checked_path: SCREEN_PATH, grant: 'test-only' },
  });
  assert.deepEqual(visualPreworkIssues(audit, expected), []);
  for (const key of ['selected_screen', 'input_id', 'authorized_path', 'checked_path', 'authority_applicable', 'path_allowed']) {
    assert.ok(visualPreworkIssues({ ...audit, [key]: null }, expected).length, key);
  }
  for (const allowed of [false, null, 'true', 1]) {
    assert.ok(visualPreworkIssues({ ...audit, path_authorization: { allowed, checked_path: SCREEN_PATH } }, expected).length);
  }
  assert.ok(visualPreworkIssues(null, expected).length);
});

test('visual Packet and Run reject stale readiness overrides before output writes', (t) => {
  const { repo } = fixture(t);
  const stale = run(READINESS, tuple(repo), repo);
  assert.equal(stale.status, 0, stale.stderr);
  const cached = write(repo, 'tmp/stale-readiness.json', stale.stdout);
  fs.unlinkSync(path.join(repo, 'docs/frontend-workflow/domains/shop/screens/shop-home/figma-component-mapping.md'));
  const current = jsonResult(run(READINESS, tuple(repo), repo));
  assert.equal(current.intent_authorization.applicable, false);
  for (const [script, output] of [[PACKET, 'tmp/new-packet.md'], [RUN, 'tmp/new-run']]) {
    const result = run(script, [...tuple(repo), ...MODE_ARGS, `--readiness=${cached}`, '--out', path.join(repo, output)], repo);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /--readiness override/);
    assert.equal(fs.existsSync(path.join(repo, output)), false);
  }
});

for (const kind of ['hook', 'screen', 'wildcard', 'domain-override', 'layer']) {
  test(`domain-leading ${kind} implementation cannot enter a docs overlay in forward or staged mode`, (t) => {
    const { repo } = fixture(t, { explicit: true });
    fs.cpSync(path.join(repo, 'docs/frontend-workflow'), path.join(repo, 'shop'), { recursive: true });
    const layoutFile = path.join(repo, 'config/layout.yaml');
    const layout = yamlParse(fs.readFileSync(layoutFile, 'utf8'));
    const specFile = path.join(repo, 'shop/domains/shop/screens/shop-home/screen-spec.md');
    let spec = fs.readFileSync(specFile, 'utf8');
    let screenPath = SCREEN_PATH;
    let dirtyPath = 'shop/hooks/useShop.ts';
    if (kind === 'screen') {
      screenPath = 'shop/screens/ShopScreen.tsx';
      dirtyPath = screenPath;
      write(repo, screenPath, fs.readFileSync(path.join(repo, SCREEN_PATH), 'utf8'));
      fs.unlinkSync(path.join(repo, SCREEN_PATH));
      spec = spec.replace(SCREEN_PATH, screenPath);
      layout.roles = { ...(layout.roles || {}), screen: '{domain}/screens/**' };
    } else if (kind === 'layer') {
      dirtyPath = 'shop/telemetry/dirty.ts';
      layout.layers = [{ role: 'custom_telemetry', glob: '{domain}/telemetry/**', fact: 'dir_has_files', access: {} }];
    } else {
      spec = spec.replace('src/features/shop/hooks/useShop.ts', dirtyPath);
      fs.unlinkSync(path.join(repo, 'src/features/shop/hooks/useShop.ts'));
      if (kind === 'domain-override') {
        layout.domains = { shop: { roles: { hook: '{domain}/hooks/**' } } };
      } else {
        layout.roles = { ...(layout.roles || {}), hook: kind === 'wildcard' ? '*/hooks/**' : '{domain}/hooks/**' };
      }
    }
    fs.writeFileSync(specFile, spec);
    fs.writeFileSync(layoutFile, yamlStringify(layout, { lineWidth: 0 }));
    git(repo, 'add', '.');
    git(repo, 'commit', '-m', 'stable domain layout and docs boundary');
    if (kind !== 'screen') {
      assert.notEqual(spawnSync('git', ['cat-file', '-e', `HEAD:${dirtyPath}`], { cwd: repo }).status, 0);
    }
    write(repo, dirtyPath, 'export const dirty = true;\n');
    write(repo, screenPath, 'export const ShopScreen = () => "dirty refresh";\n');
    const args = [...tuple(repo), '--path', screenPath, '--docs', 'shop', ...RESOURCE_ARGS];
    const forward = run(READINESS, args, repo);
    assert.equal(forward.status, 2, forward.stdout);
    assert.match(forward.stderr, /implementation role\/layer root|no confined static root/);
    git(repo, 'add', dirtyPath, screenPath);
    const staged = run(BACKSTOP, [...args, '--staged', '--enforce'], repo);
    assert.equal(staged.status, 2, staged.stdout);
    assert.match(staged.stderr, /implementation role\/layer root|no confined static root/);
  });
}

test('a resolved domain-leading hook outside docs remains a supported positive path', (t) => {
  const { repo } = fixture(t, { explicit: true });
  const layoutFile = path.join(repo, 'config/layout.yaml');
  const layout = yamlParse(fs.readFileSync(layoutFile, 'utf8'));
  layout.roles = { ...(layout.roles || {}), hook: '{domain}/hooks/**' };
  fs.writeFileSync(layoutFile, yamlStringify(layout, { lineWidth: 0 }));
  const specFile = path.join(repo, 'docs/frontend-workflow/domains/shop/screens/shop-home/screen-spec.md');
  fs.writeFileSync(specFile, fs.readFileSync(specFile, 'utf8').replace('src/features/shop/hooks/useShop.ts', 'shop/hooks/useShop.ts'));
  write(repo, 'shop/hooks/useShop.ts', 'export const useShop = () => ({});\n');
  fs.unlinkSync(path.join(repo, 'src/features/shop/hooks/useShop.ts'));
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'stable separated domain hook');
  const forward = jsonResult(run(READINESS, [...tuple(repo), ...RESOURCE_ARGS], repo));
  assert.equal(forward.intent_authorization.applicable, true);
  assert.equal(forward.path_authorization.allowed, true);
  write(repo, SCREEN_PATH, 'export const ShopScreen = () => "refresh";\n');
  git(repo, 'add', SCREEN_PATH);
  assert.equal(jsonResult(run(BACKSTOP, [...tuple(repo), ...RESOURCE_ARGS, '--staged', '--enforce'], repo)).ok, true);
});

test('range authority and Report use unchanged A/B resources absent or poisoned in current checkout C', (t) => {
  const { repo } = fixture(t, { explicit: true });
  const packet = packetFor(repo, repo, repo);
  const a = git(repo, 'rev-parse', 'HEAD');
  write(repo, SCREEN_PATH, 'export const ShopScreen = () => "range refresh";\n');
  git(repo, 'add', SCREEN_PATH);
  git(repo, 'commit', '-m', 'B visual change');
  const b = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'rm', '-r', 'config');
  git(repo, 'commit', '-m', 'unrelated C removes authority resources');
  const args = [...tuple(repo), ...RESOURCE_ARGS, '--range', `${a}..${b}`];
  for (const poison of [false, true]) {
    if (poison) {
      for (const name of ['policy', 'manifest', 'layout']) write(repo, `config/${name}.yaml`, 'unparseable: [\n');
    } else {
      assert.equal(fs.existsSync(path.join(repo, 'config/policy.yaml')), false);
    }
    const result = jsonResult(run(BACKSTOP, [...args, '--enforce'], repo));
    assert.equal(result.ok, true);
    assert.equal(result.diff_context.source_tree, git(repo, 'rev-parse', `${a}^{tree}`));
    assert.equal(result.diff_context.destination_tree, git(repo, 'rev-parse', `${b}^{tree}`));
    assert.deepEqual(result.changed_records.map((r) => r.path), [SCREEN_PATH]);
    const reportArgs = args.filter((arg, index) => arg !== '--screen' && args[index - 1] !== '--screen');
    const report = jsonResult(run(REPORT, [...reportArgs, '--packet', packet], repo));
    assert.equal(report.forbidden.ok, true);
    assert.deepEqual(report.forbidden.changed_records, result.changed_records);
  }
});

test('range cannot substitute a current-only authority resource missing from B', (t) => {
  const { repo } = fixture(t);
  const a = git(repo, 'rev-parse', 'HEAD');
  write(repo, SCREEN_PATH, 'export const ShopScreen = () => "range refresh";\n');
  git(repo, 'add', SCREEN_PATH);
  git(repo, 'commit', '-m', 'B without override');
  const b = git(repo, 'rev-parse', 'HEAD');
  copyKit(repo, 'config/policy.yaml', 'policies/implementation-mode-policy.yaml');
  const result = run(BACKSTOP, [...tuple(repo), '--policy', 'config/policy.yaml', '--range', `${a}..${b}`], repo);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /--policy.*snapshot/);
});

test('destination snapshot still rejects a case-only policy alias when C lacks the resource', (t) => {
  const { repo } = fixture(t, { explicit: true });
  const caseInsensitive = fs.existsSync(path.join(repo, 'Config/Policy.yaml'));
  const a = git(repo, 'rev-parse', 'HEAD');
  write(repo, SCREEN_PATH, 'export const ShopScreen = () => "refresh";\n');
  git(repo, 'add', SCREEN_PATH);
  git(repo, 'commit', '-m', 'B');
  const b = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'rm', '-r', 'config');
  git(repo, 'commit', '-m', 'C');
  const result = run(BACKSTOP, [...tuple(repo), ...RESOURCE_ARGS, '--policy', 'Config/Policy.yaml', '--range', `${a}..${b}`], repo);
  assert.equal(result.status, 2, result.stdout);
  if (caseInsensitive) assert.match(result.stderr, /spelling.*physical path/);
  else assert.match(result.stderr, /snapshot 경로/);
});

test('legacy report stdout above 1 MiB remains byte-identical through the dispatcher', (t) => {
  const root = tmp(t);
  const docs = path.join(root, 'docs');
  const src = path.join(root, 'src');
  fs.mkdirSync(docs);
  fs.mkdirSync(src);
  const paths = Array.from({ length: 14000 }, (_, i) => `src/${'long-segment-'.repeat(9)}${i}.tsx`).join('\n');
  const packet = write(root, 'large-packet.md', `---\npacket_id: LARGE\ntarget_screen: SHOP-HOME\nreadiness_mode: docs-only\nreadiness_source: readiness.mjs\n---\n\n## Allowed Paths\n\n\`\`\`txt\n${paths}\n\`\`\`\n`);
  const args = ['--packet', packet, '--docs', docs, '--src', src, '--skip-tests', '--date', '2026-09-07'];
  const capture = (script) => spawnSync(process.execPath, [script, ...args], {
    cwd: root, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 8 * 1024 * 1024,
  });
  const direct = capture(path.join(KIT_ROOT, 'scripts/workflow-report-legacy.mjs'));
  const wrapped = capture(REPORT);
  assert.equal(direct.status, 0, direct.stderr);
  assert.ok(Buffer.byteLength(direct.stdout) > 1024 * 1024);
  assert.equal(wrapped.status, direct.status, wrapped.stderr);
  assert.equal(wrapped.stdout, direct.stdout);
  assert.equal(wrapped.stderr, direct.stderr);
});

test('importing the report dispatcher has no process or output side effects', (t) => {
  const root = tmp(t);
  const code = `process.exitCode = 7; await import(${JSON.stringify(pathToFileURL(REPORT).href)}); if (process.exitCode !== 7) throw new Error('import changed exitCode'); process.stdout.write('import-inert'); process.exitCode = 0;`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: root, encoding: 'utf8', timeout: TIMEOUT });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'import-inert');
  assert.equal(result.stderr, '');
  assert.deepEqual(fs.readdirSync(root), []);
});

test('report dispatcher propagates child termination signals', { skip: process.platform === 'win32' }, (t) => {
  const root = tmp(t);
  const preload = write(root, 'signal.mjs', "import cp from 'node:child_process';\nimport { syncBuiltinESMExports } from 'node:module';\ncp.spawnSync = () => ({ signal: 'SIGTERM', status: null });\nsyncBuiltinESMExports();\n");
  const result = spawnSync(process.execPath, ['--import', preload, REPORT, '--help'], { cwd: root, encoding: 'utf8', timeout: TIMEOUT });
  assert.equal(result.signal, 'SIGTERM', result.stderr);
  assert.equal(result.stdout, '');
});

test('visual review evidence is read parsed and transported to Report and Run without becoming authority', (t) => {
  const { repo } = fixture(t);
  const packet = packetFor(repo, repo, repo);
  write(repo, SCREEN_PATH, 'export const ShopScreen = () => "refresh";\n');
  git(repo, 'add', SCREEN_PATH);
  const review = write(repo, 'tmp/review.md', '---\nreview_summary: CHANGES_REQUIRED\nreviewer: test-reviewer\n---\n\n```yaml\nfindings:\n  - severity: major\n    detail: review-only\n  - severity: minor\n    detail: observation\n```\n');
  const reportPath = path.join(repo, 'tmp/review-report.md');
  const reportArgs = ['--packet', packet, '--root', repo, '--intent', 'visual-refresh', '--input', INPUT_ID, '--path', SCREEN_PATH, '--staged', '--review', review, '--json'];
  const report = jsonResult(run(REPORT, [...reportArgs, '--out', reportPath], repo));
  assert.equal(report.forbidden.ok, true);
  assert.equal(report.review_summary, 'CHANGES_REQUIRED');
  assert.deepEqual(report.review_evidence.findings, { count: 2, bySeverity: { major: 1, minor: 1 } });
  assert.match(fs.readFileSync(reportPath, 'utf8'), /Review Evidence[\s\S]*CHANGES_REQUIRED/);
  const args = [...tuple(repo), ...MODE_ARGS, '--staged', '--review', 'tmp/review.md'];
  const result = jsonResult(run(RUN, args, repo));
  assert.equal(result.state, 'DONE_PENDING_REVIEW');
  assert.equal(result.review_summary, 'CHANGES_REQUIRED');
  assert.deepEqual(result.review_evidence, report.review_evidence);
  assert.equal(result.forbidden.ok, true);
  const out = path.join(repo, 'tmp/review-run');
  jsonResult(run(RUN, [...args, '--out', out], repo));
  assert.match(fs.readFileSync(out + '.md', 'utf8'), /Review Evidence[\s\S]*CHANGES_REQUIRED/);
});

test('missing visual review is an input error and Run never reports completion', (t) => {
  const { repo } = fixture(t);
  const packet = packetFor(repo, repo, repo);
  const output = path.join(repo, 'tmp/missing-review-report.md');
  const report = run(REPORT, ['--packet', packet, '--root', repo, '--intent', 'visual-refresh', '--input', INPUT_ID, '--path', SCREEN_PATH, '--staged', '--review', 'definitely-missing.md', '--out', output, '--json'], repo);
  assert.equal(report.status, 2, report.stdout);
  assert.match(report.stderr, /--review 파일 없음/);
  assert.equal(fs.existsSync(output), false);
  const result = jsonResult(run(RUN, [...tuple(repo), ...MODE_ARGS, '--staged', '--review', 'definitely-missing.md'], repo), 2);
  assert.equal(result.state, 'HALT_TOOL_ERROR');
  assert.match(result.reason, /--review 파일 없음/);
  assert.equal(result.visual_prework.path_allowed, true);
  assert.equal(result.report, null);
});
