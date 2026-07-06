// ci-telemetry-contract.test.mjs — CI telemetry artifact posture guard.
//
// This keeps the Actions slice observation-only: telemetry may collect evidence,
// but the workflow must not accidentally turn that collection into a blocking
// signal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { KIT_ROOT } from './util.mjs';

const REPO_ROOT = path.dirname(KIT_ROOT);
const WORKFLOW_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'frontend-workflow-kit.yml');

function loadValidateExampleSteps() {
  const workflow = parseYaml(fs.readFileSync(WORKFLOW_PATH, 'utf8'));
  const steps = workflow?.jobs?.['validate-example']?.steps;
  assert.ok(Array.isArray(steps), 'validate-example job steps should be present');
  return steps;
}

function findStepIndex(steps, predicate, label) {
  const index = steps.findIndex(predicate);
  assert.notEqual(index, -1, `${label} step should be present`);
  return index;
}

test('frontend workflow CI collects telemetry artifacts without making telemetry blocking', () => {
  const steps = loadValidateExampleSteps();

  const stateIndex = findStepIndex(steps, (step) => step.run === 'npm run example:state', 'example:state');
  const readinessIndex = findStepIndex(
    steps,
    (step) => step.run === 'npm run example:readiness',
    'example:readiness',
  );
  const telemetryIndex = findStepIndex(
    steps,
    (step) => step.name === 'telemetry observation ledger (warning-only)',
    'telemetry observation',
  );
  const summaryIndex = findStepIndex(
    steps,
    (step) => step.name === 'summarize telemetry artifact files (warning-only)',
    'telemetry artifact summary',
  );
  const uploadIndex = findStepIndex(
    steps,
    (step) => step.name === 'upload telemetry observation ledger' && step.uses === 'actions/upload-artifact@v4',
    'telemetry artifact upload',
  );
  const idempotencyIndex = findStepIndex(
    steps,
    (step) => step.name === 'assert generated docs match committed (idempotency)',
    'idempotency',
  );

  assert.ok(stateIndex < telemetryIndex, 'telemetry should run after example:state');
  assert.ok(readinessIndex < telemetryIndex, 'telemetry should run after example:readiness');
  assert.ok(telemetryIndex < summaryIndex, 'telemetry summary should inspect files after telemetry collection');
  assert.ok(summaryIndex < uploadIndex, 'telemetry upload should happen after artifact summary');
  assert.ok(uploadIndex < idempotencyIndex, 'telemetry artifacts should be uploaded before the idempotency gate');

  const telemetryStep = steps[telemetryIndex];
  assert.equal(telemetryStep['continue-on-error'], true, 'telemetry observation step must stay warning-only');
  assert.match(telemetryStep.run, /set \+e/);
  assert.match(
    telemetryStep.run,
    /npm --silent run workflow:telemetry -- \\\n\s+--docs examples\/coupon-feature\/docs\/frontend-workflow \\\n\s+--out "\$RUNNER_TEMP\/frontend-workflow-telemetry\/telemetry-ledger\.json"/,
  );
  assert.match(
    telemetryStep.run,
    /npm --silent run workflow:telemetry -- \\\n\s+--docs examples\/coupon-feature\/docs\/frontend-workflow \\\n\s+--json > "\$RUNNER_TEMP\/frontend-workflow-telemetry\/telemetry-report\.json"/,
  );
  assert.match(telemetryStep.run, /::warning::telemetry ledger collection exited with status/);
  assert.match(telemetryStep.run, /::warning::telemetry report collection exited with status/);

  const summaryStep = steps[summaryIndex];
  assert.equal(summaryStep.if, 'always()', 'telemetry artifact summary should run even after earlier failures');
  assert.equal(summaryStep['continue-on-error'], true, 'artifact summary should not make observation collection blocking');
  assert.match(summaryStep.run, /telemetry-ledger\.json/);
  assert.match(summaryStep.run, /telemetry-report\.json/);
  assert.match(summaryStep.run, /::warning::telemetry artifact file is missing or empty:/);

  const uploadStep = steps[uploadIndex];
  assert.equal(uploadStep.if, 'always()', 'telemetry artifact upload should run even after earlier failures');
  assert.equal(uploadStep['continue-on-error'], true, 'artifact upload should not make observation collection blocking');
  assert.equal(uploadStep.with?.['if-no-files-found'], 'warn');
  assert.equal(uploadStep.with?.['retention-days'], 30);
  assert.match(uploadStep.with?.name || '', /frontend-workflow-telemetry-/);
  assert.match(uploadStep.with?.name || '', /\$\{\{\s*github\.run_id\s*\}\}/);
  assert.match(uploadStep.with?.name || '', /\$\{\{\s*github\.run_attempt\s*\}\}/);
  assert.match(uploadStep.with?.path || '', /\$\{\{\s*runner\.temp\s*\}\}\/frontend-workflow-telemetry\/telemetry-ledger\.json/);
  assert.match(uploadStep.with?.path || '', /\$\{\{\s*runner\.temp\s*\}\}\/frontend-workflow-telemetry\/telemetry-report\.json/);
});
