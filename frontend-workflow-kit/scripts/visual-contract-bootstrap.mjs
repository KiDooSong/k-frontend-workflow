#!/usr/bin/env node
// visual-contract-bootstrap.mjs — visual consistency contract 도입 후보 초안 (CLI, review-only).
//
// consumer repo 의 docs/src 를 scan 해 screen family 후보 · shared shell/logo/header/CTA
// ownership 후보 · figma mapping coverage · component gap 후보 · suggested contract rows 를
// **review-only draft** 로 낸다. PR144 `workflow:visual-consistency` 의 도입(adoption) 보조 도구다.
// 게이트가 아니다 — 후보는 approval/readiness/confirmed 승격이 아니며, 기존 canonical contract 를
// 절대 overwrite 하지 않는다. --apply / --overwrite / --enforce 는 의도적으로 없고,
// 알 수 없는 옵션은 조용히 무시하지 않고 exit 1 로 거부한다 (review-only 경계 보호).
//
// 계약 정본: docs/reference/visual-reconciliation.md §Bootstrap / adoption.
// 로직: scripts/lib/visual-contract-bootstrap.mjs.
//
// 사용:
//   node scripts/visual-contract-bootstrap.mjs [--docs <dir>] [--src <dir>] [--domain <d>]
//                                              [--screen <ID[,ID...]>] [--contract <path>]
//                                              [--json] [--format json|markdown] [--out <path>]
//
// 옵션:
//   --docs <dir>       문서 루트(기본 docs/frontend-workflow). 부재 시 구조 오류(exit 1).
//   --src <dir>        선택. 소스 루트. 없으면 소스 휴리스틱(shared import·logo·CTA·copy)을 skip 한다.
//                      screen_entry 힌트는 프로젝트 루트(= dirname(src)) 상대다.
//                      명시했는데 디렉토리가 아니면 source-not-found warning 으로 표면화한다.
//   --domain <d>       선택. 해당 도메인 화면만 본다.
//   --screen <ID[,..]> 선택. 해당 canonical Screen ID 만 본다 (콤마로 여러 개).
//   --contract <path>  선택. 기존 contract 경로 override (기본 <docs>/design/visual-consistency-contract.md).
//   --json             기계가독 JSON 리포트를 stdout 으로 (결정적 — 정렬 고정·타임스탬프 없음).
//                      --format 보다 우선한다.
//   --format <f>       json | markdown. markdown 은 review-only draft 문서를 렌더한다.
//   --out <path>       선택. draft/report 를 파일로 쓴다 (--out 없으면 파일을 쓰지 않는다).
//                      --out 만 있고 --json/--format 이 없으면 markdown draft 를 쓴다.
//                      기존 canonical contract 경로를 가리키면 **거부**하고 draft 경로를 제안한다
//                      (canonical 경로 scaffold 는 파일이 없을 때 + markdown 일 때만 허용).
//   --help             도움말.
//
// exit code:
//   0  기본 (warning/info 만 있으면 0 — warning-first).
//   1  구조 오류(docs 부재 · 기존 contract malformed · canonical contract overwrite 시도 · 잘못된 --format).
import path from 'node:path';
import { parseArgs, DEFAULTS, exists, writeFile, isCliEntry } from './lib/util.mjs';
import {
  analyzeVisualContractBootstrap,
  renderBootstrapMarkdown,
  formatBootstrapHuman,
} from './lib/visual-contract-bootstrap.mjs';

function helpText() {
  return `visual-contract-bootstrap — visual consistency contract adoption draft (review-only)

Usage:
  node scripts/visual-contract-bootstrap.mjs [--docs <dir>] [--src <dir>] [--domain <d>]
                                             [--screen <ID[,ID...]>] [--contract <path>]
                                             [--json] [--format json|markdown] [--out <path>]

Options:
  --docs <dir>       Docs root. Default: docs/frontend-workflow. Missing docs is a
                     structural error (exit 1).
  --src <dir>        Optional source root. Without it, source heuristics (shared
                     shell/logo/header/CTA imports, ad-hoc positioning, hardcoded copy)
                     are skipped. A given non-directory --src surfaces a
                     source-not-found warning instead of a silent skip.
  --domain <d>       Optional. Only screens of this domain.
  --screen <ID[,..]> Optional. Only these canonical screen ids (comma-separated).
  --contract <path>  Optional existing contract path override.
                     Default: <docs>/design/visual-consistency-contract.md.
  --json             Print a deterministic machine-readable JSON report to stdout
                     (takes precedence over --format).
  --format <f>       json | markdown. markdown renders the review-only draft document.
  --out <path>       Optionally write the draft/report to a file. With --out and no
                     --json/--format, a markdown draft is written. If --out points at an
                     EXISTING canonical contract the command refuses and suggests a
                     .draft.md path — the canonical contract is never overwritten.
  --help             Show this help.

Behavior:
  Scans ScreenSpec frontmatter (domain/screen_id/route/screen_entry/status),
  figma-component-mapping coverage, the component catalog, and (optional) screen_entry
  sources; proposes candidate screen families, shared shell/logo/header/CTA ownership
  candidates, component gap candidates (proposal only), and suggested contract rows.
  Everything is a review-only draft: no file is modified unless --out is given, an
  existing contract yields suggested additions only, candidate rows keep needs-review
  values, and nothing is promoted to confirmed. No ScreenSpec => exit 0 with a
  "no screens discovered" report. There is no --apply/--overwrite/--enforce; unknown
  options are rejected with exit 1 instead of being silently ignored.

Exit codes:
  0  Default (warnings/infos only - review-only, warning-first).
  1  Structural errors (docs missing / malformed existing contract / refusing to
     overwrite the canonical contract / invalid --format / unknown option).
`;
}

