import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TELEMETRY_BOOLEAN_FLAGS, TELEMETRY_VALUE_FLAGS } from './telemetry-cli-args.mjs';
import { KIT_ROOT } from './util.mjs';

const CLI = path.join(KIT_ROOT, 'scripts', 'telemetry.mjs');
const SPAWN_TIMEOUT_MS = 30_000;

const VALUE_FLAGS = [...TELEMETRY_VALUE_FLAGS];
const BOOLEAN_FLAGS = [...TELEMETRY_BOOLEAN_FLAGS];

function makeRoot(t, prefix = 'telemetry-cli-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(path.join(root, 'sentinel.txt'), 'unchanged\n', 'utf8');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function run(args, cwd = KIT_ROOT) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: SPAWN_TIMEOUT_MS,
  });
}

function snapshotTree(root) {
  const snapshot = {};
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        snapshot[`dir:${rel}/`] = true;
        stack.push(full);
      } else {
        snapshot[rel] = fs.readFileSync(full).toString('hex');
      }
    }
  }
  return snapshot;
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertUsageFailure(result, expected, root, before) {
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, expected);
  assert.match(result.stderr, /Try `npm run workflow:telemetry -- --help`\./);
  if (root && before) assert.deepEqual(snapshotTree(root), before, 'usage failure must not read into a write path');
}

test('filesystem snapshots include empty-directory markers', (t) => {
  const root = makeRoot(t, 'telemetry-cli-empty-dir-snapshot-');
  const before = snapshotTree(root);
  fs.mkdirSync(path.join(root, 'empty', 'nested'), { recursive: true });
  const after = snapshotTree(root);
  assert.notDeepEqual(after, before);
  assert.equal(after['dir:empty/'], true);
  assert.equal(after['dir:empty/nested/'], true);
});

test('public help placeholders classify value and boolean options like the shared allowlist', (t) => {
  const root = makeRoot(t, 'telemetry-cli-help-allowlist-');
  const result = run(['--help'], root);
  assert.equal(result.status, 0, result.stderr);
  const optionsSection = result.stdout.split('\nOptions:\n')[1]?.split('\nBehavior:\n')[0] || '';
  const optionRows = [...optionsSection.matchAll(/^  --([a-z0-9-]+)(?:\s+(<[^>\n]+>))?/gm)];
  const advertisedValues = optionRows
    .filter((match) => match[2] != null)
    .map((match) => match[1])
    .sort();
  const advertisedBooleans = optionRows
    .filter((match) => match[2] == null)
    .map((match) => match[1])
    .sort();
  assert.deepEqual(advertisedValues, [...TELEMETRY_VALUE_FLAGS].sort());
  assert.deepEqual(advertisedBooleans, [...TELEMETRY_BOOLEAN_FLAGS].sort());
});

test('the complete telemetry allowlist accepts each option in its valid syntax before help', (t) => {
  const root = makeRoot(t, 'telemetry-cli-allowlist-');
  const before = snapshotTree(root);
  for (const name of VALUE_FLAGS) {
    const value = name === 'root' ? root : 'syntactically-valid';
    const result = run(['--help', `--${name}`, value], root);
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /workflow:telemetry/);
  }
  for (const name of BOOLEAN_FLAGS) {
    const args = name === 'help' ? ['--help'] : ['--help', `--${name}`];
    const result = run(args, root);
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /workflow:telemetry/);
  }
  assert.deepEqual(snapshotTree(root), before);
});

test('general unknown and prototype-key options fail closed without a report or write', (t) => {
  const tokens = [
    '--outt',
    '--otu',
    '--surfac',
    '--docss',
    '--determinism-run',
    '--visaul-domain',
    '--__proto__',
    '--constructor',
    '--prototype',
  ];
  for (const token of tokens) {
    const root = makeRoot(t, `telemetry-cli-unknown-${tokens.indexOf(token)}-`);
    const before = snapshotTree(root);
    const requested = path.join(root, 'must-not-write.json');
    const result = run(['--root', root, `${token}=x`, '--out', requested, '--json'], root);
    assertUsageFailure(result, new RegExp(`unknown option ${regexEscape(token)}`), root, before);
    assert.equal(fs.existsSync(requested), false);
  }
});

test('ledger output typo cannot fall back to a normal observation run', (t) => {
  const root = makeRoot(t, 'telemetry-cli-ledger-typo-');
  const ledger = path.join(root, 'telemetry-ledger.json');

  const correct = run(['--root', root, '--out', 'telemetry-ledger.json', '--json'], root);
  assert.equal(correct.status, 0, correct.stderr);
  assert.equal(correct.stderr, '');
  assert.equal(fs.existsSync(ledger), true);
  const written = JSON.parse(fs.readFileSync(ledger, 'utf8'));
  assert.equal(written.kind, 'observation-ledger');
  assert.equal(written.tool, 'workflow:telemetry');
  fs.rmSync(ledger);

  for (const typo of ['outt', 'otu']) {
    const before = snapshotTree(root);
    const bad = run(['--root', root, `--${typo}`, 'telemetry-ledger.json', '--json'], root);
    assertUsageFailure(bad, new RegExp(`unknown option --${typo}`), root, before);
    assert.equal(fs.existsSync(ledger), false);
  }

  const noOut = run(['--root', root, '--json'], root);
  assert.equal(noOut.status, 0, noOut.stderr);
  assert.equal(noOut.stderr, '');
  const report = JSON.parse(noOut.stdout);
  assert.equal(report.tool, 'workflow:telemetry');
  assert.equal(report.kind, undefined);
  assert.equal(fs.existsSync(ledger), false);
});

