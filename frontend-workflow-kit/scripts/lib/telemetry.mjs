// telemetry.mjs (lib) - warning-first aggregation for existing observation CLIs.
//
// Calls public --json CLIs, normalizes only availability and warning counts, and
// can write deterministic observation ledgers. It never emits promotion/pass/fail
// verdicts.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULTS, KIT_ROOT, exists, readFileSafe } from './util.mjs';

export const CHILD_JSON_MAX_BUFFER = 16 * 1024 * 1024;

// Surface registry. `default` group surfaces are always observed; other groups
// are strictly opt-in and never run unless explicitly requested, so the default
// telemetry output/ledger byte shape stays stable.
export const TELEMETRY_SURFACE_GROUPS = ['default', 'visual', 'adoption'];

// Ingest groups normalize files that an earlier tool run already produced; they
// never spawn a child CLI and always need an explicit input path. `all` therefore
// expands to the runnable groups only - adoption is never implied, because
// telemetry must not guess (or create) a probe run dir for the current repo.
export const TELEMETRY_INGEST_GROUPS = ['adoption'];

// Visual surfaces consume only the public --json output of the visual CLIs.
// No --out/--format/--enforce: telemetry never writes drafts or promotes warnings.
function visualSurfaceArgs({ docsDir, srcDir, visual }) {
  const args = ['--docs', docsDir, '--json'];
  if (srcDir) args.push('--src', srcDir);
  if (visual?.domain) args.push('--domain', visual.domain);
  if (visual?.screen) args.push('--screen', visual.screen);
  if (visual?.contract) args.push('--contract', visual.contract);
  return args;
}

const SURFACES = [
  {
    surface_id: 'route-cross-check',
    source_tool: 'workflow:route-cross-check',
    script: 'route-cross-check.mjs',
    kind: 'cli',
    groups: ['default'],
    args({ docsDir }) {
      return ['--docs', docsDir, '--json'];
    },
  },
  {
    surface_id: 'doc-drift',
    source_tool: 'workflow:doc-drift',
    script: 'doc-drift.mjs',
    kind: 'cli',
    groups: ['default'],
    args({ rootDir }) {
      return ['--root', rootDir, '--json'];
    },
  },
  {
    surface_id: 'readiness-eval',
    source_tool: 'workflow:eval',
    script: 'readiness-eval.mjs',
    kind: 'cli',
    groups: ['default'],
    args() {
      return ['--json'];
    },
  },
  {
    surface_id: 'visual-consistency',
    source_tool: 'workflow:visual-consistency',
    script: 'visual-consistency.mjs',
    kind: 'cli',
    groups: ['visual'],
    args: visualSurfaceArgs,
  },
  {
    surface_id: 'visual-contract-bootstrap',
    source_tool: 'workflow:visual-contract-bootstrap',
    script: 'visual-contract-bootstrap.mjs',
    kind: 'cli',
    groups: ['visual'],
    args: visualSurfaceArgs,
  },
  // Ingest surface: reads an existing adoption-probe run's probe-summary.json.
  // Telemetry never runs workflow:adoption-probe, never creates a probe run dir,
  // and never parses the run's raw observations/* files - summary only.
  {
    surface_id: 'adoption-probe-summary',
    source_tool: 'workflow:adoption-probe',
    kind: 'ingest',
    groups: ['adoption'],
  },
];

export function listTelemetrySurfaces() {
  return SURFACES.map((surface) => ({
    surface_id: surface.surface_id,
    groups: [...surface.groups],
    source_tool: surface.source_tool,
    kind: surface.kind,
  }));
}

// `all` expands to the runnable (non-ingest) groups only - see
// TELEMETRY_INGEST_GROUPS above for why adoption is never implied.
export function expandTelemetryGroups(includeGroups = []) {
  const groups = new Set(['default']);
  for (const group of includeGroups) {
    if (group === 'all') {
      for (const known of TELEMETRY_SURFACE_GROUPS) {
        if (!TELEMETRY_INGEST_GROUPS.includes(known)) groups.add(known);
      }
      continue;
    }
    if (!TELEMETRY_SURFACE_GROUPS.includes(group)) {
      throw new Error(`unknown surface group: ${group}`);
    }
    groups.add(group);
  }
  return groups;
}

