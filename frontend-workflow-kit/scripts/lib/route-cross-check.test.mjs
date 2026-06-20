// route-cross-check.test.mjs — route cross-check (OD-4 warning-only 도구) lib 단위 테스트.
//
// 실행:
//   node --test scripts/lib/route-cross-check.test.mjs
//
// 범위: analyzeRouteCrossCheck(EXACT 양방향 대조 + fail-soft skip) + format(경고/사람-읽기) +
//   CLI 종단(항상 exit 0, --json stdout / 경고 stderr). 합성 입력은 임시 디렉토리에 docs 트리를
//   세운다(check-generated-files.test.mjs 의 임시-디렉토리 관례 미러; 커밋 트리 불변).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  analyzeRouteCrossCheck,
  formatRouteCrossCheckWarnings,
  formatRouteCrossCheckHuman,
} from './route-cross-check.mjs';
import { KIT_ROOT } from './util.mjs';

const CLI = path.join(KIT_ROOT, 'scripts', 'route-cross-check.mjs');

// route-tree.txt 본문 합성 — parseRouteTreeRouteTokens 는 `route: <token>` 라인만 읽으므로(route-core.mjs:173)
// 박스드로잉을 흉내 낼 필요 없이 토큰 라인만 둔다. routes=null 이면 파일을 만들지 않는다(부재 skip 케이스).
function renderTree(routes) {
  const out = ['# GENERATED FILE — DO NOT EDIT', '# Source: src/app/**', '', '/'];
  for (const r of routes) out.push(`   file.tsx                          route: ${r}`);
  return out.join('\n') + '\n';
}

// 임시 docs 트리를 세운다. specs: [{domain,screen,route?}], treeRoutes: string[]|null.
//   route 값은 따옴표로 감싸 YAML 엣지(괄호/대괄호)를 피한다 — 파싱 결과 문자열은 동일.
function makeDocs({ treeRoutes, specs }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcc-'));
  const docsDir = path.join(tmp, 'docs', 'frontend-workflow');
  for (const s of specs) {
    const dir = path.join(docsDir, 'domains', s.domain, 'screens', s.screen);
    fs.mkdirSync(dir, { recursive: true });
    const routeLine = s.route != null ? `route: "${s.route}"\n` : '';
    fs.writeFileSync(
      path.join(dir, 'screen-spec.md'),
      `---\nscreen_id: ${s.screen}\n${routeLine}---\n\n## Purpose\n샘플\n`,
      'utf8',
    );
  }
  if (treeRoutes != null) {
    const metaDir = path.join(docsDir, '_meta');
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(path.join(metaDir, 'route-tree.txt'), renderTree(treeRoutes), 'utf8');
  }
  return { tmp, docsDir };
}

