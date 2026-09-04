import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import {
  DEFAULTS,
  KIT_ROOT,
  readFileSafe,
  yamlParse,
  yamlStringify,
} from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { concretePathIssue } from './path-backstop.mjs';

export const PINNED_VISUAL_REFRESH_PACKAGE_VERSION = '0.3.0-mvp.2';

// Git blob identities from the reviewed Issue #222 implementation baseline. Omitted
// authority resources are trusted only after their bytes reproduce these identities.
// A dirty or shadowed kit file therefore cannot become positive authority merely by
// being the file that happens to execute the CLI.
export const PINNED_VISUAL_REFRESH_RESOURCES = Object.freeze({
  policy: Object.freeze({
    relative: 'policies/implementation-mode-policy.yaml',
    git_blob_sha: '73442ad84079684fa069f0dafd9eef23559789a7',
  }),
  manifest: Object.freeze({
    relative: 'catalog/artifact-manifest.yaml',
    git_blob_sha: '176bf11652d18fa7e3ad2d0612df21dec39da2ff',
  }),
  layout: Object.freeze({
    relative: 'policies/project-layout.yaml',
    git_blob_sha: '72700a7e3504bf2c2eb577dd3d9e7484b4c8d75b',
  }),
  preset: Object.freeze({
    relative: 'presets/expo-feature.yaml',
    git_blob_sha: '8fd89d139a673b1862145e41199537f559bbf953',
  }),
});

export class VisualRefreshResourceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VisualRefreshResourceError';
  }
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function toPosix(value) {
  return String(value).split(path.sep).join('/');
}

function sha256(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

export function gitBlobSha(value) {
  const bytes = Buffer.from(String(value ?? ''), 'utf8');
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`, 'utf8')
    .update(bytes)
    .digest('hex');
}

export function canonicalSnapshotPath(raw, label = 'path') {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new VisualRefreshResourceError(`${label}에는 비어 있지 않은 worktree-relative 경로가 필요함`);
  }
  if (raw.includes('\0')) {
    throw new VisualRefreshResourceError(`${label}에 NUL 문자를 사용할 수 없음`);
  }
  const issue = concretePathIssue(raw);
  if (issue) {
    throw new VisualRefreshResourceError(`${label}는 canonical worktree-relative 경로여야 함 (${issue}): ${raw}`);
  }
  return raw;
}

function outside(root, target) {
  const relative = path.relative(root, target);
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

// Validate every existing segment, not merely the final lexical path. A symlink or
// junction anywhere in an authority path could otherwise redirect a snapshot read to
// a live/outside file after string-only confinement had succeeded.
export function assertSnapshotPath(
  root,
  raw,
  { label = 'authority path', type = null, required = true } = {},
) {
  const relative = canonicalSnapshotPath(raw, label);
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, ...relative.split('/'));
  if (outside(absoluteRoot, absolute)) {
    throw new VisualRefreshResourceError(`${label}가 snapshot root 밖으로 이탈함: ${relative}`);
  }

  let cursor = absoluteRoot;
  const segments = relative.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    cursor = path.join(cursor, segments[index]);
    let stat;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      if (!required && error?.code === 'ENOENT') {
        return { relative, absolute, exists: false };
      }
      throw new VisualRefreshResourceError(
        `${label} snapshot 경로를 읽을 수 없음: ${relative} (${error?.code || error?.message || error})`,
      );
    }
    if (stat.isSymbolicLink()) {
      throw new VisualRefreshResourceError(
        `${label}는 symlink/junction segment를 사용할 수 없음: ${toPosix(path.relative(absoluteRoot, cursor))}`,
      );
    }
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw new VisualRefreshResourceError(
        `${label}의 중간 segment가 directory가 아님: ${toPosix(path.relative(absoluteRoot, cursor))}`,
      );
    }
    if (index === segments.length - 1) {
      if (type === 'file' && !stat.isFile()) {
        throw new VisualRefreshResourceError(`${label}는 regular file이어야 함: ${relative}`);
      }
      if (type === 'directory' && !stat.isDirectory()) {
        throw new VisualRefreshResourceError(`${label}는 directory여야 함: ${relative}`);
      }
    }
  }

  const realRoot = fs.realpathSync(absoluteRoot);
  const real = fs.realpathSync(absolute);
  if (outside(realRoot, real)) {
    throw new VisualRefreshResourceError(`${label}의 physical path가 snapshot root 밖으로 이탈함: ${relative}`);
  }
  return { relative, absolute, exists: true };
}

function parseMapping(raw, label) {
  let value;
  try {
    value = yamlParse(raw);
  } catch (error) {
    throw new VisualRefreshResourceError(`${label} YAML 파싱 실패: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new VisualRefreshResourceError(`${label} YAML top-level은 mapping이어야 함`);
  }
  return value;
}