// Selection is additive: the default group always runs; includeGroups/-Surfaces
// only add opt-in surfaces on top, and skipSurfaces removes explicitly.
// Registry order is the fixed execution/report order.
export function selectTelemetrySurfaces({
  includeGroups = [],
  includeSurfaces = [],
  skipSurfaces = [],
} = {}) {
  const groups = expandTelemetryGroups(includeGroups);
  const ids = new Set(includeSurfaces);
  for (const id of ids) {
    if (!SURFACES.some((surface) => surface.surface_id === id)) {
      throw new Error(`unknown surface id: ${id}`);
    }
  }
  const skip = new Set(skipSurfaces);
  return SURFACES.filter((surface) => (
    (surface.groups.some((group) => groups.has(group)) || ids.has(surface.surface_id))
    && !skip.has(surface.surface_id)
  ));
}

const NON_DETERMINISTIC_KEYS = new Set([
  'generated_at',
  'timestamp',
  'duration',
  'duration_ms',
  'elapsed',
  'elapsed_ms',
  'cwd',
  'absolute_path',
  'temp_path',
  'stderr',
]);

function resolveUnder(base, value) {
  if (path.isAbsolute(value)) return path.resolve(value);
  return path.resolve(base, value);
}

function toPosixPath(value) {
  return String(value || '').split(path.sep).join('/');
}

function rootRelativePath(rootDir, value) {
  const rootAbs = path.resolve(rootDir || process.cwd());
  const abs = path.isAbsolute(value) ? path.resolve(value) : path.resolve(rootAbs, value);
  const rel = path.relative(rootAbs, abs);
  if (!rel || rel === '') return '.';
  if (rel.startsWith('..') || path.isAbsolute(rel)) return path.basename(abs);
  return toPosixPath(rel);
}

function warningCountFrom(report) {
  const n = Number(report?.warning_count);
  if (Number.isFinite(n) && n >= 0) return Math.trunc(n);
  if (Array.isArray(report?.findings)) return report.findings.length;
  return 0;
}

// Visual CLIs expose summary.warnings (findings also contain infos); fall back
// to the generic warning_count/findings rule when the field is absent.
function visualWarningCountFrom(report) {
  const n = Number(report?.summary?.warnings);
  if (Number.isFinite(n) && n >= 0) return Math.trunc(n);
  return warningCountFrom(report);
}

