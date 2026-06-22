// doctor.mjs (lib) — warning-only preflight checks for layout/profile adoption.
import path from 'node:path';
import { isDir, walkFiles } from './util.mjs';
import { globRoot, globToRegExp } from './glob.mjs';

function toPosix(p) {
  return String(p).split(path.sep).join('/').replace(/\\/g, '/');
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function countMatchingFiles(glob, { projectRoot }) {
  const normalized = toPosix(glob);
  const rootRel = globRoot(normalized);
  const rootAbs = rootRel ? path.join(projectRoot, ...rootRel.split('/')) : projectRoot;
  if (!isDir(rootAbs)) return { count: 0, root: rootRel || '.' };
  const matcher = globToRegExp(normalized);
  let count = 0;
  for (const file of walkFiles(rootAbs)) {
    const rel = toPosix(path.relative(projectRoot, file));
    if (matcher.test(rel)) count += 1;
  }
  return { count, root: rootRel || '.' };
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
  const supportedFacts = new Set(['dir_has_files']);
  for (const layer of layers) {
    if (!layer || typeof layer.role !== 'string') continue;
    if (!knownRoles.has(layer.role)) {
      findings.push({
        severity: 'warning',
        check: 'layer-role',
        role: layer.role,
        message: `layer '${layer.role}' has no matching roles.${layer.role} binding`,
      });
    }
    if (layer.fact && !supportedFacts.has(layer.fact)) {
      findings.push({
        severity: 'warning',
        check: 'layer-fact',
        role: layer.role,
        fact: layer.fact,
        message: `layer '${layer.role}' uses unsupported fact '${layer.fact}' (supported: dir_has_files)`,
      });
    }
  }

  return findings.sort((a, b) => `${a.check}:${a.role || ''}:${a.glob || ''}`.localeCompare(`${b.check}:${b.role || ''}:${b.glob || ''}`));
}
