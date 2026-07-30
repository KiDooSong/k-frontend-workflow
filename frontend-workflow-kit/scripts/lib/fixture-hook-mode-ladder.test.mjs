// fixture-hook-mode-ladder.test.mjs — Issue #211 fixture-hook 사다리 회귀 고정.
//
// 실제 kit 정책(policies/implementation-mode-policy.yaml)과 실제 레이아웃(expo-feature)을 로드해
// 사다리 계약을 검증한다 — 테스트-로컬 정책 사본이 실정책과 표류하는 것을 막는다.
//
// 고정하는 두 회귀(#211):
//   A. greenfield 도메인(훅 파일 0개)이 rough-fixture-ui 에 진입해 첫 fixture fake hook 을
//      {roles.hook} 에 만들 수 있어야 한다 — fake_hook_exists 진입 전제의 순환 제거.
//   B. API Candidates v2 가 active hook Slice Path 를 미리 선언한 화면이 rough/final 에서
//      그 hook 경로를 fixture seam 으로 편집할 수 있어야 한다 — 단 같은 candidate 의
//      API-client Slice Path 는 api-integrated 전에는 계속 거부(surface_kind 구분).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { KIT_ROOT, loadYaml, yamlStringify } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { computeReadiness } from '../readiness.mjs';
import {
  deriveMetrics,
  findApiCandidateOwnershipConflicts,
  getSections,
} from './spec.mjs';
import {
  collectApiCandidateClaims,
  readinessPathAuthorization,
} from './path-backstop.mjs';
import { buildPacketModel, renderJsonEnvelope as renderPacketJson } from './workflow-packet.mjs';

const POLICY_PATH = path.join(KIT_ROOT, 'policies', 'implementation-mode-policy.yaml');
const READINESS_CLI = path.join(KIT_ROOT, 'scripts', 'readiness.mjs');
const FORBIDDEN_CLI = path.join(KIT_ROOT, 'scripts', 'forbidden-paths.mjs');
const SPAWN_TIMEOUT_MS = 30_000;

const policy = loadYaml(POLICY_PATH);
const layout = loadLayoutProfile({ kitRoot: KIT_ROOT });
const ORDER = policy.order;

// 전체 CI 게이트 통과 입력(production-ready 도달용).
const CI_PASS = {
  ci_lint: 'pass',
  ci_schema_validation: 'pass',
  state_coverage_complete: true,
  llm_semantic_review: 'pass',
};

const GLOBAL = {
  stub_screen_specs_count: 1,
  navigation_map_status: 'draft',
  component_catalog_generated: true,
};

// spec 본문에서 derived 를 실제 파서(deriveMetrics)로 만든다 — slice path 검증이 실제
// resolved 레이아웃 표면(role 바인딩)을 그대로 태우게.
function makeSpec(apiSection, { domain = 'create', unknownRows = '| U-DEFER | contract pending | open |', stateMatrix = true } = {}) {
  const body = [
    '# Fixture ladder spec',
    '',
    ...(stateMatrix
      ? [
          '## State Matrix',
          '| State | Trigger | UI | User Action |',
          '|---|---|---|---|',
          ...['loading', 'empty', 'error', 'success', 'disabled', 'refreshing'].map(
            (state) => `| ${state} | x | x | x |`,
          ),
          '',
        ]
      : ['## Purpose', '', 'fixture ladder', '']),
    '## API Candidates',
    apiSection,
    '',
    '## Unknowns',
    '| ID | Question | Status |',
    '|---|---|---|',
    unknownRows,
    '',
  ].join('\n');
  return {
    path: `/tmp/${domain}/screen-spec.md`,
    dir: `/tmp/${domain}`,
    frontmatter: { domain },
    sections: getSections(body),
  };
}

