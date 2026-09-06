#!/usr/bin/env node
// workflow:packet — readiness 출력을 소비해 Work Packet 초안(markdown)을 생성하는 봉투(execution envelope).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs, DEFAULTS, KIT_ROOT, readFileSafe, writeFile, yamlParse, runCli, isCliEntry } from './lib/util.mjs';
import {
  buildPacketModel,
  isAbsorbedReadinessEntry,
  renderPacketMarkdown,
  renderJsonEnvelope,
} from './lib/workflow-packet.mjs';
import { loadLayoutProfile } from './lib/layout-profile.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const READINESS_SCRIPT = path.join(SELF_DIR, 'readiness.mjs');
const AMBIGUITY_DOC = path.join(KIT_ROOT, 'docs', 'reference', 'ambiguity-triage.md');
const VISUAL_REFRESH_INTENT = 'visual-refresh';

function fail(msg) {
  process.stderr.write(`workflow:packet: ${msg}\n`);
  process.exit(2);
}
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
function toPosix(p) { return String(p).replace(/\\/g, '/'); }
function isoToday() { return new Date().toISOString().slice(0, 10); }

function pickEntry(data, screen) {
  if (data && typeof data === 'object') {
    const visualEntry = data.visual_refresh_audit?.readiness_entry;
    if (visualEntry && typeof visualEntry === 'object') return visualEntry;
    if (data[screen] && typeof data[screen] === 'object') return data[screen];
    if (typeof data.readiness_mode === 'string') return data;
    if (data.readiness_applicable === false || data.readiness_mode === null) return data;
  }
  return null;
}

function validateEntry(entry, screen) {
  const lifecycleShaped = entry.readiness_applicable === false || entry.screen_lifecycle === 'absorbed' || entry.readiness_mode === null;
  if (lifecycleShaped && !isAbsorbedReadinessEntry(entry)) {
    fail(`readiness entry '${screen}' 의 absorbed sentinel 계약이 불완전함 — readiness_applicable=false, screen_lifecycle=absorbed, readiness_mode=null, absorbed_into(string) 필요`);
  }
  if (typeof entry.readiness_mode !== 'string' || entry.readiness_mode.trim() === '') {
    if (!isAbsorbedReadinessEntry(entry)) fail(`readiness entry '${screen}' 에 readiness_mode(string) 가 없음 — 손상된 readiness 출력`);
  }
  for (const k of ['allowed_paths', 'forbidden_paths', 'blocking', 'next_actions']) {
    if (entry[k] != null && !Array.isArray(entry[k])) fail(`readiness entry '${screen}' 의 ${k} 가 배열이 아님 — 손상된 readiness 출력`);
  }
  if (isAbsorbedReadinessEntry(entry)) {
    for (const k of ['allowed_paths', 'forbidden_paths', 'blocking']) {
      if ((entry[k] || []).length > 0) fail(`readiness entry '${screen}' 의 absorbed ${k} 가 비어 있지 않음 — non-executable 계약 위반`);
    }
    if (entry.absorbed_at != null && typeof entry.absorbed_at !== 'string') fail(`readiness entry '${screen}' 의 absorbed_at 이 문자열이 아님 — 손상된 readiness 출력`);
  }
}

function parseReadinessFile(p) {
  const raw = readFileSafe(p);
  if (raw == null) fail(`readiness 파일 없음: ${toPosix(p)}`);
  const t = raw.trim();
  try { return JSON.parse(t); } catch {}
  try { return yamlParse(t); } catch (e) { fail(`readiness 파일 파싱 실패 (JSON·YAML 둘 다): ${toPosix(p)} — ${e.message}`); }
}

function visualRelative(value, root) {
  if (!value) return undefined;
  if (!path.isAbsolute(value)) return toPosix(value);
  const base = path.resolve(root || process.cwd());
  const rel = path.relative(base, path.resolve(value));
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) fail(`visual-refresh 경로가 --root 밖임: ${value}`);
  return toPosix(rel);
}

