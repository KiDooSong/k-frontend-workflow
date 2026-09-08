import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  canonicalAuthorityPath,
  evaluateVisualRefreshAuthority,
  routeVisualBackstopRecords,
} from './visual-refresh-runtime.mjs';
import {
  materializeGitTree,
  resolveVisualDiffContext,
} from './visual-refresh-git.mjs';
import {
  collectGeneratedOwnershipEntries,
  resolveGeneratedOwnership,
} from './generated-ownership.mjs';
import {
  PINNED_VISUAL_REFRESH_RESOURCES,
  VisualRefreshResourceError,
  prepareVisualRefreshResources,
  readPinnedBundledResource,
} from './visual-refresh-resources.mjs';
import { KIT_ROOT, yamlParse, yamlStringify } from './util.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const READINESS = path.join(KIT_ROOT, 'scripts', 'readiness.mjs');
const BACKSTOP = path.join(KIT_ROOT, 'scripts', 'forbidden-paths.mjs');
const INPUT_ID = 'IN-20260904-figma-001';
const SCREEN_ID = 'SHOP-HOME';
const SCREEN_PATH = 'src/features/shop/screens/ShopScreen.tsx';
const SPAWN_TIMEOUT = 60_000;

function tmpdir(t, prefix = 'visual-refresh-boundary-') {
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

function screenSpec({ screenPath = SCREEN_PATH, screenId = SCREEN_ID, extra = '' } = {}) {
  return `---
artifact_id: ${screenId}-screen-spec
artifact_type: screen-spec
domain: shop
screen_id: ${screenId}
route: /shop
screen_entry: ${screenPath}
status: confirmed
${extra}---

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
captured_by: boundary-test
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

function createAuthorityFixture(t, options = {}) {
  const root = tmpdir(t, 'visual-refresh-e2e-');
  git(root, 'init');
  git(root, 'config', 'user.email', 'visual-refresh@example.com');
  git(root, 'config', 'user.name', 'Visual Refresh Test');
  write(
    root,
    'docs/frontend-workflow/app/navigation-map.md',
    '---\nartifact_id: navigation-map\nartifact_type: navigation-map\nstatus: draft\n---\n',
  );
  write(
    root,
    'docs/frontend-workflow/design/component-catalog.md',
    '# GENERATED FILE - DO NOT EDIT\n\n| Name | Source | Export | Status |\n|---|---|---|---|\n',
  );
  write(
    root,
    'docs/frontend-workflow/domains/shop/screens/shop-home/screen-spec.md',
    screenSpec({ screenPath: options.screenPath || SCREEN_PATH }),
  );
  write(
    root,
    'docs/frontend-workflow/domains/shop/screens/shop-home/figma-component-mapping.md',
    mappingArtifact(),
  );
  write(root, `docs/frontend-workflow/inputs/shop/${INPUT_ID}.md`, inputArtifact());
  write(root, 'docs/frontend-workflow/_meta/reconciliation-register.md', registerArtifact());
  write(root, options.screenPath || SCREEN_PATH, 'export const ShopScreen = () => null;\n');
  write(root, 'src/features/shop/hooks/useShop.ts', 'export const useShop = () => ({});\n');
  if (options.malformedCoOwner) {
    write(
      root,
      'docs/frontend-workflow/domains/shop/screens/bad-owner/screen-spec.md',
      `---
artifact_id: BAD-OWNER-screen-spec
artifact_type: screen-spec
domain: shop
screen_entry: ${options.screenPath || SCREEN_PATH}
status: confirmed
screen_lifecycle: malformed
---

## Purpose

Malformed physical co-owner.
`,
    );
  }
  if (options.explicitResources) {
    for (const [target, source] of [
      ['config/policy.yaml', path.join(KIT_ROOT, 'policies', 'implementation-mode-policy.yaml')],
      ['config/manifest.yaml', path.join(KIT_ROOT, 'catalog', 'artifact-manifest.yaml')],
      ['config/layout.yaml', path.join(KIT_ROOT, 'policies', 'project-layout.yaml')],
    ]) {
      const destination = path.join(root, ...target.split('/'));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    }
    const policyFile = path.join(root, 'config', 'policy.yaml');
    const policy = yamlParse(fs.readFileSync(policyFile, 'utf8'));
    policy.modes['api-integrated-ui'].allowed_paths.push('{roles.screen}');
    policy.modes['api-integrated-ui'].forbidden_paths = [];
    fs.writeFileSync(policyFile, yamlStringify(policy, { lineWidth: 0 }), 'utf8');
  }
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'authority baseline');
  return root;
}

function visualArgs(root, pathValue = SCREEN_PATH) {
  return [
    '--root',
    root,
    '--screen',
    SCREEN_ID,
    '--intent',
    'visual-refresh',
    '--input',
    INPUT_ID,
    '--path',
    pathValue,
    '--json',
  ];
}

function syntheticAuthority(overrides = {}) {
  const readiness = {
    readiness_mode: 'final-fixture-ui',
    allowed_paths: ['src/features/shop/screens/**', 'src/features/shop/hooks/**'],
    forbidden_paths: ['src/api/**'],
    __mode_order: [
      'docs-only',
      'route-skeleton',
      'screen-skeleton',
      'rough-fixture-ui',
      'final-fixture-ui',
      'api-integrated-ui',
      'production-ready',
    ],
  };
  return {
    intent_authorization: { applicable: true },
    _context: {
      authorized_path: SCREEN_PATH,
      selected_input_path: `docs/frontend-workflow/inputs/shop/${INPUT_ID}.md`,
      register_path: 'docs/frontend-workflow/_meta/reconciliation-register.md',
      mapping_path:
        'docs/frontend-workflow/domains/shop/screens/shop-home/figma-component-mapping.md',
      screen_spec_path:
        'docs/frontend-workflow/domains/shop/screens/shop-home/screen-spec.md',
      selected_input_existed_at_source: false,
      selected_screen: SCREEN_ID,
      readiness,
      candidate_claims: { active: [], denied: [] },
      generated_entries: [],
      generated_roots: [],
      visual_path_authorization: { allowed: true },
      ...overrides,
    },
  };
}

test('actual default policy opens the exact api-integrated screen in forward and staged E2E', (t) => {
  const root = createAuthorityFixture(t);
  const forward = run(READINESS, visualArgs(root), root);
  assert.equal(forward.status, 0, forward.stderr || forward.stdout);
  const forwardJson = JSON.parse(forward.stdout);
  assert.equal(forwardJson.intent_authorization.applicable, true, forward.stdout);
  assert.equal(forwardJson.path_authorization.allowed, true, forward.stdout);
  assert.equal(
    forwardJson.path_authorization.grant,
    'visual-refresh-canonical-api-stage-screen-waiver',
  );
  const [waived] = forwardJson.path_authorization.waived_rules;
  for (const key of [
    'rule_id',
    'source',
    'authored_path',
    'resolved_path',
    'disposition',
    'origin',
    'scope',
  ]) {
    assert.ok(waived[key], `missing waived-rule provenance: ${key}`);
  }
  assert.equal(waived.authored_path, '{roles.screen}');

  write(root, SCREEN_PATH, 'export const ShopScreen = () => "refreshed";\n');
  git(root, 'add', SCREEN_PATH);
  const staged = run(BACKSTOP, [...visualArgs(root), '--staged', '--enforce'], root);
  assert.equal(staged.status, 0, staged.stderr || staged.stdout);
  const stagedJson = JSON.parse(staged.stdout);
  assert.equal(stagedJson.ok, true, staged.stdout);
  assert.deepEqual(stagedJson.violations, []);
});

test('staged authority reads explicit resources from the captured index tree, not unstaged worktree bytes', (t) => {
  const root = createAuthorityFixture(t, { explicitResources: true });
  write(root, SCREEN_PATH, 'export const ShopScreen = () => "staged";\n');
  git(root, 'add', SCREEN_PATH);
  fs.appendFileSync(path.join(root, 'config', 'policy.yaml'), '\n: invalid unstaged yaml\n', 'utf8');
  const result = run(
    BACKSTOP,
    [
      ...visualArgs(root),
      '--policy',
      'config/policy.yaml',
      '--manifest',
      'config/manifest.yaml',
      '--layout',
      'config/layout.yaml',
      '--staged',
      '--enforce',
    ],
    root,
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).ok, true, result.stdout);
});

test('bundled resources are pinned and a dirty byte sequence cannot self-attest', (t) => {
  const bundled = tmpdir(t, 'visual-refresh-bundled-');
  const policy = PINNED_VISUAL_REFRESH_RESOURCES.policy;
  const destination = path.join(bundled, ...policy.relative.split('/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(KIT_ROOT, ...policy.relative.split('/')), destination);
  assert.equal(readPinnedBundledResource('policy', bundled).git_blob_sha, policy.git_blob_sha);
  fs.appendFileSync(destination, '\n# dirty\n', 'utf8');
  assert.throws(
    () => readPinnedBundledResource('policy', bundled),
    /pinned Git blob과 불일치/,
  );
});

test('explicit authority resource symlinks are rejected before any snapshot read', (t) => {
  const root = tmpdir(t, 'visual-refresh-symlink-');
  fs.mkdirSync(path.join(root, 'docs', 'frontend-workflow'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  const outside = write(root, 'outside-policy.yaml', 'version: 1\nmodes: {}\n');
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  try {
    fs.symlinkSync(outside, path.join(root, 'config', 'policy.yaml'));
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      t.skip(`symlink unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  assert.throws(
    () =>
      prepareVisualRefreshResources({
        destinationRoot: root,
        options: { policy: 'config/policy.yaml' },
      }),
    VisualRefreshResourceError,
  );
});