function v2Table(
  rows,
  headers = ['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths'],
) {
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function derivedFor(spec, selectedLayout = layout) {
  return deriveMetrics(spec, {
    layout: selectedLayout,
    srcDir: '/tmp/src',
    projectRoot: '/tmp',
  });
}

function screenEntry({ status = 'draft', domain = 'create', derived }) {
  return { status, domain, route: `/${domain}`, stub: false, derived };
}

function readinessOf(
  screens,
  { ci = {}, selectedLayout = layout, selectedPolicy = policy, surfaces } = {},
) {
  return computeReadiness({
    state: { global: GLOBAL, screens, ...(surfaces ? { surfaces } : {}) },
    policy: selectedPolicy,
    ci,
    manifest: {},
    layout: selectedLayout,
  });
}

function authorize(readiness, screenId, file, order = ORDER) {
  return readinessPathAuthorization({
    file,
    screenId,
    entry: readiness[screenId],
    modeOrder: order,
    claims: collectApiCandidateClaims(readiness),
  });
}

// --- 회귀 A: greenfield 도메인 fixture hook bootstrap --------------------------------

test('greenfield domain with zero hook files reaches rough-fixture-ui and may create the first fake hook', () => {
  const derived = derivedFor(makeSpec('- GET /checkout (confidence: candidate)', { domain: 'checkout' }));
  assert.equal(derived.fake_hook_exists, false, 'fixture precondition: no hook file exists');
  const readiness = readinessOf({
    'CHECKOUT-001': screenEntry({ status: 'draft', domain: 'checkout', derived }),
  });
  const entry = readiness['CHECKOUT-001'];
  assert.equal(entry.readiness_mode, 'rough-fixture-ui');
  assert.ok(entry.allowed_paths.includes('src/features/checkout/hooks/**'));
  assert.ok(entry.forbidden_paths.includes('src/api/**'));
  assert.ok(entry.forbidden_paths.includes('openapi.yaml'));

  const hook = authorize(readiness, 'CHECKOUT-001', 'src/features/checkout/hooks/useCheckout.ts');
  assert.equal(hook.allowed, true, JSON.stringify(hook));
  const apiClient = authorize(readiness, 'CHECKOUT-001', 'src/api/checkout/client.ts');
  assert.equal(apiClient.allowed, false);
});

test('greenfield fake hook concrete --path authorization=true through the readiness CLI', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-hook-greenfield-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = path.join(root, 'docs', 'frontend-workflow');
  fs.mkdirSync(path.join(docs, '_meta'), { recursive: true });
  const derived = derivedFor(makeSpec('- GET /checkout (confidence: candidate)', { domain: 'checkout' }));
  fs.writeFileSync(
    path.join(docs, '_meta', 'workflow-state.yaml'),
    yamlStringify({
      generated_at: '2026-07-27',
      global: GLOBAL,
      screens: { 'CHECKOUT-001': screenEntry({ status: 'draft', domain: 'checkout', derived }) },
    }),
    'utf8',
  );
  const result = spawnSync(
    process.execPath,
    [
      READINESS_CLI,
      '--docs',
      docs,
      '--screen',
      'CHECKOUT-001',
      '--path',
      'src/features/checkout/hooks/useCheckout.ts',
      '--json',
    ],
    { cwd: root, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS },
  );
  assert.equal(result.status, 0, result.stderr);
  const entry = JSON.parse(result.stdout)['CHECKOUT-001'];
  assert.equal(entry.readiness_mode, 'rough-fixture-ui');
  assert.equal(entry.path_authorization.allowed, true, JSON.stringify(entry.path_authorization));
});

// --- 회귀 B: v2 active hook claim 은 rough/final 에서 fixture seam --------------------

const HOOK_SLICE = 'src/features/create/hooks/useAttachments.ts';
const API_SLICE = 'src/api/create/attachments/**';

function v2ActiveSpec({ stateMatrix = true } = {}) {
  return makeSpec(
    v2Table([
      ['GET', '/create/attachments', 'confirmed', 'active', '-', `${HOOK_SLICE}; ${API_SLICE}`],
    ]),
    { stateMatrix },
  );
}

test('rough-fixture-ui: owning screen may edit its active hook slice but not its API-client slice', () => {
  const derived = derivedFor(v2ActiveSpec());
  const readiness = readinessOf({
    'CREATE-ATTACH': screenEntry({ status: 'draft', derived }),
  });
  assert.equal(readiness['CREATE-ATTACH'].readiness_mode, 'rough-fixture-ui');

  const hook = authorize(readiness, 'CREATE-ATTACH', HOOK_SLICE);
  assert.equal(hook.allowed, true, JSON.stringify(hook));
  assert.equal(hook.candidate_matches[0].surface_kind, 'hook');

  const apiClient = authorize(readiness, 'CREATE-ATTACH', 'src/api/create/attachments/client.ts');
  assert.equal(apiClient.allowed, false);
});

test('final-fixture-ui: owning screen keeps hook-slice editing while API-client slices stay closed', () => {
  const derived = derivedFor(v2ActiveSpec({ stateMatrix: false }));
  derived.fake_hook_exists = true;
  derived.figma_mapping_status = 'draft';
  const readiness = readinessOf({
    'CREATE-ATTACH': screenEntry({ status: 'confirmed', derived }),
  });
  assert.equal(readiness['CREATE-ATTACH'].readiness_mode, 'final-fixture-ui');
  const entry = readiness['CREATE-ATTACH'];
  assert.ok(entry.allowed_paths.includes('src/features/create/hooks/**'));
  assert.ok(entry.forbidden_paths.includes('src/api/**'));

  const hook = authorize(readiness, 'CREATE-ATTACH', HOOK_SLICE);
  assert.equal(hook.allowed, true, JSON.stringify(hook));
  const apiClient = authorize(readiness, 'CREATE-ATTACH', 'src/api/create/attachments/client.ts');
  assert.equal(apiClient.allowed, false);
});

