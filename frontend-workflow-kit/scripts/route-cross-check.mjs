#!/usr/bin/env node
// route-cross-check.mjs — ScreenSpec route ↔ route-tree.txt EXACT 교차검증 (CLI, warning-first).
//
// OD-4 = (A) 별도 warning-only 도구. ScreenSpec frontmatter `route` 집합과 어댑터 rawPath 투영인
//   route-tree.txt 의 `route: <token>` 집합을 EXACT(정규화 없음)로 양방향 대조해 불일치를 경고로만
//   알린다. **항상 exit 0**(warning-first). validate/nav-graph/route-tree 에 결합하지 않으며(§10(10b)·
//   NG-1), 어댑터도 직접 import 하지 않는다(산출물 2개만 읽음). 게이트가 아니라 진단이다.
//
// 설계: temp/proposals/tier2-router-codegen-adapter.md §6·§10·§11(OD-4/OD-8).
//   단계 보고: temp/runs/tier2-route-cross-check-001.md. 로직: scripts/lib/route-cross-check.mjs.
//
// 사용:
//   node scripts/route-cross-check.mjs [--docs <dir>] [--json]
//
// 옵션:
//   --docs <dir>  문서 루트(기본 docs/frontend-workflow). <docs>/_meta/route-tree.txt 와
//                 <docs>/domains/**/screen-spec.md 를 읽는다.
//   --json        기계가독 JSON 리포트를 stdout 으로(lint-baseline --json 미러). 기본은 사람-읽기
//                 경고를 stderr 로(component-catalog phase2-1 reconcile 진단 미러).
//   --help        도움말.
//
// 동작: ScreenSpec route 집합 ↔ route-tree route token 집합을 EXACT 양방향 대조, 각각 라벨.
//   route-tree.txt 부재 또는 screen-spec 0건이면 조용히 skip(검사 13 동형). 첫 슬라이스는 route
//   차원만 — nav 차원·codegen output↔docs 차원은 후속.
//
// 후속(의도적 보류): nav-graph 라우트 drift 차원(같은 도구가 담당, nav-graph 생성기엔 결합 안 함),
//   codegen output↔docs 차원, CI/required check/hard gate/`--enforce`/exit 1 승격(별도 결정 PR).
//   v1 은 warning-first 만 — exit 0 고정.
//
// exit code:
//   0  항상(warning-first — 불일치/skip 과 무관하게 0). 게이트가 아니라 진단이라 exit 1/2 로 올리지 않는다.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, DEFAULTS } from './lib/util.mjs';
import { analyzeRouteCrossCheck, formatRouteCrossCheckHuman } from './lib/route-cross-check.mjs';

function helpText() {
  return `route-cross-check — ScreenSpec route <-> route-tree.txt EXACT cross-check (warning-first)

Usage:
  node scripts/route-cross-check.mjs [--docs <dir>] [--json]

Options:
  --docs <dir>  Docs root. Default: docs/frontend-workflow.
                Reads <docs>/_meta/route-tree.txt and <docs>/domains/**/screen-spec.md.
  --json        Print a machine-readable JSON report to stdout (lint-baseline --json mirror).
                Default prints human-readable warnings to stderr.
  --help        Show this help.

Behavior:
  Compares the ScreenSpec frontmatter \`route\` set against the \`route: <token>\` set in
  route-tree.txt - EXACT string match (no normalization), both directions, each labeled.
  Mismatches are warnings only. ALWAYS exits 0 (warning-first). route-tree.txt absent or
  0 screen-specs -> quietly skipped. Does NOT couple to validate/nav-graph/route-tree, and
  does NOT import the router adapter (reads the two committed artifacts only).

Exit codes:
  0  Always (warning-first - mismatches are diagnostics, never a failure).
`;
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    process.stdout.write(helpText());
    process.exit(0);
  }

  const docsDir = path.resolve(typeof flags.docs === 'string' ? flags.docs : DEFAULTS.docs);
  const report = analyzeRouteCrossCheck({ docsDir });

  if (flags.json) {
    // 안정적 JSON(stdout) — lint-baseline.mjs:133-135 emitJson 미러.
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    // 사람-읽기 경고는 stderr 로(stdout 은 비워 둬 파이프라인 친화). 불일치 없으면 ok/skip 한 줄.
    const lines = formatRouteCrossCheckHuman(report);
    if (lines.length) process.stderr.write(lines.join('\n') + '\n');
  }

  // warning-first — 불일치/skip 무관하게 항상 0. 진단 도구라 게이트로 올리지 않는다(NG: exit 1 승격 금지).
  process.exit(0);
}

// 직접 실행될 때만 main() (import 시 부작용 없음 — 테스트가 lib 를 직접 소비; nav-graph.mjs 가드 미러).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
