// Canonical HEAD -> staged-index decision inspection. Not an execution permit,
// human approval verifier, working-tree backstop, or automatic Stage 04 writer.
// Reuse C's raw Git objects and private-index capture; never checkout/reset/stage
// the user's files. Only the captured original Git bytes/modes form each side.
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { splitFrontmatter } from './util.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { ownerParts, readCurrentBytes, hashBytes } from './current-work-request.mjs';
import { resolveProjectRoot, resolveProjectPath, gitIdentity } from './current-work-execution-core.mjs';
import { captureCurrentTree, captureCurrentIndex, snapshotRecords } from './current-work-snapshot.mjs';
import { materializeRawGitTree, runVisualGit } from './visual-refresh-git-objects.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { inspectScopedDecisionTransitions } from './scoped-work-transitions.mjs';
import { inspectScopedDecisionScopeTransitions } from './scoped-work-decision-scopes.mjs';
import { scopeSet } from './scoped-work-normalize.mjs';
import { ScopedWorkContractError } from './scoped-work-request.mjs';

const KEYS = new Set(['owner', 'root', 'docs', 'kit', 'policy', 'manifest', 'layout']);
const RESOURCES = ['docs', 'kit', 'policy', 'manifest', 'layout'];
const REGULAR = new Set(['100644', '100755']);
const fail = (message) => { throw new ScopedWorkContractError(`SW-GIT-TRANSITIONS: ${message}`); };

function snapshotContext(ctx, view, raw, resources) {
  const records = new Map();
  const repositoryPath = (relative) => ctx.projectPrefix ? `${ctx.projectPrefix}/${relative}` : relative;
  function audit(relative, expectedHash = null) {
    const original = raw.entry(relative);
    if (!original || original.type !== 'blob' || !REGULAR.has(original.mode)) {
      fail(`original regular Git blob required: ${relative}`);
    }
    const file = canonicalRepositoryPath(raw.root, relative,
      { required: true, type: 'file', label: 'scoped Git transition resource' });
    const bytes = readCurrentBytes(file.absolute, 'scoped Git transition resource');
    const sha256 = hashBytes(bytes), evidence = view.evidence(repositoryPath(relative));
    if (evidence.kind !== 'file' || evidence.oid !== original.oid || evidence.hash !== sha256 ||
        (expectedHash !== null && expectedHash !== sha256)) fail(`original Git bytes differ: ${relative}`);
    if (process.platform !== 'win32' && (fs.lstatSync(file.absolute).mode & 0o777) !==
        (original.mode === '100755' ? 0o755 : 0o644)) fail(`original Git mode differs: ${relative}`);
    records.set(relative, { file: relative, repository_path: repositoryPath(relative),
      git_mode: original.mode, oid: original.oid, sha256 });
    return bytes;
  }
  for (const name of ['docs', 'kit']) {
    if (raw.entry(resources[name])?.type !== 'tree') fail(`original Git directory required: ${name}`);
    canonicalRepositoryPath(raw.root, resources[name],
      { required: true, type: 'directory', label: `scoped ${name}` });
  }
  for (const name of ['policy', 'manifest', 'layout']) audit(resources[name]);
  const docs = [], prefix = `${repositoryPath(resources.docs)}/`;
  // Same target-index domain as C/validate: Markdown under docs except _meta.
  // Pin non-artifact Markdown too: its frontmatter controls index membership.
  for (const name of [...view.entries.keys()].sort()) {
    if (!name.startsWith(prefix) || !name.endsWith('.md') || name.slice(prefix.length).split('/').includes('_meta')) continue;
    const relative = ctx.projectPrefix ? name.slice(ctx.projectPrefix.length + 1) : name;
    const bytes = audit(relative);
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { fail(`non-UTF-8 canonical Markdown: ${relative}`); }
    const { data, hasFrontmatter, parseError } = splitFrontmatter(text);
    if (parseError) fail(`artifact frontmatter: ${relative}: ${parseError}`);
    if (hasFrontmatter && data?.artifact_type) docs.push({ file: path.join(raw.root, ...relative.split('/')), fm: data });
  }
  const absolute = (name) => path.join(raw.root, ...resources[name].split('/'));
  return {
    options: { projectRoot: raw.root, docsDir: absolute('docs'), kitRoot: absolute('kit'),
      policyFile: absolute('policy'), manifestFile: absolute('manifest'), layoutFile: absolute('layout'),
      targetIndex: buildReconciliationTargetIndex({ docs }) },
    audit(readSet) {
      for (const entry of readSet) audit(entry.file, entry.sha256);
      for (const entry of records.values()) audit(entry.file, entry.sha256);
      return scopeSet([...records.values()]);
    },
  };
}

