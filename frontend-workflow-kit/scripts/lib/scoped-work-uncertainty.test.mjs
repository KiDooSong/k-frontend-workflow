import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KIT_ROOT, splitFrontmatter } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { parseReconciliationReferenceView, reconciliationParseStats } from './reconciliation-markdown-ast.mjs';
import { scopedGraphSelectionSpans } from './scoped-work-graph.mjs';
import { resolveScopedUncertaintyProjection } from './scoped-work-uncertainty.mjs';
import { resolveScopedApplicabilityProjection } from './scoped-work-applicability.mjs';
import { scopedUncertaintyScopes, scopedUncertaintyDenials, inspectScopedUncertaintyScopes } from './scoped-work-uncertainty-scopes.mjs';
import { inspectScopedProfile } from './scoped-work-profiles.mjs';

const OWNER = 'screen:RESULT-001';
const layout = loadLayoutProfile({ kitRoot: KIT_ROOT });
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((cells) => `| ${cells.join(' | ')} |`)].join('\n');
const unknowns = (rows) => `## Unknowns\n${table(['ID', 'Question'], rows)}`;
const conflicts = (rows) => `## Conflicts\n${table(['ID', 'Description', 'Status'], rows)}`;
const unit = (id = 'known', contracts = ['artifact:RULES#rules']) => ({ id, kind: 'behavior', contracts, sources: [] });
const screen = (id = 'RESULT-001') => ({ artifact_id: `SCREEN-${id}`, artifact_type: 'screen-spec', screen_id: id,
  domain: 'result', status: 'draft', screen_entry: `src/features/result/screens/${id}.tsx`,
  work_execution: { version: 1, units: [unit(), unit('other', ['artifact:RULES#other'])] } });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-uncertainty-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs'); const docs = new Map();
  // #257: the base policy never adopts; adopt() rewrites the policy overlay.
  const policyFile = path.join(root, 'policy.yaml'), overlayFile = path.join(root, 'adoption.yaml');
  fs.writeFileSync(policyFile, JSON.stringify({}));
  const adopt = (owners = [OWNER]) => fs.writeFileSync(overlayFile, JSON.stringify({ work_execution: {
    version: 1, owners, profiles: ['behavior'],
    role_limits: { behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [],
  } }));
  const write = (name, fm, body) => {
    assert.ok(![...docs.keys()].some((other) => other !== name && other.toLowerCase() === name.toLowerCase()));
    const file = path.join(docsDir, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, md(fm, body)); docs.set(name, file); return file;
  };
  const change = (name, update) => {
    const file = docs.get(name); const parsed = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const doc = { fm: parsed.data, body: parsed.body }; update(doc); fs.writeFileSync(file, md(doc.fm, doc.body));
  };
  const evidence = (body, domain = 'other') => write('uncertainty.md', {
    artifact_id: 'UNCERTAINTY', artifact_type: 'domain-rules', domain, status: 'draft',
  }, body);
  adopt(); write('screen.md', screen(), '## Notes\nOwner housekeeping.');
  write('rules.md', { artifact_id: 'RULES', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed' },
    '## Rules\nKnown behavior.\n\n### Nested\nNested contract.\n\n## Other\nOther behavior.');
  const options = (owner = OWNER) => ({ owner, policyFile, policyOverlayFile: overlayFile, docsDir, projectRoot: root, layout,
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) =>
      ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }) });
  return { root, docs, write, change, evidence, adopt, options,
    run: (owner = OWNER) => resolveScopedUncertaintyProjection(options(owner)) };
}
const relations = (out) => out.projection.uncertainty_relations;
const applications = (out, id) => relations(out).applications.filter((entry) => entry.uncertainty.includes(`:${id}@`));
const recordIds = (out) => relations(out).records.map((entry) => entry.selection.key).sort();
const generated = (body) => `<!-- GENERATED:START summary -->\n\n${body}\n\n<!-- GENERATED:END summary -->`;
const mixedUnknowns = (rawRows, authoredRows) => `## Unknowns\n\n${generated(
  `${table(['ID', 'Question', 'Status'], rawRows)}\n\n## Generated Summary\n\nOutput text.`)}\n\n` +
  table(['ID', 'Question', 'Status'], authoredRows);

function fullOptions(f) {
  const layoutFile = path.join(f.root, 'layout.yaml'), manifestFile = path.join(f.root, 'manifest.yaml');
  fs.writeFileSync(layoutFile, JSON.stringify({ roles: {
    screen: ['src/features/{domain}/screens/**'], domain_component: ['src/features/{domain}/components/**'],
    hook: ['src/features/{domain}/hooks/**'], api_client: ['src/api/**'], test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'],
  } }));
  fs.writeFileSync(manifestFile, JSON.stringify({ version: 1, artifacts: {} }));
  return { ...f.options(), kitRoot: f.root, layoutFile, manifestFile, inputArtifacts: [], origin_inputs: [], coverage_reports: [] };
}

test('#284 uncertainty: a selected raw GENERATED Unknown remains an open blocker beside an authored Unknown', (t) => {
  const f = fixture(t), ref = 'unknown:U-GENERATED@UNCERTAINTY';
  f.evidence(mixedUnknowns([['U-GENERATED', 'Selected generated question?', 'open']],
    [['U-AUTHORED', 'Unrelated authored question.', 'resolved']]));
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts = [ref]; fm.api_required = false; });
  const options = fullOptions(f), out = resolveScopedUncertaintyProjection(options);
  assert.deepEqual(recordIds(out), ['U-GENERATED']);
  assert.deepEqual(applications(out, 'U-GENERATED').map((entry) => [entry.unit, entry.relation]), [['known', 'selected-evidence']]);
  const record = relations(out).records[0], body = options.targetIndex.artifacts.get('UNCERTAINTY').body;
  assert.deepEqual(record.selection.cells, ['U-GENERATED', 'Selected generated question?', 'open']);
  const spans = scopedGraphSelectionSpans(body, parseReconciliationReferenceView(body), record.selection);
  assert.ok(spans.every(([start, end]) => start >= body.indexOf('| U-GENERATED |') && end < body.indexOf('## Generated Summary')));
  const scopes = scopedUncertaintyScopes(options, out.projection, out.read_set);
  assert.deepEqual(scopes.checks.map((check) => [check.uncertainty, check.binding_state, check.status, check.blocking_units]),
    [[ref, 'missing', 'open', ['known']]]);
  assert.equal(scopedUncertaintyDenials(scopes, 'known').length, 1);
  assert.equal(scopedUncertaintyDenials(scopes, 'other').length, 0);

  const applied = resolveScopedApplicabilityProjection(options);
  assert.deepEqual(recordIds(applied), ['U-GENERATED'], 'the fixpoint must re-expand the same raw row');
  const profile = inspectScopedProfile({ ...options, unit: 'known' });
  assert.deepEqual(profile.denials.filter((entry) => entry.code === 'unit-uncertainty-unresolved').map((entry) => entry.application.uncertainty), [ref]);
});

