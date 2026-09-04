import fs from 'node:fs';
import path from 'node:path';

import { buildState } from '../workflow-state.mjs';
import { computeReadiness } from '../readiness-legacy.mjs';
import {
  collectApiCandidateClaims,
  concretePathIssue,
  globMatches,
  readinessPathAuthorization,
} from './path-backstop.mjs';
import { analyzeScreenLifecycles } from './screen-lifecycle.mjs';
import { loadScreenSpec } from './spec.mjs';
import { walkFiles } from './util.mjs';
import * as core from './visual-refresh-authority.mjs';
import {
  collectGeneratedOwnershipEntries,
  resolveGeneratedOwnership,
} from './generated-ownership.mjs';
import {
  logicalPathRules,
  prepareVisualRefreshResources,
} from './visual-refresh-resources.mjs';
import { stripProjectPrefix } from './visual-refresh-git.mjs';

export * from './visual-refresh-authority.mjs';

const CANONICAL_SCREEN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function toPosix(value) {
  return String(value).split(path.sep).join('/');
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function canonicalAuthorityPath(raw, label = 'path') {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new core.VisualRefreshError(`${label}는 비어 있지 않은 worktree-relative 경로여야 함`);
  }
  if (raw.includes('\0')) throw new core.VisualRefreshError(`${label}에 NUL 문자를 사용할 수 없음`);
  const issue = concretePathIssue(raw);
  if (issue) {
    throw new core.VisualRefreshError(
      `${label}는 canonical worktree-relative concrete 경로여야 함 (${issue}): ${raw}`,
    );
  }
  return raw;
}

function roleMatches(layout, role, domain, file) {
  try {
    return layout
      .resolvePaths([`{roles.${role}}`], { domain })
      .filter((pattern) => globMatches(pattern, file));
  } catch {
    return [];
  }
}

function delegatedSharedSurface(entry, file) {
  return (entry?.delegated_shared_surfaces || []).find((surface) =>
    (surface.implementation_paths || []).some((pattern) => globMatches(pattern, file)),
  ) || null;
}

// One implementation-file helper is shared by forward inspection and the backstop.
// Ordinary readiness remains authoritative. Visual intent may waive exactly one
// logical canonical API-stage screen deny; every other logical rule and candidate,
// shared-surface, generated, or ownership denial remains final.
export function visualImplementationAuthorization({
  file,
  authorizedPath,
  selectedScreen,
  readiness,
  layout,
  domain,
  canonicalBuiltIn,
  generated,
  claims = { active: [], denied: [] },
  logicalRules = [],
}) {
  const checkedPath = canonicalAuthorityPath(file, '--path');
  if (checkedPath !== authorizedPath) {
    return {
      allowed: false,
      checked_path: checkedPath,
      reason: 'checked path does not equal the stable exact screen_entry',
    };
  }
  if (generated) {
    return {
      allowed: false,
      checked_path: checkedPath,
      reason: `generated/do-not-edit ownership is final (${generated.artifact_id})`,
      generated_owner: generated,
    };
  }

  const ordinary = readinessPathAuthorization({
    file: checkedPath,
    screenId: selectedScreen,
    entry: readiness,
    modeOrder: readiness?.__mode_order || [],
    claims,
  });
  const matchingRules = logicalRules.filter((rule) =>
    globMatches(rule.resolved_path, checkedPath),
  );
  if (ordinary.allowed) {
    return {
      allowed: true,
      checked_path: checkedPath,
      grant: 'ordinary-readiness',
      ordinary,
      matching_rules: matchingRules,
    };
  }

  const screenRole = roleMatches(layout, 'screen', domain, checkedPath);
  const otherRoles = ['route_entry', 'domain_component', 'hook', 'api_client', 'api_schema']
    .flatMap((role) => roleMatches(layout, role, domain, checkedPath));
  const matchingDenyRules = matchingRules.filter((rule) => rule.disposition === 'deny');
  const waivableRules = matchingDenyRules.filter(
    (rule) => rule.waivable_visual_refresh_api_stage_screen_deny === true,
  );
  const nonWaivableRules = matchingDenyRules.filter(
    (rule) => rule.waivable_visual_refresh_api_stage_screen_deny !== true,
  );
  const forbiddenBy = ordinary.forbidden_by || [];
  const unmatchedForbidden = forbiddenBy.filter(
    (pattern) => !matchingDenyRules.some((rule) => rule.resolved_path === pattern),
  );
  const delegated = delegatedSharedSurface(readiness, checkedPath);
  const canonicalWaiver =
    canonicalBuiltIn === true &&
    readiness?.readiness_mode === 'api-integrated-ui' &&
    screenRole.length > 0 &&
    otherRoles.length === 0 &&
    forbiddenBy.length > 0 &&
    waivableRules.length === 1 &&
    nonWaivableRules.length === 0 &&
    unmatchedForbidden.length === 0 &&
    !(ordinary.candidate_matches || []).length &&
    !delegated;

  if (canonicalWaiver) {
    return {
      allowed: true,
      checked_path: checkedPath,
      grant: 'visual-refresh-canonical-api-stage-screen-waiver',
      ordinary,
      matching_rules: matchingRules,
      waived_rules: waivableRules.map((rule) => ({
        ...rule,
        disposition: 'waived-for-exact-visual-refresh-path',
      })),
    };
  }
  return {
    allowed: false,
    checked_path: checkedPath,
    reason:
      delegated
        ? `path is delegated to shared surface ${delegated.surface_id}; screen-scoped editing is forbidden`
        : ordinary.reason || 'ordinary readiness denied the path',
    ordinary,
    matching_rules: matchingRules,
    ...(nonWaivableRules.length ? { non_waivable_rules: nonWaivableRules } : {}),
    ...(unmatchedForbidden.length ? { unmatched_forbidden_rules: unmatchedForbidden } : {}),
  };
}

