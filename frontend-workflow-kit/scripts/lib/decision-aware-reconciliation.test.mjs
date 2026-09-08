// Issue #227: authored synthetic before/after records, not an LLM run or dogfood.
// Reuse production parsers, v2 validation, state and readiness; do not classify prose.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KIT_ROOT, DEFAULTS, loadYaml, splitFrontmatter, walkFiles } from './util.mjs';
import { collectInputArtifacts } from './input-artifact.mjs';
import { parseReconciliationRegister } from './reconciliation-register.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { validateReconciliationV2 } from './reconciliation-items.mjs';
import { buildState } from '../workflow-state.mjs';
import { computeReadiness } from '../readiness.mjs';

const INPUT = 'IN-20260908-qa-001';
const SCREEN = 'AUTH-227';
const SCREEN_ARTIFACT = `${SCREEN}-screen-spec`;
const SCREEN_PATH = 'domains/demo/screens/auth/screen-spec.md';
const REGISTER_PATH = '_meta/reconciliation-register.md';
const SUMMARY_HEADER = '| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |\n|---|---|---|---|---|---|---|---|';
const ITEMS_HEADER = '| Input ID | Item | Basis | Classification | Effect | Target | Evidence | Source Ref | Source Unit | Captured At |\n|---|---|---|---|---|---|---|---|---|---|';
const DECISION_HEADER = '| ID | Decision Needed | Options | Blocking Mode | Owner | Status |\n|---|---|---|---|---|---|';

