import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { KIT_ROOT, splitFrontmatter } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { loadInputArtifact } from './input-artifact.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { COMPONENT_MAPPING_COLUMNS, MAPPING_PROVENANCE_COLUMNS } from './mapping-provenance.mjs';
import { createScopedReferenceResolver } from './scoped-work-refs.mjs';
import { resolveScopedSourceRelations, resolveScopedSourceProjection } from './scoped-work-source-relations.mjs';
import { resolveScopedUnitProjection } from './scoped-work-projection.mjs';
import { resolveScopedBindingBasis } from './scoped-work-basis.mjs';
import { resolveScopedUncertaintyProjection } from './scoped-work-uncertainty.mjs';
import { scopeJson } from './scoped-work-normalize.mjs';
import { hashBytes } from './current-work-request.mjs';

const OWNER = 'screen:RESULT-001', INPUT = 'IN-20260922-meeting-001', NEXT = 'IN-20260922-meeting-002';
const KEY = 'app.copy.closeLabel', ROW = `artifact:COPY#copy-keys/${KEY}`, SECTION = 'artifact:COPY#copy-keys';
const DECISION = 'decision:D-HISTORY@open-decision-register';
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const inputRef = (item = '01', input = INPUT) => `input:${input}#extracted-facts/${item}`;
const effect = ({ item = '01', input = INPUT, target = 'artifact:DOC#rules' } = {}) =>
  [input, item, 'compatible-fact', 'simple-update', 'update', target, inputRef(item, input), 'inherit', 'statement', 'inherit'];
const copyKeys = (rows) => `## Copy Keys\n${table(['Key', 'Text', 'Status'], rows)}\n\n## Notes\nCopy notes.`;
const kept = [[KEY, 'Close', 'draft'], ['app.copy.done', 'Done', 'draft']];
const deleted = [['app.copy.done', 'Done', 'draft']];
const digest = (value) => hashBytes(Buffer.from(scopeJson(value)));

