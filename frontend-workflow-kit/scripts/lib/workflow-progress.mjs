// Optional work-run diagnostics. This context is never a request, authority,
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
    const label = typeof phase === 'string' && phase.length <= 64 && /^[a-z][a-z-]*:(?:start|done|failed)$/.test(phase)
      ? phase : quoted(phase);
    const suffix = detail === undefined ? '' : ` ${quoted(detail)}`;
    const seconds = ((performance.now() - context.started) / 1000).toFixed(3);
    const bytes = Buffer.from(`workflow:run [${seconds}s] ${label}${suffix}\n`);
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

// All work-run drivers are synchronous. A nested or subsequent invocation gets
// its own context; opt-out also suppresses an enclosing invocation's reporter.
export function withWorkflowProgress(enabled, run) {
  if (!enabled) return contexts.getStore() ? contexts.run(undefined, run) : run();
  const context = { active: true, started: performance.now() };
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
