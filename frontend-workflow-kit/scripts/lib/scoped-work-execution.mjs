// D30: scoped work preflight on the immutable baseline. Every scoped request is
// composed (owner, hosts, shared targets) against the materialized HEAD tree only;
// worktree bytes, caller packets and serialized verdicts are never authority.
// Current requests stay with C. This is eligibility, not the Git backstop or approval.
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { splitFrontmatter, walkFiles } from './util.mjs';
import { computeReadiness } from '../readiness-legacy.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { collectInputArtifacts, validateInputArtifacts } from './input-artifact.mjs';
import { buildInputArtifactIndex, resolveInputArtifact, resolveInputEvidence } from './provenance.mjs';
import { parseReconciliationRegister } from './reconciliation-register.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { validateCurrentReconciliation } from './current-work-reconciliation.mjs';
import { digest, hashBytes, byteCompare, ownerParts, readCurrentBytes, readJson } from './current-work-request.mjs';
import { materializeRawGitTree } from './visual-refresh-git-objects.mjs';
import { currentAuthorityReadSet, captureCurrentWorktree, verifyCurrentAuthority } from './current-work-integrity.mjs';
import { captureCurrentIndex, snapshotRecords } from './current-work-snapshot.mjs';
import { recordKey, projectRecord, isExecutionInput } from './current-work-execution-backstop.mjs';
import {
  CurrentWorkExecutionError, REGULAR_MODES, AUTHORITY_BASENAMES, outside, projectRelative, resolveProjectRoot, gitIdentity, yamlFile,
  invalidBlocker, selectedInputErrors, artifactProjectPath, inputHash, stable,
} from './current-work-execution-core.mjs';
import { readWorkRequestFile, resolveWorkResources, workResourceRecords } from './current-work-execution-preflight.mjs';
import { normalizeScopedWorkRequestSyntax } from './scoped-work-request.mjs';
import { inspectScopedWorkRequests } from './scoped-work-composition.mjs';

const fail = (message) => { throw new CurrentWorkExecutionError(message, 'SW-INPUT'); };

// A request document is scoped only when every request selects scoped authority.
// Mixed current/scoped documents are not split implicitly; submit them separately.
export function isScopedWorkDocument(value) {
  const requests = Array.isArray(value?.requests) ? value.requests : [];
  const scoped = requests.filter((entry) => entry?.authority === 'scoped').length;
  if (scoped && scoped !== requests.length) fail('mixed current/scoped work documents are not supported; submit separate work requests');
  return scoped > 0;
}

// The same Markdown domain as C/validate: every docs Markdown file except _meta,
// strictly UTF-8 decoded. Non-artifact files are pinned too: their frontmatter
// decides index membership.
function baselineArtifactIndex(docsRoot) {
  const files = walkFiles(docsRoot, ['.md']).filter((file) => !path.relative(docsRoot, file).split(path.sep).includes('_meta')).sort(byteCompare);
  const docs = [];
  for (const file of files) {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readCurrentBytes(file, 'scoped canonical Markdown')); }
    catch (error) { fail(`non-UTF-8 or unreadable canonical Markdown: ${error.message}`); }
    const { data, hasFrontmatter, parseError } = splitFrontmatter(text);
    if (parseError) fail(`artifact frontmatter: ${parseError}`);
    if (hasFrontmatter && data?.artifact_type) docs.push({ file, fm: data });
  }
  return { files, targetIndex: buildReconciliationTargetIndex({ docs }) };
}

function evidenceSummary(result) {
  const profile = result.owner_result.profile, decisions = result.owner_result.decision_scopes;
  return stable({
    contracts: profile.confirmed_contracts,
    visual_evidence: (profile.visual_evidence || []).map((record) => record.ref).sort(byteCompare),
    coverage: (profile.coverage?.sources || []).map((source) => ({ input_id: source.selection.input_id,
      accepted_for_source: source.accepted_for_source, receipt_state: source.receipt_state })),
    decisions: decisions.checks.map((check) => ({ decision: check.decision, status: check.status,
      scope_source: check.scope_source, blocking_units: check.blocking_units })),
    hosts: (result.host_result?.hosts || []).map((host) => ({ owner: host.owner, unit: host.unit, adopted: host.adopted,
      host_satisfied: host.host_satisfied, consent: host.consent })),
  });
}

