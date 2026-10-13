import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULTS, yamlParse } from './util.mjs';
import {
  WORK_CONFIG_FILE, WorkConfigError, readWorkConfig, declaredWorkOwners, adoptionPolicy, configuredLayout, liveWorkConfig,
} from './work-config.mjs';

const DOCS = 'docs/frontend-workflow';
const WORK = { version: 1, owners: ['screen:RESULT-001'], profiles: ['behavior'],
  role_limits: { behavior: ['screen', 'test'] }, deny_paths: [] };
const md = (fm) => `---\n${JSON.stringify(fm)}\n---\n\n# Doc\n`;

function project(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'work-config-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (name, value) => {
    const file = path.join(root, ...name.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
    return file;
  };
  put(`${DOCS}/domains/result/rules.md`, md({ artifact_id: 'RULES', artifact_type: 'domain-rules', work_execution: 'not an owner' }));
  put('config/layout.yaml', 'preset: expo-feature\n');
  return { root, put, docsDir: path.join(root, DOCS) };
}
const base = () => yamlParse(fs.readFileSync(DEFAULTS.policy, 'utf8'));
const declareUnits = (p) => {
  p.put(`${DOCS}/domains/result/screens/result-001/screen-spec.md`, md({ artifact_id: 'HOST', artifact_type: 'screen-spec',
    screen_id: 'RESULT-001', work_execution: { version: 1, units: [] } }));
  p.put(`${DOCS}/domains/result/surfaces/panel/surface-spec.md`, md({ artifact_id: 'PANEL', artifact_type: 'shared-surface-spec',
    surface_id: 'RESULT-PANEL', work_execution: { version: 1, units: [] } }));
  // A generated _meta copy is not an owner document.
  p.put(`${DOCS}/_meta/copy.md`, md({ artifact_type: 'screen-spec', screen_id: 'META-001', work_execution: {} }));
};

test('#257 without frontend-workflow.config.yaml nothing changes', (t) => {
  const p = project(t), policy = base();
  assert.equal(readWorkConfig(p.root), null);
  assert.equal(adoptionPolicy(policy, null, p.docsDir), policy);
  assert.equal(configuredLayout(null, undefined), undefined);
  assert.equal(configuredLayout(null, 'config/layout.yaml'), 'config/layout.yaml');
});

test('#257 the config names the work_execution overlay and the project layout', (t) => {
  const p = project(t);
  p.put(WORK_CONFIG_FILE, 'version: 1\npolicy_overlay: config/adoption.yaml\nlayout: config/layout.yaml\n');
  p.put('config/adoption.yaml', `work_execution: ${JSON.stringify(WORK)}\n`);
  const config = readWorkConfig(p.root);
  assert.equal(config.file, WORK_CONFIG_FILE);
  assert.equal(config.layout, 'config/layout.yaml');
  assert.equal(config.policy_overlay.file, 'config/adoption.yaml');
  assert.deepEqual(config.policy_overlay.work_execution, WORK);
  // The overlay is applied over the base policy, whichever base was selected.
  const policy = base();
  assert.deepEqual(adoptionPolicy(policy, config, p.docsDir), { ...policy, work_execution: WORK });
  assert.equal(Object.hasOwn(policy, 'work_execution'), false);
  assert.equal(configuredLayout(config, undefined), 'config/layout.yaml');
  assert.equal(configuredLayout(config, 'config/layout.yaml'), 'config/layout.yaml');
  assert.throws(() => configuredLayout(config, 'config/other-layout.yaml'),
    (error) => error instanceof WorkConfigError && /--layout config\/other-layout\.yaml differs from .*config\/layout\.yaml/.test(error.message));
  // Either key may be omitted.
  p.put(WORK_CONFIG_FILE, 'version: 1\nlayout: config/layout.yaml\n');
  assert.equal(readWorkConfig(p.root).policy_overlay, null);
  p.put(WORK_CONFIG_FILE, 'version: 1\n');
  assert.equal(readWorkConfig(p.root).layout, null);
});

