import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { resolveScopedApplicabilityProjection } from './scoped-work-applicability.mjs';
import { inspectScopedUncertaintyScopes, resolveScopedUncertaintyBindingBasis, scopedUncertaintyDenials,
  scopedUncertaintyScopes } from './scoped-work-uncertainty-scopes.mjs';

// #262: a human binding narrows an open Unknown/Conflict's unproven (native) relation,
// with decision_work_scopes' shape, digest and approval rules. Recording a computed
// digest in this synthetic fixture is NOT human approval.
const OWNER = 'screen:RESULT-001', SECOND = 'screen:RESULT-002';
const ROOT = 'src/features/result', HOME = 'uncertainty.md';
const UNKNOWN = 'unknown:U-ONE@UNCERTAINTY', CONFLICT = 'conflict:C-ONE@UNCERTAINTY', UNITS = ['known', 'other'];
const ZERO = `sha256:${'0'.repeat(64)}`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const unit = (id = 'known') => ({ id, kind: 'behavior', contracts: [`artifact:RULES#${id === 'other' ? 'other' : 'rules'}`], sources: [] });
const binding = (overrides = {}) => ({ unknown_id: 'U-ONE', owner: OWNER, known_units: [...UNITS], blocks: ['other'],
  basis_digest: ZERO, approval_ref: 'review:unverified-fixture', ...overrides });
