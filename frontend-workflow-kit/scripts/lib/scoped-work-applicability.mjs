// Compose file-backed R1 relation closure with ownership facts. This is NOT a
// binding digest, approval, uncertainty resolution, readiness or path permit.
// Public scoped execution stays unsupported until the complete runtime exists.
import path from 'node:path';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { splitFrontmatter } from './util.mjs';
import { col, hasHeader } from './spec.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { parseReconciliationMarkdown } from './reconciliation-markdown-ast.mjs';
import { parseScopedTargetRef, isScopedRowId, scopedRawTable, scopedRowAlias } from './scoped-work-refs.mjs';
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
// reaches, to a fixpoint. An exact artifact row selection is the row it selects, and a
// document's frontmatter decision_refs leads from its evidence to the Decisions it names, as
// for an applied row. They decide nothing here; a binding basis relates them to the rows they
// reach. Any non-empty Decision ID is valid, so one that cannot form a typed reference is an
// error only when its row relates. As for Unknown and Conflict sections (#260), a Decision
// table that cannot be read is an error when its document holds a typed reference, and a
// reference that cannot be resolved is an error wherever it is.
const TYPED_SPELLING = /(?:artifact|decision|unknown|conflict|gap|investigation|verification|input):/;
const DECISION_TABLE = ['ID', 'Status', 'Blocking Mode'];
function unappliedRows({ targetIndex, projectRoot, inputArtifacts = [] }, projection, unaudited = []) {
  const { decision_relations: decisions, uncertainty_relations: uncertainty } = projection;
  const known = new Set([...decisions.records, ...uncertainty.records].map((entry) => entry.ref));
  for (const graph of [projection.evidence, decisions.evidence, uncertainty.evidence]) for (const node of graph.nodes) {
    known.add(node.ref);
    const alias = scopedRowAlias(node);
    if (alias) known.add(alias);
  }
  const skipped = new Set(unaudited.map((entry) => scopeJson([entry.file, entry.section])));
  const rows = new Map(), readSet = [];
  const add = (row) => { if (!known.has(row.key) && !rows.has(row.key)) rows.set(row.key, row); };
  for (const [artifactId, entry] of targetIndex.artifacts) {
    const file = path.relative(projectRoot, entry.file).split(path.sep).join('/');
    for (const { id, headers, cells, slug } of decisionRows(entry)) {
      const token = `decision:${id}@${artifactId}`;
      if (isScopedRowId('decision', id) && parseScopedTargetRef(token)?.rowId === id) add({ key: token, id, artifactId, token, roots: [token] });
      else {
        add({ key: token, id, artifactId, token: null, roots: scopedGraphSelectionRefs(entry.body, entry.fm, { type: 'row', section: slug, headers, cells }) });
        readSet.push(indexedFile(projectRoot, entry));
      }
    }
    for (const [id, hits] of entry.rows) for (const hit of hits) {
      if (!['unknown', 'conflict'].includes(hit.family) || skipped.has(scopeJson([file, hit.sectionSlug]))) continue;
      const token = `${hit.family}:${id}@${artifactId}`;
      // The uncertainty pass read every such row outside an unaudited section and failed on a malformed one.
      if (parseScopedTargetRef(token)?.rowId !== id) fail(`${hit.family} ${JSON.stringify(id)} in ${artifactId} cannot form a scoped reference`);
      add({ key: token, id, artifactId, token, roots: [token] });
    }
  }
  const roots = [...new Set([...rows.values()].flatMap((row) => row.roots))];
  const graph = roots.length ? resolveScopedContractGraph({ contracts: roots, targetIndex, inputArtifacts, projectRoot })
    : { nodes: [], edges: [], read_set: [] };
  readSet.push(...graph.read_set);
  const nodes = new Map(graph.nodes.map((node) => [node.ref, node])), forward = new Map();
  const link = (from, to) => forward.set(from, [...(forward.get(from) || []), to]);
  for (const edge of graph.edges) link(edge.from, edge.to);
  for (const node of graph.nodes) {
    const alias = scopedRowAlias(node);
    if (alias) { link(node.ref, alias); link(alias, node.ref); }
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
    return { ...scopedProjectionNode(node), status: String(status || '').toLowerCase() || null };
  });
  const links = [];
  for (const ref of reached) {
    const node = nodes.get(ref);
    if (node?.artifact_id) for (const decision of named(node.artifact_id, true)) {
      if (!nodes.has(decision) && !decisions.records.some((entry) => entry.ref === decision)) {
        fail(`decision_refs in ${node.artifact_id} names no Decision row ${decision}`);
      }
      links.push({ referrer: ref, decision });
    }
  }
  return { unapplied: { records: scopeSet(records), document_refs: scopeSet(links), evidence: {
    nodes: scopeSet(graph.nodes.filter((node) => reached.has(node.ref)).map(scopedProjectionNode)),
    edges: scopeSet(graph.edges.filter((edge) => reached.has(edge.from) && reached.has(edge.to))) } }, read_set: readSet };
}

// The rows of a document's canonical Open Decisions tables, read from its indexed snapshot. A
// section with a table but no single readable canonical one is an error when the document holds
// a typed reference; otherwise its rows cannot cite anything and are left out.
function decisionRows(entry) {
  const rows = [];
  for (const occurrence of parseReconciliationMarkdown(entry.body).occurrences) {
    if (occurrence.slug !== 'open-decisions' || !occurrence.tables.length) continue;
    try {
      const tables = occurrence.tables.map(scopedRawTable).filter((table) => DECISION_TABLE.every((header) => hasHeader(table.headers, header)));
      if (tables.length !== 1) fail('one canonical decision table required');
      tables[0].rows.forEach((row, index) => {
        const id = col(row, 'ID');
        if (id && !id.startsWith('{')) rows.push({ id, headers: tables[0].headers, cells: tables[0].cells[index], slug: occurrence.slug });
      });
    } catch (error) {
      if (!(error instanceof ScopedWorkContractError)) throw error;
      if (TYPED_SPELLING.test(entry.body) || TYPED_SPELLING.test(JSON.stringify(entry.fm))) {
        fail(`Open Decisions table in ${entry.fm.artifact_id} cannot be read: ${error.message}`);
      }
    }
  }
  return rows;
}
// A document read through its index entry joins the read set as the bytes it was indexed from.
function indexedFile(projectRoot, entry) {
  const file = path.relative(projectRoot, entry.file).split(path.sep).join('/');
  const bytes = readCurrentBytes(canonicalRepositoryPath(projectRoot, file, { required: true, type: 'file', label: 'scoped decision' }).absolute, 'scoped decision');
  const parsed = splitFrontmatter(decodeGitUtf8(bytes, 'scoped decision'));
  if (parsed.parseError || parsed.body !== entry.body || scopeJson(parsed.data) !== scopeJson(entry.fm)) fail('decision document differs from its indexed snapshot');
  return { file, sha256: hashBytes(bytes) };
}
