import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInputArtifactIndex } from './provenance.mjs';
import {
  analyzeReconciliationWarnings,
  extractCanonicalInputIds,
  findAffirmativeConflictClauses,
  matchAffirmativeConflictMarker,
} from './reconciliation-warnings.mjs';

const CURRENT_INPUT_ID = 'IN-20260803-meeting-001';
const OTHER_INPUT_ID = 'IN-20260731-planning-003';
const THIRD_INPUT_ID = 'IN-20260801-policy-004';
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
  extraArtifacts = [],
} = {}) {
  const artifacts = [inputArtifact(CURRENT_INPUT_ID, [evidenceText])];
  if (includeOtherInput) {
    artifacts.push(inputArtifact(OTHER_INPUT_ID, ['control']));
    if (duplicateOtherInput) artifacts.push(inputArtifact(OTHER_INPUT_ID, ['duplicate control']));
  }
  artifacts.push(...extraArtifacts);
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
    '두 입력은 충돌이 아니다',
    '두 입력은 충돌은 아니다',
    '두 입력은 충돌하지는 않는다',
    '두 입력은 충돌 없음',
    '두 입력의 상충 여부를 확인한다',
    '두 조건의 양립 불가 여부를 확인한다',
    'A와 B가 충돌할 수 있다',
    'A와 B가 상충할 수 있다',
    'A와 B가 충돌할지도 모른다',
    'A와 B가 충돌할 수도 있다',
    'A와 B가 충돌한다고 볼 수 없다',
    'A와 B는 충돌이 아닌 것으로 보인다',
    'A와 B가 충돌한다는 근거는 없다',
    'A와 B가 충돌하는지는 불명확하다',
    'A와 B가 충돌하는지는 확실하지 않다',
    'A와 B가 충돌하는지 판단하기 어렵다',
    'A와 B가 충돌한 것은 아니다',
    'A와 B가 상충한다고 단정할 수 없다',
    'A와 B가 서로 모순이라고 할 수 없다',
    'there may be a conflict',
    'possibly conflicts with',
    'whether A conflicts with B',
    'I wonder if A conflicts with B',
    'It is unclear if A conflicts with B',
    'It is not true that A conflicts with B',
    'There is no evidence that A conflicts with B',
    'A probably conflicts with B',
    'A is unlikely to conflict with B',
    'A is not known to conflict with B',
    'this is not a conflict',
    'A and B do not conflict',
    "A and B don't conflict",
    "A and B doesn’t conflict",
    "A and B aren't in conflict",
    "A and B isn't a conflict",
    'A and B are conflict-free',
    'A and B are no-conflict',
    'A does not contradict B',
    "A doesn't contradict B",
    'A and B are not contradictory',
    'A and B are not mutually exclusive',
    "A and B aren't mutually exclusive",
    'A and B are not incompatible',
    "A and B aren't incompatible",
    'A and B are not necessarily incompatible',
    'Are A and B incompatible',
    'Do A and B contradict each other',
    'Q: Are A and B incompatible',
    'Check if A and B conflict',
    'Determine whether A and B are incompatible',
    'This could conflict with B',
    'A would conflict with B',
    'A can conflict with B',
    'A could be incompatible with B',
    'A appears incompatible with B',
    'A appears to conflict with B',
    'A seems to contradict B',
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
  assert.equal(
    matchAffirmativeConflictMarker('A could replace B, but B conflicts with C.'),
    'conflicts with',
  );
  assert.equal(
    matchAffirmativeConflictMarker('A may replace B, but B conflicts with C.'),
    'conflicts with',
  );
  assert.equal(
    matchAffirmativeConflictMarker('A와 B는 충돌할지도 모른다. 그러나 B와 C는 명백히 충돌한다.'),
    '충돌',
  );
});

test('RR-ROUTE-101 marker candidates preserve source-ordered clause metadata', () => {
  const candidates = findAffirmativeConflictClauses(
    `로컬 옵션은 충돌한다. ${OTHER_INPUT_ID} 정책과 상충한다.`,
  );
  assert.deepEqual(candidates.map((candidate) => candidate.label), ['충돌', '상충']);
  assert.equal(candidates[0].clauseText, '로컬 옵션은 충돌한다.');
  assert.equal(candidates[1].clauseText, `${OTHER_INPUT_ID} 정책과 상충한다.`);
  assert.ok(candidates[0].clauseStart < candidates[1].clauseStart);
  assert.ok(candidates[0].clauseEnd <= candidates[1].clauseStart);
});

