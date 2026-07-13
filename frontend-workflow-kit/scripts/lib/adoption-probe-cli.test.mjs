import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeOptions, runAdoptionProbe } from './adoption-probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = path.resolve(HERE, '..', '..');
const CLI = path.join(KIT_ROOT, 'scripts', 'adoption-probe.mjs');
const VALUE_FLAGS = [
  'repo',
  'repo-root',
  'out',
  'src',
  'docs',
  'id',
  'date',
  'project-name',
  'visual-domain',
  'visual-screen',
  'visual-contract',
];
const BOOLEAN_FLAGS = ['skip-f3', 'visual', 'skip-visual-consistency', 'json', 'help'];

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function makeDir(t, prefix = 'adoption-probe-cli-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function makeRepo(t, prefix) {
  const repo = makeDir(t, prefix);
  write(path.join(repo, 'sentinel.txt'), 'unchanged\n');
  write(path.join(repo, 'package.json'), JSON.stringify({ name: 'cli-contract-target' }, null, 2) + '\n');
  return repo;
}

function run(args, cwd = KIT_ROOT) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

function outFor(repo, id) {
  return path.join(repo, 'temp', 'runs', `adoption-probe-${id}`);
}

function baseArgs(repo, id) {
  return ['--repo', repo, '--out', outFor(repo, id), '--id', id, '--date', '2026-07-12'];
}

function snapshotTree(root) {
  const snapshot = {};
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else snapshot[path.relative(root, full).split(path.sep).join('/')] = fs.readFileSync(full).toString('hex');
    }
  }
  return snapshot;
}

function assertUsageFailure(result, option, out) {
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, new RegExp(option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(result.stderr, /Try `node scripts\/adoption-probe\.mjs --help`\./);
  if (out) assert.equal(fs.existsSync(out), false, `${out} must not be created`);
}

test('help is side-effect-free before repo validation and scans', (t) => {
  const repo = makeRepo(t, 'adoption-probe-help-');
  const id = 'help-guard';
  const out = outFor(repo, id);
  const before = snapshotTree(repo);
  const result = run([...baseArgs(repo, id), '--help']);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(snapshotTree(repo), before);
  assert.equal(fs.existsSync(out), false);
  for (const phrase of [
    'brownfield consumer adoption observation',
    'draft/review-only',
    'scratch copy',
    'never edits live docs/src/policy/CI',
    'node scripts/adoption-probe.mjs --repo <path> [options]',
    'temp/runs/adoption-probe-<id>/',
    '--skip-f3',
    '--visual-domain',
    '--skip-visual-consistency',
    '0  help or probe generation completed',
    '2  usage, input, or configuration error',
  ]) {
    assert.match(result.stdout, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  const emptyCwd = makeDir(t, 'adoption-probe-empty-help-');
  const emptyBefore = snapshotTree(emptyCwd);
  const emptyHelp = run(['--help'], emptyCwd);
  assert.equal(emptyHelp.status, 0, emptyHelp.stderr);
  assert.deepEqual(snapshotTree(emptyCwd), emptyBefore);

  const missing = path.join(emptyCwd, 'does-not-exist');
  const missingHelp = run(['--repo', missing, '--help'], emptyCwd);
  assert.equal(missingHelp.status, 0, missingHelp.stderr);
  assert.equal(fs.existsSync(missing), false);
});

test('unknown and prototype-key options fail closed before output creation', (t) => {
  const tokens = ['--hlep', '--visaul', '--otu', '--__proto__=x', '--constructor=x', '--prototype=x'];
  for (const token of tokens) {
    const repo = makeRepo(t, 'adoption-probe-unknown-');
    const id = `unknown-${tokens.indexOf(token)}`;
    const out = outFor(repo, id);
    const result = run([...baseArgs(repo, id), token]);
    assertUsageFailure(result, token.split('=')[0], out);
    assert.match(result.stderr, /unknown option/);
  }
});

test('every value flag rejects bare and empty values before output creation', (t) => {
  for (const name of VALUE_FLAGS) {
    for (const bad of [`--${name}`, `--${name}=`]) {
      const repo = makeRepo(t, 'adoption-probe-value-');
      const id = `value-${VALUE_FLAGS.indexOf(name)}`;
      const out = outFor(repo, id);
      const result = run([...baseArgs(repo, id), bad]);
      assertUsageFailure(result, `--${name}`, out);
      assert.match(result.stderr, /requires a value/);
    }
  }
});

test('every boolean flag rejects a value, including an absorbed following token', (t) => {
  for (const name of BOOLEAN_FLAGS) {
    const repo = makeRepo(t, 'adoption-probe-boolean-');
    const id = `boolean-${BOOLEAN_FLAGS.indexOf(name)}`;
    const out = outFor(repo, id);
    const result = run([...baseArgs(repo, id), `--${name}=false`]);
    assertUsageFailure(result, `--${name}`, out);
    assert.match(result.stderr, /does not accept a value/);
  }

  const repo = makeRepo(t, 'adoption-probe-boolean-next-');
  const id = 'boolean-next';
  const out = outFor(repo, id);
  const absorbed = run([...baseArgs(repo, id), '--json', 'unexpected-positional']);
  assertUsageFailure(absorbed, '--json', out);
  assert.equal(fs.existsSync(path.join(out, 'visual')), false);
});

test('an invalid boolean occurrence is not hidden by a later valid duplicate and creates nothing', (t) => {
  const repo = makeRepo(t, 'adoption-probe-duplicate-invalid-');
  const id = 'duplicate-invalid';
  const out = outFor(repo, id);
  const before = snapshotTree(repo);
  const result = run([...baseArgs(repo, id), '--json=false', '--json']);
  assertUsageFailure(result, '--json', out);
  assert.match(result.stderr, /does not accept a value/);
  assert.deepEqual(snapshotTree(repo), before);
  assert.equal(fs.existsSync(path.join(repo, 'temp')), false);
});

test('positionals at the front, middle, and end are rejected', (t) => {
  const repo = makeRepo(t, 'adoption-probe-positional-');
  const cases = [
    ['unexpected', ...baseArgs(repo, 'pos-front')],
    ['--repo', repo, 'unexpected', '--id', 'pos-middle'],
    [...baseArgs(repo, 'pos-end'), 'unexpected'],
  ];
  for (const args of cases) {
    const result = run(args);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /positional arguments are not supported: unexpected/);
  }
  assert.equal(fs.existsSync(path.join(repo, 'temp')), false);
});

test('explicit repo paths must already exist and be directories', (t) => {
  const parent = makeDir(t, 'adoption-probe-repo-guard-');
  const missing = path.join(parent, 'repo-name-typo');
  const missingRun = run(['--repo', missing, '--id', 'missing-repo']);
  assertUsageFailure(missingRun, '--repo', outFor(missing, 'missing-repo'));
  assert.match(missingRun.stderr, /existing directory/);
  assert.equal(fs.existsSync(missing), false);

  const file = path.join(parent, 'not-a-directory');
  write(file, 'file\n');
  const fileRun = run(['--repo-root', file, '--id', 'file-repo']);
  assertUsageFailure(fileRun, '--repo-root');
  assert.match(fileRun.stderr, /must point to a directory/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'file\n');
});

test('invalid output configuration is exit 2 before any directory is created', (t) => {
  const repo = makeRepo(t, 'adoption-probe-out-guard-');
  const wrongOut = path.join(repo, 'temp', 'runs', 'wrong-leaf');
  const result = run(['--repo', repo, '--out', wrongOut, '--id', 'out-guard']);
  assertUsageFailure(result, '--out', wrongOut);
  assert.match(result.stderr, /must resolve to temp\/runs\/adoption-probe-out-guard/);
  assert.equal(fs.existsSync(path.join(repo, 'temp')), false);
});

test('existing repo, repo-root alias, omitted repo, precedence, and scalar last-wins remain compatible', (t) => {
  const repo = makeRepo(t, 'adoption-probe-repo-main-');
  const aliasRepo = makeRepo(t, 'adoption-probe-repo-alias-');
  const out = outFor(repo, 'last-id');
  const both = run([
    '--repo-root', aliasRepo,
    '--repo', repo,
    '--id', 'first-id',
    '--id', 'last-id',
    '--out', out,
    '--date', '2026-07-12',
    '--skip-f3',
    '--json',
  ]);
  assert.equal(both.status, 0, both.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'probe-summary.json'), 'utf8')).probe_id, 'last-id');
  assert.equal(fs.existsSync(path.join(aliasRepo, 'temp')), false, '--repo must retain precedence over --repo-root');

  const aliasOut = outFor(aliasRepo, 'alias-normal');
  const alias = run(['--repo-root', aliasRepo, '--id', 'alias-normal', '--date', '2026-07-12', '--skip-f3']);
  assert.equal(alias.status, 0, alias.stderr);
  assert.equal(fs.existsSync(path.join(aliasOut, 'adoption-report.md')), true);

  const cwdRepo = makeRepo(t, 'adoption-probe-repo-cwd-');
  const omitted = run(['--id', 'cwd-normal', '--date', '2026-07-12', '--skip-f3'], cwdRepo);
  assert.equal(omitted.status, 0, omitted.stderr);
  assert.equal(fs.existsSync(path.join(outFor(cwdRepo, 'cwd-normal'), 'adoption-report.md')), true);

  const opts = normalizeOptions({ repo, 'repo-root': aliasRepo, id: 'precedence' });
  assert.equal(opts.repoRoot, path.resolve(repo));
});

