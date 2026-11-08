// Private on-disk ownership for raw Git snapshots. Importing this module does
// not inspect temp directories, install process listeners, or start processes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const SNAPSHOT_PREFIX = 'workflow-visual-refresh-tree-';
export const SNAPSHOT_OWNER_FILE = '.workflow-snapshot-owner.json';
// mkdtemp suffixes can be longer than six characters on BSD platforms.
const SNAPSHOT_NAME = /^workflow-visual-refresh-tree-[A-Za-z0-9]{6,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OWNER_LIMIT = 4096;
const SESSION_FIELDS = ['pid', 'uid', 'hostname', 'pid_namespace', 'process_started_at', 'process_token'];
const OWNER_FIELDS = ['version', 'directory', ...SESSION_FIELDS, 'lease_token', 'directory_dev', 'directory_ino'];
const identity = (stat) => ({ dev: String(stat.dev), ino: String(stat.ino) });
const sameIdentity = (stat, expected) => String(stat.dev) === expected.dev && String(stat.ino) === expected.ino;
const sameOwner = (a, b) => OWNER_FIELDS.every((key) => a[key] === b[key]);

export function currentPidNamespace() {
  if (process.platform !== 'linux') return null;
  try {
    const namespace = fs.readlinkSync('/proc/self/ns/pid');
    return /^pid:\[\d+\]$/.test(namespace) ? namespace : null;
  } catch { return null; }
}

export function snapshotTempRoot(directory = os.tmpdir()) {
  const canonical = fs.realpathSync(directory);
  const stat = fs.lstatSync(canonical, { bigint: true });
  if (!stat.isDirectory()) throw new Error('snapshot temp root must be a directory');
  return { directory: canonical, ...identity(stat) };
}

function rootMatches(root) {
  try {
    const stat = fs.lstatSync(root.directory, { bigint: true });
    return stat.isDirectory() && sameIdentity(stat, root) && fs.realpathSync(root.directory) === root.directory;
  } catch { return false; }
}

export function isProcessDead(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); }
  catch (error) { return error.code === 'ESRCH'; }
  return false; // EPERM, PID reuse and any uncertain ownership must be retained.
}

