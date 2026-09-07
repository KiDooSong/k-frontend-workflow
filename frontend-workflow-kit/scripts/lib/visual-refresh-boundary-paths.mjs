// Path-boundary checks only; no readiness facts or positive authority are created here.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULTS, KIT_ROOT, readFileSafe, splitFrontmatter, walkFiles, yamlParse } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import {
  assertSnapshotPath, canonicalSnapshotPath, readPinnedBundledResource, VisualRefreshResourceError,
} from './visual-refresh-resources.mjs';

function toPosix(value) { return String(value).split(path.sep).join('/'); }
function sameOrAncestor(parent, child) { return parent === child || child.startsWith(`${parent}/`); }
function values(value) { return value == null ? [] : Array.isArray(value) ? value : [value]; }

// Segment checks also cover an existing case/symlink alias above a missing leaf.
// A missing path is allowed only as absence, never as an alias of another path.
function canonicalPhysicalRelative(root, raw, { label, required = false, type = null } = {}) {
  const ref = assertSnapshotPath(root, raw, { label, required, type });
  let cursor = fs.realpathSync(root);
  for (const segment of ref.relative.split('/')) {
    const next = path.join(cursor, segment);
    const names = fs.readdirSync(cursor);
    if (!names.includes(segment)) {
      if (fs.existsSync(next)) {
        throw new VisualRefreshResourceError(`${label} spelling이 repository physical path와 다름: ${ref.relative}`);
      }
      return ref.relative; // assertSnapshotPath already rejected a required missing path.
    }
    cursor = next;
  }
  const physical = toPosix(path.relative(fs.realpathSync(root), fs.realpathSync(cursor)));
  if (physical !== ref.relative) {
    throw new VisualRefreshResourceError(`${label} spelling이 repository physical path와 다름: ${ref.relative} -> ${physical}`);
  }
  return ref.relative;
}

// This source-side observation only resolves boundary templates. The authority
// evaluator still validates stable identity, lifecycle, uniqueness and domain.
function selectedSourceDomain(sourceRoot, docsRelative, selectedScreen) {
  if (!sourceRoot) return null;
  const directory = assertSnapshotPath(sourceRoot, `${docsRelative}/domains`, {
    label: 'source ScreenSpec directory', type: 'directory', required: false,
  });
  if (!directory.exists) return null;
  const matches = walkFiles(directory.absolute, ['.md'])
    .filter((file) => path.basename(file) === 'screen-spec.md')
    .map((file) => splitFrontmatter(readFileSafe(file)))
    .filter((parsed) => !parsed.parseError && parsed.data?.screen_id === selectedScreen);
  if (matches.length !== 1) return null;
  const domain = matches[0].data.domain;
  return typeof domain === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(domain) ? domain : null;
}

function patternStaticRoot(raw) {
  const fixed = [];
  for (const segment of String(raw).replace(/\\/g, '/').split('/')) {
    if (/[{}*?\[\]]/.test(segment)) break;
    fixed.push(segment);
  }
  const root = fixed.join('/');
  // A leading wildcard or unresolved template can touch any docs tree. It must
  // never disappear from the deny-only boundary inventory as an empty string.
  if (!root) {
    throw new VisualRefreshResourceError(`implementation pattern has no confined static root after domain resolution: ${raw}`);
  }
  return canonicalSnapshotPath(root, 'implementation role/layer root');
}

function implementationRoots(layout, selectedDomain, authorityRoot) {
  const domains = new Set([selectedDomain, ...Object.keys(layout.domains || {})].filter(Boolean));
  if (!domains.size) domains.add(null);
  const roots = new Set();
  for (const domain of domains) {
    const roles = layout.rolesFor(domain);
    const patterns = [];
    for (const role of Object.keys(roles)) {
      patterns.push(...layout.resolvePaths([`{roles.${role}}`], { domain }));
    }
    for (const layer of layout.layersFor(domain)) {
      patterns.push(...layout.resolvePaths(values(layer.glob), { domain }));
    }
    for (const pattern of patterns) {
      roots.add(canonicalPhysicalRelative(authorityRoot, patternStaticRoot(pattern), {
        label: 'implementation role/layer root',
      }));
    }
  }
  return [...roots].sort();
}

function assertSeparation(options, roots) {
  const docs = options.docs;
  const src = options.src;
  if (sameOrAncestor(docs, src) || sameOrAncestor(src, docs)) {
    throw new VisualRefreshResourceError(`visual-refresh authority에서 --docs와 --src는 겹칠 수 없음: docs=${docs}, src=${src}`);
  }
  const implementation = new Set([src, ...roots]);
  for (const root of implementation) {
    if (sameOrAncestor(docs, root) || sameOrAncestor(root, docs)) {
      throw new VisualRefreshResourceError(`visual-refresh authority docs overlay가 implementation role/layer root와 겹침: docs=${docs}, implementation=${root}`);
    }
  }
  for (const key of ['policy', 'manifest', 'layout', 'ci']) {
    const resource = options[key];
    if (!resource) continue;
    for (const root of implementation) {
      if (sameOrAncestor(root, resource) || sameOrAncestor(resource, root)) {
        throw new VisualRefreshResourceError(`--${key} authority resource는 implementation role/layer root와 분리돼야 함: resource=${resource}, implementation=${root}`);
      }
    }
  }
}

export function normalizeVisualAuthorityTuple(tuple, { authorityRoot, sourceRoot }) {
  const options = {
    docs: canonicalPhysicalRelative(authorityRoot, tuple.options.docs || DEFAULTS.docs, {
      label: '--docs', type: 'directory',
    }),
    src: canonicalPhysicalRelative(authorityRoot, tuple.options.src || DEFAULTS.src, {
      label: '--src', type: 'directory',
    }),
  };
  for (const key of ['policy', 'manifest', 'layout', 'ci']) {
    if (tuple.options[key]) {
      options[key] = canonicalPhysicalRelative(authorityRoot, tuple.options[key], {
        label: `--${key}`, type: 'file', required: true,
      });
    }
  }

  // Pin a bundled layout/preset before following it, even for boundary-only reads.
  const layoutRaw = options.layout
    ? readFileSafe(path.join(authorityRoot, options.layout))
    : readPinnedBundledResource('layout').raw;
  let layoutValue;
  try { layoutValue = yamlParse(layoutRaw); }
  catch (error) { throw new VisualRefreshResourceError(`layout YAML 파싱 실패: ${error.message}`); }
  if (!layoutValue || typeof layoutValue !== 'object' || Array.isArray(layoutValue)) {
    throw new VisualRefreshResourceError('layout YAML top-level은 mapping이어야 함');
  }
  if (layoutValue.preset != null) {
    if (layoutValue.preset !== 'expo-feature') {
      throw new VisualRefreshResourceError(`layout preset '${layoutValue.preset}'은 pinned bundled resource가 아님`);
    }
    readPinnedBundledResource('preset');
  }
  const layout = loadLayoutProfile({
    kitRoot: KIT_ROOT,
    flags: options.layout ? { layout: path.join(authorityRoot, options.layout) } : {},
  });
  const domain = selectedSourceDomain(sourceRoot, options.docs, tuple.screen);
  assertSeparation(options, implementationRoots(layout, domain, authorityRoot));
  return { ...tuple, options };
}
