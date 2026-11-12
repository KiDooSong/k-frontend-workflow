// Usage: node kit-dev/benchmarks/scoped-readiness.mjs <before-kit-root> <after-kit-root>
//        [runs=3] [matching-decision-bindings=0,8,24] [inputs=16] [units=2]
// Install both kits' dependencies first. Fresh-process timings run the actual
// readiness --work CLI with no instrumentation. Separate diagnostics count
// projection calls, filesystem operations and actual YAML document parses.
// The synthetic fixture follows binding-status.mjs: it intentionally preserves
// current/stale/missing declarations and expected denials. This is not a timing
// prediction of the consumer's reported thirty-minute readiness retry.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const usage = 'usage: node scoped-readiness.mjs <before-kit-root> <after-kit-root> [runs=3] [matching-decision-bindings=0,8,24] [inputs=16] [units=2]';
const OWNER = 'screen:COUPON-001';
const LIST = 'docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md';
const UNIT_IDS = ['list-behavior', 'list-interactions'];
const ZERO = `sha256:${'0'.repeat(64)}`;
const CONFIG = ['--docs', 'docs/frontend-workflow', '--src', 'src', '--policy', 'config/policy.yaml',
  '--manifest', 'config/manifest.yaml', '--layout', 'config/layout.yaml', '--owner', OWNER, '--json'];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inputId = (index) => `IN-20261111-meeting-${String(index + 1).padStart(4, '0')}`;
const inputRef = (index) => `input:${inputId(index)}#extracted-facts/01`;
const decisionId = (index) => `D-PERF-${String(index).padStart(4, '0')}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const md = (metadata, body) => `---\n${JSON.stringify(metadata)}\n---\n\n${body}\n`;

function integer(value, minimum) {
  const result = Number(value);
  assert.ok(Number.isSafeInteger(result) && result >= minimum, usage);
  return result;
}

function environment(extra = {}) {
  return { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: os.devNull,
    GIT_CONFIG_GLOBAL: os.devNull, GIT_ATTR_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0',
    GIT_AUTHOR_NAME: 'Synthetic Benchmark', GIT_AUTHOR_EMAIL: 'benchmark@example.invalid',
    GIT_COMMITTER_NAME: 'Synthetic Benchmark', GIT_COMMITTER_EMAIL: 'benchmark@example.invalid',
    GIT_AUTHOR_DATE: '2026-11-11T00:00:00Z', GIT_COMMITTER_DATE: '2026-11-11T00:00:00Z', ...extra };
}

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: environment(),
    stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function appendRows(body, heading, rows) {
  const start = body.indexOf(`\n## ${heading}\n`);
  assert.ok(start >= 0, `fixture requires ${heading}`);
  const next = body.indexOf('\n## ', start + 1), end = next < 0 ? body.length : next;
  return `${body.slice(0, end).trimEnd()}\n${rows.map((row) => `| ${row.join(' | ')} |`).join('\n')}\n\n${body.slice(end).trimStart()}`;
}

