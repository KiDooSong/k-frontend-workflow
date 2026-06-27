#!/usr/bin/env node
// workflow:create-screen - scaffold a stub ScreenSpec from a confirmed canonical identity.
//
// Canonical identity (screen_id / route / domain / screen-spec path) is workflow-owned.
// Source ids (planning/design codes, Figma node ids, slugs, input ids) are aliases that
// live in the Screen Source Map — this command does not resolve mapping, invent ids,
// update navigation-map, resolve Open Decisions, or promote status to confirmed.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULTS, runCli } from './lib/util.mjs';
import { ScreenScaffoldError, writeScreenSpec } from './lib/screen-scaffold.mjs';

const REPEAT_FLAGS = new Set(['source']);
const VALUE_FLAGS = new Set([
  'docs',
  'domain',
  'screen-id',
  'screen-slug',
  'route',
  'route-entry',
  'screen-entry',
  'title',
  'source-input',
  'date',
  ...REPEAT_FLAGS,
]);
const BOOLEAN_FLAGS = new Set(['help', 'json', 'dry-run', 'overwrite', 'frontmatter-only']);
const KNOWN_FLAGS = new Set([...VALUE_FLAGS, ...BOOLEAN_FLAGS]);

function cliError(message) {
  process.stderr.write(`workflow:create-screen: ${message}\n`);
  process.exit(2);
}

function parseScreenArgs(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    if (!KNOWN_FLAGS.has(key)) cliError(`unknown flag: --${key}`);
    if (BOOLEAN_FLAGS.has(key) && eq !== -1) {
      cliError(`--${key} does not accept a value; use bare --${key} to enable it`);
    }
    let value = eq === -1 ? undefined : arg.slice(eq + 1);
    if (value === undefined && VALUE_FLAGS.has(key)) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) cliError(`--${key} requires a value`);
      value = next;
      i++;
    } else if (value === undefined) {
      value = true;
    }

    if (REPEAT_FLAGS.has(key)) {
      if (!flags[key]) flags[key] = [];
      flags[key].push(value);
    } else {
      flags[key] = value;
    }
  }
  return { flags, positionals };
}

function booleanFlag(flags, key) {
  const value = flags[key];
  if (value === undefined) return false;
  if (value === true) return true;
  cliError(`--${key} does not accept a value; use bare --${key} to enable it`);
}

function help() {
  return `workflow:create-screen

Scaffold a stub ScreenSpec from a confirmed canonical identity.
Writes docs/frontend-workflow/domains/{domain}/screens/{screen-slug}/screen-spec.md.

Required: --domain, --screen-id, --route
Optional: --screen-slug (default: derived from --screen-id), --route-entry, --screen-entry,
          --title, --source-input <input_id>, --source "type:ref" (repeatable), --date YYYY-MM-DD,
          --frontmatter-only, --overwrite, --dry-run, --json

Example:
  node scripts/create-screen.mjs \\
    --docs docs/frontend-workflow \\
    --domain auth \\
    --screen-id AUTH-SIGNUP-EMAIL \\
    --screen-slug signup-email \\
    --route /signup/email \\
    --title "Signup Email" \\
    --source-input IN-20260625-visual-spec-001

This command never invents canonical screen ids, updates navigation-map, resolves Open
Decisions, or promotes status to confirmed. Resolve source-id mapping in the Screen Source
Map / reconcile-input first; only scaffold once canonical identity is known.
`;
}

function main() {
  const { flags, positionals } = parseScreenArgs(process.argv.slice(2));
  if (booleanFlag(flags, 'help')) {
    process.stdout.write(help());
    return;
  }
  if (positionals.length) cliError(`unexpected positional arguments: ${positionals.join(' ')}`);

  const docsDir = path.resolve(typeof flags.docs === 'string' ? flags.docs : DEFAULTS.docs);
  const json = booleanFlag(flags, 'json');

  try {
    const result = writeScreenSpec({
      docsDir,
      domain: typeof flags.domain === 'string' ? flags.domain : undefined,
      screenId: typeof flags['screen-id'] === 'string' ? flags['screen-id'] : undefined,
      screenSlug: typeof flags['screen-slug'] === 'string' ? flags['screen-slug'] : undefined,
      route: typeof flags.route === 'string' ? flags.route : undefined,
      routeEntry: typeof flags['route-entry'] === 'string' ? flags['route-entry'] : undefined,
      screenEntry: typeof flags['screen-entry'] === 'string' ? flags['screen-entry'] : undefined,
      title: typeof flags.title === 'string' ? flags.title : undefined,
      sourceInput: typeof flags['source-input'] === 'string' ? flags['source-input'] : undefined,
      sources: flags.source,
      date: typeof flags.date === 'string' ? flags.date : undefined,
      frontmatterOnly: booleanFlag(flags, 'frontmatter-only'),
      overwrite: booleanFlag(flags, 'overwrite'),
      dryRun: booleanFlag(flags, 'dry-run'),
    });

    if (json) {
      process.stdout.write(
        JSON.stringify(
          {
            screen_id: result.screen_id,
            route: result.route,
            domain: result.domain,
            output_path: result.outputPath,
            wrote: result.wrote,
            warnings: result.warnings,
            next_steps: result.next_steps,
            artifact_text: result.wrote ? undefined : result.text,
          },
          null,
          2,
        ) + '\n',
      );
      return;
    }

    if (!result.wrote) {
      process.stdout.write(result.text);
    }
    const lines = [
      'workflow:create-screen',
      `  screen_id : ${result.screen_id}`,
      `  route     : ${result.route}`,
      `  output    : ${result.outputPath}${result.wrote ? '' : ' (dry-run, not written)'}`,
    ];
    for (const w of result.warnings) lines.push(`  warning   : ${w}`);
    lines.push('  next      :');
    for (const step of result.next_steps) lines.push(`    - ${step}`);
    lines.push('');
    process.stdout.write(lines.join('\n'));
  } catch (err) {
    if (err instanceof ScreenScaffoldError) cliError(err.message);
    throw err;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(main, 'workflow:create-screen');
}
