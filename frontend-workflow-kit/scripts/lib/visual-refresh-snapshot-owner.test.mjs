import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import {
  SNAPSHOT_PREFIX, SNAPSHOT_OWNER_FILE, snapshotTempRoot, createOwnedSnapshot,
  removeOwnedSnapshot, reapOrphanSnapshots, isProcessDead, currentPidNamespace,
} from './visual-refresh-snapshot-owner.mjs';

const POSIX = process.platform !== 'win32' && typeof process.getuid === 'function';
const DEAD_PID = 2_000_000_000; // Never signalled: tests explicitly stub only signal-zero probes for this PID.
const OWNER_MODULE = new URL('./visual-refresh-snapshot-owner.mjs', import.meta.url).href;
const OBJECT_MODULE = new URL('./visual-refresh-git-objects.mjs', import.meta.url).href;
const GUARDIAN = fileURLToPath(new URL('./visual-refresh-snapshot-guardian.mjs', import.meta.url));
const session = (extra = {}) => ({
  pid: process.pid, uid: process.getuid?.() ?? null, hostname: os.hostname(),
  pid_namespace: currentPidNamespace(),
  process_started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  process_token: randomUUID(), ...extra,
});
const markerPath = (lease) => path.join(lease.directory, SNAPSHOT_OWNER_FILE);
const checkoutPath = (lease) => path.join(lease.directory, 'checkout');
const errorWithCode = (code) => Object.assign(new Error(code || 'unknown process error'), code ? { code } : {});

// Scans and cleanup are confined to a new private fixture, never the user's real temp inventory.
function fixture(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-owner-test-')));
  const temporary = path.join(base, 'tmp');
  fs.mkdirSync(temporary, { mode: 0o700 });
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = snapshotTempRoot(temporary);
  return { base, root, create: (owner = session()) => createOwnedSnapshot(root, owner) };
}

function payload(lease) {
  fs.mkdirSync(checkoutPath(lease), { recursive: true });
  const file = path.join(checkoutPath(lease), 'keep.txt');
  fs.writeFileSync(file, 'snapshot payload');
  return file;
}

function preserved(lease, label) {
  assert.equal(fs.existsSync(lease.directory), true, label);
  assert.equal(fs.readFileSync(path.join(checkoutPath(lease), 'keep.txt'), 'utf8'), 'snapshot payload', label);
}

function rewriteMarker(lease, edit) {
  const owner = JSON.parse(fs.readFileSync(markerPath(lease), 'utf8'));
  edit(owner);
  fs.writeFileSync(markerPath(lease), JSON.stringify(owner) + '\n');
}

function probe(t, states) {
  const original = process.kill;
  return t.mock.method(process, 'kill', function (pid, signal) {
    if (!states.has(pid)) return original.call(this, pid, signal);
    assert.equal(signal, 0, 'ownership inspection must never send a terminating signal');
    const code = states.get(pid);
    if (code === 'live') return true;
    throw errorWithCode(code);
  });
}

test('snapshot ownership: canonical root, private durable marker and idempotent explicit cleanup', { skip: !POSIX }, (t) => {
  const f = fixture(t);
  const alias = path.join(f.base, 'temp-alias');
  fs.symlinkSync(f.root.directory, alias);
  assert.deepEqual(snapshotTempRoot(alias), f.root, 'macOS-style temp aliases resolve to one root identity');
  const owner = session(), first = f.create(owner), second = f.create(owner);
  assert.notEqual(first.directory, second.directory);
  assert.notEqual(first.owner.lease_token, second.owner.lease_token);
  assert.equal(path.dirname(first.directory), f.root.directory);
  assert.ok(path.basename(first.directory).startsWith(SNAPSHOT_PREFIX));
  assert.equal(first.owner.directory, path.basename(first.directory));
  assert.equal(first.owner.version, 1);
  for (const [key, value] of Object.entries(owner)) assert.equal(first.owner[key], value, key);
  const directory = fs.lstatSync(first.directory, { bigint: true });
  const marker = fs.lstatSync(markerPath(first), { bigint: true });
  assert.equal(directory.mode & 0o777n, 0o700n);
  assert.equal(marker.mode & 0o777n, 0o600n);
  assert.equal(marker.nlink, 1n);
  assert.equal(first.owner.directory_dev, String(directory.dev));
  assert.equal(first.owner.directory_ino, String(directory.ino));
  assert.deepEqual(first.marker, { dev: String(marker.dev), ino: String(marker.ino) });
  assert.deepEqual(JSON.parse(fs.readFileSync(markerPath(first), 'utf8')), first.owner);
  payload(first);
  assert.equal(fs.existsSync(path.join(checkoutPath(first), SNAPSHOT_OWNER_FILE)), false);
  assert.equal(removeOwnedSnapshot(first), true);
  assert.equal(removeOwnedSnapshot(first), true);
  assert.equal(removeOwnedSnapshot(second), true, 'a partially allocated snapshot without checkout is removable');
});

