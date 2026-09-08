import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  materializeRawGitTree, requireGitRepositoryPath, decodeGitUtf8,
  bindVisualGitScreenIdentity,
} from './visual-refresh-git-objects.mjs';

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCREEN = 'SHOP-HOME';
const ENTRY = 'src/features/shop/screens/ShopScreen.tsx';
const INPUT = 'IN-20260904-figma-001';
const DOCS = 'docs/frontend-workflow';
const MODE = ['--requested-mode', 'api-integrated-ui'];

function git(root, ...args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function write(root, file, content) {
  const absolute = path.join(root, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
  return absolute;
}
function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-git-snapshot-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init');
  git(root, 'config', 'user.name', 'Visual Snapshot Test');
  git(root, 'config', 'user.email', 'snapshot@example.com');
  return root;
}
function commit(root, message = 'baseline') { git(root, 'add', '.'); git(root, 'commit', '--allow-empty', '-m', message); return git(root, 'rev-parse', 'HEAD'); }
function materialize(t, root, tree = git(root, 'rev-parse', 'HEAD^{tree}')) {
  const view = materializeRawGitTree({ repositoryRoot: root, tree });
  t.after(view.cleanup);
  return view;
}
function rawBlob(root, oid) { return execFileSync('git', ['--no-replace-objects', 'cat-file', 'blob', oid], { cwd: root }); }
function setMode(root, file, mode, oid) { git(root, 'update-index', '--add', '--cacheinfo', `${mode},${oid},${file}`); }
function hashBlob(root, contents) { return execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: root, input: contents, encoding: 'utf8' }).trim(); }

// This entire group uses the actual object reader and real temporary Git repos;
// it can run without the consumer runtime or any third-party dependencies.
test('raw snapshot paths are rejected, never repaired into an authorized filename', () => {
  for (const bad of [ENTRY.replaceAll('/', '\\'), 'apps\\mobile\\' + ENTRY, './' + ENTRY, 'src//screen.tsx', 'src/../screen.tsx']) {
    assert.throws(() => requireGitRepositoryPath(bad), /unsupported literal Git path/);
  }
  for (const good of [ENTRY, 'src/app/[id]/{literal}.tsx', 'src/한글 화면 😀.tsx', '\ufeffname.ts']) {
    assert.equal(requireGitRepositoryPath(good), good);
  }
  assert.throws(() => decodeGitUtf8(Buffer.from([0x73, 0xff, 0]), 'diff'), /non-UTF-8/);
  assert.equal(decodeGitUtf8(Buffer.from('\ufeffname.ts'), 'diff'), '\ufeffname.ts');
});

test('raw snapshot blob bytes ignore dirty attributes, smudge, EOL and encoding conversion', (t) => {
  const root = temporary(t);
  const raw = Buffer.concat([Buffer.from('forbidden_paths: [src/**]\n$Id$\n'), Buffer.from([0, 255, 128, 10])]);
  write(root, 'config/policy.yaml', raw);
  write(root, 'run.sh', '#!/bin/sh\nprintf ok\n');
  git(root, 'add', '.');
  git(root, 'update-index', '--chmod=+x', 'run.sh');
  git(root, 'commit', '-m', 'raw baseline');
  const tree = git(root, 'rev-parse', 'HEAD^{tree}');
  const first = materialize(t, root, tree);
  assert.deepEqual(fs.readFileSync(path.join(first.root, 'config/policy.yaml')), raw);

  // A required filter that would run an executable and rewrite forbidden -> allowed
  // is a canary: no checkout conversion or filter executable may run at all.
  write(root, 'smudge.cjs', "const fs=require('fs'); fs.writeFileSync('filter-ran','yes'); process.stdout.write(fs.readFileSync(0,'utf8').replace(/forbidden_paths/g,'allowed_paths'));\n");
  git(root, 'config', 'filter.review.clean', 'cat');
  git(root, 'config', 'filter.review.smudge', `"${process.execPath}" smudge.cjs`);
  git(root, 'config', 'filter.review.required', 'true');
  git(root, 'config', 'core.autocrlf', 'true');
  git(root, 'config', 'core.eol', 'crlf');
  write(root, '.gitattributes', 'config/policy.yaml filter=review text eol=crlf ident working-tree-encoding=UTF-16LE\n');
  const second = materialize(t, root, tree);
  assert.equal(git(root, 'rev-parse', 'HEAD^{tree}'), tree);
  assert.deepEqual(fs.readFileSync(path.join(second.root, 'config/policy.yaml')), raw);
  assert.equal(fs.existsSync(path.join(root, 'filter-ran')), false);
  assert.equal(second.entry('run.sh').mode, '100755');
  if (process.platform !== 'win32') assert.ok(fs.statSync(path.join(second.root, 'run.sh')).mode & 0o111);
  assert.deepEqual(fs.readFileSync(path.join(second.root, 'config/policy.yaml')), rawBlob(root, second.entry('config/policy.yaml').oid));
});

