// Actual scoped workflow-run, including packet/checkpoint/backstop comparisons.
// node kit-dev/benchmarks/scoped-run.mjs <before-kit> <after-kit>
//   [runs=3] [owners=1,2] [inputs=1274] [shape=sparse|dense|short-bullets] [blobs=3303]
//   [raw-blob-bytes=8192] [timeout-ms=240000] [raw-doc-bytes=raw-blob-bytes]
// sparse: short Evidence bullet, tables/Notes; dense: long Extracted Facts bullets.
// short-bullets: 80 short Evidence bullets, with remaining bytes in separate Notes.
// All shapes keep the same input count and bytes. Raw .bin files represent a
// broad tree, not additional Markdown authority. The output records actual size;
// this fixture does not reproduce the consumer's undisclosed documents or 68m run.
// Diagnostics and packet-bound postwork run once per side for the largest owner
// request selected. Every requested owner count retains all timed prework pairs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';

const DOCS = 'docs/frontend-workflow', OWNERS = ['RESULT-001', 'RESULT-002'];
const INPUT_BYTES = Math.floor(14.25 * 1024 * 1024 / 1274) + 1;
const USAGE = 'usage: scoped-run.mjs <before-kit> <after-kit> [runs=3] [owners=1,2] [inputs=1274] [shape=sparse|dense|short-bullets] [blobs=3303] [raw-blob-bytes=8192] [timeout-ms=240000] [raw-doc-bytes=raw-blob-bytes]';
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const entry = (id) => `src/features/result/screens/${id}.tsx`;
const inputId = (index) => `IN-20261113-meeting-${String(index + 1).padStart(4, '0')}`;
const inputRef = (index) => `input:${inputId(index)}#extracted-facts/01`;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const integer = (value, minimum) => { const n = Number(value); assert.ok(Number.isSafeInteger(n) && n >= minimum, USAGE); return n; };
const environment = (extra = {}) => ({ ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: os.devNull,
  GIT_CONFIG_GLOBAL: os.devNull, GIT_ATTR_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0',
  GIT_AUTHOR_NAME: 'Synthetic Benchmark', GIT_AUTHOR_EMAIL: 'benchmark@example.invalid',
  GIT_COMMITTER_NAME: 'Synthetic Benchmark', GIT_COMMITTER_EMAIL: 'benchmark@example.invalid',
  GIT_AUTHOR_DATE: '2026-11-13T00:00:00Z', GIT_COMMITTER_DATE: '2026-11-13T00:00:00Z', ...extra });
