// Raw destination capture and the actual authority read set. No user index writes.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { KIT_ROOT } from './util.mjs';
import { isInputDirGuideFile } from './input-artifact.mjs';
import { hashBytes, byteCompare, canonicalJson } from './current-work-request.mjs';
import { runVisualGit, decodeGitUtf8, requireGitRepositoryPath, MAX_VISUAL_GIT_BUFFER } from './visual-refresh-git-objects.mjs';
import { captureCurrentIndex, captureCurrentTree, createCurrentSnapshot } from './current-work-snapshot.mjs';

const missing = () => ({ kind: 'missing', git_mode: null, hash: null });
const posix = (name) => name.split(path.sep).join('/');
const inside = (root, file) => { const r = path.relative(root, file); return r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r); };
const stamp = (s) => s && [s.dev, s.ino, s.mode, s.size, s.mtimeNs, s.ctimeNs].map(String).join(':');
function stat(file) {
  try { return fs.lstatSync(file, { bigint: true }); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function exactPath(root, name) {
  requireGitRepositoryPath(name, 'current worktree path');
  let cursor = root;
  const parts = name.split('/');
  for (let i = 0; i < parts.length; i++) {
    const parent = stat(cursor);
    if (!parent) return path.join(root, ...parts);
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error(`current worktree: non-directory ancestor: ${name}`);
    const next = path.join(cursor, parts[i]);
    if (!fs.readdirSync(cursor).includes(parts[i]) && stat(next)) throw new Error(`current worktree: path spelling alias: ${name}`);
    cursor = next;
  }
  return cursor;
}
function readRaw(file, before) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!opened.isFile() || stamp(opened) !== stamp(before)) throw new Error('current worktree: file changed before reading');
    if (opened.size > BigInt(MAX_VISUAL_GIT_BUFFER)) throw new Error('current worktree: file exceeds snapshot byte limit');
    const chunks = []; let length = 0;
    while (length <= MAX_VISUAL_GIT_BUFFER) {
      const chunk = Buffer.alloc(Math.min(65536, MAX_VISUAL_GIT_BUFFER + 1 - length));
      const count = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (!count) break;
      chunks.push(chunk.subarray(0, count)); length += count;
    }
    if (length > MAX_VISUAL_GIT_BUFFER || stamp(fs.fstatSync(fd, { bigint: true })) !== stamp(opened)) {
      throw new Error('current worktree: file changed or exceeded limit while reading');
    }
    return Buffer.concat(chunks, length);
  } finally { fs.closeSync(fd); }
}
function inputNames(root, name, { artifactIndex = false } = {}) {
  const out = [];
  function visit(relative) {
    const file = exactPath(root, relative), s = stat(file);
    if (!s) return;
    if (s.isSymbolicLink()) throw new Error(`current input scan: symlink is not a canonical input: ${relative}`);
    if (s.isDirectory()) {
      for (const child of fs.readdirSync(file)) {
        if (!artifactIndex || child !== '_meta') visit(`${relative}/${child}`);
      }
    } else if (relative.endsWith('.md') && (artifactIndex || !isInputDirGuideFile(relative))) out.push(relative);
  }
  visit(name);
  return out.sort(byteCompare);
}

export function captureCurrentWorktree(repositoryRoot, sourceTree, { extraFiles = [], inputRoots = [], artifactRoots = [], ancestors = [] } = {}) {
  const realRoot = fs.realpathSync(repositoryRoot);
  if (ancestors.includes(realRoot)) throw new Error('current worktree: recursive submodule root');
  const baseline = captureCurrentTree(repositoryRoot, sourceTree);
  const index = captureCurrentIndex(repositoryRoot);
  const discover = () => {
    const raw = decodeGitUtf8(runVisualGit(['-c', 'core.untrackedCache=false', '-c', 'core.fsmonitor=false',
      'ls-files', '--others', '--exclude-standard', '-z'], repositoryRoot), 'current untracked paths');
    if (raw && !raw.endsWith('\0')) throw new Error('current untracked paths: unterminated entry');
    return [...new Set([...baseline.entries.keys(), ...index.entries.keys(), ...extraFiles,
      ...(raw ? raw.slice(0, -1).split('\0') : []), ...inputRoots.flatMap((root) => inputNames(repositoryRoot, root)),
      ...artifactRoots.flatMap((root) => inputNames(repositoryRoot, root, { artifactIndex: true }))])].sort(byteCompare);
  };
  const names = discover(), entries = new Map(), observations = new Map();
  for (const name of names) {
    const file = exactPath(repositoryRoot, name), before = stat(file);
    observations.set(name, stamp(before));
    if (!before) continue;
    const prior = index.entries.get(name) || baseline.entries.get(name);
    if (before.isDirectory()) {
      if (prior?.mode === '160000') {
        // An opaque/uninitialized or dirty submodule cannot be represented by a
        // clean gitlink OID. Fail explicitly, including ignore=all/dirty settings.
        const git = (args) => runVisualGit(args, file, { env: { GIT_OPTIONAL_LOCKS: '0' } });
        if (fs.realpathSync(String(git(['rev-parse', '--show-toplevel'])).trim()) !== fs.realpathSync(file)) {
          throw new Error(`current worktree: uninspectable submodule: ${name}`);
        }
        const commit = String(git(['rev-parse', '--verify', 'HEAD^{commit}'])).trim();
        const tree = String(git(['rev-parse', '--verify', 'HEAD^{tree}'])).trim();
        const child = captureCurrentWorktree(file, tree, { ancestors: [...ancestors, realRoot] });
        if (child.tree !== tree || child.observed_index_tree !== tree) throw new Error(`current worktree: dirty submodule: ${name}`);
        entries.set(name, { mode: '160000', oid: commit });
      }
      continue;
    }
    let mode, bytes;
    if (before.isSymbolicLink()) { mode = '120000'; bytes = fs.readlinkSync(file, { encoding: 'buffer' }); }
    else if (before.isFile()) { mode = (before.mode & 0o111n) ? '100755' : '100644'; bytes = readRaw(file, before); }
    else throw new Error(`current worktree: unsupported file type: ${name}`);
    const oid = createHash(sourceTree.length === 64 ? 'sha256' : 'sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (oid !== baseline.entries.get(name)?.oid && oid !== index.entries.get(name)?.oid) {
      const written = String(runVisualGit(['hash-object', '-w', '--no-filters', '--stdin'], repositoryRoot, { input: bytes })).trim();
      if (written !== oid) throw new Error('current worktree: blob identity mismatch');
    }
    entries.set(name, { mode, oid });
  }
  // Do not label a mixed observed capture as stable if paths changed while read.
  for (const [name, before] of observations) {
    if (stamp(stat(exactPath(repositoryRoot, name))) !== before) throw new Error(`current worktree changed during capture: ${name}`);
  }
  if (canonicalJson(discover()) !== canonicalJson(names)) throw new Error('current worktree inventory changed during capture');
  return { ...createCurrentSnapshot(repositoryRoot, entries), observed_index_tree: index.tree };
}

