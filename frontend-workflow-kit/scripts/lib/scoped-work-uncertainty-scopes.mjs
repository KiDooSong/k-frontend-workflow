// #262 human-owned Unknown/Conflict scope with decision_work_scopes' shape, digest
// and approval rules. It records the answer to B §5.3's question for a relation
// the tool cannot judge, so a current binding narrows only an open row's native
// scope-review-needed relation. Selected, inverse and transitive evidence keep
// applying. This does not authenticate approval_ref, write or refresh a binding,
// resolve a row or authorize a path.
import { splitFrontmatter } from './util.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { ownerParts, readCurrentBytes, hashBytes } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { parseScopedTargetRef } from './scoped-work-refs.mjs';
import { parseUncertaintyWorkScopes } from './scoped-work-declarations.mjs';
import { resolveScopedApplicabilityProjection } from './scoped-work-applicability.mjs';
import { scopedBindingBasis } from './scoped-work-basis.mjs';
import { scopedUncertaintyResolved } from './scoped-work-uncertainty.mjs';
import { ScopedWorkContractError, workText } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-UNCERTAINTY-SCOPE: ${message}`); };
const same = (a, b) => scopeJson(a) === scopeJson(b);
const CALLER_VERDICTS = ['projection', 'applications', 'scopes', 'uncertainty_scopes', 'blocks', 'approved', 'approval_verifier'];
function owned(options) {
  ownerParts(options.owner);
  for (const key of CALLER_VERDICTS) if (Object.hasOwn(options, key)) fail(`caller ${key} is not authority`);
  return options.owner;
}

// The bindings declared in each row's home, re-read and compared with the
// snapshot the projection was resolved from. A home is only the document that
// holds the row; its declaration is validated before any use, never repaired.
function homeBindings({ owner, projectRoot, targetIndex }, readSet) {
  const files = new Map(readSet.map((entry) => [entry.file, entry])), used = new Map(), homes = new Map();
  function read(relative) {
    if (!files.has(relative)) fail('uncertainty home missing from the canonical read set');
    const file = canonicalRepositoryPath(projectRoot, relative, { required: true, type: 'file', label: 'scoped uncertainty scope' });
    const raw = readCurrentBytes(file.absolute, 'scoped uncertainty scope');
    if (hashBytes(raw) !== files.get(relative).sha256) fail('snapshot changed while inspecting uncertainty scopes');
    used.set(relative, files.get(relative));
    return raw;
  }
  function binding(record) {
    if (!homes.has(record.file)) {
      const indexed = targetIndex.artifacts.get(record.artifact_id);
      const home = splitFrontmatter(decodeGitUtf8(read(record.file), 'scoped uncertainty home'));
      if (!home.hasFrontmatter || home.parseError || !indexed ||
          !same(home.data, indexed.fm) || home.body !== indexed.body) fail('uncertainty home differs from its indexed snapshot');
      homes.set(record.file, parseUncertaintyWorkScopes(home.data.uncertainty_work_scopes)?.bindings || []);
    }
    const parsed = parseScopedTargetRef(record.ref);
    return homes.get(record.file).find((entry) => entry.kind === parsed.kind && entry.id === parsed.rowId && entry.owner === owner) || null;
  }
  return { binding, read, used: () => scopeSet([...used.values()]) };
}
const basisBinding = (ref, owner, binding) => ({ uncertainty: ref, owner,
  known_units: scopeSet(binding.known_units), blocks: scopeSet(binding.blocks) });

function evaluate(owner, projection, homes) {
  if (projection?.owner !== owner) fail('applicability projection of another owner');
  const knownUnits = projection.known_units;
  const applications = projection.uncertainty_relations.applications.filter((entry) => entry.owner === owner);
  const records = new Map(projection.uncertainty_relations.records.map((record) => [record.ref, record]));
  const checks = new Map();
  for (const ref of scopeSet([...new Set(applications.map((entry) => entry.uncertainty))])) {
    const record = records.get(ref) || null, declared = record ? homes.binding(record) : null;
    let state = 'missing', digest = null;
    if (declared) {
      state = 'stale-known-units';
      if (same(scopeSet(declared.known_units), knownUnits)) {
        digest = scopedBindingBasis(projection, basisBinding(ref, owner, declared)).basis_digest;
        state = digest === declared.basis_digest ? 'current-unverified' : 'stale-basis';
      }
    }
    checks.set(ref, { uncertainty: ref, kind: parseScopedTargetRef(ref).kind, status: record?.status ?? null,
      resolved: scopedUncertaintyResolved(record), binding_state: state, declared_binding: declared, computed_basis_digest: digest });
  }

  // A current binding on an open row drops its native relation for a unit outside
  // its blocks; a resolved row blocks nothing, so its binding changes nothing. A
  // native relation also holds the transitive witnesses it would have without it.
  // Start from the relations that stand on their own (selected and inverse
  // evidence, a native relation no binding drops), then keep a transitive or a
  // dropped native relation only while a witness reaches it through a row this
  // unit keeps. Rows that reach the unit only through one another, or only
  // through a row a binding dropped, keep nothing. Without bindings every
  // transitive relation stands on such a start, so nothing changes.
  const dropped = (entry) => {
    const check = checks.get(entry.uncertainty);
    return entry.relation === 'scope-review-needed' && entry.unit !== null && !check.resolved && check.binding_state === 'current-unverified' &&
      !check.declared_binding.blocks.includes(entry.unit);
  };
  const kept = new Set(applications.filter((entry) => entry.relation !== 'transitive-evidence' && !dropped(entry)));
  for (let grown = true; grown;) {
    grown = false;
    const reached = new Set([...kept].map((entry) => scopeJson([entry.unit, entry.uncertainty])));
    for (const entry of applications) if (!kept.has(entry) &&
      entry.witnesses.some((witness) => witness.via && reached.has(scopeJson([entry.unit, witness.via])))) { kept.add(entry); grown = true; }
  }
  const unitsOf = (entries) => scopeSet([...new Set(entries.flatMap((entry) => entry.unit === null ? knownUnits : [entry.unit]))]);
  const result = [...checks.values()].map((check) => {
    const own = applications.filter((entry) => entry.uncertainty === check.uncertainty);
    const current = check.binding_state === 'current-unverified';
    return { ...check, applications: scopeSet(own),
      scope_source: check.resolved ? 'resolved-uncertainty' : current ? 'current-canonical-declaration' : 'conservative-default',
      blocking_units: check.resolved ? [] : unitsOf(own.filter((entry) => kept.has(entry))), approval_verified: false };
  });
  return { owner, known_units: [...knownUnits], checks: scopeSet(result), applications: scopeSet([...kept]), approval_verified: false };
}

// Standalone: resolve the owner's applicability projection, then re-read that
// whole snapshot after evaluating it.
export function inspectScopedUncertaintyScopes(options = {}) {
  const owner = owned(options);
  const { projection, read_set } = resolveScopedApplicabilityProjection(options);
  const homes = homeBindings(options, read_set), result = evaluate(owner, projection, homes);
  for (const entry of read_set) homes.read(entry.file);
  return { ...result, read_set };
}

// The same evaluation inside an inspector that has just resolved this owner's
// applicability projection itself from the same snapshot (the profile, the
// origin routing check), so it is not resolved twice. The digest is computed
// over this projection: never pass a serialized or caller-supplied one. The
// read set lists the homes read; the caller audits them with the rest.
export function scopedUncertaintyScopes(options, projection, readSet) {
  const owner = owned(options), homes = homeBindings(options, readSet);
  return { ...evaluate(owner, projection, homes), read_set: homes.used() };
}

// The kept relations of unresolved rows that deny this unit.
export function scopedUncertaintyDenials(scopes, unit) {
  const unresolved = new Set(scopes.checks.filter((check) => !check.resolved).map((check) => check.uncertainty));
  return scopes.applications.filter((entry) => (entry.unit === null || entry.unit === unit) && unresolved.has(entry.uncertainty));
}

// The digest a person records for an existing binding, from a fresh resolution.
// Missing bindings stay conservative in the inspector; this invents none to hash.
export function resolveScopedUncertaintyBindingBasis(options = {}) {
  const { uncertaintyRef, ...rest } = options, owner = owned(rest);
  const parsed = parseScopedTargetRef(workText(uncertaintyRef, 'scope basis uncertainty'));
  if (!parsed || !['unknown', 'conflict'].includes(parsed.kind)) fail('canonical typed Unknown/Conflict reference required');
  const { projection, read_set } = resolveScopedApplicabilityProjection(rest);
  const homes = homeBindings(rest, read_set);
  const record = projection.uncertainty_relations.records.find((entry) => entry.ref === uncertaintyRef);
  if (!record || !projection.uncertainty_relations.applications.some((entry) => entry.owner === owner && entry.uncertainty === uncertaintyRef)) {
    fail('uncertainty does not apply to the binding owner');
  }
  const declared = homes.binding(record);
  if (!declared) fail('existing canonical uncertainty/owner binding required');
  if (!same(scopeSet(declared.known_units), projection.known_units)) fail('binding known_units must match all current owner units');
  const { basis, basis_digest } = scopedBindingBasis(projection, basisBinding(uncertaintyRef, owner, declared));
  for (const entry of read_set) homes.read(entry.file);
  return { basis, basis_digest, recorded_binding: { basis_digest: declared.basis_digest, approval_ref: declared.approval_ref }, read_set };
}
