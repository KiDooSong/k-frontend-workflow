// policy-draft.mjs - generate a review-only implementation-mode-policy draft
// from resolved Tier3 layer access metadata. This module writes only explicit
// draft outputs; it never promotes or mutates the live policy.
import path from 'node:path';
import {
  DEFAULTS,
  KIT_ROOT,
  emitGeneratedYaml,
  loadYamlOrExit,
  writeFile,
} from './util.mjs';
import { LayoutConfigError, loadLayoutProfile } from './layout-profile.mjs';
import { BUILT_IN_LAYER_ROLES } from './layer-inventory.mjs';

export const DRAFT_POLICY_FILENAME = 'implementation-mode-policy.draft.yaml';
export const MIGRATION_GUIDE_FILENAME = 'implementation-mode-policy.migration.md';

function toPosix(p) {
  return String(p || '').split(path.sep).join('/').replace(/\\/g, '/');
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function roleToken(role) {
  return `{roles.${role}}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function uniquePush(arr, value) {
  if (!arr.includes(value)) arr.push(value);
}

function addUnique(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  uniquePush(map.get(key), value);
}

function accessModel(layer) {
  const access = layer?.access && typeof layer.access === 'object' ? layer.access : {};
  return {
    allow: asArray(access.allow).map(String),
    forbid: asArray(access.forbid).map(String),
  };
}

function rolesForPolicy(layout, domain) {
  if (typeof layout?.rolesFor === 'function') return layout.rolesFor(domain);
  return layout?.roles && typeof layout.roles === 'object' ? layout.roles : {};
}

function domainNamesForPolicy(layout) {
  if (Array.isArray(layout?.domainNames)) return layout.domainNames.map(String).filter(Boolean);
  if (Array.isArray(layout?.domains)) return layout.domains.map(String).filter(Boolean);
  if (layout?.domains && typeof layout.domains === 'object') return Object.keys(layout.domains);
  return [];
}

function layerGlobEntries(layer) {
  return asArray(layer?.glob).map(toPosix).filter(Boolean);
}

const WHOLE_ROLE_TOKEN_RE = /^\{roles\.([A-Za-z0-9_]+)\}$/;

function substituteDomain(value, domain) {
  if (domain == null || domain === '') return value;
  return String(value).split('{domain}').join(domain);
}

function roleGlobEntries(roles, role) {
  return asArray(roles?.[role]).map(toPosix).filter(Boolean);
}

function materializeEntriesForDomain(entries, roles, domain) {
  if (domain == null || domain === '') return entries;
  return entries.flatMap((entry) => {
    const match = WHOLE_ROLE_TOKEN_RE.exec(entry);
    if (match) return roleGlobEntries(roles, match[1]).map((glob) => substituteDomain(glob, domain));
    return [substituteDomain(entry, domain)];
  }).filter(Boolean);
}

function layerPolicyPathEntries(layer, roles) {
  if (!layer || typeof layer.role !== 'string') return { entries: [], source: 'unmaterialized' };
  const roleIsBound = hasOwn(roles, layer.role);
  if (roleIsBound && BUILT_IN_LAYER_ROLES.includes(layer.role)) {
    return { entries: [roleToken(layer.role)], source: 'built-in role token' };
  }
  const explicitGlobs = layerGlobEntries(layer);
  if (explicitGlobs.length) return { entries: explicitGlobs, source: 'layer glob' };
  if (roleIsBound) return { entries: [roleToken(layer.role)], source: 'custom role token' };
  return { entries: [], source: 'unmaterialized' };
}

function layerRemovableEntries(layer, roles) {
  const owned = new Set();
  if (layer && typeof layer.role === 'string' && hasOwn(roles, layer.role)) {
    owned.add(roleToken(layer.role));
  }
  return [...owned].filter(Boolean);
}

function isLayerGeneratedPathCandidate(entry) {
  const value = String(entry);
  return WHOLE_ROLE_TOKEN_RE.test(value) || value.includes('{domain}');
}

function layerIdentityKey(layer) {
  const access = accessModel(layer);
  return JSON.stringify([
    layer?.role || null,
    layerGlobEntries(layer),
    layer?.fact || null,
    access.allow,
    access.forbid,
  ]);
}

function layerContextsForPolicy(layout) {
  const contexts = [];
  const addLayer = (layer, roles, domain = null) => {
    if (!layer || typeof layer.role !== 'string') return;
    contexts.push({ layer, roles, domain });
  };

  if (typeof layout?.layersFor === 'function') {
    const baseLayers = asArray(layout.layersFor());
    const baseLayerByRole = new Map(baseLayers.filter((layer) => layer?.role).map((layer) => [layer.role, layer]));
    const domains = domainNamesForPolicy(layout);
    const layersByDomain = new Map(domains.map((domain) => [domain, asArray(layout.layersFor(domain))]));
    const replacedBaseRoles = new Set();
    for (const layers of layersByDomain.values()) {
      for (const layer of layers) {
        const baseLayer = baseLayerByRole.get(layer?.role);
        if (baseLayer && layerIdentityKey(baseLayer) !== layerIdentityKey(layer)) {
          replacedBaseRoles.add(layer.role);
        }
      }
    }
    for (const layer of baseLayers) {
      if (!replacedBaseRoles.has(layer.role)) addLayer(layer, rolesForPolicy(layout));
    }
    for (const domain of domains) {
      for (const layer of layersByDomain.get(domain) || []) {
        const baseLayer = baseLayerByRole.get(layer?.role);
        const matchesBase = baseLayer && layerIdentityKey(baseLayer) === layerIdentityKey(layer);
        if (matchesBase && !replacedBaseRoles.has(layer.role)) continue;
        addLayer(layer, rolesForPolicy(layout, domain), domain);
      }
    }
    return contexts;
  }

  for (const layer of Array.isArray(layout?.layers) ? layout.layers : []) addLayer(layer, rolesForPolicy(layout));
  return contexts;
}

function knownModeNames(policy) {
  const modes = policy?.modes && typeof policy.modes === 'object' ? policy.modes : {};
  const order = Array.isArray(policy?.order) ? policy.order : [];
  return new Set([...order, ...Object.keys(modes)]);
}

function orderedModeNames(policy) {
  const modes = policy?.modes && typeof policy.modes === 'object' ? policy.modes : {};
  const order = Array.isArray(policy?.order) && policy.order.length ? policy.order : Object.keys(modes);
  const names = [];
  for (const name of order) uniquePush(names, name);
  for (const name of Object.keys(modes)) uniquePush(names, name);
  return names;
}

function collectLayerProjection(policy, layout) {
  const layerContexts = layerContextsForPolicy(layout);
  const knownModes = knownModeNames(policy);
  const allowByMode = new Map();
  const forbidByMode = new Map();
  const removableEntries = new Set();
  const generatedColumns = new Set();
  const layerRows = [];
  const manualDecisions = [];

  for (const { layer, roles, domain } of layerContexts) {
    if (!layer || typeof layer.role !== 'string') continue;
    const access = accessModel(layer);
    const { entries: rawEntries, source } = layerPolicyPathEntries(layer, roles);
    const entries = materializeEntriesForDomain(rawEntries, roles, domain);
    for (const entry of layerRemovableEntries(layer, roles)) removableEntries.add(entry);

    const accessDeclared = access.allow.length > 0 || access.forbid.length > 0;
    if (accessDeclared && entries.length === 0) {
      manualDecisions.push({
        role: layer.role,
        reason: `layer '${layer.role}' declares access but has no materializable role binding or explicit glob`,
      });
    }

    for (const kind of ['allow', 'forbid']) {
      const target = kind === 'allow' ? allowByMode : forbidByMode;
      for (const mode of access[kind]) {
        if (!knownModes.has(mode)) {
          manualDecisions.push({
            role: layer.role,
            mode,
            reason: `layer '${layer.role}' references unknown policy mode '${mode}'`,
          });
          continue;
        }
        for (const entry of entries) {
          addUnique(target, mode, entry);
          generatedColumns.add(`${mode}:${kind === 'allow' ? 'allowed_paths' : 'forbidden_paths'}`);
        }
      }
    }

    for (const entry of entries) {
      layerRows.push({
        role: layer.role,
        path: entry,
        source,
        allow: access.allow,
        forbid: access.forbid,
        custom: !BUILT_IN_LAYER_ROLES.includes(layer.role),
      });
    }
  }

  return { allowByMode, forbidByMode, removableEntries, generatedColumns, layerRows, manualDecisions };
}

function mergeDraftPathList(existing, synthesized, removableEntries, canReplaceGenerated = false) {
  const synth = (synthesized || []).map(toPosix);
  const remaining = new Set(synth);
  const out = [];
  const seen = new Set();

  for (const raw of existing || []) {
    const entry = toPosix(raw);
    if (removableEntries.has(entry) || (canReplaceGenerated && isLayerGeneratedPathCandidate(entry))) {
      if (remaining.has(entry) && !seen.has(entry)) {
        out.push(entry);
        seen.add(entry);
      }
      remaining.delete(entry);
      continue;
    }
    if (!seen.has(entry)) {
      out.push(entry);
      seen.add(entry);
    }
  }

  for (const entry of synth) {
    if (!remaining.has(entry) || seen.has(entry)) continue;
    out.push(entry);
    seen.add(entry);
    remaining.delete(entry);
  }
  return out;
}

function cloneRequires(mode) {
  return Array.isArray(mode?.requires) ? mode.requires.slice() : [];
}

function buildDraftPolicy(policy, projection) {
  const modes = policy?.modes && typeof policy.modes === 'object' ? policy.modes : {};
  const outModes = {};
  for (const name of orderedModeNames(policy)) {
    const mode = modes[name] || {};
    outModes[name] = {
      ...mode,
      requires: cloneRequires(mode),
      allowed_paths: mergeDraftPathList(
        mode.allowed_paths || [],
        projection.allowByMode.get(name) || [],
        projection.removableEntries,
        projection.generatedColumns.has(`${name}:allowed_paths`),
      ),
      forbidden_paths: mergeDraftPathList(
        mode.forbidden_paths || [],
        projection.forbidByMode.get(name) || [],
        projection.removableEntries,
        projection.generatedColumns.has(`${name}:forbidden_paths`),
      ),
    };
  }
  return {
    ...policy,
    order: Array.isArray(policy?.order) ? policy.order.slice() : orderedModeNames(policy),
    modes: outModes,
  };
}

function listDiff(before, after) {
  const a = new Set((after || []).map(toPosix));
  const b = new Set((before || []).map(toPosix));
  return {
    added: [...a].filter((entry) => !b.has(entry)),
    removed: [...b].filter((entry) => !a.has(entry)),
  };
}

function sameList(a, b) {
  const left = (a || []).map(toPosix);
  const right = (b || []).map(toPosix);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function diffPolicies(livePolicy = {}, draftPolicy = {}) {
  const liveModes = livePolicy.modes && typeof livePolicy.modes === 'object' ? livePolicy.modes : {};
  const draftModes = draftPolicy.modes && typeof draftPolicy.modes === 'object' ? draftPolicy.modes : {};
  const names = [];
  for (const name of orderedModeNames(livePolicy)) uniquePush(names, name);
  for (const name of orderedModeNames(draftPolicy)) uniquePush(names, name);

  const changedModeAccessRows = [];
  for (const mode of names) {
    for (const column of ['allowed_paths', 'forbidden_paths']) {
      const live = liveModes[mode]?.[column] || [];
      const draft = draftModes[mode]?.[column] || [];
      if (sameList(live, draft)) continue;
      changedModeAccessRows.push({ mode, column, live, draft, ...listDiff(live, draft) });
    }
  }

  const addedPaths = [];
  const removedPaths = [];
  for (const row of changedModeAccessRows) {
    for (const pathEntry of row.added) addedPaths.push({ mode: row.mode, column: row.column, path: pathEntry });
    for (const pathEntry of row.removed) removedPaths.push({ mode: row.mode, column: row.column, path: pathEntry });
  }

  return {
    differs: changedModeAccessRows.length > 0,
    changed_mode_access_rows: changedModeAccessRows,
    added_paths: addedPaths,
    removed_paths: removedPaths,
  };
}

export function buildPolicyDraft({ policy = {}, layout = {}, date = todayISO() } = {}) {
  const projection = collectLayerProjection(policy, layout);
  const draftPolicy = buildDraftPolicy(policy, projection);
  const diff = diffPolicies(policy, draftPolicy);
  return {
    date,
    draftPolicy,
    diff,
    layerRows: projection.layerRows,
    manualDecisions: projection.manualDecisions,
  };
}

function backtick(value) {
  return `\`${String(value).replace(/\|/g, '\\|')}\``;
}

function listCell(values) {
  return values && values.length ? values.map(backtick).join('<br>') : '-';
}

function changeRows(diff) {
  const rows = diff.changed_mode_access_rows || [];
  if (!rows.length) return '| none | none | - | - |';
  return rows
    .map((row) => `| ${row.mode} | ${row.column} | ${listCell(row.added)} | ${listCell(row.removed)} |`)
    .join('\n');
}

function pathRows(rows) {
  if (!rows.length) return '| none | none | none |';
  return rows.map((row) => `| ${row.mode} | ${row.column} | ${backtick(row.path)} |`).join('\n');
}

function customLayerRows(rows) {
  const custom = rows.filter((row) => row.custom);
  if (!custom.length) return '| none | none | - | - | - |';
  return custom
    .map(
      (row) =>
        `| ${row.role} | ${backtick(row.path)} | ${row.source} | ${listCell(row.allow)} | ${listCell(row.forbid)} |`,
    )
    .join('\n');
}

function manualRows(rows) {
  if (!rows.length) return '| none | - | - |';
  return rows
    .map((row) => `| ${row.role || '-'} | ${row.mode || '-'} | ${String(row.reason).replace(/\|/g, '\\|')} |`)
    .join('\n');
}

function pathLabel(cwd, target) {
  if (!target) return '(default)';
  const rel = path.relative(cwd || process.cwd(), target);
  return toPosix(rel || '.');
}

export function renderMigrationGuide({
  date = todayISO(),
  livePolicyPath,
  layoutPath,
  draftPath,
  diff,
  layerRows,
  manualDecisions,
  cwd = process.cwd(),
} = {}) {
  return `# implementation-mode-policy Migration Guide

Generated: ${date}

Live policy source: \`${pathLabel(cwd, livePolicyPath)}\`
Tier3 layout source: \`${pathLabel(cwd, layoutPath)}\`
Generated draft: \`${pathLabel(cwd, draftPath)}\`

## Status

- Draft only.
- The live \`policies/implementation-mode-policy.yaml\` file is not replaced.
- CI hard gates are not promoted.
- Pre-edit hooks are not enforced.
- Human review is required before replacing or updating the live policy.

## Summary

- Changed mode access rows: ${diff.changed_mode_access_rows.length}
- Added path entries: ${diff.added_paths.length}
- Removed path entries: ${diff.removed_paths.length}
- Custom layer-derived entries: ${layerRows.filter((row) => row.custom).length}
- Manual decisions: ${manualDecisions.length}

## Changed Mode Access Rows

| Mode | Column | Added | Removed |
|---|---|---|---|
${changeRows(diff)}

## Added Paths

| Mode | Column | Path |
|---|---|---|
${pathRows(diff.added_paths)}

## Removed Paths

| Mode | Column | Path |
|---|---|---|
${pathRows(diff.removed_paths)}

## Custom Layer-Derived Rows

| Layer role | Path | Source | Allow modes | Forbid modes |
|---|---|---|---|---|
${customLayerRows(layerRows)}

## Unresolved / Manual Decisions

| Layer role | Mode | Decision |
|---|---|---|
${manualRows(manualDecisions)}

## Recommended Adoption Steps

1. Inspect the generated draft.
2. Compare this diff summary against the current live policy.
3. Decide whether to replace or update \`policies/implementation-mode-policy.yaml\`.
4. Run readiness, validate, and the relevant test suite.
5. Only then consider a separate CI or pre-edit hard gate PR.
`;
}

export function draftPolicyText(draftPolicy, { date = todayISO() } = {}) {
  return emitGeneratedYaml(
    [
      'implementation-mode-policy.draft.yaml - GENERATED REVIEW DRAFT',
      `Generated by workflow:policy-draft on ${date}.`,
      'Draft only: not live wired, not CI promoted, not pre-edit enforced.',
      'Human review is required before replacing policies/implementation-mode-policy.yaml.',
    ],
    draftPolicy,
  );
}

export function writePolicyDraftArtifacts({
  kitRoot = KIT_ROOT,
  layoutPath,
  policyPath,
  outDir,
  date = todayISO(),
  cwd = process.cwd(),
} = {}) {
  if (!outDir || typeof outDir !== 'string') {
    throw new Error('policy-draft: --out requires a value');
  }
  const resolvedPolicyPath = path.resolve(policyPath || DEFAULTS.policy);
  const resolvedLayoutPath = layoutPath
    ? path.resolve(layoutPath)
    : path.join(path.resolve(kitRoot), 'policies', 'project-layout.yaml');
  const policy = loadYamlOrExit(resolvedPolicyPath, 'policy', 'policy-draft');
  if (!policy) throw new LayoutConfigError(`policy-draft: policy file missing: ${resolvedPolicyPath}`);
  const layout = loadLayoutProfile({
    kitRoot,
    flags: layoutPath ? { layout: resolvedLayoutPath } : {},
  });
  const result = buildPolicyDraft({ policy, layout, date });
  const outputDir = path.resolve(outDir);
  const draftPath = path.join(outputDir, DRAFT_POLICY_FILENAME);
  const migrationPath = path.join(outputDir, MIGRATION_GUIDE_FILENAME);
  writeFile(draftPath, draftPolicyText(result.draftPolicy, { date }));
  writeFile(
    migrationPath,
    renderMigrationGuide({
      date,
      livePolicyPath: resolvedPolicyPath,
      layoutPath: resolvedLayoutPath,
      draftPath,
      diff: result.diff,
      layerRows: result.layerRows,
      manualDecisions: result.manualDecisions,
      cwd,
    }),
  );
  return {
    ...result,
    paths: {
      draft: draftPath,
      migration: migrationPath,
    },
  };
}

export function formatPolicyDraftResult(result, { cwd = process.cwd() } = {}) {
  return [
    'workflow:policy-draft - review draft generated',
    `  draft   : ${pathLabel(cwd, result.paths.draft)}`,
    `  guide   : ${pathLabel(cwd, result.paths.migration)}`,
    `  changed : ${result.diff.changed_mode_access_rows.length} mode access row(s)`,
    '  invariant: draft-only; live policy/CI/pre-edit hooks untouched',
  ].join('\n') + '\n';
}