test('invalid v2 contracts never open an active hook claim at rough/final fixture modes', () => {
  const duplicateSliceHeaders = [
    'Method',
    'Path',
    'Confidence',
    'Gate',
    'Tracking',
    'Slice Paths',
    'Slice Paths',
  ];
  const cases = [
    {
      name: 'duplicate v2 tables',
      code: 'API-V2-TABLE-COUNT',
      spec: makeSpec(
        [
          v2Table([
            ['GET', '/create/attachments', 'confirmed', 'active', '-', HOOK_SLICE],
          ]),
          '',
          v2Table([
            [
              'GET',
              '/create/other',
              'confirmed',
              'active',
              '-',
              'src/api/create/other/**',
            ],
          ]),
        ].join('\n'),
      ),
    },
    {
      name: 'duplicate Slice Paths columns',
      code: 'API-V2-COLUMN-DUPLICATE',
      spec: makeSpec(
        v2Table(
          [
            [
              'GET',
              '/create/attachments',
              'confirmed',
              'active',
              '-',
              HOOK_SLICE,
              'src/api/create/duplicate/**',
            ],
          ],
          duplicateSliceHeaders,
        ),
      ),
    },
    {
      name: 'malformed tracking on another row',
      code: 'API-V2-TRACKING',
      spec: makeSpec(
        v2Table([
          ['GET', '/create/attachments', 'confirmed', 'active', '-', HOOK_SLICE],
          [
            'GET',
            '/create/pending',
            'candidate',
            'deferred',
            '',
            'src/api/create/pending/**',
          ],
        ]),
      ),
    },
  ];

  for (const row of cases) {
    const parsed = derivedFor(row.spec);
    assert.equal(parsed.api_candidate_deferrals_valid, false, row.name);
    assert.ok(
      parsed.api_candidate_contract_issues.some((issue) => issue.code === row.code),
      row.name,
    );
    assert.ok(
      parsed.api_actionable_candidates.some((candidate) =>
        candidate.safe_slice_paths.includes(HOOK_SLICE),
      ),
      `${row.name}: active hook provenance should remain actionable for diagnostics`,
    );

    for (const mode of ['rough-fixture-ui', 'final-fixture-ui']) {
      const derived = structuredClone(parsed);
      let status = 'draft';
      if (mode === 'final-fixture-ui') {
        status = 'confirmed';
        derived.fake_hook_exists = true;
        derived.figma_mapping_status = 'draft';
        derived.state_matrix_complete = false;
      }
      const readiness = readinessOf({
        'CREATE-ATTACH': screenEntry({ status, derived }),
      });
      const entry = readiness['CREATE-ATTACH'];
      assert.equal(entry.readiness_mode, mode, `${row.name}: ${mode}`);
      assert.equal(entry.api_candidate_authorization.valid, false, row.name);
      const hook = authorize(readiness, 'CREATE-ATTACH', HOOK_SLICE);
      assert.equal(hook.allowed, false, `${row.name}: ${mode}`);
      assert.match(hook.reason, /API Candidates v2 contract is invalid/, row.name);
    }
  }
});

test('below rough-fixture-ui the base envelope still denies an owned active hook claim', () => {
  const derived = derivedFor(v2ActiveSpec());
  const readiness = readinessOf({
    'CREATE-ATTACH': { status: 'draft', domain: 'create', route: '/create', stub: true, derived },
  });
  assert.equal(readiness['CREATE-ATTACH'].readiness_mode, 'screen-skeleton');
  const hook = authorize(readiness, 'CREATE-ATTACH', HOOK_SLICE);
  assert.equal(hook.allowed, false);
  assert.match(hook.reason, /rough-fixture-ui/);

  const apiClient = authorize(
    readiness,
    'CREATE-ATTACH',
    'src/api/create/attachments/client.ts',
  );
  assert.equal(apiClient.allowed, false);
  assert.match(apiClient.reason, /api-integrated-ui/);
});

test('another screen (legacy broad or sibling) cannot open an active hook claim it does not own', () => {
  const derived = derivedFor(v2ActiveSpec());
  const legacy = derivedFor(makeSpec('- GET /legacy (confidence: confirmed)', { domain: 'legacy' }));
  legacy.fake_hook_exists = true;
  legacy.figma_mapping_status = 'verified';
  const readiness = readinessOf(
    {
      'CREATE-ATTACH': screenEntry({ status: 'draft', derived }),
      LEGACY: screenEntry({ status: 'confirmed', domain: 'legacy', derived: legacy }),
    },
    { ci: CI_PASS },
  );
  assert.equal(readiness.LEGACY.readiness_mode, 'production-ready');
  const viaLegacy = authorize(readiness, 'LEGACY', HOOK_SLICE);
  assert.equal(viaLegacy.allowed, false);
  assert.match(viaLegacy.reason, /requires its owning screen/);
  assert.match(viaLegacy.reason, /owned by another screen/);
  assert.match(viaLegacy.reason, /CREATE-ATTACH/);
});

// --- deferred / conflict claim 은 모든 모드에서 거부 -----------------------------------

const DEFERRED_HOOK_SLICE = 'src/features/create/hooks/useStock.ts';
const DEFERRED_API_SLICE = 'src/api/create/stock/**';

