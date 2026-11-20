import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KIT_ROOT } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { reconciliationSyntaxCacheStats, parseReconciliationReferenceView } from './reconciliation-markdown-ast.mjs';
import { resolveScopedUncertaintyProjection, scopedUnknownAuthored } from './scoped-work-uncertainty.mjs';
import { CURRENT_WORK_INPUT_LIMIT, hashBytes } from './current-work-request.mjs';
import { rememberScopedSelection, scopedAuthoredView, withScopedDocumentSyntax } from './scoped-work-authored.mjs';
import { createScopedReferenceResolver } from './scoped-work-refs.mjs';
import { resolveScopedContractGraph, scopedGraphSelectionSpans, createScopedGraphSelectionSpanResolver } from './scoped-work-graph.mjs';

const OWNER = 'screen:SELECTION-COST-001', CONTRACT = 'artifact:SELECTION-COST-RULES#rules';
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n${body}`;

function selectedFixture(t, rows) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-selection-cost-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs'), docs = [];
  fs.mkdirSync(docsDir);
  const put = (name, fm, body) => {
    const file = path.join(docsDir, name);
    fs.writeFileSync(file, md(fm, body)); docs.push({ file, fm }); return file;
  };
  const policyFile = path.join(root, 'policy.yaml'), policyOverlayFile = path.join(root, 'adoption.yaml');
  fs.writeFileSync(policyFile, '{}');
  fs.writeFileSync(policyOverlayFile, JSON.stringify({ work_execution: { version: 1, owners: [OWNER], profiles: ['behavior'],
    role_limits: { behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } }));
  put('screen.md', { artifact_id: 'SELECTION-COST-SCREEN', artifact_type: 'screen-spec', screen_id: 'SELECTION-COST-001',
    domain: 'selection-cost', status: 'draft', api_required: false,
    screen_entry: 'src/features/selection-cost/screens/SelectionCost.tsx',
    work_execution: { version: 1, units: [{ id: 'known', kind: 'behavior',
      contracts: ['artifact:SELECTION-COST-LARGE#unknowns'], sources: [] }] } }, '## Notes\nSelected owner.');
  put('rules.md', { artifact_id: 'SELECTION-COST-RULES', artifact_type: 'domain-rules', domain: 'selection-cost', status: 'confirmed' },
    '## Rules\nPreserve the original rules.');
  const fm = { artifact_id: 'SELECTION-COST-LARGE', artifact_type: 'domain-rules', domain: 'other', status: 'draft' };
  const selected = '## Unknowns\n| ID | Question | Status |\n|---|---|---|\n' +
    Array.from({ length: rows }, (_, i) => `| U-${i} | Review ${CONTRACT} | open |`).join('\n') + '\n';
  const large = put('large.md', fm, `${selected}\n## Appendix\nSmall unselected prose.\n`);
  const options = () => ({ owner: OWNER, policyFile, policyOverlayFile, docsDir, projectRoot: root,
    layout: loadLayoutProfile({ kitRoot: KIT_ROOT }), inputArtifacts: [], targetIndex: buildReconciliationTargetIndex({ docs }) });
  const expand = () => {
    const body = `${selected}\n## Appendix\n\n<!-- ${'x'.repeat(reconciliationSyntaxCacheStats().max_source_chars)} -->\n`;
    fs.writeFileSync(large, md(fm, body));
    assert.ok(body.length > reconciliationSyntaxCacheStats().max_source_chars);
    assert.ok(fs.statSync(large).size < CURRENT_WORK_INPUT_LIMIT, 'the supported file exceeds cache retention only');
    return options();
  };
  return { large, options, expand };
}

