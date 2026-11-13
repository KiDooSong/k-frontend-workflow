import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildInputArtifactIndex,
  copyInputEvidenceObservation,
  createInputEvidenceValidator,
  inputSectionDetails,
  inputSectionIndex,
  inspectFigmaSourcePrecision,
  isRfc3339,
  observeInputEvidenceReads,
  parseFigmaSourcePointer,
  parseInputEvidenceRef,
  resolveEffectiveSourceRef,
  resolveInputArtifact,
  resolveInputEvidence,
} from './provenance.mjs';
import { loadInputArtifact } from './input-artifact.mjs';
import { reconciliationParseStats } from './reconciliation-markdown-ast.mjs';

function tmpdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'provenance-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeInput(dir, id, body = '## Extracted Facts\n- one\n- two\n') {
  const file = path.join(dir, `${id}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [
    '---',
    `input_id: "${id}"`,
    'input_type: "planning"',
    'source_type: "planning-doc"',
    'source_ref: "planning/ref"',
    'captured_at: "2026-07-30T10:00:00+09:00"',
    'captured_by: "test"',
    'status: "captured"',
    'affected_domains: ["auth"]',
    'affected_screens: ["AUTH-001"]',
    '---',
    '',
    body,
  ].join('\n'));
  return file;
}

test('shared RFC3339 parser accepts timezone variants and rejects normalized-invalid dates', () => {
  for (const value of [
    '2026-07-30T10:00:00Z',
    '2026-07-30t10:00:00z',
    '2026-07-30T10:00:00+09:00',
    '2026-07-30T10:00:00-04:30',
    '2026-07-30T10:00:00.123+09:00',
    '2024-02-29T00:00:00Z',
  ]) assert.equal(isRfc3339(value), true, value);

  for (const value of [
    '2026-07-30',
    '2026-07-30T10:00:00',
    '2025-02-29T00:00:00Z',
    '2026-04-31T00:00:00Z',
    '2026-07-30T24:00:00Z',
    '2026-07-30T10:60:00Z',
    '2026-07-30T10:00:60Z',
    '2026-07-30T10:00:00+24:00',
    null,
    123,
  ]) assert.equal(isRfc3339(value), false, String(value));
});

test('shared Figma precision helper requires explicit file plus node/frame and keeps unit authoring explicit', () => {
  assert.deepEqual(parseFigmaSourcePointer('figma://file/abc/node/1:234'), {
    file: 'abc', axis: 'node', id: '1:234', raw: 'figma://file/abc/node/1:234',
  });
  assert.equal(parseFigmaSourcePointer('figma://file/abc'), null);
  assert.equal(parseFigmaSourcePointer('planning://login'), null);

  assert.equal(inspectFigmaSourcePrecision({
    sourceRef: 'figma://file/abc/node/1:234', sourceUnit: 'instance',
  }).ok, true);
  assert.equal(inspectFigmaSourcePrecision({
    sourceRef: 'figma://file/abc/node/1:234', sourceUnit: 'record',
  }).ok, true, 'record remains explicit but must retain a Figma anchor in mapping/visual contexts');
  assert.equal(inspectFigmaSourcePrecision({
    sourceRef: 'figma://file/abc/node/1:234', sourceUnit: 'document',
  }).reason, 'coarse-unit');
  assert.equal(inspectFigmaSourcePrecision({
    sourceRef: 'figma://file/abc', sourceUnit: 'node',
  }).reason, 'missing-anchor');
  assert.equal(resolveEffectiveSourceRef('inherit', { fm: { source_ref: 'figma://file/abc/frame/10:20' } }), 'figma://file/abc/frame/10:20');
  assert.equal(resolveEffectiveSourceRef('inherit', { fm: { source_ref: 'planning://login' } }), 'planning://login');
});

test('shared evidence grammar is 1-based and preserves canonical tokens', () => {
  assert.deepEqual(parseInputEvidenceRef('input:IN-20260730-figma-001#extracted-facts/02'), {
    inputId: 'IN-20260730-figma-001',
    section: 'extracted-facts',
    bulletIndex: 2,
    raw: 'input:IN-20260730-figma-001#extracted-facts/02',
  });
  assert.equal(parseInputEvidenceRef('input:IN-20260730-figma-001#extracted-facts/00'), null);
  assert.equal(parseInputEvidenceRef('IN-20260730-figma-001#extracted-facts'), null);
});

test('input index preserves duplicate ids and evidence resolution ignores fake fenced/comment sections', (t) => {
  const root = tmpdir(t);
  const id = 'IN-20260730-figma-001';
  const first = writeInput(root, id, [
    '```md',
    '## Fake',
    '- fake',
    '```',
    '<!--',
    '## Hidden',
    '- hidden',
    '-->',
    '## Extracted Facts',
    '- visible',
  ].join('\n'));
  const index = buildInputArtifactIndex([loadInputArtifact(first)]);
  assert.equal(resolveInputEvidence(index, `input:${id}#fake/01`).status, 'missing-section');
  assert.equal(resolveInputEvidence(index, `input:${id}#hidden/01`).status, 'missing-section');
  assert.equal(resolveInputEvidence(index, `input:${id}#extracted-facts/01`).status, 'ok');
  assert.equal(resolveInputEvidence(index, `input:${id}#extracted-facts/02`).status, 'bullet-out-of-range');

  const second = writeInput(path.join(root, 'nested'), id);
  const dupIndex = buildInputArtifactIndex([loadInputArtifact(first), loadInputArtifact(second)]);
  assert.equal(resolveInputArtifact(dupIndex, id).status, 'ambiguous');
  assert.equal(resolveInputEvidence(dupIndex, `input:${id}#extracted-facts/01`).status, 'ambiguous-input');
});


