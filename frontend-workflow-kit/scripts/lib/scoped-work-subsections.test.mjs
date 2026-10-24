// Synthetic files only: real resolver, graph, source/coverage and CLI contracts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { KIT_ROOT, DEFAULTS, splitFrontmatter } from './util.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { parseReconciliationReferenceView } from './reconciliation-markdown-ast.mjs';
import { scopedAuthoredSubsections, scopedSelectionNodes, copyScopedSelectionContext } from './scoped-work-authored.mjs';
import { createScopedReferenceResolver } from './scoped-work-refs.mjs';
import { scopedGraphSelectionRefs, scopedGraphSelectionSpans, resolveScopedContractGraph } from './scoped-work-graph.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { loadInputArtifact } from './input-artifact.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { resolveScopedSourceRelations } from './scoped-work-source-relations.mjs';
import { resolveScopedCoverageBasis, inspectScopedSourceCoverage } from './scoped-work-coverage.mjs';
import { resolveScopedUncertaintyProjection } from './scoped-work-uncertainty.mjs';
import { inspectScopedProfile } from './scoped-work-profiles.mjs';
import { inspectScopedUncertaintyScopes, resolveScopedUncertaintyBindingBasis } from './scoped-work-uncertainty-scopes.mjs';

const OWNER = 'screen:EXAMPLE-001', ENTRY = 'src/features/example/screens/Example.tsx';
const DOCS = 'docs/frontend-workflow', INPUT = 'IN-20261024-meeting-001', REF = `input:${INPUT}#extracted-facts/01`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const generated = (body) => `<!-- GENERATED:START summary -->\n\n${body}\n\n<!-- GENERATED:END summary -->`;
const RULES = '## Rules\nParent contract.\n\n### Narrow contract\nChosen behavior.\n\n#### Detail\nChild behavior.\n\n### Sibling\nUnselected behavior.\n\n## Other\nOther contract.\n';
function fixture(t, body = RULES) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-subsections-')));
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-subsections-out-')));
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); });
  const docs = new Map(), inputs = new Map();
  const put = (name, content) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file; };
  const write = (name, fm, text, collection = docs) => { const file = put(`${DOCS}/${name}`, md(fm, text)); collection.set(name, file); return file; };
  const edit = (name, change) => {
    const file = docs.get(name), parsed = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const doc = { fm: parsed.data, body: parsed.body }; change(doc); fs.writeFileSync(file, md(doc.fm, doc.body));
  };
  const policyFile = put('.kit/policy.yaml', fs.readFileSync(DEFAULTS.policy));
  const policyOverlayFile = put('.kit/adoption.yaml', JSON.stringify({ work_execution: { version: 1, owners: [OWNER], profiles: ['behavior'],
    role_limits: { behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } }));
  const layoutFile = put('.kit/layout.yaml', JSON.stringify({ roles: { screen: 'src/features/{domain}/screens/**',
    domain_component: 'src/features/{domain}/components/**', hook: 'src/features/{domain}/hooks/**',
    api_client: 'src/api/**', test: 'src/features/{domain}/tests/**', route_entry: 'src/app/**' } }));
  const manifestFile = put('.kit/manifest.yaml', JSON.stringify({ version: 1, artifacts: {} }));
  put('frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: .kit/adoption.yaml\n');
  put(ENTRY, 'export default null;\n');
  write('domains/example/screens/example/screen-spec.md', { artifact_id: 'SCREEN', artifact_type: 'screen-spec', screen_id: 'EXAMPLE-001',
    domain: 'example', route: '/example', status: 'draft', screen_entry: ENTRY, api_required: false,
    work_execution: { version: 1, units: [{ id: 'narrow', kind: 'behavior', contracts: ['artifact:RULES#narrow-contract'], sources: [] }] } }, '## Notes\nOwner declaration.');
  write('rules.md', { artifact_id: 'RULES', artifact_type: 'domain-rules', domain: 'example', status: 'confirmed',
    approved_by: 'synthetic-test-owner', approved_at: '2026-10-24', decision_id: 'fixture-rules' }, body);
  const options = () => ({ owner: OWNER, unit: 'narrow', projectRoot: root, docsDir: path.join(root, DOCS), kitRoot: root,
    policyFile, policyOverlayFile, layoutFile, manifestFile, layout: loadLayoutProfile({ kitRoot: root, flags: { layout: layoutFile } }),
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) => ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }),
    inputArtifacts: [...inputs.values()].map(loadInputArtifact), origin_inputs: [], coverage_reports: [],
    registerFile: path.join(root, DOCS, '_meta/reconciliation-register.md') });
  const refs = () => createScopedReferenceResolver(options());
  const bodyOf = () => options().targetIndex.artifacts.get('RULES').body;
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const commit = () => { git('add', '-A'); git('commit', '-qm', 'synthetic authoring checkpoint'); };
  const init = () => { git('init', '-q'); git('config', 'maintenance.auto', 'false'); git('config', 'gc.auto', '0');
    git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'test'); commit(); };
  const work = path.join(outside, 'work.json');
  fs.writeFileSync(work, JSON.stringify({ version: 1, origin_inputs: [], requests: [{ owner: OWNER, authority: 'scoped', unit: 'narrow', targets: [{ path: ENTRY, change: 'M' }] }] }));
  const cli = (script, extra = []) => spawnSync(process.execPath, [path.join(KIT_ROOT, 'scripts', script), '--work', work, '--root', root,
    '--docs', DOCS, '--src', 'src', '--policy', '.kit/policy.yaml', '--manifest', '.kit/manifest.yaml', '--layout', '.kit/layout.yaml', ...extra],
  { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 });
  return { root, outside, work, docs, inputs, put, write, edit, refs, options, bodyOf, init, commit, cli };
}
const json = (run) => { assert.equal(run.status, 0, run.stderr || run.stdout); return JSON.parse(run.stdout); };

