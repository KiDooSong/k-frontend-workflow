// Usage: node kit-dev/benchmarks/binding-status.mjs <before-kit-root> <after-kit-root>
//        [runs=3] [matching-decision-bindings=0,8,24] [inputs=16] [units=2] [unbound-rows=0]
// Install both kits' dependencies first. Timed samples run the actual public CLI
// in fresh processes without instrumentation. Separate diagnostic runs count
// function/filesystem/YAML calls and report their own inclusive function time,
// process peak RSS and CPU time. Unbound rows vary owner-wide applicability
// independently of recorded binding count. This synthetic corpus does not
// reproduce or predict the reported consumer run.
// Accessor calls include cache hits. sectionOccurrences.raw_reference_view_builds
// counts actual structural section/table construction (includeNodes=true).
// raw_tables reports the kit's scopedRawTableStats() unchanged: tables counts
// actual encodings; newer kits also report row-index builds/rows and reuse.
// Missing counters in an older baseline are unavailable, not zero.
// input_metadata is optional kit diagnostics; structured_clone separately counts
// actual clone calls, including metadata output copies that remain necessary.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const usage = 'usage: node binding-status.mjs <before-kit-root> <after-kit-root> [runs=3] [matching-decision-bindings=0,8,24] [inputs=16] [units=2] [unbound-rows=0]';
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
const unboundId = (index) => `${index % 2 ? 'U' : 'D'}-UNBOUND-${String(index).padStart(4, '0')}`;
const unboundStatus = (index) => index % 8 < 2 ? 'open' : 'resolved';
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

