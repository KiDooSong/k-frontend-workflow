// Compose file-backed R1 relation closure with ownership facts. This is NOT a
// binding digest, approval, uncertainty resolution, readiness or path permit.
// Public scoped execution stays unsupported until the complete runtime exists.
import path from 'node:path';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { splitFrontmatter } from './util.mjs';
import { col, hasHeader } from './spec.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { parseReconciliationMarkdown, parseReconciliationReferenceView } from './reconciliation-markdown-ast.mjs';
import { parseScopedTargetRef, isScopedRowId, scopedRawTable, scopedRowAlias, scopedRowSite, scopedAddRowSite, scopedCoveredRows } from './scoped-work-refs.mjs';
import { resolveScopedContractGraph, resolveScopedCandidateGraph, scopedGraphSelectionRefs, scopedGraphMetadataRefs, scopedGraphBodyRefs,
  scopedGraphContexts, scopedGraphSelectionSpans, mergeScopedGraphContexts } from './scoped-work-graph.mjs';
import { scopedProjectionNode } from './scoped-work-projection.mjs';
import { loadOpenDecisionRegister, resolveDecisionRefs } from './open-decisions.mjs';
import { readCurrentBytes, hashBytes, CurrentWorkError } from './current-work-request.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { ScopedWorkContractError } from './scoped-work-request.mjs';
import { resolveScopedBoundaryProjection } from './scoped-work-boundaries.mjs';
import { resolveScopedUncertaintyProjection, scopedUnknownHomes, scopedUnknownAuthored } from './scoped-work-uncertainty.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';
import { copyScopedNodeContexts } from './scoped-work-authored.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-APPLICABILITY: ${message}`); };

export function resolveScopedApplicabilityProjection(options = {}) {
  const { projectRoot, kitRoot, layoutFile } = options;
  const boundary = resolveScopedBoundaryProjection(options);
  // Ignore caller role functions, as the boundary resolver does. All layers
  // must use the same selected layout/preset bytes and canonical document index.
  const layout = loadLayoutProfile({ kitRoot: kitRoot || projectRoot, flags: { layout: layoutFile } });
  const files = new Map();
  function audit(entries) {
    for (const entry of entries) {
      if (files.has(entry.file) && files.get(entry.file).sha256 !== entry.sha256) fail('snapshot changed between relation passes');
      files.set(entry.file, entry);
    }
  }
  audit(boundary.read_set);
  const { decision_relations: _decisions, ownership, ...unitProjection } = boundary.projection;
  const roots = new Map(), authoredRoots = new Set();
  let current;
  while (true) {
    current = resolveScopedUncertaintyProjection({ ...options, layout }, scopeSet([...roots.values()]),
      { authoredRefs: [...authoredRoots] });
    audit(current.read_set);
    const { decision_relations: _nextDecisions, uncertainty_relations, ...nextUnits } = current.projection;
    if (scopeJson(nextUnits) !== scopeJson(unitProjection)) fail('unit projection changed between layers');
    const count = roots.size, authoredCount = authoredRoots.size;
    const records = new Map(uncertainty_relations.records.map((record) => [record.ref, record]));
    for (const application of uncertainty_relations.applications) {
      const root = { owner: application.owner, unit: application.unit, ref: application.uncertainty };
      roots.set(scopeJson(root), root);
      const record = records.get(root.ref);
      if (record?.kind === 'unknown' && scopedUnknownAuthored(options.targetIndex.artifacts.get(record.artifact_id).body, record.selection)) {
        authoredRoots.add(root.ref);
      }
    }
    // Canonical uncertainty refs x selected owner/units form a finite set.
    // Roots only grow; no arbitrary depth cutoff or first-host/first-pass win.
    if (roots.size === count && authoredRoots.size === authoredCount) break;
  }
  const unapplied = unappliedRows(options, current.projection, current.unaudited);
  audit(unapplied.read_set);
  for (const entry of files.values()) {
    const file = canonicalRepositoryPath(projectRoot, entry.file, { required: true, type: 'file', label: 'scoped applicability' });
    if (hashBytes(readCurrentBytes(file.absolute, 'scoped applicability')) !== entry.sha256) fail('snapshot changed after relation closure');
  }
  const projection = { ...current.projection, unapplied_relations: unapplied.unapplied };
  return { projection: { ...projection, ownership }, read_set: scopeSet([...files.values()]), unaudited: current.unaudited };
}

