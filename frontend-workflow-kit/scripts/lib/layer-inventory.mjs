// layer-inventory.mjs — Tier3 telemetry-only layer facts.
// This module observes declared layout layers. It does not change readiness,
// policy, forbidden paths, lint rules, or CI behavior.
import path from 'node:path';
import { walkFiles, projectRootOf } from './util.mjs';
import { globRoot, globToRegExp } from './glob.mjs';

export const SUPPORTED_LAYER_FACTS = ['dir_has_files'];
export const BUILT_IN_LAYER_ROLES = [
  'route_entry',
  'screen',
  'domain_component',
  'hook',
  'ui_primitive',
  'api_client',
  'api_schema',
];

const SOURCE_FACT_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

function toPosix(p) {
  return String(p || '').replace(/\\/g, '/');
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function substituteDomain(s, domain) {
  return domain == null || domain === '' ? s : String(s).split('{domain}').join(domain);
}

function isSameOrInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function safeRootAbs(projectRoot, rootRel) {
  const rootAbs = rootRel ? path.resolve(projectRoot, ...rootRel.split('/')) : projectRoot;
  return isSameOrInside(projectRoot, rootAbs) ? rootAbs : null;
}

function layerGlobValues(layer, { layout, domain } = {}) {
  if (layer && BUILT_IN_LAYER_ROLES.includes(layer.role) && layout?.roles && Object.prototype.hasOwnProperty.call(layout.roles, layer.role)) {
    return roleGlobValues(layout, layer.role, domain);
  }
  if (layer && layer.glob != null) {
    return asArray(layer.glob).map((g) => substituteDomain(toPosix(g), domain));
  }
  if (!layer || !layer.role || !layout) return [];
  try {
    if (typeof layout.resolvePaths === 'function') {
      return layout.resolvePaths([`{roles.${layer.role}}`], { domain }).map(toPosix);
    }
  } catch {
    return [];
  }
  if (typeof layout.roleGlobs === 'function') {
    return layout.roleGlobs(layer.role).map((g) => substituteDomain(toPosix(g), domain));
  }
  if (typeof layout.roleToDir === 'function') {
    const dir = layout.roleToDir(layer.role, { domain });
    return dir ? [`${toPosix(dir).replace(/\/+$/, '')}/**`] : [];
  }
  return [];
}

function roleGlobValues(layout, role, domain) {
  if (!layout || !role) return [];
  try {
    if (typeof layout.resolvePaths === 'function') {
      return layout.resolvePaths([`{roles.${role}}`], { domain }).map(toPosix);
    }
  } catch {
    return [];
  }
  if (typeof layout.roleGlobs === 'function') {
    return layout.roleGlobs(role).map((g) => substituteDomain(toPosix(g), domain));
  }
  if (layout.roles && Object.prototype.hasOwnProperty.call(layout.roles, role)) {
    return asArray(layout.roles[role]).map((g) => substituteDomain(toPosix(g), domain));
  }
  return [];
}

function globRoots(globs) {
  return globs
    .map((g) => globRoot(g).replace(/\/+$/, ''))
    .filter((root) => root !== '');
}

function rootsOverlap(a, b) {
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function nestedRoleMatchers(layout, role, domain, ownerGlobs) {
  const roles = layout?.roles && typeof layout.roles === 'object' ? Object.keys(layout.roles) : [];
  if (roles.length === 0) return [];
  const ownerRoots = globRoots(ownerGlobs);
  const out = [];
  for (const otherRole of roles) {
    if (otherRole === role) continue;
    for (const raw of roleGlobValues(layout, otherRole, domain)) {
      const glob = toPosix(raw);
      const root = globRoot(glob).replace(/\/+$/, '');
      if (ownerRoots.some((ownerRoot) => root && root !== ownerRoot && root.startsWith(`${ownerRoot}/`))) {
        out.push(globToRegExp(glob));
      }
    }
  }
  return out;
}

function matchingFilesForGlob(glob, { projectRoot, excludeMatchers = [], exts = SOURCE_FACT_EXTS } = {}) {
  const rootRel = globRoot(glob).replace(/\/+$/, '');
  const rootAbs = safeRootAbs(projectRoot, rootRel);
  if (!rootAbs) return { files: [], outOfScope: true };
  const matcher = globToRegExp(glob);
  const files = [];
  for (const file of walkFiles(rootAbs, exts)) {
    if (!isSameOrInside(projectRoot, file)) continue;
    const rel = toPosix(path.relative(projectRoot, file));
    if (matcher.test(rel) && !excludeMatchers.some((exclude) => exclude.test(rel))) files.push(rel);
  }
  return { files, outOfScope: false };
}

export function countLayerFiles(layer, { layout, projectRoot, domain, excludeNestedRoles = false } = {}) {
  const globs = layerGlobValues(layer, { layout, domain });
  const excludeMatchers = excludeNestedRoles ? nestedRoleMatchers(layout, layer.role, domain, globs) : [];
  const files = new Set();
  let outOfScope = false;
  for (const glob of globs) {
    const result = matchingFilesForGlob(glob, { projectRoot, excludeMatchers });
    outOfScope = outOfScope || result.outOfScope;
    for (const file of result.files) files.add(file);
  }
  return { count: files.size, outOfScope, globs };
}

export function layerHasFiles(layer, opts = {}) {
  return countLayerFiles(layer, opts).count > 0;
}

function layerDomains(layer, domains) {
  const rawGlobs = asArray(layer.glob);
  const needsDomain = rawGlobs.some((g) => String(g).includes('{domain}'));
  if (!needsDomain) return [null];
  return domains.length ? domains : [null];
}

function screenDomains(screens) {
  const values = Array.isArray(screens)
    ? screens.map((s) => s && s.domain)
    : Object.values(screens || {}).map((s) => s && s.domain);
  return [...new Set(values.filter((d) => d != null && d !== '').map(String))].sort();
}

function overlapInfo(layer, { layout, domain }) {
  if (!layout?.roles) return null;
  const layerRoots = globRoots(layerGlobValues(layer, { layout, domain }));
  if (!layerRoots.length) return null;
  for (const role of BUILT_IN_LAYER_ROLES) {
    if (role === layer.role || !Object.prototype.hasOwnProperty.call(layout.roles, role)) continue;
    const roleRoots = globRoots(roleGlobValues(layout, role, domain));
    if (layerRoots.some((a) => roleRoots.some((b) => rootsOverlap(a, b)))) {
      return { status: 'flattened_overlap', role };
    }
  }
  return null;
}

function accessModel(layer) {
  const access = layer?.access && typeof layer.access === 'object' ? layer.access : {};
  return {
    allow: asArray(access.allow).map(String),
    forbid: asArray(access.forbid).map(String),
  };
}

function cloneAccess(access) {
  return {
    allow: asArray(access?.allow).map(String),
    forbid: asArray(access?.forbid).map(String),
  };
}

export function resolveLayerModel({ layout } = {}) {
  const layers = Array.isArray(layout?.layers) ? layout.layers : [];
  return {
    layers: layers.map((layer) => ({
      role: layer.role,
      glob: layer.glob,
      fact: layer.fact,
      access: accessModel(layer),
      gate_wired: false,
    })),
  };
}

export function scanLayerInventory({ projectRoot, srcDir, layout, screens = [] } = {}) {
  const model = resolveLayerModel({ layout });
  if (model.layers.length === 0) return null;
  const root = projectRoot || projectRootOf(srcDir);
  const domains = screenDomains(screens);
  const rows = [];
  const facts = {};

  for (const layer of model.layers) {
    if (layer.fact !== 'dir_has_files') continue;
    const domainsForLayer = layerDomains(layer, domains);
    let anyPresent = false;
    for (const domain of domainsForLayer) {
      const { count, outOfScope, globs } = countLayerFiles(layer, {
        layout,
        projectRoot: root,
        domain,
        excludeNestedRoles: true,
      });
      anyPresent = anyPresent || count > 0;
      for (const resolvedGlob of globs.length ? globs : [null]) {
        const overlap = overlapInfo({ ...layer, glob: resolvedGlob || layer.glob }, { layout, domain });
        rows.push({
          role: layer.role,
          glob: Array.isArray(layer.glob) ? layer.glob.slice() : layer.glob,
          domain,
          resolved_glob: resolvedGlob,
          fact: layer.fact,
          status: outOfScope ? 'out_of_scope' : count > 0 ? 'present' : 'missing',
          file_count: count,
          gate_wired: false,
          access: cloneAccess(layer.access),
          ...(overlap ? { overlap: overlap.status, overlap_role: overlap.role } : {}),
        });
      }
    }
    facts[`${layer.role}_present`] = anyPresent;
  }

  rows.sort((a, b) =>
    [
      String(a.role || ''),
      String(a.domain || ''),
      String(a.resolved_glob || ''),
    ].join('\0').localeCompare(
      [String(b.role || ''), String(b.domain || ''), String(b.resolved_glob || '')].join('\0'),
    ),
  );
  return { layers: rows, facts: Object.fromEntries(Object.entries(facts).sort(([a], [b]) => a.localeCompare(b))) };
}
