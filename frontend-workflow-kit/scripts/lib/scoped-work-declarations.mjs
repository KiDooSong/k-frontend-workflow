// D authoring schemas, NOT an eligibility/approval evaluator. These parsers are
// intentionally disconnected from execution until typed resolution, all profile
// predicates, fallback guards, and the same Git backstop are implemented.
import { parseDocument } from 'yaml';
import { own, ownerParts, canonicalJson, byteCompare, normalizeWorkOrigins } from './current-work-request.mjs';
import { isReconciliationItemId, parseTargetRef, REVIEW_PROFILE_STAGE04 } from './reconciliation-items.mjs';
import {
  ScopedWorkContractError, workObject, workText, workUnitId, workSet, workPath, workVersion,
} from './scoped-work-request.mjs';

const ROLE_CEILINGS = Object.freeze({
  visual: Object.freeze(['screen', 'domain_component', 'hook', 'test']),
  'api-contract': Object.freeze(['api_client', 'test']),
  behavior: Object.freeze(['screen', 'domain_component', 'hook', 'api_client', 'test']),
});
const KINDS = Object.keys(ROLE_CEILINGS);
const API_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'];
const fail = (message) => { throw new ScopedWorkContractError(message); };
function enumValue(value, choices, label) {
  if (!choices.includes(value)) fail(`${label}: unsupported value ${JSON.stringify(value)}`);
  return value;
}
function uniqueBy(entries, key, label) {
  const keys = entries.map(key);
  if (new Set(keys).size !== keys.length) fail(`${label}: duplicate identity`);
  return entries;
}
function owner(value) { ownerParts(value); return value; }
function member(value) { ownerParts(`screen:${workText(value, 'member screen ID')}`); return value; }
function pattern(value) {
  workText(value, 'declared path');
  // Only a literal path or one terminal /**. Reuse the Git path grammar, never
  // canonicalize a malformed declaration into a wider/successful path.
  workPath(value.endsWith('/**') ? value.slice(0, -3) : value, 'declared path root');
  return value;
}
function typedRef(value, kinds, label) {
  workText(value, label);
  const parsed = parseTargetRef(value);
  if (!parsed || !kinds.includes(parsed.kind)) fail(`${label}: invalid typed reference`);
  return value;
}
function apiSelector(value) {
  workObject(value, ['method', 'path'], [], 'api candidate selector');
  const method = workText(value.method, 'API method').toUpperCase();
  enumValue(method, API_METHODS, 'API method');
  const apiPath = workText(value.path, 'API path');
  if (!apiPath.startsWith('/') || /\s/.test(apiPath)) fail('API path: exact endpoint path required');
  // This is only selector identity (as in spec.mjs), not a confirmed candidate.
  // The actual v2 row including Gate/Tracking/Slice Paths must be resolved later.
  return { method, path: apiPath };
}
function itemId(value) {
  if (!isReconciliationItemId(value)) fail('Item ID: expected exactly two digits (e.g. 01)');
  return value;
}
function sourceSelection(value) {
  workObject(value, ['input_id', 'items', 'source_refs'], [], 'unit source');
  const input = normalizeWorkOrigins([{ input_id: value.input_id, source_refs: value.source_refs }])[0];
  const items = workSet(value.items, itemId, 'source.items', true);
  if (!input.source_refs.length) fail('source.source_refs: nonempty array required');
  return { input_id: input.input_id, items, source_refs: input.source_refs };
}
function isolation(value) {
  workObject(value, ['decisions', 'disabled_units', 'exposure'], [], 'isolation');
  return {
    decisions: workSet(value.decisions, (v) => typedRef(v, ['decision'], 'isolation decision'), 'isolation.decisions', true),
    disabled_units: workSet(value.disabled_units, workUnitId, 'isolation.disabled_units', true),
    exposure: enumValue(value.exposure, ['development-only'], 'isolation.exposure'),
  };
}
function hostUnits(value) {
  workObject(value, [], Object.keys(value || {}), 'host_units');
  return Object.fromEntries(Object.keys(value).sort(byteCompare).map((key) =>
    [member(key), workUnitId(value[key])],
  ));
}
function hostVisualEvidence(value) {
  workObject(value, [], Object.keys(value || {}), 'host_visual_evidence');
  return Object.fromEntries(Object.keys(value).sort(byteCompare).map((key) => {
    member(key);
    const entry = value[key];
    workObject(entry, ['mapping_ref', 'm_keys'], [], 'host visual evidence');
    typedRef(entry.mapping_ref, ['artifact'], 'host mapping');
    const ref = parseTargetRef(entry.mapping_ref);
    if (ref.section !== 'component-mapping' || ref.rowKey !== null) fail('host mapping: exact #component-mapping section required');
    const mKeys = workSet(entry.m_keys, (v) => {
      if (typeof v !== 'string' || !/^M-\d{3,}$/.test(v)) fail('host M-key: expected M-[0-9]{3,}');
      return v;
    }, 'host m_keys', true);
    return [key, { mapping_ref: entry.mapping_ref, m_keys: mKeys }];
  }));
}
function unitDeclaration(value, kind) {
  workObject(value, ['id', 'kind', 'contracts', 'sources'],
    ['api_candidates', 'isolation', ...(kind === 'surface' ? ['host_units', 'host_visual_evidence'] : [])], 'work unit');
  const unitKind = enumValue(value.kind, KINDS, 'unit.kind');
  const apis = own(value, 'api_candidates') ? workSet(value.api_candidates, apiSelector, 'api_candidates') : [];
  if (unitKind === 'api-contract' && !apis.length) fail('api-contract unit: nonempty api_candidates required');
  const sources = workSet(value.sources, sourceSelection, 'unit.sources');
  uniqueBy(sources, (s) => s.input_id, 'unit.sources');
  let hosts = {};
  let visual = {};
  if (kind === 'surface') {
    if (!own(value, 'host_units')) fail('surface unit: host_units required');
    hosts = hostUnits(value.host_units);
    if (!Object.keys(hosts).length) fail('surface unit: nonempty host_units required');
    if (unitKind === 'visual') {
      if (!own(value, 'host_visual_evidence')) fail('surface visual unit: host_visual_evidence required');
      visual = hostVisualEvidence(value.host_visual_evidence);
      if (canonicalJson(Object.keys(hosts)) !== canonicalJson(Object.keys(visual))) fail('surface visual: host key sets differ');
    } else if (own(value, 'host_visual_evidence')) fail('host_visual_evidence is visual-only');
  }
  return {
    id: workUnitId(value.id), kind: unitKind,
    contracts: workSet(value.contracts, (v) => typedRef(v,
      ['artifact', 'decision', 'unknown', 'conflict', 'gap', 'investigation', 'verification'], 'contract'), 'unit.contracts', true),
    sources, api_candidates: apis,
    isolation: own(value, 'isolation') ? isolation(value.isolation) : null,
    host_units: hosts, host_visual_evidence: visual,
  };
}