test('snapshot ownership: only ESRCH proves death; live, EPERM, unknown and invalid PIDs stay unproven', (t) => {
  const states = new Map([[DEAD_PID, 'ESRCH'], [DEAD_PID + 1, 'EPERM'], [DEAD_PID + 2, 'EIO'], [DEAD_PID + 3, null]]);
  const kill = probe(t, states);
  assert.equal(isProcessDead(process.pid), false);
  assert.equal(isProcessDead(DEAD_PID), true);
  for (const pid of [DEAD_PID + 1, DEAD_PID + 2, DEAD_PID + 3]) assert.equal(isProcessDead(pid), false);
  const calls = kill.mock.callCount();
  for (const pid of [0, -1, '1', null, NaN, Infinity, 1.5]) assert.equal(isProcessDead(pid), false, String(pid));
  assert.equal(kill.mock.callCount(), calls, 'invalid PIDs must not address process groups');
});

test('snapshot ownership: orphan sweep preserves live/reused PIDs and filters exact process sessions', { skip: !POSIX }, (t) => {
  const f = fixture(t), firstSession = session({ pid: DEAD_PID });
  const first = f.create(firstSession);
  const samePid = f.create(session({ pid: DEAD_PID }));
  const otherPid = f.create(session({ pid: DEAD_PID + 1 }));
  const live = f.create(session({ process_started_at: '2000-01-01T00:00:00.000Z' }));
  for (const lease of [first, samePid, otherPid, live]) payload(lease);
  probe(t, new Map([[DEAD_PID, 'ESRCH'], [DEAD_PID + 1, 'ESRCH']]));
  assert.equal(reapOrphanSnapshots(f.root, { ...firstSession, pid: DEAD_PID + 1 }), 0);
  assert.equal(reapOrphanSnapshots(f.root, { ...firstSession, process_token: randomUUID() }), 0);
  assert.equal(reapOrphanSnapshots(f.root, firstSession), 1);
  assert.equal(fs.existsSync(first.directory), false);
  preserved(samePid, 'a different process token is a different session');
  preserved(otherPid, 'a different PID is a different session');
  preserved(live, 'a start-time mismatch never authorizes deleting a live PID');
  assert.equal(reapOrphanSnapshots(f.root), 2);
  preserved(live);
});

test('snapshot ownership: malformed, foreign, permissive and unmarked directories are retained', { skip: !POSIX }, (t) => {
  const f = fixture(t), leases = [];
  probe(t, new Map([[DEAD_PID, 'ESRCH']]));
  const cases = [
    ['corrupt JSON', (lease) => fs.writeFileSync(markerPath(lease), '{')],
    ['oversized marker', (lease) => fs.writeFileSync(markerPath(lease), ' '.repeat(5000))],
    ['unsupported version', (lease) => rewriteMarker(lease, (owner) => { owner.version = 2; })],
    ['foreign host', (lease) => rewriteMarker(lease, (owner) => { owner.hostname += '-other-host'; })],
    ['foreign PID namespace', (lease) => rewriteMarker(lease, (owner) => { owner.pid_namespace = 'pid:[1]'; })],
    ['foreign uid', (lease) => rewriteMarker(lease, (owner) => { owner.uid += 1; })],
    ['invalid pid', (lease) => rewriteMarker(lease, (owner) => { owner.pid = 0; })],
    ['invalid start', (lease) => rewriteMarker(lease, (owner) => { owner.process_started_at = 'unknown'; })],
    ['invalid process token', (lease) => rewriteMarker(lease, (owner) => { owner.process_token = ''; })],
    ['invalid lease token', (lease) => rewriteMarker(lease, (owner) => { owner.lease_token = '../outside'; })],
    ['different basename', (lease) => rewriteMarker(lease, (owner) => { owner.directory = '../outside'; })],
    ['different directory inode', (lease) => rewriteMarker(lease, (owner) => { owner.directory_ino += '0'; })],
    ['shared directory permissions', (lease) => fs.chmodSync(lease.directory, 0o755)],
    ['shared marker permissions', (lease) => fs.chmodSync(markerPath(lease), 0o644)],
    ['unmarked legacy directory', (lease) => fs.unlinkSync(markerPath(lease))],
  ];
  for (const [label, change] of cases) {
    const lease = f.create(session({ pid: DEAD_PID })); payload(lease); change(lease);
    assert.equal(removeOwnedSnapshot(lease, { requireDead: true }), false, label);
    preserved(lease, label); leases.push([label, lease]);
  }
  assert.equal(reapOrphanSnapshots(f.root), 0);
  for (const [label, lease] of leases) preserved(lease, label);
});