const unknownSelections = [['row', '#unknowns/GENERATED-KEY'], ['section', '#unknowns'], ['body', '']];
for (const [selection, suffix] of unknownSelections) test(`#284 uncertainty: artifact ${selection} selection keeps mixed GENERATED Unknown blocking without a GENERATED H2`, (t) => {
  for (const generatedFirst of [false, true]) for (const newline of ['\n', '\r\n']) {
    const f = fixture(t), ref = 'unknown:U-GENERATED@UNCERTAINTY';
    const contract = `artifact:UNCERTAINTY${suffix}`;
    // The artifact key and canonical ID are deliberately different columns.
    const headers = ['Key', 'ID', 'Question', 'Status'];
    const raw = generated(table(headers, [['GENERATED-KEY', 'U-GENERATED', 'Selected generated question?', 'open']]));
    const authored = table(headers, [['AUTHORED-KEY', 'U-AUTHORED', 'Independent question.', 'resolved']]);
    f.evidence(`## Unknowns\n\n${(generatedFirst ? [raw, authored] : [authored, raw]).join('\n\n')}`.replace(/\n/g, newline));
    f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts = [contract]; fm.api_required = false; });
    const options = fullOptions(f), out = resolveScopedUncertaintyProjection(options);
    const expected = selection === 'row' ? ['U-GENERATED'] : ['U-AUTHORED', 'U-GENERATED'];
    assert.deepEqual(recordIds(out), expected);
    assert.deepEqual(applications(out, 'U-GENERATED').map((entry) => [entry.unit, entry.relation]), [['known', 'selected-evidence']]);
    const selected = out.projection.evidence.nodes.find((node) => node.ref === contract);
    const record = relations(out).records.find((node) => node.ref === ref);
    const body = options.targetIndex.artifacts.get('UNCERTAINTY').body, view = parseReconciliationReferenceView(body);
    assert.equal(record.ref, ref);
    assert.deepEqual(record.selection.cells, ['GENERATED-KEY', 'U-GENERATED', 'Selected generated question?', 'open']);
    const rowSpans = scopedGraphSelectionSpans(body, view, record.selection);
    const selectedSpans = scopedGraphSelectionSpans(body, view, selected.selection);
    assert.ok(rowSpans.length > 0 && rowSpans.every(([start, end]) =>
      selectedSpans.some(([a, b]) => a <= start && end <= b)), 'the whole physical row belongs to the selected contract');
    assert.ok(rowSpans.every(([start, end]) => body.indexOf('| GENERATED-KEY |') <= start &&
      end <= body.indexOf('<!-- GENERATED:END summary -->')), 'the canonical row remains inside its original GENERATED block');
    if (selection === 'row') assert.deepEqual(rowSpans, selectedSpans);
    const scopes = scopedUncertaintyScopes(options, out.projection, out.read_set);
    assert.deepEqual(scopes.checks.filter((check) => check.uncertainty === ref)
      .map((check) => [check.uncertainty, check.binding_state, check.status, check.blocking_units]),
      [[ref, 'missing', 'open', ['known']]]);
    assert.equal(scopedUncertaintyDenials(scopes, 'known').length, 1);
    assert.equal(scopedUncertaintyDenials(scopes, 'other').length, 0);
    const applied = resolveScopedApplicabilityProjection(options);
    assert.deepEqual(recordIds(applied), expected, 'derived canonical roots must retain the artifact-selected rows');
    const profile = inspectScopedProfile({ ...options, unit: 'known' });
    assert.deepEqual(profile.denials.filter((entry) => entry.code === 'unit-uncertainty-unresolved').map((entry) => entry.application.uncertainty), [ref]);
  }
});

test('#284 uncertainty: an artifact-selected mixed GENERATED row keeps its transitive open Unknown', (t) => {
  const f = fixture(t);
  f.evidence(`## Unknowns\n\n${table(['ID', 'Question', 'Status'], [['U-NEXT', 'Still unresolved?', 'open']])}\n\n` +
    generated(table(['ID', 'Question', 'Status'], [['U-GENERATED', 'See unknown:U-NEXT@UNCERTAINTY', 'open']])));
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts = ['artifact:UNCERTAINTY#unknowns/U-GENERATED']; fm.api_required = false; });
  const options = fullOptions(f), out = resolveScopedApplicabilityProjection(options);
  assert.deepEqual(recordIds(out), ['U-GENERATED', 'U-NEXT']);
  for (const id of ['U-GENERATED', 'U-NEXT']) {
    assert.deepEqual(applications(out, id).map((entry) => [entry.unit, entry.relation]), [['known', 'selected-evidence']]);
  }
  const profile = inspectScopedProfile({ ...options, unit: 'known' });
  assert.deepEqual(profile.denials.filter((entry) => entry.code === 'unit-uncertainty-unresolved')
    .map((entry) => entry.application.uncertainty).sort(), ['unknown:U-GENERATED@UNCERTAINTY', 'unknown:U-NEXT@UNCERTAINTY']);
});

