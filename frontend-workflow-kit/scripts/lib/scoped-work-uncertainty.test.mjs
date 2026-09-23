import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KIT_ROOT, splitFrontmatter } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { parseReconciliationReferenceView } from './reconciliation-markdown-ast.mjs';
import { scopedGraphSelectionSpans } from './scoped-work-graph.mjs';
import { resolveScopedUncertaintyProjection } from './scoped-work-uncertainty.mjs';

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
  const policyFile = path.join(root, 'policy.yaml');
  const adopt = (owners = [OWNER]) => fs.writeFileSync(policyFile, JSON.stringify({ work_execution: {
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
  const options = (owner = OWNER) => ({ owner, policyFile, docsDir, projectRoot: root, layout,
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) =>
      ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }) });
  return { root, docs, write, change, evidence, adopt, options,
    run: (owner = OWNER) => resolveScopedUncertaintyProjection(options(owner)) };
}
const relations = (out) => out.projection.uncertainty_relations;
const applications = (out, id) => relations(out).applications.filter((entry) => entry.uncertainty.includes(`:${id}@`));
const recordIds = (out) => relations(out).records.map((entry) => entry.selection.key).sort();

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

test('D uncertainty: inverse H2 selections retain child content and intersect whole bodies, not sibling sections', (t) => {
  const f = fixture(t); f.evidence(unknowns([['U-NESTED', 'See artifact:RULES#nested']]));
  // Canonical selectors name H2 sections. H3 content belongs to the selected
  // parent; it must neither become a standalone selector nor disappear.
  assert.throws(() => f.run(), /SW-REF-MISSING: section #nested/);
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
    const f = fixture(t); f.evidence(body); assert.throws(() => f.run(), undefined, body);
  }
  for (const domain of [null, '', 1]) {
    const f = fixture(t); f.evidence(unknowns([['U-SCOPE', 'Question?']]), domain);
    assert.throws(() => f.run());
  }
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
