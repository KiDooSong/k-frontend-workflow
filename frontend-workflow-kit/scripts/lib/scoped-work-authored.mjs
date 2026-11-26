// A scoped authoring view beside the raw reconciliation view. Keep the original
// tree and byte ranges: GENERATED headings do not end an authored section, and
// GENERATED tables cannot supply API/Unknown authoring evidence. The raw parser
// and its ordinary fully qualified reference contract remain unchanged.
import { types } from 'node:util';
import { parseReconciliationReferenceView, reconciliationHeadingText, slugifySectionTitle,
  reconciliationTreeNodeCount, sharedReconciliationReferenceView, isSharedReconciliationReferenceView,
  reconciliationReferenceSectionHeading, isImmutableReconciliationNode, withReconciliationSyntax } from './reconciliation-markdown-ast.mjs';
import { hasHeader, specSectionName, stripGeneratedBlocks } from './spec.mjs';
import { ScopedWorkContractError } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';
import { createSyntaxCache } from './syntax-cache.mjs';

// This cache also owns the raw tree through the authored view, so it must obey
// the same structural budgets even after the parser has evicted that tree.
const views = createSyntaxCache();
// Mutable raw views can replace table membership without replacing their
// sections array. Remember only the inputs copied into an authored home, not
// its caller-editable derived arrays. Table objects remain shared: edits inside
// one already flow through both views without invalidating public authored edits.
const viewRawStructure = new WeakMap();
const absent = Symbol('non-data-field');
const data = (value, key) => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : absent;
};
const plain = (value) => value !== null && typeof value === 'object' && !types.isProxy(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
// Indexed snapshots certify only ordinary traversal. Never run a caller's
// iterator/getter to probe eligibility; its actual authored build still runs it.
// As with graph spans, a changed/inherited iterator.next also forbids reuse.
const functionSource = Function.prototype.toString;
const nativeMethod = (value, name) => typeof value === 'function' && !types.isProxy(value) &&
  Reflect.apply(functionSource, value, []) === `function ${name}() { [native code] }`;
const arrayValues = data(Array.prototype, 'values'), arrayForEach = data(Array.prototype, 'forEach');
const arrayMap = data(Array.prototype, 'map'), arraySlice = data(Array.prototype, 'slice');
const iteratorPrototype = (() => {
  if (!nativeMethod(arrayValues, 'values')) return null;
  try { return Object.getPrototypeOf(Reflect.apply(arrayValues, [], [])); }
  catch { return null; }
})();
let iteratorNext = null;
function ordinaryTraversal() {
  if (!iteratorPrototype || data(Array.prototype, Symbol.iterator) !== arrayValues ||
      !nativeMethod(arrayForEach, 'forEach') || data(Array.prototype, 'forEach') !== arrayForEach ||
      !nativeMethod(arrayMap, 'map') || data(Array.prototype, 'map') !== arrayMap ||
      !nativeMethod(arraySlice, 'slice') || data(Array.prototype, 'slice') !== arraySlice) return false;
  const next = data(iteratorPrototype, 'next');
  if (iteratorNext === null && nativeMethod(next, 'next')) iteratorNext = next;
  return iteratorNext !== null && next === iteratorNext;
}
const ordinaryArray = (value) => !types.isProxy(value) && Array.isArray(value) &&
  Object.getPrototypeOf(value) === Array.prototype &&
  ![Symbol.iterator, 'forEach', 'map', 'slice', 'constructor'].some((key) => Object.hasOwn(value, key));
function copySequence(values) {
  if (!ordinaryArray(values)) return null;
  const copy = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = data(values, index);
    if (value === absent) return null;
    copy.push(value);
  }
  return copy;
}
const optionalData = (value, key) => {
  const result = data(value, key);
  return result === absent && !(key in value) ? undefined : result;
};
// Snapshot only syntax actually consumed by the authored builder. Descriptor
// reads never invoke custom getters/traps; such inputs are interpreted afresh.
// Native immutable subtrees need no walk. Plain mutable copies retain public
// edits when these values match, including shared descendants visited once.
function rawSyntaxSnapshot(tree, entries) {
  const snapshot = [], pending = [tree], seen = new Set();
  for (const entry of entries) {
    for (const node of entry.nodes) pending.push(node);
    for (const node of entry.tableNodes) pending.push(node);
    if (entry.heading) pending.push(entry.heading);
  }
  const point = (value) => {
    snapshot.push(value);
    if (value === undefined || value === null) return true;
    if (!plain(value)) return false;
    const offset = optionalData(value, 'offset');
    if (offset === absent || (offset !== undefined && typeof offset !== 'number')) return false;
    snapshot.push(offset);
    return true;
  };
  while (pending.length) {
    const node = pending.pop();
    if (isImmutableReconciliationNode(node)) continue;
    if (!plain(node)) return null;
    if (seen.has(node)) continue;
    seen.add(node); snapshot.push(node);
    for (const key of ['type', 'depth', 'value', 'alt']) {
      const value = optionalData(node, key);
      if (value === absent || (value !== null && ['object', 'function'].includes(typeof value))) return null;
      snapshot.push(value);
    }
    const position = optionalData(node, 'position');
    snapshot.push(position);
    if (position === absent) return null;
    if (position !== undefined && position !== null) {
      if (!plain(position) || !point(optionalData(position, 'start')) || !point(optionalData(position, 'end'))) return null;
    }
    const children = optionalData(node, 'children');
    snapshot.push(children);
    if (children === absent) return null;
    if (children === undefined || children === null) continue;
    const members = copySequence(children);
    if (!members) return null;
    snapshot.push(members.length);
    for (const child of members) { snapshot.push(child); pending.push(child); }
  }
  return snapshot;
}
function rawStructure(raw) {
  if (!plain(raw) || !ordinaryTraversal()) return null;
  const tree = data(raw, 'tree'), sections = data(raw, 'sections');
  if (tree === absent || !ordinaryArray(sections)) return null;
  const entries = [];
  for (let index = 0; index < sections.length; index += 1) {
    const section = data(sections, index);
    if (!plain(section)) return null;
    const title = data(section, 'title'), slug = data(section, 'slug'), text = data(section, 'text');
    if (text === absent && 'text' in section) return null;
    const rawNodes = data(section, 'nodes'), nodes = copySequence(rawNodes);
    const heading = reconciliationReferenceSectionHeading(rawNodes);
    const tableNodes = copySequence(data(section, 'tableNodes')), tables = copySequence(data(section, 'tables'));
    if (title === absent || slug === absent || !nodes || !tableNodes || !tables) return null;
    entries.push({ section, title, slug, text, heading, nodes, tableNodes, tables });
  }
  const syntax = rawSyntaxSnapshot(tree, entries);
  return syntax === null ? null : { tree, sections, entries, syntax };
}
const sameSequence = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);
function rawStructureMatches(view, raw) {
  const prior = viewRawStructure.get(view);
  if (!prior) return false;
  const current = rawStructure(raw);
  return current !== null && prior.tree === current.tree && prior.sections === current.sections &&
    sameSequence(prior.syntax, current.syntax) &&
    prior.entries.length === current.entries.length && prior.entries.every((saved, index) => {
    const section = current.entries[index];
    return saved.section === section.section && saved.title === section.title && saved.slug === section.slug &&
      saved.text === section.text && saved.heading === section.heading &&
      sameSequence(saved.nodes, section.nodes) && sameSequence(saved.tableNodes, section.tableNodes) && sameSequence(saved.tables, section.tables);
  });
}
// Public authored views remain mutable and may be prewarmed by callers. Keep
// canonical interpretation beside the immutable raw tree, never in that cache.
// Weak keys give this derived view no lifetime beyond existing tree owners.
const canonicalViews = new WeakMap(), classifiedTrees = new WeakSet();
// These weak row facts retain no tree/view or table-sized range array. Physical
// selections may outlive an oversized document's active syntax batch.
const unknownRows = new WeakMap();
const source = (body, node) => body.slice(node.position.start.offset, node.position.end.offset);
let activeDocument = null;

