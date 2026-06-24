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

test('workflow:doctor CLI fails closed for explicit missing --policy', () => {
  const missingPolicy = path.join(os.tmpdir(), `missing-policy-${process.pid}.yaml`);
  const r = spawnSync(process.execPath, [DOCTOR_CLI, '--policy', missingPolicy, '--json'], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /workflow:doctor: --policy 경로가 존재하지 않음:/);
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
        { role: 'repository', glob: 'src/data/{domain}/repositories/**', fact: 'dir_has_files', access: { allow: ['final-fixture-ui'], forbid: [] } },
      ],
    },
  });
  assert.equal(findings.some((f) => f.check === 'layer-role' && f.role === 'repository'), false);
  assert.equal(findings.some((f) => f.check === 'layer-access-unmaterializable' && f.role === 'repository'), false);
  assert.ok(findings.some((f) => f.check === 'layer-access-readiness-wired' && f.role === 'repository'));
});

test('collectDoctorFindings: layer access with no role binding or glob warns as unmaterializable', () => {
  const findings = collectDoctorFindings({
    projectRoot: process.cwd(),
    layout: {
      roles: {},
      layers: [
        { role: 'repository', fact: 'dir_has_files', access: { allow: ['final-fixture-ui'], forbid: [] } },
      ],
    },
  });
  assert.ok(findings.some((f) => f.check === 'layer-role' && f.role === 'repository'));
  assert.ok(findings.some((f) => f.check === 'layer-access-unmaterializable' && f.role === 'repository'));
});

test('collectDoctorFindings: generated policy draft difference is info-only', () => {
  const policy = {
    order: ['docs-only', 'rough-fixture-ui'],
    modes: {
      'docs-only': { requires: [], allowed_paths: ['docs/frontend-workflow/**'], forbidden_paths: ['src/**'] },
      'rough-fixture-ui': { requires: [], allowed_paths: [], forbidden_paths: [] },
    },
  };
  const findings = collectDoctorFindings({
    projectRoot: process.cwd(),
    policy,
    layout: {
      roles: {},
      layers: [
        { role: 'view_model', glob: 'src/presentation/{domain}/viewmodels/**', fact: 'dir_has_files', access: { allow: ['rough-fixture-ui'], forbid: [] } },
      ],
    },
  });
  const diff = findings.find((f) => f.check === 'policy-draft-diff');
  assert.ok(diff);
  assert.equal(diff.severity, 'info');
  assert.equal(diff.count, 1);
  assert.equal(findings.some((f) => f.check === 'policy-draft-generate'), false);
});

test('collectDoctorFindings: route-tree route without ScreenSpec mapping is warning-first gap', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-route-screen-gap-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const docsDir = path.join(tmp, 'docs', 'frontend-workflow');
  fs.mkdirSync(path.join(docsDir, '_meta'), { recursive: true });
  fs.writeFileSync(
    path.join(docsDir, '_meta', 'route-tree.txt'),
    '# GENERATED FILE - DO NOT EDIT\n   page.tsx                          route: /profile\n',
    'utf8',
  );

  const findings = collectDoctorFindings({
    projectRoot: tmp,
    docsDir,
    layout: { roles: {}, layers: [] },
  });

  const gap = findings.find((f) => f.check === 'route-screen-mapping-gap');
  assert.ok(gap);
  assert.equal(gap.severity, 'warning');
  assert.equal(gap.route, '/profile');
});

test('collectDoctorFindings: explicit separated route_entry and screen_entry are supported without path-shape warning', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-route-screen-separated-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const docsDir = path.join(tmp, 'docs', 'frontend-workflow');
  fs.mkdirSync(path.join(tmp, 'src', 'app', 'profile'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'src', 'features', 'profile', 'screens'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'src', 'app', 'profile', 'page.tsx'), 'export default function Page() { return null; }\n', 'utf8');
  fs.writeFileSync(path.join(tmp, 'src', 'features', 'profile', 'screens', 'ProfileScreen.tsx'), 'export function ProfileScreen() { return null; }\n', 'utf8');
  fs.mkdirSync(path.join(docsDir, 'domains', 'profile', 'screens', 'profile'), { recursive: true });
  fs.writeFileSync(
    path.join(docsDir, 'domains', 'profile', 'screens', 'profile', 'screen-spec.md'),
    [
      '---',
      'artifact_id: screen-spec-profile',
      'artifact_type: screen-spec',
      'domain: profile',
      'screen_id: PROFILE-001',
      'route: /profile',
      'route_entry: src/app/profile/page.tsx',
      'screen_entry: src/features/profile/screens/ProfileScreen.tsx',
      'status: draft',
      '---',
      '',
    ].join('\n'),
    'utf8',
  );

  const findings = collectDoctorFindings({
    projectRoot: tmp,
    docsDir,
    layout: {
      roles: {
        route_entry: 'src/app/**',
        screen: 'src/features/{domain}/screens/**',
      },
      layers: [],
    },
  });

  assert.equal(findings.some((f) => f.check === 'route-screen-mapping-entry-missing'), false);
  assert.equal(findings.some((f) => f.check === 'route-screen-mapping-gap'), false);
  assert.ok(findings.some((f) => f.check === 'route-screen-mapping-supported'));
});