function fixture(t, { global = false, open = false, fact } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-aware-reconciliation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs', 'frontend-workflow');
  const srcDir = path.join(root, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  const write = (rel, content) => {
    const file = path.join(docsDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  };
  const read = (rel) => fs.readFileSync(path.join(docsDir, rel), 'utf8');
  const decisionId = global ? 'D-GLOBAL-227' : 'D-LOCAL-227';
  const decisionOwner = global ? 'open-decision-register' : SCREEN_ARTIFACT;
  const decisionPath = global ? 'global/open-decisions.md' : SCREEN_PATH;
  const selected = open ? 'guest entry / blocking prompt (not selected)' : 'chosen: non-blocking guest entry';
  const row = `| ${decisionId} | Guest entry on AUTH-227 mobile v2 | ${selected} | final-fixture-ui | PM | ${open ? 'open' : 'resolved'} |`;
  write(SCREEN_PATH, `---\nartifact_id: ${SCREEN_ARTIFACT}\nartifact_type: screen-spec\ndomain: demo\nscreen_id: ${SCREEN}\nroute: /auth\nstatus: draft\n${global ? `decision_refs:\n  - ${decisionId}\n` : ''}---\n\n# Auth\n\n## Purpose\n\nGuest entry on mobile v2.\n\n## Unknowns\n\n| ID | Question | Status |\n|---|---|---|\n| U-227 | Which loading copy is appropriate? | open |\n\n## Open Decisions\n\n${DECISION_HEADER}\n${global ? '' : row}\n\n## Notes\n\n- Scope: AUTH-227, mobile v2.\n`);
  if (global) write(decisionPath, `---\nartifact_id: open-decision-register\nartifact_type: open-decision-register\nstatus: draft\n---\n\n# Shared decisions\n\n## Open Decisions\n\n${DECISION_HEADER}\n${row}\n`);
  write(`inputs/${INPUT}.md`, `---\ninput_id: ${INPUT}\ninput_type: qa\nsource_type: qa\nsource_ref: fixture://decision-aware/qa-report\ncaptured_at: "2026-09-08T11:30:00+09:00"\ncaptured_by: synthetic-fixture-author\nstatus: captured\naffected_domains: [demo]\naffected_screens: [${SCREEN}]\n---\n\n## Summary\n\nSynthetic decision comparison example.\n\n## Extracted Facts\n- ${fact ?? `QA reports blocked guest entry on AUTH-227 mobile v2. Keep non-blocking entry per ${decisionId}; reproduction is not yet verified.`}\n`);
  const project = { root, docsDir, srcDir, write, read, decisionId, decisionOwner, decisionPath, row };
  // Register-first in the authored example. No target edit precedes this row.
  writeRegister(project, `| ${INPUT} | qa | - | in-progress | pending | - | - | - |`, []);
  return project;
}

function writeRegister(p, summary, rows) {
  p.write(REGISTER_PATH, `---\ntitle: Reconciliation Register\nstatus: draft\nkind: meta-register\nreconciliation_contract: 2\nreview_profile: reconcile-stage04-v1\nstructured_since: "2026-09-01T00:00:00+09:00"\n---\n\n# Reconciliation Register\n\n${SUMMARY_HEADER}\n${summary}\n\n## Reconciliation Items\n\n${ITEMS_HEADER}\n${rows.join('\n')}\n`);
}

function finish(p, classification, touched, created, rows, result = 'accepted') {
  // Result=accepted records input processing, not an accept/confirm/resolve effect.
  writeRegister(p, `| ${INPUT} | qa | ${classification} | reconciled | ${result} | ${touched} | ${created} | - |`, rows);
}

function item(basis, classification, effect, target, id = '01') {
  return `| ${INPUT} | ${id} | ${basis} | ${classification} | ${effect} | ${target} | input:${INPUT}#extracted-facts/01 | inherit | statement | inherit |`;
}

function validate(p) {
  const docs = walkFiles(p.docsDir, ['.md']).flatMap((file) => {
    const rel = path.relative(p.docsDir, file).split(path.sep)[0];
    if (rel === '_meta' || rel === 'inputs') return [];
    const { data, hasFrontmatter } = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    return hasFrontmatter && data.artifact_type ? [{ file, fm: data }] : [];
  });
  const registerFile = path.join(p.docsDir, REGISTER_PATH);
  return validateReconciliationV2({
    register: parseReconciliationRegister(registerFile),
    registerFile,
    inputArtifacts: collectInputArtifacts(path.join(p.docsDir, 'inputs')),
    targetIndex: buildReconciliationTargetIndex({ docs }),
  });
}

function documentSnapshot(p) {
  return Object.fromEntries(walkFiles(p.docsDir, ['.md']).flatMap((file) => {
    const rel = path.relative(p.docsDir, file).split(path.sep).join('/');
    return rel.startsWith('_meta/') || rel.startsWith('inputs/') ? [] : [[rel, fs.readFileSync(file, 'utf8')]];
  }));
}

function changedDocuments(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((file) => before[file] !== after[file]).sort();
}

function readiness(p) {
  const { state } = buildState({ docsDir: p.docsDir, srcDir: p.srcDir, date: '2026-09-08' });
  // As in open-decisions.test.mjs, stub only the fact ceiling in memory to isolate
  // the production decision-cap calculation. Never write these promotions to docs.
  const ready = structuredClone(state);
  ready.global.navigation_map_status = 'confirmed';
  ready.global.component_catalog_generated = true;
  ready.global.stub_screen_specs_count = Object.keys(ready.screens).length;
  for (const screen of Object.values(ready.screens)) {
    screen.status = 'confirmed';
    screen.stub = false;
    Object.assign(screen.derived, {
      state_matrix_complete: true, interaction_matrix_complete: true,
      api_confidence_min: 'confirmed', fake_hook_exists: true, figma_mapping_status: 'confirmed',
    });
  }
  const report = computeReadiness({
    state: ready, policy: loadYaml(DEFAULTS.policy), manifest: loadYaml(DEFAULTS.manifest),
    ci: { ci_lint: 'pass', ci_schema_validation: 'pass', state_coverage_complete: true, llm_semantic_review: 'pass' },
  });
  return { derived: state.screens[SCREEN].derived, report: report[SCREEN] };
}

for (const global of [false, true]) {
  test(`${global ? 'T4 global reference' : 'T1 local decision'}: real evidence note, no new gate or decision transition`, (t) => {
    const p = fixture(t, { global });
    const before = documentSnapshot(p);
    const initial = readiness(p);
    assert.equal(initial.report.readiness_mode, 'production-ready');
    p.write(SCREEN_PATH, `${p.read(SCREEN_PATH)}- Reported, unverified implementation drift: preserve ${p.decisionId}'s non-blocking guest entry for mobile v2. Evidence: input:${INPUT}#extracted-facts/01. Follow up in Stage 05/06 to reproduce and implement only within readiness; Stage 04 does not edit code.\n`);
    finish(p, 'simple-update', `artifact:${SCREEN_ARTIFACT}`, '-', [
      item('compatible-fact', 'simple-update', 'update', `artifact:${SCREEN_ARTIFACT}#notes`),
    ]);
    assert.deepEqual(validate(p).errors, []);
    assert.deepEqual(changedDocuments(before, documentSnapshot(p)), [SCREEN_PATH]);
    assert.ok(p.read(p.decisionPath).includes(p.row), 'resolved choice and scope stay unchanged');
    assert.ok(p.read(SCREEN_PATH).includes('| U-227 | Which loading copy is appropriate? | open |'));
    const after = readiness(p);
    assert.deepEqual(after.derived.blocking_decisions, initial.derived.blocking_decisions);
    assert.equal(after.report.readiness_mode, 'production-ready');
    assert.equal(after.derived.open_decisions_count, 0);
    if (global) {
      const ref = after.derived.decision_refs.find((row) => row.id === p.decisionId);
      assert.equal(ref.status, 'resolved');
      assert.equal(ref.source.artifact_id, 'open-decision-register');
      assert.equal(p.read(p.decisionPath), before[p.decisionPath]);
    }
    assert.equal(fs.existsSync(path.join(p.docsDir, 'global/decision-log.md')), false,
      'a history artifact is not a fixture or runtime prerequisite');
  });
}

test('T5: a genuinely opposite requirement preserves the old value and raises the native decision cap', (t) => {
  const p = fixture(t, { global: true, fact: 'New requirement for AUTH-227 mobile v2: block guest entry with a mandatory prompt instead of the current non-blocking choice in D-GLOBAL-227.' });
  const before = documentSnapshot(p);
  assert.equal(readiness(p).report.readiness_mode, 'production-ready');
  p.write(p.decisionPath, p.read(p.decisionPath).replace(p.row, p.row.replace('| resolved |', '| open |')));
  p.write('global/conflicts.md', `---\nartifact_id: conflicts\nartifact_type: conflicts\nstatus: draft\n---\n\n# Conflicts\n\n| ID | 충돌 지점 | A (출처/값) | B (출처/값) | 영향 화면 | Status |\n|---|---|---|---|---|---|\n| C-227 | Mobile v2 guest entry | input:${INPUT}#extracted-facts/01 / mandatory blocking prompt | ${p.decisionId} / previously chosen non-blocking guest entry | ${SCREEN} | open |\n`);
  const conflict = 'conflict:C-227@conflicts';
  const decision = `decision:${p.decisionId}@${p.decisionOwner}`;
  const rows = [item('resolved-decision-conflict', 'conflict', 'create-open', conflict), item('resolved-decision-conflict', 'conflict', 'reopen', decision)];
  finish(p, 'conflict', 'artifact:conflicts; artifact:open-decision-register', `${conflict}; ${decision}`, rows, 'pending-user-decision');
  assert.deepEqual(validate(p).errors, []);
  assert.deepEqual(changedDocuments(before, documentSnapshot(p)), ['global/conflicts.md', 'global/open-decisions.md']);
  assert.equal(p.read(SCREEN_PATH), before[SCREEN_PATH]);
  assert.match(p.read('global/conflicts.md'), /previously chosen non-blocking guest entry/);
  const after = readiness(p);
  assert.equal(after.derived.open_decisions_count, 1);
  assert.equal(after.report.readiness_mode, 'rough-fixture-ui');
  assert.equal(after.report.blocking[0].open_decision.source.artifact_id, 'open-decision-register');
  // Keep projections valid but separate the pair: the existing hard router must reject it.
  rows[1] = item('resolved-decision-conflict', 'conflict', 'reopen', decision, '02');
  finish(p, 'conflict×2', 'artifact:conflicts; artifact:open-decision-register', `${conflict}; ${decision}`, rows, 'pending-user-decision');
  assert.ok(validate(p).errors.some((e) => e.message.startsWith('RR-ROUTE-')));
});

for (const kind of ['unknown', 'decision']) {
  test(`T8 ${kind}: a new answer links evidence without resolving the originally open row`, (t) => {
    const p = fixture(t, { open: true, fact: kind === 'unknown' ? 'Proposed loading copy: Loading. This answers U-227, pending human confirmation.' : 'Proposed answer to D-LOCAL-227: non-blocking guest entry, pending human confirmation.' });
    const before = p.read(SCREEN_PATH);
    if (kind === 'unknown') p.write(SCREEN_PATH, before.replace('Which loading copy is appropriate?', `Which loading copy is appropriate? Proposed answer: Loading; input:${INPUT}#extracted-facts/01`));
    else p.write(SCREEN_PATH, `${before}- Proposed answer to ${p.decisionId}: non-blocking guest entry; input:${INPUT}#extracted-facts/01. Human decision remains pending.\n`);
    const target = kind === 'unknown' ? `unknown:U-227@${SCREEN_ARTIFACT}` : `decision:${p.decisionId}@${p.decisionOwner}`;
    const classification = kind === 'unknown' ? 'resolves-unknown' : 'resolves-decision';
    finish(p, classification, `artifact:${SCREEN_ARTIFACT}`, target, [item(`${kind}-answer`, classification, 'link-evidence', target)], kind === 'decision' ? 'pending-user-decision' : 'accepted');
    assert.notEqual(p.read(SCREEN_PATH), before);
    assert.deepEqual(validate(p).errors, []);
    assert.ok(p.read(SCREEN_PATH).includes(p.row), 'the open decision is unchanged');
    assert.match(p.read(SCREEN_PATH), /\| U-227 \|[^\n]+\| open \|/);
    assert.equal(readiness(p).derived.open_decisions_count, 1);
  });
}

test('negative routing: a note update is not simple-update + link-evidence', (t) => {
  const p = fixture(t);
  const target = `artifact:${SCREEN_ARTIFACT}#notes`;
  p.write(SCREEN_PATH, `${p.read(SCREEN_PATH)}- Reported drift: input:${INPUT}#extracted-facts/01.\n`);
  finish(p, 'simple-update', `artifact:${SCREEN_ARTIFACT}`, target, [item('compatible-fact', 'simple-update', 'link-evidence', target)]);
  assert.ok(validate(p).errors.some((e) => e.message.startsWith('RR-ROUTE-')));
});

test('decision-aware guidance: execution surfaces link the canonical procedure; both test lists include this regression', () => {
  const canonical = path.join(KIT_ROOT, 'docs/reference/input-reconciliation.md');
  const contract = fs.readFileSync(canonical, 'utf8');
  assert.match(contract, /^## Decision-aware preclassification$/m);
  const surfaces = ['skills/reconcile-input/SKILL.md', 'docs/reference/workflow-stages/04-reconcile-input.md', 'docs/reference/reconcile-review-rubric.md'].map((p) => path.join(KIT_ROOT, p));
  // Repo-local skills are not part of the consumer distribution.
  const local = path.join(KIT_ROOT, '../.claude/skills/reconcile-input/SKILL.md');
  if (fs.existsSync(local)) surfaces.push(local);
  for (const file of surfaces) {
    const text = fs.readFileSync(file, 'utf8');
    for (const token of ['Unknowns', 'Open Decisions', 'decision_refs']) assert.ok(text.includes(token), `${file}: ${token}`);
    const link = [...text.matchAll(/\]\(([^)]+)#decision-aware-preclassification\)/g)];
    assert.ok(link.length, `${file}: canonical comparison link`);
    for (const match of link) assert.equal(path.resolve(path.dirname(file), match[1]), canonical);
  }
  const matrix = fs.readFileSync(path.join(KIT_ROOT, 'examples/reconciliation-validation/decision-aware/README.md'), 'utf8');
  for (let i = 1; i <= 8; i++) assert.ok(matrix.includes(`| T${i} |`));
  const { scripts } = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'package.json'), 'utf8'));
  for (const name of ['test', 'test:spec']) assert.equal(scripts[name].split('scripts/lib/decision-aware-reconciliation.test.mjs').length - 1, 1);
});
