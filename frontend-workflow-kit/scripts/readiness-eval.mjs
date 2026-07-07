#!/usr/bin/env node
// readiness-eval.mjs - labeled readiness measurement CLI (warning-first).
//
// This command reports readiness label-vs-actual metrics. Metric mismatches are
// observations, never exit-code failures.
import path from 'node:path';
import { parseArgs, isCliEntry } from './lib/util.mjs';
import {
  DEFAULT_EVAL_CASES_PATH,
  formatEvalHuman,
  runReadinessEval,
} from './lib/readiness-eval.mjs';

function helpText() {
  return `workflow:eval - measure readiness labels against computeReadiness (warning-first)

Usage:
  node scripts/readiness-eval.mjs [--cases <file>] [--json] [--help]

Options:
  --cases <file>  Labeled cases JSON. Default: scripts/lib/readiness-eval-cases.json.
  --json          Print deterministic JSON to stdout.
  --help          Show this help.

Behavior:
  Loads labeled cases, consumes computeReadiness, and reports exact-match,
  false_open, false_closed, fail-closed leakage, and blocking-kind mismatch
  metrics. Metric results never cause exit 1. Malformed cases files and CLI
  usage errors exit 2.
  No timestamp, duration, absolute machine path, temp path, verdict, threshold,
  CI artifact, or ledger write is emitted.
`;
}

const ALLOWED_FLAGS = new Set(['cases', 'json', 'help']);

function usageError(message) {
  process.stderr.write(`workflow:eval: ${message}\n`);
  process.stderr.write('Try `node scripts/readiness-eval.mjs --help`.\n');
  process.exit(2);
}

function main() {
  const { flags, positionals } = parseArgs(process.argv.slice(2));
  for (const flag of Object.keys(flags)) {
    if (!ALLOWED_FLAGS.has(flag)) usageError(`unknown option --${flag}`);
  }
  if (positionals.length > 0) usageError('positional arguments are not supported');
  if (flags.help) {
    process.stdout.write(helpText());
    process.exit(0);
  }
  if (flags.cases === true) usageError('--cases requires a file path');

  const casesPath = typeof flags.cases === 'string'
    ? path.resolve(flags.cases)
    : DEFAULT_EVAL_CASES_PATH;

  let report;
  try {
    report = runReadinessEval({ casesPath });
  } catch (err) {
    if (err?.name === 'EvalCasesError') {
      process.stderr.write(`workflow:eval: ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stderr.write(formatEvalHuman(report).join('\n') + '\n');
  }

  process.exit(0);
}

if (isCliEntry(import.meta.url)) main();