// undefined means the optional section was absent. An authored null, a string
// version, or a malformed declaration is never treated as absence/legacy mode.
export function parseScopedPolicy(value) {
  if (value === undefined) return null;
  workObject(value, ['version', 'owners', 'profiles', 'role_limits', 'deny_paths'], [], 'policy.work_execution');
  workVersion(value.version, 'policy.work_execution');
  const profiles = workSet(value.profiles, (v) => enumValue(v, KINDS, 'profile'), 'profiles', true);
  workObject(value.role_limits, profiles, KINDS.filter((k) => !profiles.includes(k)), 'role_limits');
  const roles = Object.fromEntries(Object.keys(value.role_limits).sort(byteCompare).map((kind) =>
    [kind, workSet(value.role_limits[kind], (v) => enumValue(v, ROLE_CEILINGS[kind], `${kind} role`), `${kind} roles`)],
  ));
  return { version: 1, owners: workSet(value.owners, owner, 'policy owners'), profiles,
    role_limits: roles, deny_paths: workSet(value.deny_paths, pattern, 'deny_paths') };
}
export function parseScopedOwner(value, ownerId) {
  const parts = ownerParts(ownerId);
  if (value === undefined) return null;
  workObject(value, ['version', 'units'], ['private_paths', 'test_paths'], 'owner.work_execution');
  workVersion(value.version, 'owner.work_execution');
  const roots = own(value, 'private_paths') ? value.private_paths : {};
  workObject(roots, [], ['domain_component', 'hook'], 'private_paths');
  const privatePaths = Object.fromEntries(Object.keys(roots).sort(byteCompare).map((role) =>
    [role, workSet(roots[role], pattern, `${role} private paths`)],
  ));
  const units = workSet(value.units, (v) => unitDeclaration(v, parts.kind), 'units', true);
  uniqueBy(units, (u) => u.id, 'units');
  for (const unit of units) if (unit.isolation) {
    if (unit.kind !== 'visual') fail('isolation: only visual work may declare disabled behavior units');
    for (const id of unit.isolation.disabled_units) {
      if (!units.some((other) => other.id === id && other.kind === 'behavior')) fail(`isolation: ${id} must resolve to a local behavior unit`);
    }
  }
  return { version: 1, private_paths: privatePaths,
    test_paths: own(value, 'test_paths') ? workSet(value.test_paths, pattern, 'test_paths') : [], units };
}
export function workDigest(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) fail(`${label}: sha256:<64 lowercase hex> required`);
  return value;
}
export function parseDecisionWorkScopes(value) {
  if (value === undefined) return null;
  workObject(value, ['version', 'bindings'], [], 'decision_work_scopes');
  workVersion(value.version, 'decision_work_scopes');
  const bindings = workSet(value.bindings, (binding) => {
    workObject(binding, ['decision_id', 'owner', 'known_units', 'blocks', 'basis_digest', 'approval_ref'], [], 'scope binding');
    const id = workText(binding.decision_id, 'decision_id');
    if (!/^D-[A-Za-z0-9-]+$/.test(id)) fail('decision_id: canonical D- ID required');
    const known = workSet(binding.known_units, workUnitId, 'known_units', true);
    const blocks = workSet(binding.blocks, workUnitId, 'blocks');
    if (blocks.some((unit) => !known.includes(unit))) fail('scope binding: blocks must be a subset of known_units');
    return { decision_id: id, owner: owner(binding.owner), known_units: known, blocks,
      basis_digest: workDigest(binding.basis_digest, 'basis_digest'), approval_ref: workText(binding.approval_ref, 'approval_ref') };
  }, 'bindings');
  uniqueBy(bindings, (b) => canonicalJson([b.decision_id, b.owner]), 'bindings');
  // No digest computation, approval generation, Status inference or reopen
  // handling here. A full scope-basis-v1 resolver must precede any scope use.
  return { version: 1, bindings };
}

