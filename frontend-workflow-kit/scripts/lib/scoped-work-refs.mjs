// D reference resolution only. Not wired to execution and never returns a permit.
// Consume the existing target index from one validated snapshot. Snapshot capture,
// owner/profile predicates, coverage, and the full R1 graph are separate steps.
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { readCurrentBytes, canonicalJson } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { parseMappingProvenanceContract, validateMappingProvenance } from './mapping-provenance.mjs';
import { parseTargetRef, isTargetRowId } from './reconciliation-items.mjs';
import { resolveArtifact, isDuplicateArtifactId, resolveChildRow, bodyHasToken } from './reconciliation-target-index.mjs';
import { parseReconciliationReferenceView, tableHeadersAreUnique } from './reconciliation-markdown-ast.mjs';
import { scopedAuthoredView, scopedAuthoredSections, rememberScopedSelection, scopedSelectionNodes } from './scoped-work-authored.mjs';
import { splitRow, hasHeader, col, stripGeneratedBlocks } from './spec.mjs';
import { ScopedWorkContractError, workText, workPath, workSet } from './scoped-work-request.mjs';

const fail = (code, message) => { throw new ScopedWorkContractError(`${code}: ${message}`); };
const lf = (text) => text.replace(/\r\n|\r/g, '\n');
const signatures = {
  decision: ['ID', 'Status', 'Blocking Mode'], unknown: ['ID', 'Question'],
  conflict: ['ID', 'Status'], gap: ['ID', 'Status'],
};

// #260: a typed child ref names its kind, and resolution proves it by location:
// the exact row must sit in that kind's canonical table (resolveChildRow family).
// The general contracts match IDs exactly with no kind prefix, so table-backed
// kinds accept any delimiter-safe ID. Another kind's canonical prefix stays a
// contradiction, and INV/VER (no canonical table) keep their prefix as the only
// kind evidence. #274: Reconciliation Items use the same grammar (isTargetRowId),
// so a scoped typed ref and an Items target read one token the same way.
export function isScopedRowId(kind, id) {
  return Object.hasOwn(signatures, kind) && isTargetRowId(kind, id);
}
export const parseScopedTargetRef = parseTargetRef;

// AST establishes that this really is a root table. Parse its *source* cells with
// the shared splitter, not rendered labels (links/emphasis must not invent IDs).
// Unlike parseTable(), do not remove inline HTML comments from authority cells.
// #275: the canonical row an exact artifact row selection names, when it selects a row of a
// canonical Decision, Unknown or Conflict table: `artifact:X#unknowns/U-1` is `unknown:U-1@X`.
const ROW_FAMILIES = { 'open-decisions': 'decision', unknowns: 'unknown', conflicts: 'conflict' };
export function scopedRowAlias(node) {
  const selection = node?.selection;
  if (node?.kind !== 'artifact' || selection?.type !== 'row' || !Array.isArray(selection.headers)) return null;
  const family = (Object.hasOwn(ROW_FAMILIES, selection.section) ? ROW_FAMILIES[selection.section] : null) ||
    (selection.section === '' && node.metadata?.artifact_type === 'conflicts' ? 'conflict' : null);
  if (!family || !signatures[family].every((header) => hasHeader(selection.headers, header))) return null;
  const id = col(Object.fromEntries(selection.headers.map((header, index) => [header, selection.cells[index]])), 'ID');
  const token = `${family}:${id}@${node.artifact_id}`;
  return parseScopedTargetRef(token)?.rowId === id ? token : null;
}