test('raw snapshot ignores replacement refs for both trees and blobs', (t) => {
  const root = temporary(t);
  write(root, 'config/policy.yaml', 'forbidden_paths: [src/**]\n');
  commit(root);
  const aTree = git(root, 'rev-parse', 'HEAD^{tree}');
  const aBlob = git(root, 'rev-parse', 'HEAD:config/policy.yaml');
  write(root, 'config/policy.yaml', 'allowed_paths: [src/**]\n');
  commit(root, 'replacement tree');
  const bTree = git(root, 'rev-parse', 'HEAD^{tree}');
  const bBlob = git(root, 'rev-parse', 'HEAD:config/policy.yaml');
  git(root, 'replace', aBlob, bBlob);
  git(root, 'replace', aTree, bTree);
  const view = materialize(t, root, aTree);
  assert.equal(fs.readFileSync(path.join(view.root, 'config/policy.yaml'), 'utf8'), 'forbidden_paths: [src/**]\n');
  assert.equal(view.entry('config/policy.yaml').oid, aBlob);
});

test('raw snapshot mode survives core.symlinks=false and remains a final deny after file replacement', { skip: process.platform === 'win32' }, (t) => {
  const root = temporary(t);
  write(root, 'target.ts', 'export const target = true;\n');
  commit(root);
  const linkOid = hashBlob(root, 'target.ts');
  setMode(root, ENTRY, '120000', linkOid);
  setMode(root, 'vendor/module', '160000', git(root, 'rev-parse', 'HEAD'));
  git(root, 'commit', '-m', 'typed entries');
  git(root, 'config', 'core.symlinks', 'false');
  const view = materialize(t, root);
  const screenFile = path.join(view.root, ENTRY);
  assert.equal(view.entry(ENTRY).mode, '120000');
  assert.equal(fs.lstatSync(screenFile).isSymbolicLink(), true);
  assert.equal(fs.lstatSync(screenFile).isFile(), false);
  assert.equal(fs.readlinkSync(screenFile), 'target.ts');
  assert.equal(view.entry('vendor/module').mode, '160000');
  assert.equal(fs.lstatSync(path.join(view.root, 'vendor/module')).isDirectory(), true);
  fs.unlinkSync(screenFile);
  fs.writeFileSync(screenFile, 'now a regular file');
  const allowed = { intent_authorization: { applicable: true, authorized_path: ENTRY }, path_authorization: { allowed: true }, _context: { visual_path_authorization: { allowed: true } } };
  const denied = bindVisualGitScreenIdentity(allowed, view, view);
  assert.equal(denied.intent_authorization.applicable, false);
  assert.equal(denied.path_authorization.allowed, false);
  assert.equal(denied._context.visual_path_authorization.allowed, false);
  assert.equal(denied.intent_authorization.reasons.at(-1).code, 'VR-GIT-002');
  assert.ok(denied.intent_authorization.git_screen_entries.every((entry) => entry.mode === '120000'));
  const gitlink = bindVisualGitScreenIdentity({ ...allowed, intent_authorization: { applicable: true, authorized_path: 'vendor/module' } }, view, view);
  assert.equal(gitlink.intent_authorization.applicable, false);
});

