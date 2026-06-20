// codegen-core.test.mjs - Tier2 codegen adapter seam tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CORE_CODEGEN_ADAPTER_VERSION,
  CodegenAdapterError,
  buildHookName,
  checkCodegenFiles,
  loadCodegenAdapter,
  normalizeCodegenModel,
  renderCodegenFiles,
  renderCodegenManifest,
} from './codegen-core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = path.resolve(HERE, '..', '..');
const FIXTURE = path.join(KIT_ROOT, 'examples', 'codegen-adapter', 'openapi-client');
const CUSTOM = path.join(KIT_ROOT, 'examples', 'codegen-adapter', 'minimal-custom');
const CUSTOM_MODULE = path.join(CUSTOM, 'my-codegen.mjs');

function discoverFixture(adapter) {
  return adapter.discover({
    apiSchemaDir: path.join(FIXTURE, 'src', 'api', 'schemas'),
    baseDir: FIXTURE,
  });
}

test('C1: codegen adapter manifest loads openapi-client with compatible version', async () => {
  const adapter = await loadCodegenAdapter('openapi-client');
  assert.equal(adapter.name, 'openapi-client');
  assert.equal(adapter.version, CORE_CODEGEN_ADAPTER_VERSION);
  assert.equal(typeof adapter.discover, 'function');
});

test('C2: openapi-client discovery returns endpoint candidates only; core owns names and paths', async () => {
  const adapter = await loadCodegenAdapter('openapi-client');
  const model = discoverFixture(adapter);
  assert.equal(model.adapter, 'openapi-client');
  assert.deepEqual(model.sourceFiles, ['src/api/schemas/openapi.json']);

  const normalized = normalizeCodegenModel(model);
  assert.deepEqual(
    normalized.operations.map((op) => `${op.method} ${op.path} -> ${op.hookName}`),
    [
      'GET /coupons -> useListCouponsQuery',
      'GET /coupons/{couponId} -> useGetCouponQuery',
      'POST /coupons/{couponId}/redeem -> useRedeemCouponMutation',
    ],
  );
  assert.deepEqual(
    normalized.operations.map((op) => op.clientOut),
    [
      'src/api/generated/listCoupons.client.ts',
      'src/api/generated/getCoupon.client.ts',
      'src/api/generated/redeemCoupon.client.ts',
    ],
  );
});

test('C3: renderCodegenManifest is byte-identical to golden and stable across repeated renders', async () => {
  const adapter = await loadCodegenAdapter('openapi-client');
  const model = discoverFixture(adapter);
  const once = renderCodegenManifest(model);
  const twice = renderCodegenManifest(model);
  assert.equal(once, twice);

  const golden = fs.readFileSync(path.join(FIXTURE, 'expected', 'codegen-manifest.txt'), 'utf8');
  assert.equal(once.replace(/\r\n/g, '\n'), golden.replace(/\r\n/g, '\n'));
});

test('C3b: renderCodegenFiles emits byte-identical client/hook files and advisory check passes', async () => {
  const adapter = await loadCodegenAdapter('openapi-client');
  const model = discoverFixture(adapter);
  const once = renderCodegenFiles(model);
  const twice = renderCodegenFiles(model);
  assert.deepEqual(once, twice);
  assert.deepEqual(
    once.map((file) => file.path),
    [
      'src/api/generated/getCoupon.client.ts',
      'src/api/generated/listCoupons.client.ts',
      'src/api/generated/redeemCoupon.client.ts',
      'src/features/coupons/hooks/useGetCouponQuery.ts',
      'src/features/coupons/hooks/useListCouponsQuery.ts',
      'src/features/coupons/hooks/useRedeemCouponMutation.ts',
    ],
  );
  for (const file of once) {
    assert.equal(file.content.includes('\r'), false, `${file.path} should render LF-only content`);
    const golden = fs.readFileSync(path.join(FIXTURE, file.path), 'utf8');
    assert.equal(file.content, golden, `${file.path} should match golden`);
  }
  assert.deepEqual(checkCodegenFiles(model, { baseDir: FIXTURE }), {
    ok: true,
    files: once.map((file) => file.path),
    changes: [],
  });
});

