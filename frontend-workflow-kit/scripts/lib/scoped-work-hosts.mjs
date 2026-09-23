// D28: inspect every native surface host and its consent to the concrete shared
// targets, not the surface's own checks or an execution permission. Scoped hosts
// use their actual profile/Decision checks and the member role ceiling before this
// surface's reservation is added. An unadopted legacy-current host consents only
// through the member base envelope of the actual legacy surface computation.
import fs from 'node:fs';
import path from 'node:path';
import { yamlParse } from './util.mjs';
import { computeReadiness } from '../readiness-legacy.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { ownerParts, readCurrentBytes, hashBytes, normalizeWorkTargets } from './current-work-request.mjs';
import { ScopedWorkContractError, workPath, workUnitId } from './scoped-work-request.mjs';
import { resolveScopedApplicabilityProjection } from './scoped-work-applicability.mjs';
import { resolveScopedMappingEvidence } from './scoped-work-mapping.mjs';
import { inspectScopedProfile } from './scoped-work-profiles.mjs';
import { inspectScopedDecisionScopes } from './scoped-work-decision-scopes.mjs';
import { COMPONENT_MAPPING_COLUMNS } from './mapping-provenance.mjs';
import { concretePathIssue, globMatches } from './path-backstop.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-HOST: ${message}`); };
const same = (a, b) => scopeJson(a) === scopeJson(b);
const byBytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const OPTION_KEYS = new Set(['owner', 'unit', 'projectRoot', 'docsDir', 'kitRoot',
  'policyFile', 'layoutFile', 'manifestFile', 'registerFile', 'ciFile', 'targetIndex',
  'inputArtifacts', 'origin_inputs', 'coverage_reports', 'targets']);
// A legacy host's base is its own member causes plus the legacy structural surface
// contract. The surface's cumulative own-mode causes are replaced by the scoped
// predicate and belong to the surface's own checks, not to this host's consent.
const LEGACY_MEMBER_CAUSES = new Set(['member-policy-coverage', 'member-policy-forbidden', 'missing-member-readiness']);

// Do not resolve a display name by basename, strip a fragment, infer a src prefix,
// or select the first path in a component list. Such cells need a real resolver.
// This additive inspector supports a single literal repository path, optionally
// wrapped in one inline-code pair; existing mapping parsing is not changed.
function componentPath(selection) {
  const indexes = selection.headers.flatMap((header, index) =>
    header === COMPONENT_MAPPING_COLUMNS[2] ? [index] : []);
  if (indexes.length !== 1) return null;
  const cell = selection.cells[indexes[0]];
  if (typeof cell !== 'string') return null;
  const value = /^`([^`\r\n]+)`$/.exec(cell)?.[1] ?? cell;
  if (/[\s`,;|<>()"'\\#]/u.test(value) || concretePathIssue(value)) return null;
  workPath(value, 'mapped component path');
  return value;
}