function screenSpecs(docsDir) {
  const domains = path.join(docsDir, 'domains');
  if (!fs.existsSync(domains)) return [];
  return walkFiles(domains, ['.md'])
    .filter((file) => path.basename(file) === 'screen-spec.md')
    .map((file) => loadScreenSpec(file));
}

function declarationFor(record, authorizedPath) {
  const raw = text(record?.spec?.frontmatter?.screen_entry);
  if (!raw) return false;
  try {
    return canonicalAuthorityPath(raw, 'ScreenSpec screen_entry') === authorizedPath;
  } catch {
    return raw === authorizedPath;
  }
}

function physicalOwnerSnapshot(root, docsRelative, selectedScreen, authorizedPath, snapshotKind) {
  const docsDir = path.join(root, ...docsRelative.split('/'));
  const specs = screenSpecs(docsDir);
  const lifecycle = analyzeScreenLifecycles({ specs, docsDir });
  const declarations = lifecycle.records.filter((record) =>
    declarationFor(record, authorizedPath),
  );
  const records = declarations.map((record) => ({
    screen_id: record.screen_id ?? null,
    lifecycle: record.lifecycle ?? null,
    valid: record.valid === true,
    source: record.source,
    errors: record.errors || [],
  }));
  const validSelected = declarations.filter(
    (record) =>
      record.valid === true &&
      record.lifecycle === 'active' &&
      record.screen_id === selectedScreen &&
      CANONICAL_SCREEN_ID.test(record.screen_id),
  );
  const valid = declarations.length === 1 && validSelected.length === 1;
  return { snapshot: snapshotKind, valid, records };
}

function physicalOwnerReasons({
  sourceRoot,
  destinationRoot,
  docsRelative,
  selectedScreen,
  authorizedPath,
}) {
  const snapshots = [
    physicalOwnerSnapshot(sourceRoot, docsRelative, selectedScreen, authorizedPath, 'source'),
    physicalOwnerSnapshot(
      destinationRoot,
      docsRelative,
      selectedScreen,
      authorizedPath,
      'destination',
    ),
  ];
  return snapshots
    .filter((snapshot) => !snapshot.valid)
    .map((snapshot) => ({
      code: 'VR-SCREEN-010',
      message:
        `${snapshot.snapshot} physical screen_entry owner index는 ` +
        'duplicate-preserving canonical active selected owner 1건이어야 함',
      snapshot: snapshot.snapshot,
      owner_records: snapshot.records,
    }));
}