function readOwnedSnapshot(root, directory, allowUnknownIdentity = false) {
  let fd;
  try {
    const uid = process.getuid?.() ?? null;
    const hasUid = Number.isSafeInteger(uid);
    const namespace = currentPidNamespace();
    const name = path.basename(directory);
    if (((!hasUid || (process.platform === 'linux' && namespace === null)) && !allowUnknownIdentity) || !rootMatches(root) ||
        path.dirname(directory) !== root.directory || !SNAPSHOT_NAME.test(name)) return null;
    const dir = fs.lstatSync(directory, { bigint: true });
    if (!dir.isDirectory() || (hasUid && (dir.uid !== BigInt(uid) || (dir.mode & 0o077n) !== 0n))) return null;
    const markerPath = path.join(directory, SNAPSHOT_OWNER_FILE);
    fd = fs.openSync(markerPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(OWNER_LIMIT) ||
        (hasUid && (before.uid !== BigInt(uid) || (before.mode & 0o077n) !== 0n))) return null;
    // Bound the actual read as well as the initial size: a growing marker must
    // not allocate arbitrarily or turn a FIFO into a blocking orphan scan.
    const bytes = Buffer.alloc(OWNER_LIMIT + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = fs.readSync(fd, bytes, length, bytes.length - length, null);
      if (!count) break;
      length += count;
    }
    const after = fs.fstatSync(fd, { bigint: true });
    if (length > OWNER_LIMIT || BigInt(length) !== before.size || !sameIdentity(after, identity(before)) ||
        after.size !== before.size || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) return null;
    const owner = JSON.parse(bytes.subarray(0, length).toString('utf8'));
    if (owner?.version !== 1 || owner.directory !== name || owner.uid !== uid ||
        owner.hostname !== os.hostname() || owner.pid_namespace !== namespace ||
        !Number.isSafeInteger(owner.pid) || owner.pid < 1 ||
        typeof owner.process_started_at !== 'string' || !Number.isFinite(Date.parse(owner.process_started_at)) ||
        !UUID.test(owner.process_token) || !UUID.test(owner.lease_token) ||
        owner.directory_dev !== String(dir.dev) || owner.directory_ino !== String(dir.ino)) return null;
    const marker = fs.lstatSync(markerPath, { bigint: true });
    const latestDir = fs.lstatSync(directory, { bigint: true });
    if (!marker.isFile() || !sameIdentity(marker, identity(before)) ||
        !latestDir.isDirectory() || !sameIdentity(latestDir, identity(dir)) || !rootMatches(root)) return null;
    return { root, directory, owner, marker: identity(marker) };
  } catch { return null; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

export function createOwnedSnapshot(root, session) {
  if (!rootMatches(root)) throw new Error('snapshot temp root changed before allocation');
  const directory = fs.mkdtempSync(path.join(root.directory, SNAPSHOT_PREFIX));
  const markerPath = path.join(directory, SNAPSHOT_OWNER_FILE);
  try {
    fs.chmodSync(directory, 0o700);
    const stat = fs.lstatSync(directory, { bigint: true });
    const owner = {
      version: 1, directory: path.basename(directory), ...session,
      lease_token: randomUUID(), directory_dev: String(stat.dev), directory_ino: String(stat.ino),
    };
    fs.writeFileSync(markerPath, JSON.stringify(owner) + '\n', { flag: 'wx', mode: 0o600 });
    return { root, directory, owner, marker: identity(fs.lstatSync(markerPath, { bigint: true })) };
  } catch (error) {
    // No checkout exists yet. Never recursively delete an unmarked directory.
    try { fs.unlinkSync(markerPath); } catch {}
    try { fs.rmdirSync(directory); } catch {}
    throw error;
  }
}

function matchesLease(actual, expected) {
  return actual && sameOwner(actual.owner, expected.owner) &&
    actual.marker.dev === expected.marker.dev && actual.marker.ino === expected.marker.ino;
}

export function removeOwnedSnapshot(lease, { requireDead = false } = {}) {
  const { root, directory } = lease;
  // A held lease can still be released without getuid/procfs. Orphan discovery
  // must also establish the PID namespace: containers can share hostname/tmp
  // while kill(pid, 0) would inspect a different process namespace.
  const allowUnknownIdentity = !requireDead && lease.owner.pid === process.pid;
  const readCurrent = () => readOwnedSnapshot(root, directory, allowUnknownIdentity);
  if (!rootMatches(root)) return false;
  try { fs.lstatSync(directory); }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
  if (!matchesLease(readCurrent(), lease) ||
      (requireDead && !isProcessDead(lease.owner.pid))) return false;
  if (fs.readdirSync(directory).some((name) => name !== 'checkout' && name !== SNAPSHOT_OWNER_FILE)) return false;
  // Recheck immediately before deleting. Cooperating runners never reuse or
  // rename a mkdtemp path; live/unknown/replaced owners are never reclaimed.
  if (!matchesLease(readCurrent(), lease) ||
      (requireDead && !isProcessDead(lease.owner.pid))) return false;
  fs.rmSync(path.join(directory, 'checkout'), { recursive: true, force: true });
  // Retain the marker throughout payload deletion so an interrupted cleanup
  // remains reclaimable on the next run. rmSync never follows checkout links.
  if (!matchesLease(readCurrent(), lease) ||
      fs.readdirSync(directory).some((name) => name !== SNAPSHOT_OWNER_FILE)) return false;
  fs.unlinkSync(path.join(directory, SNAPSHOT_OWNER_FILE));
  fs.rmdirSync(directory);
  return true;
}

export function findOwnedSnapshots(root, session = null) {
  if (!rootMatches(root)) return [];
  try {
    return fs.readdirSync(root.directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && SNAPSHOT_NAME.test(entry.name))
      .map((entry) => readOwnedSnapshot(root, path.join(root.directory, entry.name)))
      .filter((lease) => lease && (!session || SESSION_FIELDS.every((key) => lease.owner[key] === session[key])));
  } catch { return []; }
}

export function reapOrphanSnapshots(root, session = null) {
  let removed = 0;
  for (const lease of findOwnedSnapshots(root, session)) {
    try { if (removeOwnedSnapshot(lease, { requireDead: true })) removed++; }
    catch { /* A competing sweep or filesystem error can be retried next time. */ }
  }
  return removed;
}
