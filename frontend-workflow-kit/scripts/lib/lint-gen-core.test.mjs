import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

  fs.appendFileSync(out, '\n// drift\n', 'utf8');
  const checkDrift = spawnSync(process.execPath, [CLI, '--docs', docs, '--out', out, '--check'], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(checkDrift.status, 1, checkDrift.stdout + checkDrift.stderr);
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
      assert.match(err.details.join('\n'), /unsupported.*dep-cruiser/);
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
