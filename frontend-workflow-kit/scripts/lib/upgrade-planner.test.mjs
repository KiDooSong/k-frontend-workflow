import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  classifyFile,
  buildPlan,
  applyPlan,
  renderPlanMarkdown,
  collectMigrationNotes,
} from './upgrade-planner.mjs';
import {
  PAYLOAD_MANIFEST_NAME,
  INSTALL_MANIFEST_NAME,
  CONFLICTS_DIR_NAME,
  manifestFileIndex,
  isSafeRelPath,
} from './kit-manifest.mjs';

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACK_CLI = path.join(KIT_ROOT, 'scripts', 'pack-frontend-workflow-kit.mjs');
const UPGRADE_CLI = path.join(KIT_ROOT, 'scripts', 'upgrade-vendored-kit.mjs');

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function mkTmp(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `fwk-upgrade-${label}-`));
}

function writeFile(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

// One declarative scenario exercising every category in a single plan.
// old=baseline content, cur=on-disk content, next=upstream content (null=absent).
const SPEC = {
  'safe.mjs': { old: 'A', cur: 'A', next: 'B', cls: 'consumer-runtime', cat: 'safe-update' },
  'unchanged.mjs': { old: 'A', cur: 'A', next: 'A', cls: 'consumer-runtime', cat: 'unchanged' },
  'localmod.mjs': { old: 'A', cur: 'A2', next: 'A', cls: 'consumer-runtime', cat: 'local-modified' },
  'conflict-runtime.mjs': { old: 'A', cur: 'A2', next: 'A3', cls: 'consumer-runtime', cat: 'conflict' },
  'docs/conflict-doc.md': { old: 'A', cur: 'A2', next: 'A3', cls: 'consumer-reference', cat: 'conflict' },
  'new.mjs': { old: null, cur: null, next: 'N', cls: 'consumer-runtime', cat: 'new-file' },
  'orphan.mjs': { old: 'O', cur: 'O', next: null, cls: 'consumer-runtime', cat: 'removed-upstream' },
  'missing.mjs': { old: 'M', cur: null, next: 'M2', cls: 'consumer-runtime', cat: 'missing-current' },
  'localonly.mjs': { old: null, cur: 'U', next: null, cls: null, cat: 'unknown-local' },
};

function buildScenario(tmp, { withInstallManifest = true } = {}) {
  const currentDir = path.join(tmp, 'current');
  const nextDir = path.join(tmp, 'next');

  const installFiles = [];
  const nextFiles = [];
  for (const [rel, s] of Object.entries(SPEC)) {
    if (s.cur != null) writeFile(currentDir, rel, s.cur);
    if (s.next != null) writeFile(nextDir, rel, s.next);
    if (s.old != null) installFiles.push({ path: rel, sha256: sha(s.old), classification: s.cls, mode: '100644' });
    if (s.next != null) nextFiles.push({ path: rel, sha256: sha(s.next), classification: s.cls, mode: '100644' });
  }

  if (withInstallManifest) {
    writeFile(currentDir, INSTALL_MANIFEST_NAME, JSON.stringify({
      schema_version: 1,
      kit: { source_repo: 'O/R', source_ref: 'OLDREF', package_version: '1.0.0' },
      payload: { destination_hint: 'tools/frontend-workflow', files: installFiles },
    }, null, 2) + '\n');
  }

  writeFile(nextDir, PAYLOAD_MANIFEST_NAME, JSON.stringify({
    schema_version: 1,
    kit: { source_repo: 'O/R', source_ref: 'NEXTREF', package_version: '9.9.9' },
    distribution_manifest_version: 1,
    payload: { destination_hint: 'tools/frontend-workflow', files: nextFiles },
  }, null, 2) + '\n');

  return { currentDir, nextDir };
}

function categoryOf(plan, rel) {
  return plan.files.find((f) => f.path === rel)?.category;
}
function actionOf(plan, rel) {
  return plan.files.find((f) => f.path === rel)?.planned_action;
}

// --- pure classification ---------------------------------------------------
test('classifyFile covers all categories', () => {
  assert.equal(classifyFile({ oldHash: 'a', curHash: 'a', nextHash: 'b' }), 'safe-update');
  assert.equal(classifyFile({ oldHash: 'a', curHash: 'a', nextHash: 'a' }), 'unchanged');
  assert.equal(classifyFile({ oldHash: 'a', curHash: 'x', nextHash: 'a' }), 'local-modified');
  assert.equal(classifyFile({ oldHash: 'a', curHash: 'x', nextHash: 'b' }), 'conflict');
  assert.equal(classifyFile({ oldHash: null, curHash: null, nextHash: 'n' }), 'new-file');
  assert.equal(classifyFile({ oldHash: 'o', curHash: 'o', nextHash: null }), 'removed-upstream');
  assert.equal(classifyFile({ oldHash: 'm', curHash: null, nextHash: 'm2' }), 'missing-current');
  assert.equal(classifyFile({ oldHash: null, curHash: 'u', nextHash: null }), 'unknown-local');
  // bootstrap: differing file with unknown baseline is conservative (conflict)
  assert.equal(classifyFile({ oldHash: null, curHash: 'x', nextHash: 'y', baselineUnknown: true }), 'conflict');
  // a file added locally that upstream also ships differently is a conflict
  assert.equal(classifyFile({ oldHash: null, curHash: 'x', nextHash: 'y' }), 'conflict');
});

// --- dry-run categorization (Part I 3-9, 11 inputs) ------------------------
test('buildPlan classifies every file correctly (managed baseline)', (t) => {
  const tmp = mkTmp('plan');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  const plan = buildPlan({ currentDir, nextDir });

  assert.equal(plan.baseline, 'install-manifest');
  assert.equal(plan.current.source_ref, 'OLDREF');
  assert.equal(plan.next.source_ref, 'NEXTREF');
  for (const [rel, s] of Object.entries(SPEC)) {
    assert.equal(categoryOf(plan, rel), s.cat, `${rel} should be ${s.cat}`);
  }
  assert.equal(plan.counts['safe-update'], 1);
  assert.equal(plan.counts.conflict, 2);
  assert.equal(plan.counts['new-file'], 1);
  assert.equal(plan.counts['removed-upstream'], 1);
  assert.equal(plan.counts['unknown-local'], 1);
  assert.equal(plan.counts['missing-current'], 1);
  assert.equal(plan.warnings.length, 0);
});

// --- apply (Part I 2,3,4,5,6,7,8,9,13) -------------------------------------
test('applyPlan performs only safe operations and refreshes the install manifest', (t) => {
  const tmp = mkTmp('apply');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  const plan = buildPlan({ currentDir, nextDir });
  applyPlan({ plan, currentDir, nextDir });

  // 3 safe-update overwritten
  assert.equal(read(currentDir, 'safe.mjs'), 'B');
  // 4 unchanged untouched
  assert.equal(read(currentDir, 'unchanged.mjs'), 'A');
  // 5 local-modified preserved
  assert.equal(read(currentDir, 'localmod.mjs'), 'A2');
  // 6 conflict NOT overwritten; .incoming written with upstream
  assert.equal(read(currentDir, 'conflict-runtime.mjs'), 'A2');
  assert.equal(read(currentDir, 'docs/conflict-doc.md'), 'A2');
  assert.equal(read(currentDir, path.join(CONFLICTS_DIR_NAME, 'conflict-runtime.mjs.incoming')), 'A3');
  assert.equal(read(currentDir, path.join(CONFLICTS_DIR_NAME, 'docs/conflict-doc.md.incoming')), 'A3');
  // 7 new file added
  assert.equal(read(currentDir, 'new.mjs'), 'N');
  // 8 removed-upstream orphan reported but NOT deleted by default
  assert.equal(fs.existsSync(path.join(currentDir, 'orphan.mjs')), true);
  // missing-current restored
  assert.equal(read(currentDir, 'missing.mjs'), 'M2');
  // 9 unknown-local untouched
  assert.equal(read(currentDir, 'localonly.mjs'), 'U');

  // 13 install manifest refreshed with UPSTREAM baseline semantics
  const install = JSON.parse(read(currentDir, INSTALL_MANIFEST_NAME));
  const idx = manifestFileIndex(install);
  assert.equal(install.kit.source_ref, 'NEXTREF');
  assert.equal(idx.get('safe.mjs').sha256, sha('B'));
  // local-modified records upstream hash (A), NOT the kept local content (A2)
  assert.equal(idx.get('localmod.mjs').sha256, sha('A'));
  // conflict records upstream hash (A3), not local (A2)
  assert.equal(idx.get('conflict-runtime.mjs').sha256, sha('A3'));
  assert.equal(idx.get('new.mjs').sha256, sha('N'));
  assert.equal(idx.get('missing.mjs').sha256, sha('M2'));
  // orphan kept → still tracked with its on-disk hash
  assert.equal(idx.get('orphan.mjs').sha256, sha('O'));
  // unknown-local never enters the managed manifest
  assert.equal(idx.has('localonly.mjs'), false);
});

test('re-running the plan after apply preserves local edits (no overwrite regression)', (t) => {
  const tmp = mkTmp('idem');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  applyPlan({ plan: buildPlan({ currentDir, nextDir }), currentDir, nextDir });

  // Second plan against the same upstream: the kept local edit must read as
  // local-modified, NOT safe-update (which would silently overwrite it).
  const plan2 = buildPlan({ currentDir, nextDir });
  assert.equal(plan2.baseline, 'install-manifest');
  assert.equal(categoryOf(plan2, 'localmod.mjs'), 'local-modified');
  assert.equal(categoryOf(plan2, 'conflict-runtime.mjs'), 'local-modified');
  assert.equal(plan2.counts['safe-update'], 0);
  assert.equal(plan2.counts['missing-current'], 0);

  applyPlan({ plan: plan2, currentDir, nextDir });
  assert.equal(read(currentDir, 'localmod.mjs'), 'A2');
});

// --- prune (Part I 8 inverse) ----------------------------------------------
test('--prune deletes upstream-removed orphans and drops them from the manifest', (t) => {
  const tmp = mkTmp('prune');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  const plan = buildPlan({ currentDir, nextDir, options: { prune: true } });
  assert.equal(actionOf(plan, 'orphan.mjs'), 'prune');
  applyPlan({ plan, currentDir, nextDir, options: { prune: true } });
  assert.equal(fs.existsSync(path.join(currentDir, 'orphan.mjs')), false);
  const install = JSON.parse(read(currentDir, INSTALL_MANIFEST_NAME));
  assert.equal(manifestFileIndex(install).has('orphan.mjs'), false);
});

// --- conflict overwrite opt-ins --------------------------------------------
test('--force-runtime overwrites only consumer-runtime conflicts', (t) => {
  const tmp = mkTmp('force');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  const opts = { forceRuntime: true };
  const plan = buildPlan({ currentDir, nextDir, options: opts });
  assert.equal(actionOf(plan, 'conflict-runtime.mjs'), 'overwrite-forced');
  assert.equal(actionOf(plan, 'docs/conflict-doc.md'), 'write-incoming');
  applyPlan({ plan, currentDir, nextDir, options: opts });
  assert.equal(read(currentDir, 'conflict-runtime.mjs'), 'A3'); // runtime overwritten
  assert.equal(read(currentDir, 'docs/conflict-doc.md'), 'A2'); // reference kept
});

test('--allow-conflicts overwrites all conflicts with backup', (t) => {
  const tmp = mkTmp('allow');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  const backupDir = path.join(tmp, 'backup');
  const opts = { allowConflicts: true, backupDir };
  const plan = buildPlan({ currentDir, nextDir, options: opts });
  applyPlan({ plan, currentDir, nextDir, options: opts });
  assert.equal(read(currentDir, 'conflict-runtime.mjs'), 'A3');
  assert.equal(read(currentDir, 'docs/conflict-doc.md'), 'A3');
  // backup captured the pre-overwrite local content
  assert.equal(read(backupDir, 'conflict-runtime.mjs'), 'A2');
});

// --- Part I 10: no writes outside the current vendored kit path -------------
test('apply never writes outside the current vendored kit path', (t) => {
  const tmp = mkTmp('isolation');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  // sentinel siblings that must never change
  writeFile(tmp, 'sibling-doc.md', 'DO NOT TOUCH');
  writeFile(path.join(tmp, 'consumer-docs'), 'frontend-workflow/note.md', 'DO NOT TOUCH');
  const before = snapshotOutside(tmp, currentDir);

  applyPlan({ plan: buildPlan({ currentDir, nextDir }), currentDir, nextDir });

  const after = snapshotOutside(tmp, currentDir);
  assert.deepEqual(after, before, 'no file outside currentDir may be created or modified');
});

function snapshotOutside(root, currentDir) {
  const out = {};
  const stack = [root];
  const cur = path.resolve(currentDir);
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (path.resolve(abs) === cur) continue; // skip the vendored kit subtree
      if (e.isDirectory()) stack.push(abs);
      else if (e.isFile()) out[path.relative(root, abs)] = sha(fs.readFileSync(abs, 'utf8'));
    }
  }
  return out;
}

