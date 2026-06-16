import path from 'node:path';
import { yamlParse } from './util.mjs';

export const CANONICAL_POLICY_SOURCE = 'docs/frontend-workflow/_meta/lint-policy.yaml';
export const GENERATED_BANNER_PREFIX = '// GENERATED FILE — DO NOT EDIT.';
export const GENERATED_COMMAND = 'npm run workflow:lint-gen';

export const POLICY_CATALOG = Object.freeze({
  'layer-boundaries': Object.freeze({
    tier: 'architecture',
    defaultSeverity: 'error',
    defaultRollout: 'all',
    defaultImplementation: 'auto',
  }),
  'no-adhoc-buttons': Object.freeze({
    tier: 'style',
    defaultSeverity: 'warn',
    defaultRollout: 'all',
    defaultImplementation: 'auto',
  }),
  'no-arbitrary-style-values': Object.freeze({
    tier: 'style',
    defaultSeverity: 'warn',
    defaultRollout: 'all',
    defaultImplementation: 'auto',
  }),
  'no-fetch-in-screens': Object.freeze({
    tier: 'safety',
    defaultSeverity: 'error',
    defaultRollout: 'all',
    defaultImplementation: 'auto',
  }),
});

const SOURCE_EXT_GLOB = '**/*.{js,jsx,ts,tsx}';
const POLICY_IDS = Object.freeze(Object.keys(POLICY_CATALOG).sort((a, b) => a.localeCompare(b)));
const POLICY_KEYS = Object.freeze([
  'baseline',
  'decision_id',
  'enabled',
  'exclude',
  'implementation',
  'include',
  'reason',
  'rollout',
  'severity',
]);
const TOP_LEVEL_KEYS = Object.freeze(['defaults', 'policies', 'version']);
const DEFAULTS_KEYS = Object.freeze(['paths']);
const PATH_KEYS = Object.freeze(['api', 'screens', 'ui']);
const SEVERITIES = Object.freeze(['off', 'warn', 'error']);
const ROLLOUTS = Object.freeze(['all', 'ratchet']);
const DECISION_ID_RE = /^D-[A-Za-z0-9][A-Za-z0-9._-]*$/;
const WINDOWS_ABSOLUTE_RE = /^[A-Za-z]:[\\/]/;

export class LintPolicyContractError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'LintPolicyContractError';
    this.exitCode = 1;
    this.details = details;
  }
}

export function generatedBanner(source = CANONICAL_POLICY_SOURCE) {
  return `${GENERATED_BANNER_PREFIX} Source: ${source}. Regenerate with ${GENERATED_COMMAND}.`;
}

export function normalizeLineEndings(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function toPosixPath(value) {
  return String(value ?? '').replace(/\\/g, '/');
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === 'string' && /\S/.test(value);
}

function severityRank(value) {
  return SEVERITIES.indexOf(value);
}

function addAllowedKeyErrors(errors, label, value, allowed) {
  if (!isPlainObject(value)) return;
  const set = new Set(allowed);
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    if (!set.has(key)) errors.push(`${label}.${key}: unsupported field`);
  }
}

function isAbsoluteContractPath(value) {
  return path.posix.isAbsolute(toPosixPath(value)) || WINDOWS_ABSOLUTE_RE.test(String(value ?? ''));
}

function normalizeContractPath(value) {
  return toPosixPath(value).trim().replace(/^\.\/+/, '').replace(/\/+/g, '/').replace(/\/+$/, '');
}

function validateContractPath(errors, label, value) {
  if (!hasText(value)) {
    errors.push(`${label}: expected non-empty project-relative path/glob`);
    return;
  }
  if (isAbsoluteContractPath(value)) {
    errors.push(`${label}: absolute paths are not allowed in lint policy contracts`);
  }
}

