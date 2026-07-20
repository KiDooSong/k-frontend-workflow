import path from 'node:path';
import { findFiles } from './util.mjs';
import {
  col,
  interactionMatrixIsV2,
  hasIdentityCandidate,
  isStub,
  loadScreenSpec,
  parseOpenDecisions,
  parseTable,
  publicScreenKeyOf,
} from './spec.mjs';
import { covers, toPosix } from './path-backstop.mjs';
import { analyzeScreenLifecycles } from './screen-lifecycle.mjs';

export const SHARED_SURFACE_ARTIFACT_TYPE = 'shared-surface-spec';
export const SHARED_SURFACE_RESULT_TYPES = Object.freeze(['state', 'mutation', 'external', 'none']);
const CANONICAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const WINDOWS_DRIVE_PREFIX_PATTERN = /^[A-Za-z]:/;
export const SHARED_SURFACE_FORBIDDEN_IDENTITY_FIELDS = Object.freeze([
  'route',
  'screen_id',
  'route_entry',
  'screen_entry',
  'member_surfaces',
  'surface_refs',
]);

function error(code, message, extra = {}) {
  return { code, message, ...extra };
}

function compareError(a, b) {
  const byCode = String(a.code).localeCompare(String(b.code));
  if (byCode !== 0) return byCode;
  const byPath = String(a.path || '').localeCompare(String(b.path || ''));
  if (byPath !== 0) return byPath;
  return String(a.message).localeCompare(String(b.message));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));
}

export function sharedSurfaceSource(docsDir, spec) {
  return {
    artifact_id: spec.frontmatter.artifact_id || path.basename(spec.dir),
    artifact_type: SHARED_SURFACE_ARTIFACT_TYPE,
    path: toPosix(path.relative(docsDir, spec.path)),
  };
}

export function loadSharedSurfaceSpecs({ docsDir }) {
  return findFiles(path.join(docsDir, 'domains'), 'surface-spec.md').map((file) =>
    loadScreenSpec(file),
  );
}

function lexicalPathKey(value) {
  const normalized = path.posix.normalize(String(value).replace(/\\/g, '/'));
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '');
}

export function pathsOverlap(left, right) {
  const leftKey = lexicalPathKey(left);
  const rightKey = lexicalPathKey(right);
  return covers(leftKey, rightKey) || covers(rightKey, leftKey);
}

function ownershipPathKey(value) {
  const separated = String(value).replace(/\\/g, '/');
  const hasDriveSegment = separated
    .split('/')
    .some((segment) => WINDOWS_DRIVE_PREFIX_PATTERN.test(segment));
  if (path.posix.isAbsolute(separated) || hasDriveSegment) {
    return { key: null, issue: 'absolute-or-nonportable' };
  }

  const key = lexicalPathKey(separated);
  if (
    path.posix.isAbsolute(key) ||
    WINDOWS_DRIVE_PREFIX_PATTERN.test(key)
  ) {
    return { key: null, issue: 'absolute-or-nonportable' };
  }

  if (key === '..' || key.startsWith('../')) {
    return { key: null, issue: 'outside-project-root' };
  }
  return { key, issue: null };
}

export function implementationPathIssues(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return [error('invalid-path', 'implementation_paths entries must be non-empty strings')];
  }
  if (value !== value.trim()) {
    return [error('invalid-path', `implementation path has surrounding whitespace: ${JSON.stringify(value)}`)];
  }
  const normalized = toPosix(value);
  const issues = [];
  if (
    normalized.startsWith('/') ||
    WINDOWS_DRIVE_PREFIX_PATTERN.test(normalized) ||
    value.includes('\\')
  ) {
    issues.push(error('absolute-or-nonportable-path', `implementation path must be project-relative POSIX: ${value}`));
  }

  const segments = normalized.split('/');
  if (
    segments.some(
      (segment) =>
        segment === '' || segment === '.' || segment === '..' || segment.startsWith('.'),
    )
  ) {
    issues.push(error('unsafe-path-segment', `implementation path contains an unsafe/hidden segment: ${value}`));
  }

  const wildcardChars = normalized.match(/[?\[\]{}*]/g) || [];
  const terminalGlob = normalized.endsWith('/**');
  if (wildcardChars.length > 0 && !(terminalGlob && wildcardChars.join('') === '**')) {
    issues.push(error('unsupported-wildcard', `only one terminal /** wildcard is allowed: ${value}`));
  }
  if (terminalGlob) {
    const concreteSegments = segments.slice(0, -1);
    if (concreteSegments.length < 3) {
      issues.push(error('broad-wildcard', `terminal /** pattern is too broad for one shared surface: ${value}`));
    }
  }

  if (
    normalized === 'docs/frontend-workflow' ||
    normalized.startsWith('docs/frontend-workflow/')
  ) {
    issues.push(error('workflow-output-path', `shared implementation cannot own workflow authoring/generated paths: ${value}`));
  }
  return issues.sort(compareError);
}

