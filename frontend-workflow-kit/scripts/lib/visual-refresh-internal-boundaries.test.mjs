import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { KIT_ROOT, yamlParse, yamlStringify } from './util.mjs';
import { canonicalManifestPattern, canonicalRepositoryPath, resolveManifestFiles } from './artifact-path.mjs';
import { captureWorkflowJson, WORKFLOW_JSON_MAX_BYTES } from './workflow-json-capture.mjs';
import { visualChangedRecords } from './visual-refresh-records.mjs';

const CLI = Object.fromEntries([
  ['readiness', 'readiness.mjs'], ['backstop', 'forbidden-paths.mjs'],
  ['packet', 'workflow-packet.mjs'], ['report', 'workflow-report.mjs'],
  ['run', 'workflow-run.mjs'], ['validate', 'validate.mjs'],
].map(([key, file]) => [key, path.join(KIT_ROOT, 'scripts', file)]));
const SCREEN = 'SHOP-HOME';
const INPUT = 'IN-20260904-figma-001';
const ENTRY = 'src/features/shop/screens/ShopScreen.tsx';
const DOCS = 'docs/frontend-workflow';
const SPEC = `${DOCS}/domains/shop/screens/shop-home/screen-spec.md`;
const MODE = ['--requested-mode', 'api-integrated-ui', '--date', '2026-09-07'];
const HEADER = '// GENERATED FILE — DO NOT EDIT\n';

function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-internal-boundaries-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, relative, content) {
  const file = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}
