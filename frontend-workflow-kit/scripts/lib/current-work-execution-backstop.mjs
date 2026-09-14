import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseNameStatusZ, readinessPathAuthorization } from './path-backstop.mjs';
import { readJson, normalizeWorkRequest, digest, hashBytes, ownerParts, byteCompare } from './current-work-request.mjs';
import { runVisualGit, decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import {
  CurrentWorkExecutionError, REGULAR_MODES, AUTHORITY_BASENAMES, posix, stable, generatedOwner,
  screenDomain, effectiveOrder, exactSurfaceAuthorization,
} from './current-work-execution-core.mjs';

function actualGitRecords(context, { staged = false } = {}) {
  const args = ['diff'];
  if (staged) args.push('--cached');
  args.push('--no-ext-diff', '--no-textconv', '--ignore-submodules=none', '--name-status', '-M', '-z', 'HEAD');
  const tracked = parseNameStatusZ(decodeGitUtf8(runVisualGit(args, context.repositoryRoot), 'current worktree diff'));
  if (staged) return tracked;
  const untrackedRaw = decodeGitUtf8(
    runVisualGit(['ls-files', '--others', '--exclude-standard', '-z'], context.repositoryRoot),
    'current untracked paths',
  );
  const untracked = untrackedRaw.split('\0').filter(Boolean).map((repositoryPath) => ({ status: 'A', path: repositoryPath, raw: 'A', untracked: true }));
  const keyed = new Map();
  for (const record of [...tracked, ...untracked]) keyed.set(recordKey(record), record);
  return [...keyed.values()].sort((a, b) => byteCompare(recordKey(a), recordKey(b)));
}
function recordKey(record) {
  return record.status === 'R' || record.status === 'C'
    ? `${record.status}:${record.oldPath}->${record.newPath}` : `${record.status}:${record.path}`;
}
function projectRecord(record, prefix) {
  const strip = (p) => {
    if (!prefix) return p;
    if (p === prefix) return '';
    return p.startsWith(`${prefix}/`) ? p.slice(prefix.length + 1) : null;
  };
  if (record.status === 'R' || record.status === 'C') {
    return { ...record, oldProjectPath: strip(record.oldPath), newProjectPath: strip(record.newPath) };
  }
  return { ...record, projectPath: strip(record.path) };
}
function requestedTargetMap(preflight) {
  const map = new Map();
  for (const request of preflight.requests) {
    for (const target of request.targets) {
      if (!map.has(target.path)) map.set(target.path, []);
      map.get(target.path).push({ owner: request.owner, ...target });
    }
  }
  return map;
}
function currentFileEvidence(projectRoot, relative) {
  const absolute = path.join(projectRoot, ...relative.split('/'));
  try {
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile()) return { kind: stat.isSymbolicLink() ? 'symlink' : 'non-file', mode: stat.mode & 0o777, hash: null };
    const raw = fs.readFileSync(absolute);
    return { kind: 'file', mode: stat.mode & 0o777, hash: `sha256:${createHash('sha256').update(raw).digest('hex')}` };
  } catch (error) {
    if (error.code === 'ENOENT') return { kind: 'missing', mode: null, hash: null };
    return { kind: 'error', mode: null, hash: null, error: error.message };
  }
}
function authorityPaths(preflight) {
  const paths = new Set(preflight.snapshot.resources.map((r) => r.path));
  for (const origin of preflight.origin_inputs) paths.add(origin.path);
  const docs = preflight.snapshot.resources.find((r) => r.kind === 'docs')?.path;
  if (docs) {
    paths.add(`${docs}/_meta/reconciliation-register.md`);
    paths.add(`${docs}/_meta/workflow-state.yaml`);
  }
  if (preflight.snapshot.work_request.path) paths.add(preflight.snapshot.work_request.path);
  return paths;
}
function authorizationFor(preflight, expected) {
  return preflight.requests.find((r) => r.owner === expected.owner)?.path_authorizations.find((p) => p.path === expected.path);
}

function baselineAuthorization(preflight, owner, file) {
  const context = preflight._context;
  const parts = ownerParts(owner);
  const entry = preflight.requests.find((request) => request.owner === owner)?.legacy_readiness;
  if (!entry) return { allowed: false, reason: 'owner readiness missing from baseline' };
  const generatedEntry = generatedOwner(file, context.generated || []);
  if (generatedEntry) return { allowed: false, reason: `generated/do-not-edit ownership is final (${generatedEntry.artifact_id})`, generated_owner: generatedEntry };
  const domain = screenDomain(context.state, parts);
  const order = effectiveOrder(context.policy, context.layout, domain);
  try {
    return parts.kind === 'screen'
      ? readinessPathAuthorization({ file, screenId: parts.id, entry, modeOrder: order, claims: context.claims })
      : exactSurfaceAuthorization(entry, file, parts.id, order);
  } catch (error) {
    return { allowed: false, reason: error.message };
  }
}
function gitModeOfEvidence(evidence) {
  if (!evidence || evidence.kind !== 'file') return null;
  return (evidence.mode & 0o111) ? '100755' : '100644';
}

