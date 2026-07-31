import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  collectInputArtifacts,
  validateInputArtifacts,
  INPUT_TYPE_VALUES,
  SOURCE_TYPE_VALUES,
} from './input-artifact.mjs';

function writeInput(dir, id, { inputType, sourceType }) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${id}.md`),
    [
      '---',
      `input_id: "${id}"`,
      `input_type: "${inputType}"`,
      `source_type: "${sourceType}"`,
      'source_ref: "fixture/ref"',
      'captured_at: "2026-06-13T00:00:00+09:00"',
      'captured_by: "input-artifact-test"',
      'status: "captured"',
      'affected_domains: ["coupons"]',
      'affected_screens: ["COUPON-001"]',
      'supersedes: null',
      '---',
      '',
      '# Input',
      '',
      '## Summary',
      'Fixture input.',
      '',
    ].join('\n'),
    'utf8',
  );
}

test('input artifact enum accepts visual, testID, architecture, and policy migration surfaces', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'input-artifact-enum-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const inputsDir = path.join(tmp, 'inputs');

  writeInput(inputsDir, 'IN-20260613-visual-spec-001', {
    inputType: 'visual-spec',
    sourceType: 'visual-spec',
  });
  writeInput(inputsDir, 'IN-20260613-testid-001', {
    inputType: 'testid',
    sourceType: 'qa-automation',
  });
  writeInput(inputsDir, 'IN-20260613-architecture-001', {
    inputType: 'architecture',
    sourceType: 'architecture',
  });
  writeInput(inputsDir, 'IN-20260613-policy-migration-001', {
    inputType: 'policy-migration',
    sourceType: 'policy-migration',
  });

  const result = validateInputArtifacts(collectInputArtifacts(inputsDir));

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.ok(INPUT_TYPE_VALUES.includes('visual-spec'));
  assert.ok(INPUT_TYPE_VALUES.includes('testid'));
  assert.ok(INPUT_TYPE_VALUES.includes('policy-migration'));
  assert.ok(SOURCE_TYPE_VALUES.includes('qa-automation'));
});

test('collectInputArtifacts validates grouped inputs recursively across subdirs', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'input-artifact-grouped-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const inputsDir = path.join(tmp, 'inputs');

  writeInput(path.join(inputsDir, 'auth'), 'IN-20260613-figma-001', { inputType: 'figma', sourceType: 'figma' });
  writeInput(path.join(inputsDir, '_multi'), 'IN-20260613-planning-001', { inputType: 'planning', sourceType: 'planning-doc' });
  writeInput(path.join(inputsDir, 'auth', 'figma'), 'IN-20260613-qa-001', { inputType: 'qa', sourceType: 'qa' });

  const result = validateInputArtifacts(collectInputArtifacts(inputsDir));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('collectInputArtifacts ignores directory README/index guides but still flags malformed inputs', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'input-artifact-readme-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const inputsDir = path.join(tmp, 'inputs');

  fs.mkdirSync(path.join(inputsDir, 'auth'), { recursive: true });
  // Directory guide files (any case) must NOT be treated as input artifacts.
  fs.writeFileSync(path.join(inputsDir, 'README.md'), '# Workflow Inputs\n\nGuide only, no frontmatter.\n');
  fs.writeFileSync(path.join(inputsDir, 'auth', 'README.md'), '# Inputs — auth\n');
  fs.writeFileSync(path.join(inputsDir, 'auth', 'index.md'), '# index\n');
  // mixed-case variants are also guides (Windows/macOS treat them as the same file).
  fs.mkdirSync(path.join(inputsDir, '_global'), { recursive: true });
  fs.writeFileSync(path.join(inputsDir, '_global', 'Readme.md'), '# mixed-case guide\n');
  fs.writeFileSync(path.join(inputsDir, '_global', 'Index.MD'), '# mixed-case index\n');
  writeInput(path.join(inputsDir, 'auth'), 'IN-20260613-figma-001', { inputType: 'figma', sourceType: 'figma' });

  const clean = validateInputArtifacts(collectInputArtifacts(inputsDir));
  assert.deepEqual(clean.errors, [], 'README/index guides (any case) must not raise input frontmatter errors');

  // Guard: a genuinely malformed IN-*.md (no frontmatter) is still reported — only README/index are skipped.
  fs.writeFileSync(path.join(inputsDir, 'IN-20260613-figma-002.md'), 'no frontmatter at all\n');
  const flagged = validateInputArtifacts(collectInputArtifacts(inputsDir));
  assert.equal(flagged.errors.some((e) => /frontmatter 없음/.test(e.message)), true);
});

test('validateInputArtifacts detects a duplicate input_id across subdirs', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'input-artifact-dup-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const inputsDir = path.join(tmp, 'inputs');

  writeInput(path.join(inputsDir, 'auth'), 'IN-20260613-figma-001', { inputType: 'figma', sourceType: 'figma' });
  writeInput(path.join(inputsDir, '_multi'), 'IN-20260613-figma-001', { inputType: 'figma', sourceType: 'figma' });

  const result = validateInputArtifacts(collectInputArtifacts(inputsDir));
  assert.equal(result.errors.some((e) => /input_id 중복/.test(e.message)), true);
});

test('check 11 hard-validates captured_at with shared RFC3339 parser across grouped inputs', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'input-artifact-captured-at-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const inputsDir = path.join(tmp, 'inputs');

  const invalidValues = [
    ['date-only', '"2026-07-30"'],
    ['local', '"2026-07-30T10:00:00"'],
    ['calendar', '"2025-02-29T10:00:00Z"'],
    ['hour', '"2026-07-30T24:00:00Z"'],
    ['offset', '"2026-07-30T10:00:00+24:00"'],
    ['number', '123'],
    ['null', 'null'],
  ];
  invalidValues.forEach(([name, yaml], index) => {
    const id = `IN-20260730-${name}-${String(index + 1).padStart(3, '0')}`;
    const dir = path.join(inputsDir, 'auth', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.md`), [
      '---',
      `input_id: "${id}"`,
      'input_type: "planning"',
      'source_type: "planning-doc"',
      'source_ref: "fixture/ref"',
      `captured_at: ${yaml}`,
      'captured_by: "test"',
      'status: "captured"',
      'affected_domains: ["auth"]',
      'affected_screens: ["AUTH-001"]',
      '---',
      '## Summary',
      'x',
    ].join('\n'));
  });

  const result = validateInputArtifacts(collectInputArtifacts(inputsDir));
  const ipErrors = result.errors.filter((error) => /IP-001/.test(error.message));
  assert.equal(ipErrors.length, invalidValues.length);
});