function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function run(key, args, cwd) {
  // The harness must not impose the very 1 MiB truncation being tested.
  return spawnSync(process.execPath, [CLI[key], ...args], {
    cwd, encoding: 'utf8', timeout: 120_000, maxBuffer: 96 * 1024 * 1024,
  });
}
function json(result, expected = 0) {
  assert.equal(result.status, expected, (result.stderr || result.stdout).slice(0, 3000));
  return JSON.parse(result.stdout);
}
function tuple(root) {
  return ['--root', root, '--screen', SCREEN, '--intent', 'visual-refresh', '--input', INPUT, '--path', ENTRY, '--json'];
}
function reportTuple(root) {
  return ['--root', root, '--intent', 'visual-refresh', '--input', INPUT, '--path', ENTRY, '--staged', '--json'];
}
function baseline(repo, message = 'authority baseline') {
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', message);
}
function fixture(t, { prefix = '', commit = true } = {}) {
  const repo = temporary(t);
  git(repo, 'init');
  git(repo, 'config', 'user.name', 'Visual Boundary Test');
  git(repo, 'config', 'user.email', 'visual-boundary@example.com');
  const project = prefix ? path.join(repo, prefix) : repo;
  fs.mkdirSync(project, { recursive: true });
  write(project, `${DOCS}/app/navigation-map.md`, '---\nartifact_id: navigation-map\nartifact_type: navigation-map\nstatus: draft\n---\n');
  write(project, `${DOCS}/design/component-catalog.md`, '# GENERATED FILE - DO NOT EDIT\n\n| Name | Source | Export | Status |\n|---|---|---|---|\n');
  const states = ['loading', 'empty', 'error', 'success', 'disabled', 'refreshing']
    .map((state) => `| ${state} | fixture | ${state} UI | none |`).join('\n');
  write(project, SPEC, `---
artifact_id: SHOP-HOME-screen-spec
artifact_type: screen-spec
domain: shop
screen_id: ${SCREEN}
route: /shop
screen_entry: ${ENTRY}
status: confirmed
---

# Shop

## Purpose

Render shop.

## State Matrix

| State | Trigger | UI | User Action |
|---|---|---|---|
${states}

## API Candidates

| Method | Path | Confidence | Gate | Tracking | Slice Paths |
|---|---|---|---|---|---|
| GET | /shop | confirmed | active | - | src/features/shop/hooks/useShop.ts |

## Unknowns

없음
`);
  write(project, `${DOCS}/domains/shop/screens/shop-home/figma-component-mapping.md`, `---
artifact_id: SHOP-HOME-figma-component-mapping
artifact_type: figma-component-mapping
domain: shop
screen_id: ${SCREEN}
status: draft
sources:
  - type: figma
    ref: "figma://file/shop/frame/10:20"
last_reviewed: "2026-09-04"
provenance_contract: 1
---

## Frame

- figma://file/shop/frame/10:20

## Component Mapping

| Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고 |
|---|---|---|---|
| \`M-001\` · Shop / node \`1:234\` | Card | components/ui/Card | spacing |

## Mapping Provenance

| Mapping Key | Source Ref | Source Unit | Captured At | Evidence |
|---|---|---|---|---|
| M-001 | figma://file/shop/node/1:234 | instance | inherit | input:${INPUT}#extracted-facts/01 |
`);
  write(project, `${DOCS}/inputs/shop/${INPUT}.md`, `---
input_id: ${INPUT}
input_type: figma
source_type: figma
source_ref: "figma://file/shop/frame/10:20"
captured_at: "2026-09-04T09:00:00+09:00"
captured_by: internal-boundary-test
status: captured
affected_domains: [shop]
affected_screens: [${SCREEN}]
confidence: confirmed
supersedes: null
---

## Extracted Facts

- The primary card spacing is 16px.
`);
  write(project, `${DOCS}/_meta/reconciliation-register.md`, `---
title: Reconciliation Register
status: draft
kind: meta-register
reconciliation_contract: 2
review_profile: reconcile-stage04-v1
structured_since: "2026-09-01T00:00:00+09:00"
---

# Reconciliation Register

| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
| ${INPUT} | figma | simple-update | reconciled | accepted | artifact:SHOP-HOME-figma-component-mapping | - | - |

## Reconciliation Items

| Input ID | Item | Basis | Classification | Effect | Target | Evidence | Source Ref | Source Unit | Captured At |
|---|---|---|---|---|---|---|---|---|---|
| ${INPUT} | 01 | visual-evidence | simple-update | update | artifact:SHOP-HOME-figma-component-mapping#component-mapping/M-001 | input:${INPUT}#extracted-facts/01 | figma://file/shop/node/1:234 | instance | inherit |
`);
  write(project, ENTRY, 'export const ShopScreen = () => null;\n');
  write(project, 'src/features/shop/hooks/useShop.ts', 'export const useShop = () => ({});\n');
  if (commit) baseline(repo);
  return { repo, project, prefix };
}
function manifest(project, value, field = 'path') {
  const data = yamlParse(fs.readFileSync(path.join(KIT_ROOT, 'catalog/artifact-manifest.yaml'), 'utf8'));
  const entry = { kind: 'generated', generated: true, do_not_edit: true, status: 'planned' };
  if (field === 'path') entry.path = value;
  else entry.outputs = field === 'output-string' ? [value] : [{ path: value }];
  data.artifacts['review-generated-screen'] = entry;
  write(project, 'config/manifest.yaml', yamlStringify(data, { lineWidth: 0 }));
}
function caseAlias(t, root, canonical, alias) {
  let same = false;
  try {
    const a = fs.statSync(path.join(root, canonical), { bigint: true });
    const b = fs.statSync(path.join(root, alias), { bigint: true });
    same = a.dev === b.dev && a.ino === b.ino;
  } catch {}
  if (process.platform === 'darwin' && process.env.CI) assert.equal(same, true, 'macOS must execute case-alias regressions');
  if (!same) t.skip('case-insensitive filesystem required');
  return same;
}
function assertManifestRejected(repo, project) {
  const args = [...tuple(project), '--manifest', 'config/manifest.yaml'];
  const forward = run('readiness', args, repo);
  assert.equal(forward.status, 2, forward.stdout);
  assert.match(forward.stderr, /manifest|generated:|repository|symlink|segment|spelling/);
  write(project, ENTRY, HEADER + 'export const ShopScreen = () => "changed";\n');
  git(repo, 'add', path.relative(repo, path.join(project, ENTRY)));
  const backstop = run('backstop', [...args, '--staged', '--enforce'], repo);
  assert.equal(backstop.status, 2, backstop.stdout);
  const validation = json(run('validate', [
    '--root', project, '--docs', path.join(project, DOCS), '--src', path.join(project, 'src'),
    '--manifest', path.join(project, 'config/manifest.yaml'), '--json',
  ], repo), 1);
  assert.ok(validation.errors.some((error) => error.check === 6 && error.message.includes('WF-ARTIFACT-PATH')), JSON.stringify(validation.errors));
}