// The active document owns raw and authored views only while its synchronous
// row batch runs. Other dependency documents still use the bounded caches.
// Raw syntax and canonical row facts come from internal parsing; legacy
// authoring prewarms do not replace file validation.
export function withScopedDocumentSyntax(body, run) {
  return withReconciliationSyntax(body, () => {
    const raw = sharedReconciliationReferenceView(body);
    const view = scopedAuthoredView(body, raw), previous = activeDocument;
    // A trusted build already recorded immutable row facts before exposing its
    // mutable view. A custom prewarm needs a separate canonical interpretation.
    if (!classifiedTrees.has(raw.tree)) canonicalAuthoredView(body, raw);
    activeDocument = { body, raw, view, previous };
    try {
      return run(raw);
    } finally {
      activeDocument = previous;
    }
  });
}

// Internal evaluation pins canonical syntax without constructing, replacing or
// repairing a caller's public authored view. The legacy scope above continues
// to pin public mutable interpretations for explicit public-parser consumers.
export function withCanonicalScopedDocumentSyntax(body, run) {
  return withReconciliationSyntax(body, () => {
    const raw = sharedReconciliationReferenceView(body);
    canonicalAuthoredView(body, raw);
    return run(raw);
  });
}

export function scopedAuthoredCacheStats() {
  return views.stats();
}

