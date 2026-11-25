// R1 Conflict/Unknown relation facts, not scope-basis-v1 or a permission result.
// Inverse dependencies and unscoped canonical rows cannot disappear merely
// because a selected unit did not list them. No prose-based negative inference,
// new Unknown status, approval, isolation exemption or public CLI is introduced.
// Only a malformed section that provably cannot relate is skipped, and reported.
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { col, hasHeader } from './spec.mjs';
import { canonicalRepositoryPath, createCanonicalRepositoryPathResolver } from './artifact-path.mjs';
import { ownerParts, readCurrentBytes, hashBytes, CurrentWorkError } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { parseTargetRef } from './reconciliation-items.mjs';
import { parseReconciliationMarkdown, sharedReconciliationReferenceView,
  reconciliationTreeNodeCount, withReconciliationSyntaxReuse } from './reconciliation-markdown-ast.mjs';
import { createSyntaxCache } from './syntax-cache.mjs';
import { createCanonicalScopedReferenceResolver as createScopedReferenceResolver,
  scopedRawTable, parseScopedTargetRef, scopedRowAlias } from './scoped-work-refs.mjs';
import { resolveScopedContractGraph, createScopedGraphSelectionSpanResolver, scopedGraphMetadataRefs, scopedGraphBodyRefs,
  mergeScopedGraphContexts } from './scoped-work-graph.mjs';
import { scopedProjectionNode } from './scoped-work-projection.mjs';
import { scopedUnitEvidenceSeeds } from './scoped-work-unit-seeds.mjs';
import { resolveScopedDecisionProjection, createScopedSnapshotDecisionResolver } from './scoped-work-decisions.mjs';
import { ScopedWorkContractError, workText } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';
import { sharedScopedAuthoredSections, scopedSelectionUnknownAuthored, rememberScopedSelection, copyScopedNodeContexts,
  scopedSelectionNodes, reuseScopedSelectionNodes,
  withCanonicalScopedDocumentSyntax as withScopedDocumentSyntax } from './scoped-work-authored.mjs';
import { scopedProjectionProgress } from './workflow-progress.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-UNCERTAINTY: ${message}`); };
const signatures = { unknown: ['ID', 'Question'], conflict: ['ID', 'Status'] };
const typedSpelling = /(?:artifact|decision|unknown|conflict|gap|investigation|verification|input):/;
const union = (values) => scopeSet([...new Set(values)]);
const key = (owner, unit) => scopeJson([owner, unit]);

// An authored table can sit after a GENERATED heading while an independently
// resolvable raw Unknown table remains before it. Keep both physical sources;
// the presence of an authored table must not erase ordinary generated evidence.
export function scopedUnknownHomes(body, view) {
  const publicDefault = view === undefined;
  if (publicDefault) view = sharedReconciliationReferenceView(body);
  // Default public lookups must neither replace the authored prewarm nor expose
  // shared frozen containers as formerly mutable results. Only the derived
  // containers are copied: their immutable native nodes keep physical identity.
  // Internal callers pass their shared view explicitly and retain zero-copy
  // canonical homes; explicit custom/raw views keep their own interpretation.
  const result = (homes) => publicDefault ? homes.map(({ location, authored }) => {
    const copy = { ...location };
    for (const [name, value] of Object.entries(copy)) {
      if (!Array.isArray(value)) continue;
      copy[name] = name === 'tables' ? value.map((table) => ({ ...table,
        headers: [...table.headers], rows: table.rows.map((row) => ({ ...row })),
      })) : [...value];
    }
    return { location: copy, authored };
  }) : homes;
  const authored = sharedScopedAuthoredSections(body, 'unknowns', view);
  const canonical = (table) => signatures.unknown.every((header) => hasHeader(table.headers, header));
  const authoredTables = new Set(authored.flatMap((section) => section.tableNodes.filter((_, index) => canonical(section.tables[index]))));
  const raw = view.sections.filter((section) => section.slug === 'unknowns');
  if (!authoredTables.size) return result(raw.map((location) => ({ location, authored: false })));
  const homes = authored.map((location) => ({ location, authored: true }));
  // Multiple raw sections/tables cannot supply an ordinary canonical Unknown.
  // Do not restore GENERATED-only empty sections or display legends as authored
  // format errors; selected ordinary refs still undergo the raw resolver checks.
  if (raw.length === 1) {
    const tables = raw[0].tableNodes.filter((_, index) => canonical(raw[0].tables[index]));
    if (tables.length === 1 && !authoredTables.has(tables[0])) homes.push({ location: raw[0], authored: false });
  }
  return result(homes);
}

