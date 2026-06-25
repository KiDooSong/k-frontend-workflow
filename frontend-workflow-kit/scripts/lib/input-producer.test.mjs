import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  InputProducerError,
  buildInputArtifact,
  nextInputId,
  normalizeInputSourceToken,
  renderInputArtifact,
  writeInputArtifact,
} from './input-producer.mjs';
import { splitFrontmatter } from './util.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = path.resolve(HERE, '..', '..');
const CLI = path.join(KIT_ROOT, 'scripts', 'create-input-artifact.mjs');

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function tmpdir(t, prefix = 'input-producer-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function payload(overrides = {}) {
  return {
    input_type: 'visual-spec',
    source_type: 'figma',
    source_ref: 'figma://file/node',
    captured_at: '2026-06-25T10:00:00+09:00',
    captured_by: 'producer-test',
    affected_domains: ['auth'],
    affected_screens: ['AUTH-001'],
    title: 'Auth login visual spec',
    summary: 'Login visual spec facts.',
    extracted_facts: ['Primary CTA is visible.'],
    suggested_target_artifacts: ['AUTH-001 figma-component-mapping'],
    expected_reconciliation: ['classification: simple-update'],
    ...overrides,
  };
}

test('normalizeInputSourceToken lowercases and collapses non-token characters', () => {
  assert.equal(normalizeInputSourceToken(' Figma Screen/Input '), 'figma-screen-input');
  assert.equal(normalizeInputSourceToken('policy_migration'), 'policy-migration');
  assert.equal(normalizeInputSourceToken('visual-spec'), 'visual-spec');
});

test('nextInputId selects the next deterministic sequence for date and source', (t) => {
  const dir = path.join(tmpdir(t), 'inputs');
  write(path.join(dir, 'IN-20260625-figma-001.md'), '---\ninput_id: "IN-20260625-figma-001"\n---\n');
  write(path.join(dir, 'IN-20260625-figma-009.md'), '---\ninput_id: "IN-20260625-figma-009"\n---\n');
  write(path.join(dir, 'IN-20260625-planning-003.md'), '---\ninput_id: "IN-20260625-planning-003"\n---\n');

  assert.equal(nextInputId({ inputsDir: dir, date: '2026-06-25', source: 'figma' }), 'IN-20260625-figma-010');
});

test('writeInputArtifact refuses to overwrite an explicit input_id by default', (t) => {
  const dir = path.join(tmpdir(t), 'inputs');
  const inputId = 'IN-20260625-figma-001';
  write(path.join(dir, `${inputId}.md`), 'existing');

  assert.throws(
    () => writeInputArtifact(payload({ input_id: inputId }), { inputsDir: dir }),
    InputProducerError,
  );
});

test('writeInputArtifact refuses an input_id already used by another file frontmatter', (t) => {
  const dir = path.join(tmpdir(t), 'inputs');
  const inputId = 'IN-20260625-figma-001';
  write(path.join(dir, 'legacy.md'), `---\ninput_id: "${inputId}"\n---\n`);

  assert.throws(
    () => writeInputArtifact(payload({ input_id: inputId }), { inputsDir: dir }),
    /input_id already exists in inputs/,
  );
});

test('writeInputArtifact allows --overwrite only for the same output path', (t) => {
  const dir = path.join(tmpdir(t), 'inputs');
  const inputId = 'IN-20260625-figma-001';
  write(path.join(dir, `${inputId}.md`), `---\ninput_id: "${inputId}"\n---\n`);

  const result = writeInputArtifact(
    payload({
      input_id: inputId,
      summary: 'Replacement summary.',
    }),
    { inputsDir: dir, overwrite: true },
  );

  assert.equal(result.artifact.input_id, inputId);
  assert.match(fs.readFileSync(path.join(dir, `${inputId}.md`), 'utf8'), /Replacement summary\./);
});

test('writeInputArtifact rejects --overwrite when another file duplicates the same input_id', (t) => {
  const dir = path.join(tmpdir(t), 'inputs');
  const inputId = 'IN-20260625-figma-001';
  write(path.join(dir, `${inputId}.md`), `---\ninput_id: "${inputId}"\n---\n`);
  write(path.join(dir, 'legacy.md'), `---\ninput_id: "${inputId}"\n---\n`);

  assert.throws(
    () => writeInputArtifact(payload({ input_id: inputId }), { inputsDir: dir, overwrite: true }),
    /only the same output file may be overwritten/,
  );
});

