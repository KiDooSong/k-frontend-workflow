// Recursive *selected evidence* graph, not the complete R1 owner/scope projection.
// No permit, approval, basis_digest, or caller-supplied resolver callbacks. The
// eventual basis builder must add every owner/unit/decision/host and project
// metadata explicitly; hashing this raw evidence graph is NOT scope-basis-v1.
import { splitFrontmatter } from './util.mjs';
import { splitRow } from './spec.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { readCurrentBytes, hashBytes, normalizeWorkOrigins } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { parseTargetRef } from './reconciliation-items.mjs';
import { parseInputEvidenceRef } from './provenance.mjs';
import { resolveArtifact } from './reconciliation-target-index.mjs';
import { parseReconciliationReferenceView, reconciliationReferenceLabel } from './reconciliation-markdown-ast.mjs';
import { createScopedReferenceResolver } from './scoped-work-refs.mjs';
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
  const ref = parseTargetRef(token);
  if (!ref || ['none', 'input'].includes(ref.kind)) fail(`unsupported or malformed typed reference: ${token}`);
  return ref.raw;
}
const rawNode = (body, node) => body.slice(node.position.start.offset, node.position.end.offset);
function walk(node, visit, omitNestedLists = false, root = true) {
  if (omitNestedLists && !root && node.type === 'list') return;
  if (visit(node) === false) return;
  for (const child of node.children || []) walk(child, visit, omitNestedLists, false);
}
function selectedNodes(view, selection, body) {
  if (selection.type === 'body' || selection.type === 'body-token') return view.tree.children;
  const sections = view.sections.filter((section) => section.slug === selection.section);
  if (sections.length !== 1) fail('selected section is missing or ambiguous');
  const nodes = sections[0].nodes;
  if (selection.type !== 'row' && selection.bullet_index == null) return nodes;
  if (selection.type === 'row') {
    const matches = nodes.filter((node) => node.type === 'table' &&
      scopeJson(splitRow(rawNode(body, node.children[0]))) === scopeJson(selection.headers))
      .flatMap((node) => node.children.slice(1))
      .filter((row) => scopeJson(splitRow(rawNode(body, row))) === scopeJson(selection.cells));
    if (matches.length !== 1) fail('selected raw row is missing or ambiguous in its native AST');
    return matches;
  }
  const bullets = [];
  for (const node of nodes) walk(node, (child) => { if (child.type === 'listItem') bullets.push(child); });
  const selected = bullets[selection.bullet_index - 1];
  if (!selected) fail('selected input bullet is missing');
  return [selected];
}

// Never scan rendered text: comments, entities and formatting cannot concatenate
// fragments into a new reference. Inline code containing a complete typed token
// is an explicit reference; fenced/indented code and HTML remain non-evidence.
function dependencies(body, view, nodes, omitNestedLists) {
  const found = new Set();
  const definitions = new Map();
  walk(view.tree, (node) => {
    if (node.type !== 'definition') return;
    const key = reconciliationReferenceLabel(node.label ?? node.identifier);
    if (!definitions.has(key)) definitions.set(key, []);
    definitions.get(key).push(node);
  });
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

export function resolveScopedContractGraph({ contracts, targetIndex, inputArtifacts = [], projectRoot } = {}) {
  const refs = createScopedReferenceResolver({ targetIndex, inputArtifacts, projectRoot });
  const sources = createScopedSourceResolver({ targetIndex, inputArtifacts, projectRoot });
  const roots = workSet(contracts, canonicalRef, 'graph roots', true);
  const queue = [...roots];
  const scheduled = new Set(roots);
  const nodes = new Map();
  const edges = [];
  const files = new Map();
  function read(file, metadata, expectedBody) {
    const canonical = canonicalRepositoryPath(projectRoot, file, { required: true, type: 'file', label: 'scoped evidence' });
    const raw = readCurrentBytes(canonical.absolute, 'scoped evidence');
    const sha256 = hashBytes(raw);
    const previous = files.get(file);
    if (previous && previous.sha256 !== sha256) fail('evidence changed during graph resolution');
    const parsed = splitFrontmatter(decodeGitUtf8(raw, 'scoped evidence'));
    if (!parsed.hasFrontmatter || parsed.parseError || scopeJson(parsed.data) !== scopeJson(metadata) ||
        (expectedBody !== undefined && parsed.body !== expectedBody)) fail('evidence differs from its indexed snapshot');
    files.set(file, { file, sha256 });
    return { body: parsed.body, view: parseReconciliationReferenceView(parsed.body) };
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
    nodes.set(ref, record);
    const selected = selectedNodes(document.view, record.selection, document.body);
    const dependenciesForRef = dependencies(document.body, document.view, selected,
      Boolean(input) && record.selection.bullet_index != null);
    // Only explicitly typed metadata references are graph edges here. Native
    // untyped decision IDs / ownership / unit declarations belong to the later
    // owner graph; binding approval_ref/basis_digest never seed this traversal.
    const metadataRefs = [];
    for (const key of ['depends_on', 'decision_refs']) {
      if (!Object.hasOwn(record.metadata, key)) continue;
      if (!Array.isArray(record.metadata[key])) fail(`${key}: array required`);
      for (const value of record.metadata[key]) {
        workText(value, key);
        if (prefix.test(value)) metadataRefs.push(canonicalRef(value));
      }
    }
    if (Object.hasOwn(record.metadata, 'sources')) {
      if (!Array.isArray(record.metadata.sources)) fail('sources: array required');
      for (const source of record.metadata.sources) {
        workText(source?.ref, 'source ref');
        if (prefix.test(source.ref)) metadataRefs.push(canonicalRef(source.ref));
      }
    }
    if (record.metadata.approval_source?.ref !== undefined) {
      const value = workText(record.metadata.approval_source.ref, 'approval source ref');
      if (prefix.test(value)) metadataRefs.push(canonicalRef(value));
    }
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
