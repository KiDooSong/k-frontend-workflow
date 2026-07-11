// doc-drift.mjs (lib) — Phase 0 canonical-doc drift detector, warning-first.
//
// Phase 0 deliberately stays mechanical and conservative: it only checks Markdown
// inline/image relative links for missing target files and Markdown heading anchors
// for missing GitHub-like slugs. It does not attempt semantic drift, changelog PR
// range checks, external URL reachability, dedup copy detection, or any hard gate
// behavior.
//
// Phase 1 adds ONE opt-in, info-only heuristic (manifest↔roadmap status wording,
// --include status-heuristic): a narrow same-line keyword cross-check between
// artifact-manifest status fields and roadmap wording. It is a review pointer, not
// a semantic-truth claim; its findings are severity "info", counted in info_count,
// never in warning_count, and never change the exit code.
//
// Issue #163 adds a second opt-in (--include release-consistency): narrow
// structural release/version ↔ implemented-status contradiction rules (package
// version vs CHANGELOG heading, roadmap snapshot staleness, script-existence vs
// "미구현" wording, fixed doc counts vs code). Warning-first, exit 0, historical
// docs excluded, canonical_owner/fix_path on every finding, no auto doc edits.
//
// Issue #150 false-positive classes handled inside Phase 0 (still mechanical):
// inline code spans are masked out of link scanning, GitHub/VSCode line anchors
// (#L12, #L12-L14) are line references rather than heading slugs, bare
// non-path-like bracket notation is demoted to info, and root-escaping relative
// links are reported as unverifiable info by default (opt-in warning promotion).
import fs from 'node:fs';
import path from 'node:path';
import { isDir, readFileSafe, yamlParse } from './util.mjs';

// Input error for the opt-in status heuristic (missing/corrupt manifest or
// roadmap). The CLI surfaces this as exit 2 - explicitly requested inputs that
// cannot be read are usage/input errors, not warning-first findings.
export class DocDriftInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DocDriftInputError';
  }
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'storybook-static',
]);

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function toPosixPath(p) {
  return p.split(path.sep).join('/');
}

function relPosix(rootDir, absPath) {
  const rel = path.relative(rootDir, absPath);
  return toPosixPath(rel || '.');
}

function isInside(rootDir, absPath) {
  const rel = path.relative(rootDir, absPath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function pathExists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function shouldSkipDir(name) {
  return name.startsWith('.') || IGNORED_DIRS.has(name);
}

export function walkMarkdownFiles(rootDir) {
  const out = [];
  if (!isDir(rootDir)) return out;

  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipDir(entry.name)) stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(full);
      }
    }
  }

  return out.sort(compareText);
}

export function stripFencedCodeBlocks(content) {
  const lines = String(content || '').split(/\r?\n/);
  const out = [];
  let fence = null;

  for (const line of lines) {
    const marker = /^(?: {0,3})(`{3,}|~{3,})/.exec(line);
    if (!fence && marker) {
      fence = { char: marker[1][0], len: marker[1].length };
      out.push('');
      continue;
    }

    if (fence) {
      const close = new RegExp(`^(?: {0,3})${fence.char}{${fence.len},}\\s*$`).test(line);
      if (close) fence = null;
      out.push('');
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}

// Mask inline code spans with spaces so `[label](target)` examples inside
// backticks are never scanned as links. Minimal CommonMark idiom: a span opens
// with a run of N backticks and closes at the next run of exactly N backticks
// (so ``code ` inner`` works); an unmatched opener stays literal text. Space
// masking (not removal) keeps newlines and offsets, so no fake links appear
// from line joining. Fenced code blocks must be stripped before this runs.
export function maskInlineCodeSpans(content) {
  const text = String(content || '');
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '`') {
      out += text[i];
      i++;
      continue;
    }

    let openEnd = i;
    while (openEnd < text.length && text[openEnd] === '`') openEnd++;
    const runLen = openEnd - i;

    let close = -1;
    let scan = openEnd;
    while (scan < text.length) {
      if (text[scan] !== '`') {
        scan++;
        continue;
      }
      let runEnd = scan;
      while (runEnd < text.length && text[runEnd] === '`') runEnd++;
      if (runEnd - scan === runLen) {
        close = scan;
        break;
      }
      scan = runEnd;
    }

    if (close === -1) {
      out += text.slice(i, openEnd);
      i = openEnd;
      continue;
    }

    const spanEnd = close + runLen;
    out += text.slice(i, spanEnd).replace(/[^\n]/g, ' ');
    i = spanEnd;
  }
  return out;
}

