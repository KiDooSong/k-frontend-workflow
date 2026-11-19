import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { withWorkflowProgress, withBindingStatusProgress, workflowProgress,
  withOwnerProjectionProgress, withScopedProjectionStage, scopedProjectionProgress } from './workflow-progress.mjs';

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

test('#331 owner stages: opt-out and absent owner contexts perform no clock or memory reads', (t) => {
  const sink = capture(t);
  const unexpected = () => { throw new Error('disabled diagnostics must not sample'); };
  t.mock.method(performance, 'now', unexpected);
  t.mock.method(process, 'memoryUsage', unexpected);
  t.mock.method(process, 'resourceUsage', unexpected);
  const work = () => withScopedProjectionStage('sources', () => {
    scopedProjectionProgress('sources');
    return 53;
  });
  assert.equal(withWorkflowProgress(false, () => withOwnerProjectionProgress('screen:RESULT-001', work)), 53);
  assert.equal(withOwnerProjectionProgress('screen:RESULT-001', work), 53);
  assert.equal(work(), 53);
  assert.equal(sink.text(), '');
});

for (const [tool, withProgress] of [['workflow:run', withWorkflowProgress], ['binding-status', withBindingStatusProgress]]) {
  test(`#331 owner stages: ${tool} reports synchronous boundaries, durations and sampled heap peaks with bounded sampling`, (t) => {
    const sink = capture(t);
    let now = 0, heap = 100, reads = 0;
    t.mock.method(performance, 'now', () => now);
    t.mock.method(process, 'memoryUsage', () => { reads += 1; return { heapUsed: heap, external: 20, rss: 4096 }; });
    t.mock.method(process, 'resourceUsage', () => ({ maxRSS: 8 }));
    const result = withProgress(true, () => {
      const answer = withOwnerProjectionProgress('screen:RESULT-001', () => withScopedProjectionStage('sources', () => {
        assert.match(sink.text(), /owner-stage:start "screen:RESULT-001; sources"/,
          'stage start must reach stderr before synchronous work');
        for (let index = 0; index < 10000; index += 1) scopedProjectionProgress('contract-graph');
        scopedProjectionProgress('candidate-rows');
        assert.equal(reads, 2, 'owner and stage boundaries sample; every node and first counter do not');
        now = 1000; heap = 800;
        scopedProjectionProgress('contract-graph');
        assert.equal(reads, 3, 'completed work samples once after one second');
        now = 1001; heap = 200;
        withScopedProjectionStage('audit', () => { now = 1500; heap = 500; });
        now = 2000; heap = 300;
        scopedProjectionProgress('contract-graph');
        assert.equal(reads, 5, 'a recent stage-boundary sample shares the memory throttle');
        return 59;
      }));
      assert.equal(reads, 7, 'stage and owner completion each take their final sample');
      heap = 10;
      withOwnerProjectionProgress('screen:RESULT-002', () => {});
      return answer;
    });
    assert.equal(result, 59);
    const output = sink.text(), lines = output.trimEnd().split('\n');
    assert.ok(lines.every((line) => line.startsWith(`${tool} [`)));
    assert.match(output, /owner-stage:done "screen:RESULT-001; audit; elapsed_ms=499\.000; heap-sampled-peak=500B"/);
    assert.match(output, /owner-stage:done "screen:RESULT-001; sources; elapsed_ms=2000\.000; heap-sampled-peak=800B"/);
    assert.match(output, /owner-memory:progress "audit; heap=500; heap-sampled-peak=800; external=20; rss=4096; max-rss=8192; unit=B"/);
    assert.match(output.slice(output.indexOf('owner-projection:start "screen:RESULT-002"')),
      /owner-memory:progress "projection; heap=10; heap-sampled-peak=10;/, 'owner peak is reset between owners');
    assert.equal(reads, 9);
    scopedProjectionProgress('contract-graph');
    assert.equal(reads, 9, 'no samples after the invocation completes');
    assert.ok(lines.every((line) => Buffer.byteLength(line) < 2048));
  });
}

test('#331 owner stages: nested CLI contexts and unknown phases cannot inherit stage diagnostics', (t) => {
  const sink = capture(t);
  let heap = 400, reads = 0;
  t.mock.method(performance, 'now', () => 0);
  t.mock.method(process, 'memoryUsage', () => { reads += 1; return { heapUsed: heap, external: 0, rss: 4096 }; });
  t.mock.method(process, 'resourceUsage', () => ({ maxRSS: 4 }));
  withWorkflowProgress(true, () => withOwnerProjectionProgress('screen:OUTER', () => withScopedProjectionStage('units', () => {
    const before = reads;
    withWorkflowProgress(false, () => withScopedProjectionStage('sources', () => scopedProjectionProgress('sources')));
    withBindingStatusProgress(true, () => withScopedProjectionStage('sources', () => scopedProjectionProgress('sources')));
    withScopedProjectionStage('invented-phase', () => {});
    assert.equal(reads, before);
    heap = 50;
    withBindingStatusProgress(true, () => withOwnerProjectionProgress('screen:INNER', () =>
      withScopedProjectionStage('audit', () => scopedProjectionProgress('audit-files'))));
    heap = 70;
  })));
  const lines = sink.text().trimEnd().split('\n').filter((line) => line.includes('owner-stage:'));
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^workflow:run .*screen:OUTER; units/);
  assert.match(lines[1], /^binding-status .*screen:INNER; audit/);
  assert.match(lines[2], /^binding-status .*screen:INNER; audit; elapsed_ms=0\.000; heap-sampled-peak=50B/);
  assert.match(lines[3], /^workflow:run .*screen:OUTER; units; elapsed_ms=0\.000; heap-sampled-peak=400B/);
  assert.doesNotMatch(sink.text(), /invented-phase|; sources/);
});

