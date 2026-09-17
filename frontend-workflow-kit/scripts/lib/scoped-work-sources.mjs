// D source/effect resolution on one immutable snapshot, not coverage or authority.
// Keep raw-input hashing separate from the future human-owned R1 scope digest.
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { validateInputArtifacts } from './input-artifact.mjs';
import { buildInputArtifactIndex, resolveInputArtifact, resolveInputEvidence } from './provenance.mjs';
import { parseReconciliationMarkdown, describeHeaderMismatch } from './reconciliation-markdown-ast.mjs';
import { parseReconciliationRegister, REQUIRED_REGISTER_COLS, RECONCILE_STATUS_VALUES } from './reconciliation-register.mjs';
import { parseRegisterContract, parseReconciliationItems, validateReconciliationV2,
  REQUIRED_ITEM_COLS, isReconciliationItemId, parseTargetRef } from './reconciliation-items.mjs';
import { readCurrentBytes, canonicalJson, hashBytes, normalizeWorkOrigins } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { ScopedWorkContractError, workObject, workSet, workPath } from './scoped-work-request.mjs';
import { createScopedReferenceResolver, scopedRawTable } from './scoped-work-refs.mjs';

const fail = (code, message) => { throw new ScopedWorkContractError(`${code}: ${message}`); };
const lf = (text) => text.replace(/\r\n|\r/g, '\n');
const itemFields = ['inputId', 'item', 'basis', 'classification', 'effect', 'target', 'evidence', 'sourceRef', 'sourceUnit', 'capturedAt'];
const summaryFields = ['inputId', 'source', 'classification', 'reconcileStatus', 'result', 'touched', 'created', 'supersedes'];
const rowObjects = (table, fields) => table.cells.map((cells) => Object.fromEntries(fields.map((field, i) => [field, cells[i]])));

