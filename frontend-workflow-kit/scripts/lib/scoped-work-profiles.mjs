// B §6 profile prerequisites on canonical files. A satisfied profile alone is
// NOT a path/execution permit: decision-scope adoption, every owner/host and the
// actual before/after Git backstop must also pass. Never synthesize a mode.
import fs from 'node:fs';
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { readCurrentBytes, hashBytes, ownerParts } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { isRealDate } from './schema.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { buildEndpointIndex, normEndpoint, isContractUnset, CONTRACT_KINDS,
  collectSchemaExports, collectTsTypeExports, contractSourceHasText } from './api-manifest.mjs';
import { resolveScopedApplicabilityProjection } from './scoped-work-applicability.mjs';
import { inspectScopedInputCoverage } from './scoped-work-input-coverage.mjs';
import { createScopedApiResolver } from './scoped-work-api.mjs';
import { createScopedReferenceResolver } from './scoped-work-refs.mjs';
import { resolveScopedSourceRelations } from './scoped-work-source-relations.mjs';
import { ScopedWorkContractError, workUnitId } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-PROFILE: ${message}`); };
const same = (left, right) => scopeJson(left) === scopeJson(right);
const union = (values) => scopeSet([...new Set(values)]);
const populated = (value) => typeof value === 'string' && value.trim().length > 0;

export function inspectScopedProfile(options = {}) {
  const { owner, unit, projectRoot, targetIndex, inputArtifacts = [], registerFile, kitRoot, layoutFile } = options;
  ownerParts(owner); workUnitId(unit);
  const files = new Map(), directories = new Map(), denials = [];
  function canonical(file, required = true, type) {
    if (typeof file !== 'string') fail('canonical resource path required');
    const relative = path.isAbsolute(file) ? path.relative(projectRoot, file).split(path.sep).join('/') : file;
    if (path.isAbsolute(file) && path.resolve(file) !== file) fail('noncanonical absolute resource path');
    return canonicalRepositoryPath(projectRoot, relative, { required, ...(type ? { type } : {}), label: 'scoped profile' });
  }
  function read(file, expected) {
    const selected = canonical(file, true, 'file'), raw = readCurrentBytes(selected.absolute, 'scoped profile');
    const key = path.relative(projectRoot, selected.absolute).split(path.sep).join('/'), sha256 = hashBytes(raw);
    if ((expected !== undefined && expected !== sha256) || (files.has(key) && files.get(key).sha256 !== sha256)) fail('profile snapshot changed');
    files.set(key, { file: key, sha256 }); return raw;
  }
  function audit(entries) { for (const entry of entries) read(entry.file, entry.sha256); }
  function deny(code, details = {}) { denials.push({ code, owner, unit, ...details }); }
  function listing(file, required = false) {
    const selected = canonical(file, required), key = path.relative(projectRoot, selected.absolute).split(path.sep).join('/');
    let value = null;
    if (selected.exists) {
      const stat = fs.lstatSync(selected.absolute);
      if (stat.isDirectory()) value = fs.readdirSync(selected.absolute, { withFileTypes: true }).map((entry) =>
        [entry.name, entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'unsupported']).sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
      else if (stat.isFile()) return { kind: 'file', selected };
      else fail('API evidence is not a regular file/directory');
    }
    if (directories.has(key) && !same(directories.get(key), value)) fail('API evidence directory changed');
    directories.set(key, value); return { kind: value === null ? 'missing' : 'directory', selected, entries: value || [] };
  }
  function evidenceFiles(source, extensions, recursive = true) {
    if (isContractUnset(source)) return [];
    const result = [];
    function visit(name) {
      const found = listing(name);
      if (found.kind === 'file') {
        if (extensions.some((ext) => name.toLowerCase().endsWith(ext))) { read(name); result.push(found.selected.absolute); }
      } else for (const [entry, kind] of found.entries) {
        if (kind === 'unsupported') fail('symlink or special API evidence cannot be consumed');
        const child = path.join(found.selected.absolute, entry);
        if (kind === 'directory') { if (recursive && !entry.startsWith('.') && entry !== 'node_modules') visit(child); }
        else if (extensions.some((ext) => entry.toLowerCase().endsWith(ext))) { read(child); result.push(child); }
      }
    }
    for (const name of String(source).split(',').map((name) => name.trim()).filter(Boolean)) {
      if (/^(openapi|manual|unknown|confluence|planning)$/i.test(name)) continue;
      visit(name);
    }
    return union(result);
  }
  const observed = resolveScopedApplicabilityProjection(options); audit(observed.read_set);
  const { projection } = observed;
  const declared = projection.units.find((entry) => entry.owner === owner && entry.declaration.id === unit)?.declaration;
  const identity = projection.owners.find((entry) => entry.owner === owner);
  const limits = projection.ownership.units.find((entry) => entry.owner === owner && entry.unit === unit);
  if (!declared || !identity || !limits) fail('canonical adopted owner/unit required');
  if (!limits.profile_enabled) deny('profile-not-enabled');
  if (identity.metadata.status === 'deprecated' || identity.metadata.screen_lifecycle === 'absorbed') deny('owner-inactive');
  const layout = loadLayoutProfile({ kitRoot: kitRoot || projectRoot, flags: { layout: layoutFile } });
  const args = { owner, unit, projectRoot, targetIndex, inputArtifacts, registerFile, layout };
  const sources = resolveScopedSourceRelations(args); audit(sources.read_set);
  const coverage = inspectScopedInputCoverage(options); audit(coverage.read_set);
  for (const reason of coverage.denials) denials.push(reason);
  const refs = createScopedReferenceResolver({ projectRoot, targetIndex, inputArtifacts });
  const contracts = declared.contracts.map((ref) => refs.contract(ref));
  const api = createScopedApiResolver({ projectRoot, targetIndex, layout }).unit(identity.artifact_id, owner, unit);
  const apiEvidence = [];

  if (declared.kind !== 'visual') {
    if (!api.selections.length && identity.metadata.api_required !== false) deny('api-selection-required');
    const selected = api.candidates.filter((row) => {
      if (row.candidate.confidence !== 'confirmed' || row.candidate.gate !== 'active' || row.candidate.valid !== true) {
        deny('api-not-confirmed-active', { endpoint: row.selection }); return false;
      }
      return true;
    });
    if (selected.length) {
      const manifests = [...targetIndex.artifacts.values()].filter((entry) => entry.fm.artifact_type === 'api-manifest');
      for (const entry of manifests) {
        const parsed = splitFrontmatter(decodeGitUtf8(read(entry.file), 'scoped API manifest'));
        if (!parsed.hasFrontmatter || parsed.parseError || !same(parsed.data, entry.fm) || parsed.body !== entry.body) fail('API manifest differs from indexed bytes');
      }
      const endpoints = buildEndpointIndex(manifests.map((entry) => entry.file));
      for (const row of selected) {
        const key = normEndpoint(row.selection.method, row.selection.path), endpoint = endpoints.index.get(key);
        const reasons = [];
        if (endpoints.conflicts.some((entry) => entry.key === key)) reasons.push('api-manifest-conflict');
        if (!endpoint || endpoint.confidence !== 'confirmed') reasons.push('api-manifest-unconfirmed');
        else if (isContractUnset(endpoint.linkedContract) || endpoint.contractKindOmitted ||
          !CONTRACT_KINDS.includes(endpoint.contractKind) || endpoint.contractKind === 'unknown') reasons.push('api-contract-unresolved');
        else {
          let present = false;
          if (endpoint.contractKind === 'zod') {
            const directory = path.join(projectRoot, 'src/api/schemas'); evidenceFiles(directory, ['.ts'], false);
            present = collectSchemaExports(directory).has(endpoint.linkedContract);
          } else if (endpoint.contractKind === 'ts-type') {
            evidenceFiles(endpoint.source, ['.ts', '.tsx']);
            present = collectTsTypeExports(endpoint.source, projectRoot).has(endpoint.linkedContract);
          } else {
            const extensions = endpoint.contractKind === 'openapi' ? ['.yaml', '.yml', '.json'] : ['.md', '.txt', '.yaml', '.yml', '.json'];
            evidenceFiles(endpoint.source, extensions);
            present = contractSourceHasText(endpoint.source, projectRoot, endpoint.linkedContract, extensions);
          }
          if (!present) reasons.push('api-contract-evidence-missing');
        }
        reasons.forEach((code) => deny(code, { endpoint: row.selection }));
        apiEvidence.push({ selection: row.selection, endpoint: endpoint ? { ...endpoint,
          file: path.relative(projectRoot, endpoint.file).split(path.sep).join('/') } : null,
        satisfied: reasons.length === 0, reasons, semantic_contract_verified: false });
      }
    }
  }

  const visualEvidence = sources.contracts.nodes.filter((record) => record.metadata.artifact_type === 'figma-component-mapping' &&
    record.selection.type === 'row' && record.selection.section === 'component-mapping');
  if (declared.kind === 'visual') {
    if (!visualEvidence.length) deny('visual-mapping-evidence-required');
    for (const record of visualEvidence) if (record.metadata.status === 'deprecated') deny('visual-mapping-deprecated', { ref: record.ref });
    if (ownerParts(owner).kind === 'screen' && visualEvidence.some((record) =>
      record.metadata.screen_id !== ownerParts(owner).id || record.metadata.domain !== identity.metadata.domain)) deny('visual-mapping-owner-mismatch');
  }
  const confirmed = contracts.filter((record) => {
    if (record.kind === 'decision') return projection.decision_relations.records.some((row) => row.ref === record.ref && row.status === 'resolved');
    if (record.kind !== 'artifact' || ['figma-component-mapping', 'api-manifest'].includes(record.metadata.artifact_type)) return false;
    const fm = record.metadata;
    const content = record.selection.content?.replace(/^#{1,6}[^\n]*(?:\n|$)/gm, '').trim() || record.selection.cells?.join('').trim();
    return populated(content) && fm.status === 'confirmed' && populated(fm.approved_by) && isRealDate(fm.approved_at) && populated(fm.decision_id);
  });
  if (declared.kind === 'behavior' && !confirmed.length) deny('confirmed-behavior-contract-required');
  const uncertainty = projection.uncertainty_relations.applications.filter((entry) => entry.owner === owner && (entry.unit === null || entry.unit === unit));
  for (const application of uncertainty) {
    const record = projection.uncertainty_relations.records.find((row) => row.ref === application.uncertainty);
    if (!record || record.kind === 'unknown' || record.status !== 'resolved') deny('unit-uncertainty-unresolved', { application });
  }
  const isolated = [];
  if (declared.isolation) {
    for (const ref of declared.isolation.decisions) {
      const decision = projection.decision_relations.records.find((row) => row.ref === ref);
      const applications = projection.decision_relations.applications.filter((entry) => entry.owner === owner && entry.decision === ref);
      if (!decision || decision.status !== 'open' || !declared.isolation.disabled_units.every((id) =>
        applications.some((entry) => entry.unit === null || entry.unit === id))) deny('isolation-decision-unrelated', { decision: ref });
    }
    isolated.push({ ...declared.isolation, semantic_isolation_verified: false,
      responsibility: 'Keep only these unfinished behavior units unavailable to ordinary users. Review every entry/effect/deep-link; disabled UI alone is not proof. Do not disable existing production behavior.' });
  }
  for (const [file, names] of [...directories]) {
    const current = listing(file);
    if (current.kind === 'file' || !same(directories.get(file), names)) fail('API evidence directory changed');
  }
  for (const entry of [...files.values()]) read(entry.file, entry.sha256);
  return { owner, unit, kind: declared.kind, profile_satisfied: denials.length === 0, denials: scopeSet(denials),
    confirmed_contracts: union(confirmed.map((entry) => entry.ref)), visual_evidence: visualEvidence,
    api_evidence: apiEvidence, coverage, isolation: isolated, read_set: scopeSet([...files.values()]),
    directory_read_set: scopeSet([...directories].map(([file, entries]) => ({ file, entries }))),
    approval_verified: false, semantic_coverage_verified: false,
    required_reviews: [
      'Profile satisfaction alone does not authorize execution: decision scope, concrete ownership, all hosts and immutable Git checks are separate.',
      'Confirm that selected contracts completely cover the requested state, interaction, data and copy requirements; parsers do not prove prose completeness.',
      declared.kind === 'visual' ? 'Use actual selected Figma/catalog rules; fixture hooks must not connect speculative API/product behavior. Report fidelity limits without inventing pixel verification.'
        : declared.kind === 'api-contract' ? 'Only clients, pure adapters and contract tests; do not infer UI/business behavior from API availability.'
          : 'Implement only known confirmed behavior; final Figma is not a prerequisite and existing behavior must be preserved.',
    ] };
}
