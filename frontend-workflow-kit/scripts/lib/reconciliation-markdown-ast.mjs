// Reconciliation Contract v2가 소비하는 Markdown 구조를 CommonMark/GFM AST 한 번으로 해석한다.
// heading, table, reference definition, visible prose가 모두 같은 tree를 사용해야 container 순서에
// 따라 서로 다른 구조를 추론하는 fail-open/fail-closed가 생기지 않는다.
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

const BLOCK_TEXT_TYPES = new Set([
  'root',
  'blockquote',
  'list',
  'listItem',
  'table',
  'tableRow',
]);

const NON_VISIBLE_TYPES = new Set([
  'code',
  'definition',
  'html',
  'inlineCode',
]);

// micromark 4.x는 CommonMark type-1의 tag-name 경계와 달리 `<pre/>`도 HTML flow로 연다.
// 같은 UTF-16 길이의 sentinel로 slash만 바꿔 AST position을 유지하면서 이 비표준 opener를 막는다.
const SELF_CLOSING_LITERAL_SENTINEL = '\uE000';

export function slugifySectionTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseTree(text) {
  const parserSource = String(text || '').replace(
    /<(pre|script|style|textarea)\/>/gi,
    (_, tagName) => `<${tagName}${SELF_CLOSING_LITERAL_SENTINEL}>`,
  );
  return fromMarkdown(parserSource, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
}

function restoreParserSentinels(value) {
  return String(value || '').replaceAll(SELF_CLOSING_LITERAL_SENTINEL, '/');
}

function walk(node, visitor, parent = null) {
  visitor(node, parent);
  for (const child of node.children || []) walk(child, visitor, node);
}

function sourceRange(node) {
  const start = node?.position?.start?.offset;
  const end = node?.position?.end?.offset;
  return Number.isInteger(start) && Number.isInteger(end) ? { start, end } : null;
}

function removeRangesPreservingLines(source, ranges) {
  if (!ranges.length) return source;
  const ordered = ranges
    .filter((range) => range.start < range.end)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let cursor = 0;
  let output = '';
  for (const range of ordered) {
    if (range.end <= cursor) continue;
    const start = Math.max(cursor, range.start);
    output += source.slice(cursor, start);
    output += source.slice(start, range.end).replace(/[^\r\n]/g, '');
    cursor = range.end;
  }
  return output + source.slice(cursor);
}

function isNonContentHtml(node, parent) {
  if (node.type !== 'html') return false;
  // HTML comment는 block/inline 위치와 무관하게 렌더링되지 않는다.
  if (/^\s*<!--/.test(node.value || '')) return true;
  // paragraph/heading/table cell의 raw HTML tag는 inline markup이다. 태그 자체는 prose에서
  // 제외하되 stripNonContent 호환 결과에서는 주변 visible source를 보존한다.
  return !['paragraph', 'heading', 'tableCell'].includes(parent?.type);
}

function nonContentRanges(tree) {
  const ranges = [];
  walk(tree, (node, parent) => {
    if (node.type !== 'code' && !isNonContentHtml(node, parent)) return;
    const range = sourceRange(node);
    if (range) ranges.push(range);
  });
  return ranges;
}

function inlineCodeRanges(tree) {
  const ranges = [];
  walk(tree, (node) => {
    if (node.type !== 'inlineCode') return;
    const range = sourceRange(node);
    if (range) ranges.push(range);
  });
  return ranges;
}

const CASE_FOLD_SINGLE_OVERRIDES = new Map([
  ['µ', 'μ'],
  ['ſ', 's'],
  ['ͅ', 'ι'],
  ['ς', 'σ'],
  ['ϐ', 'β'],
  ['ϑ', 'θ'],
  ['ϕ', 'φ'],
  ['ϖ', 'π'],
  ['ϰ', 'κ'],
  ['ϱ', 'ρ'],
  ['ϵ', 'ε'],
  ['ᲀ', 'в'],
  ['ᲁ', 'д'],
  ['ᲂ', 'о'],
  ['ᲃ', 'с'],
  ['ᲄ', 'т'],
  ['ᲅ', 'т'],
  ['ᲆ', 'ъ'],
  ['ᲇ', 'ѣ'],
  ['ᲈ', 'ꙋ'],
  ['ẛ', 'ṡ'],
  ['ι', 'ι'],
]);

function unicodeCaseFold(value) {
  let output = '';
  for (const character of String(value || '').toLowerCase()) {
    const code = character.codePointAt(0);
    if (code >= 0xab70 && code <= 0xabbf) {
      output += String.fromCodePoint(code - 0x97d0);
      continue;
    }
    if (code >= 0x13f8 && code <= 0x13fd) {
      output += String.fromCodePoint(code - 0x8);
      continue;
    }
    const override = CASE_FOLD_SINGLE_OVERRIDES.get(character);
    if (override !== undefined) {
      output += override;
      continue;
    }
    const upper = character.toUpperCase();
    output += [...upper].length > 1 ? upper.toLowerCase() : character;
  }
  return output;
}

function normalizeReferenceLabel(label) {
  return unicodeCaseFold(label).trim().replace(/[\t\r\n ]+/g, ' ');
}

function definitionLabels(tree) {
  const labels = new Set();
  walk(tree, (node) => {
    if (node.type === 'definition') labels.add(normalizeReferenceLabel(node.label ?? node.identifier));
  });
  return labels;
}

function visibleText(node, context) {
  if (
    (node.type === 'linkReference' || node.type === 'imageReference') &&
    !context.definitions.has(normalizeReferenceLabel(node.label ?? node.identifier))
  ) {
    const range = sourceRange(node);
    return range ? context.source.slice(range.start, range.end) : '';
  }
  if (NON_VISIBLE_TYPES.has(node.type)) return '';
  if (node.type === 'text') return restoreParserSentinels(node.value);
  if (node.type === 'break') return '\n';
  if (node.type === 'image' || node.type === 'imageReference') {
    return restoreParserSentinels(node.alt);
  }
  if (!node.children?.length) return '';
  const separator = BLOCK_TEXT_TYPES.has(node.type) ? '\n' : '';
  return node.children.map((child) => visibleText(child, context)).filter(Boolean).join(separator);
}

function cellText(node) {
  if (node.type === 'text') return restoreParserSentinels(node.value);
  if (node.type === 'inlineCode') return `\`${restoreParserSentinels(node.value)}\``;
  if (node.type === 'break') return '\n';
  if (node.type === 'image' || node.type === 'imageReference') return node.alt || '';
  if (node.type === 'html') return restoreParserSentinels(node.value);
  return (node.children || []).map(cellText).join('');
}

function lineEndOffset(source, offset) {
  const lf = source.indexOf('\n', offset);
  return lf === -1 ? source.length : lf + 1;
}

function tableStartsWithColumnZeroPipe(source, node) {
  const start = node?.position?.start?.offset;
  const end = node?.position?.end?.offset;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
  return source
    .slice(start, end)
    .split(/\r?\n/)
    .every((line) => line.startsWith('|'));
}

function tableFromNode(node) {
  const [headerRow, ...dataRows] = node.children || [];
  if (!headerRow) return null;
  const headers = (headerRow.children || []).map((cell) => cellText(cell).trim());
  const rows = dataRows.map((rowNode) => {
    const cells = (rowNode.children || []).map((cell) => cellText(cell).trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });
  return { headers, rows, rowCount: rows.length };
}

function rootTable(source, node) {
  if (node.type !== 'table' || !tableStartsWithColumnZeroPipe(source, node)) return null;
  return tableFromNode(node);
}

function headingText(node) {
  return (node.children || []).map(cellText).join('').trim();
}

function sectionOccurrences(source, tree) {
  const occurrences = [];
  let current = {
    title: '',
    slug: '',
    contentStart: 0,
    contentEnd: source.length,
    nodes: [],
  };

  const flush = (endOffset) => {
    current.contentEnd = endOffset;
    occurrences.push({
      title: current.title,
      slug: current.slug,
      text: source.slice(current.contentStart, current.contentEnd),
      tables: current.nodes.map((node) => rootTable(source, node)).filter(Boolean),
    });
  };

  for (const node of tree.children || []) {
    if (node.type === 'heading' && node.depth === 2) {
      const headingStart = node.position?.start?.offset ?? source.length;
      flush(headingStart);
      const title = headingText(node);
      current = {
        title,
        slug: slugifySectionTitle(title),
        contentStart: lineEndOffset(source, node.position?.end?.offset ?? headingStart),
        contentEnd: source.length,
        nodes: [],
      };
      continue;
    }
    current.nodes.push(node);
  }
  flush(source.length);
  return occurrences;
}

// Production entry point: callers derive every reconciliation view from this one parse.
export function parseReconciliationMarkdown(text) {
  const source = String(text || '');
  const tree = parseTree(source);
  const context = { source, definitions: definitionLabels(tree) };
  return {
    contentBody: removeRangesPreservingLines(source, nonContentRanges(tree)),
    proseBody: visibleText(tree, context),
    occurrences: sectionOccurrences(source, tree),
  };
}

// Compatibility helpers used by focused parser tests. Production indexing does not chain these helpers.
export function stripNonContent(text) {
  const source = String(text || '');
  const tree = parseTree(source);
  return removeRangesPreservingLines(source, nonContentRanges(tree));
}

export function stripFencedCodeBlocks(text) {
  return stripNonContent(text);
}

export function stripInlineCodeSpans(text) {
  const source = String(text || '');
  return removeRangesPreservingLines(source, inlineCodeRanges(parseTree(source)));
}

export function toProseBody(text) {
  const source = String(text || '');
  const tree = parseTree(source);
  return visibleText(tree, { source, definitions: definitionLabels(tree) });
}

export function parseStrictTables(text) {
  const source = String(text || '');
  const tree = parseTree(source);
  return (tree.children || []).map((node) => rootTable(source, node)).filter(Boolean);
}

export function splitSectionOccurrences(text) {
  const source = String(text || '');
  return sectionOccurrences(source, parseTree(source)).map(({ title, slug, text: sectionText }) => ({
    title,
    slug,
    text: sectionText,
  }));
}