test('exact evidence text is additive, section-only stays non-semantic, and one AST cache is reused', (t) => {
  const root = tmpdir(t);
  const id = 'IN-20260803-meeting-001';
  const file = writeInput(root, id, [
    '## Extracted Facts',
    '- parent IN-20260802-planning-001 충돌',
    '  - child [IN-20260801-policy-001 conflicts with](https://example.test/hidden-conflict)',
    '- inline `IN-20260801-code-001 충돌` omitted',
  ].join('\n'));
  const artifact = loadInputArtifact(file);
  const index = buildInputArtifactIndex([artifact]);

  const sections = inputSectionIndex(index, artifact);
  assert.equal(sections.get('extracted-facts'), 3);
  assert.equal(index.sectionCache.size, 1);
  assert.equal(index.sectionDetailsCache.size, 1);

  const sectionOnly = resolveInputEvidence(index, `input:${id}#extracted-facts`);
  assert.equal(sectionOnly.status, 'ok');
  assert.equal(sectionOnly.bulletCount, 3);
  assert.equal(sectionOnly.evidenceText, null);

  const parent = resolveInputEvidence(index, `input:${id}#extracted-facts/01`);
  const child = resolveInputEvidence(index, `input:${id}#extracted-facts/02`);
  const inline = resolveInputEvidence(index, `input:${id}#extracted-facts/03`);
  assert.equal(parent.evidenceText, 'parent IN-20260802-planning-001 충돌');
  assert.equal(child.evidenceText, 'child IN-20260801-policy-001 conflicts with');
  assert.equal(inline.evidenceText, 'inline omitted');
  assert.ok(!parent.evidenceText.includes('child'));

  const details = inputSectionDetails(index, artifact);
  assert.equal(details.sections, sections);
  assert.equal(index.sectionCache.size, 1);
  assert.equal(index.sectionDetailsCache.size, 1);
});

test('#300 fresh input indexes reuse evidence syntax and keep mutable maps and arrays independent', (t) => {
  const root = tmpdir(t);
  const id = 'IN-20261110-planning-001';
  const file = writeInput(root, id, [
    '# Evidence cache isolation',
    '## Extracted Facts',
    '- parent evidence',
    '  - child evidence',
    '## Empty Section',
    'Prose is not a bullet.',
    '## Extracted Facts',
    '- later evidence',
    '## constructor',
    '- ordinary section name',
  ].join('\n'));
  const artifact = loadInputArtifact(file);
  const firstIndex = buildInputArtifactIndex([artifact]);
  const first = inputSectionDetails(firstIndex, artifact);
  const expected = structuredClone(first);
  assert.equal(first.sections.get('extracted-facts'), 3);
  assert.equal(first.sections.get('empty-section'), 0);
  assert.deepEqual(first.bulletTexts.get('extracted-facts'), ['parent evidence', 'child evidence', 'later evidence']);
  assert.deepEqual(first.bulletTexts.get('constructor'), ['ordinary section name']);
  assert.equal(first.sections, firstIndex.sectionCache.get(file));
  assert.equal(first, firstIndex.sectionDetailsCache.get(file));

  first.sections.set('extracted-facts', 99);
  first.bulletTexts.get('extracted-facts')[0] = 'poison';
  first.bulletTexts.get('constructor').push('poison');
  first.bulletTexts.delete('empty-section');
  const stats = reconciliationParseStats();
  const secondIndex = buildInputArtifactIndex([artifact]);
  const second = inputSectionDetails(secondIndex, artifact);
  assert.deepEqual(second, expected);
  assert.deepEqual(reconciliationParseStats(), stats, 'a fresh index must not repeat Markdown parsing or projection');
  assert.equal(second.sections, secondIndex.sectionCache.get(file));
  assert.equal(second, inputSectionDetails(secondIndex, artifact), 'keep the existing index-local view identity');
  assert.notEqual(second.sections, first.sections);
  assert.notEqual(second.bulletTexts.get('extracted-facts'), first.bulletTexts.get('extracted-facts'));
  second.bulletTexts.get('extracted-facts').length = 0;
  assert.deepEqual(inputSectionDetails(buildInputArtifactIndex([artifact]), artifact), expected);
});

test('#300 evidence reuse still reads each fresh index and observes same-size edits, deletion and restoration', (t) => {
  const root = tmpdir(t);
  const id = 'IN-20261110-planning-002';
  const file = writeInput(root, id, '## Fresh Evidence\n- alpha evidence\n');
  const raw = fs.readFileSync(file, 'utf8');
  const artifact = loadInputArtifact(file);
  const stamp = fs.statSync(file);
  const read = fs.readFileSync;
  let reads = 0;
  t.mock.method(fs, 'readFileSync', function (target, ...args) {
    if (String(target) === file) reads += 1;
    return read.call(this, target, ...args);
  });
  const resolve = () => resolveInputEvidence(buildInputArtifactIndex([artifact]), `input:${id}#fresh-evidence/01`);
  assert.equal(resolve().evidenceText, 'alpha evidence');
  const warm = reconciliationParseStats();
  assert.equal(resolve().evidenceText, 'alpha evidence');
  assert.equal(reads, 2, 'a content cache hit must still read the current file');
  assert.deepEqual(reconciliationParseStats(), warm);

  fs.writeFileSync(file, raw.replace('alpha evidence', 'omega evidence'));
  fs.utimesSync(file, stamp.atime, stamp.mtime);
  assert.equal(fs.statSync(file).size, stamp.size);
  assert.equal(resolve().evidenceText, 'omega evidence');
  fs.unlinkSync(file);
  assert.equal(resolve().status, 'missing-section');
  fs.writeFileSync(file, raw);
  const beforeRestore = reconciliationParseStats();
  assert.equal(resolve().evidenceText, 'alpha evidence');
  assert.deepEqual(reconciliationParseStats(), beforeRestore, 'restored exact content may reuse syntax after reading it');
  assert.equal(reads, 5);
});

