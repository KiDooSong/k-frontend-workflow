#!/usr/bin/env node
// workflow:run — workflow:packet(+report)를 엮어 auto-stop 상태를 내는 orchestrator.
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  parseArgs, writeFile, readFileSafe, removeFileIfExists, yamlParse, DEFAULTS, isCliEntry,
} from './lib/util.mjs';
import {
  STATES, STATE_EXIT, isAbsorbedPacket, isPacketClean, buildRunModel,
  renderStatusMarkdown, renderJsonEnvelope, toPosix,
} from './lib/workflow-run.mjs';

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
function loadModeOrder(policyFlag) {
  const p = policyFlag ? path.resolve(policyFlag) : DEFAULTS.policy;
  const raw = readFileSafe(p);
  if (raw == null) return [];
  try { const data = yamlParse(raw); return Array.isArray(data && data.order) ? data.order : []; }
  catch { return []; }
}
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

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h) {
    process.stdout.write(
      'workflow:run — workflow:packet(+report)를 엮어 auto-stop 상태를 낸다.\n' +
      '필수: --screen <ID> --requested-mode <mode>\n' +
      '선택: --out <dir> --docs <dir> --src <dir> --readiness <path> --policy <path> --manifest <path> --layout <path> --domain <name>\n' +
      '       --diff <name-status.txt> --review <path> --skip-tests --json --date YYYY-MM-DD --seq NNN --owner <name>\n' +
      'visual: --intent visual-refresh --input <INPUT_ID> --path <SCREEN_ENTRY> [--root <project>] [--ci <path>] [--staged|--range <A..B>|--base <ref>]\n'
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
  if (!visual && (input || checkedPath || staged || range || base || ci || root)) {
    fail('--input/--path/--staged/--range/--base/--ci/--root는 --intent visual-refresh와 함께 사용해야 함');
  }
  if (visual && diff) fail('visual-refresh run은 --diff(name-status only)를 지원하지 않음; --staged/--range/--base를 사용하세요');
  const snapshotCount = Number(staged) + Number(Boolean(range)) + Number(Boolean(base));
  if (visual && snapshotCount > 1) fail('visual-refresh snapshot source는 --staged/--range/--base 중 하나만 선택해야 함');

  const outDirResolved = outDir ? path.resolve(outDir) : null;
  const layoutResolved = layout ? path.resolve(layout) : null;
  const packetPath = outDirResolved ? path.join(outDirResolved, 'work-packet.md') : path.join(os.tmpdir(), `workflow-run-${seq}-work-packet.md`);
  const reportPath = outDirResolved ? path.join(outDirResolved, 'run-report.md') : path.join(os.tmpdir(), `workflow-run-${seq}-run-report.md`);
  let statusPath = null;
  if (outDirResolved) {
    const name = path.basename(outDirResolved);
    statusPath = name ? path.join(path.dirname(outDirResolved), name + '.md') : path.join(outDirResolved, 'run-status.md');
  }

  const finalize = (state, { packet = null, report = null, reason = null, requestedKnown = true } = {}) => {
    if (outDirResolved && report == null) {
      try { removeFileIfExists(reportPath); } catch (e) { fail(`기존 Run Report 제거 실패 "${relToCwd(reportPath)}": ${e.message}`); }
    }
    const model = buildRunModel({
      screen, requestedMode, state, packet, report,
      paths: {
        packet: packet && outDirResolved ? relToCwd(packetPath) : null,
        report: report && outDirResolved ? relToCwd(reportPath) : null,
        status: statusPath ? relToCwd(statusPath) : null,
        docs,
      },
      reason, date, seq, requestedKnown,
    });
    const md = renderStatusMarkdown(model);
    if (statusPath) { try { writeFile(statusPath, md); } catch (e) { fail(`--out 상태 파일 쓰기 실패 "${relToCwd(statusPath)}": ${e.message}`); } }
    if (flags.json) process.stdout.write(JSON.stringify(renderJsonEnvelope(model), null, 2) + '\n');
    else if (!statusPath) process.stdout.write(md);
    else process.stdout.write(`workflow:run: ${state} (exit ${STATE_EXIT[state]}) — ${relToCwd(statusPath)} · packet=${model.paths.packet || '—'} · report=${model.paths.report || '—'}\n`);
    process.exitCode = STATE_EXIT[state];
  };

  const packetArgs = ['--screen', screen, '--requested-mode', requestedMode, '--out', packetPath, '--json'];
  if (readiness) packetArgs.push('--readiness', readiness);
  if (docs) packetArgs.push('--docs', docs);
  if (src && visual) packetArgs.push('--src', src);
  if (policy) packetArgs.push('--policy', policy);
  if (manifest) packetArgs.push('--manifest', manifest);
  if (layoutResolved) packetArgs.push('--layout', layoutResolved);
  if (domain) packetArgs.push('--domain', domain);
  if (owner) packetArgs.push('--owner', owner);
  if (visual) {
    packetArgs.push('--intent', intent, '--input', input, '--path', checkedPath);
    if (root) packetArgs.push('--root', root);
    if (ci) packetArgs.push('--ci', ci);
  }
  packetArgs.push('--date', date, '--seq', seq);

  const pk = runJson(PACKET_SCRIPT, packetArgs);
  if (pk.code !== 0 || !pk.json) {
    const why = (pk.stderr || '').trim() || `exit=${pk.code == null ? '?' : pk.code}, JSON 출력 없음`;
    finalize(STATES.HALT_TOOL_ERROR, { reason: `workflow:packet 실패: ${why}` });
    return;
  }
  const packet = pk.json;
  if (isAbsorbedPacket(packet)) { finalize(STATES.HALT_NOT_APPLICABLE, { packet }); return; }

  const modeOrder = loadModeOrder(policy);
  const requestedKnown = modeOrder.length === 0 ? true : modeOrder.includes(requestedMode);
  if (visual && packet.visual_refresh?.authority_applicable !== true) {
    finalize(STATES.HALT_AMBIGUITY, { packet, requestedKnown, reason: 'visual-refresh authority is not applicable' });
    return;
  }
  if (!isPacketClean(packet) || !requestedKnown) { finalize(STATES.HALT_AMBIGUITY, { packet, requestedKnown }); return; }

  const hasImplementationEvidence = visual ? snapshotCount === 1 : Boolean(diff);
  if (!hasImplementationEvidence) { finalize(STATES.HALT_READY_FOR_WORK, { packet }); return; }

  const reportArgs = ['--packet', packetPath, '--out', reportPath, '--json'];
  if (!visual) reportArgs.push('--diff', diff);
  if (docs) reportArgs.push('--docs', docs);
  if (src) reportArgs.push('--src', src);
  if (layoutResolved) reportArgs.push('--layout', layoutResolved);
  if (review) reportArgs.push('--review', review);
  if (skipTests) reportArgs.push('--skip-tests');
  if (visual) {
    reportArgs.push('--intent', intent, '--input', input, '--path', checkedPath);
    if (root) reportArgs.push('--root', root);
    if (policy) reportArgs.push('--policy', policy);
    if (manifest) reportArgs.push('--manifest', manifest);
    if (ci) reportArgs.push('--ci', ci);
    if (staged) reportArgs.push('--staged');
    if (range) reportArgs.push('--range', range);
    if (base) reportArgs.push('--base', base);
  }
  reportArgs.push('--date', date, '--seq', seq);

  const rp = runJson(REPORT_SCRIPT, reportArgs);
  if (rp.code !== 0 || !rp.json) {
    const why = (rp.stderr || '').trim() || `exit=${rp.code == null ? '?' : rp.code}, JSON 출력 없음`;
    finalize(STATES.HALT_TOOL_ERROR, { packet, reason: `workflow:report 실패: ${why}` });
    return;
  }
  finalize(STATES.DONE_PENDING_REVIEW, { packet, report: rp.json });
}

if (isCliEntry(import.meta.url)) main();
