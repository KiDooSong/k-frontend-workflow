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