function nonNegativeInteger(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

function unavailable(surface, reason) {
  return {
    surface_id: surface.surface_id,
    available: false,
    warning_count: 0,
    source_tool: surface.source_tool,
    unavailable_reason: reason,
  };
}

// --- adoption-probe summary ingest ------------------------------------------
// Normalizes an existing probe-summary.json (written by workflow:adoption-probe)
// into one telemetry surface. File content only: no child process, no probe run
// dir creation, no re-parse of the run's raw observations/stdout files, and no
// new gate/verdict fields. Probe boundary fields (draft_only) are preserved as
// booleans, never interpreted as a verdict.

export function resolveAdoptionSummaryPath(rootAbs, adoption = {}) {
  if (adoption.summaryPath) return resolveUnder(rootAbs, adoption.summaryPath);
  if (adoption.runDir) return path.join(resolveUnder(rootAbs, adoption.runDir), 'probe-summary.json');
  return null;
}

// Missing/null fields normalize to stable 0/false/null so synthetic or older
// summaries still produce a deterministic surface shape.
export function normalizeAdoptionProbeSummary(summary, { summaryDisplayPath = '', skipVisual = false } = {}) {
  const visual = !skipVisual && summary?.visual && typeof summary.visual === 'object' ? summary.visual : null;
  const visualEnabled = Boolean(visual?.enabled);
  const findings = visualEnabled && Array.isArray(visual?.findings) ? visual.findings : [];
  const nonInfoFindings = findings.filter((finding) => finding?.severity !== 'info').length;
  const bootstrapWarnings = visualEnabled ? nonNegativeInteger(visual?.bootstrap?.warnings) : 0;
  const consistencyWarnings = visualEnabled ? nonNegativeInteger(visual?.consistency?.warnings) : 0;
  return {
    surface_id: 'adoption-probe-summary',
    available: true,
    // Visual warnings plus non-info probe findings; info findings never count.
    warning_count: bootstrapWarnings + consistencyWarnings + nonInfoFindings,
    source_tool: 'workflow:adoption-probe',
    run_id: summary?.probe_id != null ? String(summary.probe_id) : null,
    status: 'observed',
    draft_only: Boolean(summary?.draft_only),
    finding_count: findings.length,
    visual_enabled: visualEnabled,
    visual_status: visualEnabled && visual?.status != null ? String(visual.status) : null,
    visual_bootstrap_warnings: bootstrapWarnings,
    visual_consistency_warnings: consistencyWarnings,
    visual_component_gap_candidates: visualEnabled
      ? nonNegativeInteger(visual?.bootstrap?.component_gap_candidates)
      : 0,
    observation_paths: {
      summary: String(summaryDisplayPath || ''),
    },
  };
}

function ingestAdoptionSurface(surface, { rootAbs, adoption = {}, readFile = readFileSafe }) {
  const summaryAbs = resolveAdoptionSummaryPath(rootAbs, adoption);
  // CLI usage validation rejects this earlier (exit 2); programmatic callers get
  // a safe unavailable surface instead of an implicit probe of the current repo.
  if (!summaryAbs) return unavailable(surface, 'probe summary not specified');
  const raw = readFile(summaryAbs);
  if (raw == null) return unavailable(surface, 'summary not found');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return unavailable(surface, 'invalid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return unavailable(surface, 'invalid summary shape');
  }
  return normalizeAdoptionProbeSummary(parsed, {
    summaryDisplayPath: rootRelativePath(rootAbs, summaryAbs),
    skipVisual: Boolean(adoption.skipVisual),
  });
}

function normalizeSurface(surface, report) {
  if (surface.surface_id === 'visual-consistency') {
    return {
      surface_id: surface.surface_id,
      available: true,
      warning_count: visualWarningCountFrom(report),
      source_tool: surface.source_tool,
      skipped: Boolean(report?.skipped),
      contract_found: Boolean(report?.contract_found),
      screen_count: nonNegativeInteger(report?.summary?.screens),
    };
  }
  if (surface.surface_id === 'visual-contract-bootstrap') {
    return {
      surface_id: surface.surface_id,
      available: true,
      warning_count: visualWarningCountFrom(report),
      source_tool: surface.source_tool,
      candidate_family_count: nonNegativeInteger(report?.summary?.candidate_families),
      suggested_addition_count: nonNegativeInteger(report?.summary?.suggested_contract_rows),
      component_gap_candidate_count: nonNegativeInteger(report?.summary?.component_gap_candidates),
    };
  }
  if (surface.surface_id === 'readiness-eval') {
    const falseOpen = nonNegativeInteger(report?.confusion?.false_open?.count);
    const falseClosed = nonNegativeInteger(report?.confusion?.false_closed?.count);
    const failClosedLeaked = nonNegativeInteger(report?.fail_closed_axis?.leaked);
    const blockingMismatch = nonNegativeInteger(report?.blocking_kinds?.mismatch?.count);
    return {
      surface_id: surface.surface_id,
      available: true,
      warning_count: falseOpen + falseClosed + failClosedLeaked,
      source_tool: surface.source_tool,
      total: nonNegativeInteger(report?.total),
      false_open: falseOpen,
      false_closed: falseClosed,
      fail_closed_leaked: failClosedLeaked,
      blocking_mismatch: blockingMismatch,
    };
  }
  return {
    surface_id: surface.surface_id,
    available: true,
    warning_count: warningCountFrom(report),
    source_tool: surface.source_tool,
  };
}

function sanitizeDeterministicValue(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeDeterministicValue(item));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (NON_DETERMINISTIC_KEYS.has(key)) continue;
    out[key] = sanitizeDeterministicValue(value[key]);
  }
  return out;
}

