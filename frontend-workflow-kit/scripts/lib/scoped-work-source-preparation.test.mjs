import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KIT_ROOT, splitFrontmatter } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { loadInputArtifact } from './input-artifact.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { createScopedSourceResolver } from './scoped-work-sources.mjs';
import { resolveScopedContractGraph } from './scoped-work-graph.mjs';
import { resolveScopedSourceProjection } from './scoped-work-source-relations.mjs';
import { resolveScopedCoverageBasis } from './scoped-work-coverage.mjs';
import { scopedInputMetadataStats } from './scoped-work-input-metadata.mjs';
import { prepareScopedSourceInputs, observeScopedSourceInputReads,
  scopedSourceInputStats } from './scoped-work-source-inputs.mjs';

const OWNER = 'screen:RESULT-001', INPUT = 'IN-20261120-meeting-001', OTHER = 'IN-20261120-meeting-002';
const REF = `input:${INPUT}#extracted-facts/01`;
const select = (item = '01') => ({ input_id: INPUT, items: [item], source_refs: [`input:${INPUT}#extracted-facts/${item}`] });
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((cells) => `| ${cells.join(' | ')} |`)].join('\n');

// Synthetic, real-file inputs exercise the ordinary and owned source paths with
// the same canonical parsers. No consumer documents or approvals are fixtures.
function fixture(t, { unselected = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-source-preparation-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fm = { input_id: INPUT, input_type: 'meeting', source_type: 'meeting',
    source_ref: 'meeting:source-preparation-fixture', captured_at: '2026-11-20T00:00:00Z',
    captured_by: 'test', status: 'captured', affected_domains: ['result'], affected_screens: ['RESULT-001'],
    note: { nested: { value: 'original' }, tags: ['one'] } };
  const inputFile = path.join(root, `${INPUT}.md`);
  fs.writeFileSync(inputFile, md(fm, '## Extracted Facts\n- Original selected fact.\n- Other selected fact.\n'));
  const inputArtifacts = [loadInputArtifact(inputFile)];
  const docFile = path.join(root, 'contract.md');
  const docFm = { artifact_id: 'DOC', artifact_type: 'domain-rules', domain: 'result', status: 'draft' };
  fs.writeFileSync(docFile, md(docFm, '## Rules\nKnown rule.\n\n## Other\nOther rule.\n'));
  const ownerFile = path.join(root, 'screen.md');
  const ownerFm = { artifact_id: 'SCREEN', artifact_type: 'screen-spec', screen_id: 'RESULT-001',
    domain: 'result', status: 'draft', screen_entry: 'src/features/result/screens/Result.tsx',
    work_execution: { version: 1, units: [
      { id: 'known', kind: 'behavior', contracts: ['artifact:DOC#rules'], sources: [select()] },
      { id: 'other', kind: 'behavior', contracts: ['artifact:DOC#other'], sources: [select('02')] },
    ] } };
  fs.writeFileSync(ownerFile, md(ownerFm, '## Notes\nTwo authored units are not permission.\n'));
  const targetIndex = buildReconciliationTargetIndex({ docs: [
    { file: docFile, fm: docFm }, { file: ownerFile, fm: ownerFm },
  ] });
  const summaries = [[INPUT, 'meeting', 'simple-update×2', 'partially-reconciled', 'pending', 'artifact:DOC', '-', '-']];
  const items = [['01', 'rules'], ['02', 'other']].map(([item, section]) =>
    [INPUT, item, 'compatible-fact', 'simple-update', 'update', `artifact:DOC#${section}`,
      `input:${INPUT}#extracted-facts/${item}`, 'inherit', 'statement', 'inherit']);
  let otherFile;
  if (unselected) {
    otherFile = path.join(root, `${OTHER}.md`);
    fs.writeFileSync(otherFile, md({ ...fm, input_id: OTHER }, '## Extracted Facts\n- Unselected validation-only fact.\n'));
    inputArtifacts.push(loadInputArtifact(otherFile));
    summaries.push([OTHER, 'meeting', 'reject-input', 'reconciled', 'rejected', '-', '-', '-']);
    items.push([OTHER, '01', 'reject', 'reject-input', 'reject', '-',
      `input:${OTHER}#extracted-facts/01`, 'inherit', 'statement', 'inherit']);
  }
  const registerFile = path.join(root, 'register.md');
  fs.writeFileSync(registerFile, md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1',
    structured_since: '2026-09-01T00:00:00Z' },
  `${table(REQUIRED_REGISTER_COLS, summaries)}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS, items)}`));
  const options = { owner: OWNER, projectRoot: root, targetIndex, registerFile, inputArtifacts,
    layout: loadLayoutProfile({ kitRoot: KIT_ROOT }) };
  return { root, inputFile, otherFile, inputArtifacts, options };
}

