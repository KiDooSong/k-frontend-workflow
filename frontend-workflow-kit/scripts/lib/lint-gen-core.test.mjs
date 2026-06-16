import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildLintGenModel,
  LintPolicyContractError,
  parseLintPolicyYaml,
  renderWorkflowConfig,
} from './lint-gen-core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = path.resolve(HERE, '..', '..');
const CLI = path.join(KIT_ROOT, 'scripts', 'lint-gen.mjs');
const FIXTURE = path.join(
  KIT_ROOT,
  'examples',
  'lint-gen',
  'basic-policy',
  'docs',
  'frontend-workflow',
  '_meta',
  'lint-policy.yaml',
);
const GENERATED_FIXTURE = path.join(KIT_ROOT, 'examples', 'lint-gen', 'basic-policy', 'eslint.workflow.config.mjs');

function basePolicy() {
  return {
    version: 1,
    defaults: {
      paths: {
        screens: 'src/features/*/screens',
        api: 'src/api',
        ui: 'src/components/ui',
      },
    },
    policies: {
      'layer-boundaries': {
        enabled: true,
        severity: 'error',
        rollout: 'all',
        implementation: 'auto',
      },
      'no-fetch-in-screens': {
        enabled: true,
        severity: 'error',
        rollout: 'all',
        implementation: 'auto',
      },
      'no-adhoc-buttons': {
        enabled: true,
        severity: 'warn',
        rollout: 'all',
        implementation: 'auto',
      },
      'no-arbitrary-style-values': {
        enabled: true,
        severity: 'warn',
        rollout: 'all',
        implementation: 'auto',
      },
    },
  };
}

async function loadGeneratedRules() {
  const mod = await import(pathToFileURL(GENERATED_FIXTURE).href + `?t=${Date.now()}`);
  return mod.default[0].plugins['frontend-workflow'].rules;
}

async function loadRulesForPolicy(policy, t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-gen-rules-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const out = path.join(tmp, 'eslint.workflow.config.mjs');
  fs.writeFileSync(out, renderWorkflowConfig(buildLintGenModel(policy)), 'utf8');
  const mod = await import(pathToFileURL(out).href + `?t=${Date.now()}`);
  return mod.default[0].plugins['frontend-workflow'].rules;
}

function projectFile(relPath) {
  return path.join(process.cwd(), relPath);
}

function runRuleVisitor(rule, visitorName, node, filename) {
  const reports = [];
  const context = {
    physicalFilename: filename,
    filename,
    getFilename: () => filename,
    report: (descriptor) => reports.push(descriptor),
  };
  const visitors = rule.create(context);
  visitors[visitorName](node);
  return reports;
}

