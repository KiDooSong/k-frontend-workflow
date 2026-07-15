// spec.test.mjs — 게이트 신호 파싱 회귀 테스트 (node:test, 의존성 0).
// 두 fail-open/신호오염 결함의 회귀를 막는다:
//   P1: parseTable 가 빈 줄로 구분된 두 표를 병합해 진짜 Open Decisions 표가 증발 → readiness fail-OPEN.
//   P2: splitRow 가 셀 내 escaped pipe(\|)를 컬럼 구분자로 오인해 Status/Blocking Mode 가 밀림.
//   P7: computeReadiness 가 policy.modes 누락 시 Object.keys(undefined) 로 throw (fail-closed 구멍).
//   P13: interactionResultRoutes 가 후행 구두점·쿼리·외부 URL 을 라우트로 오인 (검사 4 오탐).
// 실행: npm run test:spec  (또는 node --test scripts/lib/spec.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  parseTable,
  parseTables,
  parseOpenDecisions,
  parseCopyKeys,
  cellRoutes,
  isConcreteRoute,
  isConcreteTargetRoute,
  interactionResultRoutes,
  interactionMatrixIsV2,
  interactionRowRoutes,
  interactionEdgeRoutes,
  interactionMatrixV2Issues,
  stripExpoSingleFilesystemGroups,
  buildRuntimeRouteTargetIndex,
  resolveRouteTargetInScreenInventory,
  routeTargetExistsInScreenInventory,
  resolveRouteTreeTarget,
  routeTreeTargetExists,
  INTERACTION_V2_RESULT_TYPES,
  deriveMetrics,
} from './spec.mjs';
import { buildNavGraph } from './nav-graph.mjs';
import { renderRouteTree } from './route-core.mjs';
import { scanAppDir } from '../adapters/routers/expo-router.mjs';
import { computeReadiness } from '../readiness.mjs';
import { buildState } from '../workflow-state.mjs';
import { LayoutConfigError, loadLayoutProfile } from './layout-profile.mjs';
import { loadYaml } from './util.mjs';

const SCRIPT_LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
const VALIDATE = path.resolve(SCRIPT_LIB_DIR, '..', 'validate.mjs');
const KIT_ROOT = path.resolve(SCRIPT_LIB_DIR, '..', '..');

// 한 줄 헬퍼: Interaction Matrix 표 텍스트로 spec-유사 객체를 만든다(섹션 파서가 보는 형태).
function specWithMatrix(lines) {
  return { sections: { 'interaction matrix': lines.join('\n') }, path: 'test/screen-spec.md' };
}

function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
  }
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
}

function runValidate(root) {
  const args = [VALIDATE, '--docs', path.join(root, 'docs', 'frontend-workflow'), '--src', path.join(root, 'src'), '--json'];
  try {
    return JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' }));
  } catch (e) {
    return JSON.parse(String((e && e.stdout) || ''));
  }
}

function screenSpec({ artifactId, screenId, route, matrix }) {
  return [
    '---',
    `artifact_id: ${artifactId}`,
    'artifact_type: screen-spec',
    'domain: d',
    `screen_id: ${screenId}`,
    `route: ${route}`,
    'status: draft',
    '---',
    `# ${screenId}`,
    '',
    '## Entry Points',
    '<!-- GENERATED:START nav-graph -->',
    '<!-- GENERATED:END nav-graph -->',
    '',
    '## Interaction Matrix',
    matrix,
    '',
  ].join('\n');
}

function basicMatrix(result) {
  return ['| User Action | Trigger | Result |', '|---|---|---|', `| a | tap | ${result} |`].join('\n');
}

function specWithStateMatrix(states) {
  return {
    frontmatter: { domain: 'coupons' },
    dir: os.tmpdir(),
    sections: {
      'state matrix': [
        '| State | Condition | UI |',
        '|---|---|---|',
        ...states.map((state) => `| ${state} | condition | UI |`),
      ].join('\n'),
    },
  };
}

function check4Errors(result) {
  return (result.errors || []).filter((e) => e.check === 4);
}

test('deriveMetrics: old five states are incomplete because disabled is separate from loading', () => {
  const derived = deriveMetrics(
    specWithStateMatrix(['loading', 'empty', 'error', 'success', 'refreshing']),
    { srcDir: path.join(os.tmpdir(), 'state-matrix-old-five-src'), projectRoot: os.tmpdir() },
  );

  assert.equal(
    derived.state_matrix_complete,
    false,
    'old five states must not complete the matrix without the disabled interactivity state',
  );
});

test('deriveMetrics: six canonical states complete with disabled as an independent state', () => {
  const derived = deriveMetrics(
    specWithStateMatrix(['loading', 'empty', 'error', 'success', 'Disabled', 'refreshing']),
    { srcDir: path.join(os.tmpdir(), 'state-matrix-six-src'), projectRoot: os.tmpdir() },
  );

  assert.equal(
    derived.state_matrix_complete,
    true,
    'loading plus the other content/result states still need disabled as a sixth canonical state',
  );
});

test('deriveMetrics: api_required false preserves explicit no-API state separately from missing evidence', () => {
  const derived = deriveMetrics(
    {
      frontmatter: { domain: 'auth', api_required: false },
      sections: { 'api candidates': '없음 — upstream 화면의 API 결과를 route params 로 표시' },
      dir: os.tmpdir(),
    },
    { srcDir: path.join(os.tmpdir(), 'no-api-src'), projectRoot: os.tmpdir() },
  );

  assert.equal(derived.api_confidence_min, null);
  assert.equal(derived.api_required, false);
});

test('P1: 범례 표 뒤 빈 줄로 분리된 진짜 Open Decisions 표가 증발하지 않는다', () => {
  const section = [
    '범례:',
    '',
    '| Status | 의미 |',
    '| --- | --- |',
    '| open | 결정 대기 |',
    '',
    '| ID | Decision Needed | Options | Blocking Mode | Owner | Status |',
    '| --- | --- | --- | --- | --- | --- |',
    '| D-001 | 쿠폰 만료 표기? | A / B | api-integrated-ui | pm | open |',
  ].join('\n');
  const od = parseOpenDecisions(section);
  assert.ok(od.table, '진짜 Open Decisions 표를 찾아야 한다');
  assert.equal(od.rows.length, 1, '진짜 결정 1건이 보존돼야 한다');
  assert.equal(od.rows[0].id, 'D-001');
  assert.equal(od.rows[0].status, 'open');
  assert.equal(od.rows[0].blockingMode, 'api-integrated-ui');
});

test('P1: parseTables 가 빈 줄로 구분된 두 표를 병합하지 않고 분리한다', () => {
  const section = ['| A | B |', '| --- | --- |', '| x | y |', '', '| ID | Status |', '| --- | --- |', '| D-1 | open |'].join('\n');
  const tables = parseTables(section);
  assert.equal(tables.length, 2, '두 표는 별개 블록이어야 한다');
  assert.equal(tables[0].rowCount, 1);
  assert.equal(tables[1].rowCount, 1);
  assert.equal(tables[1].rows[0].ID, 'D-1');
});

test('P1 fail-closed: Open Decisions 시그니처 표가 없으면 sectionHasContent 로 surface', () => {
  // 범례 표만 있고 진짜 결정 표가 없음 → 게이트가 조용히 열리면 안 됨.
  const section = ['| Status | 의미 |', '| --- | --- |', '| open | 결정 대기 |'].join('\n');
  const od = parseOpenDecisions(section);
  assert.equal(od.table, null, '시그니처 불일치 → 표를 채택하지 않는다');
  assert.equal(od.sectionHasContent, true, '내용은 있으므로 fail-closed 신호를 켠다');
});

test('P2: 셀 안 escaped pipe(\\|)가 컬럼을 밀지 않는다', () => {
  const section = ['| Key | 문구 | Status |', '| --- | --- | --- |', '| greeting | Hello \\| World | confirmed |'].join('\n');
  const t = parseTable(section);
  assert.equal(t.rows[0].Status, 'confirmed', 'Status 가 밀려 "World" 가 되면 안 된다');
  const copy = parseCopyKeys(section);
  assert.equal(copy.rows[0].status, 'confirmed');
  assert.equal(copy.rows[0].copy, 'Hello | World', '문구 셀은 리터럴 파이프를 보존해야 한다');
});

test('회귀: 정상 단일 Open Decisions 표는 그대로 파싱된다', () => {
  const section = [
    '| ID | Decision Needed | Options | Blocking Mode | Owner | Status |',
    '| --- | --- | --- | --- | --- | --- |',
    '| D-001 | x? | A/B | rough-fixture-ui | pm | open |',
    '| D-002 | y? | C/D | final-fixture-ui | pm | resolved |',
  ].join('\n');
  const od = parseOpenDecisions(section);
  assert.equal(od.rows.length, 2);
  assert.equal(od.rows[0].id, 'D-001');
  assert.equal(od.rows[0].status, 'open');
  assert.equal(od.rows[1].status, 'resolved');
});


