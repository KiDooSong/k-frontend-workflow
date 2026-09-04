import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseNameStatusZ, resolveDefaultBranch } from './path-backstop.mjs';

const MAX_GIT_BUFFER = 128 * 1024 * 1024;

export class VisualRefreshGitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VisualRefreshGitError';
  }
}

function toPosix(value) {
  return String(value).split(path.sep).join('/');
}

function git(args, cwd, options = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: options.encoding ?? 'buffer',
      maxBuffer: MAX_GIT_BUFFER,
      env: { ...process.env, ...(options.env || {}) },
      stdio: options.stdio,
    });
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr).trim() : '';
    const detail = stderr || error?.message || 'unknown git error';
    throw new VisualRefreshGitError(`git ${args.join(' ')} 실패: ${detail}`);
  }
}

function text(args, cwd, options = {}) {
  return String(git(args, cwd, { ...options, encoding: 'utf8' })).trim();
}

function requireGitValue(value, label) {
  if (!value) throw new VisualRefreshGitError(`${label} 해석 결과가 비어 있음`);
  return value;
}

export function resolveRepositoryContext(projectRoot = process.cwd()) {
  const root = fs.realpathSync(path.resolve(projectRoot));
  const repositoryRoot = fs.realpathSync(
    requireGitValue(text(['rev-parse', '--show-toplevel'], root), 'Git 저장소 root'),
  );
  const relative = path.relative(repositoryRoot, root);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new VisualRefreshGitError(`--root가 Git 저장소 밖임: ${root}`);
  }
  return {
    repositoryRoot,
    projectRoot: root,
    projectPrefix: relative ? toPosix(relative) : '',
  };
}

export function hasHead(repositoryRoot) {
  try {
    git(['rev-parse', '--verify', 'HEAD^{commit}'], repositoryRoot);
    return true;
  } catch {
    return false;
  }
}

function resolveCommit(repositoryRoot, ref) {
  return requireGitValue(
    text(['rev-parse', '--verify', `${ref}^{commit}`], repositoryRoot),
    `commit '${ref}'`,
  );
}

export function resolveTree(repositoryRoot, ref) {
  return requireGitValue(
    text(['rev-parse', '--verify', `${ref}^{tree}`], repositoryRoot),
    `tree '${ref}'`,
  );
}

function mergeBase(repositoryRoot, leftCommit, rightCommit) {
  return requireGitValue(
    text(['merge-base', leftCommit, rightCommit], repositoryRoot),
    `merge-base ${leftCommit} ${rightCommit}`,
  );
}

function diffRecords(repositoryRoot, sourceTree, destinationTree) {
  return parseNameStatusZ(
    git(
      ['diff', '--name-status', '-M', '-z', sourceTree, destinationTree],
      repositoryRoot,
    ),
  );
}

function parseRange(range) {
  const raw = String(range || '').trim();
  const three = raw.indexOf('...');
  if (three > 0 && three < raw.length - 3 && raw.indexOf('...', three + 3) === -1) {
    return { left: raw.slice(0, three), operator: '...', right: raw.slice(three + 3) };
  }
  const two = raw.indexOf('..');
  if (two > 0 && two < raw.length - 2 && raw.indexOf('..', two + 2) === -1) {
    return { left: raw.slice(0, two), operator: '..', right: raw.slice(two + 2) };
  }
  throw new VisualRefreshGitError(
    `--range는 정확히 A..B 또는 A...B 형식이어야 함: ${JSON.stringify(range)}`,
  );
}