export function scopedAuthoredView(body, raw = null) {
  return authoredView(body, raw);
}

function authoredView(body, raw) {
  const canonical = raw === null || isSharedReconciliationReferenceView(body, raw);
  for (let active = activeDocument; active; active = active.previous) {
    // Resolvers may wrap the shared view, retaining the exact frozen sections.
    // A detached/custom raw wrapper must still build its own derived contents,
    // even when its native tree happens to be the active tree.
    if (active.body === body && (!raw || (canonical && raw.tree === active.raw.tree && raw.sections === active.raw.sections))) {
      return active.view;
    }
  }
  const cached = views.get(body);
  // The raw parser has its own bounded cache. If its tree was evicted and
  // reparsed, rebuild our node/cell index against that exact current tree.
  if (cached && (!raw || (canonical ? cached.tree === raw.tree : rawStructureMatches(cached, raw)))) return cached;
  raw ??= parseReconciliationReferenceView(body);
  const view = buildAuthoredView(body, raw, canonical);
  if (!canonical) viewRawStructure.set(view, rawStructure(raw));
  views.set(body, view, { nodes: reconciliationTreeNodeCount(view.tree) });
  return view;
}

function canonicalAuthoredView(body, raw = null) {
  raw ??= sharedReconciliationReferenceView(body);
  if (!canonicalViews.has(raw.tree)) {
    const view = buildAuthoredView(body, raw, true);
    for (const section of view.sections) {
      for (const field of ['nodes', 'tableNodes', 'tables', 'bulletNodes']) Object.freeze(section[field]);
      Object.freeze(section);
    }
    for (const sections of view.byName.values()) Object.freeze(sections);
    Object.freeze(view.sections);
    Object.freeze(view.tableSections); Object.freeze(view.byName);
    canonicalViews.set(raw.tree, Object.freeze(view));
  }
  return canonicalViews.get(raw.tree);
}