for (const rows of [1, 4]) test(`#335 selected document: ${rows} covered rows reuse their already-read batch document`, (t) => {
  const f = selectedFixture(t, rows), small = resolveScopedUncertaintyProjection(f.options()), options = f.expand();
  const open = fs.openSync, stackLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 40;
  let totalReads = 0, selectedHelperReads = 0;
  const hook = t.mock.method(fs, 'openSync', function (file, ...args) {
    if (file === f.large) {
      totalReads += 1;
      const frames = new Error().stack.split('\n');
      const documentFrame = frames.findIndex((frame) => / at document \(/.test(frame));
      if (documentFrame >= 0 && / at (?:coveredUnknownRows|addSelectedUnknown) \(/.test(frames[documentFrame + 1])) {
        selectedHelperReads += 1;
      }
    }
    return open.call(this, file, ...args);
  });
  let result;
  try { result = resolveScopedUncertaintyProjection(options); }
  finally { hook.mock.restore(); Error.stackTraceLimit = stackLimit; }
  t.diagnostic(`${rows} rows: ${totalReads} current-file reads; ${selectedHelperReads} redundant selected-helper reads`);
  assert.ok(totalReads > 0, 'graph/current-file checks and the final read-set audit still read actual bytes');
  assert.equal(selectedHelperReads, 0, 'covered rows reuse the document passed into their selected batch');
  assert.deepEqual(result.projection, small.projection, 'unselected padding cannot change relations, evidence or blocking inputs');
  assert.deepEqual(result.unaudited, small.unaudited);
  assert.deepEqual(result.read_set, small.read_set.map((entry) => entry.file === 'docs/large.md'
    ? { ...entry, sha256: hashBytes(fs.readFileSync(f.large)) } : entry));
  assert.equal(result.projection.uncertainty_relations.applications.length, rows);
});

test('#335 physical spans: independent candidate graphs share one immutable section range array per evaluation', (t) => {
  const f = selectedFixture(t, 2), initial = f.options(), rules = initial.targetIndex.artifacts.get('SELECTION-COST-RULES');
  const body = '## Rules\n\n' + Array.from({ length: 2048 }, (_, i) => `- Shared fact ${i}.`).join('\n') + '\n';
  fs.writeFileSync(rules.file, md(rules.fm, body));
  const options = f.options(), view = parseReconciliationReferenceView(body);
  const selections = [0, 1].map((i) => resolveScopedContractGraph({ ...options,
    contracts: [`unknown:U-${i}@SELECTION-COST-LARGE`] }).nodes.find((node) => node.ref === CONTRACT).selection);
  assert.notEqual(selections[0], selections[1], 'candidate graphs keep their own public selection objects');
  const ranges = createScopedGraphSelectionSpanResolver();
  const first = ranges(body, view, selections[0]), second = ranges(body, view, selections[1]);
  assert.equal(first.length, 2048);
  assert.equal(second, first, 'equal physical section selections share the immutable leaf ranges');
  assert.ok(Object.isFrozen(first) && first.every(Object.isFrozen));
  const independent = createScopedGraphSelectionSpanResolver()(body, view, selections[0]);
  assert.notEqual(independent, first, 'a later evaluation does not inherit retained span arrays');
  assert.deepEqual(independent, first);
  const publicFirst = scopedGraphSelectionSpans(body, view, selections[0]);
  const publicSecond = scopedGraphSelectionSpans(body, view, selections[1]);
  assert.notEqual(publicFirst, publicSecond); assert.notEqual(publicFirst[0], publicSecond[0]);
  publicFirst[0][0] = -1;
  assert.deepEqual(publicSecond, first, 'public mutations cannot poison the internal shared ranges');
});

test('#335 physical spans: equal raw/authored rows and a replaced native selection list stay distinct', () => {
  const table = '| ID | Question |\n|---|---|\n| U-SAME | Same question? |\n';
  const body = `## Unknowns\n\n<!-- GENERATED:START summary -->\n\n${table}\n## Generated Summary\nOutput.\n<!-- GENERATED:END summary -->\n\n${table}`;
  const view = parseReconciliationReferenceView(body), authored = scopedAuthoredView(body, view);
  const rawRow = view.sections.find((section) => section.slug === 'unknowns').tableNodes[0].children[1];
  const authoredRow = authored.sections.find((section) => section.slug === 'unknowns').tableNodes[0].children[1];
  const nodes = [rawRow], rawSelection = rememberScopedSelection({ type: 'row' }, body, nodes);
  const authoredSelection = rememberScopedSelection({ type: 'row' }, body, [authoredRow]);
  assert.deepEqual(rawSelection, authoredSelection);
  const ranges = createScopedGraphSelectionSpanResolver();
  const raw = ranges(body, view, rawSelection), retained = ranges(body, view, authoredSelection);
  assert.notDeepEqual(raw, retained, 'public row equality cannot merge physically different GENERATED/authored rows');
  nodes[0] = authoredRow;
  assert.deepEqual(ranges(body, view, rawSelection), retained, 'changed private node lists cannot borrow their old spans');
  assert.throws(() => ranges(`${body}\nChanged.`, view, authoredSelection), /SW-REF-SNAPSHOT: selection body changed/);
});

test('#335 physical spans: input parent bullets preserve nested-list holes independently of whole-node mode', () => {
  const body = '## Facts\n\n- Parent evidence.\n  - Nested child evidence.\n';
  const view = parseReconciliationReferenceView(body), parent = view.sections.find((section) => section.slug === 'facts').bulletNodes[0];
  const selection = rememberScopedSelection({ section: 'facts', bullet_index: 1 }, body, [parent]);
  const ranges = createScopedGraphSelectionSpanResolver();
  const full = ranges(body, view, selection), input = ranges(body, view, selection, true);
  const text = (spans) => spans.map(([start, end]) => body.slice(start, end)).join(' ');
  assert.match(text(full), /Nested child/); assert.doesNotMatch(text(input), /Nested child/);
  assert.equal(ranges(body, view, selection, true), input);
  selection.bullet_index = null;
  assert.equal(ranges(body, view, selection, true), full, 'only a selected input bullet omits nested lists');
});

test('#335 physical spans: mutable native-like sources retain fresh position checks', () => {
  const body = '## Rules\n\nMutable position source.\n', view = parseReconciliationReferenceView(body);
  const native = structuredClone(view.sections.find((section) => section.slug === 'rules').nodes[0]);
  const selection = rememberScopedSelection({ type: 'section', section: 'rules' }, body, [native]);
  const ranges = createScopedGraphSelectionSpanResolver(), first = ranges(body, view, selection);
  native.children[0].position.start.offset += 1;
  const second = ranges(body, view, selection);
  assert.notEqual(second, first);
  assert.equal(second[0][0], first[0][0] + 1, 'mutable positions are not treated as an immutable source');
  assert.notEqual(ranges(body, view, selection), second, 'mutable native-like inputs remain uncached');
});

test('#335 physical spans: frozen accessor nodes do not cache changing position values', () => {
  const position = (start) => Object.freeze({ start: Object.freeze({ offset: start }), end: Object.freeze({ offset: 3 }) });
  let current = position(0);
  const native = Object.freeze({ type: 'text', get position() { return current; } });
  const selection = rememberScopedSelection({ type: 'row' }, 'abc', [native]);
  const ranges = createScopedGraphSelectionSpanResolver(), first = ranges('abc', {}, selection);
  current = position(1);
  assert.deepEqual(first, [[0, 3]]);
  assert.deepEqual(ranges('abc', {}, selection), [[1, 3]], 'freezing an accessor does not freeze the values it returns');
});

test('#335 physical spans: frozen proxies keep later native property failures observable', () => {
  const position = Object.freeze({ start: Object.freeze({ offset: 0 }), end: Object.freeze({ offset: 3 }) });
  let failPosition = false;
  const sentinel = new Error('custom native position failure');
  const native = new Proxy(Object.freeze({ type: 'text', position }), { get(target, property, receiver) {
    if (property === 'position' && failPosition) throw sentinel;
    return Reflect.get(target, property, receiver);
  } });
  const selection = rememberScopedSelection({ type: 'row' }, 'abc', [native]);
  const ranges = createScopedGraphSelectionSpanResolver();
  assert.deepEqual(ranges('abc', {}, selection), [[0, 3]]);
  failPosition = true;
  assert.throws(() => ranges('abc', {}, selection), (error) => error === sentinel);
});

test('#335 Unknown classification preserves mutable authored prewarming across misses and active scopes', (t) => {
  for (const sourceKind of ['mutable table', 'frozen sourceText accessor']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-prewarm-classification-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const file = path.join(root, 'doc.md'), fm = { artifact_id: 'PREWARM', artifact_type: 'screen-spec', status: 'draft' };
    const body = `## Unknowns\n| ID | Question | Status |\n|---|---|---|\n| U-ORIGINAL | Original ${sourceKind} | open |\n`;
    fs.writeFileSync(file, md(fm, body));
    const targetIndex = buildReconciliationTargetIndex({ docs: [{ file, fm }] });
    const refs = () => createScopedReferenceResolver({ targetIndex, projectRoot: root });
    const raw = parseReconciliationReferenceView(body), home = raw.sections.find((section) => section.slug === 'unknowns');
    const table = home.tables[0], row = home.tableNodes[0].children[1];
    let sourceText = table.sourceText;
    if (sourceKind === 'frozen sourceText accessor') {
      Object.defineProperty(table, 'sourceText', { enumerable: true, get: () => sourceText });
      Object.freeze(table);
    }
    table.headers[1] = 'Display';
    const prewarmed = scopedAuthoredView(body, raw);
    assert.equal(prewarmed.sections.find((section) => section.slug === 'unknowns').tables[0], table);
    const foreignSelection = () => rememberScopedSelection({ type: 'row', section: 'unknowns' }, body, [structuredClone(row)]);
    assert.equal(scopedUnknownAuthored(body, foreignSelection(), raw), false,
      'an explicit mutable projection keeps its own noncanonical header interpretation');
    assert.equal(scopedUnknownAuthored(body, foreignSelection()), true,
      'an unprepared row is classified from the actual source body, not a mutable prewarm');
    table.headers[1] = 'Question';
    assert.equal(refs().authoredContract('unknown:U-ORIGINAL@PREWARM').selection.cells[1], `Original ${sourceKind}`);
    sourceText = '| ID | Question | Status |\n|---|---|---|\n| U-EDITED | Edited question | open |';
    if (sourceKind === 'mutable table') table.sourceText = sourceText;
    const check = () => {
      assert.equal(scopedUnknownAuthored(body, foreignSelection()), true,
        'a fresh classification miss must not discard a mutable authored prewarm');
      assert.deepEqual(refs().authoredContract('unknown:U-EDITED@PREWARM').selection.cells,
        ['U-EDITED', 'Edited question', 'open']);
      assert.throws(() => refs().authoredContract('unknown:U-ORIGINAL@PREWARM'), /SW-REF-MISSING/);
      assert.equal(refs().contract('unknown:U-ORIGINAL@PREWARM').selection.cells[1], `Original ${sourceKind}`,
        'ordinary raw resolution retains its immutable original source');
    };
    check();
    withScopedDocumentSyntax(body, check);
    check();
  }
});
