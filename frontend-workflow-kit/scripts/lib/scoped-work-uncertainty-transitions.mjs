// #262: the Decision binding transition rules (scoped-work-transitions.mjs) for
// Unknown/Conflict bindings, on two file-backed snapshots. Like the Decision
// inspector this is NOT an approval or execution predicate, and no CLI calls it
// yet: the Git/Stage 04 integration must enforce its findings. Two snapshots do
// not authenticate their history or a human review, and nothing is written.
import { col } from './spec.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { ownerParts, readCurrentBytes, hashBytes } from './current-work-request.mjs';
import { createScopedReferenceResolver, parseScopedTargetRef } from './scoped-work-refs.mjs';
import { parseUncertaintyWorkScopes } from './scoped-work-declarations.mjs';
import { resolveScopedApplicabilityProjection } from './scoped-work-applicability.mjs';
import { scopedUncertaintyResolved } from './scoped-work-uncertainty.mjs';
import { scopedUncertaintyScopes } from './scoped-work-uncertainty-scopes.mjs';
import { ScopedWorkContractError } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-UNCERTAINTY-TRANSITIONS: ${message}`); };
const same = (a, b) => scopeJson(a) === scopeJson(b);
const bindingScope = (binding) => binding ? { known_units: scopeSet(binding.known_units),
  blocks: scopeSet(binding.blocks), basis_digest: binding.basis_digest } : null;
const bindingValue = (binding) => binding ? { ...bindingScope(binding), approval_ref: binding.approval_ref } : null;

function snapshot(owner, options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('two file-backed snapshot options required');
  if (Object.hasOwn(options, 'owner') && options.owner !== owner) fail('snapshot owner differs from requested owner');
  const args = { ...options, owner };
  const { projection, read_set } = resolveScopedApplicabilityProjection(args);
  const inspection = scopedUncertaintyScopes(args, projection, read_set);
  const files = new Map(read_set.map((entry) => [entry.file, entry]));
  const refs = createScopedReferenceResolver(args);
  const checks = new Map(inspection.checks.map((check) => [check.uncertainty, check]));
  function audit() {
    for (const entry of files.values()) {
      const file = canonicalRepositoryPath(args.projectRoot, entry.file, { required: true, type: 'file', label: 'scoped uncertainty transition' });
      if (hashBytes(readCurrentBytes(file.absolute, 'scoped uncertainty transition')) !== entry.sha256) fail('snapshot changed while inspecting transitions');
    }
  }
  // Read the row in its home even when it no longer applies to the owner: the
  // old/new union must not hide a reopen behind a removed relation. Unlike a
  // Decision ID, an Unknown/Conflict ID is local to the document that holds it:
  // the row is the one in its own home, and a row moved elsewhere is another row.
  function row(ref) {
    const parsed = parseScopedTargetRef(ref);
    if (!parsed || !['unknown', 'conflict'].includes(parsed.kind)) fail('canonical Unknown/Conflict reference required');
    const indexed = args.targetIndex.artifacts.get(parsed.ownerArtifactId);
    if (!indexed || !(indexed.rows.get(parsed.rowId) || []).some((entry) => entry.family === parsed.kind)) return null;
    const record = refs.contract(ref);
    if (!files.has(record.file)) fail('uncertainty home missing from the canonical audit');
    const { headers, cells } = record.selection;
    const status = col(Object.fromEntries(headers.map((header, index) => [header, cells[index]])), 'Status') || null;
    if (parsed.kind === 'conflict' && !['open', 'resolved'].includes(status)) fail(`invalid Conflict Status: ${ref}`);
    const bindings = (parseUncertaintyWorkScopes(record.metadata.uncertainty_work_scopes)?.bindings || [])
      .filter((binding) => binding.kind === parsed.kind && binding.id === parsed.rowId);
    const check = checks.get(ref);
    if (check && (check.status !== status ||
        !same(bindingValue(check.declared_binding), bindingValue(bindings.find((binding) => binding.owner === owner) || null)))) {
      fail('uncertainty or binding changed between transition passes');
    }
    return { status, resolved: scopedUncertaintyResolved({ kind: parsed.kind, status }), bindings };
  }
  return { inspection, projection, checks, row, audit, readSet: () => scopeSet([...files.values()]) };
}

export function inspectScopedUncertaintyTransitions({ owner, before, after } = {}) {
  ownerParts(owner);
  const previous = snapshot(owner, before), current = snapshot(owner, after);
  const scopeChanged = !same(previous.projection, current.projection);
  const knownUnitsChanged = !same(previous.inspection.known_units, current.inspection.known_units);
  const refs = scopeSet([...new Set([...previous.checks.keys(), ...current.checks.keys()])]);
  const transitions = [], violations = [];
  let removedOpenApplicability = false;
  for (const ref of refs) {
    const old = previous.row(ref), next = current.row(ref);
    const oldBinding = old?.bindings.find((binding) => binding.owner === owner) || null;
    const newBinding = next?.bindings.find((binding) => binding.owner === owner) || null;
    const bindingChanged = !same(bindingValue(oldBinding), bindingValue(newBinding));
    const wasApplicable = previous.checks.has(ref), isApplicable = current.checks.has(ref);
    const reopened = Boolean(old?.resolved && next && !next.resolved);
    if (old && !next) violations.push({ code: 'uncertainty-disappeared', uncertainty: ref });
    if (reopened && next.bindings.length) {
      // Reopen invalidates every owner binding for this row, including a
      // replacement with a new digest/ref or another owner's retained scope.
      violations.push({ code: 'reopen-binding-retained', uncertainty: ref, owners: scopeSet(next.bindings.map((binding) => binding.owner)) });
    }
    if (oldBinding && newBinding && oldBinding.approval_ref === newBinding.approval_ref &&
        !same(bindingScope(oldBinding), bindingScope(newBinding))) {
      violations.push({ code: 'approval-ref-reused-with-changed-binding', uncertainty: ref, owner });
    }
    if (wasApplicable && !isApplicable && (old?.resolved === false || next?.resolved === false)) removedOpenApplicability = true;
    transitions.push({ uncertainty: ref, before_status: old?.status ?? null, after_status: next?.status ?? null,
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
      ? current.inspection.known_units : [...new Set(current.inspection.checks.flatMap((check) => check.blocking_units))]),
    read_sets: { before: previous.readSet(), after: current.readSet() } };
}