function buildAuthoredView(body, raw, canonical) {
  const authored = stripGeneratedBlocks(body, { preserveOffsets: true });
  const retained = (node) => source(authored, node) === source(body, node);
  const literalSections = [], last = new Map();
  let offset = 0;
  for (const line of authored.split(/\r?\n/)) {
    const name = specSectionName(line);
    if (name !== null) {
      const section = { name, start: offset };
      literalSections.push(section); last.set(name, section);
    }
    offset += line.length + (authored.startsWith('\r\n', offset + line.length) ? 2 : 1);
  }
  if (!canonical) return mutableAuthoredView(body, raw, retained, literalSections, last);
  // Reuse the raw parser's column-zero / explicit-block-boundary table decisions.
  const nativeTables = new Map();
  for (const section of raw.sections) section.tableNodes.forEach((node, i) => nativeTables.set(node, section.tables[i]));
  const sections = [], tableSections = new Map();
  let current = { title: '', slug: '', name: null, nodes: [], tableNodes: [], tables: [], bulletNodes: [], start: 0 };
  let headingIndex = 0, literalIndex = -1;
  const flush = (end) => {
    current.text = body.slice(current.start, end);
    sections.push(current);
  };
  const bullets = (node) => {
    if (node.type === 'listItem') current.bulletNodes.push(node);
    for (const child of node.children || []) bullets(child);
  };
  for (const node of raw.tree.children) {
    while (literalSections[literalIndex + 1]?.start <= node.position.start.offset) literalIndex += 1;
    if (node.type === 'heading' && node.depth === 2) {
      const original = raw.sections[++headingIndex];
      if (retained(node)) {
        flush(node.position.start.offset);
        const end = node.position.end.offset;
        const newline = /\r\n?|\n/.exec(body.slice(end));
        current = { title: original.title, slug: original.slug, name: specSectionName(source(body, node)),
          nodes: [], tableNodes: [], tables: [], bulletNodes: [],
          start: newline ? end + newline.index + newline[0].length : body.length };
        continue;
      }
    }
    current.nodes.push(node);
    bullets(node);
    const literal = literalSections[literalIndex];
    if (nativeTables.has(node) && retained(node) && current.name !== null &&
        current.name === literal?.name && last.get(current.name) === literal) {
      current.tableNodes.push(node); current.tables.push(nativeTables.get(node));
      tableSections.set(node, current.name);
      for (const row of node.children.slice(1)) tableSections.set(row, current.name);
    }
  }
  flush(body.length);
  const byName = authoredSectionIndex(sections);
  const view = { tree: raw.tree, sections, tableSections, byName };
  if (canonical) {
    const authoredTables = new Set((byName.get('unknowns') || []).flatMap((home) => home.tableNodes.filter((_, index) =>
      ['ID', 'Question'].every((header) => hasHeader(home.tables[index].headers, header)))));
    for (const table of nativeTables.keys()) for (const row of table.children) {
      unknownRows.set(row, { body, start: row.position.start.offset, end: row.position.end.offset,
        authored: authoredTables.has(table) });
    }
    classifiedTrees.add(raw.tree);
  }
  return view;
}

