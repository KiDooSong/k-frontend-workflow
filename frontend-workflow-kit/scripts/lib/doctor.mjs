// doctor.mjs (lib) — warning-only preflight checks for layout/profile adoption.
import path from 'node:path';
import { isDir, walkFiles } from './util.mjs';
import { globRoot, globToRegExp } from './glob.mjs';
import { BUILT_IN_LAYER_ROLES } from './layer-inventory.mjs';

function toPosix(p) {
  return String(p).split(path.sep).join('/').replace(/\\/g, '/');
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function isSameOrInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function countMatchingFiles(glob, { projectRoot }) {
  const normalized = toPosix(glob);
  const rootRel = globRoot(normalized);
  const rootAbs = rootRel ? path.resolve(projectRoot, ...rootRel.split('/')) : projectRoot;
  if (!isSameOrInside(projectRoot, rootAbs)) return { count: 0, root: rootRel || '.', outOfScope: true };
  if (!isDir(rootAbs)) return { count: 0, root: rootRel || '.' };
  const matcher = globToRegExp(normalized);
  let count = 0;
  for (const file of walkFiles(rootAbs)) {
    const rel = toPosix(path.relative(projectRoot, file));
    if (matcher.test(rel)) count += 1;
  }
  return { count, root: rootRel || '.' };
}

function rootsOverlap(a, b) {
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function globRootForOverlap(glob) {
  return globRoot(toPosix(glob).replace(/\{[^/{}]+\}/g, '__placeholder__')).replace(/\/+$/, '');
}

function globRoots(value, { preservePlaceholders = false } = {}) {
  return asArray(value)
    .map((glob) =>
      preservePlaceholders ? globRootForOverlap(glob) : globRoot(toPosix(glob)).replace(/\/+$/, ''),
    )
    .filter(Boolean);
}

function accessDeclared(access) {
  if (!access || typeof access !== 'object') return false;
  return asArray(access.allow).length > 0 || asArray(access.forbid).length > 0;
}

function layerGlobValues(layer, roles) {
  if (layer && BUILT_IN_LAYER_ROLES.includes(layer.role) && Object.prototype.hasOwnProperty.call(roles, layer.role)) {
    return asArray(roles[layer.role]);
  }
  return asArray(layer?.glob);
}

export function collectDoctorFindings({ layout, projectRoot }) {
  const findings = [];
  const roles = layout?.roles && typeof layout.roles === 'object' ? layout.roles : {};
  const layers = Array.isArray(layout?.layers) ? layout.layers : [];

  for (const role of Object.keys(roles).sort()) {
    for (const glob of asArray(roles[role])) {
      const { count, root } = countMatchingFiles(glob, { projectRoot });
      if (count === 0) {
        findings.push({
          severity: 'warning',
          check: 'role-glob',
          role,
          glob: toPosix(glob),
          count,
          message: `role '${role}' glob matched 0 files: ${toPosix(glob)} (root: ${root})`,
        });
      }
    }
  }

  const apiSchemaGlobs = asArray(roles.api_schema).filter(Boolean);
  if (apiSchemaGlobs.length > 1) {
    findings.push({
      severity: 'warning',
      check: 'codegen-api-schema-multiglob',
      role: 'api_schema',
      count: apiSchemaGlobs.length,
      message: `codegen-openapi-client currently supports a single api_schema glob; found ${apiSchemaGlobs.length}`,
    });
  }

  const knownRoles = new Set(Object.keys(roles));
  for (const layer of layers) {
    if (!layer || typeof layer.role !== 'string') continue;
    if (!knownRoles.has(layer.role) && !layer.glob) {
      findings.push({
        severity: 'warning',
        check: 'layer-role',
        role: layer.role,
        message: `layer '${layer.role}' has no matching roles.${layer.role} binding and no layer glob`,
      });
    }
    const layerGlobs = layerGlobValues(layer, roles);
    if (layerGlobs.length) {
      for (const glob of layerGlobs) {
        const { count, root } = countMatchingFiles(glob, { projectRoot });
        if (count === 0) {
          findings.push({
            severity: 'warning',
            check: 'layer-glob',
            role: layer.role,
            glob: toPosix(glob),
            count,
            message: `layer '${layer.role}' glob matched 0 files: ${toPosix(glob)} (root: ${root})`,
          });
        }
      }
    }
    if (!BUILT_IN_LAYER_ROLES.includes(layer.role)) {
      const layerRoots = globRoots(layer.glob, { preservePlaceholders: true });
      for (const role of BUILT_IN_LAYER_ROLES) {
        if (role === layer.role || !roles[role]) continue;
        const roleRoots = globRoots(roles[role], { preservePlaceholders: true });
        if (layerRoots.some((a) => roleRoots.some((b) => rootsOverlap(a, b)))) {
          findings.push({
            severity: 'warning',
            check: 'layer-overlap',
            role: layer.role,
            overlap_role: role,
            message: `layer '${layer.role}' overlaps built-in role '${role}' (observed as flattened/overlap, not a hard failure)`,
          });
          break;
        }
      }
    }
    if (accessDeclared(layer.access)) {
      if (layerGlobs.length === 0) {
        findings.push({
          severity: 'warning',
          check: 'layer-access-unmaterializable',
          role: layer.role,
          message: `layer '${layer.role}' declares access but cannot materialize paths; add roles.${layer.role} or layer.glob`,
        });
      } else {
        findings.push({
          severity: 'info',
          check: 'layer-access-readiness-wired',
          role: layer.role,
          message: `layer '${layer.role}' access materializes to readiness policy paths; hard gates/CI are not promoted`,
        });
      }
    }
  }

  return findings.sort((a, b) => `${a.check}:${a.role || ''}:${a.glob || ''}`.localeCompare(`${b.check}:${b.role || ''}:${b.glob || ''}`));
}
