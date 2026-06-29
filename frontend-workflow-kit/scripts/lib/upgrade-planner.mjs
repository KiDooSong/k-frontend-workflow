// upgrade-planner.mjs — safe upgrade planner/apply for a vendored kit.
//
// Compares three views of every file:
//   - old hash      : baseline recorded at last install (install manifest, or the
//                     payload manifest of the vendored packed kit, or "unknown").
//   - current hash  : the file as it currently lives in the consumer vendored kit.
//   - next hash     : the file in the newly packed upstream payload.
//
// From those it classifies each file and produces a plan. --apply only ever
// touches files INSIDE the consumer vendored kit path (`--current`), never the
// consumer's docs/frontend-workflow, app source, or root config. It never
// overwrites locally modified files, never deletes upstream-removed files, and
// never runs migrations — those stay human/LLM decisions surfaced in the plan.
import fs from 'node:fs';
import path from 'node:path';
import {
  MANIFEST_SCHEMA_VERSION,
  PAYLOAD_MANIFEST_NAME,
  INSTALL_MANIFEST_NAME,
  CONFLICTS_DIR_NAME,
  sha256OfFile,
  readJsonSafe,
  writeJson,
  manifestFileIndex,
  scanPayloadFiles,
  statMode,
  isSafeRelPath,
} from './kit-manifest.mjs';

export const CATEGORIES = [
  'safe-update',
  'mode-update',
  'unchanged',
  'local-modified',
  'conflict',
  'new-file',
  'removed-upstream',
  'missing-current',
  'unknown-local',
];

// One-line human descriptions used in the markdown plan.
export const CATEGORY_DESCRIPTIONS = {
  'safe-update': 'Unchanged locally since install; upstream changed — safe to overwrite.',
  'mode-update': 'Unchanged locally since install; upstream changed only file mode — safe to chmod.',
  'unchanged': 'Identical to the next payload — no action.',
  'local-modified': 'Modified locally; upstream unchanged from baseline — local file kept.',
  'conflict': 'Modified locally AND changed upstream — manual merge required.',
  'new-file': 'New upstream file not present locally — added on apply.',
  'removed-upstream': 'Present at install, gone upstream — orphan; never auto-deleted.',
  'missing-current': 'Tracked at install, missing locally, present upstream — restored on apply.',
  'unknown-local': 'Local file not part of any payload manifest — left untouched.',
};

function sameFileState(leftHash, leftMode, rightHash, rightMode) {
  if (leftHash !== rightHash) return false;
  if (leftHash == null) return true;
  return !leftMode || !rightMode || leftMode === rightMode;
}

// Pure classification of one path from its three hashes.
//   oldHash/curHash/nextHash: hex string or null (null = absent in that view).
//   baselineUnknown: true when there is no install/payload baseline (bootstrap).
export function classifyFile({
  oldHash,
  curHash,
  nextHash,
  baselineUnknown,
  oldMode = null,
  curMode = null,
  nextMode = null,
}) {
  const hasOld = oldHash != null;
  const hasCur = curHash != null;
  const hasNext = nextHash != null;

  if (!hasNext) {
    // Not shipped by the next payload.
    if (hasOld) return 'removed-upstream'; // was managed, upstream dropped it
    return 'unknown-local'; // present only in current, never managed
  }
  if (!hasCur) {
    // Next ships it but it is missing locally.
    if (hasOld) return 'missing-current'; // was installed, now deleted locally
    return 'new-file'; // genuinely new upstream file
  }
  if (sameFileState(curHash, curMode, nextHash, nextMode)) {
    return 'unchanged';
  }
  if (curHash === nextHash && curMode && nextMode && curMode !== nextMode) {
    if (baselineUnknown || !hasOld) return 'local-modified';
    if (sameFileState(oldHash, oldMode, curHash, curMode)) return 'mode-update';
    if (sameFileState(oldHash, oldMode, nextHash, nextMode)) return 'local-modified';
    return 'conflict';
  }
  // current and next differ.
  if (baselineUnknown || !hasOld) return 'conflict'; // can't prove a safe overwrite
  if (sameFileState(oldHash, oldMode, curHash, curMode)) return 'safe-update'; // local untouched, upstream moved
  if (sameFileState(oldHash, oldMode, nextHash, nextMode)) return 'local-modified'; // local moved, upstream same
  return 'conflict'; // both moved, differently
}

