import path from 'node:path';
import { exists, readFileSafe, splitFrontmatter } from './util.mjs';
import { getSections, hasHeader, parseOpenDecisions, parseTables } from './spec.mjs';

export const OPEN_DECISION_REGISTER_RELATIVE_PATH = path.join('global', 'open-decisions.md');
export const REQUIRED_OPEN_DECISION_COLUMNS = [
  'ID',
  'Decision Needed',
  'Options',
  'Blocking Mode',
  'Owner',
  'Status',
];

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function canonicalSource(docsDir, file) {
  return {
    artifact_id: 'open-decision-register',
    artifact_type: 'open-decision-register',
    path: toPosix(path.relative(docsDir, file)),
  };
}

function compareByIdThenSource(a, b) {
  const byId = String(a.id).localeCompare(String(b.id));
  if (byId !== 0) return byId;
  return String(a.source?.path || '').localeCompare(String(b.source?.path || ''));
}

export function openDecisionRowIsMalformed(row) {
  const status = String(row?.status || '').toLowerCase();
  return !row?.id || !row?.decisionNeeded || !row?.blockingMode || !['open', 'resolved'].includes(status);
}

export function loadOpenDecisionRegister({ docsDir }) {
  const file = path.join(docsDir, OPEN_DECISION_REGISTER_RELATIVE_PATH);
  const source = canonicalSource(docsDir, file);
  if (!exists(file)) {
    return {
      exists: false,
      file,
      source,
      frontmatter: {},
      parsed: null,
      section: undefined,
      rows: [],
      index: new Map(),
      structuralErrors: [],
    };
  }

  const raw = readFileSafe(file) || '';
  const fm = splitFrontmatter(raw);
  const sections = getSections(fm.body || '');
  const section = sections['open decisions'];
  const sectionCount = (fm.body || '')
    .split(/\r?\n/)
    .filter((line) => /^##\s+Open Decisions\s*$/i.test(line.trim())).length;
  const parsed = parseOpenDecisions(section);
  const canonicalTableCount = parseTables(section).filter((table) =>
    ['ID', 'Status', 'Blocking Mode'].every((column) => hasHeader(table.headers, column)),
  ).length;
  const structuralErrors = [];
  if (
    fm.parseError ||
    !fm.hasFrontmatter ||
    fm.data?.artifact_id !== 'open-decision-register' ||
    fm.data?.artifact_type !== 'open-decision-register' ||
    typeof fm.data?.status !== 'string' ||
    fm.data.status.length === 0
  ) {
    structuralErrors.push('invalid-frontmatter');
  }
  if (sectionCount === 0) structuralErrors.push('missing-section');
  if (sectionCount > 1) structuralErrors.push('duplicate-section');
  if (sectionCount > 0 && !parsed.table) structuralErrors.push('unparsable-table');
  if (
    parsed.table &&
    REQUIRED_OPEN_DECISION_COLUMNS.some((column) => !hasHeader(parsed.headers, column))
  ) {
    structuralErrors.push('missing-required-columns');
  }
  if (canonicalTableCount > 1) structuralErrors.push('multiple-decision-tables');

  const index = new Map();
  for (const row of parsed.rows) {
    if (!row.id) continue;
    const rows = index.get(row.id) || [];
    rows.push(row);
    index.set(row.id, rows);
  }

  return {
    exists: true,
    file,
    source,
    frontmatter: fm.data || {},
    parsed,
    section,
    rows: parsed.rows,
    index,
    structuralErrors,
  };
}

function malformedDecision({ id, blockingMode = '(none)', status = '(none)', source, code, reason }) {
  return {
    id: id || '(no-id)',
    blocking_mode: blockingMode || '(none)',
    status: status || '(none)',
    ...(source ? { source } : {}),
    ...(code ? { code } : {}),
    ...(reason ? { reason } : {}),
  };
}

// Generic reference resolver shared by screen state today and future referrer artifact types.
// It never mutates the canonical register and deliberately knows nothing about screen membership.
export function resolveDecisionRefs({ refs, registry, referrer = null, conflictingIds = new Set() }) {
  const resolved = [];
  const blockers = [];
  const malformed = [];
  const source = registry.source;

  if (!Array.isArray(refs)) {
    malformed.push(
      malformedDecision({
        id: '(invalid-decision-refs)',
        source,
        code: 'invalid-refs-shape',
        reason: `decision_refs must be an array${referrer?.artifact_id ? ` (${referrer.artifact_id})` : ''}`,
      }),
    );
    return { resolved, blockers, malformed };
  }

  const seen = new Set();
  const validRefs = [];
  refs.forEach((ref, index) => {
    if (typeof ref !== 'string' || ref.trim().length === 0) {
      malformed.push(
        malformedDecision({
          id: '(invalid-decision-ref)',
          source,
          code: 'invalid-ref',
          reason: `decision_refs[${index}] must be a non-empty string`,
        }),
      );
      return;
    }
    if (seen.has(ref)) {
      malformed.push(
        malformedDecision({
          id: ref,
          source,
          code: 'duplicate-ref',
          reason: 'duplicate decision reference',
        }),
      );
      return;
    }
    seen.add(ref);
    validRefs.push(ref);
  });

  if (validRefs.length === 0) {
    malformed.sort(compareByIdThenSource);
    return { resolved, blockers, malformed };
  }

  if (!registry.exists) {
    for (const id of validRefs) {
      malformed.push(
        malformedDecision({
          id,
          source,
          code: 'missing-register',
          reason: 'open decision register is missing',
        }),
      );
    }
    malformed.sort(compareByIdThenSource);
    return { resolved, blockers, malformed };
  }

  if (registry.structuralErrors.length > 0) {
    for (const id of validRefs) {
      malformed.push(
        malformedDecision({
          id,
          source,
          code: 'invalid-register',
          reason: `open decision register is structurally invalid: ${registry.structuralErrors.join(', ')}`,
        }),
      );
    }
    malformed.sort(compareByIdThenSource);
    return { resolved, blockers, malformed };
  }

  for (const id of validRefs) {
    const rows = registry.index.get(id) || [];
    if (rows.length === 0) {
      malformed.push(
        malformedDecision({
          id,
          source,
          code: 'unresolved-ref',
          reason: 'decision reference is unresolved',
        }),
      );
      continue;
    }
    if (rows.length !== 1 || conflictingIds.has(id)) {
      malformed.push(
        malformedDecision({
          id,
          source,
          code: 'ambiguous-ref',
          reason: 'decision reference is ambiguous',
        }),
      );
      continue;
    }

    const row = rows[0];
    if (openDecisionRowIsMalformed(row)) {
      malformed.push(
        malformedDecision({
          id,
          blockingMode: row.blockingMode,
          status: row.status,
          source,
          code: 'malformed-row',
          reason: 'referenced decision row is malformed',
        }),
      );
      continue;
    }

    const decision = {
      id: row.id,
      status: row.status.toLowerCase(),
      blocking_mode: row.blockingMode,
      owner: row.owner,
      decision_needed: row.decisionNeeded,
      source,
    };
    resolved.push(decision);
    if (decision.status === 'open') {
      blockers.push({
        id: decision.id,
        decision_needed: decision.decision_needed,
        blocking_mode: decision.blocking_mode,
        owner: decision.owner,
        source: decision.source,
      });
    }
  }

  resolved.sort(compareByIdThenSource);
  blockers.sort(compareByIdThenSource);
  malformed.sort(compareByIdThenSource);
  return { resolved, blockers, malformed };
}