test('H3: extent ends at the next authored sibling or ancestor and retains H4 descendants', (t) => {
  for (const newline of ['\n', '\r\n']) for (const boundary of ['# Ancestor', '## Ancestor', '### Sibling']) {
    const f = fixture(t, `## Rules\nParent.\n\n### **Narrow** contract\nChosen.\n\n#### Detail\nChild.\n\n${boundary}\nOutside.\n`.replace(/\n/g, newline));
    const selection = f.refs().contract('artifact:RULES#narrow-contract').selection;
    assert.equal(selection.content, 'Chosen.\n\n#### Detail\nChild.\n\n');
    assert.deepEqual(Object.keys(selection), ['type', 'section', 'content']);
    const body = f.bodyOf(), view = parseReconciliationReferenceView(body);
    assert.ok(scopedSelectionNodes(body, selection).every((node) => view.tree.children.includes(node)));
    assert.deepEqual(scopedGraphSelectionSpans(body, view, structuredClone(selection)), scopedGraphSelectionSpans(body, view, selection));
    assert.throws(() => f.refs().contract('artifact:RULES#detail'), /SW-REF-MISSING/);
  }
});

test('H3: H2 namespace, extent and ambiguity take priority even beside duplicate H3 slugs', (t) => {
  const f = fixture(t, '## Narrow contract\nH2.\n\n### Narrow contract\nFirst.\n\n### Narrow contract\nSecond.\n\n## End\nOutside.');
  assert.equal(f.refs().contract('artifact:RULES#narrow-contract').selection.content, 'H2.\n\n### Narrow contract\nFirst.\n\n### Narrow contract\nSecond.\n\n');
  f.edit('rules.md', (doc) => { doc.body += '\n\n## **Narrow** contract\nDuplicate H2.'; });
  assert.throws(() => f.refs().contract('artifact:RULES#narrow-contract'), /SW-REF-AMBIGUOUS/);
});

test('H3: duplicate slugs fail; quoted, listed, fenced, inline, indented and generated examples cannot supply a heading', (t) => {
  const fake = ['> ### Narrow contract\n> Quoted.', '- Example\n\n  ### Narrow contract\n  Listed.',
    '```md\n### Narrow contract\nFenced.\n```', '    ### Narrow contract\n    Indented.', '`### Narrow contract`',
    '<!--\n### Narrow contract\nHidden.\n-->', generated('### Narrow contract\nGenerated.')];
  for (const text of fake) {
    const f = fixture(t, `## Rules\n\n${text}\n`);
    assert.throws(() => f.refs().contract('artifact:RULES#narrow-contract'), /SW-REF-MISSING/, text);
    f.edit('rules.md', (doc) => { doc.body += '\n### Narrow contract\nAuthored.\n'; });
    assert.equal(f.refs().contract('artifact:RULES#narrow-contract').selection.content, 'Authored.\n');
  }
  const f = fixture(t, '### Narrow contract\nA.\n\n### **Narrow** contract\nB.');
  assert.throws(() => f.refs().contract('artifact:RULES#narrow-contract'), /SW-REF-AMBIGUOUS/);
});

