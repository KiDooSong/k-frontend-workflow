#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isCliEntry, parseArgs } from './lib/util.mjs';
import { enforceCliFlagContract } from './lib/cli-args.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function main() {
  const argv = process.argv.slice(2);
  const parsed = parseArgs(argv);
  const visualValueFlags = new Set(['intent', 'input', 'path', 'root', 'policy', 'manifest', 'ci', 'range', 'base']);
  const visualBooleanFlags = new Set(['staged']);
  const hasVisualTuple =
    Object.keys(parsed.flags).some((key) => visualValueFlags.has(key) || visualBooleanFlags.has(key));

  if (hasVisualTuple) {
    enforceCliFlagContract({
      argv,
      flags: parsed.flags,
      positionals: parsed.positionals,
      valueFlags: new Set([
        'packet', 'out', 'docs', 'src', 'layout', 'diff', 'review', 'date', 'seq',
        ...visualValueFlags,
      ]),
      booleanFlags: new Set(['h', 'help', 'json', 'skip-tests', ...visualBooleanFlags]),
      tool: 'workflow:report',
      helpCommand: 'npm run workflow:report --',
    });
    if (parsed.flags.intent !== 'visual-refresh') {
      process.stderr.write('workflow:report: visual tuple flags require --intent visual-refresh\n');
      process.exitCode = 2;
      return;
    }
  }

  const visual = parsed.flags.intent === 'visual-refresh';
  const target = path.join(here, visual ? 'workflow-report-visual.mjs' : 'workflow-report-legacy.mjs');
  // No intermediary stdout/stderr buffers: preserve the direct CLI's output at any
  // size, including no-intent Markdown reports larger than spawnSync's maxBuffer.
  const result = spawnSync(process.execPath, [target, ...argv], { stdio: 'inherit' });
  if (result.error) {
    process.stderr.write(`workflow:report: ${result.error.message}\n`);
    process.exitCode = 2;
    return;
  }
  if (result.signal) {
    process.kill(process.pid, result.signal);
    return;
  }
  process.exitCode = result.status ?? 2;
}

if (isCliEntry(import.meta.url)) main();
