// R1 Conflict/Unknown relation facts, not scope-basis-v1 or a permission result.
// Inverse dependencies and unscoped canonical rows cannot disappear merely
// because a selected unit did not list them. No prose-based negative inference,
// new Unknown status, approval, isolation exemption or public CLI is introduced.
// Only a malformed section that provably cannot relate is skipped, and reported.
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { col, hasHeader } from './spec.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { ownerParts, readCurrentBytes, hashBytes, CurrentWorkError } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { parseTargetRef } from './reconciliation-items.mjs';
import { parseReconciliationMarkdown, parseReconciliationReferenceView } from './reconciliation-markdown-ast.mjs';
import { createScopedReferenceResolver, scopedRawTable, parseScopedTargetRef, scopedRowAlias } from './scoped-work-refs.mjs';
import { resolveScopedContractGraph, scopedGraphSelectionSpans, scopedGraphMetadataRefs, scopedGraphBodyRefs,
  mergeScopedGraphContexts } from './scoped-work-graph.mjs';
import { scopedProjectionNode } from './scoped-work-projection.mjs';
import { resolveScopedDecisionProjection } from './scoped-work-decisions.mjs';
import { ScopedWorkContractError, workText } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';
import { scopedAuthoredSections, scopedSelectionNodes, copyScopedNodeContexts } from './scoped-work-authored.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-UNCERTAINTY: ${message}`); };
const signatures = { unknown: ['ID', 'Question'], conflict: ['ID', 'Status'] };
const typedSpelling = /(?:artifact|decision|unknown|conflict|gap|investigation|verification|input):/;
const union = (values) => scopeSet([...new Set(values)]);
const key = (owner, unit) => scopeJson([owner, unit]);

// An authored table can sit after a GENERATED heading while an independently
// resolvable raw Unknown table remains before it. Keep both physical sources;
// the presence of an authored table must not erase ordinary generated evidence.
export function scopedUnknownHomes(body, view = parseReconciliationReferenceView(body)) {
  const authored = scopedAuthoredSections(body, 'unknowns', view);
  const canonical = (table) => signatures.unknown.every((header) => hasHeader(table.headers, header));
  const authoredTables = new Set(authored.flatMap((section) => section.tableNodes.filter((_, index) => canonical(section.tables[index]))));
  const raw = view.sections.filter((section) => section.slug === 'unknowns');
  if (!authoredTables.size) return raw.map((location) => ({ location, authored: false }));
  const homes = authored.map((location) => ({ location, authored: true }));
  // Multiple raw sections/tables cannot supply an ordinary canonical Unknown.
  // Do not restore GENERATED-only empty sections or display legends as authored
  // format errors; selected ordinary refs still undergo the raw resolver checks.
  if (raw.length === 1) {
    const tables = raw[0].tableNodes.filter((_, index) => canonical(raw[0].tables[index]));
    if (tables.length === 1 && !authoredTables.has(tables[0])) homes.push({ location: raw[0], authored: false });
  }
  return homes;
}

// Fixpoint roots keep the selected physical row's context, not a document-wide
// "has authored Unknowns" flag. Compare source offsets so parser cache eviction
// cannot change the answer for an existing selection sidecar.
export function scopedUnknownAuthored(body, selection, view = parseReconciliationReferenceView(body)) {
  const nodes = scopedSelectionNodes(body, selection);
  if (selection.type !== 'row' || nodes?.length !== 1) return false;
  const [row] = nodes;
  return scopedAuthoredSections(body, 'unknowns', view).some((home) => home.tableNodes.some((table, index) =>
    signatures.unknown.every((header) => hasHeader(home.tables[index].headers, header)) &&
    table.position.start.offset <= row.position.start.offset && row.position.end.offset <= table.position.end.offset));
}

const nodeSet = (values) => copyScopedNodeContexts(values, scopeSet(values));