// Real files reproduce the native source path from #293. A selected Item may
// contain several effects, while a different Item of the same input is merely
// inspected during inference and must not become selected just to avoid an error.
function fixture(t, { native = true, explicit = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-retired-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = new Map(), inputs = new Map();
  const write = (name, fm, body, collection = docs) => {
    const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, md(fm, body)); collection.set(name, file); return file;
  };
  const change = (name, edit, collection = docs) => {
    const file = collection.get(name), before = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const value = { fm: before.data, body: before.body }; edit(value); fs.writeFileSync(file, md(value.fm, value.body));
  };
  const addInput = (input = INPUT) => write(`${input}.md`, {
    input_id: input, input_type: 'meeting', source_type: 'meeting', source_ref: `meeting:${input}`,
    captured_at: '2026-09-22T00:00:00Z', captured_by: 'test', status: 'captured',
    affected_domains: ['result'], affected_screens: ['RESULT-001'],
  }, '## Extracted Facts\n- Known first fact.\n- Other fact.\n\n## Notes\nUnrelated input prose.', inputs);
  addInput();
  write('screen.md', { artifact_id: 'SCREEN', artifact_type: 'screen-spec', screen_id: 'RESULT-001', domain: 'result',
    status: 'draft', screen_entry: 'src/features/result/screens/Result.tsx', work_execution: { version: 1,
      units: [{ id: 'known', kind: 'behavior', contracts: ['artifact:DOC#rules'], sources: explicit
        ? [{ input_id: INPUT, items: ['01'], source_refs: [inputRef()] }] : [] }] } },
  '## Notes\nAn authored unit is not permission.');
  write('contract.md', { artifact_id: 'DOC', artifact_type: 'domain-rules', domain: 'result', status: 'draft',
    ...(native ? { sources: [{ type: 'meeting', ref: INPUT }] } : {}) },
  '## Rules\nKnown contract.\n\n## Other\nUnselected contract.');
  write('copy.md', { artifact_id: 'COPY', artifact_type: 'screen-spec', screen_id: 'RESULT-002', domain: 'result', status: 'draft' }, copyKeys(kept));
  const registerFile = path.join(root, 'register.md');
  const register = (rows = [effect(), effect({ target: ROW })]) => {
    const summaries = [...new Set(rows.map((row) => row[0]))].map((id) => {
      const items = rows.filter((row) => row[0] === id);
      const touched = [...new Set(items.filter((row) => row[4] === 'update').map((row) => row[5].split('#')[0]))].join('; ') || '-';
      return [id, 'meeting', `simple-update×${new Set(items.map((row) => row[1])).size}`, 'partially-reconciled', 'pending', touched, '-', '-'];
    });
    fs.writeFileSync(registerFile, md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' },
      `${table(REQUIRED_REGISTER_COLS, summaries)}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS, rows)}`));
  };
  register();
  const kitRoot = path.join(root, '.kit'); fs.mkdirSync(kitRoot);
  const policyFile = path.join(kitRoot, 'policy.yaml'), policyOverlayFile = path.join(kitRoot, 'adoption.yaml');
  const layoutFile = path.join(kitRoot, 'layout.yaml'), manifestFile = path.join(kitRoot, 'manifest.yaml');
  fs.writeFileSync(policyFile, '{}');
  fs.writeFileSync(policyOverlayFile, JSON.stringify({ work_execution: {
    version: 1, owners: [OWNER], profiles: ['behavior'], role_limits: { behavior: ['screen'] }, deny_paths: [],
  } }));
  fs.writeFileSync(layoutFile, JSON.stringify({ roles: { screen: ['src/features/{domain}/screens/**'],
    domain_component: ['src/features/{domain}/components/**'], hook: ['src/features/{domain}/hooks/**'],
    api_client: ['src/api/**'], test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'] } }));
  fs.writeFileSync(manifestFile, JSON.stringify({ version: 1, artifacts: {} }));
  const options = () => ({ owner: OWNER, unit: 'known', projectRoot: root, docsDir: root, kitRoot,
    registerFile, policyFile, policyOverlayFile, layoutFile, manifestFile,
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) =>
      ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }),
    inputArtifacts: [...inputs.values()].map(loadInputArtifact), layout: loadLayoutProfile({ kitRoot, layoutFile }) });
  const binding = () => {
    change('screen.md', ({ fm }) => { fm.decision_refs = ['D-HISTORY']; });
    write('global/open-decisions.md', { artifact_id: 'open-decision-register', artifact_type: 'open-decision-register', status: 'draft',
      decision_work_scopes: { version: 1, bindings: [{ decision_id: 'D-HISTORY', owner: OWNER, known_units: ['known'],
        blocks: ['known'], basis_digest: `sha256:${'0'.repeat(64)}`, approval_ref: 'review:retired-target' }] } },
    `## Open Decisions\n${table(['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'],
      [['D-HISTORY', 'Choose behavior.', 'A / B', 'api-integrated-ui', 'PM', 'open']])}`);
  };
  return { root, docs, inputs, write, change, addInput, register, registerFile, options, binding,
    run: () => resolveScopedSourceRelations(options()),
    project: () => resolveScopedUnitProjection(options()),
    basis: () => resolveScopedBindingBasis({ ...options(), decisionRef: DECISION }) };
}

const effects = (out, input = INPUT) => out.sources.find((entry) => entry.selection.input_id === input).source.groups.flatMap((group) => group.effects);
const refs = (out) => out.contracts.nodes.map((node) => node.ref);
const fallback = (out, original = ROW) => (out.target_fallbacks || []).find((entry) => entry.original_ref === original);
const noPermit = (out) => {
  for (const key of ['ready', 'allowed', 'approval_verified', 'semantic_coverage_verified']) assert.equal(Object.hasOwn(out, key), false);
};