test('writeInputArtifact rejects --overwrite when the existing input_id is in a different file', (t) => {
  const dir = path.join(tmpdir(t), 'inputs');
  const inputId = 'IN-20260625-figma-001';
  write(path.join(dir, 'legacy.md'), `---\ninput_id: "${inputId}"\n---\n`);

  assert.throws(
    () => writeInputArtifact(payload({ input_id: inputId }), { inputsDir: dir, overwrite: true }),
    /only the same output file may be overwritten/,
  );
});

test('writeInputArtifact rejects supersedes when inputs dir is missing', (t) => {
  const dir = path.join(tmpdir(t), 'missing-inputs');

  assert.throws(
    () => writeInputArtifact(payload({ supersedes: 'IN-20260625-figma-999' }), { inputsDir: dir, dryRun: true }),
    /supersedes target does not exist/,
  );
});

test('writeInputArtifact rejects supersedes that only matches a filename', (t) => {
  const dir = path.join(tmpdir(t), 'inputs');
  const supersedes = 'IN-20260625-figma-999';
  write(path.join(dir, `${supersedes}.md`), '# Legacy file without input frontmatter\n');

  assert.throws(
    () => writeInputArtifact(payload({ supersedes }), { inputsDir: dir, dryRun: true }),
    /supersedes target does not exist/,
  );
});

