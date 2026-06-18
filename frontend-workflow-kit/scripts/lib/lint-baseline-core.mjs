import { POLICY_CATALOG, LintPolicyContractError } from './lint-gen-core.mjs';

const POLICY_IDS = Object.freeze(Object.keys(POLICY_CATALOG).sort((a, b) => a.localeCompare(b)));
const COUNT_ROOT_KEYS = Object.freeze(['counts', 'version']);

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function addAllowedKeyErrors(errors, label, value, allowed) {
  if (!isPlainObject(value)) return;
  const set = new Set(allowed);
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    if (!set.has(key)) errors.push(`${label}.${key}: unsupported field`);
  }
}

function validateCount(errors, label, value) {
  if (!Number.isInteger(value) || value < 0) {
    errors.push(`${label}: expected non-negative integer current count`);
  }
}

export function parseLintCountsJson(raw, sourceLabel = 'lint-counts.json') {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new LintPolicyContractError(`${sourceLabel}: JSON parse failed`, [String(err.message || err)]);
  }
}

export function validateLintCounts(counts) {
  const errors = [];

  if (!isPlainObject(counts)) {
    return ['(root): expected object'];
  }

  addAllowedKeyErrors(errors, '(root)', counts, COUNT_ROOT_KEYS);
  if (counts.version !== 1) errors.push('version: expected integer 1');
  if (!isPlainObject(counts.counts)) {
    errors.push('counts: expected object');
    return errors;
  }

  for (const id of Object.keys(counts.counts).sort((a, b) => a.localeCompare(b))) {
    if (!POLICY_CATALOG[id]) {
      errors.push(`counts.${id}: unknown policy id`);
      continue;
    }
    validateCount(errors, `counts.${id}`, counts.counts[id]);
  }

  return errors;
}

export function buildLintBaselineReport(model, countsInput = { version: 1, counts: {} }) {
  const countErrors = validateLintCounts(countsInput);
  if (countErrors.length) {
    throw new LintPolicyContractError('lint baseline counts contract failed', countErrors);
  }

  const counts = countsInput.counts;
  const ratchetPolicies = model.enabledPolicies.filter((policy) => policy.rollout === 'ratchet');
  const missing = ratchetPolicies
    .filter((policy) => !Number.isInteger(counts[policy.policy_id]))
    .map((policy) => `counts.${policy.policy_id}: required current count for rollout: ratchet`);
  if (missing.length) {
    throw new LintPolicyContractError('lint baseline counts contract failed', missing);
  }

  const results = ratchetPolicies
    .slice()
    .sort((a, b) => a.policy_id.localeCompare(b.policy_id))
    .map((policy) => {
      const current = counts[policy.policy_id];
      const baseline = policy.baseline;
      const delta = current - baseline;
      let status = 'pass';
      if (delta > 0) status = 'increase';
      if (delta < 0) status = 'improvement';
      return {
        policy_id: policy.policy_id,
        baseline,
        current,
        delta,
        status,
        target_severity: policy.target_severity,
        emitted_severity: policy.emitted_severity,
      };
    });

  const hasIncrease = results.some((result) => result.status === 'increase');
  const hasImprovement = results.some((result) => result.status === 'improvement');
  let status = 'pass';
  if (!results.length) status = 'no-ratchet';
  else if (hasIncrease) status = 'increase';
  else if (hasImprovement) status = 'improvement';

  return {
    ok: !hasIncrease,
    status,
    ratchet_policy_count: results.length,
    results,
  };
}

export function knownLintPolicyIds() {
  return POLICY_IDS.slice();
}