function v2MixedSpec({ stateMatrix = true } = {}) {
  return makeSpec(
    v2Table([
      ['GET', '/create/attachments', 'confirmed', 'active', '-', `${HOOK_SLICE}; ${API_SLICE}`],
      [
        'GET',
        '/create/stock',
        'candidate',
        'deferred',
        'issue:#211',
        `${DEFERRED_HOOK_SLICE}; ${DEFERRED_API_SLICE}`,
      ],
    ]),
    { stateMatrix },
  );
}

// 각 모드에 도달하는 화면 구성. derived 는 실제 파서 산출물에 모드 도달 fact 만 얹는다.
function screenAtMode(mode, spec) {
  const derived = derivedFor(spec);
  switch (mode) {
    case 'rough-fixture-ui':
      return { entry: screenEntry({ status: 'draft', derived }), ci: {} };
    case 'final-fixture-ui': {
      derived.fake_hook_exists = true;
      derived.figma_mapping_status = 'draft';
      derived.state_matrix_complete = false;
      return { entry: screenEntry({ status: 'confirmed', derived }), ci: {} };
    }
    case 'api-integrated-ui': {
      derived.fake_hook_exists = true;
      derived.figma_mapping_status = 'draft';
      return { entry: screenEntry({ status: 'confirmed', derived }), ci: {} };
    }
    case 'production-ready': {
      derived.fake_hook_exists = true;
      derived.figma_mapping_status = 'draft';
      return { entry: screenEntry({ status: 'confirmed', derived }), ci: CI_PASS };
    }
    default:
      throw new Error(`unhandled mode ${mode}`);
  }
}

test('deferred hook and API-client slices stay denied at every mode of the ladder', () => {
  for (const mode of ['rough-fixture-ui', 'final-fixture-ui', 'api-integrated-ui', 'production-ready']) {
    const { entry, ci } = screenAtMode(mode, v2MixedSpec());
    const readiness = readinessOf({ 'CREATE-ATTACH': entry }, { ci });
    assert.equal(readiness['CREATE-ATTACH'].readiness_mode, mode);
    for (const file of [DEFERRED_HOOK_SLICE, 'src/api/create/stock/client.ts']) {
      const result = authorize(readiness, 'CREATE-ATTACH', file);
      assert.equal(result.allowed, false, `${mode} ${file}`);
      assert.match(result.reason, /deferred\/conflict/, `${mode} ${file}`);
    }
  }
});

test('cross-screen ownership conflict paths stay denied at every mode', () => {
  const conflictSlice = 'src/features/create/hooks/useShared.ts';
  for (const mode of ['rough-fixture-ui', 'final-fixture-ui', 'api-integrated-ui', 'production-ready']) {
    const specA = makeSpec(
      v2Table([['GET', '/a', 'confirmed', 'active', '-', conflictSlice]]),
    );
    const specB = makeSpec(
      v2Table([['GET', '/b', 'confirmed', 'active', '-', conflictSlice]]),
    );
    const { entry: entryA, ci } = screenAtMode(mode, specA);
    const { entry: entryB } = screenAtMode(mode, specB);
    const conflicts = findApiCandidateOwnershipConflicts(
      new Map([
        ['SCREEN-A', { derived: entryA.derived }],
        ['SCREEN-B', { derived: entryB.derived }],
      ]),
    );
    entryA.derived.api_candidate_ownership_conflicts = conflicts.get('SCREEN-A') || [];
    entryB.derived.api_candidate_ownership_conflicts = conflicts.get('SCREEN-B') || [];
    const readiness = readinessOf({ 'SCREEN-A': entryA, 'SCREEN-B': entryB }, { ci });
    for (const screenId of ['SCREEN-A', 'SCREEN-B']) {
      const result = authorize(readiness, screenId, conflictSlice);
      assert.equal(result.allowed, false, `${mode} ${screenId}`);
      assert.match(result.reason, /deferred\/conflict/, `${mode} ${screenId}`);
    }
  }
});

// --- 사다리 상단: final / api-integrated 도달 계약 -------------------------------------

test('hook exists + confirmed ScreenSpec + draft figma mapping reaches final-fixture-ui with the fixture envelope', () => {
  const derived = derivedFor(makeSpec('- GET /create (confidence: candidate)'));
  derived.fake_hook_exists = true;
  derived.figma_mapping_status = 'draft';
  const readiness = readinessOf({ 'CREATE-ATTACH': screenEntry({ status: 'confirmed', derived }) });
  const entry = readiness['CREATE-ATTACH'];
  assert.equal(entry.readiness_mode, 'final-fixture-ui');
  assert.ok(entry.allowed_paths.includes('src/features/create/screens/**'));
  assert.ok(entry.allowed_paths.includes('src/features/create/components/**'));
  assert.ok(entry.allowed_paths.includes('src/features/create/hooks/**'));
  assert.ok(entry.forbidden_paths.includes('src/api/**'));
  assert.equal(authorize(readiness, 'CREATE-ATTACH', 'openapi.yaml').allowed, false);
  assert.equal(authorize(readiness, 'CREATE-ATTACH', 'src/api/create/client.ts').allowed, false);
});