test('renderInputArtifact emits canonical frontmatter and no deprecated aliases', (t) => {
  const dir = path.join(tmpdir(t), 'inputs');
  const artifact = buildInputArtifact(payload({ source: 'figma' }), {
    inputsDir: dir,
    date: '2026-06-25',
  });
  const text = renderInputArtifact(artifact);
  const { data, hasFrontmatter, parseError } = splitFrontmatter(text);

  assert.equal(hasFrontmatter, true);
  assert.equal(parseError, undefined);
  assert.equal(data.input_id, 'IN-20260625-figma-001');
  assert.equal(data.status, 'captured');
  assert.deepEqual(data.affected_domains, ['auth']);
  assert.deepEqual(data.affected_screens, ['AUTH-001']);
  assert.equal(Object.prototype.hasOwnProperty.call(data, 'suggested_scope'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(data, 'summary'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(data, 'artifact_type'), false);
  assert.match(text, /## Summary\nLogin visual spec facts\./);
  assert.match(text, /## Extracted Facts\n- Primary CTA is visible\./);
});

test('supersedes writes a new input id and links the prior artifact', (t) => {
  const dir = path.join(tmpdir(t), 'inputs');
  write(path.join(dir, 'IN-20260625-figma-001.md'), '---\ninput_id: "IN-20260625-figma-001"\n---\n');

  const result = writeInputArtifact(
    payload({
      source: 'figma',
      supersedes: 'IN-20260625-figma-001',
    }),
    { inputsDir: dir, date: '2026-06-25' },
  );

  assert.equal(result.artifact.input_id, 'IN-20260625-figma-002');
  assert.match(result.text, /supersedes: "IN-20260625-figma-001"/);
});

test('CLI exits 2 for invalid enum values', (t) => {
  const docs = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  const res = spawnSync(
    process.execPath,
    [
      CLI,
      '--docs',
      docs,
      '--input-type',
      'bad-type',
      '--source-type',
      'figma',
      '--source-ref',
      'figma://file/node',
      '--captured-by',
      'producer-test',
      '--domain',
      'auth',
      '--screen',
      'AUTH-001',
      '--dry-run',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(res.status, 2);
  assert.match(res.stderr, /input_type must be one of/);
});

test('CLI JSON payload mode writes an artifact for adapters', (t) => {
  const root = tmpdir(t);
  const docs = path.join(root, 'docs', 'frontend-workflow');
  const input = path.join(root, 'input.json');
  write(
    input,
    JSON.stringify(
      payload({
        source: 'figma',
        captured_at: '2026-06-25T10:00:00+09:00',
      }),
      null,
      2,
    ),
  );

  const res = spawnSync(
    process.execPath,
    [CLI, '--docs', docs, '--from-json', input, '--date', '2026-06-25', '--json'],
    { encoding: 'utf8' },
  );

  assert.equal(res.status, 0, res.stderr);
  const body = JSON.parse(res.stdout);
  assert.equal(body.input_id, 'IN-20260625-figma-001');
  assert.equal(body.wrote, true);
  assert.equal(fs.existsSync(path.join(docs, 'inputs', 'IN-20260625-figma-001.md')), true);
});

test('CLI rejects --overwrite=false instead of treating it as overwrite', (t) => {
  const docs = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  const inputId = 'IN-20260625-planning-001';
  const existing = path.join(docs, 'inputs', `${inputId}.md`);
  write(existing, `---\ninput_id: "${inputId}"\n---\n\noriginal\n`);

  const res = spawnSync(
    process.execPath,
    [
      CLI,
      '--docs',
      docs,
      '--input-id',
      inputId,
      '--input-type',
      'planning',
      '--source-type',
      'planning-doc',
      '--source-ref',
      'planning://note',
      '--captured-by',
      'producer-test',
      '--domain',
      'auth',
      '--screen',
      'AUTH-001',
      '--summary',
      'replacement',
      '--overwrite=false',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(res.status, 2);
  assert.match(res.stderr, /--overwrite does not accept a value/);
  assert.match(fs.readFileSync(existing, 'utf8'), /original/);
  assert.doesNotMatch(fs.readFileSync(existing, 'utf8'), /replacement/);
});

test('CLI rejects --dry-run=false instead of treating it as dry-run', (t) => {
  const docs = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  const res = spawnSync(
    process.execPath,
    [
      CLI,
      '--docs',
      docs,
      '--input-type',
      'planning',
      '--source-type',
      'planning-doc',
      '--source-ref',
      'planning://note',
      '--captured-by',
      'producer-test',
      '--domain',
      'auth',
      '--screen',
      'AUTH-001',
      '--dry-run=false',
      '--json',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(res.status, 2);
  assert.match(res.stderr, /--dry-run does not accept a value/);
  assert.equal(fs.existsSync(path.join(docs, 'inputs', 'IN-20260625-planning-001.md')), false);
});

test('CLI rejects --json=false instead of treating it as JSON output', (t) => {
  const docs = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  const res = spawnSync(
    process.execPath,
    [
      CLI,
      '--docs',
      docs,
      '--input-type',
      'planning',
      '--source-type',
      'planning-doc',
      '--source-ref',
      'planning://note',
      '--captured-by',
      'producer-test',
      '--domain',
      'auth',
      '--screen',
      'AUTH-001',
      '--dry-run',
      '--json=false',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(res.status, 2);
  assert.match(res.stderr, /--json does not accept a value/);
  assert.equal(res.stdout, '');
  assert.equal(fs.existsSync(path.join(docs, 'inputs', 'IN-20260625-planning-001.md')), false);
});

test('CLI rejects --help=false as a valued boolean flag', () => {
  const res = spawnSync(process.execPath, [CLI, '--help=false'], { encoding: 'utf8' });

  assert.equal(res.status, 2);
  assert.match(res.stderr, /--help does not accept a value/);
  assert.equal(res.stdout, '');
});

test('CLI rejects mistyped --dryrun before writing', (t) => {
  const docs = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  const res = spawnSync(
    process.execPath,
    [
      CLI,
      '--docs',
      docs,
      '--input-type',
      'planning',
      '--source-type',
      'planning-doc',
      '--source-ref',
      'planning://note',
      '--captured-by',
      'producer-test',
      '--domain',
      'auth',
      '--screen',
      'AUTH-001',
      '--dryrun',
      '--json',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(res.status, 2);
  assert.match(res.stderr, /unknown flag: --dryrun/);
  assert.equal(fs.existsSync(path.join(docs, 'inputs', 'IN-20260625-planning-001.md')), false);
});

test('CLI rejects unknown valued flags', (t) => {
  const docs = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  const res = spawnSync(
    process.execPath,
    [
      CLI,
      '--docs',
      docs,
      '--input-type',
      'planning',
      '--source-type',
      'planning-doc',
      '--source-ref',
      'planning://note',
      '--captured-by',
      'producer-test',
      '--domain',
      'auth',
      '--screen',
      'AUTH-001',
      '--foo=1',
      '--dry-run',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(res.status, 2);
  assert.match(res.stderr, /unknown flag: --foo/);
  assert.equal(fs.existsSync(path.join(docs, 'inputs', 'IN-20260625-planning-001.md')), false);
});

test('CLI dry-run rejects dangling supersedes before writing', (t) => {
  const docs = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  const res = spawnSync(
    process.execPath,
    [
      CLI,
      '--docs',
      docs,
      '--input-type',
      'planning',
      '--source-type',
      'planning-doc',
      '--source-ref',
      'planning://note',
      '--captured-by',
      'producer-test',
      '--domain',
      'auth',
      '--screen',
      'AUTH-001',
      '--supersedes',
      'IN-20260625-planning-999',
      '--dry-run',
      '--json',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(res.status, 2);
  assert.match(res.stderr, /supersedes target does not exist/);
});
