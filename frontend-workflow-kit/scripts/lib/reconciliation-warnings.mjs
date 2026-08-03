// Reconciliation Contract v2 warning-only semantic drift analyzers.
//
// Boundary:
// - hard structure/reference/routing validation remains in reconciliation-items.mjs.
// - this module only emits advisory *-1xx messages from already parsed/indexed views.
// - no warning changes exit status, --enforce behavior, document state, or child status.
import { resolveInputEvidence } from './provenance.mjs';
import {
  artifactHasSection,
  isDuplicateArtifactId,
  resolveArtifact,
  resolveChildRow,
} from './reconciliation-target-index.mjs';

export const RECONCILIATION_WARNING_CODES = [
  'RR-ROUTE-101',
  'RR-STALE-101',
  'RR-STALE-102',
  'RR-STALE-103',
];

const AFFIRMATIVE_CONFLICT_MARKERS = [
  { label: '충돌', pattern: /충돌/u },
  { label: '상충', pattern: /상충/u },
  { label: '양립 불가', pattern: /양립\s*불가/u },
  { label: '양립할 수 없', pattern: /양립할\s+수\s+없/u },
  { label: '서로 모순', pattern: /서로\s+모순/u },
  { label: '동시에 만족할 수 없', pattern: /동시에\s+만족할\s+수\s+없/u },
  { label: 'conflict', pattern: /\bconflict\b/iu },
  { label: 'conflicts with', pattern: /\bconflicts\s+with\b/iu },
  { label: 'contradict', pattern: /\bcontradict\b/iu },
  { label: 'contradicts', pattern: /\bcontradicts\b/iu },
  { label: 'contradictory', pattern: /\bcontradictory\b/iu },
  { label: 'mutually exclusive', pattern: /\bmutually\s+exclusive\b/iu },
  { label: 'incompatible', pattern: /\bincompatible\b/iu },
  { label: 'cannot both', pattern: /\bcannot\s+both\b/iu },
];