const ownedOptions = (f) => ({ ...f.options, inputArtifacts: prepareScopedSourceInputs(f.inputArtifacts) });
const resolver = (options) => createScopedSourceResolver(options);
const replace = (file, before, after) => fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(before, after));

test('#337 source preparation: repeated resolvers prepare one owned inventory and preserve full source output', (t) => {
  const f = fixture(t, { unselected: true }), expected = resolver(f.options).source(select());
  const options = ownedOptions(f), before = scopedSourceInputStats();
  const first = resolver(options), second = resolver(options), third = resolver(options);
  assert.deepEqual(first.source(select()), expected);
  assert.deepEqual(second.source(select()), expected);
  assert.deepEqual(third.source(select()), expected);
  const after = scopedSourceInputStats();
  assert.equal(after.catalogs - before.catalogs, 1, 'pure index and validation are built once for this inventory');
  assert.equal(after.records - before.records, f.inputArtifacts.length, 'immutable resolver seeds are prepared once');
  assert.equal(after.selected - before.selected, 3, 'each resolver still owns its selected mutable record');
  assert.equal(after.catalogReuses - before.catalogReuses, 2);
  assert.equal(Object.isFrozen(options.inputArtifacts), true);
  assert.equal(Object.isFrozen(f.inputArtifacts), false);
  for (let index = 0; index < f.inputArtifacts.length; index += 1) {
    assert.notEqual(options.inputArtifacts[index], f.inputArtifacts[index]);
    assert.equal(Object.isFrozen(options.inputArtifacts[index]), true);
    assert.equal(Object.hasOwn(options.inputArtifacts[index], 'body'), false);
    assert.equal(Object.hasOwn(f.inputArtifacts[index], 'body'), false);
  }
});

test('#337 source preparation: independent owned inventories do not share catalogs or caller mutations', (t) => {
  const f = fixture(t), first = ownedOptions(f), second = ownedOptions(f), before = scopedSourceInputStats();
  f.inputArtifacts[0].file = path.join(f.root, 'caller-only.md');
  f.inputArtifacts[0].fm.note.nested.value = 'caller mutation';
  const a = resolver(first).evidence(REF), b = resolver(second).evidence(REF);
  assert.deepEqual(a, b);
  assert.equal(a.input.metadata.note.nested.value, 'original');
  assert.equal(scopedSourceInputStats().catalogs - before.catalogs, 2);
  assert.equal(scopedSourceInputStats().records - before.records, 2);
});

test('#337 source preparation: two unit closures and coverage bases retain every output byte', (t) => {
  const f = fixture(t, { unselected: true });
  const run = (options) => ['known', 'other'].map((unit) => ({
    sources: resolveScopedSourceProjection({ ...options, unit }),
    coverage: resolveScopedCoverageBasis({ ...options, unit, inputId: INPUT }),
  }));
  const expected = run(f.options), options = ownedOptions(f), before = scopedSourceInputStats();
  const actual = run(options);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), 'full relations, basis hashes, warnings and read sets must match');
  assert.deepEqual(actual.map((entry) => entry.sources.sources[0].selection), [select(), select('02')]);
  assert.deepEqual(actual.map((entry) => entry.coverage.basis.unit), ['known', 'other']);
  assert.deepEqual(actual.map((entry) => entry.coverage.basis.item_ids), [['01'], ['02']]);
  assert.equal(scopedSourceInputStats().catalogs - before.catalogs, 1);
  assert.equal(scopedSourceInputStats().records - before.records, f.inputArtifacts.length);
  assert.ok(scopedSourceInputStats().catalogReuses > before.catalogReuses, 'the real graph and source passes use this catalog');
});

test('#337 source preparation: current bodies, hashes and detached outputs remain resolver-local', (t) => {
  const f = fixture(t), options = ownedOptions(f), first = resolver(options);
  const original = first.evidence(REF), returned = first.source(select());
  returned.input.metadata.note.nested.value = 'result mutation';
  returned.input.metadata.note.tags.push('result-only tag');
  returned.groups[0].effects[0].fields.sourceUnit = 'result-only unit';
  replace(f.inputFile, 'Original selected fact.', 'Updated selected fact.');
  const second = resolver(options), updated = second.evidence(REF);
  assert.equal(original.anchor.content, 'Original selected fact.');
  assert.equal(updated.anchor.content, 'Updated selected fact.');
  assert.notEqual(updated.input.input_sha256, original.input.input_sha256);
  assert.deepEqual(first.evidence(REF), original, 'another resolver cannot overwrite a loaded body or section cache');
  assert.equal(second.source(select()).input.metadata.note.nested.value, 'original');
  assert.equal(first.source(select()).groups[0].effects[0].fields.sourceUnit, 'statement');
  assert.deepEqual(options.inputArtifacts[0].fm.note.tags, ['one']);
  replace(f.inputFile, '"status":"captured"', '"status":"confirmed"');
  assert.throws(() => resolver(options).evidence(REF), /SW-SOURCE-SNAPSHOT/,
    'cached metadata validation does not replace the current file comparison');
});