// A custom raw list is the current interpretation, not an array of slots for
// the original H2 ordinal. Native nodes locate each entry's physical home;
// source headings only determine GENERATED and literal-table boundaries.
function mutableAuthoredView(body, raw, retained, literalSections, last) {
  const tree = raw.tree, physical = [], nativeHomes = new Map(), physicalHomes = new Map(), literals = new Map();
  const position = (node) => `${node.type}:${node.position.start.offset}:${node.position.end.offset}`;
  let current = { title: '', slug: '', name: null, start: 0, end: body.length,
    rawEnd: body.length, nodePositions: [], preamble: true };
  current.owner = current; physical.push(current);
  let owner = current, literalIndex = -1;
  for (const node of tree.children) {
    while (literalSections[literalIndex + 1]?.start <= node.position.start.offset) literalIndex += 1;
    literals.set(position(node), literalSections[literalIndex]);
    if (node.type === 'heading' && node.depth === 2) {
      current.rawEnd = node.position.start.offset;
      const title = reconciliationHeadingText(node), generated = !retained(node);
      const end = node.position.end.offset, newline = /\r\n?|\n/.exec(body.slice(end));
      current = { title, slug: slugifySectionTitle(title), name: specSectionName(source(body, node)),
        start: newline ? end + newline.index + newline[0].length : body.length,
        end: body.length, rawEnd: body.length, nodePositions: [], heading: node, generated };
      if (!generated) { owner.end = node.position.start.offset; owner = current; }
      current.owner = owner; physical.push(current);
    } else current.nodePositions.push(position(node));
    nativeHomes.set(node, current);
    physicalHomes.set(position(node), current);
  }
  // Empty clones have no native nodes to identify a source. Index the exact
  // title/slug/text once and share each candidate set, including constant-time
  // membership when validating a complete clone. Repeated empty H2s must not
  // allocate or scan the same N-candidate list for each of their N entries.
  const emptySources = new Map(), physicalTitles = new Set(), physicalSlugs = new Set();
  for (const home of physical) {
    physicalTitles.add(home.title); physicalSlugs.add(home.slug);
    if (home.nodePositions.length) continue;
    if (!emptySources.has(home.title)) emptySources.set(home.title, new Map());
    const bySlug = emptySources.get(home.title);
    if (!bySlug.has(home.slug)) bySlug.set(home.slug, new Map());
    const byText = bySlug.get(home.slug), text = body.slice(home.start, home.rawEnd);
    if (!byText.has(text)) byText.set(text, new Set());
    byText.get(text).add(home);
  }
  const entries = [], generated = new Map();
  for (const section of raw.sections) {
    const title = section.title, slug = section.slug, rawNodes = section.nodes, nodes = [...rawNodes];
    const heading = reconciliationReferenceSectionHeading(rawNodes);
    let original = heading === null ? physical[0] : heading === undefined ? null
      : nativeHomes.get(heading) || physicalHomes.get(position(heading));
    // Replacement arrays with native/copied nodes still locate their source.
    // An added empty custom home has no physical heading to infer from a label.
    if (!original) for (const node of nodes) {
      original = nativeHomes.get(node) || physicalHomes.get(position(node));
      if (original) break;
    }
    // A deep copy loses the weak heading identity. Its raw text can still
    // identify an empty source; labels alone cannot distinguish literal from
    // formatted headings that have identical public title/slug/node values.
    const text = original ? undefined : section.text;
    const candidates = original || typeof text !== 'string' ? null : emptySources.get(title)?.get(slug)?.get(text);
    if (candidates?.size === 1) original = candidates.values().next().value;
    const tables = new Map();
    // Preserve actual custom forEach semantics, and do not read tables when
    // no node consumes it (an unused accessor/revoked proxy is not evidence).
    section.tableNodes.forEach((node, index) => tables.set(node, section.tables[index]));
    const entry = { title, slug, text, nodes, tables, original, candidates };
    entries.push(entry);
  }
  // An intact full clone can restore the original ordering after every entry
  // has been checked against the source. A partial ambiguous list cannot use
  // the original AST's ordinal as a substitute for its missing source identity.
  const complete = entries.length === physical.length && entries.every((entry, index) => {
    const home = physical[index];
    return entry.title === home.title && entry.slug === home.slug &&
      (entry.original === home || entry.candidates?.has(home)) &&
      sameSequence(entry.nodes.map(position), home.nodePositions);
  });
  for (const [index, entry] of entries.entries()) {
    if (!entry.original) {
      // A new empty label is a custom home even when it carries the parser's
      // normal empty text field. Existing source labels still need evidence
      // that distinguishes literal, formatted and duplicate native headings.
      const addedEmpty = entry.text === '' && entry.nodes.length === 0 && entry.tables.size === 0 &&
        !physicalTitles.has(entry.title) && !physicalSlugs.has(entry.slug);
      if (complete) entry.original = physical[index];
      else if (typeof entry.text === 'string' && !addedEmpty) {
        throw new ScopedWorkContractError('SW-REF-SNAPSHOT: empty custom section requires unambiguous native source context');
      } else entry.original = { name: specSectionName(`## ${entry.title}`), start: body.length, end: body.length };
    }
    const original = entry.original;
    if (original.generated) {
      if (!generated.has(original.owner)) generated.set(original.owner, []);
      generated.get(original.owner).push(entry);
    }
  }
  const tableSections = new Map();
  const authored = (entry) => {
    const home = entry.original, nodes = [...entry.nodes], tables = new Map(entry.tables);
    for (const extra of generated.get(home) || []) {
      nodes.push(extra.original.heading, ...extra.nodes);
      for (const [node, table] of extra.tables) tables.set(node, table);
    }
    nodes.sort((left, right) => left.position.start.offset - right.position.start.offset);
    const out = { title: entry.title, slug: entry.slug, name: home.name, nodes,
      tableNodes: [], tables: [], bulletNodes: [], start: home.start, text: body.slice(home.start, home.end) };
    const bullets = (node) => {
      if (node.type === 'listItem') out.bulletNodes.push(node);
      for (const child of node.children || []) bullets(child);
    };
    for (const node of nodes) {
      bullets(node);
      const literal = literals.get(position(node));
      if (tables.has(node) && retained(node) && home.name !== null &&
          home.name === literal?.name && last.get(home.name) === literal) {
        out.tableNodes.push(node); out.tables.push(tables.get(node));
        tableSections.set(node, home.name);
        for (const row of node.children.slice(1)) tableSections.set(row, home.name);
      }
    }
    return out;
  };
  // The preamble remains the reserved first entry, even when callers omit it
  // or move it within their current list. Named sections follow that list.
  const preamble = entries.find((entry) => entry.original.preamble);
  const sections = [preamble ? authored(preamble) : { title: '', slug: '', name: null, nodes: [],
    tableNodes: [], tables: [], bulletNodes: [], start: 0, text: '' }];
  for (const entry of entries) if (!entry.original.preamble && !entry.original.generated) sections.push(authored(entry));
  return { tree, sections, tableSections, byName: authoredSectionIndex(sections) };
}

