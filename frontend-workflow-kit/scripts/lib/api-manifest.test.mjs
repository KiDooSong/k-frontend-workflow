// api-manifest.test.mjs — 검사 8 파서 + 메시지 분기 회귀 테스트 (node:test, 외부 의존성 0).
// 핵심: hasLinkedSchemaCol 이 "표에 Linked Schema 컬럼이 아예 없음(레거시)"과 "셀 빈칸/TBD"를 구분한다.
// 실행: npm run test:spec  (또는 node --test scripts/lib/api-manifest.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseManifestEndpoints, normEndpoint, isSchemaUnset } from './api-manifest.mjs';

const VALIDATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'validate.mjs');

const body = (table) => `# API Manifest\n\n## Endpoints\n${table}\n`;
const CANON = body(
  [
    '| Method | Path | Confidence | Linked Schema | Source |',
    '| --- | --- | --- | --- | --- |',
    '| GET | /coupons | confirmed | CouponListResponseSchema | openapi |',
    '| GET | /coupons/{id} | candidate | TBD | confluence |',
  ].join('\n'),
);
// 키트 기존 예제(multi-screen-dry-run)의 레거시 컬럼 — Linked Schema 컬럼이 아예 없다.
const LEGACY = body(
  [
    '| Method | Path | 용도 | Response (요약) | confidence |',
    '| --- | --- | --- | --- | --- |',
    '| GET | /coupons | 보유 쿠폰 목록 | CouponDto[] | confirmed |',
  ].join('\n'),
);

// --- 순수 파서 단위 테스트 -------------------------------------------------
test('canonical 5컬럼: hasLinkedSchemaCol=true, Linked Schema/Confidence 파싱', () => {
  const eps = parseManifestEndpoints(CANON);
  assert.equal(eps.length, 2);
  assert.equal(eps[0].hasLinkedSchemaCol, true);
  assert.equal(eps[0].confidence, 'confirmed');
  assert.equal(eps[0].linkedSchema, 'CouponListResponseSchema');
  assert.equal(eps[0].linkedContract, 'CouponListResponseSchema');
  assert.equal(eps[0].contractKind, 'zod');
  assert.equal(eps[0].contractKindInferred, true);
  assert.equal(eps[0].key, 'GET /coupons');
});

test('레거시 형식(Linked Schema 컬럼 부재): hasLinkedSchemaCol=false, linkedSchema 빈칸', () => {
  const eps = parseManifestEndpoints(LEGACY);
  assert.equal(eps.length, 1);
  assert.equal(eps[0].hasLinkedSchemaCol, false, '컬럼이 없으면 false 여야 한다');
  assert.equal(eps[0].linkedSchema, '', '없는 컬럼은 빈 문자열');
  assert.equal(eps[0].confidence, 'confirmed', 'confidence(소문자 헤더)는 느슨매칭으로 읽힌다');
  assert.equal(isSchemaUnset(eps[0].linkedSchema), true);
});

// 사람용 참고 컬럼(용도/Response)을 canonical 5컬럼 뒤에 덧붙인 superset 표 — 검사 8 은 앞 5컬럼만 읽는다.
test('superset 7컬럼(canonical+참고): hasLinkedSchemaCol=true, 참고 컬럼은 무시', () => {
  const eps = parseManifestEndpoints(
    body(
      [
        '| Method | Path | Confidence | Linked Schema | Source | 용도 | Response (요약) |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| GET | /coupons | candidate | TBD | - | 보유 쿠폰 목록 | CouponDto[] |',
      ].join('\n'),
    ),
  );
  assert.equal(eps.length, 1);
  assert.equal(eps[0].hasLinkedSchemaCol, true, '컬럼이 있으면 레거시로 오분류하지 않는다');
  assert.equal(eps[0].confidence, 'candidate');
  assert.equal(eps[0].linkedSchema, 'TBD');
});

test('표 없음 → 빈 배열', () => {
  assert.deepEqual(parseManifestEndpoints('# API Manifest\n\n본문에 표 없음.\n'), []);
});

test('normEndpoint: 경로 파라미터 표기 {id}/:id/[id] 를 모두 {} 로 정규화', () => {
  assert.equal(normEndpoint('get', '/coupons/{id}'), 'GET /coupons/{}');
  assert.equal(normEndpoint('GET', '/coupons/:id'), 'GET /coupons/{}');
  assert.equal(normEndpoint('GET', '/coupons/[id]'), 'GET /coupons/{}');
  assert.equal(normEndpoint('GET', '/coupons/'), 'GET /coupons', 'trailing slash 제거');
  assert.equal(normEndpoint('get', '/coupons?x=1'), 'GET /coupons', '쿼리 제거');
});

test('isSchemaUnset: 빈칸/-/TBD 는 미설정', () => {
  for (const v of ['', '   ', '-', 'TBD', 'tbd']) assert.equal(isSchemaUnset(v), true, `${JSON.stringify(v)} → unset`);
  assert.equal(isSchemaUnset('CouponListResponseSchema'), false);
});