test('RR-ROUTE-101 couples the marker and explicit input IDs to the same clause', () => {
  for (const evidenceText of [
    `관련 입력은 ${OTHER_INPUT_ID}이다. 화면 내부 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID}은 현재 정책과 동일하다. 별도의 두 UI 옵션은 양립 불가다.`,
    `${OTHER_INPUT_ID}을 참고한다; 로컬 캐시와 서버 캐시는 서로 모순이다.`,
  ]) {
    assert.equal(routeWarnings({ evidenceText }).length, 0, evidenceText);
  }

  assert.equal(
    routeWarnings({ evidenceText: `기존 ${OTHER_INPUT_ID} 정책과 충돌한다.` }).length,
    1,
  );
  assert.equal(
    routeWarnings({
      evidenceText: `${OTHER_INPUT_ID}과 ${THIRD_INPUT_ID}가 같은 clause에서 서로 충돌한다.`,
      extraArtifacts: [inputArtifact(THIRD_INPUT_ID, ['unique third input'])],
    }).length,
    1,
  );

  const laterValid = routeWarnings({
    evidenceText:
      `${OTHER_INPUT_ID}와 충돌한 것은 아니다. ` +
      `그러나 ${OTHER_INPUT_ID}와 명백히 상충한다.`,
  });
  assert.equal(laterValid.length, 1);
  assert.match(laterValid[0], /marker '상충'/);

  const firstSatisfying = routeWarnings({
    evidenceText: `로컬 옵션은 충돌한다. ${OTHER_INPUT_ID} 정책과 상충한다.`,
  });
  assert.equal(firstSatisfying.length, 1);
  assert.match(firstSatisfying[0], /marker '상충'/);
});

test('RR-ROUTE-101 isolates high-confidence coordination boundaries without breaking direct conjunctions', () => {
  for (const evidenceText of [
    `${OTHER_INPUT_ID}은 현재 정책과 동일하고, 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID}를 참고하며 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID} is compatible with the current policy, while the two local UI options conflict.`,
    `${OTHER_INPUT_ID} is compatible, whereas the local cache options conflict.`,
    `${OTHER_INPUT_ID} is compatible, although the local cache options conflict.`,
    `${OTHER_INPUT_ID} is compatible, though the local cache options conflict.`,
    `${OTHER_INPUT_ID}은 현재 정책과 동일하다. 한편 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID}은 현재 정책과 동일하다. 반대로 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID}은 현재 정책과 동일하다. 그와 별개로 별도 UI 옵션 두 개는 서로 충돌한다.`,
  ]) {
    assert.equal(routeWarnings({ evidenceText }).length, 0, evidenceText);
  }

  assert.equal(
    routeWarnings({
      evidenceText: `${OTHER_INPUT_ID} and ${THIRD_INPUT_ID} conflict.`,
      extraArtifacts: [inputArtifact(THIRD_INPUT_ID, ['unique third input'])],
    }).length,
    1,
  );
  assert.equal(
    routeWarnings({ evidenceText: `기존 ${OTHER_INPUT_ID} 정책과 충돌한다.` }).length,
    1,
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
    `GET /compare?input=${CURRENT_INPUT_ID}`,
    `?source=${CURRENT_INPUT_ID}`,
    `&source=${CURRENT_INPUT_ID}`,
    `foo/bar=${CURRENT_INPUT_ID}`,
    `./path/${CURRENT_INPUT_ID}`,
    `../path/${CURRENT_INPUT_ID}`,
    `file:${CURRENT_INPUT_ID}`,
    `urn:input:${CURRENT_INPUT_ID}`,
    `input=${CURRENT_INPUT_ID}`,
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

test('RR-ROUTE-101 fails closed when any explicit canonical input is missing or ambiguous', () => {
  assert.equal(
    routeWarnings({
      evidenceText: `${OTHER_INPUT_ID}과 ${THIRD_INPUT_ID}가 충돌한다.`,
      extraArtifacts: [
        inputArtifact(THIRD_INPUT_ID, ['first duplicate']),
        inputArtifact(THIRD_INPUT_ID, ['second duplicate']),
      ],
    }).length,
    0,
    'unique second ID plus duplicate third ID must suppress the entire candidate',
  );

  assert.equal(
    routeWarnings({
      evidenceText: `${OTHER_INPUT_ID}과 ${THIRD_INPUT_ID}가 충돌한다.`,
    }).length,
    0,
    'unique second ID plus missing third ID must suppress the entire candidate',
  );

  assert.equal(
    routeWarnings({
      evidenceText: `${OTHER_INPUT_ID}과 IN-20260801-policy-999가 충돌한다.`,
    }).length,
    0,
    'a canonical-looking typo plus a valid ID must suppress the entire candidate',
  );

  assert.equal(
    routeWarnings({
      evidenceText: `${OTHER_INPUT_ID}과 ${THIRD_INPUT_ID}가 충돌한다.`,
      extraArtifacts: [inputArtifact(THIRD_INPUT_ID, ['unique third input'])],
    }).length,
    1,
    'the existing positive remains when every explicit ID resolves uniquely',
  );
});

test('RR-ROUTE-101 does not turn filenames, relative paths, queries, or URIs into a second input', () => {
  for (const evidenceText of [
    `inputs/${CURRENT_INPUT_ID}.md 내부의 두 설명은 서로 충돌한다.`,
    `https://example.test/inputs/${CURRENT_INPUT_ID} 설명과 충돌한다.`,
    `GET /compare?input=${OTHER_INPUT_ID} 응답과 현재 정책은 충돌한다.`,
    `?source=${OTHER_INPUT_ID} 값과 현재 정책은 충돌한다.`,
    `foo/bar=${OTHER_INPUT_ID} 값과 현재 정책은 충돌한다.`,
    `file:${OTHER_INPUT_ID} 값과 현재 정책은 충돌한다.`,
    `urn:input:${OTHER_INPUT_ID} 값과 현재 정책은 충돌한다.`,
  ]) {
    assert.equal(
      routeWarnings({ evidenceText, includeOtherInput: evidenceText.includes(OTHER_INPUT_ID) }).length,
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
