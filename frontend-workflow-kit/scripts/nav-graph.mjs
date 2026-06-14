#!/usr/bin/env node
// nav-graph.mjs — 화면 간 내비게이션 그래프 생성기 (읽기 전용)
// screen-spec.md ## Interaction Matrix(Result 컬럼) + app/navigation-map.md 를 읽어
// _meta/nav-graph.yaml(top-level: screens, routes)을 생성한다. ScreenSpec 은 절대 수정하지 않는다.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parseArgs,
  DEFAULTS,
  emitGeneratedYaml,
  writeFile,
} from './lib/util.mjs';
import { buildNavGraph } from './lib/nav-graph.mjs';

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const docsDir = path.resolve(flags.docs || DEFAULTS.docs);
  // --out 은 단일 출력 파일. 생략 시 <docs>/_meta/nav-graph.yaml.
  const outPath = flags.out
    ? path.resolve(flags.out)
    : path.join(docsDir, '_meta', 'nav-graph.yaml');

  const graph = buildNavGraph({ docsDir });

  if (flags.json) {
    process.stdout.write(JSON.stringify(graph, null, 2) + '\n');
    return;
  }

  // 생성물 헤더 — validate 검사 6 이 /GENERATED FILE\s+—\s+DO NOT EDIT/(em-dash) 를 grep 하므로 글자 고정.
  const yaml = emitGeneratedYaml(
    [
      'GENERATED FILE — DO NOT EDIT',
      'Source: domains/**/screen-spec.md Interaction Matrix + app/navigation-map.md',
      'Command: node scripts/nav-graph.mjs --docs docs/frontend-workflow',
    ],
    graph,
  );
  writeFile(outPath, yaml); // writeFile 이 _meta 디렉토리를 recursive 로 생성한다

  const screenCount = Object.keys(graph.screens).length;
  const routeCount = Object.keys(graph.routes).length;
  process.stdout.write(
    `workflow:nav-graph — ${screenCount} screen(s), ${routeCount} route(s)\n` +
      `  wrote ${path.relative(process.cwd(), outPath)}\n`,
  );
}

// 직접 실행될 때만 main() (import 시 부작용 없음 — buildNavGraph 재사용 가능)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