function authoredSectionIndex(sections) {
  // A literal authoring name owns its tables, but any other retained native H2
  // with the same slug (`## **Unknowns**`, a setext heading) is a real second
  // home (#285). List those beside it so every caller's uniqueness check still
  // rejects it; GENERATED headings never reach this list. sections[0] is the
  // preamble, not an H2.
  const named = new Map(), bySlug = new Map();
  const group = (index, key, section) => {
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(section);
  };
  for (const section of sections.slice(1)) {
    group(named, section.name, section); group(bySlug, section.slug, section);
  }
  const byName = new Map();
  for (const [name, list] of named) {
    const slugs = [...new Set(list.map((section) => section.slug))];
    byName.set(name, slugs.length === 1 ? bySlug.get(slugs[0])
      : slugs.flatMap((slug) => bySlug.get(slug)).sort((a, b) => a.start - b.start));
  }
  return byName;
}

// Index authoring names once per body; many selected rows must not rescan every
// section. A name without a literal H2 has no home, even beside a formatted one;
// otherwise every retained H2 of its native slug is listed, in document order.
// Callers treat these shared structural lists as read-only.
export function scopedAuthoredSections(body, name, raw = null) {
  return scopedAuthoredView(body, raw).byName.get(name) || [];
}

// Internal evaluators share immutable physical sections/indexes per native
// tree. Do not consult or replace the public mutable authored cache. Explicit
// custom raw interpretations keep their existing public path.
export function sharedScopedAuthoredSections(body, name, raw = null) {
  if (raw !== null && !isSharedReconciliationReferenceView(body, raw)) return scopedAuthoredSections(body, name, raw);
  return canonicalAuthoredView(body, raw).byName.get(name) || [];
}