test('C3c: parameterized query hooks include path identifiers in queryKey', async () => {
  const adapter = await loadCodegenAdapter('openapi-client');
  const model = discoverFixture(adapter);
  const getCouponHook = renderCodegenFiles(model).find((file) => file.path.endsWith('useGetCouponQuery.ts'));
  const listCouponsHook = renderCodegenFiles(model).find((file) => file.path.endsWith('useListCouponsQuery.ts'));

  assert.match(
    getCouponHook.content,
    /queryKey: \["coupons", "getCoupon", String\(options\.pathParams\.couponId\)\] as const,/,
  );
  assert.match(
    listCouponsHook.content,
    /queryKey: \["coupons", "listCoupons"\] as const,/,
  );
});

test('C4: core sorting makes shuffled operation input render identically', async () => {
  const adapter = await loadCodegenAdapter('openapi-client');
  const model = discoverFixture(adapter);
  const shuffled = { ...model, operations: [model.operations[2], model.operations[0], model.operations[1]] };
  assert.equal(renderCodegenManifest(shuffled), renderCodegenManifest(model));
});

test('C5: output naming can be derived from custom Tier-1 role patterns', async () => {
  const adapter = await loadCodegenAdapter('openapi-client');
  const model = discoverFixture(adapter);
  const normalized = normalizeCodegenModel(model, {
    roles: {
      api_client: 'lib/api/**',
      hook: 'app/{domain}/data/**',
    },
  });
  assert.equal(normalized.operations[0].clientOut, 'lib/api/generated/listCoupons.client.ts');
  assert.equal(normalized.operations[0].hookOut, 'app/coupons/data/useListCouponsQuery.ts');
});

test('C6: fail-closed adapter loading errors are surfaced', async () => {
  await assert.rejects(() => loadCodegenAdapter('no-such-codegen'), CodegenAdapterError);
  await assert.rejects(
    () => loadCodegenAdapter({ name: 'bad', version: CORE_CODEGEN_ADAPTER_VERSION + 1, discover: () => ({ operations: [] }) }),
    CodegenAdapterError,
  );
  await assert.rejects(() => loadCodegenAdapter({ version: 1 }), CodegenAdapterError);
});

test('C7: fail-closed model diagnostics cover missing fields and unsupported operationId', () => {
  assert.throws(
    () => normalizeCodegenModel({ operations: [{ method: 'GET', path: '/coupons', operationId: 'list-coupons', domain: 'coupons' }] }),
    /unsupported operationId/,
  );
  assert.throws(
    () => normalizeCodegenModel({ operations: [{ path: '/coupons', operationId: 'listCoupons', domain: 'coupons' }] }),
    /missing method/,
  );
  assert.throws(
    () => normalizeCodegenModel({ operations: [{ method: 'GET', operationId: 'listCoupons', domain: 'coupons' }] }),
    /missing path/,
  );
});

test('C8: hook name and output path collisions are diagnosed instead of guessed through', () => {
  assert.equal(
    buildHookName({ method: 'GET', operationId: 'listCoupons' }),
    'useListCouponsQuery',
  );
  assert.throws(
    () => normalizeCodegenModel({
      operations: [
        { method: 'GET', path: '/a', operationId: 'listCoupons', domain: 'coupons' },
        { method: 'GET', path: '/b', operationId: 'listCoupons', domain: 'coupons' },
      ],
    }),
    /hook name collision/,
  );
});

test('C9: openapi-client fails closed on missing api_schema input', async () => {
  const adapter = await loadCodegenAdapter('openapi-client');
  assert.throws(
    () => adapter.discover({ apiSchemaDir: path.join(FIXTURE, '__missing__'), baseDir: FIXTURE }),
    /api_schema directory not found/,
  );
});

test('C10: fail-closed — multiline/control-character OpenAPI paths cannot inject manifest lines', () => {
  assert.throws(
    () => renderCodegenManifest({
      operations: [{ method: 'GET', path: '/ok\ninjected: yes', operationId: 'getX', domain: 'coupons' }],
    }),
    /path must not contain control characters/,
  );
});

