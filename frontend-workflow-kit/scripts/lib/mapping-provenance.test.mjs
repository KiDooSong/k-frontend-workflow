import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadInputArtifact } from './input-artifact.mjs';
import { validateMappingProvenance } from './mapping-provenance.mjs';
import { readFileSafe, splitFrontmatter } from './util.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = path.resolve(HERE, '..', '..');
const VALIDATE = path.join(KIT_ROOT, 'scripts', 'validate.mjs');

function tmpdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapping-provenance-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

function inputText(id = 'IN-20260730-figma-001', overrides = {}) {
  const sourceRef = overrides.sourceRef ?? 'figma://file/abc/frame/10:20';
  const capturedAt = overrides.capturedAt ?? '2026-07-30T10:00:00+09:00';
  const body = overrides.body ?? '## Extracted Facts\n- CTA instance exists.\n- Button uses primary variant.\n';
  return [
    '---',
    `input_id: "${id}"`,
    'input_type: "figma"',
    'source_type: "figma"',
    `source_ref: "${sourceRef}"`,
    `captured_at: "${capturedAt}"`,
    'captured_by: "mapping-test"',
    'status: "captured"',
    'affected_domains: ["auth"]',
    'affected_screens: ["AUTH-001"]',
    'confidence: "candidate"',
    'supersedes: null',
    '---',
    '',
    body,
  ].join('\n');
}

function mappingText({
  contract = 'provenance_contract: 1',
  componentHeading = '## Component Mapping',
  componentHeader = '| Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고 |\n|---|---|---|---|',
  componentRows = ['| `M-001` · Login / node `1:234` | Primary CTA | components/ui/Button | primary |'],
  provenanceHeading = '## Mapping Provenance',
  provenanceHeader = '| Mapping Key | Source Ref | Source Unit | Captured At | Evidence |\n|---|---|---|---|---|',
  provenanceRows = ['| M-001 | figma://file/abc/node/1:234 | instance | inherit | input:IN-20260730-figma-001#extracted-facts/01 |'],
  prefix = '',
  suffix = '',
  sourceRef = 'figma://file/abc/frame/10:20',
} = {}) {
  return [
    '---',
    'artifact_id: "AUTH-001-figma-component-mapping"',
    'artifact_type: figma-component-mapping',
    'domain: "auth"',
    'screen_id: "AUTH-001"',
    'status: draft',
    'sources:',
    `  - { type: figma, ref: "${sourceRef}" }`,
    'last_reviewed: "2026-07-30"',
    ...(contract ? [contract] : []),
    '---',
    '',
    prefix,
    '## Frame',
    `- ${sourceRef}`,
    '',
    componentHeading,
    componentHeader,
    ...componentRows,
    '',
    provenanceHeading,
    provenanceHeader,
    ...provenanceRows,
    '',
    '## Provenance',
    '- `✔M` marker legend only; not the machine table.',
    '',
    suffix,
  ].filter((line) => line !== '').join('\n') + '\n';
}

function loadDoc(file) {
  const { data } = splitFrontmatter(readFileSafe(file));
  return { file, fm: data };
}

function fixture(t, mappingOptions = {}, inputOptions = {}) {
  const root = tmpdir(t);
  const inputFile = write(path.join(root, 'inputs', 'IN-20260730-figma-001.md'), inputText(undefined, inputOptions));
  const mappingFile = write(path.join(root, 'figma-component-mapping.md'), mappingText(mappingOptions));
  return {
    root,
    inputFile,
    mappingFile,
    validate() {
      return validateMappingProvenance({
        docs: [loadDoc(mappingFile)],
        inputArtifacts: [loadInputArtifact(inputFile)],
      });
    },
  };
}

test('legacy mapping is completely silent and generic ## Provenance is not machine contract', (t) => {
  const f = fixture(t, { contract: '' });
  assert.deepEqual(f.validate(), { errors: [], warnings: [] });
});

