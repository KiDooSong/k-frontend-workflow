// route-core.test.mjs — route-tree 어댑터 솔기(core vs adapter discovery) 회귀 테스트 (node:test, 의존성 0).
//   고정하는 불변식:
//     S1: 기본 expo-router 어댑터의 discover() 가 이전 scanAppDir 과 동치(seam 이 발견 동작을 안 바꿈).
//     S2: expo-router 경로 렌더가 커밋된 route-tree 골든과 byte-identical(seam 이 출력을 안 바꿈).
//     S3: 커스텀 {module} 어댑터를 코어가 해소·렌더(어댑터=발견, 코어=결정성 — 비-expo 어댑터도 동작).
//     S4: fail-closed — 미지 어댑터 이름·version 불일치·discover 부재는 RouterAdapterError throw(FC-1/3).
// 실행: npm run test:spec  (또는 node --test scripts/lib/route-core.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import {
  loadRouterAdapter,
  renderRouteTree,
  normalizeRouteTree,
  RouterAdapterError,
  CORE_ROUTER_ADAPTER_VERSION,
} from './route-core.mjs';
import { scanAppDir, discover as expoDiscover } from '../adapters/routers/expo-router.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)); // scripts/lib
const KIT_ROOT = path.resolve(HERE, '..', '..'); // frontend-workflow-kit
const BASIC_APP = path.join(KIT_ROOT, 'examples', 'route-tree', 'basic-app');
const CUSTOM = path.join(KIT_ROOT, 'examples', 'router-adapter', 'minimal-custom');

test('S1: expo-router 어댑터 discover() 는 scanAppDir 과 동치 (seam 이 발견 동작을 안 바꾼다)', async () => {
  const appDir = path.join(BASIC_APP, 'src', 'app');
  const adapter = await loadRouterAdapter('expo-router');
  assert.equal(adapter.name, 'expo-router');
  assert.equal(adapter.version, CORE_ROUTER_ADAPTER_VERSION);
  assert.deepEqual(adapter.discover({ appDir }), scanAppDir(appDir));
});

test('S2: expo-router 경로 렌더가 커밋된 route-tree 골든과 byte-identical', async () => {
  const appDir = path.join(BASIC_APP, 'src', 'app');
  const adapter = await loadRouterAdapter('expo-router');
  const text = renderRouteTree(adapter.discover({ appDir }), {
    source: 'src/app/**',
    command: 'node scripts/route-tree.mjs --app src/app --out docs/frontend-workflow/_meta/route-tree.txt',
  });
  const golden = fs.readFileSync(path.join(BASIC_APP, 'expected', 'route-tree.txt'), 'utf8');
  // 골든은 LF 로 커밋돼 있고 렌더도 LF 만 쓴다(무타임스탬프) — 정규화 없이 직접 비교.
  assert.equal(text.replace(/\r\n/g, '\n'), golden.replace(/\r\n/g, '\n'));
});

test('S3: 커스텀 {module} 어댑터를 코어가 해소·렌더 (비-expo 어댑터도 동작)', async () => {
  const adapter = await loadRouterAdapter(
    { module: path.join(CUSTOM, 'my-router.mjs') },
    { baseDir: KIT_ROOT },
  );
  assert.equal(adapter.name, 'minimal-custom');
  const text = renderRouteTree(adapter.discover({}), {
    source: 'custom: minimal-custom adapter (code-defined routes)',
    command: 'node scripts/route-tree.mjs --router examples/router-adapter/minimal-custom/my-router.mjs',
  });
  const golden = fs.readFileSync(path.join(CUSTOM, 'expected', 'route-tree.txt'), 'utf8');
  assert.equal(text.replace(/\r\n/g, '\n'), golden.replace(/\r\n/g, '\n'));
});

test('S4: fail-closed — 미지 어댑터 이름은 RouterAdapterError', async () => {
  await assert.rejects(() => loadRouterAdapter('no-such-router'), RouterAdapterError);
});

test('S4: fail-closed — version 불일치 어댑터는 RouterAdapterError (조용한 통과 금지)', async () => {
  const bad = { name: 'bad', version: CORE_ROUTER_ADAPTER_VERSION + 99, discover: () => [] };
  await assert.rejects(() => loadRouterAdapter(bad), RouterAdapterError);
});

test('S4: fail-closed — discover 없는 어댑터/잘못된 spec 은 RouterAdapterError', async () => {
  await assert.rejects(() => loadRouterAdapter({ version: 1 }), RouterAdapterError);
  await assert.rejects(() => loadRouterAdapter(42), RouterAdapterError);
});

test('S5: 코어가 결정성을 소유한다 — 미정렬 어댑터 트리도 정규화(파일 먼저·이름순·재귀)', () => {
  // 어댑터가 비결정적(미정렬) 순서로 발견해도 코어가 결정적 순서로 정렬한다.
  const messy = [
    { name: 'blog', isDir: true, children: [
      { name: 'index.tsx', isDir: false, route: '/blog' },
      { name: '[slug].tsx', isDir: false, route: '/blog/[slug]' },
    ] },
    { name: 'index.tsx', isDir: false, route: '/' },
    { name: 'about.tsx', isDir: false, route: '/about' },
  ];
  const norm = normalizeRouteTree(messy);
  // 최상위: 파일(about, index) 먼저, 그 다음 디렉토리(blog).
  assert.deepEqual(norm.map((n) => n.name), ['about.tsx', 'index.tsx', 'blog']);
  // 재귀: blog children 도 이름순 정렬([slug] < index).
  assert.deepEqual(norm[2].children.map((n) => n.name), ['[slug].tsx', 'index.tsx']);
  // 순수성: 입력 배열은 변형되지 않는다.
  assert.equal(messy[0].name, 'blog');
});

test('S5: renderRouteTree 는 입력 순서와 무관히 결정적(미정렬==정렬 출력)', () => {
  const sorted = [
    { name: 'about.tsx', isDir: false, route: '/about' },
    { name: 'index.tsx', isDir: false, route: '/' },
    { name: 'blog', isDir: true, children: [{ name: '[slug].tsx', isDir: false, route: '/blog/[slug]' }] },
  ];
  const shuffled = [sorted[2], sorted[1], sorted[0]];
  assert.equal(renderRouteTree(shuffled, {}), renderRouteTree(sorted, {}));
});

test('S6: expo-router discover 는 부재 app 디렉토리에 fail-closed(throw) — CLI 가 exit 2 로 처리', () => {
  // 어댑터가 입력 요구를 검증한다(FC-5: 빈 트리 추측 금지). CLI 는 src/app 존재를 미리 강제하지 않는다.
  assert.throws(() => expoDiscover({ appDir: path.join(KIT_ROOT, '__no_such_app_dir__') }), /app 디렉토리/);
  // 존재하는 디렉토리는 scanAppDir 과 동치(S1 과 정합).
  const appDir = path.join(BASIC_APP, 'src', 'app');
  assert.deepEqual(expoDiscover({ appDir }), scanAppDir(appDir));
});
