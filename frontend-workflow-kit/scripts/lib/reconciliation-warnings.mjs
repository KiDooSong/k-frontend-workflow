// Reconciliation Contract v2 warning-only semantic drift analyzers.
//
// Boundary:
// - hard structure/reference/routing validation remains in reconciliation-items.mjs.
// - this module only emits advisory *-1xx messages from already parsed/indexed views.
// - no warning changes exit status, --enforce behavior, document state, or child status.
import { INPUT_ID_PATTERN } from './input-artifact.mjs';
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
  {
    label: '충돌',
    pattern: /충돌/u,
    negations: [
      /충돌\s*(?:이|은|는|도)?\s*(?:아님|아니)/u,
      /충돌하지(?:는|도)?\s*않/u,
      /충돌\s*(?:이|은|는|도)?\s*없(?:음|다|는)/u,
    ],
  },
  {
    label: '상충',
    pattern: /상충/u,
    negations: [
      /상충\s*(?:이|은|는|도)?\s*(?:아님|아니)/u,
      /상충하지(?:는|도)?\s*않/u,
      /상충\s*(?:이|은|는|도)?\s*없(?:음|다|는)/u,
    ],
  },
  {
    label: '양립 불가',
    pattern: /양립\s*불가/u,
    negations: [
      /양립\s*불가하지(?:는|도)?\s*않/u,
      /양립\s*불가한\s*것은\s*아니/u,
      /양립\s*불가\s*(?:가|는|은)?\s*아니/u,
      /양립\s*가능/u,
    ],
  },
  {
    label: '양립할 수 없',
    pattern: /양립할\s+수\s+없/u,
    negations: [
      /양립할\s+수\s+없(?:는\s*것은\s*아니|지는\s*않)/u,
      /양립할\s+수\s+있/u,
    ],
  },
  {
    label: '서로 모순',
    pattern: /서로\s+모순/u,
    negations: [
      /(?:서로\s+)?모순되지(?:는|도)?\s*않/u,
      /(?:서로\s+)?모순\s*(?:이|은|는|도)?\s*아니/u,
      /(?:서로\s+)?모순\s*(?:이|은|는|도)?\s*없(?:음|다|는)/u,
    ],
  },
  {
    label: '동시에 만족할 수 없',
    pattern: /동시에\s+만족할\s+수\s+없/u,
    negations: [
      /동시에\s+만족할\s+수\s+없(?:는\s*것은\s*아니|지는\s*않)/u,
      /동시에\s+만족할\s+수\s+있/u,
    ],
  },
  {
    label: 'conflict',
    pattern: /\bconflict\b/iu,
    negations: [
      /\b(?:no[-\s]?conflict|conflict[-\s]?free)\b/iu,
      /\bnot\s+(?:necessarily\s+)?(?:a\s+|in\s+)?conflict\b/iu,
      /\b(?:is|are|was|were)\s+not\s+(?:necessarily\s+)?(?:a\s+|in\s+)?conflict\b/iu,
      /\b(?:is|are|was|were)n['’]t\s+(?:necessarily\s+)?(?:a\s+|in\s+)?conflict\b/iu,
      /\b(?:do|does|did)\s+not\s+conflict\b/iu,
      /\b(?:do|does|did)n['’]t\s+conflict\b/iu,
      /\bwithout\s+conflict\b/iu,
    ],
  },
  {
    label: 'conflicts with',
    pattern: /\bconflicts\s+with\b/iu,
    negations: [
      /\bdoes\s+not\s+conflict\s+with\b/iu,
      /\bdoesn['’]t\s+conflict\s+with\b/iu,
      /\bnot\s+(?:necessarily\s+)?conflicts?\s+with\b/iu,
    ],
  },
  {
    label: 'contradict',
    pattern: /\bcontradict\b/iu,
    negations: [
      /\b(?:do|does|did)\s+not\s+contradict\b/iu,
      /\b(?:do|does|did)n['’]t\s+contradict\b/iu,
      /\bnot\s+(?:necessarily\s+)?contradict\b/iu,
    ],
  },
  {
    label: 'contradicts',
    pattern: /\bcontradicts\b/iu,
    negations: [
      /\bdoes\s+not\s+contradict\b/iu,
      /\bdoesn['’]t\s+contradict\b/iu,
      /\bnot\s+(?:necessarily\s+)?contradicts\b/iu,
    ],
  },
  {
    label: 'contradictory',
    pattern: /\bcontradictory\b/iu,
    negations: [
      /\bnot\s+(?:necessarily\s+)?contradictory\b/iu,
      /\b(?:is|are|was|were)\s+not\s+(?:necessarily\s+)?contradictory\b/iu,
      /\b(?:is|are|was|were)n['’]t\s+(?:necessarily\s+)?contradictory\b/iu,
    ],
  },
  {
    label: 'mutually exclusive',
    pattern: /\bmutually\s+exclusive\b/iu,
    negations: [
      /\bnot\s+(?:necessarily\s+)?mutually\s+exclusive\b/iu,
      /\b(?:is|are|was|were)\s+not\s+(?:necessarily\s+)?mutually\s+exclusive\b/iu,
      /\b(?:is|are|was|were)n['’]t\s+(?:necessarily\s+)?mutually\s+exclusive\b/iu,
    ],
  },
  {
    label: 'incompatible',
    pattern: /\bincompatible\b/iu,
    negations: [
      /\bnot\s+(?:necessarily\s+)?incompatible\b/iu,
      /\b(?:is|are|was|were)\s+not\s+(?:necessarily\s+)?incompatible\b/iu,
      /\b(?:is|are|was|were)n['’]t\s+(?:necessarily\s+)?incompatible\b/iu,
    ],
  },
  {
    label: 'cannot both',
    pattern: /\bcannot\s+both\b/iu,
    negations: [
      /\bnot\s+(?:true\s+)?that\b.{0,32}\bcannot\s+both\b/iu,
    ],
  },
];

const QUESTION_PATTERNS = [
  /[?？]/u,
  /(?:충돌|상충|모순|양립\s*불가)\s*(?:여부|인지|하는지|하는가|되는지|되는가)/u,
  /양립할\s+수\s+없(?:는지|는가)/u,
  /\bwhether\b/iu,
  /\b(?:check|determine|verify|confirm|assess|test|find\s+out|wonder|ask|inquire|investigate)\b.{0,48}\b(?:whether|if)\b/iu,
  /^\s*(?:q(?:uestion)?\s*[:：-]\s*)?(?:are|is|do|does|did|can|could|would|should|was|were)\b/iu,
];
const UNCERTAINTY_PATTERNS = [
  /가능성/u,
  /아마/u,
  /추정/u,
  /(?:충돌|상충|모순|양립\s*불가)(?:할|일)?\s*수\s*있/u,
  /(?:충돌|상충|모순|양립\s*불가)(?:할|일)?지도\s*모른/u,
  /\b(?:possible|possibly|potentially|apparently|likely)\b/iu,
  /\b(?:may|might|would)\b/iu,
  /\b(?:can|could)\s+(?:potentially\s+)?(?:conflict|contradict)\b/iu,
  /\b(?:can|could)\s+be\s+(?:incompatible|contradictory|mutually\s+exclusive)\b/iu,
  /\b(?:appears?|seems?)\s+(?:to\s+be\s+)?(?:incompatible|contradictory|mutually\s+exclusive)\b/iu,
  /\b(?:appears?|seems?)\s+to\s+(?:conflict|contradict)\b/iu,
];
const COMMON_DENIAL_PATTERNS = [
  /\bnot\s+true\s+that\b/iu,
  /\b(?:cannot|can['’]t|could\s+not|couldn['’]t)\s+(?:say|claim|conclude|assert|determine)\s+(?:that\s+)?/iu,
  /(?:충돌|상충|모순|양립\s*불가)(?:한|한다고|이라고)?\s*것은\s*아니/u,
  /(?:충돌|상충|모순|양립\s*불가).{0,24}(?:단정|말|주장|결론).{0,16}(?:할|내릴)\s*수\s*없/u,
  /(?:충돌|상충|모순|양립\s*불가).{0,24}보기\s*어렵/u,
  /(?:서로\s+)?모순이라고\s*할\s*수\s*없/u,
];

function stableCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizedProse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function markerOccurrences(text, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  const matches = [];
  let match;
  while ((match = matcher.exec(text)) !== null) {
    matches.push({ index: match.index, text: match[0] });
    if (match[0] === '') matcher.lastIndex += 1;
  }
  return matches;
}

function clauseAroundMarker(text, markerStart, markerEnd) {
  let left = 0;
  let right = text.length;
  const boundaries = /[.!?。！？;\n]+|,\s*(?:but|however|yet)\b|\b(?:but|however|yet)\b|(?:하지만|그러나|반면)/giu;
  let match;
  while ((match = boundaries.exec(text)) !== null) {
    const boundaryEnd = match.index + match[0].length;
    if (boundaryEnd <= markerStart) {
      left = boundaryEnd;
      continue;
    }
    if (match.index >= markerEnd) {
      right = boundaryEnd;
      break;
    }
  }
  return { text: text.slice(left, right).trim(), start: left, end: right };
}

function markerPolarityContext(clause, markerStart, markerLength) {
  const localStart = Math.max(0, markerStart - clause.start);
  return clause.text.slice(
    Math.max(0, localStart - 40),
    Math.min(clause.text.length, localStart + markerLength + 56),
  );
}

export function findAffirmativeConflictClauses(value) {
  const text = normalizedProse(value);
  if (!text) return [];

  const occurrences = [];
  AFFIRMATIVE_CONFLICT_MARKERS.forEach((marker, markerOrder) => {
    for (const occurrence of markerOccurrences(text, marker.pattern)) {
      occurrences.push({ marker, markerOrder, ...occurrence });
    }
  });
  occurrences.sort(
    (a, b) =>
      a.index - b.index ||
      a.markerOrder - b.markerOrder ||
      stableCompare(a.text, b.text),
  );

  const candidates = [];
  for (const occurrence of occurrences) {
    const { marker } = occurrence;
    const clause = clauseAroundMarker(
      text,
      occurrence.index,
      occurrence.index + occurrence.text.length,
    );
    if (
      [...QUESTION_PATTERNS, ...UNCERTAINTY_PATTERNS, ...COMMON_DENIAL_PATTERNS]
        .some((pattern) => pattern.test(clause.text))
    ) {
      continue;
    }
    const polarityContext = markerPolarityContext(
      clause,
      occurrence.index,
      occurrence.text.length,
    );
    if (marker.negations.some((pattern) => pattern.test(polarityContext))) continue;
    candidates.push({
      label: marker.label,
      clauseText: clause.text,
      clauseStart: clause.start,
      clauseEnd: clause.end,
      markerStart: occurrence.index,
      markerEnd: occurrence.index + occurrence.text.length,
    });
  }
  return candidates;
}

export function matchAffirmativeConflictMarker(value) {
  return findAffirmativeConflictClauses(value)[0]?.label || null;
}

function nonWhitespaceSegment(text, start, end) {
  let segmentStart = start;
  while (segmentStart > 0 && !/\s/u.test(text[segmentStart - 1])) segmentStart -= 1;
  let segmentEnd = end;
  while (segmentEnd < text.length && !/\s/u.test(text[segmentEnd])) segmentEnd += 1;
  return {
    segment: text.slice(segmentStart, segmentEnd),
    localStart: start - segmentStart,
    localEnd: end - segmentStart,
  };
}

function occurrenceLooksPathLike(text, start, end) {
  const before = text[start - 1] || '';
  const after = text[end] || '';
  if (before === '/' || before === '\\' || after === '/' || after === '\\') return true;
  if (after === '.' && /[A-Za-z0-9_-]/u.test(text[end + 1] || '')) return true;

  const { segment, localStart, localEnd } = nonWhitespaceSegment(text, start, end);
  const prefix = segment.slice(0, localStart);
  const suffix = segment.slice(localEnd);

  // Precision-first: a canonical-looking ID inside a path, URI, query pair,
  // key/value token, or filename is not prose evidence about another input.
  if (/[\\/]/u.test(segment)) return true;
  if (/(?:^|[^A-Za-z0-9+.-])[A-Za-z][A-Za-z0-9+.-]*:/u.test(prefix)) return true;
  if (/^[?&]/u.test(segment)) return true;
  if (/(?:^|[?&])[^\s=&#?]+=/u.test(prefix)) return true;
  if (/^[^\s=]+=/u.test(prefix)) return true;
  if (/^\.[A-Za-z0-9_-]+/u.test(suffix)) return true;
  if (/^[?&][^\s=&#?]+=/u.test(suffix)) return true;
  return false;
}

export function extractCanonicalInputIds(value) {
  const text = String(value || '');
  const ids = new Set();
  const candidates = /(^|[^A-Za-z0-9._-])(IN-[A-Za-z0-9._-]+)/g;
  let match;
  while ((match = candidates.exec(text)) !== null) {
    const candidate = match[2].replace(/\.+$/u, '');
    const start = match.index + match[1].length;
    const end = start + candidate.length;
    if (!INPUT_ID_PATTERN.test(candidate)) continue;
    if (occurrenceLooksPathLike(text, start, end)) continue;
    ids.add(candidate);
  }
  return [...ids].sort(stableCompare);
}

function inputIdResolvesUniquely(inputIndex, inputId) {
  return (inputIndex?.byId?.get(inputId) || []).length === 1;
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
      !INPUT_ID_PATTERN.test(evidence.ref?.inputId || '') ||
      !inputIdResolvesUniquely(inputIndex, evidence.ref?.inputId) ||
      typeof evidence.evidenceText !== 'string'
    ) {
      continue;
    }
    // Preserve the prior fail-closed boundary for the whole exact bullet: a
    // canonical-looking input that is missing or ambiguous suppresses this evidence.
    const allExplicitIds = extractCanonicalInputIds(evidence.evidenceText);
    if (allExplicitIds.some((inputId) => !inputIdResolvesUniquely(inputIndex, inputId))) {
      continue;
    }

    // The semantic relation is clause-local. Do not combine an input named in one
    // sentence/semicolon clause with an unrelated conflict marker in another.
    for (const markerCandidate of findAffirmativeConflictClauses(evidence.evidenceText)) {
      const explicitIds = extractCanonicalInputIds(markerCandidate.clauseText);
      if (explicitIds.some((inputId) => !inputIdResolvesUniquely(inputIndex, inputId))) {
        continue;
      }
      const orderedIds = [
        evidence.ref.inputId,
        ...explicitIds.filter((id) => id !== evidence.ref.inputId),
      ];
      if (new Set(orderedIds).size < 2) continue;
      candidates.push({
        evidencePointer: evidence.ref.raw,
        inputIds: [...new Set(orderedIds)],
        marker: markerCandidate.label,
        clauseStart: markerCandidate.clauseStart,
        markerStart: markerCandidate.markerStart,
      });
      break;
    }
  }
  candidates.sort(
    (a, b) =>
      stableCompare(a.evidencePointer, b.evidencePointer) ||
      a.clauseStart - b.clauseStart ||
      a.markerStart - b.markerStart ||
      stableCompare(a.marker, b.marker) ||
      stableCompare(a.inputIds.join('\0'), b.inputIds.join('\0')),
  );
  return candidates[0] || null;
}

function routeWarningCandidates({
  groups,
  groupTrust,
  summaryTrust,
  inputIndex,
  targetIndex,
  structuredInputs,
  summaryOrder,
}) {
  const candidates = [];
  for (const [key, entries] of groups || []) {
    const separator = key.indexOf('\0');
    const inputId = separator >= 0 ? key.slice(0, separator) : '';
    const itemId = separator >= 0 ? key.slice(separator + 1) : '';
    if (
      !structuredInputs?.has(inputId) ||
      groupTrust?.get(key) !== true ||
      summaryTrust?.get(inputId) !== true
    ) {
      continue;
    }
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
    ...routeWarningCandidates({
      groups,
      groupTrust,
      summaryTrust,
      inputIndex,
      targetIndex,
      structuredInputs,
      summaryOrder,
    }),
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
