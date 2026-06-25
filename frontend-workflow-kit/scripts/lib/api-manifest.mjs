// api-manifest.mjs — api-manifest.md 의 ## Endpoints 표를 endpoint→contract canonical 로 읽는 파서 + 매칭 유틸.
// 검사 8(validate) 강화 전용 (제안서 옵션 C). ScreenSpec ## API Candidates 의 (Method, Path) 가
// manifest endpoint 를 참조하고, confirmed endpoint 는 Linked Contract + Contract Kind 로 해소되어야 한다.
//   - Linked Schema 레거시 컬럼은 zod 런타임 export 심볼의 하위호환 별칭으로 유지한다.
//   - ts-type 은 Source 경로의 `export type` / `export interface` 정적 evidence 로만 인정한다.
//   - TS type evidence 는 런타임 validation evidence 가 아니다.
import fs from 'node:fs';
import path from 'node:path';
import { readFileSafe, isDir, splitFrontmatter, walkFiles } from './util.mjs';
import { getSections, parseTable, col, hasHeader } from './spec.mjs';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'];
export const CONTRACT_KINDS = Object.freeze(['zod', 'ts-type', 'openapi', 'manual', 'unknown']);

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

// Linked Schema/Contract 셀이 "미설정"(빈칸/TBD/-)인가.
export function isSchemaUnset(linkedSchema) {
  const v = String(linkedSchema == null ? '' : linkedSchema).trim();
  return v === '' || v === '-' || v.toLowerCase() === 'tbd';
}

export const isContractUnset = isSchemaUnset;

