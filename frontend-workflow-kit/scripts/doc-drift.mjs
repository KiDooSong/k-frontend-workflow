#!/usr/bin/env node
// doc-drift.mjs — canonical-doc drift detector (CLI, warning-first).
//
// Phase 0 scope (default): dead Markdown heading anchors and broken relative
// links only. Phase 1 adds ONE opt-in heuristic (--include status-heuristic):
// manifest↔roadmap status wording cross-check, info-only. Issue #163 adds a
// second opt-in (--include release-consistency): narrow structural
// release/version ↔ implemented-status contradiction rules, warning-first with
// canonical_owner/fix_path on every finding and no automatic doc edits. This is
// a diagnostic surface, not a gate: findings never change the exit code, and
// this script is not wired into readiness/validate/CI required checks.
import path from 'node:path';
import { DEFAULTS, exists, parseArgs, isCliEntry } from './lib/util.mjs';
import { analyzeDocDrift, DocDriftInputError, formatDocDriftHuman } from './lib/doc-drift.mjs';

function helpText() {
  return `workflow:doc-drift — Markdown relative-link drift detector (warning-first)

Usage:
  node scripts/doc-drift.mjs [--root <dir>] [--json]
                             [--escapes-root-severity <info|warning>]
                             [--include status-heuristic] [--manifest <file>] [--roadmap <file>]
                             [--include release-consistency] [--package <file>] [--changelog <file>]
                             [--now <YYYY-MM-DD>] [--max-snapshot-age-days <n>]
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
                     info-only; findings go to info_count, never warning_count),
                     release-consistency (issue #163 release/version and
                     implemented-status contradiction rules, warning-first).
  --manifest <file>  Artifact manifest for the status heuristic.
                     Default: the kit's catalog/artifact-manifest.yaml.
                     Requires --include status-heuristic.
  --roadmap <file>   Roadmap markdown for the status heuristic and the
                     release-consistency checks.
                     Default: kit-dev/roadmap-current.md under --root (or one
                     directory above it). Requires one of the two includes.
  --package <file>   package.json for the release-consistency checks.
                     Default: package.json under --root, falling back to
                     frontend-workflow-kit/package.json under --root.
                     Requires --include release-consistency.
  --changelog <file> Changelog markdown for the release-consistency checks.
                     Default: kit-dev/CHANGELOG.md under --root (or one
                     directory above it). Requires --include release-consistency.
  --now <YYYY-MM-DD> Explicit reference date enabling the roadmap snapshot age
                     rule (no wall clock is ever read — determinism is kept).
                     Requires --include release-consistency.
  --max-snapshot-age-days <n>
                     Age threshold in days for --now (default: 30).
                     Requires --now.
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

  --include release-consistency (issue #163) additionally runs narrow structural
  release/version ↔ implemented-status contradiction rules — no semantic
  inference over free prose, no automatic doc edits:
    package-version-changelog-mismatch    package.json version vs the latest
                                          CHANGELOG release heading (a missing
                                          package version is itself a warning)
    roadmap-snapshot-stale                current roadmap 스냅샷 date vs the
                                          latest release heading date (plus the
                                          explicit --now age rule)
    script-doc-unimplemented-contradiction  an existing package script named
                                          exactly on a doc line that also says
                                          미구현/not implemented
    fixed-count-mismatch                  fixed doc counts (검사 N종 vs the
                                          validate.mjs success line — warning;
                                          스크립트/CLI N개 vs top-level
                                          scripts/*.mjs files — info-only)
  Manifest↔roadmap status (issue #163 scope item 2) stays covered by the
  existing --include status-heuristic; both includes compose.
  Rules 3/5 scan only a canonical doc allowlist (README.md, IMPLEMENTING.md,
  frontend-workflow-kit/README.md under --root, plus the roadmap); historical/
  archive docs are excluded — any allowlisted doc carrying an uppercase
  HISTORICAL marker (or 🗄) in its first lines is skipped, and prior-snapshot
  (이전 스냅샷) roadmap lines are excluded from every rule input. Every finding carries
  canonical_owner (the truth-holding file) and fix_path (the file a human should
  edit). Findings are warning-first observations: they never change the exit
  code, and this include is NOT a gate and never edits any document.

Exit codes:
  0  Always for findings (warning-first — findings are diagnostics, never a failure).
  2  Usage/input errors only (unknown --include value, invalid
     --escapes-root-severity value, opt-in flags without their include,
     missing/corrupt manifest, roadmap, package.json, or changelog for an
     explicitly requested opt-in, invalid --now or --max-snapshot-age-days).
`;
}

