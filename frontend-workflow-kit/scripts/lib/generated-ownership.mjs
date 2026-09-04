import fs from 'node:fs';
import path from 'node:path';

import { GENERATED_HEADER_RE, globToRegExp } from './glob.mjs';
import { readFileSafe } from './util.mjs';

function toPosix(value) {
  return String(value).split(path.sep).join('/');
}

function manifestOutputs(entry) {
  if (!Array.isArray(entry?.outputs)) return [];
  return entry.outputs
    .map((output) => {
      if (typeof output === 'string') return output;
      return typeof output?.path === 'string' ? output.path : null;
    })
    .filter(Boolean);
}

function remapDocs(pattern, docsRelative) {
  const raw = String(pattern).replace(/\\/g, '/');
  const canonical = 'docs/frontend-workflow/';
  return raw.startsWith(canonical)
    ? `${docsRelative}/${raw.slice(canonical.length)}`
    : raw;
}

// Common generated ownership contract: an active manifest output is only owned when
// the concrete regular file also carries the canonical GENERATED/DO NOT EDIT marker.
// This keeps broad codegen output globs from claiming human-authored files.
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
    if (
      artifact.kind !== 'generated' ||
      artifact.generated !== true ||
      artifact.do_not_edit !== true ||
      artifact.status !== 'active'
    ) {
      continue;
    }
    const patterns = [artifact.path, ...manifestOutputs(artifact)].filter(Boolean);
    for (const [index, pattern] of patterns.entries()) {
      entries.push({
        owner_id: `generated:${artifactId}:${index}`,
        artifact_id: artifactId,
        pattern: remapDocs(pattern, docsRelative),
        status: artifact.status,
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

function concreteFile(root, file) {
  return path.join(root, ...String(file).split('/'));
}

export function resolveGeneratedOwnership({ file, entries = [], roots = [] } = {}) {
  const normalized = toPosix(file);
  const matching = entries.filter((entry) => globToRegExp(entry.pattern).test(normalized));
  const owners = [];
  for (const entry of matching) {
    for (const rootEntry of roots) {
      const root = typeof rootEntry === 'string' ? rootEntry : rootEntry?.root;
      if (!root) continue;
      const absolute = concreteFile(root, normalized);
      if (!hasGeneratedOwnershipHeader(absolute)) continue;
      owners.push({
        ...entry,
        file: normalized,
        matched_pattern: entry.pattern,
        snapshot: typeof rootEntry === 'string' ? 'snapshot' : rootEntry.kind || 'snapshot',
      });
      break;
    }
  }
  if (owners.length === 0) return null;
  owners.sort((left, right) => left.owner_id.localeCompare(right.owner_id));
  return {
    ...owners[0],
    ambiguous: owners.length > 1,
    owners,
  };
}
