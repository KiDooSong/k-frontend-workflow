import path from 'node:path';
import { walkFiles } from './util.mjs';
import { loadScreenSpec } from './spec.mjs';
import {
  evaluateVisualRefreshAuthority as evaluateCore,
  routeVisualBackstopRecords as routeCore,
} from './visual-refresh-authority.mjs';
import { stripProjectPrefix } from './visual-refresh-git.mjs';

export * from './visual-refresh-authority.mjs';

function toPosix(value) {
  return String(value).split(path.sep).join('/');
}

function recordPaths(record) {
  if (record?.status === 'R' || record?.status === 'C') {
    return [record.oldPath, record.newPath].filter(Boolean);
  }
  return record?.path ? [record.path] : [];
}

function selectedScreenSpecPath(destinationRoot, docsRelative, selectedScreen) {
  const docsDir = path.join(destinationRoot, ...String(docsRelative || '').split('/').filter(Boolean));
  const domainsDir = path.join(docsDir, 'domains');
  let candidates = [];
  try {
    candidates = walkFiles(domainsDir, ['.md'])
      .filter((file) => path.basename(file) === 'screen-spec.md')
      .map((file) => loadScreenSpec(file))
      .filter((spec) => spec?.frontmatter?.screen_id === selectedScreen);
  } catch {
    return null;
  }
  if (candidates.length !== 1) return null;
  const relativeToDocs = toPosix(path.relative(docsDir, candidates[0].path));
  return `${docsRelative}/${relativeToDocs}`;
}

function hasReason(result, code) {
  return (result?.intent_authorization?.reasons || []).some((entry) => entry?.code === code);
}

// Compatibility shell around the authority core. The core intentionally keeps positive evidence
// derivation separate from file authorization; this seam makes the exact screen_entry decision a
// mandatory applicability condition and carries only audit data to the record router.
export function evaluateVisualRefreshAuthority(options) {
  const result = evaluateCore(options);
  const intent = result?.intent_authorization;
  const context = result?._context;
  if (!intent || !context || !intent.authorized_path) return result;

  let exactPathAuthorization =
    options.checkedPath === intent.authorized_path ? result.path_authorization : null;
  if (!exactPathAuthorization && intent.applicable) {
    exactPathAuthorization = evaluateCore({
      ...options,
      checkedPath: intent.authorized_path,
    }).path_authorization;
  }

  if (intent.applicable && !exactPathAuthorization?.allowed) {
    const reasons = [...(intent.reasons || [])];
    if (!hasReason(result, 'VR-PATH-002')) {
      reasons.push({
        code: 'VR-PATH-002',
        message:
          exactPathAuthorization?.reason ||
          'the stable exact screen_entry is denied by non-waivable path authority',
      });
    }
    result.intent_authorization = {
      ...intent,
      applicable: false,
      reasons,
    };
    if (result.path_authorization) {
      result.path_authorization = { ...result.path_authorization, allowed: false };
    }
  }

  result._context = {
    ...context,
    visual_path_authorization: exactPathAuthorization || result.path_authorization || null,
    screen_spec_path: selectedScreenSpecPath(
      options.destinationRoot,
      context.docs_relative,
      context.selected_screen,
    ),
  };
  return result;
}

function appendUnique(violations, next) {
  const key = `${next.code}\0${next.file}\0${next.change}`;
  const seen = new Set(violations.map((entry) => `${entry.code}\0${entry.file}\0${entry.change}`));
  if (!seen.has(key)) violations.push(next);
}

export function routeVisualBackstopRecords({ records, authority, projectPrefix = '' }) {
  const base = routeCore({ records, authority, projectPrefix });
  const violations = [...(base.violations || [])];
  const context = authority?._context;
  if (!context) return { ...base, violations };

  for (const record of records || []) {
    const paths = recordPaths(record)
      .map((file) => stripProjectPrefix(file, projectPrefix))
      .filter((file) => file != null);
    if (
      paths.includes(context.authorized_path) &&
      record.status === 'M' &&
      record.path === context.authorized_path &&
      !context.visual_path_authorization?.allowed
    ) {
      appendUnique(violations, {
        file: context.authorized_path,
        change: record.raw || record.status || '?',
        code: 'VR-BACKSTOP-008',
        reason:
          context.visual_path_authorization?.reason ||
          'the stable exact screen_entry is denied by non-waivable path authority',
      });
    }
    if (context.screen_spec_path && paths.includes(context.screen_spec_path)) {
      appendUnique(violations, {
        file: context.screen_spec_path,
        change: record.raw || record.status || '?',
        code: 'VR-BACKSTOP-009',
        reason: 'ScreenSpec identity/body edits are outside the visual authority authoring closure',
      });
    }
  }
  return { ...base, violations };
}