for (const field of ['path', 'output-object', 'output-string']) {
  for (const spelling of [
    'src/features/shop/screens/../screens/ShopScreen.tsx',
    'src/features/shop/screens/./ShopScreen.tsx',
    'src/features/shop//screens/ShopScreen.tsx',
    'src\\features\\shop\\screens\\ShopScreen.tsx',
    '/src/features/shop/screens/ShopScreen.tsx',
  ]) {
    test(`manifest ${field} rejects internal alias ${spelling} in validate, forward and staged CLI`, (t) => {
      const { repo, project } = fixture(t);
      manifest(project, spelling, field);
      write(project, ENTRY, HEADER + 'export const ShopScreen = () => null;\n');
      baseline(repo, 'manifest declaration predates visual diff');
      assertManifestRejected(repo, project);
    });
  }
}

for (const field of ['path', 'output-object']) {
  test(`manifest ${field} case-only alias cannot shed generated ownership`, (t) => {
    const { repo, project } = fixture(t);
    const alias = ENTRY.replace('ShopScreen', 'shopscreen');
    if (!caseAlias(t, project, ENTRY, alias)) return;
    manifest(project, alias, field);
    write(project, ENTRY, HEADER + 'export const ShopScreen = () => null;\n');
    baseline(repo, 'case manifest baseline');
    assertManifestRejected(repo, project);
  });
  test(`manifest ${field} intermediate symlink cannot shed generated ownership`, { skip: process.platform === 'win32' }, (t) => {
    const { repo, project } = fixture(t);
    fs.symlinkSync('.', path.join(project, 'src/features/shop/screens/link'));
    manifest(project, 'src/features/shop/screens/link/ShopScreen.tsx', field);
    write(project, ENTRY, HEADER + 'export const ShopScreen = () => null;\n');
    baseline(repo, 'symlink manifest baseline');
    assertManifestRejected(repo, project);
  });
}

test('manifest wildcard static and post-placeholder aliases use the same resolver', { skip: process.platform === 'win32' }, (t) => {
  const { repo, project } = fixture(t);
  fs.symlinkSync('.', path.join(project, 'src/features/shop/screens/link'));
  manifest(project, 'src/features/{domain}/screens/link/*.tsx', 'output-object');
  write(project, ENTRY, HEADER + 'export const ShopScreen = () => null;\n');
  baseline(repo);
  assertManifestRejected(repo, project);
  for (const pattern of ['src/features/shop/screens/../screens/*.tsx', 'src/**bad/file.ts', 'src/{a,b}/file.ts']) {
    assert.throws(() => canonicalManifestPattern(pattern));
  }
});

test('valid canonical generated marker is denied, while an unmarked canonical screen stays editable', (t) => {
  const { repo, project } = fixture(t);
  manifest(project, ENTRY);
  baseline(repo);
  const args = [...tuple(project), '--manifest', 'config/manifest.yaml'];
  assert.equal(json(run('readiness', args, repo)).path_authorization.allowed, true);
  write(project, ENTRY, HEADER + 'export const ShopScreen = () => "generated";\n');
  const forward = json(run('readiness', args, repo));
  assert.equal(forward.intent_authorization.applicable, false);
  assert.ok(forward.intent_authorization.reasons.some((reason) => reason.code === 'VR-PATH-001'));
  git(repo, 'add', ENTRY);
  const backstop = json(run('backstop', [...args, '--staged', '--enforce'], repo), 1);
  assert.equal(backstop.ok, false);
  assert.ok(backstop.intent_authorization.reasons.some((reason) => reason.code === 'VR-PATH-001'));
});

