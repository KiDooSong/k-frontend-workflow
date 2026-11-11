// Single-snapshot B §5.3 inspection, NOT an execution/approval predicate.
// Matching scope bytes and an approval_ref string cannot authenticate a human
// decision or prove that a prior resolved -> open transition removed its scope.
// Until that separate review/transition contract is checked, every applicable
// open decision remains blocking for ALL of this owner's current scoped units.
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { readCurrentBytes, hashBytes } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { parseScopedTargetRef } from './scoped-work-refs.mjs';
import { parseDecisionWorkScopes } from './scoped-work-declarations.mjs';
import { resolveScopedApplicabilityProjection } from './scoped-work-applicability.mjs';
import { resolveScopedBindingBasis, scopedBindingBasis, SCOPE_BASIS_VERSION } from './scoped-work-basis.mjs';
import { scopedUncertaintyScopes } from './scoped-work-uncertainty-scopes.mjs';
import { ScopedWorkContractError } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-BINDINGS: ${message}`); };
const same = (a, b) => scopeJson(a) === scopeJson(b);

// The canonical projection is supplied only by the entry points below, never
// by an options field. Mutable file-backed inspection keeps its independent
// basis passes; a report on an owned raw Git snapshot can reuse its projection.
function decisionInspection(options, { projection, read_set }, resolveBasis) {
  const { owner, projectRoot, targetIndex } = options;
  const knownUnits = projection.known_units;
  const applications = projection.decision_relations.applications.filter((entry) => entry.owner === owner);
  const decisions = scopeSet([...new Set(applications.map((entry) => entry.decision))]);
  const files = new Map(read_set.map((entry) => [entry.file, entry]));
  const homes = new Map();
  function audit(entries) {
    for (const entry of entries) {
      if (files.has(entry.file) && files.get(entry.file).sha256 !== entry.sha256) fail('snapshot changed between binding passes');
      files.set(entry.file, entry);
    }
  }
  function read(relative) {
    if (!files.has(relative)) fail('decision home missing from the canonical read set');
    const file = canonicalRepositoryPath(projectRoot, relative, { required: true, type: 'file', label: 'scoped binding' });
    const raw = readCurrentBytes(file.absolute, 'scoped binding');
    if (hashBytes(raw) !== files.get(relative).sha256) fail('snapshot changed while inspecting bindings');
    return raw;
  }
  function bindings(record) {
    if (homes.has(record.file)) return homes.get(record.file);
    const parsed = parseScopedTargetRef(record.ref);
    if (!parsed || parsed.kind !== 'decision') fail('canonical decision record required');
    const indexed = targetIndex.artifacts.get(parsed.ownerArtifactId);
    const home = splitFrontmatter(decodeGitUtf8(read(record.file), 'scoped binding home'));
    if (!home.hasFrontmatter || home.parseError || !indexed ||
        !same(home.data, indexed.fm) || home.body !== indexed.body) fail('decision home differs from its indexed snapshot');
    const result = parseDecisionWorkScopes(home.data.decision_work_scopes)?.bindings || [];
    homes.set(record.file, result);
    return result;
  }

  const checks = [];
  for (const ref of decisions) {
    const record = projection.decision_relations.records.find((entry) => entry.ref === ref);
    if (!record || !['open', 'resolved'].includes(record.status)) fail('missing or malformed canonical decision');
    const binding = bindings(record).find((entry) => entry.decision_id === record.decision_id && entry.owner === owner);
    let bindingState = 'missing';
    let computedDigest = null, computedComponents = null;
    if (binding) {
      bindingState = 'stale-known-units';
      if (same(scopeSet(binding.known_units), knownUnits)) {
        const scope = { decision: ref, owner, known_units: scopeSet(binding.known_units), blocks: scopeSet(binding.blocks) };
        let current;
        if (resolveBasis) {
          current = resolveBasis(ref);
          audit(current.read_set);
          // Standalone inspection still independently resolves mutable resources,
          // including absent optional resources that can appear between passes.
          if (current.basis.basis_version !== SCOPE_BASIS_VERSION || !same(current.basis, scopedBindingBasis(projection, scope).basis) ||
              !same(current.recorded_binding, { basis_digest: binding.basis_digest, approval_ref: binding.approval_ref })) {
            fail('canonical binding or projection changed between passes');
          }
        } else {
          current = scopedBindingBasis(projection, scope);
        }
        computedDigest = current.basis_digest; computedComponents = current.component_digests;
        bindingState = computedDigest === binding.basis_digest ? 'current-unverified' : 'stale-basis';
      }
    }
    checks.push({ decision: ref, status: record.status, binding_state: bindingState,
      declared_binding: binding || null, computed_basis_digest: computedDigest, computed_component_digests: computedComponents,
      // Canonical Status is the sole source of resolved/open. A resolved row
      // contributes no open-decision block, but this is not an overall permit.
      blocking_units: record.status === 'open' ? [...knownUnits] : [],
      scope_review_needed: record.status === 'open', approval_verified: false,
      applications: scopeSet(applications.filter((entry) => entry.decision === ref)),
    });
  }
  const result = { owner, known_units: [...knownUnits], checks: scopeSet(checks),
    blocking_units: scopeSet([...new Set(checks.flatMap((entry) => entry.blocking_units))]),
    read_set: scopeSet([...files.values()]),
  };
  return { result, audit, verify: () => { for (const entry of files.values()) read(entry.file); } };
}

export function inspectScopedDecisionBindings(options = {}) {
  // No caller projection, decision subset, binding, approval callback or target
  // unit list replaces the canonical closure. Other owners need their own check.
  const resolved = resolveScopedApplicabilityProjection(options);
  const inspection = decisionInspection(options, resolved,
    (decisionRef) => resolveScopedBindingBasis({ ...options, decisionRef }));
  inspection.verify();
  return inspection.result;
}

// Internal binding-status report entry: the caller owns the materialized raw
// HEAD tree and its indexes. This is not a mutable-worktree/authority inspector.
// One owner and one call own this projection; nothing is cached across reports.
export function inspectScopedSnapshotBindings(options = {}) {
  const resolved = resolveScopedApplicabilityProjection(options);
  // Inferred sources consult the optional register even when it is absent.
  // A present register is in read_set; preserve the negative observation too.
  // Do not validate an unused register path for owners without inferred sources.
  let absentRegister = null;
  if (typeof options.registerFile === 'string' &&
      resolved.projection.units.some((unit) => unit.source_dependencies?.inferred.length)) {
    const relative = path.isAbsolute(options.registerFile)
      ? path.relative(options.projectRoot, options.registerFile).split(path.sep).join('/') : options.registerFile;
    if (!resolved.read_set.some((entry) => entry.file === relative)) absentRegister = relative;
  }
  const decisions = decisionInspection(options, resolved);
  const uncertainty = scopedUncertaintyScopes(options, resolved.projection, resolved.read_set);
  decisions.audit(uncertainty.read_set);
  // Both evaluators re-read their canonical homes; audit the complete canonical
  // file set again after both have finished, before publishing any report rows.
  decisions.verify();
  if (absentRegister !== null && canonicalRepositoryPath(options.projectRoot, absentRegister,
    { required: false, type: 'file', label: 'scoped binding register' }).exists) {
    fail('register appeared while inspecting snapshot bindings');
  }
  return { decisions: decisions.result, uncertainty: { ...uncertainty, read_set: resolved.read_set,
    ...(resolved.target_fallbacks ? { target_fallbacks: resolved.target_fallbacks } : {}) } };
}