// 허용 옵션 allowlist — 알 수 없는 옵션은 조용히 무시하지 않고 거부한다. 특히
// --apply/--overwrite/--enforce 는 "붙였는데 아무 일도 안 일어나는" 오해를 막기 위해
// review-only 경계를 명시하며 exit 1 한다 (manual review boundary 보호).
const ALLOWED_FLAGS = new Set([
  'help', 'docs', 'src', 'domain', 'screen', 'contract', 'json', 'format', 'out',
]);
const REVIEW_ONLY_REJECTED_FLAGS = new Set(['apply', 'overwrite', 'enforce']);

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    process.stdout.write(helpText());
    return; // help 도 자연 종료(exit 0) — process.exit(0) 금지 계약(cli-stdout-flush.test.mjs)
  }

  for (const key of Object.keys(flags)) {
    if (ALLOWED_FLAGS.has(key)) continue;
    if (REVIEW_ONLY_REJECTED_FLAGS.has(key)) {
      process.stderr.write(
        `visual-contract-bootstrap: --${key} 는 지원하지 않는다 — 이 도구는 review-only draft 만 만든다. ` +
          'canonical contract 반영은 사람이 리뷰 후 수동으로만 한다.\n',
      );
    } else {
      process.stderr.write(`visual-contract-bootstrap: unknown option --${key} (--help 참조)\n`);
    }
    process.exit(1);
  }

  const docsDir = path.resolve(typeof flags.docs === 'string' ? flags.docs : DEFAULTS.docs);
  const srcDir = typeof flags.src === 'string' ? path.resolve(flags.src) : null;
  const contractPath =
    typeof flags.contract === 'string' ? path.resolve(flags.contract) : null;
  const outPath = typeof flags.out === 'string' ? path.resolve(flags.out) : null;
  const screens =
    typeof flags.screen === 'string'
      ? flags.screen.split(',').map((s) => s.trim()).filter(Boolean)
      : null;

  // 출력 포맷: --json 우선 > --format > (--out 이 있으면 markdown draft) > human(stderr).
  let format = 'human';
  if (typeof flags.format === 'string') {
    if (flags.format !== 'json' && flags.format !== 'markdown') {
      process.stderr.write(
        `visual-contract-bootstrap: 알 수 없는 --format '${flags.format}' — json|markdown 중 하나여야 함.\n`,
      );
      process.exit(1);
    }
    format = flags.format;
  }
  if (flags.json) format = 'json';
  if (format === 'human' && outPath) format = 'markdown';

  // canonical contract overwrite 가드 — 분석 전에 거부한다 (draft-only 불변식).
  const canonicalContract = contractPath || path.join(docsDir, 'design', 'visual-consistency-contract.md');
  if (outPath && path.resolve(outPath) === path.resolve(canonicalContract)) {
    if (exists(outPath)) {
      const suggested = path.join(path.dirname(outPath), 'visual-consistency-contract.draft.md');
      process.stderr.write(
        `visual-contract-bootstrap: --out 이 기존 canonical contract 를 가리킴 — overwrite 거부.\n` +
          `  기존 contract 는 사람이 리뷰 후 수동으로만 갱신한다. draft 경로를 쓰세요: ${suggested}\n`,
      );
      process.exit(1);
    }
    if (format !== 'markdown') {
      process.stderr.write(
        'visual-contract-bootstrap: canonical contract 경로 scaffold 는 markdown draft 만 허용 (--format markdown).\n',
      );
      process.exit(1);
    }
  }

  const report = analyzeVisualContractBootstrap({
    docsDir,
    srcDir,
    contractPath,
    domain: typeof flags.domain === 'string' ? flags.domain : null,
    screens,
  });

  const payload =
    format === 'json' ? JSON.stringify(report, null, 2) + '\n' : renderBootstrapMarkdown(report);

  // 구조 오류가 있으면 draft 파일을 만들지 않는다 (깨진 입력으로 만든 draft 는 review 대상이 아니다).
  const wroteOut = Boolean(outPath && report.ok);
  if (wroteOut) writeFile(outPath, payload);

  if (format === 'json') {
    process.stdout.write(payload); // 결정적 JSON (route-cross-check/visual-consistency emitJson 미러)
  } else if (format === 'markdown' && !outPath) {
    process.stdout.write(payload); // draft 를 stdout 으로 (파이프/리다이렉트 친화)
  } else {
    const lines = formatBootstrapHuman(report);
    if (wroteOut) lines.push(`  draft written: ${path.relative(process.cwd(), outPath) || outPath}`);
    if (lines.length) process.stderr.write(lines.join('\n') + '\n');
  }

  // process.exit() 금지(stdout pipe 8KB flush) — readiness-eval.mjs 의 flush-safe 자연 종료 계약.
  process.exitCode = report.summary.errors > 0 ? 1 : 0;
}

// 직접 실행될 때만 main() (import 시 부작용 없음 — 테스트가 lib 를 직접 소비).
if (isCliEntry(import.meta.url)) main();