test('#293 unchanged exact target: graph, projection and binding bytes match the pre-fix baseline', (t) => {
  const f = fixture(t); f.binding();
  const out = f.run(), projection = f.project().projection, basis = f.basis();
  assert.deepEqual(effects(out).map((entry) => entry.target.ref).sort(), ['artifact:DOC#rules', ROW].sort());
  assert.equal(Object.hasOwn(out, 'target_fallbacks'), false);
  // Baseline main 1893ce2: no new fields or digest migration for an unaffected owner.
  assert.equal(digest(out.contracts), 'sha256:a55aa883583b050879560281f43c491a88a54ea09849d5860406eee4ad3bfbb6');
  assert.equal(digest(projection), 'sha256:597aa9c6940b369fc0d9c7234f99657bb6c4857ce0b9088e74fa1cd611722041');
  assert.equal(basis.basis_digest, 'sha256:4d631d68314aa05239d3a8b0d1b07a5c6b84aa348dc3fa894d940866d4bbc758');
});

test('#293 missing sibling effect row falls back to its section without rewriting historical Item fields', (t) => {
  const f = fixture(t); f.change('copy.md', (doc) => { doc.body = copyKeys(deleted); });
  const original = fs.readFileSync(f.registerFile), out = f.run();
  const retired = effects(out).find((entry) => entry.fields.target === ROW);
  assert.equal(retired.target.ref, SECTION);
  assert.equal(retired.target.selection.type, 'section');
  assert.deepEqual(retired.target.historical_target, { original_ref: ROW, effective_ref: SECTION, reason: 'missing-row' });
  assert.ok(refs(out).includes(SECTION)); assert.ok(!refs(out).includes(ROW));
  const warning = out.sources[0].source.warnings.find((entry) => entry.code === 'SW-SOURCE-TARGET-FALLBACK');
  assert.equal(warning.input_id, INPUT); assert.equal(warning.item_id, '01');
  assert.equal(warning.original_ref, ROW); assert.equal(warning.effective_ref, SECTION);
  assert.equal(fallback(out).effective_ref, SECTION);
  const projected = f.project().projection.units[0].sources[0].groups[0].effects.find((entry) => entry.fields.target === ROW);
  assert.equal(projected.target, SECTION);
  assert.deepEqual(fs.readFileSync(f.registerFile), original);
  noPermit(out);
});

test('#293 an unrelated retired Item of an inferred input does not become a selected effect', (t) => {
  const f = fixture(t); f.register([effect(), effect({ item: '02', target: ROW })]);
  f.change('copy.md', (doc) => { doc.body = copyKeys(deleted); });
  const out = f.run();
  assert.deepEqual(out.sources[0].selection.items, ['01']);
  assert.ok(!refs(out).some((ref) => ref.startsWith('artifact:COPY')));
  assert.equal(fallback(out).effective_ref, SECTION, 'inference-time fallback is still reported');
  noPermit(out);
});

test('#293 a selected historical row target connects through the surviving current section', (t) => {
  const f = fixture(t);
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts = [SECTION]; });
  f.change('copy.md', (doc) => { doc.fm.sources = [{ type: 'meeting', ref: INPUT }]; doc.body = copyKeys(deleted); });
  f.register([effect({ target: ROW })]);
  const out = f.run();
  assert.deepEqual(out.sources[0].selection.items, ['01']);
  assert.deepEqual(out.sources[0].issues, []);
  assert.equal(effects(out)[0].fields.target, ROW);
  assert.equal(effects(out)[0].target.ref, SECTION);
  assert.deepEqual(out.sources[0].connections[0].contracts, [SECTION]);
});