function normalizeSurfaceForReport(surface) {
  const out = {
    surface_id: String(surface?.surface_id || ''),
    source_tool: String(surface?.source_tool || ''),
    available: Boolean(surface?.available),
    warning_count: warningCountFrom(surface),
  };
  if (!out.available && surface?.unavailable_reason) {
    out.unavailable_reason = String(surface.unavailable_reason);
  }
  if (surface?.surface_id === 'readiness-eval' || surface?.total != null) {
    out.total = nonNegativeInteger(surface?.total);
    out.false_open = nonNegativeInteger(surface?.false_open);
    out.false_closed = nonNegativeInteger(surface?.false_closed);
    out.fail_closed_leaked = nonNegativeInteger(surface?.fail_closed_leaked);
    out.blocking_mismatch = nonNegativeInteger(surface?.blocking_mismatch);
  }
  // Visual summary fields are kept only for available surfaces; unavailable
  // visual surfaces stay on the minimal generic shape.
  if (out.available && surface?.surface_id === 'visual-consistency') {
    out.skipped = Boolean(surface?.skipped);
    out.contract_found = Boolean(surface?.contract_found);
    out.screen_count = nonNegativeInteger(surface?.screen_count);
  }
  if (out.available && surface?.surface_id === 'visual-contract-bootstrap') {
    out.candidate_family_count = nonNegativeInteger(surface?.candidate_family_count);
    out.suggested_addition_count = nonNegativeInteger(surface?.suggested_addition_count);
    out.component_gap_candidate_count = nonNegativeInteger(surface?.component_gap_candidate_count);
  }
  // Adoption ingest fields survive the ledger normalization; unavailable ingest
  // surfaces stay on the minimal generic shape like every other surface.
  if (out.available && surface?.surface_id === 'adoption-probe-summary') {
    out.run_id = surface?.run_id != null ? String(surface.run_id) : null;
    out.status = String(surface?.status || 'observed');
    out.draft_only = Boolean(surface?.draft_only);
    out.finding_count = nonNegativeInteger(surface?.finding_count);
    out.visual_enabled = Boolean(surface?.visual_enabled);
    out.visual_status = surface?.visual_status != null ? String(surface.visual_status) : null;
    out.visual_bootstrap_warnings = nonNegativeInteger(surface?.visual_bootstrap_warnings);
    out.visual_consistency_warnings = nonNegativeInteger(surface?.visual_consistency_warnings);
    out.visual_component_gap_candidates = nonNegativeInteger(surface?.visual_component_gap_candidates);
    out.observation_paths = {
      summary: String(surface?.observation_paths?.summary || ''),
    };
  }
  if (surface?.determinism) {
    out.determinism = {
      runs: Math.max(1, nonNegativeInteger(surface.determinism.runs) || 1),
      identical: Boolean(surface.determinism.identical),
      witness: String(surface.determinism.witness || 'normalized-json'),
    };
  }
  return out;
}

function summarizeSurfaces(surfaces) {
  const availableCount = surfaces.filter((s) => s.available).length;
  return {
    surface_count: surfaces.length,
    available_count: availableCount,
    unavailable_count: surfaces.length - availableCount,
    warning_count: surfaces.reduce((sum, s) => sum + warningCountFrom(s), 0),
  };
}

function normalizeCheckFinding(finding) {
  return {
    severity: 'warning',
    check: String(finding?.check || 'telemetry-ledger-drift'),
    path: String(finding?.path || ''),
    reason: String(finding?.reason || ''),
  };
}

function normalizeTelemetryCheck(check) {
  const findings = Array.isArray(check?.findings) ? check.findings.map(normalizeCheckFinding) : [];
  return {
    checked: Boolean(check?.checked),
    path: String(check?.path || ''),
    status: String(check?.status || 'match'),
    warning_count: warningCountFrom({ warning_count: check?.warning_count, findings }),
    findings,
  };
}