test('deriveMetrics: layer dir_has_files derives <role>_present and keeps fake_hook_exists alias', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-layer-fact-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const hooks = path.join(tmp, 'src', 'features', 'coupons', 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  fs.writeFileSync(path.join(hooks, 'useCoupons.ts'), 'export const useCoupons = () => null;\n');
  const layout = {
    layers: [{ role: 'hook', fact: 'dir_has_files' }],
    roleToDir(role, { domain } = {}) {
      if (role === 'hook') return `src/features/${domain}/hooks`;
      return '';
    },
  };
  const derived = deriveMetrics(
    { frontmatter: { domain: 'coupons' }, sections: {}, dir: tmp },
    { srcDir: path.join(tmp, 'src'), projectRoot: tmp, layout },
  );
  assert.equal(derived.hook_present, true);
  assert.equal(derived.fake_hook_exists, true);
});

test('deriveMetrics: domain layersFor derives domain-scoped <role>_present facts', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-domain-layer-fact-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repoDir = path.join(tmp, 'src', 'features', 'coupons', 'repositories');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'couponRepository.ts'), 'export const couponRepository = {};\n');
  const layout = {
    layers: [],
    layersFor(domain) {
      return domain === 'coupons' ? [{ role: 'repository', fact: 'dir_has_files' }] : [];
    },
    roleToDir(role, { domain } = {}) {
      if (role === 'repository') return `src/features/${domain}/repositories`;
      return '';
    },
  };
  const derived = deriveMetrics(
    { frontmatter: { domain: 'coupons' }, sections: {}, dir: tmp },
    { srcDir: path.join(tmp, 'src'), projectRoot: tmp, layout },
  );
  assert.equal(derived.repository_present, true);
});

test('deriveMetrics: fake_hook_exists keeps legacy TypeScript-only guard', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-fake-hook-ts-only-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const hooks = path.join(tmp, 'src', 'features', 'coupons', 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  fs.writeFileSync(path.join(hooks, 'useCoupons.js'), 'export const useCoupons = () => null;\n');
  const roles = { hook: 'src/features/{domain}/hooks/**' };
  const layout = {
    roles,
    layers: [{ role: 'hook', fact: 'dir_has_files' }],
    roleGlobs(role) {
      const value = roles[role];
      return value ? [value] : [];
    },
  };
  const derived = deriveMetrics(
    { frontmatter: { domain: 'coupons' }, sections: {}, dir: tmp },
    { srcDir: path.join(tmp, 'src'), projectRoot: tmp, layout },
  );
  assert.equal(derived.hook_present, true);
  assert.equal(derived.fake_hook_exists, false);
});

test('deriveMetrics: dir_has_files facts follow role globs recursively', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-role-glob-fact-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const nestedRoute = path.join(tmp, 'src', 'app', '(tabs)');
  const nestedHook = path.join(tmp, 'src', 'features', 'coupons', 'hooks', 'nested');
  fs.mkdirSync(nestedRoute, { recursive: true });
  fs.mkdirSync(nestedHook, { recursive: true });
  fs.writeFileSync(path.join(nestedRoute, 'index.tsx'), 'export default function Route() { return null; }\n');
  fs.writeFileSync(path.join(nestedHook, 'useCoupons.ts'), 'export const useCoupons = () => null;\n');
  const roles = {
    route_entry: 'src/app/**',
    hook: 'src/features/{domain}/hooks/**',
  };
  const layout = {
    layers: [
      { role: 'route_entry', fact: 'dir_has_files' },
      { role: 'hook', fact: 'dir_has_files' },
    ],
    roleGlobs(role) {
      const value = roles[role];
      return value ? [value] : [];
    },
  };
  const derived = deriveMetrics(
    { frontmatter: { domain: 'coupons' }, sections: {}, dir: tmp },
    { srcDir: path.join(tmp, 'src'), projectRoot: tmp, layout },
  );
  assert.equal(derived.route_entry_present, true);
  assert.equal(derived.hook_present, true);
  assert.equal(derived.fake_hook_exists, true);
});

test('deriveMetrics: broader role facts ignore nested sub-role files', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-role-overlap-fact-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const schemas = path.join(tmp, 'src', 'api', 'schemas');
  fs.mkdirSync(schemas, { recursive: true });
  fs.writeFileSync(path.join(schemas, 'coupon.schema.ts'), 'export const schema = {};\n');
  const roles = {
    api_client: 'src/api/**',
    api_schema: 'src/api/schemas/**',
  };
  const layout = {
    roles,
    layers: [{ role: 'api_client', fact: 'dir_has_files' }],
    roleGlobs(role) {
      const value = roles[role];
      return value ? [value] : [];
    },
  };
  const beforeClient = deriveMetrics(
    { frontmatter: { domain: 'coupons' }, sections: {}, dir: tmp },
    { srcDir: path.join(tmp, 'src'), projectRoot: tmp, layout },
  );
  assert.equal(beforeClient.api_client_present, false);

  const generated = path.join(tmp, 'src', 'api', 'generated');
  fs.mkdirSync(generated, { recursive: true });
  fs.writeFileSync(path.join(generated, 'coupon.client.ts'), 'export const client = {};\n');
  const afterClient = deriveMetrics(
    { frontmatter: { domain: 'coupons' }, sections: {}, dir: tmp },
    { srcDir: path.join(tmp, 'src'), projectRoot: tmp, layout },
  );
  assert.equal(afterClient.api_client_present, true);
});

test('buildState: workflow-state serialization keeps generic <role>_present facts', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-state-present-facts-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const docsDir = path.join(tmp, 'docs', 'frontend-workflow');
  const specDir = path.join(docsDir, 'domains', 'coupons', 'screens', 'coupon-list');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, 'screen-spec.md'),
    [
      '---',
      'screen_id: COUPON-001',
      'domain: coupons',
      'route: /coupons',
      'status: draft',
      '---',
      '',
      '## Purpose',
      'Coupon list.',
      '',
    ].join('\n'),
  );
  for (const [dir, file] of [
    ['src/app', 'index.tsx'],
    ['src/features/coupons/screens', 'CouponListScreen.tsx'],
    ['src/features/coupons/components', 'CouponCard.tsx'],
    ['src/features/coupons/hooks', 'useCoupons.ts'],
    ['src/api', 'client.ts'],
  ]) {
    const abs = path.join(tmp, dir);
    fs.mkdirSync(abs, { recursive: true });
    fs.writeFileSync(path.join(abs, file), 'export const marker = true;\n');
  }

  const { state } = buildState({ docsDir, srcDir: path.join(tmp, 'src'), date: '2026-06-22' });
  const derived = state.screens['COUPON-001'].derived;
  assert.equal(derived.route_entry_present, true);
  assert.equal(derived.screen_present, true);
  assert.equal(derived.domain_component_present, true);
  assert.equal(derived.hook_present, true);
  assert.equal(derived.api_client_present, true);
  assert.equal(derived.fake_hook_exists, true);
});

test('buildState: workflow-state serialization preserves api_required false only for marked screens', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-state-no-api-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const docsDir = path.join(tmp, 'docs', 'frontend-workflow');
  const srcDir = path.join(tmp, 'src');
  fs.mkdirSync(path.join(docsDir, 'domains', 'auth', 'screens', 'duplicate'), { recursive: true });
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(docsDir, 'domains', 'auth', 'screens', 'duplicate', 'screen-spec.md'),
    [
      '---',
      'artifact_id: AUTH-DUPLICATE-screen-spec',
      'artifact_type: screen-spec',
      'domain: auth',
      'screen_id: AUTH-DUPLICATE',
      'route: /(auth)/signup/duplicate',
      'api_required: false',
      'status: confirmed',
      '---',
      '',
      '# Duplicate account',
      '',
      '## API Candidates',
      '없음 — upstream signup flow result 를 표시',
      '',
    ].join('\n'),
    'utf8',
  );

  const { state } = buildState({ docsDir, srcDir, date: '2026-06-30' });
  const derived = state.screens['AUTH-DUPLICATE'].derived;
  assert.equal(derived.api_confidence_min, null);
  assert.equal(derived.api_required, false);
});

test('P7: computeReadiness 가 policy.modes 누락 시 throw 하지 않는다 (fail-closed 구멍)', () => {
  // policy.order 도 modes 도 없으면 예전엔 Object.keys(undefined) 로 TypeError 가 났다.
  assert.doesNotThrow(() =>
    computeReadiness({ state: { screens: {} }, policy: { version: 1 }, ci: {}, manifest: {} }),
  );
});

