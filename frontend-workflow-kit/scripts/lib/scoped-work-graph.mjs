// Recursive *selected evidence* graph, not the complete R1 owner/scope projection.
// No permit, approval, basis_digest, or caller-supplied resolver callbacks. The
// eventual basis builder must add every owner/unit/decision/host and project
// metadata explicitly; hashing this raw evidence graph is NOT scope-basis-v1.
import { splitFrontmatter } from './util.mjs';
import { splitRow } from './spec.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { readCurrentBytes, hashBytes, normalizeWorkOrigins } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { parseInputEvidenceRef } from './provenance.mjs';
import { resolveArtifact } from './reconciliation-target-index.mjs';
import { parseReconciliationReferenceView, reconciliationReferenceLabel } from './reconciliation-markdown-ast.mjs';
import { createScopedReferenceResolver, parseScopedTargetRef, scopedSectionsBySlug, scopedIndexedBy } from './scoped-work-refs.mjs';
import { createScopedSourceResolver } from './scoped-work-sources.mjs';
import { workText, workSet, ScopedWorkContractError } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-GRAPH: ${message}`); };
const prefix = /^(?:artifact|decision|unknown|conflict|gap|investigation|verification|input):/;
const spelling = /(?:^|[\s([{"';,])((?:artifact|decision|unknown|conflict|gap|investigation|verification|input):[^\s`<>\[\](){}"';,]+)/g;
function canonicalRef(token) {
  workText(token, 'graph reference');
  const input = parseInputEvidenceRef(token);
  if (input) return normalizeWorkOrigins([{ input_id: input.inputId, source_refs: [token] }])[0].source_refs[0];
  const ref = parseScopedTargetRef(token);
  if (!ref || ['none', 'input'].includes(ref.kind)) fail(`unsupported or malformed typed reference: ${token}`);
  return ref.raw;
}
const rawNode = (body, node) => body.slice(node.position.start.offset, node.position.end.offset);
function walk(node, visit, omitNestedLists = false, root = true) {
  if (omitNestedLists && !root && node.type === 'list') return;
  if (visit(node) === false) return;
  for (const child of node.children || []) walk(child, visit, omitNestedLists, false);
}
// Raw header and row keys per native table node. Trees are shared read-only per
// source text (#265), so a table is encoded once instead of once per selected row.
const tableKeys = new WeakMap();
function nativeTableKeys(body, node) {
  let entry = tableKeys.get(node);
  if (entry?.body !== body) {
    entry = { body, header: scopeJson(splitRow(rawNode(body, node.children[0]))), rows: null };
    tableKeys.set(node, entry);
  }
  return entry;
}
function nativeRowsByKey(body, node) {
  const entry = nativeTableKeys(body, node);
  if (!entry.rows) {
    const rows = new Map();
    for (const row of node.children.slice(1)) {
      const key = scopeJson(splitRow(rawNode(body, row)));
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(row);
    }
    entry.rows = rows;
  }
  return entry.rows;
}
// A section's native rows by raw header and cells, listed once per section and indexed once, so
// selecting every row of a section whose tables are many, or repeat a header, stays linear (#275).
const sectionRows = new WeakMap();
function nativeSectionRows(body, section) {
  let entry = sectionRows.get(section);
  if (entry?.body !== body) {
    entry = { body, list: section.tableNodes.flatMap((node) => {
      const { header } = nativeTableKeys(body, node);
      return [...nativeRowsByKey(body, node)].flatMap(([key, rows]) => rows.map((row) => ({ key: `${header}\n${key}`, row })));
    }) };
    sectionRows.set(section, entry);
  }
  return scopedIndexedBy(entry.list, 'row', (item) => item.key);
}
function selectedNodes(view, selection, body) {
  if (selection.type === 'body' || selection.type === 'body-token') return view.tree.children;
  const sections = scopedSectionsBySlug(view.sections, selection.section);
  if (sections.length !== 1) fail('selected section is missing or ambiguous');
  const nodes = sections[0].nodes;
  if (selection.type !== 'row' && selection.bullet_index == null) return nodes;
  if (selection.type === 'row') {
    // Never reintroduce native tables rejected by the canonical resolver.
    const matches = (nativeSectionRows(body, sections[0]).get(`${scopeJson(selection.headers)}\n${scopeJson(selection.cells)}`) || [])
      .map((item) => item.row);
    if (matches.length !== 1) fail('selected raw row is missing or ambiguous in its native AST');
    return matches;
  }
  const selected = sections[0].bulletNodes[selection.bullet_index - 1];
  if (!selected) fail('selected input bullet is missing');
  return [selected];
}