test('#331 owner stages: a failing stage preserves its original error and records the failed boundary', (t) => {
  const sink = capture(t), sentinel = new Error('original scoped failure');
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  t.mock.method(process, 'memoryUsage', () => ({ heapUsed: 500, external: 0, rss: 4096 }));
  t.mock.method(process, 'resourceUsage', () => ({ maxRSS: 4 }));
  assert.throws(() => withWorkflowProgress(true, () => withOwnerProjectionProgress('screen:RESULT-001', () =>
    withScopedProjectionStage('candidates', () => { now = 125; throw sentinel; }))), (error) => error === sentinel);
  assert.match(sink.text(), /owner-stage:failed "screen:RESULT-001; candidates; elapsed_ms=125\.000; heap-sampled-peak=500B"/);
  assert.match(sink.text(), /owner-projection:failed "screen:RESULT-001"\n[\s\S]*run:failed\n$/);
  assert.doesNotMatch(sink.text(), /owner-stage:done|owner-projection:done|run:done/);
});

for (const failure of ['memory', 'resources', 'clock', 'sink']) {
  test(`#331 owner stages: failed ${failure} observation cannot repeat work or replace results and errors`, (t) => {
    let broken = false, calls = 0, failures = 0;
    const fail = () => { failures += 1; throw new Error('diagnostic failure'); };
    const sink = capture(t, (bytes) => broken && failure === 'sink' ? fail() : bytes.length);
    t.mock.method(performance, 'now', () => broken && failure === 'clock' ? fail() : 0);
    t.mock.method(process, 'memoryUsage', () => broken && failure === 'memory' ? fail() : { heapUsed: 500, external: 0, rss: 4096 });
    t.mock.method(process, 'resourceUsage', () => broken && failure === 'resources' ? fail() : { maxRSS: 4 });
    const sentinel = new Error('original work error');
    for (const throws of [false, true]) {
      broken = false;
      const invoke = () => withWorkflowProgress(true, () => withOwnerProjectionProgress('screen:RESULT-001', () => {
        broken = true;
        return withScopedProjectionStage('sources', () => {
          calls += 1;
          scopedProjectionProgress('sources');
          if (throws) throw sentinel;
          return 61;
        });
      }));
      if (throws) assert.throws(invoke, (error) => error === sentinel);
      else assert.equal(invoke(), 61);
      assert.equal(failures, calls, 'a failed observation disables further diagnostics in that invocation');
    }
    assert.equal(calls, 2, 'each callback ran exactly once');
    assert.doesNotMatch(sink.text(), /owner-stage:done|owner-stage:failed|owner-projection:done|run:done|run:failed/);
  });
}

test('#331 owner stages: a failed initial clock or owner memory sample still executes the original callback', (t) => {
  const sink = capture(t), sentinel = new Error('original work error');
  const clock = t.mock.method(performance, 'now', () => { throw new Error('clock unavailable'); });
  let calls = 0;
  assert.equal(withWorkflowProgress(true, () => { calls += 1; return 67; }), 67);
  assert.throws(() => withWorkflowProgress(true, () => { calls += 1; throw sentinel; }), (error) => error === sentinel);
  assert.equal(calls, 2);
  assert.equal(sink.text(), '');
  clock.mock.restore();
  t.mock.method(process, 'memoryUsage', () => { throw new Error('memory unavailable'); });
  assert.equal(withWorkflowProgress(true, () => withOwnerProjectionProgress('screen:RESULT-001', () => {
    calls += 1;
    return withScopedProjectionStage('audit', () => 71);
  })), 71);
  assert.equal(calls, 3);
  assert.doesNotMatch(sink.text(), /owner-stage:|owner-memory:|owner-projection:done|run:done/);
});

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