// Fixpoint roots keep the selected physical row's context, not a document-wide
// "has authored Unknowns" flag. Compare source offsets so parser cache eviction
// cannot change the answer for an existing selection sidecar.
export function scopedUnknownAuthored(body, selection, view = null) {
  return scopedSelectionUnknownAuthored(body, selection, view);
}

const nodeSet = (values) => copyScopedNodeContexts(values, scopeSet(values));

// #262: a resolved row no longer blocks. A Conflict keeps its open|resolved
// vocabulary; an Unknown keeps its own optional one, so only `resolved` clears it
// (in any case, as legacy readiness reads Unknown Status). Anything else blocks.
export function scopedUncertaintyResolved(record) {
  if (!record) return false;
  if (record.kind === 'unknown') return typeof record.status === 'string' && record.status.toLowerCase() === 'resolved';
  return record.status === 'resolved';
}

export function resolveScopedUncertaintyProjection(options = {}, dependencyRoots = [], dependencyContext = {}) {
  // The fixpoint re-expands derived rows in the decision layer. Carry their
  // actual row context beside the unchanged public root declarations. Ordinary
  // roots stay ordinary unless their caller carries an authored selection.
  return uncertaintyProjection(options, resolveScopedDecisionProjection(options, dependencyRoots, dependencyContext));
}

// The boundary creates this only after resolving its actual layout/preset.
// Both stages share internally derived units; no caller base replaces a read.
export function createScopedSnapshotRelationResolver(options = {}) {
  const resolved = createScopedSnapshotDecisionResolver(options);
  return { decision: resolved.decision, verify: resolved.verify,
    uncertainty(dependencyRoots = [], dependencyContext = {}) {
      return uncertaintyProjection(options, resolved.decision(dependencyRoots, dependencyContext));
    } };
}

function uncertaintyProjection(options, base) {
  return withReconciliationSyntaxReuse(() => computeUncertaintyProjection(options, base));
}

