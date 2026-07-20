// Provenance 공통 파서 — RFC3339 timestamp · Source Unit enum · inherit 토큰의 단일 출처.
// 계약: input-reconciliation.md "Reconciliation Contract v2" §Provenance.
// 소비처(현재): 검사 12 v2 item 표(reconciliation-items.mjs)의 Captured At / Source Unit / structured_since.
// 소비처(후속 202-B): 검사 11 input `captured_at` 형식, figma-component-mapping `## Mapping Provenance`.
// 여기 두는 이유: 세 소비처가 같은 형식 판정을 공유해 표류하지 않게 한다(설계 §9.1).

// item 셀에서 input-level 값(frontmatter source_ref/captured_at) 상속을 뜻하는 토큰.
export const INHERIT = 'inherit';

// Source Unit enum — evidence 가 무엇을 세거나 가리키는지의 정밀도 바닥 어휘.
// `n/a` 는 reject 또는 source 없는 purely procedural item 에만 허용(호출부가 판정).
export const SOURCE_UNIT_VALUES = [
  'document',
  'statement',
  'record',
  'instance',
  'node',
  'frame',
  'token',
  'screenshot',
  'measurement',
  'aggregate',
  'n/a',
];

// RFC3339 with timezone: `2026-07-20T10:15:30+09:00` / `2026-07-20T01:15:30Z` (+선택 소수초).
// date-only(`2026-07-20`)·슬래시·타임존 없는 로컬 표기는 거부한다 — capture 시점 비교의 전제가
// 타임존 명시이기 때문(설계 §9.1 금지 목록).
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

// 문자열이 RFC3339(with timezone) 인지. 형식 매칭 후 Date.parse 로 실제 달력값(2월 30일 등)도 거른다.
export function isRfc3339(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!RFC3339_RE.test(v)) return false;
  return !Number.isNaN(Date.parse(v));
}

// RFC3339 문자열 → epoch ms. 형식 위반이면 null (호출부가 fail-closed 판단).
export function parseRfc3339(value) {
  if (!isRfc3339(value)) return null;
  return Date.parse(String(value).trim());
}
