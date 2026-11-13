import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withWorkflowProgress, workflowProgress } from './workflow-progress.mjs';

function capture(t, write) {
  const original = fs.writeSync, chunks = [];
  const hook = t.mock.method(fs, 'writeSync', function(fd, bytes, offset, length, ...args) {
    if (fd !== 2) return original.call(this, fd, bytes, offset, length, ...args);
    const count = write ? write(bytes.subarray(offset, offset + length)) : length;
    chunks.push(Buffer.from(bytes.subarray(offset, offset + count)));
    return count;
  });
  return { text: () => Buffer.concat(chunks).toString('utf8'), restore: () => hook.mock.restore() };
}

test('#321 progress: opt-out and completed contexts never write diagnostics', (t) => {
  const sink = capture(t);
  try {
    assert.equal(withWorkflowProgress(false, () => { workflowProgress('snapshot:start'); return 17; }), 17);
    workflowProgress('outside:start');
    assert.equal(sink.text(), '');
    assert.equal(withWorkflowProgress(true, () => 23), 23);
    const before = sink.text();
    workflowProgress('outside:done');
    assert.equal(sink.text(), before);
    assert.match(before, /run:start\n[\s\S]*run:done\n$/);
  } finally { sink.restore(); }
});

test('#321 progress: nested opt-out stays silent and independent runs preserve the original error', (t) => {
  const sink = capture(t), sentinel = new Error('original work error');
  try {
    assert.throws(() => withWorkflowProgress(true, () => {
      withWorkflowProgress(false, () => workflowProgress('hidden:start'));
      workflowProgress('owner:start', '1/1 screen:RESULT-001/known');
      throw sentinel;
    }), (error) => error === sentinel);
    const failure = sink.text();
    assert.doesNotMatch(failure, /hidden:start|run:done/);
    assert.match(failure, /owner:start "1\/1 screen:RESULT-001\/known"\n[\s\S]*run:failed\n$/);
    withWorkflowProgress(true, () => workflowProgress('packet:start'));
    assert.match(sink.text().slice(failure.length), /run:start\n[\s\S]*packet:start\n[\s\S]*run:done\n$/);
  } finally { sink.restore(); }
});

test('#321 progress: details are escaped and bounded, and partial writes preserve the complete line', (t) => {
  const sink = capture(t, (bytes) => Math.min(7, bytes.length));
  try {
    withWorkflowProgress(true, () => {
      workflowProgress('owner:start', `screen:RESULT\n\u001b[31m${'x'.repeat(5000)}`);
      workflowProgress(`${'x'.repeat(5000)}:start`, '\r\t');
    });
    const lines = sink.text().trimEnd().split('\n');
    assert.equal(lines.length, 4);
    assert.ok(lines.every((line) => Buffer.byteLength(line) < 2048));
    assert.match(lines[1], /screen:RESULT\\n\\u001b\[31m/);
    assert.equal(sink.text().includes('\u001b'), false);
    assert.match(lines[2], /"\\r\\t"$/);
    assert.ok(lines.every((line) => /^workflow:run \[\d+\.\d{3}s\] /.test(line)));
  } finally { sink.restore(); }
});

test('#321 progress: unwritable stderr disables only diagnostics and does not change work results', (t) => {
  const original = fs.writeSync;
  let attempts = 0, worked = false;
  const hook = t.mock.method(fs, 'writeSync', function(fd, ...args) {
    if (fd !== 2) return original.call(this, fd, ...args);
    attempts += 1;
    throw Object.assign(new Error('closed diagnostic sink'), { code: 'EPIPE' });
  });
  try {
    assert.equal(withWorkflowProgress(true, () => { worked = true; workflowProgress('packet:start'); return 31; }), 31);
    assert.equal(worked, true);
    assert.equal(attempts, 1, 'later phases do not retry a failed sink');
    const sentinel = new Error('validation still fails');
    assert.throws(() => withWorkflowProgress(true, () => { throw sentinel; }), (error) => error === sentinel);
    assert.equal(attempts, 2, 'each invocation has an independent diagnostic context');
  } finally { hook.mock.restore(); }
});

test('#321 progress: a zero-byte stderr write cannot spin or alter the work result', (t) => {
  let attempts = 0;
  const sink = capture(t, () => { attempts += 1; return 0; });
  try {
    assert.equal(withWorkflowProgress(true, () => { workflowProgress('packet:start'); return 41; }), 41);
    assert.equal(attempts, 1);
    assert.equal(sink.text(), '');
  } finally { sink.restore(); }
});
