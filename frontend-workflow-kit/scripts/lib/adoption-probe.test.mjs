import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runAdoptionProbe } from './adoption-probe.mjs';

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

test('runAdoptionProbe renders draft outputs and keeps live docs untouched', (t) => {
  const repo = makeRepo(t);
  const out = path.join(repo, 'temp', 'runs', 'adoption-probe-unit');
  const result = runAdoptionProbe({ repo, out, id: 'unit', date: '2026-06-23', 'skip-f3': true });

  for (const file of [
    'adoption-report.md',
    'project-layout.draft.yaml',
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
  assert.match(fs.readFileSync(path.join(out, 'adoption-report.md'), 'utf8'), /draft-only/);
  assert.match(fs.readFileSync(path.join(out, 'tier3-live-wiring-implementation-note.md'), 'utf8'), /PR-D/);
  assert.equal(result.observation.commands.state.ok, true);
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

  const summary = JSON.parse(fs.readFileSync(path.join(out, 'probe-summary.json'), 'utf8'));
  assert.equal(summary.observations.f3.excluded.some((layer) => layer.path === 'src/presentation/profile/viewmodels'), true);
});

test('runAdoptionProbe rejects output under live docs or source trees', (t) => {
  const repo = makeRepo(t);
  assert.throws(
    () => runAdoptionProbe({ repo, out: path.join(repo, 'docs', 'frontend-workflow', 'probe'), id: 'bad-docs' }),
    /--out must not be inside live docs\/frontend-workflow/,
  );
  assert.throws(
    () => runAdoptionProbe({ repo, out: path.join(repo, 'src', 'probe'), id: 'bad-src' }),
    /--out must not be inside source tree/,
  );
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
