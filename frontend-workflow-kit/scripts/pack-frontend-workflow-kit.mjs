#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { KIT_ROOT, parseArgs, readFileSafe, yamlParse } from './lib/util.mjs';
import {
  PAYLOAD_MANIFEST_NAME,
  buildPayloadManifest,
  gitInfo,
  writeJson,
} from './lib/kit-manifest.mjs';

const DEFAULT_MANIFEST = path.join(KIT_ROOT, 'distribution-manifest.yaml');
const DEFAULT_OUT = path.resolve(KIT_ROOT, '..', 'dist', 'frontend-workflow-kit');

function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

function normalizeManifestPath(p) {
  return toPosix(path.normalize(String(p))).replace(/^\.\//, '');
}

function fail(message, code = 2) {
  process.stderr.write(`kit:pack: ${message}\n`);
  process.exit(code);
}

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function assertSafeOutDir(outDir) {
  const resolved = path.resolve(outDir);
  const root = path.parse(resolved).root;
  if (resolved === root) fail(`refusing to write to filesystem root: ${resolved}`);
  if (resolved === KIT_ROOT) fail(`refusing to replace kit root: ${resolved}`);
  if (isInside(resolved, KIT_ROOT)) fail(`refusing to write to a parent of kit root: ${resolved}`);
  if (isInside(KIT_ROOT, resolved)) fail(`refusing to write generated output inside kit root: ${resolved}`);
}

function loadManifest(manifestPath) {
  const raw = readFileSafe(manifestPath);
  if (raw == null) fail(`manifest not found: ${manifestPath}`);
  let manifest;
  try {
    manifest = yamlParse(raw);
  } catch (err) {
    fail(`manifest YAML parse failed: ${err.message}`);
  }
  const include = manifest?.payload?.include;
  if (!Array.isArray(include) || include.length === 0) {
    fail('manifest payload.include must be a non-empty array');
  }
  return manifest;
}

function normalizeEntry(entry) {
  if (typeof entry === 'string') return { source: entry, target: entry };
  if (!entry || typeof entry !== 'object') fail(`invalid manifest entry: ${JSON.stringify(entry)}`);
  const source = entry.source || entry.path;
  const target = entry.target || entry.path || entry.source;
  if (typeof source !== 'string' || !source) fail(`manifest entry needs source/path: ${JSON.stringify(entry)}`);
  if (typeof target !== 'string' || !target) fail(`manifest entry needs target/path: ${JSON.stringify(entry)}`);
  return { ...entry, source, target };
}

function normalizeExcludeEntry(entry) {
  if (!entry || typeof entry !== 'object') fail(`invalid manifest exclude entry: ${JSON.stringify(entry)}`);
  if (typeof entry.path !== 'string' || !entry.path) {
    fail(`manifest exclude entry needs path: ${JSON.stringify(entry)}`);
  }
  return {
    ...entry,
    path: normalizeManifestPath(entry.path),
  };
}

function escapeRegex(raw) {
  return raw.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function excludeMatcherFor(pattern) {
  if (pattern.endsWith('/**')) {
    const base = pattern.slice(0, -3);
    return (rel) => rel === base || rel.startsWith(`${base}/`);
  }
  if (pattern.includes('*')) {
    const source = pattern.split('*').map(escapeRegex).join('[^/]*');
    const re = new RegExp(`^${source}$`);
    return (rel) => re.test(rel);
  }
  return (rel) => rel === pattern;
}

function shouldExcludeCopyItem(item, excludeEntries) {
  const sourceRel = normalizeManifestPath(path.relative(KIT_ROOT, item.src));
  const targetRel = normalizeManifestPath(item.target);
  return excludeEntries.some((entry) => {
    const matches = excludeMatcherFor(entry.path);
    return matches(sourceRel) || matches(targetRel);
  });
}

function resolveKitSource(source) {
  const resolved = path.resolve(KIT_ROOT, source);
  const repoRoot = path.resolve(KIT_ROOT, '..');
  if (!isInside(repoRoot, resolved)) {
    fail(`manifest source escapes repo root: ${source}`);
  }
  return resolved;
}

function resolveTarget(outDir, target) {
  const resolved = path.resolve(outDir, target);
  if (!isInside(outDir, resolved)) {
    fail(`manifest target escapes output dir: ${target}`);
  }
  return resolved;
}

function walkFilesAll(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      } else if (entry.isSymbolicLink()) {
        fail(`symlinks are not supported in distribution payload: ${toPosix(path.relative(KIT_ROOT, full))}`);
      }
    }
  }
  return out.sort((a, b) => toPosix(a).localeCompare(toPosix(b)));
}

function copyFilePreserveMode(src, dest) {
  const stat = fs.statSync(src);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, stat.mode & 0o777);
}

function copyConsumerPackageJson(src, dest) {
  const stat = fs.statSync(src);
  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(src, 'utf8'));
  } catch (err) {
    fail(`package.json parse failed: ${err.message}`);
  }
  delete packageJson.scripts;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
  fs.chmodSync(dest, stat.mode & 0o777);
}