test('#284 uncertainty: a selected mixed row with an ambiguous canonical ID fails instead of disappearing', (t) => {
  for (const suffix of ['#unknowns/GENERATED', '#unknowns', '']) {
    const f = fixture(t), headers = ['Key', 'ID', 'Question', 'Status'];
    f.evidence(`## Unknowns\n\n${table(headers, [['AUTHOR', 'U-SHARED', 'Same question.', 'open']])}\n\n` +
      generated(table(headers, [['GENERATED', 'U-SHARED', 'Same question.', 'open']])));
    f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts = [`artifact:UNCERTAINTY${suffix}`]; });
    assert.throws(() => f.run(), /SW-REF-AMBIGUOUS/);
  }
});

test('#284 uncertainty: selected generated-only duplicate canonical tables fail closed', (t) => {
  for (const suffix of ['#unknowns/U-GENERATED', '#unknowns', '']) {
    const f = fixture(t);
    f.evidence(`## Unknowns\n\n${generated(table(['ID', 'Question', 'Status'], [['U-GENERATED', 'Selected?', 'open']]))}\n\n` +
      generated(table(['ID', 'Question', 'Status'], [['U-OTHER', 'Other?', 'open']])));
    f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts = [`artifact:UNCERTAINTY${suffix}`]; });
    assert.throws(() => f.run(), /SW-(UNCERTAINTY|REF-AMBIGUOUS)/);
  }
});

test('#284 uncertainty: unselected duplicate GENERATED legends do not become canonical candidates', (t) => {
  for (const contract of ['artifact:RULES#rules', 'artifact:UNCERTAINTY#notes', 'artifact:UNCERTAINTY#unknowns/U-AUTHORED']) {
    const f = fixture(t), legend = generated(table(['ID', 'Question', 'Status'], [['U-LEGEND', 'Display only.', 'open']]));
    f.evidence(`## Unknowns\n\n${legend}\n\n${table(['ID', 'Question', 'Status'], [['U-AUTHORED', 'Reviewed.', 'resolved']])}\n\n${legend}\n\n## Notes\nSelected notes.`, 'result');
    f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts = [contract]; });
    const out = resolveScopedApplicabilityProjection(fullOptions(f));
    assert.deepEqual(recordIds(out), ['U-AUTHORED']);
    assert.ok(relations(out).records.every((row) => row.status === 'resolved'));
  }
});

test('#284 uncertainty: section and body selections retain both sides of a GENERATED heading', (t) => {
  for (const suffix of ['#unknowns', '']) {
    const f = fixture(t);
    f.evidence(mixedUnknowns([['U-GENERATED', 'Selected generated question?', 'open']],
      [['U-AUTHORED', 'Independent authored question.', 'resolved']]));
    f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts = [`artifact:UNCERTAINTY${suffix}`]; });
    const out = resolveScopedApplicabilityProjection(fullOptions(f));
    assert.deepEqual(recordIds(out), ['U-AUTHORED', 'U-GENERATED']);
    for (const id of ['U-AUTHORED', 'U-GENERATED']) {
      assert.deepEqual(applications(out, id).map((entry) => [entry.unit, entry.relation]), [['known', 'selected-evidence']]);
    }
    // Equal cells do not make the two original rows interchangeable.
    f.change('uncertainty.md', (doc) => { doc.body = mixedUnknowns([['U-SHARED', 'Same question.', 'open']],
      [['U-SHARED', 'Same question.', 'open']]); });
    assert.throws(() => f.run(), /ambiguous|inconsistent selected evidence/i);
  }
});

test('#284 uncertainty: broad selections retain covered mixed Unknowns and ignore template placeholders', (t) => {
  for (const contract of ['artifact:UNCERTAINTY#unknowns', 'artifact:UNCERTAINTY',
    'investigation:INV-SCAN@UNCERTAINTY', 'verification:VER-SCAN@UNCERTAINTY']) {
    const f = fixture(t), headers = ['ID', 'Question', 'Status'];
    f.evidence('## Notes\nINV-SCAN and VER-SCAN\n\n## Unknowns\n\n' +
      table(headers, [['U-AUTHORED', 'Reviewed.', 'resolved']]) + '\n\n' + generated(table(headers,
        [['{UNKNOWN-ID}', 'Template question.', ''], ['U-GENERATED', 'Covered question?', 'open']])));
    f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts = [contract]; });
    const options = fullOptions(f), out = resolveScopedApplicabilityProjection(options);
    assert.deepEqual(recordIds(out), ['U-AUTHORED', 'U-GENERATED']);
    assert.deepEqual(applications(out, 'U-GENERATED').map((entry) => [entry.unit, entry.relation]), [['known', 'selected-evidence']]);
    const scopes = scopedUncertaintyScopes(options, out.projection, out.read_set);
    assert.deepEqual(scopedUncertaintyDenials(scopes, 'known').map((entry) => entry.uncertainty),
      ['unknown:U-GENERATED@UNCERTAINTY']);
  }
});

test('#284 uncertainty: formatted display headers do not invent canonical Unknowns in a selected section or body', (t) => {
  for (const suffix of ['#unknowns', '']) for (const headers of [['**ID**', 'Question', 'Status'], ['ID', '**Question**', 'Status']]) {
    const f = fixture(t);
    f.evidence('## Unknowns\n\n' + table(['ID', 'Question', 'Status'], [['U-AUTHORED', 'Reviewed.', 'resolved']]) + '\n\n' +
      generated(table(headers, [['U-DISPLAY', 'Formatted display question.', 'open']])));
    f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts = [`artifact:UNCERTAINTY${suffix}`]; });
    const options = fullOptions(f), out = resolveScopedApplicabilityProjection(options);
    assert.deepEqual(recordIds(out), ['U-AUTHORED']);
    assert.deepEqual(scopedUncertaintyDenials(scopedUncertaintyScopes(options, out.projection, out.read_set), 'known'), []);
  }
});

