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
import { resolveScopedContractGraph, scopedGraphSelectionRefs, scopedGraphMetadataRefs, scopedGraphBodyRefs } from './scoped-work-graph.mjs';
import { scopedProjectionNode } from './scoped-work-projection.mjs';
import { loadOpenDecisionRegister } from './open-decisions.mjs';
import { readCurrentBytes, hashBytes, CurrentWorkError } from './current-work-request.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { ScopedWorkContractError } from './scoped-work-request.mjs';
import { resolveScopedBoundaryProjection } from './scoped-work-boundaries.mjs';
import { resolveScopedUncertaintyProjection } from './scoped-work-uncertainty.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

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
  const roots = new Map();
  let current;
  while (true) {
    current = resolveScopedUncertaintyProjection({ ...options, layout }, scopeSet([...roots.values()]));
    audit(current.read_set);
    const { decision_relations: _nextDecisions, uncertainty_relations, ...nextUnits } = current.projection;
    if (scopeJson(nextUnits) !== scopeJson(unitProjection)) fail('unit projection changed between layers');
    const count = roots.size;
    for (const application of uncertainty_relations.applications) {
      const root = { owner: application.owner, unit: application.unit, ref: application.uncertainty };
      roots.set(scopeJson(root), root);
    }
    // Canonical uncertainty refs x selected owner/units form a finite set.
    // Roots only grow; no arbitrary depth cutoff or first-host/first-pass win.
    if (roots.size === count) break;
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
// one graph, and a row joins when they reach a projected row or node, or one a joined row
// reaches, to a fixpoint; a row that such a node is, selects, covers or names joins as well, even
// when it cites nothing itself. An exact artifact row selection is the row it selects, a reference
// to a section or a whole document covers the rows it holds, and a document's frontmatter
// decision_refs leads from its evidence to the Decisions it names, as for an applied row. They decide nothing here; a binding basis relates them to the rows they
// reach. Any non-empty Decision ID is valid, so one that cannot form a typed reference is an
// error only when its row relates. As for Unknown and Conflict sections (#260), a Decision
// table that cannot be read is an error when its document holds a typed reference, and a
// reference that cannot be resolved is an error wherever it is.
const searchStats = { visited: 0 };
// Process-wide node visits of the unapplied-row search: read-only diagnostics (#275).
export function scopedUnappliedSearchStats() {
  return { ...searchStats };
}
const TYPED_SPELLING = /(?:artifact|decision|unknown|conflict|gap|investigation|verification|input):/;
const DECISION_TABLE = ['ID', 'Status', 'Blocking Mode'];
function unappliedRows({ targetIndex, projectRoot, docsDir, inputArtifacts = [] }, projection, unaudited = []) {
  const { decision_relations: decisions, uncertainty_relations: uncertainty } = projection;
  const applied = new Set([...decisions.records, ...uncertainty.records].map((entry) => entry.ref)), known = new Set(applied);
  const projected = [projection.evidence, decisions.evidence, uncertainty.evidence].flatMap((graph) => graph.nodes);
  // Where each row sits, so that a section or document reference covers the rows it holds.
  const sites = new Map();
  const site = (value) => scopedAddRowSite(sites, value);
  for (const node of [...decisions.records, ...uncertainty.records, ...projected]) site(scopedRowSite(node));
  for (const node of projected) {
    known.add(node.ref);
    const alias = scopedRowAlias(node);
    if (alias) known.add(alias);
  }
  const skipped = new Set(unaudited.map((entry) => scopeJson([entry.file, entry.section])));
  const rows = new Map(), untyped = new Map(), readSet = [];
  const add = (row, section) => {
    site({ row: row.key, artifact_id: row.artifactId, section });
    if (!applied.has(row.key) && !rows.has(row.key)) rows.set(row.key, row);
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
        add({ key, id, artifactId, token: null, roots: scopedGraphSelectionRefs(entry.body, entry.fm, { type: 'row', section: slug, headers, cells }, view) }, slug);
      }
    }
    for (const [id, hits] of entry.rows) for (const hit of hits) {
      if (!['unknown', 'conflict'].includes(hit.family) || skipped.has(scopeJson([file, hit.sectionSlug]))) continue;
      const token = `${hit.family}:${id}@${artifactId}`;
      // The uncertainty pass read every such row outside an unaudited section and failed on a malformed one.
      if (parseScopedTargetRef(token)?.rowId !== id) fail(`${hit.family} ${JSON.stringify(id)} in ${artifactId} cannot form a scoped reference`);
      add({ key: token, id, artifactId, token, roots: [token] }, hit.sectionSlug);
    }
  }
  for (const node of projected) for (const row of scopedCoveredRows(node, sites)) known.add(row);
  const roots = [...new Set([...rows.values()].flatMap((row) => row.roots))];
  const graph = roots.length ? resolveScopedContractGraph({ contracts: roots, targetIndex, inputArtifacts, projectRoot, project: scopedProjectionNode })
    : { nodes: [], edges: [], read_set: [] };
  readSet.push(...graph.read_set);
  const nodes = new Map(graph.nodes.map((node) => [node.ref, node])), forward = new Map(), backward = new Map();
  const link = (from, to) => {
    if (!forward.has(from)) forward.set(from, []);
    forward.get(from).push(to);
    if (!backward.has(to)) backward.set(to, []);
    backward.get(to).push(from);
  };
  for (const edge of graph.edges) link(edge.from, edge.to);
  for (const node of graph.nodes) {
    const alias = scopedRowAlias(node);
    if (alias) { link(node.ref, alias); link(alias, node.ref); }
    for (const row of scopedCoveredRows(node, sites)) link(node.ref, row);
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
  for (const node of graph.nodes) if (node.artifact_id) {
    if (!loose.has(node.artifact_id)) loose.set(node.artifact_id, named(node.artifact_id, false));
    for (const decision of loose.get(node.artifact_id)) link(node.ref, decision);
  }
  // A row joins when one of its roots reaches a known node, and what a joined row reaches becomes
  // known, to a fixpoint. Rather than each row's own closure, the nodes that reach a known node are
  // marked backwards once and each reached node is expanded once, so the search is linear in the graph.
  const rootsOf = new Map();
  for (const row of rows.values()) for (const root of row.roots) {
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
  for (const ref of known) reachingFrom(ref);
  while (ready.length) {
    const row = ready.pop();
    if (joined.has(row)) continue;
    if (!row.token) fail(`decision ${JSON.stringify(row.id)} in ${row.artifactId} relates to a projected row but cannot form a scoped decision reference`);
    joined.add(row);
    const queue = row.roots.filter((root) => !reached.has(root));
    for (const root of queue) reached.add(root);
    for (let index = 0; index < queue.length; index += 1) {
      searchStats.visited += 1;
      if (!known.has(queue[index])) { known.add(queue[index]); reachingFrom(queue[index]); }
      for (const next of forward.get(queue[index]) || []) if (!reached.has(next)) { reached.add(next); queue.push(next); }
    }
  }
  // A row whose ID cannot form a typed reference also relates when a related node selects it
  // (an artifact row selection) or covers it; the basis could not name it either way.
  if (untyped.size) for (const node of [...projected, ...graph.nodes.filter((value) => reached.has(value.ref))]) {
    const selection = node.selection;
    const id = node.kind === 'artifact' && selection?.type === 'row' && Array.isArray(selection.headers)
      ? col(Object.fromEntries(selection.headers.map((header, index) => [header, selection.cells[index]])), 'ID') : null;
    for (const key of [...(id ? [`untyped:${node.artifact_id}#${selection.section}/${id}`] : []), ...scopedCoveredRows(node, sites)]) {
      const row = untyped.get(key);
      if (row) fail(`decision ${JSON.stringify(row.id)} in ${row.artifactId} relates to a projected row but cannot form a scoped decision reference`);
    }
  }
  const records = [...joined].map((row) => {
    const node = nodes.get(row.token), { headers, cells } = node.selection;
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
  let registerChecked = false;
  const canonicalRegister = () => {
    if (registerChecked) return;
    const entry = targetIndex.artifacts.get('open-decision-register');
    if (!entry || entry.file !== path.join(docsDir, 'global', 'open-decisions.md') || entry.fm.artifact_type !== 'open-decision-register') {
      fail('noncanonical global decision home');
    }
    const register = loadOpenDecisionRegister({ docsDir });
    if (!register.exists || register.structuralErrors.length) fail('invalid canonical global decision register');
    registerChecked = true;
  };
  const links = [];
  for (const ref of reached) {
    const node = nodes.get(ref);
    if (node?.artifact_id) for (const decision of named(node.artifact_id, true)) {
      // Validated as an ordinary decision_refs entry: exactly one Decision home, the canonical global register.
      canonicalRegister();
      const parsed = parseScopedTargetRef(decision), found = homes().get(parsed.rowId) || [];
      if (!found.includes(parsed.ownerArtifactId)) fail(`decision_refs in ${node.artifact_id} names no Decision row ${decision}`);
      if (found.length !== 1) fail(`decision_refs in ${node.artifact_id} names an ambiguous Decision ${decision}`);
      links.push({ referrer: ref, decision });
    }
  }
  return { unapplied: { records: scopeSet(records), document_refs: scopeSet(links), evidence: {
    nodes: scopeSet(graph.nodes.filter((node) => reached.has(node.ref)).map(scopedProjectionNode)),
    edges: scopeSet(graph.edges.filter((edge) => reached.has(edge.from) && reached.has(edge.to))) } }, read_set: readSet };
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
    return scopedGraphMetadataRefs(entry.fm).length > 0 || scopedGraphBodyRefs(entry.body, parseReconciliationReferenceView(entry.body)).length > 0;
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
