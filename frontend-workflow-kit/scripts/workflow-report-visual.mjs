#!/usr/bin/env node
// visual-refresh Run Report collector. Packet audit is transport-only; forbidden-paths
// re-evaluates authority from the selected Git snapshot before evidence is recorded.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  parseArgs, readFileSafe, writeFile, splitFrontmatter, isCliEntry,
} from './lib/util.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const FORBIDDEN_SCRIPT = path.join(SELF_DIR, 'forbidden-paths.mjs');
const VISUAL_REFRESH_INTENT = 'visual-refresh';

function fail(msg) {
  process.stderr.write(`workflow:report: ${msg}\n`);
  process.exit(2);
}
function req(flags, name) {
  const value = flags[name];
  if (typeof value !== 'string' || value.trim() === '') fail(`--${name} 에는 값이 필요합니다`);
  return value.trim();
}
function opt(flags, name) {
  const value = flags[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') fail(`--${name} 에는 값이 필요합니다`);
  return value.trim();
}
function toPosix(value) { return String(value).replace(/\\/g, '/'); }
function isoToday() { return new Date().toISOString().slice(0, 10); }
function relativeForVisual(value, root) {
  if (!value) return undefined;
  if (!path.isAbsolute(value)) return toPosix(value);
  const base = path.resolve(root || process.cwd());
  const relative = path.relative(base, path.resolve(value));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`visual authority resource가 --root 밖임: ${value}`);
  }
  return toPosix(relative);
}
function runCapture(script, args, cwd) {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      code: error?.status ?? null,
      stdout: error?.stdout ? String(error.stdout) : '',
      stderr: error?.stderr ? String(error.stderr) : error?.message || String(error),
    };
  }
}
function collectNameStatus(root, { staged, range, base }) {
  const args = ['diff', '--name-status', '-M'];
  if (staged) args.push('--cached');
  else if (range) args.push(range);
  else if (base) args.push(base, 'HEAD');
  try {
    return execFileSync('git', args, { cwd: root || process.cwd(), encoding: 'utf8' });
  } catch (error) {
    return '';
  }
}
function parseNameStatus(text) {
  return String(text || '').split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.split('\t');
    const status = parts[0] || '?';
    if (status[0] === 'R' || status[0] === 'C') return { status, old_path: parts[1] || null, new_path: parts[2] || null };
    return { status, path: parts[1] || null };
  });
}
function q(value) { return JSON.stringify(value == null ? '' : String(value)); }
function renderMarkdown(model) {
  const lines = [
    '---',
    `title: ${q(model.packet_id + ' Run Report (visual-refresh evidence draft)')}`,
    'status: "draft"',
    'kind: "run-report"',
    `run_id: ${q(model.run_id)}`,
    `packet_id: ${q(model.packet_id)}`,
    `visual_intent: ${q(VISUAL_REFRESH_INTENT)}`,
    `visual_input_id: ${q(model.visual_refresh.input_id)}`,
    `visual_authorized_path: ${q(model.visual_refresh.authorized_path)}`,
    `visual_packet_source_tree: ${q(model.visual_refresh.packet_source_tree)}`,
    `visual_packet_destination_tree: ${q(model.visual_refresh.packet_destination_tree)}`,
    `visual_backstop_source_tree: ${q(model.visual_refresh.backstop_source_tree)}`,
    `visual_backstop_destination_tree: ${q(model.visual_refresh.backstop_destination_tree)}`,
    `visual_backstop_diff_kind: ${q(model.visual_refresh.backstop_diff_kind)}`,
    `date: ${q(model.date)}`,
    'generated_by: "workflow:report visual-refresh collector"',
    '---',
    '',
    `# Run Report: ${model.target_screen} visual-refresh`,
    '',
    '## Authority Audit',
    `- selected input: \`${model.visual_refresh.input_id}\``,
    `- authorized path: \`${model.visual_refresh.authorized_path}\``,
    `- packet snapshot: \`${model.visual_refresh.packet_source_tree || '—'}\` → \`${model.visual_refresh.packet_destination_tree || '—'}\` (${model.visual_refresh.packet_diff_kind || '—'})`,
    `- backstop snapshot: \`${model.visual_refresh.backstop_source_tree || '—'}\` → \`${model.visual_refresh.backstop_destination_tree || '—'}\` (${model.visual_refresh.backstop_diff_kind || '—'})`,
    '- Packet fields are audit-only. The backstop result below is independently recomputed from the selected Git snapshot.',
    '',
    '## Files Changed',
    ...(model.changed.length ? model.changed.map((entry) => `- \`${entry.path || `${entry.old_path} -> ${entry.new_path}`}\` — ${entry.status}`) : ['- (none observed)']),
    '',
    '## Forbidden Paths Evidence',
    `- status: ${model.forbidden.status}`,
    `- ok: ${model.forbidden.ok == null ? 'unknown' : String(model.forbidden.ok)}`,
    `- invocation exit: ${model.forbidden.exit_code == null ? '—' : model.forbidden.exit_code}`,
    `- violations: ${model.forbidden.violations.length}`,
    ...model.forbidden.violations.map((v) => `  - ${v.code || 'violation'}: ${v.file || '(authority)'} — ${v.reason || ''}`),
    '',
    '## Next Action',
    '- Human review remains required. This report is evidence, not approval.',
  ];
  return lines.join('\n') + '\n';
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h) {
    process.stdout.write('workflow:report visual-refresh — --packet <path> --intent visual-refresh --input <ID> --path <SCREEN_ENTRY> [--staged|--range <A..B>|--base <ref>]\n');
    return;
  }
  const packetFlag = req(flags, 'packet');
  const intent = req(flags, 'intent');
  const input = req(flags, 'input');
  const checkedPath = req(flags, 'path');
  if (intent !== VISUAL_REFRESH_INTENT) fail(`지원하지 않는 --intent: ${intent}`);
  const outFlag = opt(flags, 'out');
  const root = opt(flags, 'root');
  const docs = opt(flags, 'docs');
  const src = opt(flags, 'src');
  const policy = opt(flags, 'policy');
  const manifest = opt(flags, 'manifest');
  const layout = opt(flags, 'layout');
  const ci = opt(flags, 'ci');
  const range = opt(flags, 'range');
  const base = opt(flags, 'base');
  const staged = flags.staged === true;
  const review = opt(flags, 'review');
  const date = opt(flags, 'date') || isoToday();
  const seq = opt(flags, 'seq') || '001';
  const snapshotCount = Number(staged) + Number(Boolean(range)) + Number(Boolean(base));
  if (snapshotCount !== 1) fail('visual-refresh report는 --staged/--range/--base 중 정확히 하나가 필요함');
  if (flags.diff !== undefined) fail('visual-refresh report는 --diff(name-status only)를 지원하지 않음');

  const packetPath = path.resolve(packetFlag);
  const raw = readFileSafe(packetPath);
  if (raw == null) fail(`packet 파일 없음: ${packetFlag}`);
  const parsed = splitFrontmatter(raw);
  if (!parsed.hasFrontmatter || parsed.parseError) fail(`packet frontmatter 파싱 실패: ${packetFlag}`);
  const fm = parsed.data || {};
  if (fm.visual_intent !== VISUAL_REFRESH_INTENT) fail('packet이 visual-refresh audit packet이 아님');
  if (fm.visual_authority_applicable !== true) fail('packet의 visual authority가 applicable:true가 아님');
  if (fm.visual_input_id !== input) fail(`packet visual_input_id mismatch: ${fm.visual_input_id || '—'} != ${input}`);
  if (fm.visual_authorized_path !== checkedPath || fm.visual_checked_path !== checkedPath) {
    fail('packet visual authorized/checked path가 현재 --path와 일치하지 않음');
  }
  if (typeof fm.target_screen !== 'string' || !fm.target_screen) fail('packet target_screen 없음');

  const forbiddenArgs = ['--json', '--screen', fm.target_screen, '--intent', VISUAL_REFRESH_INTENT, '--input', input, '--path', checkedPath];
  if (root) forbiddenArgs.push('--root', root);
  for (const [name, value] of [['docs', docs], ['src', src], ['policy', policy], ['manifest', manifest], ['layout', layout], ['ci', ci]]) {
    if (value) forbiddenArgs.push(`--${name}`, relativeForVisual(value, root));
  }
  if (staged) forbiddenArgs.push('--staged');
  if (range) forbiddenArgs.push('--range', range);
  if (base) forbiddenArgs.push('--base', base);
  const captured = runCapture(FORBIDDEN_SCRIPT, forbiddenArgs, root || process.cwd());
  let forbiddenJson = null;
  try { forbiddenJson = captured.stdout.trim() ? JSON.parse(captured.stdout) : null; } catch {}
  const forbidden = forbiddenJson ? {
    status: forbiddenJson.ok ? 'pass' : 'fail',
    ok: !!forbiddenJson.ok,
    exit_code: captured.code,
    violations: Array.isArray(forbiddenJson.violations) ? forbiddenJson.violations : [],
    diff_context: forbiddenJson.diff_context || {},
  } : {
    status: 'error', ok: null, exit_code: captured.code, violations: [], diff_context: {},
    error: (captured.stderr || 'no JSON output').trim().slice(0, 800),
  };

  const changed = parseNameStatus(collectNameStatus(root, { staged, range, base }));
  const model = {
    run_id: `RR-${fm.target_screen}-${fm.readiness_mode || 'visual'}-${seq}`,
    packet_id: fm.packet_id || '(packet)',
    target_screen: fm.target_screen,
    readiness_mode: fm.readiness_mode || null,
    date,
    review: review || null,
    changed,
    forbidden,
    visual_refresh: {
      input_id: input,
      authorized_path: checkedPath,
      packet_source_tree: fm.visual_source_tree || null,
      packet_destination_tree: fm.visual_destination_tree || null,
      packet_diff_kind: fm.visual_diff_kind || null,
      backstop_source_tree: forbidden.diff_context.source_tree || null,
      backstop_destination_tree: forbidden.diff_context.destination_tree || null,
      backstop_diff_kind: forbidden.diff_context.diff_kind || null,
    },
  };
  const markdown = renderMarkdown(model);
  const outPath = outFlag ? path.resolve(outFlag) : null;
  if (outPath) writeFile(outPath, markdown);
  const envelope = {
    run_id: model.run_id,
    packet_id: model.packet_id,
    target_screen: model.target_screen,
    readiness_mode: model.readiness_mode,
    report_applicable: true,
    out: outPath ? toPosix(path.relative(process.cwd(), outPath)) : null,
    visual_refresh: model.visual_refresh,
    changed_files: changed,
    forbidden,
    note: 'visual-refresh authority re-evaluated by forbidden-paths from the selected Git snapshot; report remains evidence-only',
  };
  if (flags.json) process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
  else if (!outPath) process.stdout.write(markdown);
  else process.stdout.write(`workflow:report: wrote ${envelope.out} (visual forbidden=${forbidden.status}, violations=${forbidden.violations.length}) — evidence bundle\n`);
  process.exitCode = 0;
}

if (isCliEntry(import.meta.url)) main();