// Expose the immutable ordered homes needed by internal uniqueness/fallback
// checks without exposing the canonical view's private Map containers.
export function sharedScopedAuthoredOccurrences(body, raw = null) {
  if (raw !== null && !isSharedReconciliationReferenceView(body, raw)) return scopedAuthoredView(body, raw).sections;
  return canonicalAuthoredView(body, raw).sections;
}

// H3 is a section-only fallback, never a canonical table home. Keep its index
// separate from H2 so neither an H2's extent nor its ambiguity can change.
const subsectionViews = new WeakMap();
const canonicalHomes = new Set(['open-decisions', 'unknowns', 'conflicts', 'gaps', 'component-gap-register',
  'api-candidates', 'component-mapping', 'mapping-provenance']);
export function scopedAuthoredSubsections(body, slug, raw = null) {
  if (canonicalHomes.has(slug)) return [];
  return authoredSubsections(body, slug, scopedAuthoredView(body, raw), false);
}

export function sharedScopedAuthoredSubsections(body, slug, raw = null) {
  if (raw !== null && !isSharedReconciliationReferenceView(body, raw)) return scopedAuthoredSubsections(body, slug, raw);
  if (canonicalHomes.has(slug)) return [];
  return authoredSubsections(body, slug, canonicalAuthoredView(body, raw), true);
}

function authoredSubsections(body, slug, view, canonical) {
  if (!subsectionViews.has(view)) {
    const authored = stripGeneratedBlocks(body, { preserveOffsets: true });
    const bySlug = new Map();
    let current = null;
    const flush = (end) => {
      if (!current) return;
      current.text = body.slice(current.start, end);
      if (canonical) { Object.freeze(current.nodes); Object.freeze(current); }
      if (!bySlug.has(current.slug)) bySlug.set(current.slug, []);
      bySlug.get(current.slug).push(current);
    };
    for (const node of view.tree.children) {
      if (node.type === 'heading' && node.depth <= 3 && source(authored, node) === source(body, node)) {
        flush(node.position.start.offset);
        current = null;
        if (node.depth === 3) {
          const title = reconciliationHeadingText(node), end = node.position.end.offset;
          const newline = /\r\n?|\n/.exec(body.slice(end));
          current = { title, slug: slugifySectionTitle(title), depth: 3, nodes: [],
            start: newline ? end + newline.index + newline[0].length : body.length };
        }
      } else if (current) current.nodes.push(node);
    }
    flush(body.length);
    if (canonical) for (const sections of bySlug.values()) Object.freeze(sections);
    subsectionViews.set(view, bySlug);
  }
  return subsectionViews.get(view).get(slug) || [];
}

// Context is not public selection/basis data. These sidecars bind a selection to
// its exact original nodes, including when identical raw/authored rows coexist.
// Explicit copy points preserve them through JSON projection/normalization.
const selections = new WeakMap();
export function rememberScopedSelection(selection, body, nodes, { subsection = false } = {}) {
  selections.set(selection, { body, nodes, subsection });
  return selection;
}
export function scopedSelectionNodes(body, selection) {
  const context = selections.get(selection);
  if (!context) return null;
  if (context.body !== body) throw new ScopedWorkContractError('SW-REF-SNAPSHOT: selection body changed');
  return context.nodes;
}

// A relation evaluation can share canonical nodes for an equal physical source
// selected by separate parser generations. Keep each context's own node-array
// wrapper and subsection mode; replacing one returned wrapper cannot replace
// another selection's physical source. The proved body value is shared too.
export function reuseScopedSelectionNodes(body, selection, nodes) {
  const context = selections.get(selection);
  if (!context || context.body !== body) throw new ScopedWorkContractError('SW-REF-SNAPSHOT: selection body changed');
  selections.set(selection, { ...context, body, nodes: [...nodes] });
  return selection;
}

