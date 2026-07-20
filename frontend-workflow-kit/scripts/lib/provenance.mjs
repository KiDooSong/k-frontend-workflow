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
const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

// 달력 구성요소를 명시 검증한다. Date.parse 에 위임하면 fail-open 이다 — V8 은 `T24:00:00`(자정 이월)
// 같은 값을 스펙상 유효로 정규화하므로, "존재하지 않는 시각이 통과"하는 구멍이 된다. 여기서는
// 월 1–12 · 일 1–(달별, 윤년 반영) · 시 0–23 · 분 0–59 · 초 0–59(윤초 60 은 결정성 위해 거부) ·
// 오프셋 시 0–23/분 0–59 를 직접 확인한다.
function calendarComponentsValid(m) {
  const [, y, mo, d, h, mi, s, tz] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day < 1 || day > daysInMonth) return false;
  if (Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return false;
  if (tz !== 'Z' && tz !== 'z') {
    const [tzH, tzM] = tz.slice(1).split(':').map(Number);
    if (tzH > 23 || tzM > 59) return false;
  }
  return true;
}

// 문자열이 RFC3339(with timezone) 인지 — 형식 + 달력 구성요소 검증.
export function isRfc3339(value) {
  if (typeof value !== 'string') return false;
  const m = RFC3339_RE.exec(value.trim());
  if (!m) return false;
  return calendarComponentsValid(m);
}

// RFC3339 문자열 → epoch ms. 형식 위반이면 null (호출부가 fail-closed 판단).
export function parseRfc3339(value) {
  if (!isRfc3339(value)) return null;
  return Date.parse(String(value).trim());
}
