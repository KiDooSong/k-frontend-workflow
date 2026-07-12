import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { KIT_ROOT } from './util.mjs';
import { buildNavGraph } from './nav-graph.mjs';
import { buildCatalog } from './catalog-gen.mjs';

const ROUTE_CLI = path.join(KIT_ROOT, 'scripts', 'route-tree.mjs');
const NAV_CLI = path.join(KIT_ROOT, 'scripts', 'nav-graph.mjs');
const CATALOG_CLI = path.join(KIT_ROOT, 'scripts', 'catalog-gen.mjs');
const ROUTE_FIXTURE = path.join(KIT_ROOT, 'examples', 'route-tree', 'basic-app');
const CUSTOM_ROUTE_FIXTURE = path.join(KIT_ROOT, 'examples', 'router-adapter', 'minimal-custom');
const NAV_FIXTURE = path.join(KIT_ROOT, 'examples', 'nav-graph', 'basic-flow');
const CATALOG_FIXTURE = path.join(KIT_ROOT, 'examples', 'component-catalog', 'basic-ui');
const SPAWN_TIMEOUT_MS = 30_000;

const CLIS = [
  {
    name: 'route-tree', tool: 'workflow:route-tree', script: ROUTE_CLI,
    helpPhrases: ['Usage:', 'npm run workflow:route-tree --', '--app', '--out', '--router', '--help', 'expo-router', 'adapter discovers routes only', '0  help or generation completed', '2  usage, input, or adapter error'],
    valueFlags: ['app', 'out', 'router'], booleanFlags: ['help'], typo: 'outt', extraTypo: 'appp',
  },
  {
    name: 'nav-graph', tool: 'workflow:nav-graph', script: NAV_CLI,
    helpPhrases: ['Usage:', 'npm run workflow:nav-graph --', '--docs', '--out', '--json', '--help', '<docs>/_meta/nav-graph.yaml', 'ScreenSpec and navigation-map inputs are read-only', 'never write an output file', '0  help or generation completed', '2  usage or input error'],
    valueFlags: ['docs', 'out'], booleanFlags: ['json', 'help'], typo: 'outt', extraTypo: 'docss',
  },
  {
    name: 'catalog', tool: 'workflow:catalog', script: CATALOG_CLI,
    helpPhrases: ['Usage:', 'npm run workflow:catalog --', '--src', '--out', '--root', '--layout', '--json', '--dry-run', '--help', 'docs/frontend-workflow/design/component-catalog.md', 'warning-first diagnostic', 'never edits live policy or manifests', '0  help, preview, or generation completed', '2  usage, input, or configuration error'],
    valueFlags: ['src', 'out', 'layout', 'root'], booleanFlags: ['json', 'dry-run', 'help'], typo: 'outt', extraTypo: 'srcs',
  },
];

function makeTmp(t, prefix = 'generated-views-cli-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function run(cli, args, cwd) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
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

function assertUsageFailure(result, expected, before, cwd) {
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, expected);
  assert.match(result.stderr, /Try `npm run workflow:(?:route-tree|nav-graph|catalog) -- --help`\./);
  assert.deepEqual(snapshotTree(cwd), before, 'usage failure must write zero files');
}

test('help is side-effect-free in an empty cwd for all generated-view CLIs', (t) => {
  for (const cli of CLIS) {
    const cwd = makeTmp(t, `${cli.name}-help-`);
    const before = snapshotTree(cwd);
    const result = run(cli.script, ['--help'], cwd);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.deepEqual(snapshotTree(cwd), before, `${cli.name} help must not scan or write`);
    assert.ok(result.stdout.includes(cli.tool));
    for (const phrase of cli.helpPhrases) assert.ok(result.stdout.includes(phrase), `${cli.name} help should include ${phrase}`);
  }
});

test('representative and secondary unknown typos fail closed before default or requested writes', (t) => {
  for (const cli of CLIS) {
    for (const typo of [cli.typo, cli.extraTypo]) {
      const cwd = makeTmp(t, `${cli.name}-unknown-`);
      const requested = path.join(cwd, 'requested-output');
      const before = snapshotTree(cwd);
      const result = run(cli.script, [`--${typo}`, requested], cwd);
      assertUsageFailure(result, new RegExp(`unknown option --${typo}`), before, cwd);
      assert.equal(fs.existsSync(requested), false);
      assert.doesNotMatch(result.stdout, /wrote |generated|생성 완료/);
    }
  }
});