test('#337 source preparation: preloaded caller bodies cannot replace selected or passive Evidence reads', (t) => {
  const f = fixture(t, { unselected: true });
  const claimedBody = '## Extracted Facts\n- Caller-only body, not the current file.\n';
  for (const entry of f.inputArtifacts) entry.body = claimedBody;
  const options = ownedOptions(f), observed = observeScopedSourceInputReads(options.inputArtifacts);
  const before = scopedSourceInputStats();
  const reader = resolver({ ...options, inputArtifacts: observed.artifacts }), output = reader.source(select());
  assert.equal(output.anchors[0].content, 'Original selected fact.');
  assert.equal(scopedSourceInputStats().catalogs - before.catalogs, 1, 'this exercises eligible owned records with a body field');
  assert.equal(observed.verify(), true);
  for (const collection of [f.inputArtifacts, options.inputArtifacts, observed.artifacts]) {
    assert.ok(collection.every((entry) => entry.body === claimedBody), 'source reads cannot mutate collector or observer records');
  }
  fs.appendFileSync(f.otherFile, '\nChanged after actual validation-only read.\n');
  assert.equal(observed.verify(), false, 'unselected preloaded body cannot suppress its actual file observation');
});

test('#337 source preparation: nested passive Evidence observers share only pure inventory facts', (t) => {
  const f = fixture(t, { unselected: true }), options = ownedOptions(f), before = scopedSourceInputStats();
  const observedA = observeScopedSourceInputReads(options.inputArtifacts);
  const observedB = observeScopedSourceInputReads(observedA.artifacts);
  const readerA = resolver({ ...options, inputArtifacts: observedA.artifacts });
  const readerB = resolver({ ...options, inputArtifacts: observedB.artifacts });
  readerA.source(select()); // Whole-register validation reads OTHER's Evidence.
  readerB.evidence(REF); // This reader never consults OTHER or the register.
  assert.equal(observedA.verify(), true);
  assert.equal(observedB.verify(), true);
  assert.equal(scopedSourceInputStats().catalogs - before.catalogs, 1);
  for (const collection of [options.inputArtifacts, observedA.artifacts, observedB.artifacts]) {
    assert.equal(Object.hasOwn(collection[1], 'body'), false);
  }
  replace(f.otherFile, 'Unselected validation-only fact.', 'Changed validation-only fact.');
  assert.equal(observedA.verify(), false, 'A retains the callback that observed the old validation-only bytes');
  assert.equal(observedB.verify(), true, 'preparing a catalog or another observer is not a read by B');
  readerB.source(select());
  assert.equal(observedB.verify(), true, 'B reads current bytes instead of borrowing A\'s body or register result');
  fs.appendFileSync(f.otherFile, '\nAnother validation-only change.\n');
  assert.equal(observedB.verify(), false, 'B must acquire its own observation when it later validates the register');
});

test('#337 source preparation: selected duplicate IDs retain every position in the owned catalog', (t) => {
  const f = fixture(t);
  f.inputArtifacts.push(f.inputArtifacts[0]);
  const options = ownedOptions(f), before = scopedSourceInputStats();
  assert.throws(() => resolver(options).evidence(REF), /SW-SOURCE-INPUT:.*ambiguous/);
  assert.equal(scopedSourceInputStats().catalogs - before.catalogs, 1);
  assert.equal(scopedSourceInputStats().records - before.records, 2,
    'even repeated occurrences of the same collector object are separate inventory entries');
});

test('#337 source preparation: owned graph inputs still undergo the final current-byte audit', (t) => {
  const f = fixture(t), options = ownedOptions(f);
  let changed = false;
  assert.throws(() => resolveScopedContractGraph({ ...options, contracts: [REF], project(record) {
    changed = true;
    fs.appendFileSync(f.inputFile, '\nChanged after selected evidence was resolved.\n');
    return record;
  } }), /evidence changed during graph resolution/);
  assert.equal(changed, true, 'the mutation occurs after the owned resolver selected its current evidence');
});

