// doctor.test.mjs — warning-only layout/layer preflight checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collectDoctorFindings } from './doctor.mjs';

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOCTOR_CLI = path.join(KIT_ROOT, 'scripts', 'doctor.mjs');

test('collectDoctorFindings: existing role glob is not warned, missing role glob is warning-only finding', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-role-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tmp, 'src', 'shared', 'ui'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'src', 'shared', 'ui', 'Button.tsx'), 'export function Button() { return null; }\n');
  const findings = collectDoctorFindings({
    projectRoot: tmp,
    layout: {
      roles: {
        ui_primitive: 'src/shared/ui/**',
        api_schema: 'src/api/schemas/**',
      },
      layers: [],
    },
  });
  assert.equal(findings.some((f) => f.check === 'role-glob' && f.role === 'ui_primitive'), false);
  const missing = findings.find((f) => f.check === 'role-glob' && f.role === 'api_schema');
  assert.ok(missing);
  assert.equal(missing.severity, 'warning');
  assert.equal(missing.count, 0);
});

test('collectDoctorFindings: missing layer role binding is advisory when no glob is declared', () => {
  const findings = collectDoctorFindings({
    projectRoot: process.cwd(),
    layout: {
      roles: { hook: 'src/features/{domain}/hooks/**' },
      layers: [
        { role: 'hook', fact: 'dir_has_files', access: { allow: [], forbid: [] } },
        { role: 'repository', fact: 'dir_has_files', access: { allow: [], forbid: [] } },
      ],
    },
  });
  assert.ok(findings.some((f) => f.check === 'layer-role' && f.role === 'repository'));
  assert.equal(findings.some((f) => f.check === 'layer-fact'), false);
  assert.equal(findings.every((f) => f.severity === 'warning'), true);
});

test('collectDoctorFindings: multi-glob api_schema is an explicit warning-only unsupported finding', () => {
  const findings = collectDoctorFindings({
    projectRoot: process.cwd(),
    layout: {
      roles: { api_schema: ['src/api/schemas/**', 'contracts/openapi/**'] },
      layers: [],
    },
  });
  const finding = findings.find((f) => f.check === 'codegen-api-schema-multiglob');
  assert.ok(finding);
  assert.equal(finding.severity, 'warning');
  assert.equal(finding.role, 'api_schema');
  assert.equal(finding.count, 2);
});

test('workflow:doctor CLI wraps LayoutConfigError with runCli exit 2 and no stack trace', () => {
  const r = spawnSync(process.execPath, [DOCTOR_CLI, '--layout', '__missing__.yaml'], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /workflow:doctor: layout-profile:/);
  assert.doesNotMatch(r.stderr, /\n\s+at\s+/);
  assert.equal(r.stdout, '');
});

test('workflow:doctor CLI surfaces unsupported layer fact as layout config error', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-unsupported-fact-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  const layoutPath = path.join(tmp, 'project-layout.yaml');
  fs.writeFileSync(
    layoutPath,
    [
      'version: 1',
      'layers:',
      '  - role: repository',
      '    glob: src/data/{domain}/repositories/**',
      '    fact: dir_has_tests',
      '',
    ].join('\n'),
    'utf8',
  );
  const r = spawnSync(process.execPath, [DOCTOR_CLI, '--src', path.join(tmp, 'src'), '--layout', layoutPath], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /workflow:doctor: layout-profile: .*unsupported/);
  assert.equal(r.stdout, '');
});

test('collectDoctorFindings: built-in layer glob checks follow rebound role paths', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-role-rebind-layer-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tmp, 'src', 'presentation', 'profile', 'screens'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'src', 'presentation', 'profile', 'screens', 'Profile.tsx'), 'export function Profile() { return null; }\n');

  const findings = collectDoctorFindings({
    projectRoot: tmp,
    layout: {
      roles: { screen: 'src/presentation/{domain}/screens/**' },
      layers: [
        {
          role: 'screen',
          glob: 'src/features/{domain}/screens/**',
          fact: 'dir_has_files',
          access: { allow: [], forbid: [] },
        },
      ],
    },
  });

  assert.equal(findings.some((f) => f.check === 'role-glob' && f.role === 'screen'), false);
  assert.equal(findings.some((f) => f.check === 'layer-glob' && f.role === 'screen'), false);
});

test('workflow:doctor default coupon fixture has no overlap warnings', () => {
  const r = spawnSync(process.execPath, [DOCTOR_CLI, '--src', 'examples/coupon-feature/src', '--json'], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.findings.some((f) => f.check === 'layer-overlap'), false);
  assert.equal(report.warning_count, 0);
});

test('collectDoctorFindings: telemetry layer with explicit glob does not require matching role binding', () => {
  const findings = collectDoctorFindings({
    projectRoot: process.cwd(),
    layout: {
      roles: {},
      layers: [
        { role: 'repository', glob: 'src/data/{domain}/repositories/**', fact: 'dir_has_files', access: { allow: [], forbid: [] } },
      ],
    },
  });
  assert.equal(findings.some((f) => f.check === 'layer-role' && f.role === 'repository'), false);
});