test('missing fake hook blocks final-fixture-ui promotion (not rough-fixture-ui entry)', () => {
  const derived = derivedFor(makeSpec('- GET /create (confidence: candidate)'));
  assert.equal(derived.fake_hook_exists, false);
  derived.figma_mapping_status = 'draft';
  const readiness = readinessOf({ 'CREATE-ATTACH': screenEntry({ status: 'confirmed', derived }) });
  const entry = readiness['CREATE-ATTACH'];
  assert.equal(entry.readiness_mode, 'rough-fixture-ui');
  assert.equal(entry.next_mode, 'final-fixture-ui');
  assert.ok(entry.blocking.some((row) => row.fake_hook === false));
  assert.ok(entry.next_actions.some((action) => /add fake hook at src\/features\/create\/hooks\//.test(action)));
});

test('confirmed actionable API + complete State Matrix reaches api-integrated-ui: hook/API-client open, screen closed', () => {
  const { entry: screen, ci } = screenAtMode('api-integrated-ui', v2ActiveSpec());
  const readiness = readinessOf({ 'CREATE-ATTACH': screen }, { ci });
  const entry = readiness['CREATE-ATTACH'];
  assert.equal(entry.readiness_mode, 'api-integrated-ui');
  assert.ok(entry.allowed_paths.includes(HOOK_SLICE));
  assert.ok(entry.allowed_paths.includes(API_SLICE));
  assert.ok(entry.forbidden_paths.includes('src/features/create/screens/**'));
  assert.equal(authorize(readiness, 'CREATE-ATTACH', HOOK_SLICE).allowed, true);
  assert.equal(
    authorize(readiness, 'CREATE-ATTACH', 'src/api/create/attachments/client.ts').allowed,
    true,
  );
  assert.equal(
    authorize(readiness, 'CREATE-ATTACH', 'src/features/create/screens/CreateAttach.tsx').allowed,
    false,
  );
});

// --- surface_kind: 레이아웃/도메인 오버라이드 후의 resolved 표면 기준 --------------------

const monorepoLayout = {
  layerTelemetryDeclared: false,
  resolvePaths(paths, { domain } = {}) {
    return paths.flatMap((entry) => {
      const m = /^\{roles\.([a-z_]+)\}$/.exec(entry);
      if (!m) return [entry];
      const d = domain || '{domain}';
      if (m[1] === 'hook') return [`app/${d}/viewmodels/**`];
      if (m[1] === 'api_client') return [`app/${d}/repositories/**`];
      return [`app/${d}/${m[1]}s/**`];
    });
  },
  roleToDir(role, { domain } = {}) {
    return this.resolvePaths([`{roles.${role}}`], { domain })[0].replace(/\/\*\*$/, '');
  },
};

test('custom monorepo layout classifies hook vs API-client surface_kind from resolved roles', () => {
  const spec = makeSpec(
    v2Table([
      [
        'GET',
        '/create/attachments',
        'confirmed',
        'active',
        '-',
        'app/create/viewmodels/useAttachments.ts; app/create/repositories/attachments/**',
      ],
    ]),
  );
  const derived = derivedFor(spec, monorepoLayout);
  const readiness = readinessOf(
    { 'CREATE-ATTACH': screenEntry({ status: 'draft', derived }) },
    { selectedLayout: monorepoLayout },
  );
  const entry = readiness['CREATE-ATTACH'];
  assert.equal(entry.readiness_mode, 'rough-fixture-ui');
  const kinds = Object.fromEntries(
    entry.api_candidate_authorization.actionable.map((row) => [row.path, row.surface_kind]),
  );
  assert.deepEqual(kinds, {
    'app/create/viewmodels/useAttachments.ts': 'hook',
    'app/create/repositories/attachments/**': 'api-client',
  });
  assert.equal(
    authorize(readiness, 'CREATE-ATTACH', 'app/create/viewmodels/useAttachments.ts').allowed,
    true,
  );
  assert.equal(
    authorize(readiness, 'CREATE-ATTACH', 'app/create/repositories/attachments/client.ts').allowed,
    false,
  );
});

test('ambiguous hook/API-client overlap fail-closes surface_kind and keeps the integration gate', () => {
  const overlappingLayout = {
    layerTelemetryDeclared: false,
    resolvePaths(paths, { domain } = {}) {
      return paths.flatMap((entry) => {
        const m = /^\{roles\.([a-z_]+)\}$/.exec(entry);
        if (!m) return [entry];
        const d = domain || '{domain}';
        if (m[1] === 'hook' || m[1] === 'api_client') return [`app/${d}/data/**`];
        return [`app/${d}/${m[1]}s/**`];
      });
    },
    roleToDir(role, { domain } = {}) {
      return this.resolvePaths([`{roles.${role}}`], { domain })[0].replace(/\/\*\*$/, '');
    },
  };
  const spec = makeSpec(
    v2Table([['GET', '/create/attachments', 'confirmed', 'active', '-', 'app/create/data/useAttachments.ts']]),
  );
  const derived = derivedFor(spec, overlappingLayout);
  const readiness = readinessOf(
    { 'CREATE-ATTACH': screenEntry({ status: 'draft', derived }) },
    { selectedLayout: overlappingLayout },
  );
  const entry = readiness['CREATE-ATTACH'];
  assert.equal(entry.api_candidate_authorization.actionable[0].surface_kind, null);
  // ambiguous surface 는 fixture seam 을 열지 못한다 — forbidden-wins(base) 또는 integration
  // 게이트 어느 쪽이든 fail-closed 로 거부된다.
  const result = authorize(readiness, 'CREATE-ATTACH', 'app/create/data/useAttachments.ts');
  assert.equal(result.allowed, false);
  assert.match(result.reason, /owning screen|forbidden_paths takes precedence/);
});

test('domain role override resolves the hook surface before surface_kind classification', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-hook-domain-override-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const layoutPath = path.join(tmpDir, 'project-layout.yaml');
  fs.writeFileSync(
    layoutPath,
    [
      'version: 1',
      'preset: expo-feature',
      'domains:',
      '  create:',
      '    roles:',
      '      hook: src/features/create/state/**',
      '',
    ].join('\n'),
    'utf8',
  );
  const overriddenLayout = loadLayoutProfile({ kitRoot: KIT_ROOT, flags: { layout: layoutPath } });
  const spec = makeSpec(
    v2Table([['GET', '/create/attachments', 'confirmed', 'active', '-', 'src/features/create/state/useAttachments.ts']]),
  );
  const derived = derivedFor(spec, overriddenLayout);
  const readiness = readinessOf(
    { 'CREATE-ATTACH': screenEntry({ status: 'draft', derived }) },
    { selectedLayout: overriddenLayout },
  );
  const entry = readiness['CREATE-ATTACH'];
  assert.equal(entry.readiness_mode, 'rough-fixture-ui');
  assert.equal(entry.api_candidate_authorization.actionable[0].surface_kind, 'hook');
  assert.ok(entry.allowed_paths.includes('src/features/create/state/**'));
  assert.equal(
    authorize(readiness, 'CREATE-ATTACH', 'src/features/create/state/useAttachments.ts').allowed,
    true,
  );
});

// --- no-API 화면: 기존 제한 회귀 없음 -------------------------------------------------

test('api_required:false keeps API-client surfaces closed and never opens claims at fixture modes', () => {
  const spec = makeSpec('- 없음');
  spec.frontmatter.api_required = false;
  const derived = derivedFor(spec);
  const readiness = readinessOf({
    'NO-API': screenEntry({ status: 'draft', domain: 'create', derived }),
  });
  const entry = readiness['NO-API'];
  assert.equal(entry.readiness_mode, 'rough-fixture-ui');
  assert.equal(entry.api_required, false);
  assert.ok(entry.forbidden_paths.includes('src/api/**'));
  assert.equal(authorize(readiness, 'NO-API', 'src/features/create/hooks/useLocal.ts').allowed, true);
  assert.equal(authorize(readiness, 'NO-API', 'src/api/create/client.ts').allowed, false);

  // 모순 저작(no-API + v2 active hook claim)도 fixture 모드 seam 을 열지 못한다(fail-closed).
  const contradictory = makeSpec(
    v2Table([['GET', '/x', 'confirmed', 'active', '-', HOOK_SLICE]]),
  );
  contradictory.frontmatter.api_required = false;
  const contradictoryDerived = derivedFor(contradictory);
  const contradictoryReadiness = readinessOf({
    'NO-API': screenEntry({ status: 'draft', domain: 'create', derived: contradictoryDerived }),
  });
  const claimResult = authorize(contradictoryReadiness, 'NO-API', HOOK_SLICE);
  assert.equal(claimResult.allowed, false);
});

// --- Work Packet: surface_kind provenance 보존 ---------------------------------------

test('Work Packet JSON preserves fixture-mode claim provenance including surface_kind', () => {
  const { entry: screen } = screenAtMode('rough-fixture-ui', v2MixedSpec());
  const readiness = readinessOf({ 'CREATE-ATTACH': screen });
  const entry = readiness['CREATE-ATTACH'];
  const packetModel = buildPacketModel({
    entry,
    screen: 'CREATE-ATTACH',
    requestedMode: 'rough-fixture-ui',
    readinessSource: 'readiness.json',
    order: ORDER,
    date: '2026-07-27',
    layout,
  });
  const packetJson = renderPacketJson(packetModel);
  assert.deepEqual(packetJson.allowed_paths, entry.allowed_paths);
  assert.deepEqual(packetJson.forbidden_paths, entry.forbidden_paths);
  const active = packetJson.api_candidate_authorization.actionable;
  assert.equal(active.find((row) => row.path === HOOK_SLICE).surface_kind, 'hook');
  assert.equal(active.find((row) => row.path === API_SLICE).surface_kind, 'api-client');
  const deferredRows = packetJson.api_candidate_authorization.deferred;
  assert.equal(deferredRows.find((row) => row.path === DEFERRED_HOOK_SLICE).surface_kind, 'hook');
  assert.equal(deferredRows.find((row) => row.path === DEFERRED_API_SLICE).surface_kind, 'api-client');
});

// --- forward --path 와 diff backstop 동일 판정 ----------------------------------------

test('forward --path and forbidden-paths diff backstop agree on fixture-mode hook vs API-client files', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-hook-parity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = path.join(root, 'docs', 'frontend-workflow');
  fs.mkdirSync(path.join(docs, '_meta'), { recursive: true });
  const { entry: screen } = screenAtMode('rough-fixture-ui', v2MixedSpec());
  fs.writeFileSync(
    path.join(docs, '_meta', 'workflow-state.yaml'),
    yamlStringify({
      generated_at: '2026-07-27',
      global: GLOBAL,
      screens: { 'CREATE-ATTACH': screen },
    }),
    'utf8',
  );

  const cases = [
    { file: HOOK_SLICE, allowed: true },
    {
      file: 'src/api/create/attachments/client.ts',
      allowed: false,
      wouldClear: /api-integrated-ui/,
    },
    { file: DEFERRED_HOOK_SLICE, allowed: false, wouldClear: /resolve tracking/ },
  ];
  for (const { file, allowed, wouldClear } of cases) {
    const forward = spawnSync(
      process.execPath,
      [READINESS_CLI, '--docs', docs, '--screen', 'CREATE-ATTACH', '--path', file, '--json'],
      { cwd: root, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS },
    );
    assert.equal(forward.status, 0, forward.stderr);
    assert.equal(
      JSON.parse(forward.stdout)['CREATE-ATTACH'].path_authorization.allowed,
      allowed,
      `forward ${file}`,
    );

    const diffPath = path.join(root, 'changes.diff');
    fs.writeFileSync(diffPath, `M\t${file}\n`, 'utf8');
    const backstop = spawnSync(
      process.execPath,
      [FORBIDDEN_CLI, '--docs', docs, '--diff', diffPath, '--enforce', '--json'],
      { cwd: root, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS },
    );
    assert.equal(backstop.status, allowed ? 0 : 1, `backstop ${file}: ${backstop.stderr}`);
    const json = JSON.parse(backstop.stdout);
    assert.equal(json.ok, allowed, `backstop ${file}`);
    if (!allowed) {
      assert.equal(json.violations[0].file, file);
      if (wouldClear) assert.match(json.violations[0].would_clear, wouldClear);
    }
  }
});

