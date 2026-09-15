import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DEFAULTS, KIT_ROOT, yamlParse } from './util.mjs';
import { computeReadiness } from '../readiness-legacy.mjs';
import { loadLayoutProfile, synthesizeModePolicy } from './layout-profile.mjs';
import { collectApiCandidateClaims, globMatches, parseNameStatusZ, readinessPathAuthorization } from './path-backstop.mjs';
import { collectInputArtifacts, validateInputArtifacts } from './input-artifact.mjs';
import { buildInputArtifactIndex, resolveInputArtifact, resolveInputEvidence } from './provenance.mjs';
import { parseReconciliationRegister } from './reconciliation-register.mjs';
import { parseReconciliationItems, parseTargetRef } from './reconciliation-items.mjs';
import { resolveArtifact, isDuplicateArtifactId, artifactHasSection, resolveChildRow } from './reconciliation-target-index.mjs';
import { discoverArtifacts } from './check-generated-files.mjs';
import { readJson, normalizeWorkRequest, digest, hashBytes, ownerParts, byteCompare } from './current-work-request.mjs';
import { materializeRawGitTree, requireGitRepositoryPath, runVisualGit, decodeGitUtf8 } from './visual-refresh-git-objects.mjs';

export class CurrentWorkExecutionError extends Error {
  constructor(message, code = 'CW-INPUT') { super(message); this.name = 'CurrentWorkExecutionError'; this.code = code; }
}

export const REGULAR_MODES = new Set(['100644', '100755']);
export const AUTHORITY_BASENAMES = new Set([
  'implementation-mode-policy.yaml', 'artifact-manifest.yaml', 'project-layout.yaml',
  'workflow-state.yaml', 'reconciliation-register.md', 'open-decisions.md', 'decision-log.md',
]);

export function outside(root, target) {
  const rel = path.relative(root, target);
  return rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}
