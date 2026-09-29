// R1 ownership facts, not a permission or complete scope-basis. Intersections
// remain explicit; a private root never removes another owner/API/generated
// reservation. The final runtime must also evaluate profiles and real Git state.
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { loadScreenSpec, analyzeApiCandidateContract, findApiCandidateOwnershipConflicts } from './spec.mjs';
import { candidateSurfaceKind } from './path-backstop.mjs';
import { implementationPathIssues } from './shared-surfaces.mjs';
import { generatedPatterns } from './current-work-execution-core.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { ownerParts, readCurrentBytes, hashBytes } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { decodeScopedYaml, parseScopedOwner } from './scoped-work-declarations.mjs';
import { ScopedWorkContractError, workText, workPath, workSet } from './scoped-work-request.mjs';
import { resolveScopedDecisionProjection } from './scoped-work-decisions.mjs';
import { createScopedApiResolver } from './scoped-work-api.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const roles = ['screen', 'domain_component', 'hook', 'api_client', 'test'];
const fail = (message) => { throw new ScopedWorkContractError(`SW-BOUNDARY: ${message}`); };
const same = (a, b) => scopeJson(a) === scopeJson(b);
const union = (values) => scopeSet([...new Map(values.map((value) => [scopeJson(value), value])).values()]);
function pattern(value) {
  workText(value, 'boundary pattern');
  // The existing kit glob dialect supports only * and **. Everything else is
  // literal; unresolved template tokens, traversal and non-POSIX aliases are not.
  if (value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value) ||
      /\{(?:domain|screen|surface|roles\.)/.test(value) ||
      value.split('/').some((part) => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')) {
    fail('noncanonical or unresolved boundary pattern');
  }
  return value;
}
function narrow(value) {
  workText(value, 'ownership path');
  workPath(value.endsWith('/**') ? value.slice(0, -3) : value, 'ownership root');
  return value;
}

// Exact nonempty-language intersection for the kit's anchored * / ** dialect.
// This only selects relevant restrictions for a projection; it grants nothing.
// Each wildcard has an epsilon edge to the next token and a consuming loop.
export function scopedPatternsOverlap(left, right) {
  const tokenize = (value) => [...pattern(value).matchAll(/\*\*|\*|[^*]/gu)].map(([token]) => token);
  const a = tokenize(left), b = tokenize(right);
  const queue = [[0, 0]], visited = new Set();
  const wildcard = (token) => token === '*' || token === '**';
  const compatible = (x, y) => x === y || x === '**' || y === '**' ||
    (x === '*' && y !== '/') || (y === '*' && x !== '/');
  for (let head = 0; head < queue.length; head += 1) {
    const [i, j] = queue[head], key = `${i}:${j}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (i === a.length && j === b.length) return true;
    if (wildcard(a[i])) queue.push([i + 1, j]);
    if (wildcard(b[j])) queue.push([i, j + 1]);
    if (i < a.length && j < b.length && compatible(a[i], b[j])) {
      queue.push([wildcard(a[i]) ? i : i + 1, wildcard(b[j]) ? j : j + 1]);
    }
  }
  return false;
}

export function resolveScopedBoundaryProjection(options = {}) {
  const { projectRoot, docsDir, targetIndex, layoutFile, manifestFile, kitRoot } = options;
  const files = new Map();
  function read(file, expected) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || path.resolve(file) !== file) fail('canonical absolute resource path required');
    const relative = path.relative(projectRoot, file).split(path.sep).join('/');
    const canonical = canonicalRepositoryPath(projectRoot, relative, { required: true, type: 'file', label: 'scoped boundary' });
    const raw = readCurrentBytes(canonical.absolute, 'scoped boundary');
    const sha256 = hashBytes(raw);
    if ((expected && expected !== sha256) || (files.has(relative) && files.get(relative).sha256 !== sha256)) fail('boundary input changed during resolution');
    files.set(relative, { file: relative, sha256 });
    return { relative, raw };
  }
  function yaml(file) {
    const source = read(file);
    const data = decodeScopedYaml(decodeGitUtf8(source.raw, 'scoped boundary YAML'), 'scoped boundary YAML');
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('resource must be a YAML object');
    return { ...source, data };
  }
  const layoutSource = yaml(layoutFile);
  let preset = null;
  if (Object.hasOwn(layoutSource.data, 'preset')) {
    const name = workText(layoutSource.data.preset, 'layout preset');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) fail('canonical preset name required');
    if (typeof kitRoot !== 'string' || !path.isAbsolute(kitRoot) || path.resolve(kitRoot) !== kitRoot) fail('canonical kitRoot required');
    preset = yaml(path.join(kitRoot, 'presets', `${name}.yaml`));
  }
  for (const source of [layoutSource, preset].filter(Boolean)) {
    for (const configuration of [source.data, ...Object.values(source.data.domains || {})]) {
      if (!Object.hasOwn(configuration, 'roles')) continue;
      const declarations = configuration.roles;
      if (!declarations || typeof declarations !== 'object' || Array.isArray(declarations)) fail('layout roles object required');
      for (const value of Object.values(declarations)) {
        const values = typeof value === 'string' ? [value] : value;
        workSet(values, (entry) => pattern(workText(entry, 'authored role path').replaceAll('{domain}', 'domain-placeholder')), 'authored role paths');
      }
    }
  }
  // Read the actual selected layout and preset, never accept caller-provided
  // role functions/readiness JSON as proof of a role ceiling.
  const layout = loadLayoutProfile({ kitRoot: kitRoot || projectRoot, flags: { layout: layoutFile } });
  const manifest = yaml(manifestFile);
  if (!manifest.data.artifacts || typeof manifest.data.artifacts !== 'object' || Array.isArray(manifest.data.artifacts)) fail('manifest artifacts object required');
  const base = resolveScopedDecisionProjection({ ...options, layout });
  for (const record of base.read_set) read(path.join(projectRoot, record.file), record.sha256);
  const selected = new Set(base.projection.owners.map((entry) => entry.owner));
  const contexts = new Map();
  const analyses = new Map();
  const claims = [];
  const reservations = [];
  const api = createScopedApiResolver({ targetIndex, projectRoot, layout });
  function resolvedRoles(domain) {
    const declared = layout.rolesFor(domain);
    return Object.fromEntries(Object.keys(declared).sort().map((role) => [role,
      workSet(layout.resolvePaths([`{roles.${role}}`], { domain }), pattern, `layout role ${role}`)]));
  }
  for (const entry of targetIndex.artifacts.values()) {
    const kind = entry.fm.artifact_type === 'screen-spec' ? 'screen' :
      entry.fm.artifact_type === 'shared-surface-spec' ? 'surface' : null;
    if (!kind) continue;
    const owner = `${kind}:${workText(entry.fm[`${kind}_id`], 'canonical owner ID')}`;
    ownerParts(owner);
    if (contexts.has(owner)) fail(`ambiguous owner ${owner}`);
    const source = read(entry.file);
    const parsed = splitFrontmatter(decodeGitUtf8(source.raw, 'scoped boundary owner'));
    const spec = loadScreenSpec(entry.file);
    if (!parsed.hasFrontmatter || parsed.parseError || !same(parsed.data, entry.fm) || parsed.body !== entry.body ||
        !same(spec.frontmatter, entry.fm) || spec.body !== entry.body) fail('owner differs from indexed snapshot');
    const domain = workText(entry.fm.domain, 'owner domain');
    const declaration = parseScopedOwner(entry.fm.work_execution, owner);
    const rolePaths = resolvedRoles(domain);
    const context = { owner, kind, domain, artifact_id: entry.fm.artifact_id, file: source.relative,
      fm: entry.fm, declaration, rolePaths };
    contexts.set(owner, context);
    const reserve = (role, value, sourceKind) => reservations.push({ owner, domain, artifact_id: context.artifact_id,
      file: context.file, role, path: narrow(value), source: sourceKind });
    if (kind === 'screen') {
      for (const field of ['screen_entry', 'route_entry']) if (Object.hasOwn(entry.fm, field)) {
        workPath(entry.fm[field], field); reserve(field === 'screen_entry' ? 'screen' : 'route', entry.fm[field], field);
      }
    } else {
      const paths = workSet(entry.fm.implementation_paths, (value) => {
        if (implementationPathIssues(value).length) fail(`invalid surface implementation path: ${value}`);
        return narrow(value);
      }, 'surface implementation_paths', true);
      for (const value of paths) reserve('domain_component', value, 'surface');
    }
    for (const [role, paths] of Object.entries(declaration?.private_paths || {})) for (const value of paths) reserve(role, value, 'private');
    for (const value of declaration?.test_paths || []) reserve('test', value, 'test');
    if (kind !== 'screen') continue;
    const analysis = analyzeApiCandidateContract(spec, { layout, domain });
    analyses.set(owner, analysis);
    for (const [state, candidates] of [['active', analysis.actionable_candidates], ['deferred', analysis.deferred_candidates]]) {
      if (analysis.version !== 2) continue;
      for (const candidate of candidates) for (const slice of candidate.safe_slice_paths || []) {
        claims.push({ owner, domain, artifact_id: context.artifact_id, file: context.file, kind: state,
          method: candidate.method, endpoint: candidate.path, confidence: candidate.confidence,
          gate: candidate.gate, tracking: candidate.tracking || null, path: narrow(slice),
          contract_valid: analysis.valid, row_valid: candidate.valid === true, api_required: entry.fm.api_required !== false,
          surface_kind: candidateSurfaceKind(slice, { hookSurfaces: rolePaths.hook || [], apiClientSurfaces: rolePaths.api_client || [] }) });
      }
    }
  }
  // Adapt parser facts to the existing cross-screen conflict detector. These are
  // NOT synthesized allowed paths or a fabricated integrated readiness result.
  const screenFacts = new Map([...analyses].map(([owner, analysis]) => [ownerParts(owner).id, { derived: {
    api_candidate_contract_version: analysis.version, api_actionable_candidates: analysis.actionable_candidates,
    api_deferred_candidates: analysis.deferred_candidates,
  } }]));
  const crossConflicts = union([...findApiCandidateOwnershipConflicts(screenFacts).values()].flat().map((row) => ({
    code: row.code, paths: union([row.path, row.conflicting_path]),
    owners: scopeSet(row.owners.map((entry) => ({ owner: `screen:${entry.screen_id}`, endpoint: entry.endpoint,
      gate: entry.gate, tracking: entry.tracking || null, path: entry.path }))),
  })));
  const units = base.projection.units.map((unit) => {
    const context = contexts.get(unit.owner);
    const selectedApi = api.unit(context.artifact_id, unit.owner, unit.declaration.id);
    const owned = reservations.filter((entry) => entry.owner === unit.owner && entry.role !== 'route');
    for (const selectedRow of selectedApi.candidates) for (const slice of selectedRow.candidate.safe_slice_paths || []) {
      const surface = candidateSurfaceKind(slice, { hookSurfaces: context.rolePaths.hook || [], apiClientSurfaces: context.rolePaths.api_client || [] });
      owned.push({ owner: unit.owner, domain: context.domain, artifact_id: context.artifact_id, file: context.file,
        role: surface === 'hook' ? 'hook' : surface === 'api-client' ? 'api_client' : null,
        path: narrow(slice), source: 'api', endpoint: selectedRow.selection });
    }
    const limits = base.projection.policy.role_limits[unit.declaration.kind] || [];
    return { owner: unit.owner, unit: unit.declaration.id, kind: unit.declaration.kind,
      profile_enabled: base.projection.policy.profiles.includes(unit.declaration.kind),
      role_limits: limits, roles: roles.map((role) => ({ role, enabled: limits.includes(role),
        layout_paths: context.rolePaths[role] || [], owned: union(owned.filter((entry) => entry.role === role)) })),
      unknown_api_paths: union(owned.filter((entry) => entry.role === null)) };
  });
  const roots = union(units.flatMap((unit) => [...unit.roles.flatMap((role) => role.owned), ...unit.unknown_api_paths]).map((entry) => entry.path));
  // Legacy host scope retains its exact declaration/reservations too. Its real
  // current base envelope must still be checked later; these facts do not open it.
  const legacyOwners = base.projection.owners.filter((entry) => !entry.adopted).map((entry) => entry.owner);
  roots.push(...reservations.filter((entry) => legacyOwners.includes(entry.owner)).map((entry) => entry.path));
  const overlaps = (value) => roots.some((root) => scopedPatternsOverlap(root, value));
  const globalRoles = [];
  for (const owner of selected) {
    const context = contexts.get(owner);
    for (const [role, paths] of Object.entries(context.rolePaths)) if (!roles.includes(role)) {
      for (const value of paths) if (overlaps(value)) globalRoles.push({ owner, role, path: value });
    }
  }
  const generated = generatedPatterns(manifest.data, path.relative(projectRoot, docsDir).split(path.sep).join('/'))
    .map((entry) => ({ ...entry, path: pattern(entry.path) })).filter((entry) => overlaps(entry.path));
  const result = { projection: { ...base.projection, ownership: {
    resources: { layout: layoutSource.relative, preset: preset?.relative ?? null, manifest: manifest.relative },
    units: scopeSet(units), requires_legacy_base: scopeSet(legacyOwners),
    reservations: union(reservations.filter((entry) => overlaps(entry.path))),
    api_claims: union(claims.filter((entry) => overlaps(entry.path))),
    api_conflicts: scopeSet(crossConflicts.filter((entry) => entry.paths.some(overlaps))),
    generated: union(generated), other_role_boundaries: union(globalRoles),
    explicit_denies: base.projection.policy.deny_paths,
  } }, read_set: scopeSet([...files.values()]) };
  for (const record of result.read_set) read(path.join(projectRoot, record.file), record.sha256);
  return result;
}