// CommonMark autolinks (<scheme:...> and <email>) are a single external
// destination, not Markdown, yet their contents may embed `[x](y)`-looking text
// (e.g. a URL path). Mask them with spaces before link extraction so that text
// never surfaces as a false relative link. Autolinks never contain whitespace or
// nested angle brackets, so equal-length space masking is safe (no newlines to
// preserve). Run before inline-code masking so a stray backtick inside a URL
// cannot mis-open a code span.
const AUTOLINK_RE = /<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s]*>|<[^<>\s@]+@[^<>\s]+>/g;
export function maskAutolinks(content) {
  return String(content || '').replace(AUTOLINK_RE, (match) => ' '.repeat(match.length));
}

// A Markdown character is escaped when preceded by an odd run of backslashes:
// `\[` is a literal bracket (not a link), but `\\[` is an escaped backslash then
// a real bracket. Used to skip escaped `[` openers during link extraction.
function isEscapedAt(text, pos) {
  let backslashes = 0;
  for (let i = pos - 1; i >= 0 && text[i] === '\\'; i--) backslashes++;
  return backslashes % 2 === 1;
}

function findClosingBracket(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

function findClosingParen(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

function extractLinkDestination(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('<')) {
    const end = trimmed.indexOf('>');
    if (end > 0) return trimmed.slice(1, end).trim() || null;
  }

  let out = '';
  let escaped = false;
  for (const ch of trimmed) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (/\s/.test(ch)) break;
    out += ch;
  }
  return out.trim() || null;
}

export function extractInlineMarkdownLinks(content) {
  const text = maskInlineCodeSpans(maskAutolinks(stripFencedCodeBlocks(content)));
  const links = [];

  for (let i = 0; i < text.length; i++) {
    let labelStart = -1;
    if (text[i] === '!' && text[i + 1] === '[') {
      labelStart = i + 1;
    } else if (text[i] === '[') {
      labelStart = i;
    } else {
      continue;
    }

    // An escaped `\[` opener is a literal bracket, not a link label.
    if (isEscapedAt(text, labelStart)) continue;

    const labelEnd = findClosingBracket(text, labelStart + 1);
    if (labelEnd === -1 || text[labelEnd + 1] !== '(') continue;

    const close = findClosingParen(text, labelEnd + 2);
    if (close === -1) continue;

    const destination = extractLinkDestination(text.slice(labelEnd + 2, close));
    if (destination) links.push({ link: destination });
    i = close;
  }

  return links;
}