test('#257 a malformed config or overlay fails closed', (t) => {
  const p = project(t);
  p.put('config/adoption.yaml', `work_execution: ${JSON.stringify(WORK)}\n`);
  const refused = (config, pattern, overlay) => {
    p.put(WORK_CONFIG_FILE, config);
    if (overlay !== undefined) p.put('config/adoption.yaml', overlay);
    assert.throws(() => readWorkConfig(p.root), (error) => error instanceof WorkConfigError && pattern.test(error.message), config);
  };
  refused('- version: 1\n', /mapping required/);
  refused('version: 1\nversion: 1\n', /config\.yaml: YAML: Map keys must be unique/);
  refused('version: 2\n', /version 1 required/);
  refused('version: 1\npolicy: config/adoption.yaml\n', /unsupported key policy/);
  refused('version: 1\npolicy_overlay: /etc/adoption.yaml\n', /policy_overlay.*absolute/);
  refused('version: 1\nlayout: ../layout.yaml\n', /layout.*parent segment/);
  refused('version: 1\nlayout: config/missing-layout.yaml\n', /layout: missing/);
  refused('version: 1\npolicy_overlay: config/missing.yaml\n', /policy_overlay.*missing/);
  refused('version: 1\npolicy_overlay: config/adoption.yaml\n', /policy_overlay config\/adoption\.yaml: the overlay holds only work_execution \(found order\)/,
    `order: [fixture-ui]\nwork_execution: ${JSON.stringify(WORK)}\n`);
  refused('version: 1\npolicy_overlay: config/adoption.yaml\n', /overlay holds only work_execution/, 'other: 1\n');
  refused('version: 1\npolicy_overlay: config/adoption.yaml\n', /policy_overlay config\/adoption\.yaml: profile: unsupported value/,
    `work_execution: ${JSON.stringify({ ...WORK, profiles: ['unknown'] })}\n`);
  if (process.platform !== 'win32') {
    p.put('config/real.yaml', `work_execution: ${JSON.stringify(WORK)}\n`);
    fs.rmSync(path.join(p.root, 'config', 'adoption.yaml'));
    fs.symlinkSync('real.yaml', path.join(p.root, 'config', 'adoption.yaml'));
    refused('version: 1\npolicy_overlay: config/adoption.yaml\n', /policy_overlay.*symlink/);
    fs.rmSync(path.join(p.root, WORK_CONFIG_FILE));
    fs.symlinkSync('config/real.yaml', path.join(p.root, WORK_CONFIG_FILE));
    assert.throws(() => readWorkConfig(p.root), /frontend-workflow\.config\.yaml.*symlink/);
  }
});

test('#257 a base policy never declares work_execution, bundled or explicit', (t) => {
  const p = project(t);
  const policy = { ...base(), work_execution: WORK };
  assert.throws(() => adoptionPolicy(policy, null, p.docsDir),
    (error) => error instanceof WorkConfigError && /base policy must not declare work_execution/.test(error.message));
  p.put(WORK_CONFIG_FILE, 'version: 1\npolicy_overlay: config/adoption.yaml\n');
  p.put('config/adoption.yaml', `work_execution: ${JSON.stringify(WORK)}\n`);
  assert.throws(() => adoptionPolicy(policy, readWorkConfig(p.root), p.docsDir), /base policy must not declare work_execution/);
});

test('#257 owner documents that declare work_execution need the configured overlay', (t) => {
  const p = project(t);
  assert.deepEqual(declaredWorkOwners(p.docsDir), []);
  declareUnits(p);
  assert.deepEqual(declaredWorkOwners(p.docsDir), ['screen:RESULT-001', 'surface:RESULT-PANEL']);
  const message = /owner documents declare work_execution \(screen:RESULT-001, surface:RESULT-PANEL\).*no policy_overlay/;
  assert.throws(() => adoptionPolicy(base(), null, p.docsDir), (error) => error instanceof WorkConfigError && message.test(error.message));
  p.put(WORK_CONFIG_FILE, 'version: 1\nlayout: config/layout.yaml\n');
  assert.throws(() => adoptionPolicy(base(), readWorkConfig(p.root), p.docsDir), message);
  p.put(WORK_CONFIG_FILE, 'version: 1\npolicy_overlay: config/adoption.yaml\n');
  p.put('config/adoption.yaml', `work_execution: ${JSON.stringify(WORK)}\n`);
  assert.equal(adoptionPolicy(base(), readWorkConfig(p.root), p.docsDir).work_execution.owners[0], 'screen:RESULT-001');
});

test('#257 live entries resolve the configured layout from their root, and a missing root holds no config', (t) => {
  const p = project(t);
  const missing = path.join(p.root, 'no-such-root');
  assert.deepEqual(liveWorkConfig(missing, 'x.yaml'), { config: null, root: missing, layout: 'x.yaml' });
  assert.deepEqual(liveWorkConfig(p.root, undefined), { config: null, root: p.root, layout: undefined });
  p.put(WORK_CONFIG_FILE, 'version: 1\nlayout: config/layout.yaml\n');
  const layout = path.join(p.root, 'config', 'layout.yaml');
  assert.equal(liveWorkConfig(p.root, undefined).layout, layout);
  assert.equal(liveWorkConfig(p.root, layout).layout, layout);
  assert.throws(() => liveWorkConfig(p.root, path.join(p.root, 'other.yaml')), /--layout other\.yaml differs/);
});

