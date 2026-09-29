// Compose one owner's file-backed prerequisites. This is not an execution
// permit: every host/co-owner and original Git before/after checks are mandatory.
import fs from 'node:fs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { ownerParts, readCurrentBytes, hashBytes } from './current-work-request.mjs';
import { ScopedWorkContractError, workUnitId } from './scoped-work-request.mjs';
import { inspectScopedProfile } from './scoped-work-profiles.mjs';
import { inspectScopedPaths } from './scoped-work-paths.mjs';
import { inspectScopedDecisionScopes } from './scoped-work-decision-scopes.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-OWNER: ${message}`); };
const same = (left, right) => scopeJson(left) === scopeJson(right);
const byBytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

export function inspectScopedOwner(options = {}) {
  const { owner, unit, projectRoot } = options;
  ownerParts(owner); workUnitId(unit);
  // Only canonical resource selectors are inputs. Serialized intermediate
  // verdicts must never replace a check on the actual files.
  for (const key of ['profile_result', 'path_result', 'decision_result', 'owner_result',
    'approved', 'approval_verifier', 'decisions_clear', 'owner_satisfied']) {
    if (Object.hasOwn(options, key)) fail(`caller ${key} is not authority`);
  }
  const profile = inspectScopedProfile(options);
  const paths = inspectScopedPaths(options);
  const decisions = inspectScopedDecisionScopes(options);
  if (profile.owner !== owner || paths.owner !== owner || decisions.owner !== owner ||
    profile.unit !== unit || paths.unit !== unit || profile.kind !== paths.kind) fail('owner/unit observations disagree');
  const checks = decisions.unit_checks.filter((entry) => entry.unit === unit);
  if (checks.length !== 1 || !decisions.known_units.includes(unit)) fail('canonical Decision unit missing or ambiguous');
  if (typeof profile.profile_satisfied !== 'boolean' || typeof paths.boundary_satisfied !== 'boolean' ||
    typeof checks[0].decisions_clear !== 'boolean') fail('incomplete prerequisite result');

  const files = new Map();
  for (const group of [profile.read_set, paths.read_set, decisions.read_set]) for (const entry of group) {
    if (files.has(entry.file) && files.get(entry.file).sha256 !== entry.sha256) fail('authority changed between prerequisite checks');
    files.set(entry.file, entry);
  }
  const canonical = (file, required = false, type) => canonicalRepositoryPath(projectRoot, file,
    { required, ...(type ? { type } : {}), label: 'scoped owner observation' });
  function auditFiles() {
    for (const entry of files.values()) {
      const selected = canonical(entry.file, true, 'file');
      if (hashBytes(readCurrentBytes(selected.absolute, 'scoped owner authority')) !== entry.sha256) fail('authority snapshot changed');
    }
  }
  function auditDirectories() {
    for (const entry of profile.directory_read_set) {
      const selected = canonical(entry.file);
      let actual = null;
      if (selected.exists) {
        if (!fs.lstatSync(selected.absolute).isDirectory()) fail('API evidence directory changed type');
        actual = fs.readdirSync(selected.absolute, { withFileTypes: true }).map((item) =>
          [item.name, item.isDirectory() ? 'directory' : item.isFile() ? 'file' : 'unsupported'])
          .sort(([a], [b]) => byBytes(a, b));
      }
      if (!same(actual, entry.entries)) fail('API evidence directory membership changed');
    }
  }
  function auditTargets() {
    for (const entry of paths.target_read_set) {
      const selected = canonical(entry.path, false, 'file');
      let actual = { path: entry.path, exists: false };
      if (selected.exists) {
        const stat = fs.lstatSync(selected.absolute);
        actual = { path: entry.path, exists: true, executable: Boolean(stat.mode & 0o111),
          sha256: hashBytes(readCurrentBytes(selected.absolute, 'scoped owner target')) };
      }
      if (!same(actual, entry)) fail('target snapshot changed between prerequisite checks');
    }
  }
  auditFiles(); auditDirectories(); auditTargets(); auditFiles();
  const decisionsClear = checks[0].decisions_clear;
  const denials = [
    ...profile.denials.map((entry) => ({ ...entry, prerequisite: 'profile' })),
    ...paths.paths.flatMap((entry) => entry.denials.map((reason) =>
      ({ ...reason, owner, unit, path: entry.path, prerequisite: 'path' }))),
    ...(!decisionsClear ? [{ code: 'unit-decision-blocked', owner, unit, prerequisite: 'decision',
      decisions: decisions.checks.filter((entry) => entry.blocking_units.includes(unit)).map((entry) => entry.decision) }] : []),
  ];
  return { owner, unit, kind: profile.kind,
    owner_satisfied: profile.profile_satisfied && paths.boundary_satisfied && decisionsClear,
    denials: scopeSet(denials), profile, path_policy: paths, decision_scopes: decisions,
    read_set: scopeSet([...files.values()]), directory_read_set: profile.directory_read_set,
    target_read_set: paths.target_read_set, host_units: paths.host_units,
    requires_legacy_base: paths.requires_legacy_base,
    approval_verified: false, permission_evaluated: false,
    required_checks: ['Every responsible owner and surface host (AND, including legacy-current base denies)',
      'Original HEAD/index and execution before/after authority, request, origin, paths and file modes',
      'Adopted-path fallback and rollback/downgrade guards'],
    required_reviews: [...new Set([...profile.required_reviews, ...paths.required_reviews, ...decisions.required_reviews])],
  };
}