function screenIndexOf(screenSpecs) {
  const index = new Map();
  for (const spec of screenSpecs) {
    // Match the public workflow-state property namespace for collision detection. Member adoption
    // separately verifies the original ID is a canonical string, so normalization cannot promote
    // a singleton malformed ID into a valid identity.
    const screenKey = publicScreenKeyOf(spec);
    const rows = index.get(screenKey) || [];
    rows.push(spec);
    index.set(screenKey, rows);
  }
  return index;
}

function screenEntryOwners(docsDir, screenSpecs) {
  const owners = [];
  for (const spec of screenSpecs) {
    const rawScreenId = spec.frontmatter.screen_id;
    const screenId =
      rawScreenId === undefined || rawScreenId === null || rawScreenId === ''
        ? null
        : String(rawScreenId);
    const screenDomain =
      typeof spec.frontmatter.domain === 'string' && spec.frontmatter.domain
        ? spec.frontmatter.domain
        : null;
    const screenSpecPath = toPosix(path.relative(docsDir, spec.path));
    for (const [entryKind, entryPath] of [
      ['route_entry', spec.frontmatter.route_entry],
      ['screen_entry', spec.frontmatter.screen_entry],
    ]) {
      if (typeof entryPath !== 'string' || !entryPath) continue;
      const ownership = ownershipPathKey(entryPath);
      owners.push({
        spec,
        screen_id: screenId,
        screen_domain: screenDomain,
        screen_spec_path: screenSpecPath,
        entry_kind: entryKind,
        entry_path: entryPath,
        entry_path_key: ownership.key,
        entry_path_issue: ownership.issue,
      });
    }
  }
  return owners;
}

function entryPathIssue(owner) {
  const fields = {
    screen_id: owner.screen_id,
    screen_domain: owner.screen_domain,
    entry_kind: owner.entry_kind,
    entry_path: owner.entry_path,
    screen_spec_path: owner.screen_spec_path,
  };
  if (owner.entry_path_issue === 'absolute-or-nonportable') {
    return error(
      'absolute-or-nonportable-path',
      `ScreenSpec ${owner.entry_kind} uses an absolute or nonportable path: ${owner.entry_path}`,
      fields,
    );
  }
  return error(
    'invalid-path',
    `ScreenSpec ${owner.entry_kind} must remain project-relative after normalization: ${owner.entry_path}`,
    fields,
  );
}

function surfaceIdCandidateOf(spec) {
  const fm = spec.frontmatter;
  if (hasIdentityCandidate(fm.surface_id)) return fm.surface_id;
  if (hasIdentityCandidate(fm.artifact_id)) return fm.artifact_id;
  return path.basename(path.dirname(spec.path));
}

function canonicalPathIssue(docsDir, spec) {
  const rel = toPosix(path.relative(docsDir, spec.path));
  const parts = rel.split('/');
  if (
    parts.length !== 5 ||
    parts[0] !== 'domains' ||
    parts[2] !== 'surfaces' ||
    parts[4] !== 'surface-spec.md'
  ) {
    return error(
      'noncanonical-path',
      `shared-surface-spec must live at domains/{domain}/surfaces/{surface}/surface-spec.md: ${rel}`,
    );
  }
  if (parts[1] !== spec.frontmatter.domain) {
    return error(
      'domain-path-mismatch',
      `surface frontmatter domain ${spec.frontmatter.domain || '(missing)'} must match canonical path domain ${parts[1]}`,
    );
  }
  return null;
}

