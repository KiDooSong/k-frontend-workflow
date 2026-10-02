// B §7 effective source selection. Derive connections from current canonical
// contracts and every selected v2 effect; declarations cannot erase native refs.
// This is evidence/receipt-basis resolution, not semantic review or a permit.
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { ownerParts, readCurrentBytes, hashBytes, normalizeWorkOrigins } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { buildInputArtifactIndex, resolveInputArtifact, parseRfc3339 } from './provenance.mjs';
import { validateInputArtifacts } from './input-artifact.mjs';
import { parseReconciliationRegister, REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { parseRegisterContract, parseReconciliationItems, parseTargetRef, validateReconciliationV2,
  RESULT_BY_STATUS } from './reconciliation-items.mjs';
import { parseReconciliationMarkdown, parseReconciliationReferenceView, parseStrictTables, stripNonContent,
  describeHeaderMismatch } from './reconciliation-markdown-ast.mjs';
import { parseTable } from './spec.mjs';
import { parseScopedOwner } from './scoped-work-declarations.mjs';
import { createScopedReferenceResolver, scopedRawTable } from './scoped-work-refs.mjs';
import { createScopedSourceResolver } from './scoped-work-sources.mjs';
import { createScopedApiResolver } from './scoped-work-api.mjs';
import { resolveScopedMappingEvidence } from './scoped-work-mapping.mjs';
import { resolveScopedContractGraph, scopedGraphSelectionSpans, scopedGraphApiRowDependencies } from './scoped-work-graph.mjs';
import { ScopedWorkContractError, workUnitId } from './scoped-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-SOURCE-RELATION: ${message}`); };
const union = (values) => scopeSet([...new Set(values)]);
const same = (a, b) => scopeJson(a) === scopeJson(b);

// The register parser's Summary fields and column lookup (reconciliation-register.mjs): header case and
// spaces are ignored, and the first matching column wins.
const SUMMARY_COLUMNS = [['inputId', 'Input ID'], ['source', 'Source'], ['classification', 'Classification'],
  ['reconcileStatus', 'Reconcile Status'], ['result', 'Result'], ['touched', 'Touched Artifacts'],
  ['created', 'Created Items'], ['supersedes', 'Supersedes']];
const headerKey = (name) => name.toLowerCase().replace(/\s+/g, '');

// The register parser removes HTML comments before it splits its first table (spec.mjs parseTables), so a
// validated Summary cell never shows one. Parse the same body with each comment kept as an indexed mark
// instead: rows, cells and padding line up with the parser's, which shows the cells that held a comment, and
// each row keeps its source line as written. A separator line drops its marks; marks before the leading pipe
// move into the first cell, since the parser trims the line. The rows are those of the canonical Summary: the
// validator only compares the parser's table cell by cell with it (RR-SCHEMA-020), so an example table placed
// before it may hold the same cells.
const SEPARATOR = /^\|?[\s:|-]+\|?$/;
// The line where the canonical Summary starts, picked as validateReconciliationV2 picks it (RR-SCHEMA-019): the
// one table with exactly the Summary columns once code and comments are removed (line breaks stay). It is placed
// among the top-level tables, so the same text in a list or quote does not count; -1 when it cannot be placed.
function canonicalSummaryLine(body) {
  const content = stripNonContent(body);
  const tables = parseStrictTables(content).filter((table) => describeHeaderMismatch(table, REQUIRED_REGISTER_COLS) === null);
  const nodes = tables.length !== 1 ? [] : parseReconciliationReferenceView(content).tree.children.filter((node) =>
    node.type === 'table' && content.slice(node.position.start.offset, node.position.end.offset) === tables[0].sourceText);
  return nodes.length === 1 ? content.slice(0, nodes[0].position.start.offset).split('\n').length - 1 : -1;
}
function summaryAsWritten(body) {
  let code = 0xe000;
  while (body.includes(String.fromCharCode(code))) code += 1;
  const mark = String.fromCharCode(code), token = `${mark}\\d+${mark}`, comments = [];
  const marks = new RegExp(`${mark}(\\d+)${mark}`, 'g');
  const lines = body.replace(/<!--[\s\S]*?-->/g, (comment) => `${mark}${comments.push(comment) - 1}${mark}`).split(/\r?\n/);
  // The source line each line starts on: a comment's own line breaks went into its mark.
  let folded = 0;
  const sourceLine = lines.map((line, index) => {
    const at = index + folded;
    for (const [, comment] of line.matchAll(marks)) folded += comments[Number(comment)].split('\n').length - 1;
    return at;
  });
  const parsed = lines.map((line) => {
    const bare = line.replace(marks, '');
    if (SEPARATOR.test(bare.trim())) return bare;
    return line.replace(new RegExp(`\\\\((?:${token})+)\\|`, 'g'), '$1\\|') // a mark between `\` and `|` keeps the pipe escaped
      .replace(new RegExp(`^((?:\\s|${token})*)\\|`), '|$1');
  });
  // The table's lines, by the parser's block rule (consecutive `|` lines whose second line is a separator): the
  // block where the canonical Summary starts.
  const start = canonicalSummaryLine(body);
  let block = [];
  for (const [index, line] of [...parsed, ''].entries()) {
    if (line.trim().startsWith('|')) { block.push(index); continue; }
    if (block.length >= 2 && SEPARATOR.test(parsed[block[1]].trim()) && sourceLine[block[0]] === start) break;
    block = [];
  }
  const table = parseTable(block.map((index) => parsed[index]).join('\n')), rowLines = block.slice(2);
  if (!table) return [];
  const plain = (cell) => cell.replace(marks, '').trim();
  return table.cell_rows.map((cells, i) => {
    const row = {};
    table.headers.forEach((header, h) => { row[plain(header)] = cells[h] ?? ''; });
    return { line: lines[rowLines[i]].replace(marks, (_, index) => comments[Number(index)]),
      ...Object.fromEntries(SUMMARY_COLUMNS.map(([field, name]) => {
        const cell = row[Object.keys(row).find((key) => headerKey(key) === headerKey(name))] || '';
        return [field, { plain: plain(cell), commented: cell.includes(mark) }];
      })) };
  });
}

export function resolveScopedSourceRelations(options = {}) {
  return resolveSourceClosure(options, true);
}

// R1 records present facts even before inferred input effects have been authored.
// This separate observation entry never turns absent/legacy reconciliation into
// positive coverage. Explicit Item selectors still require valid v2 resolution.
export function resolveScopedSourceProjection(options = {}) {
  return resolveSourceClosure(options, false);
}

function resolveSourceClosure(options, requireEffects) {
  const roots = new Set(), pins = new Map(), witnesses = new Map();
  for (;;) {
    const result = resolveSourceRelations(options, requireEffects, [...roots]);
    for (const entry of result.read_set) {
      if (pins.has(entry.file) && pins.get(entry.file).sha256 !== entry.sha256) fail('snapshot changed between source passes');
      pins.set(entry.file, entry);
    }
    let changed = false;
    for (const source of result.sources) {
      const key = scopeJson(source.selection);
      // A source must not become connected merely by adding its own effects
      // as dependency roots in the following pass. Retain its first witnesses.
      if (!witnesses.has(key)) witnesses.set(key, { connections: source.connections, issues: source.issues });
      Object.assign(source, structuredClone(witnesses.get(key)));
      if (requireEffects && source.issues.length) continue;
      const dependencies = [...source.source.anchors.map((anchor) => anchor.ref),
        ...source.source.groups.flatMap((group) => group.effects.flatMap((effect) =>
          [effect.evidence.ref, ...(['none', 'input'].includes(effect.target.kind) ? [] : [effect.target.ref])] ))];
      for (const ref of dependencies) if (!result.contracts.nodes.some((node) => node.ref === ref) && !roots.has(ref)) {
        roots.add(ref); changed = true;
      }
    }
    if (!changed) return { ...result, sources: scopeSet(result.sources), read_set: scopeSet([...pins.values()]) };
  }
}

function resolveSourceRelations({ owner, unit, targetIndex, inputArtifacts = [],
  registerFile, projectRoot, layout } = {}, requireEffects, dependencyRoots) {
  const parts = ownerParts(owner); workUnitId(unit);
  const args = { targetIndex, inputArtifacts, projectRoot };
  const refs = createScopedReferenceResolver(args);
  const sourceReader = createScopedSourceResolver({ ...args, registerFile });
  const reads = new Map(), documents = new Map(), spans = new Map(), nativeInputs = new Map();
  let absentRegister = null;
  function read(file, expected) {
    const relative = path.isAbsolute(file) ? path.relative(projectRoot, file).split(path.sep).join('/') : file;
    if (path.isAbsolute(file) && path.resolve(file) !== file) fail('noncanonical snapshot path');
    const canonical = canonicalRepositoryPath(projectRoot, relative,
      { required: true, type: 'file', label: 'scoped source relation' });
    const bytes = readCurrentBytes(canonical.absolute, 'scoped source relation'), sha256 = hashBytes(bytes);
    if ((expected !== undefined && sha256 !== expected) || (reads.has(relative) && reads.get(relative).sha256 !== sha256)) {
      fail(`snapshot changed: ${relative}`);
    }
    reads.set(relative, { file: relative, sha256 });
    return bytes;
  }
  function audit(graph) { for (const entry of graph.read_set) read(entry.file, entry.sha256); }
  function document(record) {
    if (!documents.has(record.file)) {
      const parsed = splitFrontmatter(decodeGitUtf8(read(record.file), 'scoped source relation'));
      if (!parsed.hasFrontmatter || parsed.parseError) fail('invalid canonical document');
      documents.set(record.file, { ...parsed, view: parseReconciliationReferenceView(parsed.body) });
    }
    const doc = documents.get(record.file);
    if (!same(doc.data, record.metadata)) fail('canonical metadata differs from the index');
    if (record.kind !== 'input-evidence' && doc.body !== targetIndex.artifacts.get(record.artifact_id)?.body) {
      fail('canonical body differs from the index');
    }
    return doc;
  }
  function ranges(record) {
    if (!spans.has(record.ref)) {
      const doc = document(record);
      spans.set(record.ref, scopedGraphSelectionSpans(doc.body, doc.view, record.selection, record.kind === 'input-evidence'));
    }
    return spans.get(record.ref);
  }
  function overlaps(a, b) {
    if (a.file !== b.file) return false;
    if (a.ref === b.ref) return true;
    return ranges(a).some(([x, y]) => ranges(b).some(([u, v]) => x < v && u < y));
  }
  function inputNode(ref) {
    const evidence = sourceReader.evidence(ref);
    read(evidence.input.file, evidence.input.input_sha256);
    return { ref, kind: 'input-evidence', input_id: evidence.input.input_id, file: evidence.input.file,
      metadata: evidence.input.metadata, selection: evidence.anchor };
  }
  function home(ownerId) {
    const p = ownerParts(ownerId), type = p.kind === 'screen' ? 'screen-spec' : 'shared-surface-spec';
    const matches = [...targetIndex.artifacts.values()].filter((entry) => entry.fm.artifact_type === type && entry.fm[`${p.kind}_id`] === p.id);
    if (matches.length !== 1) fail(`unique canonical owner required: ${ownerId}`);
    const record = refs.contract(`artifact:${matches[0].fm.artifact_id}`); document(record); return record;
  }
  const ownerRecord = home(owner);
  const declaration = parseScopedOwner(ownerRecord.metadata.work_execution, owner);
  const selectedUnit = declaration?.units.find((entry) => entry.id === unit);
  if (!selectedUnit) fail('declared owner unit required');
  const roots = new Set([...selectedUnit.contracts, ...dependencyRoots]);
  if (selectedUnit.api_candidates.length) {
    const api = createScopedApiResolver({ targetIndex, projectRoot, layout }).unit(ownerRecord.artifact_id, owner, unit);
    for (const row of api.candidates) for (const ref of scopedGraphApiRowDependencies(document(ownerRecord).body, row)) roots.add(ref);
  }
  function mapping(host, mappingRef, keys) {
    const result = resolveScopedMappingEvidence({ ...args, hostRef: host.ref, mappingRef, mKeys: keys });
    for (const row of result.rows) {
      roots.add(`${mappingRef}/${row.m_key}`);
      roots.add(`artifact:${result.mapping.artifact_id}#mapping-provenance/${row.m_key}`);
      roots.add(row.anchor.ref);
    }
  }
  if (parts.kind === 'surface' && selectedUnit.kind === 'visual') {
    if (!same(union(ownerRecord.metadata.member_screens), union(Object.keys(selectedUnit.host_visual_evidence)))) fail('host membership differs');
    for (const [id, selected] of Object.entries(selectedUnit.host_visual_evidence)) {
      const host = home(`screen:${id}`);
      if (host.metadata.domain !== ownerRecord.metadata.domain) fail('host domain differs');
      mapping(host, selected.mapping_ref, selected.m_keys);
    }
  }
  let graph = resolveScopedContractGraph({ ...args, contracts: [...roots] }); audit(graph);
  // A screen's selected mapping rows also consume the matching provenance rows.
  // Enumerate raw keys, then let the existing mapping resolver validate grammar,
  // row bijection, owning screen/domain and actual inherited Figma evidence.
  if (parts.kind === 'screen') for (const record of graph.nodes) {
    if (record.metadata.artifact_type !== 'figma-component-mapping' ||
        (record.selection.type !== 'body' && record.selection.section !== 'component-mapping')) continue;
    const section = parseReconciliationMarkdown(document(record).body).occurrences.filter((entry) => entry.slug === 'component-mapping');
    if (section.length !== 1 || section[0].tables.length !== 1) fail('one Component Mapping table required');
    const keys = record.selection.type === 'row' ? [record.selection.key]
      : scopedRawTable(section[0].tables[0]).cells.map((cells) => cells[0].split('`')[1]);
    mapping(ownerRecord, `artifact:${record.artifact_id}#component-mapping`, keys);
  }
  if (!same(union([...roots]), graph.roots)) { graph = resolveScopedContractGraph({ ...args, contracts: [...roots] }); audit(graph); }
  const contracts = graph.nodes.filter((record) => record.kind !== 'input-evidence');
  const selections = new Map(), origins = new Map(), pending = [];
  function selected(id) {
    normalizeWorkOrigins([{ input_id: id, source_refs: [] }]);
    if (!selections.has(id)) selections.set(id, { input_id: id, items: new Set(), source_refs: new Set() });
    return selections.get(id);
  }
  function origin(id, value) {
    selected(id);
    if (!origins.has(id)) origins.set(id, new Map());
    origins.get(id).set(scopeJson(value), value);
  }
  for (const source of selectedUnit.sources) {
    const out = selected(source.input_id);
    source.items.forEach((id) => out.items.add(id));
    // Preserve the native input/anchor error boundary before register inference.
    source.source_refs.forEach((ref) => { inputNode(ref); out.source_refs.add(ref); });
    origin(source.input_id, { kind: 'unit-source', ref: ownerRecord.ref });
  }
  const inferred = new Map();
  const inputIndex = buildInputArtifactIndex(inputArtifacts);
  const inputErrors = validateInputArtifacts(inputArtifacts).errors;
  for (const record of graph.nodes) {
    if (record.kind === 'input-evidence') {
      inferred.set(record.ref, { input_id: record.input_id, ref: record.ref });
      origin(record.input_id, { kind: 'contract-source', ref: record.ref });
    }
    for (const source of record.metadata.sources || []) if (typeof source.ref === 'string' && source.ref.startsWith('IN-')) {
      normalizeWorkOrigins([{ input_id: source.ref, source_refs: [] }]);
      const found = resolveInputArtifact(inputIndex, source.ref);
      if (found.status !== 'ok' || found.artifact.parseError || inputErrors.some((error) => error.file === found.artifact.file)) {
        fail(`missing, ambiguous or invalid canonical input: ${source.ref}`);
      }
      const file = path.relative(projectRoot, found.artifact.file).split(path.sep).join('/');
      document({ kind: 'input-evidence', file, metadata: found.artifact.fm });
      nativeInputs.set(source.ref, { input_id: source.ref, file });
      inferred.set(source.ref, { input_id: source.ref, ref: null });
      origin(source.ref, { kind: 'canonical-input', ref: record.ref });
    }
  }
  let rows = [], legacy = null;
  if (selections.size) {
    const required = requireEffects || selectedUnit.sources.length > 0;
    let register = null;
    if (typeof registerFile !== 'string') {
      if (required) fail('canonical register path required for source connections');
    } else {
      const relative = path.isAbsolute(registerFile) ? path.relative(projectRoot, registerFile).split(path.sep).join('/') : registerFile;
      if (path.isAbsolute(registerFile) && path.resolve(registerFile) !== registerFile) fail('noncanonical register path');
      const actual = canonicalRepositoryPath(projectRoot, relative,
        { required, type: 'file', label: 'scoped source register' });
      if (actual.exists) {
        read(registerFile); // Pin bytes before either canonical parser consumes them.
        register = parseReconciliationRegister(actual.absolute);
      } else absentRegister = relative;
    }
    if (register) {
      const contract = parseRegisterContract(register.fm);
      if (register.fmParseError || register.fmStructuralError || contract.errors.length ||
          (contract.version !== 2 && (required || contract.version !== 1))) fail('valid Reconciliation Contract v2 required');
      if (contract.version === 2) {
        const validation = validateReconciliationV2({ register, registerFile, inputArtifacts, targetIndex });
        if (validation.errors.length) fail(validation.errors.map((entry) => entry.message).join('; '));
        rows = parseReconciliationItems(register.body).rows;
        legacy = { since: contract.structuredSinceMs, summaries: register.rows, body: register.body };
      }
    } else if (required) fail('Reconciliation Contract v2 required');
  }
  // #269: the register contract keeps an input captured before structured_since as a summary-only
  // legacy row. A reconciled Summary with a canonical Result connects it without item-level
  // evidence; the Decisions and Conflicts it created keep their own gates. Any Item, a later or
  // invalid capture time, or another Summary state keeps the item-level rule. The validated row
  // decides; its Status and Result must also be canonical as written, since a comment the table parser
  // dropped cannot make them so (as for an Item source, SW-SOURCE-RAW). The evidence is the row as written.
  function legacyConnection({ input_id: id, ref }) {
    if (!legacy || rows.some((row) => row.inputId === id)) return null;
    const summaries = legacy.summaries.filter((row) => row.inputId === id);
    const summary = summaries.length === 1 ? summaries[0] : null;
    if (summary?.reconcileStatus !== 'reconciled' || !RESULT_BY_STATUS.reconciled.includes(summary.result)) return null;
    const found = resolveInputArtifact(inputIndex, id);
    const captured = found.status === 'ok' ? parseRfc3339(found.artifact.fm?.captured_at) : null;
    if (captured === null || legacy.since === null || captured >= legacy.since) return null;
    legacy.asWritten ??= summaryAsWritten(legacy.body);
    const row = legacy.asWritten[legacy.summaries.indexOf(summary)];
    // The marked row must be the validated one (if the two parses ever drift apart, nothing connects),
    // and its Status and Result must carry no comment.
    if (!row || SUMMARY_COLUMNS.some(([field]) => row[field].plain !== summary[field]) ||
        row.reconcileStatus.commented || row.result.commented) return null;
    // The validated cells and the row's line as written are the evidence, so any change to the row moves the
    // projection and its basis, as any change to the input's bytes does.
    return { input_id: id, ref, reason: 'legacy-summary-only', summary: { input_id: summary.inputId, source: summary.source,
      classification: summary.classification, reconcile_status: summary.reconcileStatus, result: summary.result,
      touched_artifacts: summary.touched, created_items: summary.created, supersedes: summary.supersedes, row: row.line },
    input_sha256: hashBytes(read(found.artifact.file)) };
  }
  const legacyConnections = [];
  function witnesses(target) {
    const parsed = parseTargetRef(target);
    if (!parsed || ['none', 'input'].includes(parsed.kind)) return [];
    const record = refs.contract(target); document(record);
    return contracts.filter((node) => overlaps(record, node)).map((node) => node.ref);
  }
  for (const connection of inferred.values()) {
    const anchor = connection.ref ? inputNode(connection.ref) : null;
    const matches = rows.filter((row) => row.inputId === connection.input_id &&
      ((!requireEffects && anchor) || witnesses(row.target).length) &&
      (!anchor || overlaps(anchor, inputNode(row.evidence))));
    if (!matches.length) {
      const summary = legacyConnection(connection);
      if (summary) legacyConnections.push(summary);
      else pending.push({ input_id: connection.input_id, ref: connection.ref, reason: 'source-effect-unconnected' });
      continue;
    }
    const out = selected(connection.input_id);
    matches.forEach((row) => { out.items.add(row.item); out.source_refs.add(row.evidence); });
    if (connection.ref) out.source_refs.add(connection.ref);
  }
  const contractHashes = Object.fromEntries(union(contracts.map((node) => node.file)).map((file) => [file, reads.get(file).sha256]));
  const resolved = [];
  for (const choice of selections.values()) {
    if (!choice.items.size || !choice.source_refs.size) continue;
    const selection = { input_id: choice.input_id, items: union([...choice.items]), source_refs: union([...choice.source_refs]) };
    const source = sourceReader.source(selection); read(source.input.file, source.input.input_sha256);
    const connections = [], issues = [];
    for (const group of source.groups) {
      const groupWitnesses = [];
      for (const effect of group.effects) {
        const targets = witnesses(effect.target.ref);
        const anchors = source.anchors.filter((anchor) => overlaps(inputNode(anchor.ref), inputNode(effect.evidence.ref))).map((anchor) => anchor.ref);
        if (targets.length && anchors.length) groupWitnesses.push({ item_id: group.item_id, target: effect.target.ref,
          evidence: effect.evidence.ref, contracts: union(targets), source_refs: union(anchors) });
      }
      if (!groupWitnesses.length) issues.push({ item_id: group.item_id, reason: 'source-effect-unconnected' });
      connections.push(...groupWitnesses);
    }
    for (const anchor of source.anchors) if (!connections.some((entry) => entry.source_refs.includes(anchor.ref))) {
      issues.push({ ref: anchor.ref, reason: 'source-anchor-unconnected' });
    }
    const dependencyRoots = union(source.groups.flatMap((group) => group.effects.flatMap((effect) =>
      [effect.evidence.ref, ...(['none', 'input'].includes(effect.target.kind) ? [] : [effect.target.ref])])));
    const dependencies = resolveScopedContractGraph({ ...args, contracts: dependencyRoots }); audit(dependencies);
    const effects = scopeSet(source.groups.flatMap((group) => group.effects.map((effect) => effect.fields)));
    resolved.push({ selection, source, connections: scopeSet(connections), issues: scopeSet(issues),
      provenance: scopeSet([...origins.get(choice.input_id).values()]),
      basis: { version: 1, owner, unit, input_id: choice.input_id, item_ids: selection.items, source_refs: selection.source_refs,
        input_sha256: source.input.input_sha256, effects_sha256: hashBytes(Buffer.from(scopeJson(effects))),
        contracts_sha256: hashBytes(Buffer.from(scopeJson(contractHashes))) } });
  }
  for (const entry of [...reads.values()]) read(entry.file, entry.sha256);
  if (absentRegister && canonicalRepositoryPath(projectRoot, absentRegister,
    { required: false, type: 'file', label: 'scoped source register' }).exists) fail('register appeared during source projection');
  return { owner, unit, sources: scopeSet(resolved), pending_connections: scopeSet(pending),
    legacy_connections: scopeSet(legacyConnections),
    inferred_sources: scopeSet([...inferred.values()]), native_inputs: scopeSet([...nativeInputs.values()]),
    contracts: graph, contract_hashes: contractHashes, read_set: scopeSet([...reads.values()]) };
}
