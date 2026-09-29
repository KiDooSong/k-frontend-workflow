import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KIT_ROOT, splitFrontmatter } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { resolveScopedDecisionProjection } from './scoped-work-decisions.mjs';

const OWNER = 'screen:RESULT-001';
const layout = loadLayoutProfile({ kitRoot: KIT_ROOT });
const headers = ['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'];
const row = (id, question = 'Choose behavior.', options = 'A / B', status = 'open') =>
  [id, question, options, 'api-integrated-ui', 'PM', status];
const table = (cols, rows) => [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`,
  ...rows.map((cells) => `| ${cells.join(' | ')} |`)].join('\n');
const decisions = (rows) => `## Open Decisions\n${table(headers, rows)}`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const unit = (id = 'known', contracts = ['artifact:RULES#rules']) => ({ id, kind: 'behavior', contracts, sources: [] });
const screen = (id = 'RESULT-001') => ({ artifact_id: `SCREEN-${id}`, artifact_type: 'screen-spec', screen_id: id,
  domain: 'result', status: 'draft', screen_entry: `src/features/result/screens/${id}.tsx`,
  work_execution: { version: 1, units: [unit()] } });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-decisions-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs');
  const docs = new Map();
  const policyFile = path.join(root, 'policy.yaml');
  const adopt = (owners = [OWNER]) => fs.writeFileSync(policyFile, JSON.stringify({ work_execution: { version: 1,
    owners, profiles: ['behavior'], role_limits: { behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } }));
  const write = (name, fm, body) => {
    assert.ok(![...docs.keys()].some((other) => other !== name && other.toLowerCase() === name.toLowerCase()),
      'fixture documents must remain distinct on case-insensitive filesystems');
    const file = path.join(docsDir, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, md(fm, body)); docs.set(name, file); return file;
  };
  const change = (name, update) => {
    const file = docs.get(name); const parsed = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const data = { fm: parsed.data, body: parsed.body }; update(data); fs.writeFileSync(file, md(data.fm, data.body));
  };
  const global = (rows = [row('D-GLOBAL'), row('D-OTHER')], name = 'global/open-decisions.md') =>
    write(name, { artifact_id: 'open-decision-register', artifact_type: 'open-decision-register', status: 'draft' }, decisions(rows));
  adopt();
  write('screen.md', screen(), '## Notes\nOwner housekeeping.');
  write('rules.md', { artifact_id: 'RULES', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed' },
    '## Rules\nKnown behavior.\n\n## Other\nUnselected behavior.');
  const options = (owner = OWNER) => ({ owner, policyFile, docsDir, projectRoot: root, layout,
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) =>
      ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }) });
  return { root, docsDir, docs, write, change, global, adopt, options,
    run: (owner = OWNER) => resolveScopedDecisionProjection(options(owner)) };
}
function surface(f, { id = 'PANEL', refs = ['D-GLOBAL'], adopted = false } = {}) {
  if (!f.docs.has('second.md')) f.write('second.md', screen('RESULT-002'), '## Notes\nOther host.');
  const owner = `surface:${id}`;
  if (adopted) f.adopt([OWNER, 'screen:RESULT-002', owner]);
  f.write(`${id}.md`, { artifact_id: id, artifact_type: 'shared-surface-spec', surface_id: id,
    domain: 'result', status: 'draft', member_screens: ['RESULT-001', 'RESULT-002'], decision_refs: refs,
    implementation_paths: ['src/features/result/components/panel/**'],
    ...(adopted ? { work_execution: { version: 1, units: [{ ...unit(), host_units: {
      'RESULT-001': 'known', 'RESULT-002': 'known',
    } }] } } : {}),
  }, '## Notes\nShared behavior.');
  return owner;
}
const relation = (out) => out.projection.decision_relations;
const ids = (out) => relation(out).records.map((record) => record.decision_id).sort();

