import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { withWorkflowProgress, withBindingStatusProgress, workflowProgress,
  withOwnerProjectionProgress, scopedProjectionProgress } from './workflow-progress.mjs';

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

test('owner projection progress: nested CLI invocations cannot inherit another invocation owner counts', (t) => {
  const sink = capture(t);
  const clock = t.mock.method(performance, 'now', () => 0);
  try {
    withWorkflowProgress(true, () => withOwnerProjectionProgress('screen:RESULT-001', () => {
      scopedProjectionProgress('contract-graph');
      withBindingStatusProgress(true, () => {
        scopedProjectionProgress('contract-graph', 100);
        withOwnerProjectionProgress('screen:RESULT-002', () => scopedProjectionProgress('contract-graph', 3));
      });
      scopedProjectionProgress('contract-graph');
    }));
    const updates = sink.text().trimEnd().split('\n').filter((line) => line.includes('owner-projection:progress'));
    assert.equal(updates.length, 3);
    assert.match(updates[0], /^workflow:run .*screen:RESULT-001; contract-graph: 1 nodes resolved/);
    assert.match(updates[1], /^binding-status .*screen:RESULT-002; contract-graph: 3 nodes resolved/);
    assert.match(updates[2], /^workflow:run .*screen:RESULT-001; contract-graph: 2 nodes resolved/);
  } finally { clock.mock.restore(); sink.restore(); }
});

for (const [tool, withProgress] of [['workflow:run', withWorkflowProgress], ['binding-status', withBindingStatusProgress]]) {
  test(`owner projection progress: ${tool} reports completed work with one shared throttle and a final count`, (t) => {
    const sink = capture(t);
    let now = 0;
    const clock = t.mock.method(performance, 'now', () => now);
    try {
      assert.equal(withProgress(true, () => withOwnerProjectionProgress('screen:RESULT-001', () => {
        for (let index = 0; index < 998; index += 1) scopedProjectionProgress('contract-graph');
        scopedProjectionProgress('candidate-rows');
        now = 999;
        scopedProjectionProgress('contract-graph');
        assert.equal((sink.text().match(/owner-projection:progress/g) || []).length, 2,
          'fast loops produce only the first completed count for each finite phase');
        now = 1000;
        scopedProjectionProgress('contract-graph');
        now = 1999;
        scopedProjectionProgress('candidate-rows');
        const idle = sink.text();
        now = 2000;
        assert.equal(sink.text(), idle, 'elapsed time alone emits nothing');
        scopedProjectionProgress('candidate-rows');
        for (let index = 0; index < 5; index += 1) scopedProjectionProgress('contract-graph');
        for (let index = 0; index < 1000; index += 1) scopedProjectionProgress(`unknown-${index}`);
        withProgress(false, () => scopedProjectionProgress('contract-graph', 10000));
        return 43;
      })), 43);
      const lines = sink.text().trimEnd().split('\n');
      assert.ok(lines.every((line) => line.startsWith(`${tool} [`)));
      const updates = lines.filter((line) => line.includes('owner-projection:progress'));
      assert.equal(updates.length, 5);
      assert.deepEqual(updates.map((line) => line.match(/; ([^"]+)"$/)[1]), [
        'contract-graph: 1 nodes resolved', 'candidate-rows: 1 rows resolved',
        'contract-graph: 1000 nodes resolved', 'candidate-rows: 3 rows resolved',
        'contract-graph: 1005 nodes resolved',
      ]);
      assert.ok(updates.every((line) => line.includes('"screen:RESULT-001; ')));
      assert.match(lines.at(-2), /owner-projection:done "screen:RESULT-001"$/);
      const before = sink.text();
      scopedProjectionProgress('contract-graph');
      withProgress(false, () => withOwnerProjectionProgress('screen:RESULT-002', () => scopedProjectionProgress('contract-graph')));
      assert.equal(sink.text(), before, 'disabled/completed owner contexts never report or retain work');
      withProgress(true, () => withOwnerProjectionProgress('screen:RESULT-002', () => scopedProjectionProgress('contract-graph')));
      assert.match(sink.text().slice(before.length), /screen:RESULT-002; contract-graph: 1 nodes resolved/);
    } finally { clock.mock.restore(); sink.restore(); }
  });

  test(`owner projection progress: ${tool} preserves results and original failures when an inner update cannot write`, (t) => {
    let failedWrites = 0, completed = false;
    const sink = capture(t, (bytes) => {
      if (bytes.includes(Buffer.from('owner-projection:progress'))) {
        failedWrites += 1;
        throw Object.assign(new Error('closed inner projection sink'), { code: 'EPIPE' });
      }
      return bytes.length;
    });
    try {
      const work = () => {
        for (let index = 0; index < 100; index += 1) scopedProjectionProgress('contract-graph');
        completed = true;
        return 47;
      };
      assert.equal(withProgress(true, () => withOwnerProjectionProgress('screen:RESULT-001', work)), 47);
      assert.equal(completed, true);
      assert.equal(failedWrites, 1, 'failed updates disable the entire invocation diagnostic sink');
      const sentinel = new Error('original projection failure');
      assert.throws(() => withProgress(true, () => withOwnerProjectionProgress('screen:RESULT-002', () => {
        scopedProjectionProgress('contract-graph');
        throw sentinel;
      })), (error) => error === sentinel);
      assert.equal(failedWrites, 2, 'a later invocation gets an independent reporter');
      assert.doesNotMatch(sink.text(), /owner-projection:done|run:done/);
    } finally { sink.restore(); }
  });
}