// #285: a retained formatted or setext H2 with the native `unknowns` slug is a
// real second home beside a literal `## Unknowns`. Its open row must not vanish
// from enumeration while the literal home's resolved row passes; a GENERATED
// heading of the same form remains display output inside the authored home.
test('#285 uncertainty: a real formatted duplicate Unknowns H2 fails instead of dropping its open row', (t) => {
  const headers = ['ID', 'Question', 'Status'];
  const resolved = `## Unknowns\n\n${table(headers, [['U-RESOLVED', 'Settled?', 'resolved']])}`;
  const open = ['U-OPEN', 'Still open?', 'open'];
  for (const [name, artifact, contract] of [['screen.md', 'SCREEN-RESULT-001', null], ['uncertainty.md', 'UNCERTAINTY', 'artifact:UNCERTAINTY']]) {
    const setup = (unknownsBody) => {
      const f = fixture(t), body = `## Notes\nOwner.\n\n${unknownsBody}`;
      if (name === 'uncertainty.md') f.evidence(body); else f.change(name, (doc) => { doc.body = body; });
      if (contract) f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts = [contract]; });
      return f;
    };
    for (const heading of ['## **Unknowns**', 'Unknowns\n--------']) for (const duplicateFirst of [false, true]) {
      const duplicate = `${heading}\n\n${table(headers, [open])}`;
      const f = setup((duplicateFirst ? [duplicate, resolved] : [resolved, duplicate]).join('\n\n'));
      assert.throws(() => f.run(), /SW-REF-AMBIGUOUS/, `${name} ${heading}`);
      assert.throws(() => inspectScopedUncertaintyScopes(fullOptions(f)), /SW-REF-AMBIGUOUS/, `${name} ${heading}`);
    }
    const f = setup(`${resolved.replace('| resolved |', '| resolved |\n| U-OPEN | Still open? | open |')}\n\n` +
      generated('## **Unknowns**\n\nGenerated display text.'));
    const checks = inspectScopedUncertaintyScopes(fullOptions(f)).checks;
    assert.deepEqual(checks.map((check) => [check.uncertainty, check.status]),
      [[`unknown:U-OPEN@${artifact}`, 'open'], [`unknown:U-RESOLVED@${artifact}`, 'resolved']], name);
    assert.ok(checks[0].blocking_units.includes('known'), `${name}: the authored open Unknown still blocks its unit`);
  }
});

test('#284 uncertainty: raw generated native and inverse rows remain candidates when another authored table exists', (t) => {
  for (const [domain, question, relation] of [
    ['result', 'Unscoped generated question?', 'scope-review-needed'],
    ['other', 'See artifact:RULES#rules', 'inverse-evidence'],
  ]) {
    const f = fixture(t);
    f.evidence(mixedUnknowns([['U-GENERATED', question, 'open']], [['U-AUTHORED', 'Other authored question.', 'resolved']]), domain);
    const out = f.run();
    assert.equal(applications(out, 'U-GENERATED').find((entry) => entry.unit === 'known')?.relation, relation);
    assert.equal(relations(out).records.find((record) => record.selection.key === 'U-GENERATED')?.status, 'open');
  }
});

test('#284 uncertainty: additive raw roots are not reclassified from another authored row in their document', (t) => {
  const f = fixture(t), ref = 'unknown:U-GENERATED@UNCERTAINTY';
  f.evidence(mixedUnknowns([['U-GENERATED', 'See artifact:RULES#rules', 'open']], [['U-AUTHORED', 'Other authored question.', 'resolved']]));
  const out = resolveScopedUncertaintyProjection(f.options(), [{ owner: OWNER, unit: 'known', ref }]);
  const selected = out.projection.decision_relations.evidence.nodes.find((node) => node.ref === ref);
  assert.deepEqual(selected?.selection.cells, ['U-GENERATED', 'See artifact:RULES#rules', 'open']);
  assert.equal(applications(out, 'U-GENERATED').find((entry) => entry.unit === 'known')?.relation, 'inverse-evidence');
});

test('#284 uncertainty: equal refs retain separate physical candidates until both sources apply', (t) => {
  const f = fixture(t), ref = 'unknown:U-SHARED@UNCERTAINTY';
  const row = ['U-SHARED', 'Same question.', 'open'];
  f.evidence(mixedUnknowns([row], [row]));
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts = [ref]; });
  const out = f.run();
  assert.deepEqual(recordIds(out), ['U-SHARED'], 'an unrelated authored source does not erase or replace an ordinary raw selection');
  const body = f.options().targetIndex.artifacts.get('UNCERTAINTY').body;
  const spans = scopedGraphSelectionSpans(body, parseReconciliationReferenceView(body), relations(out).records[0].selection);
  assert.ok(spans.every(([, end]) => end < body.indexOf('## Generated Summary')));
  f.change('uncertainty.md', ({ fm }) => { fm.domain = 'result'; });
  assert.throws(() => f.run(), /ambiguous|inconsistent selected evidence/i,
    'when both native physical rows apply, identical cells must not allow a ref-key merge');
});

test('D uncertainty: selected actual Unknown content belongs to its consuming unit, without a permit or new status', (t) => {
  const f = fixture(t); f.evidence(unknowns([['U-ONE', 'What happens next?']]));
  f.change('rules.md', (doc) => { doc.body = doc.body.replace('Known behavior.', 'See unknown:U-ONE@UNCERTAINTY'); });
  const before = [...f.docs.values()].map((file) => fs.readFileSync(file));
  const out = f.run();
  assert.deepEqual(recordIds(out), ['U-ONE']);
  assert.deepEqual(applications(out, 'U-ONE').map((entry) => [entry.unit, entry.relation]), [['known', 'selected-evidence']]);
  assert.equal(relations(out).records[0].status, null);
  for (const key of ['basis_digest', 'basis_version', 'allowed', 'ready', 'approval_ref']) {
    assert.equal(Object.hasOwn(out, key), false); assert.equal(Object.hasOwn(out.projection, key), false);
  }
  assert.deepEqual([...f.docs.values()].map((file) => fs.readFileSync(file)), before);
});