function headingTextFromLine(line) {
  const match = /^(?: {0,3})(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
  if (!match) return null;
  return match[2].replace(/[ \t]+#+[ \t]*$/, '').trim();
}

function textifyHeadingMarkdown(text) {
  return String(text || '')
    .replace(/`+([^`]*?)`+/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_~]/g, '')
    .trim();
}

export function slugifyHeading(text) {
  // Phase 0 conservative approximation of GitHub heading slugs: good for ordinary
  // docs, CJK/Korean headings, inline code/emphasis/link text, and duplicate suffixes.
  return textifyHeadingMarkdown(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

export function collectHeadingSlugs(content) {
  const slugs = new Set();
  const counts = new Map();
  const text = stripFencedCodeBlocks(content);

  for (const line of text.split(/\r?\n/)) {
    const heading = headingTextFromLine(line);
    if (heading == null) continue;

    const base = slugifyHeading(heading);
    const seen = counts.get(base) || 0;
    counts.set(base, seen + 1);
    slugs.add(seen === 0 ? base : `${base}-${seen}`);
  }

  return slugs;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function splitLinkTarget(link) {
  const hash = link.indexOf('#');
  const beforeHash = hash === -1 ? link : link.slice(0, hash);
  const anchor = hash === -1 ? null : safeDecode(link.slice(hash + 1));
  const query = beforeHash.indexOf('?');
  const filePart = safeDecode(query === -1 ? beforeHash : beforeHash.slice(0, query));
  return { filePart, anchor };
}

function isExternalOrNonRelative(link) {
  const trimmed = link.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('#')) return false;
  if (trimmed.startsWith('//') || trimmed.startsWith('/')) return true;
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
}

function normalizeAnchor(anchor) {
  return String(anchor || '').trim().toLowerCase();
}

// GitHub/VSCode line anchors (#L12, #L12-L14) reference source lines, not
// heading slugs. Case-insensitive on the already URL-decoded anchor; the target
// file's existence is still checked by the normal relative-link path.
export function isGitHubLineAnchor(anchor) {
  return /^L\d+(?:-L\d+)?$/i.test(String(anchor || '').trim());
}

// Conservative demotion for issue #150 class 3: `[label](annotation)` UI copy,
// type notes, and key descriptions parse as CommonMark inline links but carry no
// path signal at all. Only destinations with no anchor, no query, no slash or
// backslash, and no extension qualify, and only when the token is short or
// contains non-ASCII descriptive text — anything path-like keeps the full
// broken-relative-link warning. This does not attempt full CommonMark judgment.
export function isBareAmbiguousDestination({ link, filePart, anchor }) {
  if (anchor != null) return false;
  const raw = String(link || '').trim();
  if (!raw || !filePart) return false;
  if (raw.includes('?') || raw.includes('#')) return false;
  if (/[/\\]/.test(raw)) return false;
  if (path.extname(filePart) !== '') return false;
  return /[^\x00-\x7F]/.test(filePart) || filePart.length <= 48;
}

function findingKey(finding, name) {
  return String(finding[name] ?? '');
}

function sortFindings(findings) {
  return findings.sort((a, b) => (
    compareText(findingKey(a, 'source'), findingKey(b, 'source')) ||
    compareText(findingKey(a, 'check'), findingKey(b, 'check')) ||
    compareText(findingKey(a, 'link'), findingKey(b, 'link')) ||
    compareText(findingKey(a, 'target'), findingKey(b, 'target')) ||
    compareText(findingKey(a, 'artifact_id'), findingKey(b, 'artifact_id')) ||
    compareText(findingKey(a, 'roadmap_signal'), findingKey(b, 'roadmap_signal')) ||
    compareText(findingKey(a, 'reason'), findingKey(b, 'reason'))
  ));
}

function dedupeFindings(findings) {
  const seen = new Set();
  const out = [];
  for (const finding of findings) {
    const key = [
      'severity',
      'check',
      'source',
      'link',
      'target',
      'artifact_id',
      'roadmap_signal',
      'reason',
    ].map((name) => findingKey(finding, name)).join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(finding);
  }
  return out;
}

// --- Phase 1 opt-in: manifest↔roadmap status heuristic ------------------------
// Deliberately narrow: an artifact id (or its dot alias) and a status keyword on
// the SAME roadmap line. Lines carrying both implemented- and planned-flavored
// wording (e.g. "status: planned → active") are skipped as ambiguous. This never
// claims to understand roadmap prose — findings are manual-review pointers only.

const IMPLEMENTED_SIGNAL = /구현\s*완료|구현됨|\bimplemented\b|\bactive\b|완료/i;
// Negations that would otherwise trip the bare 완료 / implemented / active tokens:
// 미완료 contains 완료, "not implemented" contains implemented, "not active"
// contains active. Checked first so an explicitly-unfinished line never reads as
// implemented (keeps the info-only pointer from crying wolf).
const IMPLEMENTED_NEGATION = /미완료|미구현|미완성|\bnot\s+(?:yet\s+)?implemented\b|\bunimplemented\b|\bincomplete\b|\bnot\s+active\b/i;
const PLANNED_SIGNAL = /\bplanned\b|예정|대기/i;

// Artifact ids use [a-z0-9-]; the dot alias covers generated file spellings like
// `eslint.workflow.config` for eslint-workflow-config. Nothing broader.
function artifactAliases(id) {
  const aliases = new Set([id]);
  if (id.includes('-')) aliases.add(id.replace(/-/g, '.'));
  return [...aliases];
}

function aliasRegex(alias) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`);
}

function loadManifestArtifactStatuses(manifestPath) {
  const raw = readFileSafe(manifestPath);
  if (raw == null) {
    throw new DocDriftInputError(`artifact manifest not found: ${manifestPath}`);
  }
  let manifest;
  try {
    manifest = yamlParse(raw);
  } catch (err) {
    throw new DocDriftInputError(`artifact manifest YAML parse failed: ${manifestPath} — ${err.message}`);
  }
  const artifacts = manifest && typeof manifest.artifacts === 'object' && manifest.artifacts
    ? manifest.artifacts
    : {};
  const out = [];
  for (const [id, entry] of Object.entries(artifacts)) {
    const status = String(entry?.status || '').toLowerCase();
    if (status === 'active' || status === 'planned') out.push({ id, status });
  }
  return out.sort((a, b) => compareText(a.id, b.id));
}