function computeUncertaintyProjection(options, base) {
  const { targetIndex, projectRoot, inputArtifacts = [] } = options;
  const canonicalPath = createCanonicalRepositoryPathResolver(projectRoot);
  // Each document row batch owns its reference resolver. Keeping one for the
  // whole evaluation would retain every oversized owner's parsed view after
  // the bounded document cache has declined it.
  let refs = null;
  const files = new Map(base.read_set.map((entry) => [entry.file, entry]));
  // Enumeration visits every indexed artifact. Keep only a bounded working set
  // of parsed documents; the complete file hashes below remain authoritative.
  const documents = createSyntaxCache();
  const nodes = new Map();
  const edges = new Map();
  const candidates = new Map();
  const subjects = new Map();
  const spans = new WeakMap();
  const selectionSpans = createScopedGraphSelectionSpanResolver();
  // Retain only nodes that the candidate results already need, once for each
  // exact physical source. The dependency syntax scope separately holds at
  // most one oversized tree; this map never retains a whole document view.
  const physicalSelections = new Map();

  function read(relative, expectedHash) {
    const options = { required: true, type: 'file', label: 'scoped uncertainty' };
    const file = expectedHash === undefined ? canonicalPath(relative, options) : canonicalRepositoryPath(projectRoot, relative, options);
    const raw = readCurrentBytes(file.absolute, 'scoped uncertainty');
    const sha256 = hashBytes(raw);
    if ((expectedHash && sha256 !== expectedHash) || (files.has(relative) && files.get(relative).sha256 !== sha256)) {
      fail('document changed during uncertainty resolution');
    }
    files.set(relative, { file: relative, sha256 });
    return raw;
  }
  function sourceFromBytes(relative, raw) {
    const text = decodeGitUtf8(raw, 'scoped uncertainty');
    const parsed = splitFrontmatter(text);
    if (!parsed.hasFrontmatter || parsed.parseError) fail('invalid uncertainty document');
    return { text, body: parsed.body, file: relative };
  }
  function documentSource(relative) {
    const cached = documents.get(relative);
    if (cached) return cached;
    // A miss, including during an active syntax scope, still reads actual
    // bytes and compares with the original hash. Only parsing is reused.
    return sourceFromBytes(relative, read(relative));
  }
  function document(relative, visit = null, source = documentSource(relative)) {
    if (source.view && !visit) return source;
    const materialize = (view) => {
      const doc = source.view === view ? source : { ...source, file: relative, view };
      documents.set(relative, doc, { sourceChars: relative.length + doc.text.length,
        nodes: reconciliationTreeNodeCount(view.tree) });
      if (!visit) return doc;
      const previous = refs;
      refs = createScopedReferenceResolver({ targetIndex, projectRoot, inputArtifacts });
      try {
        return visit(doc);
      } finally {
        refs = previous;
      }
    };
    // Open the scope before the first view is built, then release it after this
    // document's row batch. Never retain all oversized documents for the owner.
    return visit ? withScopedDocumentSyntax(source.body, materialize)
      : materialize(sharedReconciliationReferenceView(source.body));
  }
  function addNode(node, current = null) {
    if (nodes.has(node.ref)) {
      const previous = nodes.get(node.ref);
      if (scopeJson(previous) !== scopeJson(node)) fail('inconsistent selected evidence');
      if (scopeJson(ranges(previous, current)) !== scopeJson(ranges(node, current))) fail('ambiguous selected evidence source');
    }
    nodes.set(node.ref, node);
  }
  function addEvidence(evidence) {
    // The base and Decision graphs often select many sections of one file.
    // Their remembered native nodes need current source bytes, but no new view;
    // that path deliberately does not populate the bounded syntax cache. Keep
    // one checked source only for this file's merge instead of rereading it for
    // every pair of selections, and release it before the next file batch.
    const byFile = new Map();
    for (const node of evidence.nodes) {
      if (!byFile.has(node.file)) byFile.set(node.file, []);
      byFile.get(node.file).push(node);
    }
    for (const batch of byFile.values()) {
      let current = null;
      for (const node of batch) {
        if (nodes.has(node.ref)) current ??= documentSource(node.file);
        addNode(node, current);
      }
    }
    for (const edge of evidence.edges) edges.set(scopeJson(edge), edge);
  }
  addEvidence(base.projection.evidence);
  addEvidence(base.projection.decision_relations.evidence);
  const consumedGraphs = [base.projection.evidence, base.projection.decision_relations.evidence];

  // Table shape and row identity of one canonical section, before any resolution.
  function sectionRows(entry, family, headers, location) {
    const tables = location.tables.map(scopedRawTable).filter((table) => headers.every((header) => hasHeader(table.headers, header)));
    if (tables.length !== 1) fail(`one canonical ${family} table required`);
    const rows = new Map();
    for (const row of tables[0].rows) {
      const id = col(row, 'ID');
      if (id.startsWith('{')) continue; // Existing canonical template placeholder.
      workText(id, `${family} ID`);
      const token = `${family}:${id}@${entry.fm.artifact_id}`;
      const parsedRef = parseScopedTargetRef(token);
      if (parsedRef?.kind !== family || parsedRef.rowId !== id) fail(`noncanonical uncertainty ID ${JSON.stringify(id)}`);
      if (rows.has(token)) fail(`duplicate uncertainty ${token}`);
      if (family === 'unknown') workText(col(row, 'Question'), 'Unknown Question');
      const status = col(row, 'Status') || null;
      // Unknowns deliberately keep their native optional status vocabulary.
      if (family === 'conflict' && !['open', 'resolved'].includes(status)) fail(`invalid Conflict Status: ${token}`);
      rows.set(token, { status, affected: family === 'conflict' ? col(row, '영향 화면') : undefined });
    }
    return rows;
  }

  function addCandidate(entry, token, status, affected, authored, source = null, doc = null) {
    const selected = authored ? refs.authoredContract(token) : refs.contract(token);
    const record = { ...scopedProjectionNode(selected), status };
    const current = doc?.file === record.file ? doc : null;
    if (source && (source.file !== record.file || scopeJson(ranges(source, current)) !== scopeJson(ranges(record, current)))) {
      fail(`ambiguous canonical Unknown source: ${token}`);
    }
    const physical = scopeJson([token, ranges(record, current)]);
    if (candidates.has(physical)) return;
    const graph = resolveScopedContractGraph({ contracts: [token], targetIndex, projectRoot, inputArtifacts,
      authoredRefs: authored ? [token] : [] });
    const evidence = mergeScopedGraphContexts([graph],
      { roots: graph.roots, nodes: graph.nodes.map(scopedProjectionNode), edges: graph.edges });
    // Relation matching needs physical spans, including external dependencies.
    // Group selections by file and consume this graph's mandatory audit read.
    // A dozen anchors from an uncached input need one verified source here,
    // not a fresh read/hash/frontmatter split per selection. These source bytes
    // live only through this file's work; the next graph and final audit read
    // the actual file again.
    const selectedFiles = new Map();
    for (const node of evidence.nodes) {
      if (!selectedFiles.has(node.file)) selectedFiles.set(node.file, []);
      selectedFiles.get(node.file).push(node);
    }
    for (const file of graph.read_set) {
      const raw = read(file.file, file.sha256);
      const selected = selectedFiles.get(file.file);
      if (!selected) continue;
      const source = file.file === current?.file ? current
        : documents.get(file.file) || sourceFromBytes(file.file, raw);
      for (const node of selected) {
        ranges(node, source);
        retainPhysicalSelection(node, source);
      }
      selectedFiles.delete(file.file);
    }
    if (selectedFiles.size) fail('missing selected source audit');
    candidates.set(physical, { record, entry, evidence, affected: affectedOwners(affected) });
    scopedProjectionProgress('candidate-rows');
  }

  // #262: the conflicts template's `영향 화면` cell names owners only as a list of
  // known screen/surface IDs separated by `,` or `·`. Anything else (`global` in
  // any case, even where a screen has that ID, a blank, prose, markup or an
  // unknown ID) names none: prose never narrows.
  const knownOwners = new Map();
  for (const { fm } of targetIndex.artifacts.values()) {
    const [kind, id] = fm?.artifact_type === 'screen-spec' ? ['screen', fm.screen_id]
      : fm?.artifact_type === 'shared-surface-spec' ? ['surface', fm.surface_id] : [];
    if (typeof id === 'string' && id) knownOwners.set(id, [...(knownOwners.get(id) || []), `${kind}:${id}`]);
  }
  function affectedOwners(cell) {
    if (typeof cell !== 'string') return null;
    const ids = cell.split(/[,·]/).map((id) => id.trim());
    if (ids.some((id) => id.toLowerCase() === 'global')) return null;
    return ids.every((id) => knownOwners.has(id)) ? new Set(ids.flatMap((id) => knownOwners.get(id))) : null;
  }

  // Parse canonical homes again from the actual bytes, not caller-edited index
  // rows. The shared resolver still owns identity, table/section uniqueness and
  // exact raw row selection. Missing signatures must not become an empty set.
  const unaudited = [];
  for (const entry of targetIndex.artifacts.values()) {
    const relative = path.relative(projectRoot, entry.file).split(path.sep).join('/');
    document(relative, (doc) => {
      const parsed = parseReconciliationMarkdown(doc.body);
      for (const [family, headers] of Object.entries(signatures)) {
        const locations = family === 'unknown' ? scopedUnknownHomes(doc.body, doc.view)
          : parsed.occurrences.filter((section) => section.slug === `${family}s` ||
          (family === 'conflict' && section.slug === '' && entry.fm.artifact_type === 'conflicts' &&
            section.tables.some((table) => headers.every((header) => hasHeader(table.headers, header)))))
            .map((location) => ({ location, authored: false }));
        for (const { location, authored } of locations) {
          let rows;
          try { rows = sectionRows(entry, family, headers, location); } catch (error) {
            if (!(error instanceof ScopedWorkContractError)) throw error;
            // Fatal or unaudited is decided below, once selected evidence is known (#260).
            unaudited.push({ entry, file: relative, section: location.slug, error });
            continue;
          }
          for (const [token, { status, affected }] of rows) {
            // Audit every inspected row; project only rows with a relation below.
            addCandidate(entry, token, status, affected, authored, null, doc);
          }
        }
      }
    });
    scopedProjectionProgress('candidate-documents');
  }

  // Index physical Unknown rows once per document for section/body selections.
  // Raw homes retain GENERATED rows; authored homes also retain real rows after
  // GENERATED H2s. Decode a table only when a selected range covers one of its
  // rows, so an unselected display table cannot introduce a new format error.
  const unknownTables = new Map();
  function coveredUnknownRows(node, doc) {
    if (!unknownTables.has(node.file)) {
      const tables = new Map();
      const homes = [...doc.view.sections.filter((home) => home.slug === 'unknowns'),
        ...sharedScopedAuthoredSections(doc.body, 'unknowns', doc.view)];
      for (const home of homes) home.tableNodes.forEach((native, index) => {
        const table = home.tables[index];
        if (tables.has(native) || !signatures.unknown.every((header) => hasHeader(table.headers, header))) return;
        tables.set(native, { table, rows: native.children.slice(1).map((row) => ({
          kind: 'artifact', artifact_id: node.artifact_id, file: node.file,
          selection: rememberScopedSelection({ type: 'row', section: 'unknowns' }, doc.body, [row]),
        })) });
      });
      unknownTables.set(node.file, [...tables.values()]);
    }
    // Native leaf spans are disjoint. Search them separately, preserving holes
    // in the selection instead of treating its outer bounds as ownership.
    const selected = [...ranges(node, doc)].sort(([a, b], [c, d]) => a - c || b - d);
    const contains = ([start, end]) => {
      let low = 0, high = selected.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (selected[middle][0] <= start) low = middle + 1;
        else high = middle;
      }
      return low > 0 && end <= selected[low - 1][1];
    };
    const covered = [];
    for (const table of unknownTables.get(node.file)) table.rows.forEach((source, index) => {
      const spans = ranges(source, doc);
      if (!spans.length || !spans.every(contains)) return;
      table.raw ??= scopedRawTable(table.table);
      if (!signatures.unknown.every((header) => hasHeader(table.raw.headers, header))) return;
      if (col(table.raw.rows[index], 'ID').startsWith('{')) return;
      const cells = table.raw.cells[index];
      Object.assign(source.selection, { key: cells[0], headers: table.raw.headers, cells });
      covered.push(source);
    });
    return covered;
  }
  // Canonical-home enumeration intentionally ignores GENERATED display tables
  // beside an authored table. Exact rows and rows fully covered by a selected
  // section/body are evidence: re-resolve each alias to the same original row.
  // Keep the exact-row path independent of the document-wide row index.
  function addSelectedUnknown(node, doc) {
    const selection = node.selection;
    const row = Object.fromEntries(selection.headers.map((header, index) => [header, selection.cells[index]]));
    const token = node.kind === 'unknown' ? node.ref : scopedRowAlias(node);
    if (!token) fail(`noncanonical uncertainty ID ${JSON.stringify(col(row, 'ID'))}`);
    workText(col(row, 'Question'), 'Unknown Question');
    const authored = scopedUnknownAuthored(doc.body, selection, doc.view);
    addCandidate(targetIndex.artifacts.get(node.artifact_id), token, col(row, 'Status') || null, undefined, authored, node, doc);
  }
  let selectedBatch = [];
  const visitSelectedBatch = () => {
    if (!selectedBatch.length) return;
    document(selectedBatch[0].file, (doc) => {
      for (const node of selectedBatch) {
        if (node.selection.type === 'row') addSelectedUnknown(node, doc);
        else for (const source of coveredUnknownRows(node, doc)) addSelectedUnknown(source, doc);
      }
    });
    selectedBatch = [];
  };
  for (const node of nodes.values()) {
    const selection = node.selection;
    const row = ['artifact', 'unknown'].includes(node.kind) && selection?.type === 'row' && selection.section === 'unknowns' &&
      signatures.unknown.every((header) => hasHeader(selection.headers, header));
    if (!row && !(node.artifact_id && ['section', 'body', 'body-token'].includes(selection?.type))) continue;
    // Keep existing selection order, grouping only consecutive work for the
    // same file. A whole selected section may cover many canonical rows.
    if (selectedBatch.length && selectedBatch[0].file !== node.file) visitSelectedBatch();
    selectedBatch.push(node);
  }
  visitSelectedBatch();

  function subject(owner, unit) {
    const id = key(owner, unit);
    if (!subjects.has(id)) subjects.set(id, { owner, unit, roots: new Set(), derived: new Map() });
    return subjects.get(id);
  }
  function seed(owner, unit, token) {
    const out = subject(owner, unit);
    if (nodes.has(token)) out.roots.add(token);
  }
  for (const unit of base.projection.units) {
    const id = unit.declaration.id;
    subject(unit.owner, id);
    for (const token of scopedUnitEvidenceSeeds(unit)) seed(unit.owner, id, token);
  }
  for (const owner of base.projection.owners) if (!owner.adopted) subject(owner.owner, null);
  function derivedSeed(owner, unit, via, token) {
    const out = subject(owner, unit);
    if (!out.derived.has(via)) out.derived.set(via, new Set());
    if (!nodes.has(token)) fail('missing derived dependency');
    out.derived.get(via).add(token);
  }
  for (const root of base.projection.decision_relations.dependency_roots || []) {
    derivedSeed(root.owner, root.unit, root.ref, root.ref);
  }
  for (const application of base.projection.decision_relations.applications) {
    if (application.uncertainty) {
      derivedSeed(application.owner, application.unit, application.uncertainty, application.decision);
      continue;
    }
    if (application.unit !== null) seed(application.owner, application.unit, application.decision);
    else {
      const selected = [...subjects.values()].filter((value) => value.owner === application.owner);
      for (const value of selected) seed(value.owner, value.unit, application.decision);
    }
  }
  for (const link of base.projection.host_links) if (link.mapping) {
    const hostUnit = link.host_unit === 'legacy-current' ? null : link.host_unit;
    const mappingId = parseTargetRef(link.mapping.ref).artifactId;
    for (const row of link.mapping.rows) for (const token of [
      `${link.mapping.ref}/${row.m_key}`, `artifact:${mappingId}#mapping-provenance/${row.m_key}`, row.evidence,
    ]) {
      seed(link.surface, link.unit, token);
      seed(link.member, hostUnit, token);
    }
  }
  const adjacency = new Map();
  for (const edge of edges.values()) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge.to);
  }
  for (const value of subjects.values()) {
    const queue = [...value.roots]; const seen = new Set(queue);
    for (let i = 0; i < queue.length; i += 1) for (const next of adjacency.get(queue[i]) || []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    value.selected = [...seen].map((token) => nodes.get(token));
    if (value.selected.some((node) => !node)) fail('missing selected dependency');
    const derived = [];
    for (const [via, roots] of value.derived) {
      const pending = [...roots], reached = new Set(pending);
      for (let i = 0; i < pending.length; i += 1) for (const next of adjacency.get(pending[i]) || []) {
        if (!reached.has(next)) { reached.add(next); pending.push(next); }
      }
      for (const token of reached) {
        if (!nodes.has(token)) fail('missing transitive dependency');
        derived.push({ via, node: nodes.get(token) });
      }
    }
    value.derived = derived;
  }
  function ranges(node, current = null) {
    if (!spans.has(node.selection)) {
      const doc = current?.file === node.file ? current : documentSource(node.file);
      // A graph selection already carries exact native nodes. Rechecking the
      // current body must not parse a whole oversized dependency just to obtain
      // a view that selectedNodes would immediately ignore.
      const view = scopedSelectionNodes(doc.body, node.selection) ? null : document(node.file, null, doc).view;
      spans.set(node.selection, selectionSpans(doc.body, view, node.selection, node.kind === 'input-evidence'));
    }
    return spans.get(node.selection);
  }
  function retainPhysicalSelection(node, doc) {
    const native = scopedSelectionNodes(doc.body, node.selection), selected = spans.get(node.selection);
    // The internal span resolver freezes a result only for immutable data nodes.
    // Custom mutable/accessor/iterator trees keep their independent contexts.
    if (!native || !Object.isFrozen(selected)) return;
    const stamp = files.get(node.file)?.sha256;
    if (!stamp) fail('missing selected source hash');
    const key = scopeJson([node.file, stamp, native.map((part) =>
      [part.type, part.position.start.offset, part.position.end.offset])]);
    const existing = physicalSelections.get(key);
    if (existing && existing.body === doc.body) {
      reuseScopedSelectionNodes(existing.body, node.selection, existing.nodes);
      // Reuse spans through the shared canonical nodes, retaining the input
      // nested-list mode. Public context wrappers still remain independent.
      spans.set(node.selection, selectionSpans(doc.body, null, node.selection, node.kind === 'input-evidence'));
    } else {
      physicalSelections.set(key, { body: doc.body, nodes: [...native] });
    }
  }
  function overlaps(left, right) {
    if (left.file !== right.file) return false;
    // Merely auditing another physical candidate is not a demand for its row.
    // If both sources actually apply, addNode rejects their equal-ref merge.
    if (left.ref === right.ref) return scopeJson(ranges(left)) === scopeJson(ranges(right));
    return ranges(left).some(([a, b]) => ranges(right).some(([c, d]) => a < d && c < b));
  }
  // #262: a named row outside every owner spec (global, undomained or domain
  // document) is native only to the named owners and a named surface's members.
  // An owner spec keeps its own rows, and a resolved row keeps its relations: it
  // blocks nothing itself, but still leads to the open rows it cites. A surface
  // keeps a row that names one of its unadopted members, because a legacy-current
  // host checks no Unknown or Conflict. Selected, inverse and transitive evidence
  // relations do not depend on the cell.
  function named(candidate, value) {
    if (!candidate.affected || scopedUncertaintyResolved(candidate.record) ||
      ['screen-spec', 'shared-surface-spec'].includes(candidate.entry.fm.artifact_type)) return true;
    const { memberships } = base.projection.decision_relations;
    const unadopted = (owner) => base.projection.owners.some((entry) => entry.owner === owner && !entry.adopted);
    return candidate.affected.has(value.owner) ||
      memberships.some((edge) => candidate.affected.has(edge.surface) && edge.member === value.owner) ||
      memberships.some((edge) => edge.surface === value.owner && candidate.affected.has(edge.member) && unadopted(edge.member));
  }
  function nativeOrNull(entry, value, candidate) {
    try { return nativeScope(entry, value) && named(candidate, value); } catch (cause) {
      if (cause instanceof ScopedWorkContractError || cause instanceof CurrentWorkError) return null;
      throw cause;
    }
  }
  function nativeScope(entry, value) {
    const fm = entry.fm;
    if (Object.hasOwn(fm, 'domain')) workText(fm.domain, 'uncertainty domain');
    if (fm.artifact_type === 'screen-spec') {
      workText(fm.screen_id, 'uncertainty screen identity');
      const owner = `screen:${fm.screen_id}`; ownerParts(owner);
      return owner === value.owner;
    }
    if (fm.artifact_type === 'shared-surface-spec') {
      workText(fm.surface_id, 'uncertainty surface identity');
      const owner = `surface:${fm.surface_id}`; ownerParts(owner);
      return owner === value.owner || base.projection.decision_relations.memberships.some((edge) =>
        edge.surface === owner && edge.member === value.owner);
    }
    const owner = base.projection.owners.find((entry) => entry.owner === value.owner);
    // An unspecified/global domain is not proof of irrelevance. In particular,
    // an unrelated typed link in Question cannot itself narrow a native scope.
    return fm.domain === undefined || fm.domain === 'global' || fm.domain === owner?.metadata.domain;
  }

  // #260: a format problem stays fatal wherever a row could relate: a document in
  // any subject's native scope (an unclassifiable one included), one holding
  // selected or derived evidence, or one with a typed reference. Row cells and
  // metadata refs are the only graph edges, so judge references as resolution
  // reads them (decoded metadata, native content scan) as well as the raw text;
  // a reference that cannot be read counts. Elsewhere no relation can be lost,
  // so the section is reported as unaudited instead of stopping all scoped work.
  const contractError = (check) => {
    try { return check(); } catch (cause) { if (cause instanceof CurrentWorkError) return true; throw cause; }
  };
  const referencing = (entry, file) => document(file, (doc) => typedSpelling.test(doc.text) || contractError(() =>
    scopedGraphMetadataRefs(entry.fm).length > 0 || scopedGraphBodyRefs(doc.body, doc.view, entry.fm).length > 0));
  const skipped = new Map();
  for (const { entry, file, section, error } of unaudited) {
    const native = (value) => contractError(() => nativeScope(entry, value));
    if (referencing(entry, file) || [...subjects.values()].some((value) => native(value) ||
      [...value.selected, ...value.derived.map(({ node }) => node)].some((node) => node.file === file))) throw error;
    const value = { file, section, reason: error.message };
    skipped.set(scopeJson(value), value);
  }

  const records = new Map(); const applications = []; const review = []; const inputs = [];
  const projectedNodes = new Map(); const projectedEdges = new Map(); const roots = [];
  const pairs = (list) => scopeSet([...new Map(list.map((pair) => [scopeJson(pair), pair])).values()]);
  for (const candidate of candidates.values()) {
    const { record, entry, evidence } = candidate;
    const token = record.ref;
    let included = false;
    for (const value of subjects.values()) {
      const inverseOf = () => evidence.nodes.filter((node) => node.ref !== token)
        .flatMap((dependency) => value.selected.filter((node) => overlaps(dependency, node))
          .map((node) => ({ dependency: dependency.ref, selected: node.ref })));
      const transitiveOf = () => [record, ...evidence.nodes.filter((node) => node.ref !== token)]
        .flatMap((dependency) => value.derived.filter(({ via, node }) => via !== token && overlaps(dependency, node))
          .map(({ via, node }) => ({ via, dependency: dependency.ref, selected: node.ref })));
      const direct = value.selected.filter((node) => overlaps(record, node)).map((node) => node.ref);
      const inverse = direct.length ? [] : inverseOf();
      const native = !direct.length && !inverse.length && nativeScope(entry, value) && named(candidate, value);
      // A relation discovered through uncertainty is not an authored selection.
      // Never use its own returned graph to erase native scope-review-needed. A
      // native relation keeps these witnesses (#262): a binding narrows only the
      // native part, never a row the unit still reaches through another applied row.
      const transitive = direct.length || inverse.length ? [] : transitiveOf();
      const relation = direct.length ? 'selected-evidence' : inverse.length ? 'inverse-evidence'
        : native ? 'scope-review-needed' : transitive.length ? 'transitive-evidence' : null;
      if (!relation) continue;
      included = true;
      const application = { owner: value.owner, unit: value.unit, uncertainty: token, relation,
        witnesses: direct.length ? union(direct).map((ref) => ({ dependency: token, selected: ref }))
          : pairs(inverse.length ? inverse : transitive) };
      applications.push(application);
      if (relation === 'scope-review-needed') review.push({ owner: value.owner, unit: value.unit, uncertainty: token });
      // #275: everything the relation could rest on, so a binding basis judges it from its own
      // closure's selections; a selection only an unrelated row made must not change it. A native
      // scope that cannot be read here (the relation did not need it) is null.
      const overridden = direct.length || inverse.length;
      inputs.push({ owner: value.owner, unit: value.unit, uncertainty: token, direct: union(direct),
        inverse: pairs(direct.length ? inverseOf() : inverse), native: overridden ? nativeOrNull(entry, value, candidate) : native,
        transitive: pairs(overridden ? transitiveOf() : transitive) });
    }
    if (!included) continue;
    records.set(token, record); roots.push(token);
    consumedGraphs.push(evidence);
    for (const node of evidence.nodes) {
      addNode(node);
      projectedNodes.set(node.ref, node);
    }
    for (const edge of evidence.edges) projectedEdges.set(scopeJson(edge), edge);
  }
  for (const file of [...files.values()]) read(file.file, file.sha256);
  return { projection: { ...base.projection, uncertainty_relations: {
    records: nodeSet([...records.values()]), applications: scopeSet(applications), scope_review_needed: scopeSet(review),
    relation_inputs: scopeSet(inputs),
    evidence: mergeScopedGraphContexts(consumedGraphs,
      { roots: union(roots), nodes: nodeSet([...projectedNodes.values()]), edges: scopeSet([...projectedEdges.values()]) }),
  } }, read_set: scopeSet([...files.values()]), unaudited: scopeSet([...skipped.values()]),
    ...(base.target_fallbacks ? { target_fallbacks: base.target_fallbacks } : {}) };
}