test('#300 cached evidence does not reuse input identity, metadata or ambiguity decisions', (t) => {
  const root = tmpdir(t);
  const id = 'IN-20261110-planning-003';
  const file = writeInput(root, id, '## Identity Evidence\n- same source syntax\n');
  const artifact = loadInputArtifact(file);
  const ref = `input:${id}#identity-evidence/01`;
  assert.equal(resolveInputEvidence(buildInputArtifactIndex([artifact]), ref).status, 'ok');

  const changed = { ...artifact, fm: { ...artifact.fm, source_ref: 'planning/new-ref', captured_at: 'invalid' } };
  const current = resolveInputEvidence(buildInputArtifactIndex([changed]), ref);
  assert.equal(current.artifact, changed);
  assert.equal(resolveEffectiveSourceRef('inherit', current.artifact), 'planning/new-ref');
  assert.equal(current.artifact.fm.captured_at, 'invalid');
  assert.equal(resolveInputEvidence(buildInputArtifactIndex([artifact, changed]), ref).status, 'ambiguous-input');
  assert.equal(resolveInputEvidence(buildInputArtifactIndex([{ ...artifact, parseError: 'bad frontmatter' }]), ref).status, 'missing-input');
  assert.equal(resolveInputEvidence(buildInputArtifactIndex([{ ...artifact, fm: { input_id: 'IN-20261110-planning-004' } }]), ref).status, 'missing-input');
});

test('#300 supplied bodies retain precedence over files, including an empty body', (t) => {
  const root = tmpdir(t);
  const id = 'IN-20261110-planning-005';
  const file = writeInput(root, id, '## Body Precedence\n- file evidence\n');
  const artifact = loadInputArtifact(file);
  const resolve = (body) => {
    const supplied = { ...artifact, body };
    return resolveInputEvidence(buildInputArtifactIndex([supplied]), `input:${id}#body-precedence/01`);
  };
  assert.equal(resolve('## Body Precedence\n- supplied evidence\n').evidenceText, 'supplied evidence');
  assert.equal(resolve('').status, 'missing-section');
  fs.unlinkSync(file);
  assert.equal(resolve('## Body Precedence\n- supplied evidence\n').evidenceText, 'supplied evidence');
  assert.equal(resolveInputEvidence(buildInputArtifactIndex([artifact]), `input:${id}#body-precedence/01`).status, 'missing-section');
});

test('#300 file-backed evidence reads skip YAML decoding while metadata loaders and validation keep their checks', (t) => {
  const root = tmpdir(t);
  const id = 'IN-20261111-planning-001';
  const file = writeInput(root, id, '## Decode Boundary\n- original evidence\n');
  // Install the counter before importing the modules in an isolated process.
  // The normal test runner's YAML imports and cleanup must remain untouched.
  const script = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(import.meta.url)});
    const yaml = require('yaml');
    let parses = 0;
    // Frontmatter may use parseDocument before the original parse fallback.
    // Count both public entry points so body-only reads cannot hide a decode.
    for (const name of ['parse', 'parseDocument']) {
      const original = yaml[name];
      yaml[name] = (...args) => { parses += 1; return original(...args); };
    }
    const { loadInputArtifact, validateInputArtifacts } = await import(${JSON.stringify(new URL('./input-artifact.mjs', import.meta.url).href)});
    const { buildInputArtifactIndex, resolveInputEvidence } = await import(${JSON.stringify(new URL('./provenance.mjs', import.meta.url).href)});
    parses = 0;
    const file = ${JSON.stringify(file)}, ref = ${JSON.stringify(`input:${id}#decode-boundary/01`)};
    const raw = fs.readFileSync(file, 'utf8');
    const artifact = loadInputArtifact(file);
    assert.equal(parses, 1, 'the metadata loader still decodes YAML');
    const resolve = (entry) => resolveInputEvidence(buildInputArtifactIndex([entry]), ref);
    assert.equal(resolve(artifact).evidenceText, 'original evidence');
    assert.equal(resolve(artifact).evidenceText, 'original evidence');
    assert.equal(parses, 1, 'fresh evidence indexes need body text, not another YAML decode');

    fs.writeFileSync(file, raw.replace('input_type: "planning"', 'input_type: [unclosed'));
    const malformed = loadInputArtifact(file);
    assert.ok(malformed.parseError, 'full loaders must still report invalid YAML');
    assert.equal(parses, 3, 'invalid YAML takes the unchanged parser fallback');
    assert.equal(resolve(malformed).status, 'missing-input', 'a parse-error artifact is excluded from the input index');
    assert.equal(resolve(artifact).evidenceText, 'original evidence', 'the body-only view retains its existing delimiter semantics');
    assert.equal(parses, 3);

    fs.writeFileSync(file, raw.replace('captured_at: "2026-07-30T10:00:00+09:00"', 'captured_at: "invalid"')
      .replace('status: "captured"', 'status: "captured"\\nsummary: old-frontmatter-summary')
      .replace('original evidence', 'updated evidence'));
    const changed = loadInputArtifact(file);
    assert.equal(parses, 4);
    const validation = validateInputArtifacts([changed]);
    assert.ok(validation.errors.some((entry) => /IP-001.*captured_at/.test(entry.message)));
    assert.ok(validation.warnings.some((entry) => /deprecated frontmatter 'summary'/.test(entry.message)));
    assert.equal(resolve(changed).evidenceText, 'updated evidence');
    assert.equal(parses, 4, 'validation remains separate from body extraction');
    process.stdout.write(JSON.stringify({ parses }));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { parses: 4 });
});