test('C11: fail-closed — output paths reject Windows drive and UNC absolutes', () => {
  assert.throws(
    () => normalizeCodegenModel({
      roles: { api_client: 'C:/tmp/api/**' },
      operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
    }),
    /codegen output path must stay relative and in-repo/,
  );
  assert.throws(
    () => normalizeCodegenModel({
      roles: { hook: '//server/share/{domain}/hooks/**' },
      operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
    }),
    /codegen output path must stay relative and in-repo/,
  );
});

test('C12: fail-closed — sourceFiles must remain project-relative', () => {
  assert.throws(
    () => renderCodegenManifest({
      sourceFiles: ['../openapi.json'],
      operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
    }),
    /codegen source file must stay relative and in-repo/,
  );
});

test('C13: fail-closed — malformed convention tokens are rejected before naming/rendering', () => {
  assert.throws(
    () => normalizeCodegenModel({
      conventions: { hookPrefix: undefined },
      operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
    }),
    /hookPrefix.*non-empty string/,
  );
  assert.throws(
    () => normalizeCodegenModel({
      conventions: { hookFileSuffix: null },
      operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
    }),
    /hookFileSuffix.*non-empty string/,
  );
});

test('C14: openapi-client fails closed when api_schema is outside baseDir', async () => {
  const adapter = await loadCodegenAdapter('openapi-client');
  assert.throws(
    () => adapter.discover({
      apiSchemaDir: path.join(FIXTURE, 'src', 'api', 'schemas'),
      baseDir: path.join(FIXTURE, 'src', 'features'),
    }),
    /source file must stay under baseDir/,
  );
});

test('C15: fail-closed — convention leafs cannot escape their Tier-1 role roots', () => {
  assert.throws(
    () => normalizeCodegenModel({
      conventions: { clientSubdir: '../leaked' },
      operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
    }),
    /clientSubdir.*without '\.\.'/,
  );
  assert.throws(
    () => normalizeCodegenModel({
      conventions: { hookFileSuffix: '/../../shared/useGetX.ts' },
      operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
    }),
    /hookFileSuffix.*filename suffix/,
  );
  assert.throws(
    () => normalizeCodegenModel({
      conventions: { hookOut: '{roles.hook}/../../shared/**' },
      operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
    }),
    /output pattern.*must not contain '\.\.'/,
  );
});

test('C18: fail-closed — resolved output patterns cannot traverse before role-root calculation', () => {
  assert.throws(
    () => normalizeCodegenModel({
      conventions: { clientOut: 'src/api/../leaked/**' },
      operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
    }),
    /output pattern.*must not contain '\.\.'/,
  );
  assert.throws(
    () => normalizeCodegenModel({
      conventions: { hookOut: 'src/features/{domain}/hooks/../shared/**' },
      operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
    }),
    /output pattern.*must not contain '\.\.'/,
  );
});

test('C19: fail-closed — output paths must be concrete files without glob wildcards', () => {
  assert.throws(
    () => normalizeCodegenModel({
      conventions: { clientOut: 'src/api/**/extra/**' },
      operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
    }),
    /output pattern supports only one terminal '\*\*' segment/,
  );
  assert.throws(
    () => normalizeCodegenModel({
      roles: { api_client: 'src/api/*/**' },
      operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
    }),
    /output pattern must not contain unsupported glob metacharacters/,
  );
  assert.throws(
    () => normalizeCodegenModel({
      conventions: { hookFileSuffix: '*.ts' },
      operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
    }),
    /output path must be a concrete file path without glob metacharacters/,
  );
});

test('C20: fail-closed — TypeScript emitter rejects unsupported path parameter syntax', () => {
  const files = renderCodegenFiles({
    operations: [{ method: 'GET', path: '/ok/{coupon_id}', operationId: 'getX', domain: 'coupons' }],
  });
  assert.match(files.find((file) => file.kind === 'client').content, /pathParams\.coupon_id/);
  assert.throws(
    () => renderCodegenFiles({
      operations: [{ method: 'GET', path: '/ok/{bad-id}', operationId: 'getX', domain: 'coupons' }],
    }),
    /unsupported path parameter syntax/,
  );
});