function validateGlobList(errors, label, value) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${label}: expected array`);
    return;
  }
  const seen = new Set();
  value.forEach((item, index) => {
    const itemLabel = `${label}[${index}]`;
    validateContractPath(errors, itemLabel, item);
    const normalized = normalizeContractPath(item);
    if (seen.has(normalized)) errors.push(`${itemLabel}: duplicate glob/path after normalization`);
    seen.add(normalized);
  });
}

function requiredField(errors, label, value, key) {
  if (!isPlainObject(value) || !(key in value)) errors.push(`${label}.${key}: required`);
}

export function parseLintPolicyYaml(raw, sourceLabel = 'lint-policy.yaml') {
  try {
    return yamlParse(raw);
  } catch (err) {
    throw new LintPolicyContractError(`${sourceLabel}: YAML parse failed`, [String(err.message || err)]);
  }
}

export function validateLintPolicy(policy) {
  const errors = [];

  if (!isPlainObject(policy)) {
    return ['(root): expected object'];
  }

  addAllowedKeyErrors(errors, '(root)', policy, TOP_LEVEL_KEYS);
  for (const key of TOP_LEVEL_KEYS) requiredField(errors, '(root)', policy, key);

  if (policy.version !== 1) errors.push('version: expected integer 1');

  if (!isPlainObject(policy.defaults)) {
    errors.push('defaults: expected object');
  } else {
    addAllowedKeyErrors(errors, 'defaults', policy.defaults, DEFAULTS_KEYS);
    requiredField(errors, 'defaults', policy.defaults, 'paths');
    if (!isPlainObject(policy.defaults.paths)) {
      errors.push('defaults.paths: expected object');
    } else {
      addAllowedKeyErrors(errors, 'defaults.paths', policy.defaults.paths, PATH_KEYS);
      for (const key of PATH_KEYS) {
        requiredField(errors, 'defaults.paths', policy.defaults.paths, key);
        if (key in policy.defaults.paths) validateContractPath(errors, `defaults.paths.${key}`, policy.defaults.paths[key]);
      }
    }
  }

  if (!isPlainObject(policy.policies)) {
    errors.push('policies: expected object');
  } else {
    addAllowedKeyErrors(errors, 'policies', policy.policies, POLICY_IDS);
    for (const id of POLICY_IDS) requiredField(errors, 'policies', policy.policies, id);
    for (const id of Object.keys(policy.policies).sort((a, b) => a.localeCompare(b))) {
      const entry = policy.policies[id];
      const catalog = POLICY_CATALOG[id];
      if (!catalog) continue;
      validatePolicyEntry(errors, id, entry, catalog);
    }
  }

  return errors;
}

function validatePolicyEntry(errors, id, entry, catalog) {
  const label = `policies.${id}`;
  if (!isPlainObject(entry)) {
    errors.push(`${label}: expected object`);
    return;
  }

  addAllowedKeyErrors(errors, label, entry, POLICY_KEYS);
  requiredField(errors, label, entry, 'enabled');
  if (typeof entry.enabled !== 'boolean') errors.push(`${label}.enabled: expected boolean`);

  validateGlobList(errors, `${label}.include`, entry.include);
  validateGlobList(errors, `${label}.exclude`, entry.exclude);

  if (entry.decision_id !== undefined) {
    if (typeof entry.decision_id !== 'string' || !DECISION_ID_RE.test(entry.decision_id)) {
      errors.push(`${label}.decision_id: expected D-* decision reference`);
    }
  }

  if (entry.enabled === false) {
    if (!hasText(entry.reason)) errors.push(`${label}.reason: required when policy is disabled`);
    for (const key of ['baseline', 'rollout', 'severity']) {
      if (key in entry) errors.push(`${label}.${key}: forbidden when policy is disabled`);
    }
    if (catalog.tier === 'safety' && entry.decision_id === undefined) {
      errors.push(`${label}.decision_id: required when safety policy is disabled`);
    }
    return;
  }

  if (entry.enabled !== true) return;

  if (!SEVERITIES.includes(entry.severity)) {
    errors.push(`${label}.severity: expected one of ${SEVERITIES.join(', ')}`);
  }
  if (!ROLLOUTS.includes(entry.rollout)) {
    errors.push(`${label}.rollout: expected one of ${ROLLOUTS.join(', ')}`);
  }
  if (entry.rollout === 'new-code-only') {
    errors.push(`${label}.rollout: new-code-only is reserved and not valid in v1`);
  }

  const implementation = entry.implementation || catalog.defaultImplementation;
  if (implementation !== 'auto') {
    errors.push(`${label}.implementation: unsupported in PR-2 skeleton (${implementation}); only auto is supported`);
  }

  if (entry.rollout === 'ratchet') {
    if (!Number.isInteger(entry.baseline) || entry.baseline < 0) {
      errors.push(`${label}.baseline: required non-negative integer for rollout: ratchet`);
    }
    if (!hasText(entry.reason)) errors.push(`${label}.reason: required for rollout: ratchet`);
  } else if ('baseline' in entry) {
    errors.push(`${label}.baseline: forbidden unless rollout is ratchet`);
  }

  if (entry.implementation !== undefined && entry.implementation !== 'auto' && !hasText(entry.reason)) {
    errors.push(`${label}.reason: required for non-auto implementation`);
  }

  const downgraded =
    SEVERITIES.includes(entry.severity) &&
    severityRank(entry.severity) < severityRank(catalog.defaultSeverity);
  if (downgraded && !hasText(entry.reason)) {
    errors.push(`${label}.reason: required when severity is below catalog default (${catalog.defaultSeverity})`);
  }
  if (entry.rollout && entry.rollout !== catalog.defaultRollout && !hasText(entry.reason)) {
    errors.push(`${label}.reason: required when rollout is not ${catalog.defaultRollout}`);
  }
  if (catalog.tier === 'safety' && downgraded && entry.decision_id === undefined) {
    errors.push(`${label}.decision_id: required when safety policy severity is downgraded`);
  }
}

function normalizePathList(values) {
  return [...new Set((values || []).map((value) => normalizeContractPath(value)))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function sourceFileGlob(root) {
  return `${normalizeContractPath(root)}/${SOURCE_EXT_GLOB}`;
}

function defaultFilesForPolicy(id, paths) {
  if (id === 'layer-boundaries') {
    return normalizePathList([sourceFileGlob(paths.api), sourceFileGlob(paths.screens), sourceFileGlob(paths.ui)]);
  }
  return normalizePathList([sourceFileGlob(paths.screens)]);
}

function emittedSeverityFor(policy) {
  if (policy.rollout !== 'ratchet') return policy.severity;
  return policy.severity === 'off' ? 'off' : 'warn';
}

export function buildLintGenModel(policy, { sourceLabel = CANONICAL_POLICY_SOURCE } = {}) {
  const errors = validateLintPolicy(policy);
  if (errors.length) {
    throw new LintPolicyContractError('lint policy contract failed', errors);
  }

  const paths = {
    api: normalizeContractPath(policy.defaults.paths.api),
    screens: normalizeContractPath(policy.defaults.paths.screens),
    ui: normalizeContractPath(policy.defaults.paths.ui),
  };

  const enabledPolicies = [];
  for (const id of POLICY_IDS) {
    const entry = policy.policies[id];
    if (!entry.enabled) continue;
    const catalog = POLICY_CATALOG[id];
    enabledPolicies.push({
      policy_id: id,
      tier: catalog.tier,
      rollout: entry.rollout,
      target_severity: entry.severity,
      emitted_severity: emittedSeverityFor(entry),
      implementation: entry.implementation || catalog.defaultImplementation,
      baseline: entry.rollout === 'ratchet' ? entry.baseline : undefined,
      files: normalizePathList(entry.include || defaultFilesForPolicy(id, paths)),
      ignores: normalizePathList(entry.exclude || []),
    });
  }

  return {
    source: sourceLabel,
    defaults: { paths },
    enabledPolicies,
  };
}

function stableClone(value) {
  if (Array.isArray(value)) return value.map(stableClone);
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      if (value[key] !== undefined) out[key] = stableClone(value[key]);
    }
    return out;
  }
  return value;
}

function stableJs(value, indent = 0) {
  return JSON.stringify(stableClone(value), null, 2)
    .split('\n')
    .map((line) => ' '.repeat(indent) + line)
    .join('\n');
}

function stableInlineJs(value) {
  return JSON.stringify(stableClone(value));
}

const HELPER_CODE = `function toWorkflowPosixPath(value) {
  return String(value || "").replace(/\\\\/g, "/");
}

