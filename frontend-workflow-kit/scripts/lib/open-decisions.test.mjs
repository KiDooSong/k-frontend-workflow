import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT, DEFAULTS, loadYaml } from './util.mjs';
import { validateSchema } from './schema.mjs';
import { buildState } from '../workflow-state.mjs';
import { computeReadiness } from '../readiness.mjs';

const VALIDATE = path.join(KIT_ROOT, 'scripts', 'validate.mjs');

function withProject(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-decision-refs-'));
  const docsDir = path.join(root, 'docs', 'frontend-workflow');
  const srcDir = path.join(root, 'src');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.mkdirSync(srcDir, { recursive: true });
  try {
    return fn({ root, docsDir, srcDir });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function yamlRefs(refs) {
  if (refs === undefined) return '';
  if (typeof refs === 'string') return `decision_refs: ${refs}\n`;
  return `decision_refs:\n${refs.map((ref) => `  - ${JSON.stringify(ref)}`).join('\n')}\n`;
}

function writeScreen(docsDir, id, { refs, localRows = [] } = {}) {
  const dir = path.join(docsDir, 'domains', 'demo', 'screens', id.toLowerCase());
  fs.mkdirSync(dir, { recursive: true });
  const rows = localRows
    .map((row) => `| ${row.id} | ${row.question || 'Choose local behavior'} | A / B | ${row.mode || 'final-fixture-ui'} | PM | ${row.status || 'open'} |`)
    .join('\n');
  fs.writeFileSync(
    path.join(dir, 'screen-spec.md'),
    `---\n` +
      `artifact_id: ${id}-screen-spec\n` +
      `artifact_type: screen-spec\n` +
      `domain: demo\n` +
      `screen_id: ${id}\n` +
      `route: /${id.toLowerCase()}\n` +
      `status: draft\n` +
      yamlRefs(refs) +
      `---\n\n# ${id}\n\n## Purpose\n\nAuthored screen.\n\n` +
      `## Open Decisions\n\n` +
      `| ID | Decision Needed | Options | Blocking Mode | Owner | Status |\n` +
      `|---|---|---|---|---|---|\n${rows}\n`,
    'utf8',
  );
}

function writeRegister(docsDir, rows, { body } = {}) {
  const file = path.join(docsDir, 'global', 'open-decisions.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tableRows = rows
    .map((row) => `| ${row.id} | ${row.question ?? 'Choose shared behavior'} | A / B | ${row.mode || 'final-fixture-ui'} | PM | ${row.status || 'open'} |`)
    .join('\n');
  fs.writeFileSync(
    file,
    `---\nartifact_id: open-decision-register\nartifact_type: open-decision-register\nstatus: draft\n---\n\n` +
      (body ??
        `# Cross-screen decisions\n\n## Open Decisions\n\n` +
          `| ID | Decision Needed | Options | Blocking Mode | Owner | Status |\n` +
          `|---|---|---|---|---|---|\n${tableRows}\n`),
    'utf8',
  );
}

function fullyReady(state) {
  state.global.navigation_map_status = 'confirmed';
  state.global.component_catalog_generated = true;
  state.global.stub_screen_specs_count = Object.keys(state.screens).length;
  for (const screen of Object.values(state.screens)) {
    screen.status = 'confirmed';
    screen.stub = false;
    Object.assign(screen.derived, {
      state_matrix_complete: true,
      interaction_matrix_complete: true,
      api_confidence_min: 'confirmed',
      fake_hook_exists: true,
      figma_mapping_status: 'confirmed',
    });
  }
  return state;
}

function readinessFor(state) {
  return computeReadiness({
    state: fullyReady(state),
    policy: loadYaml(DEFAULTS.policy),
    manifest: loadYaml(DEFAULTS.manifest),
    ci: {
      ci_lint: 'pass',
      ci_schema_validation: 'pass',
      state_coverage_complete: true,
      llm_semantic_review: 'pass',
    },
  });
}

function validateProject({ root, docsDir, srcDir }) {
  const result = spawnSync(
    process.execPath,
    [
      VALIDATE,
      '--docs', docsDir,
      '--src', srcDir,
      '--root', root,
      '--manifest', DEFAULTS.manifest,
      '--schema', DEFAULTS.schema,
      '--policy', DEFAULTS.policy,
      '--json',
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  assert.ok(result.stdout, result.stderr);
  return { result, report: JSON.parse(result.stdout) };
}

test('one canonical open row fans out with provenance; local lowest cap wins; resolved and unrelated screens stay non-blocking', () => {
  withProject(({ docsDir, srcDir }) => {
    writeRegister(docsDir, [
      { id: 'D-SHARED', mode: 'final-fixture-ui' },
      { id: 'D-RESOLVED', mode: 'final-fixture-ui', status: 'resolved' },
    ]);
    writeScreen(docsDir, 'SCREEN-A', { refs: ['D-SHARED'] });
    writeScreen(docsDir, 'SCREEN-B', {
      refs: ['D-SHARED'],
      localRows: [{ id: 'D-LOCAL', mode: 'rough-fixture-ui' }],
    });
    writeScreen(docsDir, 'SCREEN-C');
    writeScreen(docsDir, 'SCREEN-D', { refs: ['D-RESOLVED'] });

    const { state } = buildState({ docsDir, srcDir, date: '2026-07-15' });
    const source = {
      artifact_id: 'open-decision-register',
      artifact_type: 'open-decision-register',
      path: 'global/open-decisions.md',
    };
    assert.deepEqual(state.screens['SCREEN-A'].derived.decision_refs[0].source, source);
    assert.deepEqual(state.screens['SCREEN-A'].derived.blocking_decisions[0].source, source);
    assert.equal(state.screens['SCREEN-A'].derived.open_decisions_count, 1);
    assert.deepEqual(
      state.screens['SCREEN-B'].derived.blocking_decisions.map((row) => row.id),
      ['D-LOCAL', 'D-SHARED'],
    );
    assert.equal(state.screens['SCREEN-C'].derived.decision_refs, undefined);
    assert.equal(state.screens['SCREEN-C'].derived.open_decisions_count, 0);
    assert.equal(state.screens['SCREEN-D'].derived.decision_refs[0].status, 'resolved');
    assert.deepEqual(state.screens['SCREEN-D'].derived.blocking_decisions, []);

    const readiness = readinessFor(state);
    assert.equal(readiness['SCREEN-A'].readiness_mode, 'rough-fixture-ui');
    assert.equal(readiness['SCREEN-B'].readiness_mode, 'screen-skeleton');
    assert.equal(readiness['SCREEN-C'].readiness_mode, 'production-ready');
    assert.equal(readiness['SCREEN-D'].readiness_mode, 'production-ready');
    assert.deepEqual(readiness['SCREEN-A'].blocking[0].open_decision.source, source);
    assert.equal(readiness['SCREEN-B'].blocking[0].open_decision.source, undefined, 'local blocker shape stays unchanged');
  });
});

test('resolved canonical ref with a mode outside the effective policy fails closed in readiness', () => {
  withProject((project) => {
    writeRegister(project.docsDir, [
      { id: 'D-BAD-MODE', mode: 'typo-mode', status: 'resolved' },
    ]);
    writeScreen(project.docsDir, 'REF', { refs: ['D-BAD-MODE'] });

    const state = buildState({
      docsDir: project.docsDir,
      srcDir: project.srcDir,
      date: '2026-07-15',
    }).state;
    assert.equal(state.screens.REF.derived.decision_refs[0].status, 'resolved');

    const { report } = validateProject(project);
    assert.ok(
      report.errors.some(
        (error) =>
          error.check === 9 &&
          /Blocking Mode 'typo-mode' 가 정책 모드가 아님/.test(error.message),
      ),
    );

    const readiness = readinessFor(state).REF;
    assert.equal(readiness.readiness_mode, 'docs-only');
    const invalid = readiness.blocking[0].invalid_open_decision;
    assert.deepEqual(invalid.source, {
      artifact_id: 'open-decision-register',
      artifact_type: 'open-decision-register',
      path: 'global/open-decisions.md',
    });
    assert.equal(invalid.status, 'resolved');
    assert.equal(invalid.code, 'invalid-blocking-mode');
    assert.match(invalid.reason, /typo-mode.*effective policy/);
    assert.match(readiness.next_actions[0], /typo-mode.*effective policy/);
  });
});

test('missing targets/register and malformed/structurally invalid registers fail closed only for referring screens', () => {
  withProject((project) => {
    const { docsDir, srcDir } = project;
    writeScreen(docsDir, 'REF', { refs: ['D-MISSING'] });
    writeScreen(docsDir, 'UNRELATED');

    let state = buildState({ docsDir, srcDir, date: '2026-07-15' }).state;
    assert.match(state.screens.REF.derived.malformed_decisions[0].reason, /register is missing/);
    assert.equal(state.screens.REF.derived.malformed_decisions[0].code, 'missing-register');
    assert.deepEqual(state.screens.UNRELATED.derived.malformed_decisions, []);
    let readiness = readinessFor(state);
    assert.equal(readiness.REF.readiness_mode, 'docs-only');
    assert.equal(readiness.REF.blocking[0].invalid_open_decision.code, 'missing-register');
    assert.match(readiness.REF.blocking[0].invalid_open_decision.reason, /register is missing/);
    assert.match(readiness.REF.next_actions[0], /create global\/open-decisions\.md/);

    writeRegister(docsDir, [{ id: 'D-OTHER' }]);
    state = buildState({ docsDir, srcDir, date: '2026-07-15' }).state;
    assert.match(state.screens.REF.derived.malformed_decisions[0].reason, /reference is unresolved/);
    assert.equal(state.screens.REF.derived.malformed_decisions[0].code, 'unresolved-ref');
    readiness = readinessFor(state);
    assert.match(readiness.REF.next_actions[0], /add canonical Open Decision D-MISSING/);

    writeRegister(docsDir, [], {
      body:
        '# Broken columns\n\n## Open Decisions\n\n' +
        '| ID | Decision Needed | Blocking Mode | Status |\n' +
        '|---|---|---|---|\n' +
        '| D-MISSING | Which shared empty state? | final-fixture-ui | resolved |\n',
    });
    state = buildState({ docsDir, srcDir, date: '2026-07-15' }).state;
    assert.match(state.screens.REF.derived.malformed_decisions[0].reason, /missing-required-columns/);
    readiness = readinessFor(state);
    assert.equal(readiness.REF.readiness_mode, 'docs-only');
    assert.equal(readiness.REF.blocking[0].invalid_open_decision.code, 'invalid-register');
    assert.match(readiness.REF.blocking[0].invalid_open_decision.reason, /missing-required-columns/);
    const missingColumnsReport = validateProject(project).report;
    assert.ok(
      missingColumnsReport.errors.some(
        (error) =>
          error.check === 9 &&
          /Open Decisions 표 필수 컬럼 누락: Options, Owner/.test(error.message),
      ),
    );

    writeRegister(docsDir, [], { body: '# Broken\n\n## Open Decisions\n\n- D-MISSING in prose\n' });
    state = buildState({ docsDir, srcDir, date: '2026-07-15' }).state;
    assert.match(state.screens.REF.derived.malformed_decisions[0].reason, /structurally invalid/);
    assert.equal(readinessFor(state).REF.blocking[0].invalid_open_decision.source.path, 'global/open-decisions.md');

    writeRegister(docsDir, [{ id: 'D-MISSING', question: '' }]);
    state = buildState({ docsDir, srcDir, date: '2026-07-15' }).state;
    assert.match(state.screens.REF.derived.malformed_decisions[0].reason, /row is malformed/);
    assert.equal(readinessFor(state).UNRELATED.readiness_mode, 'production-ready');
  });
});

test('invalid decision_refs shapes and duplicate/ambiguous canonical IDs fail closed in state', () => {
  withProject(({ docsDir, srcDir }) => {
    writeRegister(docsDir, [
      { id: 'D-DUP' },
      { id: 'D-DUP' },
      { id: 'D-CROSS' },
    ]);
    writeScreen(docsDir, 'SCALAR', { refs: 'D-DUP' });
    writeScreen(docsDir, 'INVALID', { refs: ['', 'D-DUP', 'D-DUP'] });
    writeScreen(docsDir, 'CROSS', {
      refs: ['D-CROSS'],
      localRows: [{ id: 'D-CROSS' }],
    });
    const state = buildState({ docsDir, srcDir, date: '2026-07-15' }).state;
    assert.match(state.screens.SCALAR.derived.malformed_decisions[0].reason, /must be an array/);
    assert.ok(state.screens.INVALID.derived.malformed_decisions.some((row) => /non-empty string/.test(row.reason)));
    assert.ok(state.screens.INVALID.derived.malformed_decisions.some((row) => /duplicate decision reference/.test(row.reason)));
    assert.ok(state.screens.INVALID.derived.malformed_decisions.some((row) => /ambiguous/.test(row.reason)));
    assert.match(state.screens.CROSS.derived.malformed_decisions[0].reason, /ambiguous/);
  });
});

test('validate check 9 rejects missing/local-only refs, bad shapes, and duplicate global/local IDs', () => {
  withProject((project) => {
    writeRegister(project.docsDir, [
      { id: 'D-DUP' },
      { id: 'D-DUP' },
      { id: 'D-CROSS' },
    ]);
    writeScreen(project.docsDir, 'LOCAL-OWNER', { localRows: [{ id: 'D-LOCAL' }] });
    writeScreen(project.docsDir, 'LOCAL-REF', { refs: ['D-LOCAL'] });
    writeScreen(project.docsDir, 'CROSS', {
      refs: ['D-CROSS'],
      localRows: [{ id: 'D-CROSS' }],
    });
    writeScreen(project.docsDir, 'SCALAR', { refs: 'D-DUP' });
    writeScreen(project.docsDir, 'INVALID', { refs: ['', 'D-DUP', 'D-DUP'] });
    const { result, report } = validateProject(project);
    assert.equal(result.status, 1);
    const messages = report.errors.filter((e) => e.check === 9).map((e) => e.message).join('\n');
    assert.match(messages, /Open Decision ID 전역 중복: D-DUP/);
    assert.match(messages, /Open Decision ID 전역 중복: D-CROSS/);
    assert.match(messages, /ScreenSpec-local 결정만 가리킴/);
    assert.match(messages, /unique non-empty string 배열/);
    assert.match(messages, /비어 있지 않은 문자열/);
    assert.match(messages, /decision_refs 중복: D-DUP/);
    assert.match(messages, /canonical 대상이 중복\/모호함/);
    const duplicateErrors = report.errors.filter(
      (error) => error.check === 9 && /Open Decision ID 전역 중복/.test(error.message),
    );
    assert.ok(
      duplicateErrors.every(
        (error) => error.file === 'docs/frontend-workflow/global/open-decisions.md',
      ),
    );
    const crossDuplicate = duplicateErrors.find((error) => /D-CROSS/.test(error.message));
    assert.match(crossDuplicate.message, /global\/open-decisions\.md/);
    assert.match(crossDuplicate.message, /domains\/demo\/screens\/cross\/screen-spec\.md/);
  });

  withProject((project) => {
    writeScreen(project.docsDir, 'MISSING-REGISTER', { refs: ['D-NONE'] });
    const { report } = validateProject(project);
    assert.ok(report.errors.some((e) => e.check === 9 && /canonical register 가 없음/.test(e.message)));
  });

  withProject((project) => {
    writeRegister(project.docsDir, [{ id: 'D-OTHER' }]);
    writeScreen(project.docsDir, 'MISSING-TARGET', { refs: ['D-NONE'] });
    const { report } = validateProject(project);
    assert.ok(report.errors.some((e) => e.check === 9 && /대상이 global\/open-decisions\.md 에 없음/.test(e.message)));
  });

  withProject((project) => {
    writeRegister(project.docsDir, [], { body: '# Broken\n\n## Open Decisions\n\n- not a table\n' });
    writeScreen(project.docsDir, 'BROKEN-REGISTER', { refs: ['D-NONE'] });
    const { report } = validateProject(project);
    const messages = report.errors.filter((e) => e.check === 9).map((e) => e.message).join('\n');
    assert.match(messages, /파싱 가능한 표가 없음/);
    assert.match(messages, /canonical register 구조가 잘못됨/);
  });
});

test('frontmatter schema enforces unique non-empty decision_refs', () => {
  const schema = JSON.parse(fs.readFileSync(DEFAULTS.schema, 'utf8'));
  const base = { artifact_id: 'x', artifact_type: 'screen-spec', status: 'draft' };
  assert.deepEqual(validateSchema({ ...base, decision_refs: ['D-1'] }, schema), []);
  assert.ok(validateSchema({ ...base, decision_refs: [''] }, schema).some((e) => /minLength/.test(e)));
  assert.ok(validateSchema({ ...base, decision_refs: ['D-1', 'D-1'] }, schema).some((e) => /uniqueItems/.test(e)));
  assert.ok(validateSchema({ ...base, decision_refs: 'D-1' }, schema).some((e) => /type 불일치/.test(e)));
});