test('snapshot ownership: physical UID, marker identity and process-token replacements reject stale leases', { skip: !POSIX }, (t) => {
  const f = fixture(t);
  const uidLease = f.create(); payload(uidLease);
  const lstat = fs.lstatSync;
  const changedUid = t.mock.method(fs, 'lstatSync', function (file, ...args) {
    const stat = lstat.call(this, file, ...args);
    if (String(file) === uidLease.directory) stat.uid += typeof stat.uid === 'bigint' ? 1n : 1;
    return stat;
  });
  assert.equal(removeOwnedSnapshot(uidLease), false);
  changedUid.mock.restore(); preserved(uidLease);
  const markerUidLease = f.create(); payload(markerUidLease);
  const fstat = fs.fstatSync;
  const changedMarkerUid = t.mock.method(fs, 'fstatSync', function (...args) {
    const stat = fstat.apply(this, args); stat.uid += typeof stat.uid === 'bigint' ? 1n : 1; return stat;
  });
  assert.equal(removeOwnedSnapshot(markerUidLease), false, 'marker filesystem UID must match, not only the JSON UID');
  changedMarkerUid.mock.restore(); preserved(markerUidLease);
  const markerLease = f.create(); payload(markerLease);
  const replacement = path.join(markerLease.directory, 'replacement-marker');
  fs.writeFileSync(replacement, fs.readFileSync(markerPath(markerLease)), { mode: 0o600 });
  fs.renameSync(replacement, markerPath(markerLease));
  assert.equal(removeOwnedSnapshot(markerLease), false, 'identical bytes do not make a replacement marker the same lease');
  preserved(markerLease);
  const tokenLease = f.create(); payload(tokenLease);
  rewriteMarker(tokenLease, (owner) => { owner.process_token = randomUUID(); });
  assert.equal(removeOwnedSnapshot(tokenLease), false);
  preserved(tokenLease);
});

test('snapshot ownership: candidate/root replacements and unexpected siblings stay untouched', { skip: !POSIX }, (t) => {
  const f = fixture(t), lease = f.create(); payload(lease);
  fs.writeFileSync(path.join(lease.directory, 'unrelated.txt'), 'unrelated');
  assert.equal(removeOwnedSnapshot(lease), false);
  preserved(lease);
  assert.equal(fs.readFileSync(path.join(lease.directory, 'unrelated.txt'), 'utf8'), 'unrelated');
  fs.unlinkSync(path.join(lease.directory, 'unrelated.txt'));
  const moved = path.join(f.base, 'original-snapshot');
  fs.renameSync(lease.directory, moved);
  fs.mkdirSync(lease.directory, { mode: 0o700 });
  fs.writeFileSync(path.join(lease.directory, 'replacement-canary'), 'replacement');
  assert.equal(removeOwnedSnapshot(lease), false);
  assert.equal(fs.readFileSync(path.join(lease.directory, 'replacement-canary'), 'utf8'), 'replacement');
  fs.rmSync(lease.directory, { recursive: true });
  fs.symlinkSync(moved, lease.directory);
  assert.equal(removeOwnedSnapshot(lease), false);
  assert.equal(fs.readFileSync(path.join(moved, 'checkout', 'keep.txt'), 'utf8'), 'snapshot payload');
  const oldRoot = path.join(f.base, 'original-temp-root');
  fs.renameSync(f.root.directory, oldRoot);
  fs.mkdirSync(f.root.directory, { mode: 0o700 });
  fs.writeFileSync(path.join(f.root.directory, 'root-canary'), 'new root');
  assert.equal(removeOwnedSnapshot(lease), false);
  assert.equal(reapOrphanSnapshots(f.root), 0);
  assert.equal(fs.readFileSync(path.join(f.root.directory, 'root-canary'), 'utf8'), 'new root');
});