test('check 11 keeps v1 fidelity inert and emits IF warnings only for explicit input_contract:2', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'input-artifact-fidelity-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const inputsDir = path.join(tmp, 'inputs');
  writeInput(inputsDir, 'IN-20260730-planning-001', { inputType: 'planning', sourceType: 'planning-doc' });
  const v1File = path.join(inputsDir, 'IN-20260730-planning-001.md');
  fs.appendFileSync(v1File, '\n<!-- inert fidelity prose does not opt in -->\n');

  const id = 'IN-20260730-planning-002';
  fs.writeFileSync(path.join(inputsDir, `${id}.md`), [
    '---',
    `input_id: "${id}"`,
    'input_type: "planning"',
    'source_type: "planning-doc"',
    'source_ref: "fixture/ref"',
    'captured_at: "2026-07-30T10:00:00+09:00"',
    'captured_by: "test"',
    'status: "captured"',
    'affected_domains: ["auth"]',
    'affected_screens: ["AUTH-001"]',
    'input_contract: 2',
    'fidelity: null',
    '---',
    '## Summary',
    'x',
  ].join('\n'));

  const result = validateInputArtifacts(collectInputArtifacts(inputsDir));
  assert.equal(result.warnings.some((warning) => warning.file === v1File && /IF-/.test(warning.message)), false);
  assert.equal(result.warnings.some((warning) => /IF-102/.test(warning.message)), true);
});