function readSnapshotFile(root, raw, label) {
  const ref = assertSnapshotPath(root, raw, { label, type: 'file' });
  const content = readFileSafe(ref.absolute);
  if (content == null) throw new VisualRefreshResourceError(`${label} 파일 없음: ${ref.relative}`);
  return { ...ref, raw: content, value: parseMapping(content, label) };
}

export function readPinnedBundledResource(name, bundledRoot = KIT_ROOT) {
  const spec = PINNED_VISUAL_REFRESH_RESOURCES[name];
  if (!spec) throw new VisualRefreshResourceError(`unknown bundled resource: ${name}`);
  const ref = assertSnapshotPath(bundledRoot, spec.relative, {
    label: `bundled ${name}`,
    type: 'file',
  });
  const raw = readFileSafe(ref.absolute);
  if (raw == null) throw new VisualRefreshResourceError(`bundled ${name} 파일 없음: ${spec.relative}`);
  const actual = gitBlobSha(raw);
  if (actual !== spec.git_blob_sha) {
    throw new VisualRefreshResourceError(
      `bundled ${name} bytes가 pinned Git blob과 불일치함 ` +
        `(expected ${spec.git_blob_sha}, actual ${actual}); live/dirty resource는 authority로 사용할 수 없음`,
    );
  }
  return {
    name,
    relative: spec.relative,
    absolute: ref.absolute,
    raw,
    value: parseMapping(raw, `bundled ${name}`),
    git_blob_sha: actual,
    sha256: sha256(raw),
  };
}

function mergePresetRoles(layout, preset) {
  return {
    ...(preset?.roles && typeof preset.roles === 'object' ? preset.roles : {}),
    ...(layout?.roles && typeof layout.roles === 'object' ? layout.roles : {}),
  };
}

// The runtime loader normally follows layout.preset into KIT_ROOT. For authority
// evaluation we instead inline only the preset roles into a confined temporary
// layout. Built-in preset access rules are already represented by the canonical
// implementation policy; explicit project/domain layers remain explicit logical
// rules and retain their own identity.
function flattenLayout(layout, preset) {
  const flattened = {
    ...layout,
    roles: mergePresetRoles(layout, preset),
  };
  delete flattened.preset;
  if (!own(layout, 'layers')) delete flattened.layers;
  return flattened;
}

function writeBundleFile(root, relative, raw) {
  const absolute = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, raw, 'utf8');
  return absolute;
}

function sourceProvenance(source, raw, extra = {}) {
  return {
    source,
    sha256: sha256(raw),
    git_blob_sha: gitBlobSha(raw),
    ...extra,
  };
}

function explicitOrPinned({ destinationRoot, options, key, label, bundledRoot }) {
  if (options[key]) {
    const explicit = readSnapshotFile(destinationRoot, options[key], `--${key}`);
    return {
      raw: explicit.raw,
      value: explicit.value,
      provenance: sourceProvenance(explicit.relative, explicit.raw, { snapshot: 'destination' }),
      explicit: true,
    };
  }
  const bundled = readPinnedBundledResource(key, bundledRoot);
  return {
    raw: bundled.raw,
    value: bundled.value,
    provenance: sourceProvenance(`bundled:${bundled.relative}`, bundled.raw, {
      pinned: true,
      git_blob_sha: bundled.git_blob_sha,
    }),
    explicit: false,
  };
}

function scopeFor(authoredPath, role) {
  if (role === 'screen') return 'screen';
  if (role || String(authoredPath).includes('{domain}')) return 'domain';
  return 'global';
}

function resolvedPaths(layout, authoredPath, domain) {
  try {
    return layout.resolvePaths([authoredPath], { domain });
  } catch (error) {
    throw new VisualRefreshResourceError(
      `logical path rule '${authoredPath}' 해소 실패: ${error.message}`,
    );
  }
}