test('C16: fail-closed — manifest header fields cannot inject extra lines', () => {
  assert.throws(
    () => renderCodegenManifest({
      source: 'src/api/**\n# Injected: yes',
      operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
    }),
    /source header must not contain control characters/,
  );
  assert.throws(
    () => renderCodegenManifest({
      adapter: 'openapi-client\n# Injected: yes',
      operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
    }),
    /adapter header must not contain control characters/,
  );
  assert.throws(
    () => renderCodegenManifest({
      source: '../schemas/**',
      operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
    }),
    /source header must stay relative and in-repo/,
  );
});

test('C17: role references accept single-glob string arrays and reject multi-glob output roles precisely', () => {
  const normalized = normalizeCodegenModel({
    roles: {
      api_client: ['lib/api/**'],
      hook: ['app/{domain}/hooks/**'],
      api_schema: ['schema/openapi/**'],
    },
    operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
  });
  assert.equal(normalized.source, 'schema/openapi/**');
  assert.equal(normalized.operations[0].clientOut, 'lib/api/generated/getX.client.ts');
  assert.equal(normalized.operations[0].hookOut, 'app/coupons/hooks/useGetXQuery.ts');

  assert.throws(
    () => normalizeCodegenModel({
      roles: { api_client: ['lib/api/**', 'packages/*/api/**'] },
      operations: [{ method: 'GET', path: '/ok', operationId: 'getX', domain: 'coupons' }],
    }),
    /multi-glob output role unsupported: api_client/,
  );
});

// --- minimal-custom codegen adapter dogfood (examples/codegen-adapter/minimal-custom) ------------
// route-core.test.mjs S3/S5/S7/S4 미러: 비-내장 custom 어댑터를 코어가 해소·정렬·렌더(결정성)하고,
// fail-closed 가 추측 대신 거부함을 고정한다. 픽스처는 단위 입력일 뿐 — 실제 소스 트리/매니페스트 등록 없음.

test('C21: loadCodegenAdapter resolves a non-built-in custom adapter via {module} and via path string (S7)', async () => {
  const byModule = await loadCodegenAdapter({ module: CUSTOM_MODULE }, { baseDir: KIT_ROOT });
  assert.equal(byModule.name, 'minimal-custom');
  assert.equal(byModule.version, CORE_CODEGEN_ADAPTER_VERSION);
  assert.equal(typeof byModule.discover, 'function');

  const byPath = await loadCodegenAdapter(CUSTOM_MODULE, { baseDir: KIT_ROOT });
  assert.equal(byPath.name, 'minimal-custom');
  assert.equal(byPath.version, CORE_CODEGEN_ADAPTER_VERSION);

  // not registered in the built-in manifest — resolved purely by {module}/path, never by name lookup.
  await assert.rejects(() => loadCodegenAdapter('minimal-custom'), CodegenAdapterError);
});

test('C22: custom adapter renders byte-identical manifest + client/hook goldens, stable across repeats (S3)', async () => {
  const adapter = await loadCodegenAdapter({ module: CUSTOM_MODULE }, { baseDir: KIT_ROOT });
  const model = adapter.discover({});
  assert.equal(model.adapter, 'minimal-custom');

  const once = renderCodegenManifest(normalizeCodegenModel(model));
  const twice = renderCodegenManifest(normalizeCodegenModel(model));
  assert.equal(once, twice); // determinism
  const manifestGolden = fs.readFileSync(path.join(CUSTOM, 'expected', 'codegen-manifest.txt'), 'utf8');
  assert.equal(once.replace(/\r\n/g, '\n'), manifestGolden.replace(/\r\n/g, '\n'));

  // render surface goldens: one matched parameterized-query pair (client + hook).
  const files = renderCodegenFiles(model);
  assert.deepEqual(renderCodegenFiles(model), files); // determinism across repeated renders
  const client = files.find((file) => file.path.endsWith('getWidget.api.ts'));
  const hook = files.find((file) => file.path.endsWith('useGetWidgetFetch.ts'));
  for (const [file, name] of [[client, 'getWidget.api.ts'], [hook, 'useGetWidgetFetch.ts']]) {
    assert.equal(file.content.includes('\r'), false, `${name} should render LF-only content`);
    const golden = fs.readFileSync(path.join(CUSTOM, 'expected', name), 'utf8');
    assert.equal(file.content.replace(/\r\n/g, '\n'), golden.replace(/\r\n/g, '\n'), `${name} should match golden`);
  }
});

