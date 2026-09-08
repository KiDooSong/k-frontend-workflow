#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isCliEntry, parseArgs } from './lib/util.mjs';
import { runVisualCliSafely, runVisualReadinessCli } from './lib/visual-refresh-cli.mjs';

export * from './readiness-legacy.mjs';

const LEGACY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'readiness-legacy.mjs');

function delegateLegacy(argv) {
  const child = spawnSync(process.execPath, [LEGACY, ...argv], {
    stdio: 'inherit',
    env: process.env,
  });
  if (child.error) {
    process.stderr.write(`readiness: ${child.error.message}\n`);
    process.exitCode = 2;
    return;
  }
  if (child.signal) {
    process.kill(process.pid, child.signal);
    return;
  }
  process.exitCode = child.status ?? 2;
}

function main() {
  const argv = process.argv.slice(2);
  const { flags } = parseArgs(argv);
  if (!Object.prototype.hasOwnProperty.call(flags, 'intent')) {
    if (Object.prototype.hasOwnProperty.call(flags, 'input')) {
      process.stderr.write('readiness: --input requires --intent visual-refresh\n');
      process.exitCode = 2;
      return;
    }
    delegateLegacy(argv);
    return;
  }
  runVisualCliSafely(() => runVisualReadinessCli(argv), 'readiness');
}

if (isCliEntry(import.meta.url)) main();