export function inspectScopedSurfaceHosts(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('options object required');
  for (const key of Object.keys(options)) if (!OPTION_KEYS.has(key)) fail(`unsupported caller option ${key}`);
  const { owner, unit, projectRoot, docsDir, kitRoot, policyFile, layoutFile, manifestFile, targetIndex, inputArtifacts = [] } = options;
  if (ownerParts(owner).kind !== 'surface') fail('only an exact surface owner may inspect its hosts');
  workUnitId(unit);
  // Host consent is path-specific. Copy the normalized targets; never retain caller arrays.
  const targets = normalizeWorkTargets(options.targets);
  const files = new Map(), directories = new Map(), components = new Map();
  function canonical(file, required = false, type) {
    if (typeof file !== 'string') fail('canonical resource path required');
    const relative = path.isAbsolute(file) ? path.relative(projectRoot, file).split(path.sep).join('/') : file;
    if (path.isAbsolute(file) && path.resolve(file) !== file) fail('noncanonical absolute resource path');
    return canonicalRepositoryPath(projectRoot, relative,
      { required, ...(type ? { type } : {}), label: 'scoped host observation' });
  }
  function auditFiles() {
    for (const entry of files.values()) if (hashBytes(readCurrentBytes(canonical(entry.file, true, 'file').absolute,
      'scoped host authority')) !== entry.sha256) fail(`authority snapshot changed: ${entry.file}`);
  }
  function absorb(result) {
    for (const entry of result.read_set) {
      if (files.has(entry.file) && files.get(entry.file).sha256 !== entry.sha256)
        fail(`authority changed between hosts: ${entry.file}`);
      files.set(entry.file, entry);
    }
    for (const entry of result.directory_read_set ?? []) {
      if (directories.has(entry.file) && !same(directories.get(entry.file), entry))
        fail(`evidence directory changed between hosts: ${entry.file}`);
      directories.set(entry.file, entry);
    }
    auditFiles();
  }
  // Read an authority file once and pin its bytes with every other observation.
  function pin(file, label) {
    const selected = canonical(file, true, 'file');
    const raw = readCurrentBytes(selected.absolute, label), sha256 = hashBytes(raw);
    if (files.has(selected.relative) && files.get(selected.relative).sha256 !== sha256)
      fail(`authority changed between hosts: ${selected.relative}`);
    files.set(selected.relative, { file: selected.relative, sha256 });
    return raw;
  }
  function yaml(file, label) {
    let value;
    try { value = yamlParse(decodeGitUtf8(pin(file, label), label), { maxAliasCount: 10000 }); }
    catch (error) {
      if (error instanceof ScopedWorkContractError) throw error;
      fail(`${label}: ${error.message}`);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}: YAML object required`);
    return value;
  }
  function snapshotComponent(file) {
    const selected = canonical(file, false, 'file');
    if (!selected.exists) return { path: file, exists: false };
    const stat = fs.lstatSync(selected.absolute);
    return { path: file, exists: true, executable: Boolean(stat.mode & 0o111),
      sha256: hashBytes(readCurrentBytes(selected.absolute, 'mapped component')) };
  }
  function auditDirectories() {
    for (const entry of directories.values()) {
      const selected = canonical(entry.file);
      let actual = null;
      if (selected.exists) {
        if (!fs.lstatSync(selected.absolute).isDirectory()) fail('evidence directory changed type');
        actual = fs.readdirSync(selected.absolute, { withFileTypes: true }).map((item) =>
          [item.name, item.isDirectory() ? 'directory' : item.isFile() ? 'file' : 'unsupported'])
          .sort(([a], [b]) => byBytes(a, b));
      }
      if (!same(actual, entry.entries)) fail(`evidence directory membership changed: ${entry.file}`);
    }
  }

  const observed = resolveScopedApplicabilityProjection(options);
  absorb(observed);
  const { projection } = observed;
  const identity = projection.owners.find((entry) => entry.owner === owner);
  const declared = projection.units.find((entry) => entry.owner === owner && entry.declaration.id === unit)?.declaration;
  if (!identity?.adopted || !declared) fail('canonical adopted surface/unit required');
  const members = identity.metadata.member_screens;
  const links = projection.host_links.filter((entry) => entry.surface === owner && entry.unit === unit);
  if (!Array.isArray(members) || members.length < 2 || new Set(members).size !== members.length ||
    links.length !== members.length || !same(scopeSet(links.map((entry) => entry.member)),
      scopeSet(members.map((id) => `screen:${id}`)))) fail('exactly one native link per surface member is required');
  const componentRole = projection.ownership.units.find((entry) => entry.owner === owner && entry.unit === unit)
    ?.roles.find((entry) => entry.role === 'domain_component');
  const owned = (componentRole?.owned ?? []).filter((entry) => entry.owner === owner && entry.source === 'surface');

  // The actual legacy surface computation, from the generated legacy state and the
  // same selected policy/manifest/layout/CI bytes. Only computed for a legacy host.
  let legacySurface = null;
  function legacyBase() {
    if (legacySurface) return legacySurface;
    if (typeof docsDir !== 'string') fail('canonical docsDir required for a legacy member base');
    const docs = canonical(docsDir, true, 'directory').relative;
    const state = yaml(`${docs}/_meta/workflow-state.yaml`, 'legacy workflow-state');
    const policy = yaml(policyFile, 'legacy policy'), manifest = yaml(manifestFile, 'legacy manifest');
    const ci = options.ciFile === undefined ? {} : yaml(options.ciFile, 'legacy CI');
    const layout = loadLayoutProfile({ kitRoot: kitRoot || projectRoot, flags: { layout: layoutFile } });
    const surfaceId = ownerParts(owner).id, record = state.surfaces?.[surfaceId];
    // Generated state is regenerated by workflow:state; never interpret a stale one.
    if (!record || record.domain !== identity.metadata.domain ||
      !same(scopeSet(record.member_screens ?? []), scopeSet(members)) ||
      !same(scopeSet(record.implementation_paths ?? []), scopeSet(identity.metadata.implementation_paths ?? []))) {
      fail('legacy workflow-state differs from the canonical surface; regenerate workflow:state');
    }
    const result = computeReadiness({ state, policy, ci, manifest, layout, surfaceOnlyId: surfaceId, exposeCaps: true })?.[surfaceId];
    if (!result || !Array.isArray(result.path_authorization) || !Array.isArray(result.member_modes)) {
      fail('legacy surface readiness is unavailable');
    }
    legacySurface = JSON.parse(JSON.stringify(result));
    return legacySurface;
  }
  function legacyConsent(member) {
    const base = legacyBase(), id = ownerParts(member).id;
    const mode = base.member_modes.find((entry) => entry.screen_id === id);
    if (!mode) fail('legacy member base is missing a canonical member');
    return targets.map((target) => {
      const declaredPaths = base.path_authorization.filter((entry) => globMatches(entry.path, target.path));
      const causes = declaredPaths.flatMap((entry) => (entry.causes || []).filter((cause) => cause.kind === 'surface-contract' ||
        (LEGACY_MEMBER_CAUSES.has(cause.kind) && cause.screen_id === id)).map((cause) => ({ declared_path: entry.path, ...cause })));
      return { path: target.path, basis: 'legacy-member-base', member_readiness_mode: mode.readiness_mode,
        allowed: declaredPaths.length > 0 && causes.length === 0,
        ...(declaredPaths.length ? {} : { reason: 'outside-declared-surface-path' }), causes: scopeSet(causes) };
    });
  }
  // The host unit's own role ceiling for its domain, before this surface's
  // reservation turns the shared path into a delegated deny for that screen.
  function roleConsent(member, hostUnit) {
    const selected = projection.ownership.units.find((entry) => entry.owner === member && entry.unit === hostUnit);
    if (!selected) fail('native host ownership projection is missing');
    return targets.map((target) => {
      const roles = selected.roles.filter((role) => role.layout_paths.some((pattern) => globMatches(pattern, target.path)));
      return { path: target.path, basis: 'member-role-ceiling', allowed: roles.some((role) => role.enabled),
        roles: scopeSet(roles.map((role) => ({ role: role.role, enabled: role.enabled }))) };
    });
  }

  const denials = [], hosts = [], legacy = [];
  for (const link of scopeSet(links)) {
    const host = projection.owners.find((entry) => entry.owner === link.member);
    if (!host || ownerParts(link.member).kind !== 'screen' || host.metadata.domain !== identity.metadata.domain)
      fail('native member identity/domain changed');
    const local = [];
    // Every denial names the evaluated surface/unit and the responsible host.
    const deny = (code, details = {}) => local.push({ ...details, code, owner, unit, host: link.member, host_unit: link.host_unit });
    let profile = null, decisionScopes = null, mapping = null, consent;
    if (host.adopted) {
      const hostDeclaration = projection.units.find((entry) => entry.owner === link.member && entry.declaration.id === link.host_unit)?.declaration;
      if (!hostDeclaration || hostDeclaration.kind !== declared.kind || link.host_unit === 'legacy-current')
        fail('native host unit/kind is missing or mismatched');
      const args = { ...options, owner: link.member, unit: link.host_unit };
      // Shared targets belong to the surface, not to a host's private path roots.
      // Host path-policy success is neither fabricated nor borrowed here.
      profile = inspectScopedProfile(args); absorb(profile);
      decisionScopes = inspectScopedDecisionScopes(args); absorb(decisionScopes);
      if (profile.owner !== link.member || profile.unit !== link.host_unit || profile.kind !== declared.kind ||
        decisionScopes.owner !== link.member) fail('host inspector identity mismatch');
      const checks = decisionScopes.unit_checks.filter((entry) => entry.unit === link.host_unit);
      if (checks.length !== 1 || !decisionScopes.known_units.includes(link.host_unit) ||
        typeof checks[0].decisions_clear !== 'boolean' || typeof profile.profile_satisfied !== 'boolean')
        fail('incomplete native host prerequisite result');
      for (const reason of profile.denials) deny(reason.code, { ...reason, prerequisite: 'host-profile' });
      if (!profile.profile_satisfied && !profile.denials.length) fail('unsatisfied host profile without a reason');
      if (!checks[0].decisions_clear) deny('host-decision-blocked', {
        decisions: decisionScopes.checks.filter((entry) => entry.blocking_units.includes(link.host_unit)).map((entry) => entry.decision) });
      consent = roleConsent(link.member, link.host_unit);
    } else {
      if (link.host_unit !== 'legacy-current') fail('unadopted host must select legacy-current');
      legacy.push(link.member);
      // A mapping, a caller-provided envelope, or successful scoped peers cannot
      // substitute the real legacy member base; this is the base itself.
      consent = legacyConsent(link.member);
    }
    for (const entry of consent) if (!entry.allowed) {
      const { allowed: _allowed, basis, ...details } = entry;
      deny(basis === 'legacy-member-base' ? 'legacy-member-base-denied' : 'host-role-ceiling-denied', details);
    }
    if (declared.kind === 'visual') {
      const selector = declared.host_visual_evidence[ownerParts(link.member).id];
      if (!selector || !link.mapping || selector.mapping_ref !== link.mapping.ref) fail('missing native host mapping selector');
      mapping = resolveScopedMappingEvidence({ hostRef: `artifact:${host.artifact_id}`, mappingRef: selector.mapping_ref,
        mKeys: selector.m_keys, projectRoot, targetIndex, inputArtifacts });
      if (!same(scopeSet(mapping.rows.map((row) => row.m_key)), scopeSet(link.mapping.rows.map((row) => row.m_key))))
        fail('selected M-key set changed');
      if (mapping.mapping.metadata.status === 'deprecated') deny('host-mapping-deprecated');
      for (const row of mapping.rows) {
        const file = componentPath(row.component);
        // B §8.2.1-4 name: selected surface visual evidence without a concrete owned path.
        if (!file) { deny('surface-visual-evidence-unresolved', { m_key: row.m_key }); continue; }
        const reservations = projection.ownership.reservations.filter((entry) => globMatches(entry.path, file));
        if (!(componentRole?.layout_paths ?? []).some((pattern) => globMatches(pattern, file)) ||
          !owned.some((entry) => globMatches(entry.path, file)) || reservations.some((entry) => entry.owner !== owner)) {
          deny('host-component-not-surface-owned', { m_key: row.m_key, path: file });
          continue;
        }
        const snapshot = snapshotComponent(file);
        if (components.has(file) && !same(components.get(file), snapshot)) fail('mapped component changed between hosts');
        components.set(file, snapshot);
      }
      // The projection already pinned mapping/host/input bytes. Recheck after
      // resolving rows again, rather than trusting only equal cell values.
      auditFiles();
    }
    hosts.push({ owner: link.member, unit: link.host_unit, adopted: host.adopted, kind: declared.kind,
      host_satisfied: local.length === 0, denials: scopeSet(local), consent, profile, decision_scopes: decisionScopes, mapping });
    denials.push(...local);
  }
  auditFiles(); auditDirectories();
  for (const entry of components.values()) if (!same(snapshotComponent(entry.path), entry)) fail('mapped component snapshot changed');
  auditFiles(); auditDirectories();
  return { owner, unit, kind: declared.kind, targets, hosts_satisfied: hosts.every((entry) => entry.host_satisfied),
    hosts: structuredClone(hosts.sort((a, b) => byBytes(a.owner, b.owner))),
    denials: scopeSet(denials), legacy_hosts: scopeSet(legacy),
    read_set: scopeSet([...files.values()]), directory_read_set: scopeSet([...directories.values()]),
    component_read_set: scopeSet([...components.values()]), approval_verified: false, permission_evaluated: false,
    semantic_coverage_verified: false,
    required_checks: ['Surface own profile, concrete targets/ownership and Decision scopes (D27)',
      'Every responsible co-owner and immutable original Git before/after request, origin, authority and modes',
      'Public CLI integration and adopted-path fallback/rollback guards'],
    required_reviews: [...new Set([
      ...hosts.flatMap((entry) => [...(entry.profile?.required_reviews ?? []), ...(entry.decision_scopes?.required_reviews ?? [])]),
      ...(declared.kind === 'visual' ? ['Resolve host-specific visual conflicts and source semantics by review; distinct Figma node IDs are not a conflict or a majority vote.'] : []),
    ])],
  };
}
