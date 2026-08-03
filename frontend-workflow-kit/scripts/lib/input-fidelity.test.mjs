import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectInputFidelityIssues,
  inspectInputFidelity,
  normalizeProducerInputFidelity,
  validateInputFidelityArtifacts,
} from './input-fidelity.mjs';

function artifact(id, overrides = {}, file = `/tmp/${id}.md`) {
  return {
    file,
    hasFrontmatter: true,
    parseError: undefined,
    fm: {
      input_id: id,
      input_type: 'planning',
      source_type: 'planning-doc',
      source_ref: `planning/${id}`,
      captured_at: '2026-07-30T10:00:00+09:00',
      captured_by: 'test',
      status: 'captured',
      affected_domains: ['auth'],
      affected_screens: ['AUTH-001'],
      confidence: 'candidate',
      ...overrides,
    },
  };
}

function v2(fidelity, extra = {}) {
  return { input_contract: 2, fidelity, ...extra };
}

function messages(artifacts) {
  return collectInputFidelityIssues(artifacts).issues.map((issue) => issue.message);
}

test('v1 is silent even with inert fidelity metadata; producer rejects fidelity without version', () => {
  const a = artifact('IN-20260730-planning-001', {
    fidelity: { extraction: 'vision-verbatim' },
  });
  assert.deepEqual(validateInputFidelityArtifacts([a]), { errors: [], warnings: [] });
  assert.deepEqual(normalizeProducerInputFidelity({ fidelity: {} }).issues, [
    'IF-100: producer payload에 fidelity가 있으면 input_contract: 2를 명시해야 함',
  ]);
  assert.deepEqual(normalizeProducerInputFidelity({}).fields, {});
});

test('v2 version/shape/keys/enums/unreadable_count are strict without coercion', () => {
  for (const raw of [null, true, '02', 3]) {
    assert.match(inspectInputFidelity({ input_contract: raw }).issues.join('\n'), /IF-101/);
  }
  assert.match(inspectInputFidelity({ input_contract: 2, fidelity: null }).issues.join('\n'), /IF-102/);
  assert.match(inspectInputFidelity({ input_contract: 2, fidelity: [] }).issues.join('\n'), /IF-102/);

  const invalid = inspectInputFidelity(v2({
    extraction: 'vision',
    verification: 'checked',
    unreadable_count: '1',
    typo: true,
  }));
  assert.match(invalid.issues.join('\n'), /IF-103/);
  assert.match(invalid.issues.join('\n'), /IF-105/);
  assert.match(invalid.issues.join('\n'), /IF-106/);
  assert.match(invalid.issues.join('\n'), /IF-107/);

  for (const count of [-1, 1.5, '1', null, true]) {
    assert.match(inspectInputFidelity(v2({
      extraction: 'direct-text',
      verification: 'unverified',
      unreadable_count: count,
    })).issues.join('\n'), /IF-107/);
  }
});

test('verified fidelity requires exact raw_artifact membership and keeps confidence independent', () => {
  const good = artifact('IN-20260730-figma-001', v2({
    extraction: 'vision-verbatim',
    verification: 'verified',
    verified_against: 'raw_artifact:planning/login-crop.png',
    unreadable_count: 0,
  }, {
    raw_artifacts: ['planning/login-crop.png'],
    confidence: 'candidate',
  }));
  assert.deepEqual(messages([good]), []);
  assert.equal(good.fm.confidence, 'candidate');

  const missing = artifact('IN-20260730-figma-002', v2({
    extraction: 'structured-source',
    verification: 'verified',
    unreadable_count: 0,
  }));
  assert.match(messages([missing]).join('\n'), /IF-109/);

  const wrong = artifact('IN-20260730-figma-003', v2({
    extraction: 'structured-source',
    verification: 'verified',
    verified_against: 'raw_artifact:not-present.json',
    unreadable_count: 0,
  }, { raw_artifacts: ['actual.json'] }));
  assert.match(messages([wrong]).join('\n'), /IF-110/);

  const malformedRaw = artifact('IN-20260730-figma-004', v2({
    extraction: 'structured-source',
    verification: 'verified',
    verified_against: 'raw_artifact:actual.json',
    unreadable_count: 0,
  }, { raw_artifacts: 'actual.json' }));
  assert.match(messages([malformedRaw]).join('\n'), /IF-108/);
});

