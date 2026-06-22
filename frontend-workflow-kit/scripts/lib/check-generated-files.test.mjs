// check-generated-files.test.mjs — generated-file guard v1 lib 단위 테스트.
//
// 실행(CI 미배선 — 하드룰상 package script/CI 변경 금지):
//   node --test scripts/lib/check-generated-files.test.mjs
//
// 2.5B 범위: discoverArtifacts 분류 + selectArtifactIds 정책.
// 2.5C 범위: reproduceArtifact — examples 기반 양성(일치)·음성(변조 감지)·skip smoke.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  discoverCodegenTargets,
  discoverArtifacts,
  selectArtifactIds,
  reproduceArtifact,
  resolveCodegenSource,
  V1_ARTIFACT_IDS,
  V1_CODEGEN_TARGET_IDS,
  V1_TARGET_IDS,
} from './check-generated-files.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { loadYaml, DEFAULTS, KIT_ROOT } from './util.mjs';

// examples 픽스처(KIT_ROOT 기준 — cwd 무관). reproduceArtifact 는 커밋본을 읽기만 하므로
// 실제 픽스처를 대상으로 돌려도 트리를 변경하지 않는다(임시 디렉토리에서만 재생성).
const RT_BASIC = path.join(KIT_ROOT, 'examples', 'route-tree', 'basic-app');
const NG_BASIC = path.join(KIT_ROOT, 'examples', 'nav-graph', 'basic-flow');
const CC_BASIC = path.join(KIT_ROOT, 'examples', 'component-catalog', 'basic-ui');
const CODEGEN_FIXTURE = path.join(KIT_ROOT, 'examples', 'codegen-adapter', 'openapi-client');
const RT_DOCS = path.join(RT_BASIC, 'docs', 'frontend-workflow');
const RT_SRC = path.join(RT_BASIC, 'src');
const NG_DOCS = path.join(NG_BASIC, 'docs', 'frontend-workflow');
const CODEGEN_SRC = path.join(CODEGEN_FIXTURE, 'src');

const CODEGEN_OUTPUTS = [
  'src/api/generated/getCoupon.client.ts',
  'src/api/generated/listCoupons.client.ts',
  'src/api/generated/redeemCoupon.client.ts',
  'src/features/coupons/hooks/useGetCouponQuery.ts',
  'src/features/coupons/hooks/useListCouponsQuery.ts',
  'src/features/coupons/hooks/useRedeemCouponMutation.ts',
];
const MANIFEST = loadYaml(DEFAULTS.manifest);

// 합성 manifest — 분류 분기를 모두 덮는다(실제 manifest 와 독립적인 결정적 입력).
const SYNTH = {
  artifacts: {
    'screen-spec': { kind: 'authoring' }, // 비-생성물 → 후보 아님
    'route-tree': {
      kind: 'generated', generated: true, status: 'active', do_not_edit: true,
      path: 'docs/frontend-workflow/_meta/route-tree.txt',
      command: 'npm run workflow:route-tree', source: ['src/app/**'],
    },
    'nav-graph': {
      kind: 'generated', generated: true, status: 'active', do_not_edit: true,
      path: 'docs/frontend-workflow/_meta/nav-graph.yaml',
    },
    'workflow-state': {
      // active + do_not_edit 이지만 v1 allowlist 밖 → skip(v1 대상 아님)
      kind: 'generated', generated: true, status: 'active', do_not_edit: true,
      path: 'docs/frontend-workflow/_meta/workflow-state.yaml',
    },
    'component-catalog': {
      // planned + 수동(do_not_edit:false) → skip(planned 가 1차 사유)
      kind: 'generated', generated: true, status: 'planned', do_not_edit: false,
      path: 'docs/frontend-workflow/design/component-catalog.md',
    },
    'eslint-workflow-config': {
      // planned (생성기 미존재) → skip(planned)
      kind: 'generated', generated: true, status: 'planned', do_not_edit: true,
      path: 'eslint.workflow.config.mjs',
    },
  },
};