// #275: where a canonical row sits (its typed reference or an exact artifact row selection),
// and the rows a reference to a section or a whole document covers, as an Unknown's
// overlapping evidence covers them in the uncertainty pass.
const ROW_KINDS = new Set(['decision', 'unknown', 'conflict']);
export function scopedRowSite(node) {
  const row = ROW_KINDS.has(node?.kind) ? node.ref : scopedRowAlias(node);
  return row && node.selection?.type === 'row' ? { row, artifact_id: node.artifact_id, section: node.selection.section } : null;
}
// Sites are kept per document, by row and by section, so recording every row of a register and
// covering many sections of it stay linear.
export function scopedAddRowSite(sites, site) {
  if (!site) return;
  if (!sites.has(site.artifact_id)) sites.set(site.artifact_id, { rows: new Map(), sections: new Map() });
  const entry = sites.get(site.artifact_id);
  if (entry.rows.has(site.row)) return;
  entry.rows.set(site.row, site);
  if (!entry.sections.has(site.section)) entry.sections.set(site.section, []);
  entry.sections.get(site.section).push(site.row);
}
const siteStats = { examined: 0 };
// Process-wide row sites examined by coverage: read-only diagnostics (#275).
export function scopedRowSiteStats() {
  return { ...siteStats };
}
// An investigation or verification reference selects its document's whole body.
export function scopedCoveredRows(node, sites) {
  const type = node?.selection?.type;
  if (!['section', 'body', 'body-token'].includes(type) || (type === 'section' && node.kind !== 'artifact')) return [];
  const entry = sites.get(node.artifact_id);
  const rows = !entry ? [] : type === 'section' ? entry.sections.get(node.selection.section) || [] : [...entry.rows.keys()];
  siteStats.examined += rows.length;
  return [...rows];
}

const encodeStats = { tables: 0 };
// Process-wide raw table encodings: read-only diagnostics (#275).
export function scopedRawTableStats() {
  return { ...encodeStats };
}

// One index per parsed list (a document's sections, a section's tables) and key kind, built once,
// so selecting the rows of a document with many sections or tables stays linear (#275).
const listIndexes = new WeakMap(), lookupStats = { examined: 0 };
export function scopedIndexedBy(list, kind, keyOf) {
  if (!listIndexes.has(list)) listIndexes.set(list, new Map());
  const byKind = listIndexes.get(list);
  if (!byKind.has(kind)) {
    const index = new Map();
    lookupStats.examined += list.length;
    for (const item of list) {
      const key = keyOf(item);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(item);
    }
    byKind.set(kind, index);
  }
  return byKind.get(kind);
}
export function scopedSectionsBySlug(sections, slug) {
  return scopedIndexedBy(sections, 'slug', (section) => section.slug).get(slug) || [];
}
// Process-wide sections and tables examined by lookups: read-only diagnostics (#275).
export function scopedSectionLookupStats() {
  return { ...lookupStats };
}

export function scopedRawTable(table) {
  if (typeof table?.sourceText !== 'string' || !table.sourceText) fail('SW-REF-TABLE', 'table source required');
  encodeStats.tables += 1;
  const lines = lf(table.sourceText).split('\n');
  const headers = splitRow(lines[0]);
  if (!tableHeadersAreUnique({ headers })) fail('SW-REF-TABLE', 'duplicate column identity');
  const cells = lines.slice(2).map(splitRow);
  if (cells.some((row) => row.length !== headers.length)) fail('SW-REF-TABLE', 'row width differs from header');
  return { headers, cells, rows: cells.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]]))) };
}

