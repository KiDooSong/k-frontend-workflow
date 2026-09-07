#!/usr/bin/env node
// visual-refresh Run Report collector. Packet audit is transport-only; forbidden-paths
// re-evaluates authority from the selected Git snapshot before evidence is recorded.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseArgs, readFileSafe, writeFile, splitFrontmatter, isCliEntry,
} from './lib/util.mjs';
import { enforceCliFlagContract } from './lib/cli-args.mjs';
import { parseFindings } from './lib/workflow-report.mjs';
import { captureWorkflowJson, WORKFLOW_JSON_MAX_BYTES } from './lib/workflow-json-capture.mjs';
import { displayVisualChangedRecord } from './lib/visual-refresh-records.mjs';

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
function outside(root, target) {
  const relative = path.relative(root, target);
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}
function resolveProjectRoot(rootFlag, callerCwd) {
  const candidate = path.resolve(callerCwd, rootFlag || '.');
  try {
    const stat = fs.statSync(candidate);
    if (!stat.isDirectory()) fail(`--root는 directory여야 함: ${rootFlag}`);
    return fs.realpathSync(candidate);
  } catch (error) {
    fail(`--root를 해석할 수 없음: ${rootFlag || '.'} (${error?.code || error?.message || error})`);
  }
}
function relativeForVisual(value, root) {
  if (!value) return undefined;
  const absolute = path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
  if (outside(root, absolute)) fail(`visual authority resource가 --root 밖임: ${value}`);
  return toPosix(path.relative(root, absolute));
}
function loadReview(reviewFlag, callerCwd) {
  if (!reviewFlag) return null;
  // Caller-relative review evidence is advisory, never an authority input.
  const file = path.resolve(callerCwd, reviewFlag);
  const raw = readFileSafe(file);
  if (raw == null) fail(`--review 파일 없음: ${reviewFlag}`);
  const parsed = splitFrontmatter(raw);
  if (parsed.parseError) fail(`--review frontmatter 파싱 실패: ${reviewFlag} — ${parsed.parseError}`);
  let source;
  try {
    source = toPosix(path.relative(fs.realpathSync(callerCwd), fs.realpathSync(file)));
  } catch (error) {
    fail(`--review 경로 해석 실패: ${reviewFlag} — ${error.message}`);
  }
  return { source, frontmatter: parsed.data || {}, findings: parseFindings(parsed.body) };
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
    '---', '',
    `# Run Report: ${model.target_screen} visual-refresh`, '',
    '## Authority Audit',
    `- selected input: \`${model.visual_refresh.input_id}\``,
    `- authorized path: \`${model.visual_refresh.authorized_path}\``,
    `- packet snapshot: \`${model.visual_refresh.packet_source_tree || '—'}\` → \`${model.visual_refresh.packet_destination_tree || '—'}\` (${model.visual_refresh.packet_diff_kind || '—'})`,
    `- backstop snapshot: \`${model.visual_refresh.backstop_source_tree || '—'}\` → \`${model.visual_refresh.backstop_destination_tree || '—'}\` (${model.visual_refresh.backstop_diff_kind || '—'})`,
    '- Packet fields are audit-only. The backstop result below is independently recomputed from the selected Git snapshot.', '',
    '## Files Changed',
    ...(model.forbidden.status === 'error'
      ? ['- unavailable: backstop did not produce snapshot records']
      : model.changed.length ? model.changed.map((entry) =>
        `- \`${entry.path || `${entry.old_path} -> ${entry.new_path}`}\` — ${entry.status}${entry.outside_selected_root ? ' [outside selected root]' : ''}`)
        : ['- (none observed)']), '',
    '## Forbidden Paths Evidence',
    `- status: ${model.forbidden.status}`,
    `- ok: ${model.forbidden.ok == null ? 'unknown' : String(model.forbidden.ok)}`,
    `- invocation exit: ${model.forbidden.exit_code == null ? '—' : model.forbidden.exit_code}`,
    `- violations: ${model.forbidden.violations.length}`,
    ...model.forbidden.violations.map((v) => `  - ${v.code || 'violation'}: ${v.file || '(authority)'} — ${v.reason || ''}`),
    ...(model.forbidden.error ? [`- error: ${model.forbidden.error}`] : []),
    ...(model.forbidden.capture_error ? ['```json', JSON.stringify(model.forbidden.capture_error, null, 2), '```'] : []), '',
    '## Review Evidence (advisory — not authorization)',
    ...(model.review ? ['```json', JSON.stringify(model.review, null, 2), '```'] : ['- not provided (--review)']), '',
    '## Next Action',
    '- Human review remains required. This report is evidence, not approval.',
  ];
  return lines.join('\n') + '\n';
}

