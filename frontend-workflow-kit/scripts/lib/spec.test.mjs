// spec.test.mjs — 게이트 신호 파싱 회귀 테스트 (node:test, 의존성 0).
// 두 fail-open/신호오염 결함의 회귀를 막는다:
//   P1: parseTable 가 빈 줄로 구분된 두 표를 병합해 진짜 Open Decisions 표가 증발 → readiness fail-OPEN.
//   P2: splitRow 가 셀 내 escaped pipe(\|)를 컬럼 구분자로 오인해 Status/Blocking Mode 가 밀림.
//   P7: computeReadiness 가 policy.modes 누락 시 Object.keys(undefined) 로 throw (fail-closed 구멍).
//   P13: interactionResultRoutes 가 후행 구두점·쿼리·외부 URL 을 라우트로 오인 (검사 4 오탐).
// 실행: npm run test:spec  (또는 node --test scripts/lib/spec.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTable,
  parseTables,
  parseOpenDecisions,
  parseCopyKeys,
  interactionResultRoutes,
  interactionMatrixIsV2,
  interactionRowRoutes,
  interactionEdgeRoutes,
  interactionMatrixV2Issues,
  INTERACTION_V2_RESULT_TYPES,
} from './spec.mjs';
import { computeReadiness } from '../readiness.mjs';

// 한 줄 헬퍼: Interaction Matrix 표 텍스트로 spec-유사 객체를 만든다(섹션 파서가 보는 형태).
function specWithMatrix(lines) {
  return { sections: { 'interaction matrix': lines.join('\n') }, path: 'test/screen-spec.md' };
}

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

test('v2: interactionEdgeRoutes 는 Target 을, 검사 4(interactionResultRoutes)는 여전히 Result 를 본다', () => {
  // v2 표에서 라우트가 Target 에만 있고 Result 는 자연어인 경우.
  const v2 = specWithMatrix([
    '| User Action | Trigger | Result | Result Type | Target | Params | Analytics Event |',
    '|---|---|---|---|---|---|---|',
    '| 쿠폰 클릭 | CouponCard press | 상세로 이동 | route | /coupons/[id] | id | e |',
    '| 탭 변경 | Tab press | status filter 변경 | state | status filter 변경 |  | e2 |',
  ]);
  // nav-graph 경로: Target 에서 라우트.
  assert.deepEqual(interactionEdgeRoutes(v2), ['/coupons/[id]']);
  // 검사 4 경로: Result 셀만 → 자연어라 라우트 0개(검사 4 byte-identical·warning-first 보장).
  assert.deepEqual(interactionResultRoutes(v2), []);
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