function usageError(message) {
  process.stderr.write(`workflow:doc-drift: ${message}\n`);
  process.stderr.write('Run with --help for usage.\n');
  process.exit(2);
}

const KNOWN_INCLUDES = ['status-heuristic', 'release-consistency'];

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

// Default package.json for release-consistency: --root itself (kit checkout),
// falling back to frontend-workflow-kit/ under --root (dev repo root).
function defaultPackagePath(rootDir) {
  const candidates = [
    path.join(rootDir, 'package.json'),
    path.join(rootDir, 'frontend-workflow-kit', 'package.json'),
  ];
  return candidates.find((candidate) => exists(candidate)) || null;
}

// Default changelog: kit-dev/CHANGELOG.md under --root or one directory above
// (same shape as defaultRoadmapPath).
function defaultChangelogPath(rootDir) {
  const candidates = [
    path.join(rootDir, 'kit-dev', 'CHANGELOG.md'),
    path.join(rootDir, '..', 'kit-dev', 'CHANGELOG.md'),
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
  const releaseEnabled = includes.includes('release-consistency');
  if (Object.prototype.hasOwnProperty.call(flags, 'manifest')) {
    if (!heuristicEnabled) {
      usageError('--manifest requires --include status-heuristic');
    }
    if (typeof flags.manifest !== 'string' || flags.manifest.trim() === '') {
      usageError('--manifest requires a file path');
    }
  }
  if (Object.prototype.hasOwnProperty.call(flags, 'roadmap')) {
    if (!heuristicEnabled && !releaseEnabled) {
      usageError('--roadmap requires --include status-heuristic or --include release-consistency');
    }
    if (typeof flags.roadmap !== 'string' || flags.roadmap.trim() === '') {
      usageError('--roadmap requires a file path');
    }
  }
  for (const name of ['package', 'changelog', 'now']) {
    if (Object.prototype.hasOwnProperty.call(flags, name)) {
      if (!releaseEnabled) {
        usageError(`--${name} requires --include release-consistency`);
      }
      if (typeof flags[name] !== 'string' || flags[name].trim() === '') {
        usageError(`--${name} requires a value`);
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(flags, 'max-snapshot-age-days')) {
    if (!Object.prototype.hasOwnProperty.call(flags, 'now')) {
      usageError('--max-snapshot-age-days requires --now');
    }
  }

  const roadmapPath = typeof flags.roadmap === 'string'
    ? path.resolve(rootDir, flags.roadmap)
    : defaultRoadmapPath(rootDir);

  let statusHeuristic = null;
  if (heuristicEnabled) {
    const manifestPath = typeof flags.manifest === 'string'
      ? path.resolve(rootDir, flags.manifest)
      : DEFAULTS.manifest;
    if (!roadmapPath) {
      usageError('status heuristic: kit-dev/roadmap-current.md not found under --root — pass --roadmap <file>');
    }
    statusHeuristic = { manifestPath, roadmapPath };
  }

  let releaseConsistency = null;
  if (releaseEnabled) {
    const packagePath = typeof flags.package === 'string'
      ? path.resolve(rootDir, flags.package)
      : defaultPackagePath(rootDir);
    const changelogPath = typeof flags.changelog === 'string'
      ? path.resolve(rootDir, flags.changelog)
      : defaultChangelogPath(rootDir);
    if (!packagePath) {
      usageError('release consistency: package.json not found under --root — pass --package <file>');
    }
    if (!changelogPath) {
      usageError('release consistency: kit-dev/CHANGELOG.md not found under --root — pass --changelog <file>');
    }
    if (!roadmapPath) {
      usageError('release consistency: kit-dev/roadmap-current.md not found under --root — pass --roadmap <file>');
    }
    let maxSnapshotAgeDays = 30;
    if (Object.prototype.hasOwnProperty.call(flags, 'max-snapshot-age-days')) {
      const raw = flags['max-snapshot-age-days'];
      maxSnapshotAgeDays = Number(raw);
      if (!Number.isInteger(maxSnapshotAgeDays) || maxSnapshotAgeDays <= 0) {
        usageError(`--max-snapshot-age-days must be a positive integer of days (got: ${raw === true ? '(none)' : raw})`);
      }
    }
    releaseConsistency = {
      packagePath,
      changelogPath,
      roadmapPath,
      now: typeof flags.now === 'string' ? flags.now : null,
      maxSnapshotAgeDays,
    };
  }

  let report;
  try {
    report = analyzeDocDrift({ rootDir, statusHeuristic, releaseConsistency, escapesRootSeverity });
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