test('#337 source preparation: copying an owned array cannot reuse its private validation or inventory', (t) => {
  const f = fixture(t), options = ownedOptions(f), expected = resolver(options).evidence(REF);
  const copied = options.inputArtifacts.map((entry) => ({ ...entry })), before = scopedSourceInputStats();
  copied[0].hasFrontmatter = false;
  assert.throws(() => resolver({ ...options, inputArtifacts: copied }).evidence(REF), /SW-SOURCE-INPUT:.*frontmatter/);
  copied[0].hasFrontmatter = true;
  copied.push({ ...copied[0] });
  assert.throws(() => resolver({ ...options, inputArtifacts: copied }).evidence(REF), /SW-SOURCE-INPUT:.*ambiguous/);
  copied.pop();
  copied[0].fm = { ...copied[0].fm, captured_at: 'invalid timestamp' };
  assert.throws(() => resolver({ ...options, inputArtifacts: copied }).evidence(REF), /SW-SOURCE-INPUT:.*IP-001/);
  assert.deepEqual(resolver(options).evidence(REF), expected);
  assert.equal(scopedSourceInputStats().catalogs, before.catalogs, 'ordinary copies do not create or claim an owned catalog');
});

for (const [terminal, warning] of [['missing', 'IF-115'], ['unverified', 'IF-119'], ['duplicate', 'IF-117']]) {
  test(`#337 source preparation: selected fidelity retains ${terminal} unselected inventory diagnosis`, (t) => {
    const f = fixture(t), parsed = splitFrontmatter(fs.readFileSync(f.inputFile, 'utf8'));
    const inherited = { ...parsed.data, input_contract: 2, fidelity: { extraction: 'inherited', verification: 'inherited',
      verified_against: `input:${OTHER}`, unreadable_count: 0 } };
    fs.writeFileSync(f.inputFile, md(inherited, parsed.body));
    f.inputArtifacts[0] = loadInputArtifact(f.inputFile);
    if (terminal !== 'missing') {
      const otherFm = { ...parsed.data, input_id: OTHER, input_contract: 2,
        ...(terminal === 'duplicate' ? { raw_artifacts: ['fixture.txt'], fidelity: { extraction: 'direct-text',
          verification: 'verified', verified_against: 'raw_artifact:fixture.txt', unreadable_count: 0 } }
          : { fidelity: { extraction: 'direct-text', verification: 'unverified', unreadable_count: 0 } }) };
      for (let index = 0; index < (terminal === 'duplicate' ? 2 : 1); index += 1) {
        const file = path.join(f.root, `${index ? 'duplicate-' : ''}${OTHER}.md`);
        fs.writeFileSync(file, md(otherFm, '## Extracted Facts\n- Unselected fidelity terminal.\n'));
        f.inputArtifacts.push(loadInputArtifact(file));
      }
    }
    const expected = resolver(f.options).source(select()), options = ownedOptions(f);
    assert.ok(expected.warnings.some((entry) => entry.message.includes(warning)));
    assert.deepEqual(resolver(options).source(select()), expected);
    assert.deepEqual(resolver(options).source(select()), expected);
  });
}

test('#337 source preparation: unusual metadata keeps ordinary eager cloning and failure timing', (t) => {
  const f = fixture(t), cycle = {}; cycle.self = cycle;
  const unused = { ...f.inputArtifacts[0], file: path.join(f.root, `${OTHER}.md`),
    fm: { ...f.inputArtifacts[0].fm, input_id: OTHER, note: cycle } };
  const options = { ...f.options, inputArtifacts: prepareScopedSourceInputs([...f.inputArtifacts, unused]) };
  const before = scopedInputMetadataStats(), catalogBefore = scopedSourceInputStats();
  resolver(options); resolver(options);
  assert.equal(scopedInputMetadataStats().cloned - before.cloned, 2, 'unsupported metadata is still cloned for every resolver');
  assert.equal(scopedSourceInputStats().catalogs, catalogBefore.catalogs, 'one unsupported record keeps the whole ordinary inventory path');
  const calls = [];
  unused.fm = { ...unused.fm, get extra() { calls.push('metadata getter'); return () => 'native clone failure'; } };
  const prepared = prepareScopedSourceInputs([...f.inputArtifacts, unused]);
  assert.deepEqual(calls, [], 'optional preparation cannot consume an accessor or throw for an unused input');
  assert.throws(() => resolver({ ...f.options, inputArtifacts: prepared }), { name: 'DataCloneError' });
  assert.deepEqual(calls, ['metadata getter']);
});
