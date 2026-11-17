// Optional CLI diagnostics. This context is never a request, authority,
// checkpoint or result field, and does not expose a caller-supplied callback.
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';

const contexts = new AsyncLocalStorage();
const quoted = (value) => JSON.stringify(String(value).slice(0, 160));

export function workflowProgress(phase, detail) {
  const context = contexts.getStore();
  if (!context?.active) return;
  try {
    const allowedPhase = context.tool === 'binding-status'
      ? /^[a-z][a-z-]*:(?:start|done|failed|progress)$/ : /^[a-z][a-z-]*:(?:start|done|failed)$/;
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