test('D decisions: actual local/global rows and every declared unit, without a digest or permit', (t) => {
  const f = fixture(t); f.global();
  f.change('screen.md', (doc) => {
    doc.fm.decision_refs = ['D-GLOBAL']; doc.fm.work_execution.units.push(unit('second'));
    doc.body += `\n\n${decisions([row('D-LOCAL')])}`;
  });
  const before = [...f.docs.values()].map((file) => fs.readFileSync(file));
  const out = f.run();
  assert.deepEqual(ids(out), ['D-GLOBAL', 'D-LOCAL']);
  assert.deepEqual(out.projection.known_units, ['known', 'second']);
  assert.ok(relation(out).applications.some((entry) => entry.relation === 'local' && entry.owner === OWNER));
  for (const key of ['basis_digest', 'basis_version', 'ready', 'allowed', 'approval_ref']) {
    assert.equal(Object.hasOwn(out, key), false); assert.equal(Object.hasOwn(out.projection, key), false);
  }
  assert.deepEqual([...f.docs.values()].map((file) => fs.readFileSync(file)), before);
});

test('D decisions: surface and all selected hosts retain global and local applications', (t) => {
  const f = fixture(t); f.global(); const owner = surface(f, { adopted: true });
  f.change('second.md', (doc) => { doc.body += `\n\n${decisions([row('D-HOST')])}`; });
  const out = f.run(owner);
  assert.deepEqual(ids(out), ['D-GLOBAL', 'D-HOST']);
  const applied = relation(out).applications.filter((entry) => entry.decision === 'decision:D-GLOBAL@open-decision-register');
  assert.deepEqual([...new Set(applied.map((entry) => entry.owner))].sort(), [OWNER, 'screen:RESULT-002', owner].sort());
  assert.equal(relation(out).memberships.length, 2);
  assert.ok(relation(out).applications.some((entry) => entry.owner === 'screen:RESULT-002' && entry.decision.includes('D-HOST')));
});

test('D decisions: a screen receives surface fan-out without borrowing the other host local decisions', (t) => {
  const f = fixture(t); f.global(); surface(f);
  f.change('second.md', (doc) => { doc.body += `\n\n${decisions([row('D-OTHER-HOST')])}`; });
  const before = f.run(); assert.deepEqual(ids(before), ['D-GLOBAL']);
  f.change('second.md', (doc) => { doc.body = doc.body.replace('Choose behavior.', 'Different host choice.'); });
  const after = f.run(); assert.deepEqual(after.projection, before.projection);
  assert.notDeepEqual(after.read_set, before.read_set);
});

test('D decisions: native screen/surface and surface/surface duplicate application is not deduplicated into validity', (t) => {
  for (const direct of [true, false]) {
    const f = fixture(t); f.global(); surface(f);
    if (direct) f.change('screen.md', ({ fm }) => { fm.decision_refs = ['D-GLOBAL']; });
    else surface(f, { id: 'SECOND-SURFACE' });
    assert.throws(() => f.run(), /duplicate native decision application/);
  }
});

test('D decisions: native refs are exact global IDs, not local rows, typed aliases or repaired strings', (t) => {
  for (const refs of [null, 'D-GLOBAL', ['D-GLOBAL', 'D-GLOBAL'], [' D-GLOBAL'], ['decision:D-GLOBAL@open-decision-register'], ['D-MISSING']]) {
    const f = fixture(t); f.global(); f.change('screen.md', ({ fm }) => { fm.decision_refs = refs; });
    assert.throws(() => f.run());
  }
  const f = fixture(t); f.change('screen.md', (doc) => {
    doc.fm.decision_refs = ['D-LOCAL']; doc.body += `\n\n${decisions([row('D-LOCAL')])}`;
  });
  assert.throws(() => f.run(), /artifact|missing/i);
});

test('D decisions: duplicate IDs across actual local/global homes remain ambiguous', (t) => {
  const f = fixture(t); f.global([row('D-SAME')]);
  f.change('screen.md', (doc) => { doc.body += `\n\n${decisions([row('D-SAME')])}`; });
  assert.throws(() => f.run(), /ambiguous decision/);
});

