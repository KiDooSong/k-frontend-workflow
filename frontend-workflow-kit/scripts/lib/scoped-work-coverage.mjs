// B §7 receipt integrity for an explicitly declared source. These hashes are
// NOT the R1 scope digest, semantic completeness, origin routing or permission.
// Receipt-file selection/transport and inferred canonical sources are separate
// consumers of this component; a caller cannot replace the authored selection.
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { ownerParts, readCurrentBytes, hashBytes } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { parseScopedOwner, parseWorkCoverageReceipts } from './scoped-work-declarations.mjs';
import { createScopedReferenceResolver } from './scoped-work-refs.mjs';
import { createScopedSourceResolver } from './scoped-work-sources.mjs';
import { resolveScopedContractGraph } from './scoped-work-graph.mjs';
import { ScopedWorkContractError } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-COVERAGE: ${message}`); };
const same = (a, b) => scopeJson(a) === scopeJson(b);

export function resolveScopedCoverageBasis({ owner, unit, inputId, targetIndex,
  inputArtifacts = [], registerFile, projectRoot } = {}) {
  const parts = ownerParts(owner);
  if (typeof unit !== 'string' || !unit || typeof inputId !== 'string' || !inputId) fail('unit and inputId required');
  const args = { targetIndex, inputArtifacts, projectRoot };
  const refs = createScopedReferenceResolver(args), files = new Map();
  function read(file, expectedHash) {
    if (typeof file !== 'string') fail('canonical snapshot file required');
    const relative = path.isAbsolute(file) ? path.relative(projectRoot, file).split(path.sep).join('/') : file;
    if (path.isAbsolute(file) && path.resolve(file) !== file) fail('noncanonical snapshot path');
    const canonical = canonicalRepositoryPath(projectRoot, relative,
      { required: true, type: 'file', label: 'scoped coverage' });
    const bytes = readCurrentBytes(canonical.absolute, 'scoped coverage'), sha256 = hashBytes(bytes);
    if ((expectedHash && expectedHash !== sha256) || (files.has(relative) && files.get(relative).sha256 !== sha256)) {
      fail('snapshot changed during coverage inspection');
    }
    files.set(relative, { file: relative, sha256 });
    return bytes;
  }
  const type = parts.kind === 'screen' ? 'screen-spec' : 'shared-surface-spec';
  const matches = [...targetIndex.artifacts.values()].filter((entry) =>
    entry.fm.artifact_type === type && entry.fm[`${parts.kind}_id`] === parts.id);
  if (matches.length !== 1) fail('unique canonical owner required');
  const home = refs.contract(`artifact:${matches[0].fm.artifact_id}`);
  const parsed = splitFrontmatter(decodeGitUtf8(read(home.file), 'scoped coverage owner'));
  if (!parsed.hasFrontmatter || parsed.parseError || !same(parsed.data, home.metadata)) fail('owner differs from indexed snapshot');
  const declaration = parseScopedOwner(parsed.data.work_execution, owner);
  const selectedUnit = declaration?.units.find((entry) => entry.id === unit);
  if (!selectedUnit) fail('declared owner unit required');
  const selected = selectedUnit.sources.find((entry) => entry.input_id === inputId);
  if (!selected) fail('explicitly declared unit source required; inferred sources need separate resolution');
  // Pin the Summary and all Items before the existing v2 parser consumes them.
  read(registerFile);
  const source = createScopedSourceResolver({ ...args, registerFile }).source(selected);
  read(source.input.file, source.input.input_sha256);
  const contracts = resolveScopedContractGraph({ ...args, contracts: selectedUnit.contracts });
  for (const entry of contracts.read_set) read(entry.file, entry.sha256);
  // Audit source anchors and every effect target, but do not misclassify routing
  // targets as selected contracts in the raw contract hash mapping.
  const dependencies = [...source.anchors.map((entry) => entry.ref),
    ...source.groups.flatMap((group) => group.effects.flatMap((effect) => [effect.evidence.ref,
      ...(['none', 'input'].includes(effect.target.kind) ? [] : [effect.target.ref])]))];
  const graph = resolveScopedContractGraph({ ...args, contracts: [...new Set(dependencies)] });
  for (const entry of graph.read_set) read(entry.file, entry.sha256);
  const contractFiles = [...new Set(contracts.nodes.filter((entry) => entry.kind !== 'input-evidence').map((entry) => entry.file))];
  const contractHashes = Object.fromEntries(contractFiles.map((file) => [file, files.get(file).sha256]));
  const effects = scopeSet(source.groups.flatMap((group) => group.effects.map((effect) => effect.fields)), 'coverage effects');
  const basis = { version: 1, owner, unit, input_id: inputId,
    item_ids: scopeSet(source.selection.items), source_refs: scopeSet(source.selection.source_refs),
    input_sha256: source.input.input_sha256,
    effects_sha256: hashBytes(Buffer.from(scopeJson(effects), 'utf8')),
    contracts_sha256: hashBytes(Buffer.from(scopeJson(contractHashes), 'utf8')) };
  for (const entry of files.values()) read(entry.file, entry.sha256);
  return { basis, summary: structuredClone(source.reconciliation.summary),
    contract_hashes: contractHashes, effects, read_set: scopeSet([...files.values()]) };
}

export function inspectScopedSourceCoverage({ receipts = [], ...options } = {}) {
  const evidence = resolveScopedCoverageBasis(options), { basis, summary } = evidence;
  const candidates = parseWorkCoverageReceipts(receipts);
  const receipt = candidates.find((entry) => entry.owner === basis.owner && entry.unit === basis.unit && entry.input_id === basis.input_id) || null;
  const mismatches = [];
  if (receipt) {
    for (const field of ['item_ids', 'source_refs', 'input_sha256', 'effects_sha256', 'contracts_sha256']) {
      if (!same(receipt[field], basis[field])) mismatches.push(field);
    }
  }
  const state = summary.reconcileStatus, result = summary.result;
  const supported = (state === 'reconciled' || state === 'partially-reconciled') && ['pending', 'accepted'].includes(result);
  const required = supported && !(state === 'reconciled' && result === 'accepted');
  const routingOnly = receipt?.origin_relation === 'no-effect-on-unit';
  return { ...evidence, receipt,
    source_state_supported: supported, receipt_required: required,
    receipt_state: !receipt ? 'missing' : mismatches.length ? 'stale' : routingOnly ? 'routing-only' : 'current',
    receipt_mismatches: mismatches,
    // Even a byte-current complete-for-unit declaration cannot prove its author's
    // semantic review, actual owner/effect coverage, OD approval or origin scope.
    semantic_coverage_verified: false, origin_relation_verified: false, approval_verified: false };
}