const git = (root, ...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', env: environment(),
  maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']}).trim();

async function createFixture(kit, root, config) {
  const lib = (name) => import(pathToFileURL(path.join(kit, 'scripts/lib', `${name}.mjs`)).href);
  const [{REQUIRED_REGISTER_COLS}, {REQUIRED_ITEM_COLS}, {loadLayoutProfile}, {buildState}] = await Promise.all([
    lib('reconciliation-register'), lib('reconciliation-items'), lib('layout-profile'),
    import(pathToFileURL(path.join(kit, 'scripts/workflow-state.mjs')).href),
  ]);
  const files = new Map();
  const put = (name, value) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, value); files.set(name, Buffer.byteLength(value)); return file; };
  const write = (name, fm, body) => put(`${DOCS}/${name}`, md(fm, body));
  put('.kit/policy.yaml', fs.readFileSync(path.join(kit, 'policies/implementation-mode-policy.yaml')));
  put('.kit/manifest.yaml', JSON.stringify({version: 1, artifacts: {}}));
  const layoutFile = put('.kit/layout.yaml', JSON.stringify({roles: {route_entry: 'src/app/**',
    screen: 'src/features/{domain}/screens/**', domain_component: 'src/features/{domain}/components/**',
    hook: 'src/features/{domain}/hooks/**', api_client: 'src/api/**', test: 'src/features/{domain}/tests/**'}}));
  put('.kit/adoption.yaml', JSON.stringify({work_execution: {version: 1, owners: OWNERS.map((id) => `screen:${id}`),
    profiles: ['visual', 'api-contract', 'behavior'], role_limits: {
      visual: ['screen', 'domain_component', 'hook', 'test'], 'api-contract': ['api_client', 'test'],
      behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'],
    }, deny_paths: []}}));
  put('frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: .kit/adoption.yaml\n');
  put(`${DOCS}/app/navigation-map.md`, '---\nstatus: draft\n---\n\n# Navigation Map\n');
  put(`${DOCS}/design/component-catalog.md`, '# Component Catalog\n');
  const targets = OWNERS.map((id, index) => Array.from({length: index === 0 ? 7 : 3}, (_, n) => {
    const file = n === 0 ? entry(id) : `src/features/result/components/${id}/Part${n}.tsx`;
    put(file, 'export default null;\n'); return {path: file, change: 'M'};
  }));
  for (const [index, id] of OWNERS.entries()) {
    write(`domains/result/rules/rules-${index + 1}.md`, {artifact_id: `RULES-${index + 1}`, artifact_type: 'domain-rules',
      domain: 'result', status: 'confirmed', approved_by: 'synthetic-test-owner', approved_at: '2026-11-13', decision_id: `fixture-rules-${index + 1}`},
    `## Rules\nKnown local behavior ${index + 1}.\n\n## Later\nPreserve the historical source.\n`);
    write(`domains/result/screens/${id.toLowerCase()}/screen-spec.md`, {artifact_id: `HOST-${index + 1}`, artifact_type: 'screen-spec',
      screen_id: id, domain: 'result', route: `/${id.toLowerCase()}`, status: 'draft', api_required: index === 1, screen_entry: entry(id),
      work_execution: {version: 1, private_paths: {domain_component: [`src/features/result/components/${id}/**`]}, units: [
        {id: 'known', kind: 'behavior', contracts: [`artifact:RULES-${index + 1}#rules`], sources: [],
          ...(index === 1 ? {api_candidates: [{method: 'GET', path: '/results'}]} : {})},
        {id: 'later', kind: 'behavior', contracts: ['artifact:RULES-1#later'], sources: [{input_id: inputId(0), items: ['01'], source_refs: [inputRef(0)]}]},
      ]}}, '## Notes\nExisting host.\n' + (index === 1 ? '\n## API Candidates\n' +
        table(['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths'], [['GET', '/results', 'confirmed', 'active', '', 'src/api/results/**']]) : ''));
  }
  put('contracts/results.md', '## ResultsResponse\nExisting explicit result contract.\n');
  write('api/api-manifest.md', {artifact_id: 'API', artifact_type: 'api-manifest', status: 'draft'}, '## Endpoints\n' +
    table(['Method', 'Path', 'Confidence', 'Linked Contract', 'Contract Kind', 'Source'], [['GET', '/results', 'confirmed', 'ResultsResponse', 'manual', 'contracts/results.md']]));
  const summaries = [], items = [];
  let inputBytes = 0;
  for (let index = 0; index < config.inputs; index++) {
    const id = inputId(index), ref = inputRef(index);
    const facts = config.shape === 'dense'
      ? '## Extracted Facts\n' + Array.from({length: 40}, (_, n) => `- Existing fact ${index}/${n}: Preserve the documented local behavior and show the captured context. `.repeat(3)).join('\n') + '\n'
      : config.shape === 'short-bullets'
      ? '## Extracted Facts\n' + Array.from({length: 80}, (_, n) => `- Fact ${index}/${n}: preserve item.`).join('\n') + '\n\n## Notes\n'
      : `## Extracted Facts\n- Existing source ${index}.\n\n## Inventory\n` + table(['Item', 'Behavior'], Array.from({length: 40}, (_, n) =>
        [`control-${index}-${n}`, `Preserve state ${index}/${n} while loading and do not silently change a reported result.`])) + '\n\n## Notes\n';
    let value = md({input_id: id, input_type: 'meeting', source_type: 'meeting', source_ref: `meeting:perf-${index}`,
      captured_at: '2026-11-13T00:00:00Z', captured_by: 'synthetic-benchmark', status: 'captured', affected_domains: ['result'], affected_screens: OWNERS}, facts);
    const padding = 'Stable captured source prose. ';
    value += padding.repeat(Math.ceil(Math.max(0, INPUT_BYTES - value.length) / padding.length));
    value = value.slice(0, INPUT_BYTES - 1) + '\n'; inputBytes += Buffer.byteLength(value);
    put(`${DOCS}/inputs/_multi/${id}.md`, value);
    summaries.push(index === 0 ? [id, 'meeting', 'simple-update×1', 'partially-reconciled', 'pending', 'artifact:RULES-1', '-', '-']
      : [id, 'meeting', 'reject-input', 'reconciled', 'rejected', '-', '-', '-']);
    items.push(index === 0 ? [id, '01', 'compatible-fact', 'simple-update', 'update', 'artifact:RULES-1#later', ref, 'inherit', 'statement', 'inherit']
      : [id, '01', 'reject', 'reject-input', 'reject', '-', ref, 'inherit', 'statement', 'inherit']);
  }
  write('_meta/reconciliation-register.md', {reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1', structured_since: '2026-11-13T00:00:00Z'},
    table(REQUIRED_REGISTER_COLS, summaries) + '\n\n## Reconciliation Items\n' + table(REQUIRED_ITEM_COLS, items));
  const layout = loadLayoutProfile({kitRoot: root, flags: {layout: layoutFile}});
  put(`${DOCS}/_meta/workflow-state.yaml`, JSON.stringify(buildState({docsDir: path.join(root, DOCS), srcDir: path.join(root, 'src'), date: '2026-11-13', layout, projectRoot: root}).state));
  const desiredDocs = Math.max([...files.keys()].filter((name) => name.startsWith('docs/')).length,
    Math.floor(config.blobs * 15616 / 33681));
  const raw = (name, index) => { const bytes = Buffer.alloc(name.startsWith('docs/') ? config.rawDocBytes : config.rawBytes, index % 251);
    bytes.write(`Synthetic unrelated raw blob ${index}\n`); put(name, bytes); };
  for (let n = [...files.keys()].filter((name) => name.startsWith('docs/')).length; n < desiredDocs; n++) raw(`docs/archive/raw-${String(n).padStart(6, '0')}.bin`, n);
  for (let n = files.size; n < config.blobs; n++) raw(`assets/archive/raw-${String(n).padStart(6, '0')}.bin`, n);
  git(root, 'init', '--quiet', '--object-format=sha1');
  for (const [key, value] of [['maintenance.auto', 'false'], ['gc.auto', '0'], ['core.autocrlf', 'false'], ['core.filemode', 'true']]) git(root, 'config', key, value);
  git(root, 'add', '-A'); git(root, 'commit', '-qm', 'Synthetic scoped workflow-run');
  return {root, targets, commit: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}'),
    input_count: config.inputs, input_bytes: inputBytes, input_shape: config.shape,
    blobs: files.size, bytes: [...files.values()].reduce((sum, size) => sum + size, 0),
    docs_blobs: [...files.keys()].filter((name) => name.startsWith('docs/')).length,
    docs_bytes: [...files].filter(([name]) => name.startsWith('docs/')).reduce((sum, [, size]) => sum + size, 0)};
}