function withDocs(spec, fn) {
  const { tmp, docsDir } = makeDocs(spec);
  try {
    return fn(docsDir);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test('완전 일치 → 경고 0 (skipped=false, 양방향 비어있음)', () => {
  withDocs(
    {
      treeRoutes: ['/', '/coupons/[id]'],
      specs: [
        { domain: 'home', screen: 'index', route: '/' },
        { domain: 'coupons', screen: 'detail', route: '/coupons/[id]' },
      ],
    },
    (docsDir) => {
      const r = analyzeRouteCrossCheck({ docsDir });
      assert.equal(r.skipped, false);
      assert.equal(r.warning_count, 0);
      assert.deepEqual(r.spec_not_in_tree, []);
      assert.deepEqual(r.tree_not_in_spec, []);
      assert.deepEqual(formatRouteCrossCheckWarnings(r), []);
      // 사람-읽기는 ok 한 줄
      const human = formatRouteCrossCheckHuman(r);
      assert.equal(human.length, 1);
      assert.match(human[0], /ok \(warning-first\)/);
    },
  );
});

test('ScreenSpec route 인데 route-tree 에 없음 → 경고 (파일 컨텍스트 포함, 방향 1)', () => {
  withDocs(
    {
      treeRoutes: ['/'],
      specs: [
        { domain: 'home', screen: 'index', route: '/' },
        { domain: 'coupons', screen: 'detail', route: '/coupons/[id]' }, // 트리에 없음
      ],
    },
    (docsDir) => {
      const r = analyzeRouteCrossCheck({ docsDir });
      assert.equal(r.skipped, false);
      assert.deepEqual(r.spec_not_in_tree.map((e) => e.route), ['/coupons/[id]']);
      assert.deepEqual(r.spec_not_in_tree[0].files, [
        'domains/coupons/screens/detail/screen-spec.md',
      ]);
      assert.deepEqual(r.tree_not_in_spec, []);
      assert.equal(r.warning_count, 1);
      const w = formatRouteCrossCheckWarnings(r);
      assert.ok(
        w.some((l) => /ScreenSpec route not in route-tree/.test(l) && l.includes('/coupons/[id]')),
        w.join('\n'),
      );
    },
  );
});

test('route-tree 에 있는데 ScreenSpec 없음 → 경고 (방향 2)', () => {
  withDocs(
    {
      treeRoutes: ['/', '/(tabs)/home'],
      specs: [{ domain: 'home', screen: 'index', route: '/' }],
    },
    (docsDir) => {
      const r = analyzeRouteCrossCheck({ docsDir });
      assert.deepEqual(r.tree_not_in_spec, ['/(tabs)/home']);
      assert.deepEqual(r.spec_not_in_tree, []);
      assert.equal(r.warning_count, 1);
      const w = formatRouteCrossCheckWarnings(r);
      assert.ok(
        w.some((l) => /route-tree route without ScreenSpec/.test(l) && l.includes('/(tabs)/home')),
        w.join('\n'),
      );
    },
  );
});

test('EXACT — 정규화하지 않는다 ([id] vs :id 는 양방향 불일치)', () => {
  // ScreenSpec 가 :id, route-tree 가 [id] 표기면 EXACT 라 둘 다 경고(어느 쪽도 정규화 안 함).
  withDocs(
    {
      treeRoutes: ['/coupons/[id]'],
      specs: [{ domain: 'coupons', screen: 'detail', route: '/coupons/:id' }],
    },
    (docsDir) => {
      const r = analyzeRouteCrossCheck({ docsDir });
      assert.deepEqual(r.spec_not_in_tree.map((e) => e.route), ['/coupons/:id']);
      assert.deepEqual(r.tree_not_in_spec, ['/coupons/[id]']);
      assert.equal(r.warning_count, 2);
    },
  );
});

test('route-tree.txt 부재 → 조용히 skip (크래시 없음, 경고 0)', () => {
  withDocs(
    {
      treeRoutes: null, // route-tree.txt 안 만듦
      specs: [{ domain: 'home', screen: 'index', route: '/' }],
    },
    (docsDir) => {
      const r = analyzeRouteCrossCheck({ docsDir });
      assert.equal(r.skipped, true);
      assert.equal(r.route_tree_found, false);
      assert.match(r.skip_reason, /route-tree\.txt/);
      assert.equal(r.warning_count, 0);
      assert.deepEqual(formatRouteCrossCheckWarnings(r), []);
      const human = formatRouteCrossCheckHuman(r);
      assert.equal(human.length, 1);
      assert.match(human[0], /skip \(warning-first\)/);
    },
  );
});

test('screen-spec 0건 → 조용히 skip (route-tree 존재 시 tree_route_count 는 정직하게 보고)', () => {
  withDocs({ treeRoutes: ['/', '/(tabs)/home'], specs: [] }, (docsDir) => {
    const r = analyzeRouteCrossCheck({ docsDir });
    assert.equal(r.skipped, true);
    assert.equal(r.screen_spec_count, 0);
    assert.match(r.skip_reason, /screen-spec/);
    assert.equal(r.warning_count, 0);
    // skip 이어도 route-tree 가 존재하면 실제 토큰 수를 보고한다(하드코딩 0 아님).
    assert.equal(r.route_tree_found, true);
    assert.equal(r.tree_route_count, 2);
  });
});

test('route 없는 screen-spec 은 대조 대상이 아니다(skip 신호엔 카운트)', () => {
  withDocs(
    {
      treeRoutes: ['/'],
      specs: [
        { domain: 'home', screen: 'index', route: '/' },
        { domain: 'wip', screen: 'stub' }, // route frontmatter 없음
      ],
    },
    (docsDir) => {
      const r = analyzeRouteCrossCheck({ docsDir });
      assert.equal(r.skipped, false);
      assert.equal(r.screen_spec_count, 2); // 파일 수
      assert.equal(r.spec_route_count, 1); // route 가진 spec 만
      assert.equal(r.warning_count, 0);
    },
  );
});

test('--json 형태 — 안정 키 + 결정적 정렬', () => {
  withDocs(
    {
      treeRoutes: ['/b', '/a'], // 파일에는 정렬 안 됨
      specs: [
        { domain: 'd', screen: 's2', route: '/z' },
        { domain: 'd', screen: 's1', route: '/y' },
      ],
    },
    (docsDir) => {
      const r = analyzeRouteCrossCheck({ docsDir });
      const round = JSON.parse(JSON.stringify(r)); // JSON 직렬화 안전
      assert.equal(round.tool, 'route-cross-check');
      assert.equal(round.mode, 'warning-first');
      assert.equal(round.skipped, false);
      for (const k of [
        'route_tree',
        'route_tree_found',
        'screen_spec_count',
        'spec_route_count',
        'tree_route_count',
        'spec_not_in_tree',
        'tree_not_in_spec',
        'warning_count',
      ]) {
        assert.ok(k in round, `missing key ${k}`);
      }
      // 결정적 정렬(파일 입력 순서와 무관)
      assert.deepEqual(round.tree_not_in_spec, ['/a', '/b']);
      assert.deepEqual(round.spec_not_in_tree.map((e) => e.route), ['/y', '/z']);
      // 머신 독립 경로(docsDir 상대 posix)
      assert.equal(round.route_tree, '_meta/route-tree.txt');
    },
  );
});

test('CLI --json → exit 0 + 파싱 가능한 JSON (warning-first 종단검증)', () => {
  withDocs(
    {
      treeRoutes: ['/a'],
      specs: [{ domain: 'd', screen: 's', route: '/b' }], // 양방향 불일치
    },
    (docsDir) => {
      const r = spawnSync(process.execPath, [CLI, '--json', '--docs', docsDir], {
        encoding: 'utf8',
      });
      assert.equal(r.status, 0, r.stderr); // 항상 exit 0
      const obj = JSON.parse(r.stdout);
      assert.equal(obj.tool, 'route-cross-check');
      assert.equal(obj.skipped, false);
      assert.equal(obj.warning_count, 2);
    },
  );
});

test('CLI 기본(human) → exit 0, 경고는 stderr 로만(stdout 비어있음)', () => {
  withDocs(
    {
      treeRoutes: ['/a'],
      specs: [{ domain: 'd', screen: 's', route: '/b' }],
    },
    (docsDir) => {
      const r = spawnSync(process.execPath, [CLI, '--docs', docsDir], { encoding: 'utf8' });
      assert.equal(r.status, 0);
      assert.equal(r.stdout, ''); // 사람-읽기 경고는 stderr 로만
      assert.match(r.stderr, /WARNING: ScreenSpec route/);
    },
  );
});

test('CLI route-tree 부재 → exit 0 + skip JSON (fail-soft 종단)', () => {
  withDocs(
    {
      treeRoutes: null,
      specs: [{ domain: 'd', screen: 's', route: '/b' }],
    },
    (docsDir) => {
      const r = spawnSync(process.execPath, [CLI, '--json', '--docs', docsDir], {
        encoding: 'utf8',
      });
      assert.equal(r.status, 0);
      const obj = JSON.parse(r.stdout);
      assert.equal(obj.skipped, true);
      assert.equal(obj.warning_count, 0);
    },
  );
});