// Decide what --apply would do for a file, honoring the chosen flags.
function plannedAction(category, classification, options) {
  switch (category) {
    case 'safe-update':
      return 'overwrite';
    case 'mode-update':
      return 'chmod';
    case 'new-file':
      return 'add';
    case 'missing-current':
      return 'restore';
    case 'unchanged':
      return 'none';
    case 'local-modified':
      return 'keep-local';
    case 'unknown-local':
      return 'leave';
    case 'removed-upstream':
      return options.prune ? 'prune' : 'keep-orphan';
    case 'conflict':
      if (options.forceRuntime && classification === 'consumer-runtime') return 'overwrite-forced';
      if (options.allowConflicts) return 'overwrite-conflict';
      return 'write-incoming';
    default:
      return 'none';
  }
}

const OVERWRITE_ACTIONS = new Set(['overwrite', 'overwrite-conflict', 'overwrite-forced']);
const WRITE_ACTIONS = new Set(['overwrite', 'overwrite-conflict', 'overwrite-forced', 'add', 'restore']);

// Resolve the baseline for the consumer vendored kit.
// Prefers a managed install manifest, then the payload manifest of a vendored
// packed kit, else falls back to a conservative unmanaged ("unknown") baseline.
export function resolveBaseline(currentDir) {
  const install = readJsonSafe(path.join(currentDir, INSTALL_MANIFEST_NAME));
  if (install) {
    return {
      source: 'install-manifest',
      ref: install?.kit?.source_ref ?? null,
      index: manifestFileIndex(install),
    };
  }
  const payload = readJsonSafe(path.join(currentDir, PAYLOAD_MANIFEST_NAME));
  if (payload) {
    return {
      source: 'payload-manifest',
      ref: payload?.kit?.source_ref ?? null,
      index: manifestFileIndex(payload),
    };
  }
  return { source: 'unknown', ref: null, index: new Map() };
}

// Resolve the next payload (newly packed kit). Prefers its payload manifest,
// scanning the tree as a fallback so the planner still works against a packed
// dir whose manifest predates this feature.
export function resolveNext(nextDir) {
  const manifest = readJsonSafe(path.join(nextDir, PAYLOAD_MANIFEST_NAME));
  if (manifest && Array.isArray(manifest?.payload?.files)) {
    return {
      source: 'payload-manifest',
      kit: manifest.kit || {},
      destinationHint: manifest?.payload?.destination_hint ?? null,
      index: manifestFileIndex(manifest),
    };
  }
  // Fallback: synthesize an index by hashing the tree.
  const index = new Map();
  for (const rel of scanPayloadFiles(nextDir)) {
    const abs = path.join(nextDir, rel);
    index.set(rel, { sha256: sha256OfFile(abs), classification: null, mode: statMode(abs) });
  }
  return { source: 'scan', kit: {}, destinationHint: null, index };
}

function hashCurrent(currentDir, rel) {
  const abs = path.join(currentDir, rel);
  try {
    if (!fs.statSync(abs).isFile()) return null;
  } catch {
    return null;
  }
  return sha256OfFile(abs);
}

function modeCurrent(currentDir, rel) {
  const abs = path.join(currentDir, rel);
  try {
    if (!fs.statSync(abs).isFile()) return null;
  } catch {
    return null;
  }
  return statMode(abs);
}