export function posix(v) { return String(v).replace(/\\/g, '/'); }
export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort(byteCompare).map((key) => [key, stable(value[key])]));
  }
  return value;
}
export function yamlFile(file, label, { optional = false, maxAliasCount = 100 } = {}) {
  if (!file || !fs.existsSync(file)) {
    if (optional) return {};
    throw new CurrentWorkExecutionError(`${label}: file not found`);
  }
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) throw new CurrentWorkExecutionError(`${label}: regular file required`);
  const raw = fs.readFileSync(file);
  if (raw.length > 16 * 1024 * 1024) throw new CurrentWorkExecutionError(`${label}: exceeds 16 MiB input limit`);
  try { return yamlParse(raw.toString('utf8'), { maxAliasCount }) || {}; }
  catch (error) { throw new CurrentWorkExecutionError(`${label}: invalid YAML: ${error.message}`); }
}
export function projectRelative(projectRoot, absolute, label) {
  const resolved = path.resolve(absolute);
  if (outside(projectRoot, resolved)) throw new CurrentWorkExecutionError(`${label}: path must stay inside --root`);
  const rel = posix(path.relative(projectRoot, resolved));
  if (!rel) throw new CurrentWorkExecutionError(`${label}: file path required`);
  requireGitRepositoryPath(rel, label);
  return rel;
}
export function resolveProjectPath(projectRoot, value, fallback, label) {
  const absolute = value
    ? (path.isAbsolute(value) ? path.resolve(value) : path.resolve(projectRoot, value))
    : (path.isAbsolute(fallback) ? path.resolve(fallback) : path.resolve(projectRoot, fallback));
  return { absolute, relative: projectRelative(projectRoot, absolute, label) };
}
export function resolveProjectRoot(root) {
  const candidate = path.resolve(process.cwd(), root || '.');
  let real;
  try {
    if (!fs.statSync(candidate).isDirectory()) throw new Error('not a directory');
    real = fs.realpathSync(candidate);
  } catch (error) { throw new CurrentWorkExecutionError(`--root: cannot resolve directory (${error.message})`); }
  let repositoryRoot;
  try {
    repositoryRoot = fs.realpathSync(String(runVisualGit(['rev-parse', '--show-toplevel'], real, { encoding: 'utf8' })).trim());
  } catch (error) { throw new CurrentWorkExecutionError(`--root: Git repository required (${error.message})`); }
  if (outside(repositoryRoot, real)) throw new CurrentWorkExecutionError('--root: outside Git repository');
  const prefix = posix(path.relative(repositoryRoot, real));
  if (prefix) requireGitRepositoryPath(prefix, 'project prefix');
  return { projectRoot: real, repositoryRoot, projectPrefix: prefix };
}
export function gitIdentity(repositoryRoot) {
  try {
    const commit = String(runVisualGit(['rev-parse', '--verify', 'HEAD^{commit}'], repositoryRoot, { encoding: 'utf8' })).trim();
    const tree = String(runVisualGit(['rev-parse', '--verify', 'HEAD^{tree}'], repositoryRoot, { encoding: 'utf8' })).trim();
    return { commit, tree };
  } catch (error) { throw new CurrentWorkExecutionError(`Git HEAD required (${error.message})`); }
}
export function modeIndex(order, mode) { return Array.isArray(order) ? order.indexOf(mode) : -1; }
export function invalidBlocker(blocker) {
  if (!blocker || typeof blocker !== 'object' || Array.isArray(blocker)) return true;
  return Object.keys(blocker).some((key) => key.startsWith('invalid_') || key === 'shared_surface_contract');
}
export function exactSurfaceAuthorization(entry, file, ownerId, order) {
  return readinessPathAuthorization({
    file, screenId: ownerId, entry, modeOrder: order,
    claims: { active: [], denied: [] },
  });
}
export function screenDomain(state, parts) {
  if (parts.kind === 'screen') return state.screens?.[parts.id]?.domain ?? null;
  return state.surfaces?.[parts.id]?.domain ?? null;
}
export function effectiveOrder(policy, layout, domain) {
  const effective = layout?.layerTelemetryDeclared
    ? synthesizeModePolicy(policy, layout, { includeGates: false, domain })
    : policy;
  return Array.isArray(effective?.order) ? effective.order : Object.keys(effective?.modes || {});
}
export function selectedInputErrors(validation, resolution) {
  if (resolution.status !== 'ok') return validation.errors || [];
  return (validation.errors || []).filter((error) => error.file === resolution.artifact.file);
}
export function artifactProjectPath(snapshotRoot, artifact) { return posix(path.relative(snapshotRoot, artifact.file)); }
export function inputHash(artifact) { return hashBytes(fs.readFileSync(artifact.file)); }
export function relatedToOwner(artifact, parts, state, items, targetIndex) {
  const screens = Array.isArray(artifact.fm?.affected_screens)
    ? artifact.fm.affected_screens
    : Array.isArray(artifact.fm?.suggested_scope?.screens) ? artifact.fm.suggested_scope.screens : [];
  if (parts.kind === 'screen' && screens.includes(parts.id)) return true;
  if (parts.kind === 'surface') {
    const members = state.surfaces?.[parts.id]?.member_screens || [];
    if (members.some((id) => screens.includes(id))) return true;
  }
  return (items || []).some((row) => {
    if (row.inputId !== artifact.fm?.input_id) return false;
    const ref = parseTargetRef(row.target);
    const id = ref?.artifactId || ref?.ownerArtifactId;
    if (!id || isDuplicateArtifactId(targetIndex, id)) return false;
    const resolved = resolveArtifact(targetIndex, id);
    if (!resolved) return false;
    if (ref.kind === 'artifact' && ref.section && !artifactHasSection(resolved, ref.section)) return false;
    if (ref.ownerArtifactId && !resolveChildRow(resolved, ref.rowId, ref.kind).found) return false;
    const ownerId = resolved.fm?.[parts.kind === 'screen' ? 'screen_id' : 'surface_id'];
    const domain = screenDomain(state, parts);
    // Artifact IDs and external Source Refs are not owner identifiers. Alias
    // artifact IDs are valid, but their resolved typed owner must match exactly.
    return ownerId === parts.id && (domain == null || resolved.fm.domain === domain);
  });
}
export function generatedPatterns(manifest, docsRelative) {
  const out = [];
  for (const artifact of discoverArtifacts(manifest, { allowlist: [] })) {
    if (!artifact.generated || artifact.do_not_edit !== true) continue;
    const paths = [artifact.path, ...(artifact.outputs || []).map((entry) => entry.path)].filter(Boolean);
    for (let raw of paths) {
      raw = String(raw).replace(/\\/g, '/');
      if (raw.startsWith('docs/frontend-workflow/')) raw = `${docsRelative}/${raw.slice('docs/frontend-workflow/'.length)}`;
      out.push({ artifact_id: artifact.id, path: raw.replace(/\{domain\}|\{screen\}|\{surface\}/g, '*') });
    }
  }
  return out;
}
export function generatedOwner(file, patterns) { return patterns.find((entry) => globMatches(entry.path, file)) || null; }