test('computeReadiness: api_required false does not require evidence and can reach production-ready', () => {
  const policy = {
    version: 1,
    order: ['docs-only', 'api-integrated-ui', 'production-ready'],
    modes: {
      'docs-only': { requires: [], allowed_paths: [], forbidden_paths: [] },
      'api-integrated-ui': {
        requires: ['api_confidence_min == confirmed', 'state_matrix_complete == true'],
        allowed_paths: ['src/features/{domain}/hooks/**', '{roles.api_client}'],
        forbidden_paths: ['src/features/{domain}/screens/**'],
      },
      'production-ready': {
        requires: [
          'ci_lint == pass',
          'ci_schema_validation == pass',
          'state_coverage_complete == true',
          'llm_semantic_review == pass',
        ],
        allowed_paths: ['src/**'],
        forbidden_paths: [],
      },
    },
  };
  const layout = {
    layerTelemetryDeclared: false,
    resolvePaths(paths, ctx = {}) {
      return (paths || []).map((pathEntry) =>
        pathEntry
          .replace('{roles.api_client}', 'src/api/**')
          .replace('{domain}', ctx.domain || '{domain}'),
      );
    },
  };
  const baseScreen = {
    status: 'confirmed',
    domain: 'auth',
    route: '/duplicate',
    stub: false,
    derived: {
      state_matrix_complete: true,
      blocking_decisions: [],
      malformed_decisions: [],
      api_confidence_min: null,
    },
  };

  const missing = computeReadiness({
    state: { global: {}, screens: { S1: baseScreen } },
    policy,
    ci: {},
    manifest: {},
    layout,
  }).S1;
  assert.equal(missing.readiness_mode, 'docs-only');
  assert.deepEqual(missing.blocking, [{ api_confidence: 'missing' }]);

  const noApiWithoutCi = computeReadiness({
    state: {
      global: {},
      screens: { S1: { ...baseScreen, derived: { ...baseScreen.derived, api_required: false } } },
    },
    policy,
    ci: {},
    manifest: {},
    layout,
  }).S1;
  assert.equal(noApiWithoutCi.readiness_mode, 'api-integrated-ui');
  assert.equal(noApiWithoutCi.api_required, false);
  assert.deepEqual(noApiWithoutCi.allowed_paths, ['src/features/auth/hooks/**']);
  assert.deepEqual(noApiWithoutCi.forbidden_paths, ['src/features/auth/screens/**', 'src/api/**']);
  assert.equal(noApiWithoutCi.next_actions.includes('confirm API candidates'), false);

  const noApi = computeReadiness({
    state: {
      global: {},
      screens: { S1: { ...baseScreen, derived: { ...baseScreen.derived, api_required: false } } },
    },
    policy,
    ci: {
      ci_lint: 'pass',
      ci_schema_validation: 'pass',
      state_coverage_complete: true,
      llm_semantic_review: 'pass',
    },
    manifest: {},
    layout,
  }).S1;
  assert.equal(noApi.readiness_mode, 'production-ready');
  assert.equal(noApi.api_required, false);
  assert.deepEqual(noApi.allowed_paths, ['src/features/auth/hooks/**']);
  assert.deepEqual(noApi.forbidden_paths, ['src/api/**']);
  assert.deepEqual(noApi.blocking, []);
  assert.equal(noApi.next_actions.includes('confirm API candidates'), false);
});

test('computeReadiness: no-api limiter tolerates custom layouts without api_client role', () => {
  const policy = {
    version: 1,
    order: ['docs-only', 'api-integrated-ui'],
    modes: {
      'docs-only': { requires: [], allowed_paths: [], forbidden_paths: [] },
      'api-integrated-ui': {
        requires: ['api_confidence_min == confirmed', 'state_matrix_complete == true'],
        allowed_paths: ['src/features/{domain}/hooks/**'],
        forbidden_paths: ['src/features/{domain}/screens/**'],
      },
    },
  };
  const layout = {
    layerTelemetryDeclared: false,
    resolvePaths(paths, ctx = {}) {
      return (paths || []).map((pathEntry) => {
        if (String(pathEntry).includes('{roles.api_client}')) {
          throw new LayoutConfigError(
            "layout-profile: 정의되지 않은 role 'api_client' 을 참조함 ('{roles.api_client}').",
          );
        }
        return String(pathEntry).replace('{domain}', ctx.domain || '{domain}');
      });
    },
  };
  const result = computeReadiness({
    state: {
      global: {},
      screens: {
        S1: {
          status: 'confirmed',
          domain: 'auth',
          route: '/result',
          stub: false,
          derived: {
            state_matrix_complete: true,
            blocking_decisions: [],
            malformed_decisions: [],
            api_confidence_min: null,
            api_required: false,
          },
        },
      },
    },
    policy,
    ci: {},
    manifest: {},
    layout,
  }).S1;

  assert.equal(result.readiness_mode, 'api-integrated-ui');
  assert.equal(result.api_required, false);
  assert.deepEqual(result.allowed_paths, ['src/features/auth/hooks/**']);
  assert.deepEqual(result.forbidden_paths, ['src/features/auth/screens/**']);
  assert.deepEqual(result.blocking, []);
});

test('computeReadiness: no-api limiter restores lower non-API edit paths when API role is exact allow', () => {
  const policy = {
    version: 1,
    order: ['docs-only', 'screen-skeleton', 'final-fixture-ui', 'api-integrated-ui'],
    modes: {
      'docs-only': { requires: [], allowed_paths: [], forbidden_paths: [] },
      'screen-skeleton': {
        requires: ['screen_spec_status >= draft'],
        allowed_paths: ['{roles.screen}'],
        forbidden_paths: ['{roles.api_client}'],
      },
      'final-fixture-ui': {
        requires: ['screen_spec_status >= confirmed', 'figma_mapping_status >= draft'],
        allowed_paths: ['{roles.screen}', '{roles.domain_component}'],
        forbidden_paths: ['{roles.api_client}'],
      },
      'api-integrated-ui': {
        requires: ['api_confidence_min == confirmed', 'state_matrix_complete == true'],
        allowed_paths: ['{roles.api_client}'],
        forbidden_paths: ['{roles.screen}'],
      },
    },
  };
  const layout = {
    layerTelemetryDeclared: false,
    resolvePaths(paths, ctx = {}) {
      return (paths || []).flatMap((pathEntry) =>
        pathEntry
          .replace('{roles.api_client}', 'src/api/**')
          .replace('{roles.screen}', 'src/features/{domain}/screens/**')
          .replace('{roles.domain_component}', 'src/features/{domain}/components/**')
          .replace('{domain}', ctx.domain || '{domain}'),
      );
    },
  };
  const result = computeReadiness({
    state: {
      global: {},
      screens: {
        NO_API: {
          status: 'confirmed',
          domain: 'auth',
          route: '/result',
          stub: false,
          derived: {
            state_matrix_complete: true,
            blocking_decisions: [],
            malformed_decisions: [],
            api_confidence_min: null,
            api_required: false,
            figma_mapping_status: 'draft',
          },
        },
      },
    },
    policy,
    ci: {},
    manifest: {},
    layout,
  }).NO_API;

  assert.equal(result.readiness_mode, 'api-integrated-ui');
  assert.equal(result.api_required, false);
  assert.deepEqual(result.allowed_paths, [
    'src/features/auth/screens/**',
    'src/features/auth/components/**',
  ]);
  assert.deepEqual(result.forbidden_paths, ['src/api/**']);
});

test('computeReadiness: no-api limiter keeps default hook allow while restoring implementation paths', () => {
  const policy = loadYaml(path.join(KIT_ROOT, 'policies', 'implementation-mode-policy.yaml'));
  const layout = loadLayoutProfile({ kitRoot: KIT_ROOT });
  const result = computeReadiness({
    state: {
      global: {
        navigation_map_status: 'draft',
        component_catalog_generated: true,
        stub_screen_specs_count: 1,
      },
      screens: {
        NO_API: {
          status: 'confirmed',
          domain: 'auth',
          route: '/result',
          stub: false,
          derived: {
            state_matrix_complete: true,
            blocking_decisions: [],
            malformed_decisions: [],
            api_confidence_min: null,
            api_required: false,
            fake_hook_exists: true,
            figma_mapping_status: 'draft',
          },
        },
      },
    },
    policy,
    ci: {},
    manifest: {},
    layout,
  }).NO_API;

  assert.equal(result.readiness_mode, 'api-integrated-ui');
  assert.equal(result.api_required, false);
  assert.deepEqual(result.allowed_paths, [
    'src/features/auth/hooks/**',
    'src/app/**',
    'src/features/auth/screens/**',
    'src/features/auth/components/**',
  ]);
  assert.deepEqual(result.forbidden_paths, ['src/api/**']);
});

test('P13: interactionResultRoutes — 다중 라우트 추출 · 후행 구두점·쿼리·외부/PR URL 제외', () => {
  const spec = {
    sections: {
      'interaction matrix': [
        '| Trigger | Result |',
        '| --- | --- |',
        '| tap | go /coupons/[id], then /home |',
        '| q | /list?x=1 |',
        '| ext | see http://a/b |',
        '| pr | //cdn/x asset |',
      ].join('\n'),
    },
  };
  // 한 셀의 두 라우트 모두 추출(/coupons/[id], /home) · 콤마 제거 · 쿼리 절단 · http(s):// 와 protocol-relative // 제외
  assert.deepEqual(interactionResultRoutes(spec), ['/coupons/[id]', '/home', '/list']);
});