function authoredLayerPaths(layer) {
  if (Array.isArray(layer?.glob)) return layer.glob.map(String);
  if (typeof layer?.glob === 'string' && layer.glob) return [layer.glob];
  if (typeof layer?.role === 'string' && layer.role) return [`{roles.${layer.role}}`];
  return [];
}

function presetHasCanonicalMirror(preset, modeName) {
  return (preset?.layers || []).some(
    (layer) =>
      layer?.role === 'screen' &&
      Array.isArray(layer?.access?.forbid) &&
      layer.access.forbid.includes(modeName),
  );
}

export function logicalPathRules(meta, { modeName, domain } = {}) {
  if (!meta || !modeName) return [];
  const rules = [];
  const mode = meta.policy?.modes?.[modeName] || {};
  for (const [disposition, key] of [
    ['allow', 'allowed_paths'],
    ['deny', 'forbidden_paths'],
  ]) {
    for (const [index, authoredPath] of (mode[key] || []).entries()) {
      const role = /^\{roles\.([A-Za-z0-9_]+)\}$/.exec(String(authoredPath))?.[1] || null;
      for (const [resolvedIndex, resolvedPath] of resolvedPaths(meta.layout, authoredPath, domain).entries()) {
        const canonicalApiStageScreenDeny =
          meta.canonicalBuiltIn === true &&
          modeName === 'api-integrated-ui' &&
          disposition === 'deny' &&
          authoredPath === '{roles.screen}';
        rules.push({
          rule_id: `policy:${modeName}:${disposition}:${index}:${resolvedIndex}`,
          source: meta.resourceProvenance.policy.source,
          authored_path: String(authoredPath),
          resolved_path: String(resolvedPath),
          disposition,
          origin: 'implementation-mode-policy',
          scope: scopeFor(authoredPath, role),
          mode: modeName,
          ...(role ? { role } : {}),
          ...(canonicalApiStageScreenDeny
            ? {
                waivable_visual_refresh_api_stage_screen_deny: true,
                ...(presetHasCanonicalMirror(meta.preset, modeName)
                  ? {
                      coalesced_preset_mirror: {
                        source: `bundled:${PINNED_VISUAL_REFRESH_RESOURCES.preset.relative}`,
                        role: 'screen',
                        mode: modeName,
                      },
                    }
                  : {}),
              }
            : {}),
        });
      }
    }
  }

  const layers = typeof meta.layout?.layersFor === 'function'
    ? meta.layout.layersFor(domain)
    : meta.layout?.layers || [];
  for (const [layerIndex, layer] of (layers || []).entries()) {
    for (const [disposition, accessKey] of [
      ['allow', 'allow'],
      ['deny', 'forbid'],
    ]) {
      if (!Array.isArray(layer?.access?.[accessKey]) || !layer.access[accessKey].includes(modeName)) {
        continue;
      }
      for (const [authoredIndex, authoredPath] of authoredLayerPaths(layer).entries()) {
        for (const [resolvedIndex, resolvedPath] of resolvedPaths(meta.layout, authoredPath, domain).entries()) {
          rules.push({
            rule_id: `layout:${domain || '*'}:${layer.role || 'anonymous'}:${modeName}:${disposition}:${layerIndex}:${authoredIndex}:${resolvedIndex}`,
            source: meta.resourceProvenance.layout.source,
            authored_path: String(authoredPath),
            resolved_path: String(resolvedPath),
            disposition,
            origin: 'layout-layer',
            scope: scopeFor(authoredPath, layer.role || null),
            mode: modeName,
            ...(layer.role ? { role: layer.role } : {}),
          });
        }
      }
    }
  }

  return rules.sort((left, right) => {
    const byPath = left.resolved_path.localeCompare(right.resolved_path);
    return byPath || left.rule_id.localeCompare(right.rule_id);
  });
}

