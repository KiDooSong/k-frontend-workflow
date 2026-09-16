import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, writeFile } from './util.mjs';
import { enforceCliFlagContract } from './cli-args.mjs';
import {
  CurrentWorkExecutionError,
  prepareCurrentWork,
  cleanupCurrentWork,
  publicCurrentEnvelope,
  currentPacketEnvelope,
  renderCurrentPacketMarkdown,
  parseCurrentPacket,
  assertPacketMatches,
  evaluateCurrentGit,
  currentReportEnvelope,
  renderCurrentReportMarkdown,
} from './current-work-execution.mjs';

const COMMON_VALUES = ['work', 'root', 'docs', 'src', 'policy', 'manifest', 'layout', 'ci'];
const COMMON_BOOLS = ['h', 'help', 'json'];
const TOOL_VALUES = {
  readiness: [...COMMON_VALUES, 'out'],
  packet: [...COMMON_VALUES, 'out', 'date', 'seq', 'owner'],
  report: [...COMMON_VALUES, 'packet', 'out', 'review', 'date', 'seq'],
  run: [...COMMON_VALUES, 'out', 'review', 'date', 'seq', 'owner'],
  'forbidden-paths': [...COMMON_VALUES],
};
const TOOL_BOOLS = {
  readiness: COMMON_BOOLS,
  packet: COMMON_BOOLS,
  report: [...COMMON_BOOLS, 'skip-tests'],
  run: [...COMMON_BOOLS, 'skip-tests'],
  'forbidden-paths': [...COMMON_BOOLS, 'enforce', 'staged'],
};

function help(tool) {
  const common = '--work <request.json> [--root <project>] [--docs <dir>] [--src <dir>] [--policy <file>] [--manifest <file>] [--layout <file>] [--ci <file>]';
  const suffix = tool === 'packet' ? ' [--out <packet.md>] [--json]'
    : tool === 'report' ? ' --packet <packet.md> [--out <report.md>] [--json]'
    : tool === 'run' ? ' [--out <dir>] [--json]'
    : tool === 'forbidden-paths' ? ' [--staged] [--enforce] [--json]'
    : ' [--out <result.json>] [--json]';
  return `${tool}: current work execution (C; authority:current only)\nUsage: ${common}${suffix}\n`;
}
function own(v, k) { return Object.prototype.hasOwnProperty.call(v || {}, k); }
function opt(flags, name) { return typeof flags[name] === 'string' ? flags[name] : undefined; }
function resolveOut(value) { return value ? path.resolve(value) : null; }
function writeJson(file, value) { writeFile(file, JSON.stringify(value, null, 2) + '\n'); }
function humanReadiness(env) {
  const lines = [`current-work readiness — ready=${env.ready} requests=${env.requests.length} origins=${env.origin_inputs.length}`];
  for (const req of env.requests) lines.push(`  ${req.owner}: requested=${req.requested_mode} current=${req.readiness_mode ?? '—'} ready=${req.ready} targets=${req.targets.length}`);
  for (const e of env.errors) lines.push(`  ERROR ${e.code}: ${e.owner || ''} ${e.message || ''}`.trimEnd());
  for (const d of env.denials) lines.push(`  DENY ${d.code}: ${d.owner || d.input_id || ''} ${d.path || ''} ${d.message || d.reason || ''}`.trimEnd());
  if (env.future_requirements.length) lines.push(`  future_requirements=${env.future_requirements.length} (preserved; not current blockers)`);
  return lines.join('\n') + '\n';
}
function parse(tool, argv) {
  const parsed = parseArgs(argv);
  const usageError = enforceCliFlagContract({
    argv,
    flags: parsed.flags,
    positionals: parsed.positionals,
    valueFlags: new Set(TOOL_VALUES[tool]),
    booleanFlags: new Set(TOOL_BOOLS[tool]),
    tool,
    helpCommand: `npm run workflow:${tool === 'forbidden-paths' ? 'forbidden-paths' : tool} --`,
  });
  const flags = parsed.flags;
  if (flags.help || flags.h) return { flags, help: true, usageError };
  if (!own(flags, 'work')) usageError('--work is required for current work execution');
  return { flags, help: false, usageError };
}
function options(flags) {
  return {
    work: opt(flags, 'work'), root: opt(flags, 'root'), docs: opt(flags, 'docs'), src: opt(flags, 'src'),
    policy: opt(flags, 'policy'), manifest: opt(flags, 'manifest'), layout: opt(flags, 'layout'), ci: opt(flags, 'ci'),
  };
}
function statusEnvelope(state, preflight, git = null) {
  const env = publicCurrentEnvelope(preflight);
  return {
    work_contract: 1,
    state,
    exit_code: state === 'HALT_TOOL_ERROR' ? 2 : 0,
    request_digest: env.request_digest,
    snapshot: env.snapshot,
    origin_inputs: env.origin_inputs,
    requests: env.requests,
    ready: env.ready,
    errors: env.errors,
    denials: env.denials,
    future_requirements: env.future_requirements,
    required_reviews: env.required_reviews,
    ...(git ? { backstop: git } : {}),
  };
}
function renderRunStatus(status) {
  const backstop = status.backstop;
  return [
    '---', 'kind: current-work-run-status', 'work_contract: 1', `state: ${status.state}`,
    `request_digest: ${JSON.stringify(status.request_digest)}`, '---', '',
    `# Current Work Run — ${status.state}`, '', `- baseline ready: \`${status.ready}\``,
    `- requests: ${status.requests.length} · origins: ${status.origin_inputs.length} · denials: ${status.denials.length} · errors: ${status.errors.length}`,
    ...(backstop ? [`- changed records: ${backstop.changed_records.length} · backstop violations: ${backstop.violations.length}`] : []),
    '', '> HALT/DONE here is orchestration state, not merge approval. D/scoped authority is not implemented.', ''
  ].join('\n');
}