test('discoverArtifacts: kind:authoring 은 후보가 아니다', () => {
  const ids = discoverArtifacts(SYNTH).map((a) => a.id);
  assert.ok(!ids.includes('screen-spec'), 'authoring 엔트리는 분류 대상에서 제외');
});

test('discoverArtifacts: route-tree·nav-graph 만 selected', () => {
  const selected = discoverArtifacts(SYNTH)
    .filter((a) => a.selected)
    .map((a) => a.id)
    .sort();
  assert.deepEqual(selected, ['nav-graph', 'route-tree']);
});

test('discoverArtifacts: 결과는 id 로 안정 정렬', () => {
  const ids = discoverArtifacts(SYNTH).map((a) => a.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a.localeCompare(b)));
});

test('discoverArtifacts: planned 는 1차 skip 사유가 status 설명', () => {
  const cc = discoverArtifacts(SYNTH).find((a) => a.id === 'component-catalog');
  assert.equal(cc.selected, false);
  assert.match(cc.skip_reasons[0], /planned/, 'component-catalog 1차 사유는 planned');
  const eslint = discoverArtifacts(SYNTH).find((a) => a.id === 'eslint-workflow-config');
  assert.equal(eslint.selected, false);
  assert.match(eslint.skip_reasons[0], /planned/);
});

test('discoverArtifacts: active+do_not_edit 이어도 비-allowlist 면 skip(v1 대상 아님)', () => {
  const ws = discoverArtifacts(SYNTH).find((a) => a.id === 'workflow-state');
  assert.equal(ws.selected, false);
  assert.match(ws.skip_reasons[0], /v1 가드 대상 아님/);
});

test('discoverArtifacts: 주입 allowlist 로 selected 를 좁힐 수 있다', () => {
  const d = discoverArtifacts(SYNTH, { allowlist: ['route-tree'] });
  const selected = d.filter((a) => a.selected).map((a) => a.id);
  assert.deepEqual(selected, ['route-tree']);
  // nav-graph 는 이제 selected 아님(주입 allowlist 밖)
  assert.equal(d.find((a) => a.id === 'nav-graph').selected, false);
});

test('selectArtifactIds: v1 전체 / v1 하나 / 비-v1', () => {
  assert.deepEqual(selectArtifactIds(null).sort(), ['component-catalog', 'nav-graph', 'route-tree']);
  assert.deepEqual(selectArtifactIds('route-tree'), ['route-tree']);
  assert.deepEqual(selectArtifactIds('nav-graph'), ['nav-graph']);
  assert.deepEqual(selectArtifactIds('component-catalog'), ['component-catalog']);
  assert.deepEqual(selectArtifactIds('codegen-openapi-client'), ['codegen-openapi-client']);
  assert.deepEqual(selectArtifactIds('workflow-state'), []);
  assert.deepEqual(V1_ARTIFACT_IDS, ['component-catalog', 'nav-graph', 'route-tree']);
  assert.deepEqual(V1_CODEGEN_TARGET_IDS, ['codegen-openapi-client']);
  assert.deepEqual(V1_TARGET_IDS, [
    'codegen-openapi-client',
    'component-catalog',
    'nav-graph',
    'route-tree',
  ]);
});

test('discoverCodegenTargets: focused target reflects manifest-listed outputs', () => {
  const targets = discoverCodegenTargets({ ids: ['codegen-openapi-client'], manifest: MANIFEST });
  assert.equal(targets.length, 1);
  assert.equal(targets[0].id, 'codegen-openapi-client');
  assert.equal(targets[0].selected, true);
  assert.deepEqual(
    targets[0].outputs.map((output) => output.path),
    ['src/api/generated/*.client.ts', 'src/features/{domain}/hooks/*.ts'],
  );
  assert.deepEqual(targets[0].skip_reasons, []);
  assert.deepEqual(targets[0].source, ['{roles.api_schema}']);
});