test('P13: cellRoutes — prose/code/JSX false positive 를 라우트로 오인하지 않는다', () => {
  const cases = [
    ["`router.replace('/reset/send-code')`(L310)", ['/reset/send-code']],
    ["`/login')`(L010", ['/login']],
    ['표시 형식/마스킹 처리', []],
    ['/마스킹 /형식 /가입', []],
    ['`/signup/email` 로 이동', ['/signup/email']],
    ['`/signup/email`` 로 이동', ['/signup/email']],
    ["<Redirect href='/signup' />(J010)", ['/signup']],
    ['`/>`(J020)', []],
    ['컴포넌트 `/`setPasswordConfirm` 설명', []],
    ['http://example.com/path and //cdn/path', []],
    ['see ./src/app/page.tsx', []],
    ['see ../src/app/page.tsx', []],
    ['see /src/app/page.tsx', []],
    ['see /src/[id]/page.tsx', []],
    ['see /src/styles/global.css', []],
    ['see /src/docs/readme.md', []],
    ['see /src/config/app.json', []],
    ['see [style](/src/styles/global.css:1)', []],
    ['see ./src/app/privacy.v2.tsx', []],
    ['see /Users/gidoo/project/src/app/page.tsx', []],
    ['see [page](/Users/gidoo/project/src/app/page.tsx:12)', []],
    ['see [page](/Users/gidoo/project/src/app/[id]/page.tsx:12)', []],
    ['see [spec.mjs](/Users/gidoo/project/frontend-workflow-kit/scripts/lib/spec.mjs:411)', []],
    ['see /home/runner/work/app/src/app/page.tsx', []],
    ['see [page](/home/runner/work/app/src/app/page.tsx:12)', []],
    ['see /home/runner/work/app/frontend-workflow-kit/scripts/lib/spec.mjs', []],
    ['see [spec.mjs](/home/runner/work/app/frontend-workflow-kit/scripts/lib/spec.mjs:411)', []],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(cellRoutes(input), expected, input);
  }
});

test('P13: cellRoutes — 정상 v1/v2 route token 은 보존한다', () => {
  const cases = [
    ['/login', ['/login']],
    ['`/login`', ['/login']],
    ["router.replace('/login')", ['/login']],
    ['/users/[id]', ['/users/[id]']],
    ['/users/[...slug]', ['/users/[...slug]']],
    ['/[[...slug]]', ['/[[...slug]]']],
    ['/docs/[[...slug]]', ['/docs/[[...slug]]']],
    ['/(auth)/login', ['/(auth)/login']],
    ['/users/:id', ['/users/:id']],
    ['/legal/privacy.v2', ['/legal/privacy.v2']],
    ['/legal/privacy.v2.', ['/legal/privacy.v2']],
    ['/release/notes.ts', ['/release/notes.ts']],
    ['/-debug', ['/-debug']],
    ['/home/alice/notes.ts', ['/home/alice/notes.ts']],
    ['/home/[id]/notes.ts', ['/home/[id]/notes.ts']],
    ['see /home/alice/notes.ts', ['/home/alice/notes.ts']],
    ['/src/styles/global.css', ['/src/styles/global.css']],
    ['go to /src/styles/global.css', ['/src/styles/global.css']],
    ['/(home,search)/users/[id]', ['/(home,search)/users/[id]']],
    ['/(+auth)/login', ['/(+auth)/login']],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(cellRoutes(input), expected, input);
  }
});

test('authoritative Target 전용 concrete route predicate 만 루트(`/`)를 인정한다', () => {
  assert.equal(isConcreteRoute('/'), false, 'generic/v1 concrete route semantics stay unchanged');
  assert.equal(isConcreteTargetRoute('/'), true, 'authoritative v2 Target may name the runtime root');
  assert.deepEqual(interactionRowRoutes({ Result: '/' }, 'v1'), [], 'v1 free-form standalone slash stays ignored');
  assert.deepEqual(
    interactionRowRoutes({ Result: '홈으로 이동', 'Result Type': 'route', Target: '/' }, 'v2'),
    ['/'],
  );
});

test('check 4 route inventory: Expo single filesystem group stripping is narrow and unambiguous', () => {
  assert.equal(stripExpoSingleFilesystemGroups('/(auth)/reset/send-code'), '/reset/send-code');
  assert.equal(stripExpoSingleFilesystemGroups('/(auth)/users/[id]'), '/users/[id]');
  assert.equal(stripExpoSingleFilesystemGroups('/(auth)/docs/[[...slug]]'), '/docs/[[...slug]]');
  assert.equal(stripExpoSingleFilesystemGroups('/(home,search)/users/[id]'), '/(home,search)/users/[id]');
  assert.equal(stripExpoSingleFilesystemGroups('/(+auth)/login'), '/(+auth)/login');
  assert.equal(stripExpoSingleFilesystemGroups('/legal/privacy.v2'), '/legal/privacy.v2');

  const one = new Set(['/(auth)/reset/send-code']);
  assert.equal(
    routeTargetExistsInScreenInventory('/reset/send-code', one, buildRuntimeRouteTargetIndex(one)),
    true,
    'single filesystem group route may satisfy a group-less runtime URL',
  );
  assert.equal(
    resolveRouteTargetInScreenInventory('/reset/send-code', one, buildRuntimeRouteTargetIndex(one)),
    '/(auth)/reset/send-code',
    'resolver returns the raw ScreenSpec route for downstream graph resolution',
  );

  const consumerRoot = new Set(['/(app)/']);
  assert.equal(
    resolveRouteTargetInScreenInventory('/', consumerRoot, buildRuntimeRouteTargetIndex(consumerRoot)),
    null,
    'root aliases fail closed without verified Expo index evidence',
  );
  assert.equal(
    resolveRouteTargetInScreenInventory('/', consumerRoot, buildRuntimeRouteTargetIndex(consumerRoot), {
      expoIndexRouteSet: new Set(['/(app)']),
    }),
    '/(app)/',
    'consumer trailing-slash ScreenSpec route resolves when the raw Expo index token is verified',
  );

  const ambiguous = new Set(['/(auth)/login', '/(marketing)/login']);
  assert.equal(
    routeTargetExistsInScreenInventory('/login', ambiguous, buildRuntimeRouteTargetIndex(ambiguous)),
    false,
    'multiple group-stripped ScreenSpec routes must not auto-resolve',
  );

  const arrayGroup = new Set(['/(home,search)/users/[id]']);
  assert.equal(
    routeTargetExistsInScreenInventory('/users/[id]', arrayGroup, buildRuntimeRouteTargetIndex(arrayGroup)),
    false,
    'array route groups keep exact matching',
  );

  const plusGroup = new Set(['/(+auth)/login']);
  assert.equal(
    routeTargetExistsInScreenInventory('/login', plusGroup, buildRuntimeRouteTargetIndex(plusGroup)),
    false,
    'plus route groups keep exact matching',
  );
});

// === Interaction Matrix v2 (structured, dual-read) ===========================================

test('v2: Result Type 헤더 유무로 v1/v2 모드를 판정한다', () => {
  const v1 = parseTable(specWithMatrix(['| User Action | Trigger | Result |', '|---|---|---|', '| a | t | /x |']).sections['interaction matrix']);
  const v2 = parseTable(specWithMatrix(['| User Action | Trigger | Result | Result Type | Target |', '|---|---|---|---|---|', '| a | t | go | route | /x |']).sections['interaction matrix']);
  assert.equal(interactionMatrixIsV2(v1), false);
  assert.equal(interactionMatrixIsV2(v2), true);
  assert.equal(interactionMatrixIsV2(null), false);
});

test('v2: interactionRowRoutes — v1 은 Result, v2 는 route 행 Target 만 읽는다', () => {
  // v1 모드: Result 셀에서 라우트.
  assert.deepEqual(interactionRowRoutes({ Result: 'go /coupons/[id]' }, 'v1'), ['/coupons/[id]']);
  // v2 route 행: Target 에서 라우트(Result 의 자연어는 무시).
  assert.deepEqual(
    interactionRowRoutes({ Result: '쿠폰 상세로 이동', 'Result Type': 'route', Target: '/coupons/[id]' }, 'v2'),
    ['/coupons/[id]'],
  );
  // v2 비-route 행: 라우트 없음(엣지 생성 안 함) — Target/Result 에 라우트처럼 보여도.
  assert.deepEqual(interactionRowRoutes({ 'Result Type': 'state', Target: '/x', Result: '/y' }, 'v2'), []);
  // Result Type 대소문자/공백 무시.
  assert.deepEqual(interactionRowRoutes({ 'Result Type': ' Route ', Target: '/home' }, 'v2'), ['/home']);
  // v2 Target 은 기계 판정 권위라 루트 라우트(`/`)도 보존한다.
  assert.deepEqual(interactionRowRoutes({ 'Result Type': 'route', Target: '/' }, 'v2'), ['/']);
});

