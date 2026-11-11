import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CURRENT_WORK_INPUT_LIMIT as LIMIT, readCurrentBytes, readJson, strictJson, normalizeWorkRequest, digest } from './current-work-request.mjs';

const request = () => ({ version: 1, origin_inputs: [], requests: [{ owner: 'screen:DEMO-001', authority: 'current', requested_mode: 'rough-fixture-ui', targets: [{ path: 'src/demo.tsx', change: 'M' }] }] });
function file(t, contents = JSON.stringify(request())) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'work-request-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const name = path.join(root, 'request.json');
  fs.writeFileSync(name, contents);
  return name;
}
test('readJson accepts actual JSON and exact byte limit, rejects initial oversize before parsing', (t) => {
  const name = file(t, '{}');
  fs.appendFileSync(name, ' '.repeat(LIMIT - 2));
  assert.equal(readJson(name).raw.length, LIMIT);
  fs.appendFileSync(name, ' ');
  assert.throws(() => readJson(name), /exceeds 16 MiB/);
});
test('P2: growth after fstat is bounded to limit + 1, never parsed, descriptor closes', (t) => {
  const name = file(t);
  const originalStat = fs.fstatSync;
  const originalRead = fs.readSync;
  const originalClose = fs.closeSync;
  let grew = false, bytes = 0, closed = 0;
  t.mock.method(fs, 'fstatSync', function(fd, ...args) {
    const stat = originalStat(fd, ...args);
    if (!grew) { grew = true; fs.appendFileSync(name, ' '.repeat(LIMIT)); }
    return stat;
  });
  t.mock.method(fs, 'readSync', function(...args) { const count = originalRead(...args); bytes += count; return count; });
  t.mock.method(fs, 'closeSync', function(...args) { closed++; return originalClose(...args); });
  assert.throws(() => readJson(name), /exceeds 16 MiB/);
  assert.equal(bytes, LIMIT + 1);
  assert.ok(closed > 0);
});
test('P2: zero-size metadata cannot defeat actual read bound', (t) => {
  const name = file(t, '{}'+ ' '.repeat(LIMIT));
  const originalStat = fs.fstatSync;
  t.mock.method(fs, 'fstatSync', function(...args) { const stat = originalStat(...args); stat.size = 0; return stat; });
  assert.throws(() => readJson(name), /exceeds 16 MiB/);
});
test('P2: FIFO without a writer is rejected without blocking', { skip: process.platform === 'win32' }, (t) => {
  const name = file(t); fs.unlinkSync(name); execFileSync('mkfifo', [name]);
  assert.throws(() => readJson(name), /regular file required/);
});
test('pathname replacement after open cannot replace the read descriptor', (t) => {
  const name = file(t);
  const originalStat = fs.fstatSync;
  let replaced = false;
  t.mock.method(fs, 'fstatSync', function(...args) {
    const stat = originalStat(...args);
    if (!replaced) { replaced = true; fs.renameSync(name, name + '.old'); fs.writeFileSync(name, '{}'+ ' '.repeat(LIMIT)); }
    return stat;
  });
  // rename may update ctime on some filesystems; rejecting is also safe.
  try { assert.deepEqual(normalizeWorkRequest(readJson(name).value), request()); }
  catch (error) { assert.match(error.message, /file changed while reading/); }
});

test('#300 current byte reads preserve binary bytes through partial reads and exact EOF', (t) => {
  const expected = Buffer.from(Array.from({ length: 131 }, (_, index) => index * 17 % 256));
  const name = file(t, expected), read = fs.readSync;
  let calls = 0, sawEof = false;
  t.mock.method(fs, 'readSync', function (fd, buffer, offset, length, position) {
    calls++;
    const count = read.call(this, fd, buffer, offset, Math.min(length, 7), position);
    if (count === 0) sawEof = true;
    return count;
  });
  assert.deepEqual(readCurrentBytes(name), expected);
  assert.ok(calls > 2, 'partial reads must continue until EOF');
  assert.equal(sawEof, true, 'metadata or a short read cannot stand in for EOF');
});

test('#300 current byte reads treat zero, low and high metadata sizes only as hints', (t) => {
  const expected = Buffer.alloc(64 * 1024 + 19, 0x9a);
  const name = file(t, expected), fstat = fs.fstatSync;
  for (const size of [0, 23, expected.length + 41]) {
    const mock = t.mock.method(fs, 'fstatSync', function (...args) {
      const metadata = fstat.apply(this, args);
      metadata.size = size;
      return metadata;
    });
    try { assert.deepEqual(readCurrentBytes(name), expected, `reported size ${size}`); }
    finally { mock.mock.restore(); }
  }
});