function runCli(kit, fixture, scratch, diagnostic) {
  const temporary = fs.mkdtempSync(path.join(scratch, 'cli-tmp-'));
  try {
    const args = [...(diagnostic ? ['--import', diagnostic.hook] : []), path.join(kit, 'scripts/binding-status.mjs'),
      '--root', fixture, ...CONFIG];
    const started = performance.now();
    const result = spawnSync(process.execPath, args, { cwd: fixture, encoding: 'utf8',
      env: environment({ TMPDIR: temporary, TMP: temporary, TEMP: temporary,
        ...(diagnostic ? { FWKIT_BINDING_BENCH_KIT: kit, FWKIT_BINDING_BENCH_COUNTS: diagnostic.output } : {}) }),
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

async function createFixture(kit, root, scratch, matching, inputs, unitCount = UNIT_IDS.length, unboundRows = 0) {
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
    ['U-PERF-RESOLVED', 'A resolved question?', 'resolved'],
    ...Array.from({ length: unboundRows }, (_, index) => index).filter((index) => index % 2)
      .map((index) => [unboundId(index), `Unbound historical question ${index}?`, unboundStatus(index)])]);
  body = appendRows(body, 'Open Decisions', [
    ...bindings.map((binding, index) => [binding.decision_id, `Synthetic choice ${index}`, 'choice-a / choice-b', 'final-fixture-ui', 'PM', index % 4 === 3 ? 'resolved' : 'open']),
    ['D-PERF-STALE-UNITS', 'Changed unit inventory?', 'choice-a / choice-b', 'final-fixture-ui', 'PM', 'open'],
    ...Array.from({ length: unboundRows }, (_, index) => index).filter((index) => !(index % 2))
      .map((index) => [unboundId(index), `Unbound historical choice ${index}?`, 'choice-a / choice-b', 'final-fixture-ui', 'PM', unboundStatus(index)]),
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
  const preparation = runCli(kit, root, scratch).report;
  const rows = new Map(preparation.owners[0].rows.map((row) => [row.ref, row]));
  uncertainties[0].basis_digest = rows.get('unknown:U-001@COUPON-001-screen-spec').computed_basis_digest;
  assert.notEqual(uncertainties[0].basis_digest, null);
  if (matching) {
    bindings[0].basis_digest = rows.get(`decision:${decisionId(0)}@COUPON-001-screen-spec`).computed_basis_digest;
    assert.notEqual(bindings[0].basis_digest, null);
  }
  writeOwner(bindings); commit('Record synthetic binding states');
  return { root, matching, inputs, unbound_rows: unboundRows, unit_ids: unitIds,
    commit: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}') };
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

function verifyReport(report, fixture) {
  assert.equal(report.binding_status, 1); assert.equal(report.basis_version, 2); assert.equal(report.approval_verified, false);
  assert.deepEqual(report.snapshot, { commit: fixture.commit, tree: fixture.tree });
  assert.equal(report.owners.length, 1); assert.equal(report.owners[0].owner, OWNER);
  assert.deepEqual(report.owners[0].known_units, [...(fixture.unit_ids || UNIT_IDS)].sort());
  const rows = new Map(report.owners[0].rows.map((row) => [row.ref, row]));
  const get = (kind, id) => { const row = rows.get(`${kind}:${id}@COUPON-001-screen-spec`); assert.ok(row, `${kind}:${id}`); return row; };
  assert.equal(get('decision', 'D-001').state, 'missing');
  assert.equal(get('decision', 'D-PERF-STALE-UNITS').stale_reason, 'known-units');
  assert.equal(get('decision', 'D-PERF-UNRESOLVED').state, 'unresolved');
  assert.equal(get('unknown', 'U-001').state, 'current');
  assert.equal(get('unknown', 'U-PERF-STALE').stale_reason, 'basis');
  assert.equal(get('unknown', 'U-PERF-RESOLVED').resolved, true);
  assert.equal(get('unknown', 'U-PERF-UNRESOLVED').state, 'unresolved');
  for (let index = 0; index < fixture.matching; index++) {
    const row = get('decision', decisionId(index));
    assert.equal(row.state, index === 0 ? 'current' : 'stale');
    assert.equal(row.resolved, index % 4 === 3);
    assert.match(row.computed_basis_digest, /^sha256:[a-f0-9]{64}$/);
  }
  for (let index = 0; index < fixture.unbound_rows; index++) {
    const row = get(index % 2 ? 'unknown' : 'decision', unboundId(index));
    assert.equal(row.state, 'missing');
    assert.equal(row.resolved, unboundStatus(index) === 'resolved');
    assert.equal(row.recorded, null);
    assert.equal(row.computed_basis_digest, null, 'missing rows must not acquire invented bindings or digests');
    if (row.resolved) assert.deepEqual(row.blocking_units, []);
  }
}

function diagnosticHook(scratch) {
  const loader = path.join(scratch, 'binding-count-loader.mjs');
  fs.writeFileSync(loader, String.raw`import path from 'node:path';
import {pathToFileURL} from 'node:url';
const prefix=pathToFileURL(path.join(process.env.FWKIT_BINDING_BENCH_KIT,'scripts/lib/')).href;
const names=['resolveScopedUnitProjection','resolveScopedDecisionProjection','resolveScopedUncertaintyProjection',
  'resolveScopedBoundaryProjection','resolveScopedApplicabilityProjection','resolveScopedSnapshotApplicabilityProjection',
  'scopedBindingBasis','relationClosure','withoutDecisionRefs','scopedBasisComponentDigests','scopeJson','scopeSet',
  'scopedUnknownAuthored','parseReconciliationReferenceView','sharedReconciliationReferenceView','sectionOccurrences',
  'resolveScopedContractGraph','createScopedReferenceResolver','scopedGraphSelectionRefs',
  'createScopedSourceResolver','buildInputArtifactIndex','validateInputArtifacts','prepareScopedInputMetadata'];
export async function load(url,context,nextLoad){
  const result=await nextLoad(url,context);
  if(!url.startsWith(prefix)||!url.endsWith('.mjs'))return result;
  let source=String(result.source);
  for(const name of names){
    const signature=new RegExp('(export )?function '+name+'\\([\\s\\S]*?\\) \\{');
    source=source.replace(signature,(match,ex='')=>ex+'function '+name+'(...args){return globalThis.__fwkitBindingMeasure('+JSON.stringify(name)+',__fwkitOriginal_'+name+',this,args);}\nfunction __fwkitOriginal_'+name+match.slice(match.indexOf('(')));
  }
  return {...result,source};
}
`);
  const file = path.join(scratch, 'counts.mjs');
  fs.writeFileSync(file, `import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {types} from 'node:util';
import {createRequire,register,syncBuiltinESMExports} from 'node:module';
const kit=process.env.FWKIT_BINDING_BENCH_KIT;
const functions={}, depths=new Map();
globalThis.__fwkitBindingMeasure=(name,fn,receiver,args)=>{
  const depth=depths.get(name)||0;depths.set(name,depth+1);
  const record=functions[name]??={calls:0,outer_calls:0,inclusive_us:0,serialized_bytes:0};
  record.calls++;if(!depth)record.outer_calls++;
  if(name==='sectionOccurrences'&&args[3]?.includeNodes===true)record.raw_reference_view_builds=(record.raw_reference_view_builds||0)+1;
  const started=depth?0n:process.hrtime.bigint();
  try{
    const result=fn.apply(receiver,args);
    if(name==='scopeJson')record.serialized_bytes+=Buffer.byteLength(result);
    return result;
  }finally{
    if(!depth)record.inclusive_us+=Number(process.hrtime.bigint()-started)/1000;
    depths.set(name,depth);
  }
};
register(new URL('./binding-count-loader.mjs',import.meta.url),import.meta.url);
const yaml=createRequire(path.join(kit,'package.json'))('yaml');
const parseYaml=yaml.parse, parseYamlDocument=yaml.parseDocument;
let yamlParseApiCalls=0, yamlParseDocumentCalls=0;
// Install before util.mjs captures YAML's named CommonJS export. This is a
// separate diagnostic process; timed CLI processes never load the hook.
// yaml.parse calls its private lexical parseDocument, not the exported method,
// so summing these entry points counts each actual document parse once.
yaml.parse=function(...args){yamlParseApiCalls++;return parseYaml.apply(this,args);};
yaml.parseDocument=function(...args){yamlParseDocumentCalls++;return parseYamlDocument.apply(this,args);};
const {reconciliationParseStats}=await import(pathToFileURL(path.join(kit,'scripts/lib/reconciliation-markdown-ast.mjs')).href);
const {scopedClosureStats}=await import(pathToFileURL(path.join(kit,'scripts/lib/scoped-work-basis.mjs')).href);
const {scopedRawTableStats}=await import(pathToFileURL(path.join(kit,'scripts/lib/scoped-work-refs.mjs')).href);
const metadataModule=path.join(kit,'scripts/lib/scoped-work-input-metadata.mjs');
const metadataStats=fs.existsSync(metadataModule)
  ? (await import(pathToFileURL(metadataModule).href)).scopedInputMetadataStats : undefined;
yamlParseApiCalls=0;yamlParseDocumentCalls=0;
const cloneCounts={calls:0,input_metadata:0,source_constructor_input_metadata:0,preparation_input_metadata:0,other_input_metadata:0};
const clone=globalThis.structuredClone;
globalThis.structuredClone=function(...args){
  cloneCounts.calls++;
  const value=args[0];
  // Descriptor-only classification never evaluates metadata getters. Proxies
  // stay unclassified so this diagnostic adds no property traps to cloning.
  if(value&&typeof value==='object'&&!types.isProxy(value)&&
    ['input_id','input_type','source_type'].every(key=>{
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      return descriptor&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='string';
    })){
    cloneCounts.input_metadata++;
    cloneCounts[depths.get('createScopedSourceResolver')?'source_constructor_input_metadata':
      depths.get('prepareScopedInputMetadata')?'preparation_input_metadata':'other_input_metadata']++;
  }
  return clone.apply(this,args);
};
const counts={};
for(const name of ['lstatSync','statSync','readdirSync','realpathSync','readSync','readFileSync']){
  const original=fs[name];counts[name]=0;
  fs[name]=function(...args){counts[name]++;return original.apply(this,args);};
}
syncBuiltinESMExports();
process.on('exit',()=>{
  const usage=process.resourceUsage();
  fs.writeFileSync(process.env.FWKIT_BINDING_BENCH_COUNTS,JSON.stringify({functions,closure:scopedClosureStats(),raw_tables:typeof scopedRawTableStats==='function'?scopedRawTableStats():null,input_metadata:typeof metadataStats==='function'?metadataStats():null,structured_clone:cloneCounts,counts,yaml_parse_calls:yamlParseApiCalls+yamlParseDocumentCalls,yaml_parse_api_calls:yamlParseApiCalls,yaml_parse_document_calls:yamlParseDocumentCalls,parse:reconciliationParseStats(),instrumented_peak_rss_kib:usage.maxRSS,instrumented_user_cpu_us:usage.userCPUTime,instrumented_system_cpu_us:usage.systemCPUTime}));
});
`);
  return file;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b), half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}

async function main(args) {
  assert.ok(args.length >= 2 && args.length <= 7, usage);
  const redirected = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS', 'NODE_V8_COVERAGE', 'NODE_OPTIONS']
    .filter((name) => process.env[name] !== undefined);
  assert.equal(redirected.length, 0, `run without redirection or Node instrumentation variables: ${redirected.join(', ')}`);
  const kits = { before: path.resolve(args[0]), after: path.resolve(args[1]) };
  // Startup imports are timed too. Stage both source trees on one filesystem so
  // a /tmp checkout and a differently mounted workspace cannot confound them.
  assert.equal(fs.statSync(kits.before).dev, fs.statSync(kits.after).dev,
    'before/after kit roots must be on the same filesystem; stage both under one parent directory');
  const runs = integer(args[2] ?? '3', 1), counts = (args[3] ?? '0,8,24').split(',').map((value) => integer(value, 0)), inputs = integer(args[4] ?? '16', 1);
  const unitCount = integer(args[5] ?? String(UNIT_IDS.length), UNIT_IDS.length);
  const unboundRows = integer(args[6] ?? '0', 0);
  assert.equal(new Set(counts).size, counts.length, 'binding counts must be unique');
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fwkit-binding-benchmark-'))), cases = [];
  try {
    const hook = diagnosticHook(scratch);
    for (const matching of counts) {
      const fixture = await createFixture(kits.before, path.join(scratch, `project-${matching}`), scratch, matching, inputs, unitCount, unboundRows);
      const state = repositoryState(fixture.root), samples = [];
      assert.equal(state.status, '', 'fixture must begin clean');
      let expected;
      const verify = (result) => {
        verifyReport(result.report, fixture);
        if (expected === undefined) expected = result.stdout;
        else assert.equal(result.stdout, expected, 'the entire CLI report, including every digest, must be byte-identical');
        assert.deepEqual(repositoryState(fixture.root), state, 'HEAD, worktree bytes/modes and original index bytes must stay unchanged');
      };
      for (let run = 0; run < runs; run++) for (const side of run % 2 ? ['after', 'before'] : ['before', 'after']) {
        const result = runCli(kits[side], fixture.root, scratch); verify(result);
        samples.push({ side, run: run + 1, elapsed_ms: result.elapsed_ms });
        console.error(`${unitCount} units, ${inputs} inputs, ${matching} matching bindings, ${unboundRows} extra unbound rows, run ${run + 1}/${runs}, ${side}: ${result.elapsed_ms.toFixed(1)} ms; exact report/index/worktree verified`);
      }
      const diagnostics = {};
      for (const side of ['before', 'after']) {
        const output = path.join(scratch, `counts-${matching}-${side}.json`);
        verify(runCli(kits[side], fixture.root, scratch, { hook, output }));
        diagnostics[side] = JSON.parse(fs.readFileSync(output, 'utf8'));
      }
      const medians = Object.fromEntries(['before', 'after'].map((side) => [side,
        { elapsed_ms: median(samples.filter((sample) => sample.side === side).map((sample) => sample.elapsed_ms)) }]));
      cases.push({ matching_decision_bindings: matching, declared_units: unitCount, generated_inputs: inputs, extra_unbound_rows: unboundRows,
        commit: fixture.commit, tree: fixture.tree, tracked_files: state.files, report_sha256: sha256(expected),
        row_count: JSON.parse(expected).owners[0].rows.length, medians,
        speedup: medians.before.elapsed_ms / medians.after.elapsed_ms, samples, diagnostics });
    }
    console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, runs, kits,
      measurement: {
        elapsed_ms: 'Fresh actual public binding-status CLI process per kit/case/run, including startup/imports, Git snapshot materialization, evaluation, JSON output and cleanup. No instrumentation in timed runs. Setup and independent verification excluded.',
        order: 'Before/after order alternates. Both kit roots must be on the same filesystem. Both versions use the same committed fixture and exact CLI flags. Fixture setup warms the filesystem cache; this is not cold-storage latency.',
        diagnostics: 'Separate untimed processes count selected functions with an ESM loader, filesystem calls and YAML document parses (yaml.parse plus direct yaml.parseDocument), and report their own peak RSS plus user/system CPU microseconds. Function inclusive_us includes nested calls and instrumentation overhead; do not sum overlapping phases or treat these as uninstrumented timings. Recursive functions time only outer calls; scopeJson serialized_bytes counts every returned canonical string. raw_tables contains the kit\'s available raw-table counters: tables counts actual encodings; indexes/indexedRows count index builds/visited rows; reusedTables/reusedIndexes count cache hits. input_metadata contains optional preparation/source-clone diagnostics: prepared counts preparation copies, fallbacks counts unsupported preparation values, cloned counts legacy source-constructor copies, and reused counts privately prepared metadata reuse. An older kit without this module reports null. structured_clone counts actual global clone calls after imports; input_metadata classifies nonProxy values with own data string input_id/input_type/source_type fields. source_constructor_input_metadata and preparation_input_metadata classify the active constructor/preparation contexts; other_input_metadata counts direct metadata copies outside both contexts, including output metadata. Clones of larger output wrappers count in total calls but are not classified as direct metadata copies. No getter is evaluated for classification. Unavailable fields stay absent and an unavailable accessor is null. These are not timed-run memory/CPU or retained memory. YAML interception is installed before kit imports; YAML counters reset after imports. Resource usage spans the diagnostic process lifetime including its loader worker and excludes child Git process CPU/RSS.',
        verification: 'Whole stdout bytes, snapshot commit/tree, every binding state and digest agree across kits/runs; original HEAD, index bytes and tracked worktree bytes/modes stay unchanged; private snapshots are removed.',
        scope: 'Synthetic one-owner workload with configurable input/binding/unit counts, selected source/Items and mixed binding states. Extra units select the first unit\'s existing source Item. Optional unbound rows alternate Decision/Unknown and include open/resolved rows; these enlarge applicability without computing invented binding digests. It is not a reproduction or timing prediction of the reported consumer execution.',
      }, cases }, null, 2));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

await main(process.argv.slice(2));