test('forbidden-paths diagnostics distinguish the hook threshold from an invalid contract', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-hook-diagnostics-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = path.join(root, 'docs', 'frontend-workflow');
  fs.mkdirSync(path.join(docs, '_meta'), { recursive: true });
  const diffPath = path.join(root, 'changes.diff');

  const runBackstop = (screen, file) => {
    fs.writeFileSync(
      path.join(docs, '_meta', 'workflow-state.yaml'),
      yamlStringify({
        generated_at: '2026-07-30',
        global: GLOBAL,
        screens: { 'CREATE-ATTACH': screen },
      }),
      'utf8',
    );
    fs.writeFileSync(diffPath, `M\t${file}\n`, 'utf8');
    const result = spawnSync(
      process.execPath,
      [FORBIDDEN_CLI, '--docs', docs, '--diff', diffPath, '--enforce', '--json'],
      { cwd: root, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS },
    );
    assert.equal(result.status, 1, result.stderr);
    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    return json.violations[0];
  };

  const belowRough = {
    status: 'draft',
    domain: 'create',
    route: '/create',
    stub: true,
    derived: derivedFor(v2ActiveSpec()),
  };
  const hookViolation = runBackstop(belowRough, HOOK_SLICE);
  assert.match(hookViolation.reason, /active hook slice/);
  assert.match(hookViolation.would_clear, /rough-fixture-ui/);

  const invalidDerived = derivedFor(
    makeSpec(
      [
        v2Table([
          ['GET', '/create/attachments', 'confirmed', 'active', '-', HOOK_SLICE],
        ]),
        '',
        v2Table([
          [
            'GET',
            '/create/other',
            'confirmed',
            'active',
            '-',
            'src/api/create/other/**',
          ],
        ]),
      ].join('\n'),
    ),
  );
  assert.equal(invalidDerived.api_candidate_deferrals_valid, false);
  const invalidViolation = runBackstop(
    screenEntry({ status: 'draft', derived: invalidDerived }),
    HOOK_SLICE,
  );
  assert.match(invalidViolation.reason, /API Candidates v2 contract is invalid/);
  assert.match(
    invalidViolation.would_clear,
    /fix the reported API Candidates v2 contract issues/,
  );
});