// #275: Decision, Unknown and Conflict rows that apply to no owner but relate to a projected
// row or evidence node. Every other row's references are read as resolution reads them, in
// one candidate graph, and a row joins when they reach a projected row or node, or one a joined row
// reaches, to a fixpoint; a row that such a node is, selects, covers or names joins as well, even
// when it cites nothing itself. An exact artifact row selection is the row it selects, a reference
// to a section or a whole document covers the rows it holds, and a document's frontmatter
// decision_refs leads from its evidence to the Decisions it names, as for an applied row. They decide nothing here; a binding basis relates them to the rows they
// reach. Any non-empty Decision ID is valid, so one that cannot form a typed reference is an
// error only when its row relates. As for Unknown and Conflict sections (#260), a Decision
// table that cannot be read is an error when its document holds a typed reference, and a
// reference that cannot be resolved is an error wherever it is.
const searchStats = { visited: 0 };
// Process-wide node visits of the unapplied-row search, and Decision homes examined for collisions:
// read-only diagnostics (#275).
export function scopedUnappliedSearchStats() {
  return { ...searchStats };
}
const TYPED_SPELLING = /(?:artifact|decision|unknown|conflict|gap|investigation|verification|input):/;
const DECISION_TABLE = ['ID', 'Status', 'Blocking Mode'];
function unappliedRows({ targetIndex, projectRoot, docsDir, inputArtifacts = [] }, projection, unaudited = []) {
  const { decision_relations: decisions, uncertainty_relations: uncertainty } = projection;
  const applied = new Set([...decisions.records, ...uncertainty.records].map((entry) => entry.ref)), known = new Set(applied);
  const priorGraphs = [projection.evidence, decisions.evidence, uncertainty.evidence];
  const projected = priorGraphs.flatMap((graph) => graph.nodes);
  const context = scopedGraphContexts(mergeScopedGraphContexts(priorGraphs, {}));
  const selected = new Map(), views = new Map(), selectionSpans = new WeakMap();
  const spans = (node) => {
    if (!selectionSpans.has(node.selection)) {
      if (!views.has(node.file)) {
        const indexed = node.artifact_id ? targetIndex.artifacts.get(node.artifact_id) : null;
        const file = indexed ? null : canonicalRepositoryPath(projectRoot, node.file,
          { required: true, type: 'file', label: 'scoped applicability evidence' });
        const body = indexed?.body ?? splitFrontmatter(decodeGitUtf8(readCurrentBytes(file.absolute,
          'scoped applicability evidence'), 'scoped applicability evidence')).body;
        views.set(node.file, { body, view: parseReconciliationReferenceView(body) });
      }
      const { body, view } = views.get(node.file);
      selectionSpans.set(node.selection, scopedGraphSelectionSpans(body, view, node.selection, node.kind === 'input-evidence'));
    }
    return selectionSpans.get(node.selection);
  };
  const checkSelected = (node) => {
    const previous = selected.get(node.ref);
    if (previous && (scopeJson(previous) !== scopeJson(node) || scopeJson(spans(previous)) !== scopeJson(spans(node)))) {
      fail(`ambiguous selected evidence source: ${node.ref}`);
    }
    selected.set(node.ref, node);
  };
  for (const node of projected) checkSelected(node);
  // Where each row sits, so that a section or document reference covers the rows it holds.
  const sites = new Map();
  const site = (value, selection) => scopedAddRowSite(sites, value, selection);
  for (const node of [...decisions.records, ...uncertainty.records, ...projected]) site(scopedRowSite(node));
  for (const node of projected) {
    known.add(node.ref);
    const alias = scopedRowAlias(node);
    if (alias) known.add(alias);
  }
  const skipped = new Set(unaudited.map((entry) => scopeJson([entry.file, entry.section])));
  const rows = new Map(), untyped = new Map(), readSet = [];
  const rootKey = (ref, mode) => scopeJson([ref, mode]);
  const add = (row, section, mode = 'ordinary', selection) => {
    site({ row: row.key, artifact_id: row.artifactId, section }, selection);
    const key = rootKey(row.key, mode);
    if (!rows.has(key)) rows.set(key, { ...row, mode });
  };
  for (const [artifactId, entry] of targetIndex.artifacts) {
    const file = path.relative(projectRoot, entry.file).split(path.sep).join('/');
    let view = null;
    for (const { id, headers, cells, slug } of decisionRows(entry)) {
      const token = `decision:${id}@${artifactId}`;
      if (isScopedRowId('decision', id) && parseScopedTargetRef(token)?.rowId === id) add({ key: token, id, artifactId, token, roots: [token] }, slug);
      else {
        const key = `untyped:${artifactId}#${slug}/${id}`;
        untyped.set(key, { artifactId, slug, id });
        if (!view) { view = parseReconciliationReferenceView(entry.body); readSet.push(indexedFile(projectRoot, entry)); }
        const selection = { type: 'row', section: slug, headers, cells };
        // A typed row's node leads to its document's decision_refs; an untyped row starts from them too.
        add({ key, id, artifactId, token: null, roots: [...new Set([...scopedGraphSelectionRefs(entry.body, entry.fm, selection, view),
          ...looseDecisionRefs(entry.fm)])] }, slug, 'ordinary', selection);
      }
    }
    // The public target index stays raw. Derive the corrected authored Unknown
    // homes used by uncertainty instead of losing rows beyond GENERATED H2s.
    for (const { location, authored } of scopedUnknownHomes(entry.body)) {
      if (skipped.has(scopeJson([file, location.slug]))) continue;
      const tables = location.tables.map(scopedRawTable).filter((table) =>
        ['ID', 'Question'].every((header) => hasHeader(table.headers, header)));
      for (const table of tables) for (const row of table.rows) {
        const id = col(row, 'ID');
        if (id.startsWith('{')) continue;
        const token = `unknown:${id}@${artifactId}`;
        if (parseScopedTargetRef(token)?.rowId !== id) fail(`unknown ${JSON.stringify(id)} in ${artifactId} cannot form a scoped reference`);
        add({ key: token, id, artifactId, token, roots: [token] }, location.slug, authored ? 'authored' : 'ordinary');
      }
    }
    for (const [id, hits] of entry.rows) for (const hit of hits) {
      if (hit.family !== 'conflict' || skipped.has(scopeJson([file, hit.sectionSlug]))) continue;
      const token = `${hit.family}:${id}@${artifactId}`;
      // The uncertainty pass read every such row outside an unaudited section and failed on a malformed one.
      if (parseScopedTargetRef(token)?.rowId !== id) fail(`${hit.family} ${JSON.stringify(id)} in ${artifactId} cannot form a scoped reference`);
      add({ key: token, id, artifactId, token, roots: [token] }, hit.sectionSlug);
    }
  }
  for (const node of projected) for (const row of scopedCoveredRows(node, sites)) known.add(row);
  const roots = [...new Map([...rows.values()].flatMap((row) => row.roots.map((ref) =>
    [rootKey(ref, row.mode), { ref, mode: row.mode }]))).values()];
  // Enumeration is not selection. Keep alternate physical rows separate while
  // discovering relations; only the joined rows become strict graph demands.
  const graph = roots.length ? resolveScopedCandidateGraph({ roots, targetIndex, inputArtifacts, projectRoot,
    project: scopedProjectionNode }) : { roots: [], nodes: [], edges: [], read_set: [] };
  readSet.push(...graph.read_set);
  const rootVertices = new Map(graph.roots.map(({ ref, mode, key }) => [rootKey(ref, mode), key]));
  for (const row of rows.values()) row.vertices = [...new Set(row.roots.map((ref) => rootVertices.get(rootKey(ref, row.mode))))];
  const nodes = new Map(graph.nodes.map((node) => [node.key, node.record])), byRef = new Map();
  const sameSource = (left, right) => left.file === right.file && scopeJson(spans(left)) === scopeJson(spans(right));
  const priorSources = new Map();
  for (const node of selected.values()) for (const ref of [node.ref, scopedRowAlias(node)].filter(Boolean)) {
    if (!priorSources.has(ref)) priorSources.set(ref, []);
    priorSources.get(ref).push(node);
  }
  // A canonical ref can have an applied authored row and a different ordinary
  // candidate. Suppress only the already applied physical root, not its sibling.
  for (const [key, row] of rows) if (applied.has(row.token) && row.vertices.every((vertex) =>
    (priorSources.get(row.token) || []).some((prior) => sameSource(prior, nodes.get(vertex))))) rows.delete(key);
  const forward = new Map(), backward = new Map(), physicalSites = new Map(), bounds = new WeakMap();
  const coverageNodes = new Map(nodes), referenceVertex = (ref) => scopeJson(['prior-ref', ref]);
  for (const { key, record } of graph.nodes) {
    if (!byRef.has(record.ref)) byRef.set(record.ref, []);
    byRef.get(record.ref).push(key);
    const location = scopedRowSite(record);
    if (location) scopedAddRowSite(physicalSites, { ...location, row: key }, record.selection);
  }
  // Applied rows are not discovery roots, but a candidate section/body can
  // still cover their exact selected source and thereby relate to that row.
  for (const record of selected.values()) {
    const location = scopedRowSite(record);
    if (!location) continue;
    const key = referenceVertex(record.ref);
    coverageNodes.set(key, record);
    scopedAddRowSite(physicalSites, { ...location, row: key }, record.selection);
  }
  const range = (node) => {
    if (!bounds.has(node.selection)) {
      const selected = spans(node);
      bounds.set(node.selection, selected.length ? selected.reduce(([first, last], [start, end]) =>
        [Math.min(first, start), Math.max(last, end)], [Infinity, -Infinity]) : null);
    }
    return bounds.get(node.selection);
  };
  const covered = (node) => scopedCoveredRows(node, physicalSites).filter((key) => {
    const outer = range(node), inner = range(coverageNodes.get(key));
    return outer && inner && outer[0] <= inner[0] && inner[1] <= outer[1];
  });
  const link = (from, to) => {
    if (!forward.has(from)) forward.set(from, []);
    forward.get(from).push(to);
    if (!backward.has(to)) backward.set(to, []);
    backward.get(to).push(from);
  };
  const linkRef = (from, ref) => {
    const targets = byRef.get(ref) || [referenceVertex(ref)];
    for (const target of targets) link(from, target);
  };
  for (const edge of graph.edges) {
    link(edge.from, edge.to);
    const node = nodes.get(edge.to);
    // A real dependency on a previously selected ref is a relation witness
    // even if it chooses another source; strict materialization must reject it.
    for (const ref of [node.ref, scopedRowAlias(node)].filter(Boolean)) if (known.has(ref)) {
      link(edge.from, referenceVertex(ref));
    }
  }
  for (const { key, record: node } of graph.nodes) {
    const alias = scopedRowAlias(node);
    if (alias) for (const target of byRef.get(alias) || []) {
      if (node.file === nodes.get(target).file && scopeJson(spans(node)) === scopeJson(spans(nodes.get(target)))) {
        link(key, target); link(target, key);
      }
    }
    for (const row of covered(node)) link(key, row);
    // Enumeration alone is no demand for an alternative source with the same
    // spelling. Seed these roots only from an actually selected physical row.
    for (const ref of [node.ref, alias].filter(Boolean)) if ((priorSources.get(ref) || []).some((prior) => sameSource(prior, node))) {
      link(key, referenceVertex(ref));
    }
  }
  // A document's decision_refs, as the global Decision refs it names; strict once it is related.
  const named = (artifactId, strict) => {
    const ids = targetIndex.artifacts.get(artifactId)?.fm?.decision_refs;
    if (ids === undefined) return [];
    if (!Array.isArray(ids)) { if (strict) fail(`decision_refs in ${artifactId}: array required`); return []; }
    return ids.filter((id) => {
      if (isScopedRowId('decision', id)) return true;
      if (strict) fail(`decision_refs entry ${JSON.stringify(id)} in ${artifactId} cannot form a scoped decision reference`);
      return false;
    }).map((id) => `decision:${id}@open-decision-register`);
  };
  // Each node's document decision_refs lead on to the Decisions it names (loosely here).
  const loose = new Map();
  for (const { key, record: node } of graph.nodes) if (node.artifact_id) {
    if (!loose.has(node.artifact_id)) loose.set(node.artifact_id, named(node.artifact_id, false));
    for (const decision of loose.get(node.artifact_id)) linkRef(key, decision);
  }
  // A row joins when one of its roots reaches a known node, and what a joined row reaches becomes
  // known, to a fixpoint. Rather than each row's own closure, the nodes that reach a known node are
  // marked backwards once and each reached node is expanded once, so the search is linear in the graph.
  const rootsOf = new Map();
  for (const row of rows.values()) for (const root of row.vertices) {
    if (!rootsOf.has(root)) rootsOf.set(root, []);
    rootsOf.get(root).push(row);
  }
  const reaching = new Set(), reached = new Set(), joined = new Set(), ready = [];
  const reachingFrom = (start) => {
    if (reaching.has(start)) return;
    reaching.add(start);
    const queue = [start];
    for (let index = 0; index < queue.length; index += 1) {
      searchStats.visited += 1;
      ready.push(...(rootsOf.get(queue[index]) || []));
      for (const previous of backward.get(queue[index]) || []) if (!reaching.has(previous)) { reaching.add(previous); queue.push(previous); }
    }
  };
  const knownVertices = new Set([...known].map(referenceVertex));
  for (const node of projected) for (const row of covered(node)) knownVertices.add(row);
  for (const ref of knownVertices) reachingFrom(ref);
  while (ready.length) {
    const row = ready.pop();
    if (joined.has(row)) continue;
    if (!row.token) fail(`decision ${JSON.stringify(row.id)} in ${row.artifactId} relates to a projected row but cannot form a scoped decision reference`);
    joined.add(row);
    const queue = row.vertices.filter((root) => !reached.has(root));
    for (const root of queue) reached.add(root);
    for (let index = 0; index < queue.length; index += 1) {
      searchStats.visited += 1;
      if (!knownVertices.has(queue[index])) { knownVertices.add(queue[index]); reachingFrom(queue[index]); }
      for (const next of forward.get(queue[index]) || []) if (!reached.has(next)) { reached.add(next); queue.push(next); }
    }
  }
  // A row whose ID cannot form a typed reference also relates when a related node selects it
  // (an artifact row selection) or covers it; the basis could not name it either way.
  if (untyped.size) for (const node of [...projected, ...graph.nodes.filter((value) => reached.has(value.key)).map((value) => value.record)]) {
    const selection = node.selection;
    const id = node.kind === 'artifact' && selection?.type === 'row' && Array.isArray(selection.headers)
      ? col(Object.fromEntries(selection.headers.map((header, index) => [header, selection.cells[index]])), 'ID') : null;
    for (const key of [...(id ? [`untyped:${node.artifact_id}#${selection.section}/${id}`] : []), ...scopedCoveredRows(node, sites)]) {
      const row = untyped.get(key);
      if (row) fail(`decision ${JSON.stringify(row.id)} in ${row.artifactId} relates to a projected row but cannot form a scoped decision reference`);
    }
  }
  const demandedRoots = [...joined].flatMap((row) => row.roots.map((ref) => ({ ref, mode: row.mode })));
  const materialized = demandedRoots.length ? resolveScopedContractGraph({
    contracts: [...new Set(demandedRoots.map(({ ref }) => ref))], targetIndex, inputArtifacts, projectRoot,
    project: scopedProjectionNode, trackingRefs: context.trackingRefs,
    authoredRefs: [...new Set([...context.authoredRefs, ...demandedRoots.filter(({ mode }) => mode === 'authored').map(({ ref }) => ref)])],
    ordinaryRefs: [...new Set([...context.ordinaryRefs, ...demandedRoots.filter(({ mode }) => mode === 'ordinary').map(({ ref }) => ref)])],
  }) : { nodes: [], edges: [], read_set: [] };
  readSet.push(...materialized.read_set);
  const materializedNodes = new Map(materialized.nodes.map((node) => [node.ref, node]));
  const records = [...new Set([...joined].map((row) => row.token))].map((token) => {
    const node = materializedNodes.get(token), { headers, cells } = node.selection;
    const status = col(Object.fromEntries(headers.map((header, index) => [header, cells[index]])), 'Status');
    return { ...scopedProjectionNode(node), status: String(status || '').toLowerCase() || null };
  });
  // Every Decision row's home documents, one per row, as the decision pass counts collisions.
  let decisionHomes = null;
  const homes = () => {
    if (!decisionHomes) {
      decisionHomes = new Map();
      for (const [artifactId, entry] of targetIndex.artifacts) for (const [id, hits] of entry.rows) for (const hit of hits) if (hit.family === 'decision') {
        if (!decisionHomes.has(id)) decisionHomes.set(id, []);
        decisionHomes.get(id).push(artifactId);
      }
    }
    return decisionHomes;
  };
  // The global register that ordinary decision_refs resolve against: its canonical file and type, and a
  // register the decision pass can load.
  let register = null;
  const canonicalRegister = () => {
    if (register) return register;
    const entry = targetIndex.artifacts.get('open-decision-register');
    if (!entry || entry.file !== path.join(docsDir, 'global', 'open-decisions.md') || entry.fm.artifact_type !== 'open-decision-register') {
      fail('noncanonical global decision home');
    }
    const loaded = loadOpenDecisionRegister({ docsDir });
    if (!loaded.exists || loaded.structuralErrors.length) fail('invalid canonical global decision register');
    register = loaded;
    return register;
  };
  // The Decision IDs with more than one home, collected once for every list resolved below (#275 r12).
  let collisions = null;
  const collidingIds = () => {
    if (!collisions) {
      collisions = new Set();
      for (const [id, found] of homes()) { searchStats.visited += 1; if (found.length !== 1) collisions.add(id); }
    }
    return collisions;
  };
  // A document's whole decision_refs list, resolved once as the decision pass resolves an owner's: a
  // malformed referenced row stops the basis as it stops the pass.
  const resolvedLists = new Set();
  const resolveList = (artifactId) => {
    if (resolvedLists.has(artifactId)) return;
    resolvedLists.add(artifactId);
    const entry = targetIndex.artifacts.get(artifactId);
    const resolved = resolveDecisionRefs({ refs: entry.fm.decision_refs, registry: canonicalRegister(), referrer: entry.fm, conflictingIds: collidingIds() });
    if (resolved.malformed.length) fail(`decision_refs in ${artifactId}: ${resolved.malformed.map((value) => value.code).join(', ')}`);
  };
  const links = [];
  for (const ref of reached) {
    const node = nodes.get(ref);
    if (node?.artifact_id) for (const decision of named(node.artifact_id, true)) {
      // Validated as an ordinary decision_refs entry: exactly one Decision home, then the document's whole
      // list against the canonical global register.
      const parsed = parseScopedTargetRef(decision), found = homes().get(parsed.rowId) || [];
      if (!found.includes(parsed.ownerArtifactId)) fail(`decision_refs in ${node.artifact_id} names no Decision row ${decision}`);
      if (found.length !== 1) fail(`decision_refs in ${node.artifact_id} names an ambiguous Decision ${decision}`);
      resolveList(node.artifact_id);
      links.push({ referrer: node.ref, decision });
    }
  }
  const evidenceNodes = materialized.nodes.map(scopedProjectionNode);
  // Validate source identity before the basis can combine this graph with earlier
  // passes. Equal public cells still cannot substitute a different physical row.
  for (const node of evidenceNodes) checkSelected(node);
  return { unapplied: { records: copyScopedNodeContexts(records, scopeSet(records)), document_refs: scopeSet(links), evidence: mergeScopedGraphContexts([materialized], {
    nodes: copyScopedNodeContexts(evidenceNodes, scopeSet(evidenceNodes)),
    edges: materialized.edges }) }, read_set: readSet };
}