test('v2: interactionEdgeRoutes — v1 표는 interactionResultRoutes 와 동일 집합(byte-identical 보존)', () => {
  const v1 = specWithMatrix([
    '| User Action | Trigger | Result | Analytics Event |',
    '|---|---|---|---|',
    '| 쿠폰 클릭 | CouponCard press | /coupons/[id] | e |',
    '| 새로고침 | pull | refetch | - |',
  ]);
  assert.deepEqual(interactionEdgeRoutes(v1), interactionResultRoutes(v1));
  assert.deepEqual(interactionEdgeRoutes(v1), ['/coupons/[id]']);
});

test('v2: interactionEdgeRoutes 는 Target 을, interactionResultRoutes 는 legacy Result helper 로 남는다', () => {
  // v2 표에서 라우트가 Target 에만 있고 Result 는 자연어인 경우.
  const v2 = specWithMatrix([
    '| User Action | Trigger | Result | Result Type | Target | Params | Analytics Event |',
    '|---|---|---|---|---|---|---|',
    '| 쿠폰 클릭 | CouponCard press | 상세로 이동 | route | /coupons/[id] | id | e |',
    '| 탭 변경 | Tab press | status filter 변경 | state | status filter 변경 |  | e2 |',
  ]);
  // nav-graph 경로: Target 에서 라우트.
  assert.deepEqual(interactionEdgeRoutes(v2), ['/coupons/[id]']);
  // legacy helper: Result 셀만 → 자연어라 라우트 0개. validate 검사 4 는 interactionEdgeRoutes 를 쓴다.
  assert.deepEqual(interactionResultRoutes(v2), []);
});