export function evaluateCurrentGit(preflight, { staged = false } = {}) {
  const context = preflight._context;
  try {
    const current = readJson(context.workPath, 'work request');
    const normalized = normalizeWorkRequest(current.value);
    if (digest(normalized) !== preflight.request_digest || hashBytes(current.raw) !== preflight.snapshot.work_request.hash) {
      throw new CurrentWorkExecutionError('work request changed after preflight; retry from a stable request');
    }
  } catch (error) {
    if (error instanceof CurrentWorkExecutionError) throw error;
    throw new CurrentWorkExecutionError(`work request recheck failed: ${error.message}`);
  }

  const rawRecords = actualGitRecords(context, { staged });
  const records = rawRecords.map((record) => projectRecord(record, context.projectPrefix));
  const targets = requestedTargetMap(preflight);
  const authority = authorityPaths(preflight);
  const violations = [];
  const observed = [];

  for (const record of records) {
    const writePath = record.status === 'R' || record.status === 'C' ? record.newProjectPath : record.projectPath;
    const oldPath = record.status === 'R' || record.status === 'C' ? record.oldProjectPath : null;
    const relevant = writePath !== null || oldPath !== null;
    observed.push({ ...record, ...(writePath ? { evidence: currentFileEvidence(context.projectRoot, writePath) } : {}) });
    if (!relevant) {
      violations.push({ code: 'CW-GIT-OUTSIDE-ROOT', record: recordKey(record), message: 'changed path is outside selected project root' });
      continue;
    }
    for (const changed of [writePath, oldPath].filter(Boolean)) {
      if (authority.has(changed) || AUTHORITY_BASENAMES.has(path.posix.basename(changed))) {
        violations.push({ code: 'CW-GIT-AUTHORITY-CHANGED', path: changed, message: 'authority/request/origin resource changed after baseline; it cannot self-grant this run' });
      }
    }

    const actualPath = record.status === 'R' || record.status === 'C' ? record.newProjectPath : record.projectPath;
    const expectedList = actualPath == null ? [] : (targets.get(actualPath) || []);
    if (record.status === 'R' || record.status === 'C') {
      if (record.oldProjectPath === null || record.newProjectPath === null) {
        violations.push({ code: 'CW-GIT-CROSS-ROOT', record: recordKey(record), message: 'rename/copy crosses selected project root' });
      }
    }
    if (!expectedList.length) {
      violations.push({ code: 'CW-GIT-UNREQUESTED', path: actualPath, actual_change: record.status, message: 'changed path was not requested' });
    } else {
      for (const expected of expectedList) {
        if (expected.change !== record.status) {
          violations.push({ code: 'CW-GIT-UNREQUESTED', path: actualPath, owner: expected.owner, actual_change: record.status, expected_change: expected.change, message: 'actual change kind differs from request' });
        }
        const initial = authorizationFor(preflight, expected);
        const current = baselineAuthorization(preflight, expected.owner, actualPath);
        if (!initial?.allowed || !current.allowed) {
          violations.push({ code: 'CW-GIT-DENIED-TARGET', path: expected.path, owner: expected.owner, message: current.reason || 'changed target was not authorized in baseline current readiness' });
        }
        if ((record.status === 'R' || record.status === 'C') && record.oldProjectPath) {
          const oldAuthorization = baselineAuthorization(preflight, expected.owner, record.oldProjectPath);
          if (!oldAuthorization.allowed) {
            violations.push({ code: 'CW-GIT-OLD-PATH-DENIED', path: record.oldProjectPath, owner: expected.owner, message: oldAuthorization.reason || 'rename/copy source is not authorized for the same owner' });
          }
        }
      }
    }
    const evidence = writePath ? currentFileEvidence(context.projectRoot, writePath) : null;
    if (evidence && !['file', 'missing'].includes(evidence.kind)) {
      violations.push({ code: 'CW-GIT-TYPE', path: writePath, kind: evidence.kind, message: 'changed target must remain a regular file or an intentional deletion' });
    }
    if (writePath && record.status === 'M' && evidence?.kind === 'file') {
      const baselineEntry = context.snapshot.entry(writePath);
      const currentMode = gitModeOfEvidence(evidence);
      if (baselineEntry?.type === 'blob' && REGULAR_MODES.has(baselineEntry.mode) && currentMode !== baselineEntry.mode) {
        violations.push({ code: 'CW-GIT-MODE', path: writePath, before_mode: baselineEntry.mode, after_mode: currentMode, message: 'executable/file mode changed under an M request; mode changes require explicit review' });
      }
    }
  }

  for (const [target, expectedList] of targets) {
    for (const expected of expectedList) {
      const found = records.some((record) => {
        const actualPath = record.status === 'R' || record.status === 'C' ? record.newProjectPath : record.projectPath;
        return actualPath === target && record.status === expected.change;
      });
      if (!found) violations.push({ code: 'CW-GIT-MISSING-REQUESTED', path: target, expected_change: expected.change, owner: expected.owner, message: 'requested change is not present in the actual Git diff' });
    }
  }
  return {
    snapshot: {
      source_commit: preflight.snapshot.commit,
      source_tree: preflight.snapshot.tree,
      destination: staged ? 'index' : 'worktree',
      diff_kind: staged ? 'HEAD..index' : 'HEAD..worktree',
    },
    changed_records: observed,
    violations,
    ok: violations.length === 0 && preflight.ready,
  };
}