test('every value flag rejects bare and empty forms before path resolution, layout load, or scans', (t) => {
  for (const cli of CLIS) {
    for (const name of cli.valueFlags) {
      for (const token of [`--${name}`, `--${name}=`]) {
        const cwd = makeTmp(t, `${cli.name}-value-`);
        const before = snapshotTree(cwd);
        assertUsageFailure(run(cli.script, [token], cwd), new RegExp(`--${name} requires a value`), before, cwd);
      }
    }
  }
});

test('every boolean flag rejects attached and absorbed values, including help syntax errors', (t) => {
  for (const cli of CLIS) {
    for (const name of cli.booleanFlags) {
      for (const args of [[`--${name}=false`], [`--${name}`, 'unexpected']]) {
        const cwd = makeTmp(t, `${cli.name}-boolean-`);
        const before = snapshotTree(cwd);
        assertUsageFailure(run(cli.script, args, cwd), new RegExp(`--${name} does not accept a value`), before, cwd);
      }
    }
  }
});

test('an invalid occurrence cannot be hidden by a later valid duplicate', (t) => {
  const cases = [
    {
      name: 'route-tree-empty-out',
      cli: ROUTE_CLI,
      args: ['--app', path.join(ROUTE_FIXTURE, 'src', 'app'), '--out=', '--out'],
      expected: /--out requires a value/,
      appendOutput: true,
    },
    {
      name: 'nav-graph-valued-json',
      cli: NAV_CLI,
      args: ['--docs', path.join(NAV_FIXTURE, 'docs', 'frontend-workflow'), '--json=false', '--json'],
      expected: /--json does not accept a value/,
    },
    {
      name: 'catalog-bare-src',
      cli: CATALOG_CLI,
      args: ['--src', '--src', path.join(CATALOG_FIXTURE, 'src'), '--json'],
      expected: /--src requires a value/,
    },
  ];
  for (const item of cases) {
    const cwd = makeTmp(t, `${item.name}-`);
    const before = snapshotTree(cwd);
    const output = path.join(cwd, 'must-not-write');
    const args = item.appendOutput ? [...item.args, output] : item.args;
    assertUsageFailure(run(item.cli, args, cwd), item.expected, before, cwd);
    assert.equal(fs.existsSync(output), false);
  }
});

test('positionals and prototype-key options fail closed for every CLI', (t) => {
  for (const cli of CLIS) {
    for (const token of ['unexpected-positional', '--__proto__=x', '--constructor=x', '--prototype=x']) {
      const cwd = makeTmp(t, `${cli.name}-token-`);
      const before = snapshotTree(cwd);
      const expected = token.startsWith('--')
        ? new RegExp(`unknown option --${token.slice(2).split('=')[0]}`)
        : /positional arguments are not supported/;
      assertUsageFailure(run(cli.script, [token], cwd), expected, before, cwd);
    }
  }
});

test('route-tree import is inert while direct and custom-adapter execution remain byte-compatible', (t) => {
  const cwd = makeTmp(t, 'route-import-');
  const before = snapshotTree(cwd);
  const importCode = `await import(${JSON.stringify(pathToFileURL(ROUTE_CLI).href)});`;
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', importCode], {
    cwd, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS,
  });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, '');
  assert.equal(imported.stderr, '');
  assert.deepEqual(snapshotTree(cwd), before);

  const out = path.join(cwd, 'route-tree.txt');
  const direct = run(ROUTE_CLI, ['--app', path.join(ROUTE_FIXTURE, 'src', 'app'), '--out', out], cwd);
  assert.equal(direct.status, 0, direct.stderr);
  assert.equal(fs.readFileSync(out, 'utf8'), fs.readFileSync(path.join(ROUTE_FIXTURE, 'expected', 'route-tree.txt'), 'utf8'));

  const customOut = path.join(cwd, 'custom-route-tree.txt');
  const customArg = 'examples/router-adapter/minimal-custom/my-router.mjs';
  const custom = run(ROUTE_CLI, ['--router', customArg, '--out', customOut], KIT_ROOT);
  assert.equal(custom.status, 0, custom.stderr);
  assert.equal(fs.readFileSync(customOut, 'utf8'), fs.readFileSync(path.join(CUSTOM_ROUTE_FIXTURE, 'expected', 'route-tree.txt'), 'utf8'));
});