function escapeWorkflowRegExp(value) {
  return String(value).replace(/[|\\\\{}()[\\]^$+?.]/g, "\\\\$&");
}

function workflowPathPatternToRegExp(pattern) {
  const source = String(pattern || "")
    .replace(/\\\\/g, "/")
    .replace(/^\\.\\/+/, "")
    .replace(/\\/+$/, "")
    .split("/")
    .map((segment) => escapeWorkflowRegExp(segment).replace(/\\*/g, "[^/]*"))
    .join("/");
  return new RegExp("^" + source + "(?:/|$)");
}

const workflowPathMatchers = {
  api: workflowPathPatternToRegExp(workflowPolicyDefaults.paths.api),
  screens: workflowPathPatternToRegExp(workflowPolicyDefaults.paths.screens),
  ui: workflowPathPatternToRegExp(workflowPolicyDefaults.paths.ui)
};

function workflowFilename(context) {
  return (
    context.physicalFilename ||
    context.filename ||
    (typeof context.getFilename === "function" ? context.getFilename() : "")
  );
}

function workflowRelativeFilename(context) {
  const file = toWorkflowPosixPath(workflowFilename(context));
  const cwd = toWorkflowPosixPath(process.cwd()).replace(/\\/+$/, "");
  if (file.startsWith(cwd + "/")) return file.slice(cwd.length + 1);
  return file.replace(/^\\/+/, "");
}