// Never scan rendered text: comments, entities and formatting cannot concatenate
// fragments into a new reference. Inline code containing a complete typed token
// is an explicit reference; fenced/indented code and HTML remain non-evidence.
// A view's reference definitions, collected once per view: one graph resolution selects many
// rows of a document through the same view (#275).
const viewDefinitions = new WeakMap();
function definitionsOf(view) {
  if (!viewDefinitions.has(view)) {
    const definitions = new Map();
    walk(view.tree, (node) => {
      if (node.type !== 'definition') return;
      const key = reconciliationReferenceLabel(node.label ?? node.identifier);
      if (!definitions.has(key)) definitions.set(key, []);
      definitions.get(key).push(node);
    });
    viewDefinitions.set(view, definitions);
  }
  return viewDefinitions.get(view);
}
function dependencies(body, view, nodes, omitNestedLists) {
  const found = new Set();
  const definitions = definitionsOf(view);
  const add = (token) => found.add(canonicalRef(token));
  function destination(node) {
    if (!prefix.test(node.url || '')) return;
    const raw = rawNode(body, node);
    let tail;
    if (node.type === 'definition') {
      const head = `[${node.label}]:`;
      if (!raw.startsWith(head)) fail('typed definition destination lacks exact raw spelling');
      tail = raw.slice(head.length).trimStart();
    } else if (raw.startsWith('<') && raw.endsWith('>')) {
      tail = raw;
    } else {
      const last = node.children?.at(-1);
      const end = last ? last.position.end.offset : node.position.start.offset + 1;
      const suffix = body.slice(end, node.position.end.offset);
      if (!suffix.startsWith('](')) fail('typed link destination lacks exact raw spelling');
      tail = suffix.slice(2).trimStart();
    }
    const literal = tail.startsWith('<') ? tail.slice(1, tail.indexOf('>')) : /^[^\s)]+/.exec(tail)?.[0];
    if (literal !== node.url) fail('encoded or escaped typed destination is not canonical');
    add(literal);
  }
  for (const selected of nodes) walk(selected, (node) => {
    if (['code', 'html', 'definition'].includes(node.type)) return false;
    if (node.type === 'image' || node.type === 'imageReference') {
      const matches = definitions.get(reconciliationReferenceLabel(node.label ?? node.identifier));
      if (prefix.test(node.url || '') || matches?.some((entry) => prefix.test(entry.url))) {
        fail('typed image dependencies require an explicit text/link reference');
      }
      return false;
    }
    if (node.type === 'link') {
      destination(node);
      const raw = rawNode(body, node);
      const only = node.children?.length === 1 ? node.children[0] : null;
      if ((raw.startsWith('<') && raw.endsWith('>')) ||
          (only?.position.start.offset === node.position.start.offset &&
           only?.position.end.offset === node.position.end.offset)) return false;
    }
    if (node.type === 'linkReference') {
      const matches = definitions.get(reconciliationReferenceLabel(node.label ?? node.identifier));
      if (!matches?.length) fail('referenced definition is missing');
      if (matches.some((entry) => prefix.test(entry.url))) {
        if (matches.length !== 1) fail('referenced definition is missing or ambiguous');
        destination(matches[0]);
      }
    }
    if (node.type === 'inlineCode') {
      const raw = rawNode(body, node);
      const ticks = /^`+/.exec(raw)[0].length;
      const literal = raw.slice(ticks, -ticks).trim();
      if (prefix.test(literal)) add(literal);
      return false;
    }
    if (node.type === 'text') {
      const raw = rawNode(body, node);
      for (const match of raw.matchAll(spelling)) {
        const token = match[1];
        const end = node.position.start.offset + match.index + match[0].length;
        // A text node split by a comment/escape cannot select its first fragment.
        if (end === node.position.end.offset && /[<\\]/.test(body[end] || '')) {
          fail('typed reference crosses a non-text boundary');
        }
        const start = end - token.length;
        if (/[A-Za-z0-9][*_~]+$/.test(body.slice(Math.max(0, start - 16), start)) ||
            /^[*_~]+[A-Za-z0-9]/.test(body.slice(end))) fail('typed reference crosses a formatting boundary');
        add(token);
      }
    }
  }, omitNestedLists);
  return scopeSet([...found]);
}

// Only explicitly typed metadata references are graph edges here. Native
// untyped decision IDs / ownership / unit declarations belong to the later
// owner graph; binding approval_ref/basis_digest never seed this traversal.
// Reads the decoded metadata, so an escaped spelling is the same edge (#260).
export function scopedGraphMetadataRefs(metadata) {
  const refs = [];
  for (const key of ['depends_on', 'decision_refs']) {
    if (!Object.hasOwn(metadata, key)) continue;
    if (!Array.isArray(metadata[key])) fail(`${key}: array required`);
    for (const value of metadata[key]) {
      workText(value, key);
      if (prefix.test(value)) refs.push(canonicalRef(value));
    }
  }
  if (Object.hasOwn(metadata, 'sources')) {
    if (!Array.isArray(metadata.sources)) fail('sources: array required');
    for (const source of metadata.sources) {
      workText(source?.ref, 'source ref');
      if (prefix.test(source.ref)) refs.push(canonicalRef(source.ref));
    }
  }
  if (metadata.approval_source?.ref !== undefined) {
    const value = workText(metadata.approval_source.ref, 'approval source ref');
    if (prefix.test(value)) refs.push(canonicalRef(value));
  }
  return refs;
}
// Every typed content edge the native scanner reads anywhere in one body; it
// fails as resolution would on an encoded or escaped typed destination.
export function scopedGraphBodyRefs(body, view) {
  return dependencies(body, view, view.tree.children, false);
}

// #275: the typed references one selected table row cites as resolution reads it, with
// its document's typed metadata, for a row whose ID cannot form a typed reference.
// A caller selecting several rows of one body passes its view once.
export function scopedGraphSelectionRefs(body, metadata, selection, view = parseReconciliationReferenceView(body)) {
  return scopeSet([...new Set([...dependencies(body, view, selectedNodes(view, selection, body), false),
    ...scopedGraphMetadataRefs(metadata)])]);
}

// `project` maps each node as it is recorded (the unapplied-row search keeps only the projected
// node, not every row's copy of its document's metadata); edges and the snapshot check still read
// the full record.
export function resolveScopedContractGraph({ contracts, targetIndex, inputArtifacts = [], projectRoot, project = null } = {}) {
  const refs = createScopedReferenceResolver({ targetIndex, inputArtifacts, projectRoot, shareMetadata: true });
  const sources = createScopedSourceResolver({ targetIndex, inputArtifacts, projectRoot });
  const roots = workSet(contracts, canonicalRef, 'graph roots', true);
  const queue = [...roots];
  const scheduled = new Set(roots);
  const nodes = new Map();
  const edges = [];
  const files = new Map();
  // Each document is read and viewed once per resolution, however many of its rows are
  // selected (#275); every record is still checked against those bytes, and the re-read
  // below catches a later change.
  const documents = new Map(), serialized = new WeakMap();
  // Records of one document share its metadata object, so it is serialized once.
  const serial = (value) => {
    if (value === null || typeof value !== 'object') return scopeJson(value);
    if (!serialized.has(value)) serialized.set(value, scopeJson(value));
    return serialized.get(value);
  };
  function read(file, metadata, expectedBody) {
    if (!documents.has(file)) {
      const canonical = canonicalRepositoryPath(projectRoot, file, { required: true, type: 'file', label: 'scoped evidence' });
      const raw = readCurrentBytes(canonical.absolute, 'scoped evidence');
      const parsed = splitFrontmatter(decodeGitUtf8(raw, 'scoped evidence'));
      files.set(file, { file, sha256: hashBytes(raw) });
      documents.set(file, { parsed, metadata: parsed.hasFrontmatter && !parsed.parseError ? scopeJson(parsed.data) : null, view: null });
    }
    const document = documents.get(file), { parsed } = document;
    if (document.metadata === null || document.metadata !== serial(metadata) ||
        (expectedBody !== undefined && parsed.body !== expectedBody)) fail('evidence differs from its indexed snapshot');
    document.view ??= parseReconciliationReferenceView(parsed.body);
    return { body: parsed.body, view: document.view };
  }
  // Iterative finite ref index: cycles retain their edges without recursive
  // expansion, and repeated dependencies never select an arbitrary first record.
  for (let index = 0; index < queue.length; index += 1) {
    const ref = queue[index];
    const input = parseInputEvidenceRef(ref);
    let record;
    let document;
    if (input) {
      const evidence = sources.evidence(ref);
      const { input: data, anchor } = evidence;
      document = read(data.file, data.metadata);
      if (files.get(data.file).sha256 !== data.input_sha256) fail('input changed after anchor resolution');
      record = { ref, kind: 'input-evidence', input_id: data.input_id, file: data.file,
        metadata: data.metadata, selection: anchor };
    } else {
      record = refs.contract(ref);
      document = read(record.file, record.metadata, resolveArtifact(targetIndex, record.artifact_id).body);
    }
    nodes.set(ref, project ? project(record) : record);
    const selected = selectedNodes(document.view, record.selection, document.body);
    const dependenciesForRef = dependencies(document.body, document.view, selected,
      Boolean(input) && record.selection.bullet_index != null);
    const metadataRefs = scopedGraphMetadataRefs(record.metadata);
    for (const dependency of scopeSet([...new Set([...dependenciesForRef, ...metadataRefs])])) {
      edges.push({ from: ref, to: dependency });
      if (!scheduled.has(dependency)) { scheduled.add(dependency); queue.push(dependency); }
    }
  }
  // Re-read consumed paths so a late mutation cannot yield a mixed read set.
  for (const entry of files.values()) {
    const file = canonicalRepositoryPath(projectRoot, entry.file, { required: true, type: 'file', label: 'scoped evidence' });
    if (hashBytes(readCurrentBytes(file.absolute, 'scoped evidence')) !== entry.sha256) fail('evidence changed during graph resolution');
  }
  return { roots: scopeSet(roots), nodes: scopeSet([...nodes.values()]), edges: scopeSet(edges),
    read_set: scopeSet([...files.values()]) };
}

// Share the exact native selection with inverse uncertainty matching. Leaf spans
// avoid treating an input parent bullet as ownership of nested bullets. This is
// source selection only: it neither scans prose for meaning nor grants a path.
export function scopedGraphSelectionSpans(body, view, selection, input = false) {
  const spans = [];
  for (const selected of selectedNodes(view, selection, body)) walk(selected, (node) => {
    if (node.children?.length) return;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) fail('missing native source span');
    spans.push([start, end]);
  }, input && selection.bullet_index != null);
  return spans;
}

// The API resolver has already checked the canonical v2 table, endpoint and raw
// row correspondence. Traverse just that row's native cells, retaining document
// definitions for reference-style links. Do not select the whole API section.
export function scopedGraphApiRowDependencies(body, candidate) {
  const view = parseReconciliationReferenceView(body);
  const [row] = selectedNodes(view, { type: 'row', section: 'api-candidates',
    headers: candidate.headers, cells: candidate.cells }, body);
  const trackingIndex = candidate.headers.findIndex((header) => header.toLowerCase() === 'tracking');
  if (candidate.tracking && trackingIndex < 0) fail('canonical API Tracking column required');
  // Only deferred Unknown Tracking permits the API-local unknown:ID shorthand.
  // It was resolved to an exact canonical row by createScopedApiResolver().unit().
  // All other cells use the ordinary strict typed-reference scanner unchanged.
  const cells = row.children.filter((_, index) => !candidate.tracking || index !== trackingIndex);
  return scopeSet([...new Set([...dependencies(body, view, cells, false),
    ...(candidate.tracking ? [canonicalRef(candidate.tracking.ref)] : [])])]);
}
