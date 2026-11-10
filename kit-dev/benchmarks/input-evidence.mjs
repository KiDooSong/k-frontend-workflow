// Usage: node kit-dev/benchmarks/input-evidence.mjs <before-kit-root> <after-kit-root> [documents=64,1200] [runs=3]
// Install each kit's dependencies first. Each sample imports one kit in a fresh
// process, then calls the actual v2 validator twice with file-backed inputs.
// The large case exceeds the shared AST's 32 Mi-character source budget while
// its compact evidence projection fits the new 8 MiB syntax cache. This is a
// synthetic cache-capacity scenario, not an end-to-end consumer CLI benchmark.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const script = fileURLToPath(import.meta.url);
const usage = 'usage: node input-evidence.mjs <before-kit-root> <after-kit-root> [documents=64,1200] [runs=3]; documents and runs must be positive integers';
const factCount = 12;
const tableRows = 80;
const paragraphs = 12;
const paragraphChars = 1024;
const astSourceBudgetChars = 32 * 1024 * 1024;

function positiveInteger(value) {
  const number = Number(value);
  assert.ok(Number.isSafeInteger(number) && number > 0, usage);
  return number;
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function inputId(index) {
  return `IN-20261110-review-${String(index).padStart(4, '0')}`;
}

function facts(index) {
  const id = String(index).padStart(4, '0');
  return Array.from({ length: factCount }, (_, bullet) =>
    `Observation ${id}/${bullet + 1}: the captured panel keeps its selected filter while a user reviews the next result.`);
}

function inputBody(index) {
  const id = String(index).padStart(4, '0');
  const table = [
    '| Component | State | Expected behavior | Source evidence |',
    '| --- | --- | --- | --- |',
    ...Array.from({ length: tableRows }, (_, row) =>
      `| component-${id}-${row} | ${row % 2 ? 'expanded' : 'collapsed'} | Preserve the selected filter and its accessible label after returning from the details view. | Captured review ${id}, observation ${row + 1}, shared toolbar and results panel. |`),
  ];
  const notes = Array.from({ length: paragraphs }, (_, paragraph) => {
    const sentence = `Review ${id}/${paragraph + 1}: The captured workflow keeps the selected context during loading, returns focus to the originating control, and shows the current result together with its available actions. `;
    return sentence.repeat(Math.ceil(paragraphChars / sentence.length)).slice(0, paragraphChars);
  });
  return `# Captured product review ${id}\n\n## Summary\n\nReview notes from a product walkthrough with a component inventory and numbered evidence.\n\n## Extracted Facts\n\n${facts(index).map((fact) => `- ${fact}`).join('\n')}\n\n## Component Inventory\n\n${table.join('\n')}\n\n## Detailed Notes\n\n${notes.join('\n\n')}\n`;
}

function frontmatter(index) {
  return { input_id: inputId(index), input_type: 'meeting', source_type: 'meeting',
    source_ref: `review-notes-${index}.txt`, captured_at: '2026-11-10T00:00:00Z',
    captured_by: 'synthetic-benchmark', status: 'captured', affected_domains: ['review'],
    affected_screens: [`REVIEW-${String(index).padStart(3, '0')}`] };
}

function tableHeader(columns) {
  return [`| ${columns.join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`].join('\n');
}

function memoryAfterGc() {
  global.gc();
  global.gc();
  const memory = process.memoryUsage();
  return { heap_used_bytes: memory.heapUsed, rss_bytes: memory.rss };
}

// This runs only after both timed calls and their memory snapshots. Checking all
// section names, bullet counts/text and first/last resolved evidence prevents an
// empty validation-result digest from hiding a changed evidence projection.
function verifyEvidence(provenance, artifacts, bodyLengths) {
  const index = provenance.buildInputArtifactIndex(artifacts);
  const digest = createHash('sha256');
  let serializedProjectionBytes = 0;
  for (let document = 0; document < artifacts.length; document++) {
    const artifact = artifacts[document];
    const expectedFacts = facts(document);
    const expectedTexts = [['summary', []], ['extracted-facts', expectedFacts],
      ['component-inventory', []], ['detailed-notes', []]];
    const expectedSections = expectedTexts.map(([slug, texts]) => [slug, texts.length]);
    const details = provenance.inputSectionDetails(index, artifact);
    assert.deepEqual([...details.sections], expectedSections, 'section order and exact bullet counts');
    assert.deepEqual([...details.bulletTexts], expectedTexts, 'all exact visible bullet text');
    const evidence = [1, factCount].map((bullet) => {
      const token = `input:${artifact.fm.input_id}#extracted-facts/${String(bullet).padStart(2, '0')}`;
      const resolved = provenance.resolveInputEvidence(index, token);
      assert.equal(resolved.artifact, artifact, 'evidence must resolve to the indexed artifact');
      assert.equal(resolved.sections, details.sections);
      assert.deepEqual(resolved.bulletTexts, expectedFacts);
      const projected = { status: resolved.status, ref: resolved.ref,
        bulletCount: resolved.bulletCount, bulletIndex: resolved.bulletIndex,
        evidenceText: resolved.evidenceText };
      assert.deepEqual(projected, { status: 'ok',
        ref: { inputId: artifact.fm.input_id, section: 'extracted-facts', bulletIndex: bullet, raw: token },
        bulletCount: factCount, bulletIndex: bullet, evidenceText: expectedFacts[bullet - 1] });
      return projected;
    });
    const entries = [...details.bulletTexts];
    // Same serialized payload representation and length-prefixed SHA-256 key
    // as the syntax cache; excludes Map/object bookkeeping and snapshots.
    const keyChars = String(bodyLengths[document]).length + 1 + 64;
    serializedProjectionBytes += (JSON.stringify(entries).length + keyChars) * 2;
    digest.update(JSON.stringify({ input_id: artifact.fm.input_id,
      sections: [...details.sections], bulletTexts: entries, evidence })).update('\n');
  }
  return { evidence_sha256: digest.digest('hex'),
    serialized_projection_with_digest_keys_bytes: serializedProjectionBytes };
}

async function sample(kitRoot, documents) {
  assert.equal(typeof global.gc, 'function', 'worker requires --expose-gc');
  const lib = (name) => import(pathToFileURL(path.join(kitRoot, `scripts/lib/${name}.mjs`)).href);
  const [items, registers, targets, markdown, provenance] = await Promise.all([
    lib('reconciliation-items'), lib('reconciliation-register'), lib('reconciliation-target-index'),
    lib('reconciliation-markdown-ast'), lib('provenance'),
  ]);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fwkit-evidence-benchmark-'));
  const originalRead = fs.readFileSync;
  try {
    const corpusHash = createHash('sha256');
    const bodyLengths = [];
    let sourceChars = 0;
    let sourceBytes = 0;
    const artifacts = Array.from({ length: documents }, (_, index) => {
      const fm = frontmatter(index);
      const body = inputBody(index);
      const file = path.join(directory, `${inputId(index)}.md`);
      const header = Object.entries(fm).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');
      fs.writeFileSync(file, `---\n${header}\n---\n${body}`);
      sourceChars += body.length;
      bodyLengths.push(body.length);
      sourceBytes += Buffer.byteLength(body);
      corpusHash.update(`${index}\0`).update(body);
      // Intentionally omit body: each fresh validator index reads the file.
      return { file, fm, hasFrontmatter: true, parseError: null };
    });
    const files = new Set(artifacts.map(({ file }) => file));
    const summaries = artifacts.map(({ fm }) => `| ${fm.input_id} | meeting | reject-input | reconciled | rejected | - | - | - |`).join('\n');
    const itemRows = artifacts.map(({ fm }) => `| ${fm.input_id} | 01 | reject | reject-input | reject | - | input:${fm.input_id}#extracted-facts/01 | inherit | statement | inherit |`).join('\n');
    const registerFile = path.join(directory, 'register.md');
    fs.writeFileSync(registerFile, `---\nreconciliation_contract: 2\nreview_profile: reconcile-stage04-v1\nstructured_since: "2026-11-09T00:00:00Z"\n---\n\n# Evidence validation benchmark\n\n${tableHeader(registers.REQUIRED_REGISTER_COLS)}\n${summaries}\n\n## Reconciliation Items\n\n${tableHeader(items.REQUIRED_ITEM_COLS)}\n${itemRows}\n`);
    const register = registers.parseReconciliationRegister(registerFile);
    const targetIndex = targets.buildReconciliationTargetIndex({ docs: [] });
    let reads = 0;
    fs.readFileSync = function(file, ...args) {
      if (typeof file === 'string' && files.has(file)) reads++;
      return originalRead.call(this, file, ...args);
    };
    const beforeMemory = memoryAfterGc();
    const calls = [];
    for (const call of ['first', 'second']) {
      const before = markdown.reconciliationParseStats();
      const beforeReads = reads;
      const start = performance.now();
      const result = items.validateReconciliationV2({ register, registerFile, inputArtifacts: artifacts, targetIndex });
      const elapsed = performance.now() - start;
      const maxRssKiB = process.resourceUsage().maxRSS;
      const after = markdown.reconciliationParseStats();
      assert.deepEqual(result, { errors: [], warnings: [] }, 'fixture must remain a valid v2 register');
      assert.equal(reads - beforeReads, documents, 'each fresh validator input index must read every file');
      calls.push({ call, elapsed_ms: elapsed, file_reads: reads - beforeReads,
        parsed: after.parsed - before.parsed, reused: after.reused - before.reused,
        errors: result.errors.length, warnings: result.warnings.length,
        validation_sha256: hash(JSON.stringify(result)), max_rss_kib: maxRssKiB, after_gc: memoryAfterGc() });
    }
    const beforeVerificationReads = reads;
    const verification = verifyEvidence(provenance, artifacts, bodyLengths);
    assert.equal(reads - beforeVerificationReads, documents, 'verification uses its own fresh file-backed index');
    return { documents, source_chars: sourceChars, source_bytes: sourceBytes,
      corpus_sha256: corpusHash.digest('hex'), register_body_chars: register.body.length,
      register_body_sha256: hash(register.body), before_memory: beforeMemory, calls,
      verification: { ...verification, file_reads: reads - beforeVerificationReads } };
  } finally {
    fs.readFileSync = originalRead;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function callMedians(samples, side) {
  return ['first', 'second'].map((call) => {
    const selected = samples.filter((entry) => entry.side === side).map((entry) => entry.calls.find((entry) => entry.call === call));
    return { call, elapsed_ms: median(selected.map((entry) => entry.elapsed_ms)),
      file_reads: median(selected.map((entry) => entry.file_reads)),
      parsed: median(selected.map((entry) => entry.parsed)), reused: median(selected.map((entry) => entry.reused)),
      max_rss_kib: median(selected.map((entry) => entry.max_rss_kib)),
      after_gc: { heap_used_bytes: median(selected.map((entry) => entry.after_gc.heap_used_bytes)),
        rss_bytes: median(selected.map((entry) => entry.after_gc.rss_bytes)) } };
  });
}

async function main(args) {
  if (args[0] === '--worker') {
    assert.equal(args.length, 3, usage);
    console.log(JSON.stringify(await sample(path.resolve(args[1]), positiveInteger(args[2]))));
    return;
  }
  assert.ok(args.length >= 2 && args.length <= 4, usage);
  const [beforeArg, afterArg, documentArg = '64,1200', runArg = '3'] = args;
  const counts = documentArg.split(',').map(positiveInteger);
  const runs = positiveInteger(runArg);
  const kits = { before: path.resolve(beforeArg), after: path.resolve(afterArg) };
  const cases = [];
  for (const documents of counts) {
    const samples = [];
    let expected;
    let validationDigest;
    for (let run = 0; run < runs; run++) {
      const order = run % 2 ? ['after', 'before'] : ['before', 'after'];
      for (const side of order) {
        const raw = JSON.parse(execFileSync(process.execPath,
          ['--expose-gc', script, '--worker', kits[side], String(documents)],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
        const { before_memory, calls, ...verified } = raw;
        if (!expected) expected = verified;
        else assert.deepEqual(verified, expected, 'corpus, register and exact evidence must match across every sample');
        for (const call of calls) {
          if (!validationDigest) validationDigest = call.validation_sha256;
          else assert.equal(call.validation_sha256, validationDigest, 'validator results must match across every call');
        }
        samples.push({ side, run: run + 1, before_memory, calls });
        console.error(`${documents} documents, run ${run + 1}/${runs}, ${side}: first ${calls[0].elapsed_ms.toFixed(1)} ms; second ${calls[1].elapsed_ms.toFixed(1)} ms; exact evidence verified`);
      }
    }
    const medians = Object.fromEntries(['before', 'after'].map((side) => [side, callMedians(samples, side)]));
    cases.push({ ...expected, validation_sha256: validationDigest, medians,
      second_call_speedup: medians.before[1].elapsed_ms / medians.after[1].elapsed_ms, samples });
  }
  console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch,
    runs, kits, fixture: { fact_bullets_per_document: factCount, inventory_table_rows: tableRows,
      inventory_table_columns: 4, prose_paragraphs: paragraphs, characters_per_paragraph: paragraphChars,
      ast_source_budget_chars: astSourceBudgetChars },
    measurement: {
      elapsed_ms: 'Actual validateReconciliationV2 calls; includes a fresh internal input index, unchanged file reads and all v2 validation. Imports, fixture setup, parseReconciliationRegister, result assertions/hashing, forced GC and exact evidence verification are outside timing.',
      parser_counts: 'Shared Markdown AST parsed/reused counter deltas per validator call, including the register where applicable; register parsing during setup is excluded.',
      after_gc: 'Retained heap and current RSS after each validator call, result checks and two explicit GCs. Both snapshots precede the separate exact-evidence verification.',
      max_rss_kib: 'Process high-water RSS observed immediately after each validator call. Includes imports, fixture/register setup and earlier calls; excludes later exact-evidence verification. Not retained cache memory.',
      order: 'Fresh process for each kit/corpus/run; before/after order alternates across runs. Each process makes two validator calls without evidence warmup between them.',
      verification: 'After both timed calls and memory snapshots, a separate fresh index verifies every section name/count, every exact bullet text, and first/last evidence resolution against generated expectations; its reads are reported separately.',
      scope: 'Synthetic valid-input cache-capacity benchmark, not complete CLI or consumer performance. Repeated-call gains depend on the evidence projection fitting the bounded cache; first-call or retained-memory improvements are not assumed.',
    }, cases }, null, 2));
}

await main(process.argv.slice(2));