const unknowns = (rows) => `## Unknowns\n${table(['ID', 'Question', 'Status'], rows)}`;
const conflicts = (rows) => `## Conflicts\n${table(['ID', 'Description', 'Status'], rows)}`;
const BODY = `${unknowns([['U-ONE', 'Which state applies?', 'open']])}\n\n${conflicts([['C-ONE', 'Planning and Figma disagree.', 'open']])}`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-uncertainty-scopes-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs'), kitRoot = path.join(root, '.kit'), docs = new Map();
  fs.mkdirSync(kitRoot);
  const policyFile = path.join(kitRoot, 'policy.yaml'), layoutFile = path.join(kitRoot, 'layout.yaml');
  const manifestFile = path.join(kitRoot, 'manifest.yaml');
  const put = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
  put(policyFile, { work_execution: { version: 1, owners: [OWNER], profiles: ['behavior'],
    role_limits: { behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } });
  put(layoutFile, { roles: { screen: ['src/features/{domain}/screens/**'], domain_component: ['src/features/{domain}/components/**'],
    hook: ['src/features/{domain}/hooks/**'], api_client: ['src/api/**'], test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'] } });
  put(manifestFile, { version: 1, artifacts: {} });
  const write = (name, fm, text) => {
    const file = path.join(docsDir, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, md(fm, text)); docs.set(name, file); return file;
  };
  const change = (name, update) => {
    const file = docs.get(name), parsed = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const doc = { fm: parsed.data, body: parsed.body }; update(doc); fs.writeFileSync(file, md(doc.fm, doc.body));
  };
  write('screen.md', { artifact_id: 'SCREEN-RESULT-001', artifact_type: 'screen-spec', screen_id: 'RESULT-001', domain: 'result',
    status: 'draft', screen_entry: `${ROOT}/screens/RESULT-001.tsx`,
    work_execution: { version: 1, units: [unit(), unit('other')] } }, '## Notes\nOwner housekeeping.');
  write('rules.md', { artifact_id: 'RULES', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed' },
    '## Rules\nKnown contract.\n\n## Other\nOther contract.');
  // A same-domain document: its rows are native to every unit of the owner.
  write(HOME, { artifact_id: 'UNCERTAINTY', artifact_type: 'domain-rules', domain: 'result', status: 'draft',
    uncertainty_work_scopes: { version: 1, bindings: [binding()] } }, BODY);
  const options = (owner = OWNER) => ({ owner, projectRoot: root, docsDir, kitRoot, policyFile, layoutFile, manifestFile,
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) =>
      ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }) });
  const run = (owner = OWNER) => inspectScopedUncertaintyScopes(options(owner));
  const bind = (...values) => change(HOME, ({ fm }) => { fm.uncertainty_work_scopes.bindings = values; });
  const recordDigest = (uncertaintyRef = UNKNOWN, owner = OWNER) => {
    const digest = resolveScopedUncertaintyBindingBasis({ ...options(owner), uncertaintyRef }).basis_digest;
    const [, id] = /^[a-z]+:([^@]+)@/.exec(uncertaintyRef), key = `${uncertaintyRef.split(':')[0]}_id`;
    change(HOME, ({ fm }) => { fm.uncertainty_work_scopes.bindings.find((entry) => entry[key] === id && entry.owner === owner).basis_digest = digest; });
    return digest;
  };
  return { root, docs, write, change, options, run, bind, recordDigest };
}
const check = (out, ref = UNKNOWN) => out.checks.find((entry) => entry.uncertainty === ref);
const denied = (out, unitId) => scopedUncertaintyDenials(out, unitId).map((entry) => entry.uncertainty).sort();

test('D uncertainty scopes: no binding keeps the native relation for every unit', (t) => {
  for (const edit of [({ fm }) => { delete fm.uncertainty_work_scopes; }, ({ fm }) => { fm.uncertainty_work_scopes.bindings = []; }]) {
    const f = fixture(t); f.change(HOME, edit);
    const out = f.run(), result = check(out);
    assert.deepEqual([result.binding_state, result.scope_source, result.blocking_units, result.declared_binding, result.computed_basis_digest],
      ['missing', 'conservative-default', UNITS, null, null]);
    for (const id of UNITS) assert.deepEqual(denied(out, id), [CONFLICT, UNKNOWN], id);
  }
});

test('D uncertainty scopes: a mismatched recorded digest is stale and never rewritten', (t) => {
  const f = fixture(t), before = fs.readFileSync(f.docs.get(HOME), 'utf8');
  const result = check(f.run());
  assert.deepEqual([result.binding_state, result.scope_source, result.blocking_units], ['stale-basis', 'conservative-default', UNITS]);
  assert.notEqual(result.computed_basis_digest, ZERO); assert.equal(result.declared_binding.basis_digest, ZERO);
  assert.equal(fs.readFileSync(f.docs.get(HOME), 'utf8'), before);
});

test('D uncertainty scopes: a current binding keeps the native relation only for its blocks', (t) => {
  const f = fixture(t), digest = f.recordDigest(), out = f.run(), result = check(out);
  assert.deepEqual([result.binding_state, result.scope_source, result.blocking_units, result.computed_basis_digest, result.approval_verified],
    ['current-unverified', 'current-canonical-declaration', ['other'], digest, false]);
  assert.deepEqual(denied(out, 'known'), [CONFLICT]);
  assert.deepEqual(denied(out, 'other'), [CONFLICT, UNKNOWN]);
  assert.deepEqual(check(out, CONFLICT).blocking_units, UNITS, 'another row of the same home is not borrowed');
});

test('D uncertainty scopes: explicit empty blocks releases every unit without authenticating its author', (t) => {
  const f = fixture(t); f.bind(binding({ blocks: [] })); f.recordDigest();
  const out = f.run();
  assert.deepEqual([check(out).blocking_units, check(out).approval_verified], [[], false]);
  for (const id of UNITS) assert.deepEqual(denied(out, id), [CONFLICT], id);
});

test('D uncertainty scopes: a binding names its kind; an Unknown binding never covers a Conflict with the same ID', (t) => {
  const f = fixture(t);
  f.change(HOME, (doc) => { doc.body = `${unknowns([['X-ONE', 'Which state applies?', 'open']])}\n\n${conflicts([['X-ONE', 'Planning and Figma disagree.', 'open']])}`; });
  f.bind(binding({ unknown_id: 'X-ONE', blocks: [] })); f.recordDigest('unknown:X-ONE@UNCERTAINTY');
  let out = f.run();
  assert.deepEqual(denied(out, 'known'), ['conflict:X-ONE@UNCERTAINTY']);
  const { unknown_id, ...rest } = binding({ blocks: [] });
  f.bind(binding({ unknown_id: 'X-ONE', blocks: [] }), { ...rest, conflict_id: 'X-ONE' });
  f.recordDigest('unknown:X-ONE@UNCERTAINTY'); f.recordDigest('conflict:X-ONE@UNCERTAINTY');
  out = f.run();
  assert.deepEqual(denied(out, 'known'), []);
  assert.equal(check(out, 'conflict:X-ONE@UNCERTAINTY').scope_source, 'current-canonical-declaration');
});

test('D uncertainty scopes: selected and inverse evidence relations are not narrowed', (t) => {
  const f = fixture(t);
  f.change(HOME, (doc) => { doc.body = doc.body.replace('Which state applies?', 'Which state does artifact:RULES#rules apply?'); });
  f.bind(binding({ blocks: [] })); f.recordDigest();
  const out = f.run();
  assert.deepEqual(check(out).applications.map((entry) => [entry.unit, entry.relation]),
    [['known', 'inverse-evidence'], ['other', 'scope-review-needed']]);
  assert.deepEqual([denied(out, 'known'), denied(out, 'other'), check(out).blocking_units], [[CONFLICT, UNKNOWN], [CONFLICT], ['known']]);
});

test('D uncertainty scopes: a row reached through another applied row keeps its relation; bound-out rows cannot hold each other', (t) => {
  const f = fixture(t), TWO = 'unknown:U-TWO@UNCERTAINTY';
  f.change(HOME, (doc) => { doc.body = `${unknowns([['U-ONE', 'Which state applies?', 'open'], ['U-TWO', 'Does unknown:U-ONE@UNCERTAINTY hold?', 'open']])}`; });
  f.bind(binding({ blocks: [] })); f.recordDigest();
  let out = f.run();
  assert.ok(check(out).applications.every((entry) => entry.relation === 'scope-review-needed' &&
    entry.witnesses.some((witness) => witness.via === TWO)), 'the native relation keeps its transitive witness');
  assert.deepEqual(denied(out, 'known'), [UNKNOWN, TWO], 'U-TWO still applies, so U-ONE stays reached through it');
  f.bind(binding({ blocks: [] }), binding({ unknown_id: 'U-TWO', blocks: [] })); f.recordDigest(); f.recordDigest(TWO);
  out = f.run(); assert.deepEqual(denied(out, 'known'), []);
  // A cycle of bound-out rows releases both; one row kept for a unit keeps what it reaches.
  f.change(HOME, (doc) => { doc.body = doc.body.replace('Which state applies?', 'Does unknown:U-TWO@UNCERTAINTY hold?'); });
  f.recordDigest(); f.recordDigest(TWO);
  out = f.run(); assert.deepEqual([denied(out, 'known'), denied(out, 'other')], [[], []]);
  f.bind(binding({ blocks: [] }), binding({ unknown_id: 'U-TWO', blocks: ['other'] })); f.recordDigest(); f.recordDigest(TWO);
  out = f.run(); assert.deepEqual([denied(out, 'known'), denied(out, 'other')], [[], [UNKNOWN, TWO]]);
});

test('D uncertainty scopes: unit set, contract and blocks changes stale the binding; approval_ref does not', (t) => {
  const f = fixture(t), digest = f.recordDigest();
  f.change(HOME, ({ fm }) => { fm.uncertainty_work_scopes.bindings[0].approval_ref = 'https://example.invalid/approved'; });
  assert.deepEqual([check(f.run()).binding_state, check(f.run()).computed_basis_digest], ['current-unverified', digest]);
  f.change(HOME, ({ fm }) => { fm.uncertainty_work_scopes.bindings[0].blocks = []; });
  assert.equal(check(f.run()).binding_state, 'stale-basis', 'blocks are part of the basis');
  f.recordDigest(); f.change('rules.md', (doc) => { doc.body = doc.body.replace('Other contract.', 'Changed other contract.'); });
  assert.equal(check(f.run()).binding_state, 'stale-basis', 'another known unit contract changed');
  f.recordDigest(); f.change('screen.md', ({ fm }) => { fm.work_execution.units.push(unit('new')); });
  const out = f.run();
  assert.deepEqual([check(out).binding_state, check(out).computed_basis_digest, check(out).blocking_units],
    ['stale-known-units', null, ['known', 'new', 'other']]);
});

test('D uncertainty scopes: a resolved row neither blocks nor uses its binding; another owner scope exempts nothing', (t) => {
  const f = fixture(t);
  f.change(HOME, (doc) => { doc.body = doc.body.replace('| open |', '| resolved |'); });
  let out = f.run();
  assert.deepEqual([check(out).scope_source, check(out).blocking_units], ['resolved-uncertainty', []]);
  assert.deepEqual(denied(out, 'known'), [CONFLICT]);
  const g = fixture(t); g.bind(binding({ owner: SECOND, blocks: [] }));
  out = g.run(); assert.deepEqual([check(out).binding_state, check(out).blocking_units], ['missing', UNITS]);
});

test('D uncertainty scopes: malformed declarations fail instead of becoming absent scopes', (t) => {
  const { unknown_id, ...rest } = binding();
  for (const [label, value] of [
    ['both kinds', { version: 1, bindings: [{ ...binding(), conflict_id: 'C-ONE' }] }],
    ['no kind', { version: 1, bindings: [rest] }],
    ['blocks outside known_units', { version: 1, bindings: [binding({ blocks: ['missing'] })] }],
    ['empty known_units', { version: 1, bindings: [binding({ known_units: [], blocks: [] })] }],
    ['bad digest', { version: 1, bindings: [binding({ basis_digest: 'sha256:abc' })] }],
    ['empty approval_ref', { version: 1, bindings: [binding({ approval_ref: '' })] }],
    ['version 2', { version: 2, bindings: [binding()] }],
    ['unknown key', { version: 1, bindings: [{ ...binding(), note: 'x' }] }],
    ['another kind prefix', { version: 1, bindings: [binding({ unknown_id: 'D-ONE' })] }],
    ['duplicate identity', { version: 1, bindings: [binding(), binding({ blocks: [] })] }],
    ['null', null],
  ]) {
    const f = fixture(t); f.change(HOME, ({ fm }) => { fm.uncertainty_work_scopes = value; });
    assert.throws(() => f.run(), /uncertainty/i, label);
  }
});

test('D uncertainty scopes: inspection writes nothing and rejects caller verdicts', (t) => {
  const f = fixture(t); f.recordDigest();
  const snapshot = () => [...f.docs.values()].map((file) => fs.readFileSync(file, 'utf8'));
  const before = snapshot(); f.run(); assert.deepEqual(snapshot(), before);
  for (const key of ['projection', 'blocks', 'approved', 'scopes']) {
    assert.throws(() => inspectScopedUncertaintyScopes({ ...f.options(), [key]: [] }), /caller/, key);
  }
});

test('D uncertainty scopes: an inspector evaluates only its own owner projection, against the read set it resolved', (t) => {
  const f = fixture(t); f.recordDigest();
  const options = f.options(), { projection, read_set } = resolveScopedApplicabilityProjection(options);
  const out = scopedUncertaintyScopes(options, projection, read_set);
  assert.deepEqual([denied(out, 'known'), out.read_set.map((entry) => entry.file)], [[CONFLICT], ['docs/uncertainty.md']]);
  assert.deepEqual(out.checks, inspectScopedUncertaintyScopes(options).checks, 'same result as the standalone inspector');
  assert.throws(() => scopedUncertaintyScopes(options, { ...projection, owner: SECOND }, read_set), /another owner/);
  assert.throws(() => scopedUncertaintyScopes(options, projection, read_set.filter((entry) => entry.file !== 'docs/uncertainty.md')), /read set/);
  fs.appendFileSync(f.docs.get(HOME), '\nChanged after resolution.');
  assert.throws(() => scopedUncertaintyScopes(options, projection, read_set), /snapshot changed/);
});
