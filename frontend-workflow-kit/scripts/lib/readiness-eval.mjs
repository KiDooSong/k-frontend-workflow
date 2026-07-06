// readiness-eval.mjs - deterministic labeled-case measurement for readiness.
//
// This module consumes computeReadiness as the only readiness decision source.
// It reports label-vs-actual metrics; it does not gate, threshold, or rewrite
// readiness output.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeReadiness } from '../readiness.mjs';
import { deriveMetrics, isStub, loadScreenSpec } from './spec.mjs';
import { KIT_ROOT, yamlStringify } from './util.mjs';

export const DEFAULT_EVAL_CASES_PATH = path.join(KIT_ROOT, 'examples', 'readiness-eval', 'cases.json');

const DEFAULT_EVAL_POLICY = {
  order: ['docs-only', 'rough-fixture-ui', 'final-fixture-ui'],
  modes: {
    'docs-only': { requires: [], allowed_paths: ['docs/**'], forbidden_paths: [] },
    'rough-fixture-ui': {
      requires: ['screen_spec_authored == true'],
      allowed_paths: ['src/rough/**'],
      forbidden_paths: [],
    },
    'final-fixture-ui': {
      requires: ['state_matrix_complete == true'],
      allowed_paths: ['src/final/**'],
      forbidden_paths: [],
    },
  },
};

const DEFAULT_EVAL_LAYOUT = {
  layerTelemetryDeclared: false,
  resolvePaths: (paths) => (Array.isArray(paths) ? [...paths] : []),
};

class EvalCasesError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EvalCasesError';
  }
}

