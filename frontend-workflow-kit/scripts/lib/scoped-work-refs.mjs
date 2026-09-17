// D reference resolution only. Not wired to execution and never returns a permit.
// Consume the existing target index from one validated snapshot. Snapshot capture,
// owner/profile predicates, coverage, and the full R1 graph are separate steps.
import path from 'node:path';
import { parseTargetRef } from './reconciliation-items.mjs';
import { resolveArtifact, isDuplicateArtifactId, resolveChildRow, bodyHasToken } from './reconciliation-target-index.mjs';
import { parseReconciliationMarkdown, tableHeadersAreUnique } from './reconciliation-markdown-ast.mjs';
import { splitRow, hasHeader, col } from './spec.mjs';
import { ScopedWorkContractError, workText, workPath, workSet } from './scoped-work-request.mjs';

const fail = (code, message) => { throw new ScopedWorkContractError(`${code}: ${message}`); };
const lf = (text) => text.replace(/\r\n|\r/g, '\n');
const signatures = {
  decision: ['ID', 'Status', 'Blocking Mode'], unknown: ['ID', 'Question'],
  conflict: ['ID', 'Status'], gap: ['ID', 'Status'],
};

// AST establishes that this really is a root table. Parse its *source* cells with
// the shared splitter, not rendered labels (links/emphasis must not invent IDs).
// Unlike parseTable(), do not remove inline HTML comments from authority cells.
export function scopedRawTable(table) {
  if (typeof table?.sourceText !== 'string' || !table.sourceText) fail('SW-REF-TABLE', 'table source required');
  const lines = lf(table.sourceText).split('\n');
  const headers = splitRow(lines[0]);
  if (!tableHeadersAreUnique({ headers })) fail('SW-REF-TABLE', 'duplicate column identity');
  const cells = lines.slice(2).map(splitRow);
  if (cells.some((row) => row.length !== headers.length)) fail('SW-REF-TABLE', 'row width differs from header');
  return { headers, cells, rows: cells.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]]))) };
}

export function createScopedReferenceResolver({ targetIndex, projectRoot } = {}) {
  if (!(targetIndex?.artifacts instanceof Map) || !(targetIndex?.duplicates instanceof Set)) {
    fail('SW-REF-INDEX', 'existing reconciliation target index required');
  }
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot) || path.resolve(projectRoot) !== projectRoot) {
    fail('SW-REF-ROOT', 'canonical absolute snapshot project root required');
  }
  const parsed = new Map();
  function artifact(id) {
    if (isDuplicateArtifactId(targetIndex, id)) fail('SW-REF-AMBIGUOUS', `duplicate artifact ${id}`);
    const record = resolveArtifact(targetIndex, id);
    if (!record || record.fm?.artifact_id !== id) fail('SW-REF-MISSING', `artifact ${id}`);
    if (typeof record.body !== 'string' || typeof record.file !== 'string' || !path.isAbsolute(record.file)) {
      fail('SW-REF-INDEX', `incomplete artifact ${id}`);
    }
    // Never repair an index path into the snapshot namespace.
    if (path.resolve(record.file) !== record.file) fail('SW-REF-PATH', `noncanonical artifact path ${id}`);
    const relative = path.relative(projectRoot, record.file).split(path.sep).join('/');
    workPath(relative, 'scoped artifact path');
    if (!parsed.has(id)) parsed.set(id, parseReconciliationMarkdown(record.body));
    return { record, relative, markdown: parsed.get(id) };
  }
  function section(markdown, slug) {
    const hits = markdown.occurrences.filter((entry) => entry.slug === slug);
    if (hits.length !== 1) fail(hits.length ? 'SW-REF-AMBIGUOUS' : 'SW-REF-MISSING', `section #${slug}`);
    return hits[0];
  }
  function rowSelection(occurrence, key, family = null) {
    const tables = occurrence.tables.map(scopedRawTable);
    const eligible = family ? tables.filter((t) => signatures[family].every((h) => hasHeader(t.headers, h))) : tables;
    if (family && eligible.length !== 1) fail('SW-REF-AMBIGUOUS', `canonical ${family} table must be unique`);
    const matches = [];
    for (const table of eligible) {
      table.rows.forEach((row, index) => {
        const identity = family ? col(row, 'ID') : table.cells[index][0];
        if (identity === key) matches.push({ headers: table.headers, cells: table.cells[index] });
      });
    }
    if (matches.length !== 1) fail(matches.length ? 'SW-REF-AMBIGUOUS' : 'SW-REF-MISSING', `exact row ${key}`);
    return { type: 'row', section: occurrence.slug, key, ...matches[0] };
  }
  function contract(token) {
    workText(token, 'scoped contract');
    const ref = parseTargetRef(token);
    if (!ref || ['none', 'input'].includes(ref.kind)) fail('SW-REF-SYNTAX', `unsupported contract ${token}`);
    const id = ref.kind === 'artifact' ? ref.artifactId : ref.ownerArtifactId;
    const { record, relative, markdown } = artifact(id);
    let selection;
    if (ref.kind === 'artifact') {
      if (!ref.section) selection = { type: 'body', content: lf(record.body) };
      else {
        const selected = section(markdown, ref.section);
        selection = ref.rowKey === null
          ? { type: 'section', section: ref.section, content: lf(selected.text) }
          : rowSelection(selected, ref.rowKey);
      }
    } else if (Object.hasOwn(signatures, ref.kind)) {
      const child = resolveChildRow(record, ref.rowId, ref.kind);
      if (!child.found || child.familyMismatch) fail('SW-REF-MISSING', `canonical ${token}`);
      if (child.ambiguous) fail('SW-REF-AMBIGUOUS', `canonical ${token}`);
      selection = rowSelection(section(markdown, child.sectionSlug), ref.rowId, ref.kind);
    } else {
      // INV/VER have no canonical row family in v2. Retain the whole body rather
      // than pretending a coincidental line is an independently owned contract.
      if (!bodyHasToken(record, ref.rowId)) fail('SW-REF-MISSING', `visible ${token}`);
      selection = { type: 'body-token', key: ref.rowId, content: lf(record.body) };
    }
    return { ref: ref.raw, kind: ref.kind, artifact_id: id, file: relative,
      metadata: structuredClone(record.fm), selection };
  }
  return { contract, contracts: (tokens) => workSet(tokens, contract, 'contracts', true) };
}
