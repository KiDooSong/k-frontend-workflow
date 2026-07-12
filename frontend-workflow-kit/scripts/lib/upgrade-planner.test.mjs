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
  rebaseMigrationNoteLinks,
  collectMigrationNotes,
} from './upgrade-planner.mjs';
import {
  PAYLOAD_MANIFEST_NAME,
  INSTALL_MANIFEST_NAME,
  CONFLICTS_DIR_NAME,
  manifestFileIndex,
  isSafeRelPath,
  statMode,
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

function buildModeUpdateScenario(tmp, t) {
  const currentDir = path.join(tmp, 'current');
  const nextDir = path.join(tmp, 'next');
  const rel = 'script.sh';
  const body = 'echo ok\n';

  writeFile(currentDir, rel, body);
  writeFile(nextDir, rel, body);

  const currentAbs = path.join(currentDir, rel);
  const nextAbs = path.join(nextDir, rel);
  try {
    fs.chmodSync(currentAbs, 0o644);
    fs.chmodSync(nextAbs, 0o755);
  } catch {
    t.skip('chmod not supported on this platform');
    return null;
  }
  if (statMode(currentAbs) !== '100644' || statMode(nextAbs) !== '100755') {
    t.skip('executable bit is not observable on this platform');
    return null;
  }

  writeFile(currentDir, INSTALL_MANIFEST_NAME, JSON.stringify({
    schema_version: 1,
    kit: { source_repo: 'O/R', source_ref: 'OLDREF', package_version: '1.0.0' },
    payload: {
      destination_hint: 'tools/frontend-workflow',
      files: [{ path: rel, sha256: sha(body), classification: 'consumer-runtime', mode: '100644' }],
    },
  }, null, 2) + '\n');
  writeFile(nextDir, PAYLOAD_MANIFEST_NAME, JSON.stringify({
    schema_version: 1,
    kit: { source_repo: 'O/R', source_ref: 'NEXTREF', package_version: '9.9.9' },
    distribution_manifest_version: 1,
    payload: {
      destination_hint: 'tools/frontend-workflow',
      files: [{ path: rel, sha256: sha(body), classification: 'consumer-runtime', mode: '100755' }],
    },
  }, null, 2) + '\n');

  return { currentDir, nextDir, rel, body, currentAbs };
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
  // content-stable upstream chmod is safe when the local mode still matches baseline
  assert.equal(classifyFile({
    oldHash: 'a',
    curHash: 'a',
    nextHash: 'a',
    oldMode: '100644',
    curMode: '100644',
    nextMode: '100755',
  }), 'mode-update');
  // content-stable local chmod is preserved when upstream mode did not move
  assert.equal(classifyFile({
    oldHash: 'a',
    curHash: 'a',
    nextHash: 'a',
    oldMode: '100755',
    curMode: '100644',
    nextMode: '100755',
  }), 'local-modified');
  // hash updates are safe only if the local mode still matches baseline too
  assert.equal(classifyFile({
    oldHash: 'a',
    curHash: 'a',
    nextHash: 'b',
    oldMode: '100644',
    curMode: '100644',
    nextMode: '100755',
  }), 'safe-update');
  assert.equal(classifyFile({
    oldHash: 'a',
    curHash: 'a',
    nextHash: 'b',
    oldMode: '100755',
    curMode: '100644',
    nextMode: '100755',
  }), 'conflict');
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

test('applyPlan applies upstream mode-only changes and refreshes the install manifest mode', (t) => {
  const tmp = mkTmp('mode-update');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const scenario = buildModeUpdateScenario(tmp, t);
  if (!scenario) return;
  const { currentDir, nextDir, rel, body, currentAbs } = scenario;

  const plan = buildPlan({ currentDir, nextDir });
  assert.equal(categoryOf(plan, rel), 'mode-update');
  assert.equal(actionOf(plan, rel), 'chmod');
  assert.equal(plan.counts['mode-update'], 1);
  assert.equal(plan.counts.unchanged, 0);

  const applied = applyPlan({ plan, currentDir, nextDir });
  assert.deepEqual(applied.actions, [{ path: rel, action: 'chmod' }]);
  assert.equal(read(currentDir, rel), body);
  assert.equal(statMode(currentAbs), '100755');

  const install = JSON.parse(read(currentDir, INSTALL_MANIFEST_NAME));
  const idx = manifestFileIndex(install);
  assert.equal(idx.get(rel).mode, '100755');
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

// --- migration-note link rebasing (dogfood 0.3.0-mvp.2 follow-up) ----------
// The embedded upgrade-notes body is written relative to docs/reference/, so a
// plan generated at <current>/_upgrade/ (or an arbitrary --plan path) must
// rebase those links to its own location — verbatim embedding produced the two
// broken-relative-link warnings observed in the real consumer upgrade dogfood.

const REBASE_NOTES_BODY = [
  '# Upgrade Notes',
  '',
  'See [input](input-reconciliation.md).',
  'See [screen](screen-identity.md#aliases).',
  'See [query](workflow-spine.md?mode=full#start).',
  'See [up](../nearby.md).',
  'See [external](https://example.com/docs).',
  'See [plain http](http://example.com/x).',
  'See [mail](mailto:a@example.com).',
  'See [local section](#recommended-validation).',
  'See [site absolute](/absolute/site/path).',
  'See [data](data:image/png;base64,AAAA).',
  '![image](assets/example.png)',
  'Inline code: `[code](input-reconciliation.md)`.',
  'Escaped: \\[not-a-link](input-reconciliation.md).',
  '',
  '```md',
  '[fenced](screen-identity.md)',
  '```',
  '',
].join('\n');

function buildNotesScenario(tmp, { notesBody = REBASE_NOTES_BODY } = {}) {
  const currentDir = path.join(tmp, 'consumer', 'tools', 'frontend-workflow');
  const nextDir = path.join(tmp, 'next');
  const docs = {
    'docs/reference/upgrade-notes.md': notesBody,
    'docs/reference/input-reconciliation.md': '# input reconciliation\n',
    'docs/reference/screen-identity.md': '# screen identity\n\n## aliases\n',
    'docs/reference/workflow-spine.md': '# spine\n\n## start\n',
  };
  const files = [];
  for (const [rel, body] of Object.entries(docs)) {
    writeFile(nextDir, rel, body);
    files.push({ path: rel, sha256: sha(body), classification: 'consumer-reference', mode: '100644' });
  }
  fs.mkdirSync(currentDir, { recursive: true });
  writeFile(nextDir, PAYLOAD_MANIFEST_NAME, JSON.stringify({
    schema_version: 1,
    kit: { source_repo: 'O/R', source_ref: 'NEXTREF', package_version: '9.9.9' },
    distribution_manifest_version: 1,
    payload: { destination_hint: 'tools/frontend-workflow', files },
  }, null, 2) + '\n');
  return { currentDir, nextDir, consumerRoot: path.join(tmp, 'consumer') };
}

function extractLink(md, label) {
  const m = new RegExp(`\\[${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\]\\(([^)]+)\\)`).exec(md);
  assert.ok(m, `link [${label}] should be present in the rendered plan`);
  return m[1];
}

test('render rebases migration-note links for the default _upgrade plan location', (t) => {
  const tmp = mkTmp('rebase-default');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildNotesScenario(tmp);
  const plan = buildPlan({ currentDir, nextDir });
  const planPath = path.join(currentDir, '_upgrade', 'upgrade-plan-NEXTREF.md');
  const ctx = { currentDir, planPath };
  const md = renderPlanMarkdown(plan, ctx);

  // Relative links move to the install location, keeping query/fragment.
  assert.equal(extractLink(md, 'input'), '../docs/reference/input-reconciliation.md');
  assert.equal(extractLink(md, 'screen'), '../docs/reference/screen-identity.md#aliases');
  assert.equal(extractLink(md, 'query'), '../docs/reference/workflow-spine.md?mode=full#start');
  assert.equal(extractLink(md, 'up'), '../docs/nearby.md'); // ../ against docs/reference, still in payload
  assert.equal(extractLink(md, 'image'), '../docs/reference/assets/example.png');
  // External, anchor-only, site-absolute, and scheme links are untouched.
  assert.equal(extractLink(md, 'external'), 'https://example.com/docs');
  assert.equal(extractLink(md, 'plain http'), 'http://example.com/x');
  assert.equal(extractLink(md, 'mail'), 'mailto:a@example.com');
  assert.equal(extractLink(md, 'local section'), '#recommended-validation');
  assert.equal(extractLink(md, 'site absolute'), '/absolute/site/path');
  assert.equal(extractLink(md, 'data'), 'data:image/png;base64,AAAA');
  // Inline code, escaped brackets, and fenced blocks stay verbatim.
  assert.match(md, /`\[code\]\(input-reconciliation\.md\)`/);
  assert.match(md, /\\\[not-a-link\]\(input-reconciliation\.md\)/);
  assert.match(md, /^\[fenced\]\(screen-identity\.md\)$/m);
  // Deterministic, and no local absolute paths or timestamps leak into the plan.
  assert.equal(md, renderPlanMarkdown(plan, ctx));
  assert.equal(md.includes(tmp), false);
  assert.equal(md.includes(tmp.split(path.sep).join('/')), false);
  assert.doesNotMatch(md, /file:\/\//);
  assert.doesNotMatch(md, /\b20\d{2}-\d{2}-\d{2}T/);
});

test('render computes links from arbitrary explicit --plan locations', (t) => {
  const tmp = mkTmp('rebase-explicit');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir, consumerRoot } = buildNotesScenario(tmp);
  const plan = buildPlan({ currentDir, nextDir });
  // Materialize the docs under current (as an apply would) so resolution can be
  // checked against real files, not just expected strings.
  applyPlan({ plan, currentDir, nextDir });

  const planPaths = [
    path.join(consumerRoot, 'kit-upgrade-plan.md'),
    path.join(consumerRoot, 'temp', 'reports', 'upgrades', 'kit-upgrade-plan.md'),
  ];
  for (const planPath of planPaths) {
    const md = renderPlanMarkdown(plan, { currentDir, planPath });
    const link = extractLink(md, 'input');
    const resolved = path.resolve(path.dirname(planPath), link);
    assert.equal(resolved, path.resolve(currentDir, 'docs', 'reference', 'input-reconciliation.md'));
    assert.equal(fs.existsSync(resolved), true, `${link} should resolve to a real file from ${planPath}`);
    const anchored = extractLink(md, 'screen');
    assert.ok(anchored.endsWith('#aliases'));
    assert.equal(
      path.resolve(path.dirname(planPath), anchored.split('#')[0]),
      path.resolve(currentDir, 'docs', 'reference', 'screen-identity.md'),
    );
  }
  // Consumer-root plan gets the documented forward-slash shape.
  const rootMd = renderPlanMarkdown(plan, { currentDir, planPath: planPaths[0] });
  assert.equal(extractLink(rootMd, 'input'), 'tools/frontend-workflow/docs/reference/input-reconciliation.md');
});

test('render without a context stays byte-identical (raw notes body, library compat)', (t) => {
  const tmp = mkTmp('rebase-compat');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildNotesScenario(tmp);
  const plan = buildPlan({ currentDir, nextDir });
  const md = renderPlanMarkdown(plan);
  // Original relative links are embedded verbatim, exactly as before.
  assert.equal(extractLink(md, 'input'), 'input-reconciliation.md');
  assert.equal(extractLink(md, 'screen'), 'screen-identity.md#aliases');
  assert.equal(md, renderPlanMarkdown(plan, null));
  assert.ok(md.includes(plan.migration_notes.body.trim()));
});

test('rebasing never mutates the JSON plan: migration_notes stays raw', (t) => {
  const tmp = mkTmp('rebase-json');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildNotesScenario(tmp);
  const plan = buildPlan({ currentDir, nextDir });
  const before = JSON.stringify(plan);
  renderPlanMarkdown(plan, { currentDir, planPath: path.join(currentDir, '_upgrade', 'p.md') });
  assert.equal(JSON.stringify(plan), before);
  assert.equal(plan.migration_notes.path, 'docs/reference/upgrade-notes.md');
  assert.equal(plan.migration_notes.body, REBASE_NOTES_BODY);
});

test('links escaping the payload root are kept verbatim with a deterministic note', (t) => {
  const tmp = mkTmp('rebase-escape');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildNotesScenario(tmp, {
    notesBody: '# Notes\n\nSee [out](../../../outside.md) and [ok](input-reconciliation.md).\n',
  });
  const plan = buildPlan({ currentDir, nextDir });
  const ctx = { currentDir, planPath: path.join(currentDir, '_upgrade', 'p.md') };
  const md = renderPlanMarkdown(plan, ctx);
  assert.equal(extractLink(md, 'out'), '../../../outside.md'); // kept, never absolutized
  assert.equal(extractLink(md, 'ok'), '../docs/reference/input-reconciliation.md');
  assert.match(md, /1 relative link\(s\) could not be rebased/);
  assert.match(md, /`\.\.\/\.\.\/\.\.\/outside\.md`/);
  assert.equal(md, renderPlanMarkdown(plan, ctx)); // deterministic
  assert.doesNotMatch(md, /file:\/\//);
  assert.equal(md.includes(tmp), false);
});

test('cross-volume plan location keeps original links and leaks no absolute path (win32 lexical)', (t) => {
  if (process.platform !== 'win32') {
    t.skip('drive-crossing relative paths only exist on Windows');
    return;
  }
  // Purely lexical — neither path needs to exist.
  const { body, unresolved } = rebaseMigrationNoteLinks({
    body: 'See [input](input-reconciliation.md).\n',
    notesPath: 'docs/reference/upgrade-notes.md',
    currentDir: 'C:\\repo\\tools\\frontend-workflow',
    planPath: 'Q:\\plans\\kit-upgrade-plan.md',
  });
  assert.equal(body, 'See [input](input-reconciliation.md).\n');
  assert.deepEqual(unresolved, ['input-reconciliation.md']);
});

test('rebaseMigrationNoteLinks is pure on the same-volume happy path', () => {
  const { body, unresolved } = rebaseMigrationNoteLinks({
    body: 'See [input](input-reconciliation.md) and [s](screen-identity.md#a).\n',
    notesPath: 'docs/reference/upgrade-notes.md',
    currentDir: path.join(path.parse(process.cwd()).root, 'repo', 'tools', 'frontend-workflow'),
    planPath: path.join(path.parse(process.cwd()).root, 'repo', 'tools', 'frontend-workflow', '_upgrade', 'p.md'),
  });
  assert.equal(body, 'See [input](../docs/reference/input-reconciliation.md) and [s](../docs/reference/screen-identity.md#a).\n');
  assert.deepEqual(unresolved, []);
});

test('CLI default apply writes a plan whose migration links resolve from the plan directory', (t) => {
  const tmp = mkTmp('rebase-cli-apply');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dogfoodNotes = [
    '# Upgrade Notes',
    '',
    'See [input-reconciliation.md](input-reconciliation.md).',
    'See [screen-identity.md](screen-identity.md).',
    'See [external](https://example.com/docs).',
    '',
  ].join('\n');
  const { currentDir, nextDir } = buildNotesScenario(tmp, { notesBody: dogfoodNotes });

  const r = spawnSync(process.execPath, [UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);

  const planPath = path.join(currentDir, '_upgrade', 'upgrade-plan-NEXTREF.md');
  assert.equal(fs.existsSync(planPath), true, 'default apply should write the in-kit plan');
  const md = fs.readFileSync(planPath, 'utf8');
  // The two links observed broken in the real dogfood now point at the install.
  assert.equal(extractLink(md, 'input-reconciliation.md'), '../docs/reference/input-reconciliation.md');
  assert.equal(extractLink(md, 'screen-identity.md'), '../docs/reference/screen-identity.md');
  assert.equal(extractLink(md, 'external'), 'https://example.com/docs');
  for (const label of ['input-reconciliation.md', 'screen-identity.md']) {
    const resolved = path.resolve(path.dirname(planPath), extractLink(md, label));
    assert.equal(fs.existsSync(resolved), true, `${label} should resolve to an installed file`);
  }
  // JSON surface unchanged: raw body, no rebased links, no absolute paths.
  const rj = spawnSync(process.execPath, [UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--json'], { encoding: 'utf8' });
  assert.equal(rj.status, 0, rj.stderr);
  const out = JSON.parse(rj.stdout);
  assert.equal(out.plan.migration_notes.body, dogfoodNotes);
  assert.equal(JSON.stringify(out.plan).includes('../docs/reference/'), false);
  assert.equal(JSON.stringify(out.plan).includes(tmp.split(path.sep).join('/')), false);
});

test('nested image destinations inside a link label are rebased too', (t) => {
  const tmp = mkTmp('rebase-nested');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildNotesScenario(tmp, {
    notesBody: '# Notes\n\n[![diagram](assets/diagram.png)](input-reconciliation.md)\n',
  });
  const plan = buildPlan({ currentDir, nextDir });
  const md = renderPlanMarkdown(plan, { currentDir, planPath: path.join(currentDir, '_upgrade', 'p.md') });
  assert.match(md, /\[!\[diagram\]\(\.\.\/docs\/reference\/assets\/diagram\.png\)\]\(\.\.\/docs\/reference\/input-reconciliation\.md\)/);
});

test('backslash-escaped destination notation is left exactly as written', (t) => {
  const tmp = mkTmp('rebase-escaped-dest');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildNotesScenario(tmp, {
    notesBody: '# Notes\n\nSee [hash](foo\\#bar.md) and [paren](foo\\(bar\\).md) and [ok](input-reconciliation.md).\n',
  });
  const plan = buildPlan({ currentDir, nextDir });
  const md = renderPlanMarkdown(plan, { currentDir, planPath: path.join(currentDir, '_upgrade', 'p.md') });
  assert.match(md, /\[hash\]\(foo\\#bar\.md\)/); // untouched, no note (escaped notation)
  assert.match(md, /\[paren\]\(foo\\\(bar\\\)\.md\)/);
  assert.equal(extractLink(md, 'ok'), '../docs/reference/input-reconciliation.md');
  assert.doesNotMatch(md, /could not be rebased/);
});

test('angle-bracket destinations are left verbatim', (t) => {
  const tmp = mkTmp('rebase-angle');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildNotesScenario(tmp, {
    notesBody: '# Notes\n\nSee [ab](<screen-identity.md>) and [ok](input-reconciliation.md).\n',
  });
  const plan = buildPlan({ currentDir, nextDir });
  const md = renderPlanMarkdown(plan, { currentDir, planPath: path.join(currentDir, '_upgrade', 'p.md') });
  assert.match(md, /\[ab\]\(<screen-identity\.md>\)/);
  assert.equal(extractLink(md, 'ok'), '../docs/reference/input-reconciliation.md');
});

test('percent-encoded traversal segments do not bypass the payload-root escape check', (t) => {
  const tmp = mkTmp('rebase-pct');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildNotesScenario(tmp, {
    notesBody: '# Notes\n\nSee [enc](%2e%2e/%2e%2e/%2e%2e/outside.md) and [ok](input-reconciliation.md).\n',
  });
  const plan = buildPlan({ currentDir, nextDir });
  const md = renderPlanMarkdown(plan, { currentDir, planPath: path.join(currentDir, '_upgrade', 'p.md') });
  // Encoded `..` decodes to traversal in a Markdown viewer — kept verbatim + note.
  assert.equal(extractLink(md, 'enc'), '%2e%2e/%2e%2e/%2e%2e/outside.md');
  assert.match(md, /could not be rebased/);
  assert.equal(extractLink(md, 'ok'), '../docs/reference/input-reconciliation.md');
});

test('a target equal to the plan directory renders as "." (not a false cross-volume fallback)', () => {
  const root = path.parse(process.cwd()).root;
  const currentDir = path.join(root, 'repo', 'tools', 'frontend-workflow');
  const { body, unresolved } = rebaseMigrationNoteLinks({
    body: 'See [here](.#top).\n',
    notesPath: 'docs/reference/upgrade-notes.md',
    currentDir,
    planPath: path.join(currentDir, 'docs', 'reference', 'plan.md'),
  });
  assert.equal(body, 'See [here](.#top).\n');
  assert.deepEqual(unresolved, []);
});

test('CLI --apply refuses a --plan path colliding with apply inputs or outputs', (t) => {
  const tmp = mkTmp('rebase-plan-collision');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  const before = read(currentDir, 'safe.mjs');
  const cases = [
    { plan: path.join(nextDir, 'stray-plan.md'), re: /inside --next/, preExisting: false },
    { plan: path.join(currentDir, 'safe.mjs'), re: /collides with a path/, preExisting: true },
    { plan: path.join(currentDir, INSTALL_MANIFEST_NAME), re: /collides with a path/, preExisting: true },
    { plan: path.join(currentDir, CONFLICTS_DIR_NAME, 'x.md.incoming'), re: /collides with a path/, preExisting: false },
  ];
  for (const { plan, re, preExisting } of cases) {
    const wasThere = preExisting ? fs.readFileSync(plan, 'utf8') : null;
    const r = spawnSync(process.execPath, [
      UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply', '--plan', plan,
    ], { encoding: 'utf8' });
    assert.equal(r.status, 2, `${plan} should be refused`);
    assert.match(r.stderr, re);
    assert.equal(read(currentDir, 'safe.mjs'), before, 'refusal must precede any mutation');
    if (preExisting) {
      assert.equal(fs.readFileSync(plan, 'utf8'), wasThere, 'a colliding existing file must stay untouched');
    } else {
      assert.equal(fs.existsSync(plan), false, 'no plan file may be written at a colliding path');
    }
  }
  const backupDir = path.join(tmp, 'backup');
  const rb = spawnSync(process.execPath, [
    UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply',
    '--backup-dir', backupDir, '--plan', path.join(backupDir, 'plan.md'),
  ], { encoding: 'utf8' });
  assert.equal(rb.status, 2);
  assert.match(rb.stderr, /overlap --backup-dir/);
  assert.equal(read(currentDir, 'safe.mjs'), before);

  // Exact-equality and reserved-root bypasses (Codex round 2): --plan equal to
  // --backup-dir itself (a plan FILE there blocks backup mkdir mid-apply), the
  // .upgrade-conflicts root itself, --next itself, and --current itself.
  const equalityCases = [
    { args: ['--backup-dir', backupDir, '--plan', backupDir], re: /overlap --backup-dir/ },
    { args: ['--plan', path.join(currentDir, CONFLICTS_DIR_NAME)], re: /collides with a path/ },
    { args: ['--plan', nextDir], re: /at or inside --next/ },
    { args: ['--plan', currentDir], re: /collides with a path/ },
  ];
  for (const { args, re } of equalityCases) {
    const r = spawnSync(process.execPath, [
      UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply', ...args,
    ], { encoding: 'utf8' });
    assert.equal(r.status, 2, `${args.join(' ')} should be refused`);
    assert.match(r.stderr, re);
    assert.equal(read(currentDir, 'safe.mjs'), before, 'refusal must precede any mutation');
  }
  assert.equal(fs.existsSync(backupDir), false, 'no plan file may be written at the backup root');
  assert.equal(fs.existsSync(path.join(currentDir, CONFLICTS_DIR_NAME)), false);

  // A non-colliding in-current plan path stays allowed (custom _upgrade name),
  // and dry-run --plan keeps its documented flexibility.
  const okPlan = path.join(currentDir, '_upgrade', 'custom-plan.md');
  const ok = spawnSync(process.execPath, [
    UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply', '--plan', okPlan,
  ], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(fs.existsSync(okPlan), true);
});

test('a tracked file whose name starts with dots (..foo) cannot be clobbered via --plan, yet still applies', (t) => {
  const tmp = mkTmp('rebase-dotdot-name');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const currentDir = path.join(tmp, 'current');
  const nextDir = path.join(tmp, 'next');
  // `..foo.mjs` is a VALID payload name under isSafeRelPath (no `..` segment) —
  // a prefix-based inside/outside test would misread it as outside and skip
  // every guard, letting the plan overwrite it (or apply refuse it).
  writeFile(currentDir, '..foo.mjs', 'A');
  writeFile(nextDir, '..foo.mjs', 'B'); // upstream changed → safe-update
  writeFile(currentDir, INSTALL_MANIFEST_NAME, JSON.stringify({
    schema_version: 1,
    kit: { source_ref: 'OLDREF' },
    payload: { files: [{ path: '..foo.mjs', sha256: sha('A'), classification: 'consumer-runtime', mode: '100644' }] },
  }, null, 2) + '\n');
  writeFile(nextDir, PAYLOAD_MANIFEST_NAME, JSON.stringify({
    schema_version: 1,
    kit: { source_ref: 'NEXTREF' },
    payload: { files: [{ path: '..foo.mjs', sha256: sha('B'), classification: 'consumer-runtime', mode: '100644' }] },
  }, null, 2) + '\n');

  const r = spawnSync(process.execPath, [
    UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply',
    '--plan', path.join(currentDir, '..foo.mjs'),
  ], { encoding: 'utf8' });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /collides with a path/);
  assert.equal(read(currentDir, '..foo.mjs'), 'A', 'the tracked file must stay untouched');

  // Without a colliding --plan, the valid dotted name must still APPLY as a
  // normal safe-update (segment-exact containment, not prefix matching).
  const ok = spawnSync(process.execPath, [
    UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply',
  ], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(read(currentDir, '..foo.mjs'), 'B', 'safe-update must reach the dotted name');
});

test('--plan may not sit above apply outputs or the backup dir (ancestor collisions)', (t) => {
  const tmp = mkTmp('rebase-ancestor');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const currentDir = path.join(tmp, 'current');
  const nextDir = path.join(tmp, 'next');
  writeFile(nextDir, 'z/new.mjs', 'N');
  writeFile(currentDir, INSTALL_MANIFEST_NAME, JSON.stringify({
    schema_version: 1, kit: { source_ref: 'OLDREF' }, payload: { files: [] },
  }, null, 2) + '\n');
  writeFile(nextDir, PAYLOAD_MANIFEST_NAME, JSON.stringify({
    schema_version: 1,
    kit: { source_ref: 'NEXTREF' },
    payload: { files: [{ path: 'z/new.mjs', sha256: sha('N'), classification: 'consumer-runtime', mode: '100644' }] },
  }, null, 2) + '\n');

  // Plan as a FILE at <current>/z would block apply's mkdir for z/new.mjs.
  const r1 = spawnSync(process.execPath, [
    UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply',
    '--plan', path.join(currentDir, 'z'),
  ], { encoding: 'utf8' });
  assert.equal(r1.status, 2, r1.stderr);
  assert.match(r1.stderr, /collides with a path/);
  assert.equal(fs.existsSync(path.join(currentDir, 'z')), false);
  assert.equal(fs.existsSync(path.join(currentDir, 'z', 'new.mjs')), false, 'no partial apply');

  // Plan as a FILE above a not-yet-created --backup-dir blocks its mkdir.
  const r2 = spawnSync(process.execPath, [
    UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply',
    '--backup-dir', path.join(tmp, 'bk', 'sub'), '--plan', path.join(tmp, 'bk'),
  ], { encoding: 'utf8' });
  assert.equal(r2.status, 2, r2.stderr);
  assert.match(r2.stderr, /overlap --backup-dir/);
  assert.equal(fs.existsSync(path.join(tmp, 'bk')), false);
});

test('a symlink --plan destination (including dangling into --next) is refused', (t) => {
  const tmp = mkTmp('rebase-dangling');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  // Dangling aliases: existsSync says absent, but the eventual write would land
  // inside --next. Two shapes: a FILE symlink as the plan itself (POSIX; needs
  // privilege on Windows), and a dangling DIRECTORY junction as the plan's
  // parent (works unprivileged on Windows).
  let planPath = null;
  const fileLink = path.join(tmp, 'plan-link.md');
  try {
    fs.symlinkSync(path.join(nextDir, 'stray-plan.md'), fileLink, 'file');
    planPath = fileLink;
  } catch { /* fall through to the dangling-junction shape */ }
  if (!planPath) {
    const dirLink = path.join(tmp, 'plan-dir-link');
    try {
      fs.symlinkSync(path.join(nextDir, 'not-yet-created'), dirLink, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      t.skip('symlink/junction creation not permitted on this platform');
      return;
    }
    planPath = path.join(dirLink, 'stray-plan.md');
  }
  const before = read(currentDir, 'safe.mjs');
  const r = spawnSync(process.execPath, [
    UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply', '--plan', planPath,
  ], { encoding: 'utf8' });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /must not be a symlink|at or inside --next/);
  assert.equal(fs.existsSync(path.join(nextDir, 'stray-plan.md')), false, 'plan must not land inside --next');
  assert.equal(fs.existsSync(path.join(nextDir, 'not-yet-created')), false, 'no directory may be created inside --next');
  assert.equal(read(currentDir, 'safe.mjs'), before, 'refusal must precede any mutation');
});

test('a symlink/junction alias of a protected root cannot smuggle --plan past the collision guard', (t) => {
  const tmp = mkTmp('rebase-root-alias');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  const aliasNext = path.join(tmp, 'alias-next');
  const aliasCur = path.join(tmp, 'alias-cur');
  try {
    fs.symlinkSync(nextDir, aliasNext, process.platform === 'win32' ? 'junction' : 'dir');
    fs.symlinkSync(currentDir, aliasCur, process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    t.skip('symlink/junction creation not permitted on this platform');
    return;
  }
  const before = read(currentDir, 'safe.mjs');

  // Alias into --next: lexically outside every protected root, physically inside it.
  const r1 = spawnSync(process.execPath, [
    UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply',
    '--plan', path.join(aliasNext, 'stray-plan.md'),
  ], { encoding: 'utf8' });
  assert.equal(r1.status, 2, r1.stderr);
  assert.match(r1.stderr, /at or inside --next/);
  assert.equal(fs.existsSync(path.join(nextDir, 'stray-plan.md')), false);

  // Alias into --current naming a tracked payload file.
  const r2 = spawnSync(process.execPath, [
    UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply',
    '--plan', path.join(aliasCur, 'safe.mjs'),
  ], { encoding: 'utf8' });
  assert.equal(r2.status, 2, r2.stderr);
  assert.match(r2.stderr, /collides with a path/);
  assert.equal(read(currentDir, 'safe.mjs'), before, 'refusal must precede any mutation');
});

test('an explicit in-current --plan path refuses symlink/junction escapes (physical containment)', (t) => {
  const tmp = mkTmp('rebase-plan-junction');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  // _upgrade inside current is a junction/symlink pointing at the NEXT payload:
  // a lexical check alone would let the plan write land inside --next.
  const linkDir = path.join(currentDir, '_upgrade');
  try {
    fs.symlinkSync(nextDir, linkDir, process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    t.skip('symlink/junction creation not permitted on this platform');
    return;
  }
  const before = read(currentDir, 'safe.mjs');
  const planPath = path.join(linkDir, 'evil-plan.md');
  const r = spawnSync(process.execPath, [
    UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply', '--plan', planPath,
  ], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  // Either guard is acceptable: the physical collision check (which sees the
  // junction resolve into --next) or the symlink write containment.
  assert.match(r.stderr, /at or inside --next|symlink/i);
  assert.equal(fs.existsSync(path.join(nextDir, 'evil-plan.md')), false, 'plan must not escape into --next');
  assert.equal(read(currentDir, 'safe.mjs'), before, 'refusal must precede any mutation');
});

test('CLI still fails on a bad --plan path before any apply mutation', (t) => {
  const tmp = mkTmp('rebase-badplan');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { currentDir, nextDir } = buildScenario(tmp);
  // A FILE where the plan's parent directory must be created → mkdir fails.
  const blocker = path.join(tmp, 'blocker');
  fs.writeFileSync(blocker, 'not a directory', 'utf8');
  const before = read(currentDir, 'safe.mjs');
  const r = spawnSync(process.execPath, [
    UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply', '--plan', path.join(blocker, 'plan.md'),
  ], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.equal(read(currentDir, 'safe.mjs'), before, 'apply must not run when the plan cannot be written');
  assert.equal(fs.existsSync(path.join(currentDir, CONFLICTS_DIR_NAME)), false);
});

test('doc-drift reports zero broken-relative-link findings for the rebased plan', (t) => {
  const tmp = mkTmp('rebase-docdrift');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dogfoodNotes = [
    '# Upgrade Notes',
    '',
    'See [input-reconciliation.md](input-reconciliation.md).',
    'See [screen-identity.md](screen-identity.md).',
    '',
  ].join('\n');
  const { currentDir, nextDir } = buildNotesScenario(tmp, { notesBody: dogfoodNotes });
  const r = spawnSync(process.execPath, [UPGRADE_CLI, '--current', currentDir, '--next', nextDir, '--apply'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);

  const DOC_DRIFT_CLI = path.join(KIT_ROOT, 'scripts', 'doc-drift.mjs');
  const d = spawnSync(process.execPath, [DOC_DRIFT_CLI, '--root', currentDir, '--json'], { encoding: 'utf8' });
  assert.equal(d.status, 0, d.stderr); // warning-first exit 0 contract untouched
  const report = JSON.parse(d.stdout);
  const broken = report.findings.filter((f) => f.check === 'broken-relative-link');
  assert.deepEqual(broken, [], 'embedded migration links must not surface as broken-relative-link');
  assert.equal(report.warning_count, 0);
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

test('CLI human summary includes mode-only updates', (t) => {
  const tmp = mkTmp('cli-mode-summary');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const scenario = buildModeUpdateScenario(tmp, t);
  if (!scenario) return;
  const { currentDir, nextDir } = scenario;

  const r = spawnSync(process.execPath, [UPGRADE_CLI, '--current', currentDir, '--next', nextDir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /mode-update=1/);
  assert.match(r.stdout, /dry-run/);
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

function linkInstalledDependency(out, packageName) {
  const source = path.join(KIT_ROOT, 'node_modules', packageName);
  assert.equal(fs.existsSync(source), true, `dependency ${packageName} must be installed for packed CLI regression`);
  const target = path.join(out, 'node_modules', packageName);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fs.symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    fs.cpSync(source, target, { recursive: true });
  }
}

test('packed payload: upgrade CLI rebases the shipped upgrade-notes links in the generated plan', (t) => {
  const tmp = mkTmp('rebase-packed');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const nextDir = path.join(tmp, 'next');
  const pack = spawnSync(process.execPath, [PACK_CLI, '--out', nextDir, '--json', '--source-ref', 'packedrebase1'], { cwd: KIT_ROOT, encoding: 'utf8' });
  assert.equal(pack.status, 0, pack.stderr);
  linkInstalledDependency(nextDir, 'yaml');

  // Fresh consumer install driven by the PACKED upgrade CLI (no source-tree import).
  const currentDir = path.join(tmp, 'consumer', 'tools', 'frontend-workflow');
  fs.mkdirSync(currentDir, { recursive: true });
  const r = spawnSync(process.execPath, [
    path.join(nextDir, 'scripts', 'upgrade-vendored-kit.mjs'),
    '--current', currentDir, '--next', nextDir, '--apply',
  ], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);

  const planPath = path.join(currentDir, '_upgrade', 'upgrade-plan-packedrebase1.md');
  assert.equal(fs.existsSync(planPath), true, 'packed apply should write the default in-kit plan');
  const md = fs.readFileSync(planPath, 'utf8');
  // The packed payload's real upgrade-notes are embedded and rebased.
  assert.match(md, /## Consumer migrations/);
  assert.match(md, /\]\(\.\.\/docs\/reference\/input-reconciliation\.md\)/);
  assert.match(md, /\]\(\.\.\/docs\/reference\/screen-identity\.md\)/);
  assert.doesNotMatch(md, /\]\(input-reconciliation\.md\)/);
  assert.doesNotMatch(md, /\]\(screen-identity\.md\)/);
  for (const rel of ['../docs/reference/input-reconciliation.md', '../docs/reference/screen-identity.md']) {
    assert.equal(fs.existsSync(path.resolve(path.dirname(planPath), rel)), true, `${rel} should exist in the installed kit`);
  }

  // The packed doc-drift CLI over the installed kit (plan included) reports no
  // broken-relative-link for the embedded migration links.
  const d = spawnSync(process.execPath, [
    path.join(nextDir, 'scripts', 'doc-drift.mjs'), '--root', currentDir, '--json',
  ], { encoding: 'utf8' });
  assert.equal(d.status, 0, d.stderr);
  const report = JSON.parse(d.stdout);
  const planBroken = report.findings.filter((f) => (
    f.check === 'broken-relative-link' && String(f.source).startsWith('_upgrade/')
  ));
  assert.deepEqual(planBroken, [], 'plan migration links must not be broken in the packed flow');
});
