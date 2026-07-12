#!/usr/bin/env node
// route-tree 생성기 CLI — router 어댑터로 라우트 트리를 *발견* 하고, route-core 가 결정적 route-tree.txt 로 *렌더* 한다.
// 정본(source of truth)은 라우트 엔트리 파일 트리다. ScreenSpec 은 입력이 아니다(교차검증은 후속 PR).
// 경계: 어댑터=발견, 코어=정규화/렌더/쓰기(temp/proposals/tier2-router-codegen-adapter.md §5·§6).
// 사용:
//   node scripts/route-tree.mjs [--app <dir>] [--out <file>] [--router <name|module-path>]
//   기본값: --app src/app  --out docs/frontend-workflow/_meta/route-tree.txt  --router expo-router
//   기본 expo-router 어댑터는 이전 scanAppDir 동작과 동치 → route-tree.txt 골든 byte-identical.
import path from 'node:path';
import { parseArgs, writeFile, isCliEntry } from './lib/util.mjs';
import { enforceCliFlagContract } from './lib/cli-args.mjs';
import { loadRouterAdapter, renderRouteTree } from './lib/route-core.mjs';

const VALUE_FLAGS = new Set(['app', 'out', 'router']);
const BOOLEAN_FLAGS = new Set(['help']);

function printHelp() {
  process.stdout.write(`workflow:route-tree — discover routes through a router adapter and render route-tree.txt

Usage:
  node scripts/route-tree.mjs [--app <dir>] [--out <file>] [--router <name|module-path>]

Options:
  --app <dir>                  Route entry directory (default: src/app)
  --out <file>                 Output file (default: docs/frontend-workflow/_meta/route-tree.txt)
  --router <name|module-path>  Router adapter name or module path (default: expo-router)
  --help                       Show this help and exit without scanning or writing

Boundary:
  The adapter discovers routes only; route-core owns normalization and rendering.
  Unknown or missing adapters remain usage/input errors.

Exit codes:
  0  help or generation completed
  2  usage, input, or adapter error
`);
}

async function main() {
  const { flags, positionals } = parseArgs(process.argv.slice(2));
  enforceCliFlagContract({
    flags,
    positionals,
    valueFlags: VALUE_FLAGS,
    booleanFlags: BOOLEAN_FLAGS,
    tool: 'workflow:route-tree',
    helpCommand: 'node scripts/route-tree.mjs',
  });
  if (flags.help) {
    printHelp();
    return;
  }

  const appDir = path.resolve(typeof flags.app === 'string' ? flags.app : 'src/app');
  const outFile = path.resolve(
    typeof flags.out === 'string' ? flags.out : 'docs/frontend-workflow/_meta/route-tree.txt',
  );
  // router 어댑터 선택: 내장 이름(매니페스트 조회) 또는 커스텀 모듈 경로. 기본 = expo-router.
  // 이름-vs-경로 분류는 loadRouterAdapter 가 한다(매니페스트 이름 우선 → 아니면 파일 경로) — CLI 휴리스틱 없음.
  const routerArg = typeof flags.router === 'string' && flags.router ? flags.router : 'expo-router';

  // fail-closed: 미지 어댑터/부재 모듈/version 불일치는 exit 2(조용한 폴백·빈 트리 추측 금지).
  let adapter;
  try {
    adapter = await loadRouterAdapter(routerArg, { baseDir: process.cwd() });
  } catch (e) {
    process.stderr.write('workflow:route-tree — router 어댑터 로드 실패: ' + e.message + '\n');
    process.exit(2);
  }

  // 어댑터는 발견만. 입력 디렉토리 요구 여부는 어댑터가 검증한다(예: expo-router 는 부재 src/app 에 throw — FC-5).
  // CLI 는 src/app 존재를 미리 강제하지 않으므로, 디렉토리가 필요 없는 코드 정의 커스텀 어댑터도 막히지 않는다.
  // 정렬/렌더/쓰기는 코어가 한다(어댑터=발견, 코어=결정성).
  let tree;
  try {
    tree = adapter.discover({ appDir });
  } catch (e) {
    process.stderr.write('workflow:route-tree — ' + e.message + '\n');
    process.exit(2);
  }
  // GENERATED 헤더: 기본 expo-router 는 정본(canonical) 문자열 그대로(골든 byte-identical).
  // 커스텀 router 면 헤더가 실제 사용한 어댑터를 정직하게 반영한다(오해 소지 제거 — 기본 경로는 불변).
  const isDefaultExpo = routerArg === 'expo-router';
  const header = isDefaultExpo
    ? {
        source: 'src/app/**',
        command: 'node scripts/route-tree.mjs --app src/app --out docs/frontend-workflow/_meta/route-tree.txt',
      }
    : {
        source: 'router-adapter: ' + routerArg,
        command: 'node scripts/route-tree.mjs --router ' + routerArg + ' --out docs/frontend-workflow/_meta/route-tree.txt',
      };
  const text = renderRouteTree(tree, header);
  writeFile(outFile, text);
  process.stdout.write('workflow:route-tree — ' + outFile + ' 생성 완료\n');
}

// 직접 실행될 때만 main() — import 는 adapter load/discovery/scan/write 를 수행하지 않는다.
// top-level await 로 async main 의 expected/unexpected 오류 의미(exit 2/1)를 그대로 보존한다.
if (isCliEntry(import.meta.url)) await main();
