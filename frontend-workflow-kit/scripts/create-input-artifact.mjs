#!/usr/bin/env node
// workflow:create-input - create a canonical input artifact from normalized facts.
import path from 'node:path';
import { DEFAULTS, runCli, isCliEntry } from './lib/util.mjs';
import {
  InputProducerError,
  loadProducerPayload,
  writeInputArtifact,
} from './lib/input-producer.mjs';

const REPEAT_FLAGS = new Set([
  'domain',
  'screen',
  'raw-artifact',
  'fact',
  'target',
  'expected',
  'should-not-do',
]);
const VALUE_FLAGS = new Set([
  'docs',
  'out',
  'group-by',
  'input-subdir',
  'input-id',
  'source',
  'input-type',
  'source-type',
  'source-ref',
  'captured-at',
  'captured-by',
  'date',
  'confidence',
  'supersedes',
  'title',
  'summary',
  'from-json',
  'from-yaml',
  ...REPEAT_FLAGS,
]);
const BOOLEAN_FLAGS = new Set(['help', 'json', 'dry-run', 'overwrite']);
const KNOWN_FLAGS = new Set([...VALUE_FLAGS, ...BOOLEAN_FLAGS]);

function cliError(message) {
  process.stderr.write(`workflow:create-input: ${message}\n`);
  process.exit(2);
}

function parseProducerArgs(argv) {
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

function splitList(values) {
  const arr = Array.isArray(values) ? values : values === undefined ? [] : [values];
  return arr
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function flagPayload(flags) {
  const payload = {};
  const scalarMap = {
    'input-id': 'input_id',
    source: 'source',
    'input-type': 'input_type',
    'source-type': 'source_type',
    'source-ref': 'source_ref',
    'captured-at': 'captured_at',
    'captured-by': 'captured_by',
    confidence: 'confidence',
    supersedes: 'supersedes',
    title: 'title',
    summary: 'summary',
  };
  for (const [flag, key] of Object.entries(scalarMap)) {
    if (typeof flags[flag] === 'string') payload[key] = flags[flag];
  }
  const listMap = {
    domain: 'affected_domains',
    screen: 'affected_screens',
    'raw-artifact': 'raw_artifacts',
    fact: 'extracted_facts',
    target: 'suggested_target_artifacts',
    expected: 'expected_reconciliation',
    'should-not-do': 'should_not_do',
  };
  for (const [flag, key] of Object.entries(listMap)) {
    const values = splitList(flags[flag]);
    if (values.length) payload[key] = values;
  }
  return payload;
}

function booleanFlag(flags, key) {
  const value = flags[key];
  if (value === undefined) return false;
  if (value === true) return true;
  cliError(`--${key} does not accept a value; use bare --${key} to enable it`);
}

function help() {
  return `workflow:create-input

Create an input artifact from normalized input facts. Default output is the flat
path docs/frontend-workflow/inputs/{input_id}.md (backwards-compatible).

Grouping (optional, recommended for large repos):
  --group-by domain      one affected domain -> inputs/{domain}/{input_id}.md
                         multiple domains    -> inputs/_multi/{input_id}.md
                         no/unknown domain   -> inputs/_unknown/{input_id}.md
  --input-subdir <path>  explicit subdir, e.g. auth/figma -> inputs/auth/figma/{input_id}.md
                         (relative only; '..'/absolute paths are rejected)
  --input-subdir takes precedence over --group-by. input_id stays globally unique
  and file basename stays {input_id}.md regardless of subdirectory.

Examples:
  node scripts/create-input-artifact.mjs --docs docs/frontend-workflow --source planning --input-type planning --source-type planning-doc --source-ref planning://note --captured-by planning-adapter --domain auth --screen AUTH-001 --summary "Login copy changed" --fact "Primary CTA text is Sign in"
  node scripts/create-input-artifact.mjs --docs docs/frontend-workflow --from-json input.json --group-by domain --json
  node scripts/create-input-artifact.mjs --docs docs/frontend-workflow --from-yaml input.yaml --input-subdir auth/figma --dry-run
`;
}

function main() {
  const { flags, positionals } = parseProducerArgs(process.argv.slice(2));
  if (booleanFlag(flags, 'help')) {
    process.stdout.write(help());
    return;
  }
  if (positionals.length) cliError(`unexpected positional arguments: ${positionals.join(' ')}`);
  if (flags['from-json'] && flags['from-yaml']) cliError('--from-json and --from-yaml are mutually exclusive');

  let payload = {};
  if (typeof flags['from-json'] === 'string') {
    payload = loadProducerPayload(flags['from-json'], { format: 'json' });
  } else if (typeof flags['from-yaml'] === 'string') {
    payload = loadProducerPayload(flags['from-yaml'], { format: 'yaml' });
  }
  payload = { ...payload, ...flagPayload(flags) };

  const docsDir = path.resolve(typeof flags.docs === 'string' ? flags.docs : DEFAULTS.docs);
  const inputsDir = path.resolve(typeof flags.out === 'string' ? flags.out : path.join(docsDir, 'inputs'));
  const dryRun = booleanFlag(flags, 'dry-run');
  const json = booleanFlag(flags, 'json');
  const overwrite = booleanFlag(flags, 'overwrite');

  try {
    const result = writeInputArtifact(payload, {
      inputsDir,
      date: typeof flags.date === 'string' ? flags.date : undefined,
      dryRun,
      overwrite,
      groupBy: typeof flags['group-by'] === 'string' ? flags['group-by'] : undefined,
      inputSubdir: typeof flags['input-subdir'] === 'string' ? flags['input-subdir'] : undefined,
    });

    if (json) {
      const body = {
        input_id: result.artifact.input_id,
        output_path: result.outputPath,
        grouped_under: result.subdir || null,
        wrote: result.wrote,
        next_step: 'run workflow:validate, then reconcile-input',
      };
      if (!result.wrote) body.artifact_text = result.text;
      process.stdout.write(JSON.stringify(body, null, 2) + '\n');
      return;
    }
    if (!result.wrote) {
      process.stdout.write(result.text);
      return;
    }
    process.stdout.write(
      [
        'workflow:create-input',
        `  input_id : ${result.artifact.input_id}`,
        `  output   : ${result.outputPath}`,
        '  next     : run workflow:validate, then reconcile-input',
        '',
      ].join('\n'),
    );
  } catch (err) {
    if (err instanceof InputProducerError) cliError(err.message);
    throw err;
  }
}

if (isCliEntry(import.meta.url)) {
  runCli(main, 'workflow:create-input');
}
