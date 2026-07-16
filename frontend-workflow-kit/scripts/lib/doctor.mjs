// doctor.mjs (lib) — warning-only preflight checks for layout/profile adoption.
import path from 'node:path';
import { isDir, walkFiles, exists, findFiles, readFileSafe } from './util.mjs';
import { globRoot, globToRegExp } from './glob.mjs';
import { BUILT_IN_LAYER_ROLES } from './layer-inventory.mjs';
import { buildPolicyDraft } from './policy-draft.mjs';
import { loadScreenSpec, screenIdCandidateOf } from './spec.mjs';
import { parseRouteTreeRouteTokens } from './route-core.mjs';
import { CONTRACT_KINDS, parseManifestEndpoints } from './api-manifest.mjs';
import { collectScreenSourceMapFindings } from './screen-source-map.mjs';

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


function relPosix(fromDir, absPath) {
  const rel = path.relative(fromDir, absPath);
  return toPosix(rel || '.');
}

function resolveProjectPath(projectRoot, value) {
  if (!value) return null;
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(projectRoot, value);
}

function collectRouteScreenMappingFindings({ docsDir, projectRoot }) {
  const findings = [];
  if (!docsDir || !isDir(docsDir)) return findings;
  const specPaths = findFiles(path.join(docsDir, 'domains'), 'screen-spec.md');
  const routeToSpecs = new Map();
  let explicitMappingHints = 0;
  for (const specPath of specPaths) {
    const spec = loadScreenSpec(specPath);
    const fm = spec.frontmatter || {};
    const screenId = screenIdCandidateOf(spec);
    const route = typeof fm.route === 'string' && fm.route ? fm.route : null;
    if (route) {
      const list = routeToSpecs.get(route) || [];
      list.push(relPosix(docsDir, specPath));
      routeToSpecs.set(route, list);
    }
    for (const key of ['route_entry', 'screen_entry']) {
      const value = typeof fm[key] === 'string' && fm[key] ? fm[key] : null;
      if (!value) continue;
      explicitMappingHints++;
      const abs = resolveProjectPath(projectRoot, value);
      if (!abs || !exists(abs)) {
        findings.push({
          severity: 'warning',
          check: 'route-screen-mapping-entry-missing',
          screen_id: screenId,
          field: key,
          path: toPosix(value),
          message: `ScreenSpec ${screenId} declares ${key}=${toPosix(value)} but the file was not found (warning-first mapping gap)`,
        });
      }
    }
  }

  const routeTreeFile = path.join(docsDir, '_meta', 'route-tree.txt');
  if (exists(routeTreeFile)) {
    const routeTreeRoutes = parseRouteTreeRouteTokens(readFileSafe(routeTreeFile));
    for (const route of [...routeTreeRoutes].sort()) {
      if (!routeToSpecs.has(route)) {
        findings.push({
          severity: 'warning',
          check: 'route-screen-mapping-gap',
          route,
          message: `route-tree route ${route} has no ScreenSpec route mapping (warning-first; add a ScreenSpec route and optional route_entry/screen_entry, do not reshape paths)`,
        });
      }
    }
  }

  if (explicitMappingHints > 0) {
    findings.push({
      severity: 'info',
      check: 'route-screen-mapping-supported',
      count: explicitMappingHints,
      message: `${explicitMappingHints} explicit route_entry/screen_entry mapping hint(s) observed; route and screen implementation paths may be independent`,
    });
  }
  return findings;
}

function collectApiContractFindings({ docsDir }) {
  const findings = [];
  if (!docsDir || !isDir(docsDir)) return findings;
  const manifestFiles = findFiles(docsDir, 'api-manifest.md');
  const counts = new Map();
  for (const file of manifestFiles) {
    const raw = readFileSafe(file);
    if (raw == null) continue;
    for (const endpoint of parseManifestEndpoints(raw)) {
      if (endpoint.confidence !== 'confirmed') continue;
      if (endpoint.contractKindOmitted) {
        findings.push({
          severity: 'warning',
          check: 'api-contract-kind-omitted',
          file: relPosix(docsDir, file),
          endpoint: endpoint.key,
          message: `confirmed endpoint ${endpoint.key} has Linked Contract but no Contract Kind (supported: ${CONTRACT_KINDS.join('|')})`,
        });
        continue;
      }
      const kind = endpoint.contractKind || '(none)';
      counts.set(kind, (counts.get(kind) || 0) + 1);
      if (kind !== '(none)' && !CONTRACT_KINDS.includes(kind)) {
        findings.push({
          severity: 'warning',
          check: 'api-contract-kind-unsupported',
          file: relPosix(docsDir, file),
          endpoint: endpoint.key,
          kind,
          message: `confirmed endpoint ${endpoint.key} uses unsupported Contract Kind='${kind}' (supported: ${CONTRACT_KINDS.join('|')})`,
        });
      }
    }
  }
  if (counts.size > 0) {
    const summary = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([kind, count]) => `${kind}=${count}`).join(', ');
    findings.push({
      severity: 'info',
      check: 'api-contract-kind-support',
      message: `api-manifest contract kinds observed: ${summary}; supported kinds: ${CONTRACT_KINDS.join('|')}`,
    });
  }
  return findings;
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

export function collectDoctorFindings({ layout, projectRoot, policy, docsDir } = {}) {
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

  if (policy && typeof policy === 'object') {
    try {
      const draft = buildPolicyDraft({ policy, layout, date: 'doctor' });
      const changed = draft.diff.changed_mode_access_rows.length;
      for (const decision of draft.manualDecisions || []) {
        if (String(decision.reason || '').includes('unknown policy mode')) {
          findings.push({
            severity: 'warning',
            check: 'policy-draft-manual',
            role: decision.role,
            mode: decision.mode,
            message: decision.reason,
          });
        }
      }
      findings.push({
        severity: 'info',
        check: changed ? 'policy-draft-diff' : 'policy-draft-ready',
        count: changed,
        message: changed
          ? `generated implementation-mode-policy draft would differ from live policy (${changed} mode access row(s)); draft only, live policy/CI/pre-edit hooks unchanged`
          : 'implementation-mode-policy draft can be generated from current layout; no live policy access diff',
      });
    } catch (err) {
      findings.push({
        severity: 'warning',
        check: 'policy-draft-generate',
        message: `implementation-mode-policy draft could not be generated: ${err.message || err}`,
      });
    }
  }

  findings.push(...collectRouteScreenMappingFindings({ docsDir, projectRoot }));
  findings.push(...collectApiContractFindings({ docsDir }));
  findings.push(...collectScreenSourceMapFindings({ docsDir }));

  return findings.sort((a, b) => `${a.check}:${a.role || ''}:${a.glob || ''}:${a.route || ''}:${a.file || ''}`.localeCompare(`${b.check}:${b.role || ''}:${b.glob || ''}:${b.route || ''}:${b.file || ''}`));
}