// Preserve the exact physical row through copied projections. Explicit raw
// views keep their own interpretation and cannot replace canonical row facts.
export function scopedSelectionUnknownAuthored(body, selection, raw = null) {
  const nodes = scopedSelectionNodes(body, selection);
  if (selection.type !== 'row' || nodes?.length !== 1) return false;
  const [row] = nodes, start = row.position.start.offset, end = row.position.end.offset;
  // Internal selected-row processing already owns a shared immutable raw view.
  // Treat that proven view like the default canonical lookup; a mutable public
  // authored prewarm must not decide the answer until its AST is evicted.
  const canonical = raw === null || isSharedReconciliationReferenceView(body, raw);
  const known = canonical ? unknownRows.get(row) : null;
  if (known && known.body === body && known.start === start && known.end === end) return known.authored;
  const homes = canonical ? canonicalAuthoredView(body, raw).byName.get('unknowns') || []
    : scopedAuthoredSections(body, 'unknowns', raw);
  const authored = homes.some((home) => home.tableNodes.some((table, index) =>
    ['ID', 'Question'].every((header) => hasHeader(home.tables[index].headers, header)) &&
    table.position.start.offset <= start && end <= table.position.end.offset));
  if (canonical) unknownRows.set(row, { body, start, end, authored });
  return authored;
}

// Physical table rows, not rendered cells or an H3's slug, establish containment
// in a canonical H2 home. Offsets also survive eviction/reparsing of the tree.
export function scopedSelectionRowSpans(selection, { body = null, subsectionOnly = false } = {}) {
  let context = selections.get(selection);
  if (!context && body !== null && subsectionOnly && selection?.type === 'section') {
    const raw = sharedReconciliationReferenceView(body);
    // A copied H2 keeps its existing coverage contract, even beside an H3.
    if (raw.sections.some((section) => section.slug === selection.section)) return null;
    const homes = sharedScopedAuthoredSubsections(body, selection.section, raw);
    if (homes.length !== 1 || selection.content !== homes[0].text.replace(/\r\n|\r/g, '\n')) {
      throw new ScopedWorkContractError('SW-REF-SNAPSHOT: subsection differs from its native source');
    }
    rememberScopedSelection(selection, body, homes[0].nodes, { subsection: true });
    context = selections.get(selection);
  }
  if (!context || (subsectionOnly && !context.subsection)) return null;
  if (body !== null && context.body !== body) throw new ScopedWorkContractError('SW-REF-SNAPSHOT: row coverage body changed');
  if (!context.rowSpans) {
    const spans = [];
    const visit = (node) => {
      if (node.type === 'tableRow') spans.push(`${node.position.start.offset}:${node.position.end.offset}`);
      for (const child of node.children || []) visit(child);
    };
    context.nodes.forEach(visit);
    context.rowSpans = spans;
  }
  return { body: context.body, spans: context.rowSpans };
}
export function copyScopedSelectionContext(from, to) {
  const context = selections.get(from);
  if (context) selections.set(to, context);
  return to;
}

// scopeSet intentionally JSON-clones values; carry only the sidecar associated
// with each already-unique ref, without adding a field to serialized evidence.
export function copyScopedNodeContexts(from, to) {
  const byRef = new Map(from.map((node) => [node.ref, node]));
  for (const node of to) {
    const original = byRef.get(node.ref);
    if (original?.selection && node.selection) copyScopedSelectionContext(original.selection, node.selection);
  }
  return to;
}

// Source results contain selections below groups/effects as well as at a node's
// top level. Preserve their private source identity when an entire result is
// normalized; nested array order is unchanged by scopeSet.
export function scopedEvidenceSet(values, label) {
  const originals = new Map(values.map((value) => [scopeJson(value), value]));
  const copy = (from, to) => {
    if (!from || typeof from !== 'object' || !to || typeof to !== 'object') return;
    copyScopedSelectionContext(from, to);
    for (const key of Object.keys(to)) copy(from[key], to[key]);
  };
  const normalized = scopeSet(values, label);
  for (const value of normalized) copy(originals.get(scopeJson(value)), value);
  return normalized;
}