for (const [name, body, effective, reason] of [
  ['deleted section', '## Notes\nThe former copy table has been removed.', 'artifact:COPY', 'missing-section'],
  ['backtick-wrapped row key', copyKeys([[`\`${KEY}\``, 'Close', 'draft'], ...deleted]), SECTION, 'missing-row'],
  ['case-mismatched row key', copyKeys([[KEY.toUpperCase(), 'Close', 'draft'], ...deleted]), SECTION, 'missing-row'],
  ['substring-only row key', copyKeys([[`${KEY}.extra`, 'Close', 'draft'], ...deleted]), SECTION, 'missing-row'],
]) test(`#293 ${name} retains the historical target and uses conservative current evidence`, (t) => {
  const f = fixture(t); f.change('copy.md', (doc) => { doc.body = body; });
  const out = f.run(), retired = effects(out).find((entry) => entry.fields.target === ROW);
  assert.equal(retired.target.ref, effective);
  assert.deepEqual(retired.target.historical_target, { original_ref: ROW, effective_ref: effective, reason });
  assert.equal(fallback(out).effective_ref, effective);
  assert.ok(refs(out).includes(effective));
  assert.ok(f.project().projection.evidence.nodes.some((node) => node.ref === effective));
});

test('#293 a removed H2 row may use the unique surviving ordinary H3 section, without enabling direct H3 rows', (t) => {
  const f = fixture(t); f.change('copy.md', (doc) => { doc.body = `## Details\n\n### Copy Keys\n${table(['Key', 'Text', 'Status'], deleted)}`; });
  const out = f.run();
  assert.equal(effects(out).find((entry) => entry.fields.target === ROW).target.ref, SECTION);
  assert.equal(fallback(out).effective_ref, SECTION);
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts.push(ROW); });
  assert.throws(() => f.run(), /SW-REF-MISSING/);
});

test('#293 fallback is followed through native sources on the surviving dependency', (t) => {
  const f = fixture(t); f.addInput(NEXT);
  f.change('copy.md', (doc) => { doc.fm.sources = [{ type: 'meeting', ref: NEXT }]; doc.body = copyKeys(deleted); });
  f.write('third.md', { artifact_id: 'THIRD', artifact_type: 'domain-rules', domain: 'result', status: 'draft' },
    `## Rules\n${table(['Key', 'Rule'], [['still-here', 'Current third contract.']])}`);
  const third = 'artifact:THIRD#rules/retired-key';
  f.register([effect(), effect({ target: ROW }), effect({ input: NEXT, target: SECTION }), effect({ input: NEXT, target: third })]);
  const out = f.run();
  assert.deepEqual(out.sources.map((entry) => entry.selection.input_id).sort(), [INPUT, NEXT].sort());
  assert.ok(refs(out).includes(SECTION)); assert.ok(refs(out).includes('artifact:THIRD#rules'));
  assert.equal(fallback(out, third).effective_ref, 'artifact:THIRD#rules');
  assert.equal(effects(out, NEXT).find((entry) => entry.fields.target === third).target.ref, 'artifact:THIRD#rules');
  assert.deepEqual(f.run(), out, 'closure and diagnostics are deterministic across repeated reads');
});

test('#293 widened current evidence remains in the binding basis and retains open Unknowns', (t) => {
  const f = fixture(t); f.binding();
  f.change('copy.md', (doc) => { doc.body = `## Notes\nCurrent copy rules.\n\n## Unknowns\n${table(['ID', 'Question', 'Status'],
    [['U-COPY', 'Which replacement label?', 'open']])}`; });
  const original = fs.readFileSync(f.registerFile), before = f.basis();
  const uncertainty = resolveScopedUncertaintyProjection(f.options()).projection;
  assert.ok(uncertainty.uncertainty_relations.records.some((entry) => entry.ref === 'unknown:U-COPY@COPY'));
  assert.ok(uncertainty.uncertainty_relations.applications.some((entry) => entry.uncertainty === 'unknown:U-COPY@COPY'));
  f.change('copy.md', (doc) => { doc.body = doc.body.replace('Current copy rules.', 'The whole surviving document is current evidence.'); });
  assert.notEqual(f.basis().basis_digest, before.basis_digest);
  assert.deepEqual(fs.readFileSync(f.registerFile), original);
});

