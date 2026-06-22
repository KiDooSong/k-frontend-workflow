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

test('collectDoctorFindings: layer role/fact issues are advisory findings', () => {
  const findings = collectDoctorFindings({
    projectRoot: process.cwd(),
    layout: {
      roles: { hook: 'src/features/{domain}/hooks/**' },
      layers: [
        { role: 'hook', fact: 'dir_has_files', access: { allow: [], forbid: [] } },
        { role: 'repository', fact: 'dir_has_tests', access: { allow: [], forbid: [] } },
      ],
    },
  });
  assert.ok(findings.some((f) => f.check === 'layer-role' && f.role === 'repository'));
  assert.ok(findings.some((f) => f.check === 'layer-fact' && f.role === 'repository'));
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