function runBindingCli(kit, fixture, scratch) {
  const temporary = fs.mkdtempSync(path.join(scratch, 'cli-tmp-'));
  try {
    const args = [path.join(kit, 'scripts/binding-status.mjs'), '--root', fixture, ...CONFIG];
    const started = performance.now();
    const result = spawnSync(process.execPath, args, { cwd: fixture, encoding: 'utf8',
      env: environment({ TMPDIR: temporary, TMP: temporary, TEMP: temporary }),
      maxBuffer: 64 * 1024 * 1024, timeout: 240000 });
    const elapsed = performance.now() - started;
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.signal, null, `CLI terminated: ${result.signal}`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, '', 'successful synthetic CLI must not emit errors');
    assert.deepEqual(fs.readdirSync(temporary), [], 'the private raw snapshot must be cleaned before returning');
    return { elapsed_ms: elapsed, stdout: result.stdout, report: JSON.parse(result.stdout) };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

async function createFixture(kit, root, scratch, matching, inputs, unitCount = UNIT_IDS.length) {
  const lib = (name) => import(pathToFileURL(path.join(kit, `scripts/lib/${name}.mjs`)).href);
  const [{ REQUIRED_ITEM_COLS }, { REQUIRED_REGISTER_COLS }] = await Promise.all([lib('reconciliation-items'), lib('reconciliation-register')]);
  const put = (name, value) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
  for (const directory of ['docs', 'src']) fs.cpSync(path.join(kit, 'examples/coupon-feature', directory), path.join(root, directory), { recursive: true });
  for (const [to, from] of [['policy.yaml', 'policies/implementation-mode-policy.yaml'], ['manifest.yaml', 'catalog/artifact-manifest.yaml'],
    ['layout.yaml', 'presets/expo-feature.yaml']]) put(`config/${to}`, fs.readFileSync(path.join(kit, from)));
  put('config/adoption.yaml', `work_execution: ${JSON.stringify({ version: 1, owners: [OWNER], profiles: ['visual', 'behavior'],
    role_limits: { visual: ['screen', 'domain_component', 'hook', 'test'], behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] })}\n`);
  put('frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: config/adoption.yaml\n');
  const extraIds = Array.from({ length: unitCount - UNIT_IDS.length }, (_, index) => `list-source-${String(index + 1).padStart(3, '0')}`);
  const unitIds = [...UNIT_IDS, ...extraIds];
  const units = { version: 1, units: [
    { id: UNIT_IDS[0], kind: 'behavior', contracts: ['artifact:COUPON-001-screen-spec#state-matrix'],
      sources: [{ input_id: inputId(0), items: ['01'], source_refs: [inputRef(0)] }] },
    { id: UNIT_IDS[1], kind: 'behavior', contracts: ['artifact:COUPON-001-screen-spec#interaction-matrix'], sources: [] },
    // Extra units select the same valid Item/source as the first unit. This
    // varies repeated source/validation work without inventing another input.
    ...extraIds.map((id) => ({ id, kind: 'behavior', contracts: ['artifact:COUPON-001-screen-spec#state-matrix'],
      sources: [{ input_id: inputId(0), items: ['01'], source_refs: [inputRef(0)] }] })),
  ] };
  const original = fs.readFileSync(path.join(root, LIST), 'utf8'), end = original.indexOf('\n---\n', 4);
  const common = { owner: OWNER, known_units: unitIds, blocks: [], basis_digest: ZERO, approval_ref: 'docs/approvals/performance.md#synthetic' };
  const bindings = Array.from({ length: matching }, (_, index) => ({ ...common, decision_id: decisionId(index) }));
  const extraBindings = [{ ...common, decision_id: 'D-PERF-STALE-UNITS', known_units: [UNIT_IDS[0]] },
    { ...common, decision_id: 'D-PERF-UNRESOLVED' }];
  const uncertainties = ['U-001', 'U-PERF-STALE', 'U-PERF-RESOLVED', 'U-PERF-UNRESOLVED']
    .map((unknown_id) => ({ ...common, unknown_id }));
  let body = appendRows(original.slice(end), 'Unknowns', [['U-PERF-STALE', 'A stale open question?', 'open'],
    ['U-PERF-RESOLVED', 'A resolved question?', 'resolved']]);
  body = appendRows(body, 'Open Decisions', [
    ...bindings.map((binding, index) => [binding.decision_id, `Synthetic choice ${index}`, 'choice-a / choice-b', 'final-fixture-ui', 'PM', index % 4 === 3 ? 'resolved' : 'open']),
    ['D-PERF-STALE-UNITS', 'Changed unit inventory?', 'choice-a / choice-b', 'final-fixture-ui', 'PM', 'open'],
  ]);
  const writeOwner = (decisions) => put(LIST, `${original.slice(0, end)}\nscreen_entry: src/features/coupons/screens/CouponListScreen.tsx` +
    `\nwork_execution: ${JSON.stringify(units)}\ndecision_work_scopes: ${JSON.stringify({ version: 1, bindings: [...decisions, ...extraBindings] })}` +
    `\nuncertainty_work_scopes: ${JSON.stringify({ version: 1, bindings: uncertainties })}${body}`);
  const summaryRows = [], itemRows = [];
  for (let index = 0; index < inputs; index++) {
    const id = inputId(index), ref = inputRef(index);
    const inputBody = `## Extracted Facts\n\n- Observation ${index}: preserve selected context.\n- Further observation ${index}: keep the displayed result.\n\n## Inventory\n\n` +
      table(['Item', 'Behavior'], Array.from({ length: 16 }, (_, row) => [`control-${index}-${row}`, `Keep state ${index}/${row} after loading.`]));
    put(`docs/frontend-workflow/inputs/_multi/${id}.md`, md({ input_id: id, input_type: 'meeting', source_type: 'meeting',
      source_ref: `meeting:performance-${index}`, captured_at: '2026-11-11T00:00:00Z', captured_by: 'synthetic-benchmark',
      status: 'captured', affected_domains: ['coupons'], affected_screens: ['COUPON-001'] }, inputBody));
    summaryRows.push(index === 0 ? [id, 'meeting', 'simple-update×1', 'partially-reconciled', 'pending', 'artifact:COUPON-001-screen-spec', '-', '-']
      : [id, 'meeting', 'reject-input', 'reconciled', 'rejected', '-', '-', '-']);
    itemRows.push(index === 0 ? [id, '01', 'compatible-fact', 'simple-update', 'update', 'artifact:COUPON-001-screen-spec#state-matrix', ref, 'inherit', 'statement', 'inherit']
      : [id, '01', 'reject', 'reject-input', 'reject', '-', ref, 'inherit', 'statement', 'inherit']);
  }
  put('docs/frontend-workflow/_meta/reconciliation-register.md', md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1',
    structured_since: '2026-11-10T00:00:00Z' }, `${table(REQUIRED_REGISTER_COLS, summaryRows)}\n\n## Reconciliation Items\n\n${table(REQUIRED_ITEM_COLS, itemRows)}`));
  git(root, 'init', '--quiet', '--object-format=sha1');
  for (const [key, value] of [['gc.auto', '0'], ['maintenance.auto', 'false'], ['core.autocrlf', 'false'], ['core.filemode', 'true']]) git(root, 'config', key, value);
  const commit = (message) => { git(root, 'add', '-A'); git(root, 'commit', '-qm', message); };
  // Compute one existing Decision and Unknown binding during fixture setup.
  // Binding lists are omitted from projected document metadata. These targets'
  // known_units/blocks stay fixed, so restoring the other rows' declarations
  // keeps both digests current; the report assertions below check this.
  writeOwner(bindings.slice(0, 1)); commit('Prepare synthetic binding statuses');
  const preparation = runBindingCli(kit, root, scratch).report;
  const rows = new Map(preparation.owners[0].rows.map((row) => [row.ref, row]));
  uncertainties[0].basis_digest = rows.get('unknown:U-001@COUPON-001-screen-spec').computed_basis_digest;
  assert.notEqual(uncertainties[0].basis_digest, null);
  if (matching) {
    bindings[0].basis_digest = rows.get(`decision:${decisionId(0)}@COUPON-001-screen-spec`).computed_basis_digest;
    assert.notEqual(bindings[0].basis_digest, null);
  }
  writeOwner(bindings); commit('Record synthetic binding states');
  return { root, matching, inputs, unit_ids: unitIds, commit: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}') };
}