function localDecisionIssue(spec) {
  if (spec.sections['open decisions'] === undefined) return null;
  const parsed = parseOpenDecisions(spec.sections['open decisions']);
  if (parsed.rows.length === 0 && !parsed.sectionHasContent) return null;
  return error(
    'local-open-decisions',
    'shared-surface-spec cannot own local Open Decisions; move the row to global/open-decisions.md and reference it with decision_refs',
  );
}

export function analyzeSharedSurfaces({ docsDir, surfaceSpecs, screenSpecs, screenLifecycle }) {
  const specs = surfaceSpecs || loadSharedSurfaceSpecs({ docsDir });
  const allScreenSpecs = screenSpecs || [];
  const lifecycle = screenLifecycle || analyzeScreenLifecycles({ specs: allScreenSpecs, docsDir });
  const screensById = screenIndexOf(allScreenSpecs);
  // Physical project paths are a global ownership namespace, independent of ScreenSpec domain or
  // surface membership. Valid absorbed entries are provenance, not current path owners.
  const entryOwners = screenEntryOwners(docsDir, lifecycle.liveSpecs);
  const records = [];

  for (const spec of specs) {
    const fm = spec.frontmatter;
    const surfaceId = surfaceIdCandidateOf(spec);
    const source = sharedSurfaceSource(docsDir, spec);
    const contractErrors = [];
    const membershipErrors = [];
    const pathErrors = [];

    if (spec.parseError || !spec.hasFrontmatter) {
      contractErrors.push(error('invalid-frontmatter', 'shared-surface-spec frontmatter is missing or malformed'));
    }
    for (const field of ['artifact_id', 'domain', 'surface_id', 'member_screens', 'status']) {
      if (fm[field] === undefined || fm[field] === null || fm[field] === '') {
        contractErrors.push(
          error('missing-required-field', `shared-surface-spec is missing required frontmatter: ${field}`, {
            field,
          }),
        );
      }
    }
    if (
      typeof fm.surface_id !== 'string' ||
      !CANONICAL_ID_PATTERN.test(fm.surface_id)
    ) {
      contractErrors.push(
        error(
          'invalid-surface-id',
          `surface_id must be a canonical ID: ${
            hasIdentityCandidate(fm.surface_id) ? String(fm.surface_id) : '(missing)'
          }`,
        ),
      );
    }
    if (fm.artifact_type !== SHARED_SURFACE_ARTIFACT_TYPE) {
      contractErrors.push(
        error('invalid-artifact-type', `surface-spec.md must declare artifact_type: ${SHARED_SURFACE_ARTIFACT_TYPE}`),
      );
    }
    const canonical = canonicalPathIssue(docsDir, spec);
    if (canonical) contractErrors.push(canonical);
    for (const field of SHARED_SURFACE_FORBIDDEN_IDENTITY_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(fm, field)) {
        contractErrors.push(
          error('forbidden-field', `shared-surface-spec must not declare ${field}`, { field }),
        );
      }
    }
    const localDecision = localDecisionIssue(spec);
    if (localDecision) contractErrors.push(localDecision);
    contractErrors.push(...sharedSurfaceInteractionIssues(spec));

    const rawMembers = fm.member_screens;
    const memberScreens = [];
    if (!Array.isArray(rawMembers)) {
      membershipErrors.push(error('invalid-members-shape', 'member_screens must be an array'));
    } else {
      const seen = new Set();
      rawMembers.forEach((member, index) => {
        if (typeof member !== 'string' || member.trim().length === 0) {
          membershipErrors.push(
            error('invalid-member', `member_screens[${index}] must be a non-empty canonical Screen ID`),
          );
          return;
        }
        if (seen.has(member)) {
          membershipErrors.push(
            error('duplicate-member', `member_screens contains duplicate Screen ID: ${member}`, {
              screen_id: member,
            }),
          );
          return;
        }
        seen.add(member);
        memberScreens.push(member);
      });
      if (rawMembers.length < 2) {
        membershipErrors.push(
          error('too-few-members', 'member_screens must contain at least two unique canonical Screen IDs'),
        );
      }
    }

    const memberRecords = [];
    const validMembers = [];
    for (const member of memberScreens) {
      const matches = screensById.get(member) || [];
      if (matches.length === 0) {
        membershipErrors.push(
          error('missing-member', `member screen does not exist: ${member}`, { screen_id: member }),
        );
        continue;
      }
      const canonicalMatches = matches.filter(
        (candidate) =>
          typeof candidate.frontmatter.screen_id === 'string' &&
          candidate.frontmatter.screen_id === member &&
          CANONICAL_ID_PATTERN.test(candidate.frontmatter.screen_id),
      );
      if (canonicalMatches.length === 0) {
        membershipErrors.push(
          error(
            'invalid-member-screen-id',
            `member screen identity is not a canonical string: ${member}`,
            {
              screen_id: member,
              locations: matches.map((candidate) => toPosix(path.relative(docsDir, candidate.path))).sort(),
            },
          ),
        );
        continue;
      }
      if (matches.length > 1) {
        membershipErrors.push(
          error('ambiguous-member', `member screen identity is duplicated: ${member}`, { screen_id: member }),
        );
        continue;
      }
      const screen = canonicalMatches[0];
      const screenLifecycleRecord = lifecycle.bySpec.get(screen);
      if (
        screenLifecycleRecord?.valid &&
        screenLifecycleRecord.lifecycle === 'absorbed'
      ) {
        membershipErrors.push(
          error(
            'absorbed-member',
            `member screen ${member} is absorbed; use canonical active screen ${screenLifecycleRecord.absorbed_into}`,
            {
              screen_id: member,
              absorbed_into: screenLifecycleRecord.absorbed_into,
            },
          ),
        );
        continue;
      }
      memberRecords.push(screen);
      if (screen.frontmatter.domain !== fm.domain) {
        membershipErrors.push(
          error(
            'cross-domain-member',
            `member ${member} belongs to domain ${screen.frontmatter.domain || '(missing)'}, not ${fm.domain || '(missing)'}`,
            { screen_id: member },
          ),
        );
        continue;
      }
      validMembers.push(member);
    }

    const implementationPaths = [];
    if (fm.implementation_paths !== undefined && !Array.isArray(fm.implementation_paths)) {
      pathErrors.push(error('invalid-paths-shape', 'implementation_paths must be an array'));
    } else {
      const seenPaths = new Set();
      for (const value of fm.implementation_paths || []) {
        const issues = implementationPathIssues(value);
        pathErrors.push(...issues.map((issue) => ({ ...issue, path: value })));
        if (typeof value !== 'string' || issues.length > 0) continue;
        if (seenPaths.has(value)) {
          pathErrors.push(
            error('duplicate-implementation-path', `implementation_paths contains duplicate path: ${value}`, {
              path: value,
            }),
          );
          continue;
        }
        seenPaths.add(value);
        implementationPaths.push(value);
      }
    }

    const memberRecordPaths = new Set(memberRecords.map((member) => member.path));
    if (implementationPaths.length > 0) {
      for (const owner of entryOwners) {
        if (owner.entry_path_issue) pathErrors.push(entryPathIssue(owner));
      }
    }
    for (const implementationPath of implementationPaths) {
      for (const owner of entryOwners) {
        if (!owner.entry_path_key || !pathsOverlap(implementationPath, owner.entry_path_key)) {
          continue;
        }
        if (memberRecordPaths.has(owner.spec.path)) {
          // Preserve the existing member diagnostic contract exactly for resolved members.
          pathErrors.push(
            error(
              'member-entry-overlap',
              `implementation path ${implementationPath} overlaps member ${owner.screen_id} ${owner.entry_kind}: ${owner.entry_path}`,
              {
                path: implementationPath,
                screen_id: owner.screen_id,
                entry_kind: owner.entry_kind,
                entry_path: owner.entry_path,
              },
            ),
          );
          continue;
        }
        const ownerLabel = owner.screen_id || `(missing; ${owner.screen_spec_path})`;
        pathErrors.push(
          error(
            'non-member-entry-overlap',
            `implementation path ${implementationPath} overlaps non-member screen ${ownerLabel} ${owner.entry_kind}: ${owner.entry_path}`,
            {
              path: implementationPath,
              screen_id: owner.screen_id,
              screen_domain: owner.screen_domain,
              entry_kind: owner.entry_kind,
              entry_path: owner.entry_path,
              screen_spec_path: owner.screen_spec_path,
            },
          ),
        );
      }
    }

    records.push({
      spec,
      surface_id: surfaceId,
      source,
      status: fm.status || 'draft',
      domain: fm.domain || null,
      member_screens: uniqueSorted(memberScreens),
      existing_member_screens: uniqueSorted(
        memberRecords
          .map((member) => member.frontmatter.screen_id)
          .filter((screenId) => screenId !== undefined && screenId !== null && screenId !== '')
          .map(String),
      ),
      valid_member_screens: uniqueSorted(validMembers),
      implementation_paths: uniqueSorted(implementationPaths),
      stub: isStub(spec),
      contract_errors: contractErrors.sort(compareError),
      membership_errors: membershipErrors.sort(compareError),
      path_errors: pathErrors.sort(compareError),
      identity_errors: [],
      decision_fanout_errors: [],
    });
  }

  const byId = new Map();
  for (const record of records) {
    // Group by the public plain-object property key so malformed non-string IDs cannot evade
    // duplicate provenance and then collide later at Object.fromEntries serialization.
    const surfaceKey = String(record.surface_id);
    const rows = byId.get(surfaceKey) || [];
    rows.push(record);
    byId.set(surfaceKey, rows);
  }
  for (const [surfaceId, group] of byId) {
    if (group.length < 2) continue;
    const paths = group.map((record) => record.source.path).sort();
    for (const record of group) {
      record.identity_errors.push(
        error('duplicate-surface-id', `surface_id is globally duplicated: ${surfaceId}`, {
          surface_id: surfaceId,
          locations: paths,
        }),
      );
    }
  }

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const left = records[i];
      const right = records[j];
      for (const leftPath of left.implementation_paths) {
        for (const rightPath of right.implementation_paths) {
          if (!pathsOverlap(leftPath, rightPath)) continue;
          left.path_errors.push(
            error(
              'surface-path-overlap',
              `implementation path ${leftPath} overlaps surface ${right.surface_id}: ${rightPath}`,
              { path: leftPath, other_surface_id: right.surface_id, other_path: rightPath },
            ),
          );
          right.path_errors.push(
            error(
              'surface-path-overlap',
              `implementation path ${rightPath} overlaps surface ${left.surface_id}: ${leftPath}`,
              { path: rightPath, other_surface_id: left.surface_id, other_path: leftPath },
            ),
          );
        }
      }
    }
  }

  for (const record of records) {
    record.identity_errors.sort(compareError);
    record.path_errors.sort(compareError);
  }
  records.sort((a, b) => {
    const byIdOrder = String(a.surface_id).localeCompare(String(b.surface_id));
    if (byIdOrder !== 0) return byIdOrder;
    return a.source.path.localeCompare(b.source.path);
  });
  return records;
}