function normalizeContractKind(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

// api-manifest 본문(frontmatter 제외)에서 ## Endpoints 표를 파싱한다.
// → [{ method, path, confidence, linkedSchema, linkedContract, contractKind, source, key, ... }]
//   Linked Schema 레거시 5컬럼은 contractKind=zod 로 추론한다. 새 Linked Contract 표에서
//   Contract Kind 가 비어있으면 contractKindOmitted=true 로 validate 가 명확한 진단을 낸다.
export function parseManifestEndpoints(body) {
  const sections = getSections(body || '');
  const table = parseTable(sections['endpoints']);
  const out = [];
  if (!table) return out;
  const hasLinkedSchemaCol = hasHeader(table.headers, 'Linked Schema');
  const hasLinkedContractCol = hasHeader(table.headers, 'Linked Contract');
  const hasContractKindCol = hasHeader(table.headers, 'Contract Kind');
  for (const row of table.rows) {
    const method = (col(row, 'Method') || '').trim();
    const p = (col(row, 'Path') || '').trim();
    if (!method && !p) continue; // 빈 행
    const linkedSchema = (col(row, 'Linked Schema') || '').trim();
    const linkedContract = ((col(row, 'Linked Contract') || '').trim()) || linkedSchema;
    const rawKind = (col(row, 'Contract Kind') || '').trim();
    let contractKind = normalizeContractKind(rawKind);
    let contractKindInferred = false;
    let contractKindOmitted = false;
    if (!contractKind) {
      if (hasLinkedSchemaCol && !hasLinkedContractCol && !hasContractKindCol) {
        contractKind = 'zod';
        contractKindInferred = true;
      } else if (!isContractUnset(linkedContract)) {
        contractKindOmitted = true;
      }
    }
    out.push({
      method,
      path: p,
      operationId: (col(row, 'Operation ID') || '').trim(),
      confidence: (col(row, 'Confidence') || '').trim().toLowerCase(),
      linkedSchema,
      linkedContract,
      contractKind,
      contractKindRaw: rawKind,
      contractKindInferred,
      contractKindOmitted,
      source: (col(row, 'Source') || '').trim(),
      key: normEndpoint(method, p),
      hasLinkedSchemaCol,
      hasLinkedContractCol,
      hasContractKindCol,
    });
  }
  return out;
}

// manifest 파일 경로 목록에서 endpoint 인덱스를 만든다.
//   index     Map<key, { method, path, confidence, linkedContract, contractKind, source, file }> (충돌 시 last-wins)
//   conflicts [{ key, file, prev, next }] — 같은 (Method,Path) 인데 contract/source/confidence 가 다른 행.
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
      if (
        prev &&
        (prev.linkedContract !== e.linkedContract ||
          prev.contractKind !== e.contractKind ||
          prev.confidence !== e.confidence ||
          prev.source !== e.source)
      ) {
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

export function collectTsTypeExports(source, projectRoot) {
  const names = new Set();
  for (const file of contractSourceFiles(source, projectRoot, ['.ts', '.tsx'])) {
    collectTypeExportsFromText(readFileSafe(file) || '', names);
  }
  return names;
}

export function contractSourceHasText(source, projectRoot, needle, extensions) {
  const target = String(needle == null ? '' : needle).trim();
  if (!target) return false;
  for (const file of contractSourceFiles(source, projectRoot, extensions)) {
    if ((readFileSafe(file) || '').includes(target)) return true;
  }
  return false;
}

function contractSourceFiles(source, projectRoot, extensions = ['.ts', '.tsx']) {
  const src = String(source == null ? '' : source).trim();
  if (isSchemaUnset(src)) return [];
  if (/^(openapi|manual|unknown|confluence|planning)$/i.test(src)) return [];
  const projectAbs = path.resolve(projectRoot || '.');
  const projectReal = realpathOrNull(projectAbs);
  if (!projectReal) return [];
  const parts = src
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const files = [];
  for (const part of parts) {
    const abs = path.isAbsolute(part) ? path.resolve(part) : path.resolve(projectAbs, part);
    const real = realpathOrNull(abs);
    if (!real || !isInsidePath(real, projectReal)) continue;
    let st;
    try {
      st = fs.statSync(real);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      for (const file of walkFiles(real, extensions)) files.push(file);
    } else if (st.isFile() && hasExtension(real, extensions)) {
      files.push(real);
    }
  }
  return [...new Set(files)].sort();
}

function realpathOrNull(p) {
  try {
    return (fs.realpathSync.native || fs.realpathSync)(p);
  } catch {
    return null;
  }
}

function isInsidePath(absPath, rootPath) {
  const rel = path.relative(rootPath, absPath);
  return rel === '' || (rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function hasExtension(file, extensions) {
  if (!extensions || extensions.length === 0) return true;
  const base = path.basename(file).toLowerCase();
  return extensions.some((ext) => base.endsWith(String(ext).toLowerCase()));
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

function collectTypeExportsFromText(raw, names) {
  const text = stripTsComments(raw || '');
  let m;
  const reTypeDecl = /export\s+(?:declare\s+)?type\s+([A-Za-z_$][\w$]*)\s*(?:<[^;]*?>)?\s*=/g;
  while ((m = reTypeDecl.exec(text))) names.add(m[1]);
  const reInterfaceDecl = /export\s+(?:declare\s+)?interface\s+([A-Za-z_$][\w$]*)\b/g;
  while ((m = reInterfaceDecl.exec(text))) names.add(m[1]);

  // Deterministic re-export support for explicit type syntax only:
  //   export type { Foo, Bar as Baz } from './types'
  //   export { type Foo, type Bar as Baz } from './types'
  // Plain `export { Foo }` is ambiguous without a type checker and is intentionally not counted.
  const reTypeList = /export\s+type\s*\{([^}]*)\}/g;
  while ((m = reTypeList.exec(text))) collectTypeNamesFromList(m[1], names, { requireInlineType: false });
  const reList = /export\s*\{([^}]*)\}/g;
  while ((m = reList.exec(text))) collectTypeNamesFromList(m[1], names, { requireInlineType: true });
  return names;
}

function collectTypeNamesFromList(listText, names, { requireInlineType }) {
  for (const part of String(listText || '').split(',')) {
    let seg = part.trim();
    if (!seg) continue;
    const isInlineType = /^type\s+/.test(seg);
    if (requireInlineType && !isInlineType) continue;
    if (isInlineType) seg = seg.replace(/^type\s+/, '').trim();
    const asM = /\bas\s+([A-Za-z_$][\w$]*)/.exec(seg);
    if (asM) {
      names.add(asM[1]);
      continue;
    }
    const idM = /^([A-Za-z_$][\w$]*)/.exec(seg);
    if (idM) names.add(idM[1]);
  }
}

export { HTTP_METHODS };