export function analyzeManifestRoadmapStatus({ rootDir, manifestPath, roadmapPath }) {
  const rootAbs = path.resolve(rootDir || process.cwd());
  const manifestAbs = path.resolve(manifestPath);
  const roadmapAbs = path.resolve(roadmapPath);
  const artifacts = loadManifestArtifactStatuses(manifestAbs);
  const roadmapRaw = readFileSafe(roadmapAbs);
  if (roadmapRaw == null) {
    throw new DocDriftInputError(`roadmap not found: ${roadmapAbs}`);
  }

  const source = relPosix(rootAbs, roadmapAbs);
  const target = relPosix(rootAbs, manifestAbs);
  // Fenced code blocks are ignored, mirroring the Phase 0 link checks.
  const lines = stripFencedCodeBlocks(roadmapRaw).split(/\r?\n/);
  const findings = [];

  for (const { id, status } of artifacts) {
    const aliasMatchers = artifactAliases(id).map((alias) => aliasRegex(alias));
    for (const line of lines) {
      if (!aliasMatchers.some((re) => re.test(line))) continue;
      const implemented = IMPLEMENTED_SIGNAL.test(line) && !IMPLEMENTED_NEGATION.test(line);
      const planned = PLANNED_SIGNAL.test(line);
      if (implemented === planned) continue; // no signal, or ambiguous (both)
      if (status === 'planned' && implemented) {
        findings.push({
          severity: 'info',
          check: 'manifest-roadmap-status-heuristic',
          source,
          target,
          artifact_id: id,
          manifest_status: 'planned',
          roadmap_signal: 'implemented',
          reason: 'roadmap wording looks implemented while manifest status is planned (heuristic; review manually)',
        });
      } else if (status === 'active' && planned) {
        findings.push({
          severity: 'info',
          check: 'manifest-roadmap-status-heuristic',
          source,
          target,
          artifact_id: id,
          manifest_status: 'active',
          roadmap_signal: 'planned',
          reason: 'roadmap wording looks planned while manifest status is active (heuristic; review manually)',
        });
      }
    }
  }

  return findings;
}

// --- Issue #163 opt-in: release/version ↔ implemented-status consistency ------
// Narrow structural rules only — no semantic-truth judgment of prose, no
// automatic doc edits, never a gate (exit 0 stays). Rules:
//   1. package.json version ↔ latest CHANGELOG release heading
//   2. manifest active/planned ↔ roadmap wording — already covered by the
//      existing opt-in status-heuristic (composable via --include a,b)
//   3. package script existence ↔ same-line "미구현/not implemented" wording
//      that names the exact script token
//   4. canonical roadmap snapshot date ↔ latest release heading date
//      (plus an optional explicit --now age threshold — no wall clock ever)
//   5. fixed counts in canonical docs (검사 N종 / 스크립트·CLI N개) ↔ code
// Historical/archive docs are excluded: only a small canonical doc allowlist is
// scanned, and any allowlisted doc whose first lines carry an uppercase
// HISTORICAL marker (or the 🗄 glyph) is skipped mechanically.
// Every finding carries canonical_owner (the truth-holding file) and fix_path
// (the file a human should edit) — the detector itself never fixes anything.

const UNIMPLEMENTED_RE = /미구현|아직\s*구현되지\s*않|구현되어\s*있지\s*않|\bnot\s+(?:yet\s+)?implemented\b|\bunimplemented\b/i;
// Uppercase-only marker (plus the archive glyph) so prose mentions of
// "historical" in a living doc never demote it.
const HISTORICAL_MARKER_RE = /\bHISTORICAL\b|🗄/;
const SNAPSHOT_DATE_RE = /스냅샷[:：]\s*(\d{4}-\d{2}-\d{2})/;

function parseDateUTC(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(ms);
  if (
    d.getUTCFullYear() !== Number(m[1]) ||
    d.getUTCMonth() !== Number(m[2]) - 1 ||
    d.getUTCDate() !== Number(m[3])
  ) return null;
  return ms;
}

export function isHistoricalDoc(content) {
  return String(content || '').split(/\r?\n/).slice(0, 40).some((line) => HISTORICAL_MARKER_RE.test(line));
}

