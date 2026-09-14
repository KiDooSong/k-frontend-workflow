import fs from 'node:fs';
import path from 'node:path';
import { DEFAULTS, KIT_ROOT } from './util.mjs';
import { computeReadiness } from '../readiness-legacy.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { collectApiCandidateClaims, readinessPathAuthorization } from './path-backstop.mjs';
import { collectInputArtifacts, validateInputArtifacts } from './input-artifact.mjs';
import { buildInputArtifactIndex, resolveInputArtifact, resolveInputEvidence } from './provenance.mjs';
import { parseReconciliationRegister } from './reconciliation-register.mjs';
import { parseReconciliationItems } from './reconciliation-items.mjs';
import { readJson, normalizeWorkRequest, digest, hashBytes, ownerParts, byteCompare } from './current-work-request.mjs';
import { materializeRawGitTree } from './visual-refresh-git-objects.mjs';
import {
  CurrentWorkExecutionError, REGULAR_MODES, outside, projectRelative, resolveProjectPath, resolveProjectRoot, gitIdentity,
  yamlFile, screenDomain, effectiveOrder, modeIndex, invalidBlocker, generatedPatterns, generatedOwner,
  selectedInputErrors, artifactProjectPath, inputHash, relatedToOwner, exactSurfaceAuthorization,
} from './current-work-execution-core.mjs';