test('#312 current byte reads preserve size-zero virtual files with EOF after the first read', (t) => {
  const expected = Buffer.from('4194304\n');
  // Use a real empty regular file for stable size-zero metadata, but model a
  // /proc/sys reader: unread bytes from its first response cannot be retrieved
  // by a later read. Merely changing an ordinary file's size hint misses this.
  const name = file(t, ''), fstat = fs.fstatSync, close = fs.closeSync;
  const requested = [], stats = [];
  let readingFd, closed = 0;
  const statMock = t.mock.method(fs, 'fstatSync', function (...args) {
    const metadata = fstat.apply(this, args);
    stats.push(metadata);
    return metadata;
  });
  const readMock = t.mock.method(fs, 'readSync', function (fd, buffer, offset, length, position) {
    readingFd = fd;
    assert.equal(position, null);
    requested.push(length);
    if (requested.length > 1) return 0;
    return expected.copy(buffer, offset, 0, Math.min(expected.length, length));
  });
  const closeMock = t.mock.method(fs, 'closeSync', function (fd) {
    if (fd === readingFd) closed++;
    return close.call(this, fd);
  });
  try {
    assert.deepEqual(readCurrentBytes(name), expected);
    assert.equal(requested[0], 64 * 1024, 'unknown size needs the original bounded first read');
    assert.equal(requested.length, 2, 'confirm actual EOF after the response');
    assert.equal(stats.length, 2, 'preserve both descriptor metadata checks');
    assert.ok(stats.every((metadata) => metadata.isFile() && metadata.size === 0));
    assert.equal(closed, 1);
  } finally {
    closeMock.mock.restore();
    readMock.mock.restore();
    statMock.mock.restore();
  }
});

for (const change of ['grow', 'shrink', 'rewrite']) {
  test(`#300 current byte reads reject ${change} during reading and close the descriptor`, (t) => {
    const name = file(t, Buffer.alloc(257, 0x61)), read = fs.readSync, close = fs.closeSync;
    let changed = false, readingFd, closed = 0;
    t.mock.method(fs, 'readSync', function (fd, ...args) {
      readingFd = fd;
      const count = read.call(this, fd, ...args);
      if (!changed) {
        changed = true;
        if (change === 'grow') fs.appendFileSync(name, 'more bytes');
        else if (change === 'shrink') fs.truncateSync(name, 1);
        else fs.writeFileSync(name, Buffer.alloc(257, 0x62));
        fs.utimesSync(name, new Date(), new Date(Date.now() + 2000));
      }
      return count;
    });
    t.mock.method(fs, 'closeSync', function (fd) {
      if (fd === readingFd) closed++;
      return close.call(this, fd);
    });
    assert.throws(() => readCurrentBytes(name), /file changed while reading/);
    assert.equal(changed, true);
    assert.equal(closed, 1);
  });
}

test('#300 current byte reads preserve read errors and close the descriptor', (t) => {
  const name = file(t), close = fs.closeSync;
  const failure = Object.assign(new Error('synthetic read error'), { code: 'EIO' });
  let readingFd, closed = 0;
  t.mock.method(fs, 'readSync', function (fd) { readingFd = fd; throw failure; });
  t.mock.method(fs, 'closeSync', function (fd) {
    if (fd === readingFd) closed++;
    return close.call(this, fd);
  });
  assert.throws(() => readCurrentBytes(name), (error) => error === failure);
  assert.equal(closed, 1);
});

test('request schema rejects duplicate keys, YAML, D fields, missing origin and semantic duplicates', () => {
  for (const raw of ['{"version":1,"version":1}', '{"a":{"b":1,"b":2}}', 'version: 1']) assert.throws(() => strictJson(raw));
  for (const change of [v => delete v.origin_inputs, v => v.origin_inputs = null, v => v.requests[0].authority = 'scoped', v => v.requests[0].unit = 'x', v => v.requests[0].targets.push(v.requests[0].targets[0]), v => v.requests[0].targets[0].path = 'src/../x', v => v.requests[0].allowed = true]) {
    const value = request(); change(value); assert.throws(() => normalizeWorkRequest(value));
  }
  const value = request();
  value.origin_inputs = [{ input_id: 'IN-20260910-figma-001', source_refs: ['input:IN-20260910-figma-001#facts/1','input:IN-20260910-figma-001#facts/01'] }];
  assert.throws(() => normalizeWorkRequest(value), /duplicate/);
});
test('request digest includes all origins and normalizes key and set order', () => {
  const value = request();
  value.requests[0].targets.push({ path: 'src/other.ts', change: 'A' });
  const a = normalizeWorkRequest(value);
  value.requests[0].targets.reverse();
  assert.equal(digest(a), digest(normalizeWorkRequest(value)));
  value.origin_inputs.push({ input_id: 'IN-20260910-figma-001', source_refs: [] });
  assert.notEqual(digest(a), digest(normalizeWorkRequest(value)));
});