test('H3: generated headings do not split an authored subsection; copies and cache eviction restore native nodes', (t) => {
  const f = fixture(t, `## Rules\n\n### Narrow contract\nBefore.\n\n${generated('## Generated summary\n\n### Narrow contract\nOrdinary evidence.')}\n\nAfter.\n\n### Sibling\nOutside.`);
  const body = f.bodyOf(), view = parseReconciliationReferenceView(body), selection = f.refs().contract('artifact:RULES#narrow-contract').selection;
  assert.match(selection.content, /Before\.[\s\S]*After\./); assert.doesNotMatch(selection.content, /Outside/);
  const copied = copyScopedSelectionContext(selection, structuredClone(selection));
  assert.equal(scopedSelectionNodes(body, copied), scopedSelectionNodes(body, selection));
  const spans = scopedGraphSelectionSpans(body, view, selection);
  for (let i = 0; i < 17; i += 1) parseReconciliationReferenceView(`<!-- ${i}${'x'.repeat(2 * 1024 * 1024)} -->`);
  const fresh = parseReconciliationReferenceView(body);
  assert.notEqual(fresh.tree, view.tree, 'the original parse really was evicted');
  assert.deepEqual(scopedGraphSelectionSpans(body, fresh, JSON.parse(JSON.stringify(selection))), spans);
  assert.deepEqual(scopedAuthoredSubsections(body, 'narrow-contract', fresh)[0].nodes,
    scopedSelectionNodes(body, f.refs().contract('artifact:RULES#narrow-contract').selection));
  assert.throws(() => scopedGraphSelectionSpans(body, fresh, { ...selection, content: 'forged' }), /native source/);
});

test('H3: /row remains an H2 table selector and canonical homes cannot be forged with H3', (t) => {
  const families = [['Unknowns', 'unknown:U-ONE@RULES', ['ID', 'Question'], ['U-ONE', 'Question?']],
    ['Open Decisions', 'decision:D-ONE@RULES', ['ID', 'Status', 'Blocking Mode'], ['D-ONE', 'open', 'final-fixture-ui']],
    ['Conflicts', 'conflict:C-ONE@RULES', ['ID', 'Status'], ['C-ONE', 'open']],
    ['Gaps', 'gap:G-ONE@RULES', ['ID', 'Status'], ['G-ONE', 'open']],
    ['Component Gap Register', 'gap:G-ONE@RULES', ['ID', 'Status'], ['G-ONE', 'open']],
    ['API Candidates', null, ['Method', 'Path', 'Confidence'], ['GET', '/example', 'confirmed']],
    ['Component Mapping', null, ['ID', 'Value'], ['M-001', 'example']],
    ['Mapping Provenance', null, ['ID', 'Value'], ['M-001', 'example']]];
  for (const [title, token, headers, row] of families) {
    const f = fixture(t, `## Notes\n\n### ${title}\n\n${table(headers, [row])}`), slug = title.toLowerCase().replaceAll(' ', '-');
    assert.throws(() => f.refs().contract(`artifact:RULES#${slug}`), /SW-REF-MISSING/, title);
    if (token) assert.throws(() => f.refs().contract(token), /SW-REF-MISSING/, token);
  }
  const f = fixture(t, `### Narrow contract\n\n${table(['ID', 'Value'], [['01', 'ordinary']])}`);
  assert.match(f.refs().contract('artifact:RULES#narrow-contract').selection.content, /ordinary/);
  for (const suffix of ['/01', '/child/01', '//01']) assert.throws(() => f.refs().contract(`artifact:RULES#narrow-contract${suffix}`), /SW-REF-/);
});

test('H3: outside reference definitions retain context; dangling, malformed and shadowed dependencies fail closed', (t) => {
  const f = fixture(t, `[choice]: unknown:U-ONE@UNCERTAINTY\n\n### Narrow contract\nRead [question][choice].\n\n### Sibling\nOutside.`);
  const selection = f.refs().contract('artifact:RULES#narrow-contract').selection, body = f.bodyOf();
  assert.deepEqual(scopedGraphSelectionRefs(body, {}, selection), ['unknown:U-ONE@UNCERTAINTY']);
  assert.deepEqual(scopedGraphSelectionRefs(body, {}, structuredClone(selection)), ['unknown:U-ONE@UNCERTAINTY']);
  for (const text of ['artifact:MISSING#rules', 'unknown:bad@', '[question][choice]\n\n[choice]: artifact:RULES#other\n[choice]: artifact:MISSING']) {
    f.edit('rules.md', (doc) => { doc.body = `### Narrow contract\n${text}\n`; });
    assert.throws(() => resolveScopedContractGraph({ ...f.options(), contracts: ['artifact:RULES#narrow-contract'] }), /SW-/);
  }
});