function selectedScreenSpecPath(destinationRoot, docsRelative, selectedScreen) {
  const docsDir = path.join(destinationRoot, ...String(docsRelative || '').split('/').filter(Boolean));
  const matches = screenSpecs(docsDir).filter(
    (spec) => spec?.frontmatter?.screen_id === selectedScreen,
  );
  if (matches.length !== 1) return null;
  return `${docsRelative}/${toPosix(path.relative(docsDir, matches[0].path))}`;
}

function computeFullReadiness(destinationRoot, selectedScreen, prepared) {
  const meta = prepared.meta;
  const docsDir = path.join(destinationRoot, ...meta.docsRelative.split('/'));
  const srcDir = path.join(destinationRoot, ...meta.srcRelative.split('/'));
  const { state } = buildState({
    docsDir,
    srcDir,
    date: '1970-01-01',
    layout: meta.layout,
    projectRoot: destinationRoot,
  });
  const output = computeReadiness({
    state,
    policy: meta.policy,
    ci: meta.ci,
    manifest: meta.manifest,
    layout: meta.layout,
    exposeCaps: true,
    skipSurfaces: false,
  });
  return {
    state,
    output,
    entry: output?.[selectedScreen] || null,
    claims: collectApiCandidateClaims(output),
  };
}

function generatedRoots(sourceRoot, destinationRoot) {
  return [
    { kind: 'destination', root: destinationRoot },
    { kind: 'source', root: sourceRoot },
  ];
}

function hasReason(reasons, code) {
  return reasons.some((entry) => entry?.code === code);
}