export function normalizeTelemetryReport(report) {
  const rawSurfaces = Array.isArray(report?.surfaces) ? report.surfaces : [];
  const surfaces = rawSurfaces.map((surface) => normalizeSurfaceForReport(sanitizeDeterministicValue(surface)));
  const hasLedgerFields = report?.ledger_version != null || report?.kind === 'observation-ledger' || report?.inputs || report?.summary;
  const out = {
    tool: 'workflow:telemetry',
    mode: 'warning-first',
    schema_version: 1,
  };
  if (hasLedgerFields) {
    out.ledger_version = 1;
    out.kind = 'observation-ledger';
  }
  out.ok = true;
  if (hasLedgerFields) {
    out.inputs = {
      root: String(report?.inputs?.root || '.'),
      docs: String(report?.inputs?.docs || DEFAULTS.docs),
    };
    // Opt-in extras only: default runs keep the {root, docs} byte shape.
    if (report?.inputs?.src != null) out.inputs.src = String(report.inputs.src);
    if (Array.isArray(report?.inputs?.include) && report.inputs.include.length > 0) {
      out.inputs.include = report.inputs.include.map((group) => String(group));
    }
    if (Array.isArray(report?.inputs?.surfaces) && report.inputs.surfaces.length > 0) {
      out.inputs.surfaces = report.inputs.surfaces.map((id) => String(id));
    }
    const rawVisual = report?.inputs?.visual;
    if (rawVisual && typeof rawVisual === 'object') {
      const visual = {};
      for (const key of ['domain', 'screen', 'contract']) {
        if (rawVisual[key] != null && rawVisual[key] !== '') visual[key] = String(rawVisual[key]);
      }
      if (Object.keys(visual).length > 0) out.inputs.visual = visual;
    }
    const rawAdoption = report?.inputs?.adoption;
    if (rawAdoption && typeof rawAdoption === 'object') {
      const adoption = {};
      for (const key of ['run', 'summary']) {
        if (rawAdoption[key] != null && rawAdoption[key] !== '') adoption[key] = String(rawAdoption[key]);
      }
      if (Object.keys(adoption).length > 0) out.inputs.adoption = adoption;
    }
    out.summary = summarizeSurfaces(surfaces);
  }
  out.surfaces = surfaces;
  if (report?.check) out.check = normalizeTelemetryCheck(report.check);
  return out;
}

export function stableTelemetryJson(report) {
  return `${JSON.stringify(normalizeTelemetryReport(report), null, 2)}\n`;
}

function surfaceSignature(surface) {
  const normalized = normalizeSurfaceForReport(sanitizeDeterministicValue(surface));
  delete normalized.determinism;
  return JSON.stringify(normalized);
}

function determinismWitness(surface) {
  if (!surface?.available) return 'unavailable-reason';
  // Ingest surfaces are file-content normalizations, not child runs: the witness
  // re-reads and re-normalizes the same summary file per determinism run.
  const registered = SURFACES.find((candidate) => candidate.surface_id === surface.surface_id);
  if (registered?.kind === 'ingest') return 'normalized-summary-json';
  return 'normalized-json';
}

export function runSurfaceCommand({ scriptPath, args, cwd }) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: CHILD_JSON_MAX_BUFFER,
  });
}

function commandUnavailableReason(result) {
  if (result?.error?.code === 'ENOBUFS') return 'stdout maxBuffer exceeded';
  return 'command unavailable';
}

export function collectTelemetry({
  rootDir = process.cwd(),
  docsDir = DEFAULTS.docs,
  scriptDir = path.join(KIT_ROOT, 'scripts'),
  runner = runSurfaceCommand,
  fileExists = exists,
  includeGroups = [],
  includeSurfaces = [],
  skipSurfaces = [],
  srcDir = DEFAULTS.src,
  visual = {},
  adoption = {},
} = {}) {
  const rootAbs = path.resolve(rootDir || process.cwd());
  const docsAbs = resolveUnder(rootAbs, docsDir || DEFAULTS.docs);
  const srcAbs = resolveUnder(rootAbs, srcDir || DEFAULTS.src);
  const visualOpts = {
    domain: visual?.domain || undefined,
    screen: visual?.screen || undefined,
    contract: visual?.contract ? resolveUnder(rootAbs, visual.contract) : undefined,
  };
  const scriptsAbs = path.resolve(scriptDir);
  const selected = selectTelemetrySurfaces({ includeGroups, includeSurfaces, skipSurfaces });
  const surfaces = [];

  for (const surface of selected) {
    // Ingest surfaces normalize an existing file - no script, no child process.
    if (surface.kind === 'ingest') {
      surfaces.push(ingestAdoptionSurface(surface, { rootAbs, adoption }));
      continue;
    }

    const scriptPath = path.join(scriptsAbs, surface.script);
    if (!fileExists(scriptPath)) {
      surfaces.push(unavailable(surface, 'script not found'));
      continue;
    }

    let result;
    try {
      result = runner({
        surface_id: surface.surface_id,
        source_tool: surface.source_tool,
        scriptPath,
        args: surface.args({ rootDir: rootAbs, docsDir: docsAbs, srcDir: srcAbs, visual: visualOpts }),
        cwd: rootAbs,
      });
    } catch {
      surfaces.push(unavailable(surface, 'runner error'));
      continue;
    }

    if (!result || result.error) {
      surfaces.push(unavailable(surface, commandUnavailableReason(result)));
      continue;
    }
    if (result.status !== 0) {
      surfaces.push(unavailable(surface, `exit code ${result.status}`));
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(result.stdout || '');
    } catch {
      surfaces.push(unavailable(surface, 'invalid JSON'));
      continue;
    }
    surfaces.push(normalizeSurface(surface, parsed));
  }

  return {
    tool: 'workflow:telemetry',
    mode: 'warning-first',
    schema_version: 1,
    // ok only means the telemetry command produced its observation report. It is
    // not a verdict about any observed surface.
    ok: true,
    surfaces,
  };
}