test('raw snapshot rejects physical filename collisions instead of overwriting Git objects', (t) => {
  const root = temporary(t);
  write(root, 'Case.ts', 'one');
  const alias = path.join(root, 'case.ts');
  if (!fs.existsSync(alias)) { t.skip('case-insensitive filesystem required'); return; }
  git(root, 'config', 'core.ignorecase', 'false');
  const one = hashBlob(root, 'one');
  const two = hashBlob(root, 'two');
  setMode(root, 'Case.ts', '100644', one);
  setMode(root, 'case.ts', '100644', two);
  const tree = git(root, 'write-tree');
  assert.throws(() => materializeRawGitTree({ repositoryRoot: root, tree }), /materialization failed|spelling|EEXIST/);
});

function fixture(t, { prefix = '' } = {}) {
  const repo = temporary(t);
  const project = prefix ? path.join(repo, prefix) : repo;
  fs.mkdirSync(project, { recursive: true });
  write(project, DOCS + '/app/navigation-map.md', '---\nartifact_id: navigation-map\nartifact_type: navigation-map\nstatus: draft\n---\n');
  write(project, DOCS + '/design/component-catalog.md', '# GENERATED FILE - DO NOT EDIT\n\n| Name | Source | Export | Status |\n|---|---|---|---|\n');
  write(project, DOCS + '/domains/shop/screens/shop-home/screen-spec.md', `---
artifact_id: SHOP-HOME-screen-spec
artifact_type: screen-spec
domain: shop
screen_id: ${SCREEN}
route: /shop
screen_entry: ${ENTRY}
status: confirmed
---
## Purpose
Render shop.
## State Matrix
| State | Trigger | UI | User Action |
|---|---|---|---|
${['loading', 'empty', 'error', 'success', 'disabled', 'refreshing'].map((s) => `| ${s} | fixture | UI | none |`).join('\n')}
## API Candidates
| Method | Path | Confidence | Gate | Tracking | Slice Paths |
|---|---|---|---|---|---|
| GET | /shop | confirmed | active | - | src/features/shop/hooks/useShop.ts |
## Unknowns
없음
`);
  write(project, DOCS + '/domains/shop/screens/shop-home/figma-component-mapping.md', `---
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
captured_by: git-snapshot-test
status: captured
affected_domains: [shop]
affected_screens: [${SCREEN}]
confidence: confirmed
supersedes: null
---
## Extracted Facts
- The card spacing is 16px.
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
  commit(repo);
  return { repo, project };
}
function tuple(project) { return ['--screen', SCREEN, '--intent', 'visual-refresh', '--input', INPUT, '--path', ENTRY, '--root', project, '--json']; }
function cli(script, args, cwd) { return spawnSync(process.execPath, [path.join(KIT_ROOT, 'scripts', script + '.mjs'), ...args], { cwd, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 }); }
function json(result) { assert.equal(result.status, 0, result.stderr || result.stdout); return JSON.parse(result.stdout); }

for (const prefix of ['', 'apps/mobile']) {
  test(`CLI rejects an M of a distinct backslash file without changing the real screen (root=${prefix || '.'})`, { skip: process.platform === 'win32' }, async (t) => {
    const { repo, project } = fixture(t, { prefix });
    assert.equal(json(cli('readiness', tuple(project), repo)).path_authorization.allowed, true);
    const alias = (prefix ? prefix.replaceAll('/', '\\') + '\\' : '') + ENTRY.replaceAll('/', '\\');
    const realEntry = prefix ? `${prefix}/${ENTRY}` : ENTRY;
    write(repo, alias, 'export const distinct = 1;\n');
    commit(repo, 'distinct backslash filename');
    const before = fs.readFileSync(path.join(project, ENTRY));
    write(repo, alias, 'export const distinct = 2;\n');
    git(repo, 'add', '--', alias);
    assert.notEqual(fs.statSync(path.join(repo, alias)).ino, fs.statSync(path.join(project, ENTRY)).ino);
    assert.equal(git(repo, 'diff', '--cached', '--name-only', '--', realEntry), '');
    assert.deepEqual(fs.readFileSync(path.join(project, ENTRY)), before);
    const result = cli('forbidden-paths', [...tuple(project), '--staged', '--enforce'], repo);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /unsupported literal Git path/);
    assert.equal(result.stdout, '');
    const { stripProjectPrefix } = await import('./visual-refresh-git.mjs');
    assert.throws(() => stripProjectPrefix(alias, prefix), /unsupported literal Git path/);
  });
}

test('actual rename and copy -z endpoints cannot enter exact-screen or ordinary authorization through rewriting', { skip: process.platform === 'win32' }, async (t) => {
  const { repo, project } = fixture(t);
  const forward = json(cli('readiness', tuple(project), repo));
  assert.equal(forward.path_authorization.allowed, true);
  const { stripProjectPrefix } = await import('./visual-refresh-git.mjs');
  const { parseNameStatusZ } = await import('./path-backstop.mjs');
  const { routeVisualBackstopRecords } = await import('./visual-refresh-runtime.mjs');
  const alias = ENTRY.replaceAll('/', '\\');
  const original = fs.readFileSync(path.join(project, ENTRY));
  write(repo, alias, original);
  commit(repo, 'two distinct equal-content files');
  const baseline = git(repo, 'rev-parse', 'HEAD');
  const renamed = 'src\\features\\shop\\screens\\Renamed.tsx';
  git(repo, 'mv', '--', alias, renamed);
  const renameRecords = parseNameStatusZ(execFileSync('git', ['diff', '--cached', '-M', '--name-status', '-z'], { cwd: repo }));
  assert.equal(renameRecords[0].status, 'R');
  assert.equal(renameRecords[0].oldPath, alias);
  const renamedCli = cli('forbidden-paths', [...tuple(project), '--staged', '--enforce'], repo);
  assert.equal(renamedCli.status, 2, renamedCli.stdout);
  git(repo, 'reset', '--hard', baseline);
  const copied = 'src\\features\\shop\\screens\\Copied.tsx';
  write(repo, copied, original);
  git(repo, 'add', '--', copied);
  const copies = parseNameStatusZ(execFileSync('git', ['diff', '--cached', '-C', '--find-copies-harder', '--name-status', '-z'], { cwd: repo }));
  assert.ok(copies.some((record) => record.status === 'C'));
  const copiedCli = cli('forbidden-paths', [...tuple(project), '--staged', '--enforce'], repo);
  assert.equal(copiedCli.status, 2, copiedCli.stdout);
  const context = {
    authorized_path: ENTRY, selected_screen: SCREEN, visual_path_authorization: { allowed: true },
    readiness: forward.visual_refresh_audit.readiness_entry,
  };
  for (const record of [...renameRecords, ...copies,
    ...['R', 'C'].flatMap((status) => [{ status, oldPath: alias, newPath: ENTRY }, { status, oldPath: ENTRY, newPath: alias }])]) {
    assert.throws(() => routeVisualBackstopRecords({ records: [record], authority: { _context: context } }), /unsupported literal Git path/);
  }
  assert.equal(stripProjectPrefix('apps/mobile/' + ENTRY, 'apps/mobile'), ENTRY);
  assert.equal(stripProjectPrefix('apps/mobile-other/' + ENTRY, 'apps/mobile'), null);
});

test('CLI staged and historical authority are invariant under current attributes and required smudge configuration', (t) => {
  const { repo, project } = fixture(t);
  const a = git(repo, 'rev-parse', 'HEAD');
  write(project, ENTRY, 'export const ShopScreen = () => "refresh";\n');
  git(repo, 'add', ENTRY);
  const beforeStaged = json(cli('forbidden-paths', [...tuple(project), '--staged', '--enforce'], repo));
  assert.equal(beforeStaged.ok, true);
  git(repo, 'commit', '-m', 'B screen change');
  const b = git(repo, 'rev-parse', 'HEAD');
  const rangeArgs = [...tuple(project), '--range', `${a}..${b}`, '--enforce'];
  const beforeRange = json(cli('forbidden-paths', rangeArgs, repo));
  // If checkout runs, this required filter makes every docs/source blob corrupt.
  write(repo, 'smudge.cjs', "require('fs').writeFileSync('filter-ran','yes'); process.stdout.write('corrupted by current checkout filter');\n");
  git(repo, 'config', 'filter.review.clean', 'cat');
  git(repo, 'config', 'filter.review.smudge', `"${process.execPath}" smudge.cjs`);
  git(repo, 'config', 'filter.review.required', 'true');
  write(repo, '.gitattributes', '* filter=review text eol=crlf\n');
  git(repo, 'config', 'core.autocrlf', 'true');
  const afterRange = json(cli('forbidden-paths', rangeArgs, repo));
  assert.equal(afterRange.ok, true);
  assert.deepEqual(afterRange.diff_context, beforeRange.diff_context);
  assert.deepEqual(afterRange.changed_records, beforeRange.changed_records);
  assert.deepEqual(afterRange.intent_authorization, beforeRange.intent_authorization);
  assert.deepEqual(afterRange.path_authorization, beforeRange.path_authorization);
  assert.equal(fs.existsSync(path.join(repo, 'filter-ran')), false);
  // Recreate the original staged pair without running a checkout.
  git(repo, 'update-ref', 'HEAD', a);
  git(repo, 'read-tree', b);
  const afterStaged = json(cli('forbidden-paths', [...tuple(project), '--staged', '--enforce'], repo));
  assert.deepEqual(afterStaged, beforeStaged);
  const run = json(cli('workflow-run', [...tuple(project), ...MODE, '--staged'], repo));
  assert.equal(run.state, 'DONE_PENDING_REVIEW');
  assert.equal(run.forbidden.ok, true);
  assert.equal(fs.existsSync(path.join(repo, 'filter-ran')), false);
});

for (const mode of ['120000', '160000']) {
  test(`CLI cannot treat original Git mode ${mode} as a regular screen when core.symlinks=false`, { skip: process.platform === 'win32' }, (t) => {
    const { repo, project } = fixture(t);
    git(repo, 'config', 'core.symlinks', 'false');
    const oid = mode === '120000' ? hashBlob(repo, 'target.ts') : git(repo, 'rev-parse', 'HEAD');
    setMode(repo, ENTRY, mode, oid);
    git(repo, 'commit', '-m', 'nonregular Git screen');
    // Keep a seemingly regular worktree file: only the immutable tree type decides.
    assert.equal(fs.lstatSync(path.join(project, ENTRY)).isFile(), true);
    const forward = cli('readiness', tuple(project), repo);
    if (forward.status === 0) assert.equal(JSON.parse(forward.stdout).intent_authorization.applicable, false, forward.stdout);
    else assert.equal(forward.status, 2, forward.stdout);
    const staged = cli('forbidden-paths', [...tuple(project), '--staged', '--enforce'], repo);
    assert.ok(staged.status === 1 || staged.status === 2, staged.stdout);
    if (staged.stdout) assert.equal(JSON.parse(staged.stdout).ok, false);
  });
}

// A gitlink is part of the captured superproject tree. None of these cases
// initializes a submodule, fetches its URL, or examines its dirty worktree.
for (const ignoreSource of ['diff.ignoreSubmodules', 'submodule.vendor.ignore', 'dirty .gitmodules']) {
  for (const screenModified of [false, true]) {
    test(`visual gitlink records survive ${ignoreSource} (${screenModified ? 'screen M + outside gitlink M' : 'outside gitlink M only'})`, async (t) => {
      const { resolveVisualDiffContext } = await import('./visual-refresh-git.mjs');
      const { repo, project } = fixture(t, { prefix: 'apps/mobile' });
      const vendor = 'packages/other/vendor';
      const repositoryScreen = `apps/mobile/${ENTRY}`;
      const oldOid = git(repo, 'rev-parse', 'HEAD');
      const newOid = git(repo, 'commit-tree', git(repo, 'rev-parse', 'HEAD^{tree}'), '-p', oldOid, '-m', 'vendor v2');
      assert.notEqual(oldOid, newOid);
      const modules = `[submodule "vendor"]\n\tpath = ${vendor}\n\turl = ./vendor-fixture\n`;
      write(repo, '.gitmodules', modules);
      git(repo, 'add', '.gitmodules');
      setMode(repo, vendor, '160000', oldOid);
      git(repo, 'commit', '-m', 'source with opaque gitlink');
      const a = git(repo, 'rev-parse', 'HEAD');
      const sourceTree = git(repo, 'rev-parse', 'HEAD^{tree}');
      const screenBefore = fs.readFileSync(path.join(project, ENTRY));
      const packet = path.join(repo, 'audit', 'work-packet.md');
      const packetJson = json(cli('workflow-packet', [...tuple(project), ...MODE, '--out', packet], repo));
      assert.equal(packetJson.visual_refresh.path_allowed, true);

      setMode(repo, vendor, '160000', newOid);
      if (screenModified) {
        write(project, ENTRY, 'export const ShopScreen = () => "refresh";\n');
        git(repo, 'add', repositoryScreen);
      }
      const destinationTree = git(repo, 'write-tree');
      // Keep HEAD=A and index=B while also naming that exact B in a commit range.
      const b = git(repo, 'commit-tree', destinationTree, '-p', a, '-m', 'B with gitlink update');
      const expectedRecords = [
        ...(screenModified ? [{ status: 'M', path: repositoryScreen, raw: 'M' }] : []),
        { status: 'M', path: vendor, raw: 'M' },
      ];
      assert.equal(git(repo, 'ls-tree', sourceTree, '--', vendor), `160000 commit ${oldOid}\t${vendor}`);
      assert.equal(git(repo, 'ls-tree', destinationTree, '--', vendor), `160000 commit ${newOid}\t${vendor}`);
      assert.deepEqual(resolveVisualDiffContext({ repositoryRoot: repo, staged: true }).records, expectedRecords);

      if (ignoreSource === 'dirty .gitmodules') write(repo, '.gitmodules', modules + '\tignore = all\n');
      else git(repo, 'config', '--local', ignoreSource, 'all');
      // Positive reproduction control: the old collector really does lose the
      // record under this setting; an ineffective fixture must not pass the test.
      const hidden = git(repo, '--no-replace-objects', 'diff', '--no-ext-diff', '--no-textconv',
        '--name-status', '-M', '-z', sourceTree, destinationTree);
      assert.equal(hidden.includes(vendor), false, hidden);
      assert.equal(hidden.includes(repositoryScreen), screenModified, hidden);
      assert.equal(git(repo, 'diff', '--cached', '--name-only', '--', '.gitmodules'), '');

      for (const [label, selector, resolverOptions] of [
        ['staged', ['--staged'], { staged: true }],
        ['range', ['--range', `${a}..${b}`], { range: `${a}..${b}` }],
      ]) {
        const resolved = resolveVisualDiffContext({ repositoryRoot: repo, ...resolverOptions });
        assert.equal(resolved.source_tree, sourceTree);
        assert.equal(resolved.destination_tree, destinationTree);
        assert.deepEqual(resolved.records, expectedRecords);
        const result = cli('forbidden-paths', [...tuple(project), ...selector, '--enforce'], repo);
        assert.equal(result.status, 1, result.stderr || result.stdout);
        const backstop = JSON.parse(result.stdout);
        // A real positive authority is required: this must not pass simply because
        // another readiness failure denied everything before the outside router.
        assert.equal(backstop.intent_authorization.applicable, true, result.stdout);
        assert.equal(backstop.path_authorization.allowed, true, result.stdout);
        assert.equal(backstop.ok, false);
        assert.equal(backstop.violations.length, 1);
        assert.equal(backstop.violations[0].code, 'VR-BACKSTOP-002');
        assert.equal(backstop.violations[0].file, vendor);
        assert.deepEqual(backstop.changed_records.map((record) => record.repository_record), expectedRecords);
        const outside = backstop.changed_records.find((record) => record.repository_path === vendor);
        assert.equal(outside.project_path, null);
        assert.equal(outside.outside_selected_root, true);
        assert.equal(backstop.diff_context.source_tree, sourceTree);
        assert.equal(backstop.diff_context.destination_tree, destinationTree);

        const reportPath = path.join(repo, 'audit', `${label}-report.md`);
        const report = json(cli('workflow-report', [
          '--packet', packet, '--intent', 'visual-refresh', '--input', INPUT, '--path', ENTRY,
          '--root', project, ...selector, '--out', reportPath, '--json',
        ], repo));
        assert.equal(report.forbidden.status, 'fail');
        assert.equal(report.forbidden.ok, false);
        assert.deepEqual(report.forbidden.violations, backstop.violations);
        assert.deepEqual(report.forbidden.changed_records, backstop.changed_records);
        assert.deepEqual(report.changed_files, backstop.changed_records);
        assert.deepEqual(report.forbidden.diff_context, backstop.diff_context);
        const markdown = fs.readFileSync(reportPath, 'utf8');
        const changedSection = markdown.split('## Files Changed\n')[1]?.split('\n## ')[0];
        assert.ok(changedSection?.includes(vendor), markdown);
        assert.equal(changedSection.includes('(none observed)'), false);

        const runDir = path.join(repo, 'audit', `${label}-run`);
        const output = json(cli('workflow-run', [...tuple(project), ...MODE, ...selector, '--out', runDir], repo));
        // Preserve the existing evidence-only Run policy: a complete report is
        // not an approval. Its negative backstop evidence must remain observable.
        assert.equal(output.state, 'DONE_PENDING_REVIEW');
        assert.equal(output.visual_prework.path_allowed, true);
        assert.equal(output.forbidden.status, 'fail');
        assert.equal(output.forbidden.ok, false);
        assert.deepEqual(output.forbidden.violations, backstop.violations);
        assert.deepEqual(output.forbidden.changed_records, backstop.changed_records);
        assert.deepEqual(output.changed_files, report.changed_files);
        assert.deepEqual(output.forbidden.diff_context, backstop.diff_context);
        assert.ok(fs.readFileSync(runDir + '.md', 'utf8').includes(vendor));
      }
      assert.equal(git(repo, 'rev-parse', 'HEAD^{tree}'), sourceTree);
      assert.equal(git(repo, 'write-tree'), destinationTree);
      if (!screenModified) assert.deepEqual(fs.readFileSync(path.join(project, ENTRY)), screenBefore);
      // The three-dot selector uses the same collector, with the same A/B trees.
      const threeDot = resolveVisualDiffContext({ repositoryRoot: repo, range: `${a}...${b}` });
      assert.equal(threeDot.source_tree, sourceTree);
      assert.equal(threeDot.destination_tree, destinationTree);
      assert.deepEqual(threeDot.records, expectedRecords);
    });
  }
}