test('snapshot ownership: symlink, hardlink and nonregular markers are not ownership evidence', { skip: !POSIX }, (t) => {
  const f = fixture(t);
  for (const kind of ['symlink', 'hardlink', 'directory']) {
    const lease = f.create(); payload(lease);
    const outside = path.join(f.base, `${kind}-canary`);
    const bytes = fs.readFileSync(markerPath(lease));
    if (kind === 'hardlink') fs.linkSync(markerPath(lease), outside);
    else {
      fs.unlinkSync(markerPath(lease));
      if (kind === 'symlink') { fs.writeFileSync(outside, bytes, { mode: 0o600 }); fs.symlinkSync(outside, markerPath(lease)); }
      else fs.mkdirSync(markerPath(lease));
    }
    const read = t.mock.method(fs, 'readSync');
    assert.equal(removeOwnedSnapshot(lease), false, kind);
    assert.equal(read.mock.callCount(), 0, `${kind}: reject the file type before reading content`);
    read.mock.restore(); preserved(lease, kind);
    if (kind !== 'directory') assert.deepEqual(fs.readFileSync(outside), bytes, kind);
  }
  const fifo = f.create(); payload(fifo); fs.unlinkSync(markerPath(fifo));
  execFileSync('mkfifo', [markerPath(fifo)]);
  // A regressed blocking FIFO open must fail this isolated child, not hang the test runner.
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { removeOwnedSnapshot } from ${JSON.stringify(OWNER_MODULE)}; console.log(removeOwnedSnapshot(JSON.parse(process.argv[1])));`,
    JSON.stringify(fifo)], { encoding: 'utf8', timeout: 3000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'false');
  preserved(fifo);
});

test('snapshot ownership: marker reads remain bounded when the initial size underreports', { skip: !POSIX }, (t) => {
  const f = fixture(t), lease = f.create(); payload(lease);
  fs.writeFileSync(markerPath(lease), ' '.repeat(10_000));
  const fstat = fs.fstatSync, read = fs.readSync;
  t.mock.method(fs, 'fstatSync', function (...args) {
    const stat = fstat.apply(this, args); stat.size = typeof stat.size === 'bigint' ? 1n : 1; return stat;
  });
  let bytes = 0;
  t.mock.method(fs, 'readSync', function (...args) { const count = read.apply(this, args); bytes += count; return count; });
  assert.equal(removeOwnedSnapshot(lease), false);
  assert.ok(bytes > 0 && bytes <= 4097, `bounded actual read: ${bytes}`);
  preserved(lease);
});

test('snapshot ownership: a changed owner or newly live PID at the second check preserves the payload', { skip: !POSIX }, (t) => {
  const f = fixture(t);
  for (const change of ['pid is live', 'marker token changes']) {
    const lease = f.create(session({ pid: DEAD_PID })); payload(lease);
    let calls = 0;
    const original = process.kill;
    const kill = t.mock.method(process, 'kill', function (pid, signal) {
      if (pid !== DEAD_PID) return original.call(this, pid, signal);
      assert.equal(signal, 0); calls++;
      if (change === 'marker token changes' && calls === 1) rewriteMarker(lease, (owner) => { owner.process_token = randomUUID(); });
      if (change === 'pid is live' && calls > 1) return true;
      throw errorWithCode('ESRCH');
    });
    assert.equal(removeOwnedSnapshot(lease, { requireDead: true }), false, change);
    kill.mock.restore(); preserved(lease, change);
  }
});

test('snapshot ownership: cleanup unlinks payload symlinks without touching external targets', { skip: !POSIX }, (t) => {
  const f = fixture(t), lease = f.create(); payload(lease);
  const outside = path.join(f.base, 'outside'); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'canary'), 'outside stays');
  fs.symlinkSync(outside, path.join(checkoutPath(lease), 'absolute-directory'));
  fs.symlinkSync(path.relative(checkoutPath(lease), outside), path.join(checkoutPath(lease), 'relative-directory'));
  fs.symlinkSync(path.join(outside, 'canary'), path.join(checkoutPath(lease), 'file-link'));
  fs.symlinkSync('missing-target', path.join(checkoutPath(lease), 'broken-link'));
  assert.equal(removeOwnedSnapshot(lease), true);
  assert.equal(fs.existsSync(lease.directory), false);
  assert.equal(fs.readFileSync(path.join(outside, 'canary'), 'utf8'), 'outside stays');
});

test('snapshot ownership: a partial cleanup keeps its marker, other orphans still reap, and retry succeeds', { skip: !POSIX }, (t) => {
  const f = fixture(t), failed = f.create(session({ pid: DEAD_PID })), good = f.create(session({ pid: DEAD_PID }));
  payload(failed); payload(good);
  const partial = path.join(checkoutPath(failed), 'partially-removed'); fs.writeFileSync(partial, 'partial');
  probe(t, new Map([[DEAD_PID, 'ESRCH']]));
  const rm = fs.rmSync;
  const failing = t.mock.method(fs, 'rmSync', function (file, ...args) {
    if (String(file) === checkoutPath(failed)) {
      assert.equal(fs.existsSync(markerPath(failed)), true, 'ownership must outlive payload removal');
      if (fs.existsSync(partial)) fs.unlinkSync(partial);
      throw errorWithCode('EACCES');
    }
    return rm.call(this, file, ...args);
  });
  assert.throws(() => removeOwnedSnapshot(failed), { code: 'EACCES' });
  assert.equal(reapOrphanSnapshots(f.root), 1, 'one inaccessible orphan must not block another');
  preserved(failed); assert.equal(fs.existsSync(markerPath(failed)), true);
  assert.equal(fs.existsSync(good.directory), false);
  failing.mock.restore();
  assert.equal(reapOrphanSnapshots(f.root), 1);
  assert.equal(fs.existsSync(failed.directory), false);
});

test('snapshot ownership: competing deletion is best effort and cannot reach another live snapshot', { skip: !POSIX }, (t) => {
  const f = fixture(t), orphan = f.create(session({ pid: DEAD_PID })), live = f.create();
  payload(orphan); payload(live); probe(t, new Map([[DEAD_PID, 'ESRCH']]));
  const rm = fs.rmSync;
  let competed = false;
  t.mock.method(fs, 'rmSync', function (file, ...args) {
    if (!competed && String(file) === checkoutPath(orphan)) {
      competed = true;
      assert.equal(removeOwnedSnapshot(orphan, { requireDead: true }), true);
    }
    return rm.call(this, file, ...args);
  });
  assert.doesNotThrow(() => reapOrphanSnapshots(f.root));
  assert.equal(competed, true);
  assert.equal(fs.existsSync(orphan.directory), false);
  preserved(live);
  assert.equal(reapOrphanSnapshots(f.root), 0);
});

test('snapshot ownership: unknown UID permits only explicit cleanup of this process own lease', { skip: !POSIX }, (t) => {
  const f = fixture(t);
  t.mock.method(process, 'getuid', () => undefined);
  const own = f.create(), foreign = f.create(session({ pid: DEAD_PID }));
  payload(own); payload(foreign);
  probe(t, new Map([[DEAD_PID, 'ESRCH']]));
  assert.equal(reapOrphanSnapshots(f.root), 0);
  assert.equal(removeOwnedSnapshot(own, { requireDead: true }), false);
  assert.equal(removeOwnedSnapshot(foreign), false);
  preserved(own); preserved(foreign);
  assert.equal(removeOwnedSnapshot(own), true);
});

test('snapshot ownership: an unreadable Linux PID namespace never proves orphan ownership', { skip: process.platform !== 'linux' }, (t) => {
  const f = fixture(t), readlink = fs.readlinkSync;
  t.mock.method(fs, 'readlinkSync', function (file, ...args) {
    if (String(file) === '/proc/self/ns/pid') throw errorWithCode('EACCES');
    return readlink.call(this, file, ...args);
  });
  assert.equal(currentPidNamespace(), null);
  const own = f.create(), orphan = f.create(session({ pid: DEAD_PID }));
  payload(own); payload(orphan);
  probe(t, new Map([[DEAD_PID, 'ESRCH']]));
  assert.equal(reapOrphanSnapshots(f.root), 0);
  assert.equal(removeOwnedSnapshot(orphan, { requireDead: true }), false);
  preserved(own); preserved(orphan);
  assert.equal(removeOwnedSnapshot(own), true, 'the allocating process can still release its explicit lease');
});

async function eventually(check, label, milliseconds = 8000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${label}`);
}