test('#293 present exact row continues to select only that row', (t) => {
  const f = fixture(t); f.binding(); const before = f.basis();
  f.change('copy.md', (doc) => { doc.body = doc.body.replace('Done', 'Finish').replace('Copy notes.', 'Unselected housekeeping.'); });
  const out = f.run();
  assert.equal(effects(out).find((entry) => entry.fields.target === ROW).target.selection.type, 'row');
  assert.equal(Object.hasOwn(out, 'target_fallbacks'), false);
  assert.equal(f.basis().basis_digest, before.basis_digest, 'unselected sibling row/prose remains outside binding content');
});

test('#293 an explicitly selected Item keeps its disconnected source issue after fallback', (t) => {
  const f = fixture(t, { native: false, explicit: true });
  f.register([effect({ target: ROW })]); f.change('copy.md', (doc) => { doc.body = copyKeys(deleted); });
  const out = f.run();
  assert.ok(out.sources[0].issues.some((entry) => entry.reason === 'source-effect-unconnected'));
  assert.ok(!refs(out).includes(SECTION), 'the strict relation resolver does not connect an Item through its own new root');
  noPermit(out);
});

test('#293 native sources on a disconnected historical target cannot make its explicit Item self-connect', (t) => {
  const f = fixture(t, { native: true, explicit: true });
  f.register([effect({ target: ROW })]);
  f.change('copy.md', (doc) => { doc.fm.sources = [{ type: 'meeting', ref: INPUT }]; doc.body = copyKeys(deleted); });
  const out = f.run();
  assert.ok(out.sources[0].issues.some((entry) => entry.reason === 'source-effect-unconnected'));
  assert.ok(!refs(out).includes(SECTION));
  const projection = f.project().projection;
  assert.ok(projection.units[0].source_dependencies.unconnected_effects.some((entry) => entry.input_id === INPUT &&
    entry.item_id === '01' && entry.reason === 'source-effect-unconnected'), 'observation closure retains the first disconnected witness');
  noPermit(out);
});

test('#293 fallback expanding an inferred Item set preserves the original disconnected Item and anchor', (t) => {
  const f = fixture(t, { native: true, explicit: true });
  f.register([effect({ target: ROW }), effect({ item: '02', target: 'artifact:COPY#copy-keys/app.copy.done' })]);
  f.change('copy.md', (doc) => { doc.fm.sources = [{ type: 'meeting', ref: INPUT }]; });
  const before = f.project().projection.units[0];
  assert.deepEqual(before.sources[0].selection.items, ['01']);
  assert.equal(before.source_dependencies.unconnected_effects.length, 2);
  f.change('copy.md', (doc) => { doc.body = copyKeys(deleted); });
  const after = f.project().projection.units[0];
  assert.deepEqual(after.sources[0].selection.items, ['01', '02'], 'the surviving section also exposes the sibling Item');
  for (const issue of before.source_dependencies.unconnected_effects) {
    assert.ok(after.source_dependencies.unconnected_effects.some((current) => scopeJson(current) === scopeJson(issue)),
      `a broader selection must not erase the first witness: ${scopeJson(issue)}`);
  }
  assert.ok(f.run().sources[0].issues.some((entry) => entry.item_id === '01' && entry.reason === 'source-effect-unconnected'));
});

test('#293 fallback expanding a connected Item set retains its original positive witnesses', (t) => {
  const f = fixture(t);
  f.register([effect(), effect({ target: ROW }), effect({ item: '02', target: 'artifact:COPY#copy-keys/app.copy.done' })]);
  f.change('copy.md', (doc) => { doc.fm.sources = [{ type: 'meeting', ref: INPUT }]; });
  const before = f.run().sources[0];
  assert.deepEqual(before.selection.items, ['01']);
  assert.deepEqual(before.connections.map((entry) => [entry.item_id, entry.target, entry.contracts]),
    [['01', 'artifact:DOC#rules', ['artifact:DOC#rules']]]);
  f.change('copy.md', (doc) => { doc.body = copyKeys(deleted); });
  for (const out of [f.run(), resolveScopedSourceProjection(f.options())]) {
    const source = out.sources.find((entry) => entry.selection.input_id === INPUT);
    assert.deepEqual(source.selection.items, ['01', '02']);
    assert.deepEqual(source.connections.filter((entry) => entry.item_id === '01'), before.connections,
      'Item 01 must not gain a connection through the fallback root its own sibling effect introduced');
    assert.ok(source.connections.some((entry) => entry.item_id === '02'), 'new Item witnesses are recorded when first discovered');
    assert.deepEqual(source.issues, []);
  }
});

