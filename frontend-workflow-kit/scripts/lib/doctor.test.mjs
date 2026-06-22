// doctor.test.mjs — warning-only layout/layer preflight checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectDoctorFindings } from './doctor.mjs';

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
