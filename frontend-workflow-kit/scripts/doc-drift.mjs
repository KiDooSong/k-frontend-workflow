#!/usr/bin/env node
// doc-drift.mjs — canonical-doc drift detector (CLI, warning-first).
//
// Phase 0 scope (default): dead Markdown heading anchors and broken relative
// links only. Phase 1 adds ONE opt-in heuristic (--include status-heuristic):
// manifest↔roadmap status wording cross-check, info-only. This is a diagnostic
// surface, not a gate: findings never change the exit code, and this script is
// not wired into readiness/validate/CI required checks.
import path from 'node:path';
import { DEFAULTS, exists, parseArgs, isCliEntry } from './lib/util.mjs';
import { analyzeDocDrift, DocDriftInputError, formatDocDriftHuman } from './lib/doc-drift.mjs';

function helpText() {
  return `workflow:doc-drift — Markdown relative-link drift detector (warning-first)

Usage:
  node scripts/doc-drift.mjs [--root <dir>] [--json]
                             [--escapes-root-severity <info|warning>]
                             [--include status-heuristic] [--manifest <file>] [--roadmap <file>]
                             [--help]

Options:
  --root <dir>       Root to scan. Default: current working directory.
  --json             Print a deterministic JSON report to stdout.
  --escapes-root-severity <info|warning>
                     Severity for relative links that resolve outside the scan
                     root (check: relative-link-escapes-root). Default: info,
                     because such targets cannot be verified under the scan
                     root; pass warning to opt into promotion.
  --include <check>  Enable an opt-in check (comma-separated ok).
                     Known: status-heuristic (manifest↔roadmap status wording,
                     info-only; findings go to info_count, never warning_count).
  --manifest <file>  Artifact manifest for the status heuristic.
                     Default: the kit's catalog/artifact-manifest.yaml.
                     Requires --include status-heuristic.
  --roadmap <file>   Roadmap markdown for the status heuristic.
                     Default: kit-dev/roadmap-current.md under --root (or one
                     directory above it). Requires --include status-heuristic.
  --help             Show this help.

Behavior:
  Scans .md files below root, skipping node_modules, .git, hidden directories, and
  dist/build-style output directories. Checks inline Markdown links and image links.
  Skips external URLs and reference-style links. Fenced code blocks, inline code
  spans, backslash-escaped brackets (\\[label](target)), and autolinks
  (<http://...>) are ignored, so link-shaped examples in prose are never scanned
  as links.

  Phase 0 (default) only reports missing relative target files and dead Markdown
  heading anchors. It does not check semantic drift, roadmap/changelog PR ranges,
  external URL reachability, or duplicate document copies.

  GitHub-style line anchors #L12 / #L12-L14 are treated as line references, not
  heading anchors (the target file's existence is still checked). Bare
  non-path-like bracket notation such as [label](annotation) is reported as
  info (check: ambiguous-non-link-bracket-notation) for manual review instead of
  a broken-relative-link warning. Relative links escaping the scan root are info
  by default because they cannot be verified under the scan root
  (--escapes-root-severity warning promotes them). Info findings go to
  info_count, never warning_count, and never change the exit code.

  --include status-heuristic additionally cross-checks artifact-manifest status
  fields (active/planned) against roadmap wording on the same line (완료/active/
  implemented/구현됨 vs planned/예정/대기). This is a narrow keyword heuristic for
  manual review only: findings are severity "info", counted in info_count and never
  in warning_count, and are NOT a gate and NOT a semantic-truth/semantic-drift
  claim. Lines with both signal kinds (e.g. "planned → active") are skipped.

Exit codes:
  0  Always for findings (warning-first — findings are diagnostics, never a failure).
  2  Usage/input errors only (unknown --include value, invalid
     --escapes-root-severity value, heuristic flags without the opt-in,
     missing/corrupt manifest or roadmap for the explicitly requested
     status heuristic).
`;
}

function usageError(message) {
  process.stderr.write(`workflow:doc-drift: ${message}\n`);
  process.stderr.write('Run with --help for usage.\n');
  process.exit(2);
}

const KNOWN_INCLUDES = ['status-heuristic'];

function parseIncludes(flags) {
  if (!Object.prototype.hasOwnProperty.call(flags, 'include')) return [];
  const value = flags.include;
  if (typeof value !== 'string' || value.trim() === '') {
    usageError('--include requires a check name');
  }
  const includes = value.split(',').map((item) => item.trim()).filter((item) => item !== '');
  for (const include of includes) {
    if (!KNOWN_INCLUDES.includes(include)) {
      usageError(`unknown --include value: ${include} (known: ${KNOWN_INCLUDES.join(', ')})`);
    }
  }
  return includes;
}

// Default roadmap: kit-dev/roadmap-current.md under --root, falling back to one
// directory above (kit checkout inside the dev repo). Existence-based and stable
// per checkout; when neither exists the explicitly requested heuristic is an
// input error, not a silent skip.
function defaultRoadmapPath(rootDir) {
  const candidates = [
    path.join(rootDir, 'kit-dev', 'roadmap-current.md'),
    path.join(rootDir, '..', 'kit-dev', 'roadmap-current.md'),
  ];
  return candidates.find((candidate) => exists(candidate)) || null;
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    process.stdout.write(helpText());
    process.exit(0);
  }

  const rootDir = typeof flags.root === 'string' && flags.root
    ? path.resolve(flags.root)
    : process.cwd();

  let escapesRootSeverity = 'info';
  if (Object.prototype.hasOwnProperty.call(flags, 'escapes-root-severity')) {
    const value = flags['escapes-root-severity'];
    if (value !== 'info' && value !== 'warning') {
      usageError(`--escapes-root-severity must be info or warning (got: ${value === true ? '(none)' : value})`);
    }
    escapesRootSeverity = value;
  }

  const includes = parseIncludes(flags);
  const heuristicEnabled = includes.includes('status-heuristic');
  for (const name of ['manifest', 'roadmap']) {
    if (Object.prototype.hasOwnProperty.call(flags, name)) {
      if (!heuristicEnabled) {
        usageError(`--${name} requires --include status-heuristic`);
      }
      if (typeof flags[name] !== 'string' || flags[name].trim() === '') {
        usageError(`--${name} requires a file path`);
      }
    }
  }

  let statusHeuristic = null;
  if (heuristicEnabled) {
    const manifestPath = typeof flags.manifest === 'string'
      ? path.resolve(rootDir, flags.manifest)
      : DEFAULTS.manifest;
    const roadmapPath = typeof flags.roadmap === 'string'
      ? path.resolve(rootDir, flags.roadmap)
      : defaultRoadmapPath(rootDir);
    if (!roadmapPath) {
      usageError('status heuristic: kit-dev/roadmap-current.md not found under --root — pass --roadmap <file>');
    }
    statusHeuristic = { manifestPath, roadmapPath };
  }

  let report;
  try {
    report = analyzeDocDrift({ rootDir, statusHeuristic, escapesRootSeverity });
  } catch (err) {
    if (err instanceof DocDriftInputError) {
      usageError(err.message);
    }
    throw err;
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    const lines = formatDocDriftHuman(report);
    process.stderr.write(lines.join('\n') + '\n');
  }

  process.exit(0);
}

if (isCliEntry(import.meta.url)) main();