test('E2E: validate check 4 — v1 Result prose slash fragment 는 hard error 로 승격하지 않는다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check4-v1-prose-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/domains/d/screens/home/screen-spec.md': screenSpec({
        artifactId: 'HOME-001-screen-spec',
        screenId: 'HOME-001',
        route: '/home',
        matrix: basicMatrix('표시 형식/마스킹 처리'),
      }),
    });
    assert.deepEqual(check4Errors(runValidate(root)), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: validate check 4 — v1 Result source file path 는 route 로 오인하지 않는다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check4-v1-source-path-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/domains/d/screens/home/screen-spec.md': screenSpec({
        artifactId: 'HOME-001-screen-spec',
        screenId: 'HOME-001',
        route: '/home',
        matrix: [
          '| User Action | Trigger | Result |',
          '|---|---|---|',
          '| relative source | tap | see ./src/app/page.tsx |',
          '| root source | tap | see /src/app/page.tsx |',
          '| absolute source | tap | see /Users/gidoo/project/src/app/page.tsx |',
          '| linux ci source | tap | see /home/runner/work/app/src/app/page.tsx |',
          '| linux ci package source | tap | see /home/runner/work/app/frontend-workflow-kit/scripts/lib/spec.mjs |',
          '| markdown source | tap | see [page](/Users/gidoo/project/src/app/page.tsx:12) |',
          '| markdown linux source | tap | see [page](/home/runner/work/app/src/app/page.tsx:12) |',
          '| markdown linux package source | tap | see [spec.mjs](/home/runner/work/app/frontend-workflow-kit/scripts/lib/spec.mjs:411) |',
          '| markdown local file | tap | see [spec.mjs](/Users/gidoo/project/frontend-workflow-kit/scripts/lib/spec.mjs:411) |',
        ].join('\n'),
      }),
    });
    assert.deepEqual(check4Errors(runValidate(root)), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: validate check 4 — v1 backticked route 는 screen inventory 로 검증한다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check4-v1-route-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/domains/d/screens/home/screen-spec.md': screenSpec({
        artifactId: 'HOME-001-screen-spec',
        screenId: 'HOME-001',
        route: '/home',
        matrix: basicMatrix('`/login` 로 이동'),
      }),
      'docs/frontend-workflow/domains/d/screens/login/screen-spec.md': screenSpec({
        artifactId: 'LOGIN-001-screen-spec',
        screenId: 'LOGIN-001',
        route: '/login',
        matrix: basicMatrix('stay'),
      }),
    });
    assert.deepEqual(check4Errors(runValidate(root)), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: validate check 4 — v1 Result group-less target matches one single filesystem route group', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check4-v1-single-group-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/domains/d/screens/send-code/screen-spec.md': screenSpec({
        artifactId: 'RESET-SEND-CODE-001-screen-spec',
        screenId: 'RESET-SEND-CODE-001',
        route: '/(auth)/reset/send-code',
        matrix: basicMatrix('`/reset/send-code` 로 이동'),
      }),
    });
    assert.deepEqual(check4Errors(runValidate(root)), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: validate check 4 — v2 route 행은 Result prose 대신 Target 을 hard gate 입력으로 쓴다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check4-v2-target-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/domains/d/screens/home/screen-spec.md': screenSpec({
        artifactId: 'HOME-001-screen-spec',
        screenId: 'HOME-001',
        route: '/home',
        matrix: [
          '| User Action | Trigger | Result | Result Type | Target | Params |',
          '|---|---|---|---|---|---|',
          '| a | tap | legacy prose `/login` | route | /missing |  |',
        ].join('\n'),
      }),
      'docs/frontend-workflow/domains/d/screens/login/screen-spec.md': screenSpec({
        artifactId: 'LOGIN-001-screen-spec',
        screenId: 'LOGIN-001',
        route: '/login',
        matrix: basicMatrix('stay'),
      }),
    });
    const errors = check4Errors(runValidate(root));
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /\/missing/);
    assert.doesNotMatch(errors[0].message, /\/login/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: validate check 4 — v2 Target group-less target matches one single filesystem route group', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check4-v2-single-group-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/domains/d/screens/send-code/screen-spec.md': screenSpec({
        artifactId: 'RESET-SEND-CODE-001-screen-spec',
        screenId: 'RESET-SEND-CODE-001',
        route: '/(auth)/reset/send-code',
        matrix: [
          '| User Action | Trigger | Result | Result Type | Target | Params |',
          '|---|---|---|---|---|---|',
          '| send code | tap | 이동 | route | /reset/send-code |  |',
        ].join('\n'),
      }),
    });
    assert.deepEqual(check4Errors(runValidate(root)), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: nav-graph — v2 Target group-less target resolves to the single filesystem group screen', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-nav-v2-single-group-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/domains/d/screens/source/screen-spec.md': screenSpec({
        artifactId: 'SOURCE-001-screen-spec',
        screenId: 'SOURCE-001',
        route: '/source',
        matrix: [
          '| User Action | Trigger | Result | Result Type | Target | Params |',
          '|---|---|---|---|---|---|',
          '| send code | tap | 이동 | route | /reset/send-code |  |',
        ].join('\n'),
      }),
      'docs/frontend-workflow/domains/d/screens/send-code/screen-spec.md': screenSpec({
        artifactId: 'RESET-SEND-CODE-001-screen-spec',
        screenId: 'RESET-SEND-CODE-001',
        route: '/(auth)/reset/send-code',
        matrix: basicMatrix('stay'),
      }),
    });
    const graph = buildNavGraph({ docsDir: path.join(root, 'docs', 'frontend-workflow') });
    assert.deepEqual(graph.routes['/reset/send-code'].inbound, [{ from: 'SOURCE-001', trigger: 'tap' }]);
    assert.deepEqual(graph.screens['RESET-SEND-CODE-001'].inbound, [
      { from: 'SOURCE-001', trigger: 'tap', route: '/reset/send-code' },
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: Expo app-group index round trip keeps raw route-tree ownership and runtime `/` evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-app-group-index-round-trip-'));
  try {
    writeTree(root, {
      'src/app/(app)/index.tsx': 'export default function AppIndex() { return null; }\n',
      'src/app/source.tsx': 'export default function Source() { return null; }\n',
      'docs/frontend-workflow/domains/d/screens/source/screen-spec.md': screenSpec({
        artifactId: 'SOURCE-001-screen-spec',
        screenId: 'SOURCE-001',
        route: '/source',
        matrix: [
          '| User Action | Trigger | Result | Result Type | Target | Params |',
          '|---|---|---|---|---|---|',
          '| home | tap | 홈으로 이동 | route | / |  |',
        ].join('\n'),
      }),
      'docs/frontend-workflow/domains/d/screens/app-index/screen-spec.md': screenSpec({
        artifactId: 'APP-INDEX-001-screen-spec',
        screenId: 'APP-INDEX-001',
        route: '/(app)',
        matrix: basicMatrix('stay'),
      }),
    });

    const routeTree = renderRouteTree(scanAppDir(path.join(root, 'src', 'app')), {
      source: 'src/app/**',
      command: 'node scripts/route-tree.mjs --app src/app --out docs/frontend-workflow/_meta/route-tree.txt',
    });
    writeTree(root, { 'docs/frontend-workflow/_meta/route-tree.txt': routeTree });
    assert.match(routeTree, /route: \/\(app\)/, 'route-tree keeps the raw group-qualified token');

    const validation = runValidate(root);
    assert.deepEqual(check4Errors(validation), [], 'check 4 resolves one raw app-group index ScreenSpec route');
    assert.equal(
      (validation.warnings || []).some(
        (w) => w.check === 13 && /route-tree EXACT cross-check:.*Target \/ /.test(w.message),
      ),
      false,
      'the unique raw route-tree app-group index suppresses only the spurious root warning',
    );

    const graph = buildNavGraph({ docsDir: path.join(root, 'docs', 'frontend-workflow') });
    assert.deepEqual(graph.screens['SOURCE-001'].outbound, [
      { to_route: '/', trigger: 'tap', action: 'home' },
    ]);
    assert.deepEqual(graph.routes['/'].inbound, [{ from: 'SOURCE-001', trigger: 'tap' }]);
    assert.deepEqual(graph.screens['APP-INDEX-001'].inbound, [
      { from: 'SOURCE-001', trigger: 'tap', route: '/' },
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E P2: group-shaped raw tokens without verified Expo directory-index evidence stay literal', async (t) => {
  const cases = [
    {
      name: 'default Expo src/app/(app).tsx is not a group-directory index',
      buildRouteTree(root) {
        writeTree(root, {
          'src/app/(app).tsx': 'export default function ParenthesizedFile() { return null; }\n',
        });
        return renderRouteTree(scanAppDir(path.join(root, 'src', 'app')));
      },
    },
    {
      name: 'custom adapter literal /(app) does not inherit Expo semantics',
      buildRouteTree() {
        return renderRouteTree(
          [{ name: 'index.tsx', isDir: false, route: '/(app)' }],
          {
            source: 'router-adapter: examples/router-adapter/literal.mjs',
            command: 'node scripts/route-tree.mjs --router examples/router-adapter/literal.mjs --out docs/frontend-workflow/_meta/route-tree.txt',
          },
        );
      },
    },
  ];

  for (const item of cases) {
    await t.test(item.name, () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-app-group-index-unverified-'));
      try {
        writeTree(root, {
          'docs/frontend-workflow/domains/d/screens/source/screen-spec.md': screenSpec({
            artifactId: 'SOURCE-001-screen-spec',
            screenId: 'SOURCE-001',
            route: '/source',
            matrix: [
              '| User Action | Trigger | Result | Result Type | Target | Params |',
              '|---|---|---|---|---|---|',
              '| home | tap | 홈으로 이동 | route | / |  |',
            ].join('\n'),
          }),
          'docs/frontend-workflow/domains/d/screens/app-literal/screen-spec.md': screenSpec({
            artifactId: 'APP-LITERAL-001-screen-spec',
            screenId: 'APP-LITERAL-001',
            route: '/(app)',
            matrix: basicMatrix('stay'),
          }),
        });
        const routeTree = item.buildRouteTree(root);
        writeTree(root, { 'docs/frontend-workflow/_meta/route-tree.txt': routeTree });
        assert.match(routeTree, /route: \/\(app\)/, 'the ambiguous raw token is present');

        const validation = runValidate(root);
        assert.equal(check4Errors(validation).length, 1, 'check 4 does not accept an unverified root alias');
        assert.equal(
          (validation.warnings || []).some(
            (w) => w.check === 13 && /route-tree EXACT cross-check:.*Target \/ /.test(w.message),
          ),
          true,
          'check 13 keeps the warning for an unverified literal token',
        );

        const graph = buildNavGraph({ docsDir: path.join(root, 'docs', 'frontend-workflow') });
        assert.deepEqual(graph.screens['SOURCE-001'].outbound, [
          { to_route: '/', trigger: 'tap', action: 'home' },
        ]);
        assert.deepEqual(graph.routes['/'].inbound, [{ from: 'SOURCE-001', trigger: 'tap' }]);
        assert.equal(graph.screens['APP-LITERAL-001'], undefined, 'no destination screen is selected');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test('E2E: ambiguous app-group index keeps the `/` edge but fails closed for validation and destination', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-app-group-index-ambiguous-'));
  try {
    writeTree(root, {
      'src/app/(app)/index.tsx': 'export default function AppIndex() { return null; }\n',
      'src/app/(marketing)/index.tsx': 'export default function MarketingIndex() { return null; }\n',
      'docs/frontend-workflow/domains/d/screens/source/screen-spec.md': screenSpec({
        artifactId: 'SOURCE-001-screen-spec',
        screenId: 'SOURCE-001',
        route: '/source',
        matrix: [
          '| User Action | Trigger | Result | Result Type | Target | Params |',
          '|---|---|---|---|---|---|',
          '| home | tap | 홈으로 이동 | route | / |  |',
        ].join('\n'),
      }),
      'docs/frontend-workflow/domains/d/screens/app-index/screen-spec.md': screenSpec({
        artifactId: 'APP-INDEX-001-screen-spec',
        screenId: 'APP-INDEX-001',
        route: '/(app)',
        matrix: basicMatrix('stay'),
      }),
      'docs/frontend-workflow/domains/d/screens/marketing-index/screen-spec.md': screenSpec({
        artifactId: 'MARKETING-INDEX-001-screen-spec',
        screenId: 'MARKETING-INDEX-001',
        route: '/(marketing)',
        matrix: basicMatrix('stay'),
      }),
    });

    const routeTree = renderRouteTree(scanAppDir(path.join(root, 'src', 'app')));
    writeTree(root, { 'docs/frontend-workflow/_meta/route-tree.txt': routeTree });
    const validation = runValidate(root);
    const errors = check4Errors(validation);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /: \/$/);
    assert.equal(
      (validation.warnings || []).some(
        (w) => w.check === 13 && /복수 Expo group-index token/.test(w.message),
      ),
      true,
      'check 13 reports ambiguity instead of claiming the target token is absent',
    );

    const graph = buildNavGraph({ docsDir: path.join(root, 'docs', 'frontend-workflow') });
    assert.deepEqual(graph.screens['SOURCE-001'].outbound, [
      { to_route: '/', trigger: 'tap', action: 'home' },
    ]);
    assert.deepEqual(graph.routes['/'].inbound, [{ from: 'SOURCE-001', trigger: 'tap' }]);
    assert.equal(graph.screens['APP-INDEX-001'], undefined);
    assert.equal(graph.screens['MARKETING-INDEX-001'], undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: validate check 4 — group-less target stays an error when multiple single groups match', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check4-single-group-ambiguous-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/domains/d/screens/source/screen-spec.md': screenSpec({
        artifactId: 'SOURCE-001-screen-spec',
        screenId: 'SOURCE-001',
        route: '/source',
        matrix: [
          '| User Action | Trigger | Result | Result Type | Target | Params |',
          '|---|---|---|---|---|---|',
          '| login | tap | 이동 | route | /login |  |',
        ].join('\n'),
      }),
      'docs/frontend-workflow/domains/d/screens/auth-login/screen-spec.md': screenSpec({
        artifactId: 'AUTH-LOGIN-001-screen-spec',
        screenId: 'AUTH-LOGIN-001',
        route: '/(auth)/login',
        matrix: basicMatrix('stay'),
      }),
      'docs/frontend-workflow/domains/d/screens/marketing-login/screen-spec.md': screenSpec({
        artifactId: 'MARKETING-LOGIN-001-screen-spec',
        screenId: 'MARKETING-LOGIN-001',
        route: '/(marketing)/login',
        matrix: basicMatrix('stay'),
      }),
    });
    const errors = check4Errors(runValidate(root));
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /\/login/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: nav-graph — ambiguous group-less target does not resolve to a destination screen', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-nav-single-group-ambiguous-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/domains/d/screens/source/screen-spec.md': screenSpec({
        artifactId: 'SOURCE-001-screen-spec',
        screenId: 'SOURCE-001',
        route: '/source',
        matrix: [
          '| User Action | Trigger | Result | Result Type | Target | Params |',
          '|---|---|---|---|---|---|',
          '| login | tap | 이동 | route | /login |  |',
        ].join('\n'),
      }),
      'docs/frontend-workflow/domains/d/screens/auth-login/screen-spec.md': screenSpec({
        artifactId: 'AUTH-LOGIN-001-screen-spec',
        screenId: 'AUTH-LOGIN-001',
        route: '/(auth)/login',
        matrix: basicMatrix('stay'),
      }),
      'docs/frontend-workflow/domains/d/screens/marketing-login/screen-spec.md': screenSpec({
        artifactId: 'MARKETING-LOGIN-001-screen-spec',
        screenId: 'MARKETING-LOGIN-001',
        route: '/(marketing)/login',
        matrix: basicMatrix('stay'),
      }),
    });
    const graph = buildNavGraph({ docsDir: path.join(root, 'docs', 'frontend-workflow') });
    assert.deepEqual(graph.routes['/login'].inbound, [{ from: 'SOURCE-001', trigger: 'tap' }]);
    assert.equal(graph.screens['AUTH-LOGIN-001'], undefined);
    assert.equal(graph.screens['MARKETING-LOGIN-001'], undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: validate check 4 — array route group is not group-less normalized', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check4-array-group-runtime-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/domains/d/screens/source/screen-spec.md': screenSpec({
        artifactId: 'SOURCE-001-screen-spec',
        screenId: 'SOURCE-001',
        route: '/source',
        matrix: [
          '| User Action | Trigger | Result | Result Type | Target | Params |',
          '|---|---|---|---|---|---|',
          '| user | tap | 이동 | route | /users/[id] |  |',
        ].join('\n'),
      }),
      'docs/frontend-workflow/domains/d/screens/user/screen-spec.md': screenSpec({
        artifactId: 'USER-001-screen-spec',
        screenId: 'USER-001',
        route: '/(home,search)/users/[id]',
        matrix: basicMatrix('stay'),
      }),
    });
    const errors = check4Errors(runValidate(root));
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /\/users\/\[id\]/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: validate check 4 — v2 explicit non-route Result prose 는 hard gate 입력이 아니다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check4-v2-nonroute-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/domains/d/screens/home/screen-spec.md': screenSpec({
        artifactId: 'HOME-001-screen-spec',
        screenId: 'HOME-001',
        route: '/home',
        matrix: [
          '| User Action | Trigger | Result | Result Type | Target | Params |',
          '|---|---|---|---|---|---|',
          "| a | tap | code `router.replace('/missing')` shown as explanation | state |  |  |",
        ].join('\n'),
      }),
    });
    assert.deepEqual(check4Errors(runValidate(root)), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: validate check 4 — comma route group target keeps exact route', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check4-comma-group-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/domains/d/screens/user/screen-spec.md': screenSpec({
        artifactId: 'USER-001-screen-spec',
        screenId: 'USER-001',
        route: '/(home,search)/users/[id]',
        matrix: [
          '| User Action | Trigger | Result | Result Type | Target | Params |',
          '|---|---|---|---|---|---|',
          '| open user | tap | 이동 | route | /(home,search)/users/[id] |  |',
        ].join('\n'),
      }),
    });
    assert.deepEqual(check4Errors(runValidate(root)), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: validate check 4 — plus route group target keeps exact route', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check4-plus-group-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/domains/d/screens/login/screen-spec.md': screenSpec({
        artifactId: 'LOGIN-001-screen-spec',
        screenId: 'LOGIN-001',
        route: '/(+auth)/login',
        matrix: [
          '| User Action | Trigger | Result | Result Type | Target | Params |',
          '|---|---|---|---|---|---|',
          '| open login | tap | 이동 | route | /(+auth)/login |  |',
        ].join('\n'),
      }),
    });
    assert.deepEqual(check4Errors(runValidate(root)), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: validate check 4 — route-tree style optional catch-all and dotted routes are validated', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check4-route-tree-tokens-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/domains/d/screens/home/screen-spec.md': screenSpec({
        artifactId: 'HOME-001-screen-spec',
        screenId: 'HOME-001',
        route: '/home',
        matrix: [
          '| User Action | Trigger | Result | Result Type | Target | Params |',
          '|---|---|---|---|---|---|',
          '| optional catch-all | tap | 이동 | route | /docs/[[...slug]] |  |',
          '| dotted literal | tap | 이동 | route | /legal/privacy.v2 |  |',
          '| dotted extension-like literal | tap | 이동 | route | /release/notes.ts |  |',
          '| leading hyphen literal | tap | 이동 | route | /-debug |  |',
          '| home literal dotted route | tap | 이동 | route | /home/alice/notes.ts |  |',
          '| home dynamic dotted route | tap | 이동 | route | /home/[id]/notes.ts |  |',
          '| src dotted route | tap | 이동 | route | /src/styles/global.css |  |',
          '| comma route group | tap | 이동 | route | /(home,search)/users/[id] |  |',
          '| plus route group | tap | 이동 | route | /(+auth)/login |  |',
        ].join('\n'),
      }),
    });
    const messages = check4Errors(runValidate(root)).map((e) => e.message);
    assert.equal(messages.length, 9);
    assert.ok(messages.some((m) => m.includes('/docs/[[...slug]]')), 'optional catch-all target must be validated');
    assert.ok(messages.some((m) => m.includes('/legal/privacy.v2')), 'dotted literal target must be validated');
    assert.ok(messages.some((m) => m.includes('/release/notes.ts')), 'extension-like dotted route target must be validated');
    assert.ok(messages.some((m) => m.includes('/-debug')), 'leading hyphen literal target must be validated');
    assert.ok(messages.some((m) => m.includes('/home/alice/notes.ts')), 'home dotted route target must be validated');
    assert.ok(messages.some((m) => m.includes('/home/[id]/notes.ts')), 'home dynamic dotted route target must be validated');
    assert.ok(messages.some((m) => m.includes('/src/styles/global.css')), 'src dotted route target must be validated');
    assert.ok(messages.some((m) => m.includes('/(home,search)/users/[id]')), 'comma route group target must be validated');
    assert.ok(messages.some((m) => m.includes('/(+auth)/login')), 'plus route group target must be validated');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('v2 issues: v1 표는 항상 빈 배열(v2 점검 무발화 → v1 출력 불변)', () => {
  const v1 = specWithMatrix(['| User Action | Trigger | Result |', '|---|---|---|', '| a | t | /x |']);
  assert.deepEqual(interactionMatrixV2Issues(v1), []);
});

