import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { accessSummary, runAdoptionProbe } from './adoption-probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = path.resolve(HERE, '..', '..');
const CLI = path.join(KIT_ROOT, 'scripts', 'adoption-probe.mjs');

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function makeRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adoption-probe-repo-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'probe-target', dependencies: { expo: '^56.0.0', 'expo-router': '^6.0.0' } }, null, 2),
  );
  write(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  write(path.join(root, 'src', 'app', 'profile.tsx'), 'export default function ProfileRoute() { return null; }\n');
  write(path.join(root, 'src', 'shared', 'ui', 'Button.tsx'), 'export function Button() { return null; }\n');
  write(path.join(root, 'src', 'presentation', 'profile', 'screens', 'ProfileScreen.tsx'), 'export function ProfileScreen() { return null; }\n');
  write(path.join(root, 'src', 'presentation', 'profile', 'viewmodels', 'useProfileViewModel.ts'), 'export function useProfileViewModel() { return {}; }\n');
  write(path.join(root, 'src', 'domain', 'profile', 'usecases', 'GetProfileUseCase.ts'), 'export class GetProfileUseCase {}\n');
  write(path.join(root, 'src', 'data', 'profile', 'repositories', 'ProfileRepositoryImpl.ts'), 'export class ProfileRepositoryImpl {}\n');
  write(path.join(root, 'src', 'api', 'schemas', 'profile.schema.ts'), 'export const ProfileSchema = {};\n');
  write(
    path.join(root, 'docs', 'frontend-workflow', 'app', 'navigation-map.md'),
    [
      '---',
      'artifact_id: navigation-map',
      'artifact_type: navigation-map',
      'status: draft',
      '---',
      '',
      '# Navigation Map',
      '',
    ].join('\n'),
  );
  write(
    path.join(root, 'docs', 'frontend-workflow', 'domains', 'profile', 'screens', 'profile', 'screen-spec.md'),
    [
      '---',
      'artifact_id: screen-spec-profile',
      'artifact_type: screen-spec',
      'domain: profile',
      'screen_id: PROFILE-001',
      'route: /profile',
      'status: draft',
      '---',
      '',
      '# Profile',
      '',
      '## State Matrix',
      '| State | UI |',
      '|---|---|',
      '| loading | spinner |',
      '',
    ].join('\n'),
  );
  return root;
}

function makeMinimalRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adoption-probe-minimal-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'probe-minimal', dependencies: { expo: '^56.0.0', 'expo-router': '^6.0.0' } }, null, 2),
  );
  return root;
}
function makeMonorepoRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adoption-probe-monorepo-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'probe-monorepo', dependencies: { expo: '^56.0.0', 'expo-router': '^6.0.0' } }, null, 2),
  );
  write(path.join(root, 'apps', 'mobile', 'src', 'app', 'profile.tsx'), 'export default function ProfileRoute() { return null; }\n');
  write(path.join(root, 'apps', 'mobile', 'src', 'shared', 'ui', 'Button.tsx'), 'export function Button() { return null; }\n');
  write(
    path.join(root, 'apps', 'mobile', 'src', 'presentation', 'profile', 'screens', 'ProfileScreen.tsx'),
    'export function ProfileScreen() { return <Button testID="profile-save" />; }\n',
  );
  write(path.join(root, 'apps', 'mobile', 'src', 'presentation', 'profile', 'viewmodels', 'useProfileViewModel.ts'), 'export function useProfileViewModel() { return {}; }\n');
  write(path.join(root, 'apps', 'mobile', 'src', 'api', 'schemas', 'profile.schema.ts'), 'export const ProfileSchema = {};\n');
  write(
    path.join(root, 'docs', 'frontend-workflow', 'domains', 'profile', 'screens', 'profile', 'screen-spec.md'),
    [
      '---',
      'artifact_id: screen-spec-profile',
      'artifact_type: screen-spec',
      'domain: profile',
      'screen_id: PROFILE-001',
      'route: /profile',
      'status: draft',
      '---',
      '',
      '# Profile',
      '',
      '## State Matrix',
      '| State | UI |',
      '|---|---|',
      '| loading | spinner |',
      '',
    ].join('\n'),
  );
  return root;
}

function makeAppcodeRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adoption-probe-appcode-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'probe-appcode', dependencies: { expo: '^56.0.0', 'expo-router': '^6.0.0' } }, null, 2),
  );
  write(path.join(root, 'appcode', 'presentation', 'profile', 'screens', 'ProfileScreen.tsx'), 'export function ProfileScreen() { return null; }\n');
  write(path.join(root, 'appcode', 'presentation', 'profile', 'viewmodels', 'useProfileViewModel.ts'), 'export function useProfileViewModel() { return {}; }\n');
  write(
    path.join(root, 'docs', 'frontend-workflow', 'domains', 'profile', 'screens', 'profile', 'screen-spec.md'),
    [
      '---',
      'artifact_id: screen-spec-profile',
      'artifact_type: screen-spec',
      'domain: profile',
      'screen_id: PROFILE-001',
      'route: /profile',
      'status: draft',
      '---',
      '',
      '# Profile',
      '',
      '## State Matrix',
      '| State | UI |',
      '|---|---|',
      '| loading | spinner |',
      '',
    ].join('\n'),
  );
  return root;
}

function makeMultiDomainAppcodeRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adoption-probe-appcode-multi-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'probe-appcode-multi', dependencies: { expo: '^56.0.0', 'expo-router': '^6.0.0' } }, null, 2),
  );
  for (const domain of ['profile', 'settings']) {
    const screenName = `${domain[0].toUpperCase()}${domain.slice(1)}Screen`;
    write(path.join(root, 'appcode', 'presentation', domain, 'screens', `${screenName}.tsx`), `export function ${screenName}() { return null; }\n`);
    write(path.join(root, 'appcode', 'presentation', domain, 'viewmodels', `use${screenName}ViewModel.ts`), `export function use${screenName}ViewModel() { return {}; }\n`);
    write(
      path.join(root, 'docs', 'frontend-workflow', 'domains', domain, 'screens', domain, 'screen-spec.md'),
      [
        '---',
        `artifact_id: screen-spec-${domain}`,
        'artifact_type: screen-spec',
        `domain: ${domain}`,
        `screen_id: ${domain.toUpperCase()}-001`,
        `route: /${domain}`,
        'status: draft',
        '---',
        '',
        `# ${screenName}`,
        '',
        '## State Matrix',
        '| State | UI |',
        '|---|---|',
        '| loading | spinner |',
        '',
      ].join('\n'),
    );
  }
  return root;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('runAdoptionProbe renders draft outputs and keeps live docs untouched', (t) => {
  const repo = makeRepo(t);
  const out = path.join(repo, 'temp', 'runs', 'adoption-probe-unit');
  const result = runAdoptionProbe({ repo, out, id: 'unit', date: '2026-06-23', 'skip-f3': true });

  for (const file of [
    'adoption-report.md',
    'project-layout.draft.yaml',
    'implementation-mode-policy.draft.yaml',
    'implementation-mode-policy.migration.md',
    'tier3-gap-report.md',
    'visual-spec-intake-note.md',
    'testid-intake-note.md',
    'tier3-live-wiring-implementation-note.md',
    'probe-summary.json',
  ]) {
    assert.equal(fs.existsSync(path.join(out, file)), true, `${file} should exist`);
  }

  assert.equal(
    fs.existsSync(path.join(repo, 'docs', 'frontend-workflow', '_meta', 'workflow-state.yaml')),
    false,
    'workflow-state must not write to live docs',
  );
  assert.match(fs.readFileSync(path.join(out, 'project-layout.draft.yaml'), 'utf8'), /ui_primitive:\s+"src\/shared\/ui\/\*\*"/);
  assert.match(fs.readFileSync(path.join(out, 'component-catalog.observed.md'), 'utf8'), /src\/shared\/ui\/Button\.tsx/);
  const adoptionReport = fs.readFileSync(path.join(out, 'adoption-report.md'), 'utf8');
  assert.match(adoptionReport, /draft-only/);
  assert.match(adoptionReport, /implementation-mode-policy draft generated/);
  assert.match(adoptionReport, /live policy not replaced/);
  assert.match(adoptionReport, /pre-edit hooks not promoted|pre-edit hooks/);
  assert.match(adoptionReport, /Rendered from templates\/adoption\/adoption-report\.template\.md/);
  assert.match(adoptionReport, /Route \/ Screen Entry Mapping/);
  assert.match(adoptionReport, /observed independent roots/);
  assert.match(adoptionReport, /thin route boundary supported|separate screen\/view files are supported/);
  assert.doesNotMatch(adoptionReport, /\{[A-Z0-9_-]+\}/);
  const tier3Report = fs.readFileSync(path.join(out, 'tier3-gap-report.md'), 'utf8');
  assert.match(tier3Report, /Rendered from templates\/adoption\/tier3-gap-report\.template\.md/);
  assert.match(tier3Report, /readiness_access_wired=true; hard_gate_wired=false|readiness yes \/ hard gate no/);
  assert.match(tier3Report, /policy draft is generated|policy draft/);
  assert.match(tier3Report, /\| F3 \| Complete vs missing layers indistinguishable \| skipped \| not run \|/);
  assert.doesNotMatch(tier3Report, /observed change/);
  assert.doesNotMatch(tier3Report, /\{[A-Z0-9_-]+\}/);
  const layoutDraft = fs.readFileSync(path.join(out, 'project-layout.draft.yaml'), 'utf8');
  assert.match(layoutDraft, /^# project-layout\.yaml — adoption-probe DRAFT \(probe unit, proposal only, scratch-readiness input\)/);
  assert.match(layoutDraft, /catalog-gen loads project-layout/);
  assert.match(layoutDraft, /\nlayers:\n/);
  assert.match(layoutDraft, /role: view_model/);
  assert.doesNotMatch(layoutDraft, /주석으로만|아직 파싱/);
  assert.doesNotMatch(layoutDraft, /hardcod|하드코딩|UI_MARKER/);
  const policyDraft = fs.readFileSync(path.join(out, 'implementation-mode-policy.draft.yaml'), 'utf8');
  assert.match(policyDraft, /src\/presentation\/\{domain\}\/viewmodels\/\*\*/);
  const migrationGuide = fs.readFileSync(path.join(out, 'implementation-mode-policy.migration.md'), 'utf8');
  assert.match(migrationGuide, /Draft only/);
  assert.match(migrationGuide, /Human review is required/);
  const summary = JSON.parse(fs.readFileSync(path.join(out, 'probe-summary.json'), 'utf8'));
  assert.ok(summary.outputs.implementation_policy_draft);
  assert.equal(summary.route_screen_separation.separated, true);
  assert.equal(summary.route_screen_separation.supported, true);
  assert.ok(summary.outputs.implementation_policy_migration);
  assert.equal(summary.invariants.live_policy_replaced, false);
  assert.equal(summary.invariants.pre_edit_hooks_promoted, false);
  assert.ok(summary.layer_inventory);
  assert.equal(summary.layer_inventory.facts.view_model_present, true);
  assert.equal(summary.layer_inventory.layers.some((row) => row.role === 'view_model' && row.readiness_access_wired === true), true);
  assert.match(fs.readFileSync(path.join(out, 'tier3-live-wiring-implementation-note.md'), 'utf8'), /PR-D/);
  assert.equal(result.observation.commands.state.ok, true);
  assert.ok(result.observation.layerInventory);
});

test('runAdoptionProbe reports candidate route/screen defaults as not observed', (t) => {
  const repo = makeMinimalRepo(t);
  const out = path.join(repo, 'temp', 'runs', 'adoption-probe-minimal');
  runAdoptionProbe({ repo, out, id: 'minimal', date: '2026-06-23', 'skip-f3': true });

  const adoptionReport = fs.readFileSync(path.join(out, 'adoption-report.md'), 'utf8');
  assert.match(adoptionReport, /candidate defaults, not observed/);
  assert.match(adoptionReport, /candidate defaults are independent, not observed/);
  assert.doesNotMatch(adoptionReport, /observed independent roots/);

  const summary = JSON.parse(fs.readFileSync(path.join(out, 'probe-summary.json'), 'utf8'));
  assert.equal(summary.route_screen_separation.separated, false);
  assert.equal(summary.route_screen_separation.confirmed, false);
  assert.equal(summary.route_screen_separation.candidate_separated, true);
});
test('runAdoptionProbe honors custom --src for monorepo role, env, and catalog scans', (t) => {
  const repo = makeMonorepoRepo(t);
  const out = path.join(repo, 'temp', 'runs', 'adoption-probe-monorepo');
  const result = runAdoptionProbe({
    repo,
    src: 'apps/mobile/src',
    out,
    id: 'monorepo',
    date: '2026-06-23',
    'skip-f3': true,
  });

  const layout = fs.readFileSync(path.join(out, 'project-layout.draft.yaml'), 'utf8');
  const report = fs.readFileSync(path.join(out, 'adoption-report.md'), 'utf8');
  const summary = fs.readFileSync(path.join(out, 'probe-summary.json'), 'utf8');
  const catalog = fs.readFileSync(path.join(out, 'component-catalog.observed.md'), 'utf8');

  assert.equal(result.roleMap.ui_primitive.glob, 'apps/mobile/src/shared/ui/**');
  assert.match(layout, /ui_primitive:\s+"apps\/mobile\/src\/shared\/ui\/\*\*"/);
  assert.doesNotMatch(layout, /ui_primitive:\s+"src\/components\/ui\/\*\*"/);
  assert.match(catalog, /apps\/mobile\/src\/shared\/ui\/Button\.tsx/);
  assert.equal(result.env.api, 'apps/mobile/src/api');
  assert.match(result.env.testid, /apps\/mobile\/src\/presentation\/profile\/screens\/ProfileScreen\.tsx/);
  assert.doesNotMatch(report, new RegExp(escapeRegExp(repo)));
  assert.doesNotMatch(summary, new RegExp(escapeRegExp(repo)));
  assert.match(summary, /"src_source": "<target-repo>\/apps\/mobile\/src"/);
});

test('CLI --json redacts output paths', (t) => {
  const repo = makeMonorepoRepo(t);
  const out = path.join(repo, 'temp', 'runs', 'adoption-probe-json');
  const r = spawnSync(
    process.execPath,
    [
      CLI,
      '--repo',
      repo,
      '--src',
      'apps/mobile/src',
      '--out',
      out,
      '--id',
      'json',
      '--date',
      '2026-06-23',
      '--skip-f3',
      '--json',
    ],
    { cwd: KIT_ROOT, encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stderr);
  const outputs = JSON.parse(r.stdout);
  assert.equal(outputs.adoption_report, '<probe-run>/adoption-report.md');
  assert.doesNotMatch(r.stdout, new RegExp(escapeRegExp(repo)));
  assert.doesNotMatch(r.stdout, new RegExp(escapeRegExp(out)));
});

test('accessSummary treats forbid-only layer access as readiness wired', () => {
  assert.equal(
    accessSummary({
      role: 'api_boundary',
      access: { allow: [], forbid: ['rough-fixture-ui'] },
      readiness_access_wired: true,
      hard_gate_wired: false,
    }),
    'forbid [rough-fixture-ui]; readiness_access_wired=true; hard_gate_wired=false',
  );
});
test('F3 excludes layers already flattened into built-in roles', (t) => {
  const repo = makeRepo(t);
  const out = path.join(repo, 'temp', 'runs', 'adoption-probe-f3');
  const result = runAdoptionProbe({ repo, out, id: 'f3', date: '2026-06-23' });

  assert.equal(result.f3.status, 'observed');
  assert.equal(result.f3.removed.includes('src/presentation/profile/viewmodels'), false);
  assert.equal(
    result.f3.excluded.some((layer) => layer.path === 'src/presentation/profile/viewmodels' && layer.role === 'hook'),
    true,
  );
  assert.equal(result.f3.removed.some((p) => p.startsWith('src/domain/') || p.startsWith('src/data/')), true);

  const policyDraft = fs.readFileSync(path.join(out, 'implementation-mode-policy.draft.yaml'), 'utf8');
  assert.match(policyDraft, /src\/presentation\/\{domain\}\/viewmodels\/\*\*/);
  const migrationGuide = fs.readFileSync(path.join(out, 'implementation-mode-policy.migration.md'), 'utf8');
  assert.match(migrationGuide, /Draft only/);
  assert.match(migrationGuide, /Human review is required/);
  const summary = JSON.parse(fs.readFileSync(path.join(out, 'probe-summary.json'), 'utf8'));
  assert.equal(summary.observations.f3.excluded.some((layer) => layer.path === 'src/presentation/profile/viewmodels'), true);
  assert.ok(summary.layer_inventory.layers.some((row) => row.role === 'repository' && row.readiness_access_wired === true && row.hard_gate_wired === false));
});

test('F3 excludes flattened built-in roles when custom --src has no literal src segment', (t) => {
  const repo = makeAppcodeRepo(t);
  const out = path.join(repo, 'temp', 'runs', 'adoption-probe-appcode-f3');
  const result = runAdoptionProbe({ repo, src: 'appcode', out, id: 'appcode-f3', date: '2026-06-23' });

  assert.equal(result.roleMap.hook.glob, 'appcode/presentation/{domain}/viewmodels/**');
  assert.equal(result.roleMap.hook.evidence, 'appcode/presentation/profile/viewmodels');
  assert.equal(result.f3.status, 'skipped: all extra layers are flattened into built-in roles');
  assert.equal(result.f3.removed.includes('appcode/presentation/profile/viewmodels'), false);
  assert.equal(
    result.f3.excluded.some((layer) => layer.path === 'appcode/presentation/profile/viewmodels' && layer.role === 'hook'),
    true,
  );
});

test('F3 excludes every matching domain for flattened built-in roles without src segment', (t) => {
  const repo = makeMultiDomainAppcodeRepo(t);
  const out = path.join(repo, 'temp', 'runs', 'adoption-probe-appcode-multi-f3');
  const result = runAdoptionProbe({ repo, src: 'appcode', out, id: 'appcode-multi-f3', date: '2026-06-23' });

  assert.equal(result.roleMap.hook.glob, 'appcode/presentation/{domain}/viewmodels/**');
  assert.equal(result.f3.status, 'skipped: all extra layers are flattened into built-in roles');
  assert.deepEqual(result.f3.removed, []);
  assert.equal(
    result.f3.excluded.some((layer) => layer.path === 'appcode/presentation/profile/viewmodels' && layer.role === 'hook'),
    true,
  );
  assert.equal(
    result.f3.excluded.some((layer) => layer.path === 'appcode/presentation/settings/viewmodels' && layer.role === 'hook'),
    true,
  );
});

test('runAdoptionProbe confines output to temp/runs/adoption-probe-id', (t) => {
  const repo = makeRepo(t);
  assert.throws(
    () => runAdoptionProbe({ repo, out: repo, id: 'root' }),
    /--out must resolve to temp\/runs\/adoption-probe-root/,
  );
  assert.throws(
    () => runAdoptionProbe({ repo, out: path.join(repo, '.github', 'workflows', 'probe'), id: 'ci' }),
    /--out must resolve to temp\/runs\/adoption-probe-ci/,
  );
  assert.throws(
    () => runAdoptionProbe({ repo, out: path.join(repo, 'temp', 'runs', 'probe'), id: 'plain' }),
    /--out must resolve to temp\/runs\/adoption-probe-plain/,
  );
  assert.throws(
    () =>
      runAdoptionProbe({
        repo,
        out: path.join(repo, 'docs', 'frontend-workflow', 'temp', 'runs', 'adoption-probe-bad-docs'),
        id: 'bad-docs',
      }),
    /--out must not be inside live docs\/frontend-workflow/,
  );
  assert.throws(
    () => runAdoptionProbe({ repo, out: path.join(repo, 'src', 'temp', 'runs', 'adoption-probe-bad-src'), id: 'bad-src' }),
    /--out must not be inside source tree/,
  );
});
test('CLI rejects bare value flags with exit 2', () => {
  const r = spawnSync(process.execPath, [CLI, '--repo'], { cwd: KIT_ROOT, encoding: 'utf8' });
  assert.equal(r.status, 2, r.stderr);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /workflow:adoption-probe: --repo requires a value/);
});

test('CLI writes the same draft-only output contract', (t) => {
  const repo = makeRepo(t);
  const out = path.join(repo, 'temp', 'runs', 'adoption-probe-cli');
  const r = spawnSync(
    process.execPath,
    [CLI, '--repo', repo, '--out', out, '--id', 'cli', '--date', '2026-06-23', '--skip-f3'],
    { cwd: KIT_ROOT, encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /workflow:adoption-probe/);
  assert.equal(fs.existsSync(path.join(out, 'adoption-report.md')), true);
  assert.equal(fs.existsSync(path.join(repo, 'docs', 'frontend-workflow', '_meta', 'workflow-state.yaml')), false);
});