test('discoverArtifacts: 빈/이상 manifest 도 안전(빈 배열)', () => {
  assert.deepEqual(discoverArtifacts(null), []);
  assert.deepEqual(discoverArtifacts({}), []);
  assert.deepEqual(discoverArtifacts({ artifacts: null }), []);
});

test('discoverArtifacts: 실제 artifact-manifest.yaml 분류가 v1 규약과 일치', () => {
  const manifest = MANIFEST;
  assert.ok(manifest && manifest.artifacts, '번들 manifest 로드');
  const byId = Object.fromEntries(discoverArtifacts(manifest).map((a) => [a.id, a]));
  // v1 대상은 selected
  assert.equal(byId['route-tree'].selected, true);
  assert.equal(byId['nav-graph'].selected, true);
  // component-catalog: PR-5 manifest active + PR-6 allowlist 등록 → 이제 selected
  assert.equal(byId['component-catalog'].selected, true);
  // eslint-workflow-config: 여전히 planned(생성기 미존재) → skip(planned)
  assert.equal(byId['eslint-workflow-config'].selected, false);
  assert.match(byId['eslint-workflow-config'].skip_reasons[0], /planned/);
  // codegen 은 manifest 에 outputs[] 로 등록됐지만 기본 v1 전체 대상은 아니다.
  assert.equal(byId['codegen-openapi-client'].selected, false);
  assert.equal(byId['codegen-openapi-client'].path, null);
  assert.deepEqual(
    byId['codegen-openapi-client'].outputs.map((output) => output.path),
    ['src/api/generated/*.client.ts', 'src/features/{domain}/hooks/*.ts'],
  );
  // active+lock 이지만 비-v1
  assert.equal(byId['workflow-state'].selected, false);
  assert.equal(byId['screen-inventory'].selected, false);
});

// ── 2.5C reproduce-to-scratch smoke (examples 기반) ───────────────────────────

test('reproduceArtifact: route-tree 픽스처가 커밋본을 재현(ok)', () => {
  const r = reproduceArtifact('route-tree', { docsDir: RT_DOCS, srcDir: RT_SRC });
  assert.equal(r.status, 'ok', JSON.stringify(r.checks));
  assert.ok(r.checks.some((c) => c.check === 'CG:content' && c.ok));
  assert.ok(r.checks.some((c) => c.check === 'CG:deterministic' && c.ok));
});

test('reproduceArtifact: nav-graph 픽스처가 커밋본을 재현(ok)', () => {
  const r = reproduceArtifact('nav-graph', { docsDir: NG_DOCS, srcDir: NG_DOCS });
  assert.equal(r.status, 'ok', JSON.stringify(r.checks));
  assert.ok(r.checks.some((c) => c.check === 'CG:content' && c.ok));
});