test('C23: core owns ordering — the adapter discovers unsorted and the core normalizes deterministically (S5)', async () => {
  const adapter = await loadCodegenAdapter({ module: CUSTOM_MODULE }, { baseDir: KIT_ROOT });
  const model = adapter.discover({});

  // the fixture deliberately discovers in a non-deterministic (unsorted) order ...
  assert.deepEqual(
    model.operations.map((op) => `${op.method} ${op.path}`),
    ['POST /widgets/{widgetId}/archive', 'GET /widgets', 'GET /widgets/{widgetId}'],
  );
  // ... and the core normalizes to a deterministic order (path -> method rank -> operationId).
  const normalized = normalizeCodegenModel(model);
  assert.deepEqual(
    normalized.operations.map((op) => `${op.method} ${op.path}`),
    ['GET /widgets', 'GET /widgets/{widgetId}', 'POST /widgets/{widgetId}/archive'],
  );
  // purity: the adapter's input array is not mutated by normalization.
  assert.equal(model.operations[0].operationId, 'archiveWidget');
  // a pre-shuffled model renders identically (order-independent core).
  const shuffled = { ...model, operations: [model.operations[1], model.operations[2], model.operations[0]] };
  assert.equal(renderCodegenManifest(shuffled), renderCodegenManifest(model));
});

test('C24: custom conventions flow through the core (conventions-as-config), distinct from openapi-client', async () => {
  const adapter = await loadCodegenAdapter({ module: CUSTOM_MODULE }, { baseDir: KIT_ROOT });
  const normalized = normalizeCodegenModel(adapter.discover({}));
  const byId = Object.fromEntries(normalized.operations.map((op) => [op.operationId, op]));

  // query/mutation suffixes and the client subdir/suffix come from the adapter's conventions, not hardcoded.
  assert.equal(byId.listWidgets.hookName, 'useListWidgetsFetch'); //   querySuffix 'Fetch' (vs openapi 'Query')
  assert.equal(byId.archiveWidget.hookName, 'useArchiveWidgetCommand'); // mutationSuffix 'Command' (vs 'Mutation')
  assert.equal(byId.getWidget.clientOut, 'src/api/_generated/getWidget.api.ts'); // clientSubdir '_generated' + '.api.ts'
  // hook output stays domain-scoped under the Tier-1 role (roles.hook) — same surface as openapi-client (OD-7).
  assert.equal(byId.getWidget.hookOut, 'src/features/widgets/hooks/useGetWidgetFetch.ts');
});

test('C25: fail-closed — a missing custom {module} and a version-mismatched custom adapter are rejected (S4)', async () => {
  // {module} pointing at a non-existent file -> CodegenAdapterError (no silent fallback to a built-in).
  await assert.rejects(
    () => loadCodegenAdapter({ module: path.join(CUSTOM, '__no_such_codegen__.mjs') }, { baseDir: KIT_ROOT }),
    CodegenAdapterError,
  );
  // the real custom adapter, re-presented with an out-of-range version -> CodegenAdapterError.
  const adapter = await loadCodegenAdapter({ module: CUSTOM_MODULE }, { baseDir: KIT_ROOT });
  const incompatible = { ...adapter, version: CORE_CODEGEN_ADAPTER_VERSION + 1 };
  await assert.rejects(() => loadCodegenAdapter(incompatible), CodegenAdapterError);
});
