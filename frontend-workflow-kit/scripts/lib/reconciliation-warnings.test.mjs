import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCanonicalInputIds,
  matchAffirmativeConflictMarker,
} from './reconciliation-warnings.mjs';

test('RR-ROUTE-101 marker allowlist accepts only affirmative Korean/English forms', () => {
  const positives = new Map([
    ['IN-A와 IN-B가 충돌한다', '충돌'],
    ['IN-A와 IN-B가 상충한다', '상충'],
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

test('RR-ROUTE-101 suppresses questions, uncertainty, negation, and weak wording', () => {
  for (const text of [
    'IN-A와 IN-B가 충돌하는지 확인 필요?',
    'IN-A와 IN-B의 충돌 여부',
    'IN-A와 IN-B가 상충하는지',
    'IN-A와 IN-B가 충돌할 가능성',
    '아마 IN-A와 IN-B가 충돌한다',
    'IN-A와 IN-B가 충돌하지 않음',
    'IN-A와 IN-B는 상충하지 않음',
    'IN-A와 IN-B는 양립 가능',
    'there may be a conflict',
    'possibly conflicts with',
    'whether A conflicts with B',
    'this is not a conflict',
    'A and B do not conflict',
    "A and B don't conflict",
    "A and B doesn’t conflict",
    'A and B are compatible',
    'A differs from B',
    'A mismatch B',
    'A vs B',
  ]) {
    assert.equal(matchAffirmativeConflictMarker(text), null, text);
  }
});

test('canonical input token extraction has explicit boundaries and deterministic order', () => {
  assert.deepEqual(
    extractCanonicalInputIds('xIN-20260803-a-001 IN-20260803-b-001, IN-20260803-a-001 IN-20260803-c-001.extra'),
    ['IN-20260803-a-001', 'IN-20260803-b-001', 'IN-20260803-c-001.extra'],
  );
  assert.deepEqual(extractCanonicalInputIds('PREFIX-IN-20260803-a-001suffix'), []);
});
