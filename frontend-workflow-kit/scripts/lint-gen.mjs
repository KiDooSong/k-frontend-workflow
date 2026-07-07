#!/usr/bin/env node
import path from 'node:path';
import { parseArgs, readFileSafe, writeFile, isCliEntry } from './lib/util.mjs';
import {
  buildLintGenModel,
  firstTextDiff,
  LintPolicyContractError,
  normalizeLineEndings,
  parseLintPolicyYaml,
  renderWorkflowConfig,
  toPosixPath,
} from './lib/lint-gen-core.mjs';

class LintGenInvocationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LintGenInvocationError';
    this.exitCode = 2;
  }
}

function helpText() {
  return `workflow:lint-gen — generate deterministic eslint.workflow.config.mjs from lint-policy.yaml

Usage:
  node scripts/lint-gen.mjs [--docs <path>] [--out <path>] [--check] [--json]

Options:
  --docs <path>  Docs root. Default: docs/frontend-workflow
  --out <path>   Output file. Default: <projectRoot>/eslint.workflow.config.mjs
  --check        Compare output without writing. Exit 1 on drift.
  --json         Print a machine-readable summary.
  --help         Show this help.

Exit codes:
  0  Generated successfully, or --check matched.
  1  Policy/schema/support contract failure, or --check drift.
  2  Invocation, filesystem, or toolchain error.
`;
}

function booleanFlag(flags, name) {
  if (!(name in flags)) return false;
  if (flags[name] !== true) throw new LintGenInvocationError(`--${name} does not take a value`);
  return true;
}

function stringFlag(flags, name, fallback) {
  if (!(name in flags)) return fallback;
  if (typeof flags[name] !== 'string' || !flags[name]) {
    throw new LintGenInvocationError(`--${name} requires a path value`);
  }
  return flags[name];
}

function inferProjectRoot(docsDir) {
  const normalized = toPosixPath(path.resolve(docsDir));
  if (normalized.endsWith('/docs/frontend-workflow')) {
    return path.resolve(docsDir, '..', '..');
  }
  return process.cwd();
}

function rel(cwd, absPath) {
  const relative = path.relative(cwd, absPath) || '.';
  return toPosixPath(relative);
}

function parseCli(argv) {
  const { flags, positionals } = parseArgs(argv);
  const allowed = new Set(['check', 'docs', 'help', 'json', 'out']);
  for (const key of Object.keys(flags)) {
    if (!allowed.has(key)) throw new LintGenInvocationError(`unknown option: --${key}`);
  }
  if (positionals.length) {
    throw new LintGenInvocationError(`unexpected positional argument: ${positionals[0]}`);
  }

  const help = booleanFlag(flags, 'help');
  const json = booleanFlag(flags, 'json');
  const check = booleanFlag(flags, 'check');
  const docsArg = stringFlag(flags, 'docs', 'docs/frontend-workflow');
  const docsDir = path.resolve(docsArg);
  const projectRoot = inferProjectRoot(docsDir);
  const outArg = stringFlag(flags, 'out', path.join(projectRoot, 'eslint.workflow.config.mjs'));

  return {
    check,
    docsDir,
    help,
    json,
    outPath: path.resolve(outArg),
    projectRoot,
  };
}

function loadPolicy(policyPath, sourceLabel) {
  const raw = readFileSafe(policyPath);
  if (raw == null) {
    throw new LintGenInvocationError(`policy file not found: ${policyPath}`);
  }
  return parseLintPolicyYaml(raw, sourceLabel);
}

function summarizePolicies(model) {
  return model.enabledPolicies.map((policy) => ({
    policy_id: policy.policy_id,
    rollout: policy.rollout,
    target_severity: policy.target_severity,
    emitted_severity: policy.emitted_severity,
    files: policy.files,
    ignores: policy.ignores,
  }));
}

function runLintGen(options) {
  const policyPath = path.join(options.docsDir, '_meta', 'lint-policy.yaml');
  const sourceLabel = rel(options.projectRoot, policyPath);
  const outputLabel = rel(process.cwd(), options.outPath);
  const policy = loadPolicy(policyPath, sourceLabel);
  const model = buildLintGenModel(policy, { sourceLabel });
  const text = renderWorkflowConfig(model);

  const existing = readFileSafe(options.outPath);
  const unchanged = existing === text;
  const lineEndingOnlyDrift = existing != null && !unchanged && normalizeLineEndings(existing) === text;
  if (options.check) {
    if (existing == null) {
      const err = new LintPolicyContractError('--check failed: output file is missing', [
        `${outputLabel}: missing generated output`,
      ]);
      err.summary = { status: 'missing-output' };
      throw err;
    }
    if (lineEndingOnlyDrift) {
      const err = new LintPolicyContractError('--check failed: generated output line endings drifted', [
        `${outputLabel}: line endings differ; generated workflow config must be LF-only`,
      ]);
      err.summary = { status: 'line-ending-drift' };
      throw err;
    }
    if (!unchanged) {
      const diff = firstTextDiff(text, existing);
      const err = new LintPolicyContractError('--check failed: generated output drifted', [
        diff || `${outputLabel}: content differs`,
      ]);
      err.summary = { status: 'drift' };
      throw err;
    }
    return {
      ok: true,
      check: true,
      output: outputLabel,
      policy_source: sourceLabel,
      status: 'unchanged',
      policies: summarizePolicies(model),
    };
  }

  if (!unchanged) writeFile(options.outPath, text);
  return {
    ok: true,
    check: false,
    output: outputLabel,
    policy_source: sourceLabel,
    status: unchanged ? 'unchanged' : 'wrote',
    policies: summarizePolicies(model),
  };
}

function emitJson(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function main() {
  let options;
  try {
    options = parseCli(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`workflow:lint-gen — ${err.message}\n`);
    process.exit(2);
  }

  if (options.help) {
    process.stdout.write(helpText());
    return;
  }

  try {
    const summary = runLintGen(options);
    if (options.json) {
      emitJson(summary);
    } else {
      process.stdout.write(
        `workflow:lint-gen — ${summary.status}\n` +
          `  source ${summary.policy_source}\n` +
          `  output ${summary.output}\n` +
          `  policies ${summary.policies.length}\n`,
      );
    }
  } catch (err) {
    const exitCode = err.exitCode === 1 || err.exitCode === 2 ? err.exitCode : 2;
    const details = Array.isArray(err.details) ? err.details : [];
    if (options.json) {
      emitJson({
        ok: false,
        exit_code: exitCode,
        error: err.message,
        details,
        status: err.summary && err.summary.status,
      });
    } else {
      process.stderr.write(`workflow:lint-gen — ${err.message}\n`);
      for (const detail of details) process.stderr.write(`  - ${detail}\n`);
    }
    process.exit(exitCode);
  }
}

if (isCliEntry(import.meta.url)) main();
