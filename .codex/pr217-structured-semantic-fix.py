from pathlib import Path
import re


def sub_once(path: str, pattern: str, replacement: str, *, flags: int = 0) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{path}: expected one replacement, got {count}")
    file.write_text(updated, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one exact replacement, got {count}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


warnings = "frontend-workflow-kit/scripts/lib/reconciliation-warnings.mjs"
warning_tests = "frontend-workflow-kit/scripts/lib/reconciliation-warnings.test.mjs"
integration_tests = "frontend-workflow-kit/scripts/lib/reconciliation-items.test.mjs"
canonical = "frontend-workflow-kit/docs/reference/input-reconciliation.md"
design = "kit-dev/docs/design/drafts/issue-202-reconciliation-contract-v2.md"

# Replace the relation scanner with a same-length semantic view. Identifier and
# structured-token spans are blanked only for semantic regexes; original text and
# offsets remain available for canonical input extraction and warning provenance.
sub_once(
    warnings,
    r"function relationBoundaries\(text\) \{.*?\n\}\n\nfunction clauseAroundMarker\(text, markerStart, markerEnd\) \{.*?\n\}\n\nfunction markerPolarityContext\(clause, markerStart, markerLength\) \{.*?\n\}",
    r'''function inputIdentifierSpans(text) {
  const spans = [];
  const candidates = /(^|[^A-Za-z0-9._-])(IN-[A-Za-z0-9._-]+)/g;
  let match;
  while ((match = candidates.exec(text)) !== null) {
    const token = match[2].replace(/\.+$/u, '');
    if (!token) continue;
    const start = match.index + match[1].length;
    spans.push({ start, end: start + token.length, kind: 'input-id' });
  }
  return spans;
}

function structuredTokenSpans(text) {
  const spans = [];
  const tokens = /\S+/gu;
  let match;
  while ((match = tokens.exec(text)) !== null) {
    const segment = match[0];
    let left = 0;
    let right = segment.length;
    while (left < right && /[([{<"'`]/u.test(segment[left])) left += 1;
    while (right > left && /[)\]}>"'`,.!?;:。！？；，]/u.test(segment[right - 1])) right -= 1;
    const core = segment.slice(left, right);
    if (!core) continue;
    const structured =
      /[\\/]/u.test(core) ||
      /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$/u.test(core) ||
      /^[?&][^\s=&#?]+=/u.test(core) ||
      /(?:^|[?&])[^\s=&#?]+=/u.test(core) ||
      /^[^\s=]+=[^\s=]+$/u.test(core) ||
      /\.[A-Za-z0-9_-]{1,16}(?:[?#].*)?$/u.test(core);
    if (!structured) continue;
    spans.push({
      start: match.index + left,
      end: match.index + right,
      kind: 'structured-token',
    });
  }
  return spans;
}

function semanticAnalysisText(text) {
  const chars = text.split('');
  const spans = [...inputIdentifierSpans(text), ...structuredTokenSpans(text)]
    .sort((a, b) => a.start - b.start || b.end - a.end || stableCompare(a.kind, b.kind));
  for (const span of spans) {
    for (let index = span.start; index < span.end; index += 1) {
      if (!/\s/u.test(chars[index])) chars[index] = ' ';
    }
  }
  return chars.join('');
}

function canonicalInputStartsAt(text, start) {
  const whitespace = /^\s*/u.exec(text.slice(start))?.[0].length || 0;
  const tokenStart = start + whitespace;
  const match = /^IN-[A-Za-z0-9._-]+/u.exec(text.slice(tokenStart));
  if (!match) return false;
  return INPUT_ID_PATTERN.test(match[0].replace(/\.+$/u, ''));
}

function currentInputDeicticStartsAt(text, start) {
  const whitespace = /^\s*/u.exec(text.slice(start))?.[0].length || 0;
  return /^(?:(?:the\s+)?(?:current|this)\s+input|this\s+reconciliation\s+input|현재\s*입력|이\s*입력)(?=$|[\s,.;!?。！？])/iu
    .test(text.slice(start + whitespace));
}

function sentenceStartBefore(text, offset) {
  let start = 0;
  const boundaries = /[.!?。！？;]+/gu;
  let match;
  while ((match = boundaries.exec(text.slice(0, offset))) !== null) {
    start = match.index + match[0].length;
  }
  return start;
}

function commaAndIsSerialInputList(text, commaStart, connectorEnd) {
  const left = text.slice(sentenceStartBefore(text, commaStart), commaStart);
  if (extractCanonicalInputIds(left).length < 2) return false;
  const residue = semanticAnalysisText(left)
    .replace(/\b(?:and|or)\b/giu, '')
    .replace(/[\s,]+/gu, '');
  if (residue) return false;
  return canonicalInputStartsAt(text, connectorEnd) || currentInputDeicticStartsAt(text, connectorEnd);
}

function relationBoundaries(text, semanticText) {
  const boundaries = [];
  const addMatches = (pattern, kind) => {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const matcher = new RegExp(pattern.source, flags);
    let match;
    while ((match = matcher.exec(semanticText)) !== null) {
      boundaries.push({
        start: match.index,
        end: match.index + match[0].length,
        kind,
      });
      if (match[0] === '') matcher.lastIndex += 1;
    }
  };

  addMatches(/[.!?。！？;\n]+/gu, 'punctuation');
  addMatches(/,\s*(?:but|however|yet|while|whereas|although|though)\b/giu, 'coordination');
  addMatches(/\b(?:but|however|yet|while|whereas|although|though)\b/giu, 'coordination');

  const commaAnd = /,\s*and\b/giu;
  let commaAndMatch;
  while ((commaAndMatch = commaAnd.exec(semanticText)) !== null) {
    const end = commaAndMatch.index + commaAndMatch[0].length;
    if (!commaAndIsSerialInputList(text, commaAndMatch.index, end)) {
      boundaries.push({ start: commaAndMatch.index, end, kind: 'coordination' });
    }
  }

  addMatches(/(?:하지만|그러나|반면|한편|반대로|그와\s+별개로)/gu, 'coordination');
  addMatches(
    /(?:동일하|같|일치하|호환되|부합하|참고하|참조하|따르|관련되|기반하|유지되)(?:고|며|지만|나|으나|면서|으면서),?\s*/gu,
    'coordination',
  );
  addMatches(
    /(?:동일한데|같은데|참고하는데|참조하는데|따르는데|관련되는데|기반하는데|유지되는데),?\s*/gu,
    'coordination',
  );

  // Apply the leading-subordinate closing-comma rule independently inside
  // every sentence/semicolon span, not only at the beginning of the bullet.
  const spans = [];
  let spanStart = 0;
  const sentenceEnd = /[.!?。！？;]+/gu;
  let sentenceMatch;
  while ((sentenceMatch = sentenceEnd.exec(semanticText)) !== null) {
    spans.push({ start: spanStart, end: sentenceMatch.index });
    spanStart = sentenceMatch.index + sentenceMatch[0].length;
  }
  spans.push({ start: spanStart, end: semanticText.length });
  for (const span of spans) {
    const segment = semanticText.slice(span.start, span.end);
    const leading = /^\s*(?:while|whereas|although|though)\b[^,]{0,160},\s*/iu.exec(segment);
    if (!leading) continue;
    const commaOffset = leading[0].lastIndexOf(',');
    if (commaOffset < 0) continue;
    boundaries.push({
      start: span.start + commaOffset,
      end: span.start + leading[0].length,
      kind: 'coordination',
    });
  }

  boundaries.sort(
    (a, b) =>
      a.start - b.start ||
      a.end - b.end ||
      stableCompare(a.kind, b.kind),
  );
  return boundaries.filter(
    (boundary, index) =>
      index === 0 ||
      boundary.start !== boundaries[index - 1].start ||
      boundary.end !== boundaries[index - 1].end ||
      boundary.kind !== boundaries[index - 1].kind,
  );
}

function clauseAroundMarker(text, semanticText, markerStart, markerEnd) {
  let left = 0;
  let right = text.length;
  for (const boundary of relationBoundaries(text, semanticText)) {
    if (boundary.end <= markerStart) {
      left = Math.max(left, boundary.end);
      continue;
    }
    if (boundary.start >= markerEnd) {
      right = Math.min(
        right,
        boundary.kind === 'punctuation' ? boundary.end : boundary.start,
      );
      break;
    }
  }
  while (left < right && /\s/u.test(text[left])) left += 1;
  while (right > left && /\s/u.test(text[right - 1])) right -= 1;
  return {
    text: text.slice(left, right),
    semanticText: semanticText.slice(left, right),
    start: left,
    end: right,
  };
}

function markerPolarityContext(clause, markerStart, markerLength) {
  const localStart = Math.max(0, markerStart - clause.start);
  return clause.semanticText.slice(
    Math.max(0, localStart - 40),
    Math.min(clause.semanticText.length, localStart + markerLength + 56),
  );
}''',
    flags=re.S,
)

replace_once(
    warnings,
    """export function findAffirmativeConflictClauses(value) {
  const text = normalizedProse(value);
  if (!text) return [];

  const occurrences = [];""",
    """export function findAffirmativeConflictClauses(value) {
  const text = normalizedProse(value);
  if (!text) return [];
  const semanticText = semanticAnalysisText(text);

  const occurrences = [];""",
)
replace_once(
    warnings,
    "for (const occurrence of markerOccurrences(text, marker.pattern)) {",
    "for (const occurrence of markerOccurrences(semanticText, marker.pattern)) {",
)
replace_once(
    warnings,
    """    const clause = clauseAroundMarker(
      text,
      occurrence.index,""",
    """    const clause = clauseAroundMarker(
      text,
      semanticText,
      occurrence.index,""",
)
replace_once(
    warnings,
    ".some((pattern) => pattern.test(clause.text))",
    ".some((pattern) => pattern.test(clause.semanticText))",
)

# Unit/adversarial fixtures: structured-token masking, sentence-local leading
# subordinate handling, and serial comma input lists.
replace_once(
    warning_tests,
    """const THIRD_INPUT_ID = 'IN-20260801-policy-004';
const UNRELATED_INPUT_ID = 'IN-20260803-qa-002';""",
    """const THIRD_INPUT_ID = 'IN-20260801-policy-004';
const CONFLICT_SOURCE_INPUT_ID = 'IN-20260731-conflict-003';
const WHILE_SOURCE_INPUT_ID = 'IN-20260731-while-003';
const MAY_SOURCE_INPUT_ID = 'IN-20260731-may-003';
const UNRELATED_INPUT_ID = 'IN-20260803-qa-002';""",
)

replace_once(
    warning_tests,
    """    `${OTHER_INPUT_ID}은 현재 정책과 동일하다. 그와 별개로 별도 UI 옵션 두 개는 서로 충돌한다.`,
  ]) {""",
    """    `${OTHER_INPUT_ID}은 현재 정책과 동일하다. 그와 별개로 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `Context. While ${OTHER_INPUT_ID} is compatible, the two local UI options conflict.`,
    `Context; Although ${OTHER_INPUT_ID} is compatible, the two local UI options conflict.`,
    `첫 사실이다. Whereas ${OTHER_INPUT_ID} is compatible, the cache options conflict.`,
  ]) {""",
)

replace_once(
    warning_tests,
    """  assert.equal(
    routeWarnings({ evidenceText: `기존 ${OTHER_INPUT_ID} 정책과 충돌한다.` }).length,
    1,
  );
});

test('canonical input extraction reuses the exact input contract and rejects path/suffix lookalikes', () => {""",
    """  assert.equal(
    routeWarnings({ evidenceText: `기존 ${OTHER_INPUT_ID} 정책과 충돌한다.` }).length,
    1,
  );
  assert.equal(
    routeWarnings({ evidenceText: `Context. ${OTHER_INPUT_ID} conflicts with this input.` }).length,
    1,
  );
  assert.equal(
    routeWarnings({
      evidenceText: `${OTHER_INPUT_ID}, ${THIRD_INPUT_ID}, and this input conflict.`,
      extraArtifacts: [inputArtifact(THIRD_INPUT_ID, ['unique third input'])],
    }).length,
    1,
  );
  assert.equal(
    routeWarnings({
      evidenceText:
        `${OTHER_INPUT_ID}, ${THIRD_INPUT_ID}, and ${CURRENT_INPUT_ID} are mutually exclusive.`,
      extraArtifacts: [inputArtifact(THIRD_INPUT_ID, ['unique third input'])],
    }).length,
    1,
  );
});

test('RR-ROUTE-101 masks identifiers and structured tokens before semantic analysis', () => {
  assert.equal(
    routeWarnings({
      evidenceText: `기존 ${CONFLICT_SOURCE_INPUT_ID} 문서를 참고한다.`,
      includeOtherInput: false,
      extraArtifacts: [inputArtifact(CONFLICT_SOURCE_INPUT_ID, ['identifier marker control'])],
    }).length,
    0,
  );

  for (const evidenceText of [
    `${OTHER_INPUT_ID}은 /api/conflict 엔드포인트를 사용한다.`,
    `${OTHER_INPUT_ID}의 mode=conflict 값을 확인한다.`,
  ]) {
    assert.equal(routeWarnings({ evidenceText }).length, 0, evidenceText);
  }

  for (const inputId of [
    CONFLICT_SOURCE_INPUT_ID,
    WHILE_SOURCE_INPUT_ID,
    MAY_SOURCE_INPUT_ID,
  ]) {
    assert.equal(
      routeWarnings({
        evidenceText: `${inputId} conflicts with this input.`,
        includeOtherInput: false,
        extraArtifacts: [inputArtifact(inputId, ['structured token positive'])],
      }).length,
      1,
      inputId,
    );
  }
});

test('canonical input extraction reuses the exact input contract and rejects path/suffix lookalikes', () => {""",
)

# Integration coverage through validateReconciliationV2.
replace_once(
    integration_tests,
    """    ['- IN-20260720-figma-001 is compatible, and the two local UI options conflict.'],
    ['- IN-20260720-figma-001은 현재 정책과 동일하나 별도 UI 옵션 두 개는 서로 충돌한다.'],""",
    """    ['- IN-20260720-figma-001 is compatible, and the two local UI options conflict.'],
    ['- Context. While IN-20260720-figma-001 is compatible, the two local UI options conflict.'],
    ['- Context; Although IN-20260720-figma-001 is compatible, the two local UI options conflict.'],
    ['- 첫 사실이다. Whereas IN-20260720-figma-001 is compatible, the cache options conflict.'],
    ['- IN-20260720-figma-001은 /api/conflict 엔드포인트를 사용한다.'],
    ['- IN-20260720-figma-001의 mode=conflict 값을 확인한다.'],
    ['- IN-20260720-figma-001은 현재 정책과 동일하나 별도 UI 옵션 두 개는 서로 충돌한다.'],""",
)

replace_once(
    integration_tests,
    """  assert.equal(laterWarnings.length, 1);
  assert.match(laterWarnings[0], /marker '상충'/);

  const sectionOnly = runScopeUnknown""",
    """  assert.equal(laterWarnings.length, 1);
  assert.match(laterWarnings[0], /marker '상충'/);

  for (const facts of [
    ['- Context. IN-20260720-figma-001 conflicts with this input.'],
    ['- IN-20260720-figma-001, IN-20260601-planning-001, and this input conflict.'],
    ['- IN-20260720-figma-001, IN-20260601-planning-001, and IN-20260720-meeting-001 are mutually exclusive.'],
  ]) {
    const result = runScopeUnknown(t, facts);
    assert.equal(warningMessagesByCode(result, 'RR-ROUTE-101').length, 1, facts.join(' / '));
  }

  const sectionOnly = runScopeUnknown""",
)

# Canonical documentation: identifier/path masking, every-sentence subordinate
# handling, and serial comma preservation.
replace_once(
    canonical,
    """  sentence/semicolon 외에도 선행·후치·무쉼표 `while|whereas|although|though`, `, and`,
  `한편|반대로|그와 별개로`, `동일하고|동일하나|동일하면서|동일한데|참고하며|참고하면서|참고하는데` 같은
  high-confidence coordination을 경계로 보되 plain `and`/`와`는 관계 내부에 유지한다. 질문·증거 부족·
  가정·불확실성·추정·명시적 부정은 marker가 놓인 local clause에서 판정하므로, 다른 clause의""",
    """  자연어 분석 전 canonical/noncanonical `IN-*` identifier와 URL·path·URI·key=value·filename token span을
  같은 길이의 공백으로 mask한다. marker·polarity·coordination은 이 semantic view만 읽고, input extraction과
  message provenance는 원문/offset을 유지한다. sentence/semicolon 각 span마다 선행
  `while|whereas|although|though ... ,`의 closing comma를 처리하고 후치·무쉼표 coordination도 경계로 본다.
  `, and`는 독립절이면 경계지만, 좌측이 canonical input 목록이고 우측이 canonical input 또는 `this/current input`이면
  serial relation 내부에 유지한다. `한편|반대로|그와 별개로`,
  `동일하고|동일하나|동일하면서|동일한데|참고하며|참고하면서|참고하는데`도 high-confidence 경계다.
  질문·증거 부족·가정·불확실성·추정·명시적 부정은 marker가 놓인 local clause에서 판정하므로, 다른 clause의""",
)

replace_once(
    design,
    """  high-confidence relation clause에 있어야 한다. sentence/semicolon뿐 아니라 `, while|whereas|although|though`,
  `한편|반대로|그와 별개로`, `동일하고,`/`참고하며` 같은 중립 서술 coordination을 경계로 보며 plain `and`/`와`는
  관계 내부에 유지한다. marker 후보는 source order로 평가하며 질문·증거 부재·가정·불확실성·추정·공통/marker별
  부정을 clause-local로 판정한다.""",
    """  high-confidence relation clause에 있어야 한다. 자연어 regex 전에 canonical/noncanonical `IN-*` identifier와
  URL·path·URI·key=value·filename span을 same-length semantic view에서 mask해 ID source의 `conflict|while|may`와
  `/api/conflict`, `mode=conflict`를 marker·boundary·modality로 해석하지 않는다. sentence/semicolon의 각 span에서
  선행 `while|whereas|although|though ... ,` closing comma를 처리하고 후치·무쉼표 coordination도 경계로 본다.
  `, and`는 독립절만 분리하며 canonical input serial list와 `this/current input` 관계는 보존한다. 한국어 중립 서술
  coordination도 경계로 유지한다. marker 후보는 source order로 평가하며 질문·증거 부재·가정·불확실성·추정·
  공통/marker별 부정을 clause-local로 판정한다.""",
)