export function collectTelemetryWithDeterminism({
  determinismRuns = 1,
  ...opts
} = {}) {
  const runs = Math.max(1, Math.trunc(Number(determinismRuns) || 1));
  const reports = [];
  for (let i = 0; i < runs; i++) reports.push(collectTelemetry(opts));
  const normalizedRuns = reports.map((report) => normalizeTelemetryReport(report));
  const first = normalizedRuns[0] || normalizeTelemetryReport({ surfaces: [] });
  const surfaces = first.surfaces.map((surface) => {
    const signatures = normalizedRuns.map((report) => {
      const matching = report.surfaces.find((candidate) => candidate.surface_id === surface.surface_id);
      return surfaceSignature(matching || unavailable({
        surface_id: surface.surface_id,
        source_tool: surface.source_tool,
      }, 'surface missing'));
    });
    return {
      ...surface,
      determinism: {
        runs,
        identical: signatures.every((signature) => signature === signatures[0]),
        witness: determinismWitness(surface),
      },
    };
  });
  return {
    ...first,
    surfaces,
  };
}

export function collectTelemetryLedger({
  rootDir = process.cwd(),
  docsDir = DEFAULTS.docs,
  determinismRuns = 1,
  ...opts
} = {}) {
  const rootAbs = path.resolve(rootDir || process.cwd());
  const docsAbs = resolveUnder(rootAbs, docsDir || DEFAULTS.docs);
  const report = collectTelemetryWithDeterminism({
    rootDir: rootAbs,
    docsDir,
    determinismRuns,
    ...opts,
  });
  const inputs = {
    root: '.',
    docs: rootRelativePath(rootAbs, docsAbs),
  };
  // Ledger inputs stay {root, docs} for default runs; include/surfaces plus the
  // visual/adoption opt-in inputs are recorded (root-relative, deterministic)
  // only when an opt-in surface was actually selected.
  const selected = selectTelemetrySurfaces({
    includeGroups: opts.includeGroups || [],
    includeSurfaces: opts.includeSurfaces || [],
    skipSurfaces: opts.skipSurfaces || [],
  });
  const visualSelected = selected.some((surface) => surface.groups.includes('visual'));
  const adoptionSelected = selected.some((surface) => surface.groups.includes('adoption'));
  if (visualSelected || adoptionSelected) {
    if (visualSelected) {
      const srcAbs = resolveUnder(rootAbs, opts.srcDir || DEFAULTS.src);
      inputs.src = rootRelativePath(rootAbs, srcAbs);
    }
    const requestedGroups = expandTelemetryGroups(opts.includeGroups || []);
    if (visualSelected) requestedGroups.add('visual');
    if (adoptionSelected) requestedGroups.add('adoption');
    inputs.include = TELEMETRY_SURFACE_GROUPS.filter((group) => requestedGroups.has(group));
    const explicit = new Set(opts.includeSurfaces || []);
    if (explicit.size > 0) {
      inputs.surfaces = SURFACES
        .filter((surface) => explicit.has(surface.surface_id))
        .map((surface) => surface.surface_id);
    }
    const visualFilters = {};
    if (opts.visual?.domain) visualFilters.domain = String(opts.visual.domain);
    if (opts.visual?.screen) visualFilters.screen = String(opts.visual.screen);
    if (opts.visual?.contract) {
      visualFilters.contract = rootRelativePath(rootAbs, resolveUnder(rootAbs, opts.visual.contract));
    }
    if (Object.keys(visualFilters).length > 0) inputs.visual = visualFilters;
    if (adoptionSelected) {
      const adoptionInputs = {};
      if (opts.adoption?.runDir) {
        adoptionInputs.run = rootRelativePath(rootAbs, resolveUnder(rootAbs, opts.adoption.runDir));
      }
      const summaryAbs = resolveAdoptionSummaryPath(rootAbs, opts.adoption || {});
      if (summaryAbs) adoptionInputs.summary = rootRelativePath(rootAbs, summaryAbs);
      if (Object.keys(adoptionInputs).length > 0) inputs.adoption = adoptionInputs;
    }
  }
  return normalizeTelemetryReport({
    ...report,
    ledger_version: 1,
    kind: 'observation-ledger',
    inputs,
  });
}

