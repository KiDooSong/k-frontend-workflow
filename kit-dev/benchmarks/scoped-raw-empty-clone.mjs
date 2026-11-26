// Public #363 synthetic probe. Each invocation uses one fresh process.
// Usage: node scoped-raw-empty-clone.mjs KIT_ROOT H2_COUNT [--candidates] [--check] [--result FILE]
// The default mode measures only authored lookup elapsed time; maxRSS includes
// process startup, parsing, cloning and lookup, and is sampled before result
// serialization. --candidates instruments a disposable runtime copy instead:
// its operation counts are evidence of work/retention, not timing or RSS data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const [kitArgument, countArgument, ...extra] = process.argv.slice(2);
const count = Number(countArgument), flags = new Set();
let resultFile;
for (let index = 0; index < extra.length; index += 1) {
  if (extra[index] === '--result' && extra[index + 1]) resultFile = path.resolve(extra[++index]);
  else if (['--candidates', '--check'].includes(extra[index])) flags.add(extra[index]);
  else throw new Error('Unknown or incomplete argument: ' + extra[index]);
}
if (!kitArgument || !Number.isSafeInteger(count) || count < 1) {
  console.error('Usage: node scoped-raw-empty-clone.mjs KIT_ROOT H2_COUNT [--candidates] [--check] [--result FILE]');
  process.exit(2);
}
if (resultFile) assert.equal(fs.existsSync(resultFile), false, 'use a fresh result path');

let kit = fs.realpathSync(kitArgument), diagnosticRoot, variant;
const counts = {
  candidateInspections: 0, candidateLookups: 0,
  candidateContainers: 0, candidateMembers: 0, entryCandidateRefs: 0,
  completeLookups: 0, completeInspections: 0, labelInspections: 0,
};
const probeKey = Symbol.for('frontkit.synthetic.empty-clone-counts');
if (flags.has('--candidates')) {
  diagnosticRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-empty-clone-probe-'));
  process.once('exit', () => fs.rmSync(diagnosticRoot, { recursive: true, force: true }));
  const copied = path.join(diagnosticRoot, 'kit');
  fs.cpSync(kit, copied, { recursive: true, filter: (file) => path.basename(file) !== 'node_modules' });
  fs.symlinkSync(fs.realpathSync(path.join(kit, 'node_modules')), path.join(copied, 'node_modules'), 'dir');
  kit = copied;
  const file = path.join(kit, 'scripts/lib/scoped-work-authored.mjs');
  let source = fs.readFileSync(file, 'utf8');
  const hook = 'globalThis[Symbol.for("frontkit.synthetic.empty-clone-counts")]';
  const replaceOne = (from, to) => {
    assert.equal(source.split(from).length, 2, 'expected one diagnostic insertion point: ' + from);
    source = source.replace(from, to);
  };
  const retained = new WeakMap();
  const store = (candidates) => {
    const size = candidates instanceof Set ? candidates.size : candidates.length;
    if (!retained.has(candidates)) counts.candidateContainers += 1;
    counts.candidateMembers += size - (retained.get(candidates) || 0);
    retained.set(candidates, size);
  };
  globalThis[probeKey] = {
    inspect() { counts.candidateInspections += 1; },
    lookup() { counts.candidateLookups += 1; },
    retain(candidates) {
      if (!candidates) return;
      counts.entryCandidateRefs += 1;
      store(candidates);
    },
    store,
    includes(candidates, home) {
      counts.completeLookups += 1;
      // Keep native includes and count the indexes it actually inspects. This
      // proxy exists only in the disposable diagnostic copy, never the input
      // raw view, its cache eligibility or a production result.
      const observed = new Proxy(candidates, { get(target, key, receiver) {
        if (typeof key === 'string' && /^(?:0|[1-9][0-9]*)$/.test(key)) counts.completeInspections += 1;
        return Reflect.get(target, key, receiver);
      } });
      return candidates.includes.call(observed, home);
    },
    has(candidates, home) {
      if (candidates == null) return undefined;
      counts.completeLookups += 1;
      counts.completeInspections += 1;
      return candidates.has(home);
    },
    label() { counts.labelInspections += 1; },
    labelHas(labels, label) { counts.labelInspections += 1; return labels.has(label); },
  };
  if (!source.includes('function mutableAuthoredView(')) {
    // 92c4018 uses the original AST ordinal and has no empty-source search.
    assert.ok(source.includes('const original = raw.sections[++headingIndex];') &&
      !source.includes('reconciliationReferenceSectionHeading'), 'unsupported pre-index implementation');
    variant = 'legacy-ordinal';
  } else if (source.includes('physical.filter((home) =>')) {
    variant = 'per-entry-candidate-array';
    const candidates = "    const candidates = original || typeof text !== 'string' ? [] : physical.filter((home) =>\n" +
      '      home.title === title && home.slug === slug && home.nodePositions.length === 0 &&\n' +
      '      body.slice(home.start, home.rawEnd) === text);';
    replaceOne(candidates,
      "    const candidates = original || typeof text !== 'string' ? [] : (" + hook + '.lookup(), physical.filter((home) => (\n' +
      '      ' + hook + '.inspect(), home.title === title && home.slug === slug && home.nodePositions.length === 0 &&\n' +
      '      body.slice(home.start, home.rawEnd) === text)));');
    replaceOne('entry.candidates.includes(home)', hook + '.includes(entry.candidates, home)');
    replaceOne('physical.some((home) => home.title === entry.title || home.slug === entry.slug)',
      'physical.some((home) => (' + hook + '.label(), home.title === entry.title || home.slug === entry.slug))');
  } else if (source.includes('const emptySources = new Map(), physicalTitles = new Set(), physicalSlugs = new Set();')) {
    variant = 'indexed-candidate-set';
    replaceOne('  for (const home of physical) {\n    physicalTitles.add(home.title);',
      '  for (const home of physical) {\n    ' + hook + '.inspect();\n    physicalTitles.add(home.title);');
    replaceOne('    byText.get(text).add(home);',
      '    byText.get(text).add(home);\n    ' + hook + '.store(byText.get(text));');
    replaceOne("    const candidates = original || typeof text !== 'string' ? null : emptySources.get(title)?.get(slug)?.get(text);",
      "    const candidates = original || typeof text !== 'string' ? null : (" + hook + '.lookup(), emptySources.get(title)?.get(slug)?.get(text));');
    replaceOne('entry.candidates?.has(home)', hook + '.has(entry.candidates, home)');
    replaceOne('physicalTitles.has(entry.title)', hook + '.labelHas(physicalTitles, entry.title)');
    replaceOne('physicalSlugs.has(entry.slug)', hook + '.labelHas(physicalSlugs, entry.slug)');
  } else {
    throw new Error('Unsupported empty-source implementation; update the disposable instrumentation points');
  }
  if (variant !== 'legacy-ordinal') {
    const entry = '    const entry = { title, slug, text, nodes, tables, original, candidates };';
    replaceOne(entry, '    ' + hook + '.retain(candidates);\n' + entry);
  }
  fs.writeFileSync(file, source);
}

