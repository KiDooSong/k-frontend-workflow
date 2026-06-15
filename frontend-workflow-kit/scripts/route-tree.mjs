#!/usr/bin/env node
// route-tree 생성기 CLI — router 어댑터로 라우트 트리를 *발견* 하고, route-core 가 결정적 route-tree.txt 로 *렌더* 한다.
// 정본(source of truth)은 라우트 엔트리 파일 트리다. ScreenSpec 은 입력이 아니다(교차검증은 후속 PR).
// 경계: 어댑터=발견, 코어=정규화/렌더/쓰기(temp/proposals/tier2-router-codegen-adapter.md §5·§6).
// 사용:
//   node scripts/route-tree.mjs [--app <dir>] [--out <file>] [--router <name|module-path>]
//   기본값: --app src/app  --out docs/frontend-workflow/_meta/route-tree.txt  --router expo-router
//   기본 expo-router 어댑터는 이전 scanAppDir 동작과 동치 → route-tree.txt 골든 byte-identical.
import path from 'node:path';
import { parseArgs, writeFile, isDir } from './lib/util.mjs';
import { loadRouterAdapter, renderRouteTree } from './lib/route-core.mjs';

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const appDir = path.resolve(typeof flags.app === 'string' ? flags.app : 'src/app');
  const outFile = path.resolve(
    typeof flags.out === 'string' ? flags.out : 'docs/frontend-workflow/_meta/route-tree.txt',
  );
  // router 어댑터 선택: 내장 이름(매니페스트 조회) 또는 커스텀 모듈 경로. 기본 = expo-router.
  // 경로 형태(구분자 포함 또는 .mjs/.js/.cjs 확장자)면 {module} 로, 아니면 매니페스트 이름으로 해석한다.
  const routerArg = typeof flags.router === 'string' && flags.router ? flags.router : 'expo-router';
  const looksLikePath = /[\\/]/.test(routerArg) || /\.(mjs|cjs|js)$/.test(routerArg);
  const routerSpec = looksLikePath ? { module: routerArg } : routerArg;

  if (!isDir(appDir)) {
    process.stderr.write('workflow:route-tree — app 디렉토리를 찾을 수 없음: ' + appDir + '\n');
    process.exit(2);
  }

  // fail-closed: 미지 어댑터/부재 모듈/version 불일치는 exit 2(조용한 폴백·빈 트리 추측 금지).
  let adapter;
  try {
    adapter = await loadRouterAdapter(routerSpec, { baseDir: process.cwd() });
  } catch (e) {
    process.stderr.write('workflow:route-tree — router 어댑터 로드 실패: ' + e.message + '\n');
    process.exit(2);
  }

  // 어댑터는 발견만. 정렬/렌더/쓰기는 코어가 한다.
  const tree = adapter.discover({ appDir });
  const text = renderRouteTree(tree, {
    source: 'src/app/**',
    command: 'node scripts/route-tree.mjs --app src/app --out docs/frontend-workflow/_meta/route-tree.txt',
  });
  writeFile(outFile, text);
  process.stdout.write('workflow:route-tree — ' + outFile + ' 생성 완료\n');
}

main();