test('D decisions: an alternative global location and a surface local home are rejected', (t) => {
  const f = fixture(t); f.global([row('D-GLOBAL')], 'elsewhere.md');
  f.change('screen.md', ({ fm }) => { fm.decision_refs = ['D-GLOBAL']; });
  assert.throws(() => f.run(), /noncanonical global/);
  const g = fixture(t); g.global(); surface(g);
  g.change('PANEL.md', (doc) => { doc.body += `\n\n${decisions([row('D-SURFACE')])}`; });
  assert.throws(() => g.run(), /must not own/);
  const h = fixture(t); h.global();
  h.write('alternate.md', { artifact_id: 'ALTERNATE', artifact_type: 'open-decision-register', status: 'draft' }, decisions([row('D-ALTERNATE')]));
  h.change('rules.md', (doc) => { doc.body = '## Rules\nSee decision:D-ALTERNATE@ALTERNATE'; });
  assert.throws(() => h.run(), /noncanonical global/);
});

test('D decisions: malformed raw decision rows, columns, duplicate sections and table lookalikes fail closed', (t) => {
  for (const body of [
    decisions([row('D-BAD', '', 'A / B')]), decisions([row('D-BAD', 'Question?', 'A / B', 'accepted')]),
    decisions([row('**D-BAD**')]), decisions([row('D-BAD'), row('D-BAD')]),
    `## Open Decisions\n${table(headers.filter((h) => h !== 'Options'), [['D-BAD', 'Question?', 'api-integrated-ui', 'PM', 'open']])}`,
    `${decisions([row('D-ONE')])}\n\n${decisions([row('D-TWO')])}`,
    `## Open Decisions\n\n\`\`\`md\n${table(headers, [row('D-CODE')])}\n\`\`\``,
  ]) {
    const f = fixture(t); f.change('screen.md', (doc) => { doc.body = body; });
    assert.throws(() => f.run(), undefined, body);
  }
});

test('D decisions: recursive typed decision dependencies and native refs on selected contracts retain unit provenance', (t) => {
  const f = fixture(t); f.global([row('D-ONE'), row('D-TWO')]);
  f.change('rules.md', (doc) => { doc.body = '## Rules\nSee decision:D-ONE@open-decision-register\n\n## Other\nSee decision:D-TWO@open-decision-register'; });
  f.change('screen.md', ({ fm }) => { fm.work_execution.units.push(unit('second', ['artifact:RULES#other'])); });
  const out = f.run(); assert.deepEqual(ids(out), ['D-ONE', 'D-TWO']);
  const apps = relation(out).applications.filter((entry) => entry.relation === 'selected-evidence');
  assert.ok(apps.some((entry) => entry.unit === 'known' && entry.decision.includes('D-ONE')));
  assert.equal(apps.some((entry) => entry.unit === 'known' && entry.decision.includes('D-TWO')), false);
  f.change('rules.md', ({ fm }) => { fm.decision_refs = ['D-TWO']; });
  assert.ok(relation(f.run()).applications.some((entry) => entry.unit === 'known' && entry.relation === 'evidence-decision-ref'));
});

test('D decisions: finite decision cycles and set ordering use canonical nodes, not encounter-order roots', (t) => {
  const f = fixture(t);
  const rows = [row('D-ONE', 'See decision:D-TWO@open-decision-register'), row('D-TWO', 'See decision:D-ONE@open-decision-register')];
  f.global(rows); f.change('screen.md', ({ fm }) => { fm.decision_refs = ['D-ONE', 'D-TWO']; });
  const before = f.run(); assert.deepEqual(ids(before), ['D-ONE', 'D-TWO']);
  f.global([...rows].reverse()); f.change('screen.md', ({ fm }) => { fm.decision_refs.reverse(); });
  const after = f.run(); assert.deepEqual(after.projection, before.projection);
  assert.ok(relation(after).evidence.edges.length >= 2);
});

