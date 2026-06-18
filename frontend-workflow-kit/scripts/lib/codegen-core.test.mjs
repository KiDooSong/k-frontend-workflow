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
  loadCodegenAdapter,
  normalizeCodegenModel,
  renderCodegenManifest,
} from './codegen-core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = path.resolve(HERE, '..', '..');
const FIXTURE = path.join(KIT_ROOT, 'examples', 'codegen-adapter', 'openapi-client');

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