const observedDetails = (artifact) => inputSectionDetails(buildInputArtifactIndex([artifact]), artifact);

test('#300 evidence read observations retain the first raw text and detect observed changes even after restoration', (t) => {
  const root = tmpdir(t), id = 'IN-20261111-planning-002';
  const file = writeInput(root, id, '## Observed Facts\n- stable evidence\n');
  const original = loadInputArtifact(file), raw = fs.readFileSync(file, 'utf8');
  const observation = observeInputEvidenceReads([original]);
  assert.deepEqual(Object.keys(observation), ['artifacts', 'verify']);
  const [artifact] = observation.artifacts;
  assert.notEqual(artifact, original);
  assert.equal(artifact.fm, original.fm, 'observation owns a shallow entry copy, not a new metadata verdict');
  assert.deepEqual(Reflect.ownKeys(artifact), Reflect.ownKeys(original), 'the observer is not a caller-replaceable field');
  assert.equal(observedDetails(artifact).bulletTexts.get('observed-facts')[0], 'stable evidence');
  assert.equal(observation.verify(), true);

  // Even metadata-only changes matter to the full raw observation. The syntax
  // cache can still reuse the unchanged body without hiding this new read.
  fs.writeFileSync(file, raw.replace('planning/ref', 'planning/changed'));
  assert.equal(observedDetails(artifact).bulletTexts.get('observed-facts')[0], 'stable evidence');
  fs.writeFileSync(file, raw);
  assert.equal(observation.verify(), false, 'a later read cannot overwrite the first observation');
  assert.equal(observation.verify(), false);
});

test('#300 evidence read observations distinguish missing reads from empty files and retain audit failures', (t) => {
  const root = tmpdir(t), file = path.join(root, 'empty.md');
  const artifact = { file, fm: { input_id: 'IN-20261111-planning-003' } };
  const missing = observeInputEvidenceReads([artifact]);
  assert.equal(observedDetails(missing.artifacts[0]).sections.size, 0);
  assert.equal(missing.verify(), true);
  fs.writeFileSync(file, '');
  assert.equal(missing.verify(), false, 'null read and empty text have different observations');

  const present = observeInputEvidenceReads([artifact]);
  assert.equal(observedDetails(present.artifacts[0]).sections.size, 0);
  assert.equal(present.verify(), true);
  fs.unlinkSync(file);
  assert.equal(present.verify(), false);
  fs.writeFileSync(file, '');
  assert.equal(present.verify(), false, 'restoration does not erase an observed audit failure');
});

test('#300 evidence read observations leave unused files and explicit bodies unobserved', (t) => {
  const root = tmpdir(t), outsideRoot = tmpdir(t);
  const selected = writeInput(root, 'IN-20261111-planning-004', '## Selected\n- actual file\n');
  const outside = path.join(outsideRoot, 'outside.md'), missing = path.join(root, 'missing.md');
  fs.writeFileSync(outside, 'unrelated outside file');
  const entries = [loadInputArtifact(selected),
    { file: missing, fm: { input_id: 'IN-20261111-planning-005' } },
    { file: outside, fm: { input_id: 'IN-20261111-planning-006' } },
    { file: outside, fm: { input_id: 'IN-20261111-planning-007' }, body: '## Supplied\n- explicit body\n' },
    { file: missing, fm: { input_id: 'IN-20261111-planning-008' }, body: '' }];
  const originalRead = fs.readFileSync, reads = [];
  const readMock = t.mock.method(fs, 'readFileSync', function (file, ...args) {
    if ([selected, outside, missing].includes(String(file))) reads.push(String(file));
    return originalRead.call(this, file, ...args);
  });
  try {
    const observation = observeInputEvidenceReads(entries);
    assert.deepEqual(reads, [], 'setting up an observer reads no file');
    observedDetails(observation.artifacts[0]);
    assert.equal(observedDetails(observation.artifacts[3]).bulletTexts.get('supplied')[0], 'explicit body');
    assert.equal(observedDetails(observation.artifacts[4]).sections.size, 0);
    fs.writeFileSync(outside, 'changed outside file');
    assert.equal(observation.verify(), true);
    assert.deepEqual(reads, [selected, selected], 'only the actual body read and its audit touch disk');
  } finally {
    readMock.mock.restore();
  }
});

test('#300 evidence read observers stay independent and propagate only through explicit source copies', (t) => {
  const root = tmpdir(t), id = 'IN-20261111-planning-009';
  const file = writeInput(root, id, '## Independent\n- first value\n');
  const original = loadInputArtifact(file), raw = fs.readFileSync(file, 'utf8');
  const first = observeInputEvidenceReads([original]);
  const second = observeInputEvidenceReads(first.artifacts);
  observedDetails(second.artifacts[0]);
  fs.writeFileSync(file, raw.replace('first value', 'second value'));
  assert.equal(first.verify(), true, 'a new observer must not inherit its source observer');
  assert.equal(second.verify(), false);

  const clone = { ...first.artifacts[0], fm: structuredClone(first.artifacts[0].fm), body: undefined };
  assert.equal(copyInputEvidenceObservation(first.artifacts[0], clone), clone);
  assert.equal(observedDetails(clone).bulletTexts.get('independent')[0], 'second value');
  assert.equal(first.verify(), true);
  fs.writeFileSync(file, raw);
  assert.equal(first.verify(), false, 'source-resolver copies keep the passive observation');
});