test('v2 issues: Result Type enum 허용값을 단일 출처 상수로 고정한다', () => {
  assert.deepEqual(INTERACTION_V2_RESULT_TYPES, ['route', 'state', 'mutation', 'external', 'none']);
  const rows = INTERACTION_V2_RESULT_TYPES.map((rt) =>
    `| ${rt} action | tap | ${rt} result | ${rt} | ${rt === 'route' ? '/coupons/[id]' : `${rt} target`} |`,
  );
  const spec = specWithMatrix([
    '| User Action | Trigger | Result | Result Type | Target |',
    '|---|---|---|---|---|',
    ...rows,
  ]);
  assert.equal(interactionMatrixV2Issues(spec).some((i) => i.kind === 'enum'), false);

  const invalid = specWithMatrix([
    '| User Action | Trigger | Result | Result Type | Target |',
    '|---|---|---|---|---|',
    '| 이동 | tap | 상세 | teleport | /coupons/[id] |',
  ]);
  const issue = interactionMatrixV2Issues(invalid).find((i) => i.kind === 'enum');
  assert.ok(issue, '불허 Result Type 은 enum 경고');
  assert.match(issue.message, /route\|state\|mutation\|external\|none/);
});

test('v2 issues: route 행 Target 부재 · enum 위반 · 비-route 행 라우트 토큰을 경고로 surface', () => {
  const spec = specWithMatrix([
    '| User Action | Trigger | Result | Result Type | Target |',
    '|---|---|---|---|---|',
    '| 이동 | tap | 상세로 | route |  |',          // route 인데 Target 라우트 없음
    '| 무엇 | tap | 뭔가 | teleport | /x |',         // enum 위반
    '| 탭 | tap | 필터 | state | /coupons |',        // 비-route 행에 라우트 토큰
  ]);
  const kinds = interactionMatrixV2Issues(spec).map((i) => i.kind);
  assert.ok(kinds.includes('route-missing-target'), 'route 행 Target 부재 경고');
  assert.ok(kinds.includes('enum'), 'Result Type enum 위반 경고');
  assert.ok(kinds.includes('nonroute-has-route'), '비-route 행 라우트 토큰 경고');
});

