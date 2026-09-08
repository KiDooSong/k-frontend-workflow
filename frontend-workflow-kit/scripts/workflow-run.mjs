#!/usr/bin/env node
// workflow:run — workflow:packet(+report)를 엮어 auto-stop 상태를 내는 orchestrator.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  parseArgs, writeFile, readFileSafe, removeFileIfExists, yamlParse, DEFAULTS, isCliEntry,
} from './lib/util.mjs';
import { enforceCliFlagContract } from './lib/cli-args.mjs';
import { captureWorkflowJson, WORKFLOW_JSON_MAX_BYTES } from './lib/workflow-json-capture.mjs';
import {
  STATES, STATE_EXIT, isAbsorbedPacket, isPacketClean, buildRunModel,
  renderStatusMarkdown, renderJsonEnvelope, toPosix,
} from './lib/workflow-run.mjs';
import { visualPreworkIssues, appendVisualPreworkStatus } from './lib/visual-refresh-transport.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKET_SCRIPT = path.join(SELF_DIR, 'workflow-packet.mjs');
const REPORT_SCRIPT = path.join(SELF_DIR, 'workflow-report.mjs');
const VISUAL_REFRESH_INTENT = 'visual-refresh';

function fail(msg) { process.stderr.write(`workflow:run: ${msg}\n`); process.exit(2); }
function requireStringFlag(flags, name) {
  const v = flags[name];
  if (typeof v !== 'string' || v.trim() === '') fail(`--${name} 에는 값이 필요합니다 (예: --${name} <value>)`);
  return v.trim();
}
function optStr(flags, name) {
  const v = flags[name];
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || v.trim() === '') fail(`--${name} 에는 값이 필요합니다 (예: --${name} <value>)`);
  return v.trim();
}
function isoToday() { return new Date().toISOString().slice(0, 10); }
function relToCwd(p) { return toPosix(path.relative(process.cwd(), p)) || toPosix(p); }
function outside(root, target) {
  const relative = path.relative(root, target);
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}
function resolveProjectRoot(rootFlag) {
  const candidate = path.resolve(process.cwd(), rootFlag || '.');
  try {
    const stat = fs.statSync(candidate);
    if (!stat.isDirectory()) fail(`--root는 directory여야 함: ${rootFlag}`);
    return fs.realpathSync(candidate);
  } catch (error) {
    fail(`--root를 해석할 수 없음: ${rootFlag || '.'} (${error?.code || error?.message || error})`);
  }
}
function visualRelative(value, root) {
  if (!value) return undefined;
  const absolute = path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
  if (outside(root, absolute)) fail(`visual-refresh 경로가 --root 밖임: ${value}`);
  return toPosix(path.relative(root, absolute));
}
function loadModeOrder(policyFlag) {
  const p = policyFlag ? path.resolve(policyFlag) : DEFAULTS.policy;
  const raw = readFileSafe(p);
  if (raw == null) return [];
  try { const data = yamlParse(raw); return Array.isArray(data && data.order) ? data.order : []; }
  catch { return []; }
}
// Ordinary mode keeps its pre-existing capture semantics.
function runJson(scriptPath, args) {
  let code = 0; let stdout = ''; let stderr = '';
  try { stdout = execFileSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) {
    code = e && e.status != null ? e.status : null;
    stdout = e && e.stdout ? String(e.stdout) : '';
    stderr = e && e.stderr ? String(e.stderr) : e && e.message ? String(e.message) : '';
  }
  let json = null;
  if (stdout.trim()) { try { json = JSON.parse(stdout); } catch { json = null; } }
  return { code, stdout, stderr, json };
}
function hasVisualCliSurface(flags) {
  return ['intent', 'input', 'path', 'root', 'ci', 'staged', 'range', 'base']
    .some((key) => Object.prototype.hasOwnProperty.call(flags, key));
}
function appendVisualStatus(markdown, report) {
  if (!report?.visual_refresh) return markdown;
  const forbidden = report.forbidden || {};
  const changed = Array.isArray(report.changed_files) ? report.changed_files : [];
  const lines = [
    '## Visual Backstop (Run Report transport)',
    `- input: \`${report.visual_refresh.input_id || '—'}\``,
    `- authorized path: \`${report.visual_refresh.authorized_path || '—'}\``,
    `- snapshot: \`${report.visual_refresh.backstop_source_tree || '—'}\` → \`${report.visual_refresh.backstop_destination_tree || '—'}\` (${report.visual_refresh.backstop_diff_kind || '—'})`,
    `- forbidden status: \`${forbidden.status || 'unknown'}\` · ok=${forbidden.ok == null ? 'unknown' : forbidden.ok} · violations=${Array.isArray(forbidden.violations) ? forbidden.violations.length : 0}`,
    `- changed records: ${changed.length}`,
  ];
  for (const violation of forbidden.violations || []) lines.push(`  - ${violation.code || 'violation'}: ${violation.file || '(authority)'} — ${violation.reason || ''}`);
  if (forbidden.error) lines.push(`- tool error: ${forbidden.error}`);
  if (forbidden.capture_error) lines.push('```json', JSON.stringify(forbidden.capture_error, null, 2), '```');
  if (report.review_evidence) lines.push('', '### Review Evidence (advisory)', '```json', JSON.stringify(report.review_evidence, null, 2), '```');
  return markdown.replace('\n## Artifacts\n', `\n${lines.join('\n')}\n\n## Artifacts\n`);
}