test('reproduceArtifact: component-catalog 픽스처가 커밋본을 재현(ok)', () => {
  // basic-ui 픽스처는 골든을 expected/ 에 두는 generated-view 관례라, check-generated 의
  // 프로젝트 레이아웃(<docsDir>/design/<file> + <srcDir>/components/ui)으로 임시 디렉토리에
  // 재배치해 reproduce 한다. 커밋 트리는 건드리지 않는다(임시 디렉토리에만 쓰기).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cgf-cc-'));
  try {
    fs.cpSync(path.join(CC_BASIC, 'src'), path.join(tmp, 'src'), { recursive: true });
    const designDir = path.join(tmp, 'docs', 'frontend-workflow', 'design');
    fs.mkdirSync(designDir, { recursive: true });
    fs.cpSync(
      path.join(CC_BASIC, 'expected', 'component-catalog.md'),
      path.join(designDir, 'component-catalog.md'),
    );
    const r = reproduceArtifact('component-catalog', {
      docsDir: path.join(tmp, 'docs', 'frontend-workflow'),
      srcDir: path.join(tmp, 'src'),
    });
    assert.equal(r.status, 'ok', JSON.stringify(r.checks));
    assert.ok(r.checks.some((c) => c.check === 'CG:content' && c.ok));
    assert.ok(r.checks.some((c) => c.check === 'CG:deterministic' && c.ok));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});


test('reproduceArtifact: component-catalog uses ui_primitive role override for nonstandard UI root', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cgf-cc-custom-ui-'));
  try {
    fs.writeFileSync(
      path.join(tmp, 'project-layout.yaml'),
      ['version: 1', 'preset: expo-feature', 'roles:', '  ui_primitive: src/shared/ui/**', ''].join('\n'),
    );
    const ui = path.join(tmp, 'src', 'shared', 'ui');
    fs.mkdirSync(ui, { recursive: true });
    fs.writeFileSync(path.join(ui, 'Button.tsx'), 'export function Button() { return null; }\n');
    fs.mkdirSync(path.join(tmp, 'src', 'components', 'ui'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'src', 'components', 'ui', 'Ghost.tsx'),
      'export function Ghost() { return null; }\n',
    );
    const designDir = path.join(tmp, 'docs', 'frontend-workflow', 'design');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(
      path.join(designDir, 'component-catalog.md'),
      [
        '# GENERATED FILE — DO NOT EDIT',
        '<!-- Source: src/shared/ui/** -->',
        '<!-- Command: node scripts/catalog-gen.mjs --src src/shared/ui --out docs/frontend-workflow/design/component-catalog.md -->',
        '',
        '## Components',
        '',
        '| Name | Source Path | Export Kind | Status |',
        '| --- | --- | --- | --- |',
        '| Button | src/shared/ui/Button.tsx | named | ok |',
        '',
      ].join('\n'),
    );
    const layoutPath = path.join(tmp, 'project-layout.yaml');
    const layout = loadLayoutProfile({ kitRoot: KIT_ROOT, flags: { layout: layoutPath } });
    const r = reproduceArtifact('component-catalog', {
      docsDir: path.join(tmp, 'docs', 'frontend-workflow'),
      srcDir: path.join(tmp, 'src'),
      layout,
      layoutPath,
    });
    assert.equal(r.status, 'ok', JSON.stringify(r.checks));
    assert.match(r.input, /src\/shared\/ui$/);
    assert.ok(r.checks.some((c) => c.check === 'CG:content' && c.ok));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('reproduceArtifact: component-catalog uses wildcard ui_primitive role glob', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cgf-cc-wildcard-ui-'));
  try {
    fs.writeFileSync(
      path.join(tmp, 'project-layout.yaml'),
      ['version: 1', 'preset: expo-feature', 'roles:', '  ui_primitive: packages/*/ui/**', ''].join('\n'),
    );
    const ui = path.join(tmp, 'packages', 'web', 'ui');
    fs.mkdirSync(ui, { recursive: true });
    fs.writeFileSync(path.join(ui, 'Button.tsx'), 'export function Button() { return null; }\n');
    fs.mkdirSync(path.join(tmp, 'src', 'components', 'ui'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'src', 'components', 'ui', 'Ghost.tsx'),
      'export function Ghost() { return null; }\n',
    );
    const designDir = path.join(tmp, 'docs', 'frontend-workflow', 'design');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(
      path.join(designDir, 'component-catalog.md'),
      [
        '# GENERATED FILE — DO NOT EDIT',
        '<!-- Source: packages/*/ui/** -->',
        '<!-- Command: node scripts/catalog-gen.mjs --src packages/*/ui --out docs/frontend-workflow/design/component-catalog.md -->',
        '',
        '## Components',
        '',
        '| Name | Source Path | Export Kind | Status |',
        '| --- | --- | --- | --- |',
        '| Button | packages/web/ui/Button.tsx | named | ok |',
        '',
      ].join('\n'),
    );
    const layoutPath = path.join(tmp, 'project-layout.yaml');
    const layout = loadLayoutProfile({ kitRoot: KIT_ROOT, flags: { layout: layoutPath } });
    const r = reproduceArtifact('component-catalog', {
      docsDir: path.join(tmp, 'docs', 'frontend-workflow'),
      srcDir: path.join(tmp, 'src'),
      layout,
      layoutPath,
    });
    assert.equal(r.status, 'ok', JSON.stringify(r.checks));
    assert.match(r.input, /packages$/);
    assert.ok(r.checks.some((c) => c.check === 'CG:content' && c.ok));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('resolveCodegenSource: codegen source metadata follows custom api_schema role', () => {
  const layout = {
    roleGlobs(role) {
      return role === 'api_schema' ? ['contracts/openapi/**'] : [];
    },
  };
  assert.equal(
    resolveCodegenSource(
      { resolveSource: ({ layout }) => layout.roleGlobs('api_schema')[0] || '{roles.api_schema}' },
      layout,
    ),
    'contracts/openapi/**',
  );
});

test('reproduceArtifact: codegen openapi-client fixture reproduces multi-output client/hooks in stable order', () => {
  const r = reproduceArtifact('codegen-openapi-client', { srcDir: CODEGEN_SRC, manifest: MANIFEST });
  assert.equal(r.status, 'ok', JSON.stringify(r.checks));
  assert.deepEqual(r.files, CODEGEN_OUTPUTS);
  assert.ok(r.checks.some((c) => c.check === 'CG:discover' && c.ok));
  assert.ok(r.checks.some((c) => c.check === 'CG:deterministic' && c.ok));
  assert.ok(r.checks.some((c) => c.check === 'CG:content' && c.ok));
});

test('reproduceArtifact: codegen output tamper is reported as mismatch without rewriting files', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cgf-codegen-neg-'));
  try {
    fs.cpSync(CODEGEN_FIXTURE, tmp, { recursive: true });
    const tampered = path.join(tmp, 'src', 'features', 'coupons', 'hooks', 'useListCouponsQuery.ts');
    fs.appendFileSync(tampered, '\n// tampered codegen output\n', 'utf8');
    const r = reproduceArtifact('codegen-openapi-client', { srcDir: path.join(tmp, 'src'), manifest: MANIFEST });
    assert.equal(r.status, 'mismatch', JSON.stringify(r.checks));
    assert.deepEqual(r.files, CODEGEN_OUTPUTS);
    assert.ok(r.checks.some((c) => c.check === 'CG:content' && !c.ok && /different/.test(c.message)));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('reproduceArtifact: missing codegen output is reported as missing-committed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cgf-codegen-missing-'));
  try {
    fs.cpSync(CODEGEN_FIXTURE, tmp, { recursive: true });
    fs.rmSync(path.join(tmp, 'src', 'api', 'generated', 'redeemCoupon.client.ts'));
    const r = reproduceArtifact('codegen-openapi-client', { srcDir: path.join(tmp, 'src'), manifest: MANIFEST });
    assert.equal(r.status, 'missing-committed', JSON.stringify(r.checks));
    assert.deepEqual(r.files, CODEGEN_OUTPUTS);
    assert.ok(r.checks.some((c) => c.check === 'CG:content' && !c.ok && /missing/.test(c.message)));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('reproduceArtifact: stale extra codegen client output is reported as mismatch', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cgf-codegen-stale-client-'));
  try {
    fs.cpSync(CODEGEN_FIXTURE, tmp, { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'src', 'api', 'generated', 'staleCoupon.client.ts'),
      '// GENERATED FILE - DO NOT EDIT\n// stale generated client\n',
      'utf8',
    );
    const r = reproduceArtifact('codegen-openapi-client', { srcDir: path.join(tmp, 'src'), manifest: MANIFEST });
    assert.equal(r.status, 'mismatch', JSON.stringify(r.checks));
    assert.deepEqual(r.files, CODEGEN_OUTPUTS);
    assert.ok(
      r.checks.some((c) => c.check === 'CG:stale' && !c.ok && /staleCoupon\.client\.ts/.test(c.message)),
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('reproduceArtifact: stale extra codegen hook output is reported as mismatch', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cgf-codegen-stale-hook-'));
  try {
    fs.cpSync(CODEGEN_FIXTURE, tmp, { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'src', 'features', 'coupons', 'hooks', 'useStaleCouponQuery.ts'),
      '// GENERATED FILE - DO NOT EDIT\n// stale generated hook\n',
      'utf8',
    );
    const r = reproduceArtifact('codegen-openapi-client', { srcDir: path.join(tmp, 'src'), manifest: MANIFEST });
    assert.equal(r.status, 'mismatch', JSON.stringify(r.checks));
    assert.deepEqual(r.files, CODEGEN_OUTPUTS);
    assert.ok(
      r.checks.some((c) => c.check === 'CG:stale' && !c.ok && /useStaleCouponQuery\.ts/.test(c.message)),
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('reproduceArtifact: hand-written hook under codegen output pattern is not stale-owned', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cgf-codegen-hand-hook-'));
  try {
    fs.cpSync(CODEGEN_FIXTURE, tmp, { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'src', 'features', 'coupons', 'hooks', 'useHandWrittenCoupon.ts'),
      'export function useHandWrittenCoupon() {\n  return null;\n}\n',
      'utf8',
    );
    const r = reproduceArtifact('codegen-openapi-client', { srcDir: path.join(tmp, 'src'), manifest: MANIFEST });
    assert.equal(r.status, 'ok', JSON.stringify(r.checks));
    assert.deepEqual(r.files, CODEGEN_OUTPUTS);
    assert.ok(r.checks.some((c) => c.check === 'CG:stale' && c.ok));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('reproduceArtifact: 커밋본 변조를 mismatch 로 감지', () => {
  // 픽스처를 임시 디렉토리로 복사 → 커밋본만 변조 → 재생성은 원본을 만들어 불일치.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cgf-neg-'));
  try {
    fs.cpSync(RT_BASIC, tmp, { recursive: true });
    const committed = path.join(tmp, 'docs', 'frontend-workflow', '_meta', 'route-tree.txt');
    fs.appendFileSync(committed, '\n# tampered line (직접 편집)\n', 'utf8');
    const r = reproduceArtifact('route-tree', {
      docsDir: path.join(tmp, 'docs', 'frontend-workflow'),
      srcDir: path.join(tmp, 'src'),
    });
    assert.equal(r.status, 'mismatch', JSON.stringify(r.checks));
    assert.ok(r.checks.some((c) => c.check === 'CG:content' && !c.ok));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('reproduceArtifact: 입력·커밋본 모두 없어도 조용히 통과 안 함(missing-committed)', () => {
  // active v1 산출물의 커밋본 부재는 finding(설계 §5) — both-missing 을 skip/ok 로 숨기지 않는다.
  const nowhere = path.join(os.tmpdir(), 'cgf-absent-does-not-exist');
  const r = reproduceArtifact('route-tree', {
    docsDir: path.join(nowhere, 'docs', 'frontend-workflow'),
    srcDir: path.join(nowhere, 'src'),
  });
  assert.equal(r.status, 'missing-committed');
  assert.ok(r.checks.some((c) => c.check === 'CG:committed' && !c.ok));
});

test('reproduceArtifact: 변조 테스트가 실제 커밋 픽스처를 건드리지 않음', () => {
  // 음성 테스트 직후에도 실제 픽스처는 여전히 ok 로 재현돼야 한다(트리 불변 보장).
  const r = reproduceArtifact('route-tree', { docsDir: RT_DOCS, srcDir: RT_SRC });
  assert.equal(r.status, 'ok');
});