// One resolver owns both name/status records and immutable tree identities. Every
// symbolic ref/index is resolved exactly once; records are then computed only from
// the captured tree OIDs. `afterTreesResolved` is a test seam used to prove that a
// moving ref or index cannot change the record set after the snapshot is fixed.
export function resolveVisualDiffContext({
  repositoryRoot,
  staged = false,
  range,
  base,
  afterTreesResolved,
} = {}) {
  const modes = [staged === true, typeof range === 'string', typeof base === 'string']
    .filter(Boolean).length;
  if (modes > 1) {
    throw new VisualRefreshGitError('--staged, --range, --base는 동시에 사용할 수 없음');
  }
  if (!hasHead(repositoryRoot)) {
    throw new VisualRefreshGitError('visual-refresh backstop은 HEAD가 없는 저장소에서 실행할 수 없음');
  }

  const headCommit = resolveCommit(repositoryRoot, 'HEAD');
  let sourceCommit;
  let destinationCommit = null;
  let sourceTree;
  let destinationTree;
  let destinationRef = null;
  let diffKind;

  if (staged) {
    sourceCommit = headCommit;
    sourceTree = resolveTree(repositoryRoot, sourceCommit);
    destinationTree = requireGitValue(text(['write-tree'], repositoryRoot), 'index tree');
    destinationRef = 'INDEX';
    diffKind = 'staged';
  } else if (typeof range === 'string') {
    const parsed = parseRange(range);
    const leftCommit = resolveCommit(repositoryRoot, parsed.left);
    destinationCommit = resolveCommit(repositoryRoot, parsed.right);
    destinationRef = parsed.right;
    if (parsed.operator === '...') {
      sourceCommit = mergeBase(repositoryRoot, leftCommit, destinationCommit);
      diffKind = 'range-three-dot';
    } else {
      sourceCommit = leftCommit;
      diffKind = 'range-two-dot';
    }
    sourceTree = resolveTree(repositoryRoot, sourceCommit);
    destinationTree = resolveTree(repositoryRoot, destinationCommit);
  } else if (typeof base === 'string') {
    const baseCommit = resolveCommit(repositoryRoot, base);
    destinationCommit = headCommit;
    sourceCommit = mergeBase(repositoryRoot, baseCommit, destinationCommit);
    sourceTree = resolveTree(repositoryRoot, sourceCommit);
    destinationTree = resolveTree(repositoryRoot, destinationCommit);
    destinationRef = 'HEAD';
    diffKind = 'base-merge-base';
  } else {
    let defaultBranch;
    try {
      defaultBranch = resolveDefaultBranch(repositoryRoot);
    } catch (error) {
      throw new VisualRefreshGitError(error.message);
    }
    const defaultRef = `origin/${defaultBranch}`;
    const defaultCommit = resolveCommit(repositoryRoot, defaultRef);
    destinationCommit = headCommit;
    sourceCommit = mergeBase(repositoryRoot, destinationCommit, defaultCommit);
    sourceTree = resolveTree(repositoryRoot, sourceCommit);
    destinationTree = resolveTree(repositoryRoot, destinationCommit);
    destinationRef = 'HEAD';
    diffKind = 'default-branch-merge-base';
  }

  if (typeof afterTreesResolved === 'function') {
    afterTreesResolved({
      source_tree: sourceTree,
      destination_tree: destinationTree,
      source_commit: sourceCommit,
      destination_commit: destinationCommit,
      diff_kind: diffKind,
    });
  }
  const records = diffRecords(repositoryRoot, sourceTree, destinationTree);

  return {
    records,
    source_tree: sourceTree,
    destination_tree: destinationTree,
    source_commit: sourceCommit,
    destination_commit: destinationCommit,
    destination_ref: destinationRef,
    diff_kind: diffKind,
  };
}

export function materializeGitTree({ repositoryRoot, projectPrefix = '', tree }) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-visual-refresh-tree-'));
  const indexPath = path.join(tempRoot, '.git-index');
  const checkoutRoot = path.join(tempRoot, 'checkout');
  fs.mkdirSync(checkoutRoot, { recursive: true });
  const env = { GIT_INDEX_FILE: indexPath };
  try {
    git(['read-tree', tree], repositoryRoot, { env });
    git(
      ['checkout-index', '--all', '--force', `--prefix=${checkoutRoot}${path.sep}`],
      repositoryRoot,
      { env },
    );
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
  const materializedProjectRoot = projectPrefix
    ? path.join(checkoutRoot, ...projectPrefix.split('/'))
    : checkoutRoot;
  return {
    root: materializedProjectRoot,
    cleanup() {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    },
  };
}

export function sourceHeadContext({ repositoryRoot, projectPrefix = '' }) {
  if (!hasHead(repositoryRoot)) return null;
  const sourceCommit = resolveCommit(repositoryRoot, 'HEAD');
  const sourceTree = resolveTree(repositoryRoot, sourceCommit);
  const materialized = materializeGitTree({
    repositoryRoot,
    projectPrefix,
    tree: sourceTree,
  });
  return {
    source_tree: sourceTree,
    destination_tree: 'WORKTREE',
    source_commit: sourceCommit,
    diff_kind: 'worktree-forward',
    materialized,
  };
}

export function stripProjectPrefix(file, projectPrefix) {
  const normalized = String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!projectPrefix) return normalized;
  if (normalized === projectPrefix) return '';
  if (!normalized.startsWith(`${projectPrefix}/`)) return null;
  return normalized.slice(projectPrefix.length + 1);
}
