// Shared manifest/check-6/visual ownership path contract. Invalid aliases are
// rejected, never normalized into new authority. No Git/worktree/global state.
import fs from 'node:fs';
import path from 'node:path';
import { globToRegExp } from './glob.mjs';

export class ArtifactPathError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ArtifactPathError';
    this.code = 'WF-ARTIFACT-PATH';
  }
}

function invalid(label, raw, reason) {
  throw new ArtifactPathError(`${label}: ${reason}: ${JSON.stringify(raw)}`);
}
function lexical(raw, label) {
  if (typeof raw !== 'string' || !raw || raw.trim() !== raw) invalid(label, raw, 'non-empty canonical relative path required');
  if (/^[A-Za-z]:|^\//.test(raw) || raw.includes('\\') || /[\x00-\x1f\x7f]/.test(raw)) {
    invalid(label, raw, 'absolute, backslash or control-character path is forbidden');
  }
  if (raw.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    invalid(label, raw, 'empty, dot or parent segment is forbidden');
  }
  return raw;
}

// Directory-entry names, not realpath string equality, define repository spelling.
// Inspect all existing segments even when the final output has not been generated.
export function canonicalRepositoryPath(root, raw, { label = 'artifact path', required = false, type = null } = {}) {
  const relative = lexical(raw, label);
  if (/[*?]/.test(relative)) invalid(label, raw, 'concrete path required');
  const absoluteRoot = path.resolve(root);
  const absolute = path.join(absoluteRoot, ...relative.split('/'));
  let cursor = absoluteRoot;
  const segments = relative.split('/');
  for (let index = 0; index < segments.length; index++) {
    let names;
    try { names = fs.readdirSync(cursor); }
    catch (error) {
      if (!required && error.code === 'ENOENT') return { relative, absolute, exists: false };
      invalid(label, raw, `cannot inspect directory (${error.code || error.message})`);
    }
    const segment = segments[index];
    const next = path.join(cursor, segment);
    if (!names.includes(segment)) {
      // A case-insensitive filesystem may still resolve this noncanonical name.
      try {
        fs.lstatSync(next);
        invalid(label, raw, 'spelling differs from repository directory entry');
      } catch (error) {
        if (error instanceof ArtifactPathError) throw error;
        if (error.code !== 'ENOENT') invalid(label, raw, `cannot inspect segment (${error.code})`);
        if (required) invalid(label, raw, 'required repository path is missing');
        return { relative, absolute, exists: false };
      }
    }
    const stat = fs.lstatSync(next);
    if (stat.isSymbolicLink()) invalid(label, raw, 'symlink/junction segment is forbidden');
    if (index < segments.length - 1 && !stat.isDirectory()) invalid(label, raw, 'intermediate segment is not a directory');
    if (index === segments.length - 1) {
      if (type === 'file' && !stat.isFile()) invalid(label, raw, 'regular file required');
      if (type === 'directory' && !stat.isDirectory()) invalid(label, raw, 'directory required');
    }
    cursor = next;
  }
  const physicalRelative = path.relative(fs.realpathSync(absoluteRoot), fs.realpathSync(absolute));
  if (physicalRelative === '..' || physicalRelative.startsWith(`..${path.sep}`) || path.isAbsolute(physicalRelative)) {
    invalid(label, raw, 'physical path escapes repository root');
  }
  return { relative, absolute, exists: true };
}

export function canonicalManifestPattern(raw, { docsRelative = 'docs/frontend-workflow', label = 'manifest output' } = {}) {
  lexical(raw, label);
  lexical(docsRelative, 'docs root');
  for (const segment of raw.split('/')) {
    // {...} is a single-segment named placeholder, not brace alternation. Bracket
    // route names stay literal, as in the shared glob mini-engine.
    const withoutPlaceholders = segment.replace(/\{[A-Za-z_][A-Za-z0-9_-]*\}/g, 'X');
    if (/[{}]/.test(withoutPlaceholders)) invalid(label, raw, 'unsupported placeholder/brace syntax');
    if (segment.includes('**') && segment !== '**') invalid(label, raw, '** must occupy a complete segment');
  }
  const prefix = 'docs/frontend-workflow/';
  return raw.startsWith(prefix) ? `${docsRelative}/${raw.slice(prefix.length)}` : raw;
}

export function manifestGeneratedPaths(artifact, artifactId = 'generated') {
  const out = [];
  if (Object.prototype.hasOwnProperty.call(artifact, 'path')) {
    out.push({ raw: artifact.path, primary: true, label: `${artifactId}.path` });
  }
  if (artifact.outputs != null && !Array.isArray(artifact.outputs)) {
    invalid(`${artifactId}.outputs`, artifact.outputs, 'array required');
  }
  for (const [index, output] of (artifact.outputs || []).entries()) {
    out.push({
      raw: typeof output === 'string' ? output : output?.path,
      primary: false,
      label: `${artifactId}.outputs[${index}].path`,
    });
  }
  return out;
}

// Walk pattern segments rather than following path.join aliases or silently
// dropping symlinked glob roots. Every concrete/static segment gets the same
// spelling and confinement check; wildcard matches are actual directory entries.
export function resolveManifestFiles(root, raw, options = {}) {
  const pattern = canonicalManifestPattern(raw, options);
  const label = options.label || 'manifest output';
  const segments = pattern.split('/');
  const matcher = globToRegExp(pattern);
  const dynamicPattern = /[*?{]/.test(pattern);
  const files = new Set();
  const visited = new Set();
  function visit(relative, index) {
    const key = `${index}:${relative}`;
    if (visited.has(key)) return;
    visited.add(key);
    const absolute = relative ? path.join(root, ...relative.split('/')) : root;
    if (index === segments.length) {
      if (relative && matcher.test(relative)) {
        // Globs enumerate regular files, as the original walkFiles consumer did.
        // A directory matching '*.ts' or trailing '**' is not itself an output.
        const ref = canonicalRepositoryPath(root, relative, { label, type: dynamicPattern ? null : 'file' });
        if (ref.exists && fs.lstatSync(ref.absolute).isFile()) files.add(ref.absolute);
      }
      return;
    }
    let names;
    try { names = fs.readdirSync(absolute, { withFileTypes: true }); }
    catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return;
      throw error;
    }
    const segment = segments[index];
    const dynamic = /[*?{]/.test(segment);
    if (!dynamic) {
      const child = relative ? `${relative}/${segment}` : segment;
      const ref = canonicalRepositoryPath(root, child, { label });
      if (ref.exists) visit(child, index + 1);
      return;
    }
    if (segment === '**') visit(relative, index + 1);
    const segmentMatcher = globToRegExp(segment);
    for (const entry of names.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      if (!segmentMatcher.test(entry.name)) continue;
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      canonicalRepositoryPath(root, child, { label }); // rejects intermediate aliases, including dangling symlinks
      if (segment === '**') {
        if (entry.isDirectory()) visit(child, index);
        else if (index === segments.length - 1) visit(child, index + 1);
      } else visit(child, index + 1);
    }
  }
  visit('', 0);
  return [...files].sort();
}
