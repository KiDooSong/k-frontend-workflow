// Compose file-backed R1 relation closure with ownership facts. This is NOT a
// binding digest, approval, uncertainty resolution, readiness or path permit.
// Public scoped execution stays unsupported until the complete runtime exists.
import path from 'node:path';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { splitFrontmatter } from './util.mjs';
import { col, hasHeader } from './spec.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { parseReconciliationMarkdown } from './reconciliation-markdown-ast.mjs';
import { parseScopedTargetRef, isScopedRowId, scopedRawTable } from './scoped-work-refs.mjs';
import { resolveScopedContractGraph, scopedGraphSelectionRefs } from './scoped-work-graph.mjs';
import { scopedProjectionNode } from './scoped-work-projection.mjs';
import { readCurrentBytes, hashBytes } from './current-work-request.mjs';
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
  const unapplied = unappliedDecisions(options, current.projection);
  audit(unapplied.read_set);
  for (const entry of files.values()) {
    const file = canonicalRepositoryPath(projectRoot, entry.file, { required: true, type: 'file', label: 'scoped applicability' });
    if (hashBytes(readCurrentBytes(file.absolute, 'scoped applicability')) !== entry.sha256) fail('snapshot changed after relation closure');
  }
  const projection = { ...current.projection, decision_relations: { ...current.projection.decision_relations, unapplied: unapplied.unapplied } };
  return { projection: { ...projection, ownership }, read_set: scopeSet([...files.values()]), unaudited: current.unaudited };
}

// #275: Decision rows that apply to no owner but relate to a projected row or evidence node.
// Every other Decision row's references are read as resolution reads them, in one graph, and
// a row joins when they reach a projected row or node, or one a joined row reaches, to a
// fixpoint. A document's frontmatter decision_refs leads from its evidence to the Decisions
// it names, as for an applied row. They decide nothing here; a binding basis relates them to
// the rows they reach. Any non-empty Decision ID is valid, so one that cannot form a typed
// reference is an error only when its row relates. A table or reference that cannot be read
// is an error wherever it is, as for Unknown and Conflict rows.
const DECISION_TABLE = ['ID', 'Status', 'Blocking Mode'];
function unappliedDecisions({ targetIndex, projectRoot, inputArtifacts = [] }, projection) {
  const { decision_relations: decisions, uncertainty_relations: uncertainty } = projection;
  const known = new Set([...decisions.records, ...uncertainty.records].map((entry) => entry.ref));
  for (const graph of [projection.evidence, decisions.evidence, uncertainty.evidence]) for (const node of graph.nodes) known.add(node.ref);
  const rows = new Map(), readSet = [];
  for (const [artifactId, entry] of targetIndex.artifacts) for (const [id, hits] of entry.rows) for (const hit of hits) {
    const token = `decision:${id}@${artifactId}`;
    if (hit.family !== 'decision' || known.has(token) || rows.has(token)) continue;
    rows.set(token, isScopedRowId('decision', id) && parseScopedTargetRef(token)?.rowId === id
      ? { id, artifactId, token, roots: [token] } : { id, artifactId, token: null, roots: untypedRowRefs(entry, hit.sectionSlug, id) });
    if (!rows.get(token).token) readSet.push(indexedFile(projectRoot, entry));
  }
  const roots = [...new Set([...rows.values()].flatMap((row) => row.roots))];
  const graph = roots.length ? resolveScopedContractGraph({ contracts: roots, targetIndex, inputArtifacts, projectRoot })
    : { nodes: [], edges: [], read_set: [] };
  readSet.push(...graph.read_set);
  const nodes = new Map(graph.nodes.map((node) => [node.ref, node])), forward = new Map();
  for (const edge of graph.edges) forward.set(edge.from, [...(forward.get(edge.from) || []), edge.to]);
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
  const reaches = new Map();
  const reach = (row) => {
    if (!reaches.has(row)) {
      const seen = new Set(row.roots), queue = [...row.roots];
      for (let index = 0; index < queue.length; index += 1) {
        const node = nodes.get(queue[index]);
        for (const next of [...(forward.get(queue[index]) || []), ...(node?.artifact_id ? named(node.artifact_id, false) : [])]) {
          if (!seen.has(next)) { seen.add(next); queue.push(next); }
        }
      }
      reaches.set(row, seen);
    }
    return reaches.get(row);
  };
  const joined = new Set();
  for (let grown = true; grown;) {
    grown = false;
    for (const row of rows.values()) {
      if (joined.has(row) || ![...reach(row)].some((ref) => ref !== row.token && known.has(ref))) continue;
      if (!row.token) fail(`decision ${JSON.stringify(row.id)} in ${row.artifactId} relates to a projected row but cannot form a scoped decision reference`);
      joined.add(row); grown = true;
      for (const ref of reach(row)) known.add(ref);
    }
  }
  const reached = new Set([...joined].flatMap((row) => [...reach(row)]));
  const records = [...joined].map((row) => {
    const node = nodes.get(row.token), { headers, cells } = node.selection;
    const status = col(Object.fromEntries(headers.map((header, index) => [header, cells[index]])), 'Status');
    return { ...scopedProjectionNode(node), decision_id: row.id, status: String(status || '').toLowerCase() || null };
  });
  const links = [];
  for (const ref of reached) {
    const node = nodes.get(ref);
    if (node?.artifact_id) for (const decision of named(node.artifact_id, true)) {
      if (!nodes.has(decision) && !projectedDecision(projection, decision)) fail(`decision_refs in ${node.artifact_id} names no Decision row ${decision}`);
      links.push({ referrer: ref, decision });
    }
  }
  return { unapplied: { records: scopeSet(records), document_refs: scopeSet(links), evidence: {
    nodes: scopeSet(graph.nodes.filter((node) => reached.has(node.ref)).map(scopedProjectionNode)),
    edges: scopeSet(graph.edges.filter((edge) => reached.has(edge.from) && reached.has(edge.to))) } }, read_set: readSet };
}
const projectedDecision = (projection, ref) => projection.decision_relations.records.some((entry) => entry.ref === ref);

// The references one Decision row cites, read from the indexed snapshot of its document.
function untypedRowRefs(entry, slug, id) {
  const matches = [];
  for (const occurrence of parseReconciliationMarkdown(entry.body).occurrences.filter((value) => value.slug === slug)) {
    for (const table of occurrence.tables.map(scopedRawTable)) {
      if (!DECISION_TABLE.every((header) => hasHeader(table.headers, header))) continue;
      table.rows.forEach((row, index) => { if (col(row, 'ID') === id) matches.push({ headers: table.headers, cells: table.cells[index] }); });
    }
  }
  if (matches.length !== 1) fail(`decision ${JSON.stringify(id)} in ${entry.fm.artifact_id} is missing or ambiguous`);
  return scopedGraphSelectionRefs(entry.body, entry.fm, { type: 'row', section: slug, ...matches[0] });
}
// A document read through its index entry joins the read set as the bytes it was indexed from.
function indexedFile(projectRoot, entry) {
  const file = path.relative(projectRoot, entry.file).split(path.sep).join('/');
  const bytes = readCurrentBytes(canonicalRepositoryPath(projectRoot, file, { required: true, type: 'file', label: 'scoped decision' }).absolute, 'scoped decision');
  const parsed = splitFrontmatter(decodeGitUtf8(bytes, 'scoped decision'));
  if (parsed.parseError || parsed.body !== entry.body || scopeJson(parsed.data) !== scopeJson(entry.fm)) fail('decision document differs from its indexed snapshot');
  return { file, sha256: hashBytes(bytes) };
}