test('#300 evidence read observations preserve exact UTF-16 text identities', (t) => {
  const root = tmpdir(t), id = 'IN-20261111-planning-010';
  const file = writeInput(root, id, '## Text Identity\n- unchanged body\n');
  const artifact = loadInputArtifact(file), raw = fs.readFileSync(file, 'utf8');
  let current = raw.replace('captured_by: "test"', 'captured_by: "\ud800"');
  const originalRead = fs.readFileSync;
  const readMock = t.mock.method(fs, 'readFileSync', function (target, ...args) {
    return String(target) === file ? current : originalRead.call(this, target, ...args);
  });
  try {
    const observation = observeInputEvidenceReads([artifact]);
    observedDetails(observation.artifacts[0]);
    assert.equal(observation.verify(), true);
    current = current.replace('\ud800', '\ud801');
    assert.equal(observation.verify(), false, 'UTF-8 replacement must not collapse distinct raw strings');
  } finally {
    readMock.mock.restore();
  }
});

const validationProjection = (result) => ({ status: result.status, ref: result.ref,
  bulletCount: result.bulletCount, hasEvidenceText: Boolean(result.evidenceText?.trim()) });

for (const [ending, newline] of [['LF', '\n'], ['CRLF', '\r\n'], ['CR', '\r']]) {
  test(`#321 compact Evidence validation agrees with full prose across Markdown boundaries (${ending})`, () => {
    const id = 'IN-20261113-meeting-001';
    const body = [
      '[outside]: /outside', '[^note]: a note', '',
      '- preamble', '',
      '```md', '## Fake', '- hidden list', '```', '',
      '<!--', '## Hidden', '- hidden item', '-->', '',
      '## **Extracted Facts** ##',
      '- parent', '  - child', '    - grandchild',
      '- 01. nested ordered child',
      '- `code only`', '- <!-- only a comment -->',
      '- <https://example.test/only-url>', '- [visible][outside]',
      '- ![[alt label][outside]](/image)', '- [^note]',
      '- [unresolved][missing]', '- <span>visible HTML</span>',
      '- [ ] unchecked', '- [x] checked', '',
      '> ## Nested Heading', '>', '> - quoted bullet', '',
      '    ## Indented Heading', '    - hidden code item', '',
      '| Column | Value |', '| --- | --- |', '| cell | another |', '',
      '## Empty Section', 'Only paragraph prose.', '',
      'Setext Heading', '--------------', '- setext item', '',
      '## Extracted Facts', '- later occurrence', '',
      '## constructor', '- ordinary name', '',
      '## Next Section', '[after]: /after', '- [after link][after]',
    ].join(newline);
    const artifact = { fm: { input_id: id }, body }, full = buildInputArtifactIndex([artifact]);
    const compact = createInputEvidenceValidator([artifact]);
    const sections = ['extracted-facts', 'empty-section', 'setext-heading', 'constructor', 'next-section',
      'fake', 'hidden', 'nested-heading', 'indented-heading'];
    const refs = sections.flatMap((section) => ['', '/01', '/02', '/03', '/04', '/05', '/06', '/07', '/08', '/09', '/10', '/11', '/12', '/13', '/14', '/99']
      .map((suffix) => `input:${id}#${section}${suffix}`));
    refs.push('not evidence', `input:${id}#extracted-facts/00`, 'input:IN-20261113-meeting-999#extracted-facts/01');
    for (const ref of refs) assert.deepEqual(compact(ref), validationProjection(resolveInputEvidence(full, ref)), ref);
  });
}

test('#321 compact Evidence validators own lazy first-read state and retain fresh read observations', (t) => {
  const root = tmpdir(t), id = 'IN-20261113-meeting-002';
  const file = writeInput(root, id, '## Compact Fresh\n- alpha\n'), artifact = loadInputArtifact(file);
  const raw = fs.readFileSync(file, 'utf8'), stamp = fs.statSync(file), ref = `input:${id}#compact-fresh/01`;
  const read = fs.readFileSync; let reads = 0;
  const hook = t.mock.method(fs, 'readFileSync', function (target, ...args) {
    if (String(target) === file) reads += 1;
    return read.call(this, target, ...args);
  });
  try {
    const observation = observeInputEvidenceReads([artifact]);
    const first = createInputEvidenceValidator(observation.artifacts);
    assert.equal(reads, 0, 'constructing a validator must not read input files');
    const expected = first(ref), warm = reconciliationParseStats();
    assert.equal(expected.hasEvidenceText, true);
    expected.ref.section = 'caller-change'; expected.hasEvidenceText = false;
    assert.equal(first(ref).hasEvidenceText, true);
    assert.equal(first(ref).ref.section, 'compact-fresh');
    assert.equal(reads, 1, 'one private index retains its initial Evidence view');
    assert.equal(createInputEvidenceValidator(observation.artifacts)(ref).hasEvidenceText, true);
    assert.equal(reads, 2, 'a fresh validator reads bytes even on a compact syntax hit');
    assert.deepEqual(reconciliationParseStats(), warm);
    fs.writeFileSync(file, raw.replace('alpha', '`xxx`')); fs.utimesSync(file, stamp.atime, stamp.mtime);
    assert.equal(fs.statSync(file).size, stamp.size);
    assert.equal(first(ref).hasEvidenceText, true);
    assert.equal(createInputEvidenceValidator(observation.artifacts)(ref).hasEvidenceText, false);
    assert.equal(resolveInputEvidence(buildInputArtifactIndex([artifact]), ref).evidenceText, '',
      'the ordinary full-prose API keeps its independent current-file index');
    fs.writeFileSync(file, raw);
    assert.equal(observation.verify(), false, 'a changed read remains observed after restoration');
    assert.equal(createInputEvidenceValidator([artifact])(ref).hasEvidenceText, true);
    fs.unlinkSync(file);
    assert.equal(createInputEvidenceValidator([artifact])(ref).status, 'missing-section');
    fs.writeFileSync(file, raw);
    assert.equal(createInputEvidenceValidator([artifact])(ref).hasEvidenceText, true);
  } finally { hook.mock.restore(); }
});