for (const kind of ['case', 'symlink']) {
  test(`selected screen_entry itself cannot authorize its ${kind} alias`, { skip: kind === 'symlink' && process.platform === 'win32' }, (t) => {
    const { repo, project } = fixture(t);
    const alias = kind === 'case' ? ENTRY.replace('ShopScreen', 'shopscreen') : 'src/features/shop/screens/link/ShopScreen.tsx';
    if (kind === 'case' && !caseAlias(t, project, ENTRY, alias)) return;
    if (kind === 'symlink') fs.symlinkSync('.', path.join(project, 'src/features/shop/screens/link'));
    const file = path.join(project, SPEC);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(`screen_entry: ${ENTRY}`, `screen_entry: ${alias}`));
    baseline(repo, 'one selected owner, no co-owner');
    const args = [...tuple(project), '--path', alias];
    const forward = run('readiness', args, repo);
    assert.equal(forward.status, 2, forward.stdout);
    assert.match(forward.stderr, /spelling|symlink/);
    write(project, ENTRY, 'export const ShopScreen = () => "canonical staged path";\n');
    git(repo, 'add', ENTRY);
    assert.equal(git(repo, 'diff', '--cached', '--name-only'), ENTRY);
    const backstop = run('backstop', [...args, '--staged', '--enforce'], repo);
    assert.equal(backstop.status, 2, backstop.stdout);
    assert.match(backstop.stderr, /spelling|symlink/);
  });
}

test('canonical path resolver retains concrete dynamic-route bracket and brace filenames', (t) => {
  const root = temporary(t);
  for (const file of ['src/[slug].tsx', 'src/{literal}.tsx']) {
    write(root, file, 'export {};\n');
    assert.equal(canonicalRepositoryPath(root, file, { required: true, type: 'file' }).relative, file);
  }
  assert.equal(resolveManifestFiles(root, 'src/[slug].tsx').length, 1);
});

for (const kind of ['missing-input', 'missing-screen', 'no-head', 'invalid-screen-identity']) {
  test(`${kind} preserves original applicability reasons as a normal Packet/Run stop`, (t) => {
    const { repo, project } = fixture(t, { commit: kind !== 'no-head' });
    const args = tuple(project);
    if (kind === 'missing-input') args.push('--input', 'IN-NOT-FOUND');
    if (kind === 'missing-screen') args.push('--screen', 'MISSING-SCREEN');
    if (kind === 'invalid-screen-identity') {
      const file = path.join(project, SPEC);
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(`screen_entry: ${ENTRY}\n`, ''));
    }
    const direct = json(run('readiness', args, repo));
    assert.equal(direct.intent_authorization.applicable, false);
    assert.ok(direct.intent_authorization.reasons.length);
    assert.ok(direct.visual_refresh_audit);
    assert.equal(direct.visual_refresh_audit.path_allowed, false);
    const packetPath = path.join(project, 'tmp/negative-packet.md');
    const packet = json(run('packet', [...args, ...MODE, '--out', packetPath], repo));
    assert.equal(packet.packet_applicable, false);
    assert.equal(packet.non_executable, true);
    assert.equal(packet.readiness_mode, null);
    assert.deepEqual(packet.visual_refresh.reasons, direct.intent_authorization.reasons);
    const result = json(run('run', [...args, ...MODE], repo));
    assert.equal(result.state, 'HALT_AMBIGUITY');
    assert.equal(result.exit, 0);
    assert.equal(result.report, null);
    assert.deepEqual(result.visual_prework.reasons, direct.intent_authorization.reasons);
    const directory = path.join(project, 'tmp/negative-run');
    const persisted = json(run('run', [...args, ...MODE, '--out', directory], repo));
    assert.equal(persisted.state, 'HALT_AMBIGUITY');
    const markdown = fs.readFileSync(directory + '.md', 'utf8');
    for (const reason of direct.intent_authorization.reasons) assert.ok(markdown.includes(reason.code));
    assert.equal(fs.existsSync(path.join(directory, 'run-report.md')), false);
  });
}

function packetFor(project, cwd) {
  const packet = path.join(project, 'tmp/work-packet.md');
  const result = json(run('packet', [...tuple(project), ...MODE, '--out', packet], cwd));
  assert.equal(result.visual_refresh.path_allowed, true);
  return packet;
}