function workflowPathKind(relPath) {
  const normalized = toWorkflowPosixPath(relPath);
  for (const key of ["api", "screens", "ui"]) {
    if (workflowPathMatchers[key].test(normalized)) return key;
  }
  return null;
}

function workflowResolveImport(context, source) {
  if (typeof source !== "string" || !source) return null;
  const value = toWorkflowPosixPath(source);
  if (value.startsWith(".")) {
    const base = path.posix.dirname(workflowRelativeFilename(context));
    return path.posix.normalize(path.posix.join(base, value)).replace(/^\\.\\//, "");
  }
  if (value.startsWith("@/")) return "src/" + value.slice(2);
  return value.replace(/^\\.\\//, "");
}

function workflowJsxName(node) {
  if (!node) return "";
  if (node.type === "JSXIdentifier") return node.name;
  if (node.type === "JSXMemberExpression") return workflowJsxName(node.object) + "." + workflowJsxName(node.property);
  if (node.type === "JSXNamespacedName") return workflowJsxName(node.namespace) + ":" + workflowJsxName(node.name);
  return "";
}

function workflowIsObjectStyleExpression(node) {
  if (!node) return false;
  if (node.type === "ObjectExpression") return true;
  if (node.type === "ArrayExpression") {
    return node.elements.some((element) => workflowIsObjectStyleExpression(element));
  }
  return false;
}`;

const RULE_SNIPPETS = Object.freeze({
  'layer-boundaries': `  "layer-boundaries": {
    meta: {
      type: "problem",
      docs: { description: "Workflow API/UI/screen layers do not import upward across documented paths." },
      schema: []
    },
    create(context) {
      function checkImport(node) {
        const source = node.source && node.source.value;
        const target = workflowResolveImport(context, source);
        if (!target) return;

        const fromKind = workflowPathKind(workflowRelativeFilename(context));
        const toKind = workflowPathKind(target);
        if (!fromKind || !toKind) return;

        const apiViolation = fromKind === "api" && (toKind === "screens" || toKind === "ui");
        const uiViolation = fromKind === "ui" && (toKind === "screens" || toKind === "api");
        if (apiViolation || uiViolation) {
          context.report({
            node,
            message: "Workflow layer boundary violation: {{fromKind}} files must not import {{toKind}} layer files.",
            data: { fromKind, toKind }
          });
        }
      }
      return {
        ImportDeclaration: checkImport,
        ExportAllDeclaration: checkImport,
        ExportNamedDeclaration: checkImport
      };
    }
  }`,
  'no-adhoc-buttons': `  "no-adhoc-buttons": {
    meta: {
      type: "suggestion",
      docs: { description: "Workflow screens prefer catalogued UI button components over ad hoc controls." },
      schema: []
    },
    create(context) {
      const blocked = new Set(["button", "Pressable", "TouchableHighlight", "TouchableOpacity", "TouchableWithoutFeedback"]);
      return {
        JSXOpeningElement(node) {
          const name = workflowJsxName(node.name);
          if (blocked.has(name)) {
            context.report({
              node,
              message: "Use a catalogued UI button/pressable component instead of an ad hoc {{name}} in workflow screens.",
              data: { name }
            });
          }
        }
      };
    }
  }`,
  'no-arbitrary-style-values': `  "no-arbitrary-style-values": {
    meta: {
      type: "suggestion",
      docs: { description: "Workflow screens avoid ad hoc inline style object values when local tokens/components exist." },
      schema: []
    },
    create(context) {
      return {
        JSXAttribute(node) {
          if (workflowJsxName(node.name) !== "style") return;
          const expression = node.value && node.value.type === "JSXExpressionContainer" ? node.value.expression : null;
          if (workflowIsObjectStyleExpression(expression)) {
            context.report({
              node,
              message: "Avoid arbitrary inline style object values in workflow screens; prefer local tokens or catalogued components."
            });
          }
        }
      };
    }
  }`,
  'no-fetch-in-screens': `  "no-fetch-in-screens": {
    meta: {
      type: "problem",
      docs: { description: "Workflow screens do not call raw fetch or axios directly." },
      schema: []
    },
    create(context) {
      function report(node) {
        context.report({
          node,
          message: "Screens must route data access through approved API/query/state layers instead of raw fetch or axios."
        });
      }
      return {
        ImportDeclaration(node) {
          if (node.source && node.source.value === "axios") report(node);
        },
        CallExpression(node) {
          const callee = node.callee;
          if (callee && callee.type === "Identifier" && (callee.name === "fetch" || callee.name === "axios")) report(node);
          if (
            callee &&
            callee.type === "MemberExpression" &&
            callee.object &&
            callee.object.type === "Identifier" &&
            callee.object.name === "axios"
          ) {
            report(node);
          }
        }
      };
    }
  }`,
});

function renderPolicyConfig(policy) {
  const lines = [
    '  {',
    `    name: "frontend-workflow/${policy.policy_id}",`,
    `    files: ${stableInlineJs(policy.files)},`,
  ];
  if (policy.ignores.length) lines.push(`    ignores: ${stableInlineJs(policy.ignores)},`);
  lines.push(
    '    rules: {',
    `      "frontend-workflow/${policy.policy_id}": "${policy.emitted_severity}"`,
    '    }',
    '  }',
  );
  return lines.join('\n');
}

export function renderWorkflowConfig(model) {
  const enabled = model.enabledPolicies.slice().sort((a, b) => a.policy_id.localeCompare(b.policy_id));
  const lines = [generatedBanner(model.source), ''];

  if (!enabled.length) {
    lines.push('export default [];', '');
    return normalizeLineEndings(lines.join('\n'));
  }

  const metadata = {};
  for (const policy of enabled) {
    metadata[policy.policy_id] = {
      baseline: policy.baseline,
      emitted_severity: policy.emitted_severity,
      files: policy.files,
      ignores: policy.ignores,
      implementation: policy.implementation,
      rollout: policy.rollout,
      target_severity: policy.target_severity,
      tier: policy.tier,
    };
  }

  lines.push(
    'import path from "node:path";',
    '',
    `const workflowPolicyDefaults = ${stableJs(model.defaults)};`,
    '',
    `const workflowPolicyMetadata = ${stableJs(metadata)};`,
    '',
    HELPER_CODE,
    '',
    'const workflowRules = {',
    enabled.map((policy) => RULE_SNIPPETS[policy.policy_id]).join(',\n'),
    '};',
    '',
    'const frontendWorkflowPlugin = {',
    '  rules: workflowRules',
    '};',
    '',
    'export { workflowPolicyMetadata };',
    '',
    'export default [',
    '  {',
    '    name: "frontend-workflow/plugin",',
    '    plugins: {',
    '      "frontend-workflow": frontendWorkflowPlugin',
    '    }',
    '  },',
    enabled.map(renderPolicyConfig).join(',\n'),
    '];',
    '',
  );

  return normalizeLineEndings(lines.join('\n'));
}

export function renderLintPolicyConfig(policy, opts = {}) {
  return renderWorkflowConfig(buildLintGenModel(policy, opts));
}

export function firstTextDiff(expected, actual) {
  const a = normalizeLineEndings(expected).split('\n');
  const b = normalizeLineEndings(actual).split('\n');
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return `line ${i + 1}: expected ${JSON.stringify(a[i] ?? '<missing>')} actual ${JSON.stringify(b[i] ?? '<missing>')}`;
    }
  }
  return null;
}