test('#321 compact Evidence validators resolve IDs independently and preserve explicit-body precedence', (t) => {
  const root = tmpdir(t), id = 'IN-20261113-meeting-003';
  const file = writeInput(root, id, '## Compact Identity\n- actual file\n');
  const artifact = loadInputArtifact(file), ref = `input:${id}#compact-identity/01`;
  assert.equal(createInputEvidenceValidator([artifact])(ref).hasEvidenceText, true);
  const changed = { ...artifact, fm: { ...artifact.fm, input_id: 'IN-20261113-meeting-004' } };
  assert.equal(createInputEvidenceValidator([changed])(ref).status, 'missing-input');
  assert.equal(createInputEvidenceValidator([artifact, { ...artifact }])(ref).status, 'ambiguous-input');
  assert.equal(createInputEvidenceValidator([{ ...artifact, parseError: 'invalid YAML' }])(ref).status, 'missing-input');
  const supplied = observeInputEvidenceReads([{ ...artifact, body: '## Compact Identity\n- `code only`\n' }]);
  assert.equal(createInputEvidenceValidator(supplied.artifacts)(ref).hasEvidenceText, false);
  assert.equal(createInputEvidenceValidator([{ ...artifact, body: '' }])(ref).status, 'missing-section');
  fs.unlinkSync(file);
  assert.equal(supplied.verify(), true, 'explicit bodies do not observe their unused file');
  assert.equal(createInputEvidenceValidator(supplied.artifacts)(ref).hasEvidenceText, false);
  const missing = observeInputEvidenceReads([artifact]);
  assert.equal(createInputEvidenceValidator(missing.artifacts)(ref).status, 'missing-section');
  assert.equal(missing.verify(), true);
  fs.writeFileSync(file, '');
  assert.equal(missing.verify(), false, 'a missing read and an empty file retain different observation identities');
});

test('#321 compact Evidence summaries retain large prose as flags and never become full-prose results', () => {
  const id = 'IN-20261113-meeting-005', ref = `input:${id}#compact-large/01`;
  const body = `## Compact Large\n- ${'long visible evidence '.repeat(60_000)}\n`;
  const artifact = { fm: { input_id: id }, body };
  assert.equal(createInputEvidenceValidator([artifact])(ref).hasEvidenceText, true);
  const warm = reconciliationParseStats();
  assert.equal(createInputEvidenceValidator([artifact])(ref).hasEvidenceText, true);
  assert.deepEqual(reconciliationParseStats(), warm,
    'a summary of a >1MiB source must fit and avoid repeat Evidence projection');
  const full = resolveInputEvidence(buildInputArtifactIndex([artifact]), ref);
  assert.equal(full.evidenceText, 'long visible evidence '.repeat(60_000).trim());
  assert.deepEqual(createInputEvidenceValidator([artifact])(ref), validationProjection(full));
});

test('#321 compact Evidence flags preserve empty, full and mixed lists across packed boundaries', () => {
  const id = 'IN-20261113-meeting-bitmap';
  for (const count of [0, 1, 3, 4, 5, 7, 8, 9, 15, 16, 17, 31, 32, 33, 79, 80, 81]) {
    for (const density of ['empty', 'full', 'mixed']) {
      const nonempty = Array.from({ length: count }, (_, index) => density === 'full' ||
        (density === 'mixed' && index % 3 === 0));
      const artifact = { fm: { input_id: id }, body: `## Bitmap ${density} ${count}\n` +
        nonempty.map((visible, index) => visible ? `- visible ${index}` : `- \`code ${index}\``).join('\n') };
      const prefix = `input:${id}#bitmap-${density}-${count}`;
      const full = buildInputArtifactIndex([artifact]);
      // A second validator exercises the serialized cache-hit value too.
      for (let pass = 0; pass < 2; pass += 1) {
        const compact = createInputEvidenceValidator([artifact]);
        assert.deepEqual(compact(prefix), validationProjection(resolveInputEvidence(full, prefix)));
        for (let index = 0; index < count; index += 1) {
          const ref = `${prefix}/${String(index + 1).padStart(2, '0')}`;
          assert.deepEqual(compact(ref), validationProjection(resolveInputEvidence(full, ref)), ref);
          assert.equal(compact(ref).hasEvidenceText, nonempty[index], `${ref} pass ${pass}`);
        }
        const outside = `${prefix}/${count + 1}`;
        assert.deepEqual(compact(outside), validationProjection(resolveInputEvidence(full, outside)));
      }
    }
  }
});