test('#293 distinct historical effects may share one fallback witness without losing either original target', (t) => {
  const f = fixture(t), secondKey = 'app.copy.secondLabel', second = `${SECTION}/${secondKey}`;
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts = [SECTION]; });
  f.change('copy.md', (doc) => {
    doc.fm.sources = [{ type: 'meeting', ref: INPUT }];
    doc.body = copyKeys([...kept, [secondKey, 'Another close', 'draft']]);
  });
  f.register([effect({ target: ROW }), effect({ target: second })]);
  assert.equal(f.run().sources[0].connections.length, 2, 'the two original row effects are distinct and valid');
  f.change('copy.md', (doc) => { doc.body = copyKeys(deleted); });
  const original = fs.readFileSync(f.registerFile);
  for (const out of [f.run(), resolveScopedSourceProjection(f.options())]) {
    assert.deepEqual(effects(out).map((entry) => entry.fields.target).sort(), [ROW, second].sort());
    assert.deepEqual(effects(out).map((entry) => entry.target.ref), [SECTION, SECTION]);
    assert.equal(out.sources[0].connections.length, 1, 'equivalent derived witnesses are one fact');
    assert.equal(out.sources[0].connections[0].target, SECTION);
    assert.deepEqual(out.target_fallbacks.map((entry) => entry.original_ref).sort(), [ROW, second].sort());
  }
  const projected = f.project();
  assert.equal(projected.projection.units[0].sources[0].groups[0].effects.length, 2);
  assert.equal(projected.projection.evidence.nodes.filter((node) => node.ref === SECTION).length, 1);
  assert.equal(projected.target_fallbacks.length, 2);
  assert.deepEqual(fs.readFileSync(f.registerFile), original);
});

test('#293 newly inferred anchors join only a retained effect witness after fallback', (t) => {
  for (const sameEvidence of [true, false]) {
    const f = fixture(t, { native: false, explicit: true }), current = effect(), retired = effect({ target: ROW });
    const added = sameEvidence ? `input:${INPUT}#extracted-facts` : inputRef('02');
    if (sameEvidence) current[6] = added;
    retired[6] = added; f.register([current, retired]);
    f.change('copy.md', (doc) => { doc.body = copyKeys(deleted); });
    for (const out of [f.run(), resolveScopedSourceProjection(f.options())]) {
      const source = out.sources[0];
      assert.deepEqual(source.selection.source_refs, [inputRef(), added].sort());
      assert.equal(source.connections.length, 1);
      assert.equal(source.connections[0].target, 'artifact:DOC#rules');
      assert.deepEqual(source.connections[0].source_refs, sameEvidence ? [inputRef(), added].sort() : [inputRef()]);
      assert.deepEqual(source.issues, sameEvidence ? [] : [{ ref: added, reason: 'source-anchor-unconnected' }],
        'a new anchor supported only by the Item\'s own fallback target remains disconnected');
    }
  }
});

for (const variant of ['direct-row', 'direct-section', 'body-row']) test(`#293 current ${variant} references remain hard errors`, (t) => {
  const f = fixture(t); f.change('copy.md', (doc) => { doc.body = variant === 'direct-section' ? '## Notes\nNo copy section.' : copyKeys(deleted); });
  if (variant === 'body-row') f.change('contract.md', (doc) => { doc.body = doc.body.replace('Known contract.', `See ${ROW}`); });
  else f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts.push(variant === 'direct-row' ? ROW : SECTION); });
  assert.throws(() => f.run(), /SW-REF-MISSING/);
  assert.throws(() => f.project(), /SW-REF-MISSING/);
});

