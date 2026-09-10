import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CURRENT_WORK_INPUT_LIMIT as LIMIT, readJson, strictJson, normalizeWorkRequest, digest } from './current-work-request.mjs';

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
