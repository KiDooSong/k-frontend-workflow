// D32 (B §10.1): the adoption marker read by ordinary/current/legacy concrete path
// judgments. An adopted owner's scoped paths need authority:scoped with a unit;
// current/legacy/visual-refresh v1 authority returns work-selection-required there
// instead of a broad allow. A repository without a policy work_execution section
// gets an empty marker, so unadopted results stay byte-compatible.
import path from 'node:path';
import { splitFrontmatter, walkFiles, readFileSafe } from './util.mjs';
import { ownerParts } from './current-work-request.mjs';
import { ScopedWorkContractError } from './scoped-work-request.mjs';
import { parseScopedOwner, parseScopedPolicy } from './scoped-work-declarations.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-ADOPTION: ${message}`); };
const byBytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
export const NO_ADOPTED_WORK = Object.freeze({ owners: Object.freeze([]), paths: Object.freeze([]) });

// `policy` is the implementation-mode policy object the caller already loaded.
// `claims` is the project-wide API candidate claim set; an adopted screen's active
// Slice Paths are governed by its scoped api-contract/behavior units.
export function adoptedWorkPaths({ docsDir, policy, claims = { active: [], denied: [] } } = {}) {
  if (!policy || typeof policy !== 'object' || !Object.hasOwn(policy, 'work_execution')) return NO_ADOPTED_WORK;
  const scoped = parseScopedPolicy(policy.work_execution);
  if (!scoped || !scoped.owners.length) return NO_ADOPTED_WORK;
  if (typeof docsDir !== 'string') fail('docs directory required to read adopted owner declarations');
  const owners = new Map();
  // The same canonical Markdown domain as the scoped target index: docs except _meta.
  for (const file of walkFiles(docsDir, ['.md'])) {
    if (path.relative(docsDir, file).split(path.sep).includes('_meta')) continue;
    const { data, hasFrontmatter, parseError } = splitFrontmatter(readFileSafe(file) ?? '');
    if (!hasFrontmatter || parseError || !data) continue;
    const kind = data.artifact_type === 'screen-spec' ? 'screen' : data.artifact_type === 'shared-surface-spec' ? 'surface' : null;
    if (!kind || typeof data[`${kind}_id`] !== 'string') continue;
    const owner = `${kind}:${data[`${kind}_id`]}`;
    if (!scoped.owners.includes(owner)) continue;
    if (owners.has(owner)) fail(`ambiguous adopted owner ${owner}`);
    owners.set(owner, data);
  }
  const paths = [];
  const add = (owner, value, source) => {
    if (typeof value !== 'string' || !value) fail(`adopted ${owner} ${source} path required`);
    paths.push({ owner, path: value, source });
  };
  for (const owner of scoped.owners) {
    const parts = ownerParts(owner), fm = owners.get(owner);
    if (!fm) fail(`adopted owner has no canonical document: ${owner}`);
    const declaration = parseScopedOwner(fm.work_execution, owner);
    if (!declaration) fail(`adopted owner lacks work units: ${owner}`);
    if (parts.kind === 'screen' && Object.hasOwn(fm, 'screen_entry')) add(owner, fm.screen_entry, 'screen_entry');
    if (parts.kind === 'surface') for (const value of fm.implementation_paths || []) add(owner, value, 'implementation_paths');
    for (const [role, values] of Object.entries(declaration.private_paths || {})) for (const value of values) add(owner, value, `private_paths.${role}`);
    for (const value of declaration.test_paths || []) add(owner, value, 'test_paths');
    if (parts.kind === 'screen') {
      for (const claim of claims.active || []) if (claim.screen_id === parts.id) add(owner, claim.path, 'api_candidate_slice');
    }
  }
  const unique = new Map(paths.map((entry) => [`${entry.owner}\0${entry.path}\0${entry.source}`, entry]));
  return Object.freeze({ owners: [...scoped.owners].sort(byBytes),
    paths: [...unique.values()].sort((a, b) => byBytes(a.path, b.path) || byBytes(a.owner, b.owner) || byBytes(a.source, b.source)) });
}