test('syntactic errors precede visual semantic guards, and valid sub-flags still require --visual', (t) => {
  const repo = makeRepo(t, 'adoption-probe-semantic-');
  const typoOut = outFor(repo, 'semantic-typo');
  const typo = run([...baseArgs(repo, 'semantic-typo'), '--visaul', '--visual-domain', 'auth']);
  assertUsageFailure(typo, '--visaul', typoOut);
  assert.doesNotMatch(typo.stderr, /--visual-domain requires --visual/);

  for (const [flag, value] of [
    ['--visual-domain', 'auth'],
    ['--visual-screen', 'AUTH-001'],
    ['--visual-contract', 'docs/frontend-workflow/design/visual-consistency-contract.md'],
    ['--skip-visual-consistency', null],
  ]) {
    const id = `semantic-${flag.slice(2)}`;
    const out = outFor(repo, id);
    const args = [...baseArgs(repo, id), flag];
    if (value !== null) args.push(value);
    const result = run(args);
    assertUsageFailure(result, flag, out);
    assert.match(result.stderr, /requires --visual/);
  }
});

test('programmatic runAdoptionProbe does not enforce the CLI allowlist', (t) => {
  const repo = makeRepo(t, 'adoption-probe-api-');
  const out = outFor(repo, 'programmatic');
  const result = runAdoptionProbe({
    repo,
    out,
    id: 'programmatic',
    date: '2026-07-12',
    'skip-f3': true,
    'programmatic-only-option': 'ignored',
  });
  assert.equal(result.opts.id, 'programmatic');
  assert.equal(fs.existsSync(path.join(out, 'adoption-report.md')), true);
});
