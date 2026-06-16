#!/usr/bin/env node
// catalog-gen.mjs — component-catalog 생성기 CLI (읽기 전용 스캔, src/components/ui/** → Markdown).
// 정본(source of truth)은 src/components/ui 파일 트리다. v1 skeleton: name/source_path/export_kind/status
// 4필드만 내보내며, props/docgen/style 분석은 후속 phase. 기존 수동 component-catalog 를 아직
// 대체하지 않는다(매니페스트 plip·alias·guard 등록 없음 — source-contract §6/§7, 전부 future PR).
// 사용:
//   node scripts/catalog-gen.mjs [--src <dir>] [--out <file>] [--json] [--dry-run]
//   기본값: --src src/components/ui  --out docs/frontend-workflow/design/component-catalog.md
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, writeFile, isDir } from './lib/util.mjs';
import { buildCatalog, renderCatalog, runBarrelReconcileDiagnostic } from './lib/catalog-gen.mjs';

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const src = typeof flags.src === 'string' ? flags.src : 'src/components/ui';
  const outPath = path.resolve(
    typeof flags.out === 'string'
      ? flags.out
      : 'docs/frontend-workflow/design/component-catalog.md',
  );

  // --src 가 실재 디렉토리가 아니면(오타·잘못된 CWD) walkFiles 가 []를 돌려주고, 빈 카탈로그로
  // 기존 산출물을 덮어쓰는 사일런트 데이터 손실이 난다(util.walkFiles:isDir 가드). → 스캔·쓰기 전에
  // 입력을 검증해 exit 2(입력 오류, util.loadYamlOrExit 계약과 일치)로 끊는다. --json/--dry-run 포함.
  const srcAbs = path.resolve(src);
  if (!isDir(srcAbs)) {
    process.stderr.write(
      `workflow:catalog — --src is not a directory: ${src}\n` +
        `  (resolved: ${srcAbs})\n`,
    );
    process.exit(2);
  }

  const model = buildCatalog({ src });
  const count = model.components.length;

  // phase2-1: 배럴 ↔ 카탈로그 정합성 진단 (warning-first, stderr only — 출력 파일·exit code 불변).
  // 모든 성공 경로(--json/--dry-run/쓰기)에서 동일하게 돌며, 불일치가 없으면 아무것도 출력하지 않는다.
  runBarrelReconcileDiagnostic({ src, components: model.components }, process.stderr);

  // --json: 동일 모델을 stdout 으로 (헤더 없음, early-return — nav-graph.mjs:25-28 미러).
  if (flags.json) {
    process.stdout.write(JSON.stringify(model, null, 2) + '\n');
    return;
  }

  const text = renderCatalog(model);

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
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
