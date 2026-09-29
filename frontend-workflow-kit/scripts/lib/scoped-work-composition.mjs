// D29: compose every selected scoped request. A request needs its owner's own
// profile/path/Decision prerequisites and, for a surface, every host's
// prerequisites and consent. A target selected by several requests is allowed
// only when every responsible request allows it. This is not an execution permit:
// the immutable baseline and the actual Git before/after checks stay mandatory.
import fs from 'node:fs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { ownerParts, readCurrentBytes, hashBytes, byteCompare } from './current-work-request.mjs';
import { ScopedWorkContractError, normalizeScopedWorkRequestSyntax } from './scoped-work-request.mjs';
import { inspectScopedOwner } from './scoped-work-owner.mjs';
import { inspectScopedSurfaceHosts } from './scoped-work-hosts.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-COMPOSE: ${message}`); };
const same = (left, right) => scopeJson(left) === scopeJson(right);
const union = (values) => scopeSet([...new Set(values)]);
const RESOURCE_KEYS = ['projectRoot', 'docsDir', 'kitRoot', 'policyFile', 'layoutFile', 'manifestFile',
  'registerFile', 'ciFile', 'targetIndex', 'inputArtifacts'];

export function inspectScopedWorkRequests(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('options object required');
  for (const key of Object.keys(options)) if (key !== 'request' && !RESOURCE_KEYS.includes(key)) fail(`unsupported caller option ${key}`);
  // Normalize the caller document again; a pre-normalized object is not trusted.
  const request = normalizeScopedWorkRequestSyntax(options.request);
  if (request.requests.some((entry) => entry.authority !== 'scoped')) fail('current requests are evaluated by current work, not composed as scoped');
  const resources = Object.fromEntries(RESOURCE_KEYS.filter((key) => Object.hasOwn(options, key)).map((key) => [key, options[key]]));
  const { projectRoot } = resources;
  const files = new Map(), directories = new Map(), targets = new Map(), components = new Map();
  const canonical = (file, required = false, type) => canonicalRepositoryPath(projectRoot, file,
    { required, ...(type ? { type } : {}), label: 'scoped composition observation' });
  function merge(map, entries, key, label) {
    for (const entry of entries ?? []) {
      if (map.has(entry[key]) && !same(map.get(entry[key]), entry)) fail(`${label} changed between requests: ${entry[key]}`);
      map.set(entry[key], entry);
    }
  }
  function absorb(result) {
    merge(files, result.read_set, 'file', 'authority');
    merge(directories, result.directory_read_set, 'file', 'evidence directory');
    merge(targets, result.target_read_set, 'path', 'target');
    merge(components, result.component_read_set, 'path', 'mapped component');
  }
  function observe(file) {
    const selected = canonical(file, false, 'file');
    if (!selected.exists) return { path: file, exists: false };
    const stat = fs.lstatSync(selected.absolute);
    return { path: file, exists: true, executable: Boolean(stat.mode & 0o111),
      sha256: hashBytes(readCurrentBytes(selected.absolute, 'scoped composition target')) };
  }
  function audit() {
    for (const entry of files.values()) {
      if (hashBytes(readCurrentBytes(canonical(entry.file, true, 'file').absolute, 'scoped composition authority')) !== entry.sha256) {
        fail(`authority snapshot changed: ${entry.file}`);
      }
    }
    for (const entry of directories.values()) {
      const selected = canonical(entry.file);
      let actual = null;
      if (selected.exists) {
        if (!fs.lstatSync(selected.absolute).isDirectory()) fail('evidence directory changed type');
        actual = fs.readdirSync(selected.absolute, { withFileTypes: true }).map((item) =>
          [item.name, item.isDirectory() ? 'directory' : item.isFile() ? 'file' : 'unsupported'])
          .sort(([a], [b]) => byteCompare(a, b));
      }
      if (!same(actual, entry.entries)) fail(`evidence directory membership changed: ${entry.file}`);
    }
    for (const map of [targets, components]) for (const entry of map.values()) {
      if (!same(observe(entry.path), entry)) fail(`observed path changed: ${entry.path}`);
    }
  }

  const results = [];
  for (const selected of request.requests) {
    // Every responsibility, including a surface host subrequest, keeps the same origins.
    const args = { ...resources, owner: selected.owner, unit: selected.unit, targets: selected.targets,
      origin_inputs: request.origin_inputs, coverage_reports: selected.coverage_reports };
    const own = inspectScopedOwner(args); absorb(own);
    if (own.owner !== selected.owner || own.unit !== selected.unit || typeof own.owner_satisfied !== 'boolean') fail('owner observation mismatch');
    let hosts = null;
    if (ownerParts(selected.owner).kind === 'surface') {
      hosts = inspectScopedSurfaceHosts(args); absorb(hosts);
      if (hosts.owner !== selected.owner || hosts.unit !== selected.unit || hosts.kind !== own.kind ||
        typeof hosts.hosts_satisfied !== 'boolean') fail('surface host observation mismatch');
    }
    const selectedPaths = new Set(selected.targets.map((target) => target.path));
    const denials = [...own.denials, ...(hosts?.denials ?? [])];
    // Path-specific reasons stay with their target; every other reason is a request
    // prerequisite and blocks all of its targets.
    const pathReasons = (file) => denials.filter((entry) => entry.path === file);
    const general = denials.filter((entry) => !selectedPaths.has(entry.path));
    results.push({ owner: selected.owner, authority: 'scoped', unit: selected.unit, kind: own.kind,
      coverage_reports: selected.coverage_reports, targets: selected.targets,
      path_authorizations: selected.targets.map((target) => ({ ...target, reasons: scopeSet(pathReasons(target.path)),
        allowed: pathReasons(target.path).length === 0 && general.length === 0 })),
      prerequisite_denials: scopeSet(general), owner_satisfied: own.owner_satisfied,
      hosts_satisfied: hosts ? hosts.hosts_satisfied : null, owner_result: own, host_result: hosts });
  }

  // A shared target is an AND of every responsible request; one allow never
  // cancels another request's deny for the same path.
  const responsibilities = new Map();
  for (const result of results) for (const entry of result.path_authorizations) {
    if (!responsibilities.has(entry.path)) responsibilities.set(entry.path, []);
    responsibilities.get(entry.path).push({ owner: result.owner, unit: result.unit, change: entry.change, allowed: entry.allowed });
  }
  const shared = [...responsibilities].filter(([, list]) => list.length > 1).map(([file, list]) =>
    ({ path: file, responsibilities: scopeSet(list), allowed: list.every((entry) => entry.allowed) }));
  for (const result of results) {
    for (const entry of result.path_authorizations) {
      const joint = shared.find((item) => item.path === entry.path);
      if (joint && !joint.allowed && entry.allowed) {
        entry.allowed = false;
        entry.reasons = scopeSet([...entry.reasons, { code: 'shared-target-responsibility-denied', path: entry.path,
          owner: result.owner, unit: result.unit, responsibilities: joint.responsibilities.filter((item) => !item.allowed) }]);
      }
    }
    result.ready = result.owner_satisfied && result.hosts_satisfied !== false &&
      result.path_authorizations.every((entry) => entry.allowed);
  }
  audit();
  const ready = results.every((result) => result.ready) && shared.every((entry) => entry.allowed);
  // The same reason can be reported by several targets of one request; keep it once.
  const denials = new Map(results.flatMap((result) => [...result.prerequisite_denials,
    ...result.path_authorizations.flatMap((entry) => entry.reasons)]).map((entry) => [scopeJson(entry), entry]));
  return structuredClone({ work_contract: 1, authority: 'scoped', origin_inputs: request.origin_inputs,
    requests: results, shared_targets: scopeSet(shared), ready, denials: scopeSet([...denials.values()]),
    read_set: scopeSet([...files.values()]), directory_read_set: scopeSet([...directories.values()]),
    target_read_set: scopeSet([...targets.values()]), component_read_set: scopeSet([...components.values()]),
    approval_verified: false, permission_evaluated: false, semantic_coverage_verified: false,
    required_checks: ['Immutable original Git baseline and actual before/after authority, request, origin, paths and modes',
      'Public CLI integration and adopted-path fallback/rollback guards'],
    required_reviews: union(results.flatMap((result) => [...result.owner_result.required_reviews,
      ...(result.host_result?.required_reviews ?? [])])) });
}
