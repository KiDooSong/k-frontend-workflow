import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
