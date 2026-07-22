// Reconciliation Contract v2의 typed target/evidence 해소용 참조 인덱스.
// validate.mjs가 수집한 docs를 받아 artifact_id → 문서 인덱스를 만든다. 본문은 파일별로 한 번 읽고,
// CommonMark/GFM AST도 문서별로 한 번만 만든다.
import { readFileSafe, splitFrontmatter } from './util.mjs';
import { hasHeader, col } from './spec.mjs';
import {
  parseReconciliationMarkdown,
  parseStrictTables,
  slugifySectionTitle,
  splitSectionOccurrences,
  stripFencedCodeBlocks,
  stripInlineCodeSpans,
  stripNonContent,
  toProseBody,
} from './reconciliation-markdown-ast.mjs';

export {
  parseStrictTables,
  slugifySectionTitle,
  splitSectionOccurrences,
  stripFencedCodeBlocks,
  stripInlineCodeSpans,
  stripNonContent,
  toProseBody,
};

// child row는 ID 헤더만 보고 수집하지 않는다. canonical 위치와 표 signature를 모두 만족하는
// 첫 표만 신뢰해 Notes/예시/migration 표의 ID가 실제 target으로 해소되는 fail-open을 막는다.
const FAMILY_SIGNATURES = {
  decision: ['ID', 'Status', 'Blocking Mode'],
  unknown: ['ID', 'Question'],
  conflict: ['ID', 'Status'],
  gap: ['ID', 'Status'],
};

function canonicalFamiliesAt(sectionSlug, artifactType) {
  const families = [];
  if (sectionSlug === 'open-decisions') families.push('decision');
  if (sectionSlug === 'unknowns') families.push('unknown');
  if (sectionSlug === 'conflicts') families.push('conflict');
  if (sectionSlug === 'gaps' || sectionSlug === 'component-gap-register') families.push('gap');
  if (sectionSlug === '') {
    if (artifactType === 'conflicts') families.push('conflict');
    if (artifactType === 'component-gap-register') families.push('gap');
  }
  return families;
}

// 헤더 정규화(대소문자/공백 무시 — hasHeader/col과 같은 규약)와 canonical 헤더 배열 exact 비교.
export function normalizedTableHeaders(table) {
  return (table?.headers || []).map((header) => String(header).toLowerCase().replace(/\s+/g, ''));
}

export function tableHeadersAreUnique(table) {
  const normalized = normalizedTableHeaders(table);
  return new Set(normalized).size === normalized.length;
}

export function describeHeaderMismatch(table, canonicalCols) {
  const actual = normalizedTableHeaders(table);
  const expected = canonicalCols.map((header) => String(header).toLowerCase().replace(/\s+/g, ''));
  if (actual.length === expected.length && actual.every((header, index) => header === expected[index])) {
    return null;
  }
  const problems = [];
  if (actual.length !== expected.length) problems.push(`컬럼 수 ${actual.length} ≠ ${expected.length}`);
  if (new Set(actual).size !== actual.length) problems.push('중복 header 존재');
  const missing = expected.filter((header) => !actual.includes(header));
  const extra = actual.filter((header) => !expected.includes(header));
  if (missing.length) problems.push(`누락: ${missing.join(', ')}`);
  if (extra.length) problems.push(`추가: ${extra.join(', ')}`);
  if (!problems.length) problems.push('canonical 순서 불일치');
  return problems.join(' / ');
}

// 문서의 heading/table/definition/visible prose를 하나의 AST에서 함께 추출한다.
function indexDocBody(body, artifactType) {
  const parsed = parseReconciliationMarkdown(body);
  const sections = new Map();
  for (const occurrence of parsed.occurrences) {
    const previous = sections.get(occurrence.slug);
    sections.set(occurrence.slug, {
      title: occurrence.title,
      text: previous ? `${previous.text}\n${occurrence.text}` : occurrence.text,
      tables: previous ? [...previous.tables, ...occurrence.tables] : occurrence.tables,
    });
  }

  const rows = new Map();
  const rowKeys = new Map();
  for (const [slug, section] of sections) {
    for (const table of section.tables) {
      const firstHeader = table.headers[0];
      for (const row of table.rows) {
        const firstCell = String(row[firstHeader] ?? '').trim();
        if (!firstCell) continue;
        if (!rowKeys.has(slug)) rowKeys.set(slug, new Set());
        rowKeys.get(slug).add(firstCell);
      }
    }

    for (const family of canonicalFamiliesAt(slug, artifactType)) {
      const canonical = section.tables.find(
        (table) =>
          tableHeadersAreUnique(table) &&
          FAMILY_SIGNATURES[family].every((header) => hasHeader(table.headers, header)),
      );
      if (!canonical) continue;
      for (const row of canonical.rows) {
        const id = String(col(row, 'ID') || '').trim();
        if (!id || id.startsWith('{')) continue;
        if (!rows.has(id)) rows.set(id, []);
        rows.get(id).push({ sectionSlug: slug, family });
      }
    }

    // AST table nodes are internal implementation detail; keep the public record shape stable.
    delete section.tables;
  }

  return {
    contentBody: parsed.contentBody,
    proseBody: parsed.proseBody,
    sections,
    rows,
    rowKeys,
  };
}

// docs([{file, fm}]) → { artifacts: Map(artifact_id → record), duplicates: Set(artifact_id) }.
export function buildReconciliationTargetIndex({ docs = [] }) {
  const artifacts = new Map();
  const duplicates = new Set();
  for (const { file, fm } of docs) {
    const id = fm?.artifact_id;
    if (typeof id !== 'string' || id.trim() === '') continue;
    if (artifacts.has(id)) {
      duplicates.add(id);
      continue;
    }
    const { body } = splitFrontmatter(readFileSafe(file));
    const indexed = indexDocBody(body, fm?.artifact_type);
    artifacts.set(id, { file, fm, body, ...indexed });
  }
  return { artifacts, duplicates };
}

export function resolveArtifact(index, artifactId) {
  return index?.artifacts?.get(artifactId) || null;
}

export function isDuplicateArtifactId(index, artifactId) {
  return !!index?.duplicates?.has(artifactId);
}

export function artifactHasSection(record, sectionSlug) {
  return !!record?.sections?.has(sectionSlug);
}

// #section/<row-key> 해소(warning-first): 첫 셀의 case-insensitive substring으로 판정한다.
export function sectionRowKeyExists(record, sectionSlug, rowKey) {
  const keys = record?.rowKeys?.get(sectionSlug);
  if (!keys) return false;
  const wanted = String(rowKey).toLowerCase();
  for (const cell of keys) {
    if (cell.toLowerCase().includes(wanted)) return true;
  }
  return false;
}

// child row ID가 owner 문서의 canonical 가족 표에서 해소되는지 판정한다.
export function resolveChildRow(record, rowId, targetKind) {
  const hits = record?.rows?.get(rowId) || [];
  if (hits.length === 0) return { found: false, familyMismatch: false };
  if (hits.some((hit) => hit.family === targetKind)) return { found: true, familyMismatch: false };
  return { found: true, familyMismatch: true };
}

// INV-/VER-처럼 canonical 표가 없는 축은 rendered visible prose에 plain token이 있어야 해소된다.
export function bodyHasToken(record, token) {
  const haystack = record?.proseBody ?? record?.contentBody ?? record?.body;
  if (!haystack || !token) return false;
  const escaped = String(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9-])${escaped}([^A-Za-z0-9-]|$)`).test(haystack);
}
