// doc-drift.mjs (lib) — Phase 0 canonical-doc drift detector, warning-first.
//
// Phase 0 deliberately stays mechanical and conservative: it only checks Markdown
// inline/image relative links for missing target files and Markdown heading anchors
// for missing GitHub-like slugs. It does not attempt semantic drift, manifest↔roadmap
// heuristics, changelog PR range checks, external URL reachability, dedup copy
// detection, or any hard gate behavior.
import fs from 'node:fs';
import path from 'node:path';
import { isDir, readFileSafe } from './util.mjs';

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
  const text = stripFencedCodeBlocks(content);
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

function sortFindings(findings) {
  return findings.sort((a, b) => (
    compareText(a.source, b.source) ||
    compareText(a.check, b.check) ||
    compareText(a.link, b.link) ||
    compareText(a.target, b.target) ||
    compareText(a.reason, b.reason)
  ));
}

function dedupeFindings(findings) {
  const seen = new Set();
  const out = [];
  for (const finding of findings) {
    const key = [
      finding.severity,
      finding.check,
      finding.source,
      finding.link,
      finding.target,
      finding.reason,
    ].join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(finding);
  }
  return out;
}

export function analyzeDocDrift({ rootDir }) {
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
        findings.push({
          severity: 'warning',
          check: 'broken-relative-link',
          source,
          link,
          target,
          reason: 'target path escapes root',
        });
        continue;
      }

      if (filePart && !pathExists(targetAbs)) {
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

  const finalFindings = sortFindings(dedupeFindings(findings));
  return {
    tool: 'workflow:doc-drift',
    mode: 'warning-first',
    root: '.',
    ok: true,
    warning_count: finalFindings.length,
    findings: finalFindings,
  };
}

export function formatDocDriftHuman(report) {
  if (!report || report.warning_count === 0) {
    return ['workflow:doc-drift — ok (warning-first): no Phase 0 doc link drift found'];
  }

  return report.findings.map(
    (finding) =>
      `workflow:doc-drift — WARNING ${finding.check}: ${finding.source} ` +
      `links to ${finding.link} (${finding.target}) — ${finding.reason}`,
  );
}