function repositoryState(root) {
  const files = execFileSync('git', ['ls-files', '-z'], {cwd: root, env: environment(), maxBuffer: 64 * 1024 * 1024}).toString('utf8').split('\0').filter(Boolean);
  const digest = createHash('sha256');
  for (const name of files) {
    const file = path.join(root, name), stat = fs.lstatSync(file);
    digest.update(JSON.stringify([name, stat.mode & 0o777])).update('\0').update(fs.readFileSync(file)).update('\0');
  }
  return {commit: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}'),
    index_sha256: hash(fs.readFileSync(path.join(root, '.git/index'))), contents_sha256: digest.digest('hex'), status: git(root, 'status', '--porcelain')};
}

function invoke(kit, fixture, work, out, temporary, timeout, checkpoint, diagnostic) {
  fs.rmSync(out, {recursive: true, force: true}); fs.rmSync(`${out}.md`, {force: true});
  const args = [...(diagnostic ? ['--import', diagnostic.hook] : []), path.join(kit, 'scripts/workflow-run.mjs'),
    '--root', fixture.root, '--work', work, '--docs', DOCS, '--src', 'src', '--policy', '.kit/policy.yaml',
    '--manifest', '.kit/manifest.yaml', '--layout', '.kit/layout.yaml', '--date', '2026-11-13', '--out', out, '--json',
    ...(checkpoint ? ['--packet', checkpoint] : [])];
  const start = performance.now();
  const run = spawnSync(process.execPath, args, {cwd: fixture.root, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024,
    env: environment({TMPDIR: temporary, TMP: temporary, TEMP: temporary,
      ...(diagnostic ? {FWKIT_RUN_BENCH_KIT: kit, FWKIT_RUN_BENCH_COUNTS: diagnostic.output} : {})})});
  const elapsed = performance.now() - start;
  const artifacts = {};
  for (const [name, file] of [['packet', path.join(out, 'work-packet.md')], ['status', `${out}.md`], ['report', path.join(out, 'run-report.md')]]) {
    artifacts[name] = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  }
  return {elapsed_ms: elapsed, stdout: run.stdout || '', stderr: run.stderr || '', artifacts,
    status: run.status, signal: run.signal, error: run.error?.message ?? null, temporary_entries: fs.readdirSync(temporary)};
}