test('canonical provenance_contract:1 mapping passes with M-key bijection and inherited timestamp', (t) => {
  const f = fixture(t);
  assert.deepEqual(f.validate(), { errors: [], warnings: [] });
});

test('unsupported/null/boolean contract versions fail hard', (t) => {
  for (const value of ['provenance_contract: 2', 'provenance_contract: null', 'provenance_contract: true']) {
    const f = fixture(t, { contract: value });
    assert.match(f.validate().errors.map((e) => e.message).join('\n'), /MP-001/);
  }
});

test('AST section parser ignores code/comment fakes but fails duplicate real headings and table/header drift', (t) => {
  const fakePrefix = [
    '```md',
    '## Component Mapping',
    '| Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고 |',
    '|---|---|---|---|',
    '| fake | fake | fake | fake |',
    '```',
    '<!--',
    '## Mapping Provenance',
    '| Mapping Key | Source Ref | Source Unit | Captured At | Evidence |',
    '|---|---|---|---|---|',
    '| M-999 | fake | node | inherit | fake |',
    '-->',
  ].join('\n');
  assert.deepEqual(fixture(t, { prefix: fakePrefix }).validate(), { errors: [], warnings: [] });

  const duplicate = fixture(t, { suffix: '## Component Mapping\n| Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고 |\n|---|---|---|---|\n| `M-002` · x | x | x | x |' });
  assert.match(duplicate.validate().errors.map((e) => e.message).join('\n'), /MP-002/);

  const badHeader = fixture(t, {
    provenanceHeader: '| Source Ref | Mapping Key | Source Unit | Captured At | Evidence |\n|---|---|---|---|---|',
  });
  assert.match(badHeader.validate().errors.map((e) => e.message).join('\n'), /MP-007/);
});

test('Mapping Key must be anchored, canonical, unique, and bijective', (t) => {
  for (const row of [
    '| Login M-001 node | CTA | Button | primary |',
    '| `M-01` · Login | CTA | Button | primary |',
    '| `m-001` · Login | CTA | Button | primary |',
    '| Login | CTA | Button | primary |',
    '| `M-001` · Login M-002 | CTA | Button | primary |',
  ]) {
    const f = fixture(t, { componentRows: [row] });
    assert.match(f.validate().errors.map((e) => e.message).join('\n'), /MP-008/);
  }

  const duplicate = fixture(t, {
    componentRows: [
      '| `M-001` · A | A | Button | - |',
      '| `M-001` · B | B | Button | - |',
    ],
  });
  assert.match(duplicate.validate().errors.map((e) => e.message).join('\n'), /MP-009/);

  const missing = fixture(t, { provenanceRows: [] });
  assert.match(missing.validate().errors.map((e) => e.message).join('\n'), /MP-012/);

  const orphan = fixture(t, {
    provenanceRows: [
      '| M-001 | inherit | instance | inherit | input:IN-20260730-figma-001#extracted-facts/01 |',
      '| M-002 | inherit | instance | inherit | input:IN-20260730-figma-001#extracted-facts/02 |',
    ],
  });
  assert.match(orphan.validate().errors.map((e) => e.message).join('\n'), /orphan Mapping Provenance/);
});

