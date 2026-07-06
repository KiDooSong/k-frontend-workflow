// telemetry.mjs (lib) - warning-first aggregation for existing observation CLIs.
//
// Calls public --json CLIs, normalizes only availability and warning counts, and
// can write deterministic observation ledgers. It never emits promotion/pass/fail
// verdicts.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULTS, KIT_ROOT, exists } from './util.mjs';

export const CHILD_JSON_MAX_BUFFER = 16 * 1024 * 1024;

const SURFACES = [
  {
    surface_id: 'route-cross-check',
    source_tool: 'workflow:route-cross-check',
    script: 'route-cross-check.mjs',
    args({ docsDir }) {
      return ['--docs', docsDir, '--json'];
    },
  },
  {
    surface_id: 'doc-drift',
    source_tool: 'workflow:doc-drift',
    script: 'doc-drift.mjs',
    args({ rootDir }) {
      return ['--root', rootDir, '--json'];
    },
  },
  {
    surface_id: 'readiness-eval',
    source_tool: 'workflow:eval',
    script: 'readiness-eval.mjs',
    args() {
      return ['--json'];
    },
  },
];

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

function normalizeSurface(surface, report) {
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
  return surface?.available ? 'normalized-json' : 'unavailable-reason';
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
} = {}) {
  const rootAbs = path.resolve(rootDir || process.cwd());
  const docsAbs = resolveUnder(rootAbs, docsDir || DEFAULTS.docs);
  const scriptsAbs = path.resolve(scriptDir);
  const surfaces = [];

  for (const surface of SURFACES) {
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
        args: surface.args({ rootDir: rootAbs, docsDir: docsAbs }),
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
  return normalizeTelemetryReport({
    ...report,
    ledger_version: 1,
    kind: 'observation-ledger',
    inputs: {
      root: '.',
      docs: rootRelativePath(rootAbs, docsAbs),
    },
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
      lines.push(`  ${surface.surface_id}: available, warnings=${surface.warning_count}${blocking}`);
    } else {
      lines.push(`  ${surface.surface_id}: unavailable (${surface.unavailable_reason})`);
    }
  }
  return lines;
}
