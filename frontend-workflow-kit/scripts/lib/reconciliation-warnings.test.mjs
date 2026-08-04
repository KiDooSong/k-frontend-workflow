import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInputArtifactIndex } from './provenance.mjs';
import {
  analyzeReconciliationWarnings,
  extractCanonicalInputIds,
  matchAffirmativeConflictMarker,
} from './reconciliation-warnings.mjs';

const CURRENT_INPUT_ID = 'IN-20260803-meeting-001';
const OTHER_INPUT_ID = 'IN-20260731-planning-003';
const UNRELATED_INPUT_ID = 'IN-20260803-qa-002';
const GROUP_KEY = `${CURRENT_INPUT_ID}\0${'01'}`;

function inputArtifact(inputId, facts = []) {
  return {
    fm: { input_id: inputId },
    body: ['## Extracted Facts', ...facts.map((fact) => `- ${fact}`), ''].join('\n'),
  };
}

function unknownTargetIndex() {
  return {
    duplicates: new Set(),
    artifacts: new Map([
      [
        'COUPON-001-screen-spec',
        {
          rows: new Map([
            [
              'U-001',
              [
                {
                  family: 'unknown',
                  sectionSlug: 'unknowns',
                  statusRaw: 'open',
                  normalizedStatus: 'open',
                  statusKnown: true,
                },
              ],
            ],
          ]),
        },
      ],
    ]),
  };
}

function routeWarnings({
  evidenceText,
  currentSummaryTrust = true,
  unrelatedSummaryTrust = true,
  includeOtherInput = true,
  duplicateOtherInput = false,
} = {}) {
  const artifacts = [inputArtifact(CURRENT_INPUT_ID, [evidenceText])];
  if (includeOtherInput) {
    artifacts.push(inputArtifact(OTHER_INPUT_ID, ['control']));
    if (duplicateOtherInput) artifacts.push(inputArtifact(OTHER_INPUT_ID, ['duplicate control']));
  }
  const inputIndex = buildInputArtifactIndex(artifacts);
  const target = {
    kind: 'unknown',
    raw: 'unknown:U-001@COUPON-001-screen-spec',
    ownerArtifactId: 'COUPON-001-screen-spec',
    rowId: 'U-001',
  };
  const row = {
    inputId: CURRENT_INPUT_ID,
    basis: 'scope-unclear',
    classification: 'scope-unclear',
    effect: 'create-open',
    evidence: `input:${CURRENT_INPUT_ID}#extracted-facts/01`,
  };
  return analyzeReconciliationWarnings({
    summaryRows: [
      { inputId: CURRENT_INPUT_ID, result: 'accepted' },
      { inputId: UNRELATED_INPUT_ID, result: 'accepted' },
    ],
    structuredInputs: new Set([CURRENT_INPUT_ID]),
    groups: new Map([[GROUP_KEY, [{ row, rowHardValid: true, target }]]]),
    groupTrust: new Map([[GROUP_KEY, true]]),
    summaryTrust: new Map([
      [CURRENT_INPUT_ID, currentSummaryTrust],
      [UNRELATED_INPUT_ID, unrelatedSummaryTrust],
    ]),
    inputIndex,
    targetIndex: unknownTargetIndex(),
  });
}

test('RR-ROUTE-101 marker allowlist accepts affirmative Korean/English forms', () => {
  const positives = new Map([
    ['A와 B가 충돌한다', '충돌'],
    ['A와 B가 상충한다', '상충'],
    ['두 정책은 양립 불가다', '양립 불가'],
    ['두 정책은 양립할 수 없다', '양립할 수 없'],
    ['두 입력은 서로 모순이다', '서로 모순'],
    ['두 조건은 동시에 만족할 수 없다', '동시에 만족할 수 없'],
    ['A is in conflict with B', 'conflict'],
    ['A conflicts with B', 'conflicts with'],
    ['A contradict B', 'contradict'],
    ['A contradicts B', 'contradicts'],
    ['A is contradictory to B', 'contradictory'],
    ['A and B are mutually exclusive', 'mutually exclusive'],
    ['A and B are incompatible', 'incompatible'],
    ['A and B cannot both hold', 'cannot both'],
  ]);
  for (const [text, expected] of positives) {
    assert.equal(matchAffirmativeConflictMarker(text), expected, text);
  }
});