export function prepareScopedWork({ work, root, docs, src, policy, manifest, layout, ci } = {}) {
  const ctx = resolveProjectRoot(root);
  const { workPath, physicalWorkPath, parsed } = readWorkRequestFile(ctx, work);
  if (!isScopedWorkDocument(parsed.value)) fail('scoped preflight requires scoped requests');
  let request;
  try { request = normalizeScopedWorkRequestSyntax(parsed.value); }
  catch (error) { fail(error.message); }
  const requestDigest = digest(request);
  const identity = gitIdentity(ctx.repositoryRoot);
  const snapshot = materializeRawGitTree({ repositoryRoot: ctx.repositoryRoot, projectPrefix: ctx.projectPrefix, tree: identity.tree });
  try {
    const projectRoot = ctx.projectRoot, baselineRoot = snapshot.root;
    const { resources, baselineKitRoot } = resolveWorkResources(ctx, baselineRoot, { docs, src, policy, manifest, layout, ci });
    const resourceRecords = workResourceRecords(resources, snapshot);
    const docsRoot = resources.docs.baseline;
    const registerFile = path.join(docsRoot, '_meta', 'reconciliation-register.md');
    const state = yamlFile(path.join(docsRoot, '_meta', 'workflow-state.yaml'), 'workflow-state', { maxAliasCount: 10000 });
    const policyData = yamlFile(resources.policy.baseline, 'policy');
    const manifestData = yamlFile(resources.manifest.baseline, 'manifest');
    const ciData = resources.ci ? yamlFile(resources.ci.baseline, 'CI') : {};
    const layoutData = loadLayoutProfile({ kitRoot: baselineKitRoot, flags: { layout: resources.layout.baseline } });
    const inputArtifacts = collectInputArtifacts(path.join(docsRoot, 'inputs'));
    const inputValidation = validateInputArtifacts(inputArtifacts);
    const inputIndex = buildInputArtifactIndex(inputArtifacts);
    const register = parseReconciliationRegister(registerFile);
    // Canonical register validation stays a hard input gate, as in C.
    const reconciliation = validateCurrentReconciliation({ register, registerFile, inputArtifacts, docsRoot, baselineRoot });
    const index = baselineArtifactIndex(docsRoot);

    // Legacy readiness is preserved as-is and informs; the scoped predicate replaces
    // only the cumulative phase. Invalid/structural legacy markers remain errors.
    const errors = [], future = [], legacyReadiness = {};
    let absorbed = 0;
    for (const selected of request.requests) {
      const parts = ownerParts(selected.owner);
      const entry = computeReadiness({ state, policy: policyData, ci: ciData, manifest: manifestData, layout: layoutData, exposeCaps: true,
        ...(parts.kind === 'screen' ? { screenOnlyId: parts.id } : { surfaceOnlyId: parts.id }) })?.[parts.id] || null;
      legacyReadiness[selected.owner] = entry;
      if (!entry) { errors.push({ code: 'SW-LEGACY-STATE-001', owner: selected.owner, message: 'owner is missing from the generated legacy state; regenerate workflow:state' }); continue; }
      if (entry.readiness_applicable === false || entry.screen_lifecycle === 'absorbed') absorbed += 1;
      for (const blocker of entry.blocking || []) {
        if (invalidBlocker(blocker)) errors.push({ code: 'SW-AUTHORITY-INVALID', owner: selected.owner, blocker });
        else future.push({ owner: selected.owner, blocker });
      }
    }

    const originInputs = request.origin_inputs.map((origin) => {
      const resolution = resolveInputArtifact(inputIndex, origin.input_id);
      if (resolution.status !== 'ok') fail(`origin ${origin.input_id}: ${resolution.status} canonical input`);
      const validationErrors = selectedInputErrors(inputValidation, resolution);
      if (validationErrors.length) fail(`origin ${origin.input_id}: invalid canonical input (${validationErrors[0].message})`);
      const rows = (register.rows || []).filter((row) => row.inputId === origin.input_id);
      if (rows.length > 1) fail(`origin ${origin.input_id}: duplicate reconciliation rows`);
      const sourceEvidence = origin.source_refs.map((ref) => {
        const evidence = resolveInputEvidence(inputIndex, ref);
        if (evidence.status !== 'ok') fail(`origin ${origin.input_id}: unresolved source ref ${ref} (${evidence.status})`);
        return { ref, evidence_text: evidence.evidenceText || null };
      });
      // Relation, partial coverage and routing receipts are judged per unit by D.
      return { input_id: origin.input_id, source_refs: origin.source_refs, source_evidence: sourceEvidence,
        path: artifactProjectPath(baselineRoot, resolution.artifact), raw_hash: inputHash(resolution.artifact),
        reconcile_status: rows[0]?.reconcileStatus || null, reconcile_result: rows[0]?.result || null };
    });

    const composition = inspectScopedWorkRequests({
      request: parsed.value, projectRoot: baselineRoot, docsDir: docsRoot, kitRoot: baselineKitRoot,
      policyFile: resources.policy.baseline, layoutFile: resources.layout.baseline, manifestFile: resources.manifest.baseline,
      registerFile, ...(resources.ci ? { ciFile: resources.ci.baseline } : {}),
      targetIndex: index.targetIndex, inputArtifacts,
    });

    // The authority read set joins C's resources/inventories with every file the
    // scoped evaluation actually read. The backstop requires them unchanged.
    const authority = currentAuthorityReadSet({ resources, inputArtifacts, artifactFiles: index.files, baselineRoot,
      baselineKitRoot, layoutData, snapshot });
    const known = new Map(authority.filter((entry) => entry.source === 'project').map((entry) => [entry.path, entry]));
    for (const entry of composition.read_set) {
      const git = snapshot.entry(entry.file);
      if (!git || git.type !== 'blob' || !REGULAR_MODES.has(git.mode)) fail(`scoped authority must be a regular baseline blob: ${entry.file}`);
      if (known.has(entry.file)) {
        if (known.get(entry.file).hash !== entry.sha256) fail(`scoped authority differs from its baseline bytes: ${entry.file}`);
        continue;
      }
      const record = { source: 'project', path: entry.file, kind: 'file', git_mode: git.mode, hash: entry.sha256 };
      known.set(entry.file, record); authority.push(record);
    }
    authority.sort((a, b) => byteCompare(`${a.source}:${a.path}`, `${b.source}:${b.path}`));

    const requests = composition.requests.map((result) => ({
      owner: result.owner, authority: 'scoped', unit: result.unit, kind: result.kind,
      coverage_reports: result.coverage_reports, targets: result.targets, path_authorizations: result.path_authorizations,
      prerequisite_denials: result.prerequisite_denials, owner_satisfied: result.owner_satisfied,
      hosts_satisfied: result.hosts_satisfied, ready: result.ready && !errors.some((error) => error.owner === result.owner),
      evidence: evidenceSummary(result), readiness_mode: legacyReadiness[result.owner]?.readiness_mode ?? null,
    }));
    const baseline = {
      commit: identity.commit, tree: identity.tree, project_prefix: ctx.projectPrefix || '',
      resources: resourceRecords, authority_read_set: authority,
      scoped_directory_read_set: composition.directory_read_set, target_read_set: composition.target_read_set,
      work_request: { hash: hashBytes(parsed.raw),
        path: outside(projectRoot, physicalWorkPath) ? null : projectRelative(projectRoot, physicalWorkPath, 'work request') },
    };
    const ready = requests.length > 0 && composition.ready && requests.every((entry) => entry.ready) && errors.length === 0;
    return {
      work_contract: 1, authority: 'scoped', snapshot: baseline, request_digest: requestDigest,
      origin_inputs: originInputs, requests, shared_targets: composition.shared_targets, ready, errors,
      denials: composition.denials, future_requirements: future, reconciliation_warnings: reconciliation.warnings,
      required_reviews: composition.required_reviews, legacy_readiness: legacyReadiness,
      all_absorbed: absorbed === requests.length && requests.length > 0,
      approval_verified: false, semantic_coverage_verified: false,
      _context: { ...ctx, workPath, baselineRoot, request, snapshot, composition, resources },
    };
  } catch (error) {
    snapshot.cleanup();
    throw error;
  }
}