export function prepareCurrentWork({ work, root, docs, src, policy, manifest, layout, ci } = {}) {
  if (!work) throw new CurrentWorkExecutionError('--work requires a request JSON path');
  const ctx = resolveProjectRoot(root);
  const workPath = path.isAbsolute(work) ? path.resolve(work) : path.resolve(ctx.projectRoot, work);
  let parsed;
  try { parsed = readJson(workPath, 'work request'); }
  catch (error) { throw new CurrentWorkExecutionError(error.message); }
  let request;
  try { request = normalizeWorkRequest(parsed.value); }
  catch (error) { throw new CurrentWorkExecutionError(error.message); }
  const requestDigest = digest(request);
  const identity = gitIdentity(ctx.repositoryRoot);
  const snapshot = materializeRawGitTree({ repositoryRoot: ctx.repositoryRoot, projectPrefix: ctx.projectPrefix, tree: identity.tree });
  try {
    const projectRoot = ctx.projectRoot;
    const baselineRoot = snapshot.root;
    const currentKitInsideProject = !outside(projectRoot, KIT_ROOT);
    const kitRelative = currentKitInsideProject ? projectRelative(projectRoot, KIT_ROOT, 'kit root') : null;
    const baselineKitRoot = kitRelative ? path.join(baselineRoot, ...kitRelative.split('/')) : KIT_ROOT;
    const defaultPolicy = currentKitInsideProject ? path.relative(projectRoot, DEFAULTS.policy) : DEFAULTS.policy;
    const defaultManifest = currentKitInsideProject ? path.relative(projectRoot, DEFAULTS.manifest) : DEFAULTS.manifest;
    const defaultLayout = currentKitInsideProject
      ? path.relative(projectRoot, path.join(KIT_ROOT, 'policies', 'project-layout.yaml'))
      : path.join(KIT_ROOT, 'policies', 'project-layout.yaml');
    const resources = {
      docs: resolveProjectPath(projectRoot, docs, DEFAULTS.docs, 'docs'),
      src: resolveProjectPath(projectRoot, src, DEFAULTS.src, 'src'),
      policy: resolveProjectPath(projectRoot, policy, defaultPolicy, 'policy'),
      manifest: resolveProjectPath(projectRoot, manifest, defaultManifest, 'manifest'),
      layout: resolveProjectPath(projectRoot, layout, defaultLayout, 'layout'),
      ci: ci ? resolveProjectPath(projectRoot, ci, ci, 'ci') : null,
    };
    for (const key of ['docs', 'src', 'policy', 'manifest', 'layout']) {
      resources[key].baseline = path.join(baselineRoot, ...resources[key].relative.split('/'));
    }
    if (resources.ci) resources.ci.baseline = path.join(baselineRoot, ...resources.ci.relative.split('/'));

    const stateRel = `${resources.docs.relative}/_meta/workflow-state.yaml`;
    const registerRel = `${resources.docs.relative}/_meta/reconciliation-register.md`;
    const stateFile = path.join(baselineRoot, ...stateRel.split('/'));
    const state = yamlFile(stateFile, 'workflow-state', { maxAliasCount: 10000 });
    const policyData = yamlFile(resources.policy.baseline, 'policy');
    const manifestData = yamlFile(resources.manifest.baseline, 'manifest');
    const ciData = resources.ci ? yamlFile(resources.ci.baseline, 'CI') : {};
    const layoutData = loadLayoutProfile({ kitRoot: baselineKitRoot, flags: { layout: resources.layout.baseline } });
    const allScreens = computeReadiness({ state, policy: policyData, ci: ciData, manifest: manifestData, layout: layoutData, exposeCaps: true });
    const claims = collectApiCandidateClaims(allScreens);
    const generated = generatedPatterns(manifestData, resources.docs.relative);
    const requests = [];
    const errors = [];
    const denials = [];
    const future = [];
    let absorbedCount = 0;

    for (const selector of request.requests) {
      const parts = ownerParts(selector.owner);
      const domain = screenDomain(state, parts);
      const order = effectiveOrder(policyData, layoutData, domain);
      const selected = parts.kind === 'screen'
        ? computeReadiness({ state, policy: policyData, ci: ciData, manifest: manifestData, layout: layoutData, screenOnlyId: parts.id, exposeCaps: true })
        : computeReadiness({ state, policy: policyData, ci: ciData, manifest: manifestData, layout: layoutData, surfaceOnlyId: parts.id, exposeCaps: true });
      const entry = selected?.[parts.id] || null;
      const result = { ...selector, readiness_mode: entry?.readiness_mode ?? null, path_authorizations: [], ready: false };
      if (!entry) {
        const error = { code: 'CW-OWNER-001', owner: selector.owner, message: 'current owner does not resolve uniquely in baseline readiness' };
        errors.push(error); result.errors = [error]; requests.push(result); continue;
      }
      result.legacy_readiness = entry;
      if (entry.readiness_applicable === false || entry.screen_lifecycle === 'absorbed') {
        absorbedCount++;
        const denial = { code: 'CW-OWNER-ABSORBED', owner: selector.owner, message: `absorbed owner is not executable; canonical target: ${entry.absorbed_into || 'unknown'}` };
        denials.push(denial); result.denials = [denial]; requests.push(result); continue;
      }
      const requestedIdx = modeIndex(order, selector.requested_mode);
      const ceilingIdx = modeIndex(order, entry.readiness_mode);
      if (requestedIdx < 0 || ceilingIdx < 0) {
        const error = { code: 'CW-MODE-001', owner: selector.owner, requested_mode: selector.requested_mode, readiness_mode: entry.readiness_mode, message: 'requested/current mode is not in the effective policy order' };
        errors.push(error); result.errors = [error]; requests.push(result); continue;
      }
      const localErrors = (entry.blocking || []).filter(invalidBlocker)
        .map((blocker) => ({ code: 'CW-AUTHORITY-INVALID', owner: selector.owner, blocker }));
      if (localErrors.length) errors.push(...localErrors);
      const overCeiling = requestedIdx > ceilingIdx;
      const localDenials = [];
      if (overCeiling) localDenials.push({ code: 'CW-MODE-CEILING', owner: selector.owner, requested_mode: selector.requested_mode, readiness_mode: entry.readiness_mode, message: 'requested mode exceeds current readiness ceiling' });
      const localFuture = !overCeiling
        ? (entry.blocking || []).filter((blocker) => !invalidBlocker(blocker)).map((blocker) => ({ owner: selector.owner, blocker }))
        : [];
      for (const target of selector.targets) {
        const generatedEntry = generatedOwner(target.path, generated);
        let authorization;
        if (generatedEntry) {
          authorization = { allowed: false, checked_path: target.path, reason: `generated/do-not-edit ownership is final (${generatedEntry.artifact_id})`, generated_owner: generatedEntry };
        } else {
          try {
            authorization = parts.kind === 'screen'
              ? readinessPathAuthorization({ file: target.path, screenId: parts.id, entry, modeOrder: order, claims })
              : exactSurfaceAuthorization(entry, target.path, parts.id, order);
          } catch (error) { authorization = { allowed: false, reason: error.message }; }
        }
        result.path_authorizations.push({ ...target, ...authorization });
        if (!authorization.allowed) localDenials.push({ code: 'CW-PATH-DENIED', owner: selector.owner, path: target.path, change: target.change, reason: authorization.reason || authorization.causes || null });
      }
      denials.push(...localDenials); future.push(...localFuture);
      result.errors = localErrors;
      result.denials = localDenials;
      result.future_requirements = localFuture;
      result.ready = !localErrors.length && !localDenials.length;
      requests.push(result);
    }

    const inputsDir = path.join(resources.docs.baseline, 'inputs');
    const inputArtifacts = collectInputArtifacts(inputsDir);
    const inputValidation = validateInputArtifacts(inputArtifacts);
    const inputIndex = buildInputArtifactIndex(inputArtifacts);
    const registerFile = path.join(baselineRoot, ...registerRel.split('/'));
    const register = parseReconciliationRegister(registerFile);
    if (register.fmParseError || register.fmStructuralError) {
      throw new CurrentWorkExecutionError(`reconciliation register: ${register.fmParseError || register.fmStructuralError}`);
    }
    const itemTable = Number(register.fm?.reconciliation_contract) === 2 ? parseReconciliationItems(register.body) : null;
    if (itemTable && (itemTable.sectionCount !== 1 || itemTable.tableCount !== 1 || itemTable.headerIssue)) {
      throw new CurrentWorkExecutionError('reconciliation register: invalid v2 Reconciliation Items structure');
    }
    const originInputs = [];
    for (const origin of request.origin_inputs) {
      const resolution = resolveInputArtifact(inputIndex, origin.input_id);
      if (resolution.status !== 'ok') throw new CurrentWorkExecutionError(`origin ${origin.input_id}: ${resolution.status} canonical input`);
      const validationErrors = selectedInputErrors(inputValidation, resolution);
      if (validationErrors.length) throw new CurrentWorkExecutionError(`origin ${origin.input_id}: invalid canonical input (${validationErrors[0].message})`);
      const artifact = resolution.artifact;
      const rows = (register.rows || []).filter((row) => row.inputId === origin.input_id);
      if (rows.length > 1) throw new CurrentWorkExecutionError(`origin ${origin.input_id}: duplicate reconciliation rows`);
      const sourceEvidence = [];
      for (const ref of origin.source_refs) {
        const evidence = resolveInputEvidence(inputIndex, ref);
        if (evidence.status !== 'ok') throw new CurrentWorkExecutionError(`origin ${origin.input_id}: unresolved source ref ${ref} (${evidence.status})`);
        if (itemTable) {
          const linked = itemTable.rows.some((row) => row.inputId === origin.input_id && row.evidence === ref);
          if (!linked) throw new CurrentWorkExecutionError(`origin ${origin.input_id}: source ref is not linked by completed reconciliation evidence: ${ref}`);
        }
        sourceEvidence.push({ ref, evidence_text: evidence.evidenceText || null });
      }
      const row = rows[0] || null;
      const originDenials = [];
      if (!row || row.reconcileStatus !== 'reconciled') {
        originDenials.push({ code: 'CW-ORIGIN-UNRECONCILED', input_id: origin.input_id, status: row?.reconcileStatus || 'missing-row', message: 'C requires completed reconciliation; partial/no-effect receipt acceptance belongs to D' });
      }
      const relatedOwners = requests.filter((entry) => relatedToOwner(artifact, ownerParts(entry.owner), state, itemTable?.rows || []))
        .map((entry) => entry.owner);
      if (requests.length && relatedOwners.length === 0) {
        originDenials.push({ code: 'CW-ORIGIN-UNCONNECTED', input_id: origin.input_id, message: 'origin cannot be explained by the selected current owner(s) in canonical scope/reconciliation evidence' });
      }
      denials.push(...originDenials);
      originInputs.push({
        input_id: origin.input_id,
        source_refs: origin.source_refs,
        source_evidence: sourceEvidence,
        path: artifactProjectPath(baselineRoot, artifact),
        raw_hash: inputHash(artifact),
        reconcile_status: row?.reconcileStatus || null,
        reconcile_result: row?.result || null,
        related_owners: relatedOwners.sort(byteCompare),
        denials: originDenials,
      });
    }

    const resourceRecords = [];
    for (const [kind, resource] of Object.entries(resources)) {
      if (!resource) continue;
      const entry = snapshot.entry(resource.relative);
      if (['policy', 'manifest', 'layout', 'ci'].includes(kind)) {
        if (!entry || entry.type !== 'blob' || !REGULAR_MODES.has(entry.mode)) {
          throw new CurrentWorkExecutionError(`${kind}: baseline resource must be a regular Git blob`);
        }
      }
      resourceRecords.push({ kind, path: resource.relative, mode: entry?.mode || null, oid: entry?.oid || null });
    }
    const baseline = {
      commit: identity.commit,
      tree: identity.tree,
      project_prefix: ctx.projectPrefix || '',
      resources: resourceRecords.sort((a, b) => byteCompare(a.kind, b.kind)),
      work_request: {
        hash: hashBytes(parsed.raw),
        path: outside(projectRoot, workPath) ? null : projectRelative(projectRoot, workPath, 'work request'),
      },
    };
    const ready = requests.length > 0 && requests.every((entry) => entry.ready) && errors.length === 0 && denials.length === 0;
    return {
      work_contract: 1,
      authority: 'current',
      snapshot: baseline,
      request_digest: requestDigest,
      origin_inputs: originInputs,
      requests,
      ready,
      errors,
      denials,
      future_requirements: future,
      required_reviews: [],
      legacy_readiness: Object.fromEntries(requests.map((entry) => [entry.owner, entry.legacy_readiness || null])),
      all_absorbed: absorbedCount === requests.length && requests.length > 0,
      _context: { ...ctx, workPath, baselineRoot, request, policy: policyData, manifest: manifestData, ci: ciData, layout: layoutData, state, snapshot, claims, generated },
    };
  } catch (error) {
    snapshot.cleanup();
    throw error;
  }
}

export function cleanupCurrentWork(preflight) { preflight?._context?.snapshot?.cleanup?.(); }