test('cross-field rules reject inherited mismatches and evidence on unverified/not-applicable', () => {
  const inheritedMismatch = inspectInputFidelity(v2({
    extraction: 'direct-text',
    verification: 'inherited',
    verified_against: 'input:IN-20260730-planning-001',
    unreadable_count: 0,
  }));
  assert.match(inheritedMismatch.issues.join('\n'), /IF-111/);

  const extractionMismatch = inspectInputFidelity(v2({
    extraction: 'inherited',
    verification: 'unverified',
    unreadable_count: 0,
  }));
  assert.match(extractionMismatch.issues.join('\n'), /IF-114/);

  for (const verification of ['unverified', 'not-applicable']) {
    const info = inspectInputFidelity(v2({
      extraction: 'direct-text',
      verification,
      verified_against: 'raw_artifact:x.png',
      unreadable_count: 0,
    }));
    assert.match(info.issues.join('\n'), /IF-113/);
  }
});

test('inherited chains resolve uniquely to a well-formed verified terminal', () => {
  const terminal = artifact('IN-20260730-figma-001', v2({
    extraction: 'vision-verbatim',
    verification: 'verified',
    verified_against: 'raw_artifact:raw.png',
    unreadable_count: 0,
  }, { raw_artifacts: ['raw.png'] }));
  const middle = artifact('IN-20260730-figma-002', v2({
    extraction: 'inherited',
    verification: 'inherited',
    verified_against: 'input:IN-20260730-figma-001',
    unreadable_count: 0,
  }));
  const start = artifact('IN-20260730-figma-003', v2({
    extraction: 'inherited',
    verification: 'inherited',
    verified_against: 'input:IN-20260730-figma-002',
    unreadable_count: 0,
  }));
  assert.deepEqual(messages([terminal, middle, start]), []);
});

test('inherited chains fail closed on missing, duplicate, self, v1, malformed, cycle, and unverified terminals', () => {
  const inherited = (id, target) => artifact(id, v2({
    extraction: 'inherited',
    verification: 'inherited',
    verified_against: `input:${target}`,
    unreadable_count: 0,
  }));

  assert.match(messages([inherited('IN-20260730-a-001', 'IN-20260730-a-999')]).join('\n'), /IF-115/);
  assert.match(messages([inherited('IN-20260730-a-001', 'IN-20260730-a-001')]).join('\n'), /IF-116/);

  const dup1 = artifact('IN-20260730-target-001');
  const dup2 = artifact('IN-20260730-target-001', {}, '/tmp/duplicate.md');
  assert.match(messages([
    inherited('IN-20260730-a-001', 'IN-20260730-target-001'), dup1, dup2,
  ]).join('\n'), /IF-117/);

  const v1Target = artifact('IN-20260730-target-002');
  assert.match(messages([
    inherited('IN-20260730-a-001', 'IN-20260730-target-002'), v1Target,
  ]).join('\n'), /IF-118/);

  const malformedTarget = artifact('IN-20260730-target-003', v2({
    extraction: 'vision-verbatim',
    verification: 'verified',
    verified_against: 'raw_artifact:missing.png',
    unreadable_count: 0,
  }));
  assert.match(messages([
    inherited('IN-20260730-a-001', 'IN-20260730-target-003'), malformedTarget,
  ]).join('\n'), /IF-118/);

  const unverifiedTerminal = artifact('IN-20260730-target-004', v2({
    extraction: 'manual-transcription',
    verification: 'unverified',
    unreadable_count: 1,
  }));
  assert.match(messages([
    inherited('IN-20260730-a-001', 'IN-20260730-target-004'), unverifiedTerminal,
  ]).join('\n'), /IF-119/);

  const a = inherited('IN-20260730-cycle-001', 'IN-20260730-cycle-002');
  const b = inherited('IN-20260730-cycle-002', 'IN-20260730-cycle-001');
  assert.match(messages([a, b]).join('\n'), /IF-120/);
});

test('producer normalization emits numeric contract/count and no invented defaults', () => {
  const normalized = normalizeProducerInputFidelity(v2({
    extraction: 'direct-text',
    verification: 'not-applicable',
    unreadable_count: 0,
  }));
  assert.deepEqual(normalized.issues, []);
  assert.equal(normalized.fields.input_contract, 2);
  assert.equal(typeof normalized.fields.input_contract, 'number');
  assert.equal(normalized.fields.fidelity.unreadable_count, 0);
  assert.equal(typeof normalized.fields.fidelity.unreadable_count, 'number');
  assert.equal(Object.hasOwn(normalized.fields.fidelity, 'verified_against'), false);
});