test('D uncertainty: inverse typed dependency is collected even when no selected contract lists that Unknown', (t) => {
  const f = fixture(t); f.evidence(unknowns([['U-REVERSE', 'Check artifact:RULES#rules']]));
  const out = f.run();
  assert.deepEqual(applications(out, 'U-REVERSE').map((entry) => [entry.unit, entry.relation]), [['known', 'inverse-evidence']]);
  assert.deepEqual(applications(out, 'U-REVERSE')[0].witnesses,
    [{ dependency: 'artifact:RULES#rules', selected: 'artifact:RULES#rules' }]);
  assert.equal(out.projection.evidence.nodes.some((node) => node.kind === 'unknown'), false);
});

test('#284 uncertainty: two references to the same empty section still establish an inverse relation', (t) => {
  const f = fixture(t);
  f.change('rules.md', (doc) => { doc.body = '## Rules\n\n## Other\nOther behavior.'; });
  f.evidence(unknowns([['U-EMPTY', 'See artifact:RULES#rules']]));
  assert.deepEqual(applications(f.run(), 'U-EMPTY').map((entry) => [entry.unit, entry.relation]), [['known', 'inverse-evidence']]);
});

test('D uncertainty: inverse H2 selections retain child content and intersect whole bodies, not sibling sections', (t) => {
  const f = fixture(t); f.evidence(unknowns([['U-NESTED', 'See artifact:RULES#nested']]));
  // A section-only authored H3 now resolves independently and still overlaps
  // the parent's unchanged selection; the sibling remains outside it.
  const nested = f.run();
  assert.deepEqual(applications(nested, 'U-NESTED').map((entry) => [entry.unit, entry.relation]), [['known', 'inverse-evidence']]);
  assert.equal(relations(nested).evidence.nodes.find((node) => node.ref === 'artifact:RULES#nested').selection.content,
    'Nested contract.\n\n');
  f.evidence(unknowns([['U-NESTED', 'See artifact:RULES#rules']]));
  const before = f.run();
  assert.deepEqual(applications(before, 'U-NESTED').map((entry) => [entry.unit, entry.relation]),
    [['known', 'inverse-evidence']]);
  const selected = (out) => relations(out).evidence.nodes.find((node) => node.ref === 'artifact:RULES#rules');
  assert.match(selected(before).selection.content, /### Nested\nNested contract\./);
  assert.doesNotMatch(selected(before).selection.content, /Other behavior/);
  f.change('rules.md', (doc) => { doc.body = doc.body.replace('Nested contract.', 'Updated nested contract.'); });
  const after = f.run();
  assert.notDeepEqual(selected(after), selected(before));
  assert.deepEqual(applications(after, 'U-NESTED'), applications(before, 'U-NESTED'));
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts = ['artifact:RULES']; });
  f.evidence(unknowns([['U-OTHER', 'See artifact:RULES#other']]));
  assert.deepEqual(applications(f.run(), 'U-OTHER').map((entry) => entry.unit).sort(), ['known', 'other']);
});

test('D uncertainty: inverse raw row identities stay exact and do not match prefix lookalikes', (t) => {
  const f = fixture(t);
  f.change('rules.md', (doc) => { doc.body = `## Rows\n${table(['ID', 'Value'], [['ROW-1', 'first'], ['ROW-10', 'second']])}`; });
  f.change('screen.md', ({ fm }) => { fm.work_execution.units = [unit('known', ['artifact:RULES#rows/ROW-1']), unit('other', ['artifact:RULES#rows/ROW-10'])]; });
  f.evidence(unknowns([['U-ROW', 'See artifact:RULES#rows/ROW-1']]));
  assert.deepEqual(applications(f.run(), 'U-ROW').map((entry) => entry.unit), ['known']);
});

test('D uncertainty: unscoped native owner rows need review for every known unit; unrelated links are not negative proof', (t) => {
  const f = fixture(t);
  f.change('screen.md', (doc) => { doc.body += `\n\n${unknowns([['U-LOCAL', 'Review artifact:RULES#other']])}`; });
  const out = f.run();
  assert.equal(applications(out, 'U-LOCAL').find((entry) => entry.unit === 'known').relation, 'scope-review-needed');
  assert.equal(applications(out, 'U-LOCAL').find((entry) => entry.unit === 'other').relation, 'inverse-evidence');
  assert.deepEqual(relations(out).scope_review_needed.map((entry) => entry.unit), ['known']);
});

test('D uncertainty: domain/global ambiguity is explicit, never inferred from owner-name prose', (t) => {
  for (const domain of ['result', 'global']) {
    const f = fixture(t); f.evidence(unknowns([['U-SCOPE', 'Maybe RESULT-001 or RESULT-0010.']]), domain);
    const out = f.run(); assert.equal(relations(out).scope_review_needed.length, 2);
    assert.ok(applications(out, 'U-SCOPE').every((entry) => entry.relation === 'scope-review-needed'));
  }
});

// #262: the global conflicts register template's `영향 화면` column.
const register = (f, rows, fm = {}) => f.write('global/conflicts.md', { artifact_id: 'conflicts', artifact_type: 'conflicts', status: 'draft', ...fm },
  `# Conflicts\n\n${table(['ID', '충돌 지점', 'A (출처/값)', 'B (출처/값)', '영향 화면', 'Status'], rows)}`);
const conflict = (id, screens, a = 'Planning value') => [id, `Conflict ${id}`, a, 'Figma value', screens, 'open'];
const relationsOf = (out, id) => applications(out, id).map((entry) => [entry.unit, entry.relation]);

