import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildInputArtifactIndex,
  inputSectionDetails,
  inputSectionIndex,
  inspectFigmaSourcePrecision,
  isRfc3339,
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
    const originalParse = yaml.parse;
    let parses = 0;
    yaml.parse = (...args) => { parses += 1; return originalParse(...args); };
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
    assert.equal(parses, 2);
    assert.equal(resolve(malformed).status, 'missing-input', 'a parse-error artifact is excluded from the input index');
    assert.equal(resolve(artifact).evidenceText, 'original evidence', 'the body-only view retains its existing delimiter semantics');
    assert.equal(parses, 2);

    fs.writeFileSync(file, raw.replace('captured_at: "2026-07-30T10:00:00+09:00"', 'captured_at: "invalid"')
      .replace('status: "captured"', 'status: "captured"\\nsummary: old-frontmatter-summary')
      .replace('original evidence', 'updated evidence'));
    const changed = loadInputArtifact(file);
    assert.equal(parses, 3);
    const validation = validateInputArtifacts([changed]);
    assert.ok(validation.errors.some((entry) => /IP-001.*captured_at/.test(entry.message)));
    assert.ok(validation.warnings.some((entry) => /deprecated frontmatter 'summary'/.test(entry.message)));
    assert.equal(resolve(changed).evidenceText, 'updated evidence');
    assert.equal(parses, 3, 'validation remains separate from body extraction');
    process.stdout.write(JSON.stringify({ parses }));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { parses: 3 });
});