export function createScopedSourceResolver({ inputArtifacts, registerFile, targetIndex, projectRoot } = {}) {
  const refs = createScopedReferenceResolver({ targetIndex, projectRoot });
  if (!Array.isArray(inputArtifacts)) fail('SW-SOURCE-INDEX', 'canonical input artifacts required');
  // Own caches, never mutate the collector's records or its caller's declarations.
  const inputs = inputArtifacts.map((entry) => ({ ...entry, fm: structuredClone(entry.fm), body: undefined }));
  const index = buildInputArtifactIndex(inputs);
  const validation = validateInputArtifacts(inputs);
  const loaded = new Map();
  let reconciliation;

  function relativeFile(file) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || path.resolve(file) !== file) {
      fail('SW-SOURCE-PATH', 'canonical absolute snapshot path required');
    }
    return workPath(path.relative(projectRoot, file).split(path.sep).join('/'), 'scoped source path');
  }
  function input(id) {
    if (loaded.has(id)) return loaded.get(id);
    const resolution = resolveInputArtifact(index, id);
    if (resolution.status !== 'ok') fail('SW-SOURCE-INPUT', `${id}: ${resolution.status}`);
    const artifact = resolution.artifact;
    const file = relativeFile(artifact.file);
    const errors = validation.errors.filter((entry) => entry.file === artifact.file);
    if (artifact.parseError || errors.length) fail('SW-SOURCE-INPUT', `${id}: ${artifact.parseError || errors.map((e) => e.message).join('; ')}`);
    const raw = readCurrentBytes(artifact.file, 'scoped input');
    const parsed = splitFrontmatter(decodeGitUtf8(raw, 'scoped input'));
    if (!parsed.hasFrontmatter || parsed.parseError || canonicalJson(parsed.data) !== canonicalJson(artifact.fm)) {
      fail('SW-SOURCE-SNAPSHOT', `${id}: input metadata differs from the indexed snapshot`);
    }
    artifact.body = parsed.body;
    const result = { artifact, markdown: parseReconciliationMarkdown(parsed.body),
      data: { input_id: id, file, input_sha256: hashBytes(raw), metadata: structuredClone(artifact.fm) } };
    loaded.set(id, result);
    return result;
  }
  function anchor(token, inputId) {
    const normalized = normalizeWorkOrigins([{ input_id: inputId, source_refs: [token] }])[0].source_refs[0];
    const source = input(inputId);
    const resolved = resolveInputEvidence(index, normalized);
    if (resolved.status !== 'ok') fail('SW-SOURCE-ANCHOR', `${normalized}: ${resolved.status}`);
    const sections = source.markdown.occurrences.filter((entry) => entry.slug === resolved.ref.section);
    // The legacy helper concatenates duplicate H2s. D needs a unique selected
    // section; leave the legacy warning contract unchanged.
    if (sections.length !== 1) fail('SW-SOURCE-ANCHOR', `${normalized}: ambiguous section`);
    const content = resolved.ref.bulletIndex === null ? lf(sections[0].text) : resolved.evidenceText;
    if (typeof content !== 'string' || !content.trim()) fail('SW-SOURCE-ANCHOR', `${normalized}: empty selected evidence`);
    return { ref: normalized, section: resolved.ref.section, bullet_index: resolved.ref.bulletIndex, content };
  }
  function register() {
    if (reconciliation) return reconciliation;
    const file = relativeFile(registerFile);
    const record = parseReconciliationRegister(registerFile);
    if (!record.exists || record.fmParseError || record.fmStructuralError || parseRegisterContract(record.fm).version !== 2) {
      fail('SW-SOURCE-REGISTER', 'valid Reconciliation Contract v2 required');
    }
    const result = validateReconciliationV2({ register: record, registerFile, inputArtifacts: inputs, targetIndex });
    if (result.errors.length) fail('SW-SOURCE-REGISTER', result.errors.map((entry) => entry.message).join('; '));
    const markdown = parseReconciliationMarkdown(record.body);
    const itemSections = markdown.occurrences.filter((entry) => entry.slug === 'reconciliation-items');
    if (itemSections.length !== 1 || itemSections[0].tables.length !== 1) fail('SW-SOURCE-REGISTER', 'unique Items table required');
    const itemsTable = scopedRawTable(itemSections[0].tables[0]);
    const summaries = markdown.occurrences.flatMap((entry) => entry.tables)
      .filter((table) => describeHeaderMismatch(table, REQUIRED_REGISTER_COLS) === null);
    if (describeHeaderMismatch(itemsTable, REQUIRED_ITEM_COLS) || summaries.length !== 1) {
      fail('SW-SOURCE-REGISTER', 'canonical Items/Summary headers required');
    }
    const summaryTable = scopedRawTable(summaries[0]);
    const items = rowObjects(itemsTable, itemFields);
    const rows = rowObjects(summaryTable, summaryFields);
    // Raw cells and the existing v2 projection must agree. Markdown wrappers or
    // comments cannot turn an invalid source token into a valid ID/effect/target.
    if (canonicalJson(items) !== canonicalJson(parseReconciliationItems(record.body).rows) ||
        canonicalJson(rows) !== canonicalJson(record.rows)) {
      fail('SW-SOURCE-RAW', 'raw canonical rows differ from the existing parser projection');
    }
    reconciliation = { file, items, rows, warnings: result.warnings.map((entry) => ({ file: relativeFile(entry.file), message: entry.message })) };
    return reconciliation;
  }
  function source(value) {
    workObject(value, ['input_id', 'items', 'source_refs'], [], 'unit source');
    const selection = normalizeWorkOrigins([{ input_id: value.input_id, source_refs: value.source_refs }])[0];
    const itemIds = workSet(value.items, (id) => {
      if (!isReconciliationItemId(id)) fail('SW-SOURCE-ITEM', 'expected exactly two digits');
      return id;
    }, 'source.items', true);
    if (!selection.source_refs.length) fail('SW-SOURCE-ANCHOR', 'nonempty source_refs required');
    const current = input(selection.input_id);
    const anchors = selection.source_refs.map((ref) => anchor(ref, selection.input_id));
    const recon = register();
    const summaries = recon.rows.filter((row) => row.inputId === selection.input_id);
    if (summaries.length !== 1 || !RECONCILE_STATUS_VALUES.includes(summaries[0].reconcileStatus)) {
      fail('SW-SOURCE-REGISTER', 'selected input needs one valid Summary row');
    }
    const groups = itemIds.map((id) => {
      const effects = workSet(recon.items.filter((row) => row.inputId === selection.input_id && row.item === id),
        (row) => structuredClone(row), `Item ${id} effects`, true);
      return { item_id: id, effects: effects.map((row) => {
        const target = parseTargetRef(row.target);
        const resolvedTarget = ['none', 'input'].includes(target.kind)
          ? { ref: target.raw, kind: target.kind, ...(target.kind === 'input' ? { input_id: target.inputId } : {}) }
          : refs.contract(row.target);
        return { fields: row, target: resolvedTarget, evidence: anchor(row.evidence, selection.input_id) };
      }) };
    });
    return { selection: { input_id: selection.input_id, items: itemIds, source_refs: selection.source_refs },
      input: structuredClone(current.data), anchors, groups,
      reconciliation: { file: recon.file, summary: structuredClone(summaries[0]) },
      warnings: [...validation.warnings.filter((entry) => entry.file === current.artifact.file)
        .map((entry) => ({ file: current.data.file, message: entry.message })), ...recon.warnings] };
  }
  // These results deliberately retain in-progress/partial/result/decision facts.
  // They do not evaluate receipt freshness, owner relations, semantic completeness,
  // scope approval or profile permission. Callers must not equate resolution with ready.
  function sources(values) {
    const results = workSet(values, source, 'unit sources');
    if (new Set(results.map((entry) => entry.selection.input_id)).size !== results.length) {
      fail('SW-SOURCE-INPUT', 'duplicate input selection');
    }
    return results;
  }
  return { source, sources };
}