function runNpm(args) {
  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], {
      cwd: KIT_ROOT,
      encoding: 'utf8',
    });
  }
  return spawnSync('npm', args, {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
}

test('fixture: disabled policies are omitted and ratchet emits warn/report-only', () => {
  const policy = parseLintPolicyYaml(fs.readFileSync(FIXTURE, 'utf8'), 'fixture');
  const model = buildLintGenModel(policy, { sourceLabel: 'docs/frontend-workflow/_meta/lint-policy.yaml' });
  assert.deepEqual(
    model.enabledPolicies.map((p) => p.policy_id),
    ['layer-boundaries', 'no-arbitrary-style-values', 'no-fetch-in-screens'],
  );

  const text = renderWorkflowConfig(model);
  assert.equal(text.includes('no-adhoc-buttons'), false);
  assert.match(text, /"frontend-workflow\/layer-boundaries": "error"/);
  assert.match(text, /"frontend-workflow\/no-arbitrary-style-values": "warn"/);
  assert.match(text, /"frontend-workflow\/no-fetch-in-screens": "warn"/);
  assert.match(text, /"target_severity": "error"/);
  assert.match(text, /"baseline": 3/);
});

test('rollout all preserves policy severity', () => {
  const policy = basePolicy();
  const model = buildLintGenModel(policy);
  const byId = Object.fromEntries(model.enabledPolicies.map((p) => [p.policy_id, p]));
  assert.equal(byId['layer-boundaries'].target_severity, 'error');
  assert.equal(byId['layer-boundaries'].emitted_severity, 'error');
  assert.equal(byId['no-adhoc-buttons'].target_severity, 'warn');
  assert.equal(byId['no-adhoc-buttons'].emitted_severity, 'warn');
});

test('stable policy and glob ordering make repeated renders byte-identical', () => {
  const policy = basePolicy();
  policy.policies['no-fetch-in-screens'].include = [
    'src/features/z/screens/**/*.{ts,tsx}',
    'src/features/a/screens/**/*.{ts,tsx}',
  ];
  policy.policies['no-fetch-in-screens'].exclude = [
    'src/features/z/screens/legacy/**/*',
    'src/features/a/screens/generated/**/*',
  ];

  const first = renderWorkflowConfig(buildLintGenModel(policy));
  const second = renderWorkflowConfig(buildLintGenModel(policy));
  assert.equal(first, second);

  const noFetch = buildLintGenModel(policy).enabledPolicies.find((p) => p.policy_id === 'no-fetch-in-screens');
  assert.deepEqual(noFetch.files, [
    'src/features/a/screens/**/*.{ts,tsx}',
    'src/features/z/screens/**/*.{ts,tsx}',
  ]);
  assert.deepEqual(noFetch.ignores, [
    'src/features/a/screens/generated/**/*',
    'src/features/z/screens/legacy/**/*',
  ]);
});

test('CLI --check exits 0 for identical output and 1 for drift', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-gen-cli-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const docs = path.join(tmp, 'docs', 'frontend-workflow');
  const meta = path.join(docs, '_meta');
  fs.mkdirSync(meta, { recursive: true });
  fs.copyFileSync(FIXTURE, path.join(meta, 'lint-policy.yaml'));
  const out = path.join(tmp, 'eslint.workflow.config.mjs');

  const gen = spawnSync(process.execPath, [CLI, '--docs', docs, '--out', out], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(gen.status, 0, gen.stderr);
  assert.equal(fs.existsSync(out), true);

  const syntax = spawnSync(process.execPath, ['--check', out], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(syntax.status, 0, syntax.stderr);

  const checkOk = spawnSync(process.execPath, [CLI, '--docs', docs, '--out', out, '--check'], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(checkOk.status, 0, checkOk.stderr);

  fs.writeFileSync(out, fs.readFileSync(out, 'utf8').replace(/\n/g, '\r\n'), 'utf8');
  const checkCrlf = spawnSync(process.execPath, [CLI, '--docs', docs, '--out', out, '--check', '--json'], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(checkCrlf.status, 1, checkCrlf.stdout + checkCrlf.stderr);
  assert.match(checkCrlf.stdout, /line endings differ/);

  const regen = spawnSync(process.execPath, [CLI, '--docs', docs, '--out', out], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(regen.status, 0, regen.stderr);

  fs.appendFileSync(out, '\n// drift\n', 'utf8');
  const checkDrift = spawnSync(process.execPath, [CLI, '--docs', docs, '--out', out, '--check'], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(checkDrift.status, 1, checkDrift.stdout + checkDrift.stderr);
});

test('package workflow:lint-gen smoke: default fixture path supports --check', () => {
  const r = runNpm(['run', 'workflow:lint-gen', '--', '--check']);
  assert.equal(r.status, 0, (r.error && r.error.message) || r.stdout + r.stderr);
});

test('generated config declares fragment/parser ownership contract', () => {
  const text = fs.readFileSync(GENERATED_FIXTURE, 'utf8');
  assert.match(text, /Workflow lint fragment: append this flat-config array after the project ESLint flat config/);
  assert.match(text, /Parser and languageOptions remain project-owned/);
});

test('generated rule semantics: screen fetch reports, layer direction is enforced', async () => {
  const rules = await loadGeneratedRules();

  const fetchReports = runRuleVisitor(
    rules['no-fetch-in-screens'],
    'CallExpression',
    { callee: { type: 'Identifier', name: 'fetch' } },
    projectFile('src/features/shop/screens/Home.tsx'),
  );
  assert.equal(fetchReports.length, 1);

  const apiToScreenReports = runRuleVisitor(
    rules['layer-boundaries'],
    'ImportDeclaration',
    { source: { value: '../features/shop/screens/Home' } },
    projectFile('src/api/client.ts'),
  );
  assert.equal(apiToScreenReports.length, 1);

  const screenToApiReports = runRuleVisitor(
    rules['layer-boundaries'],
    'ImportDeclaration',
    { source: { value: '../../../api/client' } },
    projectFile('src/features/shop/screens/Home.tsx'),
  );
  assert.equal(screenToApiReports.length, 0);
});

test('generated rule semantics: JSX button and inline style object report', async (t) => {
  const rules = await loadRulesForPolicy(basePolicy(), t);
  const filename = projectFile('src/features/shop/screens/Home.tsx');

  const buttonReports = runRuleVisitor(
    rules['no-adhoc-buttons'],
    'JSXOpeningElement',
    { name: { type: 'JSXIdentifier', name: 'button' } },
    filename,
  );
  assert.equal(buttonReports.length, 1);

  const styleReports = runRuleVisitor(
    rules['no-arbitrary-style-values'],
    'JSXAttribute',
    {
      name: { type: 'JSXIdentifier', name: 'style' },
      value: { type: 'JSXExpressionContainer', expression: { type: 'ObjectExpression', properties: [] } },
    },
    filename,
  );
  assert.equal(styleReports.length, 1);
});

test('exclude globs are emitted as flat-config ignores for ESLint suppression', () => {
  const policy = basePolicy();
  policy.policies['no-fetch-in-screens'].exclude = ['src/features/shop/screens/generated/**/*'];
  const text = renderWorkflowConfig(buildLintGenModel(policy));
  assert.match(text, /ignores: \["src\/features\/shop\/screens\/generated\/\*\*\/\*"\]/);
});

test('unsupported enabled implementation fails closed with exit-code-1 contract', () => {
  const policy = basePolicy();
  policy.policies['layer-boundaries'].implementation = 'dep-cruiser';
  policy.policies['layer-boundaries'].reason = 'Testing unsupported implementation.';

  assert.throws(
    () => buildLintGenModel(policy),
    (err) => {
      assert.ok(err instanceof LintPolicyContractError);
      assert.equal(err.exitCode, 1);
      assert.match(err.details.join('\n'), /schema v1 preserves future implementation vocabulary/);
      assert.match(err.details.join('\n'), /dep-cruiser unsupported/);
      return true;
    },
  );
});

test('defaults.paths use PR-2 simple path pattern subset, not recursive glob semantics', () => {
  const policy = basePolicy();
  policy.defaults.paths.screens = 'src/**/screens';
  assert.throws(
    () => buildLintGenModel(policy),
    (err) => {
      assert.ok(err instanceof LintPolicyContractError);
      assert.match(err.details.join('\n'), /simple \* segments only/);
      return true;
    },
  );
});

test('malformed policy YAML is a policy contract failure', () => {
  assert.throws(
    () => parseLintPolicyYaml('version: 1\npolicies:\n  - [', 'malformed'),
    (err) => {
      assert.ok(err instanceof LintPolicyContractError);
      assert.equal(err.exitCode, 1);
      assert.match(err.message, /YAML parse failed/);
      return true;
    },
  );
});
