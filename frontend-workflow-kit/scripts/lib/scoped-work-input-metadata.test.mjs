import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadInputArtifact } from './input-artifact.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { observeInputEvidenceReads } from './provenance.mjs';
import { createScopedSourceResolver } from './scoped-work-sources.mjs';
import { prepareScopedInputMetadata, cloneScopedSourceMetadata,
  scopedInputMetadataStats } from './scoped-work-input-metadata.mjs';

const INPUT = 'IN-20261117-meeting-001';
const OTHER = 'IN-20261117-meeting-002';
const REF = `input:${INPUT}#extracted-facts/01`;
const selection = { input_id: INPUT, items: ['01'], source_refs: [REF] };
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => ['| ' + headers.join(' | ') + ' |',
  '|' + headers.map(() => '---').join('|') + '|',
  ...rows.map((row) => '| ' + row.join(' | ') + ' |')].join('\n');

// Real input/register/contract files exercise the existing source resolver and
// validator. These synthetic facts are not a readiness or permission result.
function fixture(t, { unselected = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-input-metadata-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fm = { input_id: INPUT, input_type: 'meeting', source_type: 'meeting',
    source_ref: 'meeting:metadata-fixture', captured_at: '2026-11-17T00:00:00Z',
    captured_by: 'test', status: 'captured', affected_domains: ['result'],
    affected_screens: ['RESULT-001'], note: { nested: { value: 'original' }, tags: ['one'] } };
  const inputFile = path.join(root, `${INPUT}.md`);
  fs.writeFileSync(inputFile, md(fm, '## Extracted Facts\n- Original selected fact.\n'));
  const inputArtifacts = [loadInputArtifact(inputFile)];
  const docFile = path.join(root, 'contract.md');
  const docFm = { artifact_id: 'DOC', artifact_type: 'business-rules', domain: 'result', status: 'draft' };
  fs.writeFileSync(docFile, md(docFm, '## Rules\nSelected rule.\n'));
  const targetIndex = buildReconciliationTargetIndex({ docs: [{ file: docFile, fm: docFm }] });
  const summaries = [[INPUT, 'meeting', 'simple-update×1', 'partially-reconciled',
    'pending', 'artifact:DOC', '-', '-']];
  const items = [[INPUT, '01', 'compatible-fact', 'simple-update', 'update',
    'artifact:DOC#rules', REF, 'inherit', 'statement', 'inherit']];
  let otherFile;
  if (unselected) {
    otherFile = path.join(root, `${OTHER}.md`);
    fs.writeFileSync(otherFile, md({ ...fm, input_id: OTHER },
      '## Extracted Facts\n- Unselected but validated fact.\n'));
    inputArtifacts.push(loadInputArtifact(otherFile));
    summaries.push([OTHER, 'meeting', 'reject-input', 'reconciled', 'rejected', '-', '-', '-']);
    items.push([OTHER, '01', 'reject', 'reject-input', 'reject', '-',
      `input:${OTHER}#extracted-facts/01`, 'inherit', 'statement', 'inherit']);
  }
  const registerFile = path.join(root, 'register.md');
  fs.writeFileSync(registerFile, md({ reconciliation_contract: 2,
    review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' },
  `${table(REQUIRED_REGISTER_COLS, summaries)}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS, items)}`));
  const options = { projectRoot: root, targetIndex, registerFile, inputArtifacts };
  return { root, inputFile, otherFile, inputArtifacts, options };
}

function prepareInputs(f) {
  for (const entry of f.inputArtifacts) entry.fm = prepareScopedInputMetadata(entry.fm);
  return f;
}

function assertDeepFrozen(root) {
  const seen = new Set(), pending = [root];
  while (pending.length) {
    const value = pending.pop();
    if (value === null || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    assert.equal(Object.isFrozen(value), true);
    pending.push(...Object.values(value));
  }
}

test('#323 input metadata: preparation detaches and freezes plain graphs while retaining aliases and native clone shape', () => {
  const child = { text: 'original', values: [null, true, 1, -0, '한국어'] };
  const original = { first: child, second: child, list: [child], dict: Object.create(null) };
  original.dict.key = { value: 'dictionary' };
  Object.defineProperty(original, '__proto__', { value: { safe: true }, enumerable: true });
  const expected = structuredClone(original), before = scopedInputMetadataStats();
  const prepared = prepareScopedInputMetadata(original);
  assert.deepEqual(prepared, expected);
  assert.notEqual(prepared, original);
  assert.notEqual(prepared.first, child);
  assert.equal(prepared.first, prepared.second);
  assert.equal(prepared.first, prepared.list[0]);
  assert.equal(Object.getPrototypeOf(prepared.dict), Object.prototype,
    'preserve structuredClone normalization of null-prototype dictionaries');
  assert.equal(Object.hasOwn(prepared, '__proto__'), true);
  assertDeepFrozen(prepared);
  assert.equal(Object.isFrozen(original), false);
  assert.equal(Object.isFrozen(child), false);
  child.text = 'caller mutation'; child.values.push('caller item');
  assert.deepEqual(prepared, expected);
  assert.equal(cloneScopedSourceMetadata(prepared), prepared);
  assert.equal(cloneScopedSourceMetadata(prepared), prepared);
  const after = scopedInputMetadataStats();
  assert.equal(after.prepared - before.prepared, 1);
  assert.equal(after.reused - before.reused, 2);
  assert.equal(after.cloned - before.cloned, 0);
});

test('#323 input metadata: arbitrary frozen objects and copies cannot claim prepared identity', () => {
  const shallow = Object.freeze({ nested: { value: 'original' } });
  const deep = Object.freeze({ nested: Object.freeze({ value: 'original' }) });
  const prepared = prepareScopedInputMetadata({ nested: { value: 'original' } });
  for (const value of [shallow, deep, { ...prepared }]) {
    const clone = cloneScopedSourceMetadata(value);
    assert.deepEqual(clone, value);
    assert.notEqual(clone, value);
    assert.notEqual(clone.nested, value.nested);
    assert.equal(Object.isFrozen(clone), false);
    clone.nested.value = 'result mutation';
    assert.equal(value.nested.value, 'original');
  }
  assert.throws(() => cloneScopedSourceMetadata(new Proxy(prepared, {})), { name: 'DataCloneError' });
  const stats = scopedInputMetadataStats();
  stats.reused = -1;
  assert.notEqual(scopedInputMetadataStats().reused, -1, 'diagnostic snapshots cannot change private state');
});

test('#323 input metadata: preparation does not read accessors or trigger proxy traps', () => {
  const calls = [];
  const accessor = { get value() { calls.push('getter'); return { result: 1 }; } };
  const proxy = new Proxy({ value: 1 }, {
    get() { calls.push('get'); throw new Error('unexpected get'); },
    getPrototypeOf() { calls.push('prototype'); throw new Error('unexpected prototype'); },
    ownKeys() { calls.push('keys'); throw new Error('unexpected keys'); },
    getOwnPropertyDescriptor() { calls.push('descriptor'); throw new Error('unexpected descriptor'); },
  });
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  for (const value of [accessor, proxy, { nested: proxy }, revoked.proxy]) {
    assert.equal(prepareScopedInputMetadata(value), value);
  }
  assert.deepEqual(calls, []);
  assert.deepEqual(cloneScopedSourceMetadata(accessor), { value: { result: 1 } });
  assert.deepEqual(calls, ['getter'], 'ordinary native clone keeps its accessor behavior');
  assert.throws(() => cloneScopedSourceMetadata(proxy), { name: 'DataCloneError' });
  assert.deepEqual(calls, ['getter']);
});

test('#323 input metadata: unusual data keeps native clone behavior without being frozen', () => {
  class Custom { constructor() { this.value = 1; } }
  const sparse = []; sparse[2] = 'third';
  const extraArray = ['first']; extraArray.note = 'extra';
  const hidden = {}; Object.defineProperty(hidden, 'hidden', { value: 1 });
  const symbol = { [Symbol('key')]: 'value' };
  const cycle = {}; cycle.self = cycle;
  const values = [new Date('2026-11-17T00:00:00Z'), new Map([['key', { value: 1 }]]),
    new Set(['value']), /value/g, new Uint8Array([1, 2]), new ArrayBuffer(2),
    new Custom(), sparse, extraArray, hidden, symbol, cycle, undefined, NaN, Infinity, 1n];
  for (const value of values) {
    const original = { value }, expected = structuredClone(original);
    assert.equal(prepareScopedInputMetadata(original), original);
    assert.equal(Object.isFrozen(original), false);
    if (value && typeof value === 'object') assert.equal(Object.isFrozen(value), false);
    const clone = cloneScopedSourceMetadata(original);
    assert.notEqual(clone, original);
    assert.deepEqual(clone, expected);
  }
  const unsupported = { value: () => 'cannot clone' };
  assert.equal(prepareScopedInputMetadata(unsupported), unsupported);
  assert.throws(() => cloneScopedSourceMetadata(unsupported), { name: 'DataCloneError' });
});

test('#323 input metadata: excessive nesting does not add an earlier preparation failure', () => {
  const original = {}, nodes = [original];
  for (let index = 0; index < 12000; index += 1) {
    const next = {}; nodes.at(-1).next = next; nodes.push(next);
  }
  let nativeError;
  try { structuredClone(original); } catch (error) { nativeError = error; }
  const prepared = prepareScopedInputMetadata(original);
  assert.equal(nodes.some((value) => Object.isFrozen(value)), false, 'never partially freeze the original');
  if (nativeError) {
    assert.equal(prepared, original, 'preparation must defer the native clone failure');
    assert.throws(() => cloneScopedSourceMetadata(prepared), { name: nativeError.name });
  } else {
    assert.notEqual(prepared, original);
    assertDeepFrozen(prepared);
  }
});

test('#323 input metadata: ordinary resolver construction eagerly captures mutable metadata', (t) => {
  const f = fixture(t), original = f.inputArtifacts[0];
  const before = scopedInputMetadataStats();
  const resolver = createScopedSourceResolver(f.options);
  assert.equal(scopedInputMetadataStats().cloned - before.cloned, 1);
  original.fm.input_id = OTHER;
  original.fm.note.nested.value = 'changed after construction';
  original.fm.affected_screens.push('OTHER-001');
  original.file = path.join(f.root, 'moved-after-construction.md');
  const output = resolver.evidence(REF);
  assert.equal(output.input.input_id, INPUT);
  assert.equal(output.input.metadata.note.nested.value, 'original');
  assert.deepEqual(output.input.metadata.affected_screens, ['RESULT-001']);
  assert.equal(output.input.file, `${INPUT}.md`);
});

test('#323 input metadata: ordinary entry and nested getters retain their eager constructor order', (t) => {
  const f = fixture(t), calls = [], original = f.inputArtifacts[0];
  const fm = { ...original.fm, input_id: OTHER,
    get unused() { calls.push('metadata getter'); return 'unused but eagerly cloned'; } };
  const entry = { file: path.join(f.root, 'unused.md'),
    get fm() { calls.push('entry fm'); return fm; },
    hasFrontmatter: true, parseError: null,
    get note() { calls.push('entry note'); return 'record field'; } };
  const resolver = createScopedSourceResolver({ ...f.options, inputArtifacts: [original, entry] });
  assert.deepEqual(calls, ['entry fm', 'entry note', 'entry fm', 'metadata getter']);
  assert.equal(resolver.evidence(REF).anchor.content, 'Original selected fact.');
  assert.deepEqual(calls, ['entry fm', 'entry note', 'entry fm', 'metadata getter']);
});

test('#323 input metadata: unused unsupported inputs still throw during ordinary resolver construction', (t) => {
  const f = fixture(t), calls = [];
  const fm = { ...f.inputArtifacts[0].fm, input_id: OTHER,
    get unused() { calls.push('uncloneable getter'); return () => 'native clone failure'; } };
  assert.equal(prepareScopedInputMetadata(fm), fm);
  assert.deepEqual(calls, [], 'optional preparation cannot pull the error forward');
  const unused = { file: path.join(f.root, 'unused.md'), fm, hasFrontmatter: true, parseError: null };
  assert.throws(() => createScopedSourceResolver({ ...f.options,
    inputArtifacts: [...f.inputArtifacts, unused] }), { name: 'DataCloneError' });
  assert.deepEqual(calls, ['uncloneable getter']);
});

test('#323 input metadata: prepared resolvers keep independent current bodies and hashes', (t) => {
  const f = prepareInputs(fixture(t)), original = f.inputArtifacts[0];
  original.body = '## Extracted Facts\n- Caller body must not replace the file.\n';
  const before = scopedInputMetadataStats();
  const first = createScopedSourceResolver(f.options), firstOutput = first.evidence(REF);
  fs.writeFileSync(f.inputFile, fs.readFileSync(f.inputFile, 'utf8')
    .replace('Original selected fact.', 'Updated selected fact.'));
  const second = createScopedSourceResolver(f.options), secondOutput = second.evidence(REF);
  assert.equal(firstOutput.anchor.content, 'Original selected fact.');
  assert.equal(secondOutput.anchor.content, 'Updated selected fact.');
  assert.notEqual(firstOutput.input.input_sha256, secondOutput.input.input_sha256);
  assert.deepEqual(first.evidence(REF), firstOutput, 'later resolvers cannot overwrite an earlier resolver body');
  assert.equal(original.body, '## Extracted Facts\n- Caller body must not replace the file.\n');
  assert.equal(scopedInputMetadataStats().reused - before.reused, 2);
  assert.equal(scopedInputMetadataStats().cloned - before.cloned, 0);
});

test('#323 input metadata: preparation does not exempt current metadata from snapshot validation', (t) => {
  const f = prepareInputs(fixture(t));
  const resolver = createScopedSourceResolver(f.options);
  fs.writeFileSync(f.inputFile, fs.readFileSync(f.inputFile, 'utf8')
    .replace('"status":"captured"', '"status":"confirmed"'));
  assert.throws(() => resolver.evidence(REF), /SW-SOURCE-SNAPSHOT/);
  assert.throws(() => createScopedSourceResolver(f.options).evidence(REF), /SW-SOURCE-SNAPSHOT/);
});

test('#323 input metadata: source and evidence results remain mutable and detached from prepared values', (t) => {
  const f = prepareInputs(fixture(t)), metadata = f.inputArtifacts[0].fm;
  const first = createScopedSourceResolver(f.options), second = createScopedSourceResolver(f.options);
  const expected = first.evidence(REF), source = first.source(selection), evidence = first.evidence(REF);
  for (const output of [source, evidence]) {
    assert.notEqual(output.input.metadata, metadata);
    assert.notEqual(output.input.metadata.note, metadata.note);
    assert.equal(Object.isFrozen(output.input.metadata), false);
    output.input.metadata.note.nested.value = 'result-only mutation';
    output.input.metadata.note.tags.push('result-only tag');
    output.input.metadata.affected_screens.push('OTHER-001');
    output.input.input_id = OTHER;
  }
  assert.deepEqual(first.evidence(REF), expected);
  assert.deepEqual(second.evidence(REF), expected);
  assert.equal(first.source(selection).input.metadata.note.nested.value, 'original');
  assert.equal(metadata.note.nested.value, 'original');
  assert.deepEqual(metadata.note.tags, ['one']);
  assertDeepFrozen(metadata);
});

test('#323 input metadata: each resolver rebuilds its index and record validation around shared metadata', (t) => {
  const f = prepareInputs(fixture(t)), original = f.inputArtifacts[0];
  const first = createScopedSourceResolver(f.options);
  original.hasFrontmatter = false;
  assert.throws(() => createScopedSourceResolver(f.options).evidence(REF), /SW-SOURCE-INPUT:.*frontmatter/);
  original.hasFrontmatter = true;
  f.inputArtifacts.push({ ...original });
  assert.throws(() => createScopedSourceResolver(f.options).evidence(REF), /SW-SOURCE-INPUT:.*ambiguous/);
  f.inputArtifacts.pop();
  assert.equal(first.evidence(REF).anchor.content, 'Original selected fact.');
  original.fm = { ...original.fm, captured_at: 'not-a-timestamp' };
  assert.throws(() => createScopedSourceResolver(f.options).evidence(REF), /SW-SOURCE-INPUT:.*IP-001/);
  assert.equal(first.evidence(REF).input.metadata.captured_at, '2026-11-17T00:00:00Z');
});

test('#323 input metadata: validation-only Evidence observations survive prepared metadata and resolver copies', (t) => {
  const f = prepareInputs(fixture(t, { unselected: true }));
  const observed = observeInputEvidenceReads(f.inputArtifacts);
  assert.notEqual(observed.artifacts[1], f.inputArtifacts[1]);
  assert.equal(observed.artifacts[1].fm, f.inputArtifacts[1].fm);
  const before = scopedInputMetadataStats();
  const resolver = createScopedSourceResolver({ ...f.options, inputArtifacts: observed.artifacts });
  const output = resolver.source(selection);
  assert.equal(output.input.input_id, INPUT);
  assert.equal(observed.verify(), true);
  assert.equal(scopedInputMetadataStats().reused - before.reused, 2);
  assert.equal(Object.hasOwn(f.inputArtifacts[1], 'body'), false);
  assert.equal(Object.hasOwn(observed.artifacts[1], 'body'), false);
  fs.writeFileSync(f.otherFile, fs.readFileSync(f.otherFile, 'utf8')
    .replace('Unselected but validated fact.', 'Changed validation-only fact.'));
  assert.equal(observed.verify(), false, 'the register validator read must reach its original observer');
});

test('#323 input metadata: a prepared but unread input does not acquire an Evidence observation', (t) => {
  const f = prepareInputs(fixture(t, { unselected: true }));
  const observed = observeInputEvidenceReads(f.inputArtifacts);
  const resolver = createScopedSourceResolver({ ...f.options, inputArtifacts: observed.artifacts });
  resolver.evidence(REF);
  fs.appendFileSync(f.otherFile, '\nUnread input changed.\n');
  assert.equal(observed.verify(), true, 'preparing metadata is not a file read or validation verdict');
});