// --- E2E: validate.mjs 검사 8 메시지 분기 (서브프로세스 --json) ----------------
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
    // 위반 시 exit 1 → execFileSync throw, 하지만 stdout 에 JSON 은 그대로 있다.
    return JSON.parse(String((e && e.stdout) || ''));
  }
}

test('E2E: 검사 6은 codegen outputs[]의 TS ASCII GENERATED 헤더를 허용하고 handwritten hook은 건너뜀', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check6-codegen-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/_meta/.keep': '',
      'src/api/generated/getX.client.ts': '// GENERATED FILE - DO NOT EDIT\nexport const x = 1;\n',
      'src/features/coupons/hooks/useHandWrittenCoupon.ts': 'export function useHandWrittenCoupon() {}\n',
    });
    const c6 = (runValidate(root).errors || []).filter((e) => e.check === 6);
    assert.deepEqual(c6, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: 검사 6은 codegen outputs[] 안의 malformed GENERATED 헤더를 경고 없이 에러로 잡음', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check6-codegen-bad-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/_meta/.keep': '',
      'src/api/generated/getX.client.ts': '// GENERATED FILE -- DO NOT EDIT\nexport const x = 1;\n',
    });
    const c6 = (runValidate(root).errors || []).filter((e) => e.check === 6);
    assert.equal(c6.length, 1);
    assert.match(c6[0].file, /src\/api\/generated\/getX\.client\.ts/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
// confirmed API 후보 1개를 가진 최소 화면(Entry Points nav-graph 마커 포함 → 검사 6 무소음).
const SCREEN_CONFIRMED =
  '---\nartifact_id: S1\nartifact_type: screen-spec\ndomain: d\nscreen_id: S1\nroute: /x\nstatus: draft\n---\n' +
  '# s\n\n## Entry Points\n<!-- GENERATED:START nav-graph -->\n- x\n<!-- GENERATED:END nav-graph -->\n\n## API Candidates\n- GET /x (confidence: confirmed)\n';
const manifestDoc = (table) =>
  '---\nartifact_id: api-manifest\nartifact_type: api-manifest\nstatus: draft\n---\n# m\n\n## Endpoints\n' + table + '\n';

test('E2E: 레거시 표(Linked Schema 컬럼 부재) → 검사 8 이 "컬럼이 없음(레거시)" 메시지', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check8-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/api/api-manifest.md': manifestDoc(
        '| Method | Path | 용도 | Response | confidence |\n|---|---|---|---|---|\n| GET | /x | 용도 | resp | confirmed |',
      ),
      'docs/frontend-workflow/domains/d/screens/s/screen-spec.md': SCREEN_CONFIRMED,
    });
    const c8 = (runValidate(root).errors || []).filter((e) => e.check === 8);
    assert.ok(c8.some((e) => /Linked Schema 컬럼이 없음/.test(e.message)), '컬럼 부재 메시지가 있어야 한다');
    assert.ok(!c8.some((e) => /비어있음\(빈칸\/TBD\)/.test(e.message)), '컬럼 부재인데 "빈칸/TBD" 가 나오면 안 된다');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: 5컬럼 표 Linked Schema=TBD → 검사 8 이 "비어있음(빈칸/TBD)" 메시지', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check8-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/api/api-manifest.md': manifestDoc(
        '| Method | Path | Confidence | Linked Schema | Source |\n|---|---|---|---|---|\n| GET | /x | confirmed | TBD | - |',
      ),
      'docs/frontend-workflow/domains/d/screens/s/screen-spec.md': SCREEN_CONFIRMED,
    });
    const c8 = (runValidate(root).errors || []).filter((e) => e.check === 8);
    assert.ok(c8.some((e) => /비어있음\(빈칸\/TBD\)/.test(e.message)), '빈칸/TBD 메시지가 있어야 한다');
    assert.ok(!c8.some((e) => /컬럼이 없음/.test(e.message)), '컬럼이 있으므로 "컬럼 없음" 이 나오면 안 된다');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('새 7컬럼: Linked Contract + Contract Kind(ts-type) 파싱', () => {
  const eps = parseManifestEndpoints(
    body(
      [
        '| Method | Path | Operation ID | Confidence | Linked Contract | Contract Kind | Source |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| GET | /coupons | listCoupons | confirmed | ListCouponsResponse | ts-type | src/api/types/coupon.ts |',
      ].join('\n'),
    ),
  );
  assert.equal(eps.length, 1);
  assert.equal(eps[0].operationId, 'listCoupons');
  assert.equal(eps[0].linkedSchema, '');
  assert.equal(eps[0].linkedContract, 'ListCouponsResponse');
  assert.equal(eps[0].contractKind, 'ts-type');
  assert.equal(eps[0].contractKindOmitted, false);
});