test('delegated shared hook reservation preserves forward/backstop surface remediation', (t) => {
  const derived = derivedFor(v2ActiveSpec({ stateMatrix: false }));
  derived.fake_hook_exists = true;
  derived.figma_mapping_status = 'draft';
  derived.state_matrix_complete = false;
  const screens = {
    'CREATE-ATTACH': screenEntry({ status: 'confirmed', derived }),
  };
  const surfaceId = 'CREATE-ATTACHMENTS-HOOK';
  const surfaces = {
    [surfaceId]: {
      status: 'confirmed',
      domain: 'create',
      stub: false,
      member_screens: ['CREATE-ATTACH'],
      implementation_paths: [HOOK_SLICE],
      source: {
        path: 'domains/create/surfaces/create-attachments-hook/surface-spec.md',
      },
      derived: {
        api_required: false,
        state_matrix_complete: false,
        interaction_matrix_complete: true,
        blocking_decisions: [],
        malformed_decisions: [],
        lifecycle_errors: [],
        decision_refs: [],
        contract_errors: [],
        identity_errors: [],
        membership_errors: [],
        path_errors: [],
        decision_fanout_errors: [],
      },
    },
  };

  const readiness = readinessOf(screens, { surfaces });
  const entry = readiness['CREATE-ATTACH'];
  assert.equal(entry.readiness_mode, 'final-fixture-ui');
  assert.equal(entry.delegated_shared_surfaces[0].surface_id, surfaceId);
  assert.ok(entry.forbidden_paths.includes(HOOK_SLICE));

  const forward = authorize(readiness, 'CREATE-ATTACH', HOOK_SLICE);
  assert.equal(forward.allowed, false);
  assert.match(forward.reason, /delegated to shared surface CREATE-ATTACHMENTS-HOOK/);
  assert.doesNotMatch(forward.reason, /rough-fixture-ui/);
  assert.match(forward.would_clear, /workflow:readiness -- --surface CREATE-ATTACHMENTS-HOOK/);
  assert.match(forward.would_clear, /implement-shared-surface/);

  const surfaceReadiness = computeReadiness({
    state: { global: GLOBAL, screens, surfaces },
    policy,
    ci: {},
    manifest: {},
    layout,
    surfaceOnlyId: surfaceId,
  })[surfaceId];
  assert.equal(surfaceReadiness.readiness_mode, 'final-fixture-ui');
  assert.ok(surfaceReadiness.allowed_paths.includes(HOOK_SLICE));
  assert.equal(
    surfaceReadiness.path_authorization.find((row) => row.path === HOOK_SLICE).allowed,
    true,
  );

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-hook-shared-delegation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = path.join(root, 'docs', 'frontend-workflow');
  fs.mkdirSync(path.join(docs, '_meta'), { recursive: true });
  fs.writeFileSync(
    path.join(docs, '_meta', 'workflow-state.yaml'),
    yamlStringify({
      generated_at: '2026-07-30',
      global: GLOBAL,
      screens,
      surfaces,
    }),
    'utf8',
  );
  const diffPath = path.join(root, 'changes.diff');
  fs.writeFileSync(diffPath, `M\t${HOOK_SLICE}\n`, 'utf8');
  const backstop = spawnSync(
    process.execPath,
    [FORBIDDEN_CLI, '--docs', docs, '--diff', diffPath, '--enforce', '--json'],
    { cwd: root, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS },
  );
  assert.equal(backstop.status, 1, backstop.stderr);
  const violation = JSON.parse(backstop.stdout).violations[0];
  assert.equal(violation.reason, forward.reason);
  assert.equal(violation.would_clear, forward.would_clear);
});

