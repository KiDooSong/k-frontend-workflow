// api-manifest.mjs — api-manifest.md 의 ## Endpoints 표를 endpoint→schema canonical 로 읽는 파서 + 매칭 유틸.
// 검사 8(validate) 강화 전용 (제안서 옵션 C). ScreenSpec ## API Candidates 의 (Method, Path) 가
// manifest endpoint 를 참조하고, confirmed endpoint 는 Linked Schema(zod export 심볼)로 해소되어야 한다.
//   - 사실 출처는 zod(src/api/schemas/*.ts) export 심볼. Source 컬럼은 정보용(검사에 쓰지 않음).
//   - OpenAPI components.schemas 해소는 이 단계 범위 밖(known limitation) — zod export matching 만 구현.
import fs from 'node:fs';
import path from 'node:path';
import { readFileSafe, isDir, splitFrontmatter } from './util.mjs';
import { getSections, parseTable, col } from './spec.mjs';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'];

// 엔드포인트 정규화 키: method 대문자 · trailing slash 제거 · 경로 파라미터 표기 통일.
// ★ 화면 route 를 frontmatter.route 로 끌어와 섞지 않는다 — 이 함수는 ## API Candidates 와
//   api-manifest 의 API path 축에만 쓴다(제안서 §7). 단, API path 안에 쓰인 파라미터 표기는
//   ({id}/{couponId}=OpenAPI, :id=Express, [id]=Expo Router) 모두 단일 placeholder({})로 흡수해
//   표기 차이로 인한 거짓 "미등록" 오탐을 막는다.
export function normEndpoint(method, p) {
  const m = String(method == null ? '' : method).trim().toUpperCase();
  let pp = String(p == null ? '' : p).trim();
  pp = pp.replace(/[?#].*$/, ''); // 쿼리/해시 제거
  pp = pp.replace(/\{[^}]*\}/g, '{}'); // {id}, {couponId} → {}
  pp = pp.replace(/\[[^\]]+\]/g, '{}'); // [id] → {}
  pp = pp.replace(/\/:[^/]+/g, '/{}'); // /:id → /{}
  if (pp.length > 1) pp = pp.replace(/\/+$/, ''); // trailing slash 제거(루트 '/' 보존)
  return m + ' ' + pp;
}

// Linked Schema 셀이 "미설정"(빈칸/TBD/-)인가.
export function isSchemaUnset(linkedSchema) {
  const v = String(linkedSchema == null ? '' : linkedSchema).trim();
  return v === '' || v === '-' || v.toLowerCase() === 'tbd';
}

// api-manifest 본문(frontmatter 제외)에서 ## Endpoints 표를 파싱한다.
// → [{ method, path, confidence, linkedSchema, source, key }]
export function parseManifestEndpoints(body) {
  const sections = getSections(body || '');
  const table = parseTable(sections['endpoints']);
  const out = [];
  if (!table) return out;
  for (const row of table.rows) {
    const method = (col(row, 'Method') || '').trim();
    const p = (col(row, 'Path') || '').trim();
    if (!method && !p) continue; // 빈 행
    out.push({
      method,
      path: p,
      confidence: (col(row, 'Confidence') || '').trim().toLowerCase(),
      linkedSchema: (col(row, 'Linked Schema') || '').trim(),
      source: (col(row, 'Source') || '').trim(),
      key: normEndpoint(method, p),
    });
  }
  return out;
}

// manifest 파일 경로 목록에서 endpoint 인덱스를 만든다.
//   index     Map<key, { method, path, confidence, linkedSchema, source, file }> (충돌 시 last-wins)
//   conflicts [{ key, file, prev, next }] — 같은 (Method,Path) 인데 linkedSchema/confidence 가 다른 행.
//             canonical 출처가 모순(매칭이 행 순서에 의존)이므로 validate 가 에러로 surface 한다.
//             완전히 동일한 중복 행은 무해하므로 무시한다.
export function buildEndpointIndex(manifestFiles) {
  const index = new Map();
  const conflicts = [];
  for (const file of manifestFiles || []) {
    const raw = readFileSafe(file);
    if (raw == null) continue;
    const { body } = splitFrontmatter(raw);
    for (const e of parseManifestEndpoints(body)) {
      const prev = index.get(e.key);
      if (prev && (prev.linkedSchema !== e.linkedSchema || prev.confidence !== e.confidence)) {
        conflicts.push({ key: e.key, file, prev, next: Object.assign({}, e, { file }) });
      }
      index.set(e.key, Object.assign({}, e, { file }));
    }
  }
  return { index, conflicts };
}

// src/api/schemas/*.ts 에서 export 되는 (런타임 값) 심볼 이름 집합을 수집한다 (정규식 스캔, AST 미사용).
export function collectSchemaExports(schemasDir) {
  const names = new Set();
  if (!isDir(schemasDir)) return names;
  let files;
  try {
    files = fs.readdirSync(schemasDir).filter((f) => f.endsWith('.ts'));
  } catch {
    return names;
  }
  for (const f of files.sort()) {
    collectExportsFromText(readFileSafe(path.join(schemasDir, f)) || '', names);
  }
  return names;
}

// 주석을 제거한다 — 주석 처리된(죽은) export 가 거짓 매칭되지 않도록.
function stripTsComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // 블록 주석
    .replace(/\/\/[^\n]*/g, ''); // 라인 주석
}

function collectExportsFromText(raw, names) {
  const text = stripTsComments(raw || '');
  // zod 스키마는 런타임 '값' 이다 → 타입 전용 export(type/interface)는 제외(검사 8 의 zod-export 의도).
  //   인식: export (default?) (async?) const|let|var|function|class|enum NAME
  //   (단, 매칭된 export 가 실제 zod 스키마인지의 AST 증명은 범위 밖 — known limitation.)
  const reDecl =
    /export\s+(?:default\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|enum)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = reDecl.exec(text))) names.add(m[1]);
  // export { A, B as C } (값 재-export). `export type { ... }` 와 인라인 `{ type X }` 는 타입이라 제외.
  const reList = /export\s*\{([^}]*)\}/g;
  while ((m = reList.exec(text))) {
    for (const part of m[1].split(',')) {
      const seg = part.trim();
      if (!seg || /^type\s/.test(seg)) continue;
      const asM = /\bas\s+([A-Za-z_$][\w$]*)/.exec(seg);
      if (asM) {
        names.add(asM[1]);
      } else {
        const idM = /^([A-Za-z_$][\w$]*)/.exec(seg);
        if (idM) names.add(idM[1]);
      }
    }
  }
  return names;
}

export { HTTP_METHODS };