test('E2E: confirmed ts-type contract passes when exported interface exists', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check8-ts-pass-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/api/api-manifest.md': manifestDoc(
        '| Method | Path | Operation ID | Confidence | Linked Contract | Contract Kind | Source |\n|---|---|---|---|---|---|---|\n| GET | /x | getX | confirmed | ListXResponse | ts-type | src/api/types/x.ts |',
      ),
      'docs/frontend-workflow/domains/d/screens/s/screen-spec.md': SCREEN_CONFIRMED,
      'src/api/types/x.ts': 'export interface ListXResponse { items: string[] }\n',
    });
    const c8 = (runValidate(root).errors || []).filter((e) => e.check === 8);
    assert.deepEqual(c8, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: confirmed ts-type contract passes for generic exported type alias', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check8-ts-generic-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/api/api-manifest.md': manifestDoc(
        '| Method | Path | Operation ID | Confidence | Linked Contract | Contract Kind | Source |\n|---|---|---|---|---|---|---|\n| GET | /x | getX | confirmed | ListXResponse | ts-type | src/api/types/x.ts |',
      ),
      'docs/frontend-workflow/domains/d/screens/s/screen-spec.md': SCREEN_CONFIRMED,
      'src/api/types/x.ts': 'export type ListXResponse<T> = { items: T[] }\n',
    });
    const c8 = (runValidate(root).errors || []).filter((e) => e.check === 8);
    assert.deepEqual(c8, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('E2E: confirmed ts-type contract fails when type/interface export is missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check8-ts-missing-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/api/api-manifest.md': manifestDoc(
        '| Method | Path | Operation ID | Confidence | Linked Contract | Contract Kind | Source |\n|---|---|---|---|---|---|---|\n| GET | /x | getX | confirmed | ListXResponse | ts-type | src/api/types/x.ts |',
      ),
      'docs/frontend-workflow/domains/d/screens/s/screen-spec.md': SCREEN_CONFIRMED,
      'src/api/types/x.ts': 'export type OtherResponse = { ok: boolean }\n',
    });
    const c8 = (runValidate(root).errors || []).filter((e) => e.check === 8);
    assert.equal(c8.length, 1);
    assert.match(c8[0].message, /ts-type contract=ListXResponse/);
    assert.match(c8[0].message, /export type\/interface/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: duplicate endpoint with different Source is a conflict', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check8-source-conflict-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/api/api-manifest.md': manifestDoc(
        '| Method | Path | Operation ID | Confidence | Linked Contract | Contract Kind | Source |\n|---|---|---|---|---|---|---|\n| GET | /x | getX | confirmed | XResponse | ts-type | src/api/types/a.ts |\n| GET | /x | getX | confirmed | XResponse | ts-type | src/api/types/b.ts |',
      ),
      'docs/frontend-workflow/domains/d/screens/s/screen-spec.md': SCREEN_CONFIRMED,
      'src/api/types/a.ts': 'export type XResponse = { from: "a" }\n',
      'src/api/types/b.ts': 'export type XResponse = { from: "b" }\n',
    });
    const c8 = (runValidate(root).errors || []).filter((e) => e.check === 8);
    assert.equal(c8.length, 1);
    assert.match(c8[0].message, /충돌 중복 선언/);
    assert.match(c8[0].message, /Source 'src\/api\/types\/a\.ts' vs 'src\/api\/types\/b\.ts'/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('E2E: unsupported contract kind produces clear validation error', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check8-kind-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/api/api-manifest.md': manifestDoc(
        '| Method | Path | Confidence | Linked Contract | Contract Kind | Source |\n|---|---|---|---|---|---|\n| GET | /x | confirmed | ListXResponse | io-ts | src/api/types/x.ts |',
      ),
      'docs/frontend-workflow/domains/d/screens/s/screen-spec.md': SCREEN_CONFIRMED,
      'src/api/types/x.ts': 'export interface ListXResponse {}\n',
    });
    const c8 = (runValidate(root).errors || []).filter((e) => e.check === 8);
    assert.equal(c8.length, 1);
    assert.match(c8[0].message, /Contract Kind='io-ts'.*지원되지 않음/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('E2E: Linked Contract without Contract Kind reports omitted kind', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-check8-kind-omitted-'));
  try {
    writeTree(root, {
      'docs/frontend-workflow/api/api-manifest.md': manifestDoc(
        '| Method | Path | Confidence | Linked Contract | Source |\n|---|---|---|---|---|\n| GET | /x | confirmed | ListXResponse | src/api/types/x.ts |',
      ),
      'docs/frontend-workflow/domains/d/screens/s/screen-spec.md': SCREEN_CONFIRMED,
      'src/api/types/x.ts': 'export interface ListXResponse {}\n',
    });
    const c8 = (runValidate(root).errors || []).filter((e) => e.check === 8);
    assert.equal(c8.length, 1);
    assert.match(c8[0].message, /Contract Kind 가 비어있음/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});