export function runCurrentWorkCli(tool, argv) {
  const parsed = parse(tool, argv);
  if (parsed.help) { process.stdout.write(help(tool)); return; }
  const { flags } = parsed;
  let preflight;
  try {
    preflight = prepareCurrentWork(options(flags));
    if (tool === 'readiness') {
      const env = publicCurrentEnvelope(preflight);
      const out = resolveOut(opt(flags, 'out'));
      if (out) writeJson(out, env);
      process.stdout.write(flags.json ? JSON.stringify(env, null, 2) + '\n' : humanReadiness(env));
      process.exitCode = 0;
      return;
    }
    if (tool === 'packet') {
      const env = currentPacketEnvelope(preflight);
      const markdown = renderCurrentPacketMarkdown(preflight);
      const out = resolveOut(opt(flags, 'out'));
      if (out) writeFile(out, markdown);
      process.stdout.write(flags.json ? JSON.stringify(env, null, 2) + '\n' : out ? `workflow:packet: wrote ${path.relative(process.cwd(), out) || out} (${env.packet_status})\n` : markdown);
      process.exitCode = 0;
      return;
    }
    if (tool === 'forbidden-paths') {
      const git = evaluateCurrentGit(preflight, { staged: flags.staged === true });
      const publicValue = publicCurrentEnvelope(preflight);
      const env = {
        work_contract: 1,
        request_digest: preflight.request_digest,
        ready: preflight.ready,
        origin_inputs: publicValue.origin_inputs,
        requests: publicValue.requests,
        changed_records: git.changed_records,
        execution_input_records: git.execution_input_records,
        implementation_records: git.implementation_records,
        violations: git.violations,
        ok: git.ok,
        snapshot: git.snapshot,
      };
      if (flags.json) process.stdout.write(JSON.stringify(env, null, 2) + '\n');
      else {
        process.stdout.write(`forbidden-paths current — ${env.violations.length ? 'violations' : 'clean'} (${env.changed_records.length} changed record(s))\n`);
        for (const violation of env.violations) process.stdout.write(`  - ${violation.code}: ${violation.path || violation.record || ''} ${violation.message || ''}\n`);
      }
      process.exitCode = flags.enforce === true && (!env.ok || env.violations.length) ? 1 : 0;
      return;
    }
    if (tool === 'report') {
      const packetFlag = opt(flags, 'packet');
      if (!packetFlag) parsed.usageError('--packet is required with --work for workflow:report');
      const packet = parseCurrentPacket(path.resolve(packetFlag));
      assertPacketMatches(preflight, packet);
      const git = evaluateCurrentGit(preflight);
      const env = currentReportEnvelope(preflight, git);
      const markdown = renderCurrentReportMarkdown(preflight, git);
      const out = resolveOut(opt(flags, 'out'));
      if (out) writeFile(out, markdown);
      process.stdout.write(flags.json ? JSON.stringify(env, null, 2) + '\n' : out ? `workflow:report: wrote ${path.relative(process.cwd(), out) || out} (backstop=${git.ok ? 'pass' : 'review'})\n` : markdown);
      process.exitCode = 0;
      return;
    }
    if (tool === 'run') {
      let state;
      let git = null;
      if (preflight.all_absorbed) state = 'HALT_NOT_APPLICABLE';
      else if (!preflight.ready) state = 'HALT_AMBIGUITY';
      else {
        const observed = evaluateCurrentGit(preflight);
        if (observed.implementation_records.length === 0) {
          git = null;
          state = 'HALT_READY_FOR_WORK';
        } else {
          git = observed;
          state = 'DONE_PENDING_REVIEW';
        }
      }
      const status = statusEnvelope(state, preflight, git);
      const outDir = resolveOut(opt(flags, 'out'));
      if (outDir) {
        fs.mkdirSync(outDir, { recursive: true });
        writeFile(path.join(outDir, 'work-packet.md'), renderCurrentPacketMarkdown(preflight));
        if (git && git.implementation_records.length) writeFile(path.join(outDir, 'run-report.md'), renderCurrentReportMarkdown(preflight, git));
        writeFile(`${outDir}.md`, renderRunStatus(status));
      }
      process.stdout.write(flags.json ? JSON.stringify(status, null, 2) + '\n' : outDir ? `workflow:run: ${state} — ${path.relative(process.cwd(), `${outDir}.md`) || `${outDir}.md`}\n` : renderRunStatus(status));
      process.exitCode = 0;
      return;
    }
    throw new CurrentWorkExecutionError(`unsupported current work CLI: ${tool}`);
  } finally {
    cleanupCurrentWork(preflight);
  }
}

export function runCurrentWorkCliSafely(tool, argv) {
  try { runCurrentWorkCli(tool, argv); }
  catch (error) {
    process.stderr.write(`${tool}: ${error?.message || String(error)}\n`);
    process.exitCode = 2;
  }
}