function repositoryState(root) {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, env: environment() }).toString('utf8').split('\0').filter(Boolean);
  const digest = createHash('sha256');
  for (const name of files) {
    const file = path.join(root, name), stat = fs.lstatSync(file);
    digest.update(JSON.stringify([name, stat.mode & 0o777])).update('\0');
    digest.update(stat.isSymbolicLink() ? fs.readlinkSync(file) : fs.readFileSync(file)).update('\0');
  }
  return { commit: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}'),
    files: files.length, contents_sha256: digest.digest('hex'), index_sha256: sha256(fs.readFileSync(path.join(root, '.git/index'))),
    status: git(root, 'status', '--porcelain') };
}

function workRequest(scratch, matching) {
  const file = path.join(scratch, `request-${matching}.json`);
  fs.writeFileSync(file, JSON.stringify({ version: 1, origin_inputs: [], requests: [{
    owner: OWNER, authority: 'scoped', unit: UNIT_IDS[1],
    targets: [{ path: 'src/features/coupons/screens/CouponListScreen.tsx', change: 'M' }],
  }] }));
  return file;
}

function runReadiness(kit, fixture, work, scratch, diagnostic) {
  const temporary = fs.mkdtempSync(path.join(scratch, 'readiness-tmp-'));
  try {
    const args = [...(diagnostic ? ['--import', diagnostic.hook] : []), path.join(kit, 'scripts/readiness.mjs'),
      '--root', fixture, '--work', work, '--docs', 'docs/frontend-workflow', '--src', 'src',
      '--policy', 'config/policy.yaml', '--manifest', 'config/manifest.yaml', '--layout', 'config/layout.yaml', '--json'];
    const started = performance.now();
    const child = spawnSync(process.execPath, args, { cwd: fixture, encoding: 'utf8',
      env: environment({ TMPDIR: temporary, TMP: temporary, TEMP: temporary,
        ...(diagnostic ? { FWKIT_SCOPED_BENCH_KIT: kit, FWKIT_SCOPED_BENCH_COUNTS: diagnostic.output } : {}) }),
      maxBuffer: 64 * 1024 * 1024, timeout: 240000 });
    return { elapsed_ms: performance.now() - started, stdout: child.stdout || '', stderr: child.stderr || '',
      status: child.status, signal: child.signal, error: child.error?.message ?? null,
      snapshot_cleaned: fs.readdirSync(temporary).length === 0 };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function verifyReport(report, fixture) {
  assert.equal(report.work_contract, 1); assert.equal(report.authority, 'scoped');
  assert.equal(report.approval_verified, false); assert.equal(report.semantic_coverage_verified, false);
  assert.equal(report.snapshot.commit, fixture.commit); assert.equal(report.snapshot.tree, fixture.tree);
  assert.deepEqual(report.errors, [], 'fixture must pass structural authority validation');
  assert.equal(report.ready, false, 'missing/stale Decisions and uncertainties remain blocking');
  assert.equal(report.requests.length, 1);
  assert.equal(report.requests[0].owner, OWNER); assert.equal(report.requests[0].unit, UNIT_IDS[1]);
  assert.equal(report.requests[0].ready, false);
  assert.deepEqual(report.requests[0].path_authorizations, [{ allowed: false, change: 'M',
    path: 'src/features/coupons/screens/CouponListScreen.tsx', reasons: [] }]);
  assert.deepEqual(report.denials.map((denial) => denial.code).sort(),
    ['api-selection-required', 'unit-decision-blocked', 'unit-uncertainty-unresolved']);
}

function diagnosticHook(scratch) {
  const loader = path.join(scratch, 'scoped-count-loader.mjs');
  fs.writeFileSync(loader, String.raw`import path from 'node:path';
import {pathToFileURL} from 'node:url';
const prefix=pathToFileURL(path.join(process.env.FWKIT_SCOPED_BENCH_KIT,'scripts/lib/')).href;
const names=['resolveScopedUnitProjection','resolveScopedDecisionProjection','resolveScopedUncertaintyProjection',
  'resolveScopedBoundaryProjection','resolveScopedApplicabilityProjection','resolveScopedSnapshotApplicabilityProjection',
  'createScopedSnapshotApplicabilitySession',
  'resolveScopedBindingBasis','inspectScopedDecisionBindings','inspectScopedSnapshotDecisionBindings',
  'inspectScopedProfile','inspectScopedSnapshotProfile','inspectScopedPaths','inspectScopedOwner','inspectScopedSnapshotOwner',
  'inspectScopedSnapshotSurfaceHosts','inspectScopedSnapshotWorkRequests','scopedBindingBasis',
  'createScopedSourceResolver','validateInputArtifacts','validateCurrentReconciliation'];
export async function load(url,context,nextLoad){
  const result=await nextLoad(url,context);
  if(!url.startsWith(prefix)||!url.endsWith('.mjs'))return result;
  let source=String(result.source);
  for(const name of names){
    const signature=new RegExp('export function '+name+'\\([\\s\\S]*?\\) \\{');
    if(signature.test(source))source=source.replace(signature,match=>match+'\nglobalThis.__fwkitScopedBenchmarkCounts['+JSON.stringify(name)+']=(globalThis.__fwkitScopedBenchmarkCounts['+JSON.stringify(name)+']||0)+1;');
  }
  return {...result,source};
}
`);
  const hook = path.join(scratch, 'scoped-counts.mjs');
  fs.writeFileSync(hook, String.raw`import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire,register,syncBuiltinESMExports} from 'node:module';
const kit=process.env.FWKIT_SCOPED_BENCH_KIT;
globalThis.__fwkitScopedBenchmarkCounts={};
register(new URL('./scoped-count-loader.mjs',import.meta.url),import.meta.url);
const yaml=createRequire(path.join(kit,'package.json'))('yaml');
const parseYaml=yaml.parse,parseYamlDocument=yaml.parseDocument;
let yamlParseApiCalls=0,yamlParseDocumentCalls=0;
// Install before util captures YAML's CommonJS named export. yaml.parse uses a
// private parseDocument, so these entry points count actual document parses once.
yaml.parse=function(...args){yamlParseApiCalls++;return parseYaml.apply(this,args);};
yaml.parseDocument=function(...args){yamlParseDocumentCalls++;return parseYamlDocument.apply(this,args);};
const {reconciliationParseStats}=await import(pathToFileURL(path.join(kit,'scripts/lib/reconciliation-markdown-ast.mjs')).href);
yamlParseApiCalls=0;yamlParseDocumentCalls=0;
const counts={};
for(const name of ['lstatSync','statSync','readdirSync','realpathSync','readSync','readFileSync']){
  const original=fs[name];counts[name]=0;
  fs[name]=function(...args){counts[name]++;return original.apply(this,args);};
}
syncBuiltinESMExports();
process.on('exit',()=>{
  const usage=process.resourceUsage();
  fs.writeFileSync(process.env.FWKIT_SCOPED_BENCH_COUNTS,JSON.stringify({functions:globalThis.__fwkitScopedBenchmarkCounts,
    counts,yaml_parse_calls:yamlParseApiCalls+yamlParseDocumentCalls,yaml_parse_api_calls:yamlParseApiCalls,
    yaml_parse_document_calls:yamlParseDocumentCalls,parse:reconciliationParseStats(),
    instrumented_peak_rss_kib:usage.maxRSS,instrumented_user_cpu_us:usage.userCPUTime,
    instrumented_system_cpu_us:usage.systemCPUTime}));
});
`);
  return hook;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b), half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}

async function main(args) {
  assert.ok(args.length >= 2 && args.length <= 6, usage);
  const redirected = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS', 'NODE_V8_COVERAGE', 'NODE_OPTIONS']
    .filter((name) => process.env[name] !== undefined);
  assert.equal(redirected.length, 0, `run without redirection or Node instrumentation variables: ${redirected.join(', ')}`);
  const kits = { before: path.resolve(args[0]), after: path.resolve(args[1]) };
  assert.equal(fs.statSync(kits.before).dev, fs.statSync(kits.after).dev,
    'before/after kit roots must be on the same filesystem; stage both under one parent directory');
  const runs = integer(args[2] ?? '3', 1), counts = (args[3] ?? '0,8,24').split(',').map((value) => integer(value, 0));
  assert.equal(new Set(counts).size, counts.length, 'binding counts must be unique');
  const inputs = integer(args[4] ?? '16', 1), units = integer(args[5] ?? String(UNIT_IDS.length), UNIT_IDS.length);
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fwkit-scoped-benchmark-')));
  const cases = [], output = {
    benchmark: 'scoped-readiness-cli', node: process.version, platform: `${process.platform}/${process.arch}`,
    kits, runs, method: {
      timing: 'Fresh Node processes run the public readiness --work --json CLI. Wall time includes startup, raw Git materialization, full scoped preparation, output and cleanup. Alternating before/after order; every sample is retained. No diagnostic hooks or warm-up exclusion.',
      diagnostics: 'Separate untimed processes count selected exported projection functions with an ESM loader and fs/YAML calls with import hooks; they report their own process peak RSS and user/system CPU. The counters start after the parser import. Diagnostic CPU/RSS spans the whole instrumented process, including its loader worker, excludes Git child CPU/RSS, and is not timed-run memory/CPU or retained memory.',
      verification: 'Exact entire stdout, including prerequisite results, denials, digests and pinned read sets, must agree across kits/runs; original HEAD/tree/index bytes/tracked worktree bytes and modes/status stay unchanged; private snapshots are removed before returning.',
      fixture: 'One synthetic screen owner, one selected behavior unit, configurable declared units/input inventory/matching Decision bindings. Current/stale/missing bindings and API/uncertainty blockers intentionally remain; valid structural authority produces errors=[] and ready=false. Extra units select the first unit\'s existing source Item. Fixture preparation uses the before kit binding-status CLI outside timings.',
      scope: 'This exercises repeated owner/binding preparation. It is not the consumer repository and does not reproduce or predict its reported thirty-minute scoped readiness retry.',
    }, cases,
  };
  try {
    const hook = diagnosticHook(scratch);
    for (const matching of counts) {
      const fixture = await createFixture(kits.before, path.join(scratch, `project-${matching}`), scratch, matching, inputs, units);
      const work = workRequest(scratch, matching), state = repositoryState(fixture.root), samples = [], diagnostics = {};
      assert.equal(state.status, '', 'fixture must begin clean');
      const entry = { matching_decision_bindings: matching, declared_units: units, generated_inputs: inputs,
        commit: fixture.commit, tree: fixture.tree, tracked_files: state.files, samples, diagnostics };
      cases.push(entry);
      let expected;
      const verify = (result, record) => {
        try {
          assert.equal(result.error, null, result.error); assert.equal(result.signal, null);
          assert.equal(result.status, 0, result.stderr || result.stdout); assert.equal(result.stderr, '');
          assert.equal(result.snapshot_cleaned, true, 'the private raw snapshot must be cleaned before returning');
          verifyReport(JSON.parse(result.stdout), fixture);
          if (expected === undefined) { expected = result.stdout; entry.report_sha256 = sha256(expected); }
          else assert.equal(result.stdout, expected, 'entire scoped CLI report must stay byte-identical');
          assert.deepEqual(repositoryState(fixture.root), state, 'HEAD/tree/index/worktree bytes/modes/status must stay unchanged');
          record.verified = true;
        } catch (error) {
          // Keep every adverse sample and the actual failed output; do not retry
          // or silently leave it out of the reported comparison.
          Object.assign(record, { verified: false, verification_error: error.message,
            error: result.error, status: result.status, signal: result.signal,
            snapshot_cleaned: result.snapshot_cleaned, stdout: result.stdout, stderr: result.stderr });
          throw error;
        }
      };
      for (let run = 0; run < runs; run++) for (const side of run % 2 ? ['after', 'before'] : ['before', 'after']) {
        const result = runReadiness(kits[side], fixture.root, work, scratch);
        const sample = { side, run: run + 1, elapsed_ms: result.elapsed_ms }; samples.push(sample); verify(result, sample);
        console.error(`${units} units, ${inputs} inputs, ${matching} matching bindings, run ${run + 1}/${runs}, ${side}: ${result.elapsed_ms.toFixed(1)} ms; report/index/worktree/cleanup verified`);
      }
      entry.medians = Object.fromEntries(['before', 'after'].map((side) => [side,
        { elapsed_ms: median(samples.filter((sample) => sample.side === side).map((sample) => sample.elapsed_ms)) }]));
      entry.means = Object.fromEntries(['before', 'after'].map((side) => [side,
        { elapsed_ms: samples.filter((sample) => sample.side === side).reduce((sum, sample) => sum + sample.elapsed_ms, 0) / runs }]));
      for (const side of ['before', 'after']) {
        const file = path.join(scratch, `counts-${matching}-${side}.json`);
        const result = runReadiness(kits[side], fixture.root, work, scratch, { hook, output: file });
        const diagnostic = diagnostics[side] = {}; verify(result, diagnostic);
        Object.assign(diagnostic, JSON.parse(fs.readFileSync(file, 'utf8')));
      }
    }
  } catch (error) {
    output.failure = error.message; process.exitCode = 1;
  } finally {
    console.log(JSON.stringify(output, null, 2));
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

await main(process.argv.slice(2));