export function sharedSurfaceInteractionIssues(spec) {
  if (isStub(spec)) return [];
  const table = parseTable(spec.sections['interaction matrix']);
  if (!interactionMatrixIsV2(table)) {
    return [
      error(
        'interaction-v2-required',
        'shared-surface Interaction Matrix must use v2 columns including Result Type; route transitions remain in member ScreenSpecs',
      ),
    ];
  }
  const issues = [];
  table.rows.forEach((row, index) => {
    const resultType = String(col(row, 'Result Type') || '').trim().toLowerCase();
    const result = String(col(row, 'Result') || '').trim();
    const action = String(col(row, 'User Action') || col(row, 'Trigger') || '').trim();
    if (!resultType && !result && !action) return;
    if (resultType === 'route') {
      issues.push(
        error(
          'surface-route-result',
          'Result Type=route is not allowed in a shared surface; put the route edge in each affected member ScreenSpec',
          { row: index + 1 },
        ),
      );
    } else if (!SHARED_SURFACE_RESULT_TYPES.includes(resultType)) {
      issues.push(
        error(
          'invalid-surface-result-type',
          `shared-surface Result Type must be ${SHARED_SURFACE_RESULT_TYPES.join('|')} (actual: ${resultType || '(empty)'})`,
          { row: index + 1 },
        ),
      );
    }
  });
  return issues.sort(compareError);
}