// The authority core owns input/reconciliation/mapping/supersession validation. This
// wrapper supplies the immutable resource bundle and then closes the implementation
// boundary with project-wide claims, logical rules, physical ownership, shared
// surfaces, and marker-qualified generated ownership.
export function evaluateVisualRefreshAuthority(options) {
  const prepared = prepareVisualRefreshResources({
    destinationRoot: options.destinationRoot,
    options: options.options || {},
    bundledRoot: options.bundledRoot,
  });
  const result = core.evaluateVisualRefreshAuthority({
    ...options,
    options: prepared.options,
  });
  const intent = result?.intent_authorization;
  if (!intent) return result;

  const coreContext = result?._context;
  if (!coreContext || !intent.authorized_path) {
    result.intent_authorization = {
      ...intent,
      resource_provenance: prepared.meta.resourceProvenance,
    };
    return result;
  }

  const full = computeFullReadiness(
    options.destinationRoot,
    coreContext.selected_screen,
    prepared,
  );
  const readiness = full.entry || coreContext.readiness;
  const rules = logicalPathRules(prepared.meta, {
    modeName: readiness?.readiness_mode,
    domain: coreContext.domain,
  });
  const generatedEntries = collectGeneratedOwnershipEntries(prepared.meta.manifest, {
    docsRelative: prepared.meta.docsRelative,
  });
  const roots = generatedRoots(options.sourceRoot, options.destinationRoot);
  const generatedOwner = resolveGeneratedOwnership({
    file: intent.authorized_path,
    entries: generatedEntries,
    roots,
  });

  // The old path-only detector may have produced VR-PATH-001. Retain it only when
  // the common manifest+header ownership result confirms the owner.
  const reasons = (intent.reasons || []).filter(
    (entry) => entry?.code !== 'VR-PATH-001',
  );
  if (generatedOwner) {
    reasons.push({
      code: 'VR-PATH-001',
      message:
        `authorized screen_entry가 generated/do-not-edit output임: ${generatedOwner.artifact_id}`,
      generated_owner: generatedOwner,
    });
  }
  reasons.push(
    ...physicalOwnerReasons({
      sourceRoot: options.sourceRoot,
      destinationRoot: options.destinationRoot,
      docsRelative: prepared.meta.docsRelative,
      selectedScreen: coreContext.selected_screen,
      authorizedPath: intent.authorized_path,
    }),
  );

  const commonAuthorization = {
    authorizedPath: intent.authorized_path,
    selectedScreen: coreContext.selected_screen,
    readiness,
    layout: prepared.meta.layout,
    domain: coreContext.domain,
    canonicalBuiltIn: prepared.meta.canonicalBuiltIn,
    claims: full.claims,
    logicalRules: rules,
  };
  const exactPathAuthorization = visualImplementationAuthorization({
    ...commonAuthorization,
    file: intent.authorized_path,
    generated: generatedOwner,
  });

  let checkedAuthorization = null;
  if (options.checkedPath !== undefined) {
    let checked;
    try {
      checked = canonicalAuthorityPath(options.checkedPath, '--path');
      checkedAuthorization = visualImplementationAuthorization({
        ...commonAuthorization,
        file: checked,
        generated: resolveGeneratedOwnership({ file: checked, entries: generatedEntries, roots }),
      });
    } catch (error) {
      checkedAuthorization = { allowed: false, reason: error.message };
    }
  }

  if (reasons.length === 0 && !exactPathAuthorization.allowed) {
    reasons.push({
      code: 'VR-PATH-002',
      message:
        exactPathAuthorization.reason ||
        'the stable exact screen_entry is denied by non-waivable path authority',
    });
  }
  const applicable = reasons.length === 0;
  result.intent_authorization = {
    ...intent,
    applicable,
    ...(reasons.length ? { reasons } : { reasons: undefined }),
    fact_mode: readiness?.__fact_mode || intent.fact_mode || null,
    decision_cap: readiness?.__decision_cap || intent.decision_cap || null,
    resource_provenance: prepared.meta.resourceProvenance,
  };
  if (checkedAuthorization) {
    result.path_authorization = applicable
      ? checkedAuthorization
      : { ...checkedAuthorization, allowed: false };
  } else if (result.path_authorization) {
    delete result.path_authorization;
  }

  result._context = {
    ...coreContext,
    docs_relative: prepared.meta.docsRelative,
    readiness,
    candidate_claims: full.claims,
    logical_path_rules: rules,
    generated_entries: generatedEntries,
    generated_roots: roots,
    visual_path_authorization: exactPathAuthorization,
    screen_spec_path: selectedScreenSpecPath(
      options.destinationRoot,
      prepared.meta.docsRelative,
      coreContext.selected_screen,
    ),
    resource_provenance: prepared.meta.resourceProvenance,
  };
  return result;
}

function recordPaths(record) {
  if (record?.status === 'R' || record?.status === 'C') {
    return [record.oldPath, record.newPath].filter(Boolean);
  }
  return record?.path ? [record.path] : [];
}

function normalizeRecord(record, projectPrefix) {
  if (record?.status === 'R' || record?.status === 'C') {
    const oldPath = stripProjectPrefix(record.oldPath, projectPrefix);
    const newPath = stripProjectPrefix(record.newPath, projectPrefix);
    return oldPath == null || newPath == null
      ? null
      : { ...record, oldPath, newPath };
  }
  const normalized = stripProjectPrefix(record?.path, projectPrefix);
  return normalized == null ? null : { ...record, path: normalized };
}

function exactOperation(record, relative, allowedStatuses) {
  return allowedStatuses.includes(record?.status) && record?.path === relative;
}

function violation(file, record, code, message, extra = {}) {
  return {
    file,
    change: record?.raw || record?.status || '?',
    code,
    reason: message,
    ...extra,
  };
}