function main() {
  const argv = process.argv.slice(2);
  const parsed = parseArgs(argv);
  if (hasVisualCliSurface(parsed.flags)) {
    enforceCliFlagContract({
      argv, flags: parsed.flags, positionals: parsed.positionals,
      valueFlags: new Set([
        'screen', 'requested-mode', 'out', 'docs', 'src', 'readiness', 'policy', 'manifest',
        'layout', 'domain', 'diff', 'review', 'intent', 'input', 'path', 'root', 'range',
        'base', 'ci', 'date', 'seq', 'owner',
      ]),
      booleanFlags: new Set(['h', 'help', 'skip-tests', 'json', 'staged']),
      tool: 'workflow:run', helpCommand: 'npm run workflow:run --',
    });
  }
  const { flags } = parsed;
  if (flags.help || flags.h) {
    process.stdout.write(
      'workflow:run — workflow:packet(+report)를 엮어 auto-stop 상태를 낸다.\n' +
      '필수: --screen <ID> --requested-mode <mode>\n' +
      '선택: --out <dir> --docs <dir> --src <dir> --readiness <path> --policy <path> --manifest <path> --layout <path> --domain <name>\n' +
      '       --diff <name-status.txt> --review <path> --skip-tests --json --date YYYY-MM-DD --seq NNN --owner <name>\n' +
      'visual: --intent visual-refresh --input <INPUT_ID> --path <SCREEN_ENTRY> [--root <project>] [--ci <path>] [--staged|--range <A..B>|--base <ref>]\n' +
      'visual-refresh에서는 --readiness override를 지원하지 않으며 현재 concrete path authorization을 요구한다.\n'
    );
    return;
  }
  const screen = requireStringFlag(flags, 'screen');
  const requestedMode = requireStringFlag(flags, 'requested-mode');
  const outDir = optStr(flags, 'out');
  const docs = optStr(flags, 'docs');
  const src = optStr(flags, 'src');
  const policy = optStr(flags, 'policy');
  const manifest = optStr(flags, 'manifest');
  const layout = optStr(flags, 'layout');
  const ci = optStr(flags, 'ci');
  const readiness = optStr(flags, 'readiness');
  const domain = optStr(flags, 'domain');
  const diff = optStr(flags, 'diff');
  const review = optStr(flags, 'review');
  const intent = optStr(flags, 'intent');
  const input = optStr(flags, 'input');
  const checkedPath = optStr(flags, 'path');
  const root = optStr(flags, 'root');
  const range = optStr(flags, 'range');
  const base = optStr(flags, 'base');
  const staged = flags.staged === true;
  const skipTests = !!flags['skip-tests'];
  const date = optStr(flags, 'date') ?? isoToday();
  const seq = optStr(flags, 'seq') ?? '001';
  const owner = optStr(flags, 'owner');

  const visual = intent != null;
  if (visual && intent !== VISUAL_REFRESH_INTENT) fail(`지원하지 않는 --intent: ${intent}`);
  if (visual && (!input || !checkedPath)) fail('visual-refresh run은 --input <INPUT_ID>와 --path <SCREEN_ENTRY>가 필요함');
  if (!visual && (input || checkedPath || staged || range || base || ci || root)) fail('--input/--path/--staged/--range/--base/--ci/--root는 --intent visual-refresh와 함께 사용해야 함');
  if (visual && readiness) fail('visual-refresh에서는 --readiness override를 사용할 수 없음; 현재 authority를 다시 평가해야 함');
  if (visual && diff) fail('visual-refresh run은 --diff(name-status only)를 지원하지 않음; --staged/--range/--base를 사용하세요');
  const snapshotCount = Number(staged) + Number(Boolean(range)) + Number(Boolean(base));
  if (visual && snapshotCount > 1) fail('visual-refresh snapshot source는 --staged/--range/--base 중 하나만 선택해야 함');
  const runChild = visual ? captureWorkflowJson : runJson;

  const rootResolved = visual ? resolveProjectRoot(root) : null;
  const visualDocs = visual && docs ? visualRelative(docs, rootResolved) : docs;
  const visualSrc = visual && src ? visualRelative(src, rootResolved) : src;
  const visualPolicy = visual && policy ? visualRelative(policy, rootResolved) : policy;
  const visualManifest = visual && manifest ? visualRelative(manifest, rootResolved) : manifest;
  const visualLayout = visual && layout ? visualRelative(layout, rootResolved) : layout;
  const visualCi = visual && ci ? visualRelative(ci, rootResolved) : ci;
  const layoutResolved = visual
    ? (visualLayout ? path.join(rootResolved, ...visualLayout.split('/')) : null)
    : (layout ? path.resolve(layout) : null);
  const policyResolved = visual && visualPolicy ? path.join(rootResolved, ...visualPolicy.split('/')) : policy;

  const outDirResolved = outDir ? path.resolve(outDir) : null;
  const scratch = visual && !outDirResolved ? fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-visual-run-')) : null;
  const packetPath = outDirResolved ? path.join(outDirResolved, 'work-packet.md') : scratch ? path.join(scratch, 'work-packet.md') : path.join(os.tmpdir(), `workflow-run-${seq}-work-packet.md`);
  const reportPath = outDirResolved ? path.join(outDirResolved, 'run-report.md') : scratch ? path.join(scratch, 'run-report.md') : path.join(os.tmpdir(), `workflow-run-${seq}-run-report.md`);
  let statusPath = null;
  if (outDirResolved) {
    const name = path.basename(outDirResolved);
    statusPath = name ? path.join(path.dirname(outDirResolved), name + '.md') : path.join(outDirResolved, 'run-status.md');
  }

  const finalize = (state, { packet = null, report = null, reason = null, requestedKnown = true, toolError = null } = {}) => {
    if (outDirResolved && report == null) {
      try { removeFileIfExists(reportPath); } catch (e) { fail(`기존 Run Report 제거 실패 "${relToCwd(reportPath)}": ${e.message}`); }
    }
    const model = buildRunModel({
      screen, requestedMode, state, packet, report,
      paths: {
        packet: packet && outDirResolved ? relToCwd(packetPath) : null,
        report: report && outDirResolved ? relToCwd(reportPath) : null,
        status: statusPath ? relToCwd(statusPath) : null,
        docs: visual ? visualDocs : docs,
      },
      reason, date, seq, requestedKnown,
    });
    let md = renderStatusMarkdown(model);
    if (visual && packet?.visual_refresh) md = appendVisualPreworkStatus(md, packet.visual_refresh, visualPreworkIssues(packet.visual_refresh, { screen, input, checkedPath }));
    md = appendVisualStatus(md, report);
    if (toolError) md += '\n## JSON transport error\n```json\n' + JSON.stringify(toolError, null, 2) + '\n```\n';
    if (statusPath) { try { writeFile(statusPath, md); } catch (e) { fail(`--out 상태 파일 쓰기 실패 "${relToCwd(statusPath)}": ${e.message}`); } }
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
    if (flags.json) {
      const envelope = renderJsonEnvelope(model);
      if (visual) {
        envelope.json_transport_limit_bytes = WORKFLOW_JSON_MAX_BYTES;
        if (toolError) envelope.tool_error = toolError;
      }
      if (visual && packet?.visual_refresh) {
        envelope.visual_prework = packet.visual_refresh;
        envelope.visual_refresh = packet.visual_refresh;
      }
      if (report?.visual_refresh) {
        envelope.visual_refresh = { ...packet?.visual_refresh, ...report.visual_refresh };
        envelope.forbidden = report.forbidden || null;
        envelope.changed_files = Array.isArray(report.changed_files) ? report.changed_files : [];
        if (report.review_evidence) envelope.review_evidence = report.review_evidence;
      }
      process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
    } else if (!statusPath) process.stdout.write(md);
    else process.stdout.write(`workflow:run: ${state} (exit ${STATE_EXIT[state]}) — ${relToCwd(statusPath)} · packet=${model.paths.packet || '—'} · report=${model.paths.report || '—'}\n`);
    process.exitCode = STATE_EXIT[state];
  };

  const packetArgs = ['--screen', screen, '--requested-mode', requestedMode, '--out', packetPath, '--json'];
  if (readiness) packetArgs.push('--readiness', readiness);
  if (visualDocs) packetArgs.push('--docs', visualDocs);
  if (visualSrc && visual) packetArgs.push('--src', visualSrc);
  if (visualPolicy) packetArgs.push('--policy', visualPolicy);
  if (visualManifest) packetArgs.push('--manifest', visualManifest);
  if (layoutResolved) packetArgs.push('--layout', visual ? visualLayout : layoutResolved);
  if (domain) packetArgs.push('--domain', domain);
  if (owner) packetArgs.push('--owner', owner);
  if (visual) {
    packetArgs.push('--intent', intent, '--input', input, '--path', checkedPath, '--root', rootResolved);
    if (visualCi) packetArgs.push('--ci', visualCi);
  }
  packetArgs.push('--date', date, '--seq', seq);

  const pk = runChild(PACKET_SCRIPT, packetArgs);
  if (pk.code !== 0 || !pk.json) {
    const why = (pk.stderr || '').trim() || `exit=${pk.code == null ? '?' : pk.code}, JSON 출력 없음`;
    finalize(STATES.HALT_TOOL_ERROR, { reason: `workflow:packet 실패: ${why}`, toolError: pk.capture_error || pk.json?.tool_error || null });
    return;
  }
  const packet = pk.json;
  if (isAbsorbedPacket(packet)) { finalize(STATES.HALT_NOT_APPLICABLE, { packet }); return; }

  const modeOrder = loadModeOrder(policyResolved);
  const requestedKnown = modeOrder.length === 0 ? true : modeOrder.includes(requestedMode);
  const preworkIssues = visual ? visualPreworkIssues(packet.visual_refresh, { screen, input, checkedPath }) : [];
  if (preworkIssues.length) {
    finalize(STATES.HALT_AMBIGUITY, { packet, requestedKnown, reason: `visual-refresh pre-work authorization denied: ${preworkIssues.join('; ')}` });
    return;
  }
  if (!isPacketClean(packet) || !requestedKnown) { finalize(STATES.HALT_AMBIGUITY, { packet, requestedKnown }); return; }
  const hasImplementationEvidence = visual ? snapshotCount === 1 : Boolean(diff);
  if (!hasImplementationEvidence) { finalize(STATES.HALT_READY_FOR_WORK, { packet }); return; }

  const reportArgs = ['--packet', packetPath, '--out', reportPath, '--json'];
  if (!visual) reportArgs.push('--diff', diff);
  if (visual ? visualDocs : docs) reportArgs.push('--docs', visual ? visualDocs : docs);
  if (visual ? visualSrc : src) reportArgs.push('--src', visual ? visualSrc : src);
  if (layoutResolved) reportArgs.push('--layout', visual ? visualLayout : layoutResolved);
  if (review) reportArgs.push('--review', review);
  if (skipTests) reportArgs.push('--skip-tests');
  if (visual) {
    reportArgs.push('--intent', intent, '--input', input, '--path', checkedPath, '--root', rootResolved);
    if (visualPolicy) reportArgs.push('--policy', visualPolicy);
    if (visualManifest) reportArgs.push('--manifest', visualManifest);
    if (visualCi) reportArgs.push('--ci', visualCi);
    if (staged) reportArgs.push('--staged');
    if (range) reportArgs.push('--range', range);
    if (base) reportArgs.push('--base', base);
  }
  reportArgs.push('--date', date, '--seq', seq);
  const rp = runChild(REPORT_SCRIPT, reportArgs);
  if (rp.code !== 0 || !rp.json) {
    const why = (rp.stderr || '').trim() || `exit=${rp.code == null ? '?' : rp.code}, JSON 출력 없음`;
    finalize(STATES.HALT_TOOL_ERROR, { packet, reason: `workflow:report 실패: ${why}`, toolError: rp.capture_error || rp.json?.tool_error || null });
    return;
  }
  if (visual && !['pass', 'fail', 'error'].includes(rp.json.forbidden?.status)) {
    finalize(STATES.HALT_TOOL_ERROR, { packet, reason: 'visual report의 forbidden 결과가 없거나 손상됨' });
    return;
  }
  if (visual && rp.json.forbidden?.status === 'error') {
    const detail = rp.json.forbidden?.error || `backstop exit=${rp.json.forbidden?.exit_code ?? '?'}`;
    finalize(STATES.HALT_TOOL_ERROR, {
      packet, report: rp.json, requestedKnown, reason: `visual backstop 실행 오류: ${detail}`,
      toolError: rp.json.forbidden.capture_error || null,
    });
    return;
  }
  finalize(STATES.DONE_PENDING_REVIEW, { packet, report: rp.json, requestedKnown });
}

if (isCliEntry(import.meta.url)) main();
