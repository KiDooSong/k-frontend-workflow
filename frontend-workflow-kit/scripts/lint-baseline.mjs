#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, readFileSafe } from './lib/util.mjs';
import { buildLintGenModel, LintPolicyContractError, parseLintPolicyYaml, toPosixPath } from './lib/lint-gen-core.mjs';
import { buildLintBaselineReport, parseLintCountsJson } from './lib/lint-baseline-core.mjs';

class LintBaselineInvocationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LintBaselineInvocationError';
    this.exitCode = 2;
  }
}

function helpText() {
  return `workflow:lint-baseline — compare ratchet baselines with measured lint counts

Usage:
  node scripts/lint-baseline.mjs [--docs <path>] [--counts <path>] [--enforce] [--json]

Options:
  --docs <path>    Docs root. Default: docs/frontend-workflow
  --counts <path>  Current measured counts JSON. Default: <docs>/_meta/lint-counts.json
  --enforce        Exit 1 when current count is higher than baseline.
  --json           Print a machine-readable summary.
  --help           Show this help.

Exit codes:
  0  Contract valid; includes warning-first ratchet increases without --enforce.
  1  Policy/counts contract failure, or ratchet increase with --enforce.
  2  Invocation, filesystem, or toolchain error.
`;
}

function booleanFlag(flags, name) {
  if (!(name in flags)) return false;
  if (flags[name] !== true) throw new LintBaselineInvocationError(`--${name} does not take a value`);
  return true;
}

function stringFlag(flags, name, fallback) {
  if (!(name in flags)) return fallback;
  if (typeof flags[name] !== 'string' || !flags[name]) {
    throw new LintBaselineInvocationError(`--${name} requires a path value`);
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
  const allowed = new Set(['counts', 'docs', 'enforce', 'help', 'json']);
  for (const key of Object.keys(flags)) {
    if (!allowed.has(key)) throw new LintBaselineInvocationError(`unknown option: --${key}`);
  }
  if (positionals.length) {
    throw new LintBaselineInvocationError(`unexpected positional argument: ${positionals[0]}`);
  }

  const help = booleanFlag(flags, 'help');
  const json = booleanFlag(flags, 'json');
  const enforce = booleanFlag(flags, 'enforce');
  const docsArg = stringFlag(flags, 'docs', 'docs/frontend-workflow');
  const docsDir = path.resolve(docsArg);
  const countsArg = stringFlag(flags, 'counts', path.join(docsDir, '_meta', 'lint-counts.json'));
  const projectRoot = inferProjectRoot(docsDir);

  return {
    countsPath: path.resolve(countsArg),
    docsDir,
    enforce,
    help,
    json,
    projectRoot,
  };
}

function loadPolicy(policyPath, sourceLabel) {
  const raw = readFileSafe(policyPath);
  if (raw == null) {
    throw new LintBaselineInvocationError(`policy file not found: ${policyPath}`);
  }
  return parseLintPolicyYaml(raw, sourceLabel);
}

function loadCounts(countsPath, sourceLabel) {
  const raw = readFileSafe(countsPath);
  if (raw == null) {
    throw new LintPolicyContractError('lint baseline counts contract failed', [
      `${sourceLabel}: required current counts file for rollout: ratchet`,
    ]);
  }
  return parseLintCountsJson(raw, sourceLabel);
}

function runLintBaseline(options) {
  const policyPath = path.join(options.docsDir, '_meta', 'lint-policy.yaml');
  const policySource = rel(options.projectRoot, policyPath);
  const countsSource = rel(options.projectRoot, options.countsPath);
  const policy = loadPolicy(policyPath, policySource);
  const model = buildLintGenModel(policy, { sourceLabel: policySource });
  const hasRatchet = model.enabledPolicies.some((entry) => entry.rollout === 'ratchet');
  const counts = hasRatchet ? loadCounts(options.countsPath, countsSource) : { version: 1, counts: {} };
  const report = buildLintBaselineReport(model, counts);

  return {
    ...report,
    enforce: options.enforce,
    exit_code: options.enforce && report.status === 'increase' ? 1 : 0,
    mode: options.enforce ? 'enforce' : 'warning-first',
    policy_source: policySource,
    counts_source: hasRatchet ? countsSource : null,
  };
}

function emitJson(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function formatResult(result) {
  const sign = result.delta > 0 ? '+' : '';
  return (
    `  - ${result.policy_id}: ${result.status} ` +
    `(current ${result.current}, baseline ${result.baseline}, delta ${sign}${result.delta})`
  );
}

function main() {
  let options;
  try {
    options = parseCli(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`workflow:lint-baseline — ${err.message}\n`);
    process.exit(2);
  }

  if (options.help) {
    process.stdout.write(helpText());
    return;
  }

  try {
    const summary = runLintBaseline(options);
    if (options.json) {
      emitJson(summary);
    } else {
      process.stdout.write(
        `workflow:lint-baseline — ${summary.status}\n` +
          `  mode ${summary.mode}\n` +
          `  source ${summary.policy_source}\n` +
          `  counts ${summary.counts_source || '(not required)'}\n` +
          `  ratchet policies ${summary.ratchet_policy_count}\n`,
      );
      for (const result of summary.results) process.stdout.write(`${formatResult(result)}\n`);
      if (summary.status === 'increase' && !summary.enforce) {
        process.stdout.write('  warning ratchet increased; default mode remains exit 0. Use --enforce to fail.\n');
      }
    }
    process.exit(summary.exit_code);
  } catch (err) {
    const exitCode = err.exitCode === 1 || err.exitCode === 2 ? err.exitCode : 2;
    const details = Array.isArray(err.details) ? err.details : [];
    if (options.json) {
      emitJson({
        ok: false,
        exit_code: exitCode,
        error: err.message,
        details,
      });
    } else {
      process.stderr.write(`workflow:lint-baseline — ${err.message}\n`);
      for (const detail of details) process.stderr.write(`  - ${detail}\n`);
    }
    process.exit(exitCode);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
