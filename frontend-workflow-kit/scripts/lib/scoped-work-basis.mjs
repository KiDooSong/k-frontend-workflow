// B §5.4 scope-basis-v1 for one existing canonical decision/owner binding.
// Computing a digest does NOT adopt the binding, validate its human approval,
// resolve/reopen a decision, grant coverage or authorize any path/CLI execution.
import { splitFrontmatter } from './util.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { readCurrentBytes, hashBytes } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { parseTargetRef } from './reconciliation-items.mjs';
import { parseDecisionWorkScopes } from './scoped-work-declarations.mjs';
import { resolveScopedApplicabilityProjection } from './scoped-work-applicability.mjs';
import { ScopedWorkContractError, workText } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-BASIS: ${message}`); };

export function resolveScopedBindingBasis(options = {}) {
  const { owner, decisionRef, projectRoot, targetIndex } = options;
  const parsed = parseTargetRef(workText(decisionRef, 'scope basis decision'));
  if (!parsed || parsed.kind !== 'decision') fail('canonical typed decision reference required');

  // Re-resolve from actual resources; never hash a caller-provided projection,
  // blocks list, target subset or precomputed digest. This includes ALL units
  // of the binding owner, the selected host units, relation closure and claims.
  const { projection, read_set } = resolveScopedApplicabilityProjection(options);
  const record = projection.decision_relations.records.find((entry) => entry.ref === decisionRef);
  if (!record || !projection.decision_relations.applications.some((entry) =>
    entry.owner === owner && entry.decision === decisionRef)) {
    fail('decision does not apply to the binding owner');
  }
  const files = new Map(read_set.map((entry) => [entry.file, entry.sha256]));
  function read(relative) {
    if (!files.has(relative)) fail('binding home missing from the resolved read set');
    const file = canonicalRepositoryPath(projectRoot, relative, { required: true, type: 'file', label: 'scope basis' });
    const raw = readCurrentBytes(file.absolute, 'scope basis');
    if (hashBytes(raw) !== files.get(relative)) fail('snapshot changed while computing scope basis');
    return raw;
  }
  const home = splitFrontmatter(decodeGitUtf8(read(record.file), 'scope binding home'));
  const indexed = targetIndex.artifacts.get(parsed.ownerArtifactId);
  if (!home.hasFrontmatter || home.parseError || !indexed ||
      scopeJson(home.data) !== scopeJson(indexed.fm) || home.body !== indexed.body) {
    fail('binding home differs from its indexed snapshot');
  }
  const declaration = parseDecisionWorkScopes(home.data.decision_work_scopes);
  const binding = declaration?.bindings.find((entry) => entry.decision_id === parsed.rowId && entry.owner === owner);
  // Missing bindings are conservative in the later evaluator, NOT blocks: [].
  // This calculator does not invent a provisional binding or approval to hash.
  if (!binding) fail('existing canonical decision/owner binding required');
  const knownUnits = scopeSet(binding.known_units);
  if (scopeJson(knownUnits) !== scopeJson(projection.known_units)) {
    fail('binding known_units must match all current owner units');
  }

  const basis = { ...projection, basis_version: 1, binding: {
    decision: decisionRef, owner, known_units: knownUnits, blocks: scopeSet(binding.blocks),
  } };
  // The shared projection excludes decision_work_scopes, housekeeping and raw
  // audit hashes, but retains referenced artifacts' own canonical approval facts.
  // No blanket recursive removal of fields called "approval" or "sha256".
  const serialized = scopeJson(basis);
  for (const entry of read_set) read(entry.file);
  return {
    basis, basis_digest: hashBytes(Buffer.from(serialized, 'utf8')),
    recorded_binding: { basis_digest: binding.basis_digest, approval_ref: binding.approval_ref },
    read_set,
  };
}