test('D uncertainty: a global Conflict names its owners in 영향 화면; anything but a known ID list keeps every owner (#262)', (t) => {
  // A screen may be called `global` in any letter case; that cell value still names every owner (r1).
  for (const name of ['global', 'GLOBAL']) {
    const f = fixture(t);
    f.write('second.md', screen('RESULT-002'), '## Notes\nAnother screen.');
    f.write('third.md', screen('RESULT-003'), '## Notes\nA third screen.');
    f.write('global-screen.md', screen(name), `## Notes\nA screen whose ID is ${name}.`);
    register(f, [conflict('C-OWN', 'RESULT-001'), conflict('C-LIST', 'RESULT-002 · RESULT-001'),
      conflict('C-OTHER', 'RESULT-002'), conflict('C-DOT', 'RESULT-002 · RESULT-003'), conflict('C-COMMA', 'RESULT-003,RESULT-002'),
      conflict('C-GLOBAL', name), conflict('C-BLANK', ''), conflict('C-PROSE', 'RESULT-002 상단 배너'),
      conflict('C-UNKNOWN', 'RESULT-002, RESULT-009'), conflict('C-CODE', '`RESULT-002`'), conflict('C-EMPTY-ITEM', 'RESULT-002,'),
      conflict('C-COMMENT', 'RESULT-002 <!-- also RESULT-001? -->'), conflict('C-GLOBAL-LIST', `RESULT-002, ${name}`)]);
    const out = f.run(), every = [['known', 'scope-review-needed'], ['other', 'scope-review-needed']];
    for (const id of ['C-OWN', 'C-LIST', 'C-GLOBAL', 'C-GLOBAL-LIST', 'C-BLANK', 'C-PROSE', 'C-UNKNOWN', 'C-CODE',
      'C-EMPTY-ITEM', 'C-COMMENT']) {
      assert.deepEqual(relationsOf(out, id), every, `${name} ${id}`);
    }
    for (const id of ['C-OTHER', 'C-DOT', 'C-COMMA']) {
      assert.deepEqual(relationsOf(out, id), [], id); assert.ok(!recordIds(out).includes(id), id);
    }
  }
});

test('D uncertainty: 영향 화면 leaves a resolved Conflict native to every owner, as before (r2)', (t) => {
  const f = fixture(t);
  f.write('second.md', screen('RESULT-002'), '## Notes\nAnother screen.');
  register(f, [['C-OLD', 'Conflict C-OLD', 'Planning value', 'Figma value', 'RESULT-002', 'resolved'], conflict('C-OPEN', 'RESULT-002')]);
  const out = f.run();
  assert.deepEqual(relationsOf(out, 'C-OLD'), [['known', 'scope-review-needed'], ['other', 'scope-review-needed']]);
  assert.deepEqual(relationsOf(out, 'C-OPEN'), []);
});

test('D uncertainty: 영향 화면 narrows only the native relation; evidence, surface membership and owner specs keep theirs (#262)', (t) => {
  const f = fixture(t);
  f.write('second.md', screen('RESULT-002'), '## Notes\nAnother screen.');
  f.write('panel.md', { artifact_id: 'PANEL', artifact_type: 'shared-surface-spec', surface_id: 'PANEL', domain: 'result',
    status: 'draft', member_screens: ['RESULT-001', 'RESULT-002'], implementation_paths: ['src/features/result/components/panel/**'] }, '## Notes\nShared.');
  register(f, [conflict('C-EVIDENCE', 'RESULT-002', 'See artifact:RULES#rules'), conflict('C-SURFACE', 'PANEL')]);
  // A domain document narrows the same way; an owner's own spec keeps its rows native to it.
  f.evidence(conflicts([['C-DOMAIN', 'Domain conflict', 'open']]).replace('| ID | Description | Status |', '| ID | Description | Status | 영향 화면 |')
    .replace('|---|---|---|', '|---|---|---|---|').replace('| open |', '| open | RESULT-002 |'), 'result');
  f.change('screen.md', (doc) => { doc.body += `\n\n## Conflicts\n${table(['ID', 'Description', '영향 화면', 'Status'], [['C-HOME', 'Home conflict', 'RESULT-002', 'open']])}`; });
  const out = f.run();
  assert.deepEqual(relationsOf(out, 'C-EVIDENCE'), [['known', 'inverse-evidence']]);
  assert.deepEqual(relationsOf(out, 'C-SURFACE'), [['known', 'scope-review-needed'], ['other', 'scope-review-needed']]);
  assert.deepEqual(relationsOf(out, 'C-DOMAIN'), []);
  assert.deepEqual(relationsOf(out, 'C-HOME'), [['known', 'scope-review-needed'], ['other', 'scope-review-needed']]);
});

test('D uncertainty: Unknown IDs need no U- prefix; the canonical table decides the kind (#260)', (t) => {
  const f = fixture(t);
  f.change('screen.md', (doc) => { doc.body += `\n\n${unknowns([['RESULT-001-U001', 'Which order applies?']])}`; });
  f.evidence(unknowns([['OTHER-U001', 'Check artifact:RULES#rules']]));
  const out = f.run();
  assert.deepEqual(recordIds(out), ['OTHER-U001', 'RESULT-001-U001']);
  assert.deepEqual(applications(out, 'RESULT-001-U001').map((entry) => [entry.unit, entry.relation]),
    [['known', 'scope-review-needed'], ['other', 'scope-review-needed']]);
  assert.deepEqual(applications(out, 'OTHER-U001').map((entry) => [entry.unit, entry.relation]), [['known', 'inverse-evidence']]);
});

test('D uncertainty: another screen local row is not borrowed; a shared surface fans out to its selected member', (t) => {
  const f = fixture(t);
  f.write('second.md', screen('RESULT-002'), unknowns([['U-OTHER-HOST', 'Only the other host.']]));
  f.write('panel.md', { artifact_id: 'PANEL', artifact_type: 'shared-surface-spec', surface_id: 'PANEL', domain: 'result',
    status: 'draft', member_screens: ['RESULT-001', 'RESULT-002'], implementation_paths: ['src/features/result/components/panel/**'],
  }, unknowns([['U-SURFACE', 'Shared presentation is unspecified.']]));
  assert.deepEqual(recordIds(f.run()), ['U-SURFACE']);
  assert.ok(applications(f.run(), 'U-SURFACE').every((entry) => entry.owner === OWNER));
});