test('outside-root-only diff remains present in Report JSON and Markdown', (t) => {
  const { repo, project } = fixture(t, { prefix: 'packages/mobile' });
  const packet = packetFor(project, repo);
  const outsidePath = 'packages/other/outside.ts';
  write(repo, outsidePath, 'export {};\n');
  git(repo, 'add', 'packages/other');
  const backstop = json(run('backstop', [...tuple(project), '--staged'], repo));
  assert.equal(backstop.ok, false);
  assert.equal(backstop.changed_records.length, 1);
  assert.equal(backstop.changed_records[0].repository_path, outsidePath);
  assert.equal(backstop.changed_records[0].project_path, null);
  assert.equal(backstop.changed_records[0].outside_selected_root, true);
  const reportFile = path.join(project, 'tmp/outside-report.md');
  const report = json(run('report', [...reportTuple(project), '--packet', packet, '--out', reportFile], repo));
  assert.deepEqual(report.forbidden.changed_records, backstop.changed_records);
  assert.equal(report.changed_files[0].repository_path, outsidePath);
  const markdown = fs.readFileSync(reportFile, 'utf8');
  assert.ok(markdown.includes(outsidePath));
  assert.ok(!markdown.includes('(none observed)'));
});

for (const direction of ['out', 'in']) {
  test(`cross-root rename ${direction} retains both snapshot endpoints and the original record`, (t) => {
    const { repo, project } = fixture(t, { prefix: 'packages/mobile' });
    const a = direction === 'out' ? 'packages/mobile/notes.txt' : 'packages/other/notes.txt';
    const b = direction === 'out' ? 'packages/other/notes.txt' : 'packages/mobile/notes.txt';
    write(repo, a, 'unique cross-root rename evidence\n');
    baseline(repo, 'rename source baseline');
    const packet = packetFor(project, repo);
    fs.mkdirSync(path.dirname(path.join(repo, b)), { recursive: true });
    git(repo, 'mv', a, b);
    const backstop = json(run('backstop', [...tuple(project), '--staged'], repo));
    assert.equal(backstop.ok, false);
    assert.equal(backstop.changed_records.length, 1);
    const record = backstop.changed_records[0];
    assert.equal(record.status, 'R');
    assert.equal(record.old_path_identity.repository_path, a);
    assert.equal(record.new_path_identity.repository_path, b);
    assert.equal(record.old_path_identity.outside_selected_root, direction === 'in');
    assert.equal(record.new_path_identity.outside_selected_root, direction === 'out');
    assert.equal(record.repository_record.oldPath, a);
    assert.equal(record.repository_record.newPath, b);
    const report = json(run('report', [...reportTuple(project), '--packet', packet], repo));
    assert.deepEqual(report.forbidden.changed_records, backstop.changed_records);
    assert.equal(report.changed_files.length, 1);
    assert.equal(report.changed_files[0].old_path, record.oldPath);
    assert.equal(report.changed_files[0].new_path, record.newPath);
  });
}

test('copy audit also preserves cross-root identities without mutating resolver records', () => {
  const records = [{ status: 'C', raw: 'C100', oldPath: 'packages/mobile/source.ts', newPath: 'packages/other/destination.ts' }];
  const before = JSON.stringify(records);
  const [record] = visualChangedRecords(records, 'packages/mobile');
  assert.equal(record.old_path_identity.project_path, 'source.ts');
  assert.equal(record.new_path_identity.project_path, null);
  assert.equal(record.outside_selected_root, true);
  assert.deepEqual(record.repository_record, records[0]);
  assert.equal(JSON.stringify(records), before);
});

