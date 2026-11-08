import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { currentPidNamespace, snapshotTempRoot, createOwnedSnapshot, removeOwnedSnapshot, reapOrphanSnapshots } from './visual-refresh-snapshot-owner.mjs';

const session = Object.freeze({
  pid: process.pid, uid: process.getuid?.() ?? null, hostname: os.hostname(), pid_namespace: currentPidNamespace(),
  process_started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(), process_token: randomUUID(),
});
const active = new Map();
const guardians = new Map();
let exiting = false;

function onExit() {
  exiting = true;
  for (const cleanup of active.values()) {
    try { cleanup(); } catch { /* Keep ownership for the guardian/next run. */ }
  }
}

function protectWithGuardian(root) {
  if (guardians.has(root.directory)) return;
  // JS signal callbacks cannot run during synchronous Git/file operations.
  // Keep the parent's default/custom handlers intact; a detached child watches
  // IPC closure and checks on-disk ownership after the parent has died.
  try {
    const child = spawn(process.execPath, [
      fileURLToPath(new URL('./visual-refresh-snapshot-guardian.mjs', import.meta.url)),
      JSON.stringify(root), JSON.stringify(session),
    ], { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    guardians.set(root.directory, child);
    const forget = () => { if (guardians.get(root.directory) === child) guardians.delete(root.directory); };
    child.once('error', forget);
    child.once('exit', forget);
    child.unref();
    child.channel?.unref();
  } catch { /* A restricted host still has exit cleanup and durable orphan ownership. */ }
}

function retireIdleGuardian(root) {
  if (exiting) return;
  // Synchronous source/destination snapshots can share one guardian. This
  // unref'ed turn must not keep a finished CLI alive just to retire its child.
  setImmediate(() => {
    if ([...active.keys()].some((directory) => path.dirname(directory) === root.directory)) return;
    const child = guardians.get(root.directory);
    if (!child) return;
    guardians.delete(root.directory);
    if (child.connected) child.disconnect();
  }).unref();
}

export function allocateRawGitSnapshotDirectory() {
  const root = snapshotTempRoot();
  reapOrphanSnapshots(root);
  const lease = createOwnedSnapshot(root, session);
  const cleanup = () => {
    if (!active.has(lease.directory)) return;
    if (!removeOwnedSnapshot(lease)) return;
    active.delete(lease.directory);
    if (!active.size) process.removeListener('exit', onExit);
    retireIdleGuardian(root);
  };
  if (!active.size) process.on('exit', onExit);
  active.set(lease.directory, cleanup);
  // The marker is complete before spawning or writing checkout data. The
  // session travels in argv, never in an unacknowledged IPC registration queue.
  protectWithGuardian(root);
  return { directory: lease.directory, cleanup };
}
