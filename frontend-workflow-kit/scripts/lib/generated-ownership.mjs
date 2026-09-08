import fs from 'node:fs';

import { GENERATED_HEADER_RE, globToRegExp } from './glob.mjs';
import { readFileSafe } from './util.mjs';
import {
  canonicalManifestPattern, canonicalRepositoryPath, manifestGeneratedPaths, resolveManifestFiles,
} from './artifact-path.mjs';

// Shared selector with validate check 6. status is generator availability, and
// generated:true is descriptive metadata, not permission to shed do_not_edit.
export function collectGeneratedOwnershipEntries(
  manifest,
  { docsRelative = 'docs/frontend-workflow' } = {},
) {
  const artifacts = manifest?.artifacts && typeof manifest.artifacts === 'object'
    ? manifest.artifacts
    : {};
  const entries = [];
  for (const artifactId of Object.keys(artifacts).sort()) {
    const artifact = artifacts[artifactId] || {};
    if (artifact.kind !== 'generated' || artifact.do_not_edit !== true) continue;
    for (const [index, output] of manifestGeneratedPaths(artifact, artifactId).entries()) {
      entries.push({
        owner_id: `generated:${artifactId}:${index}`,
        artifact_id: artifactId,
        pattern: canonicalManifestPattern(output.raw, { docsRelative, label: output.label }),
        status: artifact.status || null,
        do_not_edit: true,
        origin: 'artifact-manifest+generated-header',
      });
    }
  }
  return entries;
}

export function hasGeneratedOwnershipHeader(absolutePath) {
  try {
    const stat = fs.lstatSync(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    const head = (readFileSafe(absolutePath) || '').slice(0, 400);
    return GENERATED_HEADER_RE.test(head);
  } catch {
    return false;
  }
}

export function resolveGeneratedOwnership({ file, entries = [], roots = [] } = {}) {
  // Runtime calls this for the selected stable screen BEFORE any exact-path
  // grant. Check that target even when no generated pattern matches it. Thus a
  // selected declaration cannot authorize its own case/intermediate-symlink
  // alias: source and destination must both use the same canonical `file` value.
  // Missing files remain absence; the authority core owns existence/lifecycle.
  for (const rootEntry of roots) {
    const root = typeof rootEntry === 'string' ? rootEntry : rootEntry?.root;
    if (root) canonicalRepositoryPath(root, file, { label: 'visual concrete ownership target', type: 'file' });
  }
  // Validate declarations BEFORE matching the requested file. Otherwise an alias
  // fails the string match and silently removes the generated final deny.
  for (const entry of entries) {
    canonicalManifestPattern(entry.pattern);
    for (const rootEntry of roots) {
      const root = typeof rootEntry === 'string' ? rootEntry : rootEntry?.root;
      if (root) resolveManifestFiles(root, entry.pattern, { label: entry.owner_id || 'generated output' });
    }
  }
  const matching = entries.filter((entry) => globToRegExp(entry.pattern).test(file));
  const owners = [];
  for (const entry of matching) {
    for (const rootEntry of roots) {
      const root = typeof rootEntry === 'string' ? rootEntry : rootEntry?.root;
      if (!root) continue;
      const ref = canonicalRepositoryPath(root, file, { label: 'generated concrete file', type: 'file' });
      if (!ref.exists || !hasGeneratedOwnershipHeader(ref.absolute)) continue;
      owners.push({
        ...entry,
        file,
        matched_pattern: entry.pattern,
        snapshot: typeof rootEntry === 'string' ? 'snapshot' : rootEntry.kind || 'snapshot',
      });
      break;
    }
  }
  if (owners.length === 0) return null;
  owners.sort((left, right) => left.owner_id.localeCompare(right.owner_id));
  return { ...owners[0], ambiguous: owners.length > 1, owners };
}
