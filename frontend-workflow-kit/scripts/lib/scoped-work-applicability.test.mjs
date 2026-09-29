import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { resolveScopedDecisionProjection } from './scoped-work-decisions.mjs';
import { resolveScopedUncertaintyProjection } from './scoped-work-uncertainty.mjs';
import { resolveScopedBoundaryProjection } from './scoped-work-boundaries.mjs';
import { resolveScopedApplicabilityProjection } from './scoped-work-applicability.mjs';

const OWNER = 'screen:RESULT-001';
const SECOND = 'screen:RESULT-002';
const ROOT = 'src/features/result';
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((cells) => `| ${cells.join(' | ')} |`)].join('\n');
const decisionRow = (id, question = 'Choose behavior.', status = 'open') =>
  [id, question, 'A / B', 'api-integrated-ui', 'PM', status];
const decisions = (rows) => `## Open Decisions\n${table(['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'], rows)}`;
const unknown = (id, question) => `## Unknowns\n${table(['ID', 'Question'], [[id, question]])}`;
const unit = (id = 'known', contracts = ['artifact:RULES#rules']) => ({ id, kind: 'behavior', contracts, sources: [] });
const screen = (id = 'RESULT-001') => ({ artifact_id: `SCREEN-${id}`, artifact_type: 'screen-spec', screen_id: id,
  domain: 'result', status: 'draft', screen_entry: `${ROOT}/screens/${id}.tsx`,
  work_execution: { version: 1, private_paths: { hook: [`${ROOT}/hooks/local/**`] },
    test_paths: [`${ROOT}/tests/local/**`], units: [unit(), unit('other', ['artifact:RULES#other'])] } });

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-applicability-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs'), kitRoot = path.join(root, '.kit');
  fs.mkdirSync(kitRoot);
  const docs = new Map();
  const policyFile = path.join(kitRoot, 'policy.yaml'), layoutFile = path.join(kitRoot, 'layout.yaml'), manifestFile = path.join(kitRoot, 'manifest.yaml');
  const put = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
  const adopt = (owners = [OWNER], deny_paths = []) => put(policyFile, { work_execution: { version: 1, owners,
    profiles: ['behavior'], role_limits: { behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths } });
  put(layoutFile, { roles: { screen: ['src/features/{domain}/screens/**'], domain_component: ['src/features/{domain}/components/**'],
    hook: ['src/features/{domain}/hooks/**'], api_client: ['src/api/**'], test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'] } });
  put(manifestFile, { version: 1, artifacts: {} });
  const write = (name, fm, body) => {
    assert.ok(![...docs.keys()].some((other) => other !== name && other.toLowerCase() === name.toLowerCase()));
    const file = path.join(docsDir, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, md(fm, body)); docs.set(name, file); return file;
  };
  const change = (name, update) => {
    const file = docs.get(name), parsed = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const doc = { fm: parsed.data, body: parsed.body }; update(doc); fs.writeFileSync(file, md(doc.fm, doc.body));
  };
  const rules = (id, body = 'Unselected rule.') => write(`${id}.md`, {
    artifact_id: id, artifact_type: 'domain-rules', domain: 'foreign', status: 'confirmed',
  }, `## Rules\n${body}`);
  const uncertainty = (id = 'U-ONE', question = 'See artifact:RULES#rules and decision:D-ONE@open-decision-register', domain = 'foreign') =>
    write(`${id}.md`, { artifact_id: id, artifact_type: 'domain-rules', domain, status: 'draft' }, unknown(id, question));
  const global = (rows = [decisionRow('D-ONE'), decisionRow('D-UNUSED')]) => write('global/open-decisions.md', {
    artifact_id: 'open-decision-register', artifact_type: 'open-decision-register', status: 'draft',
  }, decisions(rows));
  adopt(); write('screen.md', screen(), '## Notes\nOwner housekeeping.');
  write('rules.md', { artifact_id: 'RULES', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed' },
    '## Rules\nKnown contract.\n\n## Other\nOther contract.\n\n## Untouched\nUnselected prose.');
  const options = (owner = OWNER) => ({ owner, projectRoot: root, docsDir, kitRoot, policyFile, layoutFile, manifestFile,
    layout: loadLayoutProfile({ kitRoot, flags: { layout: layoutFile } }),
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) =>
      ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }) });
  return { root, docs, write, change, rules, uncertainty, global, adopt, put, policyFile, layoutFile, manifestFile, options,
    run: (owner = OWNER) => resolveScopedApplicabilityProjection(options(owner)) };
}
const relations = (out) => out.projection.decision_relations;
const ids = (out) => relations(out).records.map((entry) => entry.decision_id).sort();
const unknownRelations = (out) => out.projection.uncertainty_relations;
const apps = (out, id) => relations(out).applications.filter((entry) => entry.decision === `decision:${id}@open-decision-register`);
function surface(f, legacy = false) {
  const second = screen('RESULT-002');
  if (legacy) delete second.work_execution;
  f.write('second.md', second, '## Notes\nSecond host.');
  f.adopt([OWNER, ...(legacy ? [] : [SECOND]), 'surface:PANEL']);
  f.write('panel.md', { artifact_id: 'PANEL', artifact_type: 'shared-surface-spec', surface_id: 'PANEL', domain: 'result',
    status: 'draft', member_screens: ['RESULT-001', 'RESULT-002'], implementation_paths: [`${ROOT}/components/panel/**`],
    work_execution: { version: 1, units: [{ ...unit('shared'), host_units: {
      'RESULT-001': 'known', 'RESULT-002': legacy ? 'legacy-current' : 'other',
    } }] },
  }, '## Notes\nShared contract.');
  return 'surface:PANEL';
}

test('D applicability: combines actual unit and ownership projections without writes, a digest or permission', (t) => {
  const f = fixture(t), before = [...f.docs.values()].map((file) => fs.readFileSync(file));
  const out = f.run();
  assert.deepEqual(out.projection.known_units, ['known', 'other']);
  assert.deepEqual(out.projection.ownership, resolveScopedBoundaryProjection(f.options()).projection.ownership);
  assert.deepEqual(ids(out), []);
  assert.deepEqual(unknownRelations(out).records, []);
  for (const key of ['basis_digest', 'basis_version', 'allowed', 'ready', 'allowed_paths', 'approval_ref', 'effective_binding']) {
    assert.equal(Object.hasOwn(out, key), false); assert.equal(Object.hasOwn(out.projection, key), false);
  }
  assert.deepEqual([...f.docs.values()].map((file) => fs.readFileSync(file)), before);
});

test('D applicability: an inverse Unknown contributes its real Decision to only its consuming unit', (t) => {
  const f = fixture(t); f.global(); f.uncertainty();
  const first = resolveScopedUncertaintyProjection(f.options());
  assert.deepEqual(ids(first), [], 'a one-pass union does not finish decision applicability');
  const out = f.run(); assert.deepEqual(ids(out), ['D-ONE']);
  assert.ok(apps(out, 'D-ONE').length);
  assert.ok(apps(out, 'D-ONE').every((entry) => entry.owner === OWNER && entry.unit === 'known'));
  assert.ok(apps(out, 'D-ONE').some((entry) => entry.relation === 'uncertainty-evidence' && entry.uncertainty === 'unknown:U-ONE@U-ONE'));
  assert.deepEqual(relations(out).dependency_roots, [{ owner: OWNER, unit: 'known', ref: 'unknown:U-ONE@U-ONE' }]);
});

test('D applicability: native decision_refs on uncertainty evidence are validated and traversed', (t) => {
  const f = fixture(t); f.global([decisionRow('D-ONE'), decisionRow('D-REF', 'See artifact:EXTRA#rules')]);
  f.rules('EXTRA', 'Additional selected contract.'); f.uncertainty();
  f.change('U-ONE.md', ({ fm }) => { fm.decision_refs = ['D-REF']; });
  const out = f.run(); assert.deepEqual(ids(out), ['D-ONE', 'D-REF']);
  assert.ok(apps(out, 'D-REF').some((entry) => entry.relation === 'uncertainty-decision-ref'));
  assert.ok(relations(out).evidence.nodes.some((entry) => entry.ref === 'artifact:EXTRA#rules'));
});

test('D applicability: inverse uncertainty and new Decision dependencies reach a multi-wave fixed point', (t) => {
  const f = fixture(t); const rows = [];
  for (let index = 1; index <= 4; index += 1) {
    f.rules(`NEXT-${index}`);
    rows.push(decisionRow(`D-${index}`, `See artifact:NEXT-${index}#rules`));
    f.uncertainty(`U-${index}`, `See artifact:${index === 1 ? 'RULES' : `NEXT-${index - 1}`}#rules and decision:D-${index}@open-decision-register`);
  }
  f.global(rows);
  const first = resolveScopedUncertaintyProjection(f.options());
  assert.deepEqual(unknownRelations(first).records.map((entry) => entry.selection.key), ['U-1']);
  const out = f.run(); assert.deepEqual(ids(out), ['D-1', 'D-2', 'D-3', 'D-4']);
  assert.equal(relations(out).dependency_roots.length, 4);
  const transitive = unknownRelations(out).applications.filter((entry) => entry.relation === 'transitive-evidence');
  assert.deepEqual(transitive.map((entry) => entry.uncertainty).sort(), ['unknown:U-2@U-2', 'unknown:U-3@U-3', 'unknown:U-4@U-4']);
  assert.ok(transitive.every((entry) => entry.unit === 'known' && entry.witnesses.every((witness) => witness.via !== entry.uncertainty)));
  assert.deepEqual(f.run(), out);
});

test('D applicability: cyclic Conflict/Unknown roots terminate and retain each uncertainty provenance', (t) => {
  const f = fixture(t); f.global();
  f.uncertainty('U-ONE', 'See artifact:RULES#rules and conflict:C-ONE@C-HOME');
  f.write('conflict.md', { artifact_id: 'C-HOME', artifact_type: 'domain-rules', domain: 'foreign', status: 'draft' },
    `## Conflicts\n${table(['ID', 'Description', 'Status'], [['C-ONE', 'See unknown:U-ONE@U-ONE and decision:D-ONE@open-decision-register', 'open']])}`);
  const out = f.run(); assert.deepEqual(ids(out), ['D-ONE']);
  assert.deepEqual(new Set(apps(out, 'D-ONE').map((entry) => entry.uncertainty)), new Set(['unknown:U-ONE@U-ONE', 'conflict:C-ONE@C-HOME']));
  assert.equal(new Set(relations(out).evidence.nodes.map((entry) => entry.ref)).size, relations(out).evidence.nodes.length);
  assert.deepEqual(f.run(), out);
});

test('D applicability: closure never upgrades native scope-review-needed using the uncertainty own graph', (t) => {
  const f = fixture(t); f.global(); f.uncertainty('U-ONE', 'See decision:D-ONE@open-decision-register', 'result');
  const before = resolveScopedUncertaintyProjection(f.options()); const out = f.run();
  assert.deepEqual(unknownRelations(out).scope_review_needed, unknownRelations(before).scope_review_needed);
  assert.equal(unknownRelations(out).scope_review_needed.length, 2);
  assert.ok(unknownRelations(out).applications.every((entry) => entry.relation === 'scope-review-needed'));
  assert.deepEqual(new Set(apps(out, 'D-ONE').map((entry) => entry.unit)), new Set(['known', 'other']));
});

test('D applicability: a native row can stay inverse for one unit and ambiguous for another', (t) => {
  const f = fixture(t); f.global(); f.uncertainty('U-ONE', 'See artifact:RULES#rules and decision:D-ONE@open-decision-register', 'result');
  const out = f.run();
  assert.equal(unknownRelations(out).applications.find((entry) => entry.unit === 'known').relation, 'inverse-evidence');
  assert.equal(unknownRelations(out).applications.find((entry) => entry.unit === 'other').relation, 'scope-review-needed');
  assert.deepEqual(unknownRelations(out).scope_review_needed.map((entry) => entry.unit), ['other']);
});

test('D applicability: unrelated sections and unselected Decision rows change audit bytes, not the projection', (t) => {
  const f = fixture(t); f.global(); f.uncertainty(); const before = f.run();
  f.change('rules.md', (doc) => { doc.body = doc.body.replace('Unselected prose.', 'Unrelated edit.'); });
  f.global([decisionRow('D-ONE'), decisionRow('D-UNUSED', 'An unrelated changed question.')]);
  const after = f.run(); assert.deepEqual(after.projection, before.projection); assert.notDeepEqual(after.read_set, before.read_set);
});

test('D applicability: unit/index/set order is stable; actual selected Decision content and status are not', (t) => {
  const f = fixture(t); f.global(); f.uncertainty(); const before = f.run();
  f.change('screen.md', ({ fm }) => { fm.work_execution.units.reverse(); });
  const files = [...f.docs]; f.docs.clear(); for (const [name, file] of files.reverse()) f.docs.set(name, file);
  assert.deepEqual(f.run().projection, before.projection);
  f.global([decisionRow('D-ONE', 'Changed selected question.', 'resolved'), decisionRow('D-UNUSED')]);
  const after = f.run(); assert.notDeepEqual(after.projection, before.projection);
  assert.equal(relations(after).records[0].status, 'resolved'); assert.equal(Object.hasOwn(after, 'allowed'), false);
});

test('D applicability: derived decisions still reject duplicate IDs across canonical homes', (t) => {
  const f = fixture(t); f.global(); f.uncertainty();
  f.write('second.md', screen('RESULT-002'), decisions([decisionRow('D-ONE')]));
  assert.throws(() => f.run(), /ambiguous decision/);
});

test('D applicability: derived decisions still reject malformed rows and malformed binding declarations', (t) => {
  const f = fixture(t); f.global([decisionRow('D-ONE', '')]); f.uncertainty();
  assert.throws(() => f.run(), /malformed|invalid/i);
  f.global(); f.change('global/open-decisions.md', ({ fm }) => { fm.decision_work_scopes = { version: 99, bindings: [] }; });
  assert.throws(() => f.run(), /version|unsupported/i);
});

test('D applicability: a missing native Decision ref on a newly related uncertainty is not omitted', (t) => {
  const f = fixture(t); f.global(); f.uncertainty();
  f.change('U-ONE.md', ({ fm }) => { fm.decision_refs = ['D-MISSING']; });
  assert.throws(() => f.run(), /missing|unresolved|OD-/i);
});

test('D applicability: a stale indexed snapshot is rejected instead of mixing old and new evidence', (t) => {
  const f = fixture(t); f.global(); f.uncertainty(); const options = f.options();
  f.change('U-ONE.md', (doc) => { doc.body += '\nNew bytes.'; });
  assert.throws(() => resolveScopedApplicabilityProjection(options), /snapshot|differs|changed/i);
});

test('D applicability: caller projections, layouts and claimed root subsets cannot replace actual file-backed inputs', (t) => {
  const f = fixture(t); f.global(); f.uncertainty(); const before = f.run();
  const after = resolveScopedApplicabilityProjection({ ...f.options(), layout: { resolvePaths: () => ['src/**'] },
    projection: { allowed: true }, dependencyRoots: [], units: ['other'], read_set: [] });
  assert.deepEqual(after, before);
});

test('D applicability: additive uncertainty roots reject foreign owners, units, typed families and duplicates', (t) => {
  const f = fixture(t); f.global(); f.uncertainty();
  const root = { owner: OWNER, unit: 'known', ref: 'unknown:U-ONE@U-ONE' };
  for (const roots of [[{ ...root, owner: SECOND }], [{ ...root, unit: 'absent' }], [{ ...root, unit: null }],
    [{ ...root, ref: 'decision:D-ONE@open-decision-register' }], [{ ...root, allowed: true }], [root, root]]) {
    assert.throws(() => resolveScopedDecisionProjection(f.options(), roots));
  }
});

test('D applicability: every selected surface host retains its own unit and uncertainty-derived Decision', (t) => {
  const f = fixture(t); const owner = surface(f); f.global([decisionRow('D-FIRST'), decisionRow('D-SECOND')]);
  f.change('screen.md', (doc) => { doc.body += `\n\n${unknown('U-FIRST', 'See decision:D-FIRST@open-decision-register')}`; });
  f.change('second.md', (doc) => { doc.body += `\n\n${unknown('U-SECOND', 'See decision:D-SECOND@open-decision-register')}`; });
  const out = f.run(owner); assert.deepEqual(ids(out), ['D-FIRST', 'D-SECOND']);
  assert.ok(apps(out, 'D-FIRST').every((entry) => entry.owner === OWNER && entry.unit === 'known'));
  assert.ok(apps(out, 'D-SECOND').every((entry) => entry.owner === SECOND && entry.unit === 'other'));
  assert.deepEqual(out.projection.ownership.requires_legacy_base, []);
});

test('D applicability: legacy host uncertainty keeps its null unit and mandatory current-base boundary', (t) => {
  const f = fixture(t); const owner = surface(f, true); f.global();
  f.change('second.md', (doc) => { doc.body += `\n\n${unknown('U-LEGACY', 'See decision:D-ONE@open-decision-register')}`; });
  const out = f.run(owner); assert.deepEqual(ids(out), ['D-ONE']);
  assert.ok(apps(out, 'D-ONE').every((entry) => entry.owner === SECOND && entry.unit === null));
  assert.deepEqual(out.projection.ownership.requires_legacy_base, [SECOND]);
  assert.ok(unknownRelations(out).scope_review_needed.some((entry) => entry.owner === SECOND && entry.unit === null));
});

test('D applicability: relation closure preserves other-owner reservations, generated boundaries and explicit denies', (t) => {
  const f = fixture(t); f.global(); f.uncertainty(); f.write('second.md', screen('RESULT-002'), '## Notes\nOther owner.');
  f.adopt([OWNER], [`${ROOT}/hooks/local/blocked.ts`]);
  f.put(f.manifestFile, { version: 1, artifacts: { generated: { kind: 'generated', generated: true,
    do_not_edit: true, path: `${ROOT}/hooks/local/generated.ts` } } });
  const out = f.run(), ownership = out.projection.ownership;
  assert.deepEqual(ownership, resolveScopedBoundaryProjection(f.options()).projection.ownership);
  assert.ok(ownership.reservations.some((entry) => entry.owner === SECOND));
  assert.ok(ownership.generated.length); assert.deepEqual(ownership.explicit_denies, [`${ROOT}/hooks/local/blocked.ts`]);
});

test('D applicability: adding a known unit cannot hide it from native uncertainty or the composed scope', (t) => {
  const f = fixture(t); f.global(); f.uncertainty('U-ONE', 'See decision:D-ONE@open-decision-register', 'result');
  f.change('screen.md', ({ fm }) => { fm.work_execution.units.push(unit('new-unit')); });
  const out = f.run(); assert.deepEqual(out.projection.known_units, ['known', 'new-unit', 'other']);
  assert.ok(apps(out, 'D-ONE').some((entry) => entry.unit === 'new-unit'));
  assert.ok(out.projection.ownership.units.some((entry) => entry.unit === 'new-unit'));
});
