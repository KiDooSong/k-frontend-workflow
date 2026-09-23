// B §5.3 paired canonical snapshots, NOT an approval or execution predicate.
// Findings must be enforced by the future Git/Stage 04 integration. Two snapshots
// do not authenticate their history or a human review; no reference string,
// matching digest, or empty violations array grants a path or adopts a scope.
import path from 'node:path';
import { col, hasHeader } from './spec.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { ownerParts, readCurrentBytes, hashBytes } from './current-work-request.mjs';
import { parseTargetRef } from './reconciliation-items.mjs';
import { REQUIRED_OPEN_DECISION_COLUMNS, openDecisionRowIsMalformed } from './open-decisions.mjs';
import { createScopedReferenceResolver } from './scoped-work-refs.mjs';
import { parseDecisionWorkScopes } from './scoped-work-declarations.mjs';
import { resolveScopedApplicabilityProjection } from './scoped-work-applicability.mjs';
import { inspectScopedDecisionBindings } from './scoped-work-bindings.mjs';
import { ScopedWorkContractError } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-TRANSITIONS: ${message}`); };
const same = (a, b) => scopeJson(a) === scopeJson(b);
const bindingScope = (binding) => binding ? { known_units: scopeSet(binding.known_units),
  blocks: scopeSet(binding.blocks), basis_digest: binding.basis_digest } : null;
const bindingValue = (binding) => binding ? { ...bindingScope(binding), approval_ref: binding.approval_ref } : null;

function snapshot(owner, options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('two file-backed snapshot options required');
  if (Object.hasOwn(options, 'owner') && options.owner !== owner) fail('snapshot owner differs from requested owner');
  const args = { ...options, owner };
  const inspection = inspectScopedDecisionBindings(args);
  const { projection, read_set } = resolveScopedApplicabilityProjection(args);
  const files = new Map();
  for (const entry of [...inspection.read_set, ...read_set]) {
    if (files.has(entry.file) && files.get(entry.file).sha256 !== entry.sha256) fail('snapshot changed between transition passes');
    files.set(entry.file, entry);
  }
  if (!same(inspection.known_units, projection.known_units)) fail('owner units changed between transition passes');
  const refs = createScopedReferenceResolver(args);
  const checks = new Map(inspection.checks.map((check) => [check.decision, check]));
  function audit() {
    for (const entry of files.values()) {
      const file = canonicalRepositoryPath(args.projectRoot, entry.file,
        { required: true, type: 'file', label: 'scoped transition snapshot' });
      if (hashBytes(readCurrentBytes(file.absolute, 'scoped transition snapshot')) !== entry.sha256) {
        fail('snapshot changed while inspecting transitions');
      }
    }
  }
  function decision(ref) {
    const parsed = parseTargetRef(ref);
    if (!parsed || parsed.kind !== 'decision') fail('canonical decision reference required');
    // Preserve the old/new union even when a referrer or applicability edge was
    // removed. Reusing only the after closure could hide a simultaneous reopen.
    const matches = [...args.targetIndex.artifacts.values()].flatMap((entry) =>
      (entry.rows.get(parsed.rowId) || []).filter((row) => row.family === 'decision').map(() => entry));
    if (!matches.length) return null;
    if (matches.length !== 1 || matches[0].fm.artifact_id !== parsed.ownerArtifactId) {
      fail('decision identity is ambiguous or moved to another home');
    }
    const home = matches[0];
    if (home.fm.artifact_type === 'open-decision-register') {
      if (home.fm.artifact_id !== 'open-decision-register' || home.file !== path.join(args.docsDir, 'global/open-decisions.md')) {
        fail('noncanonical global decision home');
      }
    } else if (home.fm.artifact_type !== 'screen-spec') fail('noncanonical local decision home');
    const record = refs.contract(ref);
    if (!files.has(record.file)) fail('decision home missing from canonical audit');
    const { headers, cells } = record.selection;
    if (!headers || REQUIRED_OPEN_DECISION_COLUMNS.some((header) => !hasHeader(headers, header))) fail('missing decision columns');
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
    const status = col(row, 'Status').toLowerCase();
    if (openDecisionRowIsMalformed({ id: col(row, 'ID'), decisionNeeded: col(row, 'Decision Needed'),
      blockingMode: col(row, 'Blocking Mode'), status })) fail('malformed canonical decision');
    const bindings = (parseDecisionWorkScopes(record.metadata.decision_work_scopes)?.bindings || [])
      .filter((binding) => binding.decision_id === parsed.rowId);
    const check = checks.get(ref);
    if (check && (check.status !== status ||
        !same(bindingValue(check.declared_binding), bindingValue(bindings.find((binding) => binding.owner === owner))))) {
      fail('decision or binding changed between transition passes');
    }
    return { status, bindings };
  }
  return { inspection, projection, checks, decision, audit, readSet: () => scopeSet([...files.values()]) };
}

export function inspectScopedDecisionTransitions({ owner, before, after } = {}) {
  ownerParts(owner);
  const previous = snapshot(owner, before), current = snapshot(owner, after);
  const scopeChanged = !same(previous.projection, current.projection);
  const knownUnitsChanged = !same(previous.inspection.known_units, current.inspection.known_units);
  const decisions = scopeSet([...new Set([...previous.checks.keys(), ...current.checks.keys()])]);
  const transitions = [], violations = [];
  let removedOpenApplicability = false;
  for (const ref of decisions) {
    const old = previous.decision(ref), next = current.decision(ref);
    const oldBinding = old?.bindings.find((binding) => binding.owner === owner) || null;
    const newBinding = next?.bindings.find((binding) => binding.owner === owner) || null;
    const bindingChanged = !same(bindingValue(oldBinding), bindingValue(newBinding));
    const wasApplicable = previous.checks.has(ref), isApplicable = current.checks.has(ref);
    const reopened = old?.status === 'resolved' && next?.status === 'open';
    if (old && !next) violations.push({ code: 'decision-disappeared', decision: ref });
    if (reopened && next.bindings.length) {
      // Reopen invalidates every owner binding for this Decision, including a
      // replacement with a new digest/ref or another owner's retained scope.
      violations.push({ code: 'reopen-binding-retained', decision: ref,
        owners: scopeSet(next.bindings.map((binding) => binding.owner)) });
    }
    if (oldBinding && newBinding && oldBinding.approval_ref === newBinding.approval_ref &&
        !same(bindingScope(oldBinding), bindingScope(newBinding))) {
      violations.push({ code: 'approval-ref-reused-with-changed-binding', decision: ref, owner });
    }
    if (wasApplicable && !isApplicable && (old?.status === 'open' || next?.status === 'open')) removedOpenApplicability = true;
    transitions.push({ decision: ref, before_status: old?.status ?? null, after_status: next?.status ?? null,
      before_applicable: wasApplicable, after_applicable: isApplicable, reopened,
      binding_change: !oldBinding && !newBinding ? 'absent' : !oldBinding ? 'added' : !newBinding ? 'removed'
        : bindingChanged ? 'changed' : 'unchanged',
      after_binding_state: current.checks.get(ref)?.binding_state ?? null,
      review_required: scopeChanged || bindingChanged || wasApplicable !== isApplicable || old?.status !== next?.status,
      approval_verified: false });
  }
  // Re-read BOTH trees after comparison; a later mutation in before is not
  // excused just because after was read last. No document or binding is written.
  previous.audit(); current.audit();
  return { owner, scope_changed: scopeChanged, known_units_changed: knownUnitsChanged,
    transitions: scopeSet(transitions), violations: scopeSet(violations),
    review_required: scopeChanged || transitions.some((entry) => entry.review_required) || violations.length > 0,
    approval_verified: false,
    blocking_units: scopeSet(violations.length || removedOpenApplicability
      ? current.inspection.known_units : current.inspection.blocking_units),
    read_sets: { before: previous.readSet(), after: current.readSet() } };
}
