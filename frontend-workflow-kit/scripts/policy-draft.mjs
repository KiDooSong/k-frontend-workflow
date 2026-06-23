#!/usr/bin/env node
// policy-draft.mjs - write review-only implementation-mode-policy draft outputs.
import { pathToFileURL } from 'node:url';
import { KIT_ROOT, parseArgs, runCli } from './lib/util.mjs';
import { formatPolicyDraftResult, writePolicyDraftArtifacts } from './lib/policy-draft.mjs';

const STRING_FLAGS = new Set(['layout', 'policy', 'out', 'date']);

function cliError(message) {
  process.stderr.write(`workflow:policy-draft: ${message}\n`);
  process.exit(2);
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  for (const key of STRING_FLAGS) {
    if (flags[key] === true || flags[key] === '') cliError(`--${key} requires a value`);
  }
  if (typeof flags.out !== 'string') cliError('--out requires a value');

  const result = writePolicyDraftArtifacts({
    kitRoot: KIT_ROOT,
    layoutPath: typeof flags.layout === 'string' ? flags.layout : undefined,
    policyPath: typeof flags.policy === 'string' ? flags.policy : undefined,
    outDir: flags.out,
    date: typeof flags.date === 'string' ? flags.date : undefined,
    cwd: process.cwd(),
  });

  if (flags.json) {
    process.stdout.write(
      JSON.stringify(
        {
          draft: result.paths.draft,
          migration: result.paths.migration,
          changed_mode_access_rows: result.diff.changed_mode_access_rows.length,
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    process.stdout.write(formatPolicyDraftResult(result, { cwd: process.cwd() }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(main, 'workflow:policy-draft');
}
