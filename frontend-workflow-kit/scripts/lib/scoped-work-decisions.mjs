// Canonical decision applicability for the R1 projection. Still NOT a complete
// scope-basis, permission, coverage result or approval. Public scoped execution
// remains disconnected until ownership, predicates and the Git backstop agree.
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { col, hasHeader } from './spec.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { readCurrentBytes, hashBytes, ownerParts } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { loadOpenDecisionRegister, resolveDecisionRefs, openDecisionRowIsMalformed,
  REQUIRED_OPEN_DECISION_COLUMNS } from './open-decisions.mjs';
import { parseTargetRef } from './reconciliation-items.mjs';
import { parseReconciliationMarkdown } from './reconciliation-markdown-ast.mjs';
import { createScopedReferenceResolver, scopedRawTable } from './scoped-work-refs.mjs';
import { resolveScopedContractGraph } from './scoped-work-graph.mjs';
import { resolveScopedUnitProjection, scopedProjectionMetadata, scopedProjectionNode } from './scoped-work-projection.mjs';
import { parseDecisionWorkScopes } from './scoped-work-declarations.mjs';
import { ScopedWorkContractError, workText, workSet, workPath } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-DECISIONS: ${message}`); };
const same = (a, b) => scopeJson(a) === scopeJson(b);
const union = (values) => scopeSet([...new Set(values)]);
const decisionId = (id) => {
  workText(id, 'decision reference');
  if (!/^D-[A-Za-z0-9-]+$/.test(id)) fail('decision_refs must name canonical global D- IDs');
  return id;
};

// Additional roots are additive, validated Conflict/Unknown evidence only. They
// cannot replace file-backed unit selection or supply an approval/permission.
export function resolveScopedDecisionProjection(options = {}, dependencyRoots = []) {
  const { owner, projectRoot, docsDir, targetIndex, inputArtifacts = [] } = options;
  const base = resolveScopedUnitProjection(options);
  if (typeof docsDir !== 'string' || !path.isAbsolute(docsDir) || path.resolve(docsDir) !== docsDir) {
    fail('canonical absolute docsDir required');
  }
  const docsRelative = path.relative(projectRoot, docsDir).split(path.sep).join('/');
  if (docsRelative) workPath(docsRelative, 'decision docs root');
  const globalFile = path.join(docsDir, 'global', 'open-decisions.md');
  const refs = createScopedReferenceResolver({ targetIndex, projectRoot, inputArtifacts });
  const files = new Map(base.read_set.map((entry) => [entry.file, entry]));
  const checked = new Map();
  const decisions = new Map();
  const applications = new Map();
  const referrers = new Map();
  const memberships = new Map();
  const graphNodes = new Map();
  const graphEdges = new Map();
  const graphRoots = new Set();
  const queued = [];
  const visited = new Set();
  const nativeRoutes = new Map();
  const homes = new Map();
  const entries = [...targetIndex.artifacts.values()];

  function audit(relative, expectedHash) {
    const file = canonicalRepositoryPath(projectRoot, relative, { required: true, type: 'file', label: 'scoped decision' });
    const raw = readCurrentBytes(file.absolute, 'scoped decision');
    const sha256 = hashBytes(raw);
    if ((expectedHash && expectedHash !== sha256) || (files.has(relative) && files.get(relative).sha256 !== sha256)) {
      fail('document changed during decision resolution');
    }
    files.set(relative, { file: relative, sha256 });
    return raw;
  }
  function document(id) {
    if (checked.has(id)) return checked.get(id);
    if (targetIndex.duplicates.has(id)) fail(`duplicate canonical artifact ${id}`);
    const entry = targetIndex.artifacts.get(id);
    if (!entry || typeof entry.file !== 'string' || !path.isAbsolute(entry.file) || path.resolve(entry.file) !== entry.file) {
      fail(`missing or invalid artifact ${id}`);
    }
    const relative = path.relative(projectRoot, entry.file).split(path.sep).join('/');
    const parsed = splitFrontmatter(decodeGitUtf8(audit(relative), 'scoped decision'));
    if (!parsed.hasFrontmatter || parsed.parseError || !same(parsed.data, entry.fm) || parsed.body !== entry.body) {
      fail(`artifact differs from its indexed snapshot: ${id}`);
    }
    const out = { ...entry, relative };
    checked.set(id, out);
    return out;
  }
  function remember(entry) {
    referrers.set(entry.fm.artifact_id, { artifact_id: entry.fm.artifact_id, file: entry.relative,
      metadata: scopedProjectionMetadata(entry.fm) });
  }
  function ownerDocument(id, includeMetadata = true) {
    const parts = ownerParts(id);
    const type = parts.kind === 'screen' ? 'screen-spec' : 'shared-surface-spec';
    const matches = entries.filter((entry) => entry.fm.artifact_type === type && entry.fm[`${parts.kind}_id`] === parts.id);
    if (matches.length !== 1) fail(`missing or ambiguous owner ${id}`);
    const entry = document(matches[0].fm.artifact_id);
    workText(entry.fm.domain, 'decision owner domain');
    if (includeMetadata) remember(entry);
    return entry;
  }

  // Verify the same indexed snapshot before using it for project-wide ID
  // collisions. Unrelated body bytes are audit inputs, not scope content.
  for (const entry of entries) {
    const current = document(entry.fm.artifact_id);
    for (const [id, rows] of current.rows) for (const row of rows) if (row.family === 'decision') {
      if (!homes.has(id)) homes.set(id, []);
      homes.get(id).push(current.fm.artifact_id);
    }
  }
  const collisions = new Set([...homes].filter(([, ids]) => ids.length !== 1).map(([id]) => id));
  let registry;
  function globalRegistry() {
    if (registry) return registry;
    const entry = document('open-decision-register');
    if (entry.file !== globalFile || entry.fm.artifact_type !== 'open-decision-register') fail('noncanonical global decision home');
    registry = loadOpenDecisionRegister({ docsDir });
    if (!registry.exists || registry.structuralErrors.length) fail('invalid canonical global decision register');
    return registry;
  }
  function decision(token) {
    if (decisions.has(token)) return decisions.get(token);
    const parsed = parseTargetRef(token);
    if (!parsed || parsed.kind !== 'decision') fail('canonical typed decision required');
    decisionId(parsed.rowId);
    const home = document(parsed.ownerArtifactId);
    if (home.fm.artifact_type === 'open-decision-register') {
      if (home.fm.artifact_id !== 'open-decision-register' || home.file !== globalFile) fail('noncanonical global decision home');
      globalRegistry();
    }
    else if (home.fm.artifact_type !== 'screen-spec') fail('decisions belong only to ScreenSpec or the global register');
    if (collisions.has(parsed.rowId) || homes.get(parsed.rowId)?.[0] !== parsed.ownerArtifactId) fail(`ambiguous decision ${parsed.rowId}`);
    const selected = refs.contract(token);
    const { headers, cells } = selected.selection;
    if (!headers || REQUIRED_OPEN_DECISION_COLUMNS.some((header) => !hasHeader(headers, header))) fail('missing decision columns');
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
    if (openDecisionRowIsMalformed({ id: col(row, 'ID'), decisionNeeded: col(row, 'Decision Needed'),
      blockingMode: col(row, 'Blocking Mode'), status: col(row, 'Status') })) fail(`malformed decision ${parsed.rowId}`);
    parseDecisionWorkScopes(home.fm.decision_work_scopes); // Validate; never adopt or mint a binding.
    const value = { ...scopedProjectionNode(selected), decision_id: parsed.rowId, status: col(row, 'Status').toLowerCase() };
    decisions.set(token, value);
    return value;
  }
  function enqueue(token, subject, uncertainty = null) {
    graphRoots.add(token);
    const key = scopeJson([subject.owner, subject.unit, token, uncertainty]);
    if (!visited.has(key)) queued.push({ token, subject, uncertainty });
  }
  function apply(token, subject, referrer, relation, native = false, uncertainty = null) {
    decision(token);
    const value = { ...subject, decision: token, referrer, relation,
      ...(uncertainty === null ? {} : { uncertainty }) };
    applications.set(scopeJson(value), value);
    if (native) {
      const key = scopeJson([subject.owner, token]);
      if (!nativeRoutes.has(key)) nativeRoutes.set(key, new Set());
      const routes = nativeRoutes.get(key);
      routes.add(referrer);
      if (routes.size > 1) fail(`duplicate native decision application to ${subject.owner}`);
    }
    enqueue(token, subject, uncertainty);
  }
  function globals(entry) {
    if (!Object.hasOwn(entry.fm, 'decision_refs')) return [];
    const ids = workSet(entry.fm.decision_refs, decisionId, 'decision_refs');
    if (!ids.length) return [];
    const resolved = resolveDecisionRefs({ refs: ids, registry: globalRegistry(), referrer: entry.fm, conflictingIds: collisions });
    if (resolved.malformed.length) fail(resolved.malformed.map((value) => value.code).join(', '));
    return ids.map((id) => `decision:${id}@open-decision-register`);
  }
  function locals(entry) {
    const sections = parseReconciliationMarkdown(entry.body).occurrences.filter((section) => section.slug === 'open-decisions');
    if (!sections.length) return [];
    if (entry.fm.artifact_type !== 'screen-spec') fail('shared surface must not own a local Open Decisions table');
    if (sections.length !== 1) fail('duplicate local Open Decisions section');
    const tables = sections[0].tables.map(scopedRawTable).filter((table) =>
      ['ID', 'Status', 'Blocking Mode'].every((header) => hasHeader(table.headers, header)));
    if (tables.length !== 1) fail('one canonical local decision table required');
    if (REQUIRED_OPEN_DECISION_COLUMNS.some((header) => !hasHeader(tables[0].headers, header))) fail('missing local decision columns');
    return tables[0].rows.map((row) => `decision:${decisionId(col(row, 'ID'))}@${entry.fm.artifact_id}`);
  }

  const subjects = new Set(base.projection.owners.map((entry) => entry.owner));
  const selectedScreens = new Set([...subjects].filter((id) => ownerParts(id).kind === 'screen'));
  for (const id of subjects) {
    const entry = ownerDocument(id);
    for (const token of locals(entry)) apply(token, { owner: id, unit: null }, `artifact:${entry.fm.artifact_id}`, 'local', true);
    for (const token of globals(entry)) apply(token, { owner: id, unit: null }, `artifact:${entry.fm.artifact_id}`, 'decision-ref', true);
  }
  for (const candidate of entries.filter((entry) => entry.fm.artifact_type === 'shared-surface-spec')) {
    const members = candidate.fm.member_screens;
    // A malformed same-domain surface cannot be silently classified unrelated.
    const sameDomain = [...selectedScreens].some((id) => ownerDocument(id).fm.domain === candidate.fm.domain);
    if (!Array.isArray(members)) { if (sameDomain) fail('unresolved surface membership'); else continue; }
    if (!members.some((id) => selectedScreens.has(`screen:${id}`)) && !subjects.has(`surface:${candidate.fm.surface_id}`)) continue;
    const entry = ownerDocument(`surface:${candidate.fm.surface_id}`);
    const memberIds = workSet(members, (id) => { ownerParts(`screen:${id}`); return id; }, 'surface member_screens', true);
    if (memberIds.length < 2) fail('surface requires at least two canonical members');
    locals(entry); // Reject alternative local decision homes, even with no refs.
    const tokens = globals(entry);
    for (const member of memberIds) {
      const memberOwner = `screen:${member}`;
      const host = ownerDocument(memberOwner, selectedScreens.has(memberOwner));
      if (host.fm.domain !== entry.fm.domain) fail('surface/member domain mismatch');
      const edge = { surface: `surface:${entry.fm.surface_id}`, member: memberOwner,
        member_artifact_id: host.fm.artifact_id, file: host.relative, domain: host.fm.domain };
      memberships.set(scopeJson(edge), edge);
      if (selectedScreens.has(memberOwner)) for (const token of tokens) {
        apply(token, { owner: memberOwner, unit: null }, `artifact:${entry.fm.artifact_id}`, 'surface-member', true);
      }
    }
  }

  // Associate selected dependencies with the actual unit that uses them, not
  // every unit merely because the evidence graphs share a document/row ID.
  for (const unit of base.projection.units) {
    const subject = { owner: unit.owner, unit: unit.declaration.id };
    const seeds = [...unit.declaration.contracts, ...(unit.declaration.isolation?.decisions || [])];
    for (const source of unit.sources) {
      seeds.push(...source.anchors.map((anchor) => anchor.ref));
      for (const group of source.groups) for (const effect of group.effects) seeds.push(effect.target, effect.evidence.ref);
    }
    seeds.push(...unit.api_rows.map((row) => row.tracking).filter(Boolean));
    for (const token of union(seeds.filter((token) => base.projection.evidence.nodes.some((node) => node.ref === token)))) enqueue(token, subject);
  }
  for (const link of base.projection.host_links) if (link.mapping) {
    for (const row of link.mapping.rows) for (const token of [
      `${link.mapping.ref}/${row.m_key}`,
      `artifact:${parseTargetRef(link.mapping.ref).artifactId}#mapping-provenance/${row.m_key}`, row.evidence,
    ]) {
      enqueue(token, { owner: link.surface, unit: link.unit });
      enqueue(token, { owner: link.member, unit: link.host_unit === 'legacy-current' ? null : link.host_unit });
    }
  }
  const derivedRoots = scopeSet(dependencyRoots, 'uncertainty dependency roots');
  for (const root of derivedRoots) {
    if (!root || Array.isArray(root) || typeof root !== 'object' ||
        !same(Object.keys(root).sort(), ['owner', 'ref', 'unit'])) fail('invalid uncertainty root');
    ownerParts(root.owner);
    const selectedOwner = base.projection.owners.find((entry) => entry.owner === root.owner);
    const selectedUnit = base.projection.units.some((entry) => entry.owner === root.owner && entry.declaration.id === root.unit);
    if (!selectedOwner || (root.unit === null ? selectedOwner.adopted : !selectedUnit)) fail('uncertainty root outside selected units');
    const parsed = parseTargetRef(workText(root.ref, 'uncertainty root ref'));
    if (!parsed || !['conflict', 'unknown'].includes(parsed.kind)) fail('typed uncertainty root required');
    enqueue(root.ref, { owner: root.owner, unit: root.unit }, root.ref);
  }
  for (let index = 0; index < queued.length; index += 1) {
    const { token, subject, uncertainty } = queued[index];
    const key = scopeJson([subject.owner, subject.unit, token, uncertainty]);
    if (visited.has(key)) continue;
    const graph = resolveScopedContractGraph({ contracts: [token], targetIndex, inputArtifacts, projectRoot });
    for (const file of graph.read_set) audit(file.file, file.sha256);
    for (const edge of graph.edges) graphEdges.set(scopeJson(edge), edge);
    for (const node of graph.nodes) {
      visited.add(scopeJson([subject.owner, subject.unit, node.ref, uncertainty]));
      graphNodes.set(node.ref, scopedProjectionNode(node));
      if (node.kind === 'decision') apply(node.ref, subject, node.ref,
        uncertainty === null ? 'selected-evidence' : 'uncertainty-evidence', false, uncertainty);
      if (!node.artifact_id) continue;
      const entry = document(node.artifact_id);
      remember(entry);
      for (const ref of globals(entry)) apply(ref, subject, node.ref,
        uncertainty === null ? 'evidence-decision-ref' : 'uncertainty-decision-ref', false, uncertainty);
    }
  }
  for (const file of [...files.values()]) audit(file.file, file.sha256);
  return { projection: { ...base.projection, decision_relations: {
    ...(derivedRoots.length ? { dependency_roots: derivedRoots } : {}),
    records: scopeSet([...decisions.values()]), applications: scopeSet([...applications.values()]),
    referrers: scopeSet([...referrers.values()]), memberships: scopeSet([...memberships.values()]),
    evidence: { roots: union([...graphRoots]), nodes: scopeSet([...graphNodes.values()]), edges: scopeSet([...graphEdges.values()]) },
  } }, read_set: scopeSet([...files.values()]) };
}
