// Visual Packet/Report/Run share one transport size contract. Child stdio goes
// directly to private files (no Node sync-pipe 1 MiB truncation), then each file
// is size-checked before reading/parsing. No shell, executable override, or gate.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const WORKFLOW_JSON_MAX_BYTES = 64 * 1024 * 1024;
export const WORKFLOW_JSON_TIMEOUT_MS = 120_000;

export function captureWorkflowJson(script, args, {
  cwd = process.cwd(),
  maxBytes = WORKFLOW_JSON_MAX_BYTES,
  timeout = WORKFLOW_JSON_TIMEOUT_MS,
} = {}) {
  const errorResult = (code, message, extra = {}) => ({
    code: 2,
    stdout: '',
    stderr: `${code}: ${message}`,
    json: null,
    capture_error: { code, message, limit_bytes: maxBytes, ...extra },
  });
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    return errorResult('WF-JSON-CONFIG', 'positive integer byte limit required');
  }
  let temporary;
  const descriptors = [];
  try {
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-json-'));
    const output = path.join(temporary, 'stdout.json');
    const diagnostic = path.join(temporary, 'stderr.txt');
    descriptors.push(fs.openSync(output, 'wx', 0o600));
    descriptors.push(fs.openSync(diagnostic, 'wx', 0o600));
    const child = spawnSync(process.execPath, [script, ...args], {
      cwd,
      stdio: ['ignore', descriptors[0], descriptors[1]],
      timeout,
      killSignal: 'SIGKILL',
    });
    for (const [stream, file] of [['stdout', output], ['stderr', diagnostic]]) {
      const size = fs.statSync(file).size;
      if (size > maxBytes) {
        return errorResult('WF-JSON-OUTPUT-LIMIT', `${stream} exceeds the visual JSON transport limit`, {
          stream, observed_bytes: size, child_exit: child.status, child_signal: child.signal,
        });
      }
    }
    const stderr = fs.readFileSync(diagnostic, 'utf8');
    if (child.error || child.signal) {
      return errorResult('WF-JSON-CHILD-ERROR', child.error?.message || `child terminated by ${child.signal}`, {
        child_exit: child.status, child_signal: child.signal, diagnostic: stderr,
      });
    }
    const stdout = fs.readFileSync(output, 'utf8');
    let json;
    try { json = JSON.parse(stdout); }
    catch (error) {
      return errorResult('WF-JSON-MALFORMED', stderr || error.message, { child_exit: child.status });
    }
    return { code: child.status ?? 2, stdout: '', stderr, json, capture_error: null };
  } catch (error) {
    return errorResult('WF-JSON-IO', error.message, { io_code: error.code || null });
  } finally {
    for (const descriptor of descriptors) {
      try { fs.closeSync(descriptor); } catch { /* already closed */ }
    }
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
  }
}