test('D uncertainty: a surface projection retains each actual host local uncertainty without first-host selection', (t) => {
  const f = fixture(t);
  f.change('screen.md', (doc) => { doc.body += `\n\n${unknowns([['U-FIRST', 'First host question.']])}`; });
  f.write('second.md', screen('RESULT-002'), unknowns([['U-SECOND', 'Second host question.']]));
  f.adopt([OWNER, 'screen:RESULT-002', 'surface:PANEL']);
  f.write('panel.md', { artifact_id: 'PANEL', artifact_type: 'shared-surface-spec', surface_id: 'PANEL', domain: 'result',
    status: 'draft', member_screens: ['RESULT-001', 'RESULT-002'], implementation_paths: ['src/features/result/components/panel/**'],
    work_execution: { version: 1, units: [{ ...unit(), host_units: { 'RESULT-001': 'known', 'RESULT-002': 'known' } }] },
  }, '## Notes\nShared behavior.');
  const out = f.run('surface:PANEL'); assert.deepEqual(recordIds(out), ['U-FIRST', 'U-SECOND']);
  assert.deepEqual(applications(out, 'U-FIRST').map((entry) => entry.owner), [OWNER]);
  assert.deepEqual(applications(out, 'U-SECOND').map((entry) => entry.owner), ['screen:RESULT-002']);
});

test('D uncertainty: cyclic inverse dependencies remain finite and preserve new Decision evidence without approval', (t) => {
  const f = fixture(t);
  f.write('global/open-decisions.md', { artifact_id: 'open-decision-register', artifact_type: 'open-decision-register', status: 'draft' },
    `## Open Decisions\n${table(['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'],
      [['D-LINK', 'Question?', 'A / B', 'api-integrated-ui', 'PM', 'open']])}`);
  f.evidence(`${unknowns([['U-CYCLE', 'See conflict:C-CYCLE@UNCERTAINTY']])}\n\n${conflicts([
    ['C-CYCLE', 'See unknown:U-CYCLE@UNCERTAINTY and artifact:RULES#rules and decision:D-LINK@open-decision-register', 'open'],
  ])}`);
  const out = f.run(); const rel = relations(out);
  assert.deepEqual(recordIds(out), ['C-CYCLE', 'U-CYCLE']);
  assert.equal(new Set(rel.evidence.nodes.map((node) => node.ref)).size, rel.evidence.nodes.length);
  assert.ok(rel.evidence.nodes.some((node) => node.ref === 'decision:D-LINK@open-decision-register'));
  assert.ok(rel.evidence.edges.some((edge) => edge.to === 'unknown:U-CYCLE@UNCERTAINTY'));
});

test('D uncertainty: Conflict status and selected content are retained; Unknown status is not recast into a new enum', (t) => {
  const f = fixture(t); f.evidence(conflicts([['C-ONE', 'See artifact:RULES#rules', 'open']]));
  const before = f.run(); assert.equal(relations(before).records[0].status, 'open');
  f.evidence(conflicts([['C-ONE', 'See artifact:RULES#rules', 'resolved']]));
  const after = f.run(); assert.equal(relations(after).records[0].status, 'resolved');
  assert.notDeepEqual(after.projection, before.projection);
  f.evidence(`## Unknowns\n${table(['ID', 'Question', 'Status'], [['U-ONE', 'See artifact:RULES#rules', 'unknown']])}`);
  assert.equal(relations(f.run()).records[0].status, 'unknown');
});

test('D uncertainty: code/comment tables and URL-contained lookalikes do not invent inverse dependencies', (t) => {
  const f = fixture(t);
  f.evidence(`## Notes\n\n\`\`\`md\n${unknowns([['U-FAKE', 'See artifact:RULES#rules']])}\n\`\`\`\n\n<!--\n${unknowns([['U-COMMENT', 'See artifact:RULES#rules']])}\n-->\n\n${unknowns([
    ['U-URL', 'https://example.test/artifact:RULES#rules'],
  ])}`);
  assert.deepEqual(recordIds(f.run()), []);
});

test('D uncertainty: malformed raw rows/sections and unresolved explicit dependencies fail instead of shrinking relations', (t) => {
  for (const body of [
    unknowns([['**U-BAD**', 'Question?']]), unknowns([['U-BAD', '']]),
    unknowns([['U-DUP', 'Question?'], ['U-DUP', 'Again?']]),
    `${unknowns([['U-ONE', 'Question?']])}\n\n${unknowns([['U-TWO', 'Question?']])}`,
    `## Unknowns\n${table(['ID', 'Not Question'], [['U-BAD', 'Question?']])}`,
    `## Unknowns\n${table(['ID', 'Question', 'Question'], [['U-BAD', 'A?', 'B?']])}`,
    unknowns([['U-WIDTH', 'Question?', 'extra']]),
    unknowns([['U-MISSING', 'See artifact:ABSENT#rules']]),
    conflicts([['C-BAD', 'Question?', 'accepted']]),
  ]) {
    // #260: native scope, or any typed spelling that could reach selected evidence, keeps it fatal.
    for (const [domain, text] of [['result', body], ['other', `${body}\n\nSee artifact:RULES#rules`]]) {
      const f = fixture(t); f.evidence(text, domain); assert.throws(() => f.run(), undefined, text);
    }
  }
  for (const domain of [null, '', 1]) {
    const f = fixture(t); f.evidence(unknowns([['U-SCOPE', 'Question?']]), domain);
    assert.throws(() => f.run());
  }
});

test('D uncertainty: a format problem in a document that cannot reach selected evidence is reported, not fatal (#260)', (t) => {
  const f = fixture(t);
  for (const [body, section, reason] of [
    ['## Unknowns\nNone — no new open questions.', 'unknowns', 'SW-UNCERTAINTY: one canonical unknown table required'],
    [conflicts([['C-ONE', 'Split `a | b` cell', 'open']]), 'conflicts', 'SW-REF-TABLE: row width differs from header'],
    [unknowns([['OTHER U001', 'Spaced ID?']]), 'unknowns', 'SW-UNCERTAINTY: noncanonical uncertainty ID "OTHER U001"'],
    [conflicts([['C-ONE', 'Closed wording.', 'closed']]), 'conflicts', 'SW-UNCERTAINTY: invalid Conflict Status: conflict:C-ONE@UNCERTAINTY'],
  ]) {
    f.evidence(body);
    const out = f.run();
    assert.deepEqual(relations(out).records, [], body);
    assert.deepEqual(out.unaudited, [{ file: 'docs/uncertainty.md', section, reason }], body);
  }
});

