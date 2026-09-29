// R1 Conflict/Unknown relation facts, not scope-basis-v1 or a permission result.
// Inverse dependencies and unscoped canonical rows cannot disappear merely
// because a selected unit did not list them. No prose-based negative inference,
// new Unknown status, approval, isolation exemption or public CLI is introduced.
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { col, hasHeader } from './spec.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { ownerParts, readCurrentBytes, hashBytes } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { parseTargetRef } from './reconciliation-items.mjs';
import { parseReconciliationMarkdown, parseReconciliationReferenceView } from './reconciliation-markdown-ast.mjs';
import { createScopedReferenceResolver, scopedRawTable } from './scoped-work-refs.mjs';
import { resolveScopedContractGraph, scopedGraphSelectionSpans } from './scoped-work-graph.mjs';
import { scopedProjectionNode } from './scoped-work-projection.mjs';
import { resolveScopedDecisionProjection } from './scoped-work-decisions.mjs';
import { ScopedWorkContractError, workText } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-UNCERTAINTY: ${message}`); };
const signatures = { unknown: ['ID', 'Question'], conflict: ['ID', 'Status'] };
const union = (values) => scopeSet([...new Set(values)]);
const key = (owner, unit) => scopeJson([owner, unit]);

export function resolveScopedUncertaintyProjection(options = {}, dependencyRoots = []) {
  const { targetIndex, projectRoot, inputArtifacts = [] } = options;
  const base = resolveScopedDecisionProjection(options, dependencyRoots);
  const refs = createScopedReferenceResolver({ targetIndex, projectRoot, inputArtifacts });
  const files = new Map(base.read_set.map((entry) => [entry.file, entry]));
  const documents = new Map();
  const nodes = new Map();
  const edges = new Map();
  const candidates = new Map();
  const subjects = new Map();
  const spans = new Map();

  function read(relative, expectedHash) {
    const file = canonicalRepositoryPath(projectRoot, relative, { required: true, type: 'file', label: 'scoped uncertainty' });
    const raw = readCurrentBytes(file.absolute, 'scoped uncertainty');
    const sha256 = hashBytes(raw);
    if ((expectedHash && sha256 !== expectedHash) || (files.has(relative) && files.get(relative).sha256 !== sha256)) {
      fail('document changed during uncertainty resolution');
    }
    files.set(relative, { file: relative, sha256 });
    return raw;
  }
  function document(relative) {
    if (!documents.has(relative)) {
      const parsed = splitFrontmatter(decodeGitUtf8(read(relative), 'scoped uncertainty'));
      if (!parsed.hasFrontmatter || parsed.parseError) fail('invalid uncertainty document');
      documents.set(relative, { body: parsed.body, view: parseReconciliationReferenceView(parsed.body) });
    }
    return documents.get(relative);
  }
  function addNode(node) {
    if (nodes.has(node.ref) && scopeJson(nodes.get(node.ref)) !== scopeJson(node)) fail('inconsistent selected evidence');
    nodes.set(node.ref, node);
  }
  function addEvidence(evidence) {
    for (const node of evidence.nodes) addNode(node);
    for (const edge of evidence.edges) edges.set(scopeJson(edge), edge);
  }
  addEvidence(base.projection.evidence);
  addEvidence(base.projection.decision_relations.evidence);

  // Parse canonical homes again from the actual bytes, not caller-edited index
  // rows. The shared resolver still owns identity, table/section uniqueness and
  // exact raw row selection. Missing signatures must not become an empty set.
  for (const entry of targetIndex.artifacts.values()) {
    const relative = path.relative(projectRoot, entry.file).split(path.sep).join('/');
    const parsed = parseReconciliationMarkdown(document(relative).body);
    for (const [family, headers] of Object.entries(signatures)) {
      const locations = parsed.occurrences.filter((section) => section.slug === `${family}s` ||
        (family === 'conflict' && section.slug === '' && entry.fm.artifact_type === 'conflicts' &&
          section.tables.some((table) => headers.every((header) => hasHeader(table.headers, header)))));
      for (const location of locations) {
        const tables = location.tables.map(scopedRawTable).filter((table) => headers.every((header) => hasHeader(table.headers, header)));
        if (tables.length !== 1) fail(`one canonical ${family} table required`);
        for (const row of tables[0].rows) {
          const id = col(row, 'ID');
          if (id.startsWith('{')) continue; // Existing canonical template placeholder.
          workText(id, `${family} ID`);
          const token = `${family}:${id}@${entry.fm.artifact_id}`;
          const parsedRef = parseTargetRef(token);
          if (parsedRef?.kind !== family || parsedRef.rowId !== id) fail('noncanonical uncertainty ID');
          if (candidates.has(token)) fail(`duplicate uncertainty ${token}`);
          if (family === 'unknown') workText(col(row, 'Question'), 'Unknown Question');
          const status = col(row, 'Status') || null;
          // Unknowns deliberately keep their native optional status vocabulary.
          if (family === 'conflict' && !['open', 'resolved'].includes(status)) fail(`invalid Conflict Status: ${token}`);
          const record = { ...scopedProjectionNode(refs.contract(token)), status };
          const graph = resolveScopedContractGraph({ contracts: [token], targetIndex, projectRoot, inputArtifacts });
          for (const file of graph.read_set) read(file.file, file.sha256);
          const evidence = { roots: graph.roots, nodes: graph.nodes.map(scopedProjectionNode), edges: graph.edges };
          // Audit every inspected row; project only rows with a relation below.
          candidates.set(token, { record, entry, evidence });
        }
      }
    }
  }

  function subject(owner, unit) {
    const id = key(owner, unit);
    if (!subjects.has(id)) subjects.set(id, { owner, unit, roots: new Set(), derived: new Map() });
    return subjects.get(id);
  }
  function seed(owner, unit, token) {
    const out = subject(owner, unit);
    if (nodes.has(token)) out.roots.add(token);
  }
  for (const unit of base.projection.units) {
    const id = unit.declaration.id;
    subject(unit.owner, id);
    const roots = [...unit.declaration.contracts, ...(unit.declaration.isolation?.decisions || [])];
    for (const source of unit.sources) {
      roots.push(...source.anchors.map((anchor) => anchor.ref));
      for (const group of source.groups) for (const effect of group.effects) roots.push(effect.target, effect.evidence.ref);
    }
    roots.push(...unit.api_rows.map((row) => row.tracking).filter(Boolean));
    for (const token of roots) seed(unit.owner, id, token);
  }
  for (const owner of base.projection.owners) if (!owner.adopted) subject(owner.owner, null);
  function derivedSeed(owner, unit, via, token) {
    const out = subject(owner, unit);
    if (!out.derived.has(via)) out.derived.set(via, new Set());
    if (!nodes.has(token)) fail('missing derived dependency');
    out.derived.get(via).add(token);
  }
  for (const root of base.projection.decision_relations.dependency_roots || []) {
    derivedSeed(root.owner, root.unit, root.ref, root.ref);
  }
  for (const application of base.projection.decision_relations.applications) {
    if (application.uncertainty) {
      derivedSeed(application.owner, application.unit, application.uncertainty, application.decision);
      continue;
    }
    if (application.unit !== null) seed(application.owner, application.unit, application.decision);
    else {
      const selected = [...subjects.values()].filter((value) => value.owner === application.owner);
      for (const value of selected) seed(value.owner, value.unit, application.decision);
    }
  }
  for (const link of base.projection.host_links) if (link.mapping) {
    const hostUnit = link.host_unit === 'legacy-current' ? null : link.host_unit;
    const mappingId = parseTargetRef(link.mapping.ref).artifactId;
    for (const row of link.mapping.rows) for (const token of [
      `${link.mapping.ref}/${row.m_key}`, `artifact:${mappingId}#mapping-provenance/${row.m_key}`, row.evidence,
    ]) {
      seed(link.surface, link.unit, token);
      seed(link.member, hostUnit, token);
    }
  }
  const adjacency = new Map();
  for (const edge of edges.values()) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge.to);
  }
  for (const value of subjects.values()) {
    const queue = [...value.roots]; const seen = new Set(queue);
    for (let i = 0; i < queue.length; i += 1) for (const next of adjacency.get(queue[i]) || []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    value.selected = [...seen].map((token) => nodes.get(token));
    if (value.selected.some((node) => !node)) fail('missing selected dependency');
    const derived = [];
    for (const [via, roots] of value.derived) {
      const pending = [...roots], reached = new Set(pending);
      for (let i = 0; i < pending.length; i += 1) for (const next of adjacency.get(pending[i]) || []) {
        if (!reached.has(next)) { reached.add(next); pending.push(next); }
      }
      for (const token of reached) {
        if (!nodes.has(token)) fail('missing transitive dependency');
        derived.push({ via, node: nodes.get(token) });
      }
    }
    value.derived = derived;
  }
  function ranges(node) {
    if (!spans.has(node.ref)) {
      const doc = document(node.file);
      spans.set(node.ref, scopedGraphSelectionSpans(doc.body, doc.view, node.selection, node.kind === 'input-evidence'));
    }
    return spans.get(node.ref);
  }
  function overlaps(left, right) {
    if (left.file !== right.file) return false;
    if (left.ref === right.ref) return true;
    return ranges(left).some(([a, b]) => ranges(right).some(([c, d]) => a < d && c < b));
  }
  function nativeScope(entry, value) {
    const fm = entry.fm;
    if (Object.hasOwn(fm, 'domain')) workText(fm.domain, 'uncertainty domain');
    if (fm.artifact_type === 'screen-spec') {
      workText(fm.screen_id, 'uncertainty screen identity');
      const owner = `screen:${fm.screen_id}`; ownerParts(owner);
      return owner === value.owner;
    }
    if (fm.artifact_type === 'shared-surface-spec') {
      workText(fm.surface_id, 'uncertainty surface identity');
      const owner = `surface:${fm.surface_id}`; ownerParts(owner);
      return owner === value.owner || base.projection.decision_relations.memberships.some((edge) =>
        edge.surface === owner && edge.member === value.owner);
    }
    const owner = base.projection.owners.find((entry) => entry.owner === value.owner);
    // An unspecified/global domain is not proof of irrelevance. In particular,
    // an unrelated typed link in Question cannot itself narrow a native scope.
    return fm.domain === undefined || fm.domain === 'global' || fm.domain === owner?.metadata.domain;
  }

  const records = new Map(); const applications = []; const review = [];
  const projectedNodes = new Map(); const projectedEdges = new Map(); const roots = [];
  for (const [token, candidate] of candidates) {
    const { record, entry, evidence } = candidate;
    let included = false;
    for (const value of subjects.values()) {
      const direct = value.selected.filter((node) => overlaps(record, node)).map((node) => node.ref);
      const inverse = direct.length ? [] : evidence.nodes.filter((node) => node.ref !== token)
        .flatMap((dependency) => value.selected.filter((node) => overlaps(dependency, node))
          .map((node) => ({ dependency: dependency.ref, selected: node.ref })));
      const native = !direct.length && !inverse.length && nativeScope(entry, value);
      // A relation discovered through uncertainty is not an authored selection.
      // Never use its own returned graph to erase native scope-review-needed.
      const transitive = direct.length || inverse.length || native ? [] : [record, ...evidence.nodes.filter((node) => node.ref !== token)]
        .flatMap((dependency) => value.derived.filter(({ via, node }) => via !== token && overlaps(dependency, node))
          .map(({ via, node }) => ({ via, dependency: dependency.ref, selected: node.ref })));
      const relation = direct.length ? 'selected-evidence' : inverse.length ? 'inverse-evidence'
        : native ? 'scope-review-needed' : transitive.length ? 'transitive-evidence' : null;
      if (!relation) continue;
      included = true;
      const application = { owner: value.owner, unit: value.unit, uncertainty: token, relation,
        witnesses: direct.length ? union(direct).map((ref) => ({ dependency: token, selected: ref }))
          : scopeSet([...new Map((inverse.length ? inverse : transitive).map((pair) => [scopeJson(pair), pair])).values()]) };
      applications.push(application);
      if (relation === 'scope-review-needed') review.push({ owner: value.owner, unit: value.unit, uncertainty: token });
    }
    if (!included) continue;
    records.set(token, record); roots.push(token);
    for (const node of evidence.nodes) {
      addNode(node);
      projectedNodes.set(node.ref, node);
    }
    for (const edge of evidence.edges) projectedEdges.set(scopeJson(edge), edge);
  }
  for (const file of [...files.values()]) read(file.file, file.sha256);
  return { projection: { ...base.projection, uncertainty_relations: {
    records: scopeSet([...records.values()]), applications: scopeSet(applications), scope_review_needed: scopeSet(review),
    evidence: { roots: union(roots), nodes: scopeSet([...projectedNodes.values()]), edges: scopeSet([...projectedEdges.values()]) },
  } }, read_set: scopeSet([...files.values()]) };
}
