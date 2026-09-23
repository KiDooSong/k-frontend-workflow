// Concrete B §8 ownership/role prerequisites, not an execution permit. Profile,
// Decision scope, every host/co-owner and original Git snapshots remain separate.
import fs from 'node:fs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { normalizeWorkTargets, ownerParts, readCurrentBytes, hashBytes } from './current-work-request.mjs';
import { concretePathIssue, globMatches } from './path-backstop.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { resolveScopedBoundaryProjection } from './scoped-work-boundaries.mjs';
import { createScopedApiResolver } from './scoped-work-api.mjs';
import { ScopedWorkContractError, workPath, workUnitId } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-PATH: ${message}`); };
const matches = (patterns, file) => patterns.some((pattern) => globMatches(pattern, file));

export function inspectScopedPaths(options = {}) {
  const { owner, unit, projectRoot, targetIndex, kitRoot, layoutFile } = options;
  ownerParts(owner); workUnitId(unit);
  const targets = normalizeWorkTargets(options.targets);
  for (const target of targets) {
    workPath(target.path);
    const issue = concretePathIssue(target.path);
    if (issue) fail(issue);
    if (!['A', 'M'].includes(target.change)) fail('regular file A/M only; original Git validation is still required');
  }
  const observed = resolveScopedBoundaryProjection(options);
  const { projection } = observed, boundary = projection.ownership;
  const identity = projection.owners.find((entry) => entry.owner === owner);
  const limits = boundary.units.find((entry) => entry.owner === owner && entry.unit === unit);
  const declaration = projection.units.find((entry) => entry.owner === owner && entry.declaration.id === unit)?.declaration;
  if (!identity || !limits || !declaration) fail('canonical adopted owner/unit required');
  const canonical = (file, required = false) => canonicalRepositoryPath(projectRoot, file,
    { required, type: 'file', label: 'scoped concrete path' });
  function checkAuthority() {
    for (const entry of observed.read_set) {
      const file = canonical(entry.file, true);
      if (hashBytes(readCurrentBytes(file.absolute, 'scoped path authority')) !== entry.sha256) fail('authority snapshot changed');
    }
  }
  checkAuthority();
  const layout = loadLayoutProfile({ kitRoot: kitRoot || projectRoot, flags: { layout: layoutFile } });
  const authoredRoles = layout.rolesFor(identity.metadata.domain);
  const hasTestRole = Object.hasOwn(authoredRoles, 'test');
  const selectedApi = createScopedApiResolver({ projectRoot, targetIndex, layout }).unit(identity.artifact_id, owner, unit);
  // The resolver validates the analysis; its original candidates do not have an
  // actionable-copy `valid` flag. Preserve that return contract here too.
  const selectedActive = selectedApi.candidates.filter((row) => row.candidate.confidence === 'confirmed' && row.candidate.gate === 'active');
  const selectedForPath = (file) => selectedActive.filter((row) => matches(row.candidate.safe_slice_paths || [], file));
  function snapshot(file) {
    const resolved = canonical(file);
    if (!resolved.exists) return { path: file, exists: false };
    const stat = fs.lstatSync(resolved.absolute);
    const raw = readCurrentBytes(resolved.absolute, 'scoped path target');
    return { path: file, exists: true, executable: Boolean(stat.mode & 0o111), sha256: hashBytes(raw) };
  }
  const observations = [], paths = [];
  for (const target of targets) {
    const file = target.path, denials = [];
    const deny = (code, details = {}) => denials.push({ code, ...details });
    const current = snapshot(file); observations.push(current);
    if (target.change === 'A' && current.exists) deny('add-target-exists');
    if (target.change === 'M' && !current.exists) deny('modify-target-missing');
    if (observed.read_set.some((entry) => entry.file === file)) deny('authority-resource');
    if (!limits.profile_enabled) deny('profile-not-enabled');
    if (identity.metadata.status === 'deprecated' || identity.metadata.screen_lifecycle === 'absorbed') deny('owner-inactive');
    for (const pattern of boundary.explicit_denies) if (globMatches(pattern, file)) deny('explicit-deny', { pattern });
    for (const generated of boundary.generated) if (globMatches(generated.path, file)) deny('generated-path', { generated });
    for (const reserved of boundary.other_role_boundaries) if (globMatches(reserved.path, file)) deny('non-profile-role', { reserved });
    const reservations = boundary.reservations.filter((entry) => globMatches(entry.path, file));
    for (const reserved of reservations) {
      if (reserved.role === 'route') deny('route-entry', { reserved });
      else if (reserved.owner !== owner) deny(reserved.source === 'surface' ? 'shared-surface-delegation' : 'other-owner-reservation', { reserved });
    }
    const roles = limits.roles.filter((role) => role.enabled &&
      (matches(role.layout_paths, file) || (role.role === 'test' && !hasTestRole)) &&
      role.owned.some((entry) => globMatches(entry.path, file)));
    if (!roles.length) deny('outside-owned-role-intersection');
    if (limits.unknown_api_paths.some((entry) => globMatches(entry.path, file))) deny('ambiguous-api-surface');
    const claims = boundary.api_claims.filter((entry) => globMatches(entry.path, file));
    for (const claim of claims) {
      if (claim.owner !== owner) deny('api-other-owner', { claim });
      if (!claim.contract_valid || !claim.row_valid) deny('invalid-api-claim', { claim });
      if (!claim.api_required) deny('no-api-claim', { claim });
      if (claim.kind === 'deferred' || claim.gate !== 'active') deny('deferred-api-claim', { claim });
      if (!claim.surface_kind) deny('ambiguous-api-surface', { claim });
    }
    for (const conflict of boundary.api_conflicts) if (conflict.paths.every((pattern) => globMatches(pattern, file))) deny('api-ownership-conflict', { conflict });
    const apiSurface = limits.roles.find((role) => role.role === 'api_client');
    const inApiClient = matches(apiSurface?.layout_paths || [], file);
    const selected = selectedForPath(file);
    if (inApiClient && !selected.length) deny('unselected-api-client');
    if (inApiClient && limits.kind === 'visual') deny('visual-api-client');
    // A fixture-only hook may use its own active claim without pretending that
    // API availability proves product behavior. Behavior must select that API.
    if (limits.kind !== 'visual' && claims.length && !selected.length) deny('unselected-api-claim');
    paths.push({ ...target, boundary_satisfied: denials.length === 0, denials: scopeSet(denials),
      roles: scopeSet(roles.map((role) => role.role)), reservations, api_claims: claims,
      selected_endpoints: scopeSet(selected.map((row) => row.selection)) });
  }
  checkAuthority();
  for (const entry of observations) if (scopeJson(snapshot(entry.path)) !== scopeJson(entry)) fail('target snapshot changed');
  checkAuthority();
  return { owner, unit, kind: limits.kind, boundary_satisfied: paths.every((entry) => entry.boundary_satisfied), paths,
    read_set: observed.read_set, target_read_set: scopeSet(observations),
    host_units: declaration.host_units || {}, requires_legacy_base: boundary.requires_legacy_base,
    permission_evaluated: false,
    required_checks: ['Actual profile and input coverage', 'Operative Decision/uncertainty scope',
      'Every responsible owner and surface host', 'Complete canonical authority namespace and immutable original Git before/after bytes and modes'],
    required_reviews: ['Fixture hooks do not authorize speculative API or business behavior. Path matching does not verify isolation or implementation semantics.'],
  };
}