// --- Part I 11: bootstrap / unmanaged baseline -----------------------------
test('missing install manifest yields a conservative unmanaged plan', (t) => {
  const tmp = mkTmp('bootstrap');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp, { withInstallManifest: false });
  // also strip the payload manifest from current so there is truly no baseline
  fs.rmSync(path.join(currentDir, PAYLOAD_MANIFEST_NAME), { force: true });

  const plan = buildPlan({ currentDir, nextDir });
  assert.equal(plan.baseline, 'unknown');
  assert.ok(plan.warnings.length >= 1);
  assert.match(plan.warnings[0], /No installed manifest found/);
  // differing existing files become conflicts; identical ones unchanged; new added
  assert.equal(categoryOf(plan, 'safe.mjs'), 'conflict'); // can't prove safe without baseline
  assert.equal(categoryOf(plan, 'unchanged.mjs'), 'unchanged');
  assert.equal(categoryOf(plan, 'new.mjs'), 'new-file');
  assert.equal(plan.counts['safe-update'], 0);

  // after a first apply, the baseline becomes manifest-based
  applyPlan({ plan, currentDir, nextDir });
  assert.equal(fs.existsSync(path.join(currentDir, INSTALL_MANIFEST_NAME)), true);
  const plan2 = buildPlan({ currentDir, nextDir });
  assert.equal(plan2.baseline, 'install-manifest');
});