function fail(message) {
  throw new EvalCasesError(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string`);
}

function requireObject(value, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    fail(`${label} must be an array of strings`);
  }
}

function policyFor(testCase) {
  return testCase.policy || DEFAULT_EVAL_POLICY;
}

function policyOrder(policy) {
  if (Array.isArray(policy?.order)) return policy.order;
  if (isPlainObject(policy?.modes)) return Object.keys(policy.modes);
  return [];
}

function validatePolicyReference(testCase, mode, label) {
  const order = policyOrder(policyFor(testCase));
  if (!order.includes(mode)) fail(`${label} references unknown policy mode "${mode}" in case ${testCase.id}`);
}

export function validateEvalCases(parsed) {
  requireObject(parsed, 'cases file');
  if (parsed.schema_version !== 1) fail('schema_version must be 1');
  if (!Array.isArray(parsed.cases)) fail('cases must be an array');

  const seen = new Set();
  for (const [index, testCase] of parsed.cases.entries()) {
    const label = `cases[${index}]`;
    requireObject(testCase, label);
    requireString(testCase.id, `${label}.id`);
    if (seen.has(testCase.id)) fail(`duplicate case id: ${testCase.id}`);
    seen.add(testCase.id);

    requireString(testCase.description, `${label}.description`);
    requireObject(testCase.label_source, `${label}.label_source`);
    requireString(testCase.label_source.kind, `${label}.label_source.kind`);
    requireString(testCase.label_source.ref, `${label}.label_source.ref`);

    requireObject(testCase.spec, `${label}.spec`);
    requireObject(testCase.spec.frontmatter, `${label}.spec.frontmatter`);
    requireString(testCase.spec.frontmatter.screen_id, `${label}.spec.frontmatter.screen_id`);
    requireString(testCase.spec.body, `${label}.spec.body`);

    requireObject(testCase.expect, `${label}.expect`);
    requireString(testCase.expect.target_mode, `${label}.expect.target_mode`);
    requireString(testCase.expect.readiness_mode, `${label}.expect.readiness_mode`);
    if (!['open', 'block'].includes(testCase.expect.gate)) {
      fail(`${label}.expect.gate must be "open" or "block"`);
    }
    if (typeof testCase.expect.fail_closed !== 'boolean') {
      fail(`${label}.expect.fail_closed must be a boolean`);
    }
    requireStringArray(testCase.expect.blocking_kinds, `${label}.expect.blocking_kinds`);

    if (testCase.policy !== undefined) {
      requireObject(testCase.policy, `${label}.policy`);
      if (!Array.isArray(testCase.policy.order)) fail(`${label}.policy.order must be an array`);
      requireObject(testCase.policy.modes, `${label}.policy.modes`);
    }
    if (testCase.ci !== undefined) requireObject(testCase.ci, `${label}.ci`);
    if (testCase.manifest !== undefined) requireObject(testCase.manifest, `${label}.manifest`);
    if (testCase.derived_override !== undefined) {
      requireObject(testCase.derived_override, `${label}.derived_override`);
    }
    validatePolicyReference(testCase, testCase.expect.target_mode, `${label}.expect.target_mode`);
    validatePolicyReference(testCase, testCase.expect.readiness_mode, `${label}.expect.readiness_mode`);
  }

  return {
    schema_version: 1,
    cases: [...parsed.cases].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function loadEvalCases(filePath = DEFAULT_EVAL_CASES_PATH) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    fail('cases file could not be read');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fail(`cases file is not valid JSON: ${err.message}`);
  }
  return validateEvalCases(parsed);
}

function writeCaseSpec(tmpDir, testCase) {
  const specPath = path.join(tmpDir, 'screen-spec.md');
  const frontmatter = yamlStringify(testCase.spec.frontmatter, { lineWidth: 0 }).trimEnd();
  const body = testCase.spec.body.endsWith('\n') ? testCase.spec.body : `${testCase.spec.body}\n`;
  fs.writeFileSync(specPath, ['---', frontmatter, '---', '', body].join('\n'), 'utf8');
  return specPath;
}

function withLoadedCaseSpec(testCase, fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-eval-'));
  try {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const specPath = writeCaseSpec(tmpDir, testCase);
    const spec = loadScreenSpec(specPath);
    const derived = {
      ...deriveMetrics(spec, { srcDir }),
      ...(testCase.derived_override || {}),
    };
    return fn({ spec, derived });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function blockingKinds(blocking) {
  const kinds = new Set();
  for (const item of Array.isArray(blocking) ? blocking : []) {
    if (!isPlainObject(item)) continue;
    for (const key of Object.keys(item)) kinds.add(key);
  }
  return [...kinds].sort();
}

function gateFor({ actualMode, targetMode, order }) {
  const actualIdx = order.indexOf(actualMode);
  const targetIdx = order.indexOf(targetMode);
  if (actualIdx < 0 || targetIdx < 0) return 'block';
  return actualIdx >= targetIdx ? 'open' : 'block';
}

function outcomeFor(expectedGate, actualGate) {
  if (expectedGate === 'open' && actualGate === 'open') return 'true_open';
  if (expectedGate === 'open' && actualGate === 'block') return 'false_closed';
  if (expectedGate === 'block' && actualGate === 'open') return 'false_open';
  return 'true_closed';
}

function publicCaseResult(result) {
  return {
    id: result.id,
    expected_readiness_mode: result.expected_readiness_mode,
    actual_readiness_mode: result.actual_readiness_mode,
    target_mode: result.target_mode,
    expected_gate: result.expected_gate,
    actual_gate: result.actual_gate,
    outcome: result.outcome,
    exact_match: result.exact_match,
    expected_blocking_kinds: result.expected_blocking_kinds,
    observed_blocking_kinds: result.observed_blocking_kinds,
  };
}

export function runEvalCase(testCase) {
  return withLoadedCaseSpec(testCase, ({ spec, derived }) => {
    const screenId = String(testCase.spec.frontmatter.screen_id);
    const policy = policyFor(testCase);
    const order = policyOrder(policy);
    const readiness = computeReadiness({
      state: {
        global: {},
        screens: {
          [screenId]: {
            domain: spec.frontmatter.domain,
            status: spec.frontmatter.status || 'missing',
            stub: isStub(spec),
            derived,
          },
        },
      },
      policy,
      ci: testCase.ci || {},
      manifest: testCase.manifest || {},
      layout: DEFAULT_EVAL_LAYOUT,
    })[screenId];

    const actualMode = readiness?.readiness_mode || '(missing)';
    const actualGate = gateFor({
      actualMode,
      targetMode: testCase.expect.target_mode,
      order,
    });
    const result = {
      id: testCase.id,
      expected_readiness_mode: testCase.expect.readiness_mode,
      actual_readiness_mode: actualMode,
      target_mode: testCase.expect.target_mode,
      expected_gate: testCase.expect.gate,
      actual_gate: actualGate,
      outcome: outcomeFor(testCase.expect.gate, actualGate),
      exact_match: testCase.expect.readiness_mode === actualMode,
      expected_blocking_kinds: [...testCase.expect.blocking_kinds].sort(),
      observed_blocking_kinds: blockingKinds(readiness?.blocking),
    };
    Object.defineProperty(result, '_expect_fail_closed', {
      value: testCase.expect.fail_closed,
      enumerable: false,
    });
    return result;
  });
}

export function summarizeEval(caseResults) {
  const results = [...caseResults].sort((a, b) => a.id.localeCompare(b.id));
  const falseOpenCases = results.filter((r) => r.outcome === 'false_open').map((r) => r.id);
  const falseClosedCases = results.filter((r) => r.outcome === 'false_closed').map((r) => r.id);
  const failClosedCases = results.filter((r) => r._expect_fail_closed === true);
  const leakedCases = failClosedCases.filter((r) => r.actual_gate === 'open').map((r) => r.id);

  return {
    tool: 'workflow:eval',
    mode: 'warning-first',
    schema_version: 1,
    ok: true,
    total: results.length,
    exact_match: results.filter((r) => r.exact_match).length,
    confusion: {
      false_open: { count: falseOpenCases.length, cases: falseOpenCases },
      false_closed: { count: falseClosedCases.length, cases: falseClosedCases },
      true_open: results.filter((r) => r.outcome === 'true_open').length,
      true_closed: results.filter((r) => r.outcome === 'true_closed').length,
    },
    fail_closed_axis: {
      expected: failClosedCases.length,
      correct: failClosedCases.length - leakedCases.length,
      leaked: leakedCases.length,
      leaked_cases: leakedCases,
    },
    cases: results.map(publicCaseResult),
  };
}

export function runReadinessEval({ casesPath = DEFAULT_EVAL_CASES_PATH } = {}) {
  const parsed = loadEvalCases(casesPath);
  const results = parsed.cases.map((testCase) => runEvalCase(testCase));
  return summarizeEval(results);
}

export function formatEvalHuman(report) {
  const lines = [
    `workflow:eval - warning-first: ${report.total} case(s), exact_match=${report.exact_match}, ` +
      `false_open=${report.confusion.false_open.count}, false_closed=${report.confusion.false_closed.count}, ` +
      `fail_closed_leaked=${report.fail_closed_axis.leaked}`,
  ];
  if (report.confusion.false_open.count > 0) {
    lines.push(`  false_open: ${report.confusion.false_open.cases.join(', ')}`);
  }
  if (report.confusion.false_closed.count > 0) {
    lines.push(`  false_closed: ${report.confusion.false_closed.cases.join(', ')}`);
  }
  if (report.fail_closed_axis.leaked > 0) {
    lines.push(`  fail_closed_leaked: ${report.fail_closed_axis.leaked_cases.join(', ')}`);
  }
  return lines;
}