test('diff records stay bound to captured tree OIDs even if the index mutates before diff', (t) => {
  const root = tmpdir(t, 'visual-refresh-race-');
  git(root, 'init');
  git(root, 'config', 'user.email', 'race@example.com');
  git(root, 'config', 'user.name', 'Race Test');
  write(root, 'screen.tsx', 'before\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'initial');
  write(root, 'screen.tsx', 'captured destination\n');
  git(root, 'add', 'screen.tsx');

  const resolved = resolveVisualDiffContext({
    repositoryRoot: root,
    staged: true,
    afterTreesResolved() {
      write(root, 'late.ts', 'must not enter captured records\n');
      git(root, 'add', 'late.ts');
    },
  });
  assert.deepEqual(
    resolved.records.map((record) => record.path),
    ['screen.tsx'],
  );
  const destination = materializeGitTree({
    repositoryRoot: root,
    tree: resolved.destination_tree,
  });
  t.after(() => destination.cleanup());
  assert.equal(fs.existsSync(path.join(destination.root, 'late.ts')), false);
  assert.equal(
    fs.readFileSync(path.join(destination.root, 'screen.tsx'), 'utf8'),
    'captured destination\n',
  );
});

test('non-empty project prefix uses project-relative records for every exact operation', () => {
  const prefix = 'packages/mobile';
  const authority = syntheticAuthority();
  const records = [
    { status: 'M', path: `${prefix}/${SCREEN_PATH}`, raw: 'M' },
    {
      status: 'A',
      path: `${prefix}/docs/frontend-workflow/inputs/shop/${INPUT_ID}.md`,
      raw: 'A',
    },
    {
      status: 'M',
      path: `${prefix}/docs/frontend-workflow/_meta/reconciliation-register.md`,
      raw: 'M',
    },
    {
      status: 'A',
      path:
        `${prefix}/docs/frontend-workflow/domains/shop/screens/shop-home/` +
        'figma-component-mapping.md',
      raw: 'A',
    },
  ];
  assert.deepEqual(
    routeVisualBackstopRecords({ records, authority, projectPrefix: prefix }).violations,
    [],
  );
});

test('another screen active API Candidate claim remains owner-only in visual record routing', () => {
  const sharedHook = 'src/features/shop/hooks/useShared.ts';
  const authority = syntheticAuthority({
    candidate_claims: {
      active: [
        {
          kind: 'active',
          screen_id: 'SHOP-OTHER',
          endpoint: 'GET /shared',
          path: sharedHook,
          surface_kind: 'hook',
        },
      ],
      denied: [],
    },
  });
  const result = routeVisualBackstopRecords({
    records: [{ status: 'M', path: sharedHook, raw: 'M' }],
    authority,
  });
  assert.ok(result.violations.some((entry) => entry.code === 'VR-BACKSTOP-007'));
  assert.match(result.violations[0].reason, /owned by another screen|owning screen/);
});

test('generated ownership requires both an active manifest output and the generated header', (t) => {
  const root = tmpdir(t, 'visual-refresh-generated-');
  const file = 'src/features/shop/hooks/useHuman.ts';
  write(root, file, 'export const useHuman = () => null;\n');
  const manifest = {
    artifacts: {
      'codegen-openapi-client': {
        kind: 'generated',
        generated: true,
        do_not_edit: true,
        status: 'active',
        outputs: [{ path: 'src/features/{domain}/hooks/*.ts' }],
      },
    },
  };
  const entries = collectGeneratedOwnershipEntries(manifest);
  assert.equal(
    resolveGeneratedOwnership({
      file,
      entries,
      roots: [{ kind: 'destination', root }],
    }),
    null,
  );

  const humanAuthority = syntheticAuthority({
    generated_entries: entries,
    generated_roots: [{ kind: 'destination', root }],
  });
  assert.deepEqual(
    routeVisualBackstopRecords({
      records: [{ status: 'M', path: file, raw: 'M' }],
      authority: humanAuthority,
    }).violations,
    [],
  );

  write(root, file, '// GENERATED FILE - DO NOT EDIT\nexport const useHuman = () => null;\n');
  const generatedResult = routeVisualBackstopRecords({
    records: [{ status: 'M', path: file, raw: 'M' }],
    authority: humanAuthority,
  });
  assert.ok(generatedResult.violations.some((entry) => entry.code === 'VR-BACKSTOP-003'));
});

test('malformed physical co-owner closes an otherwise complete authority chain', (t) => {
  const root = createAuthorityFixture(t, { malformedCoOwner: true });
  const result = run(READINESS, visualArgs(root), root);
  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.intent_authorization.applicable, false, result.stdout);
  assert.ok(
    json.intent_authorization.reasons.some((entry) => entry.code === 'VR-SCREEN-010'),
    result.stdout,
  );
});

test('concrete visual paths allow dynamic-route brackets and braces but still reject real wildcards', () => {
  for (const file of [
    'app/[id]/page.tsx',
    'app/[...slug]/page.tsx',
    'app/{locale}/page.tsx',
    'src/features/shop/screens/[id].tsx',
  ]) {
    assert.equal(canonicalAuthorityPath(file), file);
  }
  assert.throws(() => canonicalAuthorityPath('app/*/page.tsx'), /glob|concrete|canonical/);
  assert.throws(() => canonicalAuthorityPath('app/?/page.tsx'), /glob|concrete|canonical/);
});
