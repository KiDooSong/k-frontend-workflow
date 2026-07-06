#!/usr/bin/env node
// telemetry.mjs - warning-first aggregation of observation CLI JSON.
//
// This CLI can write/check deterministic observation ledgers, but it creates no
// CI artifact by default and makes no promotion verdict.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULTS, parseArgs } from './lib/util.mjs';
import {
  collectTelemetry,
  collectTelemetryLedger,
  compareTelemetryLedger,
  formatTelemetryHuman,
  stableTelemetryJson,
  writeTelemetryLedger,
} from './lib/telemetry.mjs';

function helpText() {
  return `workflow:telemetry - aggregate warning-first observation surfaces

Usage:
  node scripts/telemetry.mjs [--docs <dir>] [--root <dir>] [--json] [--out <file>] [--check <file>] [--determinism-runs <n>] [--help]

Options:
  --root <dir>             Root passed to doc-drift. Default: current working directory.
  --docs <dir>             Docs root passed to route-cross-check. Default: docs/frontend-workflow.
                           Relative docs paths resolve below --root.
  --json                   Print deterministic JSON to stdout.
  --out <file>             Write a deterministic observation ledger JSON snapshot.
  --check <file>           Compare current telemetry to a ledger and warn on drift.
  --determinism-runs <n>   Surface runs for ledger determinism witness.
                           Default: 1, or 2 with --out/--check.
  --help                   Show this help.

Behavior:
  Calls route-cross-check, doc-drift, and readiness-eval through their public
  --json CLIs when available, records unavailable surfaces instead of failing,
  includes readiness-eval blocking mismatch count, and always exits 0 except
  usage errors.
  Top-level ok:true means this telemetry command produced an observation report;
  it is not a pass/fail verdict about any observed surface.
  --check drift, missing files, and invalid JSON are warnings only. No CI artifact,
  threshold, pass/fail verdict, duration, timestamp, or absolute machine path is
  emitted. --out and --check are intentionally not combined in this release.
`;
}

function parseDeterminismRuns(value, fallback) {
  if (value == null) return fallback;
  if (value === true) return null;
  const text = String(value).trim();
  if (!/^[1-9]\d*$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : null;
}

function hasFlag(flags, name) {
  return Object.prototype.hasOwnProperty.call(flags, name);
}

function usageError(message) {
  process.stderr.write(`workflow:telemetry: ${message}\n`);
  process.stderr.write('Run with --help for usage.\n');
  process.exit(2);
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
  const wantsOut = hasFlag(flags, 'out');
  const wantsCheck = hasFlag(flags, 'check');

  if (wantsOut && (typeof flags.out !== 'string' || flags.out.length === 0)) {
    usageError('--out requires a file path');
  }
  if (wantsCheck && (typeof flags.check !== 'string' || flags.check.length === 0)) {
    usageError('--check requires a file path');
  }
  if (wantsOut && wantsCheck) {
    usageError('--out and --check cannot be used together in this release');
  }

  const determinismFallback = wantsOut || wantsCheck ? 2 : 1;
  const determinismRuns = parseDeterminismRuns(flags['determinism-runs'], determinismFallback);
  if (determinismRuns == null) usageError('--determinism-runs must be a positive integer');

  const report = wantsOut || wantsCheck
    ? collectTelemetryLedger({ rootDir, docsDir, determinismRuns })
    : collectTelemetry({ rootDir, docsDir });

  if (wantsOut) writeTelemetryLedger({ outPath: flags.out, report, rootDir });

  let outputReport = report;
  if (wantsCheck) {
    const check = compareTelemetryLedger({ filePath: flags.check, report, rootDir });
    outputReport = {
      ...report,
      check,
    };
    if (!flags.json && check.warning_count > 0) {
      for (const finding of check.findings) {
        process.stderr.write(`workflow:telemetry warning-first: ${check.status} ${finding.path} - ${finding.reason}\n`);
      }
    }
  }

  if (flags.json) {
    const json = wantsOut || wantsCheck
      ? stableTelemetryJson(outputReport)
      : `${JSON.stringify(outputReport, null, 2)}\n`;
    process.stdout.write(json);
  } else {
    process.stdout.write(formatTelemetryHuman(outputReport).join('\n') + '\n');
  }

  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
