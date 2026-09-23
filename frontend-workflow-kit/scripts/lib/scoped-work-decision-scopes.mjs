// B §5.3 mechanical use of human-owned canonical scope declarations. This does
// not authenticate the author/review or authorize a path. Never write a binding,
// refresh its digest, resolve a Decision, or accept caller-supplied verdicts.
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { ownerParts, readCurrentBytes, hashBytes } from './current-work-request.mjs';
import { inspectScopedDecisionBindings } from './scoped-work-bindings.mjs';
import { inspectScopedDecisionTransitions } from './scoped-work-transitions.mjs';
import { ScopedWorkContractError } from './scoped-work-request.mjs';
import { scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-DECISION-SCOPE: ${message}`); };
const union = (values) => scopeSet([...new Set(values)]);

export function inspectScopedDecisionScopes(options = {}) {
  const inspection = inspectScopedDecisionBindings(options);
  const checks = inspection.checks.map((check) => {
    // The native inspector has already checked the exact owner/Decision home,
    // complete known-unit set and resolved R1 basis. "Current" is byte/scope
    // validity of a declaration, NOT proof that a human approved its meaning.
    const current = check.binding_state === 'current-unverified';
    const open = check.status === 'open';
    return { ...check, declaration_current: current, declaration_scope_used: open && current,
      scope_source: !open ? 'resolved-decision' : current ? 'current-canonical-declaration' : 'conservative-default',
      blocking_units: !open ? [] : current ? [...check.declared_binding.blocks] : [...inspection.known_units],
      scope_review_needed: open && !current, approval_verified: false };
  });
  const blocking = union(checks.flatMap((check) => check.blocking_units));
  return { ...inspection, checks: scopeSet(checks), blocking_units: blocking,
    unit_checks: inspection.known_units.map((unit) => ({ unit, decisions_clear: !blocking.includes(unit) })),
    review_required: checks.some((check) => check.scope_review_needed),
    approval_verified: false, permission_evaluated: false,
    required_reviews: [
      'Only a human may adopt or narrow Decision scope, including explicit empty blocks. A digest and approval_ref are recorded evidence, not authentication.',
      'Reopen removes every binding for that Decision. Restoring an old scope without renewed human review is gate lowering.',
      'Execution must also enforce original before/after Git transitions, immutable authority resources, profile/source facts and every owner/host/path constraint.',
    ] };
}

// File-backed pair used by the original-Git adapter, not serialized caller JSON.
// The public CLI must use that adapter and retain the implementation baseline;
// this pair alone does not prove where a snapshot came from.
export function inspectScopedDecisionScopeTransitions({ owner, before, after } = {}) {
  ownerParts(owner);
  const findings = inspectScopedDecisionTransitions({ owner, before, after });
  const previous = inspectScopedDecisionScopes({ ...before, owner });
  const current = inspectScopedDecisionScopes({ ...after, owner });
  function audit(options, groups) {
    const files = new Map();
    for (const entries of groups) for (const entry of entries) {
      if (files.has(entry.file) && files.get(entry.file).sha256 !== entry.sha256) fail('scope snapshot changed between passes');
      files.set(entry.file, entry);
    }
    for (const entry of files.values()) {
      const file = canonicalRepositoryPath(options.projectRoot, entry.file,
        { required: true, type: 'file', label: 'scoped Decision scope' });
      if (hashBytes(readCurrentBytes(file.absolute, 'scoped Decision scope')) !== entry.sha256) fail('scope snapshot changed');
    }
    return scopeSet([...files.values()]);
  }
  const readSets = { before: audit(before, [findings.read_sets.before, previous.read_set]),
    after: audit(after, [findings.read_sets.after, current.read_set]) };
  const removedOpenApplicability = findings.transitions.some((entry) => entry.before_applicable && !entry.after_applicable &&
    (entry.before_status === 'open' || entry.after_status === 'open'));
  const transitionValid = findings.violations.length === 0 && !removedOpenApplicability;
  const blocking = transitionValid ? current.blocking_units : [...current.known_units];
  return { ...findings, known_units: current.known_units,
    before_decision_scopes: previous.checks, after_decision_scopes: current.checks,
    transition_valid: transitionValid, removed_open_applicability: removedOpenApplicability,
    blocking_units: blocking,
    unit_checks: current.known_units.map((unit) => ({ unit, decisions_clear: !blocking.includes(unit) })),
    review_required: findings.review_required || previous.review_required || current.review_required,
    read_sets: readSets, approval_verified: false, permission_evaluated: false,
    required_reviews: current.required_reviews };
}