for (const [name, body] of [
  ['duplicate raw rows', copyKeys([...kept, [KEY, 'Other close', 'draft']])],
  ['duplicate H2 sections', `${copyKeys(deleted)}\n\n## Copy Keys\nDifferent duplicate section.`],
  ['duplicate H3 sections', '## Details\n### Copy Keys\nFirst.\n### Copy Keys\nSecond.'],
]) test(`#293 historical fallback does not swallow ${name}`, (t) => {
  const f = fixture(t); f.change('copy.md', (doc) => { doc.body = body; });
  assert.throws(() => f.run(), /SW-REF-AMBIGUOUS/);
});

test('#293 missing artifact, typed child and canonical mapping identity are never retired-row fallbacks', (t) => {
  const f = fixture(t);
  f.write('mapping.md', { artifact_id: 'MAP', artifact_type: 'figma-component-mapping', screen_id: 'RESULT-002',
    domain: 'result', status: 'draft', provenance_contract: 1 },
  `## Component Mapping\n${table(COMPONENT_MAPPING_COLUMNS, [['\`M-001\` · first', 'First', 'src/First.tsx', 'kept']])}\n\n` +
    `## Mapping Provenance\n${table(MAPPING_PROVENANCE_COLUMNS, [['M-001', 'figma://file/retired/node/1:1', 'node', 'inherit', inputRef()]])}`);
  const resolver = createScopedReferenceResolver(f.options());
  assert.equal(resolver.contract('artifact:MAP#component-mapping/M-001').selection.key, 'M-001');
  for (const token of ['artifact:MISSING#copy-keys/key', 'unknown:U-MISSING@COPY', 'decision:D-MISSING@COPY',
    'artifact:MAP#component-mapping/M-999', 'artifact:MAP#mapping-provenance/M-999']) {
    assert.throws(() => resolver.historicalTarget(token), /SW-REF-(?:MISSING|MAPPING)/, token);
  }
});

