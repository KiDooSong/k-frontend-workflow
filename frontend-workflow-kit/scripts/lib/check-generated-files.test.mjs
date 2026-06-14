// check-generated-files.test.mjs — generated-file guard v1 lib 단위 테스트.
//
// 실행(CI 미배선 — 하드룰상 package script/CI 변경 금지):
//   node --test scripts/lib/check-generated-files.test.mjs
//
// 2.5B 범위: discoverArtifacts 분류 + selectArtifactIds 정책. 재생성/헤더 검사는 2.5C 에서 추가.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverArtifacts, selectArtifactIds, V1_ARTIFACT_IDS } from './check-generated-files.mjs';
import { loadYaml, DEFAULTS } from './util.mjs';

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
  assert.deepEqual(selectArtifactIds(null).sort(), ['nav-graph', 'route-tree']);
  assert.deepEqual(selectArtifactIds('route-tree'), ['route-tree']);
  assert.deepEqual(selectArtifactIds('nav-graph'), ['nav-graph']);
  assert.deepEqual(selectArtifactIds('workflow-state'), []);
  assert.deepEqual(V1_ARTIFACT_IDS, ['nav-graph', 'route-tree']);
});

test('discoverArtifacts: 빈/이상 manifest 도 안전(빈 배열)', () => {
  assert.deepEqual(discoverArtifacts(null), []);
  assert.deepEqual(discoverArtifacts({}), []);
  assert.deepEqual(discoverArtifacts({ artifacts: null }), []);
});

test('discoverArtifacts: 실제 artifact-manifest.yaml 분류가 v1 규약과 일치', () => {
  const manifest = loadYaml(DEFAULTS.manifest);
  assert.ok(manifest && manifest.artifacts, '번들 manifest 로드');
  const byId = Object.fromEntries(discoverArtifacts(manifest).map((a) => [a.id, a]));
  // v1 대상은 selected
  assert.equal(byId['route-tree'].selected, true);
  assert.equal(byId['nav-graph'].selected, true);
  // planned 는 skip(planned)
  assert.equal(byId['component-catalog'].selected, false);
  assert.match(byId['component-catalog'].skip_reasons[0], /planned/);
  assert.equal(byId['eslint-workflow-config'].selected, false);
  assert.match(byId['eslint-workflow-config'].skip_reasons[0], /planned/);
  // active+lock 이지만 비-v1
  assert.equal(byId['workflow-state'].selected, false);
  assert.equal(byId['screen-inventory'].selected, false);
});