export function cleanupScopedWork(preflight) { preflight?._context?.snapshot?.cleanup?.(); }
export function publicScopedEnvelope(preflight) {
  const { _context, ...publicValue } = preflight;
  return stable(publicValue);
}

// D31: the actual Git backstop for a scoped preflight. The same baseline authority
// is required byte-for-byte in the destination (no self-grant), so the preflight's
// path decisions still hold for it; the actual diff must then be exactly the
// allowed, requested regular-file A/M targets. Everything else is a violation.
export function evaluateScopedGit(preflight, { staged = false } = {}) {
  const context = preflight._context;
  try {
    const current = readJson(context.workPath, 'work request');
    if (!isScopedWorkDocument(current.value) || digest(normalizeScopedWorkRequestSyntax(current.value)) !== preflight.request_digest ||
        hashBytes(current.raw) !== preflight.snapshot.work_request.hash) {
      throw new CurrentWorkExecutionError('work request changed after preflight; retry from a stable request');
    }
  } catch (error) {
    if (error instanceof CurrentWorkExecutionError) throw error;
    throw new CurrentWorkExecutionError(`work request recheck failed: ${error.message}`);
  }
  const repositoryPath = (name) => context.projectPrefix ? `${context.projectPrefix}/${name}` : name;
  const docs = preflight.snapshot.resources.find((entry) => entry.kind === 'docs').path;
  const authorityRecords = preflight.snapshot.authority_read_set;
  const destination = staged ? captureCurrentIndex(context.repositoryRoot) : captureCurrentWorktree(context.repositoryRoot, preflight.snapshot.tree, {
    extraFiles: authorityRecords.filter((entry) => entry.source === 'project').map((entry) => repositoryPath(entry.path)),
    inputRoots: [repositoryPath(`${docs}/inputs`)],
    artifactRoots: authorityRecords.filter((entry) => entry.source === 'artifact-index').map((entry) => repositoryPath(entry.path)),
  });
  const evidenceFor = (relative) => destination.evidence(repositoryPath(relative));
  const authorityChecks = verifyCurrentAuthority(preflight, destination);
  const violations = authorityChecks.filter((check) => !check.ok).map((check) => ({
    code: 'SW-GIT-AUTHORITY-CHANGED', path: check.path, source: check.source,
    message: 'consumed authority bytes/mode or input/document inventory changed in destination; start a new authoring checkpoint',
  }));
  // API evidence directory membership is authority too: a new sibling can change
  // what an unset/directory evidence source selects.
  for (const entry of preflight.snapshot.scoped_directory_read_set) {
    const prefix = `${repositoryPath(entry.file)}/`, children = new Map();
    for (const [name, value] of destination.entries) {
      if (!name.startsWith(prefix)) continue;
      const [child, ...deeper] = name.slice(prefix.length).split('/');
      const kind = deeper.length ? 'directory' : REGULAR_MODES.has(value.mode) ? 'file' : 'unsupported';
      children.set(child, children.has(child) && children.get(child) !== kind ? 'unsupported' : kind);
    }
    const actual = children.size ? [...children].sort(([a], [b]) => byteCompare(a, b)) : null;
    if (JSON.stringify(actual) !== JSON.stringify(entry.entries)) {
      violations.push({ code: 'SW-GIT-EVIDENCE-DIRECTORY-CHANGED', path: entry.file,
        message: 'API evidence directory membership changed after the baseline; start a new authoring checkpoint' });
    }
  }
  const records = snapshotRecords(context.repositoryRoot, preflight.snapshot.tree, destination.tree, { copyPaths: [] })
    .map((record) => projectRecord(record, context.projectPrefix));
  const authority = new Set(authorityRecords.filter((entry) => entry.source === 'project').map((entry) => entry.path));
  for (const origin of preflight.origin_inputs) authority.add(origin.path);
  if (preflight.snapshot.work_request.path) authority.add(preflight.snapshot.work_request.path);
  const expected = new Map();
  for (const request of preflight.requests) for (const target of request.targets) {
    const decision = request.path_authorizations.find((entry) => entry.path === target.path);
    if (!expected.has(target.path)) expected.set(target.path, []);
    expected.get(target.path).push({ owner: request.owner, unit: request.unit, change: target.change,
      allowed: request.ready && decision?.allowed === true });
  }
  const observed = [];
  for (const record of records) {
    const renamed = record.status === 'R' || record.status === 'C';
    const writePath = renamed ? record.newProjectPath : record.projectPath;
    const oldPath = renamed ? record.oldProjectPath : null;
    const captured = { ...record, ...(writePath ? { evidence: evidenceFor(writePath) } : {}) };
    if (isExecutionInput(record, preflight, captured.evidence)) { observed.push({ ...captured, classification: 'execution-input' }); continue; }
    observed.push(captured);
    if (writePath === null && oldPath === null) {
      violations.push({ code: 'SW-GIT-OUTSIDE-ROOT', record: recordKey(record), message: 'changed path is outside the selected project root' });
      continue;
    }
    for (const changed of [writePath, oldPath].filter(Boolean)) {
      if (authority.has(changed) || AUTHORITY_BASENAMES.has(path.posix.basename(changed))) {
        violations.push({ code: 'SW-GIT-AUTHORITY-CHANGED', path: changed, message: 'authority/request/origin resource changed after baseline; it cannot self-grant this run' });
      }
    }
    // B §8.3: the initial scoped version supports regular-file A and M only.
    if (!['A', 'M'].includes(record.status)) {
      violations.push({ code: 'SW-GIT-UNSUPPORTED-CHANGE', record: recordKey(record), actual_change: record.status,
        message: 'scoped work supports regular-file add/modify only; delete/rename/copy/type changes need separate work' });
      continue;
    }
    const list = expected.get(writePath) || [];
    if (!list.length) violations.push({ code: 'SW-GIT-UNREQUESTED', path: writePath, actual_change: record.status, message: 'changed path was not requested' });
    for (const item of list) {
      if (item.change !== record.status) {
        violations.push({ code: 'SW-GIT-UNREQUESTED', path: writePath, owner: item.owner, unit: item.unit,
          actual_change: record.status, expected_change: item.change, message: 'actual change kind differs from request' });
      }
      if (!item.allowed) {
        violations.push({ code: 'SW-GIT-DENIED-TARGET', path: writePath, owner: item.owner, unit: item.unit,
          message: 'changed target was not allowed by the scoped baseline preflight' });
      }
    }
    const evidence = captured.evidence;
    if (evidence?.kind !== 'file') {
      violations.push({ code: 'SW-GIT-TYPE', path: writePath, kind: evidence?.kind ?? null, message: 'scoped targets must remain regular files' });
    } else if (record.status === 'M') {
      const baselineEntry = context.snapshot.entry(writePath);
      if (baselineEntry?.type === 'blob' && REGULAR_MODES.has(baselineEntry.mode) && evidence.git_mode !== baselineEntry.mode) {
        violations.push({ code: 'SW-GIT-MODE', path: writePath, before_mode: baselineEntry.mode, after_mode: evidence.git_mode,
          message: 'file mode changes are not supported by scoped work' });
      }
    }
  }
  for (const [target, list] of expected) for (const item of list) {
    const found = records.some((record) => record.status === item.change && record.projectPath === target);
    if (!found) violations.push({ code: 'SW-GIT-MISSING-REQUESTED', path: target, owner: item.owner, unit: item.unit,
      expected_change: item.change, message: 'requested change is not present in the actual Git diff' });
  }
  return {
    snapshot: { source_commit: preflight.snapshot.commit, source_tree: preflight.snapshot.tree,
      destination: staged ? 'index' : 'worktree', destination_tree: destination.tree,
      authority_checks: authorityChecks, diff_kind: staged ? 'HEAD..index' : 'HEAD..worktree' },
    changed_records: observed,
    execution_input_records: observed.filter((record) => record.classification === 'execution-input'),
    implementation_records: observed.filter((record) => record.classification !== 'execution-input'),
    violations,
    ok: violations.length === 0 && preflight.ready,
  };
}
