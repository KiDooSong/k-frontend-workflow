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

const VISUAL_FIXTURE = path.join(KIT_ROOT, 'examples', 'adoption-probe', 'visual-auth-family');

// examples/adoption-probe/visual-auth-family 픽스처를 temp repo 로 복제한다
// (테스트 run 출력이 커밋된 픽스처 트리를 오염시키지 않게).
function makeVisualRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adoption-probe-visual-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(VISUAL_FIXTURE, root, { recursive: true });
  return root;
}

const MINIMAL_VISUAL_CONTRACT = [
  '---',
  'artifact_id: "visual-consistency-contract"',
  'artifact_type: visual-consistency-contract',
  'status: draft',
  '---',
  '',
  '# Visual Consistency Contract',
  '',
  '## Screen Families',
  '',
  '| Family | Member Screens | Layout/Shell Owner | Status |',
  '|---|---|---|---|',
  '| auth | AUTH-001, AUTH-002 | AuthShell | draft |',
  '',
  '## Shared Component Rules',
  '',
  '| Component | Owned By | Applies To Families | Direct Screen Import | Positioning Owner |',
  '|---|---|---|---|---|',
  '| BrandLogo | AuthShell | auth | forbidden | shell |',
  '',
].join('\n');

function listFilesRecursive(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
  return out.sort();
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

test('without --visual the probe keeps existing outputs and marks visual observation skipped', (t) => {
  const repo = makeVisualRepo(t);
  const out = path.join(repo, 'temp', 'runs', 'adoption-probe-novisual');
  const result = runAdoptionProbe({ repo, out, id: 'novisual', date: '2026-07-06', 'skip-f3': true });

  assert.equal(result.visual.enabled, false);
  assert.equal(result.visual.status, 'skipped');
  assert.equal(fs.existsSync(path.join(out, 'observations', 'visual-contract-bootstrap.json')), false);
  assert.equal(fs.existsSync(path.join(out, 'observations', 'visual-consistency.json')), false);
  assert.equal(fs.existsSync(path.join(out, 'visual')), false);

  const summary = JSON.parse(fs.readFileSync(path.join(out, 'probe-summary.json'), 'utf8'));
  assert.equal(summary.visual.enabled, false);
  assert.equal(summary.visual.status, 'skipped');
  assert.equal(summary.outputs.visual_contract_bootstrap_draft, undefined);

  const report = fs.readFileSync(path.join(out, 'adoption-report.md'), 'utf8');
  assert.match(report, /## 6\.1 Visual Reconciliation Adoption/);
  assert.match(report, /Status: \*\*skipped\*\* — `--visual` not passed/);
  assert.doesNotMatch(report, /\{[A-Z0-9_-]+\}/);
});

test('CLI --json without --visual keeps the legacy outputs-only payload', (t) => {
  const repo = makeVisualRepo(t);
  const out = path.join(repo, 'temp', 'runs', 'adoption-probe-novisual-json');
  const r = spawnSync(
    process.execPath,
    [CLI, '--repo', repo, '--out', out, '--id', 'novisual-json', '--date', '2026-07-06', '--skip-f3', '--json'],
    { cwd: KIT_ROOT, encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.adoption_report, '<probe-run>/adoption-report.md');
  assert.equal(payload.visual, undefined);
});

test('--visual observes bootstrap + draft-based consistency without touching live docs/src', (t) => {
  const repo = makeVisualRepo(t);
  const out = path.join(repo, 'temp', 'runs', 'adoption-probe-visual');
  const docsRoot = path.join(repo, 'docs');
  const srcRoot = path.join(repo, 'src');
  const docsBefore = listFilesRecursive(docsRoot);
  const srcBefore = listFilesRecursive(srcRoot);
  const signupBefore = fs.readFileSync(path.join(srcRoot, 'features', 'auth', 'SignupScreen.tsx'), 'utf8');

  const result = runAdoptionProbe({ repo, out, id: 'visual', date: '2026-07-06', 'skip-f3': true, visual: true });

  assert.equal(result.visual.enabled, true);
  assert.equal(result.visual.status, 'observed');
  assert.equal(result.visual.bootstrap.ok, true);
  assert.equal(result.visual.bootstrap.screens, 2);
  assert.equal(result.visual.bootstrap.candidate_families, 1);
  assert.equal(result.visual.bootstrap.component_gap_candidates, 1);
  assert.equal(result.visual.bootstrap.existing_contract.found, false);
  assert.equal(result.visual.consistency.ran, true);
  assert.equal(result.visual.consistency.contract_source, 'bootstrap-draft');
  assert.equal(result.visual.consistency.advisory_draft_contract, true);
  assert.equal(result.visual.consistency.errors, 0);
  assert.ok(result.visual.consistency.warnings >= 1, 'figma-mapping-missing should surface as warning');
  assert.ok(result.visual.consistency.top_rules.includes('figma-mapping-missing (1)'));

  for (const file of [
    ['observations', 'visual-contract-bootstrap.json'],
    ['observations', 'visual-contract-bootstrap.stdout.txt'],
    ['observations', 'visual-consistency.json'],
    ['visual', 'visual-consistency-contract.draft.md'],
  ]) {
    assert.equal(fs.existsSync(path.join(out, ...file)), true, `${file.join('/')} should exist`);
  }
  const draft = fs.readFileSync(path.join(out, 'visual', 'visual-consistency-contract.draft.md'), 'utf8');
  assert.match(draft, /status: draft/);
  assert.match(draft, /REVIEW-ONLY DRAFT/);
  assert.match(draft, /AuthShell/);

  const summary = JSON.parse(fs.readFileSync(path.join(out, 'probe-summary.json'), 'utf8'));
  assert.equal(summary.visual.enabled, true);
  assert.equal(summary.visual.status, 'observed');
  assert.equal(summary.visual.gate, false);
  assert.equal(summary.visual.draft_only, true);
  assert.equal(summary.visual.bootstrap.draft_path, '<probe-run>/visual/visual-consistency-contract.draft.md');
  assert.equal(summary.visual.observations.bootstrap, '<probe-run>/observations/visual-contract-bootstrap.json');
  assert.equal(summary.visual.observations.consistency, '<probe-run>/observations/visual-consistency.json');
  assert.equal(summary.outputs.visual_contract_bootstrap_draft, '<probe-run>/visual/visual-consistency-contract.draft.md');
  assert.ok(summary.visual.next_actions.some((a) => /Review the bootstrap draft/.test(a)));

  const report = fs.readFileSync(path.join(out, 'adoption-report.md'), 'utf8');
  assert.match(report, /## 6\.1 Visual Reconciliation Adoption/);
  assert.match(report, /Status: \*\*observed\*\*/);
  assert.match(report, /bootstrap-draft contract \(advisory/);
  assert.match(report, /not a gate/);
  assert.match(report, /never auto-applied to the canonical contract/);
  assert.doesNotMatch(report, /\{[A-Z0-9_-]+\}/);

  // 관측 파일은 sanitized 되어야 한다 — 머신 절대 경로가 남지 않는다.
  const observation = fs.readFileSync(path.join(out, 'observations', 'visual-contract-bootstrap.json'), 'utf8');
  assert.doesNotMatch(observation, new RegExp(escapeRegExp(repo)));
  assert.doesNotMatch(observation, new RegExp(escapeRegExp(repo.split(path.sep).join('/'))));
  assert.match(observation, /<probe-run>\/scratch\/project\/docs\/frontend-workflow/);

  // live docs/src 무수정 (파일 목록·내용 그대로, canonical contract 미생성).
  assert.deepEqual(listFilesRecursive(docsRoot), docsBefore);
  assert.deepEqual(listFilesRecursive(srcRoot), srcBefore);
  assert.equal(fs.readFileSync(path.join(srcRoot, 'features', 'auth', 'SignupScreen.tsx'), 'utf8'), signupBefore);
  assert.equal(
    fs.existsSync(path.join(repo, 'docs', 'frontend-workflow', 'design', 'visual-consistency-contract.md')),
    false,
    'bootstrap draft must never be applied to the canonical contract path',
  );
});

test('--visual uses an existing canonical contract as the consistency baseline without overwriting it', (t) => {
  const repo = makeVisualRepo(t);
  const contractPath = path.join(repo, 'docs', 'frontend-workflow', 'design', 'visual-consistency-contract.md');
  write(contractPath, MINIMAL_VISUAL_CONTRACT);
  const out = path.join(repo, 'temp', 'runs', 'adoption-probe-visual-existing');

  const result = runAdoptionProbe({ repo, out, id: 'visual-existing', date: '2026-07-06', 'skip-f3': true, visual: true });

  assert.equal(result.visual.status, 'observed');
  assert.equal(result.visual.bootstrap.existing_contract.found, true);
  assert.ok(result.visual.bootstrap.warnings >= 1, 'existing-contract-not-overwritten warning expected');
  assert.equal(result.visual.consistency.ran, true);
  assert.equal(result.visual.consistency.contract_source, 'existing');
  assert.equal(result.visual.consistency.advisory_draft_contract, false);
  // 기존 contract 기준이므로 forbidden BrandLogo 직접 import 가 warning 으로 잡힌다.
  assert.ok(result.visual.consistency.top_rules.some((rule) => /direct-screen-import/.test(rule)));

  // draft 는 여전히 suggested-additions 용으로 run dir 에만 쓰인다; canonical 은 그대로.
  assert.equal(fs.existsSync(path.join(out, 'visual', 'visual-consistency-contract.draft.md')), true);
  assert.equal(fs.readFileSync(contractPath, 'utf8'), MINIMAL_VISUAL_CONTRACT);

  const report = fs.readFileSync(path.join(out, 'adoption-report.md'), 'utf8');
  assert.match(report, /used as consistency baseline; bootstrap emits suggested additions only \(no overwrite\)/);
});

test('--visual-domain narrows the bootstrap scan and --skip-visual-consistency skips the consistency run', (t) => {
  const repo = makeVisualRepo(t);
  const out = path.join(repo, 'temp', 'runs', 'adoption-probe-visual-domain');
  const result = runAdoptionProbe({
    repo,
    out,
    id: 'visual-domain',
    date: '2026-07-06',
    'skip-f3': true,
    visual: true,
    'visual-domain': 'billing',
    'skip-visual-consistency': true,
  });

  // billing 도메인 화면이 없으므로 필터가 bootstrap 까지 전달됐다는 관측이 screens=0.
  assert.equal(result.visual.bootstrap.screens, 0);
  const observation = JSON.parse(
    fs.readFileSync(path.join(out, 'observations', 'visual-contract-bootstrap.json'), 'utf8'),
  );
  assert.ok(observation.args.includes('--domain'), 'bootstrap invocation should carry --domain');
  assert.ok(observation.args.includes('billing'));

  assert.equal(result.visual.consistency.ran, false);
  assert.equal(result.visual.consistency.contract_source, 'skipped');
  assert.match(result.visual.consistency.reason, /--skip-visual-consistency/);
  assert.equal(fs.existsSync(path.join(out, 'observations', 'visual-consistency.json')), false);
});

test('visual command failure records findings without hard-failing the probe', (t) => {
  const repo = makeVisualRepo(t);
  // 기존 contract 를 malformed 로 만들어 bootstrap/consistency 둘 다 구조 오류 exit 1 을 내게 한다.
  write(
    path.join(repo, 'docs', 'frontend-workflow', 'design', 'visual-consistency-contract.md'),
    ['---', 'artifact_id: [unclosed', '---', '', '# broken contract', ''].join('\n'),
  );
  const out = path.join(repo, 'temp', 'runs', 'adoption-probe-visual-broken');
  const r = spawnSync(
    process.execPath,
    [CLI, '--repo', repo, '--out', out, '--id', 'visual-broken', '--date', '2026-07-06', '--skip-f3', '--visual', '--json'],
    { cwd: KIT_ROOT, encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stderr);

  const payload = JSON.parse(r.stdout);
  assert.equal(payload.visual.status, 'failed');
  assert.ok(payload.visual.findings.some((f) => f.rule === 'visual-bootstrap-failed'));
  assert.equal(payload.visual.bootstrap.draft_path, null);
  assert.equal(fs.existsSync(path.join(out, 'adoption-report.md')), true);
  assert.equal(fs.existsSync(path.join(out, 'probe-summary.json')), true);
});

test('CLI --json with --visual redacts visual paths', (t) => {
  const repo = makeVisualRepo(t);
  const out = path.join(repo, 'temp', 'runs', 'adoption-probe-visual-json');
  const r = spawnSync(
    process.execPath,
    [CLI, '--repo', repo, '--out', out, '--id', 'visual-json', '--date', '2026-07-06', '--skip-f3', '--visual', '--json'],
    { cwd: KIT_ROOT, encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.visual.status, 'observed');
  assert.equal(payload.visual.bootstrap.draft_path, '<probe-run>/visual/visual-consistency-contract.draft.md');
  assert.equal(payload.visual.bootstrap.existing_contract.path, '<target-repo>/docs/frontend-workflow/design/visual-consistency-contract.md');
  assert.equal(payload.visual_contract_bootstrap_draft, '<probe-run>/visual/visual-consistency-contract.draft.md');
  assert.doesNotMatch(r.stdout, new RegExp(escapeRegExp(repo)));
  assert.doesNotMatch(r.stdout, new RegExp(escapeRegExp(out)));
});

test('visual observation output is deterministic across identical repos', (t) => {
  const repoA = makeVisualRepo(t);
  const repoB = makeVisualRepo(t);
  const summaries = [];
  const observations = [];
  for (const repo of [repoA, repoB]) {
    const out = path.join(repo, 'temp', 'runs', 'adoption-probe-visual-det');
    runAdoptionProbe({ repo, out, id: 'visual-det', date: '2026-07-06', 'skip-f3': true, visual: true });
    summaries.push(JSON.parse(fs.readFileSync(path.join(out, 'probe-summary.json'), 'utf8')).visual);
    observations.push(fs.readFileSync(path.join(out, 'observations', 'visual-contract-bootstrap.json'), 'utf8'));
  }
  assert.deepEqual(summaries[0], summaries[1]);
  assert.equal(observations[0], observations[1]);
});

test('visual sub-flags require --visual', (t) => {
  const repo = makeVisualRepo(t);
  const out = path.join(repo, 'temp', 'runs', 'adoption-probe-visual-guard');
  assert.throws(
    () => runAdoptionProbe({ repo, out, id: 'visual-guard', 'visual-domain': 'auth' }),
    /--visual-domain requires --visual/,
  );
  const r = spawnSync(
    process.execPath,
    [CLI, '--repo', repo, '--out', out, '--id', 'visual-guard', '--skip-visual-consistency'],
    { cwd: KIT_ROOT, encoding: 'utf8' },
  );
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /--skip-visual-consistency requires --visual/);
});
