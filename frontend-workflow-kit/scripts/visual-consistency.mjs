#!/usr/bin/env node
// visual-consistency.mjs — cross-screen visual contract 대조 (CLI, warning-first).
//
// visual-consistency-contract 를 ScreenSpec · figma-component-mapping · component-catalog ·
// (선택) screen_entry 소스와 대조해 multi-screen visual drift 후보를 경고로만 낸다.
// 게이트가 아니다 — warning 은 approval/readiness/confirmed 승격이 아니며, CI/required check/
// hard gate 배선은 별도 Open Decision 없이 하지 않는다(route-cross-check/lint-baseline 동형).
//
// 계약 정본: docs/reference/visual-reconciliation.md. 로직: scripts/lib/visual-consistency.mjs.
//
// 사용:
//   node scripts/visual-consistency.mjs [--docs <dir>] [--src <dir>] [--domain <d>] [--screen <ID>]
//                                       [--contract <path>] [--json] [--out <path>] [--enforce]
//
// 옵션:
//   --docs <dir>      문서 루트(기본 docs/frontend-workflow).
//   --src <dir>       선택. 소스 루트. 없으면 소스 검사(직접 import·positioning·copy)를 skip 한다.
//                     screen_entry 힌트는 프로젝트 루트(= dirname(src)) 상대다.
//   --domain <d>      선택. 해당 도메인 화면을 포함하는 family 로 범위를 좁힌다.
//   --screen <ID>     선택. 해당 canonical Screen ID 를 포함하는 family/finding 만 본다.
//   --contract <path> 선택. contract 경로 override (기본 <docs>/design/visual-consistency-contract.md).
//   --json            기계가독 JSON 리포트를 stdout 으로 (결정적 — 정렬 고정·타임스탬프 없음).
//   --out <path>      선택. 같은 JSON payload 를 파일로도 쓴다 (요청 시에만 — 기본 미출력).
//   --enforce         선택. warning 을 exit 1 로 승격 (lint-baseline/forbidden-paths 동형).
//                     이 플래그를 CI/validate 에 배선하는 것은 이 도구의 계약 밖이다.
//   --help            도움말.
//
// exit code:
//   0  기본 (warning/info 만 있으면 0 — warning-first).
//   1  구조 오류(error: docs 부재·contract malformed) 또는 --enforce + warning 존재.
//   2  (예약) 설정 오류 — runCli/LayoutConfigError 계열. 이 도구는 현재 쓰지 않는다.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, DEFAULTS, writeFile } from './lib/util.mjs';
import {
  analyzeVisualConsistency,
  formatVisualConsistencyHuman,
} from './lib/visual-consistency.mjs';

function helpText() {
  return `visual-consistency — cross-screen visual contract check (warning-first)

Usage:
  node scripts/visual-consistency.mjs [--docs <dir>] [--src <dir>] [--domain <d>] [--screen <ID>]
                                      [--contract <path>] [--json] [--out <path>] [--enforce]

Options:
  --docs <dir>      Docs root. Default: docs/frontend-workflow.
  --src <dir>       Optional source root. Without it, source heuristics
                    (direct import / ad-hoc positioning / hardcoded copy) are skipped.
  --domain <d>      Optional. Narrow to families containing screens of this domain.
  --screen <ID>     Optional. Narrow to families/findings for this canonical screen id.
  --contract <path> Optional contract path override.
                    Default: <docs>/design/visual-consistency-contract.md.
  --json            Print a deterministic machine-readable JSON report to stdout.
                    Default prints human-readable findings to stderr.
  --out <path>      Optionally also write the JSON payload to a file.
  --enforce         Promote warnings to exit 1 (do NOT wire this into CI/validate
                    without a separate human decision).
  --help            Show this help.

Behavior:
  Reads the visual consistency contract and cross-checks Screen Families members
  against ScreenSpec screen_ids, figma-component-mapping coverage, Shared Component
  Rules against the component catalog (missing => Component Gap candidate, proposal
  only), forbidden direct screen imports / ad-hoc positioning near shell-owned
  components (heuristic), hardcoded copy candidates (info), and Visual Exception
  hygiene (Reason + Decision ID required). No contract => quiet skip (cold start is
  never blocked). Warnings are diagnostics, never approval or readiness promotion.

Exit codes:
  0  Default (warnings/infos only - warning-first).
  1  Structural errors (docs missing / malformed contract), or --enforce with warnings.
`;
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    process.stdout.write(helpText());
    process.exit(0);
  }

  const docsDir = path.resolve(typeof flags.docs === 'string' ? flags.docs : DEFAULTS.docs);
  const srcDir = typeof flags.src === 'string' ? path.resolve(flags.src) : null;
  const contractPath =
    typeof flags.contract === 'string' ? path.resolve(flags.contract) : null;

  const report = analyzeVisualConsistency({
    docsDir,
    srcDir,
    contractPath,
    domain: typeof flags.domain === 'string' ? flags.domain : null,
    screen: typeof flags.screen === 'string' ? flags.screen : null,
  });

  const json = JSON.stringify(report, null, 2) + '\n';
  if (typeof flags.out === 'string') writeFile(path.resolve(flags.out), json);

  if (flags.json) {
    // 안정적 JSON(stdout) — route-cross-check/lint-baseline emitJson 미러.
    process.stdout.write(json);
  } else {
    // 사람-읽기 출력은 stderr 로 (stdout 은 비워 둬 파이프라인 친화).
    const lines = formatVisualConsistencyHuman(report);
    if (lines.length) process.stderr.write(lines.join('\n') + '\n');
  }

  const errors = report.summary ? report.summary.errors : 0;
  const warnings = report.summary ? report.summary.warnings : 0;
  if (errors > 0) process.exit(1); // 구조 자체가 깨진 경우만 기본 exit 1
  if (flags.enforce && warnings > 0) process.exit(1); // opt-in 승격 — CI 배선은 이 PR 범위 밖
  process.exit(0); // warning-first 기본
}

// 직접 실행될 때만 main() (import 시 부작용 없음 — 테스트가 lib 를 직접 소비).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