test('every value option rejects bare and empty occurrences before telemetry work', (t) => {
  for (const name of VALUE_FLAGS) {
    for (const bad of [`--${name}`, `--${name}=`]) {
      const root = makeRoot(t, `telemetry-cli-value-${VALUE_FLAGS.indexOf(name)}-`);
      const before = snapshotTree(root);
      const result = run([bad, '--help'], root);
      assertUsageFailure(result, new RegExp(`--${regexEscape(name)} requires a value`), root, before);
    }
  }
});

test('every boolean option rejects attached values instead of activating its mode', (t) => {
  for (const name of BOOLEAN_FLAGS) {
    const root = makeRoot(t, `telemetry-cli-boolean-${BOOLEAN_FLAGS.indexOf(name)}-`);
    const before = snapshotTree(root);
    const result = run([`--${name}=false`, '--root', root], root);
    assertUsageFailure(result, new RegExp(`--${regexEscape(name)} does not accept a value`), root, before);
  }

  const root = makeRoot(t, 'telemetry-cli-boolean-absorbed-');
  const before = snapshotTree(root);
  assertUsageFailure(
    run(['--json', 'unexpected', '--root', root], root),
    /--json does not accept a value/,
    root,
    before,
  );
});

test('unexpected tokens at the front, middle, and end fail before report generation', (t) => {
  const root = makeRoot(t, 'telemetry-cli-positionals-');
  const cases = [
    ['unexpected', '--json'],
    ['--root', root, 'unexpected', '--json'],
    ['--root', root, '--json', 'unexpected'],
  ];
  for (const args of cases) {
    const before = snapshotTree(root);
    const result = run(args, root);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /unexpected|does not accept a value/);
    assert.match(result.stderr, /Try `npm run workflow:telemetry -- --help`\./);
    assert.deepEqual(snapshotTree(root), before);
  }
});

test('an invalid raw occurrence cannot be hidden by a later valid duplicate', (t) => {
  const root = makeRoot(t, 'telemetry-cli-invalid-duplicate-');
  const correct = path.join(root, 'correct.json');
  const cases = [
    { args: ['--root', root, '--out=', '--out', 'telemetry-ledger.json'], expected: /--out requires a value/ },
    { args: ['--root', '--root', root, '--json'], expected: /--root requires a value/ },
    { args: ['--root', root, '--json=false', '--json'], expected: /--json does not accept a value/ },
    { args: ['--root', root, '--list-surfaces=false', '--list-surfaces'], expected: /--list-surfaces does not accept a value/ },
    { args: ['--root', root, '--outt', 'wrong.json', '--out', 'correct.json'], expected: /unknown option --outt/ },
  ];
  for (const item of cases) {
    const before = snapshotTree(root);
    assertUsageFailure(run(item.args, root), item.expected, root, before);
  }
  assert.equal(fs.existsSync(path.join(root, 'telemetry-ledger.json')), false);
  assert.equal(fs.existsSync(correct), false);
});

test('all-valid duplicate value options retain last-wins behavior', (t) => {
  const firstRoot = makeRoot(t, 'telemetry-cli-first-root-');
  const secondRoot = makeRoot(t, 'telemetry-cli-second-root-');
  const rootResult = run([
    '--root', firstRoot,
    '--root', secondRoot,
    '--out', 'root-ledger.json',
    '--json',
  ], secondRoot);
  assert.equal(rootResult.status, 0, rootResult.stderr);
  assert.equal(fs.existsSync(path.join(firstRoot, 'root-ledger.json')), false);
  assert.equal(fs.existsSync(path.join(secondRoot, 'root-ledger.json')), true);

  const firstOut = path.join(secondRoot, 'first.json');
  const secondOut = path.join(secondRoot, 'second.json');
  const outResult = run([
    '--root', secondRoot,
    '--out', firstOut,
    '--out', secondOut,
    '--json',
  ], secondRoot);
  assert.equal(outResult.status, 0, outResult.stderr);
  assert.equal(fs.existsSync(firstOut), false);
  assert.equal(fs.existsSync(secondOut), true);
});

test('help is syntax-first and side-effect-free', (t) => {
  const root = makeRoot(t, 'telemetry-cli-help-');
  const before = snapshotTree(root);
  const help = run(['--help', '--root', path.join(root, 'does-not-need-to-exist')], root);
  assert.equal(help.status, 0, help.stderr);
  assert.equal(help.stderr, '');
  assert.match(help.stdout, /workflow:telemetry/);
  assert.match(help.stdout, /--list-surfaces/);
  assert.deepEqual(snapshotTree(root), before);

  for (const args of [
    ['--help=false'],
    ['--help', '--outt', 'x'],
    ['--help', 'unexpected'],
    ['--help', '--__proto__=x'],
  ]) {
    assertUsageFailure(run(args, root), /--help|unknown option|positional arguments/, root, before);
  }
});

test('surface listing stays no-side-effect while invalid syntax fails first', (t) => {
  const root = makeRoot(t, 'telemetry-cli-list-');
  const before = snapshotTree(root);
  for (const args of [
    ['--list-surfaces'],
    ['--list-surfaces', '--json'],
  ]) {
    const result = run(args, root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.doesNotMatch(result.stdout, /"available"/);
    assert.deepEqual(snapshotTree(root), before);
  }

  for (const args of [
    ['--list-surfaces=false'],
    ['--list-surfaces', '--outt', 'x'],
    ['--list-surfaces', 'unexpected'],
  ]) {
    assertUsageFailure(run(args, root), /--list-surfaces|unknown option/, root, before);
  }

  for (const flag of ['out', 'check']) {
    const result = run(['--list-surfaces', `--${flag}`, 'ledger.json'], root);
    assertUsageFailure(result, /cannot be combined/, root, before);
  }
});
