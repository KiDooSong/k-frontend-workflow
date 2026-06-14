// api-manifest.mjs — api-manifest.md 의 ## Endpoints 표를 endpoint→schema canonical 로 읽는 파서 + 매칭 유틸.
// 검사 8(validate) 강화 전용 (제안서 옵션 C). ScreenSpec ## API Candidates 의 (Method, Path) 가
// manifest endpoint 를 참조하고, confirmed endpoint 는 Linked Schema(zod export 심볼)로 해소되어야 한다.
//   - 사실 출처는 zod(src/api/schemas/*.ts) export 심볼. Source 컬럼은 정보용(검사에 쓰지 않음).
//   - OpenAPI components.schemas 해소는 이 단계 범위 밖(known limitation) — zod export matching 만 구현.
import fs from 'node:fs';
import path from 'node:path';
import { readFileSafe, isDir, splitFrontmatter } from './util.mjs';
import { getSections, parseTable, col } from './spec.mjs';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

// 엔드포인트 정규화 키: method 대문자 · trailing slash 제거 · {param} → {} (파라미터명 무시).
// ★ 화면 route([id]) 는 절대 섞지 않는다 — 이 함수는 API path 축에만 쓴다(제안서 §7 normEndpoint).
export function normEndpoint(method, p) {
  const m = String(method == null ? '' : method).trim().toUpperCase();
  let pp = String(p == null ? '' : p).trim();
  pp = pp.replace(/[?#].*$/, ''); // 쿼리/해시 제거
  pp = pp.replace(/\{[^}]*\}/g, '{}'); // {id}, {couponId} → {} (파라미터명 차이 흡수)
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
// Map<key, { method, path, confidence, linkedSchema, source, file }> (같은 키 중복 시 last-wins).
export function buildEndpointIndex(manifestFiles) {
  const index = new Map();
  for (const file of manifestFiles || []) {
    const raw = readFileSafe(file);
    if (raw == null) continue;
    const { body } = splitFrontmatter(raw);
    for (const e of parseManifestEndpoints(body)) {
      index.set(e.key, Object.assign({}, e, { file }));
    }
  }
  return index;
}

// src/api/schemas/*.ts 에서 export 되는 심볼 이름 집합을 수집한다 (정규식 스캔, AST 미사용).
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

function collectExportsFromText(text, names) {
  // export (default?) (async?) const|let|var|function|class|enum|type|interface NAME
  const reDecl =
    /export\s+(?:default\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|enum|type|interface)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = reDecl.exec(text))) names.add(m[1]);
  // export { A, B as C, default as D }  /  export type { ... }
  const reList = /export\s*(?:type\s*)?\{([^}]*)\}/g;
  while ((m = reList.exec(text))) {
    for (const part of m[1].split(',')) {
      const seg = part.trim();
      if (!seg) continue;
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