function runReadinessSubprocess({ screen, docs, src, policy, manifest, layout, ci, intent, input, checkedPath, root }) {
  let args;
  if (intent) {
    if (intent !== VISUAL_REFRESH_INTENT) fail(`지원하지 않는 --intent: ${intent}`);
    if (!input) fail('visual-refresh packet은 --input <INPUT_ID>가 필요함');
    args = [READINESS_SCRIPT, '--screen', screen, '--intent', intent, '--input', input, '--json'];
    if (checkedPath) args.push('--path', visualRelative(checkedPath, root));
    if (root) args.push('--root', root);
    if (docs) args.push('--docs', visualRelative(docs, root));
    if (src) args.push('--src', visualRelative(src, root));
    if (policy) args.push('--policy', visualRelative(policy, root));
    if (manifest) args.push('--manifest', visualRelative(manifest, root));
    if (layout) args.push('--layout', visualRelative(layout, root));
    if (ci) args.push('--ci', visualRelative(ci, root));
  } else {
    args = [READINESS_SCRIPT, '--docs', docs, '--screen', screen, '--json'];
    if (policy) args.push('--policy', policy);
    if (manifest) args.push('--manifest', manifest);
    if (layout) args.push('--layout', layout);
  }
  let out;
  try { out = execFileSync(process.execPath, args, { encoding: 'utf8' }); }
  catch (e) {
    const code = e && e.status != null ? e.status : '?';
    const err = e && e.stderr ? String(e.stderr).trim().slice(0, 600) : '';
    fail(`readiness 서브프로세스 실패 (exit=${code})${err ? ': ' + err : ''}`);
  }
  try { return JSON.parse(out); } catch (e) { fail(`readiness 서브프로세스 JSON 파싱 실패: ${e.message}`); }
}

function loadOrder(policyPath) {
  const raw = readFileSafe(policyPath);
  if (raw == null) return [];
  try {
    const data = yamlParse(raw);
    return Array.isArray(data && data.order) ? data.order : [];
  } catch (e) { fail(`policy YAML 파싱 실패: ${toPosix(policyPath)} — ${e.message}`); }
}