function expandEntry(entry) {
  const normalized = normalizeEntry(entry);
  const classification = normalized.classification ?? null;
  if (normalized.source.endsWith('/**')) {
    const sourceDirRel = normalized.source.slice(0, -3);
    const targetDirRel = normalized.target.endsWith('/**') ? normalized.target.slice(0, -3) : normalized.target;
    const sourceDir = resolveKitSource(sourceDirRel);
    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
      fail(`allowlisted directory missing: ${sourceDirRel}`);
    }
    return walkFilesAll(sourceDir).map((src) => ({
      src,
      target: path.join(targetDirRel, path.relative(sourceDir, src)),
      classification,
    }));
  }

  const src = resolveKitSource(normalized.source);
  if (!fs.existsSync(src)) fail(`allowlisted file missing: ${normalized.source}`);
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fail(`directory entries must use /**: ${normalized.source}`);
  }
  if (!stat.isFile()) fail(`allowlisted path is not a regular file: ${normalized.source}`);
  return [{ src, target: normalized.target, classification }];
}

function readPackageVersion() {
  const raw = readFileSafe(path.join(KIT_ROOT, 'package.json'));
  if (raw == null) return null;
  try {
    return JSON.parse(raw).version || null;
  } catch {
    return null;
  }
}

export function packFrontendWorkflowKit({
  outDir = DEFAULT_OUT,
  manifestPath = DEFAULT_MANIFEST,
  sourceRef = null,
  sourceRepo = null,
} = {}) {
  const resolvedOut = path.resolve(outDir);
  const resolvedManifest = path.resolve(manifestPath);
  assertSafeOutDir(resolvedOut);
  const manifest = loadManifest(resolvedManifest);
  const repoRoot = path.resolve(KIT_ROOT, '..');

  const expandedPlan = [];
  for (const entry of manifest.payload.include) expandedPlan.push(...expandEntry(entry));

  const excluded = (manifest.exclude || []).map(normalizeExcludeEntry);
  const copyPlan = expandedPlan.filter((item) => !shouldExcludeCopyItem(item, excluded));

  const seen = new Map();
  for (const item of copyPlan) {
    const targetKey = toPosix(item.target);
    if (seen.has(targetKey)) {
      fail(`duplicate distribution target: ${targetKey} from ${toPosix(item.src)} and ${toPosix(seen.get(targetKey))}`);
    }
    seen.set(targetKey, item.src);
  }

  fs.rmSync(resolvedOut, { recursive: true, force: true });
  fs.mkdirSync(resolvedOut, { recursive: true });

  const copied = [];
  for (const item of copyPlan.sort((a, b) => toPosix(a.target).localeCompare(toPosix(b.target)))) {
    const dest = resolveTarget(resolvedOut, item.target);
    if (toPosix(item.target) === 'package.json' && path.resolve(item.src) === path.join(KIT_ROOT, 'package.json')) {
      copyConsumerPackageJson(item.src, dest);
    } else {
      copyFilePreserveMode(item.src, dest);
    }
    copied.push(toPosix(item.target));
  }

  const summary = {
    manifest: path.basename(resolvedManifest),
    manifest_version: manifest.version,
    destination_hint: manifest.destination_hint || null,
    file_count: copied.length,
    files: copied,
    excluded: excluded.map((entry) => ({
      path: entry.path,
      classification: entry.classification,
      reason: entry.reason,
    })),
  };
  fs.writeFileSync(
    path.join(resolvedOut, '_distribution-summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
    'utf8',
  );

  // Deterministic machine-readable payload manifest: lets consumers run a
  // manifest-based safe upgrade (scripts/upgrade-vendored-kit.mjs) instead of
  // re-copying the whole directory. Generated from the actual packed output.
  let resolvedRef = sourceRef ?? process.env.KIT_SOURCE_REF ?? null;
  let resolvedRepo = sourceRepo ?? process.env.KIT_SOURCE_REPO ?? null;
  if (resolvedRef == null || resolvedRepo == null) {
    const git = gitInfo(repoRoot); // single git probe, only when not provided explicitly
    if (resolvedRef == null) resolvedRef = git.source_ref;
    if (resolvedRepo == null) resolvedRepo = git.source_repo;
  }
  const payloadManifest = buildPayloadManifest({
    items: copyPlan,
    outDir: resolvedOut,
    repoRoot,
    destinationHint: manifest.destination_hint || null,
    sourceRef: resolvedRef,
    sourceRepo: resolvedRepo,
    packageVersion: readPackageVersion(),
    distributionManifestVersion: manifest.version ?? null,
  });
  writeJson(path.join(resolvedOut, PAYLOAD_MANIFEST_NAME), payloadManifest);

  return { outDir: resolvedOut, summary, payloadManifest };
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const outDir = flags.out ? path.resolve(String(flags.out)) : DEFAULT_OUT;
  const manifestPath = flags.manifest ? path.resolve(String(flags.manifest)) : DEFAULT_MANIFEST;
  const sourceRef = typeof flags['source-ref'] === 'string' ? flags['source-ref'] : null;
  const sourceRepo = typeof flags['source-repo'] === 'string' ? flags['source-repo'] : null;
  const result = packFrontendWorkflowKit({ outDir, manifestPath, sourceRef, sourceRepo });
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, out: result.outDir, file_count: result.summary.file_count }, null, 2) + '\n');
  } else {
    process.stdout.write(`kit:pack wrote ${result.summary.file_count} files to ${result.outDir}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