// First H2 whose text starts with a semver-like version is the latest release
// heading; `## Unreleased` is skipped. Non-version H2 sections are ignored.
export function latestReleaseHeading(changelogRaw) {
  for (const line of stripFencedCodeBlocks(changelogRaw).split(/\r?\n/)) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const text = m[1].replace(/`/g, '').trim();
    if (/^unreleased\b/i.test(text)) continue;
    const versionMatch = /^v?(\d+\.\d+\.\d+[0-9A-Za-z.+-]*)/.exec(text);
    if (!versionMatch) continue;
    const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(text);
    return { version: versionMatch[1], date: dateMatch ? dateMatch[1] : null };
  }
  return null;
}

// Only namespaced aliases (workflow:*, example:* …) are contradiction tokens —
// bare names like "test" are too generic to match mechanically. Each alias also
// contributes its scripts/<file>.mjs basename as a token.
function packageScriptTokens(pkg) {
  const tokens = new Set();
  for (const [name, cmd] of Object.entries(pkg?.scripts || {})) {
    if (!/^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9:-]*$/i.test(name)) continue;
    tokens.add(name);
    const m = /scripts\/([A-Za-z0-9._-]+\.mjs)/.exec(String(cmd || ''));
    if (m) tokens.add(m[1]);
  }
  return [...tokens].sort(compareText);
}

function scriptTokenRegex(token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // No '/' in the lookbehind so `scripts/doc-drift.mjs` still matches the
  // basename token; ':'/'.'/'-' guards keep `workflow:catalog` from matching
  // inside `workflow:catalog-gen`.
  return new RegExp(`(?<![A-Za-z0-9:._-])${escaped}(?![A-Za-z0-9:._-])`);
}

export function analyzeReleaseConsistency({
  rootDir,
  packagePath,
  changelogPath,
  roadmapPath,
  now = null,
  maxSnapshotAgeDays = 30,
}) {
  const rootAbs = path.resolve(rootDir || process.cwd());
  const packageAbs = path.resolve(packagePath);
  const changelogAbs = path.resolve(changelogPath);
  const roadmapAbs = path.resolve(roadmapPath);

  // Explicitly requested inputs that cannot be read are usage/input errors
  // (exit 2 in the CLI), mirroring the status heuristic — never a silent skip.
  const packageRaw = readFileSafe(packageAbs);
  if (packageRaw == null) {
    throw new DocDriftInputError(`package.json not found: ${packageAbs}`);
  }
  let pkg;
  try {
    pkg = JSON.parse(packageRaw);
  } catch (err) {
    throw new DocDriftInputError(`package.json parse failed: ${packageAbs} — ${err.message}`);
  }
  const changelogRaw = readFileSafe(changelogAbs);
  if (changelogRaw == null) {
    throw new DocDriftInputError(`changelog not found: ${changelogAbs}`);
  }
  const roadmapRaw = readFileSafe(roadmapAbs);
  if (roadmapRaw == null) {
    throw new DocDriftInputError(`roadmap not found: ${roadmapAbs}`);
  }
  let nowMs = null;
  if (now != null) {
    nowMs = parseDateUTC(now);
    if (nowMs == null) {
      throw new DocDriftInputError(`invalid --now date: ${now} (expected YYYY-MM-DD)`);
    }
  }
  if (!Number.isInteger(maxSnapshotAgeDays) || maxSnapshotAgeDays <= 0) {
    throw new DocDriftInputError(`invalid max snapshot age: ${maxSnapshotAgeDays} (expected a positive integer of days)`);
  }

  const packageRel = relPosix(rootAbs, packageAbs);
  const changelogRel = relPosix(rootAbs, changelogAbs);
  const roadmapRel = relPosix(rootAbs, roadmapAbs);
  const findings = [];

  // Rule 1 — package version ↔ latest CHANGELOG release heading.
  const version = typeof pkg.version === 'string' && pkg.version.trim() !== '' ? pkg.version.trim() : null;
  const release = latestReleaseHeading(changelogRaw);
  if (version) {
    if (!release) {
      findings.push({
        severity: 'warning',
        check: 'package-version-changelog-mismatch',
        source: packageRel,
        target: changelogRel,
        package_version: version,
        changelog_version: null,
        canonical_owner: changelogRel,
        fix_path: changelogRel,
        reason: `package version '${version}' has no release heading in the changelog (only Unreleased or none)`,
      });
    } else if (release.version !== version) {
      findings.push({
        severity: 'warning',
        check: 'package-version-changelog-mismatch',
        source: packageRel,
        target: changelogRel,
        package_version: version,
        changelog_version: release.version,
        canonical_owner: changelogRel,
        fix_path: packageRel,
        reason: `package version '${version}' does not match latest changelog release heading '${release.version}'`,
      });
    }
  }

  // Rule 4 — canonical roadmap snapshot date vs latest release date; the
  // optional explicit --now check keeps determinism (no wall clock is read).
  const snapMatch = SNAPSHOT_DATE_RE.exec(stripFencedCodeBlocks(roadmapRaw));
  const snapshotDate = snapMatch ? snapMatch[1] : null;
  const snapshotMs = snapshotDate ? parseDateUTC(snapshotDate) : null;
  if (snapshotMs != null && release?.date) {
    const releaseMs = parseDateUTC(release.date);
    if (releaseMs != null && snapshotMs < releaseMs) {
      findings.push({
        severity: 'warning',
        check: 'roadmap-snapshot-stale',
        source: roadmapRel,
        target: changelogRel,
        snapshot_date: snapshotDate,
        release_date: release.date,
        canonical_owner: changelogRel,
        fix_path: roadmapRel,
        reason: `roadmap snapshot ${snapshotDate} predates latest changelog release ${release.date}`,
      });
    }
  }
  if (snapshotMs != null && nowMs != null) {
    const ageDays = Math.floor((nowMs - snapshotMs) / 86400000);
    if (ageDays > maxSnapshotAgeDays) {
      findings.push({
        severity: 'warning',
        check: 'roadmap-snapshot-stale',
        source: roadmapRel,
        target: changelogRel,
        snapshot_date: snapshotDate,
        release_date: null,
        canonical_owner: roadmapRel,
        fix_path: roadmapRel,
        reason: `roadmap snapshot ${snapshotDate} is ${ageDays} days old as of ${now} (threshold ${maxSnapshotAgeDays} days)`,
      });
    }
  }

  // Canonical doc allowlist for rules 3 and 5 — never a repo-wide walk, so
  // archive/, temp/, docs/research raw evidence, and run reports are never
  // scanned; HISTORICAL-marked docs (e.g. the demoted IMPLEMENTING.md) skip.
  const docCandidates = [
    path.join(rootAbs, 'README.md'),
    path.join(rootAbs, 'IMPLEMENTING.md'),
    path.join(rootAbs, 'frontend-workflow-kit', 'README.md'),
    roadmapAbs,
  ];
  const seenDocs = new Set();
  const docs = [];
  for (const candidate of docCandidates) {
    const abs = path.resolve(candidate);
    if (seenDocs.has(abs)) continue;
    seenDocs.add(abs);
    const raw = readFileSafe(abs);
    if (raw == null) continue;
    if (isHistoricalDoc(raw)) continue;
    docs.push({ rel: relPosix(rootAbs, abs), lines: stripFencedCodeBlocks(raw).split(/\r?\n/) });
  }

  // Rule 3 — package script exists but a canonical doc line naming the exact
  // script token says it is unimplemented.
  const tokenMatchers = packageScriptTokens(pkg).map((token) => ({ token, re: scriptTokenRegex(token) }));
  for (const doc of docs) {
    for (const line of doc.lines) {
      if (!UNIMPLEMENTED_RE.test(line)) continue;
      for (const { token, re } of tokenMatchers) {
        if (!re.test(line)) continue;
        findings.push({
          severity: 'warning',
          check: 'script-doc-unimplemented-contradiction',
          source: doc.rel,
          target: packageRel,
          script: token,
          canonical_owner: packageRel,
          fix_path: doc.rel,
          reason: `doc wording says '${token}' is unimplemented but the package script exists`,
        });
      }
    }
  }

  // Rule 5 — fixed counts in canonical docs vs code. '검사 N종' compares against
  // the count validate.mjs itself prints (single code source); '스크립트/CLI N개'
  // compares against top-level scripts/*.mjs files and stays info-only because
  // the count basis is a convention, not a single declared fact.
  const pkgDirAbs = path.dirname(packageAbs);
  const validateAbs = path.join(pkgDirAbs, 'scripts', 'validate.mjs');
  const validateRaw = readFileSafe(validateAbs);
  const checkCountMatch = validateRaw ? /검사\s*(\d+)\s*종\s*통과/.exec(validateRaw) : null;
  const checkCount = checkCountMatch ? Number(checkCountMatch[1]) : null;
  const validateRel = relPosix(rootAbs, validateAbs);

  const scriptsDirAbs = path.join(pkgDirAbs, 'scripts');
  let scriptFileCount = null;
  if (isDir(scriptsDirAbs)) {
    try {
      scriptFileCount = fs.readdirSync(scriptsDirAbs, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs')).length;
    } catch {
      scriptFileCount = null;
    }
  }
  const scriptsRel = relPosix(rootAbs, scriptsDirAbs);

  for (const doc of docs) {
    for (const line of doc.lines) {
      if (checkCount != null) {
        for (const m of line.matchAll(/검사\s*(\d+)\s*종/g)) {
          const docCount = Number(m[1]);
          if (docCount === checkCount) continue;
          findings.push({
            severity: 'warning',
            check: 'fixed-count-mismatch',
            source: doc.rel,
            target: validateRel,
            doc_count: docCount,
            code_count: checkCount,
            canonical_owner: validateRel,
            fix_path: doc.rel,
            reason: `doc fixed count '검사 ${docCount}종' conflicts with the validate.mjs success line '검사 ${checkCount}종'`,
          });
        }
      }
      if (scriptFileCount != null) {
        for (const m of line.matchAll(/(?:스크립트|CLI)\s*(\d+)\s*개/g)) {
          const docCount = Number(m[1]);
          if (docCount === scriptFileCount) continue;
          findings.push({
            severity: 'info',
            check: 'fixed-count-mismatch',
            source: doc.rel,
            target: scriptsRel,
            doc_count: docCount,
            code_count: scriptFileCount,
            canonical_owner: scriptsRel,
            fix_path: doc.rel,
            reason: `doc fixed count '${docCount}개' differs from ${scriptFileCount} top-level scripts/*.mjs files (count-basis heuristic; review manually)`,
          });
        }
      }
    }
  }

  return findings;
}

// statusHeuristic: null (default, Phase 0 output byte-identical) or
// { manifestPath, roadmapPath } to enable the opt-in Phase 1 heuristic.
// releaseConsistency: null (default) or { packagePath, changelogPath,
// roadmapPath, now?, maxSnapshotAgeDays? } to enable the opt-in issue #163
// release/version ↔ implemented-status consistency checks.
// escapesRootSeverity: 'info' (default — root-escaping targets cannot be
// verified under the scan root) or 'warning' (opt-in promotion).
export function analyzeDocDrift({ rootDir, statusHeuristic = null, releaseConsistency = null, escapesRootSeverity = 'info' }) {
  if (escapesRootSeverity !== 'info' && escapesRootSeverity !== 'warning') {
    throw new DocDriftInputError(
      `invalid escapesRootSeverity: ${escapesRootSeverity} (expected info or warning)`,
    );
  }
  const rootAbs = path.resolve(rootDir || process.cwd());
  const mdFiles = walkMarkdownFiles(rootAbs);
  const headingCache = new Map();

  function headingSlugsFor(absPath) {
    if (!headingCache.has(absPath)) {
      headingCache.set(absPath, collectHeadingSlugs(readFileSafe(absPath) || ''));
    }
    return headingCache.get(absPath);
  }

  const findings = [];

  for (const sourceAbs of mdFiles) {
    const source = relPosix(rootAbs, sourceAbs);
    const content = readFileSafe(sourceAbs) || '';
    for (const { link } of extractInlineMarkdownLinks(content)) {
      if (isExternalOrNonRelative(link)) continue;

      const { filePart, anchor } = splitLinkTarget(link);
      const targetAbs = filePart
        ? path.resolve(path.dirname(sourceAbs), filePart)
        : sourceAbs;
      const target = relPosix(rootAbs, targetAbs);

      if (!isInside(rootAbs, targetAbs)) {
        // The target lives outside the scan root (e.g. an intentional sibling
        // repo reference), so it cannot be verified here — not a broken claim.
        findings.push({
          severity: escapesRootSeverity,
          check: 'relative-link-escapes-root',
          source,
          link,
          target,
          reason: 'target path escapes scan root; target cannot be verified',
        });
        continue;
      }

      if (filePart && !pathExists(targetAbs)) {
        if (isBareAmbiguousDestination({ link, filePart, anchor })) {
          findings.push({
            severity: 'info',
            check: 'ambiguous-non-link-bracket-notation',
            source,
            link,
            target,
            reason: 'bare parenthesized annotation looks non-path-like; not treated as a broken relative link (review manually)',
          });
          continue;
        }
        findings.push({
          severity: 'warning',
          check: 'broken-relative-link',
          source,
          link,
          target,
          reason: 'target file not found',
        });
        continue;
      }

      const anchorSlug = normalizeAnchor(anchor);
      if (!anchorSlug) continue;
      // Line references are never heading slugs; the target file's existence
      // was already verified above.
      if (isGitHubLineAnchor(anchorSlug)) continue;
      if (path.extname(targetAbs).toLowerCase() !== '.md') continue;

      if (!headingSlugsFor(targetAbs).has(anchorSlug)) {
        findings.push({
          severity: 'warning',
          check: 'dead-anchor',
          source,
          link,
          target,
          reason: `target heading slug '${anchorSlug}' not found`,
        });
      }
    }
  }

  if (statusHeuristic) {
    findings.push(...analyzeManifestRoadmapStatus({
      rootDir: rootAbs,
      manifestPath: statusHeuristic.manifestPath,
      roadmapPath: statusHeuristic.roadmapPath,
    }));
  }

  if (releaseConsistency) {
    findings.push(...analyzeReleaseConsistency({
      rootDir: rootAbs,
      ...releaseConsistency,
    }));
  }

  const finalFindings = sortFindings(dedupeFindings(findings));
  const warningCount = finalFindings.filter((finding) => finding.severity === 'warning').length;
  const infoCount = finalFindings.filter((finding) => finding.severity === 'info').length;
  // Default no-info output keeps the exact Phase 0 byte shape; the include key
  // appears only with opt-in checks, and info_count appears when an opt-in ran
  // or when default info findings (ambiguous bracket notation, root-escaping
  // links) exist.
  const includes = [];
  if (releaseConsistency) includes.push('release-consistency');
  if (statusHeuristic) includes.push('status-heuristic');
  const out = {
    tool: 'workflow:doc-drift',
    mode: 'warning-first',
    root: '.',
  };
  if (includes.length > 0) out.include = includes;
  out.ok = true;
  out.warning_count = warningCount;
  if (includes.length > 0 || infoCount > 0) out.info_count = infoCount;
  out.findings = finalFindings;
  return out;
}

function formatFinding(finding) {
  if (finding.check === 'manifest-roadmap-status-heuristic') {
    return (
      `workflow:doc-drift — INFO ${finding.check}: ${finding.artifact_id} ` +
      `manifest=${finding.manifest_status} vs roadmap~${finding.roadmap_signal} ` +
      `(${finding.source} ↔ ${finding.target}) — ${finding.reason}`
    );
  }
  const severityLabel = finding.severity === 'info' ? 'INFO' : 'WARNING';
  // Release-consistency findings carry the canonical owner and the manual fix
  // path — surface both so a human knows which file holds the truth and where
  // to edit (the detector never edits anything itself).
  if (finding.canonical_owner) {
    return (
      `workflow:doc-drift — ${severityLabel} ${finding.check}: ${finding.source} ` +
      `↔ ${finding.target} — ${finding.reason} ` +
      `[owner: ${finding.canonical_owner}; fix: ${finding.fix_path}]`
    );
  }
  return (
    `workflow:doc-drift — ${severityLabel} ${finding.check}: ${finding.source} ` +
    `links to ${finding.link} (${finding.target}) — ${finding.reason}`
  );
}

export function formatDocDriftHuman(report) {
  const heuristicEnabled = Array.isArray(report?.include) && report.include.includes('status-heuristic');
  const releaseEnabled = Array.isArray(report?.include) && report.include.includes('release-consistency');
  const lines = [];
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  if (!report || findings.length === 0) {
    lines.push('workflow:doc-drift — ok (warning-first): no Phase 0 doc link drift found');
  } else {
    lines.push(...findings.map((finding) => formatFinding(finding)));
  }
  if (heuristicEnabled) {
    lines.push(
      'workflow:doc-drift — status-heuristic findings are info-only: review manually; not a gate, not a semantic-truth claim.',
    );
  }
  if (releaseEnabled) {
    lines.push(
      'workflow:doc-drift — release-consistency findings are warning-first observations with a canonical owner and fix path: fix docs manually; not a gate, never auto-edited.',
    );
  }
  return lines;
}