test('#257 an unreadable config or overlay fails as a configuration error (r1)', (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) { t.skip('requires POSIX permissions as a non-root user'); return; }
  const p = project(t);
  const config = p.put(WORK_CONFIG_FILE, 'version: 1\npolicy_overlay: config/adoption.yaml\n');
  const overlay = p.put('config/adoption.yaml', `work_execution: ${JSON.stringify(WORK)}\n`);
  try {
    fs.chmodSync(overlay, 0o000);
    assert.throws(() => readWorkConfig(p.root),
      (error) => error instanceof WorkConfigError && /policy_overlay: cannot read \(EACCES\)/.test(error.message));
    fs.chmodSync(overlay, 0o644); fs.chmodSync(config, 0o000);
    assert.throws(() => readWorkConfig(p.root),
      (error) => error instanceof WorkConfigError && /frontend-workflow\.config\.yaml: cannot read \(EACCES\)/.test(error.message));
  } finally { fs.chmodSync(overlay, 0o644); fs.chmodSync(config, 0o644); }
});

test('#257 a configured layout that cannot be inspected fails as a configuration error (r3)', (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) { t.skip('requires POSIX permissions as a non-root user'); return; }
  const p = project(t);
  p.put('config/deep/layout.yaml', 'preset: expo-feature\n');
  p.put(WORK_CONFIG_FILE, 'version: 1\nlayout: config/deep/layout.yaml\n');
  const dir = path.join(p.root, 'config');
  try {
    // Readable but not searchable: listing works, inspecting an entry does not.
    fs.chmodSync(dir, 0o644);
    assert.throws(() => readWorkConfig(p.root),
      (error) => error instanceof WorkConfigError && /frontend-workflow\.config\.yaml layout: cannot inspect \(EACCES\)/.test(error.message));
  } finally { fs.chmodSync(dir, 0o755); }
});

test('#257 an owner document that the workflow state reads by its file name counts without artifact_type (r6)', (t) => {
  const p = project(t);
  // workflow:state collects domains/**/screen-spec.md and surface-spec.md by name.
  p.put(`${DOCS}/domains/result/screens/result-001/screen-spec.md`, md({ screen_id: 'RESULT-001', work_execution: { version: 1, units: [] } }));
  p.put(`${DOCS}/domains/result/surfaces/panel/surface-spec.md`, md({ work_execution: { version: 1, units: [] } }));
  assert.throws(() => adoptionPolicy(base(), null, p.docsDir), (error) => error instanceof WorkConfigError &&
    /owner documents declare work_execution \(screen:RESULT-001, surface:domains\/result\/surfaces\/panel\/surface-spec\.md\)/.test(error.message));
});

test('#257 a document that cannot be read is not taken as declaring nothing (r7)', (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) { t.skip('requires POSIX permissions as a non-root user'); return; }
  const p = project(t);
  const spec = p.put(`${DOCS}/domains/result/screens/result-001/screen-spec.md`, md({ artifact_type: 'screen-spec', screen_id: 'RESULT-001',
    work_execution: { version: 1, units: [] } }));
  try {
    fs.chmodSync(spec, 0o000);
    assert.throws(() => adoptionPolicy(base(), null, p.docsDir), (error) => error instanceof WorkConfigError &&
      /domains\/result\/screens\/result-001\/screen-spec\.md: cannot read \(EACCES\)/.test(error.message));
  } finally { fs.chmodSync(spec, 0o644); }
});

test('#257 a docs directory that cannot be listed is not taken as declaring nothing (r8)', (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) { t.skip('requires POSIX permissions as a non-root user'); return; }
  const p = project(t);
  p.put(`${DOCS}/domains/result/screens/result-001/screen-spec.md`, md({ artifact_type: 'screen-spec', screen_id: 'RESULT-001',
    work_execution: { version: 1, units: [] } }));
  p.put(`${DOCS}/_meta/hidden/state.md`, md({ generated: true }));
  const screens = path.join(p.docsDir, 'domains', 'result', 'screens'), meta = path.join(p.docsDir, '_meta', 'hidden');
  try {
    // A generated _meta directory is not owner territory, so it is never listed.
    fs.chmodSync(meta, 0o000);
    assert.throws(() => adoptionPolicy(base(), null, p.docsDir), /owner documents declare work_execution \(screen:RESULT-001\)/);
    fs.chmodSync(screens, 0o000);
    assert.throws(() => adoptionPolicy(base(), null, p.docsDir), (error) => error instanceof WorkConfigError &&
      /domains\/result\/screens: cannot list \(EACCES\)/.test(error.message));
  } finally { fs.chmodSync(screens, 0o755); fs.chmodSync(meta, 0o755); }
});