test('Evidence resolves unique input/real section; /00 is hard and out-of-range is warning-first', (t) => {
  const malformed = fixture(t, {
    provenanceRows: ['| M-001 | inherit | instance | inherit | input:IN-20260730-figma-001#extracted-facts/00 |'],
  });
  assert.match(malformed.validate().errors.map((e) => e.message).join('\n'), /MP-014/);

  const missingSection = fixture(t, {
    provenanceRows: ['| M-001 | inherit | instance | inherit | input:IN-20260730-figma-001#not-real/01 |'],
  });
  assert.match(missingSection.validate().errors.map((e) => e.message).join('\n'), /MP-014/);

  const outOfRange = fixture(t, {
    provenanceRows: ['| M-001 | inherit | instance | inherit | input:IN-20260730-figma-001#extracted-facts/03 |'],
  });
  assert.deepEqual(outOfRange.validate().errors, []);
  assert.match(outOfRange.validate().warnings.map((w) => w.message).join('\n'), /MP-101/);

  const duplicateRoot = tmpdir(t);
  const id = 'IN-20260730-figma-001';
  const a = write(path.join(duplicateRoot, 'inputs', 'a', `${id}.md`), inputText(id));
  const b = write(path.join(duplicateRoot, 'inputs', 'b', `${id}.md`), inputText(id));
  const m = write(path.join(duplicateRoot, 'mapping.md'), mappingText());
  const result = validateMappingProvenance({
    docs: [loadDoc(m)],
    inputArtifacts: [loadInputArtifact(a), loadInputArtifact(b)],
  });
  assert.match(result.errors.map((e) => e.message).join('\n'), /중복 input_id/);
});

test('Source Ref, Source Unit, Captured At share provenance rules and conservative contradiction warnings', (t) => {
  const bad = fixture(t, {
    provenanceRows: [
      '| M-001 | input:IN-20260730-figma-001#extracted-facts/01 | wrong | 2026-07-30 | input:IN-20260730-figma-001#extracted-facts/01 |',
    ],
  });
  const badMessages = bad.validate().errors.map((e) => e.message).join('\n');
  assert.match(badMessages, /MP-015/);
  assert.match(badMessages, /MP-016/);
  assert.match(badMessages, /MP-017/);

  const inheritMissing = fixture(t, {
    provenanceRows: ['| M-001 | inherit | node | inherit | input:IN-20260730-figma-001#extracted-facts/01 |'],
  }, { sourceRef: '', capturedAt: 'not-a-date' });
  const inheritedMessages = inheritMissing.validate().errors.map((e) => e.message).join('\n');
  assert.match(inheritedMessages, /MP-015/);
  assert.match(inheritedMessages, /MP-017/);

  const nA = fixture(t, {
    provenanceRows: ['| M-001 | figma://file/abc/node/1:234 | n/a | inherit | input:IN-20260730-figma-001#extracted-facts/01 |'],
  });
  assert.match(nA.validate().warnings.map((w) => w.message).join('\n'), /MP-102/);

  const mismatch = fixture(t, {
    sourceRef: 'figma://file/source-file/frame/10:20',
    provenanceRows: ['| M-001 | figma://file/other-file/node/1:234 | instance | inherit | input:IN-20260730-figma-001#extracted-facts/01 |'],
  });
  assert.match(mismatch.validate().warnings.map((w) => w.message).join('\n'), /MP-103/);
});

test('validate check 12 runs opted-in mapping without any reconciliation register', (t) => {
  const root = tmpdir(t);
  const docs = path.join(root, 'docs', 'frontend-workflow');
  const src = path.join(root, 'src');
  fs.mkdirSync(src, { recursive: true });
  write(path.join(docs, 'inputs', 'IN-20260730-figma-001.md'), inputText());
  write(
    path.join(docs, 'domains', 'auth', 'screens', 'login', 'figma-component-mapping.md'),
    mappingText(),
  );

  const pass = spawnSync(process.execPath, [VALIDATE, '--docs', docs, '--src', src, '--json'], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(pass.status, 0, pass.stderr);
  const passBody = JSON.parse(pass.stdout);
  assert.equal(passBody.errors.some((entry) => /MP-/.test(entry.message)), false);

  write(
    path.join(docs, 'domains', 'auth', 'screens', 'login', 'figma-component-mapping.md'),
    mappingText({ provenanceRows: [] }),
  );
  const fail = spawnSync(process.execPath, [VALIDATE, '--docs', docs, '--src', src, '--json'], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(fail.status, 1, fail.stderr);
  const failBody = JSON.parse(fail.stdout);
  assert.equal(failBody.errors.some((entry) => entry.check === 12 && /MP-012/.test(entry.message)), true);
});
