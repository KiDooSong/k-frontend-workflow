// policy-condition.mjs — policy `requires` 조건 파싱의 단일 출처(single source of truth).
//   readiness.mjs(런타임 게이트 판정)와 validate.mjs(저작-시점 검사 14)가 둘 다 여기서 import 한다.
//   두 소비자가 각자 정규식을 복제하면 파싱 규칙이 조용히 표류(drift)한다 — 규칙은 이 파일 한 곳에서만 고친다.
//   참고: frontend-workflow-kit-implementation.md §7, readiness-failopen.test.mjs(런타임 fail-closed 회귀).

// "fact OP value" 한 줄을 파싱. 파싱 불가하면 null.
//   OP ∈ {>=, <=, ==, >, <}. rhs 는 non-greedy 로 뒤 공백을 흘려보낸다.
//   readiness.mjs 의 기존 동작을 바이트 동일하게 보존하려면 이 정규식·반환 형태를 그대로 유지한다.
export function parseCondition(str) {
  const m = /^\s*([a-z0-9_]+)\s*(>=|<=|==|>|<)\s*(.+?)\s*$/i.exec(str);
  if (!m) return null;
  return { key: m[1], op: m[2], rhs: m[3] };
}

// requires 문자열이 파싱 가능한 형식("fact OP value")인지 판정하는 술어.
//   validate 검사 14(warning-first)가 정책 파일의 각 requires 를 저작 시점에 이 술어로 검사한다.
//   단일 `=`(오타), `=>`(연산자 뒤집힘), 연산자/값 없는 bare 토큰, 빈 문자열 등은 false.
//   string 이 아닌 값(YAML 매핑·숫자 등 잘못 작성된 항목)도 malformed 로 본다.
export function isWellFormedRequirement(str) {
  return typeof str === 'string' && parseCondition(str) !== null;
}
