// Visual-only Git object boundary. Never check out authority through attributes,
// filters, EOL conversion, working-tree-encoding, or core.symlinks.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { TextDecoder } from 'node:util';

export const MAX_VISUAL_GIT_BUFFER = 128 * 1024 * 1024;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const REGULAR_MODES = new Set(['100644', '100755']);
const ENTRY_TYPES = { '040000': 'tree', '100644': 'blob', '100755': 'blob', '120000': 'blob', '160000': 'commit' };

export class VisualRefreshGitError extends Error {
  constructor(message) { super(message); this.name = 'VisualRefreshGitError'; }
}

// Git -z paths are repository names, not user-entered OS paths. Never replace
// separators, trim, case-fold, Unicode-normalize, or strip a leading './'.
export function requireGitRepositoryPath(file, label = 'Git repository path') {
  if (typeof file !== 'string' || file.length === 0 ||
      Buffer.from(file, 'utf8').toString('utf8') !== file) {
    throw new VisualRefreshGitError(`${label}: non-empty lossless UTF-8 path required`);
  }
  if (/[\\\x00-\x1f\x7f*?]/.test(file) || file.startsWith('/') || /^[A-Za-z]:/.test(file) ||
      file.split('/').some((part) => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')) {
    throw new VisualRefreshGitError(`${label}: unsupported literal Git path (never normalized): ${JSON.stringify(file)}`);
  }
  if (process.platform === 'win32' && file.split('/').some((part) =>
    /[:<>"|]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new VisualRefreshGitError(`${label}: Git filename cannot be represented exactly on Windows: ${JSON.stringify(file)}`);
  }
  return file;
}

export function decodeGitUtf8(bytes, label) {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new VisualRefreshGitError(`${label}: non-UTF-8 Git paths are unsupported; refusing lossy decoding`); }
}

export function runVisualGit(args, cwd, options = {}) {
  try {
    return execFileSync('git', ['--no-replace-objects', ...args], {
      cwd, encoding: options.encoding ?? null, maxBuffer: MAX_VISUAL_GIT_BUFFER,
      env: { ...process.env, ...(options.env || {}) }, stdio: options.stdio, input: options.input,
    });
  } catch (error) {
    const detail = error?.stderr ? String(error.stderr).trim() : error?.message || 'unknown Git error';
    throw new VisualRefreshGitError(`git ${args.join(' ')} failed: ${detail}`);
  }
}

function listEntries(repositoryRoot, tree) {
  if (typeof tree !== 'string' || !OID.test(tree)) throw new VisualRefreshGitError('snapshot requires an exact tree OID');
  if (String(runVisualGit(['cat-file', '-t', tree], repositoryRoot)).trim() !== 'tree') {
    throw new VisualRefreshGitError(`snapshot object is not a tree: ${tree}`);
  }
  const raw = decodeGitUtf8(runVisualGit(['ls-tree', '-r', '-t', '-z', '--full-tree', tree], repositoryRoot), 'ls-tree');
  if (raw !== '' && !raw.endsWith('\0')) throw new VisualRefreshGitError('unterminated ls-tree -z output');
  const entries = new Map();
  for (const record of raw === '' ? [] : raw.slice(0, -1).split('\0')) {
    const tab = record.indexOf('\t');
    const [mode, type, oid, extra] = record.slice(0, tab).split(' ');
    if (tab < 0 || extra !== undefined || ENTRY_TYPES[mode] !== type || !OID.test(oid)) {
      throw new VisualRefreshGitError(`invalid Git tree entry: ${JSON.stringify(record)}`);
    }
    const name = requireGitRepositoryPath(record.slice(tab + 1), 'Git tree entry');
    if (entries.has(name)) throw new VisualRefreshGitError(`duplicate Git tree path: ${JSON.stringify(name)}`);
    entries.set(name, Object.freeze({ repository_path: name, mode, type, oid }));
  }
  return entries;
}

// Every returned blob is binary, type/length checked, and hash-verified against
// its requested OID. No path-based --filters/--textconv/--follow-symlinks mode.
function readBlobBatch(repositoryRoot, oids) {
  const buffer = runVisualGit(['cat-file', '--batch'], repositoryRoot, { input: oids.join('\n') + '\n' });
  const blobs = new Map();
  let offset = 0;
  for (const oid of oids) {
    const newline = buffer.indexOf(10, offset);
    const header = newline < 0 ? '' : buffer.subarray(offset, newline).toString('ascii');
    const match = /^(\S+) blob (\d+)$/.exec(header);
    const size = match ? Number(match[2]) : NaN;
    const end = newline + 1 + size;
    if (!match || match[1] !== oid || !Number.isSafeInteger(size) || size < 0 ||
        end >= buffer.length || buffer[end] !== 10) {
      throw new VisualRefreshGitError(`invalid/truncated cat-file blob response for ${oid}`);
    }
    const blob = buffer.subarray(newline + 1, end);
    const actual = createHash(oid.length === 64 ? 'sha256' : 'sha1')
      .update(`blob ${size}\0`).update(blob).digest('hex');
    if (actual !== oid) throw new VisualRefreshGitError(`raw Git blob hash mismatch: ${oid} != ${actual}`);
    blobs.set(oid, blob);
    offset = end + 1;
  }
  if (offset !== buffer.length) throw new VisualRefreshGitError('unexpected trailing cat-file output');
  return blobs;
}

function ensureDirectory(root, relative) {
  let cursor = root;
  for (const segment of relative ? relative.split('/') : []) {
    const next = path.join(cursor, segment);
    if (!fs.readdirSync(cursor).includes(segment)) {
      // EEXIST here is a physical spelling collision, not a reusable directory.
      fs.mkdirSync(next);
      if (!fs.readdirSync(cursor).includes(segment)) throw new VisualRefreshGitError(`filesystem changed Git spelling: ${relative}`);
    }
    const stat = fs.lstatSync(next);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new VisualRefreshGitError(`non-directory Git tree ancestor: ${relative}`);
    cursor = next;
  }
  return cursor;
}

export function materializeRawGitTree({ repositoryRoot, projectPrefix = '', tree }) {
  if (projectPrefix) requireGitRepositoryPath(projectPrefix, 'project prefix');
  const entries = listEntries(repositoryRoot, tree);
  if (projectPrefix && entries.get(projectPrefix)?.mode !== '040000') {
    // Keep historical missing-project behavior: the evaluator will see absence.
    // Existing symlink/gitlink/file roots, however, must never become directories.
    if (entries.has(projectPrefix)) throw new VisualRefreshGitError(`project prefix is not a Git tree directory: ${projectPrefix}`);
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-visual-refresh-tree-'));
  const checkoutRoot = path.join(temporary, 'checkout');
  fs.mkdirSync(checkoutRoot);
  try {
    const blobsByOid = new Map();
    for (const entry of entries.values()) {
      if (entry.mode === '040000' || entry.mode === '160000') {
        ensureDirectory(checkoutRoot, entry.repository_path); // gitlinks remain opaque directories, never blobs
      } else {
        ensureDirectory(checkoutRoot, path.posix.dirname(entry.repository_path) === '.' ? '' : path.posix.dirname(entry.repository_path));
        const targets = blobsByOid.get(entry.oid) || [];
        targets.push(entry);
        blobsByOid.set(entry.oid, targets);
      }
    }
    const oids = [...blobsByOid.keys()];
    // Batching avoids a process per file; the existing 128 MiB Git output bound
    // applies per batch. Overflow is an explicit tool error, never partial authority.
    const links = [];
    for (let i = 0; i < oids.length; i += 128) {
      const batch = readBlobBatch(repositoryRoot, oids.slice(i, i + 128));
      for (const [oid, blob] of batch) {
        for (const entry of blobsByOid.get(oid)) {
          const absolute = path.join(checkoutRoot, ...entry.repository_path.split('/'));
          if (entry.mode === '120000') {
            links.push({ absolute, target: Buffer.from(blob) });
          } else {
            fs.writeFileSync(absolute, blob, { flag: 'wx', mode: entry.mode === '100755' ? 0o755 : 0o644 });
            fs.chmodSync(absolute, entry.mode === '100755' ? 0o755 : 0o644);
          }
        }
      }
    }
    // Links are created last, with their raw blob target. Nothing is ever written
    // through them. Unsupported OS symlink creation fails closed, not into a file.
    for (const link of links) fs.symlinkSync(link.target, link.absolute);
    return {
      root: projectPrefix ? path.join(checkoutRoot, ...projectPrefix.split('/')) : checkoutRoot,
      tree,
      entry(relative) {
        requireGitRepositoryPath(relative, 'snapshot entry lookup');
        return entries.get(projectPrefix ? `${projectPrefix}/${relative}` : relative) || null;
      },
      cleanup() { fs.rmSync(temporary, { recursive: true, force: true }); },
    };
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    if (error instanceof VisualRefreshGitError) throw error;
    throw new VisualRefreshGitError(`raw Git tree materialization failed: ${error.message}`);
  }
}

// Filesystem lstat is necessary but not sufficient. The original tree's entry
// mode is an additional final deny even if a materialized file was replaced.
export function bindVisualGitScreenIdentity(result, source, destination) {
  const intent = result?.intent_authorization;
  if (!intent?.authorized_path) return result;
  const file = requireGitRepositoryPath(intent.authorized_path, 'authorized screen_entry');
  const identities = [['source', source], ['destination', destination]].map(([snapshot, view]) => ({
    snapshot, tree: view.tree, path: file, ...(view.entry(file) || { mode: null, type: null, oid: null }),
  }));
  const invalid = identities.filter((entry) => entry.type !== 'blob' || !REGULAR_MODES.has(entry.mode));
  const updated = { ...result, intent_authorization: { ...intent, git_screen_entries: identities } };
  if (!invalid.length) return updated;
  const reason = { code: 'VR-GIT-002', message: 'authorized screen_entry must be an original regular Git blob (100644/100755) in both trees', entries: invalid };
  updated.intent_authorization = { ...updated.intent_authorization, applicable: false, reasons: [...(intent.reasons || []), reason] };
  if (result.path_authorization) updated.path_authorization = { ...result.path_authorization, allowed: false };
  if (result._context) updated._context = { ...result._context, visual_path_authorization: { ...result._context.visual_path_authorization, allowed: false } };
  return updated;
}