function inspectOriginalGitDecisionPair(options, inspectPair) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('explicit options object required');
  for (const key of Object.keys(options)) if (!KEYS.has(key)) fail(`unsupported option: ${key}`);
  ownerParts(options.owner);
  // Explicit resources only here. The future CLI must resolve and forward the
  // same resource set; do not silently borrow this package's ambient policy.
  for (const name of ['root', ...RESOURCES]) {
    if (typeof options[name] !== 'string' || !options[name].trim()) fail(`explicit ${name} required`);
  }
  const ctx = resolveProjectRoot(options.root);
  const resources = Object.fromEntries(RESOURCES.map((name) => [name,
    resolveProjectPath(ctx.projectRoot, options[name], options[name], name).relative]));
  const baseline = gitIdentity(ctx.repositoryRoot);
  const exactTree = String(runVisualGit(['rev-parse', '--verify', `${baseline.commit}^{tree}`], ctx.repositoryRoot)).trim();
  if (exactTree !== baseline.tree) fail('HEAD changed while capturing baseline');
  const before = captureCurrentTree(ctx.repositoryRoot, baseline.tree);
  const after = captureCurrentIndex(ctx.repositoryRoot);
  const temporary = [];
  try {
    const materialize = (view) => {
      const raw = materializeRawGitTree({ repositoryRoot: ctx.repositoryRoot,
        projectPrefix: ctx.projectPrefix, tree: view.tree });
      temporary.push(raw);
      return snapshotContext(ctx, view, raw, resources);
    };
    const previous = materialize(before), current = materialize(after);
    const findings = inspectPair({ owner: options.owner,
      before: previous.options, after: current.options });
    const gitReadSets = { before: previous.audit(findings.read_sets.before), after: current.audit(findings.read_sets.after) };
    // Retain the complete repository diff, including paths outside --root.
    // Modes and both rename sides remain visible; this is not A/M authorization.
    const changes = snapshotRecords(ctx.repositoryRoot, before.tree, after.tree).map((record) => ({
      ...record, before: before.entries.get(record.oldPath || record.path) || null,
      after: after.entries.get(record.newPath || record.path) || null,
    }));
    const finalIndex = captureCurrentIndex(ctx.repositoryRoot), finalHead = gitIdentity(ctx.repositoryRoot);
    if (finalIndex.tree !== after.tree || finalHead.commit !== baseline.commit || finalHead.tree !== baseline.tree) {
      fail('HEAD or staged index changed while inspecting transitions');
    }
    return { ...findings, git_snapshot: { before: { kind: 'HEAD', commit: baseline.commit, tree: before.tree },
      after: { kind: 'index', tree: after.tree }, project_prefix: ctx.projectPrefix, resources },
      git_changes: changes, git_read_sets: gitReadSets };
  } finally {
    for (const raw of temporary.reverse()) raw.cleanup();
  }
}

// The evaluator is selected here, never supplied through options or serialized
// approval/projection data. Keep the original conservative inspection unchanged.
export function inspectScopedGitDecisionTransitions(options = {}) {
  return inspectOriginalGitDecisionPair(options, inspectScopedDecisionTransitions);
}

export function inspectScopedGitDecisionScopes(options = {}) {
  return inspectOriginalGitDecisionPair(options, inspectScopedDecisionScopeTransitions);
}
