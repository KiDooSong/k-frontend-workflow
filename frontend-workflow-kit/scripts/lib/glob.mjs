// glob.mjs — manifest 글롭 미니엔진 + 생성물 헤더 정규식의 단일 출처.
//   validate.mjs(검사 6)와 lib/check-generated-files.mjs(생성물 가드)가 둘 다 import 한다.
//   두 소비자가 같은 구현을 쓰게 해, "어떤 파일이 생성물 소유인가"에 대한 판정(stale/헤더)이
//   복사본 표류로 어긋나는 일을 막는다.
//
//   ⚠️ 글롭 규약: `{...}` 는 `{domain}` 류의 단일-세그먼트 placeholder 전용 — `[^/]+` 로 처리한다.
//      실제 brace-alternation(`{a,b}`)은 지원하지 않는다(manifest 글롭은 kit 이 작성한다).

// 생성물 헤더(do_not_edit) 무결성 마커 — "GENERATED FILE — DO NOT EDIT" (em-dash/hyphen 모두 허용).
export const GENERATED_HEADER_RE = /GENERATED FILE\s+(?:—|-)\s+DO NOT EDIT/;

// 글롭의 와일드카드 이전 고정 접두 세그먼트만 모은다(워크 시작점 앵커용).
//   예: "src/api/**/*.ts" → "src/api". 와일드카드/brace 가 나오면 거기서 멈춘다.
export function globRoot(pattern) {
  const parts = String(pattern).replace(/\\/g, '/').split('/');
  const root = [];
  for (const part of parts) {
    if (!part || /[*?\[\]{}]/.test(part)) break;
    root.push(part);
  }
  return root.join('/');
}

// 글롭 패턴을 정규식으로. `**`=경로 횡단(.*), `*`=단일 세그먼트([^/]*), `?`=한 글자([^/]),
// `{...}`=단일-세그먼트 placeholder([^/]+; 위 규약 참조). 그 외 문자는 리터럴 이스케이프.
export function globToRegExp(pattern) {
  const raw = String(pattern).replace(/\\/g, '/');
  let out = '^';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    const next = raw[i + 1];
    if (ch === '*') {
      if (next === '*') {
        out += '.*';
        i += 1;
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else if (ch === '{') {
      // 규약: `{...}` 는 `{domain}` 류의 단일-세그먼트 placeholder 전용 — `[^/]+` 로 처리한다.
      // 실제 brace-alternation(`{a,b}`)은 지원하지 않는다(manifest 글롭은 kit 이 작성).
      const end = raw.indexOf('}', i + 1);
      if (end !== -1) {
        out += '[^/]+';
        i = end;
      } else {
        out += '\\{';
      }
    } else {
      out += ch.replace(/[\\^$+?.()|[\]]/g, '\\$&');
    }
  }
  return new RegExp(out + '$');
}