// The global Decision refs a document's frontmatter decision_refs names, read loosely; strict
// validation happens once the document relates.
function looseDecisionRefs(fm) {
  const ids = fm?.decision_refs;
  return Array.isArray(ids) ? ids.filter((id) => isScopedRowId('decision', id)).map((id) => `decision:${id}@open-decision-register`) : [];
}

// The rows of a document's canonical Open Decisions table, read from its indexed snapshot, as the
// Unknown/Conflict audit reads its sections. A section without a single readable canonical table
// (prose only or a quoted table included), or a row whose identity cannot be read (an empty ID or
// one the table repeats), is an error when the document holds a typed reference; otherwise it cannot
// cite anything and is left out, while the table's other rows stay. An ID that starts with `{` is a
// template placeholder, as in the target index, and no row.
function decisionRows(entry) {
  const occurrences = parseReconciliationMarkdown(entry.body).occurrences.filter((occurrence) => occurrence.slug === 'open-decisions');
  if (!occurrences.length) return [];
  const unreadable = (message) => {
    if (referencing(entry)) fail(`Open Decisions table in ${entry.fm.artifact_id} cannot be read: ${message}`);
  };
  const rows = [];
  try {
    if (occurrences.length !== 1) fail('one Open Decisions section required');
    const [occurrence] = occurrences;
    const tables = occurrence.tables.map(scopedRawTable).filter((table) => DECISION_TABLE.every((header) => hasHeader(table.headers, header)));
    if (tables.length !== 1) fail('one canonical decision table required');
    tables[0].rows.forEach((row, index) => {
      const id = String(col(row, 'ID') ?? '').trim();
      if (!id.startsWith('{')) rows.push({ id, headers: tables[0].headers, cells: tables[0].cells[index], slug: occurrence.slug });
    });
  } catch (error) {
    if (!(error instanceof ScopedWorkContractError)) throw error;
    unreadable(error.message);
    return [];
  }
  const counts = new Map();
  for (const row of rows) counts.set(row.id, (counts.get(row.id) || 0) + 1);
  const unread = rows.find((row) => !row.id || counts.get(row.id) > 1);
  if (unread) unreadable(unread.id ? `repeated Decision ID ${JSON.stringify(unread.id)}` : 'empty Decision ID');
  return rows.filter((row) => row.id && counts.get(row.id) === 1);
}
// Whether a document holds a typed reference, as the Unknown/Conflict section audit judges it: its
// raw spelling, or the metadata and native body references resolution reads (decoded link
// destinations included); a reference that cannot be read counts.
function referencing(entry) {
  if (TYPED_SPELLING.test(entry.body) || TYPED_SPELLING.test(JSON.stringify(entry.fm))) return true;
  try {
    return scopedGraphMetadataRefs(entry.fm).length > 0 || scopedGraphBodyRefs(entry.body, parseReconciliationReferenceView(entry.body), entry.fm).length > 0;
  } catch (error) {
    if (error instanceof CurrentWorkError) return true;
    throw error;
  }
}
// A document read through its index entry joins the read set as the bytes it was indexed from.
function indexedFile(projectRoot, entry) {
  const file = path.relative(projectRoot, entry.file).split(path.sep).join('/');
  const bytes = readCurrentBytes(canonicalRepositoryPath(projectRoot, file, { required: true, type: 'file', label: 'scoped decision' }).absolute, 'scoped decision');
  const parsed = splitFrontmatter(decodeGitUtf8(bytes, 'scoped decision'));
  if (parsed.parseError || parsed.body !== entry.body || scopeJson(parsed.data) !== scopeJson(entry.fm)) fail('decision document differs from its indexed snapshot');
  return { file, sha256: hashBytes(bytes) };
}
