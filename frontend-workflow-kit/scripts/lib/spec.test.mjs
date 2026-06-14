// spec.test.mjs — 게이트 신호 파싱 회귀 테스트 (node:test, 의존성 0).
// 두 fail-open/신호오염 결함의 회귀를 막는다:
//   P1: parseTable 가 빈 줄로 구분된 두 표를 병합해 진짜 Open Decisions 표가 증발 → readiness fail-OPEN.
//   P2: splitRow 가 셀 내 escaped pipe(\|)를 컬럼 구분자로 오인해 Status/Blocking Mode 가 밀림.
//   P7: computeReadiness 가 policy.modes 누락 시 Object.keys(undefined) 로 throw (fail-closed 구멍).
//   P13: interactionResultRoutes 가 후행 구두점·쿼리·외부 URL 을 라우트로 오인 (검사 4 오탐).
// 실행: npm run test:spec  (또는 node --test scripts/lib/spec.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTable, parseTables, parseOpenDecisions, parseCopyKeys, interactionResultRoutes } from './spec.mjs';
import { computeReadiness } from '../readiness.mjs';

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

test('P7: computeReadiness 가 policy.modes 누락 시 throw 하지 않는다 (fail-closed 구멍)', () => {
  // policy.order 도 modes 도 없으면 예전엔 Object.keys(undefined) 로 TypeError 가 났다.
  assert.doesNotThrow(() =>
    computeReadiness({ state: { screens: {} }, policy: { version: 1 }, ci: {}, manifest: {} }),
  );
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