function q(value) { return JSON.stringify(value == null ? '' : String(value)); }
function visualAudit(data) {
  if (!data?.intent_authorization || data.intent_authorization.intent !== VISUAL_REFRESH_INTENT) return null;
  const auth = data.intent_authorization;
  const audit = data.visual_refresh_audit || {};
  const snapshot = auth.snapshot || {};
  return {
    intent: VISUAL_REFRESH_INTENT,
    authority_applicable: auth.applicable === true,
    input_id: auth.input_id || audit.input_id || null,
    authorized_path: auth.authorized_path || audit.authorized_path || null,
    checked_path: audit.checked_path || auth.checked_path || null,
    source_tree: audit.source_tree || snapshot.source_tree || null,
    destination_tree: audit.destination_tree || snapshot.destination_tree || null,
    diff_kind: audit.diff_kind || snapshot.diff_kind || null,
    reasons: Array.isArray(auth.reasons) ? auth.reasons : [],
  };
}
function injectVisualAuditFrontmatter(markdown, audit) {
  if (!audit) return markdown;
  const lines = [
    `visual_intent: ${q(audit.intent)}`,
    `visual_authority_applicable: ${audit.authority_applicable ? 'true' : 'false'}`,
    `visual_input_id: ${q(audit.input_id)}`,
    `visual_authorized_path: ${q(audit.authorized_path)}`,
    `visual_checked_path: ${q(audit.checked_path)}`,
    `visual_source_tree: ${q(audit.source_tree)}`,
    `visual_destination_tree: ${q(audit.destination_tree)}`,
    `visual_diff_kind: ${q(audit.diff_kind)}`,
  ];
  return markdown.replace(/^---\n/, `---\n${lines.join('\n')}\n`);
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h) {
    process.stdout.write(
      'workflow:packet — readiness 출력을 복사해 Work Packet 초안(markdown)을 만든다.\n' +
      '옵션: --screen <ID> --requested-mode <mode> [--readiness <path>] [--docs <dir>] [--policy <path>] [--manifest <path>] [--out <path>] [--json]\n' +
      'visual: --intent visual-refresh --input <INPUT_ID> --path <SCREEN_ENTRY> [--root <project>] [--src <dir>] [--ci <path>]\n'
    );
    return;
  }
  const screen = requireStringFlag(flags, 'screen');
  const requestedMode = requireStringFlag(flags, 'requested-mode');
  const readinessFlag = optStr(flags, 'readiness');
  const docsFlag = optStr(flags, 'docs');
  const srcFlag = optStr(flags, 'src');
  const policyFlag = optStr(flags, 'policy');
  const manifestFlag = optStr(flags, 'manifest');
  const outFlag = optStr(flags, 'out');
  const domainFlag = optStr(flags, 'domain');
  const layoutFlag = optStr(flags, 'layout');
  const ciFlag = optStr(flags, 'ci');
  const intentFlag = optStr(flags, 'intent');
  const inputFlag = optStr(flags, 'input');
  const pathFlag = optStr(flags, 'path');
  const rootFlag = optStr(flags, 'root');
  const date = optStr(flags, 'date') ?? isoToday();
  const owner = optStr(flags, 'owner') ?? 'workflow:packet';
  const seq = optStr(flags, 'seq') ?? '001';

  if (intentFlag && intentFlag !== VISUAL_REFRESH_INTENT) fail(`지원하지 않는 --intent: ${intentFlag}`);
  if (intentFlag && !inputFlag) fail('visual-refresh packet은 --input <INPUT_ID>가 필요함');
  if ((inputFlag || pathFlag) && !intentFlag) fail('--input/--path는 --intent visual-refresh와 함께 사용해야 함');

  const policyPath = policyFlag ? path.resolve(policyFlag) : DEFAULTS.policy;
  const manifestPath = manifestFlag ? path.resolve(manifestFlag) : DEFAULTS.manifest;
  let data;
  let readinessSource;
  if (readinessFlag) {
    const p = path.resolve(readinessFlag);
    data = parseReadinessFile(p);
    readinessSource = toPosix(path.relative(process.cwd(), p)) || readinessFlag;
  } else if (intentFlag) {
    data = runReadinessSubprocess({
      screen, docs: docsFlag, src: srcFlag, policy: policyFlag, manifest: manifestFlag,
      layout: layoutFlag, ci: ciFlag, intent: intentFlag, input: inputFlag,
      checkedPath: pathFlag, root: rootFlag,
    });
    readinessSource = `readiness.mjs --screen ${screen} --intent ${intentFlag} --input ${inputFlag}${pathFlag ? ` --path ${pathFlag}` : ''}${rootFlag ? ` --root ${rootFlag}` : ''} --json (computed ${date})`;
  } else {
    const docs = docsFlag ? path.resolve(docsFlag) : path.resolve(DEFAULTS.docs);
    const layoutPath = layoutFlag ? path.resolve(layoutFlag) : null;
    data = runReadinessSubprocess({ screen, docs, policy: policyPath, manifest: manifestPath, layout: layoutPath });
    const docsLabel = toPosix(docsFlag || DEFAULTS.docs);
    const layoutLabel = layoutPath ? ` --layout ${toPosix(layoutPath)}` : '';
    readinessSource = `readiness.mjs --docs ${docsLabel} --screen ${screen}${layoutLabel} --json (computed ${date})`;
  }

  const entry = pickEntry(data, screen);
  if (!entry) fail(`screen '${screen}' 을 readiness 출력에서 찾지 못함 (사용 가능: ${Object.keys(data || {}).join(', ') || '없음'})`);
  validateEntry(entry, screen);
  const audit = visualAudit(data);
  const order = loadOrder(policyPath);
  const outPath = outFlag ? path.resolve(outFlag) : null;
  const ambiguityLink = outPath ? toPosix(path.relative(path.dirname(outPath), AMBIGUITY_DOC)) : toPosix(path.relative(process.cwd(), AMBIGUITY_DOC));
  const layout = loadLayoutProfile({ kitRoot: KIT_ROOT, flags });
  const model = buildPacketModel({ entry, screen, requestedMode, domain: domainFlag, readinessSource, order, date, owner, seq, ambiguityLink, layout });
  if (audit && !audit.authority_applicable) {
    model.warnings = [...(model.warnings || []), `visual-refresh authority inapplicable — ${audit.reasons.map((r) => r.code || r.message).join(', ') || 'readiness authority reasons'}`];
  }
  const md = injectVisualAuditFrontmatter(renderPacketMarkdown(model), audit);
  if (outPath) {
    try { writeFile(outPath, md); } catch (e) { fail(`--out 쓰기 실패 "${toPosix(outPath)}": ${e.message}`); }
    model.out = toPosix(path.relative(process.cwd(), outPath));
  }
  if (flags.json) {
    const envelope = renderJsonEnvelope(model);
    if (audit) envelope.visual_refresh = audit;
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
  } else if (!outPath) process.stdout.write(md);
  else {
    const over = model.overCeiling ? ' — ⚠ requested>readiness (경고만, exit 0)' : '';
    const visual = audit ? `, visual=${audit.authority_applicable ? 'applicable' : 'inapplicable'}` : '';
    process.stdout.write(`workflow:packet: wrote ${model.out} (readiness_mode=${model.readiness_mode}, requested=${model.requested_mode}${over}${visual})\n`);
  }
  process.exitCode = 0;
}

if (isCliEntry(import.meta.url)) runCli(main, 'workflow:packet');