test('D decisions: selected question/options/mode/status change while unreferenced global rows and housekeeping stay outside scope', (t) => {
  const f = fixture(t); f.global(); f.change('screen.md', ({ fm }) => { fm.decision_refs = ['D-GLOBAL']; });
  const before = f.run(); f.global([row('D-GLOBAL'), row('D-OTHER', 'Different unrelated question.')]);
  f.change('global/open-decisions.md', (doc) => { doc.fm.last_reviewed = '2026-09-21'; doc.body += '\n\n## Notes\nHousekeeping.'; });
  assert.deepEqual(f.run().projection, before.projection);
  for (const selected of [row('D-GLOBAL', 'Changed question.'), row('D-GLOBAL', 'Choose behavior.', 'C / D'),
    ['D-GLOBAL', 'Choose behavior.', 'A / B', 'final-fixture-ui', 'PM', 'open'], row('D-GLOBAL', 'Choose behavior.', 'A / B', 'resolved')]) {
    f.global([selected, row('D-OTHER')]); assert.notDeepEqual(f.run().projection, before.projection);
  }
});

test('D decisions: recursive Conflict/Unknown content is retained without inventing resolution or acceptance', (t) => {
  const f = fixture(t);
  f.write('context.md', { artifact_id: 'CONTEXT', artifact_type: 'domain-rules', status: 'draft', domain: 'result' },
    `## Unknowns\n${table(['ID', 'Question'], [['U-ONE', 'Unknown detail.']])}\n\n## Conflicts\n${table(['ID', 'Status', 'Details'], [['C-ONE', 'open', 'Conflicting detail.']])}`);
  f.global([row('D-GLOBAL', 'See unknown:U-ONE@CONTEXT and conflict:C-ONE@CONTEXT')]);
  f.change('screen.md', ({ fm }) => { fm.decision_refs = ['D-GLOBAL']; });
  const before = f.run();
  assert.ok(relation(before).evidence.nodes.some((node) => node.kind === 'unknown'));
  assert.ok(relation(before).evidence.nodes.some((node) => node.kind === 'conflict'));
  f.change('context.md', (doc) => { doc.body = doc.body.replace('Unknown detail.', 'Changed unknown detail.'); });
  assert.notDeepEqual(f.run().projection, before.projection);
});

test('D decisions: binding self-fields are excluded but malformed binding syntax is not silently repaired', (t) => {
  const f = fixture(t); f.global(); f.change('screen.md', ({ fm }) => { fm.decision_refs = ['D-GLOBAL']; });
  const before = f.run();
  f.change('global/open-decisions.md', ({ fm }) => { fm.decision_work_scopes = { version: 1, bindings: [{
    decision_id: 'D-GLOBAL', owner: OWNER, known_units: ['known'], blocks: [], basis_digest: `sha256:${'0'.repeat(64)}`, approval_ref: 'review:scope',
  }] }; });
  assert.deepEqual(f.run().projection, before.projection);
  f.change('global/open-decisions.md', ({ fm }) => { fm.decision_work_scopes.bindings[0].extra = true; });
  assert.throws(() => f.run());
});

test('D decisions: missing selected refs and stale indexed bytes cannot produce a partial successful projection', (t) => {
  const f = fixture(t); f.global(); f.change('screen.md', ({ fm }) => { fm.decision_refs = ['D-GLOBAL']; });
  const options = f.options(); f.global([row('D-GLOBAL', 'Changed after indexing.')]);
  assert.throws(() => resolveScopedDecisionProjection(options), /indexed snapshot/);
  f.change('rules.md', (doc) => { doc.body = '## Rules\nSee decision:D-MISSING@open-decision-register'; });
  assert.throws(() => f.run());
});

test('D decisions: membership/domain errors cannot be treated as an unrelated surface', (t) => {
  for (const members of [['RESULT-001', 'RESULT-001'], ['RESULT-001', 'MISSING'], null]) {
    const f = fixture(t); f.global(); surface(f);
    f.change('PANEL.md', ({ fm }) => { fm.member_screens = members; });
    assert.throws(() => f.run());
  }
  const f = fixture(t); f.global(); surface(f);
  f.change('second.md', ({ fm }) => { fm.domain = 'elsewhere'; });
  assert.throws(() => f.run(), /domain mismatch/);
});
