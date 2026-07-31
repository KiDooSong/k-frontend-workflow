import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildInputArtifactIndex,
  isRfc3339,
  parseInputEvidenceRef,
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
