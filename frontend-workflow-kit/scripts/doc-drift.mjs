#!/usr/bin/env node
// doc-drift.mjs — Phase 0 canonical-doc drift detector (CLI, warning-first).
//
// Scope: dead Markdown heading anchors and broken relative links only. This is a
// diagnostic surface, not a gate: findings never change the exit code, and this
// script is not wired into readiness/validate/CI required checks.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from './lib/util.mjs';
import { analyzeDocDrift, formatDocDriftHuman } from './lib/doc-drift.mjs';

function helpText() {
  return `workflow:doc-drift — Phase 0 Markdown relative-link drift detector (warning-first)

Usage:
  node scripts/doc-drift.mjs [--root <dir>] [--json] [--help]

Options:
  --root <dir>  Root to scan. Default: current working directory.
  --json        Print a deterministic JSON report to stdout.
  --help        Show this help.

Behavior:
  Scans .md files below root, skipping node_modules, .git, hidden directories, and
  dist/build-style output directories. Checks inline Markdown links and image links.
  Skips external URLs and reference-style links. Fenced code blocks are ignored.

  Phase 0 only reports missing relative target files and dead Markdown heading
  anchors. It does not check semantic drift, manifests, roadmap/changelog PR ranges,
  external URL reachability, or duplicate document copies.

Exit codes:
  0  Always (warning-first - findings are diagnostics, never a failure).
`;
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
  const report = analyzeDocDrift({ rootDir });

  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    const lines = formatDocDriftHuman(report);
    process.stderr.write(lines.join('\n') + '\n');
  }

  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