// This test is also copied unchanged beside the packed runtime by the existing
// scoped-work-packed harness. Every spawned CLI and template comes from that
// runtime's KIT_ROOT; no source checkout modules are overlaid onto the payload.
test('#293 CLI: binding-status reports retired targets, preserves unaffected owner bytes and remains read-only', (t) => {
  const f = fixture(t); f.binding();
  const other = 'screen:OTHER-001', docsDir = 'docs/frontend-workflow', register = `${docsDir}/_meta/reconciliation-register.md`;
  const read = (name) => fs.readFileSync(path.join(f.root, name), 'utf8');
  const put = (name, content) => {
    const file = path.join(f.root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content);
  };
  f.write('other.md', { artifact_id: 'OTHER', artifact_type: 'screen-spec', screen_id: 'OTHER-001', domain: 'other',
    status: 'draft', screen_entry: 'src/features/other/screens/Other.tsx', work_execution: { version: 1,
      units: [{ id: 'other', kind: 'behavior', contracts: ['artifact:OTHER#rules'], sources: [] }] } }, '## Rules\nUnrelated current owner contract.');
  const overlay = JSON.parse(read('.kit/adoption.yaml')); overlay.work_execution.owners.push(other);
  put('.kit/adoption.yaml', JSON.stringify(overlay));
  for (const [name, file] of f.docs) {
    put(`${docsDir}/${name}`, fs.readFileSync(file)); fs.unlinkSync(file);
  }
  for (const [name, file] of f.inputs) {
    put(`${docsDir}/inputs/${name}`, fs.readFileSync(file)); fs.unlinkSync(file);
  }
  put(register, fs.readFileSync(f.registerFile)); fs.unlinkSync(f.registerFile);
  put('frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: .kit/adoption.yaml\n');
  for (const [name, source] of [['policy', 'policies/implementation-mode-policy.yaml'],
    ['manifest', 'catalog/artifact-manifest.yaml'], ['layout', 'presets/expo-feature.yaml']]) {
    put(`.kit/${name}.yaml`, fs.readFileSync(path.join(KIT_ROOT, source)));
  }
  put('src/features/result/screens/Result.tsx', 'export const Result = null;\n');
  put('src/features/other/screens/Other.tsx', 'export const Other = null;\n');
  const git = (...args) => execFileSync('git', args, { cwd: f.root, encoding: 'utf8' });
  git('init', '-q'); git('config', 'maintenance.auto', 'false'); git('config', 'gc.auto', '0');
  git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'test');
  const commit = (message) => { git('add', '-A'); git('commit', '-qm', message); };
  commit('adopt two owners with a historical row target');
  const status = (...args) => spawnSync(process.execPath, [path.join(KIT_ROOT, 'scripts/binding-status.mjs'),
    '--root', f.root, '--docs', docsDir, '--src', 'src', '--policy', '.kit/policy.yaml', '--manifest', '.kit/manifest.yaml',
    '--layout', '.kit/layout.yaml', ...args], { cwd: f.root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 60000 });
  const json = (...args) => {
    const run = status(...args, '--json'); assert.equal(run.error, undefined); assert.equal(run.status, 0, run.stderr || run.stdout);
    return JSON.parse(run.stdout);
  };
  const before = json(), originalItems = read(register);
  assert.ok(before.owners.every((entry) => !Object.hasOwn(entry, 'target_fallbacks')));
  const otherBefore = before.owners.find((entry) => entry.owner === other);
  const ownerBefore = before.owners.find((entry) => entry.owner === OWNER);
  const copy = splitFrontmatter(read(`${docsDir}/copy.md`));
  put(`${docsDir}/copy.md`, md(copy.data, copyKeys(deleted))); commit('remove the former copy key');
  const report = json(), owner = report.owners.find((entry) => entry.owner === OWNER);
  assert.equal(report.approval_verified, false);
  assert.equal(owner.target_fallbacks.length, 1, 'the same fallback is reported once across closure and binding passes');
  const warning = owner.target_fallbacks[0];
  assert.deepEqual([warning.owner, warning.unit, warning.code, warning.file, warning.input_id, warning.item_id,
    warning.original_ref, warning.effective_ref, warning.reason],
  [OWNER, 'known', 'SW-SOURCE-TARGET-FALLBACK', register, INPUT, '01', ROW, SECTION, 'missing-row']);
  assert.deepEqual(report.owners.find((entry) => entry.owner === other), otherBefore, 'an unaffected owner keeps all report fields and basis bytes');
  assert.notEqual(owner.rows.find((entry) => entry.ref === DECISION).computed_basis_digest,
    ownerBefore.rows.find((entry) => entry.ref === DECISION).computed_basis_digest);
  const text = status('--owner', OWNER); assert.equal(text.status, 0, text.stderr || text.stdout);
  assert.match(text.stdout, /SW-SOURCE-TARGET-FALLBACK/); assert.ok(text.stdout.includes(ROW)); assert.ok(text.stdout.includes(SECTION));
  assert.deepEqual(json('--owner', OWNER).owners, [owner]);
  assert.equal(read(register), originalItems); assert.equal(git('status', '--porcelain'), '');

  put(`${docsDir}/copy.md`, md(copy.data, '## Notes\nThe copy section is gone.')); commit('remove the former copy section');
  const whole = json('--owner', OWNER).owners[0].target_fallbacks[0];
  assert.deepEqual([whole.original_ref, whole.effective_ref, whole.reason], [ROW, 'artifact:COPY', 'missing-section']);
  assert.equal(read(register), originalItems); assert.equal(git('status', '--porcelain'), '');

  const screen = splitFrontmatter(read(`${docsDir}/screen.md`)); screen.data.work_execution.units[0].contracts.push(ROW);
  put(`${docsDir}/screen.md`, md(screen.data, screen.body)); commit('select the missing row as a current contract');
  const strict = status('--owner', OWNER, '--json'); assert.equal(strict.status, 2, strict.stderr || strict.stdout);
  assert.match(strict.stderr, /SW-REF-MISSING/); assert.equal(git('status', '--porcelain'), '');
});