test('a vendored packed kit (payload manifest, no install manifest) is a known baseline', (t) => {
  const tmp = mkTmp('payload-baseline');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp, { withInstallManifest: false });
  // current keeps its .kit-payload-manifest.json copied at vendor time
  writeFile(currentDir, PAYLOAD_MANIFEST_NAME, JSON.stringify({
    schema_version: 1,
    kit: { source_ref: 'OLDREF' },
    payload: {
      files: Object.entries(SPEC)
        .filter(([, s]) => s.old != null)
        .map(([rel, s]) => ({ path: rel, sha256: sha(s.old), classification: s.cls, mode: '100644' })),
    },
  }, null, 2) + '\n');

  const plan = buildPlan({ currentDir, nextDir });
  assert.equal(plan.baseline, 'payload-manifest');
  assert.equal(categoryOf(plan, 'safe.mjs'), 'safe-update'); // baseline known → safe
  assert.equal(plan.warnings.length, 0);
});

// --- Part I 12: stable JSON + markdown -------------------------------------
test('plan JSON and markdown are deterministic (no timestamps)', (t) => {
  const tmp = mkTmp('stable');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  const a = buildPlan({ currentDir, nextDir });
  const b = buildPlan({ currentDir, nextDir });
  assert.equal(JSON.stringify(a), JSON.stringify(b));

  const md = renderPlanMarkdown(a);
  assert.equal(md, renderPlanMarkdown(b));
  assert.match(md, /# Frontend Workflow Kit Upgrade Plan/);
  assert.match(md, /## Summary/);
  assert.match(md, /## Conflicts — manual merge required/);
  assert.match(md, /## Recommended validation/);
  assert.match(md, /Safe updates: 1/);
  assert.match(md, /Conflicts: 2/);
  assert.match(md, /npm run workflow:validate/);
});

// --- Part F: migration notes surfaced --------------------------------------
test('migration notes shipped in next payload are surfaced in the plan', (t) => {
  const tmp = mkTmp('notes');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  writeFile(nextDir, 'docs/reference/upgrade-notes.md', '# Upgrade Notes\n\n## Grouped inputs\nDetail here.\n');

  const notes = collectMigrationNotes(nextDir);
  assert.ok(notes);
  assert.equal(notes.path, 'docs/reference/upgrade-notes.md');

  const md = renderPlanMarkdown(buildPlan({ currentDir, nextDir }));
  assert.match(md, /## Consumer migrations/);
  assert.match(md, /review manually if your installed baseline is older/i);
  assert.match(md, /Grouped inputs/);
});

// --- CLI integration (dry-run default, --apply, --json, --plan) ------------
test('CLI dry-run is the default and writes nothing into current', (t) => {
  const tmp = mkTmp('cli-dry');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  const before = read(currentDir, 'safe.mjs');

  const r = spawnSync(process.execPath, [UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.mode, 'dry-run');
  assert.equal(out.plan.counts['safe-update'], 1);
  assert.equal(out.applied, null);
  // dry-run must not modify or create anything in current
  assert.equal(read(currentDir, 'safe.mjs'), before);
  assert.equal(fs.existsSync(path.join(currentDir, INSTALL_MANIFEST_NAME)), true); // pre-existing only
});

test('CLI --apply applies safe updates and writes a plan file', (t) => {
  const tmp = mkTmp('cli-apply');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  const planPath = path.join(tmp, 'plan.md');

  const r = spawnSync(process.execPath, [
    UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply', '--plan', planPath,
  ], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(currentDir, 'safe.mjs'), 'B');
  assert.equal(read(currentDir, 'localmod.mjs'), 'A2');
  assert.equal(fs.existsSync(planPath), true);
  assert.match(fs.readFileSync(planPath, 'utf8'), /# Frontend Workflow Kit Upgrade Plan/);
});

test('CLI rejects missing required args and conflicting modes', () => {
  const r1 = spawnSync(process.execPath, [UPGRADE_CLI, '--current', '.'], { encoding: 'utf8' });
  assert.equal(r1.status, 2);
  assert.match(r1.stderr, /--next is required/);

  const tmp = mkTmp('cli-bad');
  try {
    const { currentDir, nextDir } = buildScenario(tmp);
    const r2 = spawnSync(process.execPath, [UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply', '--dry-run'], { encoding: 'utf8' });
    assert.equal(r2.status, 2);
    assert.match(r2.stderr, /mutually exclusive/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Part A: pack emits a deterministic payload manifest -------------------
test('kit:pack writes a deterministic payload manifest with hashes + classification', (t) => {
  const tmp = mkTmp('pack-manifest');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const out1 = path.join(tmp, 'out1');
  const out2 = path.join(tmp, 'out2');
  const args = ['--source-ref', 'deadbeefcafe', '--source-repo', 'KiDooSong/k-frontend-workflow'];

  for (const out of [out1, out2]) {
    const r = spawnSync(process.execPath, [PACK_CLI, '--out', out, '--json', ...args], { cwd: KIT_ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  }

  const m = JSON.parse(fs.readFileSync(path.join(out1, PAYLOAD_MANIFEST_NAME), 'utf8'));
  assert.equal(m.schema_version, 1);
  assert.equal(m.kit.source_ref, 'deadbeefcafe');
  assert.equal(m.kit.source_repo, 'KiDooSong/k-frontend-workflow');
  assert.equal(typeof m.kit.package_version, 'string');
  assert.equal(m.distribution_manifest_version, 1);
  assert.equal(m.payload.destination_hint, 'tools/frontend-workflow');
  assert.ok(m.payload.files.length > 50);

  const readiness = m.payload.files.find((f) => f.path === 'scripts/readiness.mjs');
  assert.ok(readiness, 'readiness.mjs should be in the payload manifest');
  assert.match(readiness.sha256, /^[0-9a-f]{64}$/);
  assert.equal(readiness.classification, 'consumer-runtime');
  assert.match(readiness.mode, /^100(644|755)$/);

  // upgrade tool ships; its kit-dev test does not
  assert.ok(m.payload.files.some((f) => f.path === 'scripts/upgrade-vendored-kit.mjs'));
  assert.equal(m.payload.files.some((f) => f.path === 'scripts/lib/upgrade-planner.test.mjs'), false);
  assert.equal(fs.existsSync(path.join(out1, 'scripts/lib/upgrade-planner.test.mjs')), false);

  // determinism: same ref → byte-identical manifest, sorted file list
  assert.equal(
    fs.readFileSync(path.join(out1, PAYLOAD_MANIFEST_NAME), 'utf8'),
    fs.readFileSync(path.join(out2, PAYLOAD_MANIFEST_NAME), 'utf8'),
  );
  assert.deepEqual(m.payload.files.map((f) => f.path), [...m.payload.files.map((f) => f.path)].sort((a, b) => a.localeCompare(b)));
});

// --- security: path traversal, symlinks, boolean-flag coercion -------------
test('isSafeRelPath rejects traversal, absolute, and drive/UNC paths', () => {
  for (const ok of ['scripts/readiness.mjs', 'a/b/c.md', 'README.md']) {
    assert.equal(isSafeRelPath(ok), true, ok);
  }
  for (const bad of ['../escape', 'a/../../b', '/etc/passwd', 'C:/win', 'C:\\win', '\\\\unc\\share', '', 'a/', './x']) {
    assert.equal(isSafeRelPath(bad), false, bad);
  }
});

test('manifestFileIndex drops traversal/absolute entries (fail-closed)', () => {
  const idx = manifestFileIndex({
    payload: {
      files: [
        { path: 'good.mjs', sha256: sha('g') },
        { path: '../evil.mjs', sha256: sha('e') },
        { path: '/abs/evil.mjs', sha256: sha('e') },
        { path: 'C:/evil.mjs', sha256: sha('e') },
      ],
    },
  });
  assert.deepEqual([...idx.keys()], ['good.mjs']);
});

test('a crafted next manifest with a traversal path neither plans nor writes outside current', (t) => {
  const tmp = mkTmp('traversal');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const currentDir = path.join(tmp, 'current');
  const nextDir = path.join(tmp, 'next');
  writeFile(currentDir, INSTALL_MANIFEST_NAME, JSON.stringify({
    schema_version: 1, kit: { source_ref: 'OLD' }, payload: { files: [] },
  }, null, 2) + '\n');
  writeFile(nextDir, 'safe.mjs', 'S');
  // a sentinel a sibling of current; the crafted '../evil.mjs' entry must never reach it
  writeFile(tmp, 'evil.mjs', 'SENTINEL');
  writeFile(nextDir, PAYLOAD_MANIFEST_NAME, JSON.stringify({
    schema_version: 1,
    kit: { source_ref: 'NEW' },
    payload: { files: [
      { path: 'safe.mjs', sha256: sha('S'), classification: 'consumer-runtime', mode: '100644' },
      { path: '../evil.mjs', sha256: sha('EVIL'), classification: 'consumer-runtime', mode: '100644' },
    ] },
  }, null, 2) + '\n');

  const plan = buildPlan({ currentDir, nextDir });
  assert.equal(plan.files.some((f) => f.path.includes('..')), false);
  applyPlan({ plan, currentDir, nextDir });
  // the traversal target (a sibling of current) must be left exactly as it was
  assert.equal(read(tmp, 'evil.mjs'), 'SENTINEL');
  assert.equal(read(currentDir, 'safe.mjs'), 'S');
});

test('apply refuses to write through a symlinked target (no escape via links)', (t) => {
  const tmp = mkTmp('symlink');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  // replace current/safe.mjs with a symlink pointing OUTSIDE current
  const outside = path.join(tmp, 'outside-target.mjs');
  fs.writeFileSync(outside, 'A', 'utf8'); // same content as baseline → classified safe-update
  const linkPath = path.join(currentDir, 'safe.mjs');
  fs.rmSync(linkPath, { force: true });
  try {
    fs.symlinkSync(outside, linkPath);
  } catch {
    t.skip('symlink creation not permitted on this platform');
    return;
  }
  const plan = buildPlan({ currentDir, nextDir });
  assert.equal(categoryOf(plan, 'safe.mjs'), 'safe-update');
  assert.throws(() => applyPlan({ plan, currentDir, nextDir }), /symlink/i);
  // the outside target must be untouched
  assert.equal(fs.readFileSync(outside, 'utf8'), 'A');
});

test('apply refuses to write the install manifest through a symlink', (t) => {
  const tmp = mkTmp('symlink-meta');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  const outside = path.join(tmp, 'outside-install.json');
  fs.writeFileSync(outside, '{"sentinel":true}\n', 'utf8');
  const linkPath = path.join(currentDir, INSTALL_MANIFEST_NAME);
  fs.rmSync(linkPath, { force: true });
  try {
    fs.symlinkSync(outside, linkPath);
  } catch {
    t.skip('symlink creation not permitted on this platform');
    return;
  }
  assert.throws(() => applyPlan({ plan: buildPlan({ currentDir, nextDir }), currentDir, nextDir }), /symlink/i);
  assert.equal(fs.readFileSync(outside, 'utf8'), '{"sentinel":true}\n'); // not overwritten through the link
});

test('CLI does not enable destructive flags on --flag=false', (t) => {
  const tmp = mkTmp('boolflag');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  const r = spawnSync(process.execPath, [
    UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply', '--prune=false',
  ], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  // --prune=false must NOT delete the orphan
  assert.equal(fs.existsSync(path.join(currentDir, 'orphan.mjs')), true);
});

test('CLI --apply=false stays a dry-run (no apply)', (t) => {
  const tmp = mkTmp('applyfalse');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  const r = spawnSync(process.execPath, [
    UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply=false', '--json',
  ], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).mode, 'dry-run');
  assert.equal(read(currentDir, 'safe.mjs'), 'A'); // unchanged (not overwritten to B)
});

// --- end-to-end: plan a freshly packed kit against a vendored copy ----------
test('end-to-end: a vendored packed kit upgrades cleanly against itself', (t) => {
  const tmp = mkTmp('e2e');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const nextDir = path.join(tmp, 'next');
  const r = spawnSync(process.execPath, [PACK_CLI, '--out', nextDir, '--json', '--source-ref', 'e2eref'], { cwd: KIT_ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);

  // vendor it: a copy with its payload manifest is a known baseline
  const currentDir = path.join(tmp, 'current');
  fs.cpSync(nextDir, currentDir, { recursive: true });

  const plan = buildPlan({ currentDir, nextDir });
  assert.equal(plan.baseline, 'payload-manifest');
  assert.equal(plan.counts.conflict, 0);
  assert.equal(plan.counts['safe-update'], 0);
  assert.equal(plan.counts['local-modified'], 0);
  // identical copy → everything unchanged
  assert.equal(plan.counts.unchanged, plan.counts.total - plan.counts['unknown-local']);
});