for (const [shape, bulletCount] of [['short', 80], ['long', 40]]) {
  test(`#321 compact Evidence retains 1274 ${shape}-bullet inputs across fresh validator sweeps`, (t) => {
    const inputBytes = Math.floor(14.25 * 1024 * 1024 / 1274) + 1;
    const artifacts = Array.from({ length: 1274 }, (_, input) => {
      const id = `IN-20261113-meeting-${String(input + 1).padStart(4, '0')}`;
      const prefix = `---\n${JSON.stringify({ input_id: id })}\n---\n\n`;
      const facts = '## Extracted Facts\n' + Array.from({ length: bulletCount }, (_, bullet) => shape === 'short'
        ? `- Fact ${input}/${bullet}: preserve item.`
        : `- Existing fact ${input}/${bullet}: Preserve the documented local behavior and show the captured context. `.repeat(3)).join('\n');
      const body = `${facts}\n\n## Notes\n`.padEnd(inputBytes - prefix.length - 1, ' ') + '\n';
      assert.equal(prefix.length + body.length, inputBytes);
      return { fm: { input_id: id }, body };
    });
    const refs = artifacts.map((artifact) => `input:${artifact.fm.input_id}#extracted-facts/01`);
    const stringify = JSON.stringify, serialized = [];
    const hook = t.mock.method(JSON, 'stringify', function (value, ...args) {
      const json = stringify.call(this, value, ...args);
      if (Array.isArray(value) && value[0]?.[0] === 'extracted-facts' &&
          ['number', 'boolean'].includes(typeof value[0]?.[1]?.[0])) serialized.push(json);
      return json;
    });
    let retainedBytes;
    try {
      const first = createInputEvidenceValidator(artifacts);
      for (const ref of refs) {
        const evidence = first(ref);
        assert.equal(evidence.status, 'ok');
        assert.equal(evidence.bulletCount, bulletCount);
        assert.equal(evidence.hasEvidenceText, true);
      }
      assert.equal(serialized.length, artifacts.length, 'one syntax projection per unique first-read body');
      // The shared cache measures exact UTF-16 key + serialized payload bytes.
      // SHA-256 contributes 64 hex characters; every key also includes source length.
      retainedBytes = serialized.reduce((bytes, json, index) =>
        bytes + 2 * (String(artifacts[index].body.length).length + 1 + 64 + json.length), 0);
      t.diagnostic(`${artifacts.length} ${shape} inputs: ${retainedBytes} first-pass cache key/payload bytes`);
      const warm = reconciliationParseStats(), writes = serialized.length;
      for (let pass = 0; pass < 2; pass += 1) {
        const fresh = createInputEvidenceValidator(artifacts);
        for (const ref of refs) assert.equal(fresh(ref).bulletCount, bulletCount);
        assert.deepEqual(reconciliationParseStats(), warm, 'a fresh complete sweep must not rebuild Evidence views');
        assert.equal(serialized.length, writes, 'no summary is reserialized during a cache-hit sweep');
      }
      assert.ok(retainedBytes < 1024 * 1024, `${shape} summaries require ${retainedBytes} bytes`);
    } finally { hook.mock.restore(); }
    t.diagnostic(`${artifacts.length} ${shape} inputs: ${retainedBytes} retained key/payload bytes; repeat sweeps add zero projections`);
  });
}

test('#321 compact Evidence reuses full syntax when 2400 planning summaries exceed one MiB', (t) => {
  // Based on the standard planning example; inline because packed kits omit examples.
  const facts = Array.from({ length: 40 }, (_, index) =>
    `쿠폰 상태 ${String(index + 1).padStart(2, '0')}: 기존 동작 유지.`);
  const template = [
    '# Input: 쿠폰 목록 빈 상태(EmptyState) 안내 문구 보강',
    '',
    '## Summary',
    '쿠폰이 한 건도 없을 때 보여줄 EmptyState 안내 문구를 보강한다.',
    '',
    '## Extracted Facts',
    ...facts.map((text) => `- ${text}`),
    '',
    '## Suggested Target Artifacts',
    '- COUPON-001 screen-spec (State Matrix empty 행, Copy Keys)',
    '',
    '## Expected Reconciliation',
    '- classification: simple-update (Copy Keys / State Matrix 보강)',
    '- EmptyState 안내 Copy Keys 를 draft 로 추가한다 (confirmed 승격은 사람).',
    '',
    '## Should Not Do',
    '- Do not implement code directly from this input.',
    '- Do not promote candidate facts to confirmed without source or approval.',
    '- Do not edit generated files directly.',
    '',
  ].join('\n');
  const artifacts = Array.from({ length: 2400 }, (_, index) => ({
    fm: { input_id: `IN-20261114-planning-${String(index + 1).padStart(4, '0')}` },
    body: `${template}\n<!-- compact-full-fallback-planning ${index} -->\n`,
  }));
  const refs = artifacts.map((artifact) => `input:${artifact.fm.input_id}#extracted-facts/01`);
  const stringify = JSON.stringify, fullPayloads = [], compactPayloads = [];
  const hook = t.mock.method(JSON, 'stringify', function (value, ...args) {
    const json = stringify.call(this, value, ...args);
    if (Array.isArray(value) && value.length === 5 &&
        value[0]?.[0] === 'summary' && value[1]?.[0] === 'extracted-facts') {
      const first = value[1]?.[1]?.[0];
      if (typeof first === 'string') fullPayloads.push(json);
      else if (typeof first === 'number' || typeof first === 'boolean') compactPayloads.push(json);
    }
    return json;
  });
  const retainedBytes = (payloads) => payloads.reduce((bytes, json, index) =>
    bytes + 2 * (String(artifacts[index].body.length).length + 1 + 64 + json.length), 0);
  try {
    const first = createInputEvidenceValidator(artifacts);
    for (const ref of refs) {
      const evidence = first(ref);
      assert.equal(evidence.status, 'ok');
      assert.equal(evidence.bulletCount, facts.length);
      assert.equal(evidence.hasEvidenceText, true);
    }
    assert.equal(compactPayloads.length, artifacts.length, 'one summary per unique first-read body');
    const compactBytes = retainedBytes(compactPayloads);
    assert.ok(compactBytes > 1024 * 1024, 'this inventory must exceed the summary byte budget');
    assert.ok(artifacts.length < 4096, 'the regression must exercise bytes, not the entry cap');

    const warm = reconciliationParseStats(), fullWrites = fullPayloads.length;
    for (let pass = 0; pass < 2; pass += 1) {
      const summaryWrites = compactPayloads.length;
      const fresh = createInputEvidenceValidator(artifacts);
      for (const ref of refs) {
        const evidence = fresh(ref);
        assert.equal(evidence.status, 'ok');
        assert.equal(evidence.bulletCount, facts.length);
        assert.equal(evidence.hasEvidenceText, true);
      }
      assert.deepEqual(reconciliationParseStats(), warm,
        'summary cache misses must reuse full syntax instead of rebuilding Evidence views');
      assert.equal(fullPayloads.length, fullWrites, 'retained full syntax must not be reserialized');
      assert.equal(compactPayloads.length - summaryWrites, artifacts.length,
        'the same-order sweep must still encounter the bounded summary cache misses');
    }

    // Check admission after behavior: old code must fail for repeated projection.
    assert.equal(fullWrites, artifacts.length, 'cold summary computation also populates bounded full syntax');
    const fullBytes = retainedBytes(fullPayloads);
    assert.ok(fullBytes < 8 * 1024 * 1024, 'the same inventory must fit the existing full syntax budget');

    const fullIndex = buildInputArtifactIndex(artifacts);
    for (const ref of refs) {
      const evidence = resolveInputEvidence(fullIndex, ref);
      assert.equal(evidence.status, 'ok');
      assert.equal(evidence.bulletCount, facts.length);
      assert.equal(evidence.evidenceText, facts[0]);
    }
    assert.deepEqual(reconciliationParseStats(), warm, 'the public full resolver shares the retained syntax');
    assert.equal(fullPayloads.length, fullWrites);
    t.diagnostic(`${artifacts.length} planning inputs: full ${fullBytes} B, compact ${compactBytes} B; ` +
      'two compact-miss sweeps and a public full-resolver sweep add zero Evidence projections');
  } finally {
    hook.mock.restore();
  }
});