// Migration notes shipped with the next payload (Part F). Surfaced verbatim in
// the plan with a "review if your baseline is older" caveat, since we do not
// require knowing the exact installed baseline.
export function collectMigrationNotes(nextDir) {
  const rel = 'docs/reference/upgrade-notes.md';
  const abs = path.join(nextDir, rel);
  try {
    if (!fs.statSync(abs).isFile()) return null;
  } catch {
    return null;
  }
  return { path: rel, body: fs.readFileSync(abs, 'utf8') };
}

function emptyCounts() {
  const counts = {};
  for (const c of CATEGORIES) counts[c] = 0;
  counts.total = 0;
  return counts;
}

// Build the full upgrade plan (no writes).
export function buildPlan({ currentDir, nextDir, options = {} }) {
  const opts = {
    apply: !!options.apply,
    prune: !!options.prune,
    allowConflicts: !!options.allowConflicts,
    forceRuntime: !!options.forceRuntime,
    backupDir: options.backupDir || null,
  };

  const baseline = resolveBaseline(currentDir);
  const next = resolveNext(nextDir);
  const baselineUnknown = baseline.source === 'unknown';

  const universe = new Set([...next.index.keys(), ...baseline.index.keys()]);
  const files = [];
  const counts = emptyCounts();

  for (const rel of [...universe].sort((a, b) => a.localeCompare(b))) {
    const oldEntry = baseline.index.get(rel) || null;
    const nextEntry = next.index.get(rel) || null;
    const oldHash = oldEntry?.sha256 ?? null;
    const nextHash = nextEntry?.sha256 ?? null;
    const curHash = hashCurrent(currentDir, rel);
    const oldMode = oldEntry?.mode ?? null;
    const curMode = modeCurrent(currentDir, rel);
    const nextMode = nextEntry?.mode ?? null;
    const category = classifyFile({
      oldHash,
      curHash,
      nextHash,
      baselineUnknown,
      oldMode,
      curMode,
      nextMode,
    });
    const classification = nextEntry?.classification ?? oldEntry?.classification ?? null;
    files.push({
      path: rel,
      category,
      classification,
      old_sha256: oldHash,
      current_sha256: curHash,
      next_sha256: nextHash,
      mode: nextMode ?? oldMode,
      planned_action: plannedAction(category, classification, opts),
    });
    counts[category] += 1;
    counts.total += 1;
  }

  // Unknown-local: files physically present under current but tracked by neither
  // the baseline nor the next payload. Reported, never touched.
  for (const rel of scanPayloadFiles(currentDir)) {
    if (universe.has(rel)) continue;
    files.push({
      path: rel,
      category: 'unknown-local',
      classification: null,
      old_sha256: null,
      current_sha256: hashCurrent(currentDir, rel),
      next_sha256: null,
      mode: null,
      planned_action: 'leave',
    });
    counts['unknown-local'] += 1;
    counts.total += 1;
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  const warnings = [];
  if (baselineUnknown) {
    warnings.push(
      'No installed manifest found. Treating current vendored kit as an unmanaged baseline. '
      + 'Differing files are reported as conflicts and require manual review. '
      + 'After a successful apply, future upgrades will be manifest-based.',
    );
  }

  return {
    schema_version: MANIFEST_SCHEMA_VERSION,
    baseline: baseline.source,
    current: { source_ref: baseline.ref },
    next: {
      source_ref: next.kit?.source_ref ?? null,
      source_repo: next.kit?.source_repo ?? null,
      package_version: next.kit?.package_version ?? null,
    },
    destination_hint: next.destinationHint,
    counts,
    files,
    migration_notes: collectMigrationNotes(nextDir),
    warnings,
    options: opts,
  };
}

// --- markdown rendering ----------------------------------------------------
function shortRef(ref) {
  if (!ref) return 'unknown';
  return /^[0-9a-f]{40}$/i.test(ref) ? ref.slice(0, 12) : ref;
}

function fileTable(files, columns) {
  if (files.length === 0) return '_None._\n';
  const header = columns.map((c) => c.label);
  const sep = columns.map(() => '---');
  const rows = files.map((f) => columns.map((c) => c.get(f)));
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ];
  return lines.join('\n') + '\n';
}