test('actual visual diff JSON above 1 MiB survives Backstop -> Report -> Run intact', (t) => {
  const { repo, project } = fixture(t, { prefix: 'packages/mobile' });
  const packet = packetFor(project, repo);
  const count = 2200;
  for (let index = 0; index < count; index++) {
    write(repo, `packages/other/${'long-path-'.repeat(17)}${String(index).padStart(4, '0')}.ts`, 'export {};\n');
  }
  git(repo, 'add', 'packages/other');
  const backstopResult = run('backstop', [...tuple(project), '--staged'], repo);
  const backstop = json(backstopResult);
  assert.ok(Buffer.byteLength(backstopResult.stdout) > 1024 * 1024, 'actual backstop output must exceed 1 MiB');
  assert.equal(backstop.changed_records.length, count);
  assert.equal(backstop.violations.length, count);
  assert.ok(backstop.violations.every((violation) => violation.code === 'VR-BACKSTOP-002'));
  const reportResult = run('report', [...reportTuple(project), '--packet', packet], repo);
  const report = json(reportResult);
  assert.ok(Buffer.byteLength(reportResult.stdout) > 1024 * 1024);
  assert.equal(report.forbidden.status, 'fail');
  assert.equal(report.forbidden.ok, false);
  assert.equal(report.json_transport_limit_bytes, WORKFLOW_JSON_MAX_BYTES);
  assert.deepEqual(report.forbidden.changed_records, backstop.changed_records);
  assert.deepEqual(report.forbidden.violations, backstop.violations);
  const runResult = run('run', [...tuple(project), ...MODE, '--staged'], repo);
  const result = json(runResult);
  assert.ok(Buffer.byteLength(runResult.stdout) > 1024 * 1024);
  assert.equal(result.state, 'DONE_PENDING_REVIEW');
  assert.equal(result.forbidden.status, 'fail');
  assert.equal(result.json_transport_limit_bytes, WORKFLOW_JSON_MAX_BYTES);
  assert.deepEqual(result.forbidden.changed_records, backstop.changed_records);
  assert.deepEqual(result.changed_files, report.changed_files);
  assert.deepEqual(result.forbidden.diff_context, backstop.diff_context);
});

test('JSON file transport has explicit size, syntax, child-error and cleanup contracts', (t) => {
  const root = temporary(t);
  const emitter = write(root, 'emitter.mjs', "process.stdout.write(JSON.stringify({value:'x'.repeat(Number(process.argv[2]))}));\n");
  const large = captureWorkflowJson(emitter, [String(2 * 1024 * 1024)], { cwd: root });
  assert.equal(large.code, 0, large.stderr);
  assert.equal(large.json.value.length, 2 * 1024 * 1024);
  assert.equal(large.capture_error, null);
  const exactBytes = Buffer.byteLength(JSON.stringify({ value: 'x'.repeat(100) }));
  assert.equal(captureWorkflowJson(emitter, ['100'], { cwd: root, maxBytes: exactBytes }).code, 0);
  const overflow = captureWorkflowJson(emitter, ['100'], { cwd: root, maxBytes: exactBytes - 1 });
  assert.equal(overflow.code, 2);
  assert.equal(overflow.json, null);
  assert.equal(overflow.capture_error.code, 'WF-JSON-OUTPUT-LIMIT');
  assert.equal(overflow.capture_error.observed_bytes, exactBytes);
  assert.equal(overflow.capture_error.limit_bytes, exactBytes - 1);
  const stderrEmitter = write(root, 'stderr.mjs', "process.stderr.write('x'.repeat(2048)); process.stdout.write('{}');\n");
  const stderrLimit = captureWorkflowJson(stderrEmitter, [], { cwd: root, maxBytes: 1024 });
  assert.equal(stderrLimit.capture_error.code, 'WF-JSON-OUTPUT-LIMIT');
  assert.equal(stderrLimit.capture_error.stream, 'stderr');
  const invalid = write(root, 'invalid.mjs', "process.stdout.write('not-json');\n");
  assert.equal(captureWorkflowJson(invalid, [], { cwd: root }).capture_error.code, 'WF-JSON-MALFORMED');
  const error = write(root, 'error.mjs', "process.stdout.write(JSON.stringify({tool_error:{code:'TEST'}})); process.exitCode=2;\n");
  const errorResult = captureWorkflowJson(error, [], { cwd: root });
  assert.equal(errorResult.code, 2);
  assert.equal(errorResult.json.tool_error.code, 'TEST');
  // No capture files are left in the caller's project; all scratch is private.
  assert.deepEqual(fs.readdirSync(root).sort(), ['emitter.mjs', 'error.mjs', 'invalid.mjs', 'stderr.mjs']);
});