test('#321 compact Evidence cache enforces its byte budget and skips oversized summaries', (t) => {
  const id = 'IN-20261113-meeting-006';
  const resolve = (slug) => createInputEvidenceValidator([{ fm: { input_id: id },
    body: `## ${slug}\n- evidence\n` }])(`input:${id}#${slug}/01`);
  const stringify = JSON.stringify;
  let summaries = 0;
  const hook = t.mock.method(JSON, 'stringify', function (value, ...args) {
    const json = stringify.call(this, value, ...args), slug = value?.[0]?.[0];
    if (Array.isArray(value) && typeof slug === 'string' &&
        (slug.startsWith('compact-budget-') || slug.startsWith('compact-oversized-')) &&
        ['number', 'boolean'].includes(typeof value[0]?.[1]?.[0])) summaries += 1;
    return json;
  });
  try {
    const slugs = Array.from({ length: 5 }, (_, index) => `compact-budget-${index}-${'x'.repeat(110_000)}`);
    for (const slug of slugs) assert.equal(resolve(slug).hasEvidenceText, true);
    assert.equal(summaries, 5);
    const warm = reconciliationParseStats();
    assert.equal(resolve(slugs.at(-1)).hasEvidenceText, true);
    assert.equal(summaries, 5, 'the newest in-budget summary stays cached');
    assert.deepEqual(reconciliationParseStats(), warm);
    assert.equal(resolve(slugs[0]).hasEvidenceText, true);
    assert.equal(summaries, 6, 'five >220KiB summaries cannot all remain in the 1MiB validation cache');
    assert.deepEqual(reconciliationParseStats(), warm,
      'an evicted summary can reuse full syntax without rebuilding its Evidence view');

    const oversized = `compact-oversized-${'x'.repeat(530_000)}`;
    assert.equal(resolve(oversized).hasEvidenceText, true);
    assert.equal(summaries, 7);
    const oversizedWarm = reconciliationParseStats();
    assert.equal(resolve(oversized).hasEvidenceText, true);
    assert.equal(summaries, 8, 'an oversized summary is recomputed rather than retained');
    assert.deepEqual(reconciliationParseStats(), oversizedWarm,
      'the oversized summary can still reuse its bounded full syntax');

    assert.equal(resolve(slugs[0]).hasEvidenceText, true);
    assert.equal(summaries, 8, 'oversized results do not displace useful summaries');
    assert.deepEqual(reconciliationParseStats(), oversizedWarm);
  } finally {
    hook.mock.restore();
  }
});

test('#321 compact Evidence cache bounds entry count as well as retained syntax bytes', () => {
  const id = 'IN-20261113-meeting-007', ref = `input:${id}#compact-entry-cap/01`;
  const resolve = (number) => createInputEvidenceValidator([{ fm: { input_id: id },
    body: `## Compact Entry Cap\n- evidence\n<!-- entry ${number} -->\n` }])(ref);
  for (let index = 0; index <= 4096; index += 1) assert.equal(resolve(index).hasEvidenceText, true);
  const warm = reconciliationParseStats();
  assert.equal(resolve(4096).hasEvidenceText, true);
  assert.deepEqual(reconciliationParseStats(), warm);
  assert.equal(resolve(0).hasEvidenceText, true);
  assert.ok(reconciliationParseStats().reused > warm.reused, 'the oldest of 4097 compact entries must be evicted');
});
