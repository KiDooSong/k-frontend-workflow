// Current-work destination snapshots. Never refresh or rewrite the user's index.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runVisualGit, decodeGitUtf8, requireGitRepositoryPath } from './visual-refresh-git-objects.mjs';
import { parseNameStatusZ } from './path-backstop.mjs';
import { hashBytes } from './current-work-request.mjs';

const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MODES = new Set(['100644', '100755', '120000', '160000']);

function indexEntries(repositoryRoot) {
  const raw = runVisualGit(['ls-files', '--stage', '-z'], repositoryRoot);
  const text = decodeGitUtf8(raw, 'current index');
  if (text && !text.endsWith('\0')) throw new Error('current index: unterminated entry');
  const entries = new Map();
  for (const record of text ? text.slice(0, -1).split('\0') : []) {
    const tab = record.indexOf('\t');
    const [mode, oid, stage, extra] = record.slice(0, tab).split(' ');
    if (tab < 0 || extra !== undefined || !MODES.has(mode) || !OID.test(oid) || /^0+$/.test(oid) || stage !== '0') {
      throw new Error('current index: unsupported or unmerged entry');
    }
    const name = requireGitRepositoryPath(record.slice(tab + 1), 'current index path');
    if (entries.has(name)) throw new Error('current index: duplicate path');
    entries.set(name, { mode, oid });
  }
  return { raw, entries };
}

function indexTree(repositoryRoot, raw) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'current-index-'));
  const env = { GIT_INDEX_FILE: path.join(scratch, 'index') };
  const git = (args, input) => runVisualGit(['-c', 'core.splitIndex=false', '-c', 'index.sparse=false', ...args], repositoryRoot, { env, input });
  try {
    git(['read-tree', '--empty']);
    if (raw.length) git(['update-index', '-z', '--index-info'], raw);
    const tree = String(git(['write-tree'])).trim();
    if (!OID.test(tree)) throw new Error('current index: invalid tree OID');
    return tree;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export function snapshotRecords(repositoryRoot, sourceTree, destinationTree) {
  const records = parseNameStatusZ(decodeGitUtf8(runVisualGit([
    'diff', '--no-ext-diff', '--no-textconv', '--ignore-submodules=none',
    '--name-status', '-M', '-z', sourceTree, destinationTree,
  ], repositoryRoot), 'current snapshot diff'));
  for (const record of records) {
    for (const name of record.status === 'R' || record.status === 'C' ? [record.oldPath, record.newPath] : [record.path]) {
      requireGitRepositoryPath(name, 'current snapshot diff path');
    }
  }
  return records;
}

export function captureCurrentIndex(repositoryRoot) {
  // Resolve index entries once, then compute BOTH records and evidence from these
  // immutable OIDs. write-tree operates only on an independent temporary index.
  const { raw, entries } = indexEntries(repositoryRoot);
  const tree = indexTree(repositoryRoot, raw);
  const cache = new Map();
  return {
    tree,
    evidence(name) {
      requireGitRepositoryPath(name, 'current index evidence');
      if (cache.has(name)) return cache.get(name);
      const entry = entries.get(name);
      let result = { kind: 'missing', mode: null, git_mode: null, oid: null, hash: null };
      if (entry) {
        const { mode, oid } = entry;
        if (mode === '160000') result = { kind: 'gitlink', mode: null, git_mode: mode, oid, hash: null };
        else {
          const rawBytes = runVisualGit(['cat-file', 'blob', oid], repositoryRoot);
          const actual = createHash(oid.length === 64 ? 'sha256' : 'sha1').update(`blob ${rawBytes.length}\0`).update(rawBytes).digest('hex');
          if (actual !== oid) throw new Error('current index: blob hash mismatch');
          result = { kind: mode === '120000' ? 'symlink' : 'file', mode: mode === '120000' ? 0o777 : mode === '100755' ? 0o755 : 0o644,
            git_mode: mode, oid, hash: hashBytes(rawBytes) };
        }
      }
      cache.set(name, result);
      return result;
    },
  };
}
