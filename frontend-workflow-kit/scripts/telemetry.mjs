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
                             [--skip-visual-bootstrap] [--skip-visual-consistency]
                             [--adoption-run <dir>] [--adoption-summary <file>] [--skip-adoption-visual]
                             [--redteam-include <group[,group...]>] [--redteam-case <id[,id...]>]
                             [--doc-drift-include <feature>]
                             [--list-surfaces] [--help]

Options:
  --root <dir>             Root passed to doc-drift. Default: current working directory.
  --docs <dir>             Docs root passed to route-cross-check. Default: docs/frontend-workflow.
                           Relative docs paths resolve below --root.
  --json                   Print deterministic JSON to stdout.
  --out <file>             Write a deterministic observation ledger JSON snapshot.
  --check <file>           Compare current telemetry to a ledger and warn on drift.
  --determinism-runs <n>   Surface runs for ledger determinism witness.
                           Default: 1, or 2 with --out/--check. Ingest surfaces
                           re-read and re-normalize the same file per run.
  --include <group>        Add an opt-in surface group (comma-separated ok).
                           Groups: default (no-op, always on), visual, adoption,
                           redteam, all. "all" means the runnable groups
                           (default+visual+redteam) and may grow; adoption is
                           never implied by "all" because it needs an explicit
                           --adoption-run/--adoption-summary.
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
  --adoption-run <dir>     Existing workflow:adoption-probe run directory; telemetry
                           reads <dir>/probe-summary.json only. Requires the
                           adoption surface (--include adoption).
  --adoption-summary <f>   Explicit probe-summary.json path (instead of
                           --adoption-run; the two cannot be combined).
  --skip-adoption-visual   Ignore the visual section of the probe summary when
                           normalizing the adoption surface.
  --redteam-include <g>    Forwarded to workflow:redteam as --include (opt-in
                           red-team case groups, comma-separated ok). Requires
                           the redteam surface (--include redteam / --surface
                           redteam).
  --redteam-case <id>      Forwarded to workflow:redteam as --case (run only the
                           matching case ids, comma-separated ok). Requires the
                           redteam surface.
  --doc-drift-include <f>  Forward an opt-in doc-drift feature as --include.
                           Known: status-heuristic (info-only manifest<->roadmap
                           wording heuristic; findings land in info_count, never
                           warning_count). Valid with default telemetry because
                           doc-drift is a default surface.
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
  The adoption surface (adoption-probe-summary) is ingest-only: telemetry reads an
  existing probe run's probe-summary.json and normalizes its summary counts. It
  never runs workflow:adoption-probe (with or without --visual), never creates a
  probe run dir or scratch copy, and never rewrites probe outputs. A missing or
  invalid summary file is recorded as available:false and keeps exit 0; only the
  CLI usage itself (adoption flags without --include adoption, no run/summary
  input, or both inputs at once) exits 2.
  The redteam surface is opt-in (--include redteam / --surface redteam / --include
  all) and consumes only the public workflow:redteam --json report: case/status
  counts plus its warning_count (observed gaps and unexpected observations only -
  expected defenses like blocked/fail-closed/input-error witnesses never count).
  Red-team observations are never a gate, approval, or readiness promotion, and
  never cause exit 1. Only --include/--case are forwarded; no mutating flag exists
  or is forwarded. A missing script, child exit != 0, or invalid child JSON is
  recorded as available:false while telemetry stays exit 0.
  --doc-drift-include status-heuristic opts the default doc-drift surface into the
  info-only status heuristic; default telemetry never runs the heuristic, and
  info findings never inflate warning_count (they surface as info_count).
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
const ADOPTION_FLAGS = ['adoption-run', 'adoption-summary', 'skip-adoption-visual'];
const REDTEAM_FLAGS = ['redteam-include', 'redteam-case'];
const DOC_DRIFT_FLAGS = ['doc-drift-include'];
const KNOWN_DOC_DRIFT_INCLUDES = ['status-heuristic'];

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    process.stdout.write(helpText());
    process.exit(0);
  }

  // Unknown sub-flag typo guards are purely syntactic, so they must hold on
  // every path - including --list-surfaces, which otherwise returns early
  // before the opt-in checks below.
  for (const name of Object.keys(flags)) {
    if ((name.startsWith('adoption-') || name.startsWith('skip-adoption')) && !ADOPTION_FLAGS.includes(name)) {
      usageError(`unknown flag: --${name} (known adoption flags: ${ADOPTION_FLAGS.map((f) => `--${f}`).join(', ')})`);
    }
    if (name.startsWith('redteam-') && !REDTEAM_FLAGS.includes(name)) {
      usageError(`unknown flag: --${name} (known redteam flags: ${REDTEAM_FLAGS.map((f) => `--${f}`).join(', ')})`);
    }
    if (name.startsWith('doc-drift-') && !DOC_DRIFT_FLAGS.includes(name)) {
      usageError(`unknown flag: --${name} (known doc-drift flags: ${DOC_DRIFT_FLAGS.map((f) => `--${f}`).join(', ')})`);
    }
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
        const ingest = surface.kind === 'ingest' ? ' (ingest)' : '';
        lines.push(`  ${surface.surface_id} [${surface.groups.join(', ')}] - ${surface.source_tool}${ingest}`);
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
  // Visual filters must reach at least one surface: reject the combination of
  // filters plus skip flags that remove every included visual surface, instead
  // of silently ignoring the filters.
  const selectedVisualIds = visualIds.filter((id) => (
    (includeGroups.some((group) => group === 'visual' || group === 'all') || includeSurfaces.includes(id))
    && !skipSurfaces.includes(id)
  ));
  if (selectedVisualIds.length === 0) {
    for (const name of ['visual-domain', 'visual-screen', 'visual-contract']) {
      if (hasFlag(flags, name)) {
        usageError(`--${name} has no effect: all visual surfaces are skipped`);
      }
    }
  }

  // --- adoption ingest opt-in ------------------------------------------------
  // The adoption surface never runs a child CLI: it only reads an existing probe
  // run's probe-summary.json, so it always needs an explicit input path. Note
  // that --include all does NOT select adoption (see --help). Unknown --adoption-*
  // flags are already rejected above, before the --list-surfaces early return.
  const adoptionIds = registry
    .filter((surface) => surface.groups.includes('adoption'))
    .map((surface) => surface.surface_id);
  const adoptionRequested = includeGroups.includes('adoption')
    || includeSurfaces.some((id) => adoptionIds.includes(id));
  const adoptionRun = parseValueFlag(flags, 'adoption-run', 'probe run directory');
  const adoptionSummary = parseValueFlag(flags, 'adoption-summary', 'probe summary file path');
  if (!adoptionRequested) {
    for (const name of ADOPTION_FLAGS) {
      if (hasFlag(flags, name)) {
        usageError(`--${name} requires the adoption surface (--include adoption)`);
      }
    }
  } else {
    if (adoptionRun != null && adoptionSummary != null) {
      usageError('--adoption-run and --adoption-summary cannot be used together');
    }
    if (adoptionRun == null && adoptionSummary == null) {
      usageError('--include adoption requires --adoption-run <dir> or --adoption-summary <file> (telemetry never probes the current repo)');
    }
  }

  // --- redteam opt-in forwarding ---------------------------------------------
  // Only --include/--case reach workflow:redteam (read-only observation flags).
  // The forwarded values are validated by the redteam CLI itself; an unknown
  // group/case there exits 2 in the child, which telemetry records fail-soft as
  // available:false.
  const redteamIds = registry
    .filter((surface) => surface.groups.includes('redteam'))
    .map((surface) => surface.surface_id);
  const redteamRequested = includeGroups.some((group) => group === 'redteam' || group === 'all')
    || includeSurfaces.some((id) => redteamIds.includes(id));
  const redteamInclude = parseValueFlag(flags, 'redteam-include', 'redteam group list');
  const redteamCase = parseValueFlag(flags, 'redteam-case', 'redteam case id list');
  if (!redteamRequested) {
    for (const name of REDTEAM_FLAGS) {
      if (hasFlag(flags, name)) {
        usageError(`--${name} requires the redteam surface (--include redteam or --surface redteam)`);
      }
    }
  }

  // --- doc-drift opt-in forwarding -------------------------------------------
  // Valid with default telemetry (doc-drift is a default surface). Only known
  // info-only features are forwarded; unknown features are usage errors.
  const docDriftInclude = parseListFlag(flags, 'doc-drift-include', 'doc-drift feature name');
  for (const feature of docDriftInclude) {
    if (!KNOWN_DOC_DRIFT_INCLUDES.includes(feature)) {
      usageError(`unknown --doc-drift-include feature: ${feature} (known: ${KNOWN_DOC_DRIFT_INCLUDES.join(', ')})`);
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
    adoption: {
      runDir: adoptionRun,
      summaryPath: adoptionSummary,
      skipVisual: flags['skip-adoption-visual'] === true,
    },
    redteam: {
      include: redteamInclude,
      caseIds: redteamCase,
    },
    docDrift: {
      include: docDriftInclude,
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
