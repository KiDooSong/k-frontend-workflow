from pathlib import Path


def replace_required(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one replacement, got {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_optional(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count == 1:
        p.write_text(text.replace(old, new, 1), encoding="utf-8")
    elif new not in text:
        print(f"::warning::{path}: optional documentation block not found")


warnings = "frontend-workflow-kit/scripts/lib/reconciliation-warnings.mjs"
warning_tests = "frontend-workflow-kit/scripts/lib/reconciliation-warnings.test.mjs"
integration_tests = "frontend-workflow-kit/scripts/lib/reconciliation-items.test.mjs"
canonical = "frontend-workflow-kit/docs/reference/input-reconciliation.md"
design = "kit-dev/docs/design/drafts/issue-202-reconciliation-contract-v2.md"
changelog = "kit-dev/CHANGELOG.md"
roadmap = "kit-dev/roadmap-current.md"

replace_required(
    warnings,
    r"""  /\b(?:unclear|unknown|undetermined)\b.{0,48}\b(?:whether|if)\b/iu,
  /\b(?:check|determine|verify|confirm|assess|test|find\s+out|wonder|ask|inquire|investigate)\b.{0,48}\b(?:whether|if)\b/iu,""",
    r"""  /\b(?:unclear|unknown|undetermined)\b.{0,48}\b(?:whether|if)\b/iu,
  /\bnot\s+clear\b.{0,48}\b(?:whether|if)\b/iu,
  /\b(?:check|determine|verify|confirm|assess|test|find\s+out|wonder|ask|inquire|investigate)\b.{0,48}\b(?:whether|if)\b/iu,""",
)

replace_required(
    warnings,
    r"""  /(?:불명확|확실하지\s*않|판단하기\s*어렵)/u,""",
    r"""  /(?:불명확|명확하지\s*않|확실하지\s*않|판단하기\s*어렵|추측)/u,""",
)

replace_required(
    warnings,
    r"""  /\b(?:possible|possibly|potentially|apparently|likely|probably|presumably|allegedly)\b/iu,""",
    r"""  /\b(?:possible|possibly|potentially|apparently|likely|probably|presumably|allegedly|supposedly|reportedly)\b/iu,""",
)

replace_required(
    warnings,
    r"""  /\bno\s+(?:evidence|proof|indication)\s+(?:that|of)\b/iu,
  /\b(?:cannot|can['’]t|could\s+not|couldn['’]t)\s+(?:say|claim|conclude|assert|determine)\s+(?:that\s+)?/iu,
  /(?:근거|증거)\s*(?:가|는|도)?\s*없/u,""",
    r"""  /\bno\s+(?:evidence|proof|indication)\s+(?:that|of)\b/iu,
  /\b(?:insufficient|little|weak)\s+(?:evidence|proof|indication)\s+(?:that|of)\b/iu,
  /\b(?:cannot|can['’]t|could\s+not|couldn['’]t)\s+(?:say|claim|conclude|assert|determine)\s+(?:that\s+)?/iu,
  /(?:근거|증거)\s*(?:가|는|도)?\s*없/u,
  /(?:근거|증거).{0,16}(?:부족|충분하지\s*않)/u,""",
)

replace_required(
    warnings,
    r"""function clauseAroundMarker(text, markerStart, markerEnd) {
  let left = 0;
  let right = text.length;
  // Precision-first relation boundaries. Keep plain `and`/`와` inside a
  // relation, but stop at high-confidence independent-clause coordination.
  const boundaries = new RegExp(
    [
      String.raw`[.!?。！？;\n]+`,
      String.raw`,\s*(?:but|however|yet|while|whereas|although|though)\b`,
      String.raw`\b(?:but|however|yet)\b`,
      String.raw`(?:하지만|그러나|반면|한편|반대로|그와\s+별개로)`,
      String.raw`(?:동일하|같|일치하|호환되|부합하|참고하|참조하|따르|관련되|기반하|유지되)(?:고|며|지만),?\s*`,
    ].join('|'),
    'giu',
  );
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
}""",
    r"""function relationBoundaries(text) {
  const boundaries = [];
  const addMatches = (pattern, kind) => {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const matcher = new RegExp(pattern.source, flags);
    let match;
    while ((match = matcher.exec(text)) !== null) {
      boundaries.push({
        start: match.index,
        end: match.index + match[0].length,
        kind,
      });
      if (match[0] === '') matcher.lastIndex += 1;
    }
  };

  addMatches(/[.!?。！？;\n]+/gu, 'punctuation');
  addMatches(/,\s*(?:and|but|however|yet|while|whereas|although|though)\b/giu, 'coordination');
  addMatches(/\b(?:but|however|yet|while|whereas|although|though)\b/giu, 'coordination');
  addMatches(/(?:하지만|그러나|반면|한편|반대로|그와\s+별개로)/gu, 'coordination');
  addMatches(
    /(?:동일하|같|일치하|호환되|부합하|참고하|참조하|따르|관련되|기반하|유지되)(?:고|며|지만|나|으나|면서|으면서),?\s*/gu,
    'coordination',
  );
  addMatches(
    /(?:동일한데|같은데|참고하는데|참조하는데|따르는데|관련되는데|기반하는데|유지되는데),?\s*/gu,
    'coordination',
  );

  // A sentence-leading subordinate connector has two relation boundaries:
  // the connector itself and the comma closing its subordinate span. The
  // second boundary makes marker selection symmetric on both sides.
  const leading = /^\s*(?:while|whereas|although|though)\b[^,;.!?。！？]{0,160},\s*/iu.exec(text);
  if (leading) {
    const commaOffset = leading[0].lastIndexOf(',');
    if (commaOffset >= 0) {
      boundaries.push({
        start: leading.index + commaOffset,
        end: leading.index + leading[0].length,
        kind: 'coordination',
      });
    }
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

function clauseAroundMarker(text, markerStart, markerEnd) {
  let left = 0;
  let right = text.length;
  for (const boundary of relationBoundaries(text)) {
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
  return { text: text.slice(left, right).trim(), start: left, end: right };
}""",
)

replace_required(
    warning_tests,
    """    'It is unclear if A conflicts with B',
    'It is not true that A conflicts with B',
    'There is no evidence that A conflicts with B',
    'A probably conflicts with B',
    'A is unlikely to conflict with B',""",
    """    'It is unclear if A conflicts with B',
    'It is not clear if A conflicts with B',
    'It is not true that A conflicts with B',
    'There is no evidence that A conflicts with B',
    'There is insufficient evidence that A conflicts with B',
    'There is little evidence that A conflicts with B',
    'There is weak indication that A conflicts with B',
    'A probably conflicts with B',
    'A reportedly conflicts with B',
    'A supposedly conflicts with B',
    'A is unlikely to conflict with B',""",
)

replace_required(
    warning_tests,
    """    'A와 B가 충돌한다는 근거는 없다',
    'A와 B가 충돌하는지는 불명확하다',
    'A와 B가 충돌하는지는 확실하지 않다',""",
    """    'A와 B가 충돌한다는 근거는 없다',
    'A와 B가 충돌한다는 근거가 부족하다',
    'A와 B가 충돌한다는 증거가 충분하지 않다',
    'A와 B가 충돌한다고 추측된다',
    'A와 B가 충돌하는지는 불명확하다',
    'A와 B가 충돌하는지는 명확하지 않다',
    'A와 B가 충돌하는지는 확실하지 않다',""",
)

replace_required(
    warning_tests,
    """  for (const evidenceText of [
    `${OTHER_INPUT_ID}은 현재 정책과 동일하고, 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID}를 참고하며 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID} is compatible with the current policy, while the two local UI options conflict.`,
    `${OTHER_INPUT_ID} is compatible, whereas the local cache options conflict.`,
    `${OTHER_INPUT_ID} is compatible, although the local cache options conflict.`,
    `${OTHER_INPUT_ID} is compatible, though the local cache options conflict.`,
    `${OTHER_INPUT_ID}은 현재 정책과 동일하다. 한편 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID}은 현재 정책과 동일하다. 반대로 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID}은 현재 정책과 동일하다. 그와 별개로 별도 UI 옵션 두 개는 서로 충돌한다.`,
  ]) {""",
    """  for (const evidenceText of [
    `${OTHER_INPUT_ID}은 현재 정책과 동일하고, 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID}를 참고하며 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID}은 현재 정책과 동일하나 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID}은 현재 정책과 같으나 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID}은 현재 정책과 동일하면서 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID}를 참고하면서 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID}은 현재 정책과 동일한데 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID}를 참고하는데 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID} is compatible with the current policy, while the two local UI options conflict.`,
    `${OTHER_INPUT_ID} is compatible, whereas the local cache options conflict.`,
    `${OTHER_INPUT_ID} is compatible, although the local cache options conflict.`,
    `${OTHER_INPUT_ID} is compatible, though the local cache options conflict.`,
    `While ${OTHER_INPUT_ID} is compatible, the two local UI options conflict.`,
    `Although ${OTHER_INPUT_ID} is compatible, the two local UI options conflict.`,
    `${OTHER_INPUT_ID} is compatible while the two local UI options conflict.`,
    `${OTHER_INPUT_ID} is compatible whereas the local cache options conflict.`,
    `${OTHER_INPUT_ID} is compatible, and the local UI options conflict.`,
    `${OTHER_INPUT_ID}은 현재 정책과 동일하다. 한편 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID}은 현재 정책과 동일하다. 반대로 별도 UI 옵션 두 개는 서로 충돌한다.`,
    `${OTHER_INPUT_ID}은 현재 정책과 동일하다. 그와 별개로 별도 UI 옵션 두 개는 서로 충돌한다.`,
  ]) {""",
)

replace_required(
    integration_tests,
    """    ['- IN-20260720-figma-001 is compatible with the current policy, while the two local UI options conflict.'],
    ['- IN-20260720-figma-001 is compatible, whereas the local cache options conflict.'],
    ['- IN-20260720-figma-001와 충돌한다는 근거는 없다.'],""",
    """    ['- IN-20260720-figma-001 is compatible with the current policy, while the two local UI options conflict.'],
    ['- IN-20260720-figma-001 is compatible, whereas the local cache options conflict.'],
    ['- While IN-20260720-figma-001 is compatible, the two local UI options conflict.'],
    ['- Although IN-20260720-figma-001 is compatible, the two local UI options conflict.'],
    ['- IN-20260720-figma-001 is compatible while the two local UI options conflict.'],
    ['- IN-20260720-figma-001 is compatible, and the two local UI options conflict.'],
    ['- IN-20260720-figma-001은 현재 정책과 동일하나 별도 UI 옵션 두 개는 서로 충돌한다.'],
    ['- IN-20260720-figma-001은 현재 정책과 동일하면서 별도 UI 옵션 두 개는 서로 충돌한다.'],
    ['- IN-20260720-figma-001은 현재 정책과 동일한데 별도 UI 옵션 두 개는 서로 충돌한다.'],
    ['- IN-20260720-figma-001와 충돌한다는 근거는 없다.'],
    ['- IN-20260720-figma-001와 충돌한다는 근거가 부족하다.'],
    ['- IN-20260720-figma-001와 충돌한다고 추측된다.'],""",
)

replace_required(
    integration_tests,
    """    ['- There is no evidence that IN-20260720-figma-001 conflicts with this input.'],
    ['- It is unclear if IN-20260720-figma-001 conflicts with this input.'],
    ['- IN-20260720-figma-001 probably conflicts with this input.'],""",
    """    ['- There is no evidence that IN-20260720-figma-001 conflicts with this input.'],
    ['- There is insufficient evidence that IN-20260720-figma-001 conflicts with this input.'],
    ['- There is little evidence that IN-20260720-figma-001 conflicts with this input.'],
    ['- It is unclear if IN-20260720-figma-001 conflicts with this input.'],
    ['- It is not clear if IN-20260720-figma-001 conflicts with this input.'],
    ['- IN-20260720-figma-001 probably conflicts with this input.'],
    ['- IN-20260720-figma-001 reportedly conflicts with this input.'],""",
)

replace_optional(
    canonical,
    """  sentence/semicolon 외에도 `, while|whereas|although|though`, `한편|반대로|그와 별개로`,
  `동일하고,`/`참고하며` 같은 중립 서술 연결형을 경계로 보되 plain `and`/`와`는 관계 내부에 유지한다.
  질문·증거 부재·가정·불확실성·추정·명시적 부정은 marker가 놓인 local clause에서 판정하므로, 다른 clause의""",
    """  sentence/semicolon 외에도 선행·후치·무쉼표 `while|whereas|although|though`, `, and`,
  `한편|반대로|그와 별개로`, `동일하고|동일하나|동일하면서|동일한데|참고하며|참고하면서|참고하는데` 같은
  high-confidence coordination을 경계로 보되 plain `and`/`와`는 관계 내부에 유지한다. 질문·증거 부족·
  가정·불확실성·추정·명시적 부정은 marker가 놓인 local clause에서 판정하므로, 다른 clause의""",
)

replace_optional(
    design,
    """  high-confidence relation clause에 있어야 한다. sentence/semicolon뿐 아니라 `, while|whereas|although|though`,
  `한편|반대로|그와 별개로`, `동일하고,`/`참고하며` 같은 중립 서술 coordination을 경계로 보며 plain `and`/`와`는
  관계 내부에 유지한다. marker 후보는 source order로 평가하며 질문·증거 부재·가정·불확실성·추정·공통/marker별""",
    """  high-confidence relation clause에 있어야 한다. sentence/semicolon뿐 아니라 선행·후치·무쉼표
  `while|whereas|although|though`, `, and`, `한편|반대로|그와 별개로`,
  `동일하고|동일하나|동일하면서|동일한데|참고하며|참고하면서|참고하는데` 같은 중립 서술 coordination을
  경계로 보며 plain `and`/`와`는 관계 내부에 유지한다. marker 후보는 source order로 평가하며 질문·증거 부족·
  가정·불확실성·추정·공통/marker별""",
)

replace_optional(
    changelog,
    """  underscore/dot suffix lookalike는 세지 않는다. 선행·후치·무쉼표 `while|whereas|although|though`, `, and`,
  한국어 중립 coordination을 relation boundary로 분리하되 plain `and`/`와`는 보존한다. 질문·증거 부족·불확실성·
  추정·marker별 부정은 local clause에서 억제해 unrelated clause의 polarity가 valid marker를 숨기지 않게 했고,
  같은 input Summary hard-invalid는 candidate-local suppress한다.""",
    """  underscore/dot suffix lookalike는 세지 않는다. 선행·후치·무쉼표 `while|whereas|although|though`, `, and`,
  한국어 중립 coordination을 relation boundary로 분리하되 plain `and`/`와`는 보존한다. 질문·증거 부족·불확실성·
  추정·marker별 부정은 local clause에서 억제해 unrelated clause의 polarity가 valid marker를 숨기지 않게 했고,
  같은 input Summary hard-invalid는 candidate-local suppress한다.""",
)