export function routeVisualBackstopRecords({ records, authority, projectPrefix = '' }) {
  const context = authority?._context;
  if (!context) {
    return {
      violations: [
        violation('(authority)', null, 'VR-BACKSTOP-001', 'visual authority context is unavailable'),
      ],
    };
  }
  const exact = {
    screen: context.authorized_path,
    input: context.selected_input_path,
    register: context.register_path,
    mapping: context.mapping_path,
  };
  const violations = [];

  for (const rawRecord of records || []) {
    const record = normalizeRecord(rawRecord, projectPrefix);
    if (!record) {
      for (const file of recordPaths(rawRecord)) {
        if (stripProjectPrefix(file, projectPrefix) == null) {
          violations.push(
            violation(file, rawRecord, 'VR-BACKSTOP-002', 'changed path is outside selected --root'),
          );
        }
      }
      continue;
    }
    const paths = recordPaths(record);

    // Generated ownership is final, but only the shared manifest-output + header
    // result may classify a concrete file as generated.
    let generatedDenied = false;
    for (const file of paths) {
      const owner = resolveGeneratedOwnership({
        file,
        entries: context.generated_entries || [],
        roots: context.generated_roots || [],
      });
      if (!owner) continue;
      generatedDenied = true;
      violations.push(
        violation(
          file,
          record,
          'VR-BACKSTOP-003',
          `generated/do-not-edit ownership is final (${owner.artifact_id})`,
          { generated_owner: owner },
        ),
      );
    }
    if (generatedDenied) continue;

    const touches = (relative) => relative && paths.includes(relative);
    if (touches(exact.screen)) {
      if (!exactOperation(record, exact.screen, ['M'])) {
        violations.push(
          violation(
            exact.screen,
            record,
            'VR-BACKSTOP-004',
            'authorized screen_entry receives visual authority only for exact M; A/R/C/T/D are forbidden',
          ),
        );
      } else if (!context.visual_path_authorization?.allowed) {
        violations.push(
          violation(
            exact.screen,
            record,
            'VR-BACKSTOP-008',
            context.visual_path_authorization?.reason ||
              'the stable exact screen_entry is denied by non-waivable path authority',
          ),
        );
      }
      continue;
    }
    if (touches(exact.input)) {
      const allowed =
        !context.selected_input_existed_at_source && exactOperation(record, exact.input, ['A']);
      if (!allowed) {
        violations.push(
          violation(
            exact.input,
            record,
            'VR-BACKSTOP-005',
            context.selected_input_existed_at_source
              ? 'existing selected input is immutable; use a new input_id + supersedes'
              : 'new selected input authoring permits exact A only',
          ),
        );
      }
      continue;
    }
    if (touches(exact.register) || touches(exact.mapping)) {
      const target = touches(exact.register) ? exact.register : exact.mapping;
      if (!exactOperation(record, target, ['A', 'M'])) {
        violations.push(
          violation(
            target,
            record,
            'VR-BACKSTOP-006',
            'authority authoring closure permits exact Register/mapping A|M only',
          ),
        );
      }
      continue;
    }
    if (context.screen_spec_path && touches(context.screen_spec_path)) {
      violations.push(
        violation(
          context.screen_spec_path,
          record,
          'VR-BACKSTOP-009',
          'ScreenSpec identity/body edits are outside the visual authority authoring closure',
        ),
      );
      continue;
    }

    // Every remaining old/new path is checked with the same ordinary file helper and
    // the destination-wide Candidate claim set. There is no unclassified-path skip.
    for (const file of [...new Set(paths)]) {
      let ordinary;
      try {
        ordinary = readinessPathAuthorization({
          file,
          screenId: context.selected_screen,
          entry: context.readiness,
          modeOrder: context.readiness?.__mode_order || [],
          claims: context.candidate_claims || { active: [], denied: [] },
        });
      } catch (error) {
        ordinary = { allowed: false, reason: error.message };
      }
      if (!ordinary.allowed) {
        violations.push(
          violation(
            file,
            record,
            'VR-BACKSTOP-007',
            ordinary.reason || 'ordinary selected-screen authorization denied the path',
            {
              ...(ordinary.would_clear ? { would_clear: ordinary.would_clear } : {}),
              ...(ordinary.candidate_matches?.length
                ? { candidate_matches: ordinary.candidate_matches }
                : {}),
            },
          ),
        );
      }
    }
  }
  return { violations };
}