const QUESTION_PATTERNS = [
  /[?？]/u,
  /충돌\s*여부/u,
  /충돌인지/u,
  /상충하는지/u,
  /\bwhether\b/iu,
  /\bis\s+this\s+a\s+conflict\b/iu,
];
const UNCERTAINTY_PATTERNS = [
  /가능성/u,
  /아마/u,
  /추정/u,
  /\b(?:possible|possibly)\b/iu,
  /\bpotentially\b/iu,
  /\bmay\b/iu,
  /\bmight\b/iu,
];
const NEGATION_PATTERNS = [
  /충돌\s*아님/u,
  /충돌하지\s*않/u,
  /상충하지\s*않/u,
  /양립\s*가능/u,
  /\bno\s+conflict\b/iu,
  /\bnot\s+a\s+conflict\b/iu,
  /\bdo\s+not\s+conflict\b/iu,
  /\bdoes\s+not\s+conflict\b/iu,
  /\bdo(?:es)?n['’]t\s+conflict\b/iu,
  /\bcompatible\b/iu,
];

function stableCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizedProse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function matchAffirmativeConflictMarker(value) {
  const text = normalizedProse(value);
  if (!text) return null;
  if ([...QUESTION_PATTERNS, ...UNCERTAINTY_PATTERNS, ...NEGATION_PATTERNS].some((pattern) => pattern.test(text))) {
    return null;
  }
  for (const marker of AFFIRMATIVE_CONFLICT_MARKERS) {
    if (marker.pattern.test(text)) return marker.label;
  }
  return null;
}

export function extractCanonicalInputIds(value) {
  const text = String(value || '');
  const ids = new Set();
  const pattern = /(^|[^A-Za-z0-9._-])(IN-[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*)(?=$|[^A-Za-z0-9._-])/g;
  let match;
  while ((match = pattern.exec(text)) !== null) ids.add(match[2]);
  return [...ids].sort(stableCompare);
}

function entryTrustworthy(entry) {
  return entry?.rowHardValid === true && entry.target !== null;
}

function targetResolutionTrustworthy(target, targetIndex) {
  if (!target) return false;
  if (target.kind === 'artifact') {
    if (isDuplicateArtifactId(targetIndex, target.artifactId)) return false;
    const record = resolveArtifact(targetIndex, target.artifactId);
    if (!record) return false;
    if (target.section && !artifactHasSection(record, target.section)) return false;
    return true;
  }
  if (target.kind === 'none' || target.kind === 'input') return true;
  if (isDuplicateArtifactId(targetIndex, target.ownerArtifactId)) return false;
  const record = resolveArtifact(targetIndex, target.ownerArtifactId);
  if (!record) return false;
  if (target.kind === 'investigation' || target.kind === 'verification') return true;
  const resolved = resolveChildRow(record, target.rowId, target.kind);
  return resolved.found && !resolved.familyMismatch && !resolved.ambiguous;
}

function unknownTargetsTrustworthy(entries, targetIndex) {
  const unknowns = entries.filter((entry) => entry.target?.kind === 'unknown');
  if (unknowns.length === 0) return false;
  return unknowns.every((entry) => targetResolutionTrustworthy(entry.target, targetIndex));
}

function scopeUnclearComboAllowed(entry) {
  const { row, target } = entry;
  if (!target) return false;
  if (target.kind === 'unknown' || target.kind === 'decision') {
    return ['create-open', 'link-evidence', 'record'].includes(row.effect);
  }
  if (target.kind === 'artifact') return ['update', 'create', 'record'].includes(row.effect);
  return false;
}

function findConflictEvidence(entries, inputIndex) {
  const candidates = [];
  for (const { row } of entries) {
    const evidence = resolveInputEvidence(inputIndex, row.evidence);
    if (
      evidence.status !== 'ok' ||
      evidence.ref?.bulletIndex === null ||
      evidence.ref?.inputId !== row.inputId ||
      typeof evidence.evidenceText !== 'string'
    ) {
      continue;
    }
    const marker = matchAffirmativeConflictMarker(evidence.evidenceText);
    if (!marker) continue;
    const explicitIds = extractCanonicalInputIds(evidence.evidenceText);
    const orderedIds = [
      evidence.ref.inputId,
      ...explicitIds.filter((id) => id !== evidence.ref.inputId),
    ];
    if (new Set(orderedIds).size < 2) continue;
    candidates.push({
      evidencePointer: evidence.ref.raw,
      inputIds: [...new Set(orderedIds)],
      marker,
    });
  }
  candidates.sort(
    (a, b) =>
      stableCompare(a.evidencePointer, b.evidencePointer) ||
      stableCompare(a.marker, b.marker) ||
      stableCompare(a.inputIds.join('\0'), b.inputIds.join('\0')),
  );
  return candidates[0] || null;
}

function routeWarningCandidates({ groups, groupTrust, inputIndex, targetIndex, structuredInputs, summaryOrder }) {
  const candidates = [];
  for (const [key, entries] of groups || []) {
    const separator = key.indexOf('\0');
    const inputId = separator >= 0 ? key.slice(0, separator) : '';
    const itemId = separator >= 0 ? key.slice(separator + 1) : '';
    if (!structuredInputs?.has(inputId) || groupTrust?.get(key) !== true) continue;
    if (!entries.length || entries.some((entry) => !entryTrustworthy(entry))) continue;
    if (entries.some((entry) => entry.row.basis !== 'scope-unclear' || entry.row.classification !== 'scope-unclear')) {
      continue;
    }
    if (entries.some((entry) => !scopeUnclearComboAllowed(entry))) continue;
    if (!unknownTargetsTrustworthy(entries, targetIndex)) continue;

    const evidence = findConflictEvidence(entries, inputIndex);
    if (!evidence) continue;
    const unknownTargets = [...new Set(entries.filter((entry) => entry.target?.kind === 'unknown').map((entry) => entry.target.raw))]
      .sort(stableCompare);
    candidates.push({
      summaryOrder: summaryOrder.get(inputId) ?? Number.MAX_SAFE_INTEGER,
      itemOrder: /^\d{2}$/.test(itemId) ? Number(itemId) : Number.MAX_SAFE_INTEGER,
      code: 'RR-ROUTE-101',
      evidenceKey: evidence.evidencePointer,
      message:
        `RR-ROUTE-101: item ${inputId}#${itemId} may be an input-input conflict routed as ` +
        `scope-unclear/scope-unclear — unknown target(s) [${unknownTargets.join(', ')}]; ` +
        `evidence ${evidence.evidencePointer} matched inputs [${evidence.inputIds.join(', ')}] and marker ` +
        `'${evidence.marker}'; reviewer: recheck Basis/Classification/Conflict target (no automatic rewrite)`,
    });
  }
  return candidates;
}

function decisionStatus(target, targetIndex) {
  if (!target || target.kind !== 'decision') return null;
  if (isDuplicateArtifactId(targetIndex, target.ownerArtifactId)) return null;
  const owner = resolveArtifact(targetIndex, target.ownerArtifactId);
  if (!owner) return null;
  const resolved = resolveChildRow(owner, target.rowId, 'decision');
  if (
    !resolved.found ||
    resolved.familyMismatch ||
    resolved.ambiguous ||
    !resolved.statusKnown ||
    !['open', 'resolved'].includes(resolved.normalizedStatus)
  ) {
    return null;
  }
  return { target: target.raw, status: resolved.normalizedStatus };
}

function staleWarningCandidates({ summaryRows, structuredInputs, groups, groupTrust, itemsByInput, summaryTrust, targetIndex, summaryOrder }) {
  const candidates = [];
  const summaryCounts = new Map();
  const summaryByInput = new Map();
  for (const row of summaryRows || []) {
    if (!row.inputId) continue;
    summaryCounts.set(row.inputId, (summaryCounts.get(row.inputId) || 0) + 1);
    if (!summaryByInput.has(row.inputId)) summaryByInput.set(row.inputId, row);
  }

  const entriesByInput = new Map();
  const entryByRow = new Map();
  for (const [key, entries] of groups || []) {
    const separator = key.indexOf('\0');
    const inputId = separator >= 0 ? key.slice(0, separator) : '';
    if (!entriesByInput.has(inputId)) entriesByInput.set(inputId, []);
    for (const entry of entries) {
      entriesByInput.get(inputId).push({ ...entry, groupKey: key });
      entryByRow.set(entry.row, { ...entry, groupKey: key });
    }
  }

  for (const [inputId, row] of summaryByInput) {
    if (
      !structuredInputs?.has(inputId) ||
      summaryCounts.get(inputId) !== 1 ||
      summaryTrust?.get(inputId) !== true
    ) {
      continue;
    }
    if (!['pending-user-decision', 'accepted', 'no-change'].includes(row.result)) continue;

    const itemRows = itemsByInput?.get(inputId) || [];
    if (itemRows.length === 0) continue;
    const rowEntries = itemRows.map((itemRow) => entryByRow.get(itemRow));
    if (
      rowEntries.some(
        (entry) => !entryTrustworthy(entry) || groupTrust?.get(entry.groupKey) !== true,
      )
    ) {
      continue;
    }

    const decisionEntries = (entriesByInput.get(inputId) || []).filter((entry) => entry.target?.kind === 'decision');
    if (decisionEntries.length === 0) {
      if (row.result !== 'pending-user-decision') continue;
      candidates.push({
        summaryOrder: summaryOrder.get(inputId) ?? Number.MAX_SAFE_INTEGER,
        itemOrder: Number.MAX_SAFE_INTEGER,
        code: 'RR-STALE-101',
        evidenceKey: '',
        message:
          `RR-STALE-101: input ${inputId} Summary Result=pending-user-decision but canonical ` +
          `Reconciliation Items contain no decision:* target; reviewer: check for a missing Decision target ` +
          `or stale Summary Result (no automatic Decision creation or Result rewrite)`,
      });
      continue;
    }

    if (decisionEntries.some((entry) => groupTrust?.get(entry.groupKey) !== true)) continue;
    const statuses = [];
    let trustworthy = true;
    const seenTargets = new Set();
    for (const entry of decisionEntries) {
      if (seenTargets.has(entry.target.raw)) continue;
      seenTargets.add(entry.target.raw);
      const status = decisionStatus(entry.target, targetIndex);
      if (!status) {
        trustworthy = false;
        break;
      }
      statuses.push(status);
    }
    if (!trustworthy || statuses.length === 0) continue;
    statuses.sort((a, b) => stableCompare(a.target, b.target));

    if (row.result === 'pending-user-decision' && statuses.every((entry) => entry.status === 'resolved')) {
      candidates.push({
        summaryOrder: summaryOrder.get(inputId) ?? Number.MAX_SAFE_INTEGER,
        itemOrder: Number.MAX_SAFE_INTEGER,
        code: 'RR-STALE-102',
        evidenceKey: statuses.map((entry) => entry.target).join('\0'),
        message:
          `RR-STALE-102: input ${inputId} Summary Result=pending-user-decision but all Decision targets ` +
          `are currently resolved [${statuses.map((entry) => entry.target).join(', ')}]; reviewer: check whether ` +
          `Summary Result was left stale after Decision resolution (no automatic Result recommendation)`,
      });
    } else if (
      (row.result === 'accepted' || row.result === 'no-change') &&
      statuses.some((entry) => entry.status === 'open')
    ) {
      const openTargets = statuses.filter((entry) => entry.status === 'open').map((entry) => entry.target);
      candidates.push({
        summaryOrder: summaryOrder.get(inputId) ?? Number.MAX_SAFE_INTEGER,
        itemOrder: Number.MAX_SAFE_INTEGER,
        code: 'RR-STALE-103',
        evidenceKey: openTargets.join('\0'),
        message:
          `RR-STALE-103: input ${inputId} Summary Result=${row.result} while open Decision target(s) remain ` +
          `[${openTargets.join(', ')}]; reviewer: confirm whether accepted/no-change is intentional and ` +
          `review whether pending-user-decision or mixed is needed (no automatic rewrite)`,
      });
    }
  }
  return candidates;
}

export function analyzeReconciliationWarnings({
  summaryRows = [],
  structuredInputs = new Set(),
  groups = new Map(),
  groupTrust = new Map(),
  itemsByInput = new Map(),
  summaryTrust = new Map(),
  inputIndex,
  targetIndex,
} = {}) {
  const summaryOrder = new Map();
  summaryRows.forEach((row, index) => {
    if (row.inputId && !summaryOrder.has(row.inputId)) summaryOrder.set(row.inputId, index);
  });

  const candidates = [
    ...routeWarningCandidates({ groups, groupTrust, inputIndex, targetIndex, structuredInputs, summaryOrder }),
    ...staleWarningCandidates({
      summaryRows,
      structuredInputs,
      groups,
      groupTrust,
      itemsByInput,
      summaryTrust,
      targetIndex,
      summaryOrder,
    }),
  ];
  candidates.sort(
    (a, b) =>
      a.summaryOrder - b.summaryOrder ||
      a.itemOrder - b.itemOrder ||
      stableCompare(a.code, b.code) ||
      stableCompare(a.evidenceKey, b.evidenceKey),
  );
  return candidates.map((candidate) => candidate.message);
}
