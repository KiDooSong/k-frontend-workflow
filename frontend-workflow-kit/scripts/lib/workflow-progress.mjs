// Optional CLI diagnostics. This context is never a request, authority,
// checkpoint or result field, and does not expose a caller-supplied callback.
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';

const contexts = new AsyncLocalStorage();
const projections = new AsyncLocalStorage();
const quoted = (value) => JSON.stringify(String(value).slice(0, 160));

export function workflowProgress(phase, detail) {
  const context = contexts.getStore();
  if (!context?.active) return;
  try {
    const allowedPhase = /^[a-z][a-z-]*:(?:start|done|failed|progress)$/;
    const label = typeof phase === 'string' && phase.length <= 64 && allowedPhase.test(phase)
      ? phase : quoted(phase);
    const suffix = detail === undefined ? '' : ` ${quoted(detail)}`;
    const seconds = ((performance.now() - context.started) / 1000).toFixed(3);
    const bytes = Buffer.from(`${context.tool} [${seconds}s] ${label}${suffix}\n`);
    // The work is synchronous. Buffered stream writes could remain pending
    // until it finishes, so write the small diagnostic directly to stderr.
    let offset = 0;
    while (offset < bytes.length) {
      const written = fs.writeSync(2, bytes, offset, bytes.length - offset);
      if (!Number.isInteger(written) || written <= 0) throw new Error('stderr write made no progress');
      offset += written;
    }
  } catch {
    // A closed/unwritable diagnostic sink must not change validation or output.
    context.active = false;
  }
}

// These CLI drivers are synchronous. A nested or subsequent invocation gets
// its own context; opt-out also suppresses an enclosing invocation's reporter.
function withProgress(enabled, tool, run) {
  if (!enabled) return contexts.getStore() ? contexts.run(undefined, run) : run();
  const context = { active: true, tool, started: performance.now() };
  return contexts.run(context, () => {
    workflowProgress('run:start');
    try {
      const result = run();
      workflowProgress('run:done');
      return result;
    } catch (error) {
      workflowProgress('run:failed');
      throw error;
    } finally {
      context.active = false;
    }
  });
}

export function withWorkflowProgress(enabled, run) {
  return withProgress(enabled, 'workflow:run', run);
}

export function withBindingStatusProgress(enabled, run) {
  return withProgress(enabled, 'binding-status', run);
}

// Shared binding inspectors also run during workflow:run. Their report-only
// phases stay private to this CLI instead of changing that driver's diagnostics.
export function bindingStatusProgress(phase, detail) {
  if (contexts.getStore()?.tool === 'binding-status') workflowProgress(phase, detail);
}

// One owner projection may perform many source/graph passes. These are actual
// completed operations, not unique inputs/rows, a percentage or a known total.
// A finite vocabulary bounds first/final updates even when thousands of small
// graphs are resolved. Intermediate updates share one one-second throttle;
// nothing runs on a timer, and no public option can supply a reporter callback.
const projectionMeasures = new Map([
  ['input-metadata', 'records prepared'],
  ['sources', 'selections resolved'],
  ['source-passes', 'passes completed'],
  ['units', 'units projected'],
  ['contract-graph', 'nodes resolved'],
  ['candidate-graph', 'requests resolved'],
  ['candidate-rows', 'rows resolved'],
  ['candidate-documents', 'documents scanned'],
  ['candidate-relations', 'nodes visited'],
  ['input-fidelity', 'inputs projected'],
  ['audit-files', 'files verified'],
]);
const projectionIntervalMs = 1000;

function reportProjection(progress, phase, count, now) {
  const owner = String(progress.owner);
  const label = owner.length > 80 ? `${owner.slice(0, 77)}...` : owner;
  workflowProgress('owner-projection:progress', `${label}; ${phase}: ${count} ${projectionMeasures.get(phase)}`);
  progress.reported.set(phase, count);
  progress.lastWritten = now;
}

export function scopedProjectionProgress(phase, count = 1) {
  const context = contexts.getStore();
  if (!context?.active) return;
  const progress = projections.getStore();
  if (!progress || progress.context !== context) return;
  try {
    if (!projectionMeasures.has(phase) || !Number.isSafeInteger(count) || count <= 0) return;
    const completed = (progress.counts.get(phase) || 0) + count;
    if (!Number.isSafeInteger(completed)) return;
    progress.counts.set(phase, completed);
    const now = performance.now();
    if (!progress.reported.has(phase) || now - progress.lastWritten >= projectionIntervalMs) {
      reportProjection(progress, phase, completed, now);
    }
  } catch {
    context.active = false;
  }
}

function flushProjection(progress) {
  const context = contexts.getStore();
  if (!context?.active || progress.context !== context) return;
  try {
    for (const [phase, count] of progress.counts) if (progress.reported.get(phase) !== count) {
      reportProjection(progress, phase, count, performance.now());
      if (!context.active) break;
    }
  } catch {
    context.active = false;
  }
}

export function withOwnerProjectionProgress(owner, run) {
  const context = contexts.getStore();
  if (!context?.active) return run();
  const progress = { context, owner, counts: new Map(), reported: new Map(), lastWritten: 0 };
  return projections.run(progress, () => {
    workflowProgress('owner-projection:start', owner);
    try {
      const result = run();
      flushProjection(progress);
      workflowProgress('owner-projection:done', owner);
      return result;
    } catch (error) {
      flushProjection(progress);
      workflowProgress('owner-projection:failed', owner);
      throw error;
    }
  });
}