function main() {
  const argv = process.argv.slice(2);
  const parsed = parseArgs(argv);
  enforceCliFlagContract({
    argv, flags: parsed.flags, positionals: parsed.positionals,
    valueFlags: new Set([
      'packet', 'intent', 'input', 'path', 'out', 'root', 'docs', 'src', 'policy',
      'manifest', 'layout', 'ci', 'range', 'base', 'review', 'date', 'seq',
    ]),
    booleanFlags: new Set(['h', 'help', 'json', 'staged', 'skip-tests']),
    tool: 'workflow:report', helpCommand: 'npm run workflow:report --',
  });
  const { flags } = parsed;
  if (flags.help || flags.h) {
    process.stdout.write('workflow:report visual-refresh — --packet <path> --intent visual-refresh --input <ID> --path <SCREEN_ENTRY> [--staged|--range <A..B>|--base <ref>] [--review <path> (advisory)]\n');
    return;
  }
  const packetFlag = req(flags, 'packet');
  const intent = req(flags, 'intent');
  const input = req(flags, 'input');
  const checkedPath = req(flags, 'path');
  if (intent !== VISUAL_REFRESH_INTENT) fail(`지원하지 않는 --intent: ${intent}`);
  const outFlag = opt(flags, 'out');
  const rootFlag = opt(flags, 'root');
  const docs = opt(flags, 'docs');
  const src = opt(flags, 'src');
  const policy = opt(flags, 'policy');
  const manifest = opt(flags, 'manifest');
  const layout = opt(flags, 'layout');
  const ci = opt(flags, 'ci');
  const range = opt(flags, 'range');
  const base = opt(flags, 'base');
  const staged = flags.staged === true;
  const reviewFlag = opt(flags, 'review');
  const date = opt(flags, 'date') || isoToday();
  const seq = opt(flags, 'seq') || '001';
  const snapshotCount = Number(staged) + Number(Boolean(range)) + Number(Boolean(base));
  if (snapshotCount !== 1) fail('visual-refresh report는 --staged/--range/--base 중 정확히 하나가 필요함');

  const callerCwd = process.cwd();
  const root = resolveProjectRoot(rootFlag, callerCwd);
  const packetPath = path.resolve(callerCwd, packetFlag);
  const raw = readFileSafe(packetPath);
  if (raw == null) fail(`packet 파일 없음: ${packetFlag}`);
  const parsedPacket = splitFrontmatter(raw);
  if (!parsedPacket.hasFrontmatter || parsedPacket.parseError) fail(`packet frontmatter 파싱 실패: ${packetFlag}`);
  const fm = parsedPacket.data || {};
  if (fm.visual_intent !== VISUAL_REFRESH_INTENT) fail('packet이 visual-refresh audit packet이 아님');
  if (fm.visual_authority_applicable !== true) fail('packet의 visual authority가 applicable:true가 아님');
  if (fm.visual_path_allowed !== true) fail('packet의 concrete visual path가 allowed:true가 아님; 현재 packet을 재발급하세요');
  if (fm.visual_input_id !== input) fail(`packet visual_input_id mismatch: ${fm.visual_input_id || '—'} != ${input}`);
  if (fm.visual_authorized_path !== checkedPath || fm.visual_checked_path !== checkedPath) fail('packet visual authorized/checked path가 현재 --path와 일치하지 않음');
  if (typeof fm.target_screen !== 'string' || !fm.target_screen) fail('packet target_screen 없음');
  if (fm.visual_selected_screen !== fm.target_screen) fail('packet visual selected screen이 target_screen과 일치하지 않음');
  const review = loadReview(reviewFlag, callerCwd);

  const forbiddenArgs = ['--json', '--screen', fm.target_screen, '--intent', VISUAL_REFRESH_INTENT, '--input', input, '--path', checkedPath, '--root', '.'];
  for (const [name, value] of [['docs', docs], ['src', src], ['policy', policy], ['manifest', manifest], ['layout', layout], ['ci', ci]]) {
    if (value) forbiddenArgs.push(`--${name}`, relativeForVisual(value, root));
  }
  if (staged) forbiddenArgs.push('--staged');
  if (range) forbiddenArgs.push('--range', range);
  if (base) forbiddenArgs.push('--base', base);
  const captured = captureWorkflowJson(FORBIDDEN_SCRIPT, forbiddenArgs, { cwd: root });
  const forbiddenJson = captured.json;
  const validResult = captured.code === 0 && typeof forbiddenJson?.ok === 'boolean' &&
    Array.isArray(forbiddenJson.violations) && Array.isArray(forbiddenJson.changed_records) &&
    typeof forbiddenJson.diff_context?.source_tree === 'string' &&
    typeof forbiddenJson.diff_context?.destination_tree === 'string';
  const forbidden = validResult ? {
    status: forbiddenJson.ok ? 'pass' : 'fail', ok: forbiddenJson.ok,
    exit_code: captured.code, violations: forbiddenJson.violations,
    changed_records: forbiddenJson.changed_records, diff_context: forbiddenJson.diff_context,
  } : {
    status: 'error', ok: null, exit_code: captured.code, violations: [], changed_records: [], diff_context: {},
    error: (captured.stderr || 'no valid backstop JSON output').trim().slice(0, 800),
    ...(captured.capture_error ? { capture_error: captured.capture_error } : {}),
  };

  const changed = forbidden.changed_records.map(displayVisualChangedRecord);
  const model = {
    run_id: `RR-${fm.target_screen}-${fm.readiness_mode || 'visual'}-${seq}`,
    packet_id: fm.packet_id || '(packet)', target_screen: fm.target_screen,
    readiness_mode: fm.readiness_mode || null, date, review, changed, forbidden,
    visual_refresh: {
      input_id: input, authorized_path: checkedPath,
      packet_source_tree: fm.visual_source_tree || null,
      packet_destination_tree: fm.visual_destination_tree || null,
      packet_diff_kind: fm.visual_diff_kind || null,
      backstop_source_tree: forbidden.diff_context.source_tree || null,
      backstop_destination_tree: forbidden.diff_context.destination_tree || null,
      backstop_diff_kind: forbidden.diff_context.diff_kind || null,
    },
  };
  const markdown = renderMarkdown(model);
  const outPath = outFlag ? path.resolve(callerCwd, outFlag) : null;
  if (outPath) {
    try { writeFile(outPath, markdown); }
    catch (error) { fail(`--out 쓰기 실패: ${outFlag} — ${error.message}`); }
  }
  const envelope = {
    run_id: model.run_id, packet_id: model.packet_id, target_screen: model.target_screen,
    readiness_mode: model.readiness_mode, report_applicable: true,
    out: outPath ? toPosix(path.relative(callerCwd, outPath)) : null,
    visual_refresh: model.visual_refresh, changed_files: changed, forbidden,
    json_transport_limit_bytes: WORKFLOW_JSON_MAX_BYTES,
    review_evidence: review, review_summary: review?.frontmatter?.review_summary || null,
    note: forbidden.status === 'error'
      ? 'visual-refresh backstop could not be evaluated; tool error evidence, not authorization'
      : 'visual-refresh authority re-evaluated by forbidden-paths from the selected Git snapshot; report remains evidence-only',
  };
  if (flags.json) process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
  else if (!outPath) process.stdout.write(markdown);
  else process.stdout.write(`workflow:report: wrote ${envelope.out} (visual forbidden=${forbidden.status}, violations=${forbidden.violations.length}) — evidence bundle\n`);
  process.exitCode = 0;
}

if (isCliEntry(import.meta.url)) main();