const PATH_COL = { label: 'File', get: (f) => `\`${f.path}\`` };
const CLASS_COL = { label: 'Classification', get: (f) => f.classification || '—' };
const ACTION_COL = { label: 'Apply action', get: (f) => f.planned_action };

export function renderPlanMarkdown(plan) {
  const byCat = (cat) => plan.files.filter((f) => f.category === cat);
  const c = plan.counts;
  const lines = [];

  lines.push('# Frontend Workflow Kit Upgrade Plan');
  lines.push('');
  lines.push('> Generated by `scripts/upgrade-vendored-kit.mjs`. Review before applying.');
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(`- Baseline source: ${plan.baseline}`);
  lines.push(`- Current: ${shortRef(plan.current.source_ref)}`);
  lines.push(`- Next: ${shortRef(plan.next.source_ref)}${plan.next.package_version ? ` (v${plan.next.package_version})` : ''}`);
  lines.push(`- Safe updates: ${c['safe-update']}`);
  lines.push(`- Mode updates: ${c['mode-update']}`);
  lines.push(`- New files: ${c['new-file']}`);
  lines.push(`- Conflicts: ${c.conflict}`);
  lines.push(`- Local modifications: ${c['local-modified']}`);
  lines.push(`- Removed upstream/orphans: ${c['removed-upstream']}`);
  lines.push(`- Missing locally (restore): ${c['missing-current']}`);
  lines.push(`- Unchanged: ${c.unchanged}`);
  lines.push(`- Unknown local files: ${c['unknown-local']}`);
  lines.push('');

  if (plan.warnings.length) {
    lines.push('## Warnings');
    lines.push('');
    for (const w of plan.warnings) lines.push(`- ${w}`);
    lines.push('');
  }

  lines.push('## Required manual actions');
  lines.push('');
  const manual = [];
  if (c.conflict) manual.push(`- Resolve ${c.conflict} conflict(s) by merging upstream changes into your local edits (see below).`);
  if (c['removed-upstream']) manual.push(`- Review ${c['removed-upstream']} orphan(s); delete only if intentional (re-run with \`--prune\`).`);
  if (plan.baseline === 'unknown') manual.push('- First managed upgrade from an unmanaged install: review all differing files manually.');
  if (manual.length === 0) manual.push('- None. Safe updates and new files can be applied automatically.');
  lines.push(...manual);
  lines.push('');

  lines.push('## Safe updates');
  lines.push('');
  lines.push(fileTable(byCat('safe-update'), [PATH_COL, CLASS_COL, ACTION_COL]));

  lines.push('## Mode updates');
  lines.push('');
  lines.push(fileTable(byCat('mode-update'), [PATH_COL, CLASS_COL, ACTION_COL]));

  lines.push('## New files');
  lines.push('');
  lines.push(fileTable(byCat('new-file'), [PATH_COL, CLASS_COL, ACTION_COL]));

  lines.push('## Conflicts — manual merge required');
  lines.push('');
  lines.push(fileTable(byCat('conflict'), [PATH_COL, CLASS_COL, ACTION_COL]));

  lines.push('## Local modifications — kept');
  lines.push('');
  lines.push(fileTable(byCat('local-modified'), [PATH_COL, CLASS_COL, ACTION_COL]));

  lines.push('## Orphans — review before deleting');
  lines.push('');
  lines.push(fileTable(byCat('removed-upstream'), [PATH_COL, CLASS_COL, ACTION_COL]));

  const missing = byCat('missing-current');
  if (missing.length) {
    lines.push('## Missing locally — restored on apply');
    lines.push('');
    lines.push(fileTable(missing, [PATH_COL, CLASS_COL, ACTION_COL]));
  }

  const unknown = byCat('unknown-local');
  if (unknown.length) {
    lines.push('## Unknown local files — left untouched');
    lines.push('');
    lines.push(fileTable(unknown, [PATH_COL, CLASS_COL, ACTION_COL]));
  }

  lines.push('## Consumer migrations');
  lines.push('');
  if (plan.migration_notes) {
    lines.push('> Review manually if your installed baseline is older than the next ref. '
      + 'These notes list consumer-impacting changes; not all may apply to your baseline.');
    lines.push('');
    lines.push(plan.migration_notes.body.trim());
    lines.push('');
  } else {
    lines.push('_No upgrade notes shipped with the next payload._');
    lines.push('');
  }

  lines.push('## Recommended validation');
  lines.push('');
  lines.push('After applying and resolving conflicts, run from the consumer repo root:');
  lines.push('');
  lines.push('```bash');
  lines.push('npm run workflow:doctor');
  lines.push('npm run workflow:state');
  lines.push('npm run workflow:readiness');
  lines.push('npm run workflow:validate');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

// --- apply -----------------------------------------------------------------
// Lexical containment: childAbs must be strictly under parentAbs.
function assertInside(parentAbs, childAbs, label) {
  const rel = path.relative(parentAbs, childAbs);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`refusing to write outside ${label}: ${childAbs}`);
  }
}

