// Synthetic public-CLI demonstration, not a source adapter or consumer runtime.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const kit = fileURLToPath(new URL('../../', import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'input-preview-example-'));
const source = '# Synthetic source\n\n[receipt](../evidence/receipt.json)\n';
const receipt = '{"source":"synthetic","revision":1}\n';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pinned = { 'work/source.md': digest(source), 'evidence/receipt.json': digest(receipt) };

function snapshot(root, relative = '') {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(relative, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'synthetic fixture uses regular files only');
    return entry.isDirectory()
      ? [[`${name}/`, 'directory'], ...snapshot(root, name)]
      : [[name, digest(fs.readFileSync(path.join(root, name)))]];
  }).sort(([a], [b]) => a.localeCompare(b));
}

function cli(script, args, cwd) {
  return JSON.parse(execFileSync(process.execPath, [path.join(kit, 'scripts', script), ...args], {
    cwd, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  }));
}

try {
  for (const [mode, subdir, flags] of [
    ['flat', '', []],
    ['grouped', 'editor', ['--group-by', 'domain']],
    ['explicit', 'editor/planning', ['--input-subdir', 'editor/planning']],
  ]) {
    const root = path.join(scratch, mode);
    const inputs = path.join(root, 'docs/frontend-workflow/inputs');
    fs.mkdirSync(inputs, { recursive: true });
    for (const [name, bytes] of [['work/source.md', source], ['evidence/receipt.json', receipt]]) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), bytes);
      assert.equal(digest(fs.readFileSync(path.join(root, name))), pinned[name]);
    }
    const before = snapshot(root);
    const plannedDirectory = path.join(inputs, subdir);
    const correctLink = path.relative(plannedDirectory, path.join(root, 'evidence/receipt.json')).split(path.sep).join('/');
    const initialFact = `Synthetic fact: [receipt](${correctLink}).`;
    const enrichment = 'New supporting note: [receipt](../evidence/receipt.json).';
    let previewId;
    for (const [stage, facts, expectedBroken] of [
      ['initial', [initialFact], 0],
      ['enriched', [initialFact, enrichment], 1],
      ['corrected', [initialFact, `New supporting note: [receipt](${correctLink}).`], 0],
    ]) {
      const payloadFile = path.join(scratch, `${mode}-${stage}.json`);
      fs.writeFileSync(payloadFile, JSON.stringify({
        input_type: 'planning', source_type: 'planning-doc', source_ref: 'work/source.md',
        captured_at: '2026-10-01T00:00:00Z', captured_by: 'synthetic-preview-example',
        affected_domains: ['editor'], affected_screens: ['EDITOR-001'],
        raw_artifacts: ['work/source.md', 'evidence/receipt.json'],
        summary: 'Synthetic facts; no human approval or implementation permission.',
        extracted_facts: [...facts, '[External report](https://example.invalid/report) is unverified.'],
      }));
      const preview = cli('create-input-artifact.mjs', [
        '--docs', path.join(root, 'docs/frontend-workflow'), '--from-json', payloadFile,
        ...flags, '--dry-run', '--json',
      ], root);
      assert.equal(preview.wrote, false);
      assert.equal(path.dirname(preview.output_path), plannedDirectory);
      previewId ??= preview.input_id;
      assert.equal(preview.input_id, previewId, 'dry-run does not reserve an ID');
      assert.ok(!fs.existsSync(preview.output_path), 'canonical input was not written');
      assert.deepEqual(snapshot(root), before, 'source, receipt, inputs and register remain unchanged');

      const observation = path.join(scratch, 'observations', `${mode}-${stage}`);
      fs.cpSync(root, observation, { recursive: true });
      const relativeInput = path.relative(root, preview.output_path);
      const observationInput = path.join(observation, relativeInput);
      fs.mkdirSync(path.dirname(observationInput), { recursive: true });
      fs.writeFileSync(observationInput, preview.artifact_text);
      const report = cli('doc-drift.mjs', ['--root', observation, '--json'], root);
      const broken = report.findings.filter((finding) => finding.check === 'broken-relative-link');
      assert.equal(broken.length, expectedBroken, `${mode}/${stage}: inspect findings, not exit 0`);
      assert.deepEqual(snapshot(root), before, 'observation checks do not change original fixture files');
      process.stdout.write(JSON.stringify({ mode, stage, producer_schema: 'passed',
        local_links: expectedBroken ? 'broken-relative-link' : 'passed', consumer_fixture_hashes: 'matched',
        external_urls: 'not-checked', source_meaning: 'not-checked', issued: false }) + '\n');
    }
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