function resolveFileFromRoot(rootDir, filePath) {
  const rootAbs = path.resolve(rootDir || process.cwd());
  return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(rootAbs, filePath);
}

export function writeTelemetryLedger({ outPath, report, rootDir = process.cwd() }) {
  const resolved = resolveFileFromRoot(rootDir, outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, stableTelemetryJson(report), 'utf8');
  return {
    path: resolved,
    displayPath: rootRelativePath(rootDir, resolved),
  };
}

function checkResult({ rootDir, filePath, status, check, reason }) {
  const displayPath = rootRelativePath(rootDir, filePath);
  const hasWarning = status !== 'match';
  return {
    checked: true,
    path: displayPath,
    status,
    warning_count: hasWarning ? 1 : 0,
    findings: hasWarning
      ? [{
        severity: 'warning',
        check,
        path: displayPath,
        reason,
      }]
      : [],
  };
}

export function compareTelemetryLedger({ filePath, report, rootDir = process.cwd() }) {
  const resolved = resolveFileFromRoot(rootDir, filePath);
  if (!exists(resolved)) {
    return checkResult({
      rootDir,
      filePath: resolved,
      status: 'missing',
      check: 'telemetry-ledger-missing',
      reason: 'ledger file not found',
    });
  }

  let existingRaw;
  try {
    existingRaw = fs.readFileSync(resolved, 'utf8');
    JSON.parse(existingRaw);
  } catch {
    return checkResult({
      rootDir,
      filePath: resolved,
      status: 'invalid-json',
      check: 'telemetry-ledger-invalid-json',
      reason: 'ledger file is not valid JSON',
    });
  }

  const currentJson = stableTelemetryJson(report);
  if (currentJson !== existingRaw) {
    return checkResult({
      rootDir,
      filePath: resolved,
      status: 'drift',
      check: 'telemetry-ledger-drift',
      reason: 'current telemetry differs from ledger',
    });
  }

  return checkResult({
    rootDir,
    filePath: resolved,
    status: 'match',
    check: 'telemetry-ledger-match',
    reason: '',
  });
}

export function formatTelemetryHuman(report) {
  const surfaces = Array.isArray(report?.surfaces) ? report.surfaces : [];
  const available = surfaces.filter((s) => s.available).length;
  const warnings = surfaces.reduce((sum, s) => sum + warningCountFrom(s), 0);
  const lines = [
    `workflow:telemetry - warning-first: ${available}/${surfaces.length} surface(s) available, ${warnings} warning(s) observed`,
  ];
  for (const surface of surfaces) {
    if (surface.available) {
      const blocking = surface.surface_id === 'readiness-eval'
        ? `, blocking_mismatch=${nonNegativeInteger(surface.blocking_mismatch)}`
        : '';
      const skipped = surface.surface_id === 'visual-consistency' && surface.skipped
        ? ', skipped=true'
        : '';
      const ingest = surface.surface_id === 'adoption-probe-summary'
        ? `, ingest=probe-summary, visual_enabled=${Boolean(surface.visual_enabled)}`
        : '';
      lines.push(`  ${surface.surface_id}: available, warnings=${surface.warning_count}${blocking}${skipped}${ingest}`);
    } else {
      lines.push(`  ${surface.surface_id}: unavailable (${surface.unavailable_reason})`);
    }
  }
  return lines;
}