test('#257 frontmatter that mentions work_execution but does not parse is refused (r8)', (t) => {
  const p = project(t);
  const spec = `${DOCS}/domains/result/screens/result-001/screen-spec.md`;
  p.put(spec, '---\nartifact_type: screen-spec\nscreen_id: RESULT-001\nwork_execution:\n  units: [unclosed\n---\n\n# Doc\n');
  assert.throws(() => adoptionPolicy(base(), null, p.docsDir), (error) => error instanceof WorkConfigError &&
    /domains\/result\/screens\/result-001\/screen-spec\.md: frontmatter does not parse/.test(error.message));
  // A document workflow:state does not read as an owner is never judged without an
  // overlay, so its broken frontmatter is left to the other checks as before.
  p.put(spec, md({ artifact_type: 'screen-spec', screen_id: 'RESULT-001' }));
  p.put(`${DOCS}/domains/result/notes.md`, '---\nartifact_type: screen-spec\nwork_execution:\n  units: [unclosed\n---\n\n# Notes\n');
  assert.equal(adoptionPolicy(base(), null, p.docsDir).work_execution, undefined);
});

test('#257 owner frontmatter that is opened but never closed is refused (r9)', (t) => {
  const p = project(t);
  const spec = `${DOCS}/domains/result/screens/result-001/screen-spec.md`;
  p.put(spec, '---\nartifact_type: screen-spec\nscreen_id: RESULT-001\nwork_execution:\n  version: 1\n');
  assert.throws(() => adoptionPolicy(base(), null, p.docsDir), (error) => error instanceof WorkConfigError &&
    /domains\/result\/screens\/result-001\/screen-spec\.md: frontmatter does not parse \(not closed\)/.test(error.message));
  p.put(spec, md({ artifact_type: 'screen-spec', screen_id: 'RESULT-001' }));
  p.put(`${DOCS}/domains/result/notes.md`, '---\nwork_execution:\n  version: 1\n');
  assert.equal(adoptionPolicy(base(), null, p.docsDir).work_execution, undefined);
});

test('#257 an owner document whose frontmatter does not parse is refused whatever it spells (r10)', (t) => {
  const p = project(t);
  const spec = `${DOCS}/domains/result/screens/result-001/screen-spec.md`, surface = `${DOCS}/domains/result/surfaces/panel/surface-spec.md`;
  const refused = (file) => (error) => error instanceof WorkConfigError &&
    new RegExp(`${file.slice(DOCS.length + 1).replace(/[.]/g, '\\.')}: frontmatter does not parse`).test(error.message);
  // An escaped key is still the key; whether it declares units cannot be known.
  p.put(spec, '---\nartifact_type: screen-spec\n"work\\u005fexecution":\n  units: [unclosed\n---\n');
  assert.throws(() => adoptionPolicy(base(), null, p.docsDir), refused(spec));
  p.put(spec, '---\nscreen_id: [unclosed\n---\n');
  assert.throws(() => adoptionPolicy(base(), null, p.docsDir), refused(spec));
  p.put(spec, md({ artifact_type: 'screen-spec', screen_id: 'RESULT-001' }));
  p.put(surface, '---\nsurface_id: [unclosed\n---\n');
  assert.throws(() => adoptionPolicy(base(), null, p.docsDir), refused(surface));
});

test('#257 a docs directory that cannot be inspected is a configuration error (r9)', (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) { t.skip('requires POSIX permissions as a non-root user'); return; }
  const p = project(t);
  const parent = path.dirname(p.docsDir);
  try {
    // Readable but not searchable: the docs directory itself cannot be inspected.
    fs.chmodSync(parent, 0o644);
    assert.throws(() => adoptionPolicy(base(), null, p.docsDir), (error) => error instanceof WorkConfigError &&
      /: cannot inspect \(EACCES\) to check owner declarations/.test(error.message));
  } finally { fs.chmodSync(parent, 0o755); }
});