test('RR-ROUTE-101 suppresses questions, uncertainty, marker-specific negation, and weak wording', () => {
  for (const text of [
    'A와 B가 충돌하는지 확인 필요?',
    'A와 B의 충돌 여부',
    'A와 B가 상충하는지',
    'A와 B가 충돌할 가능성',
    '아마 A와 B가 충돌한다',
    'A와 B가 충돌하지 않음',
    'A와 B는 상충하지 않음',
    'A와 B는 양립 가능',
    '두 입력은 서로 모순되지 않는다',
    '두 조건은 양립 불가하지 않다',
    '두 조건은 양립 불가한 것은 아니다',
    '두 입력이 서로 모순되는가',
    'there may be a conflict',
    'possibly conflicts with',
    'whether A conflicts with B',
    'this is not a conflict',
    'A and B do not conflict',
    "A and B don't conflict",
    "A and B doesn’t conflict",
    'A does not contradict B',
    "A doesn't contradict B",
    'A and B are not contradictory',
    'A and B are not mutually exclusive',
    "A and B aren't mutually exclusive",
    'A and B are not incompatible',
    "A and B aren't incompatible",
    'Are A and B incompatible',
    'Do A and B contradict each other',
    'A and B are compatible',
    'A differs from B',
    'A mismatch B',
    'A vs B',
  ]) {
    assert.equal(matchAffirmativeConflictMarker(text), null, text);
  }
});

test('RR-ROUTE-101 polarity is marker-local across contrast clauses', () => {
  assert.equal(
    matchAffirmativeConflictMarker('A does not replace B, but B conflicts with C.'),
    'conflicts with',
  );
  assert.equal(
    matchAffirmativeConflictMarker('A and B are not incompatible; however, B contradicts C.'),
    'contradicts',
  );
});

test('canonical input extraction reuses the exact input contract and rejects path/suffix lookalikes', () => {
  assert.deepEqual(
    extractCanonicalInputIds(
      `(${OTHER_INPUT_ID}), ${CURRENT_INPUT_ID}. ${OTHER_INPUT_ID}`,
    ),
    [OTHER_INPUT_ID, CURRENT_INPUT_ID],
  );
  for (const text of [
    `inputs/${CURRENT_INPUT_ID}.md`,
    `https://example.test/inputs/${CURRENT_INPUT_ID}`,
    'IN-A',
    'IN-20260803-MEETING-001',
    'IN-20260803-meeting-01',
    'IN-20260803_meeting-001',
    'IN-20260803-meeting-001_extra',
    'IN-20260803-meeting-001.extra',
  ]) {
    assert.deepEqual(extractCanonicalInputIds(text), [], text);
  }
  assert.deepEqual(extractCanonicalInputIds(`PREFIX-${CURRENT_INPUT_ID}suffix`), []);
});

test('RR-ROUTE-101 requires a second unique indexed canonical input', () => {
  assert.equal(
    routeWarnings({ evidenceText: `기존 ${OTHER_INPUT_ID} 정책과 충돌한다.` }).length,
    1,
  );
  assert.equal(
    routeWarnings({
      evidenceText: '기존 IN-20260731-planning-999 정책과 충돌한다.',
      includeOtherInput: false,
    }).length,
    0,
  );
  assert.equal(
    routeWarnings({
      evidenceText: `기존 ${OTHER_INPUT_ID} 정책과 충돌한다.`,
      duplicateOtherInput: true,
    }).length,
    0,
  );
});

test('RR-ROUTE-101 does not turn the current input filename or URL into a second input', () => {
  for (const evidenceText of [
    `inputs/${CURRENT_INPUT_ID}.md 내부의 두 설명은 서로 충돌한다.`,
    `https://example.test/inputs/${CURRENT_INPUT_ID} 설명과 충돌한다.`,
  ]) {
    assert.equal(
      routeWarnings({ evidenceText, includeOtherInput: false }).length,
      0,
      evidenceText,
    );
  }
});

test('RR-ROUTE-101 rejects noncanonical lookalikes even when the marker is affirmative', () => {
  for (const token of [
    'IN-A',
    'IN-20260803-MEETING-001',
    'IN-20260803-meeting-01',
    'IN-20260803_meeting-001',
    'IN-20260803-meeting-001.extra',
  ]) {
    assert.equal(
      routeWarnings({
        evidenceText: `${token} 정책과 충돌한다.`,
        includeOtherInput: false,
      }).length,
      0,
      token,
    );
  }
});

for (const hardCode of [
  'RR-SCHEMA-006',
  'RR-ITEM-005',
  'RR-ITEM-006',
  'RR-ITEM-007',
  'duplicate Summary row',
]) {
  test(`RR-ROUTE-101 suppresses the candidate when the same input Summary is untrusted (${hardCode})`, () => {
    assert.equal(
      routeWarnings({
        evidenceText: `기존 ${OTHER_INPUT_ID} 정책과 충돌한다.`,
        currentSummaryTrust: false,
      }).length,
      0,
    );
  });
}

test('RR-ROUTE-101 keeps a trusted candidate when only another input Summary is untrusted', () => {
  assert.equal(
    routeWarnings({
      evidenceText: `기존 ${OTHER_INPUT_ID} 정책과 충돌한다.`,
      unrelatedSummaryTrust: false,
    }).length,
    1,
  );
});
