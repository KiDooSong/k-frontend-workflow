// A scoped authoring view beside the raw reconciliation view. Keep the original
// tree and byte ranges: GENERATED headings do not end an authored section, and
// GENERATED tables cannot supply API/Unknown authoring evidence. The raw parser
// and its ordinary fully qualified reference contract remain unchanged.
import { parseReconciliationReferenceView, reconciliationHeadingText, slugifySectionTitle } from './reconciliation-markdown-ast.mjs';
import { specSectionName, stripGeneratedBlocks } from './spec.mjs';
import { ScopedWorkContractError } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';
import { createTextKeyedCache } from './util.mjs';

const views = createTextKeyedCache(32 * 1024 * 1024);
const source = (body, node) => body.slice(node.position.start.offset, node.position.end.offset);

export function scopedAuthoredView(body, raw = null) {
  const cached = views.get(body);
  // The raw parser has its own bounded cache. If its tree was evicted and
  // reparsed, rebuild our node/cell index against that exact current tree.
  if (cached && (!raw || cached.tree === raw.tree)) return cached;
  raw ??= parseReconciliationReferenceView(body);
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
  const view = { tree: raw.tree, sections, tableSections, byName };
  views.set(body, view);
  return view;
}

// Index authoring names once per body; many selected rows must not rescan every
// section. A name without a literal H2 has no home, even beside a formatted one;
// otherwise every retained H2 of its native slug is listed, in document order.
// Callers treat these shared structural lists as read-only.
export function scopedAuthoredSections(body, name, raw = null) {
  return scopedAuthoredView(body, raw).byName.get(name) || [];
}

// H3 is a section-only fallback, never a canonical table home. Keep its index
// separate from H2 so neither an H2's extent nor its ambiguity can change.
const subsectionViews = new WeakMap();
const canonicalHomes = new Set(['open-decisions', 'unknowns', 'conflicts', 'gaps', 'component-gap-register',
  'api-candidates', 'component-mapping', 'mapping-provenance']);
export function scopedAuthoredSubsections(body, slug, raw = null) {
  if (canonicalHomes.has(slug)) return [];
  const view = scopedAuthoredView(body, raw);
  if (!subsectionViews.has(view)) {
    const authored = stripGeneratedBlocks(body, { preserveOffsets: true });
    const bySlug = new Map();
    let current = null;
    const flush = (end) => {
      if (!current) return;
      current.text = body.slice(current.start, end);
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
          current = { title, slug: slugifySectionTitle(title), nodes: [],
            start: newline ? end + newline.index + newline[0].length : body.length };
        }
      } else if (current) current.nodes.push(node);
    }
    flush(body.length);
    subsectionViews.set(view, bySlug);
  }
  return subsectionViews.get(view).get(slug) || [];
}

// Context is not public selection/basis data. These sidecars bind a selection to
// its exact original nodes, including when identical raw/authored rows coexist.
// Explicit copy points preserve them through JSON projection/normalization.
const selections = new WeakMap();
export function rememberScopedSelection(selection, body, nodes) {
  selections.set(selection, { body, nodes });
  return selection;
}
export function scopedSelectionNodes(body, selection) {
  const context = selections.get(selection);
  if (!context) return null;
  if (context.body !== body) throw new ScopedWorkContractError('SW-REF-SNAPSHOT: selection body changed');
  return context.nodes;
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
