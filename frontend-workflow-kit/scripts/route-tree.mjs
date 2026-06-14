#!/usr/bin/env node
// route-tree 생성기 CLI — Expo Router src/app 파일 트리를 스캔해 결정적 route-tree.txt 를 생성한다.
// 정본(source of truth)은 src/app 파일 트리다. ScreenSpec 은 입력이 아니다(교차검증은 후속 PR).
// 사용:
//   node scripts/route-tree.mjs [--app <dir>] [--out <file>]
//   기본값: --app src/app  --out docs/frontend-workflow/_meta/route-tree.txt
import path from 'node:path';
import { parseArgs, writeFile, isDir } from './lib/util.mjs';
import { scanAppDir, renderRouteTree } from './lib/route-tree.mjs';

const { flags } = parseArgs(process.argv.slice(2));
const appDir = path.resolve(typeof flags.app === 'string' ? flags.app : 'src/app');
const outFile = path.resolve(
  typeof flags.out === 'string' ? flags.out : 'docs/frontend-workflow/_meta/route-tree.txt',
);

if (!isDir(appDir)) {
  process.stderr.write('workflow:route-tree — app 디렉토리를 찾을 수 없음: ' + appDir + '\n');
  process.exit(2);
}

const tree = scanAppDir(appDir);
const text = renderRouteTree(tree, {
  source: 'src/app/**',
  command: 'node scripts/route-tree.mjs --app src/app --out docs/frontend-workflow/_meta/route-tree.txt',
});
writeFile(outFile, text);
process.stdout.write('workflow:route-tree — ' + outFile + ' 생성 완료\n');
