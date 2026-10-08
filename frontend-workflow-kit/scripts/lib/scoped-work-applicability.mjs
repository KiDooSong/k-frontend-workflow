// Compose file-backed R1 relation closure with ownership facts. This is NOT a
// binding digest, approval, uncertainty resolution, readiness or path permit.
// Public scoped execution stays unsupported until the complete runtime exists.
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { col } from './spec.mjs';
import { createScopedReferenceResolver, parseScopedTargetRef, isScopedRowId } from './scoped-work-refs.mjs';
import { resolveScopedContractGraph } from './scoped-work-graph.mjs';
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
// A citer cites one, directly or through its own evidence; a Decision that a document of a
// citer's evidence names in frontmatter decision_refs joins too, as for an applied row. They
// decide nothing here; a binding basis relates them to the rows they reach. Only a section
// whose text holds the typed reference of a projected row, node or joined row is read, and
// there a format problem is fatal.
function unappliedDecisions({ targetIndex, projectRoot, inputArtifacts = [] }, projection) {
  const refs = createScopedReferenceResolver({ targetIndex, projectRoot, inputArtifacts });
  const { decision_relations: decisions, uncertainty_relations: uncertainty } = projection;
  const known = new Set([...decisions.records, ...uncertainty.records].map((entry) => entry.ref));
  for (const graph of [projection.evidence, decisions.evidence, uncertainty.evidence]) for (const node of graph.nodes) known.add(node.ref);
  const candidates = [];
  for (const [artifactId, entry] of targetIndex.artifacts) for (const [id, hits] of entry.rows) for (const hit of hits) {
    if (hit.family === 'decision') candidates.push({ id, token: `decision:${id}@${artifactId}`, text: entry.sections.get(hit.sectionSlug)?.text || '' });
  }
  const records = new Map(), nodes = new Map(), edges = new Map(), named = new Map(), graphs = new Map(), readSet = [];
  // A row's graph does not change between passes; only what is known grows.
  const graphOf = (token) => {
    if (!graphs.has(token)) {
      const graph = resolveScopedContractGraph({ contracts: [token], targetIndex, inputArtifacts, projectRoot });
      readSet.push(...graph.read_set);
      graphs.set(token, graph);
    }
    return graphs.get(token);
  };
  const namedBy = (artifactId) => {
    const ids = targetIndex.artifacts.get(artifactId)?.fm?.decision_refs;
    if (ids === undefined) return [];
    if (!Array.isArray(ids)) fail(`decision_refs in ${artifactId}: array required`);
    return ids.map((id) => {
      if (!isScopedRowId('decision', id)) fail(`decision_refs entry ${JSON.stringify(id)} in ${artifactId} cannot form a scoped decision reference`);
      return `decision:${id}@open-decision-register`;
    });
  };
  const join = (token, id) => {
    known.add(token);
    const graph = graphOf(token), selected = refs.contract(token), { headers, cells } = selected.selection;
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
    records.set(token, { ...scopedProjectionNode(selected), decision_id: id, status: String(col(row, 'Status') || '').toLowerCase() || null });
    for (const node of graph.nodes) nodes.set(node.ref, scopedProjectionNode(node));
    for (const edge of graph.edges) edges.set(scopeJson(edge), edge);
    for (const node of graph.nodes) if (node.artifact_id) for (const decision of namedBy(node.artifact_id)) {
      const link = { referrer: node.ref, decision };
      named.set(scopeJson(link), link);
      if (!known.has(decision)) join(decision, parseScopedTargetRef(decision).rowId);
    }
  };
  for (let grown = true; grown;) {
    grown = false;
    const spelled = [...known];
    for (const candidate of candidates) {
      if (known.has(candidate.token) || !spelled.some((ref) => candidate.text.includes(ref))) continue;
      if (!isScopedRowId('decision', candidate.id) || parseScopedTargetRef(candidate.token)?.rowId !== candidate.id) {
        fail(`decision ${JSON.stringify(candidate.id)} near a projected reference cannot form a scoped decision reference`);
      }
      if (!graphOf(candidate.token).nodes.some((node) => node.ref !== candidate.token && known.has(node.ref))) continue;
      join(candidate.token, candidate.id); grown = true;
    }
  }
  return { unapplied: { records: scopeSet([...records.values()]), document_refs: scopeSet([...named.values()]),
    evidence: { nodes: scopeSet([...nodes.values()]), edges: scopeSet([...edges.values()]) } }, read_set: readSet };
}
