// B §5.4 scope basis (v2 since #275) for one existing canonical decision/owner binding.
// Computing a digest does NOT adopt the binding, validate its human approval,
// resolve/reopen a decision, grant coverage or authorize any path/CLI execution.
import { splitFrontmatter } from './util.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { readCurrentBytes, hashBytes } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { parseDecisionWorkScopes } from './scoped-work-declarations.mjs';
import { parseScopedTargetRef } from './scoped-work-refs.mjs';
import { resolveScopedApplicabilityProjection } from './scoped-work-applicability.mjs';
import { ScopedWorkContractError, workText } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-BASIS: ${message}`); };

export function resolveScopedBindingBasis(options = {}) {
  const { owner, decisionRef, projectRoot, targetIndex } = options;
  const parsed = parseScopedTargetRef(workText(decisionRef, 'scope basis decision'));
  if (!parsed || parsed.kind !== 'decision') fail('canonical typed decision reference required');

  // Re-resolve from actual resources; never hash a caller-provided projection,
  // blocks list, target subset or precomputed digest. The projection holds ALL
  // units of the binding owner, the selected host units, relation closure and
  // claims; scope-basis-v2 keeps the unit facts and this row's relation closure.
  const { projection, read_set } = resolveScopedApplicabilityProjection(options);
  const record = projection.decision_relations.records.find((entry) => entry.ref === decisionRef);
  if (!record || !projection.decision_relations.applications.some((entry) =>
    entry.owner === owner && entry.decision === decisionRef)) {
    fail('decision does not apply to the binding owner');
  }
  const files = new Map(read_set.map((entry) => [entry.file, entry.sha256]));
  function read(relative) {
    if (!files.has(relative)) fail('binding home missing from the resolved read set');
    const file = canonicalRepositoryPath(projectRoot, relative, { required: true, type: 'file', label: 'scope basis' });
    const raw = readCurrentBytes(file.absolute, 'scope basis');
    if (hashBytes(raw) !== files.get(relative)) fail('snapshot changed while computing scope basis');
    return raw;
  }
  const home = splitFrontmatter(decodeGitUtf8(read(record.file), 'scope binding home'));
  const indexed = targetIndex.artifacts.get(parsed.ownerArtifactId);
  if (!home.hasFrontmatter || home.parseError || !indexed ||
      scopeJson(home.data) !== scopeJson(indexed.fm) || home.body !== indexed.body) {
    fail('binding home differs from its indexed snapshot');
  }
  const declaration = parseDecisionWorkScopes(home.data.decision_work_scopes);
  const binding = declaration?.bindings.find((entry) => entry.decision_id === parsed.rowId && entry.owner === owner);
  // Missing bindings are conservative in the later evaluator, NOT blocks: [].
  // This calculator does not invent a provisional binding or approval to hash.
  if (!binding) fail('existing canonical decision/owner binding required');
  const knownUnits = scopeSet(binding.known_units);
  if (scopeJson(knownUnits) !== scopeJson(projection.known_units)) {
    fail('binding known_units must match all current owner units');
  }

  const { basis, basis_digest, component_digests } = scopedBindingBasis(projection, {
    decision: decisionRef, owner, known_units: knownUnits, blocks: scopeSet(binding.blocks),
  });
  for (const entry of read_set) read(entry.file);
  return {
    basis, basis_digest, component_digests,
    recorded_binding: { basis_digest: binding.basis_digest, approval_ref: binding.approval_ref },
    read_set,
  };
}

// #275 scope-basis-v2: the owner's unit facts as in v1, and only the target row's
// relation closure from the Decision and Unknown/Conflict relations. Each projection
// field is placed explicitly; a field this version does not know cannot be hashed.
const ROW_KINDS = new Set(['decision', 'unknown', 'conflict']);
// A native relation's referrer names the owner or surface document, whose metadata stays
// in referrers; its body is not evidence of the row.
const NATIVE_RELATIONS = new Set(['local', 'decision-ref', 'surface-member']);
const UNIT_FIELDS = ['evidence', 'host_links', 'inputs', 'known_units', 'owner', 'owners', 'ownership', 'policy', 'units'];
const RELATION_FIELDS = {
  decision_relations: ['applications', 'dependency_roots', 'evidence', 'memberships', 'records', 'referrers'],
  uncertainty_relations: ['applications', 'evidence', 'records', 'scope_review_needed'],
};
export const SCOPE_BASIS_VERSION = 2;
const digestOf = (value) => hashBytes(Buffer.from(scopeJson(value), 'utf8'));
const isRow = (ref) => typeof ref === 'string' && ROW_KINDS.has(parseScopedTargetRef(ref)?.kind);

function checkFields(value, allowed, label) {
  for (const key of Object.keys(value || {})) if (!allowed.includes(key)) fail(`unknown basis field ${label}${key}`);
}

// The rows related to the target and the evidence nodes that touch them. Two rows are
// related when one reaches the other along evidence edges (either direction) or when
// an Unknown/Conflict relation names the other as a witness. Non-row nodes are followed
// one way only (what a row cites, or what cites a row), so two rows that merely share a
// section are not related through it. A document's frontmatter `decision_refs` relates
// the document, not each of its rows, to a Decision: a route through another row of it
// is not a relation (see keptApplication).
function relationClosure(projection, target) {
  const { decision_relations: decisions, uncertainty_relations: uncertainty } = projection;
  const forward = new Map(), backward = new Map(), related = new Map();
  const add = (map, from, to) => { if (!map.has(from)) map.set(from, new Set()); map.get(from).add(to); };
  for (const graph of [projection.evidence, decisions.evidence, uncertainty.evidence]) {
    for (const edge of graph.edges) { add(forward, edge.from, edge.to); add(backward, edge.to, edge.from); }
  }
  const relate = (a, b) => { if (a !== b && isRow(a) && isRow(b)) { add(related, a, b); add(related, b, a); } };
  for (const entry of uncertainty.applications) {
    for (const witness of entry.witnesses) for (const ref of [witness.via, witness.dependency, witness.selected]) relate(entry.uncertainty, ref);
  }
  const reach = (start, map) => {
    const seen = new Set([start]), queue = [start];
    for (let index = 0; index < queue.length; index += 1) for (const next of map.get(queue[index]) || []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    return seen;
  };
  const rows = new Set([target]), nodes = new Set(), queue = [target];
  for (let index = 0; index < queue.length; index += 1) {
    const row = queue[index];
    for (const ref of [...reach(row, forward), ...reach(row, backward), ...(related.get(row) || [])]) {
      nodes.add(ref);
      if (isRow(ref) && !rows.has(ref)) { rows.add(ref); queue.push(ref); }
    }
  }
  // The evidence through which a kept row applies: its referrer and witness nodes.
  for (const entry of decisions.applications) if (keptApplication(rows, entry) && !NATIVE_RELATIONS.has(entry.relation)) nodes.add(entry.referrer);
  for (const entry of uncertainty.applications) if (rows.has(entry.uncertainty)) {
    for (const witness of entry.witnesses) for (const ref of [witness.via, witness.dependency, witness.selected]) if (ref) nodes.add(ref);
  }
  return { rows, nodes };
}

// A Decision application of a closure row, unless it routes through a row outside the
// closure: a referrer row, or the Unknown/Conflict root it was derived through.
function keptApplication(rows, entry) {
  return rows.has(entry.decision) && (!isRow(entry.referrer) || rows.has(entry.referrer)) &&
    (entry.uncertainty === undefined || rows.has(entry.uncertainty));
}

// The scope-basis-v2 bytes of one binding over the owner's applicability projection,
// which its caller resolved from actual resources. Decision and Unknown/Conflict
// bindings share it; the binding's own key (decision/uncertainty) keeps them apart.
// The projection excludes decision_work_scopes, uncertainty_work_scopes,
// housekeeping and raw audit hashes, but retains referenced artifacts' own
// canonical approval facts. No blanket recursive removal of fields called
// "approval" or "sha256".
export function scopedBindingBasis(projection, binding) {
  checkFields(projection, [...UNIT_FIELDS, ...Object.keys(RELATION_FIELDS)], '');
  for (const [field, allowed] of Object.entries(RELATION_FIELDS)) {
    if (!projection[field]) fail(`missing basis field ${field}`);
    checkFields(projection[field], allowed, `${field}.`);
  }
  const target = binding.decision ?? binding.uncertainty;
  const { decision_relations: decisions, uncertainty_relations: uncertainty } = projection;
  const records = parseScopedTargetRef(target)?.kind === 'decision' ? decisions.records : uncertainty.records;
  if (!isRow(target) || !records.some((entry) => entry.ref === target)) fail('target row missing from the applicability projection');
  const { rows, nodes } = relationClosure(projection, target);
  const node = (ref) => rows.has(ref) || nodes.has(ref);
  const graph = (evidence) => ({ roots: evidence.roots.filter(node), nodes: evidence.nodes.filter((entry) => node(entry.ref)),
    edges: evidence.edges.filter((edge) => node(edge.from) && node(edge.to)) });
  const kept = { decision: graph(decisions.evidence), uncertainty: graph(uncertainty.evidence) };
  const artifacts = new Set();
  for (const entry of [...kept.decision.nodes, ...kept.uncertainty.nodes]) if (entry.artifact_id) artifacts.add(entry.artifact_id);
  const applications = decisions.applications.filter((entry) => keptApplication(rows, entry));
  for (const entry of applications) {
    const referrer = parseScopedTargetRef(entry.referrer);
    if (referrer) artifacts.add(referrer.artifactId ?? referrer.ownerArtifactId);
  }
  const roots = (decisions.dependency_roots || []).filter((entry) => rows.has(entry.ref));
  const { decision_relations: _decisions, uncertainty_relations: _uncertainty, ...unitFacts } = projection;
  const basis = {
    ...unitFacts,
    decision_relations: {
      ...(roots.length ? { dependency_roots: roots } : {}),
      records: decisions.records.filter((entry) => rows.has(entry.ref)),
      applications,
      referrers: decisions.referrers.filter((entry) => artifacts.has(entry.artifact_id)),
      memberships: decisions.memberships, evidence: kept.decision,
    },
    uncertainty_relations: {
      records: uncertainty.records.filter((entry) => rows.has(entry.ref)),
      applications: uncertainty.applications.filter((entry) => rows.has(entry.uncertainty)),
      scope_review_needed: uncertainty.scope_review_needed.filter((entry) => rows.has(entry.uncertainty)),
      evidence: kept.uncertainty,
    },
    basis_version: SCOPE_BASIS_VERSION, binding,
  };
  return { basis, basis_digest: digestOf(basis), component_digests: scopedBasisComponentDigests(basis, target) };
}

// A partition of one basis for review: the target row's own entries, the other rows of
// its closure, the owner's unit facts (declarations, contracts, boundaries, membership)
// and the relation evidence. The binding's fields are shown as written, not digested.
function scopedBasisComponentDigests(basis, target) {
  const { decision_relations: decisions, uncertainty_relations: uncertainty } = basis;
  const rows = (own) => {
    const pick = (entries, key) => (entries || []).filter((entry) => (entry[key] === target) === own);
    return {
      decision_relations: { dependency_roots: pick(decisions.dependency_roots, 'ref'), records: pick(decisions.records, 'ref'),
        applications: pick(decisions.applications, 'decision') },
      uncertainty_relations: { records: pick(uncertainty.records, 'ref'), applications: pick(uncertainty.applications, 'uncertainty'),
        scope_review_needed: pick(uncertainty.scope_review_needed, 'uncertainty') },
    };
  };
  const units = Object.fromEntries(UNIT_FIELDS.filter((key) => Object.hasOwn(basis, key)).map((key) => [key, basis[key]]));
  return {
    evidence: digestOf({ decision_relations: { evidence: decisions.evidence, referrers: decisions.referrers },
      uncertainty_relations: { evidence: uncertainty.evidence } }),
    relations: digestOf(rows(false)), target: digestOf(rows(true)),
    units: digestOf({ ...units, memberships: decisions.memberships }),
  };
}