// Physical containment: defends the lexical check against symlink escapes.
// A symlinked file (or symlinked parent dir) under --current could otherwise let
// fs.copyFileSync/rmSync follow the link and touch a file outside the kit. We
// realpath the deepest existing ancestor and refuse if it leaves realRoot, and
// refuse to write through a symlinked destination at all (kit payload files are
// always regular files — pack rejects symlinks).
export function assertSafeWriteTarget(realRoot, destAbs, label) {
  let probe = destAbs;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) return; // no existing ancestor (cannot happen under realRoot)
    probe = parent;
  }
  const realAncestor = fs.realpathSync(probe);
  const rel = path.relative(realRoot, realAncestor);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`refusing to write outside ${label} (symlink escape): ${destAbs}`);
  }
  try {
    if (fs.lstatSync(destAbs).isSymbolicLink()) {
      throw new Error(`refusing to overwrite a symlink under ${label}: ${destAbs}`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function applyFileMode(dest, mode) {
  // mode like "100755" → restore exec bits where the platform honors them.
  if (typeof mode === 'string' && /^100[0-7]{3}$/.test(mode)) {
    try {
      fs.chmodSync(dest, parseInt(mode.slice(3), 8));
    } catch { /* best-effort on platforms without exec bit */ }
  }
}

function copyFileMode(src, dest, mode) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  applyFileMode(dest, mode);
}

function backupFile(currentDir, backupDir, rel) {
  if (!backupDir) return;
  const src = path.join(currentDir, rel);
  if (!fs.existsSync(src)) return;
  const dest = path.join(backupDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// Build the post-apply install manifest — the baseline for the NEXT upgrade.
//
// The baseline records the UPSTREAM reference for each file (what upstream ships
// as of this upgrade), NOT the on-disk bytes. This is critical: a file we kept
// locally modified must still record upstream's hash so the next upgrade detects
// it as local-modified (cur != baseline) instead of mistaking it for an
// untouched file and overwriting the local edit.
//   - Files upstream still ships  → upstream (next) hash/classification/mode.
//   - Orphans upstream dropped but still present locally → their on-disk hash,
//     so they stay tracked and keep getting reported as removed-upstream.
export function buildInstallManifest({ currentDir, nextResolved, baseline, sourceRefOverride }) {
  const files = [];
  for (const [rel, entry] of nextResolved.index) {
    files.push({
      path: rel,
      sha256: entry.sha256,
      classification: entry.classification ?? null,
      mode: entry.mode ?? null,
    });
  }
  for (const [rel, entry] of baseline.index) {
    if (nextResolved.index.has(rel)) continue; // already covered by upstream
    const abs = path.join(currentDir, rel);
    let exists = false;
    try {
      exists = fs.statSync(abs).isFile();
    } catch { /* pruned or locally deleted */ }
    if (!exists) continue; // orphan removed → drop from baseline
    files.push({
      path: rel,
      sha256: sha256OfFile(abs),
      classification: entry.classification ?? null,
      mode: entry.mode ?? statMode(abs),
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    schema_version: MANIFEST_SCHEMA_VERSION,
    kit: {
      source_repo: nextResolved.kit?.source_repo ?? null,
      source_ref: sourceRefOverride ?? nextResolved.kit?.source_ref ?? null,
      package_version: nextResolved.kit?.package_version ?? null,
    },
    payload: {
      destination_hint: nextResolved.destinationHint ?? null,
      files,
    },
  };
}

// Execute the plan's planned actions. Only writes inside currentDir (+ backupDir).
export function applyPlan({ plan, currentDir, nextDir, options = {} }) {
  const resolvedCurrent = path.resolve(currentDir);
  const resolvedNext = path.resolve(nextDir);
  const realCurrent = fs.realpathSync(resolvedCurrent);
  const backupDir = options.backupDir ? path.resolve(options.backupDir) : null;
  const next = resolveNext(resolvedNext);
  const baseline = resolveBaseline(resolvedCurrent);

  const actions = [];
  const record = (rel, action) => actions.push({ path: rel, action });
  const LABEL = 'current vendored kit';

  for (const f of plan.files) {
    const action = f.planned_action;
    if (!isSafeRelPath(f.path)) continue; // never act on a traversal/absolute path
    const destAbs = path.join(resolvedCurrent, f.path);

    if (WRITE_ACTIONS.has(action)) {
      assertInside(resolvedCurrent, destAbs, LABEL);
      assertSafeWriteTarget(realCurrent, destAbs, LABEL);
      if (OVERWRITE_ACTIONS.has(action)) backupFile(resolvedCurrent, backupDir, f.path);
      copyFileMode(path.join(resolvedNext, f.path), destAbs, f.mode);
      record(f.path, action);
    } else if (action === 'chmod') {
      assertInside(resolvedCurrent, destAbs, LABEL);
      assertSafeWriteTarget(realCurrent, destAbs, LABEL);
      applyFileMode(destAbs, f.mode);
      record(f.path, action);
    } else if (action === 'write-incoming') {
      const incoming = path.join(resolvedCurrent, CONFLICTS_DIR_NAME, `${f.path}.incoming`);
      assertInside(resolvedCurrent, incoming, LABEL);
      assertSafeWriteTarget(realCurrent, incoming, LABEL);
      fs.mkdirSync(path.dirname(incoming), { recursive: true });
      fs.copyFileSync(path.join(resolvedNext, f.path), incoming);
      record(f.path, 'write-incoming');
    } else if (action === 'prune') {
      assertInside(resolvedCurrent, destAbs, LABEL);
      assertSafeWriteTarget(realCurrent, destAbs, LABEL);
      backupFile(resolvedCurrent, backupDir, f.path);
      try {
        fs.rmSync(destAbs, { force: true });
      } catch { /* already gone */ }
      record(f.path, 'prune');
    }
    // none / keep-local / leave / keep-orphan → no write
  }

  // Refresh meta: install manifest (post-apply baseline) + a copy of the next
  // payload manifest so the vendored kit advertises the ref it was upgraded to.
  const installManifest = buildInstallManifest({
    currentDir: resolvedCurrent,
    nextResolved: next,
    baseline,
  });
  const installPath = path.join(resolvedCurrent, INSTALL_MANIFEST_NAME);
  assertSafeWriteTarget(realCurrent, installPath, LABEL); // meta writes get the same symlink guard
  writeJson(installPath, installManifest);

  const nextManifestRaw = readJsonSafe(path.join(resolvedNext, PAYLOAD_MANIFEST_NAME));
  if (nextManifestRaw) {
    const payloadPath = path.join(resolvedCurrent, PAYLOAD_MANIFEST_NAME);
    assertSafeWriteTarget(realCurrent, payloadPath, LABEL);
    writeJson(payloadPath, nextManifestRaw);
  }

  return { actions, installManifest };
}
