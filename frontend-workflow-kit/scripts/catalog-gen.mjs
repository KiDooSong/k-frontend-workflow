#!/usr/bin/env node
// catalog-gen.mjs — component-catalog 생성기 CLI (읽기 전용 스캔, {roles.ui_primitive} → Markdown).
// 정본(source of truth)은 resolvedLayout.roles.ui_primitive 파일 트리다. v1 skeleton: name/source_path/export_kind/status
// 4필드만 내보내며, props/docgen/style 분석은 후속 phase. 기존 수동 component-catalog 를 아직
// 대체하지 않는다(매니페스트 plip·alias·guard 등록 없음 — source-contract §6/§7, 전부 future PR).
// 사용:
//   node scripts/catalog-gen.mjs [--src <dir>] [--out <file>] [--layout <file>] [--json] [--dry-run]
//   기본값: --src src  --out docs/frontend-workflow/design/component-catalog.md
import path from 'node:path';
import { parseArgs, writeFile, isDir, KIT_ROOT, runCli, projectRootOf, isCliEntry } from './lib/util.mjs';
import { enforceCliFlagContract } from './lib/cli-args.mjs';
import { loadLayoutProfile } from './lib/layout-profile.mjs';
import {
  buildCatalog,
  catalogCommandSrc,
  catalogSourceConfig,
  renderCatalog,
  runBarrelReconcileDiagnostic,
} from './lib/catalog-gen.mjs';

const VALUE_FLAGS = new Set(['src', 'out', 'layout', 'root']);
const BOOLEAN_FLAGS = new Set(['json', 'dry-run', 'help']);

function printHelp() {
  process.stdout.write(`workflow:catalog — generate the component catalog from the resolved UI primitive source tree

Usage:
  npm run workflow:catalog -- [--src <dir>] [--out <file>] [--root <dir>] [--layout <file>] [--json] [--dry-run]

Options:
  --src <dir>      Source root (default: src)
  --out <file>     Markdown output (default: docs/frontend-workflow/design/component-catalog.md)
  --root <dir>     Project root used to resolve layout role globs
  --layout <file>  Project layout profile override
  --json           Print the catalog model to stdout; never write an output file
  --dry-run        Preview rendered Markdown on stdout; never write an output file
  --help           Show this help and exit without loading layout, scanning, or writing

Boundary:
  Barrel reconciliation is a warning-first diagnostic.
  This command never edits live policy or manifests.

Exit codes:
  0  help, preview, or generation completed
  2  usage, input, or configuration error
`);
}

function toPosixPath(p) {
  return p.split(path.sep).join('/');
}

function relativeFrom(root, abs) {
  const rel = path.relative(root, abs);
  return toPosixPath(rel || '.');
}

function main() {
  const argv = process.argv.slice(2);
  const { flags, positionals } = parseArgs(argv);
  enforceCliFlagContract({
    argv,
    flags,
    positionals,
    valueFlags: VALUE_FLAGS,
    booleanFlags: BOOLEAN_FLAGS,
    tool: 'workflow:catalog',
    helpCommand: 'npm run workflow:catalog --',
  });
  if (flags.help) {
    printHelp();
    return;
  }

  const src = typeof flags.src === 'string' ? flags.src : 'src';
  const outPath = path.resolve(
    typeof flags.out === 'string'
      ? flags.out
      : 'docs/frontend-workflow/design/component-catalog.md',
  );
  const layout = loadLayoutProfile({ kitRoot: KIT_ROOT, flags });

  // --src 가 실재 디렉토리가 아니면(오타·잘못된 CWD) walkFiles 가 []를 돌려주고, 빈 카탈로그로
  // 기존 산출물을 덮어쓰는 사일런트 데이터 손실이 난다(util.walkFiles:isDir 가드). → 스캔·쓰기 전에
  // 입력을 검증해 exit 2(입력 오류, util.loadYamlOrExit 계약과 일치)로 끊는다. --json/--dry-run 포함.
  const srcAbs = path.resolve(src);
  const projectRoot = typeof flags.root === 'string' && flags.root ? projectRootOf(srcAbs, flags) : null;
  if (!isDir(srcAbs)) {
    process.stderr.write(
      `workflow:catalog — --src is not a directory: ${src}\n` +
        `  (resolved: ${srcAbs})\n`,
    );
    process.exit(2);
  }

  const model = buildCatalog({ src, layout, projectRoot });
  const sourceConfig = catalogSourceConfig({ src, layout, projectRoot });
  const commandLayout =
    typeof flags.layout === 'string' ? relativeFrom(sourceConfig.projectRoot, path.resolve(flags.layout)) : null;
  const count = model.components.length;

  // phase2-1: 배럴 ↔ 카탈로그 정합성 진단 (warning-first, stderr only — 출력 파일·exit code 불변).
  // 모든 성공 경로(--json/--dry-run/쓰기)에서 동일하게 돌며, 불일치가 없으면 아무것도 출력하지 않는다.
  runBarrelReconcileDiagnostic({ src, layout, projectRoot, components: model.components }, process.stderr);

  // --json: 동일 모델을 stdout 으로 (헤더 없음, early-return — nav-graph.mjs:25-28 미러).
  if (flags.json) {
    process.stdout.write(JSON.stringify(model, null, 2) + '\n');
    return;
  }

  const commandSrc = catalogCommandSrc(model, { fallback: relativeFrom(sourceConfig.projectRoot, srcAbs) });
  const text = renderCatalog(model, { commandSrc, commandLayout });

  // --dry-run: 파일을 쓰지 않고 렌더 결과를 stdout 으로 미리보기 (--out 미변경).
  if (flags['dry-run']) {
    process.stdout.write(text);
    process.stderr.write(
      `workflow:catalog — DRY RUN — ${count} component(s), would write ${path.relative(process.cwd(), outPath)}\n`,
    );
    return;
  }

  writeFile(outPath, text); // writeFile 이 출력 디렉토리를 recursive 로 생성한다
  process.stdout.write(
    `workflow:catalog — ${count} component(s)\n` +
      `  wrote ${path.relative(process.cwd(), outPath)}\n`,
  );
}

// 직접 실행될 때만 main() (import 시 부작용 없음 — buildCatalog/renderCatalog 재사용 가능)
if (isCliEntry(import.meta.url)) runCli(main, 'workflow:catalog');