function verify(result, fixture, owners, expectedState) {
  assert.equal(result.error, null, result.error); assert.equal(result.signal, null); assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, ''); assert.deepEqual(result.temporary_entries, [], 'private snapshot cleanup');
  const report = JSON.parse(result.stdout);
  assert.equal(report.authority, 'scoped'); assert.equal(report.ready, true); assert.equal(report.state, expectedState);
  assert.deepEqual(report.errors, []); assert.deepEqual(report.denials, []);
  assert.equal(report.snapshot.commit, fixture.commit); assert.equal(report.snapshot.tree, fixture.tree);
  assert.equal(report.requests.length, owners);
  for (const [index, request] of report.requests.entries()) {
    assert.equal(request.owner, `screen:${OWNERS[index]}`); assert.equal(request.ready, true);
    assert.equal(request.targets.length, index === 0 ? 7 : 3);
    assert.ok(request.path_authorizations.every((entry) => entry.allowed));
  }
  assert.notEqual(report.approval_verified, true); assert.notEqual(report.semantic_coverage_verified, true);
  assert.match(result.artifacts.packet, /^---\nkind: scoped-work-packet\n/);
  assert.match(result.artifacts.status, /^---\nkind: scoped-work-run-status\n/);
  if (expectedState === 'DONE_PENDING_REVIEW') {
    assert.equal(report.backstop.ok, true); assert.equal(report.checkpoint.matched, true); assert.ok(result.artifacts.report);
  } else assert.equal(result.artifacts.report, null);
  return {stdout: result.stdout, artifacts: result.artifacts};
}

function diagnosticHook(scratch) {
  const loader = path.join(scratch, 'counts-loader.mjs'), hook = path.join(scratch, 'counts-hook.mjs');
  fs.writeFileSync(loader, String.raw`import path from 'node:path';import {pathToFileURL} from 'node:url';
const prefix=pathToFileURL(path.join(process.env.FWKIT_RUN_BENCH_KIT,'scripts/lib/')).href;
const names=['validateCurrentReconciliation','inspectScopedSnapshotWorkRequests','resolveScopedUnitProjection','resolveScopedSourceProjection','validateReconciliationV2','createInputEvidenceValidator','createScopedSourceResolver','validateInputArtifacts','parseReconciliationEvidence','parseReconciliationMarkdown','resolveInputEvidence','inputSectionDetails'];
export async function load(url,context,nextLoad){const r=await nextLoad(url,context);if(!url.startsWith(prefix)||!url.endsWith('.mjs'))return r;let source=String(r.source);
for(const name of names){const signature='export function '+name+'(';if(!source.includes(signature))continue;source=source.replace(signature,'function __run_bench_'+name+'(');
const phase=name==='validateCurrentReconciliation'?'initial-register':name==='inspectScopedSnapshotWorkRequests'?'composition':null;
source+='\nexport function '+name+'(...args){return globalThis.__runBench.call('+JSON.stringify(name)+','+JSON.stringify(phase)+',()=>__run_bench_'+name+'(...args));}\n';}
return {...r,source};}
`);
  fs.writeFileSync(hook, String.raw`import fs from 'node:fs';import path from 'node:path';import {register} from 'node:module';import {pathToFileURL} from 'node:url';import {performance} from 'node:perf_hooks';
let phase='other',stats=()=>({});const counts={},phases=[];
globalThis.__runBench={call(name,next,fn){const old=phase;if(next)phase=next;counts[phase]??={};counts[phase][name]=(counts[phase][name]||0)+1;const before=next?stats():null,start=next?performance.now():0;
try{return fn();}finally{if(next)phases.push({name,elapsed_ms:performance.now()-start,stats_before:before,stats_after:stats()});phase=old;}}};
register(new URL('./counts-loader.mjs',import.meta.url),import.meta.url);stats=(await import(pathToFileURL(path.join(process.env.FWKIT_RUN_BENCH_KIT,'scripts/lib/reconciliation-markdown-ast.mjs')).href)).reconciliationParseStats;
process.on('exit',()=>fs.writeFileSync(process.env.FWKIT_RUN_BENCH_COUNTS,JSON.stringify({counts,phases,parse:stats(),resources:process.resourceUsage()})));
`);
  return hook;
}