export function publicCurrentEnvelope(preflight) {
  const { _context, ...publicValue } = preflight;
  return stable(publicValue);
}
export function currentPacketEnvelope(preflight) {
  const value = publicCurrentEnvelope(preflight);
  return { ...value, packet_type: 'current-work', packet_status: preflight.all_absorbed ? 'not-applicable' : preflight.ready ? 'ready-for-work' : 'ambiguity' };
}
export function renderCurrentPacketMarkdown(preflight) {
  const env = currentPacketEnvelope(preflight);
  return [
    '---', 'kind: current-work-packet', 'work_contract: 1',
    `request_digest: ${JSON.stringify(env.request_digest)}`,
    `baseline_commit: ${JSON.stringify(env.snapshot.commit)}`,
    `baseline_tree: ${JSON.stringify(env.snapshot.tree)}`,
    '---', '', '# Current Work Packet', '',
    `- authority: \`${env.authority}\``, `- ready: \`${env.ready}\``, `- packet_status: \`${env.packet_status}\``,
    `- requests: ${env.requests.length} · origins: ${env.origin_inputs.length} · denials: ${env.denials.length} · errors: ${env.errors.length}`,
    '', '## Machine Envelope', '```json', JSON.stringify(env, null, 2), '```', '',
    '> This packet records baseline eligibility. It is not a stored allow decision; report/backstop re-evaluate the same request against the immutable baseline.', ''
  ].join('\n');
}
export function parseCurrentPacket(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const match = /## Machine Envelope\s*\n```json\s*\n([\s\S]*?)\n```/.exec(raw);
  if (!match) throw new CurrentWorkExecutionError('packet: current Machine Envelope not found');
  let value;
  try { value = JSON.parse(match[1]); }
  catch (error) { throw new CurrentWorkExecutionError(`packet: invalid current Machine Envelope JSON (${error.message})`); }
  if (value.work_contract !== 1 || value.packet_type !== 'current-work') throw new CurrentWorkExecutionError('packet: unsupported current work contract');
  return value;
}
export function assertPacketMatches(preflight, packet) {
  if (packet.request_digest !== preflight.request_digest) throw new CurrentWorkExecutionError('packet: request digest changed since packet creation');
  if (packet.snapshot?.commit !== preflight.snapshot.commit || packet.snapshot?.tree !== preflight.snapshot.tree) {
    throw new CurrentWorkExecutionError('packet: Git baseline changed since packet creation');
  }
  if (packet.snapshot?.work_request?.hash !== preflight.snapshot.work_request.hash) {
    throw new CurrentWorkExecutionError('packet: work request bytes changed since packet creation');
  }
  const a = JSON.stringify(packet.origin_inputs || []);
  const b = JSON.stringify(publicCurrentEnvelope(preflight).origin_inputs || []);
  if (a !== b) throw new CurrentWorkExecutionError('packet: origin identity/hash changed since packet creation');
}
export function renderCurrentReportMarkdown(preflight, gitResult) {
  const env = currentReportEnvelope(preflight, gitResult);
  return [
    '---', 'kind: current-work-run-report', 'work_contract: 1', `request_digest: ${JSON.stringify(env.request_digest)}`, '---', '',
    '# Current Work Run Report', '', `- baseline ready: \`${preflight.ready}\``, `- backstop ok: \`${gitResult.ok}\``,
    `- changed records: ${gitResult.changed_records.length} · violations: ${gitResult.violations.length}`,
    '', '## Machine Envelope', '```json', JSON.stringify(env, null, 2), '```', '',
    '> Report/backstop evidence is review input. Creating a report is not product approval or merge approval.', ''
  ].join('\n');
}
export function currentReportEnvelope(preflight, gitResult) {
  return stable({
    work_contract: 1,
    report_type: 'current-work',
    request_digest: preflight.request_digest,
    snapshot: preflight.snapshot,
    origin_inputs: publicCurrentEnvelope(preflight).origin_inputs,
    requests: publicCurrentEnvelope(preflight).requests,
    ready: preflight.ready,
    backstop: gitResult,
    required_reviews: preflight.required_reviews,
  });
}
