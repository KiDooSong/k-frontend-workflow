// The unit/evidence portion of B §5.4, NOT scope-basis-v1 or an authority result.
// A basis builder must still add canonical decision/referrer/member applicability
// and effective ownership/claim boundaries. Do not hash this partial projection
// as a binding digest. No public CLI is connected by this module.
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { ownerParts, readCurrentBytes, hashBytes } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { buildInputArtifactIndex, resolveInputArtifact } from './provenance.mjs';
import { validateInputArtifacts } from './input-artifact.mjs';
import { collectInputFidelityIssues, inspectInputFidelity } from './input-fidelity.mjs';
import { parseScopedOwner, parseScopedPolicy, decodeScopedYaml } from './scoped-work-declarations.mjs';
import { createScopedReferenceResolver } from './scoped-work-refs.mjs';
import { resolveScopedSourceProjection } from './scoped-work-source-relations.mjs';
import { createScopedApiResolver } from './scoped-work-api.mjs';
import { resolveScopedMappingEvidence } from './scoped-work-mapping.mjs';
import { resolveScopedContractGraph, scopedGraphApiRowDependencies } from './scoped-work-graph.mjs';
import { ScopedWorkContractError, workText, workSet } from './scoped-work-request.mjs';
import { scopeJson, scopeSet, scopeLf } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-PROJECTION: ${message}`); };
const same = (a, b) => scopeJson(a) === scopeJson(b);
const artifactFields = ['artifact_id', 'artifact_type', 'domain', 'screen_id', 'surface_id', 'owner', 'status',
  'screen_lifecycle', 'absorbed_into', 'absorbed_at', 'api_required', 'route', 'route_entry', 'screen_entry',
  'member_screens', 'implementation_paths', 'sources', 'depends_on', 'decision_refs',
  'approved_by', 'approved_at', 'decision_id', 'approval_source', 'provenance_contract'];
const inputFields = ['input_id', 'input_type', 'source_type', 'source_ref', 'captured_at', 'captured_by', 'status',
  'confidence', 'affected_domains', 'affected_screens', 'suggested_scope', 'supersedes', 'raw_artifacts',
  'input_contract', 'fidelity'];
const setFields = new Set(['member_screens', 'implementation_paths', 'sources', 'depends_on', 'decision_refs',
  'affected_domains', 'affected_screens', 'supersedes', 'raw_artifacts']);

// Only canonical identity, ownership, source and approval facts are projected.
// Housekeeping and a document's other work units/bindings are not content of a
// selected contract. In particular, a binding must not hash its own digest/ref.
function metadata(fm, input = false) {
  const out = {};
  for (const key of input ? inputFields : artifactFields) if (Object.hasOwn(fm, key)) {
    const value = fm[key];
    // Legacy input scope/supersedes also permits scalar forms; preserve them.
    out[key] = setFields.has(key) && Array.isArray(value) ? scopeSet(value, key) : structuredClone(value);
  }
  if (input && out.suggested_scope && typeof out.suggested_scope === 'object') {
    for (const key of ['domains', 'screens']) if (Array.isArray(out.suggested_scope[key])) {
      out.suggested_scope[key] = scopeSet(out.suggested_scope[key], `suggested_scope.${key}`);
    }
  }
  return out;
}
function selection(value) {
  const { validation_warnings, ...selected } = value;
  if (Object.hasOwn(selected, 'content')) selected.content = scopeLf(selected.content);
  return structuredClone(selected);
}
function node(record) {
  return { ref: record.ref, kind: record.kind,
    ...(record.input_id ? { input_id: record.input_id } : { artifact_id: record.artifact_id }),
    file: record.file, metadata: metadata(record.metadata, record.kind === 'input-evidence'),
    selection: selection(record.selection) };
}
const setUnion = (values) => scopeSet([...new Set(values)]);
const unitKey = (owner, id) => scopeJson([owner, id]);

export function resolveScopedUnitProjection({ owner, policyFile, targetIndex, inputArtifacts = [], registerFile,
  projectRoot, layout } = {}) {
  ownerParts(owner);
  const refs = createScopedReferenceResolver({ targetIndex, inputArtifacts, projectRoot });
  const apis = createScopedApiResolver({ targetIndex, projectRoot, layout });
  const files = new Map();
  const selectedInputs = new Set();
  const owners = new Map();
  const units = new Map();
  const links = [];
  const roots = new Set();
  const pending = [];
  const scheduled = new Set();

  function read(file, expectedHash) {
    if (typeof file !== 'string') fail('snapshot file required');
    const relative = path.isAbsolute(file) ? path.relative(projectRoot, file).split(path.sep).join('/') : file;
    if (path.isAbsolute(file) && path.resolve(file) !== file) fail('noncanonical snapshot path');
    const canonical = canonicalRepositoryPath(projectRoot, relative, { required: true, type: 'file', label: 'scoped projection' });
    const raw = readCurrentBytes(canonical.absolute, 'scoped projection');
    const sha256 = hashBytes(raw);
    if ((expectedHash && sha256 !== expectedHash) || (files.has(relative) && files.get(relative).sha256 !== sha256)) {
      fail('evidence changed during projection');
    }
    files.set(relative, { file: relative, sha256 });
    return { file: relative, raw };
  }
  function document(record) {
    const data = read(record.file);
    const parsed = splitFrontmatter(decodeGitUtf8(data.raw, 'scoped projection'));
    const indexed = targetIndex.artifacts.get(record.artifact_id);
    if (!parsed.hasFrontmatter || parsed.parseError || !same(parsed.data, record.metadata) || parsed.body !== indexed?.body) {
      fail('document differs from its indexed snapshot');
    }
    return record;
  }
  const policySource = read(policyFile);
  const policyDocument = decodeScopedYaml(decodeGitUtf8(policySource.raw, 'scoped policy'), 'scoped policy');
  if (!policyDocument || typeof policyDocument !== 'object' || Array.isArray(policyDocument)) fail('policy object required');
  const policy = parseScopedPolicy(policyDocument.work_execution);
  if (!policy || !policy.owners.includes(owner)) fail('root owner must be explicitly adopted');

  function ownerRecord(id) {
    if (owners.has(id)) return owners.get(id);
    const parts = ownerParts(id);
    const type = parts.kind === 'screen' ? 'screen-spec' : 'shared-surface-spec';
    const matches = [...targetIndex.artifacts.values()].filter((entry) =>
      entry.fm?.artifact_type === type && entry.fm?.[`${parts.kind}_id`] === parts.id);
    if (matches.length !== 1) fail(`missing or ambiguous canonical owner ${id}`);
    const record = document(refs.contract(`artifact:${matches[0].fm.artifact_id}`));
    workText(record.metadata.domain, 'owner domain');
    const declaration = parseScopedOwner(record.metadata.work_execution, id);
    const adopted = policy.owners.includes(id);
    if (adopted && !declaration) fail(`adopted owner lacks work units: ${id}`);
    const result = { id, parts, record, declaration, adopted };
    owners.set(id, result);
    return result;
  }
  function enqueue(id, unitId) {
    const data = ownerRecord(id);
    if (!data.adopted) fail(`scoped unit on unadopted owner ${id}`);
    const declared = data.declaration.units.find((unit) => unit.id === unitId);
    if (!declared) fail(`missing unit ${id}/${unitId}`);
    const key = unitKey(id, unitId);
    if (!scheduled.has(key)) { scheduled.add(key); pending.push({ data, declared, key }); }
    return declared;
  }
  function input(data) {
    read(data.file, data.input_sha256);
    selectedInputs.add(data.input_id);
  }
  function dependency(record) {
    if (!['none', 'input'].includes(record.kind)) roots.add(record.ref);
  }
  function source(value) {
    input(value.input);
    for (const anchor of value.anchors) roots.add(anchor.ref);
    const groups = value.groups.map((group) => ({ item_id: group.item_id,
      effects: scopeSet(group.effects.map((effect) => {
        dependency(effect.target); roots.add(effect.evidence.ref);
        return { fields: effect.fields, target: effect.target.ref, evidence: selection(effect.evidence) };
      }), 'selected effects') }));
    return { selection: { ...value.selection, items: scopeSet(value.selection.items), source_refs: scopeSet(value.selection.source_refs) },
      input_id: value.input.input_id, anchors: scopeSet(value.anchors.map(selection)), groups: scopeSet(groups),
      register: value.reconciliation.file };
  }

  const root = ownerRecord(owner);
  // There is deliberately no caller-selected subset of the binding owner's units.
  for (const unit of root.declaration.units) enqueue(owner, unit.id);
  for (let index = 0; index < pending.length; index += 1) {
    const { data, declared, key } = pending[index];
    const ownerId = data.id;
    for (const ref of declared.contracts) roots.add(ref);
    if (declared.isolation) {
      for (const ref of declared.isolation.decisions) roots.add(ref);
      for (const id of declared.isolation.disabled_units) enqueue(ownerId, id);
    }
    // Include current canonical source connections, not only authored selectors.
    // Missing inferred effects remain visible facts; this projection grants no
    // coverage. Strict Item resolution and admission stay in the coverage layer.
    const sourceFacts = resolveScopedSourceProjection({ owner: ownerId, unit: declared.id,
      targetIndex, inputArtifacts, registerFile, projectRoot, layout });
    for (const entry of sourceFacts.read_set) read(entry.file, entry.sha256);
    for (const ref of sourceFacts.contracts.roots) roots.add(ref);
    for (const entry of sourceFacts.native_inputs) selectedInputs.add(entry.input_id);
    const selectedSources = sourceFacts.sources.map((entry) => source(entry.source));
    const api = apis.unit(data.record.artifact_id, ownerId, declared.id);
    const apiRows = api.candidates.map((candidate) => {
      const body = targetIndex.artifacts.get(api.artifact_id).body;
      for (const ref of scopedGraphApiRowDependencies(body, candidate)) roots.add(ref);
      // Raw ordered cells retain every column, without analyzer line/row indexes.
      return { selection: candidate.selection, headers: candidate.headers, cells: candidate.cells,
        tracking: candidate.tracking?.ref ?? null };
    });
    if (data.parts.kind === 'surface') {
      const members = workSet(data.record.metadata.member_screens, (id) => {
        ownerParts(`screen:${id}`); return id;
      }, 'surface members', true);
      if (members.length < 2 || !same(scopeSet(members), scopeSet(Object.keys(declared.host_units)))) {
        fail('surface membership and host_units must match exactly');
      }
      for (const member of members) {
        const host = ownerRecord(`screen:${member}`);
        if (host.record.metadata.domain !== data.record.metadata.domain) fail('host domain differs from surface domain');
        const hostUnit = declared.host_units[member];
        let selectedHost;
        if (host.adopted) {
          selectedHost = enqueue(host.id, hostUnit);
          if (selectedHost.kind !== declared.kind) fail('host unit kind differs from surface work');
        } else if (hostUnit !== 'legacy-current') fail('unadopted host requires legacy-current');
        const link = { surface: ownerId, unit: declared.id, member: host.id, host_unit: hostUnit, mapping: null };
        if (declared.kind === 'visual') {
          const chosen = declared.host_visual_evidence[member];
          if (selectedHost && !selectedHost.contracts.includes(chosen.mapping_ref)) fail('mapping must be a selected host contract');
          const mapping = resolveScopedMappingEvidence({ hostRef: `artifact:${host.record.artifact_id}`,
            mappingRef: chosen.mapping_ref, mKeys: chosen.m_keys, inputArtifacts, targetIndex, projectRoot });
          document(refs.contract(chosen.mapping_ref));
          link.mapping = { ref: chosen.mapping_ref, rows: scopeSet(mapping.rows.map((row) => {
            input(row.input);
            roots.add(`${chosen.mapping_ref}/${row.m_key}`);
            roots.add(`artifact:${mapping.mapping.artifact_id}#mapping-provenance/${row.m_key}`);
            roots.add(row.anchor.ref);
            return { m_key: row.m_key, effective_source_ref: row.effective_source_ref,
              source_unit: row.source_unit, effective_captured_at: row.effective_captured_at, evidence: row.anchor.ref };
          })) };
        }
        links.push(link);
      }
    }
    units.set(key, { owner: ownerId, declaration: {
      ...declared, contracts: scopeSet(declared.contracts), api_candidates: scopeSet(declared.api_candidates),
      sources: scopeSet(declared.sources.map((value) => ({ ...value, items: scopeSet(value.items), source_refs: scopeSet(value.source_refs) }))),
      isolation: declared.isolation ? { ...declared.isolation, decisions: scopeSet(declared.isolation.decisions),
        disabled_units: scopeSet(declared.isolation.disabled_units) } : null,
      host_visual_evidence: Object.fromEntries(Object.entries(declared.host_visual_evidence)
        .map(([id, value]) => [id, { ...value, m_keys: scopeSet(value.m_keys) }])),
    }, sources: scopeSet(selectedSources), api_rows: scopeSet(apiRows),
    ...(sourceFacts.inferred_sources.length ? { source_dependencies: {
      inferred: sourceFacts.inferred_sources, pending_connections: sourceFacts.pending_connections,
      unconnected_effects: scopeSet(sourceFacts.sources.flatMap((entry) => entry.issues
        .map((issue) => ({ input_id: entry.selection.input_id, ...issue })))),
    } } : {}) });
  }

  const graph = resolveScopedContractGraph({ contracts: setUnion([...roots]), targetIndex, inputArtifacts, projectRoot });
  for (const entry of graph.read_set) read(entry.file, entry.sha256);
  for (const record of graph.nodes) if (record.kind === 'input-evidence') selectedInputs.add(record.input_id);
  // Fidelity inheritance is metadata dependency, not a whole-body/anchor grant.
  // Follow the existing inspector's valid inherited chain without dragging in
  // unrelated parent prose. Its current metadata and file audit are both retained.
  const inputIndex = buildInputArtifactIndex(inputArtifacts);
  const validation = validateInputArtifacts(inputArtifacts);
  const fidelity = collectInputFidelityIssues(inputArtifacts);
  const inputQueue = [...selectedInputs];
  const inputProjection = [];
  for (let index = 0; index < inputQueue.length; index += 1) {
    const id = inputQueue[index];
    const resolved = resolveInputArtifact(inputIndex, id);
    if (resolved.status !== 'ok') fail(`missing or ambiguous inherited input ${id}`);
    const artifact = resolved.artifact;
    if (validation.errors.some((error) => error.file === artifact.file) ||
        fidelity.issues.some((issue) => issue.file === artifact.file)) fail(`invalid selected input metadata ${id}`);
    const bytes = read(artifact.file);
    const parsed = splitFrontmatter(decodeGitUtf8(bytes.raw, 'scoped input metadata'));
    if (!parsed.hasFrontmatter || parsed.parseError || !same(parsed.data, artifact.fm)) fail('input differs from its indexed metadata');
    inputProjection.push({ input_id: id, file: bytes.file, metadata: metadata(parsed.data, true) });
    const info = inspectInputFidelity(parsed.data);
    if (info.version === 2 && info.fidelity?.verification === 'inherited') {
      const parent = info.fidelity.verified_against.slice('input:'.length);
      if (!selectedInputs.has(parent)) { selectedInputs.add(parent); inputQueue.push(parent); }
    }
  }
  const projection = { owner, known_units: scopeSet(root.declaration.units.map((unit) => unit.id)),
    policy: { file: policySource.file, profiles: scopeSet(policy.profiles),
      role_limits: Object.fromEntries(Object.entries(policy.role_limits).map(([kind, roles]) => [kind, scopeSet(roles)])),
      deny_paths: scopeSet(policy.deny_paths) },
    owners: scopeSet([...owners.values()].map((data) => ({ owner: data.id, artifact_id: data.record.artifact_id,
      file: data.record.file, adopted: data.adopted, metadata: metadata(data.record.metadata),
      declared_paths: data.declaration ? {
        private_paths: Object.fromEntries(Object.entries(data.declaration.private_paths).map(([role, paths]) => [role, scopeSet(paths)])),
        test_paths: scopeSet(data.declaration.test_paths),
      } : null }))),
    units: scopeSet([...units.values()]), host_links: scopeSet(links), inputs: scopeSet(inputProjection),
    evidence: { roots: graph.roots, nodes: scopeSet(graph.nodes.map(node)), edges: graph.edges } };
  for (const entry of [...files.values()]) read(entry.file, entry.sha256);
  return { projection, read_set: scopeSet([...files.values()]) };
}

// Share the same R1 metadata/content projection with later canonical graph layers.
export { metadata as scopedProjectionMetadata, node as scopedProjectionNode };