// #262: a resolved row no longer blocks. A Conflict keeps its open|resolved
// vocabulary; an Unknown keeps its own optional one, so only `resolved` clears it
// (in any case, as legacy readiness reads Unknown Status). Anything else blocks.
export function scopedUncertaintyResolved(record) {
  if (!record) return false;
  if (record.kind === 'unknown') return typeof record.status === 'string' && record.status.toLowerCase() === 'resolved';
  return record.status === 'resolved';
}

export function resolveScopedUncertaintyProjection(options = {}, dependencyRoots = [], dependencyContext = {}) {
  const { targetIndex, projectRoot, inputArtifacts = [] } = options;
  // The fixpoint re-expands derived rows in the decision layer. Carry their
  // actual row context beside the unchanged public root declarations. Ordinary
  // roots stay ordinary unless their caller carries an authored selection.
  const base = resolveScopedDecisionProjection(options, dependencyRoots, dependencyContext);
  const refs = createScopedReferenceResolver({ targetIndex, projectRoot, inputArtifacts });
  const files = new Map(base.read_set.map((entry) => [entry.file, entry]));
  const documents = new Map();
  const nodes = new Map();
  const edges = new Map();
  const candidates = new Map();
  const subjects = new Map();
  const spans = new WeakMap();

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
      const text = decodeGitUtf8(read(relative), 'scoped uncertainty');
      const parsed = splitFrontmatter(text);
      if (!parsed.hasFrontmatter || parsed.parseError) fail('invalid uncertainty document');
      documents.set(relative, { text, body: parsed.body, view: parseReconciliationReferenceView(parsed.body) });
    }
    return documents.get(relative);
  }
  function addNode(node) {
    if (nodes.has(node.ref)) {
      const previous = nodes.get(node.ref);
      if (scopeJson(previous) !== scopeJson(node)) fail('inconsistent selected evidence');
      const doc = document(node.file);
      const spansOf = (record) => scopedGraphSelectionSpans(doc.body, doc.view, record.selection, record.kind === 'input-evidence');
      if (scopeJson(spansOf(previous)) !== scopeJson(spansOf(node))) fail('ambiguous selected evidence source');
    }
    nodes.set(node.ref, node);
  }
  function addEvidence(evidence) {
    for (const node of evidence.nodes) addNode(node);
    for (const edge of evidence.edges) edges.set(scopeJson(edge), edge);
  }
  addEvidence(base.projection.evidence);
  addEvidence(base.projection.decision_relations.evidence);
  const consumedGraphs = [base.projection.evidence, base.projection.decision_relations.evidence];

  // Table shape and row identity of one canonical section, before any resolution.
  function sectionRows(entry, family, headers, location) {
    const tables = location.tables.map(scopedRawTable).filter((table) => headers.every((header) => hasHeader(table.headers, header)));
    if (tables.length !== 1) fail(`one canonical ${family} table required`);
    const rows = new Map();
    for (const row of tables[0].rows) {
      const id = col(row, 'ID');
      if (id.startsWith('{')) continue; // Existing canonical template placeholder.
      workText(id, `${family} ID`);
      const token = `${family}:${id}@${entry.fm.artifact_id}`;
      const parsedRef = parseScopedTargetRef(token);
      if (parsedRef?.kind !== family || parsedRef.rowId !== id) fail(`noncanonical uncertainty ID ${JSON.stringify(id)}`);
      if (rows.has(token)) fail(`duplicate uncertainty ${token}`);
      if (family === 'unknown') workText(col(row, 'Question'), 'Unknown Question');
      const status = col(row, 'Status') || null;
      // Unknowns deliberately keep their native optional status vocabulary.
      if (family === 'conflict' && !['open', 'resolved'].includes(status)) fail(`invalid Conflict Status: ${token}`);
      rows.set(token, { status, affected: family === 'conflict' ? col(row, '영향 화면') : undefined });
    }
    return rows;
  }

  function addCandidate(entry, token, status, affected, authored, source = null) {
    const selected = authored ? refs.authoredContract(token) : refs.contract(token);
    const record = { ...scopedProjectionNode(selected), status };
    if (source && (source.file !== record.file || scopeJson(ranges(source)) !== scopeJson(ranges(record)))) {
      fail(`ambiguous canonical Unknown source: ${token}`);
    }
    const physical = scopeJson([token, ranges(record)]);
    if (candidates.has(physical)) return;
    const graph = resolveScopedContractGraph({ contracts: [token], targetIndex, projectRoot, inputArtifacts,
      authoredRefs: authored ? [token] : [] });
    for (const file of graph.read_set) read(file.file, file.sha256);
    const evidence = mergeScopedGraphContexts([graph],
      { roots: graph.roots, nodes: graph.nodes.map(scopedProjectionNode), edges: graph.edges });
    candidates.set(physical, { record, entry, evidence, affected: affectedOwners(affected) });
  }

  // #262: the conflicts template's `영향 화면` cell names owners only as a list of
  // known screen/surface IDs separated by `,` or `·`. Anything else (`global` in
  // any case, even where a screen has that ID, a blank, prose, markup or an
  // unknown ID) names none: prose never narrows.
  const knownOwners = new Map();
  for (const { fm } of targetIndex.artifacts.values()) {
    const [kind, id] = fm?.artifact_type === 'screen-spec' ? ['screen', fm.screen_id]
      : fm?.artifact_type === 'shared-surface-spec' ? ['surface', fm.surface_id] : [];
    if (typeof id === 'string' && id) knownOwners.set(id, [...(knownOwners.get(id) || []), `${kind}:${id}`]);
  }
  function affectedOwners(cell) {
    if (typeof cell !== 'string') return null;
    const ids = cell.split(/[,·]/).map((id) => id.trim());
    if (ids.some((id) => id.toLowerCase() === 'global')) return null;
    return ids.every((id) => knownOwners.has(id)) ? new Set(ids.flatMap((id) => knownOwners.get(id))) : null;
  }

  // Parse canonical homes again from the actual bytes, not caller-edited index
  // rows. The shared resolver still owns identity, table/section uniqueness and
  // exact raw row selection. Missing signatures must not become an empty set.
  const unaudited = [];
  for (const entry of targetIndex.artifacts.values()) {
    const relative = path.relative(projectRoot, entry.file).split(path.sep).join('/');
    const doc = document(relative);
    const parsed = parseReconciliationMarkdown(doc.body);
    for (const [family, headers] of Object.entries(signatures)) {
      const locations = family === 'unknown' ? scopedUnknownHomes(doc.body, doc.view)
        : parsed.occurrences.filter((section) => section.slug === `${family}s` ||
        (family === 'conflict' && section.slug === '' && entry.fm.artifact_type === 'conflicts' &&
          section.tables.some((table) => headers.every((header) => hasHeader(table.headers, header)))))
          .map((location) => ({ location, authored: false }));
      for (const { location, authored } of locations) {
        let rows;
        try { rows = sectionRows(entry, family, headers, location); } catch (error) {
          if (!(error instanceof ScopedWorkContractError)) throw error;
          // Fatal or unaudited is decided below, once selected evidence is known (#260).
          unaudited.push({ entry, file: relative, section: location.slug, error });
          continue;
        }
        for (const [token, { status, affected }] of rows) {
          // Audit every inspected row; project only rows with a relation below.
          addCandidate(entry, token, status, affected, authored);
        }
      }
    }
  }

  // Canonical-home enumeration intentionally ignores GENERATED display tables
  // beside an authored table. An explicitly selected row is actual evidence,
  // however: retain its canonical alias and prove that re-resolution selects
  // exactly the same original row. Do not promote unselected display legends.
  for (const node of nodes.values()) {
    const selection = node.selection;
    if (!['artifact', 'unknown'].includes(node.kind) || selection?.type !== 'row' || selection.section !== 'unknowns' ||
        !signatures.unknown.every((header) => hasHeader(selection.headers, header))) continue;
    const row = Object.fromEntries(selection.headers.map((header, index) => [header, selection.cells[index]]));
    const token = node.kind === 'unknown' ? node.ref : scopedRowAlias(node);
    if (!token) fail(`noncanonical uncertainty ID ${JSON.stringify(col(row, 'ID'))}`);
    workText(col(row, 'Question'), 'Unknown Question');
    const doc = document(node.file);
    const authored = scopedUnknownAuthored(doc.body, selection, doc.view);
    addCandidate(targetIndex.artifacts.get(node.artifact_id), token, col(row, 'Status') || null, undefined, authored, node);
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
    if (!spans.has(node.selection)) {
      const doc = document(node.file);
      spans.set(node.selection, scopedGraphSelectionSpans(doc.body, doc.view, node.selection, node.kind === 'input-evidence'));
    }
    return spans.get(node.selection);
  }
  function overlaps(left, right) {
    if (left.file !== right.file) return false;
    // Merely auditing another physical candidate is not a demand for its row.
    // If both sources actually apply, addNode rejects their equal-ref merge.
    if (left.ref === right.ref) return scopeJson(ranges(left)) === scopeJson(ranges(right));
    return ranges(left).some(([a, b]) => ranges(right).some(([c, d]) => a < d && c < b));
  }
  // #262: a named row outside every owner spec (global, undomained or domain
  // document) is native only to the named owners and a named surface's members.
  // An owner spec keeps its own rows, and a resolved row keeps its relations: it
  // blocks nothing itself, but still leads to the open rows it cites. A surface
  // keeps a row that names one of its unadopted members, because a legacy-current
  // host checks no Unknown or Conflict. Selected, inverse and transitive evidence
  // relations do not depend on the cell.
  function named(candidate, value) {
    if (!candidate.affected || scopedUncertaintyResolved(candidate.record) ||
      ['screen-spec', 'shared-surface-spec'].includes(candidate.entry.fm.artifact_type)) return true;
    const { memberships } = base.projection.decision_relations;
    const unadopted = (owner) => base.projection.owners.some((entry) => entry.owner === owner && !entry.adopted);
    return candidate.affected.has(value.owner) ||
      memberships.some((edge) => candidate.affected.has(edge.surface) && edge.member === value.owner) ||
      memberships.some((edge) => edge.surface === value.owner && candidate.affected.has(edge.member) && unadopted(edge.member));
  }
  function nativeOrNull(entry, value, candidate) {
    try { return nativeScope(entry, value) && named(candidate, value); } catch (cause) {
      if (cause instanceof ScopedWorkContractError || cause instanceof CurrentWorkError) return null;
      throw cause;
    }
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

  // #260: a format problem stays fatal wherever a row could relate: a document in
  // any subject's native scope (an unclassifiable one included), one holding
  // selected or derived evidence, or one with a typed reference. Row cells and
  // metadata refs are the only graph edges, so judge references as resolution
  // reads them (decoded metadata, native content scan) as well as the raw text;
  // a reference that cannot be read counts. Elsewhere no relation can be lost,
  // so the section is reported as unaudited instead of stopping all scoped work.
  const contractError = (check) => {
    try { return check(); } catch (cause) { if (cause instanceof CurrentWorkError) return true; throw cause; }
  };
  const referencing = (entry, file) => typedSpelling.test(document(file).text) || contractError(() =>
    scopedGraphMetadataRefs(entry.fm).length > 0 || scopedGraphBodyRefs(document(file).body, document(file).view, entry.fm).length > 0);
  const skipped = new Map();
  for (const { entry, file, section, error } of unaudited) {
    const native = (value) => contractError(() => nativeScope(entry, value));
    if (referencing(entry, file) || [...subjects.values()].some((value) => native(value) ||
      [...value.selected, ...value.derived.map(({ node }) => node)].some((node) => node.file === file))) throw error;
    const value = { file, section, reason: error.message };
    skipped.set(scopeJson(value), value);
  }

  const records = new Map(); const applications = []; const review = []; const inputs = [];
  const projectedNodes = new Map(); const projectedEdges = new Map(); const roots = [];
  const pairs = (list) => scopeSet([...new Map(list.map((pair) => [scopeJson(pair), pair])).values()]);
  for (const candidate of candidates.values()) {
    const { record, entry, evidence } = candidate;
    const token = record.ref;
    let included = false;
    for (const value of subjects.values()) {
      const inverseOf = () => evidence.nodes.filter((node) => node.ref !== token)
        .flatMap((dependency) => value.selected.filter((node) => overlaps(dependency, node))
          .map((node) => ({ dependency: dependency.ref, selected: node.ref })));
      const transitiveOf = () => [record, ...evidence.nodes.filter((node) => node.ref !== token)]
        .flatMap((dependency) => value.derived.filter(({ via, node }) => via !== token && overlaps(dependency, node))
          .map(({ via, node }) => ({ via, dependency: dependency.ref, selected: node.ref })));
      const direct = value.selected.filter((node) => overlaps(record, node)).map((node) => node.ref);
      const inverse = direct.length ? [] : inverseOf();
      const native = !direct.length && !inverse.length && nativeScope(entry, value) && named(candidate, value);
      // A relation discovered through uncertainty is not an authored selection.
      // Never use its own returned graph to erase native scope-review-needed. A
      // native relation keeps these witnesses (#262): a binding narrows only the
      // native part, never a row the unit still reaches through another applied row.
      const transitive = direct.length || inverse.length ? [] : transitiveOf();
      const relation = direct.length ? 'selected-evidence' : inverse.length ? 'inverse-evidence'
        : native ? 'scope-review-needed' : transitive.length ? 'transitive-evidence' : null;
      if (!relation) continue;
      included = true;
      const application = { owner: value.owner, unit: value.unit, uncertainty: token, relation,
        witnesses: direct.length ? union(direct).map((ref) => ({ dependency: token, selected: ref }))
          : pairs(inverse.length ? inverse : transitive) };
      applications.push(application);
      if (relation === 'scope-review-needed') review.push({ owner: value.owner, unit: value.unit, uncertainty: token });
      // #275: everything the relation could rest on, so a binding basis judges it from its own
      // closure's selections; a selection only an unrelated row made must not change it. A native
      // scope that cannot be read here (the relation did not need it) is null.
      const overridden = direct.length || inverse.length;
      inputs.push({ owner: value.owner, unit: value.unit, uncertainty: token, direct: union(direct),
        inverse: pairs(direct.length ? inverseOf() : inverse), native: overridden ? nativeOrNull(entry, value, candidate) : native,
        transitive: pairs(overridden ? transitiveOf() : transitive) });
    }
    if (!included) continue;
    records.set(token, record); roots.push(token);
    consumedGraphs.push(evidence);
    for (const node of evidence.nodes) {
      addNode(node);
      projectedNodes.set(node.ref, node);
    }
    for (const edge of evidence.edges) projectedEdges.set(scopeJson(edge), edge);
  }
  for (const file of [...files.values()]) read(file.file, file.sha256);
  return { projection: { ...base.projection, uncertainty_relations: {
    records: nodeSet([...records.values()]), applications: scopeSet(applications), scope_review_needed: scopeSet(review),
    relation_inputs: scopeSet(inputs),
    evidence: mergeScopedGraphContexts(consumedGraphs,
      { roots: union(roots), nodes: nodeSet([...projectedNodes.values()]), edges: scopeSet([...projectedEdges.values()]) }),
  } }, read_set: scopeSet([...files.values()]), unaudited: scopeSet([...skipped.values()]) };
}
