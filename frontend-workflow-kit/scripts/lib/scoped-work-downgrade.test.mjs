import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { KIT_ROOT } from './util.mjs';
import { INSTALL_MANIFEST_NAME, PAYLOAD_MANIFEST_NAME } from './kit-manifest.mjs';
import { ADOPTION_GUARD_MODULE, buildPlan, applyPlan, renderPlanMarkdown, findAdoptionMarkers } from './upgrade-planner.mjs';

const CLI = path.join(KIT_ROOT, 'scripts', 'upgrade-vendored-kit.mjs');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const VENDORED = 'tools/frontend-workflow';

function put(root, rel, content) {
  const file = path.join(root, rel); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content); return file;
}
// A consumer repository with a vendored kit and a separately packed next payload.
function scenario(t, { guard = false, marker = true } = {}) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-downgrade-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const consumer = path.join(temp, 'consumer'), currentDir = path.join(consumer, VENDORED), nextDir = path.join(temp, 'next');
  put(currentDir, 'runtime.mjs', 'A');
  put(currentDir, INSTALL_MANIFEST_NAME, JSON.stringify({ schema_version: 1, kit: { source_repo: 'O/R', source_ref: 'NEWREF' },
    payload: { destination_hint: VENDORED, files: [{ path: 'runtime.mjs', sha256: sha('A'), classification: 'consumer-runtime', mode: '100644' }] } }));
  const files = [{ path: 'runtime.mjs', sha256: sha('OLD'), classification: 'consumer-runtime', mode: '100644' }];
  put(nextDir, 'runtime.mjs', 'OLD');
  if (guard) { put(nextDir, ADOPTION_GUARD_MODULE, 'export {};\n'); files.push({ path: ADOPTION_GUARD_MODULE, sha256: sha('export {};\n'), classification: 'consumer-runtime', mode: '100644' }); }
  put(nextDir, PAYLOAD_MANIFEST_NAME, JSON.stringify({ schema_version: 1, kit: { source_repo: 'O/R', source_ref: 'OLDREF' },
    distribution_manifest_version: 1, payload: { destination_hint: VENDORED, files } }));
  if (marker) put(consumer, 'config/policy.yaml', `version: 1\nwork_execution:\n  version: 1\n  owners: [screen:RESULT-001]\n`);
  put(consumer, 'README.md', '# Consumer\n');
  const git = (...args) => execFileSync('git', args, { cwd: consumer, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q'); git('config', 'maintenance.auto', 'false'); git('config', 'gc.auto', '0');
  git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'test');
  git('add', '-A'); git('commit', '-qm', 'consumer');
  const cli = (...args) => spawnSync(process.execPath, [CLI, '--current', currentDir, '--next', nextDir, ...args], { cwd: consumer, encoding: 'utf8' });
  return { consumer, currentDir, nextDir, git, cli };
}

test('D33: a payload that cannot enforce adoption markers is never applied while markers remain', (t) => {
  const s = scenario(t), plan = buildPlan({ currentDir: s.currentDir, nextDir: s.nextDir });
  assert.equal(plan.adoption.downgrade_blocked, true); assert.equal(plan.adoption.next_enforces_adoption, false);
  assert.deepEqual(plan.adoption.markers, [{ path: 'config/policy.yaml', keys: ['work_execution'] }]);
  assert.ok(plan.warnings.some((line) => line.includes('Automatic apply is refused')));
  assert.match(renderPlanMarkdown(plan), /Automatic apply is refused[\s\S]*`config\/policy\.yaml` \(work_execution\)/);
  assert.throws(() => applyPlan({ plan, currentDir: s.currentDir, nextDir: s.nextDir }), /automatic apply refused/);
  const dry = s.cli('--json');
  assert.equal(dry.status, 0, dry.stderr); assert.equal(JSON.parse(dry.stdout).plan.adoption.downgrade_blocked, true);
  const apply = s.cli('--apply');
  assert.equal(apply.status, 2); assert.match(apply.stderr, /automatic apply refused: live scoped-work adoption markers remain \(config\/policy\.yaml\)/);
  assert.equal(fs.readFileSync(path.join(s.currentDir, 'runtime.mjs'), 'utf8'), 'A');
  assert.equal(fs.existsSync(path.join(s.currentDir, '.kit-upgrade')), false);
});

test('D33: an enforcing payload or a consumer without markers keeps the ordinary upgrade', (t) => {
  for (const options of [{ guard: true }, { marker: false }]) {
    const s = scenario(t, options), plan = buildPlan({ currentDir: s.currentDir, nextDir: s.nextDir });
    assert.equal(Object.hasOwn(plan, 'adoption'), false);
    const apply = s.cli('--apply');
    assert.equal(apply.status, 0, apply.stderr); assert.equal(fs.readFileSync(path.join(s.currentDir, 'runtime.mjs'), 'utf8'), 'OLD');
  }
});

test('D33: only live consumer declarations count as markers', (t) => {
  const s = scenario(t, { marker: false });
  put(s.currentDir, 'docs/reference/example.md', '---\nwork_execution: {version: 1}\n---\n');
  put(s.consumer, 'docs/notes.md', '# Notes\n\n```yaml\nwork_execution:\n  version: 1\n```\n');
  put(s.consumer, 'docs/decisions.md', '---\nartifact_id: open-decision-register\ndecision_work_scopes:\n  version: 1\n  bindings: []\n---\n# Decisions\n');
  put(s.consumer, 'docs/broken.md', '---\nwork_execution: [unclosed\n---\n');
  s.git('add', '-A'); s.git('commit', '-qm', 'docs');
  put(s.consumer, 'untracked.yaml', 'work_execution: {}\n');
  const scan = findAdoptionMarkers({ consumerRoot: s.consumer, currentDir: s.currentDir });
  assert.equal(scan.inspected, true);
  assert.deepEqual(scan.markers, [{ path: 'docs/broken.md', keys: [], unparsed: true },
    { path: 'docs/decisions.md', keys: ['decision_work_scopes'] }]);
});

test('D33: an uninspectable consumer root warns but cannot prove that markers remain', (t) => {
  const s = scenario(t), plain = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-downgrade-plain-'));
  t.after(() => fs.rmSync(plain, { recursive: true, force: true }));
  put(plain, 'policy.yaml', 'work_execution: {}\n');
  const plan = buildPlan({ currentDir: s.currentDir, nextDir: s.nextDir, options: { consumerRoot: plain } });
  assert.equal(plan.adoption.inspected, false); assert.equal(plan.adoption.downgrade_blocked, false);
  assert.ok(plan.warnings.some((line) => line.includes('could not be inspected')));
  assert.equal(s.cli('--consumer-root').status, 2);
});
