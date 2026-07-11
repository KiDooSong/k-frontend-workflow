#!/usr/bin/env node
// redteam.mjs - warning-first adversarial/reward-hacking observation report.
//
// Consumes the existing tools (computeReadiness, the ScreenSpec parser, the
// forbidden-paths CLI) and committed fixtures to produce a deterministic
// red-team matrix. It adds no gate: red-team findings, observed gaps, and
// tampering observations NEVER exit 1 - only usage/config errors exit 2.
import { DEFAULTS, parseArgs, isCliEntry } from './lib/util.mjs';
import {
  collectRedteamReport,
  formatRedteamHuman,
  REDTEAM_KNOWN_INCLUDES,
} from './lib/redteam.mjs';

function helpText() {
  return `workflow:redteam - adversarial observation matrix (warning-first)

Usage:
  node scripts/redteam.mjs [--json] [--docs <dir>] [--src <dir>]
                           [--include <group>] [--case <id>] [--help]

Options:
  --json             Print the deterministic JSON report to stdout.
  --docs <dir>       Docs root. Default: ${DEFAULTS.docs}. Accepted for interface
                     consistency; current cases run against synthetic specs and
                     committed kit fixtures only, so the report stays
                     deterministic regardless of the consumer repo.
  --src <dir>        Source root. Default: ${DEFAULTS.src}. Same reservation as --docs.
  --include <group>  Add an opt-in case group (comma-separated ok).
                     Groups: ${REDTEAM_KNOWN_INCLUDES.join(', ')}.
                     core (readiness + path-backstop + downgrade) always runs;
                     golden-tampering and self-resolve are opt-in; all adds every
                     group.
  --case <id>        Run only the matching case id(s) (comma-separated ok).
                     Overrides group selection; unknown ids are usage errors.
  --help             Show this help.

Behavior:
  Produces a warning-first observation report over adversarial red-team cases:
  readiness fail-closed witnesses (malformed Open Decisions / malformed policy
  requirements), forbidden-paths diff-backstop witnesses (committed adversarial
  fixtures only - never a live git diff), the D->U downgrade current-gap
  observation, and the self-resolve provenance-gap observation.

  status is an observation label, not a pass/fail verdict:
    blocked / fail-closed / input-error record an existing defense witnessing the
    adversarial input; drift-detected records pinned behavior changing;
    observed-gap means "a real current gap - needs a HUMAN design decision", not
    failure; skipped records controls or fixtures unavailable in this install.
  Top-level ok:true only means this report was produced.

  No gate is added: nothing here resolves/confirms decisions, closes Unknowns,
  accepts Component Gaps, applies visual contracts, promotes readiness, or wires
  --enforce into CI. Unknown/U stays non-blocking by design.

Exit codes:
  0  Always for observation results - including observed gaps and tampering
     observations (warning-first).
  2  Usage/config errors only (unknown flag/group/case id, empty flag values).
`;
}

function usageError(message) {
  process.stderr.write(`workflow:redteam: ${message}\n`);
  process.stderr.write('Run with --help for usage.\n');
  process.exit(2);
}

const KNOWN_FLAGS = ['help', 'json', 'docs', 'src', 'include', 'case'];

function hasFlag(flags, name) {
  return Object.prototype.hasOwnProperty.call(flags, name);
}

function parseListFlag(flags, name, label) {
  if (!hasFlag(flags, name)) return [];
  const value = flags[name];
  if (typeof value !== 'string' || value.trim() === '') {
    usageError(`--${name} requires a ${label}`);
  }
  const items = value.split(',').map((item) => item.trim()).filter((item) => item !== '');
  // Comma-only values (e.g. ",") are empty lists in disguise - a usage error,
  // not a silent no-op.
  if (items.length === 0) {
    usageError(`--${name} requires a ${label}`);
  }
  return items;
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    process.stdout.write(helpText());
    return; // help 도 자연 종료(exit 0) — process.exit(0) 금지 계약(cli-stdout-flush.test.mjs)
  }

  for (const name of Object.keys(flags)) {
    if (!KNOWN_FLAGS.includes(name)) {
      usageError(`unknown flag: --${name} (known: ${KNOWN_FLAGS.map((f) => `--${f}`).join(', ')})`);
    }
  }
  for (const name of ['docs', 'src']) {
    if (hasFlag(flags, name) && (typeof flags[name] !== 'string' || flags[name].trim() === '')) {
      usageError(`--${name} requires a directory path`);
    }
  }

  const includeGroups = parseListFlag(flags, 'include', 'group name');
  const caseIds = parseListFlag(flags, 'case', 'case id');

  let report;
  try {
    report = collectRedteamReport({ includeGroups, caseIds });
  } catch (err) {
    usageError(err.message);
  }

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatRedteamHuman(report).join('\n') + '\n');
  }

  // process.exit() 금지(stdout pipe 8KB flush) — readiness-eval.mjs 의 flush-safe 자연 종료 계약.
  process.exitCode = 0;
}

if (isCliEntry(import.meta.url)) main();
