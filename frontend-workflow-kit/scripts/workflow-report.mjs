#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const intentIndex = argv.indexOf('--intent');
const visual = intentIndex >= 0 && argv[intentIndex + 1] === 'visual-refresh';
const target = path.join(here, visual ? 'workflow-report-visual.mjs' : 'workflow-report-legacy.mjs');
const result = spawnSync(process.execPath, [target, ...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) {
  process.stderr.write(`workflow:report: ${result.error.message}\n`);
  process.exitCode = 2;
} else {
  process.exitCode = result.status == null ? 2 : result.status;
}
