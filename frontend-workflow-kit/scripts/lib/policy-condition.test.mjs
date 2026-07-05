// policy-condition.test.mjs — policy `requires` 파싱 단일 출처(parseCondition/isWellFormedRequirement)의
//   단위 테스트 + validate 검사 14(warning-first) 통합 테스트.
//   목적(issue #133 optional): 저작 시점에 malformed requires 를 경고로 알리되 exit code 는 불변.
//   런타임 fail-closed(#135)는 readiness-failopen.test.mjs 가 별도로 지킨다 — 여기는 파서·저작-시점 검사.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCondition, isWellFormedRequirement } from './policy-condition.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = path.resolve(HERE, '..', '..');
const VALIDATE_CLI = path.join(KIT_ROOT, 'scripts', 'validate.mjs');

function tmpdir(t, prefix = 'policy-condition-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// --- 단위 테스트: 파서 단일 출처 ---

test('parseCondition: well-formed(>= <= == > <) 은 {key, op, rhs} 로 파싱된다', () => {
  assert.deepEqual(parseCondition('screen_spec_status >= confirmed'), {
    key: 'screen_spec_status',
    op: '>=',
    rhs: 'confirmed',
  });
  assert.deepEqual(parseCondition('api_confidence_min <= candidate'), {
    key: 'api_confidence_min',
    op: '<=',
    rhs: 'candidate',
  });
  assert.deepEqual(parseCondition('ci_lint == pass'), { key: 'ci_lint', op: '==', rhs: 'pass' });
  assert.deepEqual(parseCondition('stub_screen_specs_count > 0'), {
    key: 'stub_screen_specs_count',
    op: '>',
    rhs: '0',
  });
  assert.deepEqual(parseCondition('tbd_count < 5'), { key: 'tbd_count', op: '<', rhs: '5' });
});

test('isWellFormedRequirement: 다섯 연산자 모두 통과', () => {
  for (const op of ['>=', '<=', '==', '>', '<']) {
    assert.equal(isWellFormedRequirement(`state_matrix_complete ${op} true`), true, op);
  }
});

test('isWellFormedRequirement: malformed(단일 =, =>, bare 토큰, 빈 문자열)은 거부', () => {
  assert.equal(isWellFormedRequirement('ci_lint = pass'), false, '단일 = (오타)');
  assert.equal(isWellFormedRequirement('api_confidence_min => confirmed'), false, '=> (연산자 뒤집힘)');
  assert.equal(isWellFormedRequirement('state_matrix_complete'), false, '연산자/값 없는 bare 토큰');
  assert.equal(isWellFormedRequirement('foo bar baz'), false, '연산자 아닌 토큰');
  assert.equal(isWellFormedRequirement(''), false, '빈 문자열');
  assert.equal(isWellFormedRequirement('   '), false, '공백뿐');
  assert.equal(isWellFormedRequirement('== confirmed'), false, 'fact 키 없음');
});

test('parseCondition: 값 누락 `>=`/`<=` 가 `>`/`<` + rhs `=` 로 둔갑하지 않는다 (백트래킹 구멍)', () => {
  // 회귀: `screen_spec_status >=` 가 {op:">", rhs:"="} 로 파싱되면 런타임에서 status > "="(=rank 0)라
  //   authored 화면마다 항상 통과 → 게이트가 조용히 사라진다. 이제 null(malformed)이어야 한다.
  assert.equal(parseCondition('screen_spec_status >='), null, '값 누락 >=');
  assert.equal(parseCondition('screen_spec_status <='), null, '값 누락 <=');
  assert.equal(parseCondition('tbd_count >'), null, '값 누락 >');
  assert.equal(parseCondition('tbd_count <'), null, '값 누락 <');
  assert.equal(parseCondition('foo == '), null, '값 누락 ==');
  assert.equal(isWellFormedRequirement('screen_spec_status >='), false);
  assert.equal(isWellFormedRequirement('api_confidence_min <='), false);
});

test('parseCondition: 값이 있는 `>=`/`<=` 는 이전과 동일하게 파싱 (over-block 회귀 방지)', () => {
  assert.deepEqual(parseCondition('screen_spec_status >= confirmed'), {
    key: 'screen_spec_status',
    op: '>=',
    rhs: 'confirmed',
  });
  assert.deepEqual(parseCondition('api_confidence_min <= candidate'), {
    key: 'api_confidence_min',
    op: '<=',
    rhs: 'candidate',
  });
  // rhs 중간에 연산자 문자가 있어도 보존된다(첫 글자 제약만 있음).
  assert.deepEqual(parseCondition('key == a>b'), { key: 'key', op: '==', rhs: 'a>b' });
});

test('isWellFormedRequirement: string 이 아닌 값도 malformed', () => {
  assert.equal(isWellFormedRequirement(null), false);
  assert.equal(isWellFormedRequirement(undefined), false);
  assert.equal(isWellFormedRequirement(42), false);
  assert.equal(isWellFormedRequirement({ key: 'x' }), false);
});

// --- 통합 테스트: validate 검사 14 (CLI, warning-first) ---

function runValidate(args, t) {
  // 빈 docs 트리로 구동한다 — 검사 1~13 은 저작 문서 0건이라 무발화(cold-start 경고 + exit 0),
  //   검사 14 만 policy.requires 를 본다. (validate 는 --policy 오버라이드를 받는다.)
  const docs = path.join(tmpdir(t, 'policy-condition-validate-'), 'docs', 'frontend-workflow');
  fs.mkdirSync(docs, { recursive: true });
  const res = spawnSync(
    process.execPath,
    [VALIDATE_CLI, '--docs', docs, '--json', ...args],
    { encoding: 'utf8' },
  );
  assert.equal(res.status, 0, `validate 는 warning-first 라 exit 0 이어야 함\n${res.stderr}`);
  const body = JSON.parse(res.stdout);
  return { body, check14: (body.warnings || []).filter((w) => w.check === 14) };
}

function writePolicy(t, body) {
  const dir = tmpdir(t, 'policy-condition-yaml-');
  const file = path.join(dir, 'policy.yaml');
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

test('검사 14: malformed requires 가 경고를 내되 exit 0 유지', (t) => {
  const policy = writePolicy(
    t,
    [
      'version: 1',
      'order: [docs-only, rough-fixture-ui]',
      'modes:',
      '  docs-only:',
      '    requires: []',
      '    allowed_paths: [docs/frontend-workflow/**]',
      '    forbidden_paths: [src/**]',
      '  rough-fixture-ui:',
      '    requires:',
      '      - "ci_lint = pass"', // 단일 =
      '      - "api_confidence_min => confirmed"', // =>
      '      - "state_matrix_complete"', // bare 토큰
      '      - "screen_spec_authored == true"', // well-formed (경고 없어야 함)
      '    allowed_paths: [src/**]',
      '    forbidden_paths: []',
    ].join('\n') + '\n',
  );
  const { body, check14 } = runValidate(['--policy', policy], t);
  assert.equal(body.ok, true, '검사 14 는 하드 에러가 아니므로 ok=true');
  assert.equal(check14.length, 3, 'malformed 3건에 각각 경고');
  const joined = check14.map((w) => w.message).join('\n');
  assert.match(joined, /ci_lint = pass/, '어떤 requirement 가 깨졌는지 담아야 함');
  assert.match(joined, /api_confidence_min => confirmed/);
  assert.match(joined, /state_matrix_complete/);
  assert.ok(
    check14.every((w) => /rough-fixture-ui/.test(w.message)),
    '어느 mode 인지 담아야 함',
  );
  assert.ok(
    check14.every((w) => /policy/.test(w.file)),
    '경고 file 은 정책 경로여야 함',
  );
  // well-formed 항목은 경고에 포함되지 않는다.
  assert.equal(/screen_spec_authored == true/.test(joined), false);
});

test('검사 14: well-formed 정책은 경고 0 (정본 policy 포함)', (t) => {
  // (a) 오버라이드 없이 정본 policies/implementation-mode-policy.yaml → 검사 14 경고 0.
  const canonical = runValidate([], t);
  assert.equal(canonical.check14.length, 0, '정본 정책에는 malformed 가 없어야 함');
  // (b) 명시적 well-formed 임시 정책 → 경고 0.
  const policy = writePolicy(
    t,
    [
      'version: 1',
      'order: [docs-only, final-fixture-ui]',
      'modes:',
      '  docs-only:',
      '    requires: []',
      '    allowed_paths: [docs/frontend-workflow/**]',
      '    forbidden_paths: [src/**]',
      '  final-fixture-ui:',
      '    requires:',
      '      - "screen_spec_status >= confirmed"',
      '      - "figma_mapping_status >= draft"',
      '    allowed_paths: [src/**]',
      '    forbidden_paths: []',
    ].join('\n') + '\n',
  );
  const { check14 } = runValidate(['--policy', policy], t);
  assert.equal(check14.length, 0, 'well-formed 정책은 검사 14 경고 0');
});

test('검사 14: 값 누락 `>=`/`<=` 도 경고 (백트래킹 구멍 회귀)', (t) => {
  const policy = writePolicy(
    t,
    [
      'version: 1',
      'order: [docs-only, rough]',
      'modes:',
      '  docs-only:',
      '    requires: []',
      '    allowed_paths: [docs/frontend-workflow/**]',
      '    forbidden_paths: [src/**]',
      '  rough:',
      '    requires:',
      '      - "screen_spec_status >="', // 값 누락 → 예전엔 > "=" 로 조용히 통과
      '      - "api_confidence_min <="', // 값 누락
      '      - "screen_spec_status >= confirmed"', // well-formed (경고 없어야 함)
      '    allowed_paths: [src/**]',
      '    forbidden_paths: []',
    ].join('\n') + '\n',
  );
  const { body, check14 } = runValidate(['--policy', policy], t);
  assert.equal(body.ok, true);
  assert.equal(check14.length, 2, '값 누락 2건에 경고');
  const joined = check14.map((w) => w.message).join('\n');
  assert.match(joined, /screen_spec_status >=/);
  assert.match(joined, /api_confidence_min <=/);
  // well-formed 항목은 경고에 없다.
  assert.equal(/screen_spec_status >= confirmed/.test(joined), false);
});

test('검사 14: requires 가 리스트가 아니면(스칼라) 경고', (t) => {
  const policy = writePolicy(
    t,
    [
      'version: 1',
      'order: [docs-only, rough]',
      'modes:',
      '  docs-only:',
      '    requires: []',
      '    allowed_paths: [docs/frontend-workflow/**]',
      '    forbidden_paths: [src/**]',
      '  rough:',
      '    requires: "screen_spec_authored == true"', // 스칼라 — 리스트여야 함
      '    allowed_paths: [src/**]',
      '    forbidden_paths: []',
    ].join('\n') + '\n',
  );
  const { body, check14 } = runValidate(['--policy', policy], t);
  assert.equal(body.ok, true, '검사 14 는 warning-first — exit 0');
  assert.equal(check14.length, 1, '스칼라 requires 1건 경고');
  assert.match(check14[0].message, /리스트/, '리스트가 아님을 안내');
  assert.match(check14[0].message, /rough/, '어느 mode 인지 담아야 함');
});