test('normal route/nav/catalog output and no-write stdout modes stay compatible', (t) => {
  const cwd = makeTmp(t, 'generated-views-normal-');
  const navOut = path.join(cwd, 'nav-graph.yaml');
  const navDocs = path.join(NAV_FIXTURE, 'docs', 'frontend-workflow');
  const navWrite = run(NAV_CLI, ['--docs', navDocs, '--out', navOut], cwd);
  assert.equal(navWrite.status, 0, navWrite.stderr);
  assert.equal(fs.readFileSync(navOut, 'utf8'), fs.readFileSync(path.join(NAV_FIXTURE, 'expected', 'nav-graph.yaml'), 'utf8'));
  const navJsonOut = path.join(cwd, 'nav-json-must-not-write.yaml');
  const navJson = run(NAV_CLI, ['--docs', navDocs, '--out', navJsonOut, '--json'], cwd);
  assert.equal(navJson.status, 0, navJson.stderr);
  assert.deepEqual(JSON.parse(navJson.stdout), buildNavGraph({ docsDir: navDocs }));
  assert.equal(fs.existsSync(navJsonOut), false);

  const catalogOut = path.join(cwd, 'component-catalog.md');
  const catalogWrite = run(CATALOG_CLI, ['--src', 'src', '--out', catalogOut], CATALOG_FIXTURE);
  assert.equal(catalogWrite.status, 0, catalogWrite.stderr);
  const catalogGolden = fs.readFileSync(path.join(CATALOG_FIXTURE, 'expected', 'component-catalog.md'), 'utf8');
  assert.equal(fs.readFileSync(catalogOut, 'utf8'), catalogGolden);
  const catalogJsonOut = path.join(cwd, 'catalog-json-must-not-write.md');
  const catalogJson = run(CATALOG_CLI, ['--src', 'src', '--out', catalogJsonOut, '--json'], CATALOG_FIXTURE);
  assert.equal(catalogJson.status, 0, catalogJson.stderr);
  assert.deepEqual(JSON.parse(catalogJson.stdout), buildCatalog({ src: path.join(CATALOG_FIXTURE, 'src'), projectRoot: CATALOG_FIXTURE }));
  assert.equal(fs.existsSync(catalogJsonOut), false);
  const dryRunOut = path.join(cwd, 'catalog-dry-run-must-not-write.md');
  const dryRun = run(CATALOG_CLI, ['--src', 'src', '--out', dryRunOut, '--dry-run'], CATALOG_FIXTURE);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.equal(dryRun.stdout, catalogGolden);
  assert.equal(fs.existsSync(dryRunOut), false);

  const missingSrc = run(CATALOG_CLI, ['--src', path.join(cwd, 'missing-src'), '--json'], cwd);
  assert.equal(missingSrc.status, 2);
  assert.match(missingSrc.stderr, /--src is not a directory/);
});

test('duplicate scalar output flags retain last-wins semantics', (t) => {
  const cwd = makeTmp(t, 'generated-views-duplicates-');
  const cases = [
    { cli: ROUTE_CLI, args: ['--app', path.join(ROUTE_FIXTURE, 'src', 'app')] },
    { cli: NAV_CLI, args: ['--docs', path.join(NAV_FIXTURE, 'docs', 'frontend-workflow')] },
    { cli: CATALOG_CLI, args: ['--src', path.join(CATALOG_FIXTURE, 'src')] },
  ];
  for (const [index, item] of cases.entries()) {
    const first = path.join(cwd, `first-${index}`);
    const second = path.join(cwd, `second-${index}`);
    const result = run(item.cli, [...item.args, '--out', first, '--out', second], cwd);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(first), false);
    assert.equal(fs.existsSync(second), true);
  }
});