test('v2 issues: Result↔Target drift 와 route-tree EXACT cross-check 를 warning-first 로 수행한다', () => {
  const spec = specWithMatrix([
    '| User Action | Trigger | Result | Result Type | Target |',
    '|---|---|---|---|---|',
    '| 이동 | tap | /old/route 로 | route | /new/route |',  // Result 라우트가 Target 에 없음 = drift
  ]);
  const issuesNoTree = interactionMatrixV2Issues(spec);
  assert.ok(issuesNoTree.some((i) => i.kind === 'result-target-drift'), 'Result↔Target drift 경고');
  assert.equal(
    issuesNoTree.some((i) => i.kind === 'route-tree-target-missing'),
    false,
    'route-tree 부재/미주입 시 교차검증은 skip',
  );

  const issuesRoutePresent = interactionMatrixV2Issues(spec, {
    routeTreeRouteSet: new Set(['/new/route']),
  });
  assert.equal(
    issuesRoutePresent.some((i) => i.kind === 'route-tree-target-missing'),
    false,
    'Target 이 route-tree token 에 있으면 route-tree 경고 없음',
  );

  const issuesRouteMissing = interactionMatrixV2Issues(spec, {
    routeTreeRouteSet: new Set(['/(tabs)/home']),
  });
  const routeTreeIssue = issuesRouteMissing.find((i) => i.kind === 'route-tree-target-missing');
  assert.ok(routeTreeIssue, 'Target 이 route-tree token 에 없으면 warning');
  assert.match(routeTreeIssue.message, /route-tree EXACT cross-check/);
  // 모든 v2 issue 는 경고 분류일 뿐 — 함수는 절대 throw 하지 않는다(하드 게이트 없음).
  assert.doesNotThrow(() => interactionMatrixV2Issues(spec, { routeTreeRouteSet: new Set() }));
});

test('v2 issues: 루트 Target(/) 은 route-tree 에 있으면 누락 경고 없이 nav edge 로 보존된다', () => {
  const spec = specWithMatrix([
    '| User Action | Trigger | Result | Result Type | Target |',
    '|---|---|---|---|---|',
    '| 홈 | tap | 홈으로 이동 | route | / |',
  ]);
  assert.deepEqual(interactionEdgeRoutes(spec), ['/']);
  const issues = interactionMatrixV2Issues(spec, { routeTreeRouteSet: new Set(['/']) });
  assert.equal(issues.some((i) => i.kind === 'route-missing-target'), false);
  assert.equal(issues.some((i) => i.kind === 'route-tree-target-missing'), false);
});

test('v2 issues: route-tree root exception is unique, group-index-only, and root-only', () => {
  const rootSpec = specWithMatrix([
    '| User Action | Trigger | Result | Result Type | Target |',
    '|---|---|---|---|---|',
    '| 홈 | tap | 홈으로 이동 | route | / |',
  ]);
  const issues = (routes, expoIndexRoutes = []) =>
    interactionMatrixV2Issues(rootSpec, {
      routeTreeRouteSet: new Set(routes),
      routeTreeExpoIndexRouteSet: new Set(expoIndexRoutes),
    });

  assert.equal(routeTreeTargetExists('/', new Set(['/'])), true, 'exact root token passes');
  assert.equal(
    routeTreeTargetExists('/', new Set(['/(app)'])),
    false,
    'raw group-shaped token alone is not enough evidence',
  );
  assert.equal(
    routeTreeTargetExists('/', new Set(['/(app)']), { expoIndexRouteSet: new Set(['/(app)']) }),
    true,
    'one verified default-Expo index route maps to root',
  );
  assert.equal(
    issues(['/(app)']).some((i) => i.kind === 'route-tree-target-missing'),
    true,
    'custom/literal raw token keeps the warning without Expo index evidence',
  );
  assert.equal(
    issues(['/(app)'], ['/(app)']).some((i) => i.kind === 'route-tree-target-missing'),
    false,
    'one verified app-group index suppresses the root warning',
  );

  const ambiguous = resolveRouteTreeTarget('/', new Set(['/(app)', '/(marketing)']), {
    expoIndexRouteSet: new Set(['/(app)', '/(marketing)']),
  });
  assert.deepEqual(ambiguous, {
    status: 'ambiguous',
    matches: ['/(app)', '/(marketing)'],
  });
  const ambiguousIssue = issues(
    ['/(app)', '/(marketing)'],
    ['/(app)', '/(marketing)'],
  ).find((i) => i.kind === 'route-tree-target-ambiguous');
  assert.ok(ambiguousIssue, 'multiple verified root candidates get an ambiguity diagnostic');
  assert.match(ambiguousIssue.message, /\/\(app\), \/\(marketing\)/);

  assert.equal(
    issues(['/(home,search)'], ['/(home,search)']).some((i) => i.kind === 'route-tree-target-missing'),
    true,
    'array groups are not stripped',
  );
  assert.equal(
    issues(['/(+auth)'], ['/(+auth)']).some((i) => i.kind === 'route-tree-target-missing'),
    true,
    'plus groups are not stripped',
  );

  const loginSpec = specWithMatrix([
    '| User Action | Trigger | Result | Result Type | Target |',
    '|---|---|---|---|---|',
    '| 로그인 | tap | 로그인 이동 | route | /login |',
  ]);
  assert.equal(
    interactionMatrixV2Issues(loginSpec, { routeTreeRouteSet: new Set(['/(auth)/login']) })
      .some((i) => i.kind === 'route-tree-target-missing'),
    true,
    'non-root Target keeps the raw-token EXACT advisory contract',
  );
});

test('v2 issues: route-tree 부재 시 Target 존재 확인 skip 을 advisory 로 표면화한다', () => {
  const spec = specWithMatrix([
    '| User Action | Trigger | Result | Result Type | Target |',
    '|---|---|---|---|---|',
    '| 이동 | tap | 상세로 이동 | route | /missing |',
  ]);
  const issues = interactionMatrixV2Issues(spec, { routeTreeMissing: true });
  const issue = issues.find((i) => i.kind === 'route-tree-missing');
  assert.ok(issue, 'route-tree 부재 skip warning 이 있어야 한다');
  assert.match(issue.message, /route-tree EXACT cross-check skipped/);
});

test('v2 issues: 빈 Result Type 행은 v1 폴백 경고(type-empty), 완전 빈 행은 무발화', () => {
  const spec = specWithMatrix([
    '| User Action | Trigger | Result | Result Type | Target |',
    '|---|---|---|---|---|',
    '| 이동 | tap | /coupons | | |',   // Result Type 비어있음 → v1 폴백 경고
    '|  |  |  | | |',                  // 완전 빈 행 → 무발화
  ]);
  const issues = interactionMatrixV2Issues(spec);
  assert.equal(issues.filter((i) => i.kind === 'type-empty').length, 1);
});

test('v2: 빈 Result Type 행은 실제로 v1 Result 로 폴백한다 (엣지 누락 금지 — Codex MAJOR)', () => {
  // 부분 마이그레이션: v2 표인데 한 행의 Result Type 이 비었고 라우트는 v1 Result 셀에 있다.
  // 경고만 하고 조용히 누락하면 안 된다 — interactionRowRoutes/interactionEdgeRoutes 가 Result 로 폴백해야 한다.
  const row = { Result: '쿠폰 목록 /(tabs)/coupons', 'Result Type': '', Target: '' };
  assert.deepEqual(interactionRowRoutes(row, 'v2'), ['/(tabs)/coupons'], '빈 타입 행은 Result 로 폴백');
  // 명시적 비-route 타입은 여전히 폴백하지 않는다(엣지 없음).
  assert.deepEqual(interactionRowRoutes({ Result: '/x', 'Result Type': 'state', Target: '' }, 'v2'), []);

  // spec 레벨: 빈 타입 행의 라우트가 nav-graph 의 edge 집합(interactionEdgeRoutes)에 포함된다.
  const spec = specWithMatrix([
    '| User Action | Trigger | Result | Result Type | Target |',
    '|---|---|---|---|---|',
    '| 상세 | tap | /coupons/[id] | route | /coupons/[id] |',  // 정상 v2 route
    '| 목록 | tap | /(tabs)/coupons | | |',                    // 빈 타입 → v1 폴백
  ]);
  assert.deepEqual(interactionEdgeRoutes(spec), ['/coupons/[id]', '/(tabs)/coupons']);
});

test('buildState: optional route_entry and screen_entry frontmatter are preserved when present', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-state-route-screen-entry-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const docsDir = path.join(tmp, 'docs', 'frontend-workflow');
  const srcDir = path.join(tmp, 'src');
  fs.mkdirSync(path.join(docsDir, 'domains', 'profile', 'screens', 'profile'), { recursive: true });
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(docsDir, 'domains', 'profile', 'screens', 'profile', 'screen-spec.md'),
    [
      '---',
      'artifact_id: screen-spec-profile',
      'artifact_type: screen-spec',
      'domain: profile',
      'screen_id: PROFILE-001',
      'route: /profile',
      'route_entry: src/app/profile/page.tsx',
      'screen_entry: src/features/profile/screens/ProfileScreen.tsx',
      'status: draft',
      '---',
      '',
    ].join('\n'),
    'utf8',
  );

  const { state, inventory } = buildState({ docsDir, srcDir, date: '2026-06-24' });
  assert.equal(state.screens['PROFILE-001'].route_entry, 'src/app/profile/page.tsx');
  assert.equal(state.screens['PROFILE-001'].screen_entry, 'src/features/profile/screens/ProfileScreen.tsx');
  assert.equal(inventory.screens[0].route_entry, 'src/app/profile/page.tsx');
  assert.equal(inventory.screens[0].screen_entry, 'src/features/profile/screens/ProfileScreen.tsx');
});