test('D uncertainty: decoded metadata and encoded link refs keep a format problem fatal, like plain spellings (#260)', (t) => {
  const malformed = unknowns([['U-ONE', 'Which rule applies?'], ['U-TWO', '']]);
  const escape = (raw) => raw.replace('"artifact:RULES#rules"', '"artifact\\u003aRULES#rules"');
  for (const [label, extra, body, encode] of [
    ['plain metadata', { depends_on: ['artifact:RULES#rules'] }, malformed, (raw) => raw],
    ['escaped depends_on', { depends_on: ['artifact:RULES#rules'] }, malformed, escape],
    ['escaped source ref', { sources: [{ ref: 'artifact:RULES#rules' }] }, malformed, escape],
    ['entity link destination', {}, unknowns([['U-ONE', '[rule](artifact&#58;RULES#rules)'], ['U-TWO', '']]), (raw) => raw],
  ]) {
    const f = fixture(t);
    const file = f.write('uncertainty.md', { artifact_id: 'UNCERTAINTY', artifact_type: 'domain-rules', domain: 'other', status: 'draft', ...extra }, body);
    fs.writeFileSync(file, encode(fs.readFileSync(file, 'utf8')));
    assert.throws(() => f.run(), /Unknown Question/, label);
  }
});

test('D uncertainty: a format problem in a selected evidence file stays fatal outside native scope (#260)', (t) => {
  const f = fixture(t);
  f.evidence('## Rules\nForeign rule.\n\n## Unknowns\nNone — no new open questions.');
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[1].contracts = ['artifact:UNCERTAINTY#rules']; });
  assert.throws(() => f.run(), /SW-UNCERTAINTY: one canonical unknown table required/);
});

test('D uncertainty: unrelated domain content and housekeeping change audit bytes only; set ordering is stable', (t) => {
  const f = fixture(t); f.evidence(unknowns([['U-ONE', 'See artifact:RULES#rules'], ['U-TWO', 'See artifact:RULES#other']]));
  f.write('unrelated.md', { artifact_id: 'UNRELATED', artifact_type: 'domain-rules', domain: 'unrelated', status: 'draft' },
    unknowns([['U-UNRELATED', 'Unrelated question.']]));
  const before = f.run();
  f.evidence(unknowns([['U-TWO', 'See artifact:RULES#other'], ['U-ONE', 'See artifact:RULES#rules']]));
  f.change('screen.md', ({ fm }) => { fm.work_execution.units.reverse(); fm.last_reviewed = '2026-09-21'; });
  f.change('unrelated.md', (doc) => { doc.body = doc.body.replace('Unrelated question.', 'Different unrelated question.'); });
  const after = f.run(); assert.deepEqual(after.projection, before.projection); assert.notDeepEqual(after.read_set, before.read_set);
  after.projection.uncertainty_relations.records.length = 0;
  assert.equal(relations(f.run()).records.length, 2);
});

test('D uncertainty: stale indexed bytes and symlink replacement cannot change the evidence namespace', (t) => {
  const f = fixture(t); const file = f.evidence(unknowns([['U-ONE', 'See artifact:RULES#rules']]));
  const options = f.options(); fs.appendFileSync(file, '\nChanged after indexing.');
  assert.throws(() => resolveScopedUncertaintyProjection(options), /snapshot|changed|differs/);
  const g = fixture(t); const target = g.evidence(unknowns([['U-ONE', 'See artifact:RULES#rules']]));
  const captured = g.options(); fs.renameSync(target, `${target}.saved`); fs.symlinkSync(`${target}.saved`, target);
  assert.throws(() => resolveScopedUncertaintyProjection(captured));
});

test('D uncertainty: native input bullet spans exclude nested bullets and preserve real inline code across EOLs', () => {
  for (const eol of ['\n', '\r\n', '\r']) {
    const body = ['## Extracted Facts', '', '- Parent `value`.', '  - Nested `secret`.', '- Sibling.', ''].join(eol);
    const view = parseReconciliationReferenceView(body);
    const spans = scopedGraphSelectionSpans(body, view, { section: 'extracted-facts', bullet_index: 1 }, true);
    const selected = spans.map(([start, end]) => body.slice(start, end)).join('');
    assert.match(selected, /value/); assert.doesNotMatch(selected, /secret|Sibling/);
    const all = scopedGraphSelectionSpans(body, view, { type: 'section', section: 'extracted-facts' }, true)
      .map(([start, end]) => body.slice(start, end)).join('');
    assert.match(all, /secret/); assert.match(all, /Sibling/);
  }
});

test('D uncertainty: each document body is parsed at most once, however many candidate rows it holds (#265)', (t) => {
  for (const rows of [10, 40]) {
    const f = fixture(t);
    f.write('conflicts.md', { artifact_id: 'conflicts', artifact_type: 'conflicts', status: 'draft' }, table(['ID', 'Description', 'Status'],
      Array.from({ length: rows }, (_, i) => [`C-${i + 1}`, `Conflict ${rows}-${i + 1}`, i % 2 ? 'resolved' : 'open'])));
    const before = reconciliationParseStats().parsed;
    f.run();
    const parsed = reconciliationParseStats().parsed - before;
    assert.ok(parsed <= f.docs.size, `${rows} rows: ${parsed} parses for ${f.docs.size} documents`);
  }
});

test('D uncertainty: a warm parse cache yields the same projection without parsing again (#265)', (t) => {
  const f = fixture(t);
  f.evidence(conflicts([['C-CACHE', `See artifact:RULES#rules (${process.hrtime.bigint()})`, 'open']]));
  const start = reconciliationParseStats().parsed;
  const cold = f.run();
  const parsed = reconciliationParseStats().parsed;
  assert.ok(parsed > start, 'the first run parses the new evidence body');
  const warm = f.run();
  assert.equal(reconciliationParseStats().parsed, parsed);
  assert.deepEqual(warm, cold);
});