// Decode only an explicitly selected declaration/receipt, not all ordinary
// reconciliation documents. Reject duplicate keys before conversion loses them.
export function decodeScopedYaml(raw, label = 'scoped declaration') {
  if (typeof raw !== 'string') fail(`${label}: YAML text required`);
  let doc;
  try {
    doc = parseDocument(raw, { uniqueKeys: true, strict: true });
    if (doc.errors.length || doc.warnings.length) throw new Error([...doc.errors, ...doc.warnings].map((error) => error.message).join('; '));
    return doc.toJS({ maxAliasCount: 100 });
  } catch (error) { throw new ScopedWorkContractError(`${label}: ${error.message}`); }
}

export function parseWorkCoverageReceipt(value) {
  workObject(value, ['version', 'owner', 'unit', 'input_id', 'item_ids', 'source_refs',
    'input_sha256', 'effects_sha256', 'contracts_sha256', 'review_scope', 'coverage'],
  ['origin_source_refs', 'origin_relation'], 'work-coverage');
  workVersion(value.version, 'work-coverage');
  const input = normalizeWorkOrigins([{ input_id: value.input_id, source_refs: value.source_refs }])[0];
  if (!input.source_refs.length) fail('work-coverage: nonempty source_refs required');
  const receipt = {
    version: 1, owner: owner(value.owner), unit: workUnitId(value.unit), input_id: input.input_id,
    item_ids: workSet(value.item_ids, itemId, 'item_ids', true), source_refs: input.source_refs,
    input_sha256: workDigest(value.input_sha256, 'input_sha256'), effects_sha256: workDigest(value.effects_sha256, 'effects_sha256'),
    contracts_sha256: workDigest(value.contracts_sha256, 'contracts_sha256'),
    review_scope: enumValue(value.review_scope, [REVIEW_PROFILE_STAGE04], 'review_scope'),
    coverage: enumValue(value.coverage, ['complete-for-unit'], 'coverage'),
  };
  if (own(value, 'origin_source_refs') !== own(value, 'origin_relation')) fail('work-coverage: origin_source_refs and origin_relation must appear together');
  if (own(value, 'origin_relation')) {
    receipt.origin_source_refs = normalizeWorkOrigins([{ input_id: value.input_id, source_refs: value.origin_source_refs }])[0].source_refs;
    receipt.origin_relation = enumValue(value.origin_relation, ['covered-for-unit', 'no-effect-on-unit'], 'origin_relation');
  }
  // Syntax only. Actual bytes/effects/contracts, source links, accepted states,
  // membership, unresolved decisions and Stage 04 semantic review are NOT proven.
  return receipt;
}
export function parseWorkCoverageReceipts(values) {
  const receipts = workSet(values, parseWorkCoverageReceipt, 'work-coverage receipts');
  return uniqueBy(receipts, (r) => canonicalJson([r.owner, r.unit, r.input_id]), 'work-coverage receipts');
}
