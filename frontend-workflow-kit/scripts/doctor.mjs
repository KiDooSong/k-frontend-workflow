#!/usr/bin/env node
// doctor.mjs — warning-only preflight for layout/layer declarations.
// Findings never become a hard gate here: this tool exits 0 after reporting warnings.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, DEFAULTS, KIT_ROOT, projectRootOf, runCli } from './lib/util.mjs';
import { loadLayoutProfile } from './lib/layout-profile.mjs';
import { collectDoctorFindings } from './lib/doctor.mjs';

function toPosixRel(abs) {
  const rel = path.relative(process.cwd(), abs);
  return (rel || '.').split(path.sep).join('/');
}

function render(report) {
  const lines = [];
  lines.push('workflow:doctor — warning-only preflight');
  lines.push(`  project_root: ${report.project_root}`);
  lines.push(`  layout      : ${report.layout || '(default)'}`);
  if (report.findings.length === 0) {
    lines.push('  ok: no layout/layer preflight findings');
  } else {
    const warnings = report.findings.filter((f) => f.severity === 'warning').length;
    const info = report.findings.filter((f) => f.severity === 'info').length;
    lines.push(`  findings: ${report.findings.length} (warnings=${warnings}, info=${info})`);
    for (const f of report.findings) lines.push(`    [${f.severity || 'warning'}:${f.check}] ${f.message}`);
  }
  lines.push('  (warning-only: exit 0, no CI/hard gate promotion)');
  return lines.join('\n') + '\n';
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const srcDir = path.resolve(typeof flags.src === 'string' ? flags.src : DEFAULTS.src);
  const projectRoot = projectRootOf(srcDir, flags);
  const layout = loadLayoutProfile({ kitRoot: KIT_ROOT, flags });
  const findings = collectDoctorFindings({ layout, projectRoot });
  const report = {
    tool: 'workflow:doctor',
    ok: true,
    warning_count: findings.filter((f) => f.severity === 'warning').length,
    info_count: findings.filter((f) => f.severity === 'info').length,
    project_root: toPosixRel(projectRoot),
    layout: typeof flags.layout === 'string' ? toPosixRel(path.resolve(flags.layout)) : null,
    findings,
  };
  if (flags.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else process.stdout.write(render(report));
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli(main, 'workflow:doctor');