export function prepareVisualRefreshResources({
  destinationRoot,
  options = {},
  bundledRoot = KIT_ROOT,
} = {}) {
  if (!destinationRoot) throw new VisualRefreshResourceError('destinationRoot가 필요함');
  const docsRelative = canonicalSnapshotPath(options.docs || DEFAULTS.docs, '--docs');
  const srcRelative = canonicalSnapshotPath(options.src || DEFAULTS.src, '--src');
  // Missing docs/src remain an applicability problem for the authority analyzer, but an
  // existing symlinked path is a usage/trust-boundary error.
  assertSnapshotPath(destinationRoot, docsRelative, {
    label: '--docs',
    type: 'directory',
    required: false,
  });
  assertSnapshotPath(destinationRoot, srcRelative, {
    label: '--src',
    type: 'directory',
    required: false,
  });

  const policy = explicitOrPinned({
    destinationRoot,
    options,
    key: 'policy',
    label: 'policy',
    bundledRoot,
  });
  const manifest = explicitOrPinned({
    destinationRoot,
    options,
    key: 'manifest',
    label: 'manifest',
    bundledRoot,
  });

  let layout;
  if (options.layout) {
    const explicit = readSnapshotFile(destinationRoot, options.layout, '--layout');
    layout = {
      raw: explicit.raw,
      value: explicit.value,
      provenance: sourceProvenance(explicit.relative, explicit.raw, { snapshot: 'destination' }),
      explicit: true,
    };
  } else {
    const bundled = readPinnedBundledResource('layout', bundledRoot);
    layout = {
      raw: bundled.raw,
      value: bundled.value,
      provenance: sourceProvenance(`bundled:${bundled.relative}`, bundled.raw, {
        pinned: true,
        git_blob_sha: bundled.git_blob_sha,
      }),
      explicit: false,
    };
  }

  let preset = null;
  if (layout.value.preset != null) {
    if (layout.value.preset !== 'expo-feature') {
      throw new VisualRefreshResourceError(
        `layout preset '${layout.value.preset}'은 pinned bundled resource가 아니므로 visual authority에서 사용할 수 없음`,
      );
    }
    preset = readPinnedBundledResource('preset', bundledRoot);
  }
  const flattenedLayout = flattenLayout(layout.value, preset?.value || null);

  let ci = { raw: null, value: {}, provenance: null, explicit: false };
  if (options.ci) {
    const explicit = readSnapshotFile(destinationRoot, options.ci, '--ci');
    ci = {
      raw: explicit.raw,
      value: explicit.value,
      provenance: sourceProvenance(explicit.relative, explicit.raw, { snapshot: 'destination' }),
      explicit: true,
    };
  }

  const bundleRoot = fs.mkdtempSync(
    path.join(path.resolve(destinationRoot), '.workflow-visual-refresh-resources-'),
  );
  const bundleRelative = toPosix(path.relative(destinationRoot, bundleRoot));
  const policyRelative = `${bundleRelative}/policy.yaml`;
  const manifestRelative = `${bundleRelative}/manifest.yaml`;
  const layoutRelative = `${bundleRelative}/project-layout.yaml`;
  const ciRelative = ci.explicit ? `${bundleRelative}/ci.yaml` : null;
  writeBundleFile(destinationRoot, policyRelative, policy.raw);
  writeBundleFile(destinationRoot, manifestRelative, manifest.raw);
  writeBundleFile(destinationRoot, layoutRelative, yamlStringify(flattenedLayout, { lineWidth: 0 }));
  if (ciRelative) writeBundleFile(destinationRoot, ciRelative, ci.raw);

  const flags = { layout: path.join(destinationRoot, ...layoutRelative.split('/')) };
  const resolvedLayout = loadLayoutProfile({ kitRoot: bundleRoot, flags });
  const canonicalBuiltIn = !policy.explicit && !layout.explicit;
  const resourceProvenance = {
    package_version: PINNED_VISUAL_REFRESH_PACKAGE_VERSION,
    policy: policy.provenance,
    manifest: manifest.provenance,
    layout: layout.provenance,
    ...(preset
      ? {
          preset: sourceProvenance(`bundled:${preset.relative}`, preset.raw, {
            pinned: true,
            git_blob_sha: preset.git_blob_sha,
          }),
        }
      : {}),
    ...(ci.provenance ? { ci: ci.provenance } : {}),
  };

  return {
    options: {
      ...options,
      docs: docsRelative,
      src: srcRelative,
      policy: policyRelative,
      manifest: manifestRelative,
      layout: layoutRelative,
      ...(ciRelative ? { ci: ciRelative } : { ci: undefined }),
    },
    meta: {
      docsRelative,
      srcRelative,
      policy: policy.value,
      manifest: manifest.value,
      ci: ci.value,
      layout: resolvedLayout,
      originalLayout: layout.value,
      preset: preset?.value || null,
      canonicalBuiltIn,
      resourceProvenance,
      bundleRelative,
    },
  };
}