const median = (values) => { const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
async function main(args) {
  assert.ok(args.length >= 2 && args.length <= 10, USAGE);
  const forbidden = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_CONFIG', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS', 'NODE_V8_COVERAGE', 'NODE_OPTIONS'].filter((name) => process.env[name] !== undefined);
  assert.deepEqual(forbidden, [], 'run without Git redirection or Node instrumentation variables');
  const kits = {before: path.resolve(args[0]), after: path.resolve(args[1])};
  assert.equal(fs.statSync(kits.before).dev, fs.statSync(kits.after).dev, 'stage both kits on the same filesystem');
  const config = {runs: integer(args[2] ?? 3, 1), owners: (args[3] ?? '1,2').split(',').map((n) => integer(n, 1)),
    inputs: integer(args[4] ?? 1274, 1), shape: args[5] ?? 'sparse', blobs: integer(args[6] ?? 3303, 0),
    rawBytes: integer(args[7] ?? 8192, 64), timeout: integer(args[8] ?? 240000, 1000)};
  config.rawDocBytes = integer(args[9] ?? config.rawBytes, 64);
  assert.ok(config.owners.every((n) => n <= 2) && new Set(config.owners).size === config.owners.length, USAGE);
  assert.ok(['sparse', 'dense', 'short-bullets'].includes(config.shape), USAGE);
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fwkit-run-benchmark-')));
  const output = {benchmark: 'scoped-workflow-run', harness_sha256: hash(fs.readFileSync(new URL(import.meta.url))),
    node: process.version, platform: `${process.platform}/${process.arch}`, kits, config,
    method: {timing: 'Fresh actual workflow-run --work --out --json processes; alternating order; includes startup, raw tree, preflight, backstop, packet/status writes and cleanup. All timed samples retained; no hooks or excluded warm-up.',
      verification: 'Exact complete prework stdout plus packet/status bytes for every owner case; ready, path decisions and digests preserved. HEAD/tree/index/worktree bytes/modes/status checked; raw snapshots cleaned. The largest selected owner request also verifies packet-bound postwork stdout/packet/status/report and backstop with controlled requested changes, outside timing.',
      diagnostics: 'Separate instrumented processes for the largest selected owner request count exported functions and AST parses by initial register/composition phase. CPU/RSS includes loader worker and excludes Git child usage; not timed-run or retained memory.',
      fixture: 'One or two adopted screen behavior owners with 7/3 regular-file M targets; first has no API candidate, second consumes an existing manual API contract. Each has an unselected source-backed later unit. Fixed 1274-input scale is 14.25 MiB; sparse, dense (40 long bullets) and short-bullets (80 short bullets plus separate Notes) vary where prose is stored. Synthetic declarations are not human approval.',
      scope: 'Raw .bin files model unrelated tree breadth; raw bytes and counts are explicit. Inputs and trees are synthetic, not the undisclosed consumer; the observed 68-minute run is not reproduced or predicted.'}, cases: []};
  try {
    const fixture = await createFixture(kits.before, path.join(scratch, 'project'), config), clean = repositoryState(fixture.root);
    assert.equal(clean.status, '');
    output.fixture = Object.fromEntries(Object.entries(fixture).filter(([name]) => !['root', 'targets'].includes(name)));
    const temporary = path.join(scratch, 'tmp'); fs.mkdirSync(temporary);
    const hook = diagnosticHook(scratch);
    for (const owners of config.owners) {
      const work = path.join(scratch, `request-${owners}.json`), out = path.join(scratch, `pre-${owners}`), post = path.join(scratch, `post-${owners}`);
      fs.writeFileSync(work, JSON.stringify({version: 1, origin_inputs: [], requests: OWNERS.slice(0, owners).map((id, i) =>
        ({owner: `screen:${id}`, authority: 'scoped', unit: 'known', targets: fixture.targets[i]}))}));
      const supplemental = owners === Math.max(...config.owners);
      const entry = {owners, targets: owners === 1 ? 7 : 10, samples: [],
        supplemental_checks: supplemental ? 'executed' : `covered by ${Math.max(...config.owners)}-owner request`, diagnostics: {}, postwork: {}};
      output.cases.push(entry); let expected;
      const check = (result, record, state = clean, expectedState = 'HALT_READY_FOR_WORK', reference) => {
        try {
          const value = verify(result, fixture, owners, expectedState);
          if (reference) assert.deepEqual(value, reference, 'whole stdout and emitted artifact bytes must match');
          assert.deepEqual(repositoryState(fixture.root), state, 'repository bytes/modes/index/HEAD/status must be preserved');
          record.verified = true; return value;
        } catch (error) { Object.assign(record, {verified: false, verification_error: error.message, ...result}); throw error; }
      };
      for (let run = 0; run < config.runs; run++) for (const side of run % 2 ? ['after', 'before'] : ['before', 'after']) {
        const result = invoke(kits[side], fixture, work, out, temporary, config.timeout), sample = {side, run: run + 1, elapsed_ms: result.elapsed_ms};
        entry.samples.push(sample); const value = check(result, sample, clean, 'HALT_READY_FOR_WORK', expected); expected ??= value;
        console.error(`${config.shape}, ${config.inputs} inputs, ${owners} owners, ${side} ${run + 1}/${config.runs}: ${result.elapsed_ms.toFixed(1)} ms; output/packet/index/worktree/cleanup verified`);
      }
      entry.output_sha256 = hash(expected.stdout);
      entry.artifact_sha256 = Object.fromEntries(Object.entries(expected.artifacts).map(([name, value]) => [name, value === null ? null : hash(value)]));
      for (const metric of ['medians', 'means']) entry[metric] = Object.fromEntries(['before', 'after'].map((side) => {
        const values = entry.samples.filter((sample) => sample.side === side).map((sample) => sample.elapsed_ms);
        return [side, metric === 'medians' ? median(values) : values.reduce((a, b) => a + b, 0) / values.length];
      }));
      if (!supplemental) continue;
      for (const side of ['before', 'after']) {
        const file = path.join(scratch, `counts-${owners}-${side}.json`), record = entry.diagnostics[side] = {};
        check(invoke(kits[side], fixture, work, out, temporary, config.timeout, null, {hook, output: file}), record, clean, 'HALT_READY_FOR_WORK', expected);
        Object.assign(record, JSON.parse(fs.readFileSync(file, 'utf8')));
      }
      const checkpoint = path.join(scratch, `checkpoint-${owners}.md`); fs.writeFileSync(checkpoint, expected.artifacts.packet);
      const originals = new Map(fixture.targets.slice(0, owners).flat().map((target) => [target.path, fs.readFileSync(path.join(fixture.root, target.path))]));
      for (const [name, bytes] of originals) fs.writeFileSync(path.join(fixture.root, name), Buffer.concat([bytes, Buffer.from('// Controlled requested change.\n')]));
      const modified = repositoryState(fixture.root); let afterWork;
      try {
        for (const side of ['before', 'after']) {
          const record = entry.postwork[side] = {}, result = invoke(kits[side], fixture, work, post, temporary, config.timeout, checkpoint);
          const value = check(result, record, modified, 'DONE_PENDING_REVIEW', afterWork); afterWork ??= value;
          record.output_sha256 = hash(value.stdout); record.artifact_sha256 = Object.fromEntries(Object.entries(value.artifacts).map(([name, bytes]) => [name, hash(bytes)]));
        }
      } finally { for (const [name, bytes] of originals) fs.writeFileSync(path.join(fixture.root, name), bytes); }
      assert.deepEqual(repositoryState(fixture.root), clean, 'controlled postwork changes restored');
    }
  } catch (error) { output.failure = error.message; process.exitCode = 1; }
  finally { console.log(JSON.stringify(output, null, 2)); fs.rmSync(scratch, {recursive: true, force: true}); }
}
await main(process.argv.slice(2));
