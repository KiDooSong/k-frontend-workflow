// Reconciliation Contract v2의 typed target/evidence 해소용 참조 인덱스.
// validate.mjs가 수집한 docs를 받아 artifact_id → 문서 인덱스를 만든다. 본문은 파일별로 한 번 읽고,
// CommonMark/GFM AST도 문서별로 한 번만 만든다.
import { readFileSafe, splitFrontmatter } from './util.mjs';
import { hasHeader, col, splitRow } from './spec.mjs';
import {
  describeHeaderMismatch,
  normalizedTableHeaders,
  parseReconciliationMarkdown,
  parseReconciliationReferenceView,
  parseStrictTables,
  slugifySectionTitle,
  splitSectionOccurrences,
  stripFencedCodeBlocks,
  stripInlineCodeSpans,
  stripNonContent,
  tableHeadersAreUnique,
  toProseBody,
} from './reconciliation-markdown-ast.mjs';
import { scopedAuthoredSections, scopedAuthoredView } from './scoped-work-authored.mjs';

export {
  describeHeaderMismatch,
  normalizedTableHeaders,
  parseStrictTables,
  slugifySectionTitle,
  splitSectionOccurrences,
  stripFencedCodeBlocks,
  stripInlineCodeSpans,
  stripNonContent,
  tableHeadersAreUnique,
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
        const statusRaw = String(col(row, 'Status') || '').trim();
        const normalizedStatus = statusRaw === 'open' || statusRaw === 'resolved' ? statusRaw : null;
        if (!rows.has(id)) rows.set(id, []);
        rows.get(id).push({
          sectionSlug: slug,
          family,
          statusRaw,
          normalizedStatus,
          statusKnown: normalizedStatus !== null,
        });
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

// Only ordinary artifact row targets are historical selections that may fall
// back to their surviving section/document. Typed child rows and canonical
// mapping M-keys keep their own identity/provenance contracts.
export function isHistoricalArtifactRowTarget(ref, record) {
  return ref?.kind === 'artifact' && !!ref.section && !!ref.rowKey &&
    !(record?.fm?.artifact_type === 'figma-component-mapping' &&
      ['component-mapping', 'mapping-provenance'].includes(ref.section));
}

// Keep the legacy substring helper above stable. Scoped rows use the exact raw
// first cell (including markup), parsed with the same escaped-pipe splitter as
// scopedRawTable. Retain counts so duplicate rows are not mistaken for a unique
// target, without adding fields to the public target-index record.
const exactRowKeyIndexes = new WeakMap();
export function sectionExactRowKeyCount(record, sectionSlug, rowKey) {
  if (!record || typeof record.body !== 'string') return 0;
  if (!exactRowKeyIndexes.has(record)) {
    const markdown = parseReconciliationReferenceView(record.body), sections = new Map();
    for (const occurrence of markdown.sections) {
      if (!sections.has(occurrence.slug)) sections.set(occurrence.slug, []);
      sections.get(occurrence.slug).push(occurrence);
    }
    exactRowKeyIndexes.set(record, { markdown, sections, counts: new Map() });
  }
  const cached = exactRowKeyIndexes.get(record);
  if (!cached.counts.has(sectionSlug)) {
    const counts = new Map();
    cached.counts.set(sectionSlug, counts);
    let authored = [];
    if (sectionSlug === 'unknowns') {
      authored = scopedAuthoredSections(record.body, 'unknowns', cached.markdown);
      if (!authored.some((home) => home.tables.some((table) =>
        ['ID', 'Question'].every((header) => hasHeader(table.headers, header))))) authored = [];
    } else if (sectionSlug === 'api-candidates' && ['screen-spec', 'shared-surface-spec'].includes(record.fm?.artifact_type)) {
      authored = scopedAuthoredSections(record.body, 'api candidates', cached.markdown);
      if (!authored.some((home) => home.tables.length)) authored = [];
    }
    const raw = cached.sections.get(sectionSlug) || [];
    if (authored.length ? authored.length !== 1 || scopedAuthoredView(record.body, cached.markdown).sections
      .filter((home) => home.slug === sectionSlug).length !== 1 : raw.length !== 1) return 0;
    // Unknown/API authoring homes may cross GENERATED H2s. Preserve their raw
    // candidates too, deduplicating only the same physical table as scoped's
    // artifactRowSelection does; equal text in two tables is still ambiguous.
    const tables = new Map();
    for (const home of [...raw, ...authored]) home.tableNodes.forEach((node, index) => {
      if (!tables.has(node)) tables.set(node, home.tables[index]);
    });
    for (const table of tables.values()) {
      const lines = table.sourceText.replace(/\r\n|\r/g, '\n').split('\n');
      for (const line of lines.slice(2)) {
        const key = splitRow(line)[0];
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  return cached.counts.get(sectionSlug).get(String(rowKey)) || 0;
}

// child row ID가 owner 문서의 canonical 가족 표에서 해소되는지 판정한다.
export function resolveChildRow(record, rowId, targetKind) {
  const hits = record?.rows?.get(rowId) || [];
  if (hits.length === 0) {
    return {
      found: false,
      familyMismatch: false,
      ambiguous: false,
      family: null,
      sectionSlug: null,
      statusRaw: null,
      normalizedStatus: null,
      statusKnown: false,
    };
  }
  const matching = hits.filter((hit) => hit.family === targetKind);
  if (matching.length === 0) {
    return {
      found: true,
      familyMismatch: true,
      ambiguous: false,
      family: null,
      sectionSlug: null,
      statusRaw: null,
      normalizedStatus: null,
      statusKnown: false,
    };
  }
  const [hit] = matching;
  return {
    found: true,
    familyMismatch: false,
    ambiguous: matching.length > 1,
    family: hit.family,
    sectionSlug: hit.sectionSlug,
    statusRaw: hit.statusRaw,
    normalizedStatus: hit.normalizedStatus,
    statusKnown: matching.length === 1 && hit.statusKnown,
  };
}

// INV-/VER-처럼 canonical 표가 없는 축은 rendered visible prose에 plain token이 있어야 해소된다.
export function bodyHasToken(record, token) {
  const haystack = record?.proseBody ?? record?.contentBody ?? record?.body;
  if (!haystack || !token) return false;
  const escaped = String(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9-])${escaped}([^A-Za-z0-9-]|$)`).test(haystack);
}