function source(f, result = 'pending-user-decision') {
  f.write(`inputs/${INPUT}.md`, { input_id: INPUT, input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting:generic',
    captured_at: '2026-10-24T00:00:00Z', captured_by: 'test', status: 'captured', affected_domains: ['example'], affected_screens: ['EXAMPLE-001'] },
  '## Extracted Facts\n- Selected behavior.\n', f.inputs);
  f.edit('domains/example/screens/example/screen-spec.md', ({ fm }) => { fm.work_execution.units[0].sources = [{ input_id: INPUT, items: ['01'], source_refs: [REF] }]; });
  // The parent H2 overlaps H3; a selected Item still retains every sibling effect.
  f.put(`${DOCS}/_meta/reconciliation-register.md`, md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' },
    `${table(REQUIRED_REGISTER_COLS, [[INPUT, 'meeting', 'simple-update', 'reconciled', result, 'artifact:RULES', '-', '-']])}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS,
      ['rules', 'other'].map((section) => [INPUT, '01', 'compatible-fact', 'simple-update', 'update', `artifact:RULES#${section}`, REF, 'inherit', 'statement', 'inherit']))}`));
}

test('H3: parent effects still connect with whole groups; current receipts never replace semantic review or gates', (t) => {
  for (const result of ['accepted', 'pending', 'pending-user-decision', 'mixed']) {
    const f = fixture(t); source(f, result);
    const options = { ...f.options(), inputId: INPUT }, record = resolveScopedSourceRelations(options).sources[0];
    assert.equal(record.source.groups[0].effects.length, 2);
    assert.ok(record.connections.some((connection) => JSON.stringify(connection).includes('artifact:RULES#rules')));
    assert.equal(record.issues.length, 0);
    const coverage = resolveScopedCoverageBasis(options), receipt = { ...coverage.basis, review_scope: 'reconcile-stage04-v1', coverage: 'complete-for-unit' };
    const current = inspectScopedSourceCoverage({ ...options, receipts: [receipt] });
    assert.equal(current.receipt_state, 'current');
    assert.equal(current.semantic_coverage_verified, false); assert.equal(current.approval_verified, false);
    f.edit('rules.md', (doc) => { doc.body = doc.body.replace('Chosen behavior.', 'Changed chosen behavior.'); });
    assert.equal(inspectScopedSourceCoverage({ ...f.options(), inputId: INPUT, receipts: [receipt] }).receipt_state, 'stale');
  }
});

for (const relation of ['selected-evidence', 'inverse-evidence', 'transitive-evidence']) test(`H3: ${relation} keeps unresolved blocking under a current empty native binding`, (t) => {
  const f = fixture(t), ref = 'unknown:U-ONE@UNCERTAINTY';
  const question = relation === 'inverse-evidence' ? 'See artifact:RULES#rules' : 'Which behavior?';
  f.write('uncertainty.md', { artifact_id: 'UNCERTAINTY', artifact_type: 'domain-rules', domain: 'other', status: 'draft',
    uncertainty_work_scopes: { version: 1, bindings: [{ unknown_id: 'U-ONE', owner: OWNER, known_units: ['narrow'], blocks: [],
      basis_digest: `sha256:${'0'.repeat(64)}`, approval_ref: 'review:synthetic-only' }] } },
  `## Unknowns\n${table(['ID', 'Question', 'Status'], [['U-ONE', question, 'open']])}`);
  if (relation !== 'inverse-evidence') {
    if (relation === 'transitive-evidence') f.write('middle.md', { artifact_id: 'MIDDLE', artifact_type: 'domain-rules', domain: 'other' }, `## Rules\nSee ${ref}`);
    f.edit('rules.md', (doc) => { doc.body = doc.body.replace('Chosen behavior.', `See ${relation === 'transitive-evidence' ? 'artifact:MIDDLE#rules' : ref}`); });
  }
  const basis = resolveScopedUncertaintyBindingBasis({ ...f.options(), uncertaintyRef: ref });
  f.edit('uncertainty.md', ({ fm }) => { fm.uncertainty_work_scopes.bindings[0].basis_digest = basis.basis_digest; });
  const scopes = inspectScopedUncertaintyScopes(f.options());
  assert.equal(scopes.checks[0].binding_state, 'current-unverified');
  const app = resolveScopedUncertaintyProjection(f.options()).projection.uncertainty_relations.applications.find((entry) => entry.uncertainty === ref);
  assert.equal(app.unit, 'narrow'); assert.equal(app.relation, relation === 'transitive-evidence' ? 'selected-evidence' : relation);
  assert.ok(inspectScopedProfile(f.options()).denials.some((denial) => denial.code === 'unit-uncertainty-unresolved'));
  f.init();
  const envelope = json(f.cli('readiness.mjs', ['--json']));
  assert.equal(envelope.ready, false);
  assert.ok(envelope.denials.some((denial) => denial.code === 'unit-uncertainty-unresolved'));
});

test('H3 CLI: ready preflight and immutable authority remain bound to a fresh packet and Git backstop', (t) => {
  const f = fixture(t); f.init();
  const ready = json(f.cli('readiness.mjs', ['--json']));
  assert.equal(ready.ready, true, JSON.stringify(ready.denials));
  const packet = path.join(f.outside, 'packet.md');
  assert.equal(json(f.cli('workflow-packet.mjs', ['--out', packet, '--json'])).packet_type, 'scoped-work');
  f.put(ENTRY, 'export default "changed";\n');
  assert.equal(json(f.cli('forbidden-paths.mjs', ['--enforce', '--json'])).ok, true);
  f.edit('rules.md', (doc) => { doc.body = doc.body.replace('Chosen behavior.', 'Edited authority.'); });
  const changed = f.cli('forbidden-paths.mjs', ['--enforce', '--json']);
  assert.equal(changed.status, 1); assert.match(changed.stdout, /SW-GIT-AUTHORITY-CHANGED/);
  const post = json(f.cli('workflow-run.mjs', ['--packet', packet, '--json']));
  assert.equal(post.state, 'DONE_PENDING_REVIEW');
  assert.equal(post.backstop.ok, false); assert.match(JSON.stringify(post.backstop), /SW-GIT-AUTHORITY-CHANGED/);
  f.commit();
  const moved = f.cli('workflow-run.mjs', ['--packet', packet, '--json']);
  assert.equal(moved.status, 2); assert.match(moved.stderr, /snapshot|baseline/i);
});

test('H3 CLI: original origins and current receipts retain sibling-effect blockers and detect changed input bytes', (t) => {
  for (const result of ['pending-user-decision', 'mixed']) {
    const f = fixture(t); source(f, result);
    const origins = [{ input_id: INPUT, source_refs: [REF] }];
    const writeReceipt = () => {
      const { basis } = resolveScopedCoverageBasis({ ...f.options(), inputId: INPUT });
      f.put('review.md', `\`\`\`work-coverage\n${JSON.stringify({ ...basis, review_scope: 'reconcile-stage04-v1', coverage: 'complete-for-unit' })}\n\`\`\`\n`);
    };
    writeReceipt();
    const request = JSON.parse(fs.readFileSync(f.work));
    request.origin_inputs = origins; request.requests[0].coverage_reports = ['review.md'];
    fs.writeFileSync(f.work, JSON.stringify(request)); f.init();
    const ready = json(f.cli('readiness.mjs', ['--json']));
    assert.equal(ready.ready, true, JSON.stringify(ready.denials));
    assert.deepEqual(ready.origin_inputs.map(({ input_id, source_refs }) => ({ input_id, source_refs })), origins);
    assert.ok(ready.required_reviews.length > 0);
    f.write('uncertainty.md', { artifact_id: 'UNCERTAINTY', artifact_type: 'domain-rules', domain: 'other', status: 'draft' },
      `## Unknowns\n${table(['ID', 'Question', 'Status'], [['U-SIBLING', 'Unresolved sibling effect.', 'open']])}`);
    f.edit('rules.md', (doc) => { doc.body = doc.body.replace('Other contract.', 'See unknown:U-SIBLING@UNCERTAINTY'); });
    writeReceipt(); f.commit();
    const blocked = json(f.cli('readiness.mjs', ['--json']));
    assert.equal(blocked.ready, false);
    assert.ok(blocked.denials.some((entry) => entry.code === 'unit-uncertainty-unresolved' && JSON.stringify(entry).includes('U-SIBLING')));
    assert.equal(inspectScopedSourceCoverage({ ...f.options(), inputId: INPUT,
      receipts: [JSON.parse(fs.readFileSync(path.join(f.root, 'review.md'), 'utf8').split('\n')[1])] }).receipt_state, 'current');
    fs.appendFileSync(f.inputs.get(`inputs/${INPUT}.md`), '\nChanged source note.\n'); f.commit();
    const stale = json(f.cli('readiness.mjs', ['--json']));
    assert.equal(stale.ready, false); assert.match(JSON.stringify(stale.denials), /stale|coverage/);
  }
});
