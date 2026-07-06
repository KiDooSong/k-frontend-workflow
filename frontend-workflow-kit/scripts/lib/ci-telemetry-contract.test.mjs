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

test('frontend workflow CI collects telemetry artifacts without making telemetry blocking', () => {
  const steps = loadValidateExampleSteps();
  const telemetryStep = steps.find((step) => /npm\s+(--silent\s+)?run\s+workflow:telemetry/.test(String(step.run || '')));
  assert.ok(telemetryStep, 'telemetry observation step should run workflow:telemetry');
  assert.equal(telemetryStep['continue-on-error'], true, 'telemetry observation step must stay warning-only');
  assert.match(telemetryStep.run, /npm\s+--silent\s+run\s+workflow:telemetry/);
  assert.match(telemetryStep.run, /--docs\s+examples\/coupon-feature\/docs\/frontend-workflow/);
  assert.match(telemetryStep.run, /--out\s+"\$RUNNER_TEMP\/frontend-workflow-telemetry\/telemetry-ledger\.json"/);
  assert.match(telemetryStep.run, /--json\s*>\s*"\$RUNNER_TEMP\/frontend-workflow-telemetry\/telemetry-report\.json"/);

  const uploadStep = steps.find((step) => String(step.uses || '').startsWith('actions/upload-artifact@v4'));
  assert.ok(uploadStep, 'telemetry artifact upload step should use actions/upload-artifact@v4');
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