test('snapshot ownership: a later materialization reaps an orphan after both guardian and parent are SIGKILLed',
  { skip: !POSIX, timeout: 25000 }, async (t) => {
    const f = fixture(t), live = f.create(); payload(live);
    const repository = path.join(f.base, 'repo'); fs.mkdirSync(repository);
    const git = (...args) => execFileSync('git', [
      '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-C', repository, ...args,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    git('init', '--quiet'); git('config', 'user.name', 'Snapshot Owner Test'); git('config', 'user.email', 'snapshot@example.test');
    fs.writeFileSync(path.join(repository, 'tiny.txt'), 'raw Git fixture');
    git('add', '.'); git('commit', '--quiet', '-m', 'fixture');
    const tree = git('rev-parse', 'HEAD^{tree}');
    const env = { ...process.env, TMPDIR: f.root.directory, TMP: f.root.directory, TEMP: f.root.directory };
    // Capture the actual ChildProcess in its parent, not a ps PID from another
    // Linux namespace. Only this fresh fixture's guardian receives SIGKILL.
    const source = `
      import childProcess from 'node:child_process';
      import { syncBuiltinESMExports } from 'node:module';
      import path from 'node:path';
      const original = childProcess.spawn;
      let guardian;
      childProcess.spawn = function(command, args, options) {
        const child = original.call(this, command, args, options);
        if (args?.[0] === ${JSON.stringify(GUARDIAN)}) {
          guardian = child;
          child.once('exit', (code, signal) => {
            if (process.connected) process.send({ type: 'guardian-exit', code, signal });
          });
        }
        return child;
      };
      syncBuiltinESMExports();
      const { materializeRawGitTree } = await import(${JSON.stringify(OBJECT_MODULE)});
      const view = materializeRawGitTree({ repositoryRoot: process.argv[1], tree: process.argv[2] });
      process.on('message', (message) => {
        if (message.type === 'kill-guardian') guardian.kill('SIGKILL');
      });
      process.send({ type: 'ready', directory: path.dirname(view.root), guardian_pid: guardian?.pid });
      setInterval(() => {}, 1000);
    `;
    const child = spawn(process.execPath, ['--input-type=module', '-e', source, repository, tree], {
      env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    const messages = [];
    let stderr = '';
    child.on('message', (message) => messages.push(message));
    child.stderr.on('data', (data) => { stderr += data; });
    const exited = once(child, 'exit');
    // Ensure a spawn failure is observed even before the readiness check finishes.
    exited.catch(() => {});
    try {
      const ready = await eventually(() => {
        assert.equal(child.exitCode, null, stderr);
        assert.equal(child.signalCode, null, stderr);
        return messages.find((message) => message.type === 'ready');
      }, 'snapshot and guardian readiness');
      assert.ok(Number.isSafeInteger(ready.guardian_pid) && ready.guardian_pid > 0);
      assert.equal(path.dirname(ready.directory), f.root.directory);
      assert.equal(fs.existsSync(path.join(ready.directory, SNAPSHOT_OWNER_FILE)), true);
      preserved(live, 'initial materialization must preserve another live owner');
      child.send({ type: 'kill-guardian' });
      const guardianExit = await eventually(() => messages.find((message) => message.type === 'guardian-exit'), 'guardian SIGKILL');
      assert.equal(guardianExit.signal, 'SIGKILL');
      assert.equal(child.kill('SIGKILL'), true);
      const [code, signal] = await exited;
      assert.equal(code, null); assert.equal(signal, 'SIGKILL');
      assert.equal(fs.existsSync(ready.directory), true, 'neither exit cleanup nor the guardian could remove the orphan');
      const next = spawnSync(process.execPath, ['--input-type=module', '-e', `
        import fs from 'node:fs';
        import path from 'node:path';
        import { materializeRawGitTree } from ${JSON.stringify(OBJECT_MODULE)};
        const view = materializeRawGitTree({ repositoryRoot: process.argv[1], tree: process.argv[2] });
        console.log(JSON.stringify({ old_exists: fs.existsSync(process.argv[3]),
          bytes: fs.readFileSync(path.join(view.root, 'tiny.txt'), 'utf8'), directory: path.dirname(view.root) }));
        view.cleanup();
      `, repository, tree, ready.directory], { env, encoding: 'utf8', timeout: 8000 });
      assert.equal(next.error, undefined, next.error?.message);
      assert.equal(next.status, 0, next.stderr);
      const observed = JSON.parse(next.stdout);
      assert.equal(observed.old_exists, false);
      assert.equal(observed.bytes, 'raw Git fixture');
      assert.equal(fs.existsSync(observed.directory), false, 'normal cleanup of the next snapshot remains intact');
      preserved(live, 'orphan recovery must preserve another live owner');
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited.catch(() => {});
    }
  });
