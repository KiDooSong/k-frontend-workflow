// kit-manifest.mjs — shared helpers for the packed payload manifest and the
// installed manifest used by the safe vendored-kit upgrade flow.
//
// Two manifests share one shape so the planner can read both uniformly:
//   - .kit-payload-manifest.json : written into a packed kit (dist/...) by kit:pack.
//   - .kit-install-manifest.json : written into a consumer's tools/frontend-workflow/
//                                  at install time and after each managed upgrade.
//
// 의존성 최소 원칙: Node 내장만 사용한다(util.mjs 와 동일 정책). git 은 best-effort 이며
// 없으면 stat 기반 fallback 으로 결정적 결과를 유지한다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const MANIFEST_SCHEMA_VERSION = 1;

export const PAYLOAD_MANIFEST_NAME = '.kit-payload-manifest.json';
export const INSTALL_MANIFEST_NAME = '.kit-install-manifest.json';
export const DISTRIBUTION_SUMMARY_NAME = '_distribution-summary.json';

// Planner output locations inside the consumer vendored kit.
export const UPGRADE_DIR_NAME = '_upgrade';
export const CONFLICTS_DIR_NAME = '.upgrade-conflicts';

// Files that are pack/install/planner metadata — never treated as payload content
// when scanning a kit tree (so they are never copied, compared, or flagged local).
export const META_FILES = new Set([
  PAYLOAD_MANIFEST_NAME,
  INSTALL_MANIFEST_NAME,
  DISTRIBUTION_SUMMARY_NAME,
]);

// Directories skipped when scanning a kit tree for payload content.
export const META_DIRS = new Set([
  UPGRADE_DIR_NAME,
  CONFLICTS_DIR_NAME,
  'node_modules',
]);

export function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

// --- hashing ---------------------------------------------------------------
export function sha256OfBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function sha256OfFile(absPath) {
  return sha256OfBuffer(fs.readFileSync(absPath));
}

// --- deterministic JSON I/O ------------------------------------------------
// 2-space indent + trailing newline; no timestamps anywhere so two packs of the
// same tree at the same ref produce byte-identical manifests (low-noise diffs).
export function writeJson(absPath, obj) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

export function readJsonSafe(absPath) {
  try {
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch {
    return null;
  }
}

// --- git (best-effort, cross-platform mode truth) --------------------------
// On Windows, fs stat mode loses the executable bit (everything reads 0o666), so
// the canonical mode source is git's recorded index mode (100644/100755). This is
// only used at pack time inside the kit repo; consumers never need git.
export function gitModeIndex(cwd) {
  try {
    const r = spawnSync('git', ['ls-files', '--stage', '-z'], {
      cwd,
      encoding: 'buffer',
      maxBuffer: 128 * 1024 * 1024,
    });
    if (r.status !== 0 || !r.stdout) return null;
    const text = r.stdout.toString('utf8');
    const map = new Map();
    for (const rec of text.split('\0')) {
      if (!rec) continue;
      // record: "<mode> <sha> <stage>\t<path>"
      const tab = rec.indexOf('\t');
      if (tab === -1) continue;
      const mode = rec.slice(0, tab).split(' ')[0];
      const file = rec.slice(tab + 1);
      if (mode) map.set(toPosix(file), mode);
    }
    return map;
  } catch {
    return null;
  }
}

export function statMode(absPath) {
  try {
    const m = fs.statSync(absPath).mode;
    return (m & 0o111) ? '100755' : '100644';
  } catch {
    return '100644';
  }
}

export function parseRepoSlug(url) {
  if (!url) return null;
  // https://github.com/Owner/Repo(.git)  or  git@github.com:Owner/Repo(.git)
  const m = /[/:]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/.exec(String(url).trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

export function gitInfo(cwd) {
  const out = { source_ref: null, source_repo: null };
  try {
    const ref = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
    if (ref.status === 0) out.source_ref = ref.stdout.trim() || null;
  } catch { /* git absent — leave null */ }
  try {
    const remote = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8' });
    if (remote.status === 0) out.source_repo = parseRepoSlug(remote.stdout.trim());
  } catch { /* no remote — leave null */ }
  return out;
}

// --- payload manifest ------------------------------------------------------
// items: [{ target: posix-rel, src: abs source (optional), classification }]
// outDir: packed output dir (where the files were actually written).
// repoRoot: optional git repo root for cross-platform mode lookup.
export function buildPayloadManifest({
  items,
  outDir,
  repoRoot = null,
  destinationHint = null,
  sourceRef = null,
  sourceRepo = null,
  packageVersion = null,
  distributionManifestVersion = null,
}) {
  const gitModes = repoRoot ? gitModeIndex(repoRoot) : null;
  const files = items
    .map((it) => {
      const target = toPosix(it.target);
      const dest = path.join(outDir, target);
      const sha256 = sha256OfFile(dest);
      let mode = null;
      if (gitModes && it.src) {
        mode = gitModes.get(toPosix(path.relative(repoRoot, it.src))) || null;
      }
      if (!mode) mode = statMode(it.src || dest);
      return {
        path: target,
        sha256,
        classification: it.classification ?? null,
        mode,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    schema_version: MANIFEST_SCHEMA_VERSION,
    kit: {
      source_repo: sourceRepo || null,
      source_ref: sourceRef || null,
      package_version: packageVersion || null,
    },
    distribution_manifest_version: distributionManifestVersion ?? null,
    payload: {
      destination_hint: destinationHint || null,
      files,
    },
  };
}

// Normalize either manifest shape into Map(path -> { sha256, classification, mode }).
export function manifestFileIndex(manifest) {
  const map = new Map();
  const files = manifest?.payload?.files;
  if (!Array.isArray(files)) return map;
  for (const f of files) {
    if (!f || typeof f.path !== 'string') continue;
    map.set(toPosix(f.path), {
      sha256: typeof f.sha256 === 'string' ? f.sha256 : null,
      classification: f.classification ?? null,
      mode: typeof f.mode === 'string' ? f.mode : null,
    });
  }
  return map;
}

// Recursively list payload-relevant files under a kit tree (posix-rel, sorted),
// skipping META_DIRS and META_FILES. Used as a fallback when a manifest is absent
// and to detect unknown-local consumer files.
export function scanPayloadFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (META_DIRS.has(e.name)) continue;
        stack.push(path.join(dir, e.name));
      } else if (e.isFile()) {
        if (META_FILES.has(e.name)) continue;
        out.push(toPosix(path.relative(root, path.join(dir, e.name))));
      }
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}
