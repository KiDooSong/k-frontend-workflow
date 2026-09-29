// B §7 mechanical adoption of current Stage 04 coverage/routing evidence.
// Receipt authors own semantic completeness. This module neither authenticates
// a reviewer nor resolves an OD, grants a path or verifies a human scope change.
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { normalizeWorkOrigins, readCurrentBytes, hashBytes } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { buildInputArtifactIndex, resolveInputArtifact } from './provenance.mjs';
import { validateInputArtifacts } from './input-artifact.mjs';
import { parseReconciliationRegister } from './reconciliation-register.mjs';
import { parseReconciliationItems } from './reconciliation-items.mjs';
import { createScopedSourceResolver } from './scoped-work-sources.mjs';
import { createScopedReferenceResolver } from './scoped-work-refs.mjs';
import { resolveScopedSourceRelations } from './scoped-work-source-relations.mjs';
import { loadScopedCoverageReports } from './scoped-work-receipts.mjs';
import { resolveScopedBoundaryProjection } from './scoped-work-boundaries.mjs';
import { resolveScopedApplicabilityProjection } from './scoped-work-applicability.mjs';
import { resolveScopedContractGraph, scopedGraphSelectionSpans } from './scoped-work-graph.mjs';
import { parseReconciliationReferenceView } from './reconciliation-markdown-ast.mjs';
import { ScopedWorkContractError } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-INPUT-COVERAGE: ${message}`); };
const union = (values) => scopeSet([...new Set(values)]);
const same = (a, b) => scopeJson(a) === scopeJson(b);
const hash = (value) => hashBytes(Buffer.from(scopeJson(value), 'utf8'));
const fields = ['item_ids', 'source_refs', 'input_sha256', 'effects_sha256', 'contracts_sha256'];
function sourceState(summary) {
  const supported = ['reconciled', 'partially-reconciled'].includes(summary.reconcileStatus) && ['accepted', 'pending'].includes(summary.result);
  return { supported, receipt_required: supported && !(summary.reconcileStatus === 'reconciled' && summary.result === 'accepted') };
}
function compareReceipt(receipt, basis) {
  const mismatches = receipt ? fields.filter((field) => !same(receipt[field], basis[field])) : [];
  return { mismatches, state: !receipt ? 'missing' : mismatches.length ? 'stale'
    : receipt.origin_relation === 'no-effect-on-unit' ? 'routing-only' : 'current' };
}

export function inspectScopedInputCoverage({ origin_inputs, coverage_reports = [], ...options } = {}) {
  if (Object.hasOwn(options, 'receipts')) fail('in-memory receipts cannot replace selected review files');
  const origins = normalizeWorkOrigins(origin_inputs);
  const { owner, unit, projectRoot, targetIndex, inputArtifacts = [], registerFile, kitRoot, layoutFile } = options;
  const reports = loadScopedCoverageReports({ projectRoot, coverage_reports });
  const reads = new Map(), documents = new Map();
  function read(file, expected) {
    const relative = path.isAbsolute(file) ? path.relative(projectRoot, file).split(path.sep).join('/') : file;
    if (path.isAbsolute(file) && path.resolve(file) !== file) fail('noncanonical input path');
    const canonical = canonicalRepositoryPath(projectRoot, relative, { required: true, type: 'file', label: 'scoped input coverage' });
    const raw = readCurrentBytes(canonical.absolute, 'scoped input coverage'), sha256 = hashBytes(raw);
    if ((expected !== undefined && expected !== sha256) || (reads.has(relative) && reads.get(relative).sha256 !== sha256)) fail('snapshot changed during input coverage');
    reads.set(relative, { file: relative, sha256 }); return raw;
  }
  function audit(entries) { for (const entry of entries) read(entry.file, entry.sha256); }
  audit(reports.read_set);
  // Pin the actual policy/layout/preset/manifest before using role-sensitive
  // API selections. No caller-provided layout function is an authority source.
  const boundary = resolveScopedBoundaryProjection(options); audit(boundary.read_set);
  const layout = loadLayoutProfile({ kitRoot: kitRoot || projectRoot, flags: { layout: layoutFile } });
  const relations = resolveScopedSourceRelations({ ...options, layout }); audit(relations.read_set);
  const args = { targetIndex, inputArtifacts, projectRoot };
  const sourceReader = createScopedSourceResolver({ ...args, registerFile });
  const refs = createScopedReferenceResolver(args);
  function inputNode(token) {
    const evidence = sourceReader.evidence(token); read(evidence.input.file, evidence.input.input_sha256);
    return { ref: token, kind: 'input-evidence', file: evidence.input.file, metadata: evidence.input.metadata, selection: evidence.anchor };
  }
  function ranges(node) {
    if (!documents.has(node.file)) {
      const parsed = splitFrontmatter(decodeGitUtf8(read(node.file), 'scoped coverage evidence'));
      if (!parsed.hasFrontmatter || parsed.parseError) fail('invalid evidence document');
      documents.set(node.file, { ...parsed, view: parseReconciliationReferenceView(parsed.body) });
    }
    const doc = documents.get(node.file);
    if (!same(doc.data, node.metadata)) fail('evidence differs from current metadata');
    return scopedGraphSelectionSpans(doc.body, doc.view, node.selection, node.kind === 'input-evidence');
  }
  function overlaps(left, right) {
    return left.file === right.file && (left.ref === right.ref || ranges(left).some(([a, b]) => ranges(right).some(([c, d]) => a < d && c < b)));
  }
  function contained(origin, selected) {
    if (origin.file !== selected.file) return false;
    const cover = ranges(selected);
    return ranges(origin).every(([a, b]) => cover.some(([c, d]) => c <= a && b <= d));
  }
  const receiptFor = (id) => reports.receipts.find((entry) => entry.owner === owner && entry.unit === unit && entry.input_id === id) || null;
  const proofFor = (receipt) => receipt ? reports.records.find((record) => same(record.receipt, receipt)) || null : null;
  const sources = relations.sources.map((source) => {
    const receipt = receiptFor(source.selection.input_id), comparison = compareReceipt(receipt, source.basis);
    const state = sourceState(source.source.reconciliation.summary);
    const admitted = state.supported && source.issues.length === 0 &&
      (!state.receipt_required || comparison.state === 'current');
    return { ...source, source_state_supported: state.supported, receipt_required: state.receipt_required,
      receipt, receipt_record: proofFor(receipt), receipt_state: comparison.state, receipt_mismatches: comparison.mismatches,
      accepted_for_source: admitted };
  });
  const denials = relations.pending_connections.map((entry) => ({ code: 'source-effect-unconnected', owner, unit, ...entry }));
  for (const source of sources) if (!source.accepted_for_source) denials.push({ code: 'source-coverage-unready', owner, unit,
    input_id: source.selection.input_id, source_state_supported: source.source_state_supported,
    receipt_required: source.receipt_required, receipt_state: source.receipt_state, issues: source.issues });

  let applicability;
  function actualRelations() {
    if (!applicability) { applicability = resolveScopedApplicabilityProjection(options); audit(applicability.read_set); }
    return applicability.projection;
  }
  function inspectRouting(receipt, origin) {
    const reasons = [];
    if (!same(receipt.origin_source_refs, origin.source_refs)) reasons.push('origin-scope-mismatch');
    read(registerFile);
    const source = sourceReader.source({ input_id: receipt.input_id, items: receipt.item_ids, source_refs: receipt.source_refs });
    read(source.input.file, source.input.input_sha256);
    const effects = scopeSet(source.groups.flatMap((group) => group.effects.map((effect) => effect.fields)));
    const basis = { item_ids: union(source.selection.items), source_refs: union(source.selection.source_refs),
      input_sha256: source.input.input_sha256, effects_sha256: hash(effects), contracts_sha256: hash(relations.contract_hashes) };
    const comparison = compareReceipt(receipt, basis);
    if (comparison.mismatches.length) reasons.push('routing-receipt-stale');
    if (!sourceState(source.reconciliation.summary).supported) reasons.push('routing-source-state-unsupported');
    if (relations.pending_connections.some((entry) => entry.input_id === origin.input_id)) reasons.push('canonical-source-unconnected');
    const selectedSource = sources.find((entry) => entry.selection.input_id === origin.input_id);
    if (selectedSource && (!origin.source_refs.length || origin.source_refs.some((ref) =>
      selectedSource.selection.source_refs.some((selected) => overlaps(inputNode(ref), inputNode(selected)))))) reasons.push('origin-is-unit-source');
    // A reviewed subset is not an exclusion list for the original request.
    // Inspect every current Item touching that origin scope, retaining all of
    // each matching group's effects. Keep these routing observations out of
    // implementation sources and out of the receipt's selected-effect hash.
    const register = parseReconciliationRegister(registerFile);
    const originNodes = origin.source_refs.map(inputNode);
    const rows = parseReconciliationItems(register.body).rows.filter((row) => row.inputId === origin.input_id);
    const originItems = union(rows.filter((row) => !originNodes.length ||
      originNodes.some((node) => overlaps(node, inputNode(row.evidence)))).map((row) => row.item));
    const originRows = rows.filter((row) => originItems.includes(row.item));
    const originSource = originItems.length ? sourceReader.source({ input_id: origin.input_id, items: originItems,
      source_refs: union(originRows.map((row) => row.evidence)) }) : null;
    if (!originSource) reasons.push('origin-effect-unconnected');
    const routingRoots = union([source, ...(originSource ? [originSource] : [])].flatMap((selected) =>
      selected.groups.flatMap((group) => group.effects.flatMap((effect) =>
        [effect.evidence.ref, ...(['none', 'input'].includes(effect.target.kind) ? [] : [effect.target.ref])]))));
    const routingGraph = resolveScopedContractGraph({ ...args, contracts: routingRoots }); audit(routingGraph.read_set);
    const projection = actualRelations();
    const selectedNodes = [...relations.contracts.nodes];
    for (const application of projection.decision_relations.applications) if (application.owner === owner &&
      (application.unit === null || application.unit === unit)) selectedNodes.push(refs.contract(application.decision));
    if (routingGraph.nodes.some((node) => selectedNodes.some((selected) => overlaps(node, selected)))) reasons.push('routing-affects-selected-contract');
    const unresolved = projection.uncertainty_relations.applications.filter((entry) => entry.owner === owner &&
      (entry.unit === null || entry.unit === unit)).filter((entry) => {
      const record = projection.uncertainty_relations.records.find((record) => record.ref === entry.uncertainty);
      return !record || record.kind === 'unknown' || record.status !== 'resolved';
    });
    if (unresolved.length) reasons.push('unit-uncertainty-unresolved');
    return { accepted: !reasons.length, reasons: union(reasons), source, origin_source: originSource, basis,
      receipt_mismatches: comparison.mismatches, unresolved_relations: unresolved, graph: routingGraph };
  }

  const index = buildInputArtifactIndex(inputArtifacts), validation = validateInputArtifacts(inputArtifacts);
  const evaluatedOrigins = [];
  for (const origin of origins) {
    const resolved = resolveInputArtifact(index, origin.input_id);
    if (resolved.status !== 'ok') fail(`origin ${origin.input_id}: ${resolved.status}`);
    const artifact = resolved.artifact;
    if (artifact.parseError || validation.errors.some((entry) => entry.file === artifact.file)) fail(`origin ${origin.input_id}: invalid canonical input`);
    const bytes = read(artifact.file), parsed = splitFrontmatter(decodeGitUtf8(bytes, 'scoped origin'));
    if (!parsed.hasFrontmatter || parsed.parseError || !same(parsed.data, artifact.fm)) fail('origin differs from indexed metadata');
    const originNodes = origin.source_refs.map(inputNode);
    const source = sources.find((entry) => entry.selection.input_id === origin.input_id), receipt = receiptFor(origin.input_id);
    let accepted = false, relation = null, routing = null;
    const reasons = [];
    if (receipt?.origin_relation === 'no-effect-on-unit') {
      routing = inspectRouting(receipt, origin); accepted = routing.accepted;
      relation = 'no-effect-on-unit'; reasons.push(...routing.reasons);
    } else if (source?.accepted_for_source) {
      const currentReceipt = source.receipt_state === 'current';
      if (receipt?.origin_relation === 'covered-for-unit') {
        if (!currentReceipt) reasons.push('origin-receipt-stale');
        if (!same(receipt.origin_source_refs, origin.source_refs)) reasons.push('origin-scope-mismatch');
        accepted = currentReceipt && same(receipt.origin_source_refs, origin.source_refs);
      } else {
        // Empty origin refs retain the entire immutable input. Existing complete
        // reconciliation or current complete-for-unit review explains its unit
        // scope; neither claims that all other units have been implemented.
        accepted = !originNodes.length || originNodes.every((node) => source.selection.source_refs.some((ref) => contained(node, inputNode(ref))));
        if (!accepted) reasons.push('origin-scope-unexplained');
      }
      relation = 'covered-for-unit';
    } else reasons.push('origin-input-unreconciled');
    if (relations.pending_connections.some((entry) => entry.input_id === origin.input_id)) {
      accepted = false; reasons.push('canonical-source-unconnected');
    }
    const result = { ...origin, path: path.relative(projectRoot, artifact.file).split(path.sep).join('/'), raw_hash: hashBytes(bytes),
      relation, accepted, reasons: union(reasons), receipt, receipt_record: proofFor(receipt), routing,
      source_evidence: originNodes.map((node) => node.selection) };
    evaluatedOrigins.push(result);
    if (!accepted) denials.push({ code: 'origin-input-unreconciled', owner, unit, input_id: origin.input_id, reasons: result.reasons });
  }
  for (const entry of [...reads.values()]) read(entry.file, entry.sha256);
  return { owner, unit, sources, origin_inputs: evaluatedOrigins, pending_connections: relations.pending_connections,
    denials: scopeSet(denials), coverage_satisfied: !denials.length, read_set: scopeSet([...reads.values()]),
    semantic_coverage_verified: false, approval_verified: false,
    required_reviews: [{ scope: 'reconcile-stage04-v1', responsibility: 'source/routing completeness and meaning remain the reviewer responsibility; receipts never exempt Open Decisions or change human-owned scope' }] };
}