// --- 사다리 순서·warning-first 의미 불변 ----------------------------------------------

test('policy mode order and warning-first backstop semantics stay unchanged', (t) => {
  assert.deepEqual(ORDER, [
    'docs-only',
    'route-skeleton',
    'screen-skeleton',
    'rough-fixture-ui',
    'final-fixture-ui',
    'api-integrated-ui',
    'production-ready',
  ]);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-hook-warning-first-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = path.join(root, 'docs', 'frontend-workflow');
  fs.mkdirSync(path.join(docs, '_meta'), { recursive: true });
  const { entry: screen } = screenAtMode('rough-fixture-ui', v2MixedSpec());
  fs.writeFileSync(
    path.join(docs, '_meta', 'workflow-state.yaml'),
    yamlStringify({
      generated_at: '2026-07-27',
      global: GLOBAL,
      screens: { 'CREATE-ATTACH': screen },
    }),
    'utf8',
  );
  const diffPath = path.join(root, 'changes.diff');
  fs.writeFileSync(diffPath, `M\tsrc/api/create/attachments/client.ts\n`, 'utf8');
  // --enforce 없는 위반은 warning-first: exit 0 유지.
  const warning = spawnSync(
    process.execPath,
    [FORBIDDEN_CLI, '--docs', docs, '--diff', diffPath, '--json'],
    { cwd: root, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS },
  );
  assert.equal(warning.status, 0, warning.stderr);
  const json = JSON.parse(warning.stdout);
  assert.equal(json.ok, false);
  assert.equal(json.enforced, false);
});