export function createScopedReferenceResolver({ targetIndex, projectRoot, inputArtifacts = [], shareMetadata = false } = {}) {
  if (!(targetIndex?.artifacts instanceof Map) || !(targetIndex?.duplicates instanceof Set)) {
    fail('SW-REF-INDEX', 'existing reconciliation target index required');
  }
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot) || path.resolve(projectRoot) !== projectRoot) {
    fail('SW-REF-ROOT', 'canonical absolute snapshot project root required');
  }
  const parsed = new Map();
  const mappingChecks = new Map();
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
    if (!parsed.has(id)) {
      const view = parseReconciliationReferenceView(record.body);
      parsed.set(id, { ...view, occurrences: view.sections });
    }
    return { record, relative, markdown: parsed.get(id) };
  }
  function section(markdown, slug) {
    const hits = scopedSectionsBySlug(markdown.occurrences, slug);
    if (hits.length !== 1) fail(hits.length ? 'SW-REF-AMBIGUOUS' : 'SW-REF-MISSING', `section #${slug}`);
    return hits[0];
  }
  function mappingRow(record, occurrence, key) {
    const id = record.fm.artifact_id;
    if (!mappingChecks.has(id)) {
      if (parseMappingProvenanceContract(record.fm).version !== 1) {
        fail('SW-REF-MAPPING', 'M-key selection requires Mapping Provenance v1');
      }
      const current = splitFrontmatter(decodeGitUtf8(readCurrentBytes(record.file, 'scoped mapping'), 'scoped mapping'));
      if (current.parseError || current.body !== record.body || canonicalJson(current.data) !== canonicalJson(record.fm)) {
        fail('SW-REF-SNAPSHOT', `mapping ${id} differs from its indexed snapshot`);
      }
      const validation = validateMappingProvenance({ docs: [record], inputArtifacts });
      if (validation.errors.length) fail('SW-REF-MAPPING', validation.errors.map((entry) => entry.message).join('; '));
      mappingChecks.set(id, validation.warnings.map((entry) => ({ message: entry.message })));
    }
    // The existing validator proves anchored M-key grammar and row bijection.
    // Read the same raw identity cell, not a second independently evolving regex.
    if (occurrence.tables.length !== 1) fail('SW-REF-MAPPING', 'unique mapping table required');
    const { headers, rows } = mappingIndex(occurrence);
    const matches = rows.get(key) || [];
    if (matches.length !== 1) fail('SW-REF-MAPPING', `missing or ambiguous M-key ${key}`);
    return { type: 'row', section: occurrence.slug, key, headers: [...headers], cells: [...matches[0]],
      validation_warnings: structuredClone(mappingChecks.get(id)) };
  }
  // A mapping table's rows by M-key, read once per section through the shared table encoding, so
  // selecting many M-keys stays linear (#275 r12). Every row's raw identity must be its rendered one.
  const mappingIndexes = new WeakMap();
  function mappingIndex(occurrence) {
    if (!mappingIndexes.has(occurrence)) {
      const ast = occurrence.tables[0], raw = encoded(occurrence)[0], rows = new Map();
      raw.cells.forEach((cells, index) => {
        const first = cells[0];
        if (first !== ast.rows[index][ast.headers[0]]) fail('SW-REF-MAPPING', 'raw Mapping Key differs from rendered identity');
        const identity = occurrence.slug === 'component-mapping'
          ? first.split('`')[1] : (first.startsWith('`') ? first.slice(1, -1) : first);
        if (!rows.has(identity)) rows.set(identity, []);
        rows.get(identity).push(cells);
      });
      mappingIndexes.set(occurrence, { headers: raw.headers, rows });
    }
    return mappingIndexes.get(occurrence);
  }
  function rowSelection(occurrence, key, family = null, record = null) {
    if (!family && record?.fm?.artifact_type === 'figma-component-mapping' &&
        ['component-mapping', 'mapping-provenance'].includes(occurrence.slug)) {
      return mappingRow(record, occurrence, key);
    }

    const tables = encoded(occurrence);
    const eligible = family
      ? scopedIndexedBy(tables, `family:${family}`, (t) => signatures[family].every((h) => hasHeader(t.headers, h))).get(true) || [] : tables;
    if (family && eligible.length !== 1) fail('SW-REF-AMBIGUOUS', `canonical ${family} table must be unique`);
    const matches = rowsOf(eligible, family).get(key) || [];
    if (matches.length !== 1) fail(matches.length ? 'SW-REF-AMBIGUOUS' : 'SW-REF-MISSING', `exact row ${key}`);
    const { table, index } = matches[0];
    return selectedRow(occurrence.slug, key, table, index, record);
  }
  function selectedRow(slug, key, table, index, record) {
    const selected = { type: 'row', section: slug, key, headers: [...table.headers], cells: [...table.cells[index]] };
    if (record) rememberScopedSelection(selected, record.body, [nativeTables.get(table).children[index + 1]]);
    return selected;
  }
  // A section's tables are encoded once per resolver and their rows indexed by identity, so
  // selecting every row of a register stays linear (#275); each selection copies its cells.
  const tableCache = new WeakMap(), indexCache = new WeakMap(), rawTables = new WeakMap(), nativeTables = new WeakMap();
  function encoded(occurrence) {
    if (!tableCache.has(occurrence)) tableCache.set(occurrence, occurrence.tables.map((table, i) => {
      const node = occurrence.tableNodes[i];
      if (!rawTables.has(node)) {
        const raw = scopedRawTable(table);
        rawTables.set(node, raw); nativeTables.set(raw, node);
      }
      return rawTables.get(node);
    }));
    return tableCache.get(occurrence);
  }
  // The rows of several tables by identity, in table then row order, indexed once per table list.
  const combined = new WeakMap();
  function rowsOf(tables, family) {
    if (!combined.has(tables)) combined.set(tables, new Map());
    const byMode = combined.get(tables), mode = family ? 'id' : 'first';
    if (!byMode.has(mode)) {
      const index = new Map();
      lookupStats.examined += tables.length;
      for (const table of tables) for (const [identity, positions] of rowIndex(table, family)) for (const position of positions) {
        if (!index.has(identity)) index.set(identity, []);
        index.get(identity).push({ table, index: position });
      }
      byMode.set(mode, index);
    }
    return byMode.get(mode);
  }
  function rowIndex(table, family) {
    if (!indexCache.has(table)) indexCache.set(table, new Map());
    const byMode = indexCache.get(table), mode = family ? 'id' : 'first';
    if (!byMode.has(mode)) {
      const index = new Map();
      table.rows.forEach((row, position) => {
        const identity = family ? col(row, 'ID') : table.cells[position][0];
        if (!index.has(identity)) index.set(identity, []);
        index.get(identity).push(position);
      });
      byMode.set(mode, index);
    }
    return byMode.get(mode);
  }
  // An ordinary artifact row names raw evidence, including GENERATED rows. The
  // authored view may extend that row's section across GENERATED headings, but
  // must not replace its existing raw candidates. Merge native tables once per
  // section and deduplicate only the same physical table, never equal cell text.
  const artifactRowHomes = new WeakMap();
  function artifactRowSelection(record, markdown, ref, authored) {
    if (!artifactRowHomes.has(markdown)) artifactRowHomes.set(markdown, new Map());
    const homes = artifactRowHomes.get(markdown);
    if (!homes.has(ref.section)) {
      const raw = scopedSectionsBySlug(markdown.sections, ref.section);
      const tables = new Map();
      for (const home of [...raw, ...authored]) home.tableNodes.forEach((node, index) => {
        if (!tables.has(node)) tables.set(node, home.tables[index]);
      });
      homes.set(ref.section, { slug: ref.section, tableNodes: [...tables.keys()], tables: [...tables.values()] });
    }
    return rowSelection(homes.get(ref.section), ref.rowKey, null, record);
  }
  // A caller that keeps its records internal (one graph resolution) shares one copy of a
  // document's metadata: selecting every row of a register would otherwise copy its frontmatter,
  // bindings included, once per row (#275). Otherwise each record has its own copy.
  const metadataCopies = new Map();
  function metadataOf(id, record) {
    if (!shareMetadata) return structuredClone(record.fm);
    if (!metadataCopies.has(id)) metadataCopies.set(id, structuredClone(record.fm));
    return metadataCopies.get(id);
  }
  function authoredContract(token) {
    workText(token, 'authored scoped contract');
    const ref = parseScopedTargetRef(token);
    if (ref?.kind !== 'unknown') fail('SW-REF-SYNTAX', `authored Unknown required: ${token}`);
    const { record, relative, markdown } = artifact(ref.ownerArtifactId);
    const homes = scopedAuthoredSections(record.body, 'unknowns', markdown);
    if (homes.length !== 1) fail(homes.length ? 'SW-REF-AMBIGUOUS' : 'SW-REF-MISSING', `authored Unknowns: ${token}`);
    if (!homes[0].tables.some((table) => signatures.unknown.every((header) => hasHeader(table.headers, header)))) {
      fail('SW-REF-MISSING', `authored Unknown table: ${token}`);
    }
    const selection = rowSelection(homes[0], ref.rowId, 'unknown', record);
    return { ref: ref.raw, kind: ref.kind, artifact_id: ref.ownerArtifactId, file: relative,
      metadata: metadataOf(ref.ownerArtifactId, record), selection };
  }
  function tracking(token) {
    let selected;
    try { selected = authoredContract(token); } catch (error) {
      // A raw-only Unknown remains a valid ordinary reference, but never an
      // authored deferral witness (including generated/formatted examples).
      if (error instanceof ScopedWorkContractError && /SW-REF-MISSING/.test(error.message)) {
        const parsedRef = parseScopedTargetRef(token);
        const { record } = artifact(parsedRef.ownerArtifactId);
        const raw = resolveChildRow(record, parsedRef.rowId, 'unknown');
        if (raw.found && !raw.familyMismatch) {
          fail('SW-GRAPH', `deferred Tracking requires a canonical open Unknown: ${token}`);
        }
      }
      throw error;
    }
    const row = Object.fromEntries(selected.selection.headers.map((h, i) => [h, selected.selection.cells[i]]));
    if (String(col(row, 'Status') || '').toLowerCase() !== 'open') {
      fail('SW-GRAPH', `deferred Tracking requires a canonical open Unknown: ${token}`);
    }
    return selected;
  }
  function rawContract(token) {
    workText(token, 'scoped contract');
    const ref = parseScopedTargetRef(token);
    if (!ref || ['none', 'input'].includes(ref.kind)) fail('SW-REF-SYNTAX', `unsupported contract ${token}`);
    const id = ref.kind === 'artifact' ? ref.artifactId : ref.ownerArtifactId;
    const { record, relative, markdown } = artifact(id);
    let selection;
    if (ref.kind === 'artifact') {
      if (!ref.section) selection = { type: 'body', content: lf(record.body) };
      else {
        let authored = (ref.section === 'api-candidates' && ['screen-spec', 'shared-surface-spec'].includes(record.fm.artifact_type)) || ref.section === 'unknowns'
          ? scopedAuthoredSections(record.body, ref.section === 'api-candidates' ? 'api candidates' : 'unknowns', markdown) : [];
        if (ref.section === 'unknowns' && !authored.some((home) => home.tables.some((table) =>
          signatures.unknown.every((header) => hasHeader(table.headers, header))))) authored = [];
        if (ref.section === 'api-candidates' && ref.rowKey !== null && !authored.some((home) => home.tables.length)) authored = [];
        if (authored.length > 1) fail('SW-REF-AMBIGUOUS', `section #${ref.section}`);
        // Authored homes already list each retained H2 of the literal name's
        // native slug (#285). Validate them by slug before either section or
        // row selection; GENERATED headings alone do not make a real duplicate.
        if (authored.length) {
          const retained = scopedSectionsBySlug(scopedAuthoredView(record.body, markdown).sections, ref.section);
          if (retained.length !== 1) fail(retained.length ? 'SW-REF-AMBIGUOUS' : 'SW-REF-MISSING', `section #${ref.section}`);
        }
        const selected = authored.length === 1 ? authored[0] : section(markdown, ref.section);
        selection = ref.rowKey === null
          ? { type: 'section', section: ref.section, content: lf(selected.text) }
          : authored.length ? artifactRowSelection(record, markdown, ref, authored)
            : rowSelection(selected, ref.rowKey, null, record);
        if (ref.rowKey === null) rememberScopedSelection(selection, record.body, selected.nodes);
      }
    } else if (Object.hasOwn(signatures, ref.kind)) {
      const child = resolveChildRow(record, ref.rowId, ref.kind);
      if (!child.found || child.familyMismatch) fail('SW-REF-MISSING', `canonical ${token}`);
      if (child.ambiguous) fail('SW-REF-AMBIGUOUS', `canonical ${token}`);
      selection = rowSelection(section(markdown, child.sectionSlug), ref.rowId, ref.kind, record);
    } else {
      // INV/VER have no canonical row family in v2. Retain the whole body rather
      // than pretending a coincidental line is an independently owned contract.
      if (!bodyHasToken(record, ref.rowId)) fail('SW-REF-MISSING', `visible ${token}`);
      selection = { type: 'body-token', key: ref.rowId, content: lf(record.body) };
    }
    return { ref: ref.raw, kind: ref.kind, artifact_id: id, file: relative,
      metadata: metadataOf(id, record), selection };
  }
  // An ordinary artifact row may explicitly select GENERATED evidence beside a
  // canonical authored table, without a GENERATED H2 separating the raw tables.
  // Its derived Unknown must resolve to that same unique ID, not disappear at
  // the table-count check. This fallback never accepts two authored tables or
  // two physical rows with the same ID, and never changes a successful raw ref.
  const mixedUnknownTables = new WeakMap();
  function mixedUnknownSelection(record, markdown, ref) {
    if (!mixedUnknownTables.has(markdown)) {
      let tables = null;
      const retained = scopedSectionsBySlug(scopedAuthoredView(record.body, markdown).sections, 'unknowns');
      const authored = scopedAuthoredSections(record.body, 'unknowns', markdown);
      const raw = scopedSectionsBySlug(markdown.sections, 'unknowns');
      const canonical = (home) => scopedIndexedBy(encoded(home), 'family:unknown', (table) =>
        signatures.unknown.every((header) => hasHeader(table.headers, header))).get(true) || [];
      if (retained.length === 1 && authored.length === 1 && raw.length === 1) {
        const authoredTables = canonical(authored[0]), rawTables = canonical(raw[0]);
        if (authoredTables.length === 1 && rawTables.length > 1 && rawTables.includes(authoredTables[0])) {
          const clean = stripGeneratedBlocks(record.body, { preserveOffsets: true });
          const generated = rawTables.filter((table) => table !== authoredTables[0]);
          if (generated.every((table) => {
            const node = nativeTables.get(table);
            return !clean.slice(node.position.start.offset, node.position.end.offset).trim();
          })) tables = rawTables;
        }
      }
      mixedUnknownTables.set(markdown, tables);
    }
    const tables = mixedUnknownTables.get(markdown);
    if (!tables) return null;
    const matches = rowsOf(tables, 'unknown').get(ref.rowId) || [];
    if (matches.length !== 1) fail(matches.length ? 'SW-REF-AMBIGUOUS' : 'SW-REF-MISSING', `canonical ${ref.raw}`);
    const { table, index } = matches[0];
    return selectedRow('unknowns', ref.rowId, table, index, record);
  }
  function contract(token) {
    try { return rawContract(token); } catch (error) {
      const ref = parseScopedTargetRef(token);
      if (!(error instanceof ScopedWorkContractError) || ref?.kind !== 'unknown' ||
          !/SW-REF-(?:MISSING|AMBIGUOUS):/.test(error.message)) throw error;
      const { record, relative, markdown } = artifact(ref.ownerArtifactId);
      const mixed = mixedUnknownSelection(record, markdown, ref);
      if (mixed) return { ref: ref.raw, kind: ref.kind, artifact_id: ref.ownerArtifactId, file: relative,
        metadata: metadataOf(ref.ownerArtifactId, record), selection: mixed };
      // Only GENERATED-induced boundaries get a fallback. A second authored
      // home, malformed table or a different raw row is still an ambiguity.
      const authored = scopedAuthoredView(record.body, markdown);
      if (authored.sections.length === markdown.sections.length) throw error;
      let selected;
      try { selected = authoredContract(token); } catch { throw error; }
      const target = scopedSelectionNodes(record.body, selected.selection)[0];
      const matches = [];
      for (const home of markdown.sections.filter((entry) => entry.slug === 'unknowns')) {
        for (const table of encoded(home)) {
          if (!signatures.unknown.every((header) => hasHeader(table.headers, header))) continue;
          for (const index of rowIndex(table, 'unknown').get(ref.rowId) || []) matches.push(nativeTables.get(table).children[index + 1]);
        }
      }
      if (matches.length > 1 || matches.some((node) => node !== target)) fail('SW-REF-AMBIGUOUS', `raw/authored Unknown differs: ${token}`);
      return selected;
    }
  }
  return { contract, authoredContract, tracking, contracts: (tokens) => workSet(tokens, contract, 'contracts', true) };
}
