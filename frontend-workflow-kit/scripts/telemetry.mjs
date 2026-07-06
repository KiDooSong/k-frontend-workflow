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
  listTelemetrySurfaces,
  stableTelemetryJson,
  TELEMETRY_SURFACE_GROUPS,
  writeTelemetryLedger,
} from './lib/telemetry.mjs';

function helpText() {
  return `workflow:telemetry - aggregate warning-first observation surfaces

Usage:
  node scripts/telemetry.mjs [--docs <dir>] [--root <dir>] [--json] [--out <file>] [--check <file>] [--determinism-runs <n>]
                             [--include <group>] [--surface <surface-id>] [--src <dir>]
                             [--visual-domain <d>] [--visual-screen <ID[,ID...]>] [--visual-contract <path>]
                             [--skip-visual-bootstrap] [--skip-visual-consistency] [--list-surfaces] [--help]

Options:
  --root <dir>             Root passed to doc-drift. Default: current working directory.
  --docs <dir>             Docs root passed to route-cross-check. Default: docs/frontend-workflow.
                           Relative docs paths resolve below --root.
  --json                   Print deterministic JSON to stdout.
  --out <file>             Write a deterministic observation ledger JSON snapshot.
  --check <file>           Compare current telemetry to a ledger and warn on drift.
  --determinism-runs <n>   Surface runs for ledger determinism witness.
                           Default: 1, or 2 with --out/--check.
  --include <group>        Add an opt-in surface group (comma-separated ok).
                           Groups: default (no-op, always on), visual, all.
                           "all" currently means default+visual and may grow as
                           future groups are added.
  --surface <surface-id>   Add one opt-in surface on top of the default surfaces
                           (comma-separated ok). --surface never replaces the
                           default surfaces; it is additive, like --include.
  --src <dir>              Source root forwarded to visual surfaces only.
                           Default: src. Without visual surfaces it has no effect.
  --visual-domain <d>      Forwarded to visual CLIs as --domain. Requires visual surfaces.
  --visual-screen <IDs>    Forwarded to visual CLIs as --screen. Requires visual surfaces.
  --visual-contract <p>    Forwarded to visual CLIs as --contract. Requires visual surfaces.
  --skip-visual-bootstrap  Exclude visual-contract-bootstrap from included visual surfaces.
  --skip-visual-consistency Exclude visual-consistency from included visual surfaces.
  --list-surfaces          Print the surface registry (no child CLI runs) and exit 0.
  --help                   Show this help.

Behavior:
  By default calls route-cross-check, doc-drift, and readiness-eval through their
  public --json CLIs when available, records unavailable surfaces instead of
  failing, includes readiness-eval blocking mismatch count, and always exits 0
  except usage errors. Visual surfaces (visual-consistency,
  visual-contract-bootstrap) run only with an explicit --include/--surface opt-in;
  they are observed through their public --json output only - telemetry never
  writes bootstrap drafts (--out/--format markdown are never forwarded) and never
  touches the canonical visual contract. Visual warnings/findings are observations,
  not a gate, approval, readiness promotion, or confirmed promotion, and never
  cause exit 1.
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

function parseListFlag(flags, name, label) {
  if (!hasFlag(flags, name)) return [];
  const value = flags[name];
  if (typeof value !== 'string' || value.trim() === '') {
    usageError(`--${name} requires a ${label}`);
  }
  return value.split(',').map((item) => item.trim()).filter((item) => item !== '');
}

function parseValueFlag(flags, name, label) {
  if (!hasFlag(flags, name)) return undefined;
  const value = flags[name];
  if (typeof value !== 'string' || value.trim() === '') {
    usageError(`--${name} requires a ${label}`);
  }
  return value;
}

const KNOWN_GROUPS = [...TELEMETRY_SURFACE_GROUPS, 'all'];

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    process.stdout.write(helpText());
    process.exit(0);
  }

  const registry = listTelemetrySurfaces();

  if (flags['list-surfaces']) {
    if (hasFlag(flags, 'out') || hasFlag(flags, 'check')) {
      usageError('--list-surfaces cannot be combined with --out or --check');
    }
    if (flags.json) {
      process.stdout.write(`${JSON.stringify({ tool: 'workflow:telemetry', surfaces: registry }, null, 2)}\n`);
    } else {
      const lines = ['workflow:telemetry surfaces:'];
      for (const surface of registry) {
        lines.push(`  ${surface.surface_id} [${surface.groups.join(', ')}] - ${surface.source_tool}`);
      }
      process.stdout.write(lines.join('\n') + '\n');
    }
    process.exit(0);
  }

  const includeGroups = parseListFlag(flags, 'include', 'group name');
  for (const group of includeGroups) {
    if (!KNOWN_GROUPS.includes(group)) {
      usageError(`unknown --include group: ${group} (known: ${KNOWN_GROUPS.join(', ')})`);
    }
  }
  const includeSurfaces = parseListFlag(flags, 'surface', 'surface id');
  const knownIds = registry.map((surface) => surface.surface_id);
  for (const id of includeSurfaces) {
    if (!knownIds.includes(id)) {
      usageError(`unknown --surface id: ${id} (known: ${knownIds.join(', ')})`);
    }
  }

  const visualIds = registry
    .filter((surface) => surface.groups.includes('visual'))
    .map((surface) => surface.surface_id);
  const visualRequested = includeGroups.some((group) => group === 'visual' || group === 'all')
    || includeSurfaces.some((id) => visualIds.includes(id));

  const skipSurfaces = [];
  if (flags['skip-visual-bootstrap']) skipSurfaces.push('visual-contract-bootstrap');
  if (flags['skip-visual-consistency']) skipSurfaces.push('visual-consistency');

  const visualDomain = parseValueFlag(flags, 'visual-domain', 'domain');
  const visualScreen = parseValueFlag(flags, 'visual-screen', 'screen id list');
  const visualContract = parseValueFlag(flags, 'visual-contract', 'contract path');
  if (!visualRequested) {
    for (const name of ['visual-domain', 'visual-screen', 'visual-contract', 'skip-visual-bootstrap', 'skip-visual-consistency']) {
      if (hasFlag(flags, name)) {
        usageError(`--${name} requires visual surfaces (--include visual or --surface visual-...)`);
      }
    }
  }

  const rootDir = typeof flags.root === 'string' && flags.root
    ? path.resolve(flags.root)
    : process.cwd();
  const docsDir = typeof flags.docs === 'string' && flags.docs
    ? flags.docs
    : DEFAULTS.docs;
  const srcDir = typeof flags.src === 'string' && flags.src
    ? flags.src
    : DEFAULTS.src;
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

  const collectOpts = {
    rootDir,
    docsDir,
    includeGroups,
    includeSurfaces,
    skipSurfaces,
    srcDir,
    visual: {
      domain: visualDomain,
      screen: visualScreen,
      contract: visualContract,
    },
  };
  const report = wantsOut || wantsCheck
    ? collectTelemetryLedger({ ...collectOpts, determinismRuns })
    : collectTelemetry(collectOpts);

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