export function currentAuthorityReadSet({ resources, inputArtifacts, artifactFiles = null, baselineRoot, baselineKitRoot, layoutData, snapshot }) {
  const files = new Set(Object.entries(resources).filter(([kind, r]) => r && !['docs', 'src'].includes(kind)).map(([, r]) => r.relative));
  const docs = resources.docs.relative;
  files.add(`${docs}/_meta/workflow-state.yaml`);
  files.add(`${docs}/_meta/reconciliation-register.md`); // absence is also a dependency
  for (const artifact of inputArtifacts) files.add(posix(path.relative(baselineRoot, artifact.file)));
  const records = [];
  if (artifactFiles !== null) {
    const names = artifactFiles.map(file => posix(path.relative(baselineRoot, file))).sort(byteCompare);
    for (const name of names) files.add(name);
    records.push({ source: 'artifact-index', path: docs, kind: 'inventory', git_mode: null, hash: hashBytes(canonicalJson(names)) });
  }
  if (layoutData.preset) {
    const name = requireGitRepositoryPath(`presets/${layoutData.preset}.yaml`, 'current preset');
    const file = path.join(baselineKitRoot, name);
    if (inside(baselineRoot, file)) files.add(posix(path.relative(baselineRoot, file)));
    else records.push({ source: 'kit', path: name, ...kitEvidence(name) });
  }
  for (const name of [...files].sort(byteCompare)) {
    requireGitRepositoryPath(name, 'current authority');
    const entry = snapshot.entry(name);
    if (entry && !['100644', '100755'].includes(entry.mode)) throw new Error(`current authority: regular Git blob required: ${name}`);
    records.push({ source: 'project', path: name, kind: entry ? 'file' : 'missing', git_mode: entry?.mode || null,
      hash: entry ? hashBytes(readRaw(path.join(baselineRoot, name), stat(path.join(baselineRoot, name)))) : null });
  }
  return records.sort((a, b) => byteCompare(`${a.source}:${a.path}`, `${b.source}:${b.path}`));
}
function kitEvidence(name) {
  const file = exactPath(KIT_ROOT, name), before = stat(file);
  if (!before) return missing();
  if (!before.isFile()) throw new Error('current authority: kit preset must be a regular file');
  const hash = hashBytes(readRaw(file, before));
  if (stamp(stat(file)) !== stamp(before)) throw new Error('current authority: kit preset changed while reading');
  return { kind: 'file', git_mode: (before.mode & 0o111n) ? '100755' : '100644', hash };
}
export function verifyCurrentAuthority(preflight, destination) {
  const records = preflight.snapshot.authority_read_set;
  if (!Array.isArray(records)) throw new Error('current authority: missing preflight read set');
  const prefix = preflight.snapshot.project_prefix;
  const repositoryPath = (name) => prefix ? `${prefix}/${name}` : name;
  const checks = records.map((before) => {
    let after;
    if (before.source === 'artifact-index') {
      const root = repositoryPath(before.path) + '/';
      const names = [...destination.entries.keys()].filter(name => name.startsWith(root) &&
        name.endsWith('.md') && !name.slice(root.length).split('/').includes('_meta'))
        .map(name => prefix ? name.slice(prefix.length + 1) : name).sort(byteCompare);
      after = { kind: 'inventory', git_mode: null, hash: hashBytes(canonicalJson(names)) };
    } else after = before.source === 'kit' ? kitEvidence(before.path) : destination.evidence(repositoryPath(before.path));
    return { ...before, after: { kind: after.kind, git_mode: after.git_mode, hash: after.hash },
      ok: before.kind === after.kind && before.git_mode === after.git_mode && before.hash === after.hash };
  });
  const docs = preflight.snapshot.resources.find((r) => r.kind === 'docs').path;
  const inputRoot = `${docs}/inputs/`;
  const known = new Set(records.filter((r) => r.source === 'project').map((r) => repositoryPath(r.path)));
  for (const name of destination.entries.keys()) {
    if (name.startsWith(repositoryPath(inputRoot)) && name.endsWith('.md') && !isInputDirGuideFile(name) && !known.has(name)) {
      checks.push({ source: 'project', path: prefix ? name.slice(prefix.length + 1) : name, ...missing(),
        after: destination.evidence(name), ok: false });
    }
  }
  return checks;
}
