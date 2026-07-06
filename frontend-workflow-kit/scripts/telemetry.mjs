#!/usr/bin/env node
// telemetry.mjs - stdout-only warning-first aggregation of observation CLI JSON.
//
// This MVP writes no ledger, creates no CI artifact, and makes no promotion
// verdict. It only summarizes public CLI warning counts and availability.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULTS, parseArgs } from './lib/util.mjs';
import { collectTelemetry, formatTelemetryHuman } from './lib/telemetry.mjs';

function helpText() {
  return `workflow:telemetry - aggregate warning-first observation surfaces

Usage:
  node scripts/telemetry.mjs [--docs <dir>] [--root <dir>] [--json] [--help]

Options:
  --root <dir>  Root passed to doc-drift. Default: current working directory.
  --docs <dir>  Docs root passed to route-cross-check. Default: docs/frontend-workflow.
                Relative docs paths resolve below --root.
  --json        Print deterministic JSON to stdout.
  --help        Show this help.

Behavior:
  Calls route-cross-check, doc-drift, and readiness-eval through their public
  --json CLIs when available, records unavailable surfaces instead of failing,
  includes readiness-eval blocking mismatch count, and always exits 0.
  Top-level ok:true means this telemetry command produced an observation report;
  it is not a pass/fail verdict about any observed surface.
  No ledger file, CI artifact, threshold, pass/fail verdict, duration, timestamp,
  or absolute machine path is emitted.
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
  const docsDir = typeof flags.docs === 'string' && flags.docs
    ? flags.docs
    : DEFAULTS.docs;

  const report = collectTelemetry({ rootDir, docsDir });

  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(formatTelemetryHuman(report).join('\n') + '\n');
  }

  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