const load = (name) => import(pathToFileURL(path.join(kit, 'scripts/lib', `${name}.mjs`)));
const { parseReconciliationReferenceView } = await load('reconciliation-markdown-ast');
const { scopedAuthoredView } = await load('scoped-work-authored');
const body = '## Notes\n'.repeat(count);
const raw = structuredClone(parseReconciliationReferenceView(body));
const started = performance.now();
const view = scopedAuthoredView(body, raw);
const elapsedMs = performance.now() - started;
const peakRssKiB = process.resourceUsage().maxRSS;
assert.equal(view.byName.get('notes').length, count);
assert.equal(view.sections.length, count + 1);

// Include Maps as well as the complete tree and ordered section fields. The
// counter probe is not an output field; raw and instrumented hashes must agree.
const semantic = JSON.stringify(view, (_, value) => value instanceof Map ? [...value] : value);
if (resultFile) fs.writeFileSync(resultFile, semantic, { flag: 'wx' });
const result = {
  node: process.version, platform: process.platform, arch: process.arch,
  count, markdownBytes: Buffer.byteLength(body), sections: view.sections.length,
  notes: view.byName.get('notes').length,
  ...(flags.has('--candidates') ? { mode: 'diagnostic', variant, candidates: counts }
    : { mode: 'original', elapsedMs: Number(elapsedMs.toFixed(3)), peakRssKiB }),
  resultBytes: Buffer.byteLength(semantic), resultSha256: createHash('sha256').update(semantic).digest('hex'),
};
delete globalThis[probeKey];
console.log(JSON.stringify(result));
if (flags.has('--check') && flags.has('--candidates')) {
  const homes = count + 1;
  assert.ok(counts.candidateInspections <= 4 * homes, 'candidate source preparation must scale linearly with physical homes');
  assert.ok(counts.candidateLookups <= 2 * homes, 'each raw section needs at most one empty-source lookup');
  assert.ok(counts.candidateMembers <= 2 * homes, 'duplicate keys must share their candidate membership storage');
  assert.ok(counts.completeInspections <= 2 * homes, 'complete clone membership must not scan duplicate buckets');
  assert.ok(counts.labelInspections <= 2 * homes, 'added-label detection must not scan every physical home');
}
