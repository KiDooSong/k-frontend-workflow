// telemetry.mjs (lib) - warning-first aggregation for existing observation CLIs.
//
// MVP skeleton: call public --json CLIs, normalize only availability and warning
// counts, and never emit promotion/pass/fail verdicts.
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
];

function resolveUnder(base, value) {
  if (path.isAbsolute(value)) return path.resolve(value);
  return path.resolve(base, value);
}

function warningCountFrom(report) {
  const n = Number(report?.warning_count);
  if (Number.isFinite(n) && n >= 0) return Math.trunc(n);
  if (Array.isArray(report?.findings)) return report.findings.length;
  return 0;
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
  return {
    surface_id: surface.surface_id,
    available: true,
    warning_count: warningCountFrom(report),
    source_tool: surface.source_tool,
  };
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

export function formatTelemetryHuman(report) {
  const surfaces = Array.isArray(report?.surfaces) ? report.surfaces : [];
  const available = surfaces.filter((s) => s.available).length;
  const warnings = surfaces.reduce((sum, s) => sum + warningCountFrom(s), 0);
  const lines = [
    `workflow:telemetry - warning-first: ${available}/${surfaces.length} surface(s) available, ${warnings} warning(s) observed`,
  ];
  for (const surface of surfaces) {
    if (surface.available) {
      lines.push(`  ${surface.surface_id}: available, warnings=${surface.warning_count}`);
    } else {
      lines.push(`  ${surface.surface_id}: unavailable (${surface.unavailable_reason})`);
    }
  }
  return lines;
}
