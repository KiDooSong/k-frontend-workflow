import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { KIT_ROOT } from './util.mjs';

// #260 regression: the issue's coupon-feature repro through the public CLI. Only
// COUPON-001 is adopted; each variant changes one document format that the
// general contract accepts.
const LIST = 'docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md';
const DETAIL = 'docs/frontend-workflow/domains/coupons/screens/coupon-detail/screen-spec.md';
const ENTRY = 'src/features/coupons/screens/CouponListScreen.tsx';
const WORK = { version: 1, owners: ['screen:COUPON-001'], profiles: ['visual', 'behavior'], role_limits: {
  visual: ['screen', 'domain_component', 'hook', 'test'], behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] };
const UNITS = { version: 1, units: [{ id: 'list-behavior', kind: 'behavior', contracts: ['artifact:COUPON-001-screen-spec#state-matrix'], sources: [] }] };

function readiness(t, edit = () => {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-example-')));
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-example-request-')));
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); });
  for (const dir of ['docs', 'src']) fs.cpSync(path.join(KIT_ROOT, 'examples/coupon-feature', dir), path.join(root, dir), { recursive: true });
  const put = (name, text) => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), text); };
  const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
  put('config/policy.yaml', `${fs.readFileSync(path.join(KIT_ROOT, 'policies/implementation-mode-policy.yaml'), 'utf8')}\nwork_execution: ${JSON.stringify(WORK)}\n`);
  put('config/manifest.yaml', fs.readFileSync(path.join(KIT_ROOT, 'catalog/artifact-manifest.yaml'), 'utf8'));
  put('config/layout.yaml', fs.readFileSync(path.join(KIT_ROOT, 'presets/expo-feature.yaml'), 'utf8'));
  const list = read(LIST), end = list.indexOf('\n---\n', 4);
  put(LIST, `${list.slice(0, end)}\nscreen_entry: ${ENTRY}\nwork_execution: ${JSON.stringify(UNITS)}${list.slice(end)}`);
  edit({ read, put });
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q'); git('config', 'maintenance.auto', 'false'); git('config', 'gc.auto', '0');
  git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'test'); git('add', '-A'); git('commit', '-qm', 'baseline');
  const work = path.join(outside, 'request.json');
  fs.writeFileSync(work, JSON.stringify({ version: 1, origin_inputs: [], requests: [
    { owner: 'screen:COUPON-001', authority: 'scoped', unit: 'list-behavior', targets: [{ path: ENTRY, change: 'M' }] }] }));
  return spawnSync(process.execPath, [path.join(KIT_ROOT, 'scripts', 'readiness.mjs'), '--work', work, '--root', root,
    '--docs', 'docs/frontend-workflow', '--src', 'src', '--policy', 'config/policy.yaml', '--manifest', 'config/manifest.yaml',
    '--layout', 'config/layout.yaml', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 });
}
const json = (run) => { assert.equal(run.status, 0, run.stderr || run.stdout); return JSON.parse(run.stdout); };
const codes = (env) => [...new Set(env.denials.map((entry) => entry.code))].sort();
const append = (name, text) => ({ read, put }) => put(name, `${read(name)}${text}`);
const PROSE = '\n## Unknowns\n\nNone — no new open questions for this screen.\n';

test('D #260 example: general-contract formats keep a structured scoped result; the adopted owner stays fail-closed', (t) => {
  const baseline = json(readiness(t));
  assert.equal(baseline.authority, 'scoped'); assert.equal(baseline.ready, false);

  // B: another screen's Unknown ID without the U- prefix.
  const other = json(readiness(t, append(DETAIL, '\n## Unknowns\n\n| ID | Question | Status |\n|---|---|---|\n| COUPON-002-U001 | Where is the detail response sample? | open |\n')));
  assert.deepEqual(other.denials, baseline.denials);

  // C: the adopted screen's local decision ID without the D- prefix.
  const local = json(readiness(t, ({ read, put }) => put(LIST, read(LIST).replaceAll('D-001', 'COUPON-001-D001'))));
  assert.deepEqual(codes(local), codes(baseline));
  assert.ok(local.denials.some((entry) => JSON.stringify(entry).includes('decision:COUPON-001-D001@COUPON-001-screen-spec')));

  // D: another screen's prose-only Unknowns section is reported, not fatal.
  const prose = json(readiness(t, append(DETAIL, PROSE)));
  assert.deepEqual(prose.denials, baseline.denials);
  assert.ok(prose.required_reviews.some((entry) => entry.startsWith(`Unaudited uncertainty section ${DETAIL}#unknowns:`)));
  assert.equal(baseline.required_reviews.some((entry) => entry.startsWith('Unaudited')), false);

  // A reference to the selected contract keeps it fatal, also when YAML escapes it.
  const linked = readiness(t, ({ read, put }) => {
    const detail = read(DETAIL);
    put(DETAIL, `${detail.replace('depends_on: [navigation-map]', 'depends_on: [navigation-map, "artifact\\u003aCOUPON-001-screen-spec#state-matrix"]')}${PROSE}`);
  });
  assert.equal(linked.status, 2); assert.match(linked.stderr, /SW-UNCERTAINTY: one canonical unknown table required/);

  // The same prose section on the adopted owner still stops the preflight.
  const own = readiness(t, ({ read, put }) => put(LIST, read(LIST).replace(/\n## Unknowns\n[\s\S]*?(?=\n## )/, PROSE.trimEnd())));
  assert.equal(own.status, 2); assert.match(own.stderr, /SW-UNCERTAINTY: one canonical unknown table required/);
